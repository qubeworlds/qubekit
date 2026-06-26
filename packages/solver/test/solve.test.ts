import { describe, expect, it } from 'vitest';
import {
  coincident,
  concentric,
  qexp,
  qrot,
  retract,
  solve,
  worldDir,
  type Body,
} from '../src/index';

const X: [number, number, number] = [1, 0, 0];

describe('constraint solver', () => {
  it('aligns a free body concentric to a grounded axis (slide+spin left free)', () => {
    const ground: Body = { position: [0, 0, 0], orientation: [0, 0, 0, 1], grounded: true };
    // Start the free body off-axis and tilted.
    const part: Body = { position: [3, 6, 2], orientation: qexp([0.4, -0.3, 0.2]) };

    const res = solve(
      [ground, part],
      [concentric(0, { point: [0, 0, 0], axis: X }, 1, { point: [0, 0, 0], axis: X })],
    );

    expect(res.converged).toBe(true);
    expect(res.residualNorm).toBeLessThan(1e-6);
    // The part's local X axis now points along world +X.
    const ax = worldDir(res.bodies[1], X);
    expect(ax[0]).toBeCloseTo(1, 6);
    expect(Math.hypot(ax[1], ax[2])).toBeLessThan(1e-6);
  });

  it('satisfies TWO concentric constraints at once (a pin through two holes)', () => {
    // Two grounded beams whose hole axes are collinear (both the world X line),
    // offset along it. A greedy matcher snaps to ONE; the solver satisfies both.
    const beamA: Body = { position: [0, 0, 0], orientation: [0, 0, 0, 1], grounded: true };
    const beamB: Body = { position: [40, 0, 0], orientation: [0, 0, 0, 1], grounded: true };
    const pin: Body = { position: [5, 9, -4], orientation: qexp([0.5, 0.2, -0.1]) };

    const res = solve(
      [beamA, beamB, pin],
      [
        concentric(0, { point: [0, 0, 0], axis: X }, 2, { point: [0, 0, 0], axis: X }),
        concentric(1, { point: [0, 0, 0], axis: X }, 2, { point: [0, 0, 0], axis: X }),
      ],
    );

    expect(res.converged).toBe(true);
    expect(res.residualNorm).toBeLessThan(1e-6);
    const ax = worldDir(res.bodies[2], X);
    expect(Math.hypot(ax[1], ax[2])).toBeLessThan(1e-6); // pin axis on the X line
  });

  it('closes a four-bar loop from a perturbed start (the matcher cannot)', () => {
    // Unit-square (mm-scale) four-bar: each bar's local endpoints are ±L/2 on X.
    const L = 100;
    const e = L / 2;
    const eP: [number, number, number] = [e, 0, 0];
    const eM: [number, number, number] = [-e, 0, 0];

    const bars: Body[] = [
      { position: [50, 0, 0], orientation: [0, 0, 0, 1], grounded: true }, // bottom (fixed)
      { position: [100, 50, 0], orientation: qexp([0, 0, Math.PI / 2]) }, // right
      { position: [50, 100, 0], orientation: qexp([0, 0, Math.PI]) }, // top
      { position: [0, 50, 0], orientation: qexp([0, 0, -Math.PI / 2]) }, // left
    ];

    // Perturb the three free bars in-plane so the loop is open at the start.
    retract(bars[1], [1.5, -1.0, 0, 0, 0, 0.03]);
    retract(bars[2], [-2.0, 1.2, 0, 0, 0, -0.04]);
    retract(bars[3], [0.8, 0.6, 0, 0, 0, 0.02]);

    const joints = [
      coincident(0, eP, 1, eM), // corner C1
      coincident(1, eP, 2, eM), // corner C2
      coincident(2, eP, 3, eM), // corner C3
      coincident(3, eP, 0, eM), // corner C0
    ];

    const res = solve(bars, joints);
    expect(res.converged).toBe(true);
    expect(res.residualNorm).toBeLessThan(1e-6); // all four pin joints meet
  });
});
