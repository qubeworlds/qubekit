// Quine-engine 3D view for the drone — the same mechanism as `drone-3d.js`, but
// rendered by the real **Quine** wasm engine (the one QubeKit ships on) instead
// of Three.js. The airframe is authored as a Quine scene built entirely from the
// engine's primitive library (box / roundedBox / cylinder / tube / torus) and
// its scene-graph parenting: every part is parented to `body`, each prop sits on
// a spinning `hub`, so the counter-rotating props ride the airframe for free.
//
// The engine is content-agnostic: it carries no meshes, just renders the scene
// it's handed. We boot it ONCE (Emscripten is a singleton) on a canvas and feed
// the scene with `quine_enqueue`; switching mechanisms re-attaches that canvas.
//
// Engine bundle defaults to the public CDN; override with `?engine=<base>` (e.g.
// a locally served `zig-out/web`) to test an unreleased engine.

const ENGINE_BASE = (new URLSearchParams(location.search).get('engine') ||
  'https://cdn.qubeworlds.com/engine').replace(/\/+$/, '');
const BACKEND = 'quine-webgl2'; // webgl2 is the broad-device floor (iPad Safari)

// QubeKit cinewhoop spec (mm), scaled /100 to ~metre units the engine renders at.
function buildDroneScene() {
  const S = 100;
  const bodyW = 90 / S, bodyH = 26 / S, bodyD = 70 / S;
  const ductR = 62 / S, ductH = 16 / S, propR = 52 / S;
  const a = (110 / S) / Math.SQRT2; // X-frame half-diagonal
  const BODY_Y = 1.0;
  const ents = [];
  const E = (o) => ents.push(o);

  E({ name: 'body', geometry: { kind: 'roundedBox', half: [bodyW / 2, bodyH / 2, bodyD / 2], radius: 0.05, segments: 4 },
    transform: { position: [0, BODY_Y, 0] }, material: { color: [0.82, 0.84, 0.88, 1], metallic: 0.5, roughness: 0.45 } });
  E({ name: 'cam', geometry: { kind: 'box', half: [0.10, 0.07, 0.07] },
    transform: { position: [0, -0.01, bodyD / 2 + 0.10] }, parent: { entity: 'body' },
    material: { color: [0.08, 0.09, 0.12, 1], metallic: 0.3, roughness: 0.5 } });

  // FR & RL spin CW (red); FL & RR spin CCW (blue) — the X-frame mixer pairing.
  const rotors = [
    ['FR', a, a, -1, [0.88, 0.28, 0.28]], ['FL', -a, a, 1, [0.36, 0.55, 0.95]],
    ['RL', -a, -a, -1, [0.88, 0.28, 0.28]], ['RR', a, -a, 1, [0.36, 0.55, 0.95]],
  ];
  for (const [nm, x, z, spin, col] of rotors) {
    const ang = -Math.atan2(z, x), dist = Math.hypot(x, z);
    E({ name: 'arm' + nm, geometry: { kind: 'box', half: [dist / 2, 0.022, 0.022] },
      transform: { position: [x / 2, -0.02, z / 2], rotation: [0, ang, 0] }, parent: { entity: 'body' },
      material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.4, roughness: 0.5 } });
    E({ name: 'shroud' + nm, geometry: { kind: 'tube', innerRadius: propR + 0.02, outerRadius: ductR, height: ductH },
      transform: { position: [x, 0, z] }, parent: { entity: 'body' },
      material: { color: [0.14, 0.15, 0.18, 1], metallic: 0.2, roughness: 0.6 } });
    E({ name: 'rim' + nm, geometry: { kind: 'torus', majorRadius: (propR + 0.02 + ductR) / 2, minorRadius: 0.018, majorSegments: 40, minorSegments: 14 },
      transform: { position: [x, ductH / 2, z] }, parent: { entity: 'body' },
      material: { color: [0.10, 0.11, 0.14, 1], metallic: 0.3, roughness: 0.5 } });
    E({ name: 'hub' + nm, geometry: { kind: 'cylinder', radius: 0.045, height: 0.05 },
      transform: { position: [x, 0, z] }, parent: { entity: 'body' }, spin: { velocity: [0, spin * 30, 0] },
      material: { color: [0.05, 0.05, 0.06, 1], metallic: 0.6, roughness: 0.4 } });
    for (let b = 0; b < 2; b++) {
      E({ name: 'blade' + nm + b, geometry: { kind: 'box', half: [propR, 0.006, 0.05] },
        transform: { position: [0, 0.02, 0], rotation: [0, b * Math.PI / 2, 0] }, parent: { entity: 'hub' + nm },
        material: { color: [col[0], col[1], col[2], 1], metallic: 0.1, roughness: 0.4 } });
    }
  }

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.4, -1.0, -0.5], intensity: 1.15, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.22, 0.36, 0.58], horizon: [0.60, 0.66, 0.72] }, ambient: { intensity: 0.6 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.95, 0], distance: 4.6, yaw: 0.7, pitch: 0.42 } } });
  return { schemaVersion: 1, name: 'drone', entities: ents };
}

// The engine is a single Emscripten module per page; boot it once, lazily.
let engine = null;
function bootEngine() {
  if (engine) return engine;
  const canvas = document.createElement('canvas');
  canvas.id = 'quine-canvas';
  canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;touch-action:none';
  const e = { canvas, ready: false, pending: null };
  e.enqueue = (o) => { try { window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify(o)]); } catch (_) {} };
  e.setAutoplay = (on) => { try { window.Module.ccall('quine_set_autoplay', null, ['number'], [on ? 1 : 0]); } catch (_) {} };

  window.Module = {
    canvas,
    locateFile: (p) => ENGINE_BASE + '/' + p,
    print: () => {}, printErr: () => {},
    onRuntimeInitialized() {
      e.ready = true;
      if (e.pending) e.enqueue({ type: 'scene', json: JSON.stringify(e.pending) });
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

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildDroneScene();

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    e.canvas.width = Math.round(w * dpr);
    e.canvas.height = Math.round(h * dpr);
  };
  const loadScene = () => { if (e.ready) e.enqueue({ type: 'scene', json: JSON.stringify(scene) }); else e.pending = scene; };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      loadScene();
      e.setAutoplay(true);
    },
    stop() { e.setAutoplay(false); },
    resize() { sizeCanvas(); window.dispatchEvent(new Event('resize')); },
    dispose() {
      e.setAutoplay(false);
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas); // keep the engine; just detach
    },
  };
}
