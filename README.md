# QubeKit

A programmable mechanical construction environment for Qubeworlds — assemble
beams, gears, axles, motors, sensors, and logic into working machines, build them
collaboratively in the browser, program them in Q64, simulate them in Quine, and
publish them on Qubepods.

See [`Plan.md`](./Plan.md) for the product vision and
[`docs/PHASED_PLAN.md`](./docs/PHASED_PLAN.md) for the engineering sequencing.

## The two deployable units

QubeKit follows the q64 vocabulary precisely:

- **`runtime/` — a qube** (lowercase: a *library* qube, `type: "library"`). The
  portable construction model + controllers. Published to the **Continuum**
  (`qube publish`) and linked by anything that needs the logic — the editor, a
  Qubepods world-runner. Qube id `qubeworlds.qubekit.runtime`.
- **`apps/editor/` — a Qube** (uppercase: an *application* Qube). The deployable
  editor. Shipped to **Qubepods** (`qube deploy`), where it gets a URL. Qube id
  `qubeworlds.qubekit.editor`.

The q64 / `qube` CLI that builds these is fetched as a **prebuilt binary from the
[`q64-lang/q64`](https://github.com/q64-lang/q64) GitHub release** — never
vendored here (the language lives in its own repo).

## Layout

```
qubekit/
├─ packages/                  TypeScript libraries (pnpm workspace)
│  ├─ solver/   @qubekit/solver    3D constraint solver + involute gears (the resolver)
│  ├─ schema/   @qubekit/schema    parts / assemblies / ops types + validators
│  ├─ sim/      @qubekit/sim       portable world authority (apply ops + gear kinematics)
│  ├─ client/   @qubekit/client    snap resolution + optimistic apply + transport glue
│  └─ overlay/  @qubekit/overlay   reusable Build/Simulate UI (Svelte 5, touch-first)
├─ runtime/                   the runtime qube (q64 library → Continuum)
├─ apps/
│  └─ editor/                 the editor Qube (static-asset app → Qubepods, URL)
├─ catalog/                   part catalog as data (parts/*.json)
├─ examples/                  example worlds (rover-builder, …)
├─ specs/                     A0 contracts: parts, assembly, protocol
├─ tools/                     gen-parts, catalog→scene, render helpers
└─ docs/                      plans + authoring guides
```

**Dependency direction:** `apps/editor` → `@qubekit/client` → `@qubekit/sim` →
`@qubekit/schema` + `@qubekit/solver`; the `overlay` UI is mounted by the app;
`runtime/` and `catalog/` are consumed as data; `examples/` build on the app.

## Develop

```sh
pnpm install
pnpm -r run test        # all package tests (solver is fully tested)
pnpm -r run typecheck
pnpm -r run build
```

Metric throughout: part geometry in **millimetres** (gear `module` in mm), the 3D
scene in **metres** — convert at that one boundary (`mmToM` in `@qubekit/solver`).
