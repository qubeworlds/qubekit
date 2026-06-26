// 3D view — extrudes each gear's involute profile (from @qubekit/solver) into a
// real spur gear, bolts on a slider-crank steam engine, and renders with
// Three.js (vendored). One finger/drag orbits; two fingers / wheel zoom.
//
// Demo viewer (like world's teleport hero uses THREE); the production 3D path is
// the quine engine, which can render the same scene later.

import * as THREE from './vendor/three.module.js';

export function init3D(model, container) {
  const { gears, cx, cy, steam, bridge } = model;
  const DEPTH = 12;        // gear thickness (mm)
  const zFront = 10;       // steam-engine plane, in front of the gear faces

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 8000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(90, 140, 220); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa6ff, 0.45); fill.position.set(-140, -40, 120); scene.add(fill);

  // --- gears ---
  const gearMeshes = gears.map((g, i) => {
    const shape = new THREE.Shape();
    g.outline.forEach(([x, y], k) => (k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    const hole = new THREE.Path(); hole.absarc(0, 0, g.module * 1.6, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 1, steps: 1 });
    geo.translate(0, 0, -DEPTH / 2);
    const locked = model.locked && i === bridge;
    const color = locked ? 0xc0392b : i % 2 === 0 ? 0xb8bcc4 : 0xb88a4e;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.92, roughness: 0.42, side: THREE.DoubleSide }));
    mesh.position.set(cx[i], cy[i], 0);
    scene.add(mesh); return mesh;
  });

  // --- steam engine (slider-crank) ---
  const cylH = steam.cylTop - steam.cylBot;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(steam.boreHalf + 1.5, steam.boreHalf + 1.5, cylH, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x6b7a93, metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  cyl.position.set(steam.axisX, (steam.cylBot + steam.cylTop) / 2, zFront);
  scene.add(cyl);

  const piston = new THREE.Mesh(
    new THREE.CylinderGeometry(steam.boreHalf, steam.boreHalf, steam.pistonHalf * 2, 28),
    new THREE.MeshStandardMaterial({ color: 0xc9d2de, metalness: 0.9, roughness: 0.35 }),
  );
  scene.add(piston);

  const ROD_BASE = 40;
  const rod = new THREE.Mesh(new THREE.BoxGeometry(2.6, ROD_BASE, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xe2b07a, metalness: 0.85, roughness: 0.4 }));
  scene.add(rod);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(2.6, ROD_BASE, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.85, roughness: 0.45 }));
  scene.add(crankArm);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xf0c890, metalness: 0.9, roughness: 0.3 });
  const crankPin = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), pinMat); scene.add(crankPin);

  function orientBar(bar, ax, ay, bx, by) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const len = Math.hypot(bx - ax, by - ay) || 0.001;
    bar.position.set(mx, my, zFront);
    bar.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
    bar.scale.y = len / ROD_BASE;
  }
  function updateSteam(theta0) {
    const s = model.steamAt(theta0);
    const pinY = s.piston[1] - steam.pistonHalf; // piston wrist pin
    piston.position.set(s.piston[0], s.piston[1], zFront);
    crankPin.position.set(s.crankPin[0], s.crankPin[1], zFront);
    orientBar(rod, s.crankPin[0], s.crankPin[1], s.piston[0], pinY);
    orientBar(crankArm, steam.params.center[0], steam.params.center[1], s.crankPin[0], s.crankPin[1]);
  }

  // --- camera framing (gears + steam) ---
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const inc = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  gears.forEach((g, i) => { inc(cx[i] - g.addendumRadius, cy[i] - g.addendumRadius); inc(cx[i] + g.addendumRadius, cy[i] + g.addendumRadius); });
  inc(steam.axisX, steam.cylTop);
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
  const radius = Math.hypot(maxX - minX, maxY - minY) / 2;

  let az = 0.5, el = 0.42;
  let dist = radius * 2.5;
  const minDist = radius * 1.15, maxDist = radius * 6;
  const clampDist = (d) => Math.max(minDist, Math.min(maxDist, d));
  function placeCamera() {
    camera.up.set(0, 1, 0);
    camera.position.set(
      center.x + dist * Math.sin(az) * Math.cos(el),
      center.y + dist * Math.sin(el),
      center.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(center);
  }

  // --- input: drag = orbit, two fingers = pinch zoom, wheel = zoom ---
  const dom = renderer.domElement;
  dom.style.touchAction = 'none';
  const pointers = new Map();
  let pinchStart = 0, distAtPinchStart = 0;
  const pinchSpan = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { pinchStart = pinchSpan(); distAtPinchStart = dist; }
  });
  const drop = (e) => pointers.delete(e.pointerId);
  dom.addEventListener('pointerup', drop);
  dom.addEventListener('pointercancel', drop);
  dom.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { if (pinchStart > 0) { dist = clampDist(distAtPinchStart * (pinchStart / pinchSpan())); placeCamera(); } }
    else { az -= dx * 0.01; el = Math.max(-1.3, Math.min(1.3, el + dy * 0.01)); placeCamera(); }
  });
  const onWheel = (e) => { e.preventDefault(); dist = clampDist(dist * Math.exp(e.deltaY * 0.001)); placeCamera(); };
  dom.addEventListener('wheel', onWheel, { passive: false });

  function resize() {
    const w = container.clientWidth || 900, h = container.clientHeight || 540;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix(); placeCamera();
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  let theta0 = 0, last = 0, raf = 0, running = false;
  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t; theta0 += model.omega * dt;
    for (let i = 0; i < gearMeshes.length; i++) gearMeshes[i].rotation.z = model.angleAt(i, theta0);
    updateSteam(theta0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  return {
    start() { if (running) return; running = true; last = 0; resize(); updateSteam(0); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    dispose() {
      running = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose(); renderer.forceContextLoss?.();
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    },
  };
}
