// Flyball governor — 2D front elevation. As the speed slider raises ω, the solver
// equilibrium swings the balls out and lifts the sleeve (the displayed angle eases
// toward the target so dragging feels smooth). A small ↻ indicator spins at ω to
// imply the spindle rotation a front elevation can't show.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { geo, params } = model;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 860;
    const availH = Math.max(260, window.innerHeight * 0.6); // leave room for header + facts
    const maxR = params.pivotRadius + params.armLength * Math.sin(params.thetaMax) + geo.ballR + 6;
    const mm = 12, spanX = maxR * 2, spanY = geo.yHub + 12;
    const aspect = (spanX + mm * 2) / (spanY + mm * 2);
    const cssW = Math.min(availW, availH * aspect), cssH = cssW / aspect;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; // fit the portrait view
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const scale = Math.min((cv.width - mm * 2 * dpr) / spanX, (cv.height - mm * 2 * dpr) / spanY);
    return { dpr, scale, cx: cv.width / 2, oy: cv.height - mm * dpr };
  }
  const X = (x) => L.cx + x * L.scale;
  const Y = (y) => L.oy - y * L.scale;

  function coil(x0, y0, y1, turns, w) {
    ctx.beginPath();
    const n = turns * 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = y0 + (y1 - y0) * t;
      ctx.lineTo(X(x0 + Math.sin(t * turns * 2 * Math.PI) * w), Y(y));
    }
    ctx.stroke();
  }

  let thetaDisp = model.state().theta, spin = 0, last = 0, raf = 0, running = false;

  function draw() {
    const th = thetaDisp;
    const pivR = params.pivotRadius, armL = params.armLength;
    const ballY = geo.yHub - armL * Math.cos(th);
    const ballX = pivR + armL * Math.sin(th);
    const sy = geo.sleeveRest + thetaToLift(th); // sleeve rises with the arm angle

    ctx.clearRect(0, 0, cv.width, cv.height);

    // base mount (a simple bearing block the spindle turns in)
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(X(-15), Y(geo.baseTop), 30 * L.scale, geo.baseTop * L.scale);
    ctx.strokeStyle = '#5b6b86'; ctx.lineWidth = 1.5 * L.dpr;
    ctx.strokeRect(X(-15), Y(geo.baseTop), 30 * L.scale, geo.baseTop * L.scale);

    // spindle
    ctx.strokeStyle = '#7f8ea3'; ctx.lineWidth = 3 * L.dpr;
    line(0, geo.baseTop, 0, geo.yHub);

    // spring around the spindle (compresses as the sleeve rises)
    ctx.strokeStyle = '#8aa0c0'; ctx.lineWidth = 1.6 * L.dpr;
    coil(0, sy + geo.sleeveH / 2, geo.springTop, 9, 6);

    // sleeve collar
    ctx.fillStyle = '#c9d2de';
    ctx.fillRect(X(-geo.sleeveW / 2), Y(sy + geo.sleeveH / 2), geo.sleeveW * L.scale, geo.sleeveH * L.scale);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1.2 * L.dpr;
    ctx.strokeRect(X(-geo.sleeveW / 2), Y(sy + geo.sleeveH / 2), geo.sleeveW * L.scale, geo.sleeveH * L.scale);

    // arms, links and balls (both sides)
    for (const sgn of [1, -1]) {
      const px = sgn * pivR, py = geo.yHub;
      const bx = sgn * ballX, by = ballY;
      // lower link: sleeve corner → mid-arm
      const lx = sgn * geo.sleeveW / 2, ly = sy + geo.sleeveH / 2;
      const mx = px + (bx - px) * 0.45, my = py + (by - py) * 0.45;
      ctx.strokeStyle = '#e2b07a'; ctx.lineWidth = 2.4 * L.dpr; ctx.lineCap = 'round';
      line(lx, ly, mx, my);
      // arm
      ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 3 * L.dpr;
      line(px, py, bx, by);
      ctx.lineCap = 'butt';
      // pivot pin
      circle(px, py, 2.4, '#0f1115', '#cbd5e1');
      // ball (brass)
      const g = ctx.createRadialGradient(X(bx) - 3, Y(by) - 3, 2, X(bx), Y(by), geo.ballR * L.scale);
      g.addColorStop(0, '#e9d8b6'); g.addColorStop(1, '#9c6f37');
      ctx.beginPath(); ctx.arc(X(bx), Y(by), geo.ballR * L.scale, 0, 2 * Math.PI);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#e9d8b6'; ctx.lineWidth = 1 * L.dpr; ctx.stroke();
    }

    // hub
    ctx.fillStyle = '#aeb6c2';
    ctx.fillRect(X(-pivR - 2), Y(geo.yHub + 3), (pivR * 2 + 4) * L.scale, 6 * L.scale);

    // spin indicator (top-down hint) — rotates at ω
    spinIndicator();
  }

  function thetaToLift(th) { return params.sleeveArm * Math.sin(th); }
  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke(); }
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(X(x), Y(y), r * L.scale, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1 * L.dpr; ctx.stroke();
  }
  function label(text, x, y, color) {
    ctx.fillStyle = color; ctx.font = `${10 * L.dpr}px ui-monospace, monospace`; ctx.textAlign = 'center';
    ctx.fillText(text, X(x), Y(y)); ctx.textAlign = 'start';
  }
  function spinIndicator() {
    const cxp = cv.width - 34 * L.dpr, cyp = 30 * L.dpr, r = 12 * L.dpr;
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 * L.dpr;
    ctx.beginPath(); ctx.arc(cxp, cyp, r, spin, spin + Math.PI * 1.5); ctx.stroke();
    const ex = cxp + r * Math.cos(spin + Math.PI * 1.5), ey = cyp + r * Math.sin(spin + Math.PI * 1.5);
    ctx.beginPath(); ctx.arc(ex, ey, 2.5 * L.dpr, 0, 2 * Math.PI); ctx.fillStyle = '#3b82f6'; ctx.fill();
  }

  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t;
    const target = model.state().theta;
    thetaDisp += (target - thetaDisp) * Math.min(1, dt * 6); // ease
    spin += model.omega * dt * 0.25;
    draw();
    raf = requestAnimationFrame(frame);
  }
  const onResize = () => { if (cv.clientWidth) { L = layout(); } };
  window.addEventListener('resize', onResize);
  return {
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { onResize(); },
    dispose() { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); },
  };
}
