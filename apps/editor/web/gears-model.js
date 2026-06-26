// The shared mechanism model — built from @qubekit/solver, consumed by both the
// 2D and 3D views. A four-gear train, a slider-crank "steam engine" bolted to
// wheel 1 (rotary ⇄ reciprocating), and an optional bridge gear that closes a
// 3-gear loop so solveTrain() reports the train LOCKED.

import { gear, canMesh, solveTrain, sliderCrank } from './solver/index.js';

export function buildTrain(opts = {}) {
  const MODULE = 2;
  const TEETH = [20, 30, 18, 24];
  const DIRS_DEG = [-18, 30, -12];
  const DRIVE_RPM = 60;

  const gears = TEETH.map((t) => gear({ teeth: t, module: MODULE, flankSamples: 16 }));
  const dirs = DIRS_DEG.map((d) => (d * Math.PI) / 180);
  const cx = [0], cy = [0];
  for (let i = 1; i < gears.length; i++) {
    const d = gears[i - 1].pitchRadius + gears[i].pitchRadius;
    cx[i] = cx[i - 1] + d * Math.cos(dirs[i - 1]);
    cy[i] = cy[i - 1] + d * Math.sin(dirs[i - 1]);
  }

  const phase = [0];
  const phaseToMesh = (predIdx, phi, zChild) => {
    const phP = ((phi - phase[predIdx]) * gears[predIdx].z) / (2 * Math.PI);
    return phi + Math.PI - (0.5 - phP) * ((2 * Math.PI) / zChild);
  };
  for (let i = 1; i < gears.length; i++) phase[i] = phaseToMesh(i - 1, dirs[i - 1], gears[i].z);

  const meshes = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }];

  // Lock demo: a bridge gear E meshing gears 2 AND 3 (which already mesh) makes a
  // 3-gear loop. An odd external loop forces a gear to two opposite speeds at
  // once → it jams. E sits at the apex of the triangle on centres c2, c3.
  let bridge = null;
  if (opts.lock) {
    const gE = gear({ teeth: 15, module: MODULE, flankSamples: 16 });
    const rE = gE.pitchRadius;
    const c2 = [cx[2], cy[2]], c3 = [cx[3], cy[3]];
    const dA = gears[2].pitchRadius + rE, dB = gears[3].pitchRadius + rE;
    const ex = c3[0] - c2[0], ey = c3[1] - c2[1], d = Math.hypot(ex, ey);
    const ux = ex / d, uy = ey / d;
    const a = (d * d + dA * dA - dB * dB) / (2 * d);
    const h = Math.sqrt(Math.max(0, dA * dA - a * a));
    let nx = -uy, ny = ux; if (ny < 0) { nx = -nx; ny = -ny; } // normal pointing +y
    const idxE = gears.length;
    gears.push(gE);
    cx.push(c2[0] + a * ux + h * nx);
    cy.push(c2[1] + a * uy + h * ny);
    phase.push(phaseToMesh(2, Math.atan2(cy[idxE] - c2[1], cx[idxE] - c2[0]), gE.z));
    meshes.push({ a: 2, b: idxE }, { a: 3, b: idxE });
    bridge = idxE;
  }

  const train = solveTrain(gears, meshes, { gear: 0, rpm: DRIVE_RPM });
  const locked = train.locked;

  // Slider-crank steam engine on wheel 0 (rotary ⇄ reciprocating piston).
  const steam = {
    params: { center: [cx[0], cy[0]], crankRadius: 10, rodLength: 40 },
    axisX: cx[0], boreHalf: 9, pistonHalf: 6, cylBot: 24, cylTop: 56,
  };

  const netRatio = train.rpm[3] / train.rpm[0];
  const pairMesh = canMesh(gears[0], gears[1]);
  const arrow = (r) => (r > 0 ? '↺' : r < 0 ? '↻' : '·');
  const rpmTxt = (i) => (Number.isFinite(train.rpm[i]) ? train.rpm[i].toFixed(0) : '—');
  const base = `m=${MODULE} mm · ` + [0, 1, 2, 3].map((i) => `z${i + 1}=${gears[i].z} ${rpmTxt(i)} rpm ${arrow(train.rpm[i])}`).join(' · ');
  const factsHTML = locked
    ? `${base}<br><b style="color:#f87171">LOCKED</b> — a gear bridging two that already mesh closes a 3-gear loop; solveTrain found ${train.conflicts.length} conflict(s), the train can't turn.`
    : `${base}<br>net ratio z₁:z₄ = ${gears[0].z}:${gears[3].z} = ${Math.abs(netRatio).toFixed(3)} · idler middle · ε=${pairMesh.contactRatio.toFixed(2)} · <b>not locked ✓</b> · steam piston on wheel 1`;

  const omega = locked ? 0 : (DRIVE_RPM / 60) * 2 * Math.PI * 0.06;
  const angleAt = (i, theta0) => phase[i] + (Number.isFinite(train.rpm[i]) ? train.rpm[i] / train.rpm[0] : 0) * theta0;
  const steamAt = (theta0) => sliderCrank(steam.params, angleAt(0, theta0));

  return { MODULE, gears, cx, cy, phase, meshes, bridge, locked, steam, factsHTML, angleAt, steamAt, omega };
}
