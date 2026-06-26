// Flyball governor — 3D. The spindle spins about the vertical axis at the true
// rate; the solver's governor() equilibrium sets the arm angle (eased), so the
// balls revolve and swing out, the sleeve rises, and the spring compresses. The
// bevel-gear right-angle drive turns the horizontal belt shaft (vertical→
// horizontal). Three.js (vendored). Drag to orbit; two-finger / wheel zoom.

import * as THREE from './vendor/three.module.js';
import { spring as makeSpring, bevelGear } from './parts3d.js';

export function init3D(model, container) {
  const { params, geo } = model;
  const baseY = 14; // bevel-mesh corner height

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(140, 180, 220); scene.add(key);
  const fillL = new THREE.DirectionalLight(0x8aa6ff, 0.4); fillL.position.set(-140, 40, -90); scene.add(fillL);

  const steel = (c = 0xb8bcc4) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.4 });
  const brass = () => new THREE.MeshStandardMaterial({ color: 0xb88a4e, metalness: 0.92, roughness: 0.38 });
  const bronze = (c = 0xcd7f32) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.88, roughness: 0.3 }); // shaft (gold/bronze)

  // --- rotating assembly (spins about Y) ---
  const spinner = new THREE.Group(); scene.add(spinner);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, geo.spindleTop - baseY, 20), bronze());
  spindle.position.y = (geo.spindleTop + baseY) / 2; spinner.add(spindle);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(params.pivotRadius + 3, params.pivotRadius + 3, 6, 28), steel());
  hub.position.y = geo.yPivot; spinner.add(hub);

  // arms + balls (two, opposite); pivot groups rotate about Z by ±θ. Arms hang
  // from the pivots to the balls (balls below; gravity rests them low, speed lifts).
  const arms = [];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const pivot = new THREE.Group(); pivot.position.set(side * params.pivotRadius, geo.yPivot, 0); spinner.add(pivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, params.armLength, 3), steel(0x9aa6b8));
    arm.position.y = -params.armLength / 2; pivot.add(arm);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(geo.ballR, 28, 20), brass());
    ball.position.y = -params.armLength; pivot.add(ball);
    arms.push({ pivot, side });
  }

  // No sliding sleeve in 3D — it can't sit over the bevel gear. The governing
  // action is the balls flying out + the spring; the valve collar is shown in 2D.

  // spring: reusable helical part (toolbox), normalized to y∈[0,1], scaled to compress
  const spring = makeSpring({ radius: 7, wire: 1.1, coils: 8 });
  spinner.add(spring);

  // bevel-gear right-angle drive with REAL teeth (toolbox bevelGear): a vertical
  // gear on the spindle meshing a horizontal gear on the belt shaft; toes meet
  // at the corner (0, baseY, 0).
  const BZ = 14, BR = 8, BM = (2 * BR) / BZ, BFW = BR * 0.7;
  const axialV = BFW * Math.cos(model.bevel.coneAngle1);
  const vGear = bevelGear({ teeth: BZ, module: BM, faceWidth: BFW, coneAngle: model.bevel.coneAngle1, color: 0xb8bcc4 });
  vGear.rotation.x = Math.PI / 2; vGear.position.y = baseY + axialV; spinner.add(vGear); // large end up, toe at corner

  // --- horizontal shaft (spins about X): bevel gear + shaft + belt pulley ---
  const hShaft = new THREE.Group(); hShaft.position.set(0, baseY, 0); scene.add(hShaft);
  const hGear = bevelGear({ teeth: BZ, module: BM, faceWidth: BFW, coneAngle: model.bevel.coneAngle2, color: 0xb88a4e });
  hGear.rotation.y = -Math.PI / 2; hGear.position.set(axialV, 0, 0); hShaft.add(hGear); // toe toward the corner
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 22, 16), bronze());
  shaft.rotation.z = Math.PI / 2; shaft.position.set(20, 0, 0); hShaft.add(shaft);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 6, 28), steel(0x6b7a93));
  pulley.rotation.z = Math.PI / 2; pulley.position.set(32, 0, 0); hShaft.add(pulley);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13, 1.6), steel(0xcbd5e1));
  spoke.position.set(32, 0, 0); hShaft.add(spoke);

  // --- camera framing + orbit/zoom ---
  const top = geo.spindleTop;
  const center = new THREE.Vector3(0, (baseY + top) / 2, 0);
  const radius = Math.max(top - baseY, 2 * (params.pivotRadius + params.armLength)) / 2;
  let az = 0.5, el = 0.34, dist = radius * 2.9;
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
    else { az -= dx * 0.01; el = Math.max(-0.4, Math.min(1.3, el + dy * 0.01)); placeCamera(); }
  });
  const onWheel = (e) => { e.preventDefault(); dist = clampDist(dist * Math.exp(e.deltaY * 0.001)); placeCamera(); };
  dom.addEventListener('wheel', onWheel, { passive: false });

  function resize() { const w = container.clientWidth || 900, h = container.clientHeight || 540; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); placeCamera(); }
  const onResize = () => resize(); window.addEventListener('resize', onResize);

  // --- animation ---
  const orientLink = (link, ax, ay, bx, by) => {
    link.position.set((ax + bx) / 2, (ay + by) / 2, 0);
    link.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
    link.scale.y = (Math.hypot(bx - ax, by - ay) || 1) / 20;
  };
  let thetaDisp = model.state().theta, spinPhase = 0, last = 0, raf = 0, running = false;
  function update(dt) {
    const target = model.state().theta;
    thetaDisp += (target - thetaDisp) * Math.min(1, dt * 6);
    spinPhase += model.omega * dt; // true rate
    spinner.rotation.y = spinPhase;
    hShaft.rotation.x = -spinPhase; // 90° drive

    for (const a of arms) a.pivot.rotation.z = a.side * thetaDisp;
    const springBot = geo.sleeveRest + params.sleeveArm * Math.sin(thetaDisp); // spring compresses with speed
    spring.position.y = springBot;
    spring.scale.y = Math.max(1, geo.springTop - springBot);
  }
  function frame(t) {
    if (!running) return;
    if (!last) last = t; const dt = (t - last) / 1000; last = t;
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
