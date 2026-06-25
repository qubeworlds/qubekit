// QubeKit preview — the editor shell, driven by the real @qubekit/sim.
//
// Boots the shared quine engine (CDN) on a QubeKit scene, lays out a gear train,
// and on Simulate spins every gear at the speed @qubekit/sim's symbolic gear
// graph resolves (small gears fast, big gears slow + counter-rotating). The
// palette extends the train. This is the verified sim (packages/sim) running
// in-page — the same module that later promotes to the server.

import { resolveAxleSpeeds } from './qubekit-sim.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (cls, m) => { const s = document.createElement('span'); s.className = cls || ''; s.textContent = m + '\n'; logEl.appendChild(s); logEl.scrollTop = logEl.scrollHeight; };
const setStatus = (t) => { $('status').textContent = t; };
$('logtoggle').onclick = () => logEl.classList.toggle('open');

// ── catalog: sim data (ports + teeth) + render hints (colour + radius) ───────
const SPIN_AXIS = [0, 0, 1]; // gears lie in the XY plane, spin about Z
const gearRadius = (teeth) => 0.12 + teeth * 0.018;
const catalog = new Map([
  ['motor',  { teeth: undefined, ports: [{ id: 'out', type: 'motor_out' }] }],
  ['gear8',  { teeth: 8,  ports: [{ id: 'c', type: 'gear_center' }] }],
  ['gear12', { teeth: 12, ports: [{ id: 'c', type: 'gear_center' }] }],
  ['gear24', { teeth: 24, ports: [{ id: 'c', type: 'gear_center' }] }],
  ['gear36', { teeth: 36, ports: [{ id: 'c', type: 'gear_center' }] }],
]);
const RENDER = {
  motor:  { color: [0.92, 0.30, 0.28], radius: 0.26 },
  gear8:  { color: [0.95, 0.80, 0.25], radius: gearRadius(8) },
  gear12: { color: [0.30, 0.78, 0.95], radius: gearRadius(12) },
  gear24: { color: [0.36, 0.85, 0.46], radius: gearRadius(24) },
  gear36: { color: [0.74, 0.55, 0.95], radius: gearRadius(36) },
};
const radiusOf = (t) => RENDER[t]?.radius ?? 0.3;

// ── assembly state ───────────────────────────────────────────────────────────
let assembly, nextId, lastGearId, xCursor, simulating = false;
const MOTOR_RPM = 2.6; // rad/s the driven motor spins at in Simulate

