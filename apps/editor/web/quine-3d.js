// Quine-engine 3D view for the drone — the same mechanism as `drone-3d.js`, but
// rendered by the real **Quine** wasm engine (the one QubeKit ships on) instead
// of Three.js. The airframe is authored as a Quine scene built from the engine's
// primitive library (box / roundedBox / cylinder / tube / torus) and its
// scene-graph parenting: body + arms + ducts + camera are all parented to
// `body`. The four prop hubs are driven LIVE by the RPM sliders: the host feeds
// each slider's normalised value into an input axis, and a small in-engine skill
// spins each hub from that axis (so the props respond, just like the Three.js
// view). The hubs are roots (not parented) so the skill owns their rotation.
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
const BODY_Y = 1.0;             // the airframe hovers a metre above the floor

// FR & RL spin CW (red); FL & RR spin CCW (blue) — the X-frame mixer pairing.
// Axis index = rotor index = slider index, so input(i) is rotor i's throttle.
const ROTORS = [
  { nm: 'FR', sx: 1, sz: 1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'FL', sx: -1, sz: 1, dir: 1, col: [0.36, 0.55, 0.95] },
  { nm: 'RL', sx: -1, sz: -1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'RR', sx: 1, sz: -1, dir: 1, col: [0.36, 0.55, 0.95] },
];

// In-engine skill: spin each hub by its input axis (0..3 = normalised throttle).
// Hubs are roots, so writing their rotation isn't overwritten by the scene graph.
// State (the accumulated angle) lives in the skill, not read back from the engine
// — reading a continuous Y rotation back as Euler would alias at ±90°.
const DRONE_SKILL = `
var HUBS = ['hubFR','hubFL','hubRL','hubRR'];
var DIR  = [-1, 1, -1, 1];
var ANG  = [0, 0, 0, 0];
var MAXW = 22.0; // rad/s at full throttle — fast but readable, not a strobe
onPreStep(function (dt) {
  for (var i = 0; i < 4; i++) {
    ANG[i] = (ANG[i] + DIR[i] * input(i) * MAXW * dt) % 6.2831853;
    var h = world.get(HUBS[i]);
    if (h) h.transform.rotation = { x: 0, y: ANG[i], z: 0 };
  }
});
`;

// QubeKit cinewhoop spec (mm), scaled /100 to ~metre units the engine renders at.
function buildDroneScene() {
  const S = 100;
  const bodyW = 90 / S, bodyH = 26 / S, bodyD = 70 / S;
  const ductR = 62 / S, ductH = 16 / S, propR = 52 / S;
  const a = (110 / S) / Math.SQRT2; // X-frame half-diagonal
  const ents = [];
  const E = (o) => ents.push(o);

  // A solid floor the airframe shadows onto (the engine's own grid is hidden via
  // a config frame), plus the sky gradient set below.
  E({ name: 'floor', geometry: { kind: 'box', half: [5, 0.15, 5] },
    transform: { position: [0, -0.15, 0] }, material: { color: [0.17, 0.20, 0.27, 1], metallic: 0.0, roughness: 0.92 } });

  E({ name: 'body', geometry: { kind: 'roundedBox', half: [bodyW / 2, bodyH / 2, bodyD / 2], radius: 0.05, segments: 4 },
    transform: { position: [0, BODY_Y, 0] }, material: { color: [0.82, 0.84, 0.88, 1], metallic: 0.5, roughness: 0.45 } });
  E({ name: 'cam', geometry: { kind: 'box', half: [0.10, 0.07, 0.07] },
    transform: { position: [0, -0.01, bodyD / 2 + 0.10] }, parent: { entity: 'body' },
    material: { color: [0.08, 0.09, 0.12, 1], metallic: 0.3, roughness: 0.5 } });

  for (const r of ROTORS) {
    const x = r.sx * a, z = r.sz * a;
    const ang = -Math.atan2(z, x), dist = Math.hypot(x, z);
    // arm + duct shroud + rim ride the body (parented).
    E({ name: 'arm' + r.nm, geometry: { kind: 'box', half: [dist / 2, 0.022, 0.022] },
      transform: { position: [x / 2, -0.02, z / 2], rotation: [0, ang, 0] }, parent: { entity: 'body' },
      material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.4, roughness: 0.5 } });
    E({ name: 'shroud' + r.nm, geometry: { kind: 'tube', innerRadius: propR + 0.02, outerRadius: ductR, height: ductH },
      transform: { position: [x, BODY_Y, z] }, material: { color: [0.14, 0.15, 0.18, 1], metallic: 0.2, roughness: 0.6 } });
    E({ name: 'rim' + r.nm, geometry: { kind: 'torus', majorRadius: (propR + 0.02 + ductR) / 2, minorRadius: 0.018, majorSegments: 40, minorSegments: 14 },
      transform: { position: [x, BODY_Y + ductH / 2, z] }, material: { color: [0.10, 0.11, 0.14, 1], metallic: 0.3, roughness: 0.5 } });
    // hub is a ROOT (world coords) so the skill can drive its rotation; the two
    // blades are parented to it and ride its spin.
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
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.85, 0], distance: 4.8, yaw: 0.7, pitch: 0.40 } } });
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

// Hand the engine the scene, the grid-off preference, and (once) the spin skill.
function loadAll(e, scene) {
  e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
  e.enqueue({ type: 'scene', json: JSON.stringify(scene) });
  if (!e.skillLoaded) { e.enqueue({ type: 'skill', code: DRONE_SKILL }); e.skillLoaded = true; }
}

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildDroneScene();
  let raf = 0;
  const last = [NaN, NaN, NaN, NaN];

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    e.canvas.width = Math.round(w * dpr);
    e.canvas.height = Math.round(h * dpr);
  };
  // Push each slider's normalised [0,1] throttle into its input axis when it
  // changes; the skill turns that into hub spin. Axis i ↔ rotor i ↔ slider i.
  const pumpInputs = () => {
    if (e.ready && model && model.values && model.sliders) {
      for (let i = 0; i < 4 && i < model.values.length; i++) {
        const s = model.sliders[i];
        const span = (s.max - s.min) || 1;
        const norm = Math.max(0, Math.min(1, (model.values[i] - s.min) / span));
        if (norm !== last[i]) { e.enqueue({ type: 'input', axis: i, value: norm }); last[i] = norm; }
      }
    }
    raf = requestAnimationFrame(pumpInputs);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadAll(e, scene); else e.pending = scene;
      e.setAutoplay(true);
      last.fill(NaN); // re-send inputs after a (re)mount
      if (!raf) raf = requestAnimationFrame(pumpInputs);
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
