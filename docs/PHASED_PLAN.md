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
>   (WebGPU opt-in, per `qubits` convention), a mobile GPU performance
>   budget (static-mesh **instancing + LOD** for many bricks — both currently
>   missing in quine), **touch-first input** (drag-to-place/rotate, long-press,
>   two-finger camera; picking driven by touch points not mouse pixels), a
>   **responsive overlay** that collapses to a phone layout for the run case, and
>   disciplined **Safari WebGL-context handling** (single context, `world`'s
>   `/scene` exhaustion checks).

Three decisions shape the sequencing:

1. **Build the tool client-side first; promote to a server later.** The QubeKit
   *tool* runs entirely in the browser — quine engine + `@qubekit/overlay` +
   `@qubekit/sim` executing **in-page** as the single-user authority. A new
   **stateful qubepods runtime** is still the eventual home of authoritative
   *multiplayer* state — but it is reached by **promoting the same portable
   `@qubekit/sim`** into an `apps/twin`-style Durable Object (no rewrite), not by
   building the server first. The Zig `qubeworlds/gameserver` and the
   `world/packages/qubegame` protocol are **reference precedent**, not the target
   host.
2. **A build *is* a GitHub-repo qube project; the OPFS VFS is its working tree.**
   Durability, version control, and sharing come from **git** — the user's build
   is a qube project repo (the `Plan.md` §10 layout). Locally it lives in **our
   VFS** (`qubepods/packages/q64-shell`'s OPFS-backed `OpfsVfs`), synced to GitHub
   via isomorphic-git over the VFS `FsBackend`. Consequence: **async
   collaboration + history ship in Milestone A with no server** (branches/PRs,
   the way developers already collaborate); only *real-time co-editing* needs
   Milestone B. The VFS mount-router and the portable sim share one property — a
   later server/R2 mount swaps in **without changing callers**.
3. **Q64 must stay domain-agnostic — "Q64 is a language, it does not know
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
| `actor`/`twin`/reactive-`state` + `@kv`/`@wire` effects (per-user/app/room Durable-Object-backed reactive state) | `q64/q64/src/{parser,ir,sema}/`; `spec/concurrency-model.md`, `reactivity.md` | **Scaffolded, not finished** (verified in source). `state`/`actor`/`handle`/`screen`/`let twin = X.spawn()` parse; module-level twins build in HIR (`ir/build_hir.zig`); `@kv`→`wasi:keyvalue`, `@wire` effects route to WIT imports (`ir/effects.zig`). **Follow-ups:** actor→record lowering, the `qview.*` **mutation-op codegen** (the diff emission), and the remote `@state(scope)` semantics (`@state` parses only as a generic annotation; `reactivity.md` calls it "not yet normative"). The natural backbone for authoritative world state once the diff codegen lands. |
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
- **Q64 (as general primitives, not QubeKit syntax — tracked in
  [q64-lang/q64#36](https://github.com/q64-lang/q64/issues/36)):** the
  surface + `@kv`/`@wire` effects exist; what's missing is the **`qview.*`
  mutation-op codegen** (diff emission) + remote `@state(scope)` semantics,
  **non-scalar WIT lifting** (str/list/record exports; scalars already lift to a
  wasmtime-validated component), and the **source-level call binding** for
  imported worlds (`@wire` import decls are emitted but not yet called).
- **QubeKit (new framework, mostly in `qubeworlds/qubekit`):** the part/port/
  connection/controller **domain model** as Q64 records + data assets; the
  construction protocol ops; the build/simulate UX; the parts catalog; the
  Qubepod project type; AI/education layers.

---

## Phasing

Work splits into two milestones. **Milestone A is the whole client-side tool and
ships with no server** — durability/versioning/sharing come from a GitHub repo
(working copy in the OPFS VFS), and `@qubekit/sim` runs in-page as the
single-user authority. **Milestone B promotes that same sim to an authoritative
server** only when *real-time* co-editing is wanted. (These supersede the
original linear P0–P8; the per-area engineering is unchanged, only resequenced.)

---

## Milestone A — Client-side tool (single-user, git-backed). No server.

### A0 — Specs, data model, agnosticism boundaries (1 wk, design)
Pin the contracts before code so quine/q64/qubepods/world stay decoupled.
- Write `qubekit/spec/`:
  - **Part schema** (data): geometry ref, mass, material, ordered **snap ports**
    (local pos/axis, port *type*, allowed counterpart types, tolerance, generated
    constraint type) — the canonical shape consumed by engine + sim + UI.
  - **Assembly/Connection/Controller graph** (`Plan.md` §6): `PartInstance`,
    first-class `Connection {from_part,from_port,to_part,to_port,constraint_type}`,
    `Controller {q64_module,inputs,outputs}`.
  - **Construction op set:** `part.place`, `part.move`, `port.connect`,
    `port.disconnect`, `controller.set`, `motor.set`, `part.delete`,
    `group.subassembly` — rev-stamped, reusing `world`'s `qubegame` envelope.
- Critical files: `qubekit/spec/{parts,assembly,protocol}.md`. Reference
  `world/packages/shared/src/scene.ts` and `qubegame/src/protocol.ts`.

### A1 — Quine engine primitives (3–4 wks) — *pulled to the front; the tool needs them*
Add generic, content-agnostic engine capabilities (real changes in `qubeworlds/quine`).
- **Bind Jolt constraints** (`libs/jolt` + `modules/physics/physics.zig`): fixed,
  hinge, slider, distance + a constraint registry; **symbolic gear/axle graph**
  (`Plan.md` §8 — cheaper + deterministic than tooth collision); add **raycast**.
- **Snap-port data + query:** optional `snap_ports` field on the scene `Entity`
  (`modules/core/scene.zig`) — *pure data, no engine meaning*; a generic
  `quine_nearest_ports(pos, radius)` query (sibling to `quine_pick`).
  **Compatibility lives in the host/sim, never the engine.**
- **Live entity mutation exports:** `quine_spawn_entity` / `remove_entity` /
  `set_transform` / `set_constraint` — mutate the live world without a reload.
- **Mobile/iPad readiness:** **static-mesh instancing** + **distance LOD** (both
  missing today; each brick is a draw call); touch-point picking/port-query;
  WebGL2 default. Validate on the iPad-class budget.
- **Milestone:** locally drive two boxes on a hinge, motorized; drag a part and
  see candidate snap transforms ghosted.
- Critical files: `quine/modules/physics/physics.zig`, `quine/libs/jolt/`,
  `quine/modules/core/{scene.zig,components.zig,core.zig}`,
  `quine/apps/desktop/main.zig`, `gizmo.zig`.

### A2 — Domain model + in-page sim (2–3 wks)
The QubeKit framework as TS + ordinary Q64 — no language changes.
- `@qubekit/schema`: `Part`/`SnapPort`/`Connection`/`Assembly`/`Controller` +
  the construction-op union + validators (from A0).
- `@qubekit/sim`: the **portable in-page authority** — validate/apply ops,
  symbolic gear graph (rpm/torque), fixed-rate tick. Host-agnostic + headless
  unit-testable, so it **promotes unchanged** into the Milestone-B server.
- `qubekit/q64/`: a **`qubekit` library qube** (`type: "library"`) with the
  domain records + `face`/`fit`; controllers as plain `@realtime` functions over
  a state record (effect checker enforces no-alloc/no-suspend) — *not* a
  `component {input/output}` keyword.
- **Dependency:** the controller-as-twin / component-export paths need the Q64
  work in [q64-lang/q64#36](https://github.com/q64-lang/q64/issues/36)
  (mutation-op codegen, non-scalar WIT lifting). **Until it lands, controllers
  run as `@realtime` fns and `@qubekit/sim` (TS) holds authority** — the
  designed fallback, with a later migration to Q64 twins.
- Critical files: `qubekit/packages/{schema,sim}/`, `qubekit/q64/`.

### A3 — Build/Simulate UX overlay (3 wks)
The construction surface as a scene **overlay** (the stack's overlay rule).
- `@qubekit/client`: snap resolution = `quine_nearest_ports` **+** compat rules
  (host-side); local apply driving `@qubekit/sim`.
- `@qubekit/overlay`: `mount(el, host)` over the quine canvas (Svelte 5, dark) —
  parts palette, ghost-snap placement, connect, clone/subassembly, undo/redo,
  Build/Simulate toggle, motor drive. **Touch-first** (drag, long-press, rotate
  handle, two-finger orbit/pan/zoom — no hover/mouse-only path); responsive,
  iPad editing floor / phone run layout.
- **Simulate:** controllers drive motors/constraints each tick via `@qubekit/sim`
  in-page; gear graph resolves rpm/torque; physics settles motion; sensors via
  raycast.
- Critical files: `qubekit/packages/{client,overlay}/`, mounted via `world`'s
  `mountScene` (`packages/qubegame/src/quine.ts`).

### A4 — Project model + persistence: VFS working tree + GitHub repo (2 wks)
Durability/versioning/sharing with **no server**.
- **Project model:** a build *is* a qube-project repo (`Plan.md` §10 layout:
  `project.jsonc`/`qube.json5`, `assemblies/`, `controllers/`, catalog refs,
  `wit/`). (De)serialize the live assembly ↔ these files.
- **Local working tree:** the project files live in **our VFS** —
  `qubepods/packages/q64-shell`'s OPFS-backed `OpfsVfs`, under
  `/qubekit/<project>/`.
- **GitHub sync:** isomorphic-git over the VFS `FsBackend` (clone/commit/push/
  pull); GitHub REST API for thin commits. Write callers against the **Vfs
  mount-router** so a later server/R2 mount swaps in without caller changes.
  (Note: OPFS is origin-scoped/per-device — a multi-account concern for later.)
- **Parts catalog (data):** the MVP rover set (`Plan.md` §13) in
  `catalog/parts/*.json` + CDN glTF; `tools/catalog-to-scene.ts` (build-time,
  never in wasm).

### ▸ Milestone A gate (the first demo)
> A single user, in the browser **on iPad**, builds + snaps + connects a rover,
> programs/drives its motors, runs Simulate (gear ratios + motor speed behave),
> and the build round-trips as a qube-project repo — **committed/pushed to GitHub
> and reopened from it** on a fresh load. No server, no auth.

---

## Milestone B — Real-time multiplayer (promote to authoritative server)

Start **only when simultaneous co-editing is needed** — async (git) collaboration
already works from Milestone A. The move is a *promotion*, not a rewrite.

### B1 — Stateful qubepods world runtime (3–4 wks)
Generalize the **existing** `apps/twin` DO pattern into a per-*world* authority.
- `apps/pod` **already routes `runtime: stateful` → a `QubeContainer` DO**;
  `apps/twin` **already** is a DO-backed runtime (hibernating WebSockets +
  SQLite state in the DO + per-message logic in a Dynamic Worker + broadcast
  fan-out). Reuse that shape; generalize twin's single `count` to the assembly
  graph + a rev-indexed op log, add a **fixed-rate tick loop (DO Alarms)**
  stepping `@qubekit/sim` (now server-side), and **world/space-token auth** on
  the WS handshake.
- **Milestone:** a generic stateful "echo world" — clients join, send rev-stamped
  ops, receive ordered deltas, state persists across reconnect.
- Critical files: `qubepods/apps/{twin,pod,gate}/`, `apps/twin/src/twin-core.ts`,
  `qubepods/packages/qubepod-schema/qubepod.schema.json`.

### B2 — Live replication: client switches authority → prediction (2 wks)
- Extend `world/packages/qubegame/src/protocol.ts` with the A0 construction ops;
  point `@qubekit/client`'s transport at the B1 runtime (token-authed). The
  client flips `@qubekit/sim` from **authority** to **prediction**; the server
  becomes the referee. Server-side validators (port compat, collision,
  over-constraint) run in the **same `@qubekit/sim`** module.
- Undo/redo + save/load promote from the VFS/git path to the runtime's op log +
  D1; the VFS mount-router lets the same project paths back onto R2/D1.
- **Milestone:** two browser clients build a rover **simultaneously**; ops
  validated server-side, replicated, persisted, survive reload; presence cursors.

### B3 — Qubepod world type, publishing, MVP demo (2 wks)
- Define the `qubekit.world` **Qubepod project** descriptor (deployment manifest
  in `qubepods/packages/qubepod-schema` — `runtime: stateful`, storage; tick rate
  is runtime config). Publish parts libraries to the **Continuum** when public.
- **MVP demo (`Plan.md` §13):** two users collaboratively build a rover, program
  it in Q64, simulate + drive it, publish it as a Qubepod at
  `qubepods.com/<user>/rover-kit`. **Run on phone** is part of acceptance.

---

## Later (not MVP)
AI assembly generation (emit construction-op graphs, not raw meshes — `Plan.md`
§11), the education/lesson layer (§12), a Scratch-style blocks controller that
lowers to the same Q64 controller shape, marketplace, stress/breakage physics,
and **migrating controllers to Q64 twins** once q64#36 lands.

---

## Cross-cutting principles (enforce in every phase)
- **Client-side first; git-backed.** The tool runs in-page with no server; a
  build is a GitHub-repo qube project with the OPFS VFS as working tree. The
  stateful runtime is a later *promotion* of the same `@qubekit/sim`, not a
  prerequisite — async collaboration ships in Milestone A.
- **One portable sim, two homes.** `@qubekit/sim` is host-agnostic: in-page
  authority (Milestone A) → server authority in the `apps/twin` DO (Milestone B),
  no rewrite. Likewise the VFS mount-router → R2/D1 mount without caller changes.
- **Engine stays content-agnostic.** quine gains *generic* physics joints +
  spatial port queries; never a "beam"/"gear" concept. Part meaning lives in
  data + host/sim.
- **Q64 stays domain-agnostic.** No `part`/`snap` keywords. QubeKit is a Q64
  *library + data*, using `@realtime`, `face`/`fit`, `state`/`@state`, WIT.
- **Replicate operations, not snapshots** (Milestone B). Reuse the rev-stamped op
  log + envelope (`world/packages/qubegame/src/protocol.ts`).
- **Device floor is non-negotiable: edit on iPad, run on phone.** Touch-first
  input, WebGL2-default, mobile GPU budget (instancing + LOD), responsive
  overlay, single Safari WebGL context. Test on the floor device each phase.

## Verification
- **A1 (quine):** `cd quine && zig build test` for new physics-constraint +
  port-query units; **headless visual** check of a hinge/motor scene via
  `QUINE_THUMB=1 … xvfb-run ./zig-out/bin/quine` (`quine/CLAUDE.md`).
- **A2 (sim/q64):** headless unit tests for `@qubekit/sim` (validate/apply, gear
  graph); `qube build` the `qubekit` library + a controller, assert the effect
  checker passes `@realtime`.
- **A3 (UX):** Playwright build+simulate a rover **under an iPad Safari
  viewport/touch profile** (not just desktop pointer); `world` `/scene`-style
  isolation to separate engine vs integration faults.
- **A4 (persistence):** round-trip a build to the VFS working tree, commit/push to
  a GitHub repo, wipe OPFS, clone + reopen — assert identical assembly graph.
- **▸ Milestone A gate** = the solo-rover acceptance test (build → program →
  simulate → drive → commit to repo → reopen), iPad + phone viewports.
- **B1/B2:** integration test — N WebSocket clients join the stateful world, send
  ops, assert ordered identical delta streams + persistence across reconnect;
  two Playwright clients co-edit simultaneously.
- **B3:** end-to-end MVP demo = publish a Qubepod and reopen it; run validated on
  a phone viewport.

## Open items
- **In-browser git mechanism (A4 spike):** isomorphic-git over the VFS
  `FsBackend` vs GitHub REST API for thin commits — pick against bundle size +
  offline behaviour on iPad Safari.
- **When to start Milestone B:** the trigger is demand for *simultaneous*
  co-editing; until then git async collaboration suffices. (The substrate
  question is resolved — reuse the `apps/twin` DO pattern; `apps/pod` already
  routes `runtime: stateful`.)
- **Q64 twins migration** gated on [q64-lang/q64#36](https://github.com/q64-lang/q64/issues/36)
  (mutation-op codegen + non-scalar WIT lifting); TS-side `@qubekit/sim` authority
  is the standing fallback.
