// Quine-engine 3D view for the drone — the same mechanism as `drone-3d.js`, but
// rendered AND SIMULATED by the real **Quine** wasm engine (Jolt physics). Unlike
// the Three.js view (which eases a kinematic attitude), this drone is a real
// dynamic rigid body: gravity pulls it down, the four rotor thrusts push it up,
// and it collides with — and lands on — the table. A self-stabilising flight
// controller runs as an in-engine skill (altitude-hold + attitude PD + position
// hold), so RPM truly runs against gravity and a throttle cut drops it onto the
// table for real.
//
// Authority split:
//   • host (this file) — turns @qubekit/solver's body wrench into flight TARGETS
//     (pitch / roll / yaw-rate / target-height) and the four rotor throttles,
//     fed into engine input axes every frame.
//   • skill (in-engine) — the flight controller: applies real thrust forces vs
//     gravity, stabilising torques, and position hold to the dynamic `body`; then
//     carries the four spinning prop hubs along the body's physics-driven pose.
//
// The body is a dynamic box collider (its orientation syncs back into the
// Transform); the table is a static box collider. Arms / ducts / rims / camera
// are parented to the body so the airframe is one rigid unit. Hubs are roots the
// skill places from the body's synced pose (so they ride the real motion) and
// spins from the throttle; blades parent to the hubs.
//
// Engine bundle defaults to the public CDN; override with `?engine=<base>`.

const ENGINE_BASE = (new URLSearchParams(location.search).get('engine') ||
  'https://cdn.qubeworlds.com/engine').replace(/\/+$/, '');
const BACKEND = 'quine-webgl2'; // webgl2 is the broad-device floor (iPad Safari)

const S = 100;                          // scene units: QubeKit mm /100 → ~metres
const ARM_A = (110 / S) / Math.SQRT2;   // X-frame half-diagonal (hub offset)
const MASS = 0.3;                       // kg — matches the solver's 300 g cinewhoop
const HOVER_Y = 1.0;                    // altitude setpoint at hover throttle
const REST_Y = 0.09;                    // body-centre height resting on the table

// FR & RL spin CW (red); FL & RR spin CCW (blue) — the X-frame mixer pairing.
const ROTORS = [
  { nm: 'FR', sx: 1, sz: 1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'FL', sx: -1, sz: 1, dir: 1, col: [0.36, 0.55, 0.95] },
  { nm: 'RL', sx: -1, sz: -1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'RR', sx: 1, sz: -1, dir: 1, col: [0.36, 0.55, 0.95] },
];

// In-engine flight controller + prop carrier. Input axes from the host:
//   0..3 — each rotor's normalised throttle (drives the visual hub spin)
//   4 pitchTarget   5 rollTarget   6 yawRateTarget   7 targetHeight
// The body is a real dynamic rigid body; the controller actuates it with forces
// and torques (the gains are tuned deterministically in the engine's
// `flight controller` unit test — keep them in sync). Then each prop hub (a root)
// is placed from the body's PHYSICS-synced pose and spun about the body-local up
// axis, so the props ride the real airframe motion. The body's own orientation
// comes from Jolt (sync_rotation), read here as Euler.
const DRONE_SKILL = `
var M = ${MASS}, G = 9.81, W = M * G;
var KPH = 7.0, KDH = 4.5, THRMAX = 14.0; // altitude hold (thrust vs gravity)
var KPA = 0.9, KDA = 0.30;               // attitude hold (torque toward target tilt)
var KYAW = 0.18;                          // yaw-rate hold
var KPP = 2.2, KDP = 2.4;                 // horizontal position hold

var HUBS = ['hubFR','hubFL','hubRL','hubRR'];
var DIR  = [-1, 1, -1, 1];
var OFF  = [[${ARM_A},0,${ARM_A}],[${-ARM_A},0,${ARM_A}],[${-ARM_A},0,${-ARM_A}],[${ARM_A},0,${-ARM_A}]];
var ANG  = [0, 0, 0, 0];
var MAXW = 22.0; // rad/s at full throttle — fast but readable, not a strobe

// 3x3 rotation helpers (engine's Euler setter is ZYX: R = Rz·Ry·Rx).
function matRx(a){var c=Math.cos(a),s=Math.sin(a);return [[1,0,0],[0,c,-s],[0,s,c]];}
function matRy(a){var c=Math.cos(a),s=Math.sin(a);return [[c,0,s],[0,1,0],[-s,0,c]];}
function matRz(a){var c=Math.cos(a),s=Math.sin(a);return [[c,-s,0],[s,c,0],[0,0,1]];}
function mul(A,B){var R=[[0,0,0],[0,0,0],[0,0,0]];for(var i=0;i<3;i++)for(var j=0;j<3;j++){var s=0;for(var k=0;k<3;k++)s+=A[i][k]*B[k][j];R[i][j]=s;}return R;}
function mv(R,v){return [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2], R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2], R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];}
function toZYX(R){var y=Math.asin(Math.max(-1,Math.min(1,-R[2][0])));return {x:Math.atan2(R[2][1],R[2][2]), y:y, z:Math.atan2(R[1][0],R[0][0])};}

onPreStep(function (dt) {
  var b = world.get('body');
  var p = b.body.position, v = b.body.velocity, w = b.body.angularVelocity;
  var e = b.transform.rotation; // Euler ZYX, synced from Jolt

  // --- flight controller: actuate the real rigid body ---
  var thrust = W + KPH * (input(7) - p.y) - KDH * v.y; // altitude hold, vs gravity
  if (thrust < 0) thrust = 0; else if (thrust > THRMAX) thrust = THRMAX;
  b.body.addForce({ x: 0, y: thrust, z: 0 });
  b.body.addTorque({ x: KPA * (input(4) - e.x) - KDA * w.x,   // pitch
                     y: KYAW * (input(6) - w.y),               // yaw rate
                     z: KPA * (input(5) - e.z) - KDA * w.z }); // roll
  b.body.addForce({ x: -KPP * p.x - KDP * v.x, y: 0, z: -KPP * p.z - KDP * v.z });

  // --- carry the prop hubs along the body's physics pose ---
  var Rb = mul(mul(matRz(e.z), matRy(e.y)), matRx(e.x));
  for (var i = 0; i < 4; i++) {
    ANG[i] = (ANG[i] + DIR[i] * input(i) * MAXW * dt) % 6.2831853;
    var h = world.get(HUBS[i]);
    if (!h) continue;
    var o = mv(Rb, OFF[i]);
    h.transform.position = { x: p.x + o[0], y: p.y + o[1], z: p.z + o[2] };
    h.transform.rotation = toZYX(mul(Rb, matRy(ANG[i]))); // disc stays parallel to body
  }
});
`;

