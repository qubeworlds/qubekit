# QubeKit — Phased Plan to Build It on the Existing Ecosystem

## Context

`qubekit/Plan.md` is a strong product vision: **QubeKit**, a multiplayer
mechanical construction kit (programmable Lego/fischertechnik-style — bricks,
beams, gears, axles, motors, sensors, logic) that doubles as the flagship demo
for the whole Qubeworlds stack: *build a rover together in the browser, program
it in Q64, simulate it in Quine, publish it on Qubepods.*

This plan grounds that vision in **what the ecosystem actually provides today**
(verified by exploring `quine`, `world`, `q64`, `qubepods`) and sequences the
real engineering.

> **Quine is ours to change.** Modifying the Quine engine itself is explicitly
> in-scope — we add new generic engine capabilities (Jolt constraints, snap-port
> data + spatial queries, live entity-mutation exports, presence rendering)
> directly in `qubeworlds/quine`. The only constraint is the existing one:
> additions stay **content-agnostic** (generic physics/spatial primitives, never
> a "beam"/"gear" concept baked into the engine). Quine is not a frozen
> dependency we merely build around — Phase 2 lands real changes in that repo.

> **Device targets are a hard requirement, set up front.**
> - **Editing (Build Mode): iPad is the minimum device.** The full construction
>   UX — palette, snap placement, gizmos, clone/subassembly, multiplayer cursors
>   — must be usable with **touch on iPad Safari** (the stack's existing
>   compatibility floor). No hover-dependent affordances, no mouse-only gizmo.
> - **Running/viewing a scene: phone is the minimum device.** Loading a published
>   QubeKit world, watching/driving the simulation, and basic interaction must
>   work on a **mobile phone browser**.
> - Consequences threaded through the phases: **WebGL2-default** rendering
>   (WebGPU opt-in, per `qubepods-examples` convention), a mobile GPU performance
>   budget (static-mesh **instancing + LOD** for many bricks — both currently
>   missing in quine), **touch-first input** (drag-to-place/rotate, long-press,
>   two-finger camera; picking driven by touch points not mouse pixels), a
>   **responsive overlay** that collapses to a phone layout for the run case, and
>   disciplined **Safari WebGL-context handling** (single context, `world`'s
>   `/scene` exhaustion checks).

Two product decisions further shape it:

1. **Authoritative simulation runs on a *new stateful qubepods runtime*** — not
   the bespoke Zig `qubeworlds/gameserver`. The gameserver and the
   `world/packages/qubegame` protocol are **reference precedent**, not the target
   host. We build the missing stateful per-world runner as a first-class qubepods
   capability.
2. **Q64 must stay domain-agnostic — "Q64 is a language, it does not know
   QubeKit."** The vision doc's `pub part Beam5 { snap hole[5]: PinSocket … }`
   is **rejected as language syntax.** There is no `part`/`snap`/`component
   input/output` keyword. QubeKit is a **framework expressed in ordinary Q64**
   (records/structs, `face`/`fit`, the `@realtime` effect, `state`/`@state`
   twins, WIT synthesis) plus **data** (parts catalog as assets). This matches the
   separation the stack already enforces everywhere: quine "knows NOTHING about
   content", cmotion's value tree is "renderer-agnostic", `q64/check.zig` "grows
   by pull, not push."

### What already exists (load-bearing, reuse it)

