// Robot arm — 3D. Built as a real kinematic TREE: a yaw turntable carries a riser
// to the shoulder, then shoulder → upper arm → elbow → forearm → wrist → tool are
// nested groups, each a revolute joint driven by the solver's relative joint
// angle. So the links are rigidly connected through motorised hinge housings
// (proper constraint joints), not floating cylinders — and nothing is missing.
// Printed-PLA aesthetic. The sorter has real through-holes matching each item's
// footprint + clearance. Three.js (vendored), mm scene units. Drag to orbit.

import * as THREE from './vendor/three.module.js';
import { footPoly, CLEARANCE } from './arm-model.js';

const CYCLE_SECONDS = 20;

export function init3D(model, container) {
  const { params, items, sorter } = model;
  const reach = params.shoulderOffset + params.upperArm + params.forearm + params.tool;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const keyL = new THREE.DirectionalLight(0xffffff, 1.05); keyL.position.set(300, 460, 380); scene.add(keyL);
  const fillL = new THREE.DirectionalLight(0x9bb4ff, 0.32); fillL.position.set(-280, 160, -220); scene.add(fillL);

  // printed-robot palette: light PLA links, charcoal joint housings, teal accents
  const pla = (c = 0xdfe3ec) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.08, roughness: 0.62 });
  const housing = () => new THREE.MeshStandardMaterial({ color: 0x303644, metalness: 0.35, roughness: 0.55 });
  const accent = () => new THREE.MeshStandardMaterial({ color: 0x2dd4bf, metalness: 0.3, roughness: 0.4 });
  const matt = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), metalness: 0.06, roughness: 0.66 });

  // table — the arm sits at the MIDDLE of the near edge, so its half-disc
  // workspace (radius = reach, facing +z) reaches both far corners.
  const tb = model.tableBounds;
  const table = new THREE.Mesh(new THREE.BoxGeometry(tb.xMax - tb.xMin + 40, 16, tb.zMax - tb.zMin + 40), new THREE.MeshStandardMaterial({ color: 0x2b3242, metalness: 0.15, roughness: 0.9 }));
  table.position.set((tb.xMin + tb.xMax) / 2, -8, (tb.zMin + tb.zMax) / 2); scene.add(table);

  // --- vertical prism from a footprint (base at y=0). plan (x,z) preserved by
  // authoring the shape with −z, then rotateX(−90°) maps shape→world cleanly. ---
  function prismGeo(foot, height, grow = 0) {
    const fp = footPoly(foot, grow);
    if (fp.circle) { const g = new THREE.CylinderGeometry(fp.r, fp.r, height, 36); g.translate(0, height / 2, 0); return g; }
    const shape = new THREE.Shape();
    shape.moveTo(fp.pts[0][0], -fp.pts[0][1]);
    for (let i = 1; i < fp.pts.length; i++) shape.lineTo(fp.pts[i][0], -fp.pts[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // ---- kinematic tree (a chain of nested revolute joints) ----
  const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(46, 54, 30, 36), housing());
  basePedestal.position.y = 15; scene.add(basePedestal);
  scene.add(new THREE.Mesh(new THREE.TorusGeometry(46, 4, 12, 40), accent())).position.set(0, 30, 0);

  const turntable = new THREE.Group(); scene.add(turntable); // yaws about world Y
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(40, 44, 22, 36), pla(0xc9ced9)); tt.position.y = 30 + 11; turntable.add(tt);

  // riser: turntable → shoulder (the segment that used to be missing). Built in
  // the turntable's local plane: local +X = radial, local +Y = up.
  const riser = new THREE.Mesh(new THREE.BoxGeometry(34, params.baseHeight, 46), pla(0xd8dde6));
  riser.position.set(params.shoulderOffset * 0.5, 30 + params.baseHeight / 2, 0); turntable.add(riser);

  // helper: a motor-joint housing (cylinder along the local Z hinge axis) + accent
  function jointHousing(r, w) {
    const grp = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), housing()); h.rotation.x = Math.PI / 2; grp.add(h);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, r * 0.16, 10, 24), accent()); ring.position.z = w / 2 + 0.5; grp.add(ring);
    return grp;
  }
  // helper: a printed link box of length L along +X, given cross-section h×w
  function linkBox(L, h, w, inset = 8) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(L - inset, h, w), pla());
    m.position.x = L / 2; return m;
  }

  const shoulder = new THREE.Group(); shoulder.position.set(params.shoulderOffset, 30 + params.baseHeight, 0); turntable.add(shoulder);
  shoulder.add(jointHousing(26, 50));
  shoulder.add(linkBox(params.upperArm, 30, 34));

  const elbow = new THREE.Group(); elbow.position.set(params.upperArm, 0, 0); shoulder.add(elbow);
  elbow.add(jointHousing(22, 40));
  elbow.add(linkBox(params.forearm, 26, 30));

  const wrist = new THREE.Group(); wrist.position.set(params.forearm, 0, 0); elbow.add(wrist);
  wrist.add(jointHousing(17, 32));
  wrist.add(linkBox(params.tool, 20, 24, 4));

  // gripper at the tool end (local +X is the tool axis; points down when q3=−90°).
  // A parallel gripper: a fixed body + a guide RAIL spanning the full finger
  // travel, and two carriages that slide along it — so the fingers are mounted,
  // not flying, however wide they open.
  const gripper = new THREE.Group(); gripper.position.set(params.tool, 0, 0); wrist.add(gripper);
  const addAt = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const maxOpen = Math.max(...items.map((it) => model.footHalf(it.foot))) + 5 + 18; // widest spread (block)
  const railLen = 2 * maxOpen + 24;
  addAt(gripper, new THREE.BoxGeometry(22, 24, 34), pla(0xcfd5e0), 8, 0, 0); // body / wrist flange
  addAt(gripper, new THREE.BoxGeometry(9, 7, railLen), housing(), 20, 8, 0);  // guide rail (top)
  addAt(gripper, new THREE.BoxGeometry(9, 7, railLen), housing(), 20, -8, 0); // guide rail (bottom)
  function makeFinger(inward) {
    const g = new THREE.Group();
    addAt(g, new THREE.BoxGeometry(15, 24, 20), pla(0xb9c0cd), 20, 0, 0); // carriage riding the rails
    addAt(g, new THREE.BoxGeometry(28, 9, 9), pla(0xb9c0cd), 34, 0, 0);   // finger bar (down +X)
    addAt(g, new THREE.BoxGeometry(8, 17, 5), accent(), 46, 0, inward * 2.5); // inner grip pad
    return g;
  }
  const fA = makeFinger(1), fB = makeFinger(-1); gripper.add(fA, fB);

  // ---- items (extruded footprints), base at y=0 ----
  const itemMeshes = items.map((it) => { const m = new THREE.Mesh(prismGeo(it.foot, it.height), matt(it.color)); scene.add(m); return m; });
  const restItem = (it, m) => { m.position.set(it.pos[0], 0, it.pos[2]); m.rotation.set(0, 0, 0); };

  // ---- sorter: walls + a holed top plate (real through-holes) ----
  const sortG = new THREE.Group(); sortG.position.set(sorter.pos[0], 0, sorter.pos[2]); scene.add(sortG);
  const W = sorter.w / 2, D = sorter.d / 2, wallT = 8;
  const wallMat = pla(0x9aa1b0);
  const wallX = (sx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(wallT, sorter.h, sorter.d), wallMat); m.position.set(sx, sorter.h / 2, 0); sortG.add(m); };
  const wallZ = (sz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sorter.w, sorter.h, wallT), wallMat); m.position.set(0, sorter.h / 2, sz); sortG.add(m); };
  wallX(-W); wallX(W); wallZ(-D); wallZ(D);
  // holed top plate
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-W, -D); plateShape.lineTo(W, -D); plateShape.lineTo(W, D); plateShape.lineTo(-W, D); plateShape.closePath();
  for (const it of items) {
    const fp = footPoly(it.foot, CLEARANCE);
    const [hx, hz] = it.holeLocal; const path = new THREE.Path();
    if (fp.circle) path.absarc(hx, -hz, fp.r, 0, Math.PI * 2, true);
    else { path.moveTo(hx + fp.pts[0][0], -(hz + fp.pts[0][1])); for (let i = 1; i < fp.pts.length; i++) path.lineTo(hx + fp.pts[i][0], -(hz + fp.pts[i][1])); path.closePath(); }
    plateShape.holes.push(path);
  }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: sorter.plate, bevelEnabled: false });
  plateGeo.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(plateGeo, pla(0xc2c8d4)); plate.position.y = sorter.h - sorter.plate; sortG.add(plate);

  // ---- orient the turntable plane: local +X → world radial (sin yaw,0,cos yaw) ----
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(0, 1, 0), ez = new THREE.Vector3(), basis = new THREE.Matrix4();
  function setYaw(yaw) { ex.set(Math.sin(yaw), 0, Math.cos(yaw)); ez.crossVectors(ex, ey); basis.makeBasis(ex, ey, ez); turntable.quaternion.setFromRotationMatrix(basis); }

  // --- camera framing + orbit/zoom ---
  const center = new THREE.Vector3(reach * 0.05, params.baseHeight * 0.75, reach * 0.35);
  const radius = reach * 0.92;
  let az = 0.72, el = 0.4, dist = radius * 2.7;
  const minDist = radius * 1.1, maxDist = radius * 6;
  const clampDist = (d) => Math.max(minDist, Math.min(maxDist, d));
  function placeCamera() {
    camera.up.set(0, 1, 0);
    camera.position.set(center.x + dist * Math.sin(az) * Math.cos(el), center.y + dist * Math.sin(el), center.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(center);
  }
  const dom = renderer.domElement; dom.style.touchAction = 'none';
  const pointers = new Map(); let pinchStart = 0, distAtPinch = 0;
  const spanP = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  dom.addEventListener('pointerdown', (e) => { dom.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { pinchStart = spanP(); distAtPinch = dist; } });
  const drop = (e) => pointers.delete(e.pointerId);
  dom.addEventListener('pointerup', drop); dom.addEventListener('pointercancel', drop);
  dom.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { if (pinchStart > 0) { dist = clampDist(distAtPinch * (pinchStart / spanP())); placeCamera(); } }
    else { az -= dx * 0.01; el = Math.max(-0.2, Math.min(1.3, el + dy * 0.01)); placeCamera(); }
  });
  dom.addEventListener('wheel', (e) => { e.preventDefault(); dist = clampDist(dist * Math.exp(e.deltaY * 0.001)); placeCamera(); }, { passive: false });
  function resize() { const w = container.clientWidth || 900, h = container.clientHeight || 540; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); placeCamera(); }
  const onResize = () => resize(); window.addEventListener('resize', onResize);

  let phase = 0, last = 0, raf = 0, running = false;
  function update(dt) {
    phase += (dt * model.speed) / CYCLE_SECONDS;
    const { pose, grip: g, carry } = model.poseAt(phase);
    const j = pose.joints;
    setYaw(j.base);
    shoulder.rotation.z = pose.shoulder;
    elbow.rotation.z = j.elbow;
    wrist.rotation.z = j.wrist;
    // fingers close onto the held item's width (stopgap until jolt does real
    // contact) so they sit on the surface instead of clipping inside.
    const carriedHalf = carry >= 0 ? model.footHalf(items[carry].foot) : 12;
    const open = carriedHalf + 5 + (1 - g) * 18; // finger spread across Z
    fA.position.z = -open; fB.position.z = open;

    // placed items stay seated in their holes until the episode resets, so all
    // four accumulate in the box (with a pause) before returning to the table.
    const placed = model.placedMask(phase);
    const tip = pose.points[4];
    items.forEach((it, i) => {
      if (i === carry) { itemMeshes[i].position.set(tip[0], Math.max(0, tip[1] - it.height), tip[2]); itemMeshes[i].rotation.set(0, 0, 0); }
      else if (placed[i]) { itemMeshes[i].position.set(it.perch[0], it.perchBaseY, it.perch[2]); itemMeshes[i].rotation.set(0, 0, 0); }
      else restItem(it, itemMeshes[i]);
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
