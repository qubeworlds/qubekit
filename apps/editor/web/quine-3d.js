// Quine-engine 3D view for the drone — the same mechanism as `drone-3d.js`, but
// rendered AND SIMULATED by the real **Quine** wasm engine (Jolt physics). Unlike
// the Three.js view (which eases a kinematic attitude), this drone is a real
// dynamic rigid body: gravity pulls it down, the four rotor thrusts push it up,
// and it collides with — and lands on — the table. A self-stabilising flight
// controller runs as an in-engine skill (altitude-hold + attitude PD + position
// hold), so RPM truly runs against gravity and a throttle cut drops it onto the
// table for real.
//
// Authority split:
//   • host (this file) — turns @qubekit/solver's body wrench into flight TARGETS
//     (pitch / roll / yaw-rate / target-height) and the four rotor throttles,
//     fed into engine input axes every frame.
//   • skill (in-engine) — the flight controller: applies real thrust forces vs
//     gravity, stabilising torques, and position hold to the dynamic `body`; then
//     carries the four spinning prop hubs along the body's physics-driven pose.
//
// The body is a dynamic box collider (its orientation syncs back into the
// Transform); the table is a static box collider. Arms / ducts / rims / camera
// are parented to the body so the airframe is one rigid unit. Hubs are roots the
// skill places from the body's synced pose (so they ride the real motion) and
// spins from the throttle; blades parent to the hubs.
//
// Engine bundle defaults to the public CDN; override with `?engine=<base>`.

const ENGINE_BASE = (new URLSearchParams(location.search).get('engine') ||
  'https://cdn.qubeworlds.com/engine').replace(/\/+$/, '');
const BACKEND = 'quine-webgl2'; // webgl2 is the broad-device floor (iPad Safari)

const S = 100;                          // scene units: QubeKit mm /100 → ~metres
const ARM_A = (110 / S) / Math.SQRT2;   // X-frame half-diagonal (hub offset)
const MASS = 0.3;                       // kg — matches the solver's 300 g cinewhoop
const HOVER_Y = 1.0;                    // altitude setpoint at hover throttle
const REST_Y = 0.09;                    // body-centre height resting on the table

// FR & RL spin CW (red); FL & RR spin CCW (blue) — the X-frame mixer pairing.
const ROTORS = [
  { nm: 'FR', sx: 1, sz: 1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'FL', sx: -1, sz: 1, dir: 1, col: [0.36, 0.55, 0.95] },
  { nm: 'RL', sx: -1, sz: -1, dir: -1, col: [0.88, 0.28, 0.28] },
  { nm: 'RR', sx: 1, sz: -1, dir: 1, col: [0.36, 0.55, 0.95] },
];

