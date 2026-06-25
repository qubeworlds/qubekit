#!/usr/bin/env node
// Self-test render: build a flat gear-train scene.json + assets manifest and let
// the NATIVE quine engine render it headlessly (QUINE_THUMB), so I can eyeball
// my own work. Gears lie FLAT (disc in XZ), spin axis = Y → each rotates about
// its own centre (the OBJ loader centres X/Z). transform.scale = the part's real
// Y-extent (from dims.json) defeats the loader's unit-height squash.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PARTS = resolve('apps/preview/parts');
const OUT = '/tmp/qk';
mkdirSync(OUT, { recursive: true });
const dims = JSON.parse(readFileSync(resolve(PARTS, 'dims.json'), 'utf8'));
const yext = (t) => dims[t].yext;

const MODULE = 1, TAU = Math.PI * 2;
const TEETH = { gear8: 8, gear12: 12, gear24: 24, gear36: 36 };
const r = (z) => MODULE * z / 2;
const toothAt = (a, z) => { const p = TAU / z, s = (((a % p) + p) % p) / p; return s >= 0.30 && s <= 0.70 ? 'tooth' : 'gap'; };

const CHAIN = ['gear12', 'gear24', 'gear12'];           // gear chain (CHAIN[0] = driver)
const SPIN = Number(process.argv[2] || 0);              // extra spin (rad) to test in-place rotation

// flat train along X at y=0; motor below the first gear (axle along Y)
const parts = [{ type: 'motor', pos: [0, -16, 0], phase: 0 }, { type: 'gear12', pos: [0, 0, 0], phase: 0 }];
let x = 0, prevPhase = 0, prevType = 'gear12';
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
const cx = x / 2;

const METAL = { steel: [0.56, 0.58, 0.62], brass: [0.76, 0.58, 0.24], dark: [0.20, 0.21, 0.24] };
let gi = 0;
const entities = [
  { name: 'camera', camera: { fovY: 0.8, near: 0.2, far: 3000, controller: { kind: 'orbit', target: [0, 0, 0], distance: x + 70, yaw: 0.4, pitch: 1.05 } } },
  { name: 'sun', light: { kind: 'directional', color: [1, 0.96, 0.88], intensity: 4.5, direction: [-0.4, -0.85, -0.4] } },
  { name: 'fill', light: { kind: 'directional', color: [0.55, 0.66, 0.9], intensity: 1.6, direction: [0.5, -0.3, 0.6] } },
  { name: 'env', environment: { sky: { zenith: [0.05, 0.06, 0.09], horizon: [0.12, 0.14, 0.18] }, ambient: { color: [0.6, 0.66, 0.8], intensity: 0.6 } } },
];
for (const p of parts) {
  const col = p.type === 'motor' ? METAL.dark : (gi++ % 2 ? METAL.brass : METAL.steel);
  const S = yext(p.type);
  entities.push({
    name: p.type + entities.length,
    transform: { position: [p.pos[0] - cx, p.pos[1] - S / 2, p.pos[2]], scale: [S, S, S], rotation: [0, p.phase + (p.type.startsWith('gear') ? SPIN : 0), 0] },
    geometry: { kind: 'gltf', source: p.type + '.obj' },
    material: { color: [...col, 1], metallic: 1.0, roughness: 0.4, emissive: [0, 0, 0] },
  });
}
writeFileSync(`${OUT}/scene.json`, JSON.stringify({ schemaVersion: 1, name: 'qk-test', entities }, null, 1));
const used = [...new Set(parts.map((p) => p.type))];
writeFileSync(`${OUT}/assets.json`, JSON.stringify(Object.fromEntries(used.map((t) => [t + '.obj', resolve(PARTS, t + '.obj')])), null, 1));
console.log('chain:', CHAIN.join(' → '), '| spin test:', SPIN, 'rad');
console.log('gear centres x:', parts.filter((p) => p.type.startsWith('gear')).map((p) => (p.pos[0] - cx).toFixed(1)).join(', '));
