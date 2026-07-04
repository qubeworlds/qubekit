// Generate the SO-100 robot-arm part family + example assembly from the arm's
// published joint table.
//
//   node tools/gen-so100.mjs        # writes catalog/parts/so100/ + examples/so100/assembly.json
//
// Source of truth: TheRobotStudio/SO-ARM100 (Apache-2.0),
// Simulation/SO100/so100.urdf — the joint origins/axes/limits below are copied
// verbatim from that file. The URDF is Z-up; the assembly places the base with
// a −90° X rotation so the emitted world is Y-up per spec/parts.md. Each link
// part's LOCAL frame is its URDF link frame, so every number here is traceable
// to the URDF without conversion.
//
// Construction model per joint (all six SO-100 joints are revolute):
//   parent link ──(pin_socket ← pin: structural)── STS3215 servo
//   servo ──(motor_out → axle_socket: driven, keyed)── child link
// The servo's case is fixed to the parent; the joint angle lives across the
// driven edge (see @qubekit/sim chain.ts). Port positions encode the joint
// origins — dimensional correctness is data, not code.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'catalog/parts/so100');
const exampleDir = join(root, 'examples/so100');

// ---- the URDF joint table (verbatim) ---------------------------------------
// xyz/rpy: joint <origin> in the PARENT link frame. axis: in the CHILD frame.
const JOINTS = [
  { name: 'shoulder_pan',  parent: 'base',      child: 'shoulder',  xyz: [0, -0.0452, 0.0165],  rpy: [1.57079, 0, 0],  axis: [0, 1, 0], min: -2,       max: 2,       vel: 1 },
  { name: 'shoulder_lift', parent: 'shoulder',  child: 'upper_arm', xyz: [0, 0.1025, 0.0306],   rpy: [-1.8, 0, 0],     axis: [1, 0, 0], min: 0,        max: 3.5,     vel: 1 },
  { name: 'elbow_flex',    parent: 'upper_arm', child: 'lower_arm', xyz: [0, 0.11257, 0.028],   rpy: [1.57079, 0, 0],  axis: [1, 0, 0], min: -3.14158, max: 0,       vel: 1 },
  { name: 'wrist_flex',    parent: 'lower_arm', child: 'wrist',     xyz: [0, 0.0052, 0.1349],   rpy: [-1, 0, 0],       axis: [1, 0, 0], min: -2.5,     max: 1.2,     vel: 1 },
  { name: 'wrist_roll',    parent: 'wrist',     child: 'gripper',   xyz: [0, -0.0601, 0],       rpy: [0, 1.57079, 0],  axis: [0, 1, 0], min: -3.14158, max: 3.14158, vel: 1 },
  { name: 'gripper',       parent: 'gripper',   child: 'jaw',       xyz: [-0.0202, -0.0244, 0], rpy: [0, 3.14158, 0],  axis: [0, 0, 1], min: -0.2,     max: 2,       vel: 1 },
];

// URDF link inertial masses (kg). NOTE: each URDF link's mass INCLUDES its
// motor — the separate sts3215 part mass below is informational; a dynamics
// pass must not double-count (see examples/so100/README.md).
const LINK_MASS = {
  base: 1.0, shoulder: 0.119226, upper_arm: 0.162409, lower_arm: 0.147968,
  wrist: 0.0661321, gripper: 0.0929859, jaw: 0.0202444,
};
const LINKS = Object.keys(LINK_MASS);

// ---- tiny quaternion kit (wxyz, matches @qubekit/schema) --------------------
const qmul = ([aw, ax, ay, az], [bw, bx, by, bz]) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];
const qrot = ([w, x, y, z], [vx, vy, vz]) => {
  const uv = [y * vz - z * vy, z * vx - x * vz, x * vy - y * vx];
  const uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return [vx + 2 * (w * uv[0] + uuv[0]), vy + 2 * (w * uv[1] + uuv[1]), vz + 2 * (w * uv[2] + uuv[2])];
};
const qaxis = ([x, y, z], a) => {
  const s = Math.sin(a / 2);
  return [Math.cos(a / 2), x * s, y * s, z * s];
};
// URDF rpy = Rz(yaw) · Ry(pitch) · Rx(roll)
const qrpy = ([r, p, y]) => qmul(qaxis([0, 0, 1], y), qmul(qaxis([0, 1, 0], p), qaxis([1, 0, 0], r)));
const qfromto = (f, t) => {
  const d = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
  if (d >= 1 - 1e-9) return [1, 0, 0, 0];
  if (d <= -1 + 1e-9) {
    let ax = [f[1] * 0 - f[2] * 0, f[2] * 1 - f[0] * 0, f[0] * 0 - f[1] * 1]; // f × x̂
    let n = Math.hypot(...ax);
    if (n < 1e-6) { ax = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; n = Math.hypot(...ax); } // f × ŷ
    return [0, ax[0] / n, ax[1] / n, ax[2] / n];
  }
  const ax = [f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0]];
  const q = [1 + d, ...ax];
  const n = Math.hypot(...q);
  return q.map((v) => v / n);
};
const compose = (a, b) => ({ p: vadd(a.p, qrot(a.q, b.p)), q: qmul(a.q, b.q) });
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const round = (x) => (Math.abs(x) < 1e-12 ? 0 : Number(x.toFixed(9)));
const roundV = (v) => v.map(round);

// ---- catalog parts ----------------------------------------------------------
const CDN = 'cdn.qubeworlds.com/qubekit/parts/so100';
const port = (id, type, localPos, localAxis, allowedCounterparts, constraint) => ({
  id, type, localPos: roundV(localPos), localAxis: roundV(localAxis),
  allowedCounterparts, tolerance: 0.001, constraint,
});

