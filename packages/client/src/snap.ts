// Snap resolution — the client-side half of placement. Finds where a new part
// can legally attach to the current assembly and which transform mates it there.
//
// This is where Quine's GENERIC "nearest ports" query composes with QubeKit's
// compatibility rules. Until the engine exports `quine_nearest_ports`, the
// nearest-port search runs here in TS over the assembly geometry — same seam,
// same result. The ENGINE never knows port semantics; this does.

import { canMate, type Assembly, type Part, type SnapPort } from '@qubekit/schema';

export type Catalog = Map<string, Part>;

export interface OpenPort {
  part: number;       // instance id
  port: SnapPort;     // the catalog port (resolved)
}

/** Every port on the assembly not already consumed by a connection. */
export function openPorts(a: Assembly, cat: Catalog): OpenPort[] {
  const used = new Set<string>();
  for (const c of a.connections) {
    used.add(c.fromPart + ':' + c.fromPort);
    used.add(c.toPart + ':' + c.toPort);
  }
  const out: OpenPort[] = [];
  for (const inst of a.parts) {
    const part = cat.get(inst.partType);
    if (!part) continue;
    for (const port of part.ports) {
      if (!used.has(inst.id + ':' + port.id)) out.push({ part: inst.id, port });
    }
  }
  return out;
}

export interface SnapTarget {
  fromPort: string;   // a port id on the NEW part
  toPart: number;     // existing instance
  toPort: string;     // its open port
}

/** Pick the best open port to snap a `newType` part onto: the first compatible
 *  pair, preferring a `near` instance (e.g. the last selected/placed part) so
 *  building grows where the user is working. Null if nothing mates. */
export function findSnap(
  a: Assembly,
  cat: Catalog,
  newType: string,
  near?: number,
): SnapTarget | null {
  const part = cat.get(newType);
  if (!part) return null;
  const open = openPorts(a, cat);
  // candidate (newPort, openPort) pairs that mate, ranked: prefer `near`.
  const ranked = open.slice().sort((x, y) => {
    const dx = near != null && x.part === near ? 0 : 1;
    const dy = near != null && y.part === near ? 0 : 1;
    return dx - dy;
  });
  for (const target of ranked) {
    for (const np of part.ports) {
      if (canMate(np, target.port)) {
        return { fromPort: np.id, toPart: target.part, toPort: target.port.id };
      }
    }
  }
  return null;
}
