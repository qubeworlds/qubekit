// Physically-correct involute spur gears.
//
// A diffusion model draws something that *reads* as a gear train but obeys none
// of the laws below: it places gears of visibly different tooth sizes "meshing",
// at arbitrary centre distances, in coplanar clusters that would lock. Real
// gears are not free-form — two gears mesh **iff** they share a module and a
// pressure angle, sit at exactly centre distance a = m·(z₁+z₂)/2, and their
// tooth flanks are involutes of a common base circle. This module generates that
// geometry and validates the mesh.
//
// References: standard ISO 53 full-depth tooth proportions (addendum = m,
// dedendum = 1.25·m), involute-of-circle flank, base pitch p_b = π·m·cosα.

import type { Vec2 } from './vec.js';

export const DEG = Math.PI / 180;

export interface GearParams {
  teeth: number; // z — must be an integer ≥ 1
  module: number; // m (mm) — sets tooth size; THE meshing invariant
  pressureAngle?: number; // α in radians, default 20°
  /** Number of sample points per involute flank (geometry detail only). */
  flankSamples?: number;
}

export interface GearGeometry {
  z: number;
  module: number;
  pressureAngle: number;
  pitchRadius: number; // r  = m·z/2
  baseRadius: number; // r_b = r·cosα
  addendumRadius: number; // r_a = r + m   (tip)
  dedendumRadius: number; // r_f = r − 1.25·m (root)
  circularPitch: number; // p   = π·m  (arc length pitch-to-pitch)
  basePitch: number; // p_b = π·m·cosα
  /** True if the involute is undercut at the root — weak tooth, interference. */
  undercut: boolean;
  /** Minimum teeth to avoid undercut for this pressure angle (standard tooth). */
  minTeethNoUndercut: number;
  /** Closed outline, one full revolution, centred at origin, tooth 0 on +X. */
  outline: Vec2[];
}

// Involute roll: angular position ψ of a flank point at radius ρ, measured from
// the tooth centreline. Derived from the involute function inv(β)=tanβ−β.
function flankAngle(rho: number, baseR: number, alpha: number, halfToothAngle: number): number {
  const cosB = Math.min(1, baseR / rho); // = cos of the profile angle at ρ
  const beta = Math.acos(cosB);
  const invBeta = Math.tan(beta) - beta;
  const invAlpha = Math.tan(alpha) - alpha;
  return halfToothAngle + invAlpha - invBeta; // = halfToothAngle at ρ = pitch
}

export function gear(params: GearParams): GearGeometry {
  const z = params.teeth;
  const m = params.module;
  const alpha = params.pressureAngle ?? 20 * DEG;
  const samples = Math.max(2, params.flankSamples ?? 8);

  if (!Number.isInteger(z) || z < 1) throw new Error(`gear: teeth must be a positive integer, got ${z}`);
  if (!(m > 0)) throw new Error(`gear: module must be > 0, got ${m}`);

  const r = (m * z) / 2;
  const rb = r * Math.cos(alpha);
  const ra = r + m;
  const rf = r - 1.25 * m;
  const halfTooth = Math.PI / (2 * z); // half tooth angular thickness at the pitch circle

  // Undercut is the tooth-count law z < 2/sin²α (≈17.1 at 20°), where the
  // generating rack gouges the involute flank. NB this is NOT "root below base
  // circle": for standard full-depth gears with z ≲ 41 the root normally sits
  // below r_b, and that band is a fillet/trochoid — perfectly fine, not undercut.
  const minTeeth = 2 / (Math.sin(alpha) * Math.sin(alpha));
  const undercut = z < minTeeth;

  // The involute is only defined at ρ ≥ r_b. Start the active flank at the larger
  // of root/base; below the base circle a real gear has a trochoidal fillet —
  // approximated here by a radial drop to the root circle.
  const rStart = Math.max(rf, rb);

  const outline: Vec2[] = [];
  const pushPolar = (rho: number, ang: number) => outline.push([rho * Math.cos(ang), rho * Math.sin(ang)]);

  for (let t = 0; t < z; t++) {
    const c = (t * 2 * Math.PI) / z; // this tooth's centreline angle

    // Left flank, root → tip (angles c − ψ).
    if (rStart > rf) pushPolar(rf, c - flankAngle(rStart, rb, alpha, halfTooth));
    for (let i = 0; i <= samples; i++) {
      const rho = rStart + ((ra - rStart) * i) / samples;
      pushPolar(rho, c - flankAngle(rho, rb, alpha, halfTooth));
    }
    // Tip land, left → right (small arc at r_a).
    pushPolar(ra, c + flankAngle(ra, rb, alpha, halfTooth));
    // Right flank, tip → root (angles c + ψ).
    for (let i = samples; i >= 0; i--) {
      const rho = rStart + ((ra - rStart) * i) / samples;
      pushPolar(rho, c + flankAngle(rho, rb, alpha, halfTooth));
    }
    if (rStart > rf) pushPolar(rf, c + flankAngle(rStart, rb, alpha, halfTooth));
    // Root land into the next tooth gap (arc at r_f).
    const next = ((t + 1) * 2 * Math.PI) / z;
    pushPolar(rf, next - flankAngle(rStart, rb, alpha, halfTooth));
  }

  return {
    z,
    module: m,
    pressureAngle: alpha,
    pitchRadius: r,
    baseRadius: rb,
    addendumRadius: ra,
    dedendumRadius: rf,
    circularPitch: Math.PI * m,
    basePitch: Math.PI * m * Math.cos(alpha),
    undercut,
    minTeethNoUndercut: Math.ceil(minTeeth),
    outline,
  };
}

