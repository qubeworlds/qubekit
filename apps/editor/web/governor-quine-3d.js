// Quine-engine 3D view for the flyball governor — the same mechanism the 2D
// schematic draws (governor-2d.js), now rendered by the real **Quine** wasm
// engine instead of the retired vendored Three.js view. Mirrors how the drone
// (quine-3d.js) and the paper/fabric sheet (paper-quine-3d.js) moved onto Quine.
//
// Authority split (same shape as the drone):
//   • host (this file) — owns the spindle SPIN PHASE (integrated from the
//     solver's ω) and the eased arm angle θ (the solver equilibrium), and feeds
//     both into the engine as input axes every frame.
//   • skill (in-engine) — a kinematic placer: from (φ, θ) it positions every
//     moving part each tick. The whole assembly is a set of ROOT entities the
//     skill drives in world space (a parented child's world transform is
//     overwritten by the scene-graph each tick, so — exactly like the drone's
//     prop hubs — the animated parts are roots and the skill bakes the spin
//     rotation Ry(φ) into their poses itself).
//
// The mechanism (what the 2D shows, now in 3D):
//   • two balls HANG from a top ring on slender arms (the "metal strings"); the
//     arms pivot on the ring and swing OUT + up as the balls fly out;
//   • a lower rigid link from each arm pulls a sliding collar (the second ring)
//     UP the spindle — the collar height is DERIVED from the rigid link so the
//     rod length never stretches (a real flyball linkage, not an ad-hoc lift);
//   • the rising collar compresses a helical spring against a fixed top seat
//     (the spring is a stack of rings the skill bunches together — there is no
//     scale setter in the skill, so compression is repositioning, not scaling);
//   • a bevel-style right-angle drive at the BOTTOM: a spur gear on the spindle
//     (fully exposed below the spindle — no tube runs over it) meshes a gear on
//     a horizontal belt shaft, and BOTH visibly turn. The steam valve the collar
//     would close is not shown (as in 2D).
//
// Shares the SINGLE engine module with the drone / paper views (one WebGL
// context) via the exported bootEngine.

import { bootEngine } from './quine-3d.js';

// --- geometry (engine units; QubeKit mm /100, the scale the drone view uses) --
// Everything below is metres-in-the-engine. Kept in one object so the scene
// builder and the skill (which re-derives the linkage every tick) agree exactly.
const G = {
  pivR: 0.25,      // pivot radius — where an arm hangs off the top ring
  armLen: 0.55,    // arm (the "string") length, pivot → ball centre
  ballR: 0.10,     // ball radius
  yPivot: 1.00,    // top ring height (the ring the arms hang from)
  cornerY: 0.07,   // where the two bevel cones meet (apex-to-apex), on the axis
  bevelLen: 0.15,  // bevel pitch-cone height == base radius → a 45° miter cone,
                   // so the vertical + horizontal gears sit at a true 90°
  spindleTop: 1.06,
  spindleBot: 0.22, // = cornerY + bevelLen: the spindle rises FROM the top of the
                    // vertical bevel gear and never runs down over it (the bug)
  seatY: 0.90,     // fixed upper spring seat
  springMinor: 0.02,
  springR: 0.075,  // spring coil radius (the rings + the winding wire-seam sit here)
  springCoils: 7,  // spring drawn as this many rings the skill bunches/spreads
  collarH: 0.12,   // collar (sliding sleeve) height
  collarOuter: 0.11,
  rc: 0.10,        // collar pin radius — where a link pins to the collar
  rodAttach: 0.22, // distance along the arm where the lower link pins
  rodLen: 0.40,    // lower-link length (RIGID — collar height derives from it)
};

const steel = (c = [0.72, 0.75, 0.80]) => ({ color: [...c, 1], metallic: 0.9, roughness: 0.38 });
const brass = () => ({ color: [0.72, 0.54, 0.31, 1], metallic: 0.92, roughness: 0.36 });
const bronze = () => ({ color: [0.80, 0.50, 0.20, 1], metallic: 0.88, roughness: 0.32 });
const dark = () => ({ color: [0.11, 0.12, 0.15, 1], metallic: 0.4, roughness: 0.5 });
const springMat = () => ({ color: [0.62, 0.70, 0.82, 1], metallic: 0.85, roughness: 0.4 });

// Resting collar height (θ=0) from the rigid-link equation — the scene authors
// the collar + spring at rest; the skill drives them once it runs.
function collarHeight(th) {
  const gap = G.pivR + G.rodAttach * Math.sin(th) - G.rc;
  return (G.yPivot - G.rodAttach * Math.cos(th)) - Math.sqrt(Math.max(0, G.rodLen * G.rodLen - gap * gap));
}

