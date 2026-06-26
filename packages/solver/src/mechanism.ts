// Planar linkages, closed-form. The slider-crank converts between rotary motion
// (a crank pin on a wheel) and reciprocating linear motion (a piston on a fixed
// axis) — the heart of a steam engine, pump, or compressor.

import type { Vec2 } from './vec.js';

export interface SliderCrankParams {
  center: Vec2; // crank axis = wheel centre (mm)
  crankRadius: number; // crank-pin offset from the centre (mm)
  rodLength: number; // connecting-rod length (mm) — must exceed crankRadius + |offset|
  phase?: number; // crank-pin angular offset (rad), default 0
  offset?: number; // désaxé: cylinder axis at x = center.x + offset (mm), default 0
}

export interface SliderCrankState {
  crankPin: Vec2; // world position of the pin on the wheel
  piston: Vec2; // world position of the piston (on the cylinder axis, slides along +Y)
  axisX: number; // x of the cylinder axis
  stroke: number; // total piston travel = 2·crankRadius
}

// Solve the slider-crank at crank angle θ. The piston rides the vertical line
// x = axisX; the connecting rod pins it to the crank pin. Closed form: pick the
// upper intersection of the rod circle with that line.
export function sliderCrank(p: SliderCrankParams, theta: number): SliderCrankState {
  const r = p.crankRadius;
  const L = p.rodLength;
  const axisX = p.center[0] + (p.offset ?? 0);
  const a = theta + (p.phase ?? 0);

  const pinX = p.center[0] + r * Math.cos(a);
  const pinY = p.center[1] + r * Math.sin(a);

  // (pinX − axisX)² + (pistonY − pinY)² = L²  →  pistonY = pinY + √(L² − dx²)
  const dx = pinX - axisX;
  const pistonY = pinY + Math.sqrt(Math.max(0, L * L - dx * dx));

  return { crankPin: [pinX, pinY], piston: [axisX, pistonY], axisX, stroke: 2 * r };
}

// --- Centrifugal flyball governor (Watt/Hartnell) ------------------------------
// As the spindle spins faster, centrifugal force flings the balls outward; the
// bell-crank arms lift a sleeve against a spring. Solving the moment balance about
// the pivot gives the arm angle (and sleeve lift) for a given spindle speed — the
// feedback law a steam engine uses to regulate itself. Lengths in mm, masses kg,
// forces N (lengths converted to m for the dynamics).

export interface GovernorParams {
  armLength: number; // pivot → ball (mm)
  pivotRadius: number; // pivot offset from the spindle axis (mm)
  ballMass: number; // kg
  springRate: number; // sleeve spring stiffness (N/m)
  springPreload: number; // sleeve spring preload (N)
  sleeveArm: number; // bell-crank arm to the sleeve (mm); lift = sleeveArm·sinθ
  thetaMax: number; // arm-angle clamp (rad)
  gravity?: number; // m/s², default 9.81
}

export interface GovernorState {
  theta: number; // arm angle from the spindle axis (rad)
  ballRadius: number; // ball distance from the axis (mm)
  ballHeight: number; // ball height above the pivot (mm)
  sleeveLift: number; // sleeve travel (mm)
  flyingOut: boolean; // balls off the rest stop
}

// Solve the equilibrium arm angle at spindle speed ω (rad/s). Net moment about
// the pivot M(θ) = centrifugal − gravity − spring; M decreases with θ, so a
// bisection finds the root (clamped to [0, thetaMax]).
export function governor(p: GovernorParams, omega: number): GovernorState {
  const g = p.gravity ?? 9.81;
  const L = p.armLength / 1000, e = p.pivotRadius / 1000, b = p.sleeveArm / 1000, m = p.ballMass;

  const moment = (theta: number): number => {
    const r = e + L * Math.sin(theta);
    const Mc = m * omega * omega * r * (L * Math.cos(theta)); // centrifugal
    const Mg = m * g * (L * Math.sin(theta)); // gravity
    const S = p.springPreload + p.springRate * (b * Math.sin(theta)); // spring force on sleeve
    const Ms = S * (b * Math.cos(theta)); // spring moment
    return Mc - Mg - Ms;
  };

  let theta: number;
  if (moment(0) <= 0) theta = 0; // below the threshold speed — balls on the rest
  else if (moment(p.thetaMax) >= 0) theta = p.thetaMax; // pinned at the stop
  else {
    let lo = 0, hi = p.thetaMax;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (moment(mid) > 0) lo = mid;
      else hi = mid;
    }
    theta = (lo + hi) / 2;
  }

  return {
    theta,
    ballRadius: p.pivotRadius + p.armLength * Math.sin(theta),
    ballHeight: p.armLength * Math.cos(theta),
    sleeveLift: p.sleeveArm * Math.sin(theta),
    flyingOut: theta > 1e-4,
  };
}