export interface MeshCheck {
  ok: boolean;
  reasons: string[]; // every law that fails, in plain language
  centerDistance: number | null; // standard a = m·(z₁+z₂)/2
  gearRatio: number | null; // ω₂/ω₁ = −z₁/z₂ (negative = counter-rotating)
  contactRatio: number | null; // ε — must be ≥ 1 (≈1.4 typical) for smooth drive
}

// The meshing law. `centerDistance` overrides the standard value to check whether
// a *proposed* placement (e.g. one read off the diffusion image) is actually
// valid — the common failure mode there.
export function canMesh(
  a: GearGeometry,
  b: GearGeometry,
  opts: { centerDistance?: number; tol?: number } = {},
): MeshCheck {
  const tol = opts.tol ?? 1e-6;
  const reasons: string[] = [];

  // 1. Same module — equal tooth size/pitch. The single most-violated law.
  if (Math.abs(a.module - b.module) > tol) {
    reasons.push(`module mismatch (${a.module} vs ${b.module}): tooth pitches differ, teeth cannot interlock`);
  }
  // 2. Same pressure angle — flanks share a conjugate action line.
  if (Math.abs(a.pressureAngle - b.pressureAngle) > tol) {
    reasons.push(
      `pressure-angle mismatch (${(a.pressureAngle / DEG).toFixed(1)}° vs ${(b.pressureAngle / DEG).toFixed(1)}°)`,
    );
  }

  const standard = (a.pitchRadius + b.pitchRadius); // m·(z₁+z₂)/2
  const center = opts.centerDistance ?? standard;
  // 3. Centre distance — pitch circles must be tangent.
  if (Math.abs(center - standard) > Math.max(tol, 1e-4 * standard)) {
    reasons.push(
      `centre distance ${center.toFixed(3)} ≠ required ${standard.toFixed(3)} (= m·(z₁+z₂)/2): pitch circles not tangent`,
    );
  }

  const ratio = -a.z / b.z;

  // 4. Contact ratio — at least one tooth pair always in contact, else the drive
  // skips. Uses the actual centre distance so a wrong placement shows ε falling.
  let eps: number | null = null;
  const blockedByGeometry = Math.abs(a.module - b.module) > tol;
  if (!blockedByGeometry) {
    const t1 = Math.sqrt(Math.max(0, a.addendumRadius ** 2 - a.baseRadius ** 2));
    const t2 = Math.sqrt(Math.max(0, b.addendumRadius ** 2 - b.baseRadius ** 2));
    eps = (t1 + t2 - center * Math.sin(a.pressureAngle)) / a.basePitch;
    if (eps < 1) reasons.push(`contact ratio ${eps.toFixed(2)} < 1: teeth disengage before the next pair meshes`);
  }

  if (a.undercut) reasons.push(`gear A undercut (z=${a.z} < ${a.minTeethNoUndercut} min): interference at the root`);
  if (b.undercut) reasons.push(`gear B undercut (z=${b.z} < ${b.minTeethNoUndercut} min): interference at the root`);

  return { ok: reasons.length === 0, reasons, centerDistance: standard, gearRatio: ratio, contactRatio: eps };
}

export interface MeshEdge {
  a: number; // index into gears[]
  b: number; // index into gears[]
}

export interface TrainResult {
  rpm: number[]; // angular velocity per gear; NaN if unreached from the driver
  locked: boolean; // a kinematic loop forced two incompatible speeds on one gear
  conflicts: Array<{ gear: number; expected: number; got: number }>;
}

// Propagate rotation through a mesh graph from a single driver. Each external
// mesh reverses sign and scales by −z_a/z_b. A closed loop with an odd number of
// meshes (or incommensurate ratios) drives a gear to two different speeds at
// once → the train is locked. This is exactly the failure the coplanar gear
// clusters in the diffusion image would hit.
export function solveTrain(gears: GearGeometry[], meshes: MeshEdge[], driver: { gear: number; rpm: number }): TrainResult {
  const rpm = new Array<number>(gears.length).fill(NaN);
  const conflicts: TrainResult['conflicts'] = [];
  rpm[driver.gear] = driver.rpm;

  const adj: Array<Array<number>> = gears.map(() => []);
  for (let i = 0; i < meshes.length; i++) {
    adj[meshes[i].a].push(i);
    adj[meshes[i].b].push(i);
  }

  const queue = [driver.gear];
  while (queue.length) {
    const u = queue.shift() as number;
    for (const ei of adj[u]) {
      const e = meshes[ei];
      const v = e.a === u ? e.b : e.a;
      const speed = -rpm[u] * (gears[u].z / gears[v].z);
      if (Number.isNaN(rpm[v])) {
        rpm[v] = speed;
        queue.push(v);
      } else if (Math.abs(rpm[v] - speed) > 1e-6 * (1 + Math.abs(speed))) {
        conflicts.push({ gear: v, expected: rpm[v], got: speed });
      }
    }
  }

  return { rpm, locked: conflicts.length > 0, conflicts };
}
