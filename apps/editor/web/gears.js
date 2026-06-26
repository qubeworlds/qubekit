// A four-gear train, generated and solved by @qubekit/solver. Each gear's tooth
// count + module come from the solver's involute geometry; the per-gear speeds,
// directions, and the lock check come from solveTrain(). The gears are phased so
// every consecutive pair actually meshes, then animated at their true ratios —
// so the whole chain rolls without slip.

import { gear, canMesh, solveTrain } from './solver/index.js';

const MODULE = 2; // mm — shared by all gears (the meshing invariant)
const TEETH = [20, 30, 18, 24];
// Placement direction (deg) of each gear from its predecessor — a gentle zigzag.
const DIRS_DEG = [-18, 30, -12];

const gears = TEETH.map((t) => gear({ teeth: t, module: MODULE, flankSamples: 16 }));
const meshes = [
  { a: 0, b: 1 },
  { a: 1, b: 2 },
  { a: 2, b: 3 },
];
const DRIVE_RPM = 60;
const train = solveTrain(gears, meshes, { gear: 0, rpm: DRIVE_RPM });

// --- geometry: walk the chain, placing each gear at its centre distance --------
const cx = [0], cy = [0];
const dirs = DIRS_DEG.map((d) => (d * Math.PI) / 180);
for (let i = 1; i < gears.length; i++) {
  const d = gears[i - 1].pitchRadius + gears[i].pitchRadius; // = m·(z_p+z_i)/2
  cx[i] = cx[i - 1] + d * Math.cos(dirs[i - 1]);
  cy[i] = cy[i - 1] + d * Math.sin(dirs[i - 1]);
}

// --- static phasing: seat a tooth of p into a gap of i at the line of centres --
// Condition (validated on the 2-gear case): ph_p(φ) + ph_i(φ+π) = n + ½, where
// ph_g(θ) = (θ − phase_g)·z_g / 2π counts teeth from g's tooth-0 to direction θ.
const phase = [0];
for (let i = 1; i < gears.length; i++) {
  const phi = dirs[i - 1];
  const phP = ((phi - phase[i - 1]) * gears[i - 1].z) / (2 * Math.PI);
  phase[i] = phi + Math.PI - (0.5 - phP) * ((2 * Math.PI) / gears[i].z);
}

// net end-to-end ratio + a couple of validated facts from the solver
const netRatio = train.rpm[gears.length - 1] / train.rpm[0];
const pairMesh = canMesh(gears[0], gears[1]); // ε etc. — same for every pair (equal module)

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const facts = document.getElementById('facts');

const arrow = (rpm) => (rpm > 0 ? '↺' : '↻');
facts.innerHTML =
  `m=${MODULE} mm · ` +
  gears.map((g, i) => `z${i + 1}=${g.z} ${train.rpm[i].toFixed(0)} rpm ${arrow(train.rpm[i])}`).join(' · ') +
  `<br>net ratio z₁:z₄ = ${gears[0].z}:${gears[gears.length - 1].z} = ${Math.abs(netRatio).toFixed(3)} · ` +
  `middle gears are idlers (set direction, not ratio) · ε=${pairMesh.contactRatio.toFixed(2)} · ` +
  `<b>${train.locked ? 'LOCKED' : 'not locked ✓'}</b>`;

// --- fit ----------------------------------------------------------------------
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = cv.clientWidth || 900;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  gears.forEach((g, i) => {
    minX = Math.min(minX, cx[i] - g.addendumRadius); maxX = Math.max(maxX, cx[i] + g.addendumRadius);
    minY = Math.min(minY, cy[i] - g.addendumRadius); maxY = Math.max(maxY, cy[i] + g.addendumRadius);
  });
  const mm = 14;
  const spanX = maxX - minX, spanY = maxY - minY;
  const cssH = Math.round(cssW * (spanY + mm * 2) / (spanX + mm * 2));
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  const scale = (cv.width - mm * 2 * dpr) / spanX;
  return { dpr, scale, ox: mm * dpr - minX * scale, oy: cv.height - (mm * dpr - minY * scale) };
}
let L = layout();
window.addEventListener('resize', () => (L = layout()));
const X = (x) => L.ox + x * L.scale;
const Y = (y) => L.oy - y * L.scale; // flip Y for screen

function tracePath(outline, gx, gy, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  ctx.beginPath();
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const px = X(gx + (x * c - y * s)), py = Y(gy + (x * s + y * c));
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const STEEL = ['#9ca3af', '#e5e7eb'];
const BRASS = ['#b08d57', '#e9d8b6'];

function drawGear(i, rot) {
  const g = gears[i], gx = cx[i], gy = cy[i];
  // pitch circle (does not rotate)
  ctx.setLineDash([5 * L.dpr, 4 * L.dpr]);
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 * L.dpr;
  ctx.beginPath(); ctx.arc(X(gx), Y(gy), g.pitchRadius * L.scale, 0, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);

  const [fill, stroke] = i % 2 === 0 ? STEEL : BRASS;
  tracePath(g.outline, gx, gy, rot);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * L.dpr; ctx.stroke();

  // hub + a spoke so rotation is visible
  ctx.beginPath();
  ctx.moveTo(X(gx), Y(gy));
  ctx.lineTo(X(gx + g.pitchRadius * 0.82 * Math.cos(rot)), Y(gy + g.pitchRadius * 0.82 * Math.sin(rot)));
  ctx.strokeStyle = stroke; ctx.lineWidth = 2 * L.dpr; ctx.stroke();
  ctx.beginPath(); ctx.arc(X(gx), Y(gy), g.module * 1.4 * L.scale, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f1115'; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * L.dpr; ctx.stroke();
}

function drawPitchPoints() {
  for (const m of meshes) {
    const dx = cx[m.b] - cx[m.a], dy = cy[m.b] - cy[m.a];
    const len = Math.hypot(dx, dy);
    const px = cx[m.a] + (dx / len) * gears[m.a].pitchRadius;
    const py = cy[m.a] + (dy / len) * gears[m.a].pitchRadius;
    ctx.beginPath(); ctx.arc(X(px), Y(py), 3.5 * L.dpr, 0, 2 * Math.PI);
    ctx.fillStyle = '#22c55e'; ctx.fill();
  }
}

let theta0 = 0, running = true, last = 0;
const OMEGA = (DRIVE_RPM / 60) * 2 * Math.PI * 0.06; // slow it down for viewing

function frame(t) {
  if (!last) last = t;
  const dt = (t - last) / 1000; last = t;
  if (running) theta0 += OMEGA * dt;

  ctx.clearRect(0, 0, cv.width, cv.height);
  // draw far-to-near is irrelevant (coplanar); draw all, then pitch points on top
  for (let i = 0; i < gears.length; i++) {
    const rot = phase[i] + (train.rpm[i] / train.rpm[0]) * theta0;
    drawGear(i, rot);
  }
  drawPitchPoints();
  requestAnimationFrame(frame);
}

cv.addEventListener('pointerdown', () => { running = !running; last = 0; });
requestAnimationFrame(frame);
