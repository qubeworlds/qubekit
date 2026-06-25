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
const MODULE = 1; // mm — scene units are millimetres (ISO module 1 mm)
const gearRadius = (teeth) => MODULE * teeth / 2; // pitch radius r = m·z/2
const TAU = Math.PI * 2;
// The engine's OBJ loader normalises each mesh to UNIT height (base y=0,
// X/Z-centred). transform.scale must be the part's real Y-extent (mm) to size it
// 1:1; we then offset y by -S/2 to re-centre (base→centre). yext: gear Y-extent =
// outer diameter = (z + 2·addendum) = z + 2; others measured from gen-parts.
const YEXT_OTHER = { motor: 18, wheel: 30, axle: 4, pin: 5, beam3: 8, beam5: 8, beam7: 8 };
const yext = (t) => (t.startsWith('gear') ? (catalog.get(t)?.teeth ?? 12) + 2 * MODULE : (YEXT_OTHER[t] ?? 8));
// Is the gear surface a tooth or a gap at this local angle? (mirrors gen-parts'
// profile: tip land seg∈[0.30,0.70].) Used to phase meshing gears.
const toothAt = (localAngle, teeth) => {
  const p = TAU / teeth, seg = (((localAngle % p) + p) % p) / p;
  return seg >= 0.30 && seg <= 0.70 ? 'tooth' : 'gap';
};
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
const STORE_KEY = 'qubekit:project:preview:mm'; // bumped: scene rescaled to mm
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
  // motor sits coaxial behind the gear it drives (same X/Y, offset in Z), its
  // shaft on the gear's axis. (can motor is 30 mm long → centre ~17 mm back.)
  const motor = addPart('motor', [0, 0, -17]);
  const g0 = addPart('gear12', [0, 0, 0]);
  connect(motor, 'out', g0, 'c', 'fixed');
  lastGearId = g0; xCursor = 0;
  saveProject();
}
function addPart(type, pos) { const id = nextId++; assembly.parts.push({ id, partType: type, transform: { p: pos, q: [1, 0, 0, 0], s: [1, 1, 1] } }); return id; }
function connect(a, ap, b, bp, kind) { assembly.connections.push({ id: assembly.connections.length + 1, fromPart: a, fromPort: ap, toPart: b, toPort: bp, constraintType: kind }); }
function addGear(type) {
  const prev = assembly.parts.find((p) => p.id === lastGearId);
  const pz = catalog.get(prev.partType)?.teeth ?? 12;
  const nz = catalog.get(type)?.teeth ?? 24;
  xCursor += gearRadius(pz) + gearRadius(nz); // centre distance a = m(z1+z2)/2 (the formula)
  // Coplanar (z=0). Phase the new gear so its teeth interleave with the
  // previous one's at the contact: present the complement of what the previous
  // gear shows toward it (tooth ↔ gap), so they mesh instead of clashing.
  const np = TAU / nz;
  const prevFeat = toothAt(0 - (prev.phase ?? 0), pz); // prev's feature toward +X (toward the new gear)
  let phase = prevFeat === 'gap' ? Math.PI - 0.5 * np : Math.PI; // tooth- vs gap-centre toward prev
  phase -= Math.round(phase / np) * np; // normalise near 0
  const g = addPart(type, [xCursor, 0, 0]);
  assembly.parts.find((p) => p.id === g).phase = phase;
  connect(lastGearId, 'c', g, 'c', 'gear');
  lastGearId = g; saveProject();
  setStatus(`added ${type} — ${assembly.parts.length} parts`);
  rebuild();
}

function baseEntities() {
  // The train is rendered CENTRED on the origin (see partEntity's −xCursor/2
  // shift), so the camera target stays put and parts never drift off to +X.
  return [
    { name: 'camera', camera: { fovY: 0.8, near: 0.2, far: 3000, controller: { kind: 'orbit', target: [0, 0, -4], distance: xCursor + 60, yaw: 0.5, pitch: 0.32 } } },
    { name: 'sun', light: { kind: 'directional', color: [1, 0.96, 0.88], intensity: 4.5, direction: [-0.45, -0.8, -0.5] } },
    { name: 'fill', light: { kind: 'directional', color: [0.55, 0.66, 0.9], intensity: 1.6, direction: [0.6, -0.25, 0.55] } },
    { name: 'env', environment: { sky: { zenith: [0.05, 0.06, 0.09], horizon: [0.12, 0.14, 0.18] }, ambient: { color: [0.6, 0.66, 0.8], intensity: 0.6 } } },
  ];
}
function partEntity(pi, w) {
  const mat = metalFor(pi);
  const S = yext(pi.partType);
  return {
    name: 'p' + pi.id,
    // real-size via scale = Y-extent (defeats the loader's unit-height squash);
    // centre the train on the origin (−xCursor/2) and re-centre y (−S/2).
    transform: { position: [pi.transform.p[0] - xCursor / 2, pi.transform.p[1] - S / 2, pi.transform.p[2]], scale: [S, S, S], rotation: [0, 0, pi.phase ?? 0] },
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

const PALETTE = { gear8: 'gear8', gear12: 'gear12', gear24: 'gear24', gear36: 'gear36' };
document.querySelectorAll('#palette button').forEach((b) => {
  b.onclick = () => addGear(PALETTE[b.dataset.part] || 'gear24');
});
$('reset').onclick = () => { localStorage.removeItem(STORE_KEY); reset(); setMode(false); setStatus('reset'); };

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
  // Resolve part meshes from the Qubeworlds asset registry (D1 → CDN); fall back
  // to the hardcoded CDN paths if the registry is unreachable.
  setStatus('loading parts…');
  let meshList = MESHES.map((name) => ({ name, url: CDN_PARTS + '/' + name + '.obj' }));
  try {
    const r = await fetch('https://api.qubeworlds.com/assets?project=qubekit');
    if (r.ok) {
      const objs = ((await r.json()).assets || []).filter((a) => a.kind === 'mesh-obj' && a.id.endsWith('.obj'));
      if (objs.length) { meshList = objs.map((a) => ({ name: a.id.split('/').pop().replace('.obj', ''), url: a.url })); log('dim', 'registry: ' + objs.length + ' meshes'); }
    }
  } catch (e) { log('err', '[registry] ' + (e && e.message) + ' — using CDN fallback'); }
  await Promise.all(meshList.map(async ({ name, url }) => {
    try { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { mode: 'cors' }); if (r.ok) meshBytes.set(name, new Uint8Array(await r.arrayBuffer())); else log('err', '[mesh ' + name + '] HTTP ' + r.status); }
    catch (e) { log('err', '[mesh ' + name + '] ' + (e && e.message)); }
  }));
  log('dim', 'meshes fetched: ' + meshBytes.size + '/' + meshList.length);

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
      // clean stage: no reference grid / gizmo chrome
      window.Module.ccall('quine_set_config', null, ['string'], [JSON.stringify({ preferences: { grid: false, gizmo: false } })]);
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