// In-engine flight controller — the REAL quad. Lift is the collective rotor
// thrust along the BODY-UP axis (so an inverted craft is pushed DOWN — a rotor
// can't pull), tilt-compensated to hold altitude while upright. A flight
// controller stabilises attitude with a PD torque toward a lean commanded by the
// wrench imbalance, with gentle station-keeping, and fades out when it can't fly
// so a grounded craft just settles flat. The prop hubs (roots) ride the body's
// physics-synced pose and spin at each rotor's actual differential thrust.
//
// Input axes from the host (the @qubekit/solver wrench): 4 = collective thrust
// (N), 5 = roll, 6 = pitch, 7 = yaw. Gains are tuned deterministically in the
// engine's "real quad + flight controller" unit test — keep them identical.
const DRONE_SKILL = `
var NAME='body';
var HUBS=['hubFR','hubFL','hubRL','hubRR'];
var A = ${ARM_A}, W = ${MASS} * 9.81;
var OFF = [[A,0,A],[-A,0,A],[-A,0,-A],[A,0,-A]]; // FR FL RL RR rotor positions
var SX  = [1,-1,-1,1];   // roll split: +X rotors vs -X (visual prop spin)
var SZ  = [1,1,-1,-1];   // pitch split: +Z (front) vs -Z
var SP  = [-1,1,-1,1];   // yaw split: by spin direction
var DIR = [-1,1,-1,1];   // visual hub spin direction
var KLEAN=3.0, LEANMAX=0.38;  // commanded lean from the wrench imbalance (rad)
var KPOSP=0.05, KPOSD=0.10;   // station-keeping: gentle re-centre when balanced
var KP=1.0, KD=0.45;          // attitude PD (world-frame torque)
var KYR=60.0, KYAW=0.18;      // yaw-rate target (from wrench yaw) and its gain
var KDH=0.9, MAXT=20.0, DRAGL=1.1; // vertical damping; thrust clamp; aero drag
var ANG=[0,0,0,0];
function cl(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function rx(a){var c=Math.cos(a),s=Math.sin(a);return [[1,0,0],[0,c,-s],[0,s,c]];}
function ry(a){var c=Math.cos(a),s=Math.sin(a);return [[c,0,s],[0,1,0],[-s,0,c]];}
function rz(a){var c=Math.cos(a),s=Math.sin(a);return [[c,-s,0],[s,c,0],[0,0,1]];}
function mul(P,Q){var R=[[0,0,0],[0,0,0],[0,0,0]];for(var i=0;i<3;i++)for(var j=0;j<3;j++){var s=0;for(var k=0;k<3;k++)s+=P[i][k]*Q[k][j];R[i][j]=s;}return R;}
function mv(R,v){return [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2],R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2],R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];}
function zyx(R){var y=Math.asin(Math.max(-1,Math.min(1,-R[2][0])));return {x:Math.atan2(R[2][1],R[2][2]),y:y,z:Math.atan2(R[1][0],R[0][0])};}

onPreStep(function (dt) {
  var b = world.get(NAME);
  var p = b.body.position, v = b.body.velocity, w = b.body.angularVelocity;
  var e = b.transform.rotation; // Euler ZYX, synced from Jolt
  var Rb = mul(mul(rz(e.z), ry(e.y)), rx(e.x));
  var up = mv(Rb, [0,1,0]); // body-up in world; the rotors push ONLY along this
  var C = input(4), wr = input(5), wp = input(6), wy = input(7);
  var fly = cl((C / W - 0.5) / 0.5, 0, 1); // can it fly? (collective vs weight)
  // target lean from the imbalance + a station-keeping counter-lean. Roll and
  // pitch take opposite position signs (up.x = -sin roll, up.z = +sin pitch).
  var tRoll  = cl(KLEAN*wr + (KPOSP*p.x + KPOSD*v.x), -LEANMAX, LEANMAX);
  var tPitch = cl(KLEAN*wp - (KPOSP*p.z + KPOSD*v.z), -LEANMAX, LEANMAX);
  // collective body-up thrust, tilt-compensated; inverted (up.y<0) -> falls.
  var upy = up[1];
  var thrust = cl((C - KDH*v.y) / (upy > 0.35 ? upy : 0.35), 0, MAXT);
  b.body.addForce({x:up[0]*thrust, y:up[1]*thrust, z:up[2]*thrust});
  b.body.addForce({x:-DRAGL*v.x, y:-DRAGL*v.y, z:-DRAGL*v.z});
  // attitude PD toward the target lean (world frame), faded by 'fly'.
  var rollD  = KP*(tRoll  - e.z);
  var pitchD = KP*(tPitch - e.x);
  var yawD   = KYAW*(KYR*wy - w.y);
  b.body.addTorque({x:fly*pitchD - KD*w.x, y:fly*yawD - KD*w.y, z:fly*rollD - KD*w.z});
  // prop hubs: ride the body pose, each spinning at ITS OWN rotor's thrust
  // (axes 0..3), so turning one rotor on spins only that prop.
  for (var i = 0; i < 4; i++) {
    var spin = input(i); if (spin < 0) spin = 0;
    var o = mv(Rb, OFF[i]);
    var h = world.get(HUBS[i]);
    if (!h) continue;
    ANG[i] = (ANG[i] + DIR[i] * 9.0 * Math.sqrt(spin) * dt) % 6.2831853;
    h.transform.position = { x: p.x + o[0], y: p.y + o[1], z: p.z + o[2] };
    h.transform.rotation = zyx(mul(Rb, ry(ANG[i]))); // disc stays parallel to body
  }
});
`;

