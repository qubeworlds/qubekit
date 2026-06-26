import { describe, expect, it } from 'vitest';
import { bevelPair, governor, type GovernorParams } from '../src/index';

describe('bevel pair (right-angle drive)', () => {
  it('ratio is z1/z2 and equal teeth give 45° cones at 90°', () => {
    expect(bevelPair(20, 40).ratio).toBeCloseTo(0.5, 9);
    const eq = bevelPair(20, 20, Math.PI / 2);
    expect(eq.coneAngle1).toBeCloseTo(Math.PI / 4, 9);
    expect(eq.coneAngle2).toBeCloseTo(Math.PI / 4, 9);
    expect(eq.coneAngle1 + eq.coneAngle2).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('flyball governor', () => {
  const p: GovernorParams = {
    armLength: 60, pivotRadius: 12, ballMass: 0.05,
    springRate: 200, springPreload: 0.3, sleeveArm: 30, thetaMax: 0.9,
  };

  it('balls stay on the rest below the threshold speed', () => {
    expect(governor(p, 2).theta).toBe(0);
    expect(governor(p, 2).flyingOut).toBe(false);
  });

  it('balls swing out and the sleeve lifts as speed rises', () => {
    const a = governor(p, 20), b = governor(p, 28);
    expect(a.theta).toBeGreaterThan(0);
    expect(b.theta).toBeGreaterThan(a.theta); // monotonic in ω
    expect(b.sleeveLift).toBeGreaterThan(a.sleeveLift);
    expect(b.ballRadius).toBeGreaterThan(a.ballRadius);
  });

  it('clamps at thetaMax at very high speed', () => {
    expect(governor(p, 1e4).theta).toBeCloseTo(p.thetaMax, 9);
  });
});
