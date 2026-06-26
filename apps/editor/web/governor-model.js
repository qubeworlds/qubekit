// Flyball-governor model — wraps @qubekit/solver's governor() equilibrium. The
// spindle speed ω is the live input (a slider); the solver returns the arm angle
// and sleeve lift, and the view draws a front elevation that responds.

import { governor } from './solver/index.js';

export function buildGovernor() {
  // Tuned so the balls sweep their full travel across the slider band: balls
  // start lifting near ω≈5 and reach the stop by ω≈19.
  const params = {
    armLength: 55, pivotRadius: 25, ballMass: 0.08,
    springRate: 80, springPreload: 0.1, sleeveArm: 28, thetaMax: 0.9,
  };
  const minOmega = 4, maxOmega = 22;
  let omega = 11;

  // front-elevation layout constants (mm, y up)
  const geo = { yHub: 112, baseTop: 30, ballR: 11, sleeveRest: 42, sleeveW: 28, sleeveH: 10, springTop: 104 };

  return {
    kind: 'governor',
    params, geo, minOmega, maxOmega,
    get omega() { return omega; },
    set omega(v) { omega = Math.max(minOmega, Math.min(maxOmega, v)); },
    state() { return governor(params, omega); },
    factsHTML() {
      const s = governor(params, omega);
      return `ω=${omega.toFixed(0)} rad/s · arm θ=${((s.theta * 180) / Math.PI).toFixed(0)}° · ` +
        `ball r=${s.ballRadius.toFixed(0)} mm · sleeve lift=${s.sleeveLift.toFixed(1)} mm · ` +
        `<b>${s.theta > 0.06 ? 'balls fly out → sleeve rises → throttle closes' : 'at rest (below governing speed)'}</b>`;
    },
  };
}
