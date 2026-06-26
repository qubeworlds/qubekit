// Robot arm — 2D side elevation in the arm's working plane (radial distance r on
// X, height y on Y). The solver's IK gives the joint polyline; this draws the
// links, joints, and the two-finger gripper, plus the table, the shapes at their
// radial positions, and the sorter. Yaw (azimuth) is a readout — the elevation is
// "unrolled" so the articulation reads cleanly. The slider scales cycle speed.

const CYCLE_SECONDS = 18;

export function init2D(model, cv) {
  const ctx = cv.getContext('2d');
  const { params, shapes, sorter } = model;
  const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;

  let L = layout();
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = (cv.parentElement && cv.parentElement.clientWidth) || 860;
    const availH = Math.max(280, window.innerHeight * 0.6);
    const mm = 16, spanX = reach + 120, spanY = params.baseHeight + params.upperArm + params.forearm + 60;
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
    const x0 = X(ax), y0 = Y(ay), x1 = X(bx), y1 = Y(by);
    ctx.strokeStyle = fill; ctx.lineCap = 'round'; ctx.lineWidth = w * L.dpr;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function dot(r, y, rad, fill, stroke) {
    ctx.beginPath(); ctx.arc(X(r), Y(y), rad * L.dpr, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4 * L.dpr; ctx.stroke(); }
  }
  function shapeIcon(r, baseY, s, color) {
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1 * L.dpr;
    if (s.kind === 'cone') {
      ctx.beginPath(); ctx.moveTo(X(r - s.r), Y(baseY)); ctx.lineTo(X(r), Y(baseY + s.h)); ctx.lineTo(X(r + s.r), Y(baseY)); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (s.kind === 'cyl') {
      const w = s.r * 2; ctx.fillRect(X(r - s.r), Y(baseY + s.h), w * L.scale, s.h * L.scale);
      ctx.strokeRect(X(r - s.r), Y(baseY + s.h), w * L.scale, s.h * L.scale);
    } else {
      const half = (s.long ? s.long : s.size) / 2, h = s.size;
      ctx.fillRect(X(r - half), Y(baseY + h), half * 2 * L.scale, h * L.scale);
      ctx.strokeRect(X(r - half), Y(baseY + h), half * 2 * L.scale, h * L.scale);
    }
  }
  function label(text, x, y, color, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${11 * L.dpr}px ui-monospace, monospace`; ctx.textAlign = align;
    ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }

  let phase = 0, last = 0, raf = 0, running = false;

  function draw() {
    const { pose, grip, carry, target, label: leg } = model.poseAt(phase);
    const pts = pose.points; // [base, shoulder, elbow, wrist, tip] in world

    ctx.clearRect(0, 0, cv.width, cv.height);

    // table + reach hint
    ctx.strokeStyle = '#39435a'; ctx.lineWidth = 2 * L.dpr;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(reach + 90), Y(0)); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,121,168,.25)'; ctx.setLineDash([4 * L.dpr, 5 * L.dpr]);
    ctx.beginPath(); ctx.arc(X(0), Y(params.baseHeight), reach * L.scale, -Math.PI / 2, 0); ctx.stroke();
    ctx.setLineDash([]);

    // sorter block (drawn at its radial distance)
    const sr = radial(sorter.pos);
    ctx.fillStyle = '#5b6172'; ctx.strokeStyle = '#7a8194'; ctx.lineWidth = 1.2 * L.dpr;
    ctx.fillRect(X(sr - sorter.w / 2), Y(sorter.h), sorter.w * L.scale, sorter.h * L.scale);
    ctx.strokeRect(X(sr - sorter.w / 2), Y(sorter.h), sorter.w * L.scale, sorter.h * L.scale);

    // resting shapes (skip the carried one)
    shapes.forEach((s, i) => { if (i !== carry) shapeIcon(radial(s.pos), 0, s, s.color); });

    // base column
    capsule(0, 0, 0, params.baseHeight, 16, '#48506a');
    dot(0, params.baseHeight, 6, '#2b3142', '#8b93a8');

    // arm links: upper arm, forearm, tool
    const r = pts.map(radial), h = pts.map((p) => p[1]);
    capsule(r[1], h[1], r[2], h[2], 13, '#aeb6c6'); // upper arm
    capsule(r[2], h[2], r[3], h[3], 11, '#c3cad8'); // forearm
    capsule(r[3], h[3], r[4], h[4], 8, '#8b93a8'); // tool/wrist
    dot(r[1], h[1], 7, '#5a6178', '#cbd5e1'); // shoulder
    dot(r[2], h[2], 6, '#5a6178', '#cbd5e1'); // elbow
    dot(r[3], h[3], 5, '#5a6178', '#cbd5e1'); // wrist

    // two-finger gripper at the tip (opens with grip 0, closes with 1)
    const open = (1 - grip) * 22 + 6; // finger half-spread (mm)
    const tipR = r[4], tipY = h[4], fingerLen = 26;
    capsule(tipR - open, tipY + fingerLen, tipR - open, tipY, 4, '#e2e8f4');
    capsule(tipR + open, tipY + fingerLen, tipR + open, tipY, 4, '#e2e8f4');
    capsule(tipR - open, tipY + fingerLen, tipR + open, tipY + fingerLen, 4, '#e2e8f4');

    // carried shape rides between the fingers
    if (carry >= 0) {
      const s = shapes[carry];
      const baseY = tipY - (s.kind === 'box' ? s.size : s.h);
      shapeIcon(tipR, Math.max(0, baseY), s, s.color);
    }

    // readouts
    const deg = (x) => (x * 180 / Math.PI).toFixed(0);
    label(`yaw ${deg(pose.yaw)}°  ·  shoulder ${deg(pose.joints.shoulder)}°  elbow ${deg(pose.joints.elbow)}°`, 12 * L.dpr, 18 * L.dpr, '#9aa6bd');
    label(leg, cv.width - 12 * L.dpr, 18 * L.dpr, pose.reachable ? '#34d399' : '#f87171', 'right');
  }

  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t;
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
