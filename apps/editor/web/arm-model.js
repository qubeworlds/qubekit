// Robot-arm model — wraps @qubekit/solver's analytic inverse kinematics and owns
// the shape-sorter geometry. A scripted pick-and-place trajectory (lift each
// table item, drop it into its matching sorter hole) is fed to armInverse() every
// frame. Lengths in mm, y up, the arm base at the origin facing +z.
//
// Single source of truth for shapes: every item carries a 2D FOOTPRINT (its
// top-down silhouette). That one definition drives (a) the extruded 3D mesh,
// (b) the sorter hole — the SAME footprint grown by CLEARANCE so it fits exactly
// 1 mm wider all round, and (c) the 2D icon. Change the footprint, everything
// follows.

import { armInverse } from './solver/index.js';

export const CLEARANCE = 1; // mm gap per side — holes are the footprint + 1 mm all round

// A footprint is one of: {kind:'circle', r} | {kind:'rect', w, d} | {kind:'tri', w, d}.
// `footPoly(foot, grow)` returns a drawable/extrudable outline grown by `grow` mm:
//   { circle:true, r }              — a circle
//   { circle:false, pts:[[x,z]…] }  — a closed polygon in the plan (x,z) plane
// Growth is an exact uniform edge offset: rect adds to the half-extents, the
// triangle scales about its incentre (so every edge moves out by exactly `grow`).
export function footPoly(foot, grow = 0) {
  if (foot.kind === 'circle') return { circle: true, r: foot.r + grow };
  if (foot.kind === 'rect') {
    const w = foot.w / 2 + grow, d = foot.d / 2 + grow;
    return { circle: false, pts: [[-w, -d], [w, -d], [w, d], [-w, d]] };
  }
  // triangle: apex toward −z (front), base at +z
  const w = foot.w / 2, d = foot.d / 2;
  const pts = [[0, -d], [w, d], [-w, d]];
  if (!grow) return { circle: false, pts };
  // incentre + inradius for an exact uniform offset
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const A = pts[0], B = pts[1], C = pts[2];
  const a = len(B, C), b = len(C, A), c = len(A, B), per = a + b + c;
  const ix = (a * A[0] + b * B[0] + c * C[0]) / per, iz = (a * A[1] + b * B[1] + c * C[1]) / per;
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
  const inradius = (2 * area) / per;
  const k = 1 + grow / inradius;
  return { circle: false, pts: pts.map(([x, z]) => [ix + (x - ix) * k, iz + (z - iz) * k]) };
}

// half-width of a footprint in the radial direction (for 2D layout / spacing)
export function footHalf(foot) {
  if (foot.kind === 'circle') return foot.r;
  return foot.w / 2;
}

