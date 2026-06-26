// Mate constraints. Each is a pure residual function over the body array: zero
// residual ⟺ the mate is satisfied. The solver drives the stacked residual to
// zero. These are the 3D analogue of a sketcher's 2D constraints (FreeCAD's
// planegcs solves coincident/parallel/distance in 2D; this solves the assembly
// mates QubeKit's snap ports generate).
//
// Composition is the whole point: a pin through two holes is two `concentric`
// constraints solved *simultaneously*, which a greedy first-compatible-port
// matcher cannot do.

import { vdot, vnorm, vscale, vsub, type Vec3 } from './vec.js';
import { worldDir, worldPoint, type Body } from './body.js';

export interface Constraint {
  readonly kind: string;
  readonly bodies: number[]; // indices into the body array
  residual(bodies: Body[]): number[];
}

// Two points (one local to each body) must coincide. Removes 3 DOF.
export function coincident(a: number, localA: Vec3, b: number, localB: Vec3): Constraint {
  return {
    kind: 'coincident',
    bodies: [a, b],
    residual: (bs) => vsub(worldPoint(bs[a], localA), worldPoint(bs[b], localB)),
  };
}

// Two axes must be parallel (sense +1) or anti-parallel (sense -1). Removes 2 DOF
// (the residual is 3 components but rank 2; LM damping absorbs the redundancy).
export function parallel(a: number, axisA: Vec3, b: number, axisB: Vec3, sense: 1 | -1 = 1): Constraint {
  return {
    kind: 'parallel',
    bodies: [a, b],
    residual: (bs) => {
      const da = vnorm(worldDir(bs[a], axisA));
      const db = vnorm(worldDir(bs[b], axisB));
      return [da[0] - sense * db[0], da[1] - sense * db[1], da[2] - sense * db[2]];
    },
  };
}

export interface Line {
  point: Vec3; // a point on the axis, local to the body
  axis: Vec3; // axis direction, local to the body
}

// Two axis lines must be collinear: parallel axes AND zero perpendicular offset.
// Removes 4 DOF — leaves the slide-along and spin-about freedoms, exactly the
// kinematics of an axle in a bearing or a pin in a hole.
export function concentric(a: number, lineA: Line, b: number, lineB: Line, sense: 1 | -1 = 1): Constraint {
  return {
    kind: 'concentric',
    bodies: [a, b],
    residual: (bs) => {
      const ax = vnorm(worldDir(bs[a], lineA.axis));
      const bx = vnorm(worldDir(bs[b], lineB.axis));
      const par: Vec3 = [ax[0] - sense * bx[0], ax[1] - sense * bx[1], ax[2] - sense * bx[2]];

      const pa = worldPoint(bs[a], lineA.point);
      const pb = worldPoint(bs[b], lineB.point);
      const d = vsub(pb, pa);
      const perp = vsub(d, vscale(ax, vdot(d, ax))); // component of offset ⟂ to axis
      return [par[0], par[1], par[2], perp[0], perp[1], perp[2]];
    },
  };
}

// Hold a fixed distance between two points (belts, struts, offset stops).
export function distance(a: number, localA: Vec3, b: number, localB: Vec3, dist: number): Constraint {
  return {
    kind: 'distance',
    bodies: [a, b],
    residual: (bs) => {
      const d = vsub(worldPoint(bs[a], localA), worldPoint(bs[b], localB));
      return [Math.hypot(d[0], d[1], d[2]) - dist];
    },
  };
}
