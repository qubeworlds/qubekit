# QubeKit

A collaborative, multiplayer **mechanical construction kit** (bricks, beams,
gears, axles, motors, sensors, programmable logic) and the flagship demo for the
Qubeworlds stack: *build a machine together in the browser, program it in Q64,
simulate it in Quine, publish it on Qubepods.*

- **Vision:** [`Plan.md`](./Plan.md)
- **Roadmap:** [`PHASED_PLAN.md`](./PHASED_PLAN.md)
- **Orientation + boundary rules + setup:** [`CLAUDE.md`](./CLAUDE.md)

## Layout

| Dir | What |
|---|---|
| `spec/` | Phase-0 contracts: part schema, assembly graph, op protocol (source of truth) |
| `packages/schema` | Shared TS types + validators |
| `packages/sim` | Portable authoritative world logic (imported by qubepods' stateful runtime) |
| `packages/client` | Construction client (snap resolution, optimistic apply) |
| `packages/overlay` | Build/Simulate UI — Svelte 5, touch-first (iPad edit / phone run) |
| `q64/` | Q64 library qube: domain records + `@realtime` controllers |
| `catalog/` | Parts catalog as data |
| `worlds/` | Example `qubekit.world` projects (the rover-builder demo) |
| `tools/`, `docs/` | Build-time content tools; authoring guides |

## Setup

```sh
./init.sh   # pnpm install + fetch the q64/qube release binaries into ./bin
```

QubeKit is **framework + data**; the engine (Quine), runtime (Qubepods), language
(Q64), and transport (`world`/qubegame) are generic hosts it composes — see
`CLAUDE.md` for the agnosticism boundaries.
