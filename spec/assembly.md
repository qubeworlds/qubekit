# Assembly / Connection / Controller graph (A0 — source of truth)

The authoritative world state is an **assembly graph**, not a bag of mesh
transforms — that is what makes it replayable, persistable as a qube-project
repo, and (in Milestone B) deterministically multiplayer. It is produced by
applying the construction op log (`protocol.md`) in order.

## Assembly

```jsonc
{
  "id": "rover-1",
  "name": "Rover",
  "rev": 0,                       // last applied op revision (op log head)
  "parts": [ /* PartInstance[] */ ],
  "connections": [ /* Connection[] */ ],
  "controllers": [ /* Controller[] */ ]
}
```

## PartInstance

```jsonc
{
  "id": 17,                       // instance uid (stable, op-assigned)
  "partType": "beam5",            // catalog Part.id
  "transform": { "p": [0,0,0], "q": [1,0,0,0], "s": [1,1,1] },  // qubegame shape
  "materialOverride": null,       // optional named material
  "owner": null                   // optional author id (Milestone B)
}
```

Ports are **not** copied onto the instance — they are read from the catalog
`Part` by `partType`. A port is addressed as `(instanceId, portId)`.

## Connection (first-class)

```jsonc
{
  "id": 4,                        // connection uid (op-assigned)
  "fromPart": 17, "fromPort": "axle0",
  "toPart": 23,   "toPort": "center",
  "constraintType": "hinge"       // resolved from the ports' ConstraintType
}
```

Connections are first-class objects (not implied by transforms) so the sim can
generate exactly one physics joint per connection, detect over-constraint, and
the runtime can replicate/undo them individually. Gear-mesh connections
(`constraintType: "gear"`) are derived (see `parts.md`) but stored here too.

## Controller

```jsonc
{
  "id": 2,
  "part": 31,                     // the controllable instance it drives (e.g. a motor)
  "q64Module": "controllers/blink_motor.q",  // repo-relative; runs as @realtime
  "inputs":  ["tick"],            // logical input signals
  "outputs": ["motor_speed"],     // logical output signals
  "params": { "freq": 4.0 }       // controller-specific config
}
```

In Milestone A a controller runs as a plain Q64 `@realtime` function stepped by
`@qubekit/sim` in-page; in Milestone B the **same** module is stepped on the
server. (Migration to Q64 twins is gated on q64#36 — see `PHASED_PLAN.md`.)

## Serialization (the qube-project repo)

The assembly persists into the project repo (`A4`, `Plan.md` §10) as files:

```
project.jsonc           # qube-project manifest
assemblies/<name>.json  # the Assembly graph above
controllers/*.q         # the Q64 controller modules referenced by q64Module
```

`@qubekit/schema` owns the (de)serialization round-trip; the live in-page graph
and these files are the same shapes.
