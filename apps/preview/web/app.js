// QubeKit preview — the editor shell, driven by the real @qubekit/sim.
//
// Boots the shared quine engine (CDN) on a QubeKit scene built from the catalog
// (web/catalog.json — the sim-relevant ports + teeth, generated from
// catalog/parts/*.json). On Simulate, every gear spins at the speed
// @qubekit/sim's symbolic gear graph resolves. The scene runs the game loop at
// 64 Hz while the display stays at the browser's 60 Hz — the engine interpolates
// between ticks (interpolate:true), so 64 deterministic sim steps present
// smoothly across 60 frames.

import { resolveAxleSpeeds } from './qubekit-sim.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (cls, m) => { const s = document.createElement('span'); s.className = cls || ''; s.textContent = m + '\n'; logEl.appendChild(s); logEl.scrollTop = logEl.scrollHeight; };
const setStatus = (t) => { $('status').textContent = t; };
$('logtoggle').onclick = () => logEl.classList.toggle('open');

const FIXED_HZ = 64; // game loop rate (display stays at 60 → engine interpolates)
const SPIN_AXIS = [0, 0, 1];
const MOTOR_RPM = 2.6;
const gearRadius = (teeth) => 0.12 + teeth * 0.018;

// preview render stand-ins (until gltf parts exist). gears/wheel/axle = discs
// (mesh, spin reliably); motor/beam = SDF boxes (static housing/frame).
const RENDER = {
  motor:  { shape: 'box',  color: [0.92, 0.30, 0.28], half: [0.16, 0.16, 0.11] },
  wheel:  { shape: 'disc', color: [0.13, 0.13, 0.16], r: 0.34 },
  axle:   { shape: 'disc', color: [0.72, 0.74, 0.80], r: 0.05, thin: 0.9 },
  pin:    { shape: 'disc', color: [0.55, 0.57, 0.62], r: 0.06 },
  gear8:  { shape: 'disc', color: [0.95, 0.80, 0.25], r: gearRadius(8) },
  gear12: { shape: 'disc', color: [0.30, 0.78, 0.95], r: gearRadius(12) },
  gear24: { shape: 'disc', color: [0.36, 0.85, 0.46], r: gearRadius(24) },
  gear36: { shape: 'disc', color: [0.74, 0.55, 0.95], r: gearRadius(36) },
  beam3:  { shape: 'box',  color: [0.80, 0.66, 0.42], half: [0.10, 0.04, 0.04] },
  beam7:  { shape: 'box',  color: [0.80, 0.66, 0.42], half: [0.26, 0.04, 0.04] },
};
const radiusOf = (t) => RENDER[t]?.r ?? 0.3;

let catalog = new Map();   // partType → { teeth, ports:[{id,type}] } (from catalog.json)
let assembly, nextId, lastGearId, xCursor, simulating = false;

function reset() {
  assembly = { id: 'preview', name: 'preview', rev: 0, parts: [], connections: [], controllers: [] };
  nextId = 1; lastGearId = null; xCursor = 0; simulating = false;
  const motor = addPart('motor', [-0.5, 0, -0.42]);
  const g0 = addPart('gear12', [0, 0, 0]);
  connect(motor, 'out', g0, 'c', 'fixed');
  lastGearId = g0; xCursor = 0;
  setMode(false);
}
function addPart(type, pos) {
  const id = nextId++;
  assembly.parts.push({ id, partType: type, transform: { p: pos, q: [1, 0, 0, 0], s: [1, 1, 1] } });
  return id;
}
function connect(a, ap, b, bp, kind) {
  assembly.connections.push({ id: assembly.connections.length + 1, fromPart: a, fromPort: ap, toPart: b, toPort: bp, constraintType: kind });
}
function addGear(type) {
  const rPrev = radiusOf(assembly.parts.find((p) => p.id === lastGearId).partType);
  const rNew = radiusOf(type);
  xCursor += rPrev + rNew;
  const g = addPart(type, [xCursor, 0, 0]);
  connect(lastGearId, 'c', g, 'c', 'gear');
  lastGearId = g;
  setStatus(`added ${type} — ${assembly.parts.length} parts`);
  rebuild();
}

