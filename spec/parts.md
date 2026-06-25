# Part & SnapPort schema (Phase 0 — source of truth)

> Status: **stub.** Pin the canonical data shape here before code in
> `packages/schema`, `packages/sim`, or `catalog/` depends on it. This shape is
> consumed by the engine (as opaque data), the sim, and the UI.

A **Part** is data (no behaviour). It references geometry and declares ordered
**snap ports**:

- `id` — catalog part id (e.g. `beam5`)
- `geometry` — CDN glTF ref
- `mass`, `material`
- `ports[]` — each: `{ id, type, localPos, localAxis, allowedCounterparts[], tolerance, constraint }`
  - `type` — port kind (e.g. `pin_socket`, `axle_bearing`, `axle_socket`, …)
  - `constraint` — the physics joint a connection on this port generates
    (`fixed` | `hinge` | `slider` | `distance` | `gear`)

**Boundary:** the engine assigns *no meaning* to ports — it only answers the
generic "nearest ports within radius" spatial query. Compatibility
(`allowedCounterparts`) is resolved by `packages/sim` / `packages/client`, never
in Quine. See `PHASED_PLAN.md` Phase 0/2.
