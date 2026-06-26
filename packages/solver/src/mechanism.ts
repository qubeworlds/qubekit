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
