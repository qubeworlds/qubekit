// Robot-arm model — wraps @qubekit/solver's analytic inverse kinematics. A
// scripted pick-and-place trajectory (lift the coloured shapes off the table,
// drop each into its matching sorter hole) is fed to armInverse() every frame:
// the base yaws to the target, the shoulder/elbow/wrist reach it exactly, the
// gripper opens and closes. The slider scales cycle speed. Lengths in mm, y up,
// the arm base at the origin facing +z.

import { armInverse } from './solver/index.js';

export function buildArm() {
  // small collaborative-arm proportions (mm) — reach ≈ 550 mm.
  const params = { baseHeight: 180, shoulderOffset: 20, upperArm: 240, forearm: 220, tool: 70 };

  // table-top shapes and the sorter holes they drop into (x right, z forward, y up).
  // Each shape's `top` is where the gripper grasps; the hole `drop` is on the sorter.
  const shapes = [
    { name: 'cube', color: '#e0453a', kind: 'box', size: 48, pos: [-150, 0, 300], hole: [300, 60, 360] },
    { name: 'cylinder', color: '#e8842b', kind: 'cyl', r: 26, h: 56, pos: [-40, 0, 350], hole: [300, 60, 300] },
    { name: 'pyramid', color: '#e8c33a', kind: 'cone', r: 34, h: 60, pos: [70, 0, 300], hole: [300, 60, 240] },
    { name: 'block', color: '#3aa64a', kind: 'box', size: 40, long: 92, pos: [175, 0, 330], hole: [360, 60, 300] },
  ];
  const sorter = { pos: [330, 0, 300], w: 150, h: 60, d: 180 };
  const approach = 120; // hover height above a pick/drop before descending (mm)
  const home = [60, 320, 250]; // a neutral tip pose between cycles

  // grasp height of a shape (gripper tip meets the top of the shape)
  const topOf = (s) => (s.kind === 'box' ? s.size : s.kind === 'cyl' ? s.h : s.h);

  // Build the waypoint list once: home → for each shape {over-pick, pick, close,
  // lift, over-drop, drop, release, lift} → home. grip 0=open 1=closed.
  const wps = [];
  const add = (pos, grip, carry, label) => wps.push({ pos, grip, carry, label });
  add(home, 0, -1, 'home');
  shapes.forEach((s, i) => {
    const top = [s.pos[0], topOf(s), s.pos[2]];
    const over = [s.pos[0], topOf(s) + approach, s.pos[2]];
    const hole = s.hole;
    const overHole = [hole[0], hole[1] + approach, hole[2]];
    add(over, 0, -1, `over ${s.name}`);
    add(top, 0, -1, `pick ${s.name}`);
    add(top, 1, i, `grip ${s.name}`);
    add(over, 1, i, `lift ${s.name}`);
    add(overHole, 1, i, `carry ${s.name}`);
    add(hole, 1, i, `place ${s.name}`);
    add(hole, 0, -1, `release ${s.name}`);
    add(overHole, 0, -1, `clear ${s.name}`);
  });
  add(home, 0, -1, 'home');

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const ease = (t) => t * t * (3 - 2 * t); // smoothstep — gentle accel/decel per leg

  let speed = 1; // slider: cycle-speed scale (×)

  // Pose at a normalized phase in [0,1) over the whole cycle. Returns the solved
  // arm pose plus the gripper state and which shape (if any) is being carried.
  function poseAt(phase) {
    const segs = wps.length - 1;
    const u = ((phase % 1) + 1) % 1 * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const f = ease(u - i);
    const a = wps[i], b = wps[i + 1];
    const target = lerp3(a.pos, b.pos, f);
    const grip = lerp(a.grip, b.grip, f);
    const carry = f < 0.5 ? a.carry : b.carry; // the held shape switches at the waypoint
    return { pose: armInverse(params, target), grip, carry, target, label: a.label };
  }

  return {
    kind: 'arm',
    params, shapes, sorter, home,
    control: 'slider',
    sliderConfig: { label: 'Speed', min: 0, max: 2, step: 0.1, unit: '×', param: 'speed' },
    get sliderValue() { return speed; },
    get speed() { return speed; },
    setSlider(v) { speed = Math.max(0, Math.min(2, v)); },
    poseAt,
    factsHTML() {
      const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;
      const inner = Math.abs(params.upperArm - params.forearm);
      return `6-axis arm · links ${params.upperArm}+${params.forearm}+${params.tool} mm · ` +
        `reach ${reach} mm (dead zone r&lt;${inner} mm) · ` +
        `analytic 2-link IK, top-down grasp · ` +
        `<b>pick &amp; place — ${shapes.length} shapes → sorter</b>`;
    },
  };
}
