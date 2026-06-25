// @qubekit/client — the construction client. Composes:
//   - Quine's GENERIC nearest-port spatial query (quine_nearest_ports) with
//     QubeKit's compatibility rules (from @qubekit/schema) to pick a ghost
//     transform — the compatibility logic lives here, never in the engine;
//   - optimistic local apply of construction ops, confirmed by the server echo;
//   - glue onto world's qubegame transport (rev/origin envelope).
//
// TODO(Phase 5): snap resolution + optimistic apply.

export {};