// QubeKit cinewhoop spec (mm), scaled /100 to ~metre units the engine renders at.
function buildDroneScene() {
  const bodyW = 90 / S, bodyH = 26 / S, bodyD = 70 / S;
  const ductR = 62 / S, ductH = 16 / S, propR = 52 / S;
  const a = ARM_A;
  const ents = [];
  const E = (o) => ents.push(o);

  // The TABLE: a static box collider the drone lands on, top surface at y = 0.
  // Surfaced with a procedural stone texture (host-generated, handed to the engine
  // via quine_provide_asset; the material's `texture` names it). Base colour is a
  // light cool grey the texture multiplies.
  E({ name: 'floor', geometry: { kind: 'box', half: [5, 0.15, 5] },
    transform: { position: [0, -0.15, 0] },
    body: { motion: 'static', collider: { kind: 'box', halfExtents: [5, 0.15, 5] }, friction: 0.7 },
    material: { color: [0.78, 0.78, 0.82, 1], texture: STONE_ASSET, metallic: 0.0, roughness: 0.96 } });

  // The BODY: a real DYNAMIC rigid body (mass = MASS). Its box collider spans the
  // duct footprint and is shallow, so the craft rests flat on its ducts. Jolt
  // owns its pose; sync_rotation feeds the bank back into the Transform.
  E({ name: 'body', geometry: { kind: 'roundedBox', half: [bodyW / 2, bodyH / 2, bodyD / 2], radius: 0.05, segments: 4 },
    transform: { position: [0, HOVER_Y, 0] },
    body: { motion: 'dynamic', mass: MASS, friction: 0.6, collider: { kind: 'box', halfExtents: [a + ductR, REST_Y, a + ductR] } },
    material: { color: [0.82, 0.84, 0.88, 1], metallic: 0.5, roughness: 0.45 } });
  E({ name: 'cam', geometry: { kind: 'box', half: [0.10, 0.07, 0.07] },
    transform: { position: [0, -0.01, bodyD / 2 + 0.10] }, parent: { entity: 'body' },
    material: { color: [0.08, 0.09, 0.12, 1], metallic: 0.3, roughness: 0.5 } });

  for (const r of ROTORS) {
    const x = r.sx * a, z = r.sz * a;
    const ang = -Math.atan2(z, x), dist = Math.hypot(x, z);
    // arm + duct shroud + rim ride the body (parented; local coords).
    E({ name: 'arm' + r.nm, geometry: { kind: 'box', half: [dist / 2, 0.022, 0.022] },
      transform: { position: [x / 2, -0.02, z / 2], rotation: [0, ang, 0] }, parent: { entity: 'body' },
      material: { color: [0.16, 0.18, 0.22, 1], metallic: 0.4, roughness: 0.5 } });
    E({ name: 'shroud' + r.nm, geometry: { kind: 'tube', innerRadius: propR + 0.02, outerRadius: ductR, height: ductH },
      transform: { position: [x, 0, z] }, parent: { entity: 'body' },
      material: { color: [0.14, 0.15, 0.18, 1], metallic: 0.2, roughness: 0.6 } });
    E({ name: 'rim' + r.nm, geometry: { kind: 'torus', majorRadius: (propR + 0.02 + ductR) / 2, minorRadius: 0.018, majorSegments: 40, minorSegments: 14 },
      transform: { position: [x, ductH / 2, z] }, parent: { entity: 'body' },
      material: { color: [0.10, 0.11, 0.14, 1], metallic: 0.3, roughness: 0.5 } });
    // hub is a ROOT (world coords) so the skill owns its pose; it carries it along
    // the body's physics motion. Blades parent to it and ride the spin.
    E({ name: 'hub' + r.nm, geometry: { kind: 'cylinder', radius: 0.045, height: 0.05 },
      transform: { position: [x, HOVER_Y, z] }, material: { color: [0.05, 0.05, 0.06, 1], metallic: 0.6, roughness: 0.4 } });
    for (let b = 0; b < 2; b++) {
      E({ name: 'blade' + r.nm + b, geometry: { kind: 'box', half: [propR, 0.006, 0.05] },
        transform: { position: [0, 0.02, 0], rotation: [0, b * Math.PI / 2, 0] }, parent: { entity: 'hub' + r.nm },
        material: { color: [r.col[0], r.col[1], r.col[2], 1], metallic: 0.1, roughness: 0.4 } });
    }
  }

  // Orientation labels via the engine's `text` primitive (an extruded vector
  // font): "UP" on the top face, "DOWN" on the underside. The text mesh is built
  // in the XY plane facing +Z, so we rotate ∓90° about X to lay it flat on each
  // face. Parented to the body, they tip with it — a glance tells you the craft's
  // attitude (and which way is up after it lands).
  const LBL = [0.05, 0.06, 0.09, 1];
  E({ name: 'lblUp', geometry: { kind: 'text', value: 'UP', height: 0.18, depth: 0.015, thickness: 0.022 },
    transform: { position: [0, bodyH / 2 + 0.006, 0], rotation: [-Math.PI / 2, 0, 0] }, parent: { entity: 'body' },
    material: { color: LBL, metallic: 0.0, roughness: 0.6 } });
  E({ name: 'lblDown', geometry: { kind: 'text', value: 'DOWN', height: 0.15, depth: 0.015, thickness: 0.02 },
    transform: { position: [0, -(bodyH / 2 + 0.006), 0], rotation: [Math.PI / 2, 0, 0] }, parent: { entity: 'body' },
    material: { color: LBL, metallic: 0.0, roughness: 0.6 } });

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.4, -1.0, -0.5], intensity: 1.15, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.22, 0.36, 0.58], horizon: [0.60, 0.66, 0.72] }, ambient: { intensity: 0.6 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.75, 0], distance: 4.8, yaw: 0.7, pitch: 0.40 } } });
  return { schemaVersion: 1, name: 'drone', gravity: [0, -9.81, 0], entities: ents };
}

