// 2D schematic view — the analytical read: pitch circles, tooth engagement,
// the steam-engine linkage, and (when locked) the jammed bridge gear.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { gears, cx, cy, meshes, steam, bridge } = model;
  const STEEL = ['#9ca3af', '#e5e7eb'];
  const BRASS = ['#b08d57', '#e9d8b6'];

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cv.clientWidth || 900;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const inc = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
    gears.forEach((g, i) => { inc(cx[i] - g.addendumRadius, cy[i] - g.addendumRadius); inc(cx[i] + g.addendumRadius, cy[i] + g.addendumRadius); });
    inc(steam.axisX - steam.boreHalf, steam.cylTop + 3); inc(steam.axisX + steam.boreHalf, steam.params.center[1]); // steam extent
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
    ctx.setLineDash([5 * L.dpr, 4 * L.dpr]); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 * L.dpr;
    ctx.beginPath(); ctx.arc(X(gx), Y(gy), g.pitchRadius * L.scale, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    const locked = model.locked && i === bridge;
    const [fill, stroke] = locked ? ['#7f1d1d', '#f87171'] : i % 2 === 0 ? STEEL : BRASS;
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
      const px = cx[m.a] + (dx / len) * gears[m.a].pitchRadius, py = cy[m.a] + (dy / len) * gears[m.a].pitchRadius;
      const conflict = model.locked && (m.b === bridge || m.a === bridge);
      ctx.beginPath(); ctx.arc(X(px), Y(py), 3.5 * L.dpr, 0, 2 * Math.PI);
      ctx.fillStyle = conflict ? '#f87171' : '#22c55e'; ctx.fill();
    }
  }
  function drawSteam(theta0) {
    const s = model.steamAt(theta0);
    const ax = steam.axisX, bore = steam.boreHalf;
    // cylinder (open-bottom tube): walls + top cap, faint fill
    ctx.fillStyle = 'rgba(120,140,170,0.10)';
    ctx.fillRect(X(ax - bore), Y(steam.cylTop), bore * 2 * L.scale, (steam.cylTop - steam.cylBot) * L.scale);
    ctx.strokeStyle = '#5b6b86'; ctx.lineWidth = 2 * L.dpr;
    ctx.beginPath();
    ctx.moveTo(X(ax - bore), Y(steam.cylBot)); ctx.lineTo(X(ax - bore), Y(steam.cylTop));
    ctx.lineTo(X(ax + bore), Y(steam.cylTop)); ctx.lineTo(X(ax + bore), Y(steam.cylBot));
    ctx.stroke();
    // piston
    const ph = steam.pistonHalf;
    ctx.fillStyle = '#c9d2de';
    ctx.fillRect(X(ax - bore + 1), Y(s.piston[1] + ph), (bore * 2 - 2) * L.scale, ph * 2 * L.scale);
    // connecting rod (piston pin → crank pin)
    ctx.strokeStyle = '#e2b07a'; ctx.lineWidth = 3 * L.dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(s.piston[0]), Y(s.piston[1] - ph)); ctx.lineTo(X(s.crankPin[0]), Y(s.crankPin[1])); ctx.stroke();
    // crank throw (wheel centre → pin) + pins
    ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 2.5 * L.dpr;
    ctx.beginPath(); ctx.moveTo(X(cx[0]), Y(cy[0])); ctx.lineTo(X(s.crankPin[0]), Y(s.crankPin[1])); ctx.stroke();
    ctx.lineCap = 'butt';
    for (const pt of [s.crankPin, [s.piston[0], s.piston[1] - ph]]) {
      ctx.beginPath(); ctx.arc(X(pt[0]), Y(pt[1]), 2.6 * L.dpr, 0, 2 * Math.PI); ctx.fillStyle = '#0f1115'; ctx.fill();
      ctx.strokeStyle = '#e2b07a'; ctx.lineWidth = 1.5 * L.dpr; ctx.stroke();
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
    drawSteam(theta0);
    raf = requestAnimationFrame(frame);
  }
  const onResize = () => { if (cv.clientWidth) L = layout(); };
  window.addEventListener('resize', onResize);
  return {
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { onResize(); },
    dispose() { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); },
  };
}
