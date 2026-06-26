# @qubekit/solver

The deterministic core of QubeKit's build/simulate stack: a **3D assembly
constraint solver** and **physically-correct involute spur gears**. Pure
TypeScript, no dependencies, **metric (millimetres)**. Runs the same in the
browser client, a Qubepods world-runner, or CI.

> Why this exists: a snap that just picks the first compatible port and slaps a
> part down can't satisfy two constraints at once (a pin through two holes) or
> close a loop (a four-bar linkage). And a "gear" that's just a pretty mesh —
> like a diffusion-model render — won't actually turn. This package makes both
> the placement and the mechanism *physically real*.

## Constraint solver

Rigid bodies carry an SE(3) pose (`position` + orientation `quat`). Mates are
pure residual functions; the solver drives the stacked residual to zero with
**Levenberg–Marquardt**, linearizing around the exponential-map retraction each
iteration. Ground at least one body to pin the global gauge.

| Constraint | DOF removed | Kinematics |
|---|---|---|
| `coincident(a, pA, b, pB)` | 3 | pin joint / weld point |
| `parallel(a, axA, b, axB, sense)` | 2 | axis alignment |
| `concentric(a, lineA, b, lineB, sense)` | 4 | axle-in-bearing, pin-in-hole (slide + spin free) |
| `distance(a, pA, b, pB, d)` | 1 | strut / belt span |

```ts
import { solve, concentric, type Body } from '@qubekit/solver';

const ground: Body = { position: [0, 0, 0], orientation: [0, 0, 0, 1], grounded: true };
const part: Body = { position: [3, 6, 2], orientation: [0, 0, 0, 1] };
const res = solve([ground, part], [
  concentric(0, { point: [0, 0, 0], axis: [1, 0, 0] }, 1, { point: [0, 0, 0], axis: [1, 0, 0] }),
]);
// res.converged === true, res.bodies[1] now lies on the world X axis
```

Adding a constraint type means writing one residual function — the solver never
changes (the Jacobian is numeric, via the body retraction).

## Gears (`gear`, `canMesh`, `solveTrain`)

Standard ISO full-depth involute spur gears: pitch radius `r = m·z/2`, base
circle `r·cosα`, addendum `m`, dedendum `1.25·m`, involute-of-circle flanks.
`canMesh` enforces the real meshing laws and explains every failure:

1. **equal module** (same tooth size) — the law diffusion renders break most;
2. **equal pressure angle**;
3. **centre distance `= m·(z₁+z₂)/2`** (pitch circles tangent);
4. **contact ratio ε ≥ 1** (a tooth pair always engaged);
5. **no undercut** (`z ≥ 2/sin²α`, ≈18 at 20°).

`solveTrain` propagates rotation through a mesh graph (`−z_a/z_b` per external
mesh, sign flip) and flags **locked loops** — kinematically impossible trains,
e.g. an odd ring of equal gears.

```ts
import { gear, canMesh } from '@qubekit/solver';
const pinion = gear({ teeth: 20, module: 1 }); // r = 10 mm
const wheel  = gear({ teeth: 32, module: 1 }); // r = 16 mm
canMesh(pinion, wheel);
// { ok: true, centerDistance: 26, gearRatio: -0.625, contactRatio: 1.61 }
```

See `examples/render-gear-pair.mjs` → `gear-pair.svg` for a rendered,
correctly-phased meshing pair (run `pnpm build` first).

## Develop

```sh
pnpm install
pnpm --filter @qubekit/solver test       # 16 unit tests
pnpm --filter @qubekit/solver typecheck
pnpm --filter @qubekit/solver build
```

## Status

Prototype (spike). Spur gears + rigid mates today. Natural next steps: helical /
bevel / internal gears and profile-shift (`x`), a `gearMesh` rotational-coupling
*constraint* so the solver animates a train directly, and wiring bodies/ports to
`@qubekit/schema` part definitions.
