// A rigid body: an SE(3) pose (position + orientation) the solver moves to
// satisfy constraints. A body marked `grounded` is held fixed (excluded from the
// parameter vector) — every well-posed assembly grounds at least one body to
// pin the global gauge freedom.
import { vadd } from './vec.js';
import { qexp, qmul, qnorm, qrot } from './quat.js';
export const worldPoint = (b, local) => vadd(b.position, qrot(b.orientation, local));
export const worldDir = (b, local) => qrot(b.orientation, local);
export function cloneBody(b) {
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
export function retract(b, d) {
    b.position = [b.position[0] + d[0], b.position[1] + d[1], b.position[2] + d[2]];
    b.orientation = qnorm(qmul(qexp([d[3], d[4], d[5]]), b.orientation));
}
