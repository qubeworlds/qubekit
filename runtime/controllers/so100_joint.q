// so100_joint — one SO-100 joint: an STS3215 in position mode. The Q64 shape
// this reduces to, in the blink_motor.q style (a plain @realtime function over
// a small state record — no component keyword needed).
//
// The TS mirror of this behaviour ships today in @qubekit/sim (servo.ts):
// deadbeat tracking of a target angle under the joint's software limits
// (minAngle / maxAngle / maxVelocity — this assembly's Controller params, which
// narrow the servo part's hardware envelope, never widen it).
//
// The arm-level controller stacks six of these and exposes
// `set_targets(vec<f32, 6>)`, fed by a `stream<Joints, 250>` — the same target
// stream a real SO-100 receives over its serial bus, so the QubeKit assembly
// doubles as the digital twin / test oracle for hardware trajectories.
//
// TODO(Phase 3): implement against the real stdlib once the kit records land.
//
//   pub struct So100Joint { angle: f32, target: f32 }
//
//   pub fn set_target(self: So100Joint, angle: f32, min: f32, max: f32) {
//       self.target = clamp(angle, min, max)
//   }
//
//   pub fn update(self: So100Joint, dt: f32, max_velocity: f32) -> f32 @realtime {
//       // motor_speed: land on the target when in reach this tick, else slew
//       clamp((self.target - self.angle) / dt, -max_velocity, max_velocity)
//   }
