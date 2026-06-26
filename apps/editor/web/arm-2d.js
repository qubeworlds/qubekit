// Robot arm — 2D. Left: a side elevation in the arm's working plane (radial r on
// X, height y on Y) showing the solved linkage, the gripper, and the items. Right
// (inset): a true top-view of the sorter — every hole is the item's footprint
// grown by exactly the clearance, with the item's own outline drawn inside it, so
// the "fits 1 mm wider" relationship is visible at a glance.

const CYCLE_SECONDS = 20;

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { params, items, sorter, clearance } = model;
  const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 880;
    const availH = Math.max(300, window.innerHeight * 0.6);
    const mm = 16, spanX = reach + 120, spanY = params.baseHeight + params.upperArm + params.forearm + 70;
    const aspect = (spanX + mm * 2) / (spanY + mm * 2);
    const cssW = Math.min(availW, availH * aspect), cssH = cssW / aspect;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const scale = Math.min((cv.width - mm * 2 * dpr) / spanX, (cv.height - mm * 2 * dpr) / spanY);
    return { dpr, scale, ox: mm * dpr, oy: cv.height - mm * dpr };
  }
  const X = (r) => L.ox + r * L.scale;
  const Y = (y) => L.oy - y * L.scale;
  const radial = (p) => Math.hypot(p[0], p[2]);

  function capsule(ax, ay, bx, by, w, fill) {
    ctx.strokeStyle = fill; ctx.lineCap = 'round'; ctx.lineWidth = w * L.dpr;
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx), Y(by)); ctx.stroke(); ctx.lineCap = 'butt';
  }
  function dot(r, y, rad, fill, stroke) {
    ctx.beginPath(); ctx.arc(X(r), Y(y), rad * L.dpr, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4 * L.dpr; ctx.stroke(); }
  }
  // side-elevation icon of an item at radial r, sitting on baseY, by footprint kind
  function itemIcon(r, baseY, it, color) {
    const H = it.height, f = it.foot;
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1 * L.dpr;
    if (f.kind === 'tri') {
      ctx.beginPath(); ctx.moveTo(X(r - f.w / 2), Y(baseY)); ctx.lineTo(X(r), Y(baseY + H)); ctx.lineTo(X(r + f.w / 2), Y(baseY)); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      const half = (f.kind === 'circle' ? f.r : f.w / 2);
      ctx.fillRect(X(r - half), Y(baseY + H), half * 2 * L.scale, H * L.scale);
      ctx.strokeRect(X(r - half), Y(baseY + H), half * 2 * L.scale, H * L.scale);
    }
  }
  function label(text, x, y, color, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${11 * L.dpr}px ui-monospace, monospace`; ctx.textAlign = align;
    ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }

  // --- top-view sorter inset: holes (footprint + clearance) with item outlines ---
  function footPath(P, ox, oz, fp) {
    ctx.beginPath();
    if (fp.circle) ctx.arc(P.x(ox), P.z(oz), fp.r * P.s, 0, 2 * Math.PI);
    else fp.pts.forEach((pt, i) => { const A = P.x(ox + pt[0]), B = P.z(oz + pt[1]); i ? ctx.lineTo(A, B) : ctx.moveTo(A, B); });
    ctx.closePath();
  }
  function drawInset(carry, placed) {
    const pad = 10 * L.dpr, w = Math.min(cv.width * 0.4, (sorter.w + 30) * L.scale * 1.1);
    const s = (w - pad * 2) / (sorter.w + 24);
    const h = (sorter.d + 24) * s + pad * 2;
    const x0 = cv.width - w - 8 * L.dpr, y0 = 8 * L.dpr;
    const cx = x0 + w / 2, cz = y0 + h / 2;
    const P = { s, x: (x) => cx + x * s, z: (z) => cz + z * s };
    // panel
    ctx.fillStyle = 'rgba(20,25,34,.92)'; ctx.strokeStyle = '#2a3344'; ctx.lineWidth = 1 * L.dpr;
    ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h);
    // plate outline
    ctx.strokeStyle = '#5b6376'; ctx.lineWidth = 1.5 * L.dpr;
    ctx.strokeRect(P.x(-sorter.w / 2), P.z(-sorter.d / 2), sorter.w * s, sorter.d * s);
    label('sorter — top view  (holes +' + clearance + ' mm)', x0 + 6 * L.dpr, y0 + 13 * L.dpr, '#8b93a8');
    items.forEach((it, i) => {
      const [hx, hz] = it.holeLocal;
      // hole = footprint + clearance (dashed teal)
      ctx.setLineDash([4 * L.dpr, 3 * L.dpr]); ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 1.4 * L.dpr;
      footPath(P, hx, hz, model.footPoly(it.foot, clearance)); ctx.stroke(); ctx.setLineDash([]);
      // item footprint: solid once dropped in (placed), faint while still on the table
      footPath(P, hx, hz, model.footPoly(it.foot, 0));
      if (placed[i] || i === carry) { ctx.fillStyle = it.color; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1 * L.dpr; ctx.stroke(); }
      else { ctx.fillStyle = it.color + '33'; ctx.fill(); ctx.strokeStyle = it.color + '88'; ctx.lineWidth = 1 * L.dpr; ctx.stroke(); }
    });
  }

  let phase = 0, last = 0, raf = 0, running = false;

  function draw() {
    const { pose, grip, carry, label: leg } = model.poseAt(phase);
    const pts = pose.points;
    ctx.clearRect(0, 0, cv.width, cv.height);

    // table + reach hint
    ctx.strokeStyle = '#39435a'; ctx.lineWidth = 2 * L.dpr;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(reach + 90), Y(0)); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,121,168,.22)'; ctx.setLineDash([4 * L.dpr, 5 * L.dpr]);
    ctx.beginPath(); ctx.arc(X(0), Y(params.baseHeight), reach * L.scale, -Math.PI / 2, 0); ctx.stroke(); ctx.setLineDash([]);

    // sorter (side elevation, walls)
    const sr = radial(sorter.pos);
    ctx.fillStyle = '#3a4154'; ctx.strokeStyle = '#5b6376'; ctx.lineWidth = 1.2 * L.dpr;
    ctx.fillRect(X(sr - sorter.w / 2), Y(sorter.h), sorter.w * L.scale, sorter.h * L.scale);
    ctx.strokeRect(X(sr - sorter.w / 2), Y(sorter.h), sorter.w * L.scale, sorter.h * L.scale);

    // items: carried one rides the gripper; placed ones stay seated in their
    // holes (in the box); the rest sit on the table.
    const placed = model.placedMask(phase);
    items.forEach((it, i) => {
      if (i === carry) return;
      if (placed[i]) itemIcon(radial(it.perch), it.perchBaseY, it, it.color);
      else itemIcon(radial(it.pos), 0, it, it.color);
    });

    // riser + base column
    capsule(0, 0, 0, 26, 20, '#3a4154');
    capsule(params.shoulderOffset * 0.5, 26, params.shoulderOffset, params.baseHeight, 16, '#cdd3df');

    // arm links (side elevation), printed look
    const r = pts.map(radial), h = pts.map((p) => p[1]);
    capsule(r[1], h[1], r[2], h[2], 14, '#dfe3ec'); // upper arm
    capsule(r[2], h[2], r[3], h[3], 12, '#d3d9e4'); // forearm
    capsule(r[3], h[3], r[4], h[4], 8, '#aeb6c6');  // tool
    dot(params.shoulderOffset, params.baseHeight, 8, '#303644', '#2dd4bf');
    dot(r[2], h[2], 7, '#303644', '#2dd4bf'); // elbow
    dot(r[3], h[3], 5.5, '#303644', '#2dd4bf'); // wrist

    // gripper (two fingers across); closes onto the held item's width (stopgap
    // until jolt does real contact) so it doesn't clip inside the object
    const carriedHalf = carry >= 0 ? model.footHalf(items[carry].foot) : 12;
    const open = carriedHalf + 4 + (1 - grip) * 18, tipR = r[4], tipY = h[4], fl = 26;
    capsule(tipR - open, tipY + fl, tipR - open, tipY, 4, '#e2e8f4');
    capsule(tipR + open, tipY + fl, tipR + open, tipY, 4, '#e2e8f4');
    capsule(tipR - open, tipY + fl, tipR + open, tipY + fl, 4, '#e2e8f4');

    // carried item rides in the gripper
    if (carry >= 0) itemIcon(tipR, Math.max(0, tipY - items[carry].height), items[carry], items[carry].color);

    // readouts + inset
    const deg = (x) => (x * 180 / Math.PI).toFixed(0);
    label(`yaw ${deg(pose.yaw)}°  shoulder ${deg(pose.joints.shoulder)}°  elbow ${deg(pose.joints.elbow)}°`, 12 * L.dpr, 18 * L.dpr, '#9aa6bd');
    label(leg, 12 * L.dpr, 34 * L.dpr, pose.reachable ? '#34d399' : '#f87171');
    drawInset(carry, placed);
  }

  function frame(t) {
    if (!running) return;
    if (!last) last = t; const dt = (t - last) / 1000; last = t;
    phase += (dt * model.speed) / CYCLE_SECONDS;
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
