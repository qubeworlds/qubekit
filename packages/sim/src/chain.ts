// Kinematic-chain forward kinematics over the assembly graph. The instance
// transforms stored in the Assembly are the ZERO POSE; this walks the
// connection graph from a root and re-poses every instance from the integrated
// angles (`Sim.kinematics()`), rotating each articulated connection about its
// port axis. The output is what a renderer applies — and, for a robot arm, the
// digital-twin pose a controller can be tested against.
//
// Which connections articulate:
//   - a DRIVEN keyed connection (`motor_out` ↔ a rotational counterpart):
//     the subtree on the far side of the motor rotates by the motor's absolute
//     integrated angle. The motor's own body does NOT rotate — its case stays
//     with whatever it is mounted to; the angle lives across this edge (a servo
//     case→horn is exactly this).
//   - a HINGE (axle in a bearing): the two sides rotate relative to each other
//     by the difference of their integrated angles.
//   - every other connection is rigid.
// A keyed non-motor coupling (axle↔wheel_hub, axle↔gear_center) is rigid here:
// both sides carry the same integrated angle and the rotation is applied once,
// at the motor edge or the hinge — never twice.
//
// Driven edges take their rotation AXIS from the KEYED (horn/socket) side of
// the connection — the horn axis defines the joint's positive direction, so a
// motor body mounted shaft-reversed (the SO-100 mounts most of its servos
// that way) doesn't flip the joint sign. Hinge edges still assume the mated
// axes are PARALLEL at the zero pose (explicit-transform assemblies); a
// snap-placed mate is anti-parallel — when snap-authored articulated chains
// land, that sign must come from the mated axes' dot product.

import type { Assembly, Connection, Quat, SnapPort, Transform, Vec3 } from '@qubekit/schema';
import type { Catalog } from './gears';
import { add, negate3, quatAxisAngle, quatMul, rotate, toWorldDir, toWorldPoint } from './math';

/** A rigid motion x ↦ q·x + p (no scale). */
interface Motion {
  q: Quat;
  p: Vec3;
}
const IDENTITY: Motion = { q: [1, 0, 0, 0], p: [0, 0, 0] };
const compose = (outer: Motion, inner: Motion): Motion => ({
  q: quatMul(outer.q, inner.q),
  p: add(rotate(outer.q, inner.p), outer.p),
});
const applyMotion = (m: Motion, v: Vec3): Vec3 => add(rotate(m.q, v), m.p);
/** Rotation of `angle` about `axis` through the point `pivot`. */
const aboutPivot = (axis: Vec3, pivot: Vec3, angle: number): Motion => {
  const q = quatAxisAngle(axis, angle);
  return { q, p: add(pivot, negate3(rotate(q, pivot))) };
};

const ROTATIONAL = new Set(['axle', 'axle_socket', 'gear_center', 'wheel_hub', 'motor_out']);

/** Pose every instance from the integrated angles. Instances unreachable from
 *  the root keep their zero-pose transform. Root defaults to the lowest
 *  instance id (an assembly's ground part is conventionally placed first). */
export function linkTransforms(
  a: Assembly,
  cat: Catalog,
  angles: Map<number, number>,
  root?: number,
): Map<number, Transform> {
  if (!a.parts.length) return new Map();
  const port = (instId: number, portId: string): SnapPort | undefined => {
    const inst = a.parts.find((p) => p.id === instId);
    return inst ? cat.get(inst.partType)?.ports.find((p) => p.id === portId) : undefined;
  };
  const zeroPose = new Map(a.parts.map((p) => [p.id, p.transform]));

  // Adjacency: each connection is walkable from either end.
  const adj = new Map<number, { other: number; conn: Connection }[]>();
  for (const c of a.connections) {
    (adj.get(c.fromPart) ?? adj.set(c.fromPart, []).get(c.fromPart)!).push({ other: c.toPart, conn: c });
    (adj.get(c.toPart) ?? adj.set(c.toPart, []).get(c.toPart)!).push({ other: c.fromPart, conn: c });
  }

  const start = root ?? Math.min(...a.parts.map((p) => p.id));
  const motions = new Map<number, Motion>();
  motions.set(start, IDENTITY);
  const queue = [start];

  while (queue.length) {
    const u = queue.shift()!;
    const mU = motions.get(u)!;
    const t0U = zeroPose.get(u)!;
    for (const { other: v, conn } of adj.get(u) ?? []) {
      if (motions.has(v)) continue;
      const uPortId = conn.fromPart === u ? conn.fromPort : conn.toPort;
      const vPortId = conn.fromPart === u ? conn.toPort : conn.fromPort;
      const uPort = port(u, uPortId);
      const vPort = port(v, vPortId);
      let mV = mU;
      if (uPort && vPort) {
        let angle = 0;
        let driven = false;
        if (conn.constraintType === 'hinge') {
          angle = (angles.get(v) ?? 0) - (angles.get(u) ?? 0);
        } else if (
          conn.constraintType === 'fixed' &&
          (uPort.type === 'motor_out') !== (vPort.type === 'motor_out') &&
          ROTATIONAL.has(uPort.type) &&
          ROTATIONAL.has(vPort.type)
        ) {
          driven = true;
          const motorSide = uPort.type === 'motor_out' ? u : v;
          angle = (angles.get(motorSide) ?? 0) * (motorSide === u ? 1 : -1);
        }
        if (angle !== 0) {
          // Pivot from the u-side port (any point of the joint-axis line is a
          // valid hinge pivot), carried into u's CURRENT pose. The rotation
          // AXIS of a DRIVEN edge comes from the KEYED (horn/socket) side —
          // it defines the joint's positive direction, independent of which
          // way round the motor body is mounted (a shaft-reversed servo must
          // not flip the joint sign). Both zero poses live in the same world
          // frame, so either side's axis is carried by u's motion.
          const keyedPort = uPort.type === 'motor_out' ? vPort : uPort;
          const keyedT0 = uPort.type === 'motor_out' ? zeroPose.get(v)! : t0U;
          const axisPort = driven ? keyedPort : uPort;
          const axisT0 = driven ? keyedT0 : t0U;
          const pivot = applyMotion(mU, toWorldPoint(t0U, uPort.localPos));
          const axis = rotate(mU.q, toWorldDir(axisT0, axisPort.localAxis));
          mV = compose(aboutPivot(axis, pivot, angle), mU);
        }
      }
      motions.set(v, mV);
      queue.push(v);
    }
  }

  const out = new Map<number, Transform>();
  for (const inst of a.parts) {
    const m = motions.get(inst.id) ?? IDENTITY;
    const t0 = inst.transform;
    out.set(inst.id, { p: applyMotion(m, t0.p), q: quatMul(m.q, t0.q), s: t0.s });
  }
  return out;
}
