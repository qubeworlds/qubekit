// A rigid body: an SE(3) pose (position + orientation) the solver moves to
// satisfy constraints. A body marked `grounded` is held fixed (excluded from the
// parameter vector) — every well-posed assembly grounds at least one body to
// pin the global gauge freedom.

import { vadd, type Vec3 } from './vec.js';
import { qexp, qmul, qnorm, qrot, type Quat } from './quat.js';

export interface Body {
  position: Vec3;
  orientation: Quat;
  grounded?: boolean;
  name?: string;
}

export const worldPoint = (b: Body, local: Vec3): Vec3 => vadd(b.position, qrot(b.orientation, local));
export const worldDir = (b: Body, local: Vec3): Vec3 => qrot(b.orientation, local);

export function cloneBody(b: Body): Body {
  return {
    position: [b.position[0], b.position[1], b.position[2]],
    orientation: [b.orientation[0], b.orientation[1], b.orientation[2], b.orientation[3]],
    grounded: b.grounded,
    name: b.name,
  };
}

// Apply a 6-vector increment [tx,ty,tz, rx,ry,rz] (world frame) onto a body:
// translate, then left-compose the exp-map rotation. This is the retraction the
// solver linearizes around each iteration.
export function retract(b: Body, d: number[]): void {
  b.position = [b.position[0] + d[0], b.position[1] + d[1], b.position[2] + d[2]];
  b.orientation = qnorm(qmul(qexp([d[3], d[4], d[5]]), b.orientation));
}
