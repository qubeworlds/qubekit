// Unit quaternions for body orientation, plus the exponential map used as the
// solver's retraction on SO(3). Layout is [x, y, z, w] (w scalar last) to match
// glTF / most GPU conventions.

import { vlen, type Vec3 } from './vec.js';

export type Quat = [number, number, number, number];

export const QID: Quat = [0, 0, 0, 1];

export function qmul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qnorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

// Rotate a vector by a quaternion: v + 2*cross(q.xyz, cross(q.xyz, v) + w*v).
export function qrot(q: Quat, v: Vec3): Vec3 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

// Exponential map: a world-frame rotation vector (axis * angle, radians) -> unit
// quaternion. This is the solver's retraction: small SO(3) steps compose onto
// the current orientation without ever leaving the unit sphere.
export function qexp(omega: Vec3): Quat {
  const angle = vlen(omega);
  if (angle < 1e-9) {
    // First-order term, then renormalize — avoids a 0/0 in the sinc below.
    return qnorm([omega[0] / 2, omega[1] / 2, omega[2] / 2, 1]);
  }
  const half = angle / 2;
  const s = Math.sin(half) / angle;
  return [omega[0] * s, omega[1] * s, omega[2] * s, Math.cos(half)];
}
