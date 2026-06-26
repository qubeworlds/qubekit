// Flyball governor — 2D front elevation (bell-crank type, balls above the
// pivots, matching the brass model). The speed slider drives the solver
// equilibrium: balls swing out, the collar rises, the spring compresses. The
// bevel pair at the base makes the vertical→horizontal (belt) turn.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { geo, params } = model;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 860;
    const availH = Math.max(260, window.innerHeight * 0.6);
    const maxR = params.pivotRadius + params.armLength * Math.sin(params.thetaMax) + geo.ballR + 6;
    const mm = 12, spanX = maxR * 2, spanY = geo.yPivot + params.armLength + geo.ballR + 6;
    const aspect = (spanX + mm * 2) / (spanY + mm * 2);
    const cssW = Math.min(availW, availH * aspect), cssH = cssW / aspect;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const scale = Math.min((cv.width - mm * 2 * dpr) / spanX, (cv.height - mm * 2 * dpr) / spanY);
    return { dpr, scale, cx: cv.width / 2, oy: cv.height - mm * dpr };
  }
  const X = (x) => L.cx + x * L.scale;
  const Y = (y) => L.oy - y * L.scale;

  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke(); }
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(X(x), Y(y), r * L.scale, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1 * L.dpr; ctx.stroke();
  }
  function label(text, x, y, color) {
    ctx.fillStyle = color; ctx.font = `${10 * L.dpr}px ui-monospace, monospace`; ctx.textAlign = 'center';
    ctx.fillText(text, X(x), Y(y)); ctx.textAlign = 'start';
  }
  function coil(x0, y0, y1, turns, w) {
    ctx.beginPath();
    const n = turns * 12;
    for (let i = 0; i <= n; i++) { const t = i / n, y = y0 + (y1 - y0) * t; ctx.lineTo(X(x0 + Math.sin(t * turns * 2 * Math.PI) * w), Y(y)); }
    ctx.stroke();
  }
  function fillTri(a, b, c, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.lineTo(X(c[0]), Y(c[1])); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * L.dpr; ctx.stroke();
  }
  function bevelTeeth(apex, heel, n, len, color) {
    const dx = heel[0] - apex[0], dy = heel[1] - apex[1], d = Math.hypot(dx, dy);
    const nx = -dy / d, ny = dx / d;
    ctx.strokeStyle = color; ctx.lineWidth = 1 * L.dpr;
    for (let i = 1; i <= n; i++) {
      const t = 0.5 + 0.5 * (i / n), x = apex[0] + dx * t, y = apex[1] + dy * t;
      ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + nx * len), Y(y + ny * len)); ctx.stroke();
    }
  }
  // bevel-gear right-angle drive: vertical spindle gear ↔ horizontal belt gear
  function drawBevelDrive() {
    const g1 = model.bevel.coneAngle1, ay = 12, slant = 16;
    const Rh = slant * Math.sin(g1), hy = ay + slant * Math.cos(g1);
    fillTri([0, ay], [-Rh, hy], [Rh, hy], '#9ca3af', '#e5e7eb');
    bevelTeeth([0, ay], [-Rh, hy], 5, 2, '#e5e7eb'); bevelTeeth([0, ay], [Rh, hy], 5, 2, '#e5e7eb');
    fillTri([0, ay], [Rh, ay + Rh], [Rh, ay - Rh], '#b88a4e', '#e9d8b6');
    bevelTeeth([0, ay], [Rh, ay - Rh], 5, -2, '#e9d8b6');
    const sx = Rh, px = sx + 20, py = ay;
    ctx.strokeStyle = '#7f8ea3'; ctx.lineWidth = 3 * L.dpr; line(sx, py, px, py);
    circle(px, py, 6.5, '#3a4253', '#9aa6b8');
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.6 * L.dpr; line(px, py, px + 5.5 * Math.cos(spin), py + 5.5 * Math.sin(spin));
    ctx.strokeStyle = '#454d5e'; ctx.lineWidth = 2.6 * L.dpr;
    ctx.setLineDash([5 * L.dpr, 4 * L.dpr]); ctx.lineDashOffset = -spin * 16 * L.dpr;
    line(px, py + 6.5, px + 28, py + 6.5); line(px, py - 6.5, px + 28, py - 6.5);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#6b7484'; ctx.lineWidth = 1 * L.dpr;
    ctx.beginPath(); ctx.arc(X(0), Y(ay), 8 * L.scale, -Math.PI / 2, 0); ctx.stroke();
    label('90°', 7, ay + 7, '#6b7484');
  }
  function spinIndicator() {
    const cxp = cv.width - 34 * L.dpr, cyp = 30 * L.dpr, r = 12 * L.dpr;
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 * L.dpr;
    ctx.beginPath(); ctx.arc(cxp, cyp, r, spin, spin + Math.PI * 1.5); ctx.stroke();
    const ex = cxp + r * Math.cos(spin + Math.PI * 1.5), ey = cyp + r * Math.sin(spin + Math.PI * 1.5);
    ctx.beginPath(); ctx.arc(ex, ey, 2.5 * L.dpr, 0, 2 * Math.PI); ctx.fillStyle = '#3b82f6'; ctx.fill();
  }

  const lift = (th) => params.sleeveArm * Math.sin(th);
  let thetaDisp = model.state().theta, spin = 0, last = 0, raf = 0, running = false;

  function draw() {
    const th = thetaDisp;
    const pivR = params.pivotRadius, armL = params.armLength;
    const ballX = pivR + armL * Math.sin(th);
    const ballY = geo.yPivot + armL * Math.cos(th); // balls ABOVE the pivots
    const sy = geo.sleeveRest + lift(th); // collar rises with speed

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawBevelDrive();

    // spindle + top cap
    ctx.strokeStyle = '#7f8ea3'; ctx.lineWidth = 3 * L.dpr; line(0, geo.baseTop, 0, geo.spindleTop);
    ctx.fillStyle = '#aeb6c2'; ctx.fillRect(X(-pivR - 2), Y(geo.spindleTop + 3), (pivR * 2 + 4) * L.scale, 6 * L.scale);

    // central spring (collar → top seat), compresses as the collar rises
    ctx.strokeStyle = '#8aa0c0'; ctx.lineWidth = 1.6 * L.dpr; coil(0, sy + geo.sleeveH / 2, geo.springTop, 9, 6);

    // collar / sleeve
    ctx.fillStyle = '#c9d2de'; ctx.fillRect(X(-geo.sleeveW / 2), Y(sy + geo.sleeveH / 2), geo.sleeveW * L.scale, geo.sleeveH * L.scale);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1.2 * L.dpr; ctx.strokeRect(X(-geo.sleeveW / 2), Y(sy + geo.sleeveH / 2), geo.sleeveW * L.scale, geo.sleeveH * L.scale);

    // pivot spider hub
    ctx.fillStyle = '#aeb6c2'; ctx.fillRect(X(-pivR - 2), Y(geo.yPivot + 3), (pivR * 2 + 4) * L.scale, 6 * L.scale);

    for (const sgn of [1, -1]) {
      const px = sgn * pivR, py = geo.yPivot, bx = sgn * ballX, by = ballY;
      // bell-crank link: collar corner → inner point on the (rising) ball arm
      const ix = px + (bx - px) * 0.28, iy = py + (by - py) * 0.28;
      ctx.strokeStyle = '#e2b07a'; ctx.lineWidth = 2.4 * L.dpr; ctx.lineCap = 'round';
      line(sgn * geo.sleeveW / 2, sy + geo.sleeveH / 2, ix, iy);
      // ball arm (pivot → ball, rising outward)
      ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 3 * L.dpr; line(px, py, bx, by);
      ctx.lineCap = 'butt';
      circle(px, py, 2.4, '#0f1115', '#cbd5e1'); // pivot pin
      // ball (brass)
      const g = ctx.createRadialGradient(X(bx) - 3, Y(by) - 3, 2, X(bx), Y(by), geo.ballR * L.scale);
      g.addColorStop(0, '#e9d8b6'); g.addColorStop(1, '#9c6f37');
      ctx.beginPath(); ctx.arc(X(bx), Y(by), geo.ballR * L.scale, 0, 2 * Math.PI);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#e9d8b6'; ctx.lineWidth = 1 * L.dpr; ctx.stroke();
    }

    spinIndicator();
  }

  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t;
    thetaDisp += (model.state().theta - thetaDisp) * Math.min(1, dt * 6); // ease
    spin += model.omega * dt; // true spindle/shaft rate
    draw();
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
