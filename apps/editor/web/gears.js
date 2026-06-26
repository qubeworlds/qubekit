// Two physically-correct meshing gears, generated live by @qubekit/solver and
// animated at the exact gear ratio with correct tooth phasing. The solver's
// compiled ESM is shipped under ./solver/ and imported directly (browser-native
// modules, no bundler).

import { gear, canMesh } from './solver/index.js';

// Realistic toy/kit sizing: module 2 mm, 20° pressure angle (the default).
const A = gear({ teeth: 20, module: 2, flankSamples: 16 });
const B = gear({ teeth: 32, module: 2, flankSamples: 16 });
const mesh = canMesh(A, B);
const center = mesh.centerDistance; // mm — pitch circles tangent here

// Static phasing: rotate B so a tooth GAP faces A, letting A's tooth seat in it.
const gapStep = (2 * Math.PI) / B.z;
const k = Math.round(B.z / 2 - 0.5);
const phaseB = Math.PI - (k + 0.5) * gapStep;

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const facts = document.getElementById('facts');

facts.innerHTML =
  `m=${A.module} mm · z₁=${A.z} (r=${A.pitchRadius} mm) · z₂=${B.z} (r=${B.pitchRadius} mm) · ` +
  `centre=${center} mm · ratio=${mesh.gearRatio.toFixed(3)} · ε=${mesh.contactRatio.toFixed(2)} · ` +
  `<b>${mesh.ok ? 'valid mesh ✓' : 'INVALID'}</b>`;

// --- layout (mm → device px), retina-aware -------------------------------------
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = cv.clientWidth || 900;
  const cssH = Math.round(cssW * (520 / 900));
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  const totalMm = A.addendumRadius + center + B.addendumRadius;
  const margin = 16;
  const scale = (cv.width - margin * 2 * dpr) / totalMm;
  return {
    dpr, scale,
    ax: margin * dpr + A.addendumRadius * scale,
    bx: margin * dpr + (A.addendumRadius + center) * scale,
    cy: cv.height / 2,
  };
}
let L = layout();
window.addEventListener('resize', () => (L = layout()));

function tracePath(outline, cx, cy, rot, scale) {
  const c = Math.cos(rot), s = Math.sin(rot);
  ctx.beginPath();
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const px = cx + (x * c - y * s) * scale;
    const py = cy - (x * s + y * c) * scale; // flip Y for screen
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawGear(g, cx, rot, fill, stroke) {
  // pitch circle (dashed) — does not rotate
  ctx.setLineDash([5 * L.dpr, 4 * L.dpr]);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1 * L.dpr;
  ctx.beginPath();
  ctx.arc(cx, L.cy, g.pitchRadius * L.scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);

  tracePath(g.outline, cx, L.cy, rot, L.scale);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2 * L.dpr;
  ctx.stroke();

  // hub
  ctx.beginPath();
  ctx.arc(cx, L.cy, g.module * 1.5 * L.scale, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f1115';
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

let angleA = 0;
let running = true;
let last = 0;
const OMEGA = 0.6; // rad/s for gear A

function frame(t) {
  if (!last) last = t;
  const dt = (t - last) / 1000;
  last = t;
  if (running) angleA += OMEGA * dt;

  // B rolls without slip: opposite sign, scaled by z₁/z₂, plus the static phase.
  const angleB = phaseB - (A.z / B.z) * angleA;

  ctx.clearRect(0, 0, cv.width, cv.height);
  drawGear(B, L.bx, angleB, '#b08d57', '#e9d8b6'); // brass
  drawGear(A, L.ax, angleA, '#9ca3af', '#e5e7eb'); // steel

  // pitch point (where the pitch circles touch)
  ctx.beginPath();
  ctx.arc(L.ax + A.pitchRadius * L.scale, L.cy, 4 * L.dpr, 0, 2 * Math.PI);
  ctx.fillStyle = '#22c55e';
  ctx.fill();

  requestAnimationFrame(frame);
}

cv.addEventListener('pointerdown', () => {
  running = !running;
  last = 0;
});
requestAnimationFrame(frame);
