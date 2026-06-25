// The authoritative assembly store + op apply (spec/protocol.md). Pure TS, no
// engine/DOM/transport imports — so this same class runs in-page (Milestone A)
// and, unchanged, inside the qubepods DO (Milestone B).

import {
  canMate,
  constraintForPair,
  emptyAssembly,
  type ApplyResult,
  type Assembly,
  type Connection,
  type Op,
  type Part,
  type PartInstance,
  type SnapPort,
  type Transform,
} from '@qubekit/schema';
import { add, negate3, quatFromTo, rotate, toWorldDir, toWorldPoint } from './math';
import type { Catalog } from './gears';

interface Recorded {
  forward: Op;
  inverse: Op[];
}

export class World {
  assembly: Assembly;
  readonly catalog: Catalog;
  /** motor.set state: instance id → angular speed (rad/s). Read by the tick. */
  readonly motorSpeeds = new Map<number, number>();

  private nextInstance = 1;
  private nextConnection = 1;
  private nextGroup = 1;
  private undoStack: Recorded[] = [];
  private redoStack: Recorded[] = [];

  constructor(catalog: Catalog, assembly?: Assembly) {
    this.catalog = catalog;
    this.assembly = assembly ?? emptyAssembly('untitled', 'Untitled');
  }

  // ---- lookups -------------------------------------------------------------
  private inst(id: number): PartInstance | undefined {
    return this.assembly.parts.find((p) => p.id === id);
  }
  private port(inst: PartInstance | undefined, portId: string): SnapPort | undefined {
    if (!inst) return undefined;
    return this.catalog.get(inst.partType)?.ports.find((p) => p.id === portId);
  }
  private part(type: string): Part | undefined {
    return this.catalog.get(type);
  }