function baseEntities() {
  return [
    { name: 'camera', camera: { fovY: 0.9, near: 0.05, far: 100, controller: { kind: 'orbit', target: [xCursor / 2, 0, 0], distance: 2.4 + xCursor * 0.5, yaw: 0.5, pitch: 0.42 } } },
    { name: 'sun', light: { kind: 'directional', color: [1, 1, 0.96], intensity: 2.8, direction: [-0.4, -1, -0.35] } },
    { name: 'env', environment: { sky_zenith: [0.04, 0.06, 0.10], sky_horizon: [0.10, 0.13, 0.20], ambient_color: [0.82, 0.86, 1], ambient_intensity: 0.55 } },
    // a static frame beam under the train (SDF box)
    { name: 'frame', transform: { position: [xCursor / 2, -0.22, -0.1] }, geometry: { kind: 'sdf', nodes: [{ prim: 'box', center: [0, 0, 0], half: [Math.max(0.5, xCursor / 2 + 0.4), 0.03, 0.06], color: [0.32, 0.36, 0.44] }] } },
  ];
}
function partEntity(pi, w) {
  const rn = RENDER[pi.partType] || { shape: 'disc', color: [0.7, 0.7, 0.75], r: 0.3 };
  if (rn.shape === 'box') {
    return { name: 'p' + pi.id, transform: { position: pi.transform.p },
      geometry: { kind: 'sdf', nodes: [{ prim: 'box', center: [0, 0, 0], half: rn.half, color: rn.color }] } };
  }
  const r = rn.r ?? 0.3;
  return {
    name: 'p' + pi.id,
    transform: { position: pi.transform.p, scale: [1, 1, rn.thin ? 0.5 : 0.16] },
    geometry: { kind: 'sphere', radius: r, rings: 12, segments: 28 },
    material: { color: [...rn.color, 1], metallic: 0.5, roughness: 0.4, emissive: simulating ? rn.color.map((c) => c * 0.07) : [0, 0, 0] },
    spin: { velocity: [SPIN_AXIS[0] * w, SPIN_AXIS[1] * w, SPIN_AXIS[2] * w] },
  };
}
function buildScene() {
  const speeds = simulating ? resolveAxleSpeeds(assembly, catalog, new Map([[1, MOTOR_RPM]])).speeds : new Map();
  const ents = baseEntities();
  for (const pi of assembly.parts) ents.push(partEntity(pi, speeds.get(pi.id) ?? 0));
  return JSON.stringify({ schemaVersion: 1, name: 'qubekit-preview', fixedHz: FIXED_HZ, interpolate: true, entities: ents });
}
function inject() { try { window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify({ type: 'scene', json: buildScene() })]); } catch (e) { log('err', '[inject] ' + (e && e.message)); } }
function rebuild() { if (window.Module && window.Module.ccall) inject(); }

function setMode(sim) {
  simulating = sim;
  $('mBuild').setAttribute('aria-pressed', String(!sim));
  $('mSim').setAttribute('aria-pressed', String(sim));
  if (sim) {
    const r = resolveAxleSpeeds(assembly, catalog, new Map([[1, MOTOR_RPM]]));
    setStatus('Simulate — ' + (r.conflicts.length ? 'over-constrained!' : 'spinning @ 64 Hz'));
    log('ok', 'speeds (rad/s): ' + [...r.speeds.entries()].map(([id, s]) => 'p' + id + '=' + s.toFixed(2)).join(' '));
  } else setStatus('Build mode');
  rebuild();
}
$('mBuild').onclick = () => setMode(false);
$('mSim').onclick = () => setMode(true);

const PALETTE = { gear: 'gear24', wheel: 'gear36', axle: 'gear8', pinion: 'gear12' };
document.querySelectorAll('#palette button').forEach((b) => {
  b.onclick = () => {
    const p = b.dataset.part;
    if (p === 'motor') { reset(); setStatus('reset to motor + gear'); }
    else if (PALETTE[p]) addGear(PALETTE[p]);
    else addGear('gear24');
  };
});

// ── engine boot ──────────────────────────────────────────────────────────────
const CDN = 'https://cdn.qubeworlds.com';
const engineBase = (new URLSearchParams(location.search).get('engine') || CDN + '/engine').replace(/\/+$/, '');
const bust = '?v=' + Date.now();
window.addEventListener('error', (e) => log('err', '[window] ' + (e.message || '') + ' ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; log('err', '[reject] ' + ((r && r.stack) ? r.stack : String(r))); });

(async function init() {
  try {
    const r = await fetch('./catalog.json' + bust);
    if (r.ok) { const obj = await r.json(); catalog = new Map(Object.entries(obj)); log('dim', 'catalog: ' + catalog.size + ' parts'); }
    else log('err', '[catalog] HTTP ' + r.status);
  } catch (e) { log('err', '[catalog] ' + (e && e.message)); }

  reset();
  log('dim', 'ua: ' + navigator.userAgent);
  setStatus('loading engine…');
  window.Module = {
    canvas: $('canvas'),
    locateFile: (p) => engineBase + '/' + p + bust,
    print: (t) => log('', 'engine: ' + t),
    printErr: (t) => log('err', 'engine[err]: ' + t),
    onAbort: (w) => { log('err', '[ABORT] ' + w); setStatus('engine aborted'); },
    onRuntimeInitialized: () => {
      window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify({ type: 'scene', json: buildScene() })]);
      window.Module.ccall('quine_set_autoplay', null, ['number'], [1]);
      window.Module.ccall('quine_set_hud', null, ['number'], [0]);
      log('ok', '[runtime ready] ' + assembly.parts.length + ' parts, loop ' + FIXED_HZ + ' Hz');
      setStatus('Build mode');
    },
  };
  log('dim', 'boot: ' + engineBase + '/quine-webgl2.js');
  const s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous'; s.src = engineBase + '/quine-webgl2.js' + bust;
  s.onerror = () => { log('err', '[engine script failed] ' + s.src); setStatus('engine load failed'); };
  document.head.appendChild(s);
})();
