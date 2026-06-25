// @qubekit/schema — shared types + validators (Part, SnapPort, Connection,
// Assembly, Controller, construction ops). Canonical shapes are pinned in
// ../../spec/{parts,assembly,protocol}.md. Consumed by sim, client, and tools.
//
// Reuses world's qubegame envelope (rev/origin) for the op transport — this
// package owns only QubeKit's op vocabulary, not the wire transport.
//
// TODO(Phase 0): define Part, SnapPort, Connection, Assembly, Controller and the
// construction op union here, with runtime validators.

export {};