  // ---- public apply (records undo) ----------------------------------------
  apply(op: Op): ApplyResult {
    const rec = this.applyRaw(op);
    if (rec.result.ok && rec.inverse) {
      this.undoStack.push({ forward: op, inverse: rec.inverse });
      this.redoStack = [];
    }
    return rec.result;
  }

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    for (const inv of e.inverse) this.applyRaw(inv);
    this.redoStack.push(e);
    return true;
  }
  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.applyRaw(e.forward);
    this.undoStack.push(e);
    return true;
  }

  // ---- the op interpreter --------------------------------------------------
  private applyRaw(op: Op): { result: ApplyResult; inverse?: Op[] } {
    switch (op.op) {
      case 'part.place': {
        const part = this.part(op.partType);
        if (!part) return { result: { ok: false, reason: `unknown part ${op.partType}` } };
        let transform: Transform;
        const inverse: Op[] = [];
        if ('transform' in op) {
          transform = op.transform;
        } else {
          const r = this.resolveSnap(op.partType, op.snap.fromPort, op.snap.toPart, op.snap.toPort);
          if (!r.ok || !r.transform) return { result: { ok: false, reason: r.reason } };
          transform = r.transform;
        }
        const id = this.nextInstance++;
        this.assembly.parts.push({ id, partType: op.partType, transform });
        inverse.push({ op: 'part.delete', instance: id });
        // snap-place also forms the connection (one gesture).
        if ('snap' in op) {
          const c = this.connect(id, op.snap.fromPort, op.snap.toPart, op.snap.toPort);
          if (!c.ok) {
            // roll the placement back so a bad snap leaves no orphan.
            this.assembly.parts = this.assembly.parts.filter((p) => p.id !== id);
            this.nextInstance--;
            return { result: { ok: false, reason: c.reason } };
          }
        }
        return { result: { ok: true, assignedId: id }, inverse };
      }

      case 'part.move': {
        const inst = this.inst(op.instance);
        if (!inst) return { result: { ok: false, reason: `no instance ${op.instance}` } };
        const prev = inst.transform;
        inst.transform = op.transform;
        return { result: { ok: true }, inverse: [{ op: 'part.move', instance: op.instance, transform: prev }] };
      }

      case 'part.delete': {
        const inst = this.inst(op.instance);
        if (!inst) return { result: { ok: false, reason: `no instance ${op.instance}` } };
        const removedConns = this.assembly.connections.filter(
          (c) => c.fromPart === op.instance || c.toPart === op.instance,
        );
        this.assembly.parts = this.assembly.parts.filter((p) => p.id !== op.instance);
        this.assembly.connections = this.assembly.connections.filter(
          (c) => c.fromPart !== op.instance && c.toPart !== op.instance,
        );
        this.motorSpeeds.delete(op.instance);
        // inverse: re-place the part, then re-form each removed connection.
        const inverse: Op[] = [
          { op: 'part.place', partType: inst.partType, transform: inst.transform },
        ];
        for (const c of removedConns)
          inverse.push({
            op: 'port.connect',
            fromPart: c.fromPart,
            fromPort: c.fromPort,
            toPart: c.toPart,
            toPort: c.toPort,
          });
        return { result: { ok: true }, inverse };
      }

      case 'port.connect': {
        const r = this.connect(op.fromPart, op.fromPort, op.toPart, op.toPort);
        if (!r.ok) return { result: r };
        return { result: r, inverse: [{ op: 'port.disconnect', connection: r.assignedId! }] };
      }

      case 'port.disconnect': {
        const c = this.assembly.connections.find((x) => x.id === op.connection);
        if (!c) return { result: { ok: false, reason: `no connection ${op.connection}` } };
        this.assembly.connections = this.assembly.connections.filter((x) => x.id !== op.connection);
        return {
          result: { ok: true },
          inverse: [{ op: 'port.connect', fromPart: c.fromPart, fromPort: c.fromPort, toPart: c.toPart, toPort: c.toPort }],
        };
      }

      case 'controller.set': {
        const prev = this.assembly.controllers.find((c) => c.part === op.part);
        const ctrl = {
          id: prev?.id ?? this.assembly.controllers.length + 1,
          part: op.part,
          q64Module: op.q64Module,
          inputs: prev?.inputs ?? ['tick'],
          outputs: prev?.outputs ?? ['motor_speed'],
          params: op.params,
        };
        this.assembly.controllers = this.assembly.controllers.filter((c) => c.part !== op.part);
        this.assembly.controllers.push(ctrl);
        return { result: { ok: true, assignedId: ctrl.id } };
      }

      case 'motor.set': {
        const prev = this.motorSpeeds.get(op.part);
        this.motorSpeeds.set(op.part, op.speed);
        return { result: { ok: true }, inverse: [{ op: 'motor.set', part: op.part, speed: prev ?? 0 }] };
      }

      case 'group.subassembly': {
        return { result: { ok: true, assignedId: this.nextGroup++ } };
      }
    }
  }

  // ---- helpers -------------------------------------------------------------
  private connect(fromPart: number, fromPort: string, toPart: number, toPort: string): ApplyResult {
    const fi = this.inst(fromPart);
    const ti = this.inst(toPart);
    const fp = this.port(fi, fromPort);
    const tp = this.port(ti, toPort);
    if (!fp || !tp) return { ok: false, reason: 'port not found' };
    if (!canMate(fp, tp)) return { ok: false, reason: `${fp.type} does not mate ${tp.type}` };
    const already = this.assembly.connections.some(
      (c) =>
        (c.fromPart === fromPart && c.fromPort === fromPort) ||
        (c.toPart === toPart && c.toPort === toPort),
    );
    if (already) return { ok: false, reason: 'port already connected' };
    const id = this.nextConnection++;
    const conn: Connection = { id, fromPart, fromPort, toPart, toPort, constraintType: constraintForPair(fp, tp) };
    this.assembly.connections.push(conn);
    return { ok: true, assignedId: id };
  }

  /** Compute the transform that mates the new part's `fromPort` against an
   *  existing `(toPart,toPort)`: coincident positions, anti-parallel axes. */
  private resolveSnap(
    newType: string,
    fromPort: string,
    toPart: number,
    toPort: string,
  ): { ok: boolean; transform?: Transform; reason?: string } {
    const part = this.part(newType);
    const fp = part?.ports.find((p) => p.id === fromPort);
    const ti = this.inst(toPart);
    const tp = this.port(ti, toPort);
    if (!fp || !ti || !tp) return { ok: false, reason: 'snap target not found' };
    const targetPos = toWorldPoint(ti.transform, tp.localPos);
    const targetAxis = toWorldDir(ti.transform, tp.localAxis);
    const q = quatFromTo(fp.localAxis, negate3(targetAxis));
    const p = add(targetPos, negate3(rotate(q, fp.localPos)));
    return { ok: true, transform: { p, q, s: [1, 1, 1] } };
  }
}
