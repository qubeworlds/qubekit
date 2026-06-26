# Phase 1 / Milestone A — Client-side tool todo

The build order for **Milestone A** of `PHASED_PLAN.md`: the client-side,
single-user, git-backed QubeKit tool. **No server, no auth, no Durable Object.**
Durability/versioning/sharing come from a GitHub repo; the working copy lives in
the OPFS VFS; `@qubekit/sim` runs in-page as the single-user authority.

## Tasks

| # | Task | Repo / package | Blocked by |
|---|---|---|---|
| 1 | **Quine engine primitives** — Jolt constraints (fixed/hinge/slider/distance) + symbolic gear graph + raycast; `snap_ports` data field + `quine_nearest_ports`; live-mutation exports; touch picking; static-mesh instancing + LOD; WebGL2 default | `qubeworlds/quine` | — |
| 3 | **`@qubekit/schema`** — Part/SnapPort/Connection/Assembly/Controller + construction-op union + validators | `qubekit/packages/schema` | — |
| 2 | **`@qubekit/sim`** — in-page portable authority: validate/apply ops, symbolic gear graph (rpm/torque), fixed-rate tick. Host-agnostic + headless-testable (promotes to the server unchanged) | `qubekit/packages/sim` | 3 |
| 9 | **Project model** — a build *is* a qube-project repo (`Plan.md` §10 layout); assembly ↔ files round-trip | `qubekit/` | 3 |
| 7 | **Rover parts catalog** (data) + `catalog-to-scene` build tool — the MVP rover set | `qubekit/catalog`, `qubekit/tools` | 3 |
| 4 | **`@qubekit/client`** — snap resolution (`quine_nearest_ports` + compat rules, host-side) + local apply driving the sim | `qubekit/packages/client` | 1, 2, 3 |
| 6 | **VFS working tree + GitHub sync** — OPFS `OpfsVfs` working copy; isomorphic-git over the VFS `FsBackend` (clone/commit/push/pull); mount-router seam for a later server mount | `qubekit/packages/*` + `qubepods/packages/q64-shell` | 2, 3, 9 |
| 5 | **`@qubekit/overlay`** — Build/Simulate UI (`mount(el,host)`), touch-first, iPad edit / phone run; Simulate drives motors via the in-page sim | `qubekit/packages/overlay` | 4 |
| 8 | **▸ Milestone A gate** — build+simulate a rover solo on iPad, committed to a GitHub repo, reopened from it | (integration) | 4, 5, 6, 7 |

**Critical path:** `3 → 2 / 9 → 4 → 5 → 8`. Tasks **1** and **3** start
immediately in parallel. Catalog (**7**) and persistence (**6**) run alongside.

## Out of scope for Milestone A (→ Milestone B)
The stateful qubepods runtime, the `apps/twin` DO promotion, the rev/origin live
replication protocol, auth, and presence cursors. Real-time co-editing is the
only thing that needs them; async collaboration ships here via git.

## Standing fallback
Controllers run as plain Q64 `@realtime` functions and `@qubekit/sim` (TS) holds
authority until [q64-lang/q64#36](https://github.com/q64-lang/q64/issues/36)
(mutation-op codegen + non-scalar WIT lifting) lands, after which controllers can
migrate to Q64 twins.
