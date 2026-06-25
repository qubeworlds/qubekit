// QubeKit preview — the editor shell, driven by the real @qubekit/sim.
//
// Parts are parametric OBJ meshes served from the Qubeworlds CDN
// (cdn.qubeworlds.com/qubekit/parts/*.obj). The host prefetches them and hands
// the bytes to the engine via quine_provide_asset; entities reference them with
// geometry {kind:"gltf", source:"<name>.obj"} (the engine dispatches .obj →
// loadObjMesh). Look: machined metal — steel + brass PBR on a dark stage.
// On Simulate every gear spins at the speed @qubekit/sim's gear graph resolves.
// Loop runs at 64 Hz; display stays 60; the engine interpolates.

import { resolveAxleSpeeds } from './qubekit-sim.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (cls, m) => { const s = document.createElement('span'); s.className = cls || ''; s.textContent = m + '\n'; logEl.appendChild(s); logEl.scrollTop = logEl.scrollHeight; };
const setStatus = (t) => { $('status').textContent = t; };
$('logtoggle').onclick = () => logEl.classList.toggle('open');

const FIXED_HZ = 64, MOTOR_RPM = 2.6, SPIN_AXIS = [0, 0, 1];
const MODULE = 0.03;
const gearRadius = (teeth) => MODULE * teeth / 2; // pitch radius r = m·z/2
const CDN_PARTS = 'https://cdn.qubeworlds.com/qubekit/parts';
const MESHES = ['gear8', 'gear12', 'gear24', 'gear36', 'axle', 'wheel', 'motor', 'beam3', 'beam5', 'beam7', 'pin'];

// machined-metal PBR presets (albedo desaturated; high metalness)
const METAL = {
  steel:       { color: [0.56, 0.58, 0.62], metallic: 1.0, roughness: 0.40 },
  brass:       { color: [0.76, 0.58, 0.24], metallic: 1.0, roughness: 0.32 },
  darksteel:   { color: [0.20, 0.21, 0.24], metallic: 0.85, roughness: 0.55 },
  brightsteel: { color: [0.74, 0.76, 0.80], metallic: 1.0, roughness: 0.22 },
};
function metalFor(pi) {
  const t = pi.partType;
  if (t.startsWith('gear')) return pi.id % 2 ? METAL.brass : METAL.steel; // a steel/brass mix
  if (t === 'motor' || t.startsWith('beam')) return METAL.darksteel;
  if (t === 'wheel') return METAL.darksteel;
  if (t === 'axle' || t === 'pin') return METAL.brightsteel;
  return METAL.steel;
}

let catalog = new Map();
let meshBytes = new Map();        // name → Uint8Array (prefetched from CDN)
let provided = false;
let assembly, nextId, lastGearId, xCursor, simulating = false;

// ── persistence (#6/#9): a build is a project doc, stored client-side behind a
// store seam (localStorage now; OPFS Vfs + GitHub commit later). Auto-save on
// change, restore on boot.
const STORE_KEY = 'qubekit:project:preview';
const store = {
  read: () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } },
  write: (d) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { log('err', '[save] ' + (e && e.message)); } },
};
const saveProject = () => store.write({ schema: 'qubekit-project/v0', name: 'preview', updated: Date.now(), assembly, cursor: { nextId, lastGearId, xCursor } });
function restoreProject() {
  const d = store.read();
  if (!d?.assembly?.parts?.length) return false;
  assembly = d.assembly; nextId = d.cursor?.nextId ?? Math.max(0, ...assembly.parts.map((p) => p.id)) + 1;
  lastGearId = d.cursor?.lastGearId ?? null; xCursor = d.cursor?.xCursor ?? 0; simulating = false;
  return true;
}

function reset() {
  assembly = { id: 'preview', name: 'preview', rev: 0, parts: [], connections: [], controllers: [] };
  nextId = 1; lastGearId = null; xCursor = 0; simulating = false;
  const motor = addPart('motor', [-0.5, 0, -0.42]);
  const g0 = addPart('gear12', [0, 0, 0]);
  connect(motor, 'out', g0, 'c', 'fixed');
  lastGearId = g0; xCursor = 0;
  saveProject();
}
function addPart(type, pos) { const id = nextId++; assembly.parts.push({ id, partType: type, transform: { p: pos, q: [1, 0, 0, 0], s: [1, 1, 1] } }); return id; }
function connect(a, ap, b, bp, kind) { assembly.connections.push({ id: assembly.connections.length + 1, fromPart: a, fromPort: ap, toPart: b, toPort: bp, constraintType: kind }); }
function addGear(type) {
  const rPrev = gearRadius(catalog.get(assembly.parts.find((p) => p.id === lastGearId).partType)?.teeth ?? 12);
  const rNew = gearRadius(catalog.get(type)?.teeth ?? 24);
  xCursor += rPrev + rNew;
  const g = addPart(type, [xCursor, 0, 0]);
  connect(lastGearId, 'c', g, 'c', 'gear');
  lastGearId = g; saveProject();
  setStatus(`added ${type} — ${assembly.parts.length} parts`);
  rebuild();
}

