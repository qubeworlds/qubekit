# Authoring a QubeKit part

> Status: **stub** (Phase 3/8).

A part is **data** — geometry + snap ports + mass/material — plus, optionally, a
Q64 `@realtime` controller. You do not touch the engine or the language to add
one:

1. Add a `catalog/parts/<id>.json` matching `spec/parts.md`.
2. Provide its glTF on the CDN (referenced by `geometry`).
3. (If it has behaviour) add a controller in `q64/controllers/<id>.q`.

The engine stays content-agnostic; the part's meaning lives entirely in this
data + the QubeKit library.
