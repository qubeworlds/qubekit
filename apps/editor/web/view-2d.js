// 2D schematic view — the analytical read on the train (pitch circles, tooth
// engagement, direction). Draws the shared model on a <canvas>.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { gears, cx, cy, meshes } = model;
  const STEEL = ['#9ca3af', '#e5e7eb'];
  const BRASS = ['#b08d57', '#e9d8b6'];

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cv.clientWidth || 900;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    gears.forEach((g, i) => {
      minX = Math.min(minX, cx[i] - g.addendumRadius); maxX = Math.max(maxX, cx[i] + g.addendumRadius);
      minY = Math.min(minY, cy[i] - g.addendumRadius); maxY = Math.max(maxY, cy[i] + g.addendumRadius);
    });
    const mm = 14, spanX = maxX - minX, spanY = maxY - minY;
    const cssH = Math.round(cssW * (spanY + mm * 2) / (spanX + mm * 2));
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const scale = (cv.width - mm * 2 * dpr) / spanX;
    return { dpr, scale, ox: mm * dpr - minX * scale, oy: cv.height - (mm * dpr - minY * scale) };
  }
  const X = (x) => L.ox + x * L.scale;
  const Y = (y) => L.oy - y * L.scale;

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
  function drawGear(i, rot) {
    const g = gears[i], gx = cx[i], gy = cy[i];
    ctx.setLineDash([5 * L.dpr, 4 * L.dpr]);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 * L.dpr;
    ctx.beginPath(); ctx.arc(X(gx), Y(gy), g.pitchRadius * L.scale, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    const [fill, stroke] = i % 2 === 0 ? STEEL : BRASS;
    tracePath(g.outline, gx, gy, rot); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * L.dpr; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(gx), Y(gy));
    ctx.lineTo(X(gx + g.pitchRadius * 0.82 * Math.cos(rot)), Y(gy + g.pitchRadius * 0.82 * Math.sin(rot)));
    ctx.strokeStyle = stroke; ctx.lineWidth = 2 * L.dpr; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(gx), Y(gy), g.module * 1.4 * L.scale, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f1115'; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * L.dpr; ctx.stroke();
  }
  function drawPitchPoints() {
    for (const m of meshes) {
      const dx = cx[m.b] - cx[m.a], dy = cy[m.b] - cy[m.a], len = Math.hypot(dx, dy);
      const px = cx[m.a] + (dx / len) * gears[m.a].pitchRadius;
      const py = cy[m.a] + (dy / len) * gears[m.a].pitchRadius;
      ctx.beginPath(); ctx.arc(X(px), Y(py), 3.5 * L.dpr, 0, 2 * Math.PI); ctx.fillStyle = '#22c55e'; ctx.fill();
    }
  }

  let theta0 = 0, last = 0, raf = 0, running = false;
  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t; theta0 += model.omega * dt;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < gears.length; i++) drawGear(i, model.angleAt(i, theta0));
    drawPitchPoints();
    raf = requestAnimationFrame(frame);
  }
  return {
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { if (cv.clientWidth) L = layout(); },
  };
}
