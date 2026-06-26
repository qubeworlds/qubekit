// Drone — 3D. The quad hovers over the table; the four slider RPMs spin the four
// shrouded props (counter-rotating pairs), and the body wrench they produce
// (quadWrench) banks, turns, and lifts the airframe: a thrust imbalance tilts it,
// a spin-direction imbalance yaws it, and total lift vs weight sets its height.
// A light damped integrator keeps the response readable, not a tumbling sim.
// Three.js (vendored), mm scene units. Drag to orbit.

import * as THREE from './vendor/three.module.js';

export function init3D(model, container) {
  const { params, geo, rotors } = model;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(180, 320, 240); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa6ff, 0.35); fill.position.set(-160, 120, -160); scene.add(fill);

  const mat = (c, m = 0.5, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });

  const reach = params.armLength + geo.ductR;
  const table = new THREE.Mesh(new THREE.BoxGeometry(reach * 3, 14, reach * 2.4), mat(0x2c3344, 0.2, 0.85));
  table.position.y = -7; scene.add(table);

  const H0 = reach * 1.7; // hover height over the table
  const drone = new THREE.Group(); drone.position.y = H0; scene.add(drone);
  drone.rotation.order = 'YXZ';

  // body
  drone.add(new THREE.Mesh(new THREE.BoxGeometry(geo.bodyW, geo.bodyH, geo.bodyD), mat(0xd7dbe2, 0.4, 0.5)));
  const cam = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 14), mat(0x11151c, 0.2, 0.6)); cam.position.set(0, -2, geo.bodyD / 2); drone.add(cam);

  // per-rotor: arm + duct ring + spinning prop group
  const props = [];
  rotors.forEach((r) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), mat(0x3a4154, 0.6, 0.4));
    const len = Math.hypot(r.x, r.z);
    arm.scale.z = len / 8; arm.position.set(r.x / 2, 0, r.z / 2);
    arm.lookAt(r.x, 0, r.z); drone.add(arm);

    const duct = new THREE.Mesh(new THREE.TorusGeometry(geo.ductR, 6, 12, 32), mat(0x1b2030, 0.5, 0.5));
    duct.rotation.x = Math.PI / 2; duct.position.set(r.x, geo.ductH / 2, r.z); drone.add(duct);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(geo.ductR, geo.ductR, geo.ductH, 32, 1, true), mat(0x232a3a, 0.4, 0.6));
    ring.position.set(r.x, geo.ductH / 2, r.z); drone.add(ring);

    const prop = new THREE.Group(); prop.position.set(r.x, geo.ductH + 3, r.z); drone.add(prop);
    const bladeMat = mat(r.spin === 1 ? 0x6f9eff : 0xff7a7a, 0.2, 0.5);
    for (const k of [0, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(geo.propR * 2, 1.5, 9), bladeMat);
      blade.rotation.y = k * Math.PI; prop.add(blade);
    }
    prop.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 8, 12), mat(0x11151c)));
    props.push({ group: prop, spin: r.spin });
  });

  // --- camera framing + orbit/zoom ---
  const center = new THREE.Vector3(0, H0, 0);
  const radius = reach * 1.3;
  let az = 0.7, el = 0.35, dist = radius * 2.8;
  const minDist = radius * 1.1, maxDist = radius * 6;
  const clampDist = (d) => Math.max(minDist, Math.min(maxDist, d));
  function placeCamera() {
    camera.up.set(0, 1, 0);
    camera.position.set(center.x + dist * Math.sin(az) * Math.cos(el), center.y + dist * Math.sin(el), center.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(center);
  }
  const dom = renderer.domElement; dom.style.touchAction = 'none';
  const pointers = new Map(); let pinchStart = 0, distAtPinch = 0;
  const span = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  dom.addEventListener('pointerdown', (e) => { dom.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { pinchStart = span(); distAtPinch = dist; } });
  const drop = (e) => pointers.delete(e.pointerId);
  dom.addEventListener('pointerup', drop); dom.addEventListener('pointercancel', drop);
  dom.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { if (pinchStart > 0) { dist = clampDist(distAtPinch * (pinchStart / span())); placeCamera(); } }
    else { az -= dx * 0.01; el = Math.max(-0.2, Math.min(1.3, el + dy * 0.01)); placeCamera(); }
  });
  const onWheel = (e) => { e.preventDefault(); dist = clampDist(dist * Math.exp(e.deltaY * 0.001)); placeCamera(); };
  dom.addEventListener('wheel', onWheel, { passive: false });
  function resize() { const w = container.clientWidth || 900, h = container.clientHeight || 540; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); placeCamera(); }
  const onResize = () => resize(); window.addEventListener('resize', onResize);

  // damped attitude state — eased toward the wrench's steady response so four raw
  // RPM sliders read as bank / turn / climb instead of an unstable free body.
  let heading = 0, rollA = 0, pitchA = 0, hgt = H0, last = 0, raf = 0, running = false;
  const ease = (cur, target, dt, k) => cur + (target - cur) * Math.min(1, dt * k);
  function update(dt) {
    const w = model.wrench(), sp = model.speeds();
    const targetRoll = Math.max(-0.5, Math.min(0.5, -w.roll * 32)); // right-heavy → bank
    const targetPitch = Math.max(-0.5, Math.min(0.5, w.pitch * 32));
    const targetH = Math.max(H0 * 0.2, Math.min(H0 * 1.8, H0 + (w.thrust - w.weight) * 240));
    rollA = ease(rollA, targetRoll, dt, 3);
    pitchA = ease(pitchA, targetPitch, dt, 3);
    hgt = ease(hgt, targetH, dt, 2);
    heading += w.yaw * dt * 70; // yaw torque → turn rate
    drone.rotation.set(pitchA, heading, rollA); // pitch X, yaw Y, roll Z (order YXZ)
    drone.position.y = hgt;
    props.forEach((p, i) => { p.group.rotation.y += p.spin * sp[i] * dt * 0.01; });
  }
  function frame(ts) {
    if (!running) return;
    if (!last) last = ts; const dt = (ts - last) / 1000; last = ts;
    update(dt); renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  return {
    start() { if (running) return; running = true; last = 0; resize(); update(0); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    dispose() { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose(); renderer.forceContextLoss?.(); if (dom.parentNode) dom.parentNode.removeChild(dom); },
  };
}
