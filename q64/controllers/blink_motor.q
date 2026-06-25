// blink_motor — an example QubeKit controller, written as an ordinary Q64
// @realtime function over a small state record. This is the domain-agnostic
// shape the QubeKit Plan's `component BlinkMotor { input/output/state }` sketch
// reduces to once you drop the (non-existent) component keyword.
//
// TODO(Phase 3): implement against the real stdlib once the kit records land.
//
//   pub struct BlinkMotor { phase: f32 }
//
//   pub fn update(self: BlinkMotor, dt: f32) -> f32 @realtime {
//       let next = self.phase + dt
//       // motor_speed = sin(phase * 4.0) * 0.8
//       sin(next * 4.0) * 0.8
//   }
