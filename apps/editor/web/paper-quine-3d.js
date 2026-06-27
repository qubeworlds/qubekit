// Quine-engine 3D view for the Paper / Fabric demo — a draped sheet rendered AND
// SIMULATED by the real Quine wasm engine as a Jolt **soft body** (XPBD). The
// sheet is an nx×nz constrained vertex grid: its back edge is pinned, it drapes
// under gravity over a few objects on the table, and one front corner is a
// host-driven handle the Lift slider peels upward to uncover them. No flight
// skill, no per-frame authoring — the engine owns the cloth; this view only
// hands it the handle offset (input axes) and rebuilds the scene on a material
// switch (paper ⇄ fabric changes the grid + solver-iteration count).
//
// Shares the SINGLE engine module with the drone view (one WebGL context).

import { bootEngine } from './quine-3d.js';

// A few QubeKit-flavoured objects under the sheet, so peeling it back reveals
// something (the demo's payoff). Each is a STATIC rigid body so the soft body
// drapes over and rests on it; the cloth starts flat just above the tallest.
function revealObjects(E) {
  const stat = (half) => ({ motion: 'static', collider: { kind: 'box', halfExtents: half } });
  // a brass gear lying flat
  E({ name: 'r_gear', geometry: { kind: 'gear', module: 0.012, teeth: 14, pressureAngle: 0.349, thickness: 0.05, boreRadius: 0.02 },
    transform: { position: [-0.16, 0.025, 0.05], rotation: [Math.PI / 2, 0, 0] },
    body: stat([0.11, 0.06, 0.11]),
    material: { color: [0.84, 0.66, 0.28, 1], metallic: 0.8, roughness: 0.35 } });
  // a short stack of two coloured beams (crossed)
  E({ name: 'r_beamA', geometry: { kind: 'box', half: [0.16, 0.02, 0.035] },
    transform: { position: [0.12, 0.02, -0.04] }, body: stat([0.16, 0.02, 0.035]),
    material: { color: [0.27, 0.5, 0.86, 1], metallic: 0.1, roughness: 0.5 } });
  E({ name: 'r_beamB', geometry: { kind: 'box', half: [0.035, 0.02, 0.15] },
    transform: { position: [0.14, 0.06, -0.02] }, body: stat([0.035, 0.02, 0.15]),
    material: { color: [0.9, 0.42, 0.3, 1], metallic: 0.1, roughness: 0.5 } });
  // an axle stub
  E({ name: 'r_axle', geometry: { kind: 'cylinder', radius: 0.02, height: 0.16, segments: 20 },
    transform: { position: [0.02, 0.03, 0.2], rotation: [0, 0, Math.PI / 2] },
    body: stat([0.09, 0.03, 0.03]),
    material: { color: [0.6, 0.62, 0.68, 1], metallic: 0.7, roughness: 0.4 } });
  // a round knob
  E({ name: 'r_knob', geometry: { kind: 'sphere', radius: 0.05, rings: 14, segments: 22 },
    transform: { position: [-0.06, 0.05, -0.18] }, body: { motion: 'static', collider: { kind: 'sphere', radius: 0.05 } },
    material: { color: [0.45, 0.78, 0.5, 1], metallic: 0.2, roughness: 0.45 } });
}

function buildClothScene(p) {
  const ents = [];
  const E = (o) => ents.push(o);

  // The TABLE: a static box, top surface at y = 0, that the sheet drapes onto.
  E({ name: 'table', geometry: { kind: 'box', half: [1.0, 0.1, 1.0] },
    transform: { position: [0, -0.1, 0] },
    body: { motion: 'static', collider: { kind: 'box', halfExtents: [1.0, 0.1, 1.0] }, friction: 0.8 },
    material: { color: [0.36, 0.27, 0.19, 1], metallic: 0.0, roughness: 0.85 } });

  revealObjects(E);

  // THE SHEET: a real Jolt soft body. Centred on the table, started flat just
  // above the objects; pinned along its back edge; the front-right corner is the
  // handle (axes 0,1,2 offset it). Two-sided look comes from the lit material.
  E({ name: 'sheet', geometry: {
      kind: 'cloth', nx: p.nx, nz: p.nz, spacing: p.spacing, iterations: p.iterations,
      pin: p.pin, handleI: p.handleI, handleJ: p.handleJ,
    },
    transform: { position: [0, 0.16, 0] },
    material: { color: p.color, metallic: 0.0, roughness: 0.78 } });

  E({ name: 'sun', light: { kind: 'directional', direction: [-0.35, -1.0, -0.45], intensity: 1.2, castShadows: true } });
  E({ name: 'sky', environment: { sky: { zenith: [0.20, 0.33, 0.55], horizon: [0.62, 0.66, 0.70] }, ambient: { intensity: 0.65 } } });
  E({ name: 'camera', camera: { fovY: 0.7, controller: { kind: 'orbit', target: [0, 0.12, 0], distance: 1.9, yaw: 0.6, pitch: 0.42 } } });
  return { schemaVersion: 1, name: 'cloth', gravity: [0, -9.81, 0], entities: ents };
}

// Hand the engine a scene (cloth needs no skill). Replace the skill slot with an
// empty program so a previously-loaded sibling skill (the drone controller)
// stops running while this view is active.
function loadCloth(e, scene) {
  e.enqueue({ type: 'config', config: { preferences: { grid: false, gizmo: false } } });
  e.enqueue({ type: 'scene', json: JSON.stringify(scene) });
  e.enqueue({ type: 'skill', code: '' });
}

export function init3D(model, container) {
  const e = bootEngine();
  let raf = 0;
  let lastMode = null;

  const sizeCanvas = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w < 2 || h < 2) return; // hidden / backgrounded — leave the buffer intact
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (e.canvas.width !== cw || e.canvas.height !== ch) { e.canvas.width = cw; e.canvas.height = ch; }
  };
  let ro = null;
  const reSync = () => { sizeCanvas(); window.dispatchEvent(new Event('resize')); };
  const onVisible = () => { if (document.visibilityState === 'visible') requestAnimationFrame(reSync); };

  const loadFor = (mode) => { lastMode = mode; loadCloth(e, buildClothScene(model.clothParams())); };

  // Per frame: rebuild the scene if the material toggled (paper ⇄ fabric is a
  // different soft body), then drive the handle vertex from the model's peel
  // offset via input axes 0 (x), 1 (y), 2 (z).
  const drive = () => {
    if (e.ready) {
      if (model.mode !== lastMode) loadFor(model.mode);
      const o = model.handleOffset();
      e.enqueue({ type: 'input', axis: 0, value: o.x });
      e.enqueue({ type: 'input', axis: 1, value: o.y });
      e.enqueue({ type: 'input', axis: 2, value: o.z });
    }
    raf = requestAnimationFrame(drive);
  };

  return {
    start() {
      if (e.canvas.parentNode !== container) container.appendChild(e.canvas);
      sizeCanvas();
      if (e.ready) loadFor(model.mode); else e.onReady = () => loadFor(model.mode);
      e.setAutoplay(true);
      if (!ro && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(reSync); ro.observe(container); }
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('pageshow', reSync);
      if (!raf) raf = requestAnimationFrame(drive);
    },
    stop() { e.setAutoplay(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize() { reSync(); },
    dispose() {
      e.setAutoplay(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) { ro.disconnect(); ro = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', reSync);
      if (e.canvas.parentNode) e.canvas.parentNode.removeChild(e.canvas);
    },
  };
}