function buildGovernorScene() {
  const ents = [];
  const E = (o) => ents.push(o);
  const cy = G.cornerY, bl = G.bevelLen, pulleyX = 0.50;
  const h0 = collarHeight(0);

  // base pedestal (static, doesn't spin) — grounds the spindle + belt shaft.
  E({ name: 'base', geometry: { kind: 'cylinder', radius: 0.42, height: 0.04 },
    transform: { position: [0, -0.02, 0] }, material: dark() });

  // spindle — STARTS above the bottom gear so no tube ever runs over the gear.
  // A faceted (octagonal) shaft, not a smooth cylinder, so the VERTICAL AXIS is
  // plainly seen to turn (the skill spins it): the turning vertical axis is what
  // flings the balls up.
  E({ name: 'spindle', geometry: { kind: 'prism', radius: 0.034, height: G.spindleTop - G.spindleBot, sides: 8 },
    transform: { position: [0, (G.spindleTop + G.spindleBot) / 2, 0] }, material: steel() });
  // the top ring the arms hang from + a spindle cap
  E({ name: 'topring', geometry: { kind: 'torus', majorRadius: G.pivR, minorRadius: 0.022, majorSegments: 40, minorSegments: 14 },
    transform: { position: [0, G.yPivot, 0] }, material: steel([0.66, 0.70, 0.76]) });
  // rotating crosshead (spider) keyed to the spindle top — the two arms pivot on
  // its ends, so it turns WITH the vertical axis. A spinning bar (unlike the
  // symmetric ring/shaft) makes that rotation unmistakable.
  E({ name: 'spider', geometry: { kind: 'box', half: [G.pivR + 0.02, 0.02, 0.022] },
    transform: { position: [0, G.yPivot, 0] }, material: steel([0.80, 0.83, 0.88]) });
  E({ name: 'hubcap', geometry: { kind: 'cylinder', radius: 0.06, height: 0.03 },
    transform: { position: [0, G.spindleTop, 0] }, material: steel() });
  // fixed upper spring seat
  E({ name: 'seat', geometry: { kind: 'torus', majorRadius: 0.10, minorRadius: 0.022, majorSegments: 32, minorSegments: 12 },
    transform: { position: [0, G.seatY, 0] }, material: steel([0.66, 0.70, 0.76]) });

  // --- bottom bevel right-angle drive ----------------------------------------
  // A real miter pair: two 45° pitch CONES meeting apex-to-apex at the corner
  // (their axes the spindle's +Y and the belt shaft's +X — a true 90°), each
  // capped by a thin toothed disc that carries the visible teeth and the spin.
  // The cones (rotationally symmetric) stay put; the skill turns the discs.
  // vertical cone on the spindle: apex DOWN at the corner, base (radius=bl) up.
  E({ name: 'vcone', geometry: { kind: 'cylinder', bottomRadius: 0, topRadius: bl, height: bl },
    transform: { position: [0, cy + bl / 2, 0] }, material: brass() });
  E({ name: 'vgear', geometry: { kind: 'gear', module: 2 * bl / 18, teeth: 18, thickness: 0.025, boreRadius: 0.03 },
    transform: { position: [0, cy + bl, 0] }, material: brass() });
  // horizontal cone on the belt shaft: tip the +Y axis to +X (rotation.z = -π/2)
  // so its apex points back at the corner; the disc carries the teeth + spin.
  E({ name: 'hcone', geometry: { kind: 'cylinder', bottomRadius: 0, topRadius: bl, height: bl },
    transform: { position: [bl / 2, cy, 0], rotation: [0, 0, -Math.PI / 2] }, material: brass() });
  E({ name: 'hgear', geometry: { kind: 'gear', module: 2 * bl / 16, teeth: 16, thickness: 0.025, boreRadius: 0.025 },
    transform: { position: [bl, cy, 0], rotation: [0, 0, -Math.PI / 2] }, material: brass() });
  E({ name: 'shaft', geometry: { kind: 'cylinder', radius: 0.02, height: pulleyX - bl },
    transform: { position: [(bl + pulleyX) / 2, cy, 0], rotation: [0, 0, -Math.PI / 2] }, material: bronze() });
  E({ name: 'pulley', geometry: { kind: 'cylinder', radius: 0.075, height: 0.05 },
    transform: { position: [pulleyX, cy, 0], rotation: [0, 0, -Math.PI / 2] }, material: steel([0.42, 0.47, 0.55]) });
  // a peg on the pulley rim the skill orbits — shows the belt shaft turning.
  E({ name: 'peg', geometry: { kind: 'box', half: [0.012, 0.03, 0.012] },
    transform: { position: [pulleyX, cy + 0.075, 0] }, material: brass() });

  // --- sliding collar (the second ring) + the spring it compresses ------------
  E({ name: 'collar', geometry: { kind: 'tube', innerRadius: 0.05, outerRadius: G.collarOuter, height: G.collarH },
    transform: { position: [0, h0, 0] }, material: steel([0.80, 0.83, 0.88]) });
  const collarTop0 = h0 + G.collarH / 2, seatBot = G.seatY - G.springMinor;
  for (let k = 0; k < G.springCoils; k++) {
    const yk = collarTop0 + (seatBot - collarTop0) * ((k + 0.5) / G.springCoils);
    E({ name: 'spring' + k, geometry: { kind: 'torus', majorRadius: G.springR, minorRadius: G.springMinor, majorSegments: 28, minorSegments: 10 },
      transform: { position: [0, yk, 0] }, material: springMat() });
    // a wire-seam bead on each coil at one azimuth — the skill carries the seam
    // AROUND with the spin, so the coil visibly winds (a symmetric ring can't show
    // the rotation; this seam makes the turning vertical axis read in the middle).
    E({ name: 'seam' + k, geometry: { kind: 'sphere', radius: G.springMinor * 1.7, rings: 8, segments: 10 },
      transform: { position: [G.springR, yk, 0] }, material: brass() });
  }

  // --- arms (the "strings"), balls, and the lower links -----------------------
  // All roots: the skill computes each one's world pose from (φ, θ) every tick.
  for (let i = 0; i < 2; i++) {
    E({ name: 'arm' + i, geometry: { kind: 'cylinder', radius: 0.012, height: G.armLen },
      transform: { position: [(i ? -1 : 1) * (G.pivR + 0) / 2, 0.7, 0] }, material: steel([0.62, 0.67, 0.74]) });
    E({ name: 'ball' + i, geometry: { kind: 'sphere', radius: G.ballR, rings: 24, segments: 32 },
      transform: { position: [(i ? -1 : 1) * G.pivR, G.yPivot - G.armLen, 0] }, material: brass() });
    E({ name: 'link' + i, geometry: { kind: 'cylinder', radius: 0.012, height: G.rodLen },
      transform: { position: [(i ? -1 : 1) * 0.17, 0.62, 0] }, material: bronze() });
  }

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.4, -1.0, -0.5], intensity: 1.15, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.20, 0.33, 0.55], horizon: [0.60, 0.66, 0.72] }, ambient: { intensity: 0.62 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.55, 0], distance: 2.8, yaw: 0.7, pitch: 0.32 } } });
  // fixedHz 64: step the sim at 64 Hz (above 60) and interpolate transforms to
  // the display refresh, so the fast-spinning gears render as smoothly as the
  // panel allows (and at full rate on 120 Hz iPads). The renderer's quaternion
  // blend takes the short path, so the spindle's 2π phase-wrap doesn't flash.
  // NOTE: this can't beat the wagon-wheel illusion on a 60 Hz panel — that's a
  // function of the *display* rate (a browser can't render past it); the real
  // cure for the "belt gear runs backward at high rpm" is fewer teeth / a slower
  // gear (see hgear/vgear), not a higher sim rate.
  return { schemaVersion: 1, name: 'governor', gravity: [0, -9.81, 0], fixedHz: 64, interpolate: true, entities: ents };
}

