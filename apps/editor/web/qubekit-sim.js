// packages/schema/src/types.ts
function emptyAssembly(id, name) {
  return { id, name, rev: 0, parts: [], connections: [], controllers: [] };
}

// packages/schema/src/ports.ts
var PORT_CONSTRAINT = {
  stud: "fixed",
  anti_stud: "fixed",
  pin: "fixed",
  pin_socket: "fixed",
  axle: "none",
  // a passive shaft — the counterpart decides the joint
  axle_bearing: "hinge",
  axle_socket: "fixed",
  gear_center: "fixed",
  wheel_hub: "fixed",
  motor_out: "fixed",
  sensor_mount: "fixed",
  sensor: "fixed",
  electric: "none",
  signal: "none"
};
function canMate(a, b) {
  return a.allowedCounterparts.includes(b.type) && b.allowedCounterparts.includes(a.type);
}
function constraintForPair(a, b) {
  const ca = PORT_CONSTRAINT[a.type];
  const cb = PORT_CONSTRAINT[b.type];
  if (ca === "none") return cb;
  if (cb === "none") return ca;
  return ca;
}

// packages/sim/src/math.ts
var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var negate3 = (a) => [-a[0], -a[1], -a[2]];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
var len = (a) => Math.sqrt(dot(a, a));
function normalize(a) {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
}
function rotate(q, v) {
  const [w, x, y, z] = q;
  const u = [x, y, z];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * w), scale(uuv, 2)));
}
function quatFromTo(from, to) {
  const f = normalize(from);
  const t = normalize(to);
  const d = dot(f, t);
  if (d >= 1 - 1e-9) return [1, 0, 0, 0];
  if (d <= -1 + 1e-9) {
    let axis2 = cross(f, [1, 0, 0]);
    if (len(axis2) < 1e-6) axis2 = cross(f, [0, 1, 0]);
    axis2 = normalize(axis2);
    return [0, axis2[0], axis2[1], axis2[2]];
  }
  const axis = cross(f, t);
  const w = 1 + d;
  const q = [w, axis[0], axis[1], axis[2]];
  const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
function toWorldPoint(t, localPos) {
  return add(t.p, rotate(t.q, localPos));
}
function toWorldDir(t, localDir) {
  return rotate(t.q, localDir);
}

// packages/sim/src/world.ts
var World = class {
  assembly;
  catalog;
  /** motor.set state: instance id → angular speed (rad/s). Read by the tick. */
  motorSpeeds = /* @__PURE__ */ new Map();
  nextInstance = 1;
  nextConnection = 1;
  nextGroup = 1;
  undoStack = [];
  redoStack = [];
  constructor(catalog, assembly) {
    this.catalog = catalog;
    this.assembly = assembly ?? emptyAssembly("untitled", "Untitled");
  }
  // ---- lookups -------------------------------------------------------------
  inst(id) {
    return this.assembly.parts.find((p) => p.id === id);
  }
  port(inst, portId) {
    if (!inst) return void 0;
    return this.catalog.get(inst.partType)?.ports.find((p) => p.id === portId);
  }
  part(type) {
    return this.catalog.get(type);
  }
  // ---- public apply (records undo) ----------------------------------------
  apply(op) {
    const rec = this.applyRaw(op);
    if (rec.result.ok && rec.inverse) {
      this.undoStack.push({ forward: op, inverse: rec.inverse });
      this.redoStack = [];
    }
    return rec.result;
  }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return false;
    for (const inv of e.inverse) this.applyRaw(inv);
    this.redoStack.push(e);
    return true;
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.applyRaw(e.forward);
    this.undoStack.push(e);
    return true;
  }
  // ---- the op interpreter --------------------------------------------------
  applyRaw(op) {
    switch (op.op) {
      case "part.place": {
        const part = this.part(op.partType);
        if (!part) return { result: { ok: false, reason: `unknown part ${op.partType}` } };
        let transform;
        const inverse = [];
        if ("transform" in op) {
          transform = op.transform;
        } else {
          const r = this.resolveSnap(op.partType, op.snap.fromPort, op.snap.toPart, op.snap.toPort);
          if (!r.ok || !r.transform) return { result: { ok: false, reason: r.reason } };
          transform = r.transform;
        }
        const id = this.nextInstance++;
        this.assembly.parts.push({ id, partType: op.partType, transform });
        inverse.push({ op: "part.delete", instance: id });
        if ("snap" in op) {
          const c = this.connect(id, op.snap.fromPort, op.snap.toPart, op.snap.toPort);
          if (!c.ok) {
            this.assembly.parts = this.assembly.parts.filter((p) => p.id !== id);
            this.nextInstance--;
            return { result: { ok: false, reason: c.reason } };
          }
        }
        return { result: { ok: true, assignedId: id }, inverse };
      }
      case "part.move": {
        const inst = this.inst(op.instance);
        if (!inst) return { result: { ok: false, reason: `no instance ${op.instance}` } };
        const prev = inst.transform;
        inst.transform = op.transform;
        return { result: { ok: true }, inverse: [{ op: "part.move", instance: op.instance, transform: prev }] };
      }
      case "part.delete": {
        const inst = this.inst(op.instance);
        if (!inst) return { result: { ok: false, reason: `no instance ${op.instance}` } };
        const removedConns = this.assembly.connections.filter(
          (c) => c.fromPart === op.instance || c.toPart === op.instance
        );
        this.assembly.parts = this.assembly.parts.filter((p) => p.id !== op.instance);
        this.assembly.connections = this.assembly.connections.filter(
          (c) => c.fromPart !== op.instance && c.toPart !== op.instance
        );
        this.motorSpeeds.delete(op.instance);
        const inverse = [
          { op: "part.place", partType: inst.partType, transform: inst.transform }
        ];
        for (const c of removedConns)
          inverse.push({
            op: "port.connect",
            fromPart: c.fromPart,
            fromPort: c.fromPort,
            toPart: c.toPart,
            toPort: c.toPort
          });
        return { result: { ok: true }, inverse };
      }
      case "port.connect": {
        const r = this.connect(op.fromPart, op.fromPort, op.toPart, op.toPort);
        if (!r.ok) return { result: r };
        return { result: r, inverse: [{ op: "port.disconnect", connection: r.assignedId }] };
      }
      case "port.disconnect": {
        const c = this.assembly.connections.find((x) => x.id === op.connection);
        if (!c) return { result: { ok: false, reason: `no connection ${op.connection}` } };
        this.assembly.connections = this.assembly.connections.filter((x) => x.id !== op.connection);
        return {
          result: { ok: true },
          inverse: [{ op: "port.connect", fromPart: c.fromPart, fromPort: c.fromPort, toPart: c.toPart, toPort: c.toPort }]
        };
      }
      case "controller.set": {
        const prev = this.assembly.controllers.find((c) => c.part === op.part);
        const ctrl = {
          id: prev?.id ?? this.assembly.controllers.length + 1,
          part: op.part,
          q64Module: op.q64Module,
          inputs: prev?.inputs ?? ["tick"],
          outputs: prev?.outputs ?? ["motor_speed"],
          params: op.params
        };
        this.assembly.controllers = this.assembly.controllers.filter((c) => c.part !== op.part);
        this.assembly.controllers.push(ctrl);
        return { result: { ok: true, assignedId: ctrl.id } };
      }
      case "motor.set": {
        const prev = this.motorSpeeds.get(op.part);
        this.motorSpeeds.set(op.part, op.speed);
        return { result: { ok: true }, inverse: [{ op: "motor.set", part: op.part, speed: prev ?? 0 }] };
      }
      case "group.subassembly": {
        return { result: { ok: true, assignedId: this.nextGroup++ } };
      }
    }
  }
  // ---- helpers -------------------------------------------------------------
  connect(fromPart, fromPort, toPart, toPort) {
    const fi = this.inst(fromPart);
    const ti = this.inst(toPart);
    const fp = this.port(fi, fromPort);
    const tp = this.port(ti, toPort);
    if (!fp || !tp) return { ok: false, reason: "port not found" };
    if (!canMate(fp, tp)) return { ok: false, reason: `${fp.type} does not mate ${tp.type}` };
    const already = this.assembly.connections.some(
      (c) => c.fromPart === fromPart && c.fromPort === fromPort || c.toPart === toPart && c.toPort === toPort
    );
    if (already) return { ok: false, reason: "port already connected" };
    const id = this.nextConnection++;
    const conn = { id, fromPart, fromPort, toPart, toPort, constraintType: constraintForPair(fp, tp) };
    this.assembly.connections.push(conn);
    return { ok: true, assignedId: id };
  }
  /** Compute the transform that mates the new part's `fromPort` against an
   *  existing `(toPart,toPort)`: coincident positions, anti-parallel axes. */
  resolveSnap(newType, fromPort, toPart, toPort) {
    const part = this.part(newType);
    const fp = part?.ports.find((p2) => p2.id === fromPort);
    const ti = this.inst(toPart);
    const tp = this.port(ti, toPort);
    if (!fp || !ti || !tp) return { ok: false, reason: "snap target not found" };
    const targetPos = toWorldPoint(ti.transform, tp.localPos);
    const targetAxis = toWorldDir(ti.transform, tp.localAxis);
    const q = quatFromTo(fp.localAxis, negate3(targetAxis));
    const p = add(targetPos, negate3(rotate(q, fp.localPos)));
    return { ok: true, transform: { p, q, s: [1, 1, 1] } };
  }
};

