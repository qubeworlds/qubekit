// Quine-engine 3D view for the drone — the same mechanism as `drone-3d.js`, but
// rendered by the real **Quine** wasm engine (the one QubeKit ships on) instead
// of Three.js. The airframe is authored as a Quine scene built from the engine's
// primitive library (box / roundedBox / cylinder / tube / torus) and its
// scene-graph parenting: body + arms + ducts + camera are all parented to
// `body`, so the whole airframe banks as one.
//
// The craft is solver-driven, exactly like dropdown 4: the host integrates the
// damped response of `@qubekit/solver`'s body wrench (quadWrench) — a thrust
// imbalance tilts it, a spin-direction imbalance yaws it, lift-vs-weight sets its
// height — and feeds the attitude (pitch/yaw/roll/height) plus the four rotor
// throttles into input axes. A small in-engine skill turns those axes into the
// body's transform and the four spinning prop hubs, so the Quine view *flies*
// the same way the Three.js view does, not just spins the props.
//
// The engine is content-agnostic: it carries no meshes, just renders the scene
// it's handed. We boot it ONCE (Emscripten is a singleton) on a canvas and feed
// the scene with `quine_enqueue`; switching mechanisms re-attaches that canvas.
//
// Engine bundle defaults to the public CDN; override with `?engine=<base>` to
// test an unreleased engine.

const ENGINE_BASE = (new URLSearchParams(location.search).get('engine') ||
  'https://cdn.qubeworlds.com/engine').replace(/\/+$/, '');
const BACKEND = 'quine-webgl2'; // webgl2 is the broad-device floor (iPad Safari)
const BODY_Y = 1.0;             // the airframe hovers a metre above the floor at rest

const S = 100;                  // scene units: QubeKit mm /100 → ~metres
const ARM_A = (110 / S) / Math.SQRT2; // X-frame half-diagonal (hub offset from centre)

// FR & RL spin CW (red); FL & RR spin CCW (blue) — the X-frame mixer pairing.
// Axis index = rotor index = slider index, so input(i) is rotor i's throttle.
const ROTORS = [
  { nm: 'FR', sx: 1, sz: 1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'FL', sx: -1, sz: 1, dir: 1, col: [0.36, 0.55, 0.95] },
  { nm: 'RL', sx: -1, sz: -1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'RR', sx: 1, sz: -1, dir: 1, col: [0.36, 0.55, 0.95] },
];

