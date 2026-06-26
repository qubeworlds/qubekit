# Part & SnapPort schema (A0 — source of truth)

A **Part** is pure data — geometry + mass + ordered **snap ports**. It carries no
behaviour and no engine concepts. It is consumed by three places, all of which
treat this file as authoritative: the engine (renders the geometry, answers the
generic nearest-port query), `@qubekit/sim` (resolves compatibility + generates
joints), and `@qubekit/overlay` (the palette + inspector).

## Conventions

- **Units: SI.** Lengths in **metres**, mass in **kilograms**, angles in
  **radians**. (The `Plan.md` q64 sketches used `mm`/`g`/`deg`; the *data* is SI.)
- **Frame:** right-handed, **Y-up** (matches quine; gravity `[0,-9.81,0]`).
- **Transforms** reuse the `qubegame` shape: `{ p:[x,y,z], q:[w,x,y,z], s:[x,y,z] }`
  (position, **wxyz** quaternion, scale) — see `world/packages/qubegame/src/protocol.ts`.
- **Vectors** are `[x,y,z]`; axes are unit vectors.

## Part

```jsonc
{
  "id": "beam5",                  // catalog id (snake_case, no hyphens)
  "name": "Beam (5)",             // human label for the palette
  "geometry": "cdn.qubeworlds.com/qubekit/parts/beam_5.glb",
  "mass": 0.012,                  // kg
  "material": "plastic",          // named material (resolved by the renderer)
  "ports": [ /* SnapPort[] */ ]   // ordered; ids unique within the part
}
```

## SnapPort

```jsonc
{
  "id": "axle0",                  // unique within the part
  "type": "axle_bearing",         // PortType (taxonomy below)
  "localPos": [0, 0, 0],          // metres, in the part's local frame
  "localAxis": [1, 0, 0],         // unit vector, the port's working axis
  "allowedCounterparts": ["axle", "motor_out"],  // PortTypes this mates with
  "tolerance": 0.001,             // metres — snap radius
  "constraint": "hinge",          // ConstraintType a connection here generates
  "spacing": 0.008,               // OPTIONAL — for repeated/parametric ports
  "diameter": 0.005               // OPTIONAL — bore/stud diameter
}
```

### PortType taxonomy (MVP rover set)

| PortType | Mates with | Generated constraint | Meaning |
|---|---|---|---|
| `stud` | `anti_stud` | `fixed` | brick stud (stacking) |
| `anti_stud` | `stud` | `fixed` | underside tube |
| `pin` | `pin_socket` | `fixed` | connector pin |
| `pin_socket` | `pin` | `fixed` | beam hole (pinned) |
| `axle` | `axle_bearing`, `axle_socket`, `gear_center`, `wheel_hub`, `motor_out` | (counterpart's) | a cross-axle shaft |
| `axle_bearing` | `axle` | `hinge` | bore that lets an axle **spin freely** |
| `axle_socket` | `axle` | `fixed` | **keyed** bore — transmits torque |
| `gear_center` | `axle` | `fixed` | gear keyed to its axle (meshing is separate, below) |
| `wheel_hub` | `axle` | `fixed` | wheel keyed to its axle |
| `motor_out` | `axle` | `fixed` (driven) | motor output shaft |
| `sensor_mount` | `sensor` | `fixed` | mount point for a sensor |
| `sensor` | `sensor_mount` | `fixed` | a sensor's mount foot |
| `electric` | `electric` | `none` | power connector (no joint) |
| `signal` | `signal` | `none` | logic in/out (no joint) |

Compatibility is **symmetric** and lives in `@qubekit/schema` as a derived table
(`canMate(a, b)`), consumed by sim + client. **The engine never reads it** — it
only answers "nearest ports within radius" geometrically.

### ConstraintType

`fixed` | `hinge` | `slider` | `distance` | `gear` | `none`

These map 1:1 onto the generic Jolt joints quine exposes (A1). `gear` is the
**symbolic gear/axle graph** (rpm/torque), not tooth collision; `none` is a
logical-only connection (electric/signal). The mapping table is the contract
between this file and the engine's constraint API.

## Gear meshing (special case)

Two `gear_center` parts whose pitch circles touch form a **gear-mesh
Connection** (`constraintType: "gear"`) — derived by `@qubekit/sim` from
proximity + tooth count, **not** from a snap port. Ratio = `teethB / teethA`
(carried as part metadata, e.g. `gear12`/`gear24`).
