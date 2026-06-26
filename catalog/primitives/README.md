# Primitives — the QubeKit toolbox catalog

Standard reusable parts (springs, gears, and — on the roadmap — bolts, nuts,
washers, screws, nails, pins, axles, bearings, beams). Each primitive is a
**parametric descriptor**, not a baked mesh — the same pattern as `world`'s
props (`{kind:"fedora", crownRadius:…}`):

```jsonc
{
  "id":   "qubekit/primitives/spring",   // namespace/category/slug
  "kind": "spring",                      // dispatches to the builder
  "params": { "radius": 7, "wire": 1.1, "coils": 8 },  // mm
  "name": "Helical Spring", "category": "fastener",
  "tags": [...], "material": "steel", "license": "MIT",
  "authoredBy": "qubekit", "version": 1, "thumbnail": "thumb.webp"
}
```

## How it flows (descriptor → builder → CDN → D1)

1. **Descriptor** (this folder) is the source of truth.
2. **`kind → builder` registry** (`apps/editor/web/parts3d.js`, `buildPart()`)
   turns `{kind, params}` into a mesh. Add a part = add a builder + a descriptor.
3. **Publisher** (`tools/publish-parts.mjs`) writes `asset.json` per primitive +
   `index.json` and uploads to the public CDN at
   `cdn.qubeworlds.com/qubekit/parts/` (R2 `cdn-qubeworlds`).
4. **D1 index** (`world` `editor-api` `GET /api/parts`) makes the catalog
   queryable. R2/CDN is the canonical store; D1 is the searchable index.

Consumers download `asset.json` from the CDN and build the mesh from the
descriptor via the registry (or use a baked `.glb` where an engine needs one).
