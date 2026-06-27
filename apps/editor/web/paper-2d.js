// Paper / Fabric — 2D side-profile schematic. A cross-section of the sheet: the
// back edge is pinned (left), the front handle (right) peels up as Lift rises,
// uncovering the objects resting on the table. The 3D tab is the real Quine
// soft-body simulation; this is the explanatory cartoon of the same motion.

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 860;
    const w = availW, h = Math.max(260, Math.min(availW * 0.5, window.innerHeight * 0.5));
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    return { dpr, w: cv.width, h: cv.height };
  }

  // Objects on the table (side view): [x0..1 along the table, width, height, color, round].
  const OBJS = [
    { x: 0.20, w: 0.13, h: 0.30, c: '#d6a847', round: true },  // gear
    { x: 0.46, w: 0.16, h: 0.16, c: '#4581db', round: false }, // beam
    { x: 0.50, w: 0.07, h: 0.30, c: '#e66b4d', round: false }, // beam upright
    { x: 0.72, w: 0.18, h: 0.30, c: '#73c780', round: true },  // knob
  ];

  let running = false, raf = 0;

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function draw() {
    const { w, h, dpr } = L;
    ctx.clearRect(0, 0, w, h);
    const mx = 0.07 * w, mr = 0.93 * w;            // left/right margins
    const tableY = h * 0.82, span = mr - mx;
    const f = model.liftFraction;
    const fabric = model.mode === 'fabric';

    // table
    ctx.fillStyle = '#2a2017';
    ctx.fillRect(0, tableY, w, h - tableY);
    ctx.strokeStyle = '#3d2f22'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(0, tableY); ctx.lineTo(w, tableY); ctx.stroke();

    // objects on the table
    const PX = (u) => mx + u * span;
    const objTopY = (o) => tableY - o.h * span * 0.5;
    for (const o of OBJS) {
      const ox = PX(o.x), ow = o.w * span, oh = o.h * span * 0.5;
      ctx.fillStyle = o.c;
      if (o.round) { ctx.beginPath(); ctx.ellipse(ox, tableY - oh * 0.5, ow * 0.6, oh * 0.6, 0, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.fillRect(ox - ow / 2, tableY - oh, ow, oh); }
    }

    // sheet top edge: pinned at left (draped near the objects), lifting an
    // ever-wider right region as Lift rises. Fabric sags lower between supports.
    const anchorY = tableY - 0.10 * span;
    const maxLift = 0.62 * span;
    const liftSpan = 0.28 + 0.66 * f;              // peeled region widens with lift
    const N = 64;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const t = (u - (1 - liftSpan)) / liftSpan;   // 0 at peel start → 1 at handle
      let y = anchorY - maxLift * f * smooth(t);
      // drape sag between the covered objects (deeper for fabric), fading where lifted
      const sag = (fabric ? 0.05 : 0.02) * span * Math.sin(u * Math.PI) * (1 - smooth(t));
      y += sag;
      pts.push([PX(u), y]);
    }

    // fill the sheet body (down to the table) so covered objects read as "under".
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(PX(1), tableY); ctx.lineTo(PX(0), tableY); ctx.closePath();
    const col = model.clothParams().color;
    const rgb = `${(col[0] * 255) | 0}, ${(col[1] * 255) | 0}, ${(col[2] * 255) | 0}`;
    ctx.fillStyle = `rgba(${rgb}, 0.82)`;
    ctx.fill();

    // sheet top edge stroke
    ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 3 * dpr; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();

    // pinned-edge marker (left)
    ctx.fillStyle = '#9aa3b5';
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 5 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.font = `${11 * dpr}px ui-monospace, monospace`; ctx.fillStyle = '#8b93a8'; ctx.textAlign = 'left';
    ctx.fillText('pinned', pts[0][0] + 8 * dpr, pts[0][1] - 8 * dpr);

    // handle marker (right) with a lift arrow
    const hp = pts[N];
    ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.arc(hp[0], hp[1], 6 * dpr, 0, 2 * Math.PI); ctx.fill();
    if (f > 0.02) {
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.5 * dpr; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hp[0], hp[1] + 10 * dpr); ctx.lineTo(hp[0], hp[1] - 18 * dpr);
      ctx.moveTo(hp[0] - 6 * dpr, hp[1] - 10 * dpr); ctx.lineTo(hp[0], hp[1] - 18 * dpr);
      ctx.lineTo(hp[0] + 6 * dpr, hp[1] - 10 * dpr); ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.textAlign = 'right';
    ctx.fillText('handle', hp[0] - 10 * dpr, hp[1] - 6 * dpr);

    // title
    ctx.textAlign = 'left'; ctx.fillStyle = '#cbd5e1'; ctx.font = `${13 * dpr}px ui-monospace, monospace`;
    ctx.fillText(`${model.modeLabel} · lift ${model.sliderValue}%`, mx, h * 0.10);
  }

  function frame() { if (!running) return; draw(); raf = requestAnimationFrame(frame); }
  const onResize = () => { if (cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth)) L = layout(); };
  window.addEventListener('resize', onResize);

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { onResize(); },
    dispose() { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); },
  };
}
