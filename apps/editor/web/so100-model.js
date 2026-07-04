// SO-100 robot arm — the editor mechanism for the REAL SO-ARM100 assembly
// (catalog/parts/so100 + examples/so100/assembly.json). Everything kinematic
// here comes from so100-data.js, GENERATED from the arm's URDF joint table —
// no hand-maintained link math.
//
// What this model emulates (mirroring @qubekit/sim's servo.ts + chain.ts, which
// carry the tested TS authority):
//   • a scripted pick-and-place TARGET trajectory in joint space (what a
//     controller would stream as `servo.set` ops / `set_targets(vec<f32,6>)`);
//   • six STS3215s in position mode: the ACTUAL angles slew toward the targets
//     at the URDF's 1 rad/s velocity cap, clamped to each joint's limits. Speed
//     up the trajectory and the servos visibly lag and cut corners — that gap
//     is the point, it's what the real arm does;
//   • forward kinematics over the assembly graph: world pose per link + servo.

import { SO100 } from './so100-data.js';

// --- quaternion kit (wxyz, matches @qubekit/schema) ---------------------------
export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qrot = (q, v) => {
  const [w, x, y, z] = q;
  const uv = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])];
};
export const qaxis = (a, ang) => {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), a[0] * s, a[1] * s, a[2] * s];
};
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** FK: joint angles → per-link rigid motion {q,p} applied on top of the zero
 *  pose (the JS mirror of @qubekit/sim chain.ts, specialised to this chain). */
export function motions(theta) {
  const M = SO100.links.map(() => null);
  M[0] = { q: [1, 0, 0, 0], p: [0, 0, 0] };
  for (let i = 0; i < SO100.joints.length; i++) {
    const j = SO100.joints[i];
    const mp = M[j.parent];
    const axis = qrot(mp.q, j.axis0);
    const pivot = vadd(qrot(mp.q, j.pivot0), mp.p);
    const R = qaxis(axis, theta[i]);
    M[j.child] = { q: qmul(R, mp.q), p: vadd(vsub(pivot, qrot(R, pivot)), qrot(R, mp.p)) };
  }
  return M;
}

/** World pose of every link + servo body at the given joint angles. */
export function poses(theta) {
  const M = motions(theta);
  const apply = (m, p0, q0) => ({ p: vadd(qrot(m.q, p0), m.p), q: qmul(m.q, q0) });
  return {
    links: SO100.links.map((l, i) => ({ name: l.name, ...apply(M[i], l.p0, l.q0) })),
    servos: SO100.servos.map((s) => apply(M[s.parent], s.p0, s.q0)),
  };
}

export function buildSo100() {
  const J = SO100.joints;

  // Scripted pick-and-place, as joint-space waypoints (θ order = joint order:
  // pan, lift, elbow, wrist flex, wrist roll, jaw). All within the URDF limits.
  const wps = [
    { t: [0.0, 0.35, -0.6, -0.6, 0.0, 0.6], label: 'home' },
    { t: [0.9, 1.35, -1.2, -0.9, 0.0, 1.5], label: 'approach' },
    { t: [0.9, 1.75, -1.05, -1.3, 0.0, 1.5], label: 'descend' },
    { t: [0.9, 1.75, -1.05, -1.3, 0.0, 0.3], label: 'grip' },
    { t: [0.9, 1.15, -1.0, -0.8, 0.0, 0.3], label: 'lift' },
    { t: [-0.9, 1.15, -1.0, -0.8, 1.3, 0.3], label: 'carry' },
    { t: [-0.9, 1.7, -1.05, -1.25, 1.3, 0.3], label: 'place' },
    { t: [-0.9, 1.7, -1.05, -1.25, 1.3, 1.5], label: 'release' },
    { t: [-0.9, 1.15, -1.1, -0.7, 0.0, 1.0], label: 'retreat' },
    { t: [0.0, 0.35, -0.6, -0.6, 0.0, 0.6], label: 'home' },
  ];

  // Time per segment ∝ the largest joint move in it (floored so grip/release
  // dwell), so the target trajectory has a roughly constant peak joint rate.
  const segW = [];
  for (let i = 0; i < wps.length - 1; i++) {
    let d = 0;
    for (let k = 0; k < 6; k++) d = Math.max(d, Math.abs(wps[i + 1].t[k] - wps[i].t[k]));
    segW.push(Math.max(0.35, d));
  }
  const totalW = segW.reduce((s, w) => s + w, 0);
  const cum = [0];
  for (const w of segW) cum.push(cum[cum.length - 1] + w / totalW);
  const ease = (t) => t * t * (3 - 2 * t);

  const CYCLE_SECONDS = 22;
  let speed = 1;
  let phase = 0;
  const target = wps[0].t.slice();
  const actual = wps[0].t.slice();
  let label = 'home';

  function targetsAt(ph) {
    const t = ((ph % 1) + 1) % 1;
    let i = 0;
    while (i < segW.length - 1 && t >= cum[i + 1]) i++;
    const f = ease(Math.max(0, Math.min(1, (t - cum[i]) / (segW[i] / totalW))));
    label = wps[i].label;
    for (let k = 0; k < 6; k++) target[k] = wps[i].t[k] + (wps[i + 1].t[k] - wps[i].t[k]) * f;
  }

  return {
    kind: 'so100',
    control: 'slider',
    sliderConfig: { label: 'Speed', min: 0, max: 3, step: 0.1, unit: '×', param: 'speed' },
    get sliderValue() { return speed; },
    setSlider(v) { speed = Math.max(0, Math.min(3, v)); },

    /** Advance the trajectory AND the servo emulation. Called by the active
     *  view's frame loop (only one view runs at a time). */
    advance(dt) {
      if (!(dt > 0)) return;
      phase = (phase + (dt / CYCLE_SECONDS) * speed) % 1;
      targetsAt(phase);
      for (let k = 0; k < 6; k++) {
        // exactly @qubekit/sim servo.ts: clamp to joint limits, deadbeat slew
        // under the velocity cap.
        const goal = Math.min(J[k].max, Math.max(J[k].min, target[k]));
        const step = Math.min(J[k].vel, Math.max(-J[k].vel, (goal - actual[k]) / dt)) * dt;
        actual[k] += step;
      }
    },

    joints: J,
    get label() { return label; },
    targets: () => target,
    angles: () => actual,
    poses: () => poses(actual),
    /** Worst target→actual gap (rad) — the visible servo lag at high speed. */
    lag: () => Math.max(...target.map((t, k) => Math.abs(t - actual[k]))),

    factsHTML() {
      return `SO-100 / SO-ARM100 · 5 DOF + gripper · 6× STS3215 (1 rad/s cap) · ` +
        `joint table from the Apache-2.0 URDF · the QubeKit assembly ` +
        `(<code>examples/so100</code>) — FK over the connection graph, ` +
        `<b>targets stream like servo.set ops; the servos slew, they don't teleport</b>`;
    },
  };
}
