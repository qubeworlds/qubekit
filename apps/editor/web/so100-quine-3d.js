// Quine-engine 3D view for the SO-100 arm — the real SO-ARM100 assembly
// rendered by the Quine wasm engine. Same split as the governor:
//   • host (this file) — advances the model (trajectory targets + the STS3215
//     slew emulation) and feeds the SIX ACTUAL JOINT ANGLES into engine input
//     axes 0–5 every frame;
//   • skill (in-engine) — a kinematic placer: forward kinematics over the
//     assembly's joint table (pivots/axes baked from so100-data.js — the same
//     generated constants the model uses), posing every link + servo root.
//
// Geometry: the REAL printed-part meshes — the SO-ARM100 STLs converted to glb
// (tools/so100-stl2glb.py) and served from the CDN. Each mesh is authored in
// its link's local frame (the URDF link frame — the same frame the catalog
// ports use), so the roots render them with no offset; the servo mesh is the
// Base_Motor reframed to the sts3215 part frame. If the mesh fetch fails
// (offline), the view falls back to primitives whose every LENGTH still comes
// from the joint table — only thicknesses are cosmetic. `?assets=<base>`
// overrides the mesh origin for local dev (like `?engine=`).
//
// Shares the single engine module (one WebGL context) via bootEngine.

import { bootEngine } from './quine-3d.js';
import { SO100 } from './so100-data.js';

const ASSETS_BASE = (new URLSearchParams(location.search).get('assets') ||
  'https://cdn.qubeworlds.com/qubekit/parts/so100').replace(/\/+$/, '');
const MESH_NAMES = [...SO100.links.map((l) => l.name), 'sts3215'];

// name → ArrayBuffer, fetched once per page. null until loadMeshes resolves;
// {} (empty-ish) entries missing → primitive fallback.
let meshBytes = null;
async function loadMeshes() {
  if (meshBytes) return meshBytes;
  const fetched = {};
  await Promise.all(MESH_NAMES.map(async (n) => {
    try {
      const r = await fetch(`${ASSETS_BASE}/${n}.glb`, { mode: 'cors' });
      if (r.ok) fetched[n] = new Uint8Array(await r.arrayBuffer());
    } catch (_) { /* offline / blocked — fall back to primitives */ }
  }));
  meshBytes = fetched;
  return fetched;
}
const haveAllMeshes = (m) => MESH_NAMES.every((n) => m[n]);

// Hand the meshes to the engine's asset registry (must precede the scene that
// references them) — same staging as the drone's stone texture.
function provideMeshes(m) {
  try {
    const mod = window.Module;
    for (const n of MESH_NAMES) {
      if (!m[n]) continue;
      const p = mod._malloc(m[n].length);
      mod.HEAPU8.set(m[n], p);
      mod.ccall('quine_provide_asset', null, ['string', 'number', 'number'], [`so100_${n}.glb`, p, m[n].length]);
      mod._free(p);
    }
  } catch (_) {}
}

const PRINT = [1.0, 0.82, 0.12, 1];   // 3d_printed golden — the URDF's material
const MOTOR = [0.10, 0.10, 0.11, 1];  // sts3215 black — likewise
const HORN = [0.75, 0.76, 0.78, 1];

