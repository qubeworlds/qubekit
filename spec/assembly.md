# Assembly / Connection / Controller graph (Phase 0 — source of truth)

> Status: **stub.** The authoritative world state is an assembly graph, not a bag
> of mesh transforms — this is what makes multiplayer deterministic and
> replayable (`Plan.md` §6, §9).

```
Assembly
 ├─ PartInstance { id, partType, transform, material, owner, ports }
 ├─ Connection   { fromPart, fromPort, toPart, toPort, constraintType }   # first-class
 └─ Controller   { q64Module, inputs, outputs }
```

Connections are **first-class objects** (typed: pin / axle / gear-mesh / hinge /
rigid-stud / electric / signal). The runtime persists the graph (D1) and replays
the op log to reconstruct it.