// In-engine skill. The host feeds eight input axes every frame:
//   0..3 — each rotor's normalised throttle (drives hub spin speed)
//   4    — body pitch (rad, X)   5 — body heading/yaw (rad, Y)
//   6    — body roll (rad, Z)    7 — body height (world Y)
// The skill writes the body root's transform from 4..7, then places + spins each
// prop hub. Hubs are ROOTS (not parented), because the parent pass would
// overwrite a parented entity's rotation and we need to own the spin — so the
// skill itself rides them along the body: each hub's rest offset is rotated by
// the body attitude (rotZYX matches the engine's fromEulerZYX) and its spin is
// folded into the yaw slot. Spin angle is accumulated here (reading a continuous
// Y rotation back as Euler would alias at ±90°).
const DRONE_SKILL = `
var HUBS = ['hubFR','hubFL','hubRL','hubRR'];
var DIR  = [-1, 1, -1, 1];
var OFF  = [[${ARM_A},0,${ARM_A}],[${-ARM_A},0,${ARM_A}],[${-ARM_A},0,${-ARM_A}],[${ARM_A},0,${-ARM_A}]];
var ANG  = [0, 0, 0, 0];
var MAXW = 22.0; // rad/s at full throttle — fast but readable, not a strobe
var BODYY = ${BODY_Y};

// 3x3 rotation helpers. The engine's transform.rotation setter consumes Euler in
// ZYX order (fromEulerZYX → R = Rz·Ry·Rx), so we build the body attitude that way
// and round-trip composed rotations back through toZYX for the setter.
function matRx(a){var c=Math.cos(a),s=Math.sin(a);return [[1,0,0],[0,c,-s],[0,s,c]];}
function matRy(a){var c=Math.cos(a),s=Math.sin(a);return [[c,0,s],[0,1,0],[-s,0,c]];}
function matRz(a){var c=Math.cos(a),s=Math.sin(a);return [[c,-s,0],[s,c,0],[0,0,1]];}
function mul(A,B){var R=[[0,0,0],[0,0,0],[0,0,0]];for(var i=0;i<3;i++)for(var j=0;j<3;j++){var s=0;for(var k=0;k<3;k++)s+=A[i][k]*B[k][j];R[i][j]=s;}return R;}
function mv(R,v){return [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2], R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2], R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];}
// Extract ZYX Euler from R (inverse of fromEulerZYX) so a composed matrix can be
// handed back to the Euler setter unchanged.
function toZYX(R){var y=Math.asin(Math.max(-1,Math.min(1,-R[2][0])));return {x:Math.atan2(R[2][1],R[2][2]), y:y, z:Math.atan2(R[1][0],R[0][0])};}

onPreStep(function (dt) {
  var pitch = input(4), yaw = input(5), roll = input(6);
  var hgt = input(7); if (hgt === 0) hgt = BODYY; // pre-arm default: sit at rest height
  var Rb = mul(mul(matRz(roll), matRy(yaw)), matRx(pitch)); // body attitude
  var body = world.get('body');
  if (body) {
    body.transform.position = { x: 0, y: hgt, z: 0 };
    body.transform.rotation = { x: pitch, y: yaw, z: roll };
  }
  for (var i = 0; i < 4; i++) {
    ANG[i] = (ANG[i] + DIR[i] * input(i) * MAXW * dt) % 6.2831853;
    var h = world.get(HUBS[i]);
    if (!h) continue;
    // hub rides the body: position = body + Rb·offset; orientation = Rb·spin so the
    // blade disc stays parallel to the airframe (spin about the body-local up axis,
    // applied AFTER the tilt — not folded into the heading, which would precess it).
    var p = mv(Rb, OFF[i]);
    h.transform.position = { x: p[0], y: hgt + p[1], z: p[2] };
    h.transform.rotation = toZYX(mul(Rb, matRy(ANG[i])));
  }
});
`;

