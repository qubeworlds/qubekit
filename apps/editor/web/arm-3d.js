// Robot arm — 3D. The solver's IK returns the joint polyline each frame; the
// links are oriented to connect consecutive joints, the base yaws, and the
// two-finger gripper opens/closes. Table, coloured shapes, and the sorter block
// complete the scene. Three.js (vendored), mm scene units. Drag to orbit.

import * as THREE from './vendor/three.module.js';

const CYCLE_SECONDS = 18;

export function init3D(model, container) {
  const { params, shapes, sorter } = model;
  const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(280, 420, 360); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa6ff, 0.35); fill.position.set(-260, 120, -200); scene.add(fill);

  const mat = (c, m = 0.6, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });

  // table
  const table = new THREE.Mesh(new THREE.BoxGeometry(reach * 2.2, 16, reach * 1.7), mat(0x2c3344, 0.2, 0.85));
  table.position.set(reach * 0.35, -8, reach * 0.45); scene.add(table);

  // base + yaw group
  const base = new THREE.Mesh(new THREE.CylinderGeometry(34, 40, 36, 32), mat(0x3b4258, 0.7, 0.4));
  base.position.y = 18; scene.add(base);
  const yawG = new THREE.Group(); yawG.position.y = 36; scene.add(yawG);

  // link meshes (re-oriented each frame to join joint points)
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1, 20), mat(0xaeb6c6, 0.55, 0.45));
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1, 20), mat(0xc3cad8, 0.55, 0.45));
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 16), mat(0x8b93a8, 0.6, 0.4));
  scene.add(upper, fore, wrist);
  const jointMesh = () => new THREE.Mesh(new THREE.SphereGeometry(13, 20, 14), mat(0x5a6178, 0.6, 0.4));
  const shoulderJ = jointMesh(), elbowJ = jointMesh(); elbowJ.scale.setScalar(0.85);
  scene.add(shoulderJ, elbowJ);

  // gripper: a palm + two fingers (fingers slide in X to open/close)
  const grip = new THREE.Group(); scene.add(grip);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 24), mat(0xe2e8f4, 0.5, 0.5)); grip.add(palm);
  const finger = () => new THREE.Mesh(new THREE.BoxGeometry(7, 30, 18), mat(0xd2d9e8, 0.5, 0.5));
  const fL = finger(), fR = finger(); fL.position.y = -20; fR.position.y = -20; grip.add(fL, fR);

  // shapes
  const shapeMeshes = shapes.map((s) => {
    let g;
    if (s.kind === 'box') g = new THREE.BoxGeometry(s.long ? s.long : s.size, s.size, s.size);
    else if (s.kind === 'cyl') g = new THREE.CylinderGeometry(s.r, s.r, s.h, 24);
    else g = new THREE.ConeGeometry(s.r, s.h, 24);
    const m = new THREE.Mesh(g, mat(new THREE.Color(s.color), 0.1, 0.6));
    scene.add(m); return m;
  });
  const restShape = (s, mesh) => {
    const half = (s.kind === 'box' ? s.size : s.h) / 2;
    mesh.position.set(s.pos[0], half, s.pos[2]); mesh.rotation.set(0, 0, 0);
  };

  // sorter block with recessed hole markers on top
  const sortG = new THREE.Group(); sortG.position.set(sorter.pos[0], sorter.h / 2, sorter.pos[2]); scene.add(sortG);
  sortG.add(new THREE.Mesh(new THREE.BoxGeometry(sorter.w, sorter.h, sorter.d), mat(0x5b6172, 0.3, 0.7)));
  shapes.forEach((s) => {
    const hole = s.kind === 'cyl' || s.kind === 'cone'
      ? new THREE.Mesh(new THREE.CircleGeometry(s.r ? s.r + 4 : 24, 24), mat(0x12151c, 0, 1))
      : new THREE.Mesh(new THREE.PlaneGeometry((s.long ? s.long : s.size) + 8, s.size + 8), mat(0x12151c, 0, 1));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(s.hole[0] - sorter.pos[0], sorter.h / 2 + 0.5, s.hole[2] - sorter.pos[2]);
    sortG.add(hole);
  });

  // orient a unit-height cylinder between two world points (Y is its axis)
  const up = new THREE.Vector3(0, 1, 0), va = new THREE.Vector3(), vb = new THREE.Vector3(), dir = new THREE.Vector3();
  function orient(mesh, a, b) {
    va.set(a[0], a[1], a[2]); vb.set(b[0], b[1], b[2]);
    dir.subVectors(vb, va); const len = dir.length() || 1;
    mesh.position.copy(va).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    mesh.scale.y = len;
  }

  // --- camera framing + orbit/zoom ---
  const center = new THREE.Vector3(reach * 0.25, params.baseHeight * 0.7, reach * 0.35);
  const radius = reach * 0.9;
  let az = 0.7, el = 0.42, dist = radius * 2.7;
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

  let phase = 0, last = 0, raf = 0, running = false;
  function update(dt) {
    phase += (dt * model.speed) / CYCLE_SECONDS;
    const { pose, grip: g, carry } = model.poseAt(phase);
    const pts = pose.points; // [base, shoulder, elbow, wrist, tip]

    yawG.rotation.y = pose.yaw;
    orient(upper, pts[1], pts[2]); orient(fore, pts[2], pts[3]); orient(wrist, pts[3], pts[4]);
    shoulderJ.position.set(...pts[1]); elbowJ.position.set(...pts[2]);

    // gripper at the tip, oriented down the tool, fingers open with (1−grip)
    grip.position.set(...pts[4]); grip.rotation.set(0, pose.yaw, 0);
    const open = (1 - g) * 22 + 7;
    fL.position.x = -open; fR.position.x = open;

    shapes.forEach((s, i) => {
      if (i === carry) {
        const half = (s.kind === 'box' ? s.size : s.h) / 2;
        shapeMeshes[i].position.set(pts[4][0], pts[4][1] - 20 - half, pts[4][2]);
        shapeMeshes[i].rotation.y = pose.yaw;
      } else restShape(s, shapeMeshes[i]);
    });
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
