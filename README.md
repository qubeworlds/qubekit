# QubeKit

A programmable mechanical construction environment for Qubeworlds — assemble
beams, gears, axles, motors, sensors, and logic into working machines, build them
collaboratively in the browser, program them in Q64, simulate them in Quine, and
publish them on Qubepods.

See [`Plan.md`](./Plan.md) for the full product vision.

## Packages

| Package | What |
|---|---|
| [`@qubekit/solver`](./packages/solver) | Deterministic core: a 3D assembly **constraint solver** (SE(3) Levenberg–Marquardt mates) + **physically-correct involute spur gears**. Metric, dependency-free. |

## Develop

```sh
pnpm install
pnpm -r run test       # all package tests
pnpm -r run typecheck
pnpm -r run build
```

Metric throughout: part geometry in **millimetres** (gear `module` in mm), the 3D
scene in **metres** — convert at that one boundary (`mmToM`).