// In-engine kinematic placer. Reads φ (axis 0, spindle spin phase) and θ (axis 1,
// eased arm angle) and poses every moving part. Constants are baked from `G` so
// the linkage it re-derives matches the scene the host authored. Rotation
// helpers (rx/ry/rz/mul/zyx) are the same ones the drone skill uses to turn a
// world-space basis into the ZYX Euler the Transform takes.
function buildSkill() {
  const N = G.springCoils;
  const seatBot = G.seatY - G.springMinor;
  return `
var PIVR=${G.pivR}, ARM=${G.armLen}, YP=${G.yPivot}, AAT=${G.rodAttach},
    RC=${G.rc}, LROD=${G.rodLen}, CH=${G.collarH}, SEATBOT=${seatBot}, N=${N},
    CY=${G.cornerY}, PULX=0.50, SPRINGR=${G.springR};
function cl(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function rx(a){var c=Math.cos(a),s=Math.sin(a);return [[1,0,0],[0,c,-s],[0,s,c]];}
function ry(a){var c=Math.cos(a),s=Math.sin(a);return [[c,0,s],[0,1,0],[-s,0,c]];}
function rz(a){var c=Math.cos(a),s=Math.sin(a);return [[c,-s,0],[s,c,0],[0,0,1]];}
function mul(P,Q){var R=[[0,0,0],[0,0,0],[0,0,0]];for(var i=0;i<3;i++)for(var j=0;j<3;j++){var s=0;for(var k=0;k<3;k++)s+=P[i][k]*Q[k][j];R[i][j]=s;}return R;}
function zyx(R){var y=Math.asin(cl(-R[2][0],-1,1));return {x:Math.atan2(R[2][1],R[2][2]),y:y,z:Math.atan2(R[1][0],R[0][0])};}

onPreStep(function (dt) {
  var phi = input(2), th = input(1); // axis 2 = spin phase (axis 0 is clamped to [-1,1])
  var cphi = Math.cos(phi), sphi = Math.sin(phi), sth = Math.sin(th), cth = Math.cos(th);

  // bottom drive: spin the spindle gear about Y, the belt gear about its (tipped
  // to +X) axis, and orbit the pulley peg so the take-off shaft visibly turns.
  var vg = world.get('vgear'); if (vg) vg.transform.rotation = { x: 0, y: phi, z: 0 };
  var hg = world.get('hgear'); if (hg) hg.transform.rotation = zyx(mul(rx(-phi), rz(-Math.PI / 2)));
  var pg = world.get('peg'); if (pg) {
    pg.transform.position = { x: PULX, y: CY + 0.075 * Math.cos(-phi), z: 0.075 * Math.sin(-phi) };
    pg.transform.rotation = { x: -phi, y: 0, z: 0 };
  }

  // the vertical axis turns: spin the faceted spindle + the crosshead the arms
  // pivot on. This is the rotation (driven up from the right-hand shaft) whose
  // centrifugal force flings the balls out.
  var sp = world.get('spindle'); if (sp) sp.transform.rotation = { x: 0, y: phi, z: 0 };
  var sd = world.get('spider'); if (sd) sd.transform.rotation = { x: 0, y: phi, z: 0 };

  // collar height from the RIGID lower link (rod length never stretches).
  var gap = PIVR + AAT * sth - RC;
  var hh = (YP - AAT * cth) - Math.sqrt(Math.max(0, LROD * LROD - gap * gap));
  var col = world.get('collar'); if (col) col.transform.position = { x: 0, y: hh, z: 0 };

  // spring: bunch the rings between the (rising) collar top and the fixed seat,
  // and carry each coil's wire-seam bead AROUND with the spin so the coil winds.
  var collarTop = hh + CH / 2;
  for (var k = 0; k < N; k++) {
    var yk = collarTop + (SEATBOT - collarTop) * ((k + 0.5) / N);
    var r = world.get('spring' + k); if (r) r.transform.position = { x: 0, y: yk, z: 0 };
    var sm = world.get('seam' + k); if (sm) sm.transform.position = { x: SPRINGR * cphi, y: yk, z: -SPRINGR * sphi };
  }

  // arms (strings), balls, links — one mirrored pair. Everything is computed in
  // the radial/vertical plane then carried to its azimuth by Ry(φ).
  for (var i = 0; i < 2; i++) {
    var s = i === 0 ? 1 : -1;
    var Px = s * PIVR, Py = YP;                     // pivot on the ring
    var radb = PIVR + ARM * sth, yb = YP - ARM * cth;
    var Bx = s * radb, By = yb;                     // ball centre
    var Ax = s * (PIVR + AAT * sth), Ay = YP - AAT * cth; // link pin on the arm
    var Cx = s * RC, Cy = hh;                       // link pin on the collar

    var arm = world.get('arm' + i);
    if (arm) {
      arm.transform.position = { x: (Px + Bx) / 2 * cphi, y: (Py + By) / 2, z: -(Px + Bx) / 2 * sphi };
      var al = Math.atan2(-s * sth, -cth);          // arm tilt in the local plane
      arm.transform.rotation = zyx(mul(ry(phi), rz(al)));
    }
    var ball = world.get('ball' + i);
    if (ball) ball.transform.position = { x: Bx * cphi, y: By, z: -Bx * sphi };
    var link = world.get('link' + i);
    if (link) {
      link.transform.position = { x: (Ax + Cx) / 2 * cphi, y: (Ay + Cy) / 2, z: -(Ax + Cx) / 2 * sphi };
      var bl = Math.atan2(-s * (PIVR + AAT * sth - RC), (YP - AAT * cth - hh));
      link.transform.rotation = zyx(mul(ry(phi), rz(bl)));
    }
  }
});
`;
}

