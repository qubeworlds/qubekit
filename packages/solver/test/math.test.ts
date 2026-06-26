import { describe, expect, it } from 'vitest';
import { QID, qexp, qmul, qrot, solveSPD } from '../src/index';

describe('quaternion', () => {
  it('qexp(0) is identity', () => {
    expect(qexp([0, 0, 0])).toEqual(QID);
  });

  it('90° about Z maps +X to +Y', () => {
    const v = qrot(qexp([0, 0, Math.PI / 2]), [1, 0, 0]);
    expect(v[0]).toBeCloseTo(0, 9);
    expect(v[1]).toBeCloseTo(1, 9);
    expect(v[2]).toBeCloseTo(0, 9);
  });

  it('composing two 90° rotations gives 180°', () => {
    const q = qexp([0, 0, Math.PI / 2]);
    const v = qrot(qmul(q, q), [1, 0, 0]);
    expect(v[0]).toBeCloseTo(-1, 9);
    expect(v[1]).toBeCloseTo(0, 9);
  });
});

describe('linalg', () => {
  it('Cholesky solves a known SPD system', () => {
    // 4x + y = 1 ; x + 3y = 2  ->  x = 1/11, y = 7/11
    const x = solveSPD(
      [
        [4, 1],
        [1, 3],
      ],
      [1, 2],
    );
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(1 / 11, 9);
    expect(x![1]).toBeCloseTo(7 / 11, 9);
  });

  it('returns null for a non-positive-definite matrix', () => {
    expect(solveSPD([[-1]], [1])).toBeNull();
  });
});
