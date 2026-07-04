// SO-100 — 2D. Left: an axonometric skeleton of the arm (the FK joint chain,
// bones + joint hubs + gripper fingers) with a faint ghost of the TARGET pose,
// so servo lag is visible as the gap between ghost and solid. Right: the six
// joint channels as bar gauges — limit span, target tick, actual fill — the
// "servo dashboard" a controller sees.

import { poses, qrot } from './so100-model.js';

const JOINT_LABELS = ['pan', 'lift', 'elbow', 'wr.flex', 'wr.roll', 'jaw'];

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  let raf = 0, last = 0;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 880;
    const availH = Math.max(320, window.innerHeight * 0.58);
    const cssW = Math.min(availW, availH * 1.7), cssH = cssW / 1.7;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    // left pane: the skeleton; world metres → px. Arm spans ~0.55 m.
    const paneW = cv.width * 0.56;
    const scale = Math.min(paneW / 0.8, cv.height / 0.62);
    return { dpr, scale, paneW, ox: paneW * 0.5, oy: cv.height * 0.86 };
  }

  // axonometric projection: yaw the world a touch, then tip it — depth reads
  // without a full 3D view. X right, Y up on screen.
  const YAW = 0.6, TIP = 0.32;
  const proj = (p) => {
    const c = Math.cos(YAW), s = Math.sin(YAW);
    const x = p[0] * c - p[2] * s;
    const z = p[0] * s + p[2] * c;
    return [L.ox + x * L.scale, L.oy - (p[1] + z * Math.sin(TIP) * 0.4) * L.scale];
  };

  function bone(a, b, w, color) {
    const A = proj(a), B = proj(b);
    ctx.strokeStyle = color; ctx.lineWidth = w * L.dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function hub(p, r, color) {
    const A = proj(p);
    ctx.beginPath(); ctx.arc(A[0], A[1], r * L.dpr, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.fill();
  }

  // Draw one arm pose at explicit joint angles (FK is the exported pure fn):
  // chain of link origins (each child link origin IS its joint, URDF frames),
  // plus the two gripper fingers (both extend −Y in their local frames).
  function drawArm(theta, boneCol, hubCol, alpha) {
    ctx.globalAlpha = alpha;
    const P = poses(theta).links;
    const pts = P.map((l) => l.p);
    for (let i = 1; i < pts.length; i++) bone(pts[i - 1], pts[i], i === pts.length - 1 ? 3.5 : 6, boneCol);
    const g = P[5], j = P[6];
    bone(g.p, addv(g.p, qrot(g.q, [0, -0.085, 0])), 3.5, boneCol);
    bone(j.p, addv(j.p, qrot(j.q, [0, -0.085, 0])), 3.5, boneCol);
    for (let i = 1; i < pts.length; i++) hub(pts[i], 4.5, hubCol);
    ctx.globalAlpha = 1;
  }
  const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  function gauges() {
    const J = model.joints, t = model.targets(), a = model.angles();
    const x0 = L.paneW + 18 * L.dpr, w = cv.width - x0 - 16 * L.dpr;
    const rowH = cv.height / (J.length + 1.2);
    ctx.font = `${10.5 * L.dpr}px ui-monospace, monospace`;
    for (let k = 0; k < J.length; k++) {
      const y = rowH * (k + 0.8);
      const span = J[k].max - J[k].min;
      const px = (v) => x0 + ((v - J[k].min) / span) * w;
      ctx.fillStyle = '#9aa6bd'; ctx.textAlign = 'left';
      ctx.fillText(`${JOINT_LABELS[k]}`, x0, y - 7 * L.dpr);
      ctx.textAlign = 'right';
      ctx.fillText(`${a[k].toFixed(2)} rad`, x0 + w, y - 7 * L.dpr);
      ctx.textAlign = 'left';
      // limit track
      ctx.fillStyle = '#1c2433';
      ctx.fillRect(x0, y, w, 8 * L.dpr);
      // actual fill from the zero mark
      const z = px(Math.max(J[k].min, Math.min(J[k].max, 0)));
      const av = px(a[k]);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(Math.min(z, av), y, Math.abs(av - z) || 1, 8 * L.dpr);
      // target tick
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px(t[k]) - 1 * L.dpr, y - 2 * L.dpr, 2 * L.dpr, 12 * L.dpr);
    }
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`waypoint: ${model.label}   lag ${model.lag().toFixed(2)} rad`, x0, rowH * (J.length + 0.75));
  }

  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    model.advance(dt);

    ctx.clearRect(0, 0, cv.width, cv.height);
    // ground line under the base
    ctx.strokeStyle = '#232b3b'; ctx.lineWidth = 1.5 * L.dpr;
    ctx.beginPath();
    const g0 = proj([-0.35, 0, 0]), g1 = proj([0.35, 0, 0]);
    ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();

    drawArm(model.targets(), '#3a4256', '#3a4256', 0.55); // target ghost
    drawArm(model.angles(), '#e8b73a', '#e5e7eb', 1);     // actual pose
    gauges();
    raf = requestAnimationFrame(frame);
  }

  return {
    start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize() { L = layout(); },
    dispose() { this.stop(); },
  };
}
