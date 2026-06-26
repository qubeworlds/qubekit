// Drone — 3D via the QUINE engine (Jolt physics). Replaces the Three.js drone
// view: the quad is a real dynamic rigid body over a static table, so the rotors
// collide with the table instead of clipping through. The four RPM faders are
// pushed as input axes 1..4; an in-engine skill turns them into thrust forces +
// a yaw couple each tick (see quine/drone.skill.js). The solver mixer still backs
// the 2D view and the facts line; here Jolt does the flying.
//
// The engine is a page singleton (emscripten can't cleanly re-init), so it boots
// once and its canvas is moved between detached/attached rather than re-created.

import { mountQuineScene } from './quine/quine-loader.js';

// bump on every CDN engine republish so the editor pulls the new wasm
const ENGINE_VERSION = '0.0.4-drone1';

let engine = null; // { canvas, view, ready, failed }

function bootEngine(onStatus) {
  if (engine) return engine;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0f1115';
  engine = { canvas, view: null, failed: null, ready: null };
  const bust = `?v=${encodeURIComponent(ENGINE_VERSION)}`; // also busts the scene/skill (gate caches non-HTML 5 min)
  engine.ready = mountQuineScene({
    canvas,
    sceneUrl: './quine/drone.scene.json' + bust,
    skillUrl: './quine/drone.skill.js' + bust,
    version: ENGINE_VERSION,
    gpu: 'webgl2', // pinned: the engine's WebGPU path renders blank on some browsers (qubegame pins it too) — verify before enabling auto
    onStatus,
  }).then((v) => { engine.view = v; }).catch((e) => { engine.failed = e; throw e; });
  return engine;
}

export function init3D(model, container) {
  container.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;left:8px;bottom:6px;font:11px ui-monospace,monospace;color:#6b7280;pointer-events:none;max-width:90%;white-space:pre-wrap';
  container.appendChild(overlay);

  const eng = bootEngine((line) => { overlay.textContent = line; });
  container.appendChild(eng.canvas);
  eng.ready.catch((e) => {
    overlay.style.color = '#f87171';
    overlay.textContent = 'Quine engine failed to load: ' + (e && e.message ? e.message : e) + '\n(2D view still works)';
  });

  const norm = (rpm) => Math.max(0, Math.min(1, rpm / model.maxRpm));
  const last = [null, null, null, null];
  let raf = 0, running = false;

  function pushAxes() {
    if (!eng.view) return;
    const vals = model.values;
    for (let i = 0; i < 4; i++) {
      const a = norm(vals[i]);
      if (a !== last[i]) { eng.view.setAxis(i + 1, a); last[i] = a; }
    }
  }
  function frame() { if (!running) return; pushAxes(); raf = requestAnimationFrame(frame); }

  function sizeCanvas() {
    const w = container.clientWidth || 900, h = container.clientHeight || 540;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    eng.canvas.width = Math.round(w * dpr); eng.canvas.height = Math.round(h * dpr);
  }

  return {
    start() {
      if (running) return;
      running = true;
      if (eng.canvas.parentNode !== container) container.appendChild(eng.canvas);
      sizeCanvas();
      last.fill(null); // force a re-push so the engine gets the current fader state
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { sizeCanvas(); },
    // Keep the singleton engine alive; just detach its canvas so another
    // mechanism's view can own the container. (No emscripten teardown.)
    dispose() {
      running = false; cancelAnimationFrame(raf);
      if (eng.canvas.parentNode) eng.canvas.parentNode.removeChild(eng.canvas);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}
