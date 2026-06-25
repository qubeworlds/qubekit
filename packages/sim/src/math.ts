// Minimal vec3 / quaternion helpers (wxyz) for snap resolution. Pure + tiny —
// not a general math lib, just what the sim needs to mate two ports.

import type { Quat, Transform, Vec3 } from '@qubekit/schema';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const negate3 = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
}

/** Hamilton product (wxyz). */
export function quatMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

/** Rotate a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  const u: Vec3 = [x, y, z];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * w), scale(uuv, 2)));
}

/** Shortest-arc quaternion rotating unit vector `from` onto unit vector `to`. */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const f = normalize(from);
  const t = normalize(to);
  const d = dot(f, t);
  if (d >= 1 - 1e-9) return [1, 0, 0, 0]; // already aligned
  if (d <= -1 + 1e-9) {
    // antiparallel — rotate 180° about any axis ⟂ f
    let axis = cross(f, [1, 0, 0]);
    if (len(axis) < 1e-6) axis = cross(f, [0, 1, 0]);
    axis = normalize(axis);
    return [0, axis[0], axis[1], axis[2]];
  }
  const axis = cross(f, t);
  const w = 1 + d;
  const q: Quat = [w, axis[0], axis[1], axis[2]];
  const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** World pose of a part-local point/axis given the instance transform (scale 1).*/
export function toWorldPoint(t: Transform, localPos: Vec3): Vec3 {
  return add(t.p, rotate(t.q, localPos));
}
export function toWorldDir(t: Transform, localDir: Vec3): Vec3 {
  return rotate(t.q, localDir);
}
