// Minimal 3D / 2D vector helpers. Pure, allocation-light, no dependencies.
// Vectors are plain number tuples so they serialize trivially and interop with
// the schema/wire types without adapters.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const vlen = (a: Vec3): number => Math.sqrt(vdot(a, a));

export function vnorm(a: Vec3): Vec3 {
  const l = vlen(a);
  if (l < 1e-12) return [0, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}