| Capability | Where | State |
|---|---|---|
| Operation-replication multiplayer (rev-stamped `EditOp`/`CmdOp`, idempotent apply, resync, origin-echo) | `world/packages/qubegame/src/protocol.ts`, `client.ts`, `transport.ts` | **Working** (instance.spawn/remove/transform). Pluggable transport seam. |
| Deterministic ECS + fixed-timestep core/render split | `quine/modules/core/core.zig`, `modules/ecs/ecs.zig`, `components.zig` | **Working**. 12 components, sparse-set ECS, no joints/hierarchy-as-constraint. |
| Jolt rigid-body physics (box/sphere/hull, static/dynamic/kinematic, contacts) | `quine/modules/physics/physics.zig`, `libs/jolt/` | **Working bodies + contacts. NO constraints/joints, no raycast.** |
| Ray picking + translation gizmo | `quine/apps/desktop/main.zig` (`quine_pick`), `gizmo.zig` | **Working.** No snap hints, no multi-select. |
| Content-agnostic scene/asset pipeline (`scene.json`, `quine_provide_asset`, overlay link) | `quine/modules/core/scene.zig`, `apps/desktop/main.zig`; `world` `mountScene`/overlay mount in `qubegame/src/quine.ts` | **Working.** Scene has `parent`, `body`; no snap-port field. |
| Q64 compiler: effects/`@realtime` enforcement, `face`/`fit`, ambient `env` capabilities, WIT world synthesis | `q64/q64/src/{effect,sema,typeck,wit}/`; specs in `q64/spec/` | **Real, partial.** `@realtime` no-alloc/no-suspend enforced. WIT lifting scalar-only in v0. |
| `state`/`@state(scope)` twins (local + per-user/app/room Durable-Object-backed reactive state) | `q64/spec/concurrency-model.md`, `reactivity.md` | **Designed, not implemented.** This is the natural backbone for authoritative world state. |
| qube.json5 manifest, Continuum registry (publish/resolve, effect indexing) | `q64/spec/qube.json5.md`, `continuum-api/` | Manifest + registry **infra ready**; no public instance; no parts published. |
| Stateless qube hosting (Dynamic Workers + KV + WebSocket), gate/pod/runner/router | `qubepods/apps/{gate,pod,runner,router}-*` | **Stateless deployed.** `runtime: stateful` accepted by schema; **no stateful runtime implemented.** |
| Container/process daemon (node ebot) running the Zig gameserver as precedent | `qubepods/apps/node-controller/`; `qubeworlds/gameserver` (out of scope here) | **Working**, but admin/bespoke — the model to generalize, not to extend. |

### The real gaps QubeKit must close

- **Quine:** Jolt constraints (fixed/hinge/slider/distance/gear), snap-port data on
  entities + a generic "nearest compatible port" spatial query, live entity
  mutation WASM exports, presence/cursor rendering.
- **Qubepods:** an actual **stateful per-world runtime** — container/DO process,
  authoritative tick loop, op-validation, delta fan-out, D1/R2 persistence,
  multiplayer session routing, world/space-token auth.
- **Q64 (as general primitives, not QubeKit syntax):** finish `@state(room)`
  twins + the mutation-diff protocol, complete WIT lifting for non-scalar types,
  RPC call codegen.
- **QubeKit (new framework, mostly in `qubeworlds/qubekit`):** the part/port/
  connection/controller **domain model** as Q64 records + data assets; the
  construction protocol ops; the build/simulate UX; the parts catalog; the
  Qubepod project type; AI/education layers.

---

## Phasing

Each phase aims to end on something demonstrable. Phases 1–2 can run in parallel
(different repos/teams); Phase 3 depends on the data shapes agreed in Phase 0.

### Phase 0 — Specs, data model, and the agnosticism boundaries (1 wk, design)
Pin the contracts before code so quine/q64/qubepods/world stay decoupled.
- Write `qubekit/spec/`:
  - **Part schema** (data): geometry ref, mass, material, ordered **snap ports**
    (local pos/axis, port *type*, allowed counterpart types, tolerance, generated
    constraint type). This is the canonical shape consumed by engine + sim + UI.
  - **Assembly/Connection/Controller graph** (mirrors `Plan.md` §6): `PartInstance`,
    first-class `Connection {from_part,from_port,to_part,to_port,constraint_type}`,
    `Controller {q64_module,inputs,outputs}`.
  - **Construction op set** (extends qubegame): `part.place`, `part.move`,
    `port.connect`, `port.disconnect`, `controller.set`, `motor.set`,
    `part.delete`, `group.subassembly` — all rev-stamped, same envelope as
    `world/packages/qubegame/src/protocol.ts`.
