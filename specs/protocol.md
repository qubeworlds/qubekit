# Construction op protocol (A0 — source of truth)

Every change to an assembly is an **op**. Applying the ordered op log
reconstructs the `Assembly` graph (`assembly.md`). The op *shape* is identical in
both milestones; only the transport differs:

- **Milestone A (client-side):** `@qubekit/sim` applies ops locally, in-page, as
  the single-user authority. No rev/origin needed for correctness, but ops still
  carry `clientSeq` so undo/redo can address them.
- **Milestone B (server):** ops travel on `world`'s `qubegame` envelope —
  rev-stamped, `origin`-echoed, idempotent apply, resync on gap
  (`world/packages/qubegame/src/protocol.ts`). The op union below is unchanged;
  the server assigns `id`/`rev`.

## Envelope

```ts
// client → authority (local sim in A; server in B)
{ clientSeq: number, op: Op }
// authority → client (B only; A applies inline)
{ rev: number, op: Op, origin?: { clientId: number, clientSeq: number } }
```

## Op union

```jsonc
// part.place — assigns a new PartInstance id. Either an explicit transform OR a
// snap target (a port to mate against); the authority resolves the transform.
{ "op": "part.place", "partType": "beam5",
  "transform": { "p": [..], "q": [..], "s": [..] } }
{ "op": "part.place", "partType": "pin",
  "snap": { "fromPort": "pin0", "toPart": 17, "toPort": "axle0" } }

{ "op": "part.move",   "instance": 17, "transform": { /* qubegame */ } }
{ "op": "part.delete", "instance": 17 }   // cascades: removes its connections

{ "op": "port.connect",    "fromPart": 17, "fromPort": "axle0",
                           "toPart": 23,   "toPort": "center" }   // assigns Connection id
{ "op": "port.disconnect", "connection": 4 }

{ "op": "controller.set",  "part": 31, "q64Module": "controllers/blink_motor.q",
                           "params": { "freq": 4.0 } }
{ "op": "motor.set",       "part": 31, "speed": 0.8 }   // -1..1 normalized
{ "op": "servo.set",       "part": 12, "angle": 0.5 }   // target rad; servo parts only —
                                                        // clamped to the part's hardware envelope

{ "op": "group.subassembly", "instances": [17, 23, 31] }  // assigns a group id
```

## Validation (in `@qubekit/sim`, both milestones)

Before an op is applied the authority checks:

1. **Referential** — referenced instances/ports/connections exist.
2. **Compatibility** — `canMate(fromPortType, toPortType)` (the symmetric table
   from `parts.md`, owned by `@qubekit/schema`).
3. **Geometry** — the snap resolves within `tolerance`; no collision.
4. **Constraint sanity** — the connection would not over-constrain the assembly
   (degrees-of-freedom check on the joint graph).

A rejected op is a no-op + a reason; the client surfaces it (red ghost, toast).

## Undo / redo

The op log is the history. Undo is **inverse ops** (place↔delete,
connect↔disconnect, move→prior transform) appended to the log — not a pointer
rewind — so it stays correct under Milestone-B concurrency. `@qubekit/sim`
produces the inverse for each op.
