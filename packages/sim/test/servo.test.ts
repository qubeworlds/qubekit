// servo.set + tick tracking: hardware clamp at op time, software (controller)
// limits at tick time, bounded slew, and keyed propagation into the driven link.

import { describe, expect, it } from 'vitest';
import type { Part } from '@qubekit/schema';
import { Sim } from '../src/index';

const SERVO: Part = {
  id: 'test_servo',
  name: 'Test servo',
  geometry: 'none',
  mass: 0.05,
  material: 'metal',
  servo: { minAngle: -Math.PI, maxAngle: Math.PI, maxVelocity: 2 },
  ports: [
    { id: 'mount', type: 'pin', localPos: [0, 0, 0], localAxis: [0, 0, 1], allowedCounterparts: ['pin_socket'], tolerance: 0.001, constraint: 'fixed' },
    { id: 'out', type: 'motor_out', localPos: [0, 0, 0], localAxis: [0, 0, 1], allowedCounterparts: ['axle', 'axle_socket'], tolerance: 0.001, constraint: 'fixed' },
  ],
};
const LINK: Part = {
  id: 'test_link',
  name: 'Test link',
  geometry: 'none',
  mass: 0.1,
  material: 'plastic',
  ports: [
    { id: 'horn', type: 'axle_socket', localPos: [0, 0, 0], localAxis: [0, 0, 1], allowedCounterparts: ['motor_out', 'axle'], tolerance: 0.001, constraint: 'fixed' },
  ],
};
const T = { p: [0, 0, 0] as [number, number, number], q: [1, 0, 0, 0] as [number, number, number, number], s: [1, 1, 1] as [number, number, number] };

const catalog = new Map([[SERVO.id, SERVO], [LINK.id, LINK]]);

function rig() {
  const sim = new Sim(catalog);
  const servo = sim.world.apply({ op: 'part.place', partType: 'test_servo', transform: T }).assignedId!;
  const link = sim.world.apply({ op: 'part.place', partType: 'test_link', transform: T }).assignedId!;
  const conn = sim.world.apply({ op: 'port.connect', fromPart: servo, fromPort: 'out', toPart: link, toPort: 'horn' });
  expect(conn.ok).toBe(true);
  return { sim, servo, link };
}

const settle = (sim: Sim, seconds: number, dt = 1 / 64) => {
  for (let t = 0; t < seconds; t += dt) sim.tick(dt);
};

describe('servo.set', () => {
  it('rejects a non-servo target', () => {
    const { sim, link } = rig();
    expect(sim.world.apply({ op: 'servo.set', part: link, angle: 1 }).ok).toBe(false);
  });

  it('clamps the target to the hardware envelope at apply time', () => {
    const { sim, servo } = rig();
    expect(sim.world.apply({ op: 'servo.set', part: servo, angle: 100 }).ok).toBe(true);
    expect(sim.world.servoTargets.get(servo)).toBe(Math.PI);
  });

  it('tracks the target and lands exactly on it', () => {
    const { sim, servo } = rig();
    sim.world.apply({ op: 'servo.set', part: servo, angle: 1.5 });
    settle(sim, 2);
    expect(sim.kinematics().get(servo)).toBeCloseTo(1.5, 9);
  });

  it('never slews faster than maxVelocity', () => {
    const { sim, servo } = rig();
    sim.world.apply({ op: 'servo.set', part: servo, angle: 3 });
    const dt = 1 / 64;
    let prev = 0;
    for (let i = 0; i < 64; i++) {
      const angle = sim.tick(dt).angles.get(servo) ?? 0;
      expect(Math.abs(angle - prev)).toBeLessThanOrEqual(2 * dt + 1e-9);
      prev = angle;
    }
    // after exactly 1 s at the 2 rad/s cap: 2 rad of the 3 covered
    expect(prev).toBeCloseTo(2, 6);
  });

  it('respects the joint controller software limits over the hardware envelope', () => {
    const { sim, servo } = rig();
    sim.world.apply({ op: 'controller.set', part: servo, q64Module: 'controllers/so100_joint.q', params: { minAngle: -0.5, maxAngle: 0.5 } });
    sim.world.apply({ op: 'servo.set', part: servo, angle: 2 }); // within hardware, beyond joint
    settle(sim, 2);
    expect(sim.kinematics().get(servo)).toBeCloseTo(0.5, 9);
  });

  it('drives the keyed link to the same angle', () => {
    const { sim, servo, link } = rig();
    sim.world.apply({ op: 'servo.set', part: servo, angle: -1 });
    settle(sim, 2);
    expect(sim.kinematics().get(link)).toBeCloseTo(-1, 9);
  });

  it('undo restores the previous target', () => {
    const { sim, servo } = rig();
    sim.world.apply({ op: 'servo.set', part: servo, angle: 1 });
    sim.world.apply({ op: 'servo.set', part: servo, angle: 2 });
    sim.world.undo();
    expect(sim.world.servoTargets.get(servo)).toBe(1);
  });
});
