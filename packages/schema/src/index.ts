// @qubekit/schema — shared types + validators for QubeKit parts, assemblies,
// and construction ops. Canonical shapes are pinned in spec/{parts,assembly,
// protocol}.md. Consumed by @qubekit/sim, @qubekit/client, and the tools.
//
// Reuses world's qubegame envelope (rev/origin) for the op transport — this
// package owns only QubeKit's op vocabulary + the port-compatibility table, not
// the wire transport and not any engine concept.

export * from './types';
export * from './ports';
export * from './ops';
export * from './validate';