// QubeKit cinewhoop spec (mm), scaled /100 to ~metre units the engine renders at.
function buildDroneScene() {
  const bodyW = 90 / S, bodyH = 26 / S, bodyD = 70 / S;
  const ductR = 62 / S, ductH = 16 / S, propR = 52 / S;
  const a = ARM_A; // X-frame half-diagonal
  const ents = [];
  const E = (o) => ents.push(o);

  // A solid floor the airframe shadows onto (the engine's own grid is hidden via
  // a config frame), plus the sky gradient set below.
  E({ name: 'floor', geometry: { kind: 'box', half: [5, 0.15, 5] },
    transform: { position: [0, -0.15, 0] }, material: { color: [0.17, 0.20, 0.27, 1], metallic: 0.0, roughness: 0.92 } });

  // The body is the airframe root; the skill flies it. Everything that should
  // bank with the craft is parented to it (camera, arms, duct shrouds, rims).
  E({ name: 'body', geometry: { kind: 'roundedBox', half: [bodyW / 2, bodyH / 2, bodyD / 2], radius: 0.05, segments: 4 },
    transform: { position: [0, BODY_Y, 0] }, material: { color: [0.82, 0.84, 0.88, 1], metallic: 0.5, roughness: 0.45 } });
  E({ name: 'cam', geometry: { kind: 'box', half: [0.10, 0.07, 0.07] },
    transform: { position: [0, -0.01, bodyD / 2 + 0.10] }, parent: { entity: 'body' },
    material: { color: [0.08, 0.09, 0.12, 1], metallic: 0.3, roughness: 0.5 } });

  for (const r of ROTORS) {
    const x = r.sx * a, z = r.sz * a;
    const ang = -Math.atan2(z, x), dist = Math.hypot(x, z);
    // arm + duct shroud + rim all ride the body (parented; local coords relative
    // to the body centre, which sits at BODY_Y).
    E({ name: 'arm' + r.nm, geometry: { kind: 'box', half: [dist / 2, 0.022, 0.022] },
      transform: { position: [x / 2, -0.02, z / 2], rotation: [0, ang, 0] }, parent: { entity: 'body' },
      material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.4, roughness: 0.5 } });
    E({ name: 'shroud' + r.nm, geometry: { kind: 'tube', innerRadius: propR + 0.02, outerRadius: ductR, height: ductH },
      transform: { position: [x, 0, z] }, parent: { entity: 'body' },
      material: { color: [0.14, 0.15, 0.18, 1], metallic: 0.2, roughness: 0.6 } });
    E({ name: 'rim' + r.nm, geometry: { kind: 'torus', majorRadius: (propR + 0.02 + ductR) / 2, minorRadius: 0.018, majorSegments: 40, minorSegments: 14 },
      transform: { position: [x, ductH / 2, z] }, parent: { entity: 'body' },
      material: { color: [0.10, 0.11, 0.14, 1], metallic: 0.3, roughness: 0.5 } });
    // hub is a ROOT (world coords) so the skill owns its rotation/position; the
    // skill carries it along the body's flight. Blades parent to it and ride the spin.
    E({ name: 'hub' + r.nm, geometry: { kind: 'cylinder', radius: 0.045, height: 0.05 },
      transform: { position: [x, BODY_Y, z] }, material: { color: [0.05, 0.05, 0.06, 1], metallic: 0.6, roughness: 0.4 } });
    for (let b = 0; b < 2; b++) {
      E({ name: 'blade' + r.nm + b, geometry: { kind: 'box', half: [propR, 0.006, 0.05] },
        transform: { position: [0, 0.02, 0], rotation: [0, b * Math.PI / 2, 0] }, parent: { entity: 'hub' + r.nm },
        material: { color: [r.col[0], r.col[1], r.col[2], 1], metallic: 0.1, roughness: 0.4 } });
    }
  }

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.4, -1.0, -0.5], intensity: 1.15, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.22, 0.36, 0.58], horizon: [0.60, 0.66, 0.72] }, ambient: { intensity: 0.6 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.95, 0], distance: 4.8, yaw: 0.7, pitch: 0.40 } } });
  return { schemaVersion: 1, name: 'drone', entities: ents };
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
  // arm the body at rest height before the first wrench frame lands
  e.enqueue({ type: 'input', axis: 7, value: BODY_Y });
}

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildDroneScene();
  let raf = 0;
  const lastNorm = [NaN, NaN, NaN, NaN];

  // Damped attitude state — eased toward the wrench's steady response, exactly as
  // drone-3d.js does, so four raw RPM sliders read as bank / turn / climb.
  let heading = 0, rollA = 0, pitchA = 0, hgt = BODY_Y, lastTs = 0;
  const ease = (cur, target, dt, k) => cur + (target - cur) * Math.min(1, dt * k);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    e.canvas.width = Math.round(w * dpr);
    e.canvas.height = Math.round(h * dpr);
  };

  // Per frame: push each slider's throttle (axes 0..3) when it changes, then
  // integrate the solver wrench into the body's flight and push it (axes 4..7).
  const flight = (ts) => {
    if (e.ready && model) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;

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
        const targetRoll = clamp(-w.roll * 32, -0.5, 0.5);  // right-heavy → bank
        const targetPitch = clamp(w.pitch * 32, -0.5, 0.5); // front-heavy → pitch
        const targetH = clamp(BODY_Y + (w.thrust - w.weight) * 0.3, BODY_Y * 0.5, BODY_Y * 1.85);
        rollA = ease(rollA, targetRoll, dt, 3);
        pitchA = ease(pitchA, targetPitch, dt, 3);
        hgt = ease(hgt, targetH, dt, 2);
        heading = (heading + w.yaw * dt * 70) % (Math.PI * 2); // yaw torque → turn rate
        e.enqueue({ type: 'input', axis: 4, value: pitchA });
        e.enqueue({ type: 'input', axis: 5, value: heading });
        e.enqueue({ type: 'input', axis: 6, value: rollA });
        e.enqueue({ type: 'input', axis: 7, value: hgt });
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
      lastNorm.fill(NaN); lastTs = 0; // re-send inputs after a (re)mount
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
