// Drone — 2D top-down plan. The X frame with four shrouded rotors; each prop
// spins at ITS OWN slider RPM in its own direction (red = CW, blue = CCW), so you
// can SEE the counter-rotation and the speed imbalance that yaws the craft. Green
// marks the net lift (out of plane) and the resulting yaw. Four RPM sliders.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { geo, rotors, params } = model;
  const span = (params.armLength + geo.ductR) * 2 + 30;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 860;
    const availH = Math.max(280, window.innerHeight * 0.6);
    const side = Math.min(availW, availH);
    cv.style.width = side + 'px'; cv.style.height = side + 'px';
    cv.width = cv.height = Math.round(side * dpr);
    return { dpr, scale: cv.width / span, cx: cv.width / 2, cy: cv.height / 2 };
  }
  const X = (x) => L.cx + x * L.scale;
  const Y = (z) => L.cy - z * L.scale; // +z forward = up on screen

  function arrowArc(cx, cy, r, a0, a1, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w * L.dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, a1 < a0); ctx.stroke();
    const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
    const tan = a1 + (a1 > a0 ? Math.PI / 2 : -Math.PI / 2);
    const ah = 6 * L.dpr;
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex + ah * Math.cos(tan + 2.5), ey + ah * Math.sin(tan + 2.5));
    ctx.moveTo(ex, ey); ctx.lineTo(ex + ah * Math.cos(tan - 2.5), ey + ah * Math.sin(tan - 2.5));
    ctx.stroke(); ctx.lineCap = 'butt';
  }

  const spins = rotors.map(() => 0);
  let last = 0, raf = 0, running = false;

  function draw(w, sp) {
    ctx.clearRect(0, 0, cv.width, cv.height);

    // arms (X frame)
    ctx.strokeStyle = '#454d63'; ctx.lineWidth = 9 * L.dpr; ctx.lineCap = 'round';
    for (const r of rotors) { ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(r.x), Y(r.z)); ctx.stroke(); }
    ctx.lineCap = 'butt';

    // body
    ctx.fillStyle = '#d7dbe2'; ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1.5 * L.dpr;
    const bw = geo.bodyW * L.scale, bd = geo.bodyD * L.scale;
    roundRect(X(0) - bw / 2, Y(0) - bd / 2, bw, bd, 8 * L.dpr); ctx.fill(); ctx.stroke();

    // rotors
    rotors.forEach((r, i) => {
      const cx = X(r.x), cy = Y(r.z), rr = geo.ductR * L.scale;
      // duct
      ctx.strokeStyle = '#2b3142'; ctx.lineWidth = 8 * L.dpr;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = '#11151c'; ctx.lineWidth = 2 * L.dpr;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI); ctx.stroke();
      // spinning prop (two blades)
      const pr = geo.propR * L.scale, ang = spins[i];
      ctx.strokeStyle = r.spin === 1 ? '#7fb1ff' : '#ff8a8a'; ctx.lineWidth = 3.5 * L.dpr; ctx.lineCap = 'round';
      for (const k of [0, 1]) {
        const a = ang + k * Math.PI;
        ctx.beginPath(); ctx.moveTo(cx - pr * Math.cos(a) * 0.15, cy - pr * Math.sin(a) * 0.15);
        ctx.lineTo(cx + pr * Math.cos(a), cy + pr * Math.sin(a)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // direction arrow (red CW / blue CCW)
      const col = r.spin === 1 ? '#3b82f6' : '#ef4444';
      const a0 = r.spin === 1 ? -0.5 : 0.5, a1 = r.spin === 1 ? -2.4 : 2.4;
      arrowArc(cx, cy, rr + 7 * L.dpr, a0, a1, col, 2.4 * L.dpr);
      // hub
      ctx.fillStyle = '#1b1f29'; ctx.beginPath(); ctx.arc(cx, cy, 5 * L.dpr, 0, 2 * Math.PI); ctx.fill();
      // rpm readout (this rotor's slider value)
      ctx.fillStyle = '#8b93a8'; ctx.font = `${10 * L.dpr}px ui-monospace, monospace`; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(model.rpm(sp[i]))}`, cx, cy + rr + 16 * L.dpr);
    });
    ctx.textAlign = 'left';

    // collective (green, out of plane → central +) sized by total lift / weight
    const lift = w.thrust / w.weight;
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3 * L.dpr; ctx.lineCap = 'round';
    const gl = 22 * L.dpr * lift;
    ctx.beginPath(); ctx.moveTo(L.cx, L.cy + gl); ctx.lineTo(L.cx, L.cy - gl); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L.cx - 6 * L.dpr, L.cy - gl + 8 * L.dpr); ctx.lineTo(L.cx, L.cy - gl); ctx.lineTo(L.cx + 6 * L.dpr, L.cy - gl + 8 * L.dpr); ctx.stroke();
    ctx.lineCap = 'butt';
    // resulting yaw (green arc) — sign from net yaw torque; faded when balanced
    if (Math.abs(w.yaw) > 1e-4) {
      const yawSign = Math.sign(w.yaw);
      arrowArc(L.cx, L.cy, 34 * L.dpr, -yawSign * 0.6, -yawSign * 2.6, '#22c55e', 2.6 * L.dpr);
    }
  }

  function frame(ts) {
    if (!running) return;
    if (!last) last = ts;
    const dt = (ts - last) / 1000; last = ts;
    const w = model.wrench(), sp = model.speeds();
    rotors.forEach((r, i) => { spins[i] += r.spin * sp[i] * dt * 0.012; }); // scaled to be visible
    draw(w, sp);
    raf = requestAnimationFrame(frame);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
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
