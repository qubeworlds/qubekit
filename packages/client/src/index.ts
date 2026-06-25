// @qubekit/client — the construction client. Composes Quine's generic
// nearest-port query with QubeKit's compatibility rules (from @qubekit/schema)
// to resolve where a new part snaps; the compatibility logic lives HERE, never
// in the engine. Placement is then applied through @qubekit/sim's World.
//
// (Until the engine exports quine_nearest_ports, the nearest-port search runs
// in TS over the assembly geometry — same seam, swappable later.)

export * from './snap';
