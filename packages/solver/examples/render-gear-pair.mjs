// Render a physically-correct, correctly-phased meshing gear pair to SVG.
// Run after `pnpm build`:  node examples/render-gear-pair.mjs
//
// This is the counter-example to the diffusion-model image: equal module, pitch
// circles exactly tangent at the standard centre distance m·(z1+z2)/2, involute
// flanks, and a tooth of one gear phased into a gap of the other so they
// actually interlock.

import { gear, canMesh } from '../dist/index.js';

const MODULE = 1; // mm  (metric, realistic kit scale)
const A = gear({ teeth: 20, module: MODULE, flankSamples: 10 });
const B = gear({ teeth: 32, module: MODULE, flankSamples: 10 });
const mesh = canMesh(A, B);

const a = mesh.centerDistance; // mm — B sits this far along +X from A

// Phasing: rotate B so a tooth GAP points back at A (world angle π in B's frame),
// letting A's tooth (centred on +X, angle 0) drop into it.
const gapStep = (2 * Math.PI) / B.z;
const k = Math.round(B.z / 2 - 0.5);
const phaseB = Math.PI - (k + 0.5) * gapStep;

const SCALE = 9; // px per mm
const pad = 24;
const minX = -A.addendumRadius;
const maxX = a + B.addendumRadius;
const maxR = Math.max(A.addendumRadius, B.addendumRadius);
const W = (maxX - minX) * SCALE + pad * 2;
const H = 2 * maxR * SCALE + pad * 2 + 40;
const ox = pad - minX * SCALE;
const oy = H / 2 - 20;
const px = (x) => ox + x * SCALE;
const py = (y) => oy - y * SCALE; // flip Y for screen

function toothPath(g, cx, phase) {
  const pts = g.outline.map(([x, y]) => {
    const c = Math.cos(phase), s = Math.sin(phase);
    const rx = x * c - y * s + cx;
    const ry = x * s + y * c;
    return `${px(rx).toFixed(2)},${py(ry).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
}

function circle(cx, cy, r, stroke, dash = '') {
  return `<circle cx="${px(cx).toFixed(2)}" cy="${py(cy).toFixed(2)}" r="${(r * SCALE).toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="ui-monospace,monospace">
<rect width="100%" height="100%" fill="#0f1115"/>
<!-- pitch circles (tangent at the pitch point) -->
${circle(0, 0, A.pitchRadius, '#3b82f6', '4 3')}
${circle(a, 0, B.pitchRadius, '#3b82f6', '4 3')}
<!-- base circles -->
${circle(0, 0, A.baseRadius, '#64748b', '1 3')}
${circle(a, 0, B.baseRadius, '#64748b', '1 3')}
<!-- gear bodies -->
<path d="${toothPath(A, 0, 0)}" fill="#9ca3af" stroke="#e5e7eb" stroke-width="0.8"/>
<path d="${toothPath(B, a, phaseB)}" fill="#b08d57" stroke="#e9d8b6" stroke-width="0.8"/>
<!-- pitch point + line of centres -->
<line x1="${px(0)}" y1="${py(0)}" x2="${px(a)}" y2="${py(0)}" stroke="#475569" stroke-width="0.5"/>
<circle cx="${px(A.pitchRadius)}" cy="${py(0)}" r="3" fill="#22c55e"/>
<text x="${pad}" y="${H - 16}" fill="#e5e7eb" font-size="13">
m=${MODULE}mm  ·  z₁=${A.z} (r=${A.pitchRadius}mm)  z₂=${B.z} (r=${B.pitchRadius}mm)  ·  centre=${a}mm  ·  ratio=${mesh.gearRatio.toFixed(3)}  ·  contact ratio ε=${mesh.contactRatio.toFixed(2)}  ·  mesh ${mesh.ok ? 'VALID ✓' : 'INVALID'}</text>
</svg>`;

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const out = join(dirname(fileURLToPath(import.meta.url)), 'gear-pair.svg');
writeFileSync(out, svg);
console.log('wrote', out);
console.log('mesh:', JSON.stringify(mesh, null, 2));