// QubeKit cinewhoop spec (mm), scaled /100 to ~metre units the engine renders at.
function buildDroneScene() {
  const bodyW = 90 / S, bodyH = 26 / S, bodyD = 70 / S;
  const ductR = 62 / S, ductH = 16 / S, propR = 52 / S;
  const a = ARM_A;
  const ents = [];
  const E = (o) => ents.push(o);

  // The TABLE: a static box collider the drone lands on, top surface at y = 0.
  E({ name: 'floor', geometry: { kind: 'box', half: [5, 0.15, 5] },
    transform: { position: [0, -0.15, 0] },
    body: { motion: 'static', collider: { kind: 'box', halfExtents: [5, 0.15, 5] }, friction: 0.7 },
    material: { color: [0.17, 0.20, 0.27, 1], metallic: 0.0, roughness: 0.92 } });

  // The BODY: a real DYNAMIC rigid body (mass = MASS). Its box collider spans the
  // duct footprint and is shallow, so the craft rests flat on its ducts. Jolt
  // owns its pose; sync_rotation feeds the bank back into the Transform.
  E({ name: 'body', geometry: { kind: 'roundedBox', half: [bodyW / 2, bodyH / 2, bodyD / 2], radius: 0.05, segments: 4 },
    transform: { position: [0, HOVER_Y, 0] },
    body: { motion: 'dynamic', mass: MASS, friction: 0.6, collider: { kind: 'box', halfExtents: [a + ductR, REST_Y, a + ductR] } },
    material: { color: [0.82, 0.84, 0.88, 1], metallic: 0.5, roughness: 0.45 } });
  E({ name: 'cam', geometry: { kind: 'box', half: [0.10, 0.07, 0.07] },
    transform: { position: [0, -0.01, bodyD / 2 + 0.10] }, parent: { entity: 'body' },
    material: { color: [0.08, 0.09, 0.12, 1], metallic: 0.3, roughness: 0.5 } });

  for (const r of ROTORS) {
    const x = r.sx * a, z = r.sz * a;
    const ang = -Math.atan2(z, x), dist = Math.hypot(x, z);
    // arm + duct shroud + rim ride the body (parented; local coords).
    E({ name: 'arm' + r.nm, geometry: { kind: 'box', half: [dist / 2, 0.022, 0.022] },
      transform: { position: [x / 2, -0.02, z / 2], rotation: [0, ang, 0] }, parent: { entity: 'body' },
      material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.4, roughness: 0.5 } });
    E({ name: 'shroud' + r.nm, geometry: { kind: 'tube', innerRadius: propR + 0.02, outerRadius: ductR, height: ductH },
      transform: { position: [x, 0, z] }, parent: { entity: 'body' },
      material: { color: [0.14, 0.15, 0.18, 1], metallic: 0.2, roughness: 0.6 } });
    E({ name: 'rim' + r.nm, geometry: { kind: 'torus', majorRadius: (propR + 0.02 + ductR) / 2, minorRadius: 0.018, majorSegments: 40, minorSegments: 14 },
      transform: { position: [x, ductH / 2, z] }, parent: { entity: 'body' },
      material: { color: [0.10, 0.11, 0.14, 1], metallic: 0.3, roughness: 0.5 } });
    // hub is a ROOT (world coords) so the skill owns its pose; it carries it along
    // the body's physics motion. Blades parent to it and ride the spin.
    E({ name: 'hub' + r.nm, geometry: { kind: 'cylinder', radius: 0.045, height: 0.05 },
      transform: { position: [x, HOVER_Y, z] }, material: { color: [0.05, 0.05, 0.06, 1], metallic: 0.6, roughness: 0.4 } });
    for (let b = 0; b < 2; b++) {
      E({ name: 'blade' + r.nm + b, geometry: { kind: 'box', half: [propR, 0.006, 0.05] },
        transform: { position: [0, 0.02, 0], rotation: [0, b * Math.PI / 2, 0] }, parent: { entity: 'hub' + r.nm },
        material: { color: [r.col[0], r.col[1], r.col[2], 1], metallic: 0.1, roughness: 0.4 } });
    }
  }

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.4, -1.0, -0.5], intensity: 1.15, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.22, 0.36, 0.58], horizon: [0.60, 0.66, 0.72] }, ambient: { intensity: 0.6 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.75, 0], distance: 4.8, yaw: 0.7, pitch: 0.40 } } });
  return { schemaVersion: 1, name: 'drone', gravity: [0, -9.81, 0], entities: ents };
}