// (Re)load the governor scene + skill. Re-enqueued on every start because a
// sibling Quine view (drone / cloth) may have replaced the engine's single skill
// slot — this keeps the governor placer authoritative while this view is active.
function loadAll(e, scene, skill) {
  e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
  e.enqueue({ type: 'scene', json: JSON.stringify(scene) });
  e.enqueue({ type: 'skill', code: skill });
}

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildGovernorScene();
  const skill = buildSkill();
  let raf = 0;
  let spinPhase = 0, last = 0;

  // Real flyball dynamics: integrate the arm angle θ from the LIVE moment balance
  // — centrifugal (the turning force) vs gravity + the spring fed back through the
  // sleeve — the SAME moment the solver (mechanism.js `governor`) bisects for its
  // equilibrium. So spinning faster genuinely flings the balls up (and they fall
  // when it slows), settling at the solver's steady state. SI units (mm → m).
  const P = model.params, gravity = P.gravity ?? 9.81;
  const L = P.armLength / 1000, ePiv = P.pivotRadius / 1000, bArm = P.sleeveArm / 1000, mBall = P.ballMass;
  const I = 3 * mBall * L * L, Cdamp = 0.022; // effective inertia + damping (tuned: lively, no overshoot)
  const moment = (th, w) => {
    const r = ePiv + L * Math.sin(th);
    const Mc = mBall * w * w * r * (L * Math.cos(th));        // centrifugal (turning force)
    const Mg = mBall * gravity * (L * Math.sin(th));          // gravity (restoring)
    const S = P.springPreload + P.springRate * (bArm * Math.sin(th)); // spring force on the sleeve
    return Mc - Mg - S * (bArm * Math.cos(th));               // net moment about the pivot
  };
  let theta = model.state().theta, thetaVel = 0;

  const sizeCanvas = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w < 2 || h < 2) return; // hidden / backgrounded — leave the buffer intact
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (e.canvas.width !== cw || e.canvas.height !== ch) { e.canvas.width = cw; e.canvas.height = ch; }
  };
  let ro = null;
  const reSync = () => { sizeCanvas(); window.dispatchEvent(new Event('resize')); };
  const onVisible = () => { if (document.visibilityState === 'visible') requestAnimationFrame(reSync); };

  // Per frame: integrate the spindle phase from the true ω, advance the real θ
  // dynamics (sub-stepped for stability), clamp θ to its physical travel, and
  // hand both to the in-engine placer via input axes.
  const drive = (t) => {
    if (e.ready) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      // true spindle/shaft rate, wrapped to [0, 2π): the phase grows every frame,
      // so it must NOT ride a clamped axis (the engine clamps axis 0 to [-1,1] —
      // that froze the spin after a few frames). Wrapping also keeps float
      // precision over a long session. Fed on axis 2 (unclamped) below.
      spinPhase = (spinPhase + model.omega * dt) % (2 * Math.PI);
      const sub = 4, hh = dt / sub;
      for (let k = 0; k < sub; k++) {
        const acc = (moment(theta, model.omega) - Cdamp * thetaVel) / I;
        thetaVel += acc * hh; theta += thetaVel * hh;
        if (theta < 0) { theta = 0; if (thetaVel < 0) thetaVel = 0; }            // ball rest
        if (theta > P.thetaMax) { theta = P.thetaMax; if (thetaVel > 0) thetaVel = 0; } // sleeve stop
      }
      e.enqueue({ type: 'input', axis: 2, value: spinPhase }); // axis 2: unclamped (axis 0 is the clamped keyboard axis)
      e.enqueue({ type: 'input', axis: 1, value: theta });
    }
    raf = requestAnimationFrame(drive);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadAll(e, scene, skill); else e.onReady = () => loadAll(e, scene, skill);
      e.setAutoplay(true);
      if (!ro && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(reSync); ro.observe(container); }
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('pageshow', reSync);
      last = 0;
      if (!raf) raf = requestAnimationFrame(drive);
    },
    stop() { e.setAutoplay(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize() { reSync(); },
    dispose() {
      e.setAutoplay(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) { ro.disconnect(); ro = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', reSync);
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas); // keep the engine; just detach
    },
  };
}