- Decide the **agnosticism lines** explicitly and write them into each repo's
  CLAUDE-style note: quine exposes generic *spatial port queries* + *physics
  joints* (no notion of "beam"/"gear"); the host/sim owns compatibility rules;
  Q64 stays free of QubeKit keywords; QubeKit ships as a **library qube +
  data**, not engine or language features.
- Critical files to author: `qubekit/spec/parts.md`, `qubekit/spec/assembly.md`,
  `qubekit/spec/protocol.md`. Reference existing shapes in
  `world/packages/shared/src/scene.ts` and `qubegame/src/protocol.ts`.

### Phase 1 — Stateful qubepods world runtime (the authoritative host) (3–4 wks)
Build the missing capability the user explicitly chose to target. Generalize the
gameserver precedent into a real qubepods runtime.
- In `qubepods`: implement the `runtime: stateful` path end-to-end —
  `apps/pod` routes a stateful app to a **per-world process/Durable Object**
  (not Dynamic Worker); a **fixed-rate authoritative tick loop** (tick rate is
  container/runtime config, *not* a qube.json5 field — see q64 finding); op
  intake → validation → apply → rev-stamped delta fan-out over WebSocket;
  **D1 for assembly state, R2 for assets** (the `storage:{state:d1,assets:r2}`
  shape in `Plan.md` §10); **session routing** (which clients join which world
  instance); **world/space-token auth** on the WS handshake (the piece
  `qubegame` currently lacks).
- Reuse the node-controller/`gameserver` deployment learnings
  (`qubepods/CLAUDE.md` §"Operating game-server nodes") for the container case;
  prefer DO-backed where it fits the edge model.
- **Milestone:** a generic stateful "echo world" — clients join a room, send
  rev-stamped ops, receive ordered deltas, state persists across reconnect. No
  QubeKit semantics yet.
- Critical files: `qubepods/apps/pod-*/`, `qubepods/apps/runner-*/`,
  `qubepods/packages/qubepod-schema/qubepod.schema.json` (the `runtime` enum is
  already there), `apps/gate-*` (token passthrough).

### Phase 2 — Quine mechanical + construction primitives (3–4 wks, parallel to P1)
Add generic engine capabilities; keep them content-agnostic.
- **Bind Jolt constraints** in `libs/jolt` + `modules/physics/physics.zig`:
  fixed, hinge, slider, distance; expose create/destroy + a constraint registry;
  represent **gear ratio symbolically** (a kinematic axle graph, per `Plan.md`
  §8 — cheaper + deterministic than tooth collision). Add **raycast** (needed
  for placement + sensors).
- **Snap-port data + query:** add an optional `snap_ports` field to the scene
  `Entity` (`modules/core/scene.zig`) — *pure data*, engine assigns no meaning;
  add a generic `quine_nearest_ports(pos, radius)` spatial query (sibling to
  `quine_pick`) returning candidate ports + transforms. **Compatibility logic
  lives in the host/sim, not the engine.**
- **Live entity mutation exports:** `quine_spawn_entity`, `quine_remove_entity`,
  `quine_set_transform`, `quine_set_constraint` — so replicated ops mutate the
  live world without a full scene reload.
- **Presence rendering:** consume the already-defined `presence` (camera/sel)
  messages and draw remote cursors/selection highlight.
- **Mobile/iPad readiness (device requirement):** add **static-mesh instancing**
  (today only skinned meshes batch — each brick is a draw call) and **distance
  LOD** so a large assembly holds frame rate on a mobile GPU; make `quine_pick`
  /`quine_nearest_ports` accept **touch points** (and a slightly larger touch
  tolerance); keep the **WebGL2** path the default. Validate on the iPad-class
  budget, not just desktop.
- **Milestone:** locally drive two boxes joined by a hinge, motorized spin via a
  constraint; drag a part and see candidate snap transforms ghosted.
