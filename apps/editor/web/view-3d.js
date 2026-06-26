// 3D view — the spatial read. Extrudes each gear's involute profile (straight
// from @qubekit/solver) into a real spur gear and renders the train with
// Three.js (vendored, self-contained). Drag to orbit.
//
// This is a demo viewer, the way `world`'s teleport hero uses THREE — the
// production 3D path is the quine engine, which can render the same train later
// (it already exposes quine_provide_asset + quine_transform + timelines).

import * as THREE from './vendor/three.module.js';

export function init3D(model, container) {
  const { gears, cx, cy } = model;
  const DEPTH = 12; // gear thickness (mm)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(90, 140, 180); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa6ff, 0.45); fill.position.set(-140, -40, 80); scene.add(fill);

  const meshObjs = gears.map((g, i) => {
    const shape = new THREE.Shape();
    g.outline.forEach(([x, y], k) => (k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    const hole = new THREE.Path();
    hole.absarc(0, 0, g.module * 1.6, 0, Math.PI * 2, true); // hub bore
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 1, steps: 1,
    });
    geo.translate(0, 0, -DEPTH / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? 0xb8bcc4 : 0xb88a4e, // steel / brass
      metalness: 0.92, roughness: 0.42, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx[i], cy[i], 0);
    scene.add(mesh);
    return mesh;
  });

  // frame the camera on the train's bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  gears.forEach((g, i) => {
    minX = Math.min(minX, cx[i] - g.addendumRadius); maxX = Math.max(maxX, cx[i] + g.addendumRadius);
    minY = Math.min(minY, cy[i] - g.addendumRadius); maxY = Math.max(maxY, cy[i] + g.addendumRadius);
  });
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
  const radius = Math.hypot(maxX - minX, maxY - minY) / 2;

  // orbit state (azimuth / elevation around the train) + zoom distance
  let az = 0.5, el = 0.42;
  let dist = radius * 2.5;
  const minDist = radius * 1.15, maxDist = radius * 6;
  function placeCamera() {
    camera.up.set(0, 1, 0);
    camera.position.set(
      center.x + dist * Math.sin(az) * Math.cos(el),
      center.y + dist * Math.sin(el),
      center.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(center);
  }

  // Input: one finger / drag = orbit, two fingers = pinch zoom, wheel = zoom.
  const dom = renderer.domElement;
  dom.style.touchAction = 'none';
  const pointers = new Map(); // pointerId -> {x, y}
  let pinchStart = 0, distAtPinchStart = 0;
  const clampDist = (d) => Math.max(minDist, Math.min(maxDist, d));
  const pinchSpan = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { pinchStart = pinchSpan(); distAtPinchStart = dist; }
  });
  const drop = (e) => pointers.delete(e.pointerId);
  dom.addEventListener('pointerup', drop);
  dom.addEventListener('pointercancel', drop);
  dom.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      if (pinchStart > 0) { dist = clampDist(distAtPinchStart * (pinchStart / pinchSpan())); placeCamera(); }
    } else {
      az -= dx * 0.01;
      el = Math.max(-1.3, Math.min(1.3, el + dy * 0.01));
      placeCamera();
    }
  });
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = clampDist(dist * Math.exp(e.deltaY * 0.001));
    placeCamera();
  }, { passive: false });

  function resize() {
    const w = container.clientWidth || 900, h = container.clientHeight || 540;
    renderer.setSize(w, h); // updateStyle: true — canvas CSS matches the container
    camera.aspect = w / h; camera.updateProjectionMatrix();
    placeCamera();
  }

  let theta0 = 0, last = 0, raf = 0, running = false;
  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t; theta0 += model.omega * dt;
    for (let i = 0; i < meshObjs.length; i++) meshObjs[i].rotation.z = model.angleAt(i, theta0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  return {
    start() { if (running) return; running = true; last = 0; resize(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
  };
}