// --- small matrix/euler kit for BUILD-TIME child transforms -------------------
const q2m = ([w, x, y, z]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
  [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
  [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
];
// Euler ZYX (the engine's transform.rotation convention) from a rotation matrix.
const zyx = (R) => {
  const y = Math.asin(Math.max(-1, Math.min(1, -R[2][0])));
  return [Math.atan2(R[2][1], R[2][2]), y, Math.atan2(R[1][0], R[0][0])];
};
// A rotation aligning +Y to `d` (any orthonormal completion — bones are round).
const alignY = (d) => {
  const n = Math.hypot(d[0], d[1], d[2]) || 1;
  const yv = [d[0] / n, d[1] / n, d[2] / n];
  let xv = Math.abs(yv[1]) < 0.9 ? [yv[2], 0, -yv[0]] : [1, 0, 0]; // ⟂ guess
  const dotXY = xv[0] * yv[0] + xv[1] * yv[1] + xv[2] * yv[2];
  xv = [xv[0] - dotXY * yv[0], xv[1] - dotXY * yv[1], xv[2] - dotXY * yv[2]];
  const xl = Math.hypot(...xv) || 1;
  xv = xv.map((v) => v / xl);
  const zv = [xv[1] * yv[2] - xv[2] * yv[1], xv[2] * yv[0] - xv[0] * yv[2], xv[0] * yv[1] - xv[1] * yv[0]];
  return [[xv[0], yv[0], zv[0]], [xv[1], yv[1], zv[1]], [xv[2], yv[2], zv[2]]];
};

// Display scale. 1 = true size (SI metres): the engine now fits its shadow
// volume to the content's real AABBs with a slope-scaled bias, so the ~0.35 m
// arm shadows cleanly at 1:1 (the earlier 3× workaround dodged a shadow map
// fitted to ±1 m-padded positions). The plumbing stays — the DATA is SI and
// the view scales at build time — in case a scene ever wants it.
const VIS = 1;
const vp = (p) => p.map((v) => v * VIS);

function buildScene(useMeshes) {
  const ents = [];
  const E = (o) => ents.push(o);

  E({ name: 'floor', geometry: { kind: 'box', half: [0.45 * VIS, 0.012 * VIS, 0.45 * VIS] },
    transform: { position: [0, -0.012 * VIS, 0] },
    material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.1, roughness: 0.9 } });

  // Link roots (the skill owns their world pose). With meshes: the root IS the
  // printed part (glb in the link's local frame, its own PBR material — no
  // scene material override). Without: a hub box + parented bone geometry.
  SO100.links.forEach((l, i) => {
    if (useMeshes) {
      E({ name: 'lnk' + i, geometry: { kind: 'gltf', source: `so100_${l.name}.glb` },
        transform: { position: vp(l.p0), scale: [VIS, VIS, VIS] } });
      return;
    }
    E({ name: 'lnk' + i, geometry: { kind: 'box', half: [0.008, 0.008, 0.008] },
      transform: { position: vp(l.p0), scale: [VIS, VIS, VIS] }, material: { color: PRINT, metallic: 0.05, roughness: 0.55 } });
    if (l.bone) {
      const len = Math.hypot(...l.bone);
      const rot = zyx(alignY(l.bone));
      E({ name: 'bone' + i, geometry: { kind: 'box', half: [0.013, len / 2, 0.013] },
        transform: { position: l.bone.map((v) => v / 2), rotation: rot }, parent: { entity: 'lnk' + i },
        material: { color: PRINT, metallic: 0.05, roughness: 0.55 } });
    }
  });
  if (!useMeshes) {
    // Base plate (in the base's LOCAL frame — URDF Z-up; q0 lays it flat).
    E({ name: 'plate', geometry: { kind: 'roundedBox', half: [0.05, 0.045, 0.008], radius: 0.006, segments: 3 },
      transform: { position: [0, -0.025, 0.008] }, parent: { entity: 'lnk0' },
      material: { color: PRINT, metallic: 0.05, roughness: 0.55 } });
    // Gripper fingers: the fixed jaw (on the gripper link) and the moving jaw
    // both extend −Y in their local frames.
    for (const [nm, host] of [['fingerF', 'lnk5'], ['fingerM', 'lnk6']]) {
      E({ name: nm, geometry: { kind: 'box', half: [0.006, 0.042, 0.010] },
        transform: { position: [0, -0.052, 0] }, parent: { entity: host },
        material: { color: PRINT, metallic: 0.05, roughness: 0.55 } });
    }
  }

  // STS3215 servos: root at the output shaft (skill places it with the PARENT
  // link's motion). Mesh: the reframed Base_Motor glb. Fallback: body box −Z
  // behind the shaft + a horn disc on +Z.
  SO100.servos.forEach((s, i) => {
    if (useMeshes) {
      E({ name: 'srv' + i, geometry: { kind: 'gltf', source: 'so100_sts3215.glb' },
        transform: { position: vp(s.p0), scale: [VIS, VIS, VIS] } });
      return;
    }
    E({ name: 'srv' + i, geometry: { kind: 'box', half: [0.004, 0.004, 0.004] },
      transform: { position: vp(s.p0), scale: [VIS, VIS, VIS] }, material: { color: MOTOR, metallic: 0.3, roughness: 0.5 } });
    E({ name: 'srvBody' + i, geometry: { kind: 'roundedBox', half: [0.0124, 0.0175, 0.0088], radius: 0.003, segments: 3 },
      transform: { position: [0, 0, -0.012], rotation: [Math.PI / 2, 0, 0] }, parent: { entity: 'srv' + i },
      material: { color: MOTOR, metallic: 0.3, roughness: 0.5 } });
    E({ name: 'srvHorn' + i, geometry: { kind: 'cylinder', radius: 0.009, height: 0.005 },
      transform: { position: [0, 0, 0.004], rotation: [Math.PI / 2, 0, 0] }, parent: { entity: 'srv' + i },
      material: { color: HORN, metallic: 0.7, roughness: 0.35 } });
  });

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.45, -1.0, -0.35], intensity: 1.2, castShadows: true } });
  E({ name: 'fill', light: { kind: 'directional', direction: [0.6, -0.25, 0.55], color: [0.6, 0.7, 0.95], intensity: 0.5 } });
  E({ name: 'sky', environment: { sky: { zenith: [0.16, 0.22, 0.34], horizon: [0.42, 0.46, 0.52] }, ambient: { intensity: 0.55 } } });
  E({ name: 'camera', camera: { fovY: 0.65, near: 0.01, far: 60,
    controller: { kind: 'orbit', target: [0, 0.14 * VIS, 0], distance: 0.85 * VIS, yaw: 0.65, pitch: 0.32 } } });
  return { schemaVersion: 1, name: 'so100', entities: ents };
}

