// SO-100 arm emulation, tested against an independent URDF oracle.
//
// The catalog parts + example assembly are GENERATED (tools/gen-so100.mjs) from
// the joint table of TheRobotStudio/SO-ARM100's so100.urdf (Apache-2.0). This
// test re-embeds that table and composes the URDF kinematic chain directly —
// T_child = T_parent · Origin(rpy,xyz) · Rot(axis, θ) — then checks that the
// assembly-graph forward kinematics (linkTransforms over parts/connections/
// angles) reproduces it. Two different code paths over the same source data:
// if a port position, a connection, or the chain walk is wrong, they diverge.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Assembly, Part, Quat, Vec3 } from '@qubekit/schema';
import { validateAssembly, validatePart } from '@qubekit/schema';
import { linkTransforms, Sim, World, type Catalog } from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const partsDir = join(root, 'catalog/parts/so100');

function loadCatalog(): Catalog {
  const cat: Catalog = new Map();
  for (const f of readdirSync(partsDir).filter((n) => n.endsWith('.json'))) {
    const part = JSON.parse(readFileSync(join(partsDir, f), 'utf8')) as Part;
    cat.set(part.id, part);
  }
  return cat;
}
const loadAssembly = (): Assembly =>
  JSON.parse(readFileSync(join(root, 'examples/so100/assembly.json'), 'utf8')) as Assembly;

// ---- the URDF joint table (so100.urdf, verbatim) ----------------------------
const JOINTS = [
  { name: 'shoulder_pan',  parent: 'base',      child: 'shoulder',  xyz: [0, -0.0452, 0.0165] as Vec3,  rpy: [1.57079, 0, 0] as Vec3,  axis: [0, 1, 0] as Vec3, min: -2,       max: 2 },
  { name: 'shoulder_lift', parent: 'shoulder',  child: 'upper_arm', xyz: [0, 0.1025, 0.0306] as Vec3,   rpy: [-1.8, 0, 0] as Vec3,     axis: [1, 0, 0] as Vec3, min: 0,        max: 3.5 },
  { name: 'elbow_flex',    parent: 'upper_arm', child: 'lower_arm', xyz: [0, 0.11257, 0.028] as Vec3,   rpy: [1.57079, 0, 0] as Vec3,  axis: [1, 0, 0] as Vec3, min: -3.14158, max: 0 },
  { name: 'wrist_flex',    parent: 'lower_arm', child: 'wrist',     xyz: [0, 0.0052, 0.1349] as Vec3,   rpy: [-1, 0, 0] as Vec3,       axis: [1, 0, 0] as Vec3, min: -2.5,     max: 1.2 },
  { name: 'wrist_roll',    parent: 'wrist',     child: 'gripper',   xyz: [0, -0.0601, 0] as Vec3,       rpy: [0, 1.57079, 0] as Vec3,  axis: [0, 1, 0] as Vec3, min: -3.14158, max: 3.14158 },
  { name: 'gripper',       parent: 'gripper',   child: 'jaw',       xyz: [-0.0202, -0.0244, 0] as Vec3, rpy: [0, 3.14158, 0] as Vec3,  axis: [0, 0, 1] as Vec3, min: -0.2,     max: 2 },
];
// Generator's instance-id layout: base=1, then (servo, child link) per joint.
const LINK_INSTANCE: Record<string, number> = {
  base: 1, shoulder: 3, upper_arm: 5, lower_arm: 7, wrist: 9, gripper: 11, jaw: 13,
};
const SERVO_INSTANCE = [2, 4, 6, 8, 10, 12]; // per JOINTS order

// ---- oracle math (deliberately local — not the code under test) -------------
interface RT { p: Vec3; q: Quat }
const qmul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qrot = (q: Quat, v: Vec3): Vec3 => {
  const [w, x, y, z] = q;
  const uv: Vec3 = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv: Vec3 = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])];
};
const qaxis = (a: Vec3, ang: number): Quat => {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), a[0] * s, a[1] * s, a[2] * s];
};
const qrpy = ([r, p, y]: Vec3): Quat =>
  qmul(qaxis([0, 0, 1], y), qmul(qaxis([0, 1, 0], p), qaxis([1, 0, 0], r)));
const compose = (a: RT, b: RT): RT => ({ p: vadd(a.p, qrot(a.q, b.p)), q: qmul(a.q, b.q) });
const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** URDF chain FK, Z-up → Y-up world root. θ per JOINTS order. */
function oracle(theta: number[]): Map<string, RT> {
  const out = new Map<string, RT>();
  out.set('base', { p: [0, 0, 0], q: qaxis([1, 0, 0], -Math.PI / 2) });
  JOINTS.forEach((j, i) => {
    const parent = out.get(j.parent)!;
    const atOrigin = compose(parent, { p: j.xyz, q: qrpy(j.rpy) });
    out.set(j.child, compose(atOrigin, { p: [0, 0, 0], q: qaxis(j.axis, theta[i]) }));
  });
  return out;
}

const expectClose = (got: Vec3, want: Vec3, tol = 1e-6) => {
  for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `component ${i}`).toBeLessThan(tol);
};
const expectQuatClose = (got: Quat, want: Quat, tol = 1e-6) => {
  const d = (s: number) => Math.hypot(...got.map((g, i) => g - s * want[i]));
  expect(Math.min(d(1), d(-1))).toBeLessThan(tol);
};