const parts = new Map();
// The servo: an STS3215. Output shaft at the local origin along +Z; the case
// mount references the same point (the shaft exit), so placing the servo at a
// joint origin needs no extra offset. Envelope: position mode is multi-turn
// capable — ±2π comfortably covers every SO-100 joint range; no-load speed
// ≈0.229 s/60° ⇒ ~4.6 rad/s (per-joint controllers cap it at the URDF's 1).
parts.set('so100_sts3215', {
  id: 'so100_sts3215',
  name: 'STS3215 servo',
  geometry: `${CDN}/sts3215.glb`,
  mass: 0.055,
  material: 'metal',
  servo: { minAngle: -6.283185307, maxAngle: 6.283185307, maxVelocity: 4.6 },
  ports: [
    port('mount', 'pin', [0, 0, 0], [0, 0, 1], ['pin_socket'], 'fixed'),
    port('out', 'motor_out', [0, 0, 0], [0, 0, 1], ['axle', 'axle_socket'], 'fixed'),
  ],
});

for (const link of LINKS) {
  const ports = [];
  const asChild = JOINTS.find((j) => j.child === link);
  if (asChild) {
    // The link's frame origin IS the joint (URDF convention): the servo horn
    // bolts here, keyed. Axis = the URDF joint axis, in this (child) frame.
    ports.push(port('horn', 'axle_socket', [0, 0, 0], asChild.axis, ['motor_out', 'axle'], 'fixed'));
  }
  const asParent = JOINTS.find((j) => j.parent === link);
  if (asParent) {
    // Where this link's OWN servo is screwed in: the child joint's origin, with
    // the joint axis expressed in this (parent) frame: R(rpy) · axis_child.
    const axisInParent = qrot(qrpy(asParent.rpy), asParent.axis);
    ports.push(port(`${asParent.name}_servo`, 'pin_socket', asParent.xyz, axisInParent, ['pin'], 'fixed'));
  }
  parts.set(`so100_${link}`, {
    id: `so100_${link}`,
    name: `SO-100 ${link.replace('_', ' ')}`,
    geometry: `${CDN}/${link}.glb`,
    mass: LINK_MASS[link],
    material: 'plastic',
    ports,
  });
}

// ---- example assembly (zero pose, Y-up world) -------------------------------
const roundT = (t) => ({ p: roundV(t.p), q: roundV(t.q), s: [1, 1, 1] });
// Z-up URDF world → Y-up spec world: rotate −90° about X.
const zUpToYUp = { p: [0, 0, 0], q: qaxis([1, 0, 0], -Math.PI / 2) };

const linkT = { base: zUpToYUp };
const instances = [];
const connections = [];
const controllers = [];
let nextId = 1;
let nextConn = 1;

const baseId = nextId++;
instances.push({ id: baseId, partType: 'so100_base', transform: roundT(linkT.base) });
const linkId = { base: baseId };

for (const j of JOINTS) {
  const parentT = linkT[j.parent];
  // Servo: output shaft at the joint origin, local +Z along the joint axis
  // (spin about the shaft is cosmetic — the mesh may be re-oriented later).
  // Align in the CHILD frame first (the axis there is an exact unit vector),
  // then apply the exact rpy rotation — qfromto against R(rpy)·axis would hit
  // its antiparallel branch for the gripper joint (rpy y ≈ π) and silently
  // drop the ~1.3e-5 tilt the URDF's truncated π carries.
  const servoT = compose(parentT, { p: j.xyz, q: qmul(qrpy(j.rpy), qfromto([0, 0, 1], j.axis)) });
  const servoId = nextId++;
  instances.push({ id: servoId, partType: 'so100_sts3215', transform: roundT(servoT) });

  // Child link at the URDF chain's zero pose.
  const childT = compose(parentT, { p: j.xyz, q: qrpy(j.rpy) });
  const childId = nextId++;
  instances.push({ id: childId, partType: `so100_${j.child}`, transform: roundT(childT) });
  linkT[j.child] = childT;
  linkId[j.child] = childId;

  connections.push({
    id: nextConn++, fromPart: servoId, fromPort: 'mount',
    toPart: linkId[j.parent], toPort: `${j.name}_servo`, constraintType: 'fixed',
  });
  connections.push({
    id: nextConn++, fromPart: servoId, fromPort: 'out',
    toPart: childId, toPort: 'horn', constraintType: 'fixed',
  });
  // Per-JOINT software limits live here (the assembly), not on the servo part:
  // they come from link interference, so they are properties of this machine.
  controllers.push({
    id: controllers.length + 1, part: servoId,
    q64Module: 'controllers/so100_joint.q',
    inputs: ['target_angle'], outputs: ['motor_speed'],
    params: { minAngle: j.min, maxAngle: j.max, maxVelocity: j.vel },
  });
}

const assembly = {
  id: 'so100', name: 'SO-100 arm', rev: 0,
  parts: instances, connections, controllers,
};

// ---- write ------------------------------------------------------------------
mkdirSync(partsDir, { recursive: true });
mkdirSync(exampleDir, { recursive: true });
for (const [id, p] of parts) {
  writeFileSync(join(partsDir, `${id}.json`), JSON.stringify(p, null, 2) + '\n');
}
writeFileSync(join(exampleDir, 'assembly.json'), JSON.stringify(assembly, null, 2) + '\n');
console.log(`wrote ${parts.size} parts -> ${partsDir}`);
console.log(`wrote assembly (${instances.length} parts, ${connections.length} connections, ${controllers.length} controllers) -> ${exampleDir}/assembly.json`);
