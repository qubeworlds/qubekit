// The shared gear-train model — built once from @qubekit/solver and consumed by
// BOTH the 2D and 3D views, so the two tabs always show the same mechanism.
// gear() gives the involute geometry; solveTrain() gives speeds/direction + the
// lock check; the chain walk + phasing place each gear so it actually meshes.

import { gear, canMesh, solveTrain } from './solver/index.js';

export function buildTrain() {
  const MODULE = 2; // mm — shared by every gear (the meshing invariant)
  const TEETH = [20, 30, 18, 24];
  const DIRS_DEG = [-18, 30, -12]; // placement direction of each gear from its predecessor
  const DRIVE_RPM = 60;

  const gears = TEETH.map((t) => gear({ teeth: t, module: MODULE, flankSamples: 16 }));
  const meshes = [
    { a: 0, b: 1 },
    { a: 1, b: 2 },
    { a: 2, b: 3 },
  ];
  const train = solveTrain(gears, meshes, { gear: 0, rpm: DRIVE_RPM });

  // chain walk: each gear at centre distance m·(z_p+z_i)/2 from its predecessor
  const dirs = DIRS_DEG.map((d) => (d * Math.PI) / 180);
  const cx = [0], cy = [0];
  for (let i = 1; i < gears.length; i++) {
    const d = gears[i - 1].pitchRadius + gears[i].pitchRadius;
    cx[i] = cx[i - 1] + d * Math.cos(dirs[i - 1]);
    cy[i] = cy[i - 1] + d * Math.sin(dirs[i - 1]);
  }

  // static phasing: seat a tooth of p into a gap of i at the line of centres
  const phase = [0];
  for (let i = 1; i < gears.length; i++) {
    const phi = dirs[i - 1];
    const phP = ((phi - phase[i - 1]) * gears[i - 1].z) / (2 * Math.PI);
    phase[i] = phi + Math.PI - (0.5 - phP) * ((2 * Math.PI) / gears[i].z);
  }

  const netRatio = train.rpm[gears.length - 1] / train.rpm[0];
  const pairMesh = canMesh(gears[0], gears[1]);
  const arrow = (rpm) => (rpm > 0 ? '↺' : '↻');
  const factsHTML =
    `m=${MODULE} mm · ` +
    gears.map((g, i) => `z${i + 1}=${g.z} ${train.rpm[i].toFixed(0)} rpm ${arrow(train.rpm[i])}`).join(' · ') +
    `<br>net ratio z₁:z₄ = ${gears[0].z}:${gears[gears.length - 1].z} = ${Math.abs(netRatio).toFixed(3)} · ` +
    `middle gears are idlers · ε=${pairMesh.contactRatio.toFixed(2)} · ` +
    `<b>${train.locked ? 'LOCKED' : 'not locked ✓'}</b>`;

  // angular position of gear i when the driver has turned by theta0 (rad)
  const angleAt = (i, theta0) => phase[i] + (train.rpm[i] / train.rpm[0]) * theta0;

  // driver angular velocity (rad/s), slowed for comfortable viewing
  const omega = (DRIVE_RPM / 60) * 2 * Math.PI * 0.06;

  return { MODULE, gears, cx, cy, phase, rpm: train.rpm, meshes, locked: train.locked, factsHTML, angleAt, omega };
}