- Critical files: `quine/modules/physics/physics.zig`, `quine/libs/jolt/`,
  `quine/modules/core/{scene.zig,components.zig,core.zig}`,
  `quine/apps/desktop/main.zig` (new exports + query), `gizmo.zig`.

### Phase 3 — QubeKit domain model in Q64 (as a library + data) (2–3 wks)
Express parts/controllers using **general-purpose** Q64 — no language changes.
- New repo content in `qubeworlds/qubekit`: a **`qubekit` library qube** (q64
  `type: "library"`) defining `Part`, `SnapPort`, `Connection`, `Assembly`,
  `Controller` as ordinary Q64 records + `face`/`fit` for behaviors. Controllers
  are plain `@realtime` functions over a state record (the effect checker already
  enforces no-alloc/no-suspend) — *not* a `component {input/output}` keyword.
- **Parts catalog as data:** beams/gears/motors authored as Phase-0 data assets
  (geometry on the CDN, ports/mass in JSON) — the MVP rover set from `Plan.md`
  §13. Q64 reads them as data; it does not gain a `part` keyword.
- Validate that this round-trips: a Q64 controller compiles, passes effect
  checks, and (later) emits a WIT world via existing `q64/q64/src/wit/`.
- **Milestone:** `qube build` a `qubekit` library + a `BlinkMotor`-style
  controller written in idiomatic Q64; parts catalog loads as data.
- Critical files: `qubekit/q64/` (new library), `qubekit/parts/*.json` (+ CDN
  glTF), reuse `q64/spec/effects.md`, `q64/spec/env.md`.

### Phase 4 — Construction protocol + persistence wiring (2 wks)
Connect the three layers into one replicated loop.
- Extend `world/packages/qubegame/src/protocol.ts` with the Phase-0 construction
  ops (same rev/origin envelope). Point the transport at the **Phase-1 qubepods
  stateful runtime** (via `resolveEndpoint`/allocate, now token-authed).
- Server-side (Phase-1 runtime) gains QubeKit validators: legal port
  compatibility, collision/over-constraint checks (using quine physics as the
  authority or a headless mirror), then apply + persist to D1, fan out deltas.
- Add **undo/redo** via the edit-log (inverse ops or rev-rollback) and
  **save/load** of an assembly (the runtime already persists; expose
  load-from-saved vs load-from-base).
- **Milestone:** two browser clients place/connect parts; ops validated
  server-side, replicated, persisted, survive reload.
- Critical files: `world/packages/qubegame/src/{protocol.ts,client.ts}`,
  Phase-1 runtime validators, `qubepods` D1 schema.