function baseEntities() {
  const w = Math.max(0.6, xCursor / 2 + 0.5);
  return [
    { name: 'camera', camera: { fovY: 0.85, near: 0.05, far: 100, controller: { kind: 'orbit', target: [xCursor / 2, 0, 0], distance: 2.3 + xCursor * 0.5, yaw: 0.6, pitch: 0.38 } } },
    { name: 'sun', light: { kind: 'directional', color: [1, 0.96, 0.88], intensity: 3.6, direction: [-0.5, -0.85, -0.45] } },
    { name: 'env', environment: { sky_zenith: [0.012, 0.014, 0.020], sky_horizon: [0.03, 0.035, 0.05], ambient_color: [0.50, 0.54, 0.64], ambient_intensity: 0.20 } },
    { name: 'frame', transform: { position: [xCursor / 2, -0.24, -0.12] }, geometry: { kind: 'sdf', nodes: [{ prim: 'box', center: [0, 0, 0], half: [w, 0.03, 0.07], color: [0.10, 0.11, 0.14] }] } },
  ];
}
function partEntity(pi, w) {
  const mat = metalFor(pi);
  return {
    name: 'p' + pi.id,
    transform: { position: pi.transform.p },
    geometry: { kind: 'gltf', source: pi.partType + '.obj' },
    material: { color: [...mat.color, 1], metallic: mat.metallic, roughness: mat.roughness, emissive: [0, 0, 0] },
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
  saveProject(); rebuild();
}
$('mBuild').onclick = () => setMode(false);
$('mSim').onclick = () => setMode(true);

const PALETTE = { gear: 'gear24', wheel: 'gear36', axle: 'gear8', pinion: 'gear12' };
document.querySelectorAll('#palette button').forEach((b) => {
  b.onclick = () => { const p = b.dataset.part; if (p === 'motor') { reset(); setMode(false); setStatus('reset'); } else addGear(PALETTE[p] || 'gear24'); };
});

// ── engine boot ──────────────────────────────────────────────────────────────
const CDN = 'https://cdn.qubeworlds.com';
const engineBase = (new URLSearchParams(location.search).get('engine') || CDN + '/engine').replace(/\/+$/, '');
const bust = '?v=' + Date.now();
window.addEventListener('error', (e) => log('err', '[window] ' + (e.message || '') + ' ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; log('err', '[reject] ' + ((r && r.stack) ? r.stack : String(r))); });

function provideMeshes() {
  if (provided) return;
  const M = window.Module;
  for (const [name, data] of meshBytes) {
    try { const p = M._malloc(data.length); M.HEAPU8.set(data, p); M.ccall('quine_provide_asset', null, ['string', 'number', 'number'], [name + '.obj', p, data.length]); M._free(p); }
    catch (e) { log('err', '[mesh ' + name + '] ' + (e && e.message)); }
  }
  provided = true;
  log('ok', 'provided ' + meshBytes.size + ' part meshes (CDN)');
}

(async function init() {
  try { const r = await fetch('./catalog.json' + bust); if (r.ok) { catalog = new Map(Object.entries(await r.json())); log('dim', 'catalog: ' + catalog.size + ' parts'); } } catch (e) { log('err', '[catalog] ' + (e && e.message)); }
  // prefetch part meshes from the Qubeworlds CDN
  setStatus('loading parts…');
  await Promise.all(MESHES.map(async (name) => {
    try { const r = await fetch(CDN_PARTS + '/' + name + '.obj', { mode: 'cors' }); if (r.ok) meshBytes.set(name, new Uint8Array(await r.arrayBuffer())); else log('err', '[mesh ' + name + '] HTTP ' + r.status); }
    catch (e) { log('err', '[mesh ' + name + '] ' + (e && e.message)); }
  }));
  log('dim', 'meshes fetched: ' + meshBytes.size + '/' + MESHES.length);

  if (!restoreProject()) reset(); else log('ok', 'restored ' + assembly.parts.length + ' parts');
  setStatus('loading engine…');
  window.Module = {
    canvas: $('canvas'),
    locateFile: (p) => engineBase + '/' + p + bust,
    print: (t) => log('', 'engine: ' + t),
    printErr: (t) => log('err', 'engine[err]: ' + t),
    onAbort: (w) => { log('err', '[ABORT] ' + w); setStatus('engine aborted'); },
    onRuntimeInitialized: () => {
      provideMeshes();
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