// --- the in-engine kinematic placer -------------------------------------------
// Baked constants: the joint table (world-zero pivot/axis) + every root's zero
// pose. Per tick: FK from input angles 0–5 (3×3 Rodrigues about each joint's
// carried axis, exactly @qubekit/sim chain.ts), then pose every root.
function buildSkill() {
  const roots = [];
  SO100.links.forEach((l, i) => roots.push({ name: 'lnk' + i, link: i, p0: vp(l.p0), R0: q2m(l.q0) }));
  SO100.servos.forEach((s, i) => roots.push({ name: 'srv' + i, link: s.parent, p0: vp(s.p0), R0: q2m(s.q0) }));
  const D = JSON.stringify({
    joints: SO100.joints.map((j) => ({ ...j, pivot0: vp(j.pivot0) })),
    roots,
  });
  return `
var D = ${D};
var I = [[1,0,0],[0,1,0],[0,0,1]];
function mul(P,Q){var R=[[0,0,0],[0,0,0],[0,0,0]];for(var i=0;i<3;i++)for(var j=0;j<3;j++){var s=0;for(var k=0;k<3;k++)s+=P[i][k]*Q[k][j];R[i][j]=s;}return R;}
function mv(R,v){return [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2],R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2],R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];}
function add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function rod(a,t){var c=Math.cos(t),s=Math.sin(t),C=1-c,x=a[0],y=a[1],z=a[2];
  return [[c+x*x*C,x*y*C-z*s,x*z*C+y*s],[y*x*C+z*s,c+y*y*C,y*z*C-x*s],[z*x*C-y*s,z*y*C+x*s,c+z*z*C]];}
function zyx(R){var y=Math.asin(Math.max(-1,Math.min(1,-R[2][0])));return {x:Math.atan2(R[2][1],R[2][2]),y:y,z:Math.atan2(R[1][0],R[0][0])};}
onPreStep(function (dt) {
  var M = [{R:I, p:[0,0,0]}];
  for (var i = 0; i < D.joints.length; i++) {
    var j = D.joints[i], mp = M[j.parent];
    var axis = mv(mp.R, j.axis0), pivot = add(mv(mp.R, j.pivot0), mp.p);
    var R = rod(axis, input(i));
    M[j.child] = { R: mul(R, mp.R), p: add(sub(pivot, mv(R, pivot)), mv(R, mp.p)) };
  }
  for (var r = 0; r < D.roots.length; r++) {
    var rt = D.roots[r], m = M[rt.link];
    var e = world.get(rt.name);
    if (!e) continue;
    var p = add(mv(m.R, rt.p0), m.p);
    e.transform.position = { x: p[0], y: p[1], z: p[2] };
    e.transform.rotation = zyx(mul(m.R, rt.R0));
  }
});
`;
}

export function init3D(model, container) {
  const e = bootEngine();
  const skill = buildSkill();
  let raf = 0, last = 0;

  const sizeCanvas = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (e.canvas.width !== cw || e.canvas.height !== ch) { e.canvas.width = cw; e.canvas.height = ch; }
  };
  let ro = null;
  const reSync = () => { sizeCanvas(); window.dispatchEvent(new Event('resize')); };
  const onVisible = () => { if (document.visibilityState === 'visible') requestAnimationFrame(reSync); };

  let disposed = false;
  const loadAll = async () => {
    // Fetch the printed-part glbs first (once per page); provide them BEFORE
    // the scene that references them. Any miss → primitive fallback.
    const m = await loadMeshes();
    if (disposed) return;
    const useMeshes = haveAllMeshes(m);
    if (useMeshes) provideMeshes(m);
    e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
    e.enqueue({ type: 'scene', json: JSON.stringify(buildScene(useMeshes)) });
    // (re-)install our placer — a sibling view may have replaced the skill slot.
    e.enqueue({ type: 'skill', code: skill });
  };

  const frame = (ts) => {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    model.advance(dt);
    if (e.ready) {
      const a = model.angles();
      for (let i = 0; i < 6; i++) e.enqueue({ type: 'input', axis: i, value: a[i] });
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadAll(); else e.onReady = loadAll;
      e.setAutoplay(true);
      if (!ro && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(reSync); ro.observe(container); }
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('pageshow', reSync);
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    },
    stop() { e.setAutoplay(false); if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } },
    resize() { reSync(); },
    dispose() {
      disposed = true;
      e.setAutoplay(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) { ro.disconnect(); ro = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', reSync);
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas);
    },
  };
}