// --- procedural stone texture -----------------------------------------------
// The engine is content-agnostic — it samples whatever texture the host hands it.
// So we generate a stone slab here (fractal value-noise greys + a few darker
// veins + speckle), encode it as PNG, and hand the bytes to the engine. The floor
// material references it by name; the renderer samples it with the box's UVs.
const STONE_ASSET = 'qubekit_stone.png';
let stonePngBytes = null;

function makeStoneTexture(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  // A few octaves of value noise: a coarse random lattice bilinearly sampled,
  // summed at halving amplitude. Seeded + deterministic (no Math.random reliance
  // on order — fixed seed gives the same slab every load).
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const octave = (cells) => {
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {
      const fx = x * cells, fy = y * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const s = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t)); // smoothstep lerp
      const i00 = iy * (cells + 1) + ix;
      return s(s(g[i00], g[i00 + 1], tx), s(g[i00 + cells + 1], g[i00 + cells + 2], tx), ty);
    };
  };
  const o1 = octave(4), o2 = octave(8), o3 = octave(16), o4 = octave(48);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = o1(u, v) * 0.5 + o2(u, v) * 0.27 + o3(u, v) * 0.15 + o4(u, v) * 0.08;
      // mid grey with mottling; veins where the mid-frequency noise dips.
      let g = 0.42 + n * 0.42;
      const vein = Math.abs(o3(u, v) - 0.5);
      if (vein < 0.04) g *= 0.6 + vein * 6; // darker cracks
      g += (rnd() - 0.5) * 0.05; // fine speckle
      g = Math.max(0, Math.min(1, g));
      const i = (y * size + x) * 4;
      // a faintly warm grey stone (R≈G slightly > B)
      d[i] = (g * 255) | 0;
      d[i + 1] = (g * 251) | 0;
      d[i + 2] = (g * 240) | 0;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const b64 = cv.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Hand the stone PNG to the engine's asset registry (must precede the scene that
// references it). Staged into wasm memory with _malloc/HEAPU8 like every asset.
function provideStone() {
  try {
    if (!stonePngBytes) stonePngBytes = makeStoneTexture(512);
    const m = window.Module, n = stonePngBytes.length;
    const p = m._malloc(n);
    m.HEAPU8.set(stonePngBytes, p);
    m.ccall('quine_provide_asset', null, ['string', 'number', 'number'], [STONE_ASSET, p, n]);
    m._free(p);
  } catch (_) {}
}