function reset() {
  assembly = { id: 'preview', name: 'preview', rev: 0, parts: [], connections: [], controllers: [] };
  nextId = 1; lastGearId = null; xCursor = 0; simulating = false;
  // a motor driving a first gear
  const motor = addPart('motor', [-0.5, 0, -0.45]);
  const g0 = addPart('gear12', [0, 0, 0]);
  connect(motor, 'out', g0, 'c', 'fixed'); // keyed: gear spins with the motor
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

// add a gear meshed to the last gear of the train (touching → counter-rotating)
function addGear(type) {
  const rPrev = radiusOf(assembly.parts.find((p) => p.id === lastGearId).partType);
  const rNew = radiusOf(type);
  xCursor += rPrev + rNew;
  const g = addPart(type, [xCursor, 0, 0]);
  connect(lastGearId, 'c', g, 'c', 'gear'); // mesh: ratio −teethA/teethB
  lastGearId = g;
  setStatus(`added ${type} — ${assembly.parts.length} parts`);
  rebuild();
}

// ── scene build + inject ──────────────────────────────────────────────────────
function baseEntities() {
  return [
    { name: 'camera', camera: { fovY: 0.9, near: 0.05, far: 100, controller: { kind: 'orbit', target: [xCursor / 2, 0, 0], distance: 2.4 + xCursor * 0.5, yaw: 0.5, pitch: 0.42 } } },
    { name: 'sun', light: { kind: 'directional', color: [1, 1, 0.96], intensity: 2.8, direction: [-0.4, -1, -0.35] } },
    { name: 'env', environment: { sky_zenith: [0.04, 0.06, 0.10], sky_horizon: [0.10, 0.13, 0.20], ambient_color: [0.82, 0.86, 1], ambient_intensity: 0.55 } },
  ];
}
function buildScene() {
  const speeds = simulating
    ? resolveAxleSpeeds(assembly, catalog, new Map([[1, MOTOR_RPM]])).speeds
    : new Map();
  const ents = baseEntities();
  for (const pi of assembly.parts) {
    const r = radiusOf(pi.partType);
    const col = RENDER[pi.partType]?.color ?? [0.7, 0.7, 0.75];
    const w = speeds.get(pi.id) ?? 0;
    ents.push({
      name: 'p' + pi.id,
      transform: { position: pi.transform.p, scale: [1, 1, 0.16] }, // flatten into a disc
      geometry: { kind: 'sphere', radius: r, rings: 12, segments: 28 },
      material: { color: [...col, 1], metallic: 0.5, roughness: 0.4, emissive: simulating ? col.map((c) => c * 0.06) : [0, 0, 0] },
      spin: { velocity: [SPIN_AXIS[0] * w, SPIN_AXIS[1] * w, SPIN_AXIS[2] * w] },
    });
  }
  return JSON.stringify({ schemaVersion: 1, name: 'qubekit-preview', entities: ents });
}
function inject() { try { window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify({ type: 'scene', json: buildScene() })]); } catch (e) { log('err', '[inject] ' + (e && e.message)); } }
function rebuild() { if (window.Module && window.Module.ccall) inject(); }

function setMode(sim) {
  simulating = sim;
  $('mBuild').setAttribute('aria-pressed', String(!sim));
  $('mSim').setAttribute('aria-pressed', String(sim));
  if (sim) {
    const r = resolveAxleSpeeds(assembly, catalog, new Map([[1, MOTOR_RPM]]));
    const slow = [...r.speeds.entries()].map(([id, s]) => 'p' + id + '=' + s.toFixed(2)).join(' ');
    setStatus('Simulate — ' + (r.conflicts.length ? 'over-constrained!' : 'spinning'));
    log('ok', 'gear speeds (rad/s): ' + slow);
  } else setStatus('Build mode');
  rebuild();
}
$('mBuild').onclick = () => setMode(false);
$('mSim').onclick = () => setMode(true);

// palette wiring
const PALETTE = { gear: 'gear24', wheel: 'gear36', axle: 'gear8', pinion: 'gear12' };
document.querySelectorAll('#palette button').forEach((b) => {
  b.onclick = () => {
    const p = b.dataset.part;
    if (p === 'motor') { reset(); setStatus('reset to motor + gear'); }
    else if (PALETTE[p]) addGear(PALETTE[p]);
    else { addGear('gear24'); } // beam/pin → just extend for now
  };
});

// ── engine boot (WebGL2, the iPad floor) ─────────────────────────────────────
const CDN = 'https://cdn.qubeworlds.com';
const engineBase = (new URLSearchParams(location.search).get('engine') || CDN + '/engine').replace(/\/+$/, '');
const bust = '?v=' + Date.now();
window.addEventListener('error', (e) => log('err', '[window] ' + (e.message || '') + ' ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; log('err', '[reject] ' + ((r && r.stack) ? r.stack : String(r))); });

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
    log('ok', '[runtime ready] QubeKit scene injected — ' + assembly.parts.length + ' parts');
    setStatus('Build mode');
  },
};
log('dim', 'boot: ' + engineBase + '/quine-webgl2.js');
const s = document.createElement('script');
s.async = true; s.crossOrigin = 'anonymous'; s.src = engineBase + '/quine-webgl2.js' + bust;
s.onerror = () => { log('err', '[engine script failed] ' + s.src); setStatus('engine load failed'); };
document.head.appendChild(s);
