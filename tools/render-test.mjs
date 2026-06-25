#!/usr/bin/env node
// Self-test render harness: build a representative QubeKit gear-train scene.json
// + an assets manifest (the local OBJ meshes), matching what apps/preview/web/
// app.js produces, so the NATIVE quine engine can render it headlessly
// (QUINE_THUMB) and we can eyeball our own work instead of asking a human.
//
// Usage: node tools/render-test.mjs  → writes /tmp/qk/scene.json + assets.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PARTS = resolve('apps/preview/parts');
const OUT = '/tmp/qk';
mkdirSync(OUT, { recursive: true });

const MODULE = 1, TAU = Math.PI * 2;
const TEETH = { gear8: 8, gear12: 12, gear24: 24, gear36: 36 };
const r = (z) => MODULE * z / 2;
const toothAt = (a, z) => { const p = TAU / z, s = (((a % p) + p) % p) / p; return s >= 0.30 && s <= 0.70 ? 'tooth' : 'gap'; };

// the train to render: motor + a gear chain (edit to test different cases)
const CHAIN = ['gear12', 'gear24', 'gear12'];

const parts = [];
let x = 0, prevPhase = 0, prevType = 'gear12';
parts.push({ type: 'motor', pos: [0, 0, -17], phase: 0 });
parts.push({ type: 'gear12', pos: [0, 0, 0], phase: 0 });
// build the chain (gear12 is the first/driver; CHAIN[0] must be gear12)
for (let i = 1; i < CHAIN.length; i++) {
  const nz = TEETH[CHAIN[i]], pz = TEETH[prevType];
  x += r(pz) + r(nz);
  const np = TAU / nz;
  const prevFeat = toothAt(0 - prevPhase, pz);
  let phase = prevFeat === 'gap' ? Math.PI - 0.5 * np : Math.PI;
  phase -= Math.round(phase / np) * np;
  parts.push({ type: CHAIN[i], pos: [x, 0, 0], phase });
  prevPhase = phase; prevType = CHAIN[i];
}
const cx = x / 2; // centre the train on the origin (the app's -xCursor/2 shift)

// The engine's OBJ loader normalises each mesh to UNIT height (base at y=0,
// X/Z-centred), so transform.scale must be the part's real Y-extent (mm) to size
// it 1:1, and we offset y by -S/2 to re-centre (base→centre).
const yext = (t) => t.startsWith('gear') ? TEETH[t] + 2 * MODULE : (t === 'motor' ? 18 : 8);

const METAL = { steel: [0.56, 0.58, 0.62], brass: [0.76, 0.58, 0.24], dark: [0.20, 0.21, 0.24] };
let gi = 0;
const entities = [
  { name: 'camera', camera: { fovY: 0.8, near: 0.2, far: 3000, controller: { kind: 'orbit', target: [0, 0, -4], distance: x + 60, yaw: 0.5, pitch: 0.32 } } },
  { name: 'sun', light: { kind: 'directional', color: [1, 0.96, 0.88], intensity: 4.5, direction: [-0.45, -0.8, -0.5] } },
  { name: 'fill', light: { kind: 'directional', color: [0.55, 0.66, 0.9], intensity: 1.6, direction: [0.6, -0.25, 0.55] } },
  { name: 'env', environment: { sky: { zenith: [0.05, 0.06, 0.09], horizon: [0.12, 0.14, 0.18] }, ambient: { color: [0.6, 0.66, 0.8], intensity: 0.6 } } },
];
for (const p of parts) {
  const isGear = p.type.startsWith('gear');
  const col = p.type === 'motor' ? METAL.dark : (gi++ % 2 ? METAL.brass : METAL.steel);
  const S = yext(p.type);
  entities.push({
    name: p.type + entities.length,
    transform: { position: [p.pos[0] - cx, p.pos[1] - S / 2, p.pos[2]], scale: [S, S, S], rotation: [0, 0, p.phase] },
    geometry: { kind: 'gltf', source: p.type + '.obj' },
    material: { color: [...col, 1], metallic: 1.0, roughness: 0.4, emissive: [0, 0, 0] },
  });
}
const scene = { schemaVersion: 1, name: 'qk-test', fixedHz: 64, interpolate: true, entities };

// assets manifest: { "<source-name>": "<local abs path>" }
const used = [...new Set(parts.map((p) => p.type))];
const assets = Object.fromEntries(used.map((t) => [t + '.obj', resolve(PARTS, t + '.obj')]));

writeFileSync(`${OUT}/scene.json`, JSON.stringify(scene, null, 1));
writeFileSync(`${OUT}/assets.json`, JSON.stringify(assets, null, 1));
console.log('chain:', CHAIN.join(' → '));
console.log('gear centres (x, centred):', parts.filter((p) => p.type.startsWith('gear')).map((p) => (p.pos[0] - cx).toFixed(1)).join(', '));
console.log('wrote', `${OUT}/scene.json`, '+', `${OUT}/assets.json`);