// The engine is a single Emscripten module per page; boot it once, lazily.
let engine = null;
function bootEngine() {
  if (engine) return engine;
  const canvas = document.createElement('canvas');
  canvas.id = 'quine-canvas';
  canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;touch-action:none';
  const e = { canvas, ready: false, pending: null, skillLoaded: false };
  e.enqueue = (o) => { try { window.Module.ccall('quine_enqueue', null, ['string'], [JSON.stringify(o)]); } catch (_) {} };
  e.setAutoplay = (on) => { try { window.Module.ccall('quine_set_autoplay', null, ['number'], [on ? 1 : 0]); } catch (_) {} };

  window.Module = {
    canvas,
    locateFile: (p) => ENGINE_BASE + '/' + p,
    print: () => {}, printErr: () => {},
    onRuntimeInitialized() {
      e.ready = true;
      if (e.pending) loadAll(e, e.pending);
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

// Hand the engine the scene, the grid-off preference, and (once) the flight skill.
function loadAll(e, scene) {
  e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
  provideStone(); // register the stone PNG BEFORE the scene that references it
  e.enqueue({ type: 'scene', json: JSON.stringify(scene) });
  if (!e.skillLoaded) { e.enqueue({ type: 'skill', code: DRONE_SKILL }); e.skillLoaded = true; }
}

// Match the editor's 3D-view contract: init3D(model, container) -> view handle.
export function init3D(model, container) {
  const e = bootEngine();
  const scene = buildDroneScene();
  let raf = 0;

  // Resize the drawing buffer to the container. CRITICAL: bail when the container
  // has no size — when the tab is hidden (display:none) or the page is backgrounded
  // its clientWidth/Height read 0, and sizing to 0/1 leaves a 1px canvas that
  // persists ("shrinks to a small rectangle" on tab return). We only ever resize
  // to a real size, and re-sync (below) when the view becomes visible again.
  const sizeCanvas = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w < 2 || h < 2) return; // hidden / backgrounded — leave the buffer intact
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (e.canvas.width !== cw || e.canvas.height !== ch) {
      e.canvas.width = cw;
      e.canvas.height = ch;
    }
  };
  // Re-sync whenever the container actually changes size (orientation flip, layout
  // reflow) or the page comes back to the foreground. A backgrounded tab can resize
  // the GL canvas behind our back; this re-asserts the right size on return.
  let ro = null;
  const reSync = () => { sizeCanvas(); window.dispatchEvent(new Event('resize')); };
  const onVisible = () => { if (document.visibilityState === 'visible') requestAnimationFrame(reSync); };

  // Per frame: hand the in-engine flight controller the raw @qubekit/solver wrench
  // — collective thrust + roll/pitch/yaw — and let it fly the real rigid body. The
  // controller derives per-rotor body-up thrust from these (lift, lean, yaw all
  // emerge); the visual props spin at those thrusts. Nothing here pre-bakes the
  // attitude — the physics does.
  const flight = () => {
    if (e.ready && model && typeof model.wrench === 'function') {
      const w = model.wrench();
      const t = w.thrusts || [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) e.enqueue({ type: 'input', axis: i, value: t[i] }); // per-rotor thrust (visual spin)
      e.enqueue({ type: 'input', axis: 4, value: w.thrust }); // collective (N)
      e.enqueue({ type: 'input', axis: 5, value: w.roll });   // roll wrench (N·m)
      e.enqueue({ type: 'input', axis: 6, value: w.pitch });  // pitch wrench
      e.enqueue({ type: 'input', axis: 7, value: w.yaw });    // yaw wrench
    }
    raf = requestAnimationFrame(flight);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadAll(e, scene); else e.pending = scene;
      e.setAutoplay(true);
      if (!ro && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(reSync); ro.observe(container); }
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('pageshow', reSync);
      if (!raf) raf = requestAnimationFrame(flight);
    },
    stop() { e.setAutoplay(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize() { reSync(); },
    dispose() {
      e.setAutoplay(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) { ro.disconnect(); ro = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', reSync);
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas); // keep the engine; just detach
    },
  };
}