describe('SO-100 catalog + assembly', () => {
  const catalog = loadCatalog();
  const assembly = loadAssembly();

  it('every part validates', () => {
    expect(catalog.size).toBe(8); // 7 links + the STS3215
    for (const part of catalog.values()) {
      const check = validatePart(part);
      expect(check.errors, part.id).toEqual([]);
    }
  });

  it('the assembly validates and is constructible through the op rules', () => {
    expect(validateAssembly(assembly).errors).toEqual([]);
    // Replaying the graph as ops proves every connection passes canMate + the
    // constraint resolution — the assembly is buildable, not just well-formed.
    const world = new World(catalog);
    for (const inst of assembly.parts) {
      const r = world.apply({ op: 'part.place', partType: inst.partType, transform: inst.transform });
      expect(r.ok).toBe(true);
      expect(r.assignedId).toBe(inst.id);
    }
    for (const conn of assembly.connections) {
      const r = world.apply({
        op: 'port.connect',
        fromPart: conn.fromPart, fromPort: conn.fromPort,
        toPart: conn.toPart, toPort: conn.toPort,
      });
      expect(r.ok, `connection ${conn.id}`).toBe(true);
    }
    expect(world.assembly.connections).toEqual(assembly.connections);
  });

  it('zero pose matches the URDF chain', () => {
    const want = oracle([0, 0, 0, 0, 0, 0]);
    const got = linkTransforms(assembly, catalog, new Map());
    for (const [link, id] of Object.entries(LINK_INSTANCE)) {
      const t = got.get(id)!;
      expectClose(t.p, want.get(link)!.p);
      expectQuatClose(t.q, want.get(link)!.q);
    }
  });

  it('an articulated pose matches the URDF chain (FK over the graph)', () => {
    const theta = [0.5, 1.2, -0.8, 0.3, 1.0, 0.7]; // all within joint limits
    const angles = new Map<number, number>();
    JOINTS.forEach((_, i) => {
      angles.set(SERVO_INSTANCE[i], theta[i]);
      angles.set(LINK_INSTANCE[JOINTS[i].child], theta[i]); // keyed: same angle
    });
    const want = oracle(theta);
    const got = linkTransforms(assembly, catalog, angles);
    for (const [link, id] of Object.entries(LINK_INSTANCE)) {
      const t = got.get(id)!;
      expectClose(t.p, want.get(link)!.p, 1e-6);
      expectQuatClose(t.q, want.get(link)!.q, 1e-6);
    }
    // Servo BODIES stay with their parent link (the case is bolted to it; the
    // angle lives across the driven edge, not on the mesh). Their shaft sits
    // ON the joint-axis line — possibly offset ALONG it (the joint origin is
    // the horn interface, the motor body nests one case-length away) — so the
    // component of (servo − joint origin) perpendicular to the axis is zero.
    JOINTS.forEach((j, i) => {
      const parentPose = got.get(LINK_INSTANCE[j.parent])!;
      const servoPose = got.get(SERVO_INSTANCE[i])!;
      const jointWorld = vadd(parentPose.p, qrot(parentPose.q, /* joint origin in parent frame */ j.xyz));
      const axisWorld = qrot(parentPose.q, qrot(qrpy(j.rpy), j.axis));
      const off = servoPose.p.map((v, k) => v - jointWorld[k]) as Vec3;
      const axial = off[0] * axisWorld[0] + off[1] * axisWorld[1] + off[2] * axisWorld[2];
      const perp = off.map((v, k) => v - axial * axisWorld[k]) as Vec3;
      expectClose(perp, [0, 0, 0]);
    });
  });

  it('physical sanity: the zero-pose chain has plausible scale and sits above ground', () => {
    const got = linkTransforms(assembly, catalog, new Map());
    const jaw = got.get(LINK_INSTANCE.jaw)!;
    const reach = Math.hypot(...jaw.p);
    expect(reach).toBeGreaterThan(0.1); // the arm is ~35 cm of links
    expect(reach).toBeLessThan(0.6);
  });

  it('end-to-end: servo.set targets, tick to settle, FK matches the oracle', () => {
    const sim = new Sim(catalog, structuredClone(assembly));
    const theta = [0.8, 0.9, -0.6, -0.4, 0.5, 0.3];
    JOINTS.forEach((_, i) => {
      const r = sim.world.apply({ op: 'servo.set', part: SERVO_INSTANCE[i], angle: theta[i] });
      expect(r.ok).toBe(true);
    });
    const dt = 1 / 64;
    for (let t = 0; t < 2; t += dt) sim.tick(dt); // 1 rad/s joint cap → ≤0.9 s
    const got = linkTransforms(sim.world.assembly, catalog, sim.kinematics());
    const want = oracle(theta);
    for (const [link, id] of Object.entries(LINK_INSTANCE)) {
      expectClose(got.get(id)!.p, want.get(link)!.p, 1e-6);
      expectQuatClose(got.get(id)!.q, want.get(link)!.q, 1e-6);
    }
  });

  it('joint software limits hold: a target past the URDF limit settles at the limit', () => {
    const sim = new Sim(catalog, structuredClone(assembly));
    // shoulder_pan limit is ±2 rad; command 3 rad (within the servo hardware envelope)
    sim.world.apply({ op: 'servo.set', part: SERVO_INSTANCE[0], angle: 3 });
    const dt = 1 / 64;
    for (let t = 0; t < 4; t += dt) sim.tick(dt);
    expect(sim.kinematics().get(SERVO_INSTANCE[0])).toBeCloseTo(2, 9);
  });
});