export function buildArm() {
  // small collaborative-arm proportions (mm) — reach ≈ 640 mm.
  const params = { baseHeight: 200, shoulderOffset: 30, upperArm: 250, forearm: 230, tool: 80 };

  // sorter block: a body with a top plate the holes are cut through.
  const sorter = { pos: [290, 0, 285], w: 215, h: 64, d: 165, plate: 16 };

  // table items + their hole position on the sorter top (local x,z from centre).
  const items = [
    { name: 'cube', color: '#e0453a', height: 50, foot: { kind: 'rect', w: 50, d: 50 }, pos: [-170, 0, 300], holeLocal: [-58, -42] },
    { name: 'cylinder', color: '#e8842b', height: 58, foot: { kind: 'circle', r: 27 }, pos: [-60, 0, 350], holeLocal: [58, -42] },
    { name: 'wedge', color: '#e8c33a', height: 48, foot: { kind: 'tri', w: 62, d: 56 }, pos: [55, 0, 300], holeLocal: [-58, 46] },
    { name: 'block', color: '#3aa64a', height: 42, foot: { kind: 'rect', w: 98, d: 42 }, pos: [-395, 0, 165], holeLocal: [54, 46] },
  ];
  // resolve each item's drop point (world) on the sorter top
  for (const it of items) it.hole = [sorter.pos[0] + it.holeLocal[0], sorter.h, sorter.pos[2] + it.holeLocal[1]];

  // The arm stands at the middle of the near table edge (origin), facing +z, so
  // its half-disc workspace (radius = reach) covers both far corners. The table
  // is the reachable footprint in front. tableBounds is also the jolt fence: an
  // item whose centre leaves these bounds (or drops below y=0) has fallen off.
  const reachR = params.shoulderOffset + params.upperArm + params.forearm + params.tool;
  const tableBounds = { xMin: -reachR * 0.82, xMax: reachR * 0.82, zMin: -40, zMax: reachR * 0.82 };

  const approach = 130; // hover height above a pick/drop before descending (mm)
  const home = [70, 340, 250];

  // Where a placed item rests, seated in its hole (mesh base at this y), and the
  // gripper-tip height that leaves it exactly there (carried base = tip − height),
  // so release has no visual pop. Items perch proud of the plate so all four read
  // as "sorted" during the end-of-episode pause.
  for (const s of items) {
    s.perchBaseY = sorter.h - 0.35 * s.height;
    s.placeTipY = s.perchBaseY + s.height; // = sorter.h + 0.65·height
    s.perch = [s.hole[0], s.perchBaseY, s.hole[2]];
  }

  // Waypoints: home → for each item {over-pick, pick, close, lift, over-drop,
  // place (seat in the hole), release, lift} → a HOLD while all four sit sorted →
  // home. grip 0=open 1=closed. The hold is the "pause when all 4 are placed";
  // the phase wrapping back to 0 is the reset (items return to the table).
  const wps = [];
  const add = (pos, grip, carry, label) => wps.push({ pos, grip, carry, label });
  add(home, 0, -1, 'home');
  items.forEach((s, i) => {
    const top = [s.pos[0], s.height, s.pos[2]];
    const over = [s.pos[0], s.height + approach, s.pos[2]];
    const place = [s.hole[0], s.placeTipY, s.hole[2]];
    const overHole = [s.hole[0], s.placeTipY + approach, s.hole[2]];
    add(over, 0, -1, `over ${s.name}`);
    add(top, 0, -1, `pick ${s.name}`);
    add(top, 1, i, `grip ${s.name}`);
    add(over, 1, i, `lift ${s.name}`);
    add(overHole, 1, i, `carry ${s.name}`);
    add(place, 1, i, `place ${s.name}`);
    add(place, 0, -1, `release ${s.name}`);
    add(overHole, 0, -1, `clear ${s.name}`);
  });
  // pause: arm parks at home with all four sorted (repeated waypoints = dwell)
  for (let k = 0; k < 6; k++) add(home, 0, -1, 'all placed — pause');

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const ease = (t) => t * t * (3 - 2 * t);

  let speed = 1;

  function poseAt(phase) {
    const segs = wps.length - 1;
    const u = (((phase % 1) + 1) % 1) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const f = ease(u - i);
    const a = wps[i], b = wps[i + 1];
    const target = lerp3(a.pos, b.pos, f);
    const grip = lerp(a.grip, b.grip, f);
    const carry = f < 0.5 ? a.carry : b.carry;
    return { pose: armInverse(params, target), grip, carry, target, label: a.label };
  }

  // An episode = one pass of the trajectory: pick and place all items, then home.
  // phase wraps at 1.0, which IS the reset — items return to the table and the run
  // restarts. (When jolt drives the sim, two events force this reset early: every
  // item delivered into the box, or any item leaving tableBounds / dropping below
  // the table. offTable() is that fence; the scripted path never trips it, but the
  // contract is in place for the physics swap.)
  const offTable = (p) => p[1] < 0 || p[0] < tableBounds.xMin || p[0] > tableBounds.xMax || p[2] < tableBounds.zMin || p[2] > tableBounds.zMax;
  // An item counts as "in the box" from the segment it reaches its hole (the
  // `place` waypoint), NOT from `release`: in the place→release segment the
  // carried index flips to −1 at the halfway point, so keying off `release`
  // leaves a half-segment where the item is neither carried nor placed and it
  // flashes back to its table rest spot. The gripper sits exactly at the perch
  // then, so flipping at `place` is seamless (carry branch still wins until the
  // gripper opens).
  const placeSeg = items.map((it) => wps.findIndex((w) => w.label === `place ${it.name}`));
  function placedMask(phase) {
    const segs = wps.length - 1, idx = Math.floor((((phase % 1) + 1) % 1) * segs);
    return placeSeg.map((seg) => seg >= 0 && idx >= seg);
  }

  return {
    kind: 'arm',
    params, items, sorter, home, clearance: CLEARANCE, tableBounds,
    offTable, placedMask,
    control: 'slider',
    sliderConfig: { label: 'Speed', min: 0, max: 2, step: 0.1, unit: '×', param: 'speed' },
    get sliderValue() { return speed; },
    get speed() { return speed; },
    setSlider(v) { speed = Math.max(0, Math.min(2, v)); },
    poseAt, footPoly, footHalf,
    factsHTML() {
      const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;
      const inner = Math.abs(params.upperArm - params.forearm);
      return `6-axis arm · links ${params.upperArm}+${params.forearm}+${params.tool} mm · ` +
        `reach ${reach} mm (dead zone r&lt;${inner} mm) · analytic 2-link IK · ` +
        `<b>pick &amp; place — ${items.length} shapes, holes +${CLEARANCE} mm clearance</b>`;
    },
  };
}