### Phase 5 — Build Mode UX (2–3 wks)
The construction surface as a scene **overlay** (per the stack's overlay rule).
- A QubeKit overlay module (`mount(el, host)`) hosting the **parts palette**,
  snap placement (drag part → `quine_nearest_ports` → ghost → confirm =
  `part.place` op), clone/subassembly, undo/redo, multiplayer cursors. Mounted
  over the canvas exactly like `world`'s `mountScene` overlay path.
- **Touch-first, iPad-minimum (device requirement):** every Build-Mode
  interaction has a touch gesture (drag-to-place, long-press for context/delete,
  rotate handle, two-finger orbit/pan/zoom) — no hover-only or mouse-only path.
  Palette + inspectors are a **responsive overlay** that works at iPad width and
  degrades gracefully; verify on iPad Safari, not just desktop pointer.
- **Milestone:** the full `Plan.md` §3 Build Mode feature list working
  collaboratively **on iPad** for the rover part set.
- Critical files: `qubekit/overlay/` (new), integrate via `world`
  `apps/play`/`mountScene` (`packages/qubegame/src/quine.ts`).

### Phase 6 — Simulate Mode (2–3 wks)
Make constructions run.
- Wire Q64 controllers (Phase 3) to drive motor ops/constraints each tick on the
  authoritative runtime; symbolic gear graph resolves rpm/torque (`Plan.md` §8);
  rigid-body physics settles visible motion in quine; sensors via raycast.
- **Milestone:** program the rover in Q64, hit Simulate, drive it; gear ratios
  and motor speed behave; state stays in multiplayer sync.

### Phase 7 — Project type, publishing, MVP demo (2 wks)
- Define the `qubekit.world` **Qubepod project** descriptor (deployment manifest
  in `qubepods/packages/qubepod-schema`, NOT qube.json5 — `runtime: stateful`,
  storage bindings; tick rate is runtime config). Publish parts libraries to the
  **Continuum** when a public instance exists (mechanically ready today).
- **MVP demo (the `Plan.md` §13 goal):** two users collaboratively build a
  rover, program it in Q64, simulate + drive it in Quine, publish it as a
  Qubepod at `qubepods.com/<user>/rover-kit`.
- **Run on phone (device requirement):** the published world opens, simulates,
  and is drivable from a **mobile phone browser** (responsive run-view layout,
  WebGL2, simple touch drive controls) — verified as part of demo acceptance.

### Phase 8 — Later layers (not MVP)
AI assembly generation (emit construction-op graphs, not raw meshes — `Plan.md`
§11), the education/lesson layer (§12), a Scratch-style blocks controller that
lowers to the same Q64 controller shape, marketplace, stress/breakage physics.

---

## Cross-cutting principles (enforce in every phase)
- **Engine stays content-agnostic.** quine gains *generic* physics joints +
  spatial port queries; never a "beam"/"gear" concept. Part meaning lives in
  data + host/sim.
- **Q64 stays domain-agnostic.** No `part`/`snap` keywords. QubeKit is a Q64
  *library + data*, using `@realtime`, `face`/`fit`, `state`/`@state`, WIT.
- **Replicate operations, not snapshots.** Reuse the rev-stamped op log; new ops
  use the same envelope (`world/packages/qubegame/src/protocol.ts`).
- **Authoritative state on qubepods; clients predict.** Matches `Plan.md` §9–10.
- **Device floor is non-negotiable: edit on iPad, run on phone.** Touch-first
  input, WebGL2-default, mobile GPU budget (instancing + LOD), responsive
  overlay, single Safari WebGL context. Test on the floor device each phase, not
  only desktop.

## Verification
- **Phase 1:** integration test — N WebSocket clients join a stateful world, send
  ops, assert ordered identical delta streams + persistence across reconnect
  (harness in `qubepods` against `pod`/`runner` stateful path).
- **Phase 2:** `cd quine && zig build test` for new physics-constraint + port-query
  units; **headless visual** verification of a hinge/motor scene via the
  `QUINE_THUMB=1 … xvfb-run ./zig-out/bin/quine` path in `quine/CLAUDE.md`.
- **Phase 3:** `qube build` the `qubekit` library + a controller; assert effect
  checker passes `@realtime`; `q64 show world` emits a WIT world.
- **Phase 4–6:** two real browser clients (Playwright) build + connect + simulate
  a rover; assert replicated identical assembly graphs and that a reload restores
  state. Use `world` `/scene`-style isolation harness to separate
  engine vs integration faults. **Run the editing client under an iPad Safari
  viewport/touch-emulation profile** so the touch path is exercised, not just
  desktop pointer.
- **Phase 7:** end-to-end demo script = the MVP acceptance test (build → program →
  simulate → drive → publish → reopen the published Qubepod), **with Build Mode
  validated on iPad and the published run validated on a phone viewport.**

## Open items to confirm before/within Phase 0
- Stateful runtime substrate: **Durable Object vs container-on-node** for the
  per-world process (Phase 1 spike should pick one against edge-latency + tick
  determinism needs).
- Whether `@state(room)` twins (q64 concurrency model) are implemented *as the*
  Phase-1 state mechanism, or Phase 1 ships a TS/runtime authority first and
  adopts Q64 twins later.
