// Position-servo tracking (spec/parts.md §Servo parts). Each tick, every
// servo target is turned into a bounded angular speed and fed into the same
// motorSpeeds map free-spinning motors use — so the existing keyed/gear speed
// propagation and angle integration apply unchanged. This is the behaviour of
// a hobby serial-bus servo (e.g. an STS3215) in position mode: it slews toward
// the commanded angle at a capped velocity, never past its limits.
//
// Limit layering:
//   - hardware envelope  → the catalog Part's `servo` spec (clamped at op time
//     AND re-clamped here, so a widened controller can't exceed the hardware);
//   - software (joint) limits → the instance's Controller `params`
//     (`minAngle` / `maxAngle` / `maxVelocity`), when present. This is where an
//     assembly encodes per-joint mechanical range (links collide long before
//     the servo's own envelope does).

import type { Assembly, ServoSpec } from '@qubekit/schema';
import type { World } from './world';

/** Effective limits for one servo instance: controller params narrow the part's
 *  hardware envelope; they can never widen it. */
export function servoLimits(a: Assembly, instance: number, hw: ServoSpec): ServoSpec {
  const params = a.controllers.find((c) => c.part === instance)?.params;
  const min = params?.minAngle ?? hw.minAngle;
  const max = params?.maxAngle ?? hw.maxAngle;
  const vel = params?.maxVelocity ?? hw.maxVelocity;
  return {
    minAngle: Math.max(min, hw.minAngle),
    maxAngle: Math.min(max, hw.maxAngle),
    maxVelocity: Math.min(Math.abs(vel), hw.maxVelocity),
  };
}

/** Convert every servo target into this tick's drive speed (rad/s), written
 *  into `world.motorSpeeds`. `angles` is the sim's integrated-angle map — the
 *  servo's own entry is its current rotor angle. */
export function stepServos(world: World, angles: Map<number, number>, dt: number): void {
  if (dt <= 0) return;
  for (const [id, target] of world.servoTargets) {
    const inst = world.assembly.parts.find((p) => p.id === id);
    const hw = inst ? world.catalog.get(inst.partType)?.servo : undefined;
    if (!hw) continue; // instance vanished or part lost its servo spec
    const lim = servoLimits(world.assembly, id, hw);
    const goal = Math.min(lim.maxAngle, Math.max(lim.minAngle, target));
    const current = angles.get(id) ?? 0;
    // Deadbeat tracking under a velocity cap: land exactly on the goal when it
    // is within reach this tick, else slew at the cap.
    const speed = Math.min(lim.maxVelocity, Math.max(-lim.maxVelocity, (goal - current) / dt));
    world.motorSpeeds.set(id, speed);
  }
}
