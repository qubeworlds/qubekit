# Construction op protocol (Phase 0 — source of truth)

> Status: **stub.** QubeKit's ops **reuse `world`'s `qubegame` envelope**
> (rev-stamped, origin-echoed, idempotent apply, resync on gap). QubeKit owns the
> *op vocabulary* only; the transport stays generic in `world`.

Op set (all rev-stamped, same envelope as
`world/packages/qubegame/src/protocol.ts`):

```
part.place        { partId, transform | { port, counterpart } }
part.move         { instanceId, transform }
part.delete       { instanceId }
port.connect      { fromInstance, fromPort, toInstance, toPort }
port.disconnect   { connectionId }
controller.set    { instanceId, q64Module }
motor.set         { instanceId, speed }
group.subassembly { instanceIds[] }
```

Server-side validation (in `packages/sim`): legal port compatibility, collision /
over-constraint checks, then apply → persist → rev-stamped delta fan-out.
Undo/redo is inverse-ops or rev-rollback over the same log.
