# SO-100 arm — a QubeKit assembly

An emulation of the [SO-100 / SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100)
5-DOF hobby robot arm (+ gripper), built the QubeKit way: the arm is **not** an
imported mesh blob with hand-maintained FK — it is an ordinary assembly of
catalog parts whose snap-port positions encode the joint origins. Correctness
falls out of the construction model.

## What's here

- `assembly.json` — the Assembly graph: 13 part instances (7 links + 6 STS3215
  servos), 12 connections (2 per joint), 6 joint controllers. **Generated** by
  `tools/gen-so100.mjs` — edit the generator, not this file.
- The part family lives in `catalog/parts/so100/` (also generated): the
  `so100_sts3215` servo + one part per link (`so100_base` … `so100_jaw`).

## Construction model

Every SO-100 joint is revolute, so each of the six joints is the same pattern:

```
parent link ──(pin_socket ← pin: structural)── STS3215 servo case
servo horn  ──(motor_out → axle_socket: driven, keyed)── child link
```

The servo's case is bolted to the parent; the child link is keyed to the horn.
The joint angle lives across the driven edge — `@qubekit/sim`'s
`linkTransforms` (chain.ts) rotates the child subtree about the servo's output
axis by the servo's integrated angle. `servo.set` ops command target angles;
the tick tracks them at bounded velocity (servo.ts), exactly like an STS3215
in position mode.

Per-joint **software limits** (from link interference) are the joint
Controller's `params` in this assembly; the servo part carries only its
hardware envelope. See `controllers/so100_joint.q` in `runtime/` for the Q64
controller this maps to.

## Provenance & correctness

Joint origins, axes, and limits are copied **verbatim** from the Apache-2.0
`Simulation/SO100/so100.urdf` in TheRobotStudio/SO-ARM100. Each link part's
local frame is its URDF link frame; the assembly places the base rotated −90°
about X (URDF is Z-up, QubeKit worlds are Y-up, spec/parts.md).

`packages/sim/test/so100.test.ts` is the oracle: it re-embeds the URDF joint
table, composes the chain directly (`T_child = T_parent · Origin · Rot(axis, θ)`),
and asserts the assembly-graph FK reproduces it — at the zero pose, at an
articulated pose, and end-to-end through `servo.set` + ticking to settle.

Notes:

- URDF link masses **include** each link's motor; the `so100_sts3215` part's
  55 g is informational — a future dynamics pass must not double-count.
- `geometry` URLs point at `cdn.qubeworlds.com/qubekit/parts/so100/*.glb`;
  converting the upstream STLs and publishing them is a separate (pending)
  asset step — the kinematic emulation is complete without them.
- The parts are placed with explicit transforms (not snap-placed): a joint's
  zero orientation is keyed by the servo horn spline, which the snap resolver
  can't express yet (it mates positions + axes, leaving spin free).

## Driving it

```ts
import { Sim, linkTransforms } from '@qubekit/sim';

const sim = new Sim(catalog, assembly);
sim.world.apply({ op: 'servo.set', part: 2, angle: 0.5 }); // shoulder_pan
sim.tick(1 / 64);                                          // …every frame
const poses = linkTransforms(sim.world.assembly, catalog, sim.kinematics());
```

Servo instance ids, in chain order: `2` shoulder_pan, `4` shoulder_lift,
`6` elbow_flex, `8` wrist_flex, `10` wrist_roll, `12` gripper.

The control story upstream: a Q64 arm controller exposing
`set_targets(vec<f32, 6>)`, driven by a `stream<Joints, 250>` — the same
target stream a real SO-100 receives over serial, so this assembly serves as
the digital twin / test oracle for trajectories before they touch hardware.