// The engine is a single Emscripten module per page; boot it once, lazily.
let engine = null;
function bootEngine() {
  if (engine) return engine;
  const canvas = document.createElement('canvas');
  canvas.id = 'quine-canvas';
  canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;touch-action:none';
  const e = { canvas, ready: false, pending: null, skillLoaded: false };
  e.enqueue = (o) => { try { window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify(o)]); } catch (_) {} };
  e.setAutoplay = (on) => { try { window.Module.ccall('quine_set_autoplay', null, ['number'], [on ? 1 : 0]); } catch (_) {} };

  window.Module = {
    canvas,
    locateFile: (p) => ENGINE_BASE + '/' + p,
    print: () => {}, printErr: () => {},
    onRuntimeInitialized() {
      e.ready = true;
      if (e.pending) loadAll(e, e.pending);
      e.setAutoplay(true);
      try { window.Module.ccall('quine_set_hud', null, ['number'], [0]); } catch (_) {}
    },
  };
  const s = document.createElement('script');
  s.crossOrigin = 'anonymous';
  s.src = ENGINE_BASE + '/' + BACKEND + '.js';
  document.head.appendChild(s);
  engine = e;
  return e;
}

// Hand the engine the scene, the grid-off preference, and (once) the flight skill.
function loadAll(e, scene) {
  e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
  e.enqueue({ type: 'scene', json: JSON.stringify(scene) });
  if (!e.skillLoaded) { e.enqueue({ type: 'skill', code: DRONE_SKILL }); e.skillLoaded = true; }
  // arm the altitude setpoint at hover before the first wrench frame lands.
  e.enqueue({ type: 'input', axis: 7, value: HOVER_Y });
}

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildDroneScene();
  let raf = 0;
  const lastNorm = [NaN, NaN, NaN, NaN];
  let heading = 0; // integrated yaw target (rad) — for the height/altitude mapping only

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    e.canvas.width = Math.round(w * dpr);
    e.canvas.height = Math.round(h * dpr);
  };

  // Per frame: push each slider's throttle (axes 0..3 — visual prop spin), then
  // turn the solver wrench into flight TARGETS the in-engine controller flies to.
  const flight = () => {
    if (e.ready && model) {
      if (model.values && model.sliders) {
        for (let i = 0; i < 4 && i < model.values.length; i++) {
          const s = model.sliders[i];
          const span = (s.max - s.min) || 1;
          const norm = clamp((model.values[i] - s.min) / span, 0, 1);
          if (norm !== lastNorm[i]) { e.enqueue({ type: 'input', axis: i, value: norm }); lastNorm[i] = norm; }
        }
      }
      if (typeof model.wrench === 'function') {
        const w = model.wrench();
        // attitude targets: right-heavy banks, front-heavy pitches (same mapping
        // as the Three.js view); the controller leans the real body to these.
        const pitchT = clamp(w.pitch * 18, -0.45, 0.45);
        const rollT = clamp(-w.roll * 18, -0.45, 0.45);
        const yawRateT = clamp(w.yaw * 60, -1.5, 1.5); // rad/s
        // altitude setpoint: lift vs weight raises/lowers it; below REST_Y commits
        // to a landing (the static table stops the descent for real).
        const targetH = clamp(HOVER_Y + (w.thrust - w.weight) * 0.6, -0.2, 1.9);
        e.enqueue({ type: 'input', axis: 4, value: pitchT });
        e.enqueue({ type: 'input', axis: 5, value: rollT });
        e.enqueue({ type: 'input', axis: 6, value: yawRateT });
        e.enqueue({ type: 'input', axis: 7, value: targetH });
      }
    }
    raf = requestAnimationFrame(flight);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadAll(e, scene); else e.pending = scene;
      e.setAutoplay(true);
      lastNorm.fill(NaN); heading = 0; // re-send inputs after a (re)mount
      if (!raf) raf = requestAnimationFrame(flight);
    },
    stop() { e.setAutoplay(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize() { sizeCanvas(); window.dispatchEvent(new Event('resize')); },
    dispose() {
      e.setAutoplay(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas); // keep the engine; just detach
    },
  };
}
