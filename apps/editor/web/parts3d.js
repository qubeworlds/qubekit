// QubeKit standard-parts toolbox — reusable 3D part builders (Three.js,
// millimetres). Every mechanism should draw the SAME physical parts from here
// rather than hand-rolling geometry, so a spring looks like a spring everywhere.
//
// Implemented: spring, bevelGear.
// Roadmap (the rest of the toolbox): bolt, nut, washer, screw, nail, pin, axle,
// bearing, beam, spur/helical gear. Eventually these graduate to a shared
// package (@qubekit/parts) and feed real catalog meshes; for now they live with
// the editor.

import * as THREE from './vendor/three.module.js';
import { gear } from './solver/index.js';

const metal = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.88, roughness: 0.38 });

// kind → builder registry. A primitive descriptor (catalog/primitives/*.json:
// { id, kind, params, … }) resolves to a mesh through here — the same registry
// the publisher uses to bake a .glb for the CDN and the editor uses to build a
// part at runtime. Add a part = add a builder + a descriptor; nothing else.
export const PART_BUILDERS = {};
export function buildPart(descriptor) {
  const build = PART_BUILDERS[descriptor.kind];
  if (!build) throw new Error(`unknown primitive kind: ${descriptor.kind}`);
  return build(descriptor.params || {});
}

// Helical spring, normalized to y ∈ [0, 1] along +Y. Set scale.y to the desired
// free/compressed length (smaller scale.y = more compressed). `coils`, `radius`
// (coil radius), and `wire` (wire thickness) define the spring.
export function spring({ radius = 7, wire = 1.1, coils = 8, segments = 16, color = 0x9fb2cf, material } = {}) {
  const n = coils * segments, pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = t * coils * 2 * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t, Math.sin(a) * radius));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 8, false);
  return new THREE.Mesh(geo, material || metal(color));
}

// Bevel gear: loft the solver's involute profile along the pitch cone so the
// teeth taper toward the apex. Axis = +Z, heel (large end) at z=0, toe (small
// end, the mesh/apex side) at z = +faceWidth·cos(coneAngle).
export function bevelGear({ teeth, module, faceWidth, coneAngle, color = 0xb8bcc4, material, rings = 6, flankSamples = 7 }) {
  const g = gear({ teeth, module, flankSamples });
  const outline = g.outline, R = g.pitchRadius, M = outline.length;
  const tanG = Math.tan(coneAngle), axial = faceWidth * Math.cos(coneAngle);

  const pos = [];
  for (let r = 0; r <= rings; r++) {
    const d = (r / rings) * axial, s = 1 - (d / R) * tanG; // radius shrinks toward the apex
    for (let i = 0; i < M; i++) pos.push(outline[i][0] * s, outline[i][1] * s, d);
  }
  const idx = [];
  for (let r = 0; r < rings; r++) for (let i = 0; i < M; i++) {
    const a = r * M + i, b = r * M + (i + 1) % M, c = (r + 1) * M + (i + 1) % M, e = (r + 1) * M + i;
    idx.push(a, b, c, a, c, e);
  }
  const heelC = pos.length / 3; pos.push(0, 0, 0);
  for (let i = 0; i < M; i++) idx.push(heelC, (i + 1) % M, i); // heel cap
  const toeC = pos.length / 3; pos.push(0, 0, axial); const base = rings * M;
  for (let i = 0; i < M; i++) idx.push(toeC, base + i, base + (i + 1) % M); // toe cap

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material || metal(color));
  mesh.userData.axialLength = axial; // toe offset, for positioning at the mesh corner
  return mesh;
}

// register the implemented builders
Object.assign(PART_BUILDERS, { spring, bevelGear });
