// Lightweight runtime validators — no external deps. Used when loading catalog
// parts (untrusted JSON) and assemblies (from the project repo / VFS). They
// return collected errors rather than throwing, so a bad file fails legibly.

import type { Assembly, Part, SnapPort, Transform, Vec3, Quat } from './types';

export interface Check {
  ok: boolean;
  errors: string[];
}

const ok = (): Check => ({ ok: true, errors: [] });
const fail = (errors: string[]): Check => ({ ok: errors.length === 0, errors });

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function isArrN(x: unknown, n: number): boolean {
  return Array.isArray(x) && x.length === n && x.every(isNum);
}
export function isVec3(x: unknown): x is Vec3 {
  return isArrN(x, 3);
}
export function isQuat(x: unknown): x is Quat {
  return isArrN(x, 4);
}
export function isTransform(x: unknown): x is Transform {
  const t = x as Transform;
  return !!x && isVec3(t.p) && isQuat(t.q) && isVec3(t.s);
}

function checkPort(p: unknown, where: string, errs: string[]): void {
  const o = p as SnapPort;
  if (!o || typeof o.id !== 'string') errs.push(`${where}: missing port id`);
  if (typeof o?.type !== 'string') errs.push(`${where}: missing port type`);
  if (!isVec3(o?.localPos)) errs.push(`${where}.localPos: expected [x,y,z]`);
  if (!isVec3(o?.localAxis)) errs.push(`${where}.localAxis: expected [x,y,z]`);
  if (!Array.isArray(o?.allowedCounterparts))
    errs.push(`${where}.allowedCounterparts: expected array`);
  if (!isNum(o?.tolerance)) errs.push(`${where}.tolerance: expected number`);
  if (typeof o?.constraint !== 'string')
    errs.push(`${where}.constraint: missing`);
}

/** Validate a catalog Part (spec/parts.md). */
export function validatePart(data: unknown): Check {
  const errs: string[] = [];
  const p = data as Part;
  if (!p || typeof p !== 'object') return fail(['part: not an object']);
  if (typeof p.id !== 'string') errs.push('part.id: expected string');
  if (p.id && p.id.includes('-'))
    errs.push(`part.id "${p.id}": no hyphens (snake_case)`);
  if (typeof p.geometry !== 'string') errs.push('part.geometry: expected string');
  if (!isNum(p.mass)) errs.push('part.mass: expected number (kg)');
  if (!Array.isArray(p.ports)) {
    errs.push('part.ports: expected array');
  } else {
    const ids = new Set<string>();
    p.ports.forEach((port, i) => {
      checkPort(port, `part.ports[${i}]`, errs);
      const id = (port as SnapPort)?.id;
      if (id) {
        if (ids.has(id)) errs.push(`part.ports: duplicate port id "${id}"`);
        ids.add(id);
      }
    });
  }
  return fail(errs);
}

/** Validate an Assembly graph (spec/assembly.md): referential integrity of
 *  connections + controllers against the instance set. */
export function validateAssembly(data: unknown): Check {
  const errs: string[] = [];
  const a = data as Assembly;
  if (!a || typeof a !== 'object') return fail(['assembly: not an object']);
  if (!Array.isArray(a.parts)) return fail(['assembly.parts: expected array']);
  if (!Array.isArray(a.connections))
    return fail(['assembly.connections: expected array']);

  const instanceIds = new Set<number>();
  a.parts.forEach((pi, i) => {
    if (typeof pi.id !== 'number') errs.push(`parts[${i}].id: expected number`);
    else {
      if (instanceIds.has(pi.id)) errs.push(`parts: duplicate instance id ${pi.id}`);
      instanceIds.add(pi.id);
    }
    if (typeof pi.partType !== 'string')
      errs.push(`parts[${i}].partType: expected string`);
    if (!isTransform(pi.transform))
      errs.push(`parts[${i}].transform: malformed`);
  });

  a.connections.forEach((c, i) => {
    if (!instanceIds.has(c.fromPart))
      errs.push(`connections[${i}].fromPart ${c.fromPart}: no such instance`);
    if (!instanceIds.has(c.toPart))
      errs.push(`connections[${i}].toPart ${c.toPart}: no such instance`);
  });

  (a.controllers ?? []).forEach((ct, i) => {
    if (!instanceIds.has(ct.part))
      errs.push(`controllers[${i}].part ${ct.part}: no such instance`);
  });

  return fail(errs);
}
