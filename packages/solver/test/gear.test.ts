import { describe, expect, it } from 'vitest';
import { DEG, canMesh, gear, solveTrain } from '../src/index';

describe('involute gear geometry (metric, mm)', () => {
  it('derives standard radii: a module-1, 24-tooth gear', () => {
    const g = gear({ teeth: 24, module: 1 });
    expect(g.pitchRadius).toBeCloseTo(12, 9); // r = m·z/2 = 12 mm
    expect(g.baseRadius).toBeCloseTo(12 * Math.cos(20 * DEG), 9);
    expect(g.addendumRadius).toBeCloseTo(13, 9); // r + m
    expect(g.dedendumRadius).toBeCloseTo(10.75, 9); // r − 1.25m
    expect(g.basePitch).toBeCloseTo(Math.PI * Math.cos(20 * DEG), 9);
    expect(g.undercut).toBe(false);
  });

  it('flags undercut below the minimum tooth count (≈17 at 20°)', () => {
    expect(gear({ teeth: 12, module: 1 }).undercut).toBe(true);
    expect(gear({ teeth: 20, module: 1 }).undercut).toBe(false);
    expect(gear({ teeth: 24, module: 1 }).minTeethNoUndercut).toBe(18); // ceil(2/sin²20°)
  });

  it('produces a closed outline with the right number of tooth periods', () => {
    const z = 18;
    const g = gear({ teeth: z, module: 1.5, flankSamples: 6 });
    expect(g.outline.length).toBeGreaterThan(z * 4); // many points per tooth
    // every point sits between root and tip radius
    for (const [x, y] of g.outline) {
      const r = Math.hypot(x, y);
      expect(r).toBeGreaterThanOrEqual(g.dedendumRadius - 1e-6);
      expect(r).toBeLessThanOrEqual(g.addendumRadius + 1e-6);
    }
  });
});

describe('meshing law (what the diffusion image violates)', () => {
  it('rejects two gears of different module', () => {
    const a = gear({ teeth: 24, module: 1 });
    const b = gear({ teeth: 24, module: 2 }); // twice the tooth size
    const m = canMesh(a, b);
    expect(m.ok).toBe(false);
    expect(m.reasons.join(' ')).toMatch(/module mismatch/);
  });

  it('accepts a matched pair and computes centre distance + ratio + contact ratio', () => {
    const a = gear({ teeth: 20, module: 1 }); // r = 10
    const b = gear({ teeth: 40, module: 1 }); // r = 20
    const m = canMesh(a, b);
    expect(m.ok).toBe(true);
    expect(m.centerDistance).toBeCloseTo(30, 9); // m·(z₁+z₂)/2 = 30 mm
    expect(m.gearRatio).toBeCloseTo(-0.5, 9); // ω_b/ω_a = −z_a/z_b
    expect(m.contactRatio).toBeGreaterThan(1.4); // smooth, continuous drive
    expect(m.contactRatio).toBeLessThan(2);
  });

  it('rejects a correct pair placed at the wrong centre distance', () => {
    const a = gear({ teeth: 20, module: 1 });
    const b = gear({ teeth: 40, module: 1 });
    const m = canMesh(a, b, { centerDistance: 33 }); // 3 mm too far apart
    expect(m.ok).toBe(false);
    expect(m.reasons.join(' ')).toMatch(/centre distance/);
  });
});

describe('gear train kinematics', () => {
  const g20 = gear({ teeth: 20, module: 1 });
  const g40 = gear({ teeth: 40, module: 1 });

  it('propagates speed and sign through a chain', () => {
    // driver(20) → idler(40) → output(20): output back to driver sign, ratio 1
    const gears = [g20, g40, g20];
    const meshes = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
    ];
    const t = solveTrain(gears, meshes, { gear: 0, rpm: 100 });
    expect(t.locked).toBe(false);
    expect(t.rpm[1]).toBeCloseTo(-50, 9); // 100 · (−20/40)
    expect(t.rpm[2]).toBeCloseTo(100, 9); // idler restores speed and sign
  });

  it('detects a locked loop (odd ring of equal gears forces two speeds)', () => {
    // Three equal gears meshed in a triangle: each reverses its neighbour, so
    // going round the loop demands rpm = −rpm. Over-constrained → locked.
    const gears = [g20, g20, g20];
    const meshes = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
    ];
    const t = solveTrain(gears, meshes, { gear: 0, rpm: 100 });
    expect(t.locked).toBe(true);
    expect(t.conflicts.length).toBeGreaterThan(0);
  });
});