// packages/sim/src/gears.ts
var ROTATIONAL = /* @__PURE__ */ new Set([
  "axle",
  "axle_socket",
  "gear_center",
  "wheel_hub",
  "motor_out",
  "axle_bearing"
]);
function instanceOf(a, id) {
  return a.parts.find((p) => p.id === id);
}
function portOf(cat, inst, portId) {
  if (!inst) return void 0;
  return cat.get(inst.partType)?.ports.find((p) => p.id === portId);
}
function teethOf(cat, inst) {
  return inst ? cat.get(inst.partType)?.teeth : void 0;
}
function resolveAxleSpeeds(a, cat, motorSpeeds) {
  const adj = /* @__PURE__ */ new Map();
  const link = (x, y, ratio) => {
    (adj.get(x) ?? adj.set(x, []).get(x)).push({ to: y, ratio });
    (adj.get(y) ?? adj.set(y, []).get(y)).push({ to: x, ratio: 1 / ratio });
  };
  for (const c of a.connections) {
    const fp = portOf(cat, instanceOf(a, c.fromPart), c.fromPort);
    const tp = portOf(cat, instanceOf(a, c.toPart), c.toPort);
    if (!fp || !tp) continue;
    if (c.constraintType === "fixed" && ROTATIONAL.has(fp.type) && ROTATIONAL.has(tp.type)) {
      link(c.fromPart, c.toPart, 1);
    } else if (c.constraintType === "gear") {
      const ta = teethOf(cat, instanceOf(a, c.fromPart));
      const tb = teethOf(cat, instanceOf(a, c.toPart));
      if (ta && tb) link(c.fromPart, c.toPart, -ta / tb);
    }
  }
  const speeds = /* @__PURE__ */ new Map();
  const conflicts = [];
  const queue = [];
  for (const [id, s] of motorSpeeds) {
    speeds.set(id, s);
    queue.push(id);
  }
  while (queue.length) {
    const id = queue.shift();
    const s = speeds.get(id);
    for (const e of adj.get(id) ?? []) {
      const want = s * e.ratio;
      const have = speeds.get(e.to);
      if (have === void 0) {
        speeds.set(e.to, want);
        queue.push(e.to);
      } else if (Math.abs(have - want) > 1e-6 && !conflicts.includes(e.to)) {
        conflicts.push(e.to);
      }
    }
  }
  return { speeds, conflicts };
}

// packages/sim/src/sim.ts
var Sim = class {
  world;
  controllerHost;
  angles = /* @__PURE__ */ new Map();
  constructor(catalog, assembly, controllerHost) {
    this.world = new World(catalog, assembly);
    this.controllerHost = controllerHost;
  }
  /** Advance the simulation by `dt` seconds. Returns the resolved kinematics. */
  tick(dt) {
    this.controllerHost?.step(dt, this.world);
    const resolved = resolveAxleSpeeds(this.world.assembly, this.world.catalog, this.world.motorSpeeds);
    for (const [id, w] of resolved.speeds) {
      this.angles.set(id, (this.angles.get(id) ?? 0) + w * dt);
    }
    return { ...resolved, angles: this.angles };
  }
  /** Current kinematic angles (renderer reads this to spin axles/wheels/gears). */
  kinematics() {
    return this.angles;
  }
};
export {
  Sim,
  World,
  resolveAxleSpeeds
};
