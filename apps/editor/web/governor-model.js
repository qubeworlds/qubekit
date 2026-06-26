// Flyball-governor model — wraps @qubekit/solver's governor() equilibrium. The
// spindle speed ω is the live input (a slider); the solver returns the arm angle
// and sleeve lift, and the view draws a front elevation that responds.

import { governor, bevelPair } from './solver/index.js';

export function buildGovernor() {
  // Tuned so the balls sweep their full travel across the slider band: balls
  // start lifting near ω≈5 and reach the stop by ω≈19.
  const params = {
    armLength: 55, pivotRadius: 25, ballMass: 0.08,
    springRate: 80, springPreload: 0.1, sleeveArm: 28, thetaMax: 0.9,
  };
  const minOmega = 4, maxOmega = 22;
  let omega = 11;

  // front-elevation layout constants (mm, y up). Balls sit ABOVE the pivots
  // (bell-crank governor): arms rise from the pivot spider to the balls; a link
  // drops to the collar below; the spring is the upper-central column.
  const geo = { yPivot: 50, spindleTop: 110, baseTop: 23, ballR: 11, sleeveRest: 30, sleeveW: 28, sleeveH: 10, springTop: 100 };

  // bevel-gear right-angle drive: vertical spindle axis ↔ horizontal belt shaft.
  const bevel = bevelPair(16, 16); // equal teeth → 45°/45° cones

  return {
    kind: 'governor',
    params, geo, bevel, minOmega, maxOmega,
    get omega() { return omega; },
    set omega(v) { omega = Math.max(minOmega, Math.min(maxOmega, v)); },
    state() { return governor(params, omega); },
    factsHTML() {
      const s = governor(params, omega);
      const rev = omega / (2 * Math.PI); // bevel is 1:1, so shaft = spindle
      return `ω=${omega.toFixed(0)} rad/s = ${rev.toFixed(1)} turns/s (${Math.round(rev * 60)} rpm) · ` +
        `arm θ=${((s.theta * 180) / Math.PI).toFixed(0)}° · ` +
        `ball r=${s.ballRadius.toFixed(0)} mm · sleeve lift=${s.sleeveLift.toFixed(1)} mm · ` +
        `<b>${s.theta > 0.06 ? 'balls fly out → sleeve rises' : 'at rest (below governing speed)'}</b>`;
    },
  };
}
