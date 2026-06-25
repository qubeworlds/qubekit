// qubeworlds.qubekit.kit — the QubeKit domain model, in ordinary Q64.
//
// Parts/ports/connections/controllers are plain records + face/fit. There is NO
// `part`/`snap` keyword — Q64 is domain-agnostic; QubeKit is a library on top.
//
// TODO(Phase 3): define the records mirroring ../../spec/{parts,assembly}.md,
// e.g. (sketch — refine against the spec):
//
//   pub struct SnapPort  { id: str, kind: str, local_pos: Vec3, local_axis: Vec3 }
//   pub struct Part      { id: str, mass: f32, ports: [SnapPort] }
//   pub struct Connection { from_part: str, from_port: str, to_part: str, to_port: str, constraint: str }
//
// Controllers live in ../controllers/*.q as @realtime functions over a state
// record (see blink_motor.q).
