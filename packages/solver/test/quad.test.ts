import { describe, expect, it } from 'vitest';
import { quadHoverSpeed, quadMixer, quadRotors, quadWrench, type QuadParams } from '../src/index';

const P: QuadParams = {
  armLength: 180, mass: 0.45, thrustCoeff: 1.2e-5, dragCoeff: 2.1e-7,
};

describe('quadcopter — counter-rotation layout', () => {
  it('has two CCW and two CW rotors on the diagonals', () => {
    const r = quadRotors(P);
    expect(r.filter((m) => m.spin === 1)).toHaveLength(2);
    expect(r.filter((m) => m.spin === -1)).toHaveLength(2);
    expect(r[0].spin).toBe(r[2].spin); // diagonal 0–2 shares a direction
    expect(r[1].spin).toBe(r[3].spin); // diagonal 1–3 shares the other
    expect(r[0].spin).toBe(-r[1].spin); // adjacent arms counter-rotate
  });

  it('places motors on the X arms at radius = armLength', () => {
    for (const m of quadRotors(P)) {
      expect(Math.hypot(m.x, m.z)).toBeCloseTo(P.armLength, 6);
    }
  });
});

describe('quadcopter — mixer (control allocation)', () => {
  it('hovers: four equal speeds, total thrust == weight, zero net torque', () => {
    const s = quadMixer(P, {});
    expect(s.hoverSpeed).toBeCloseTo(quadHoverSpeed(P), 9);
    for (const w of s.speeds) expect(w).toBeCloseTo(s.hoverSpeed, 6);
    expect(s.totalThrust).toBeCloseTo(s.weight, 6);
    expect(s.netTorque.roll).toBeCloseTo(0, 9);
    expect(s.netTorque.pitch).toBeCloseTo(0, 9);
    expect(s.netTorque.yaw).toBeCloseTo(0, 9); // counter-rotation cancels at hover
  });

  it('climb raises every rotor equally and keeps body torques zero', () => {
    const s = quadMixer(P, { climb: 0.2 });
    expect(s.totalThrust).toBeGreaterThan(s.weight);
    const w0 = s.speeds[0];
    for (const w of s.speeds) expect(w).toBeCloseTo(w0, 6);
    expect(s.netTorque.yaw).toBeCloseTo(0, 9);
  });

  it('yaw imbalances the two spin directions → net yaw torque, collective unchanged', () => {
    const s = quadMixer(P, { yaw: 0.5 });
    expect(s.netTorque.yaw).not.toBeCloseTo(0, 6); // reaction torques no longer cancel
    expect(s.totalThrust).toBeCloseTo(s.weight, 4); // total lift preserved
  });

  it('roll lifts the right side relative to the left (net roll torque)', () => {
    const s = quadMixer(P, { roll: 0.4 });
    expect(s.netTorque.roll).toBeGreaterThan(0);
  });

  it('never commands a negative rotor speed', () => {
    const s = quadMixer(P, { climb: -1, roll: 1, pitch: -1, yaw: 1, authority: 0.9 });
    for (const w of s.speeds) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('quadcopter — forward wrench (4 rotor speeds → body wrench)', () => {
  const wH = quadHoverSpeed(P);

  it('is the inverse of the hover mix: equal speeds → lift == weight, zero torque', () => {
    const w = quadWrench(P, [wH, wH, wH, wH]);
    expect(w.thrust).toBeCloseTo(w.weight, 6);
    expect(w.roll).toBeCloseTo(0, 9);
    expect(w.pitch).toBeCloseTo(0, 9);
    expect(w.yaw).toBeCloseTo(0, 9);
  });

  it('round-trips quadMixer: feed the mixer speeds back in, recover the command sense', () => {
    const mixed = quadMixer(P, { yaw: 0.4 });
    const w = quadWrench(P, mixed.speeds);
    expect(Math.sign(w.yaw)).toBe(Math.sign(mixed.netTorque.yaw));
    expect(w.thrust).toBeCloseTo(mixed.totalThrust, 6);
  });

  it('speeding the right-hand rotors rolls right (+roll torque)', () => {
    const r = quadRotors(P); // right rotors have x>0
    const speeds = r.map((m) => (m.x > 0 ? wH * 1.1 : wH * 0.9));
    expect(quadWrench(P, speeds).roll).toBeGreaterThan(0);
  });

  it('speeding only the two CCW rotors yaws one way, the two CW rotors the other', () => {
    const r = quadRotors(P);
    const ccwFast = r.map((m) => (m.spin === 1 ? wH * 1.1 : wH * 0.9));
    const cwFast = r.map((m) => (m.spin === -1 ? wH * 1.1 : wH * 0.9));
    expect(Math.sign(quadWrench(P, ccwFast).yaw)).toBe(-Math.sign(quadWrench(P, cwFast).yaw));
  });
});
