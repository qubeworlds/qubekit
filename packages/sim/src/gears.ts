// The symbolic gear/axle graph (spec/parts.md §8 of Plan.md). Instead of
// tooth-by-tooth physics, rotational speed propagates over the connection graph:
//   - a KEYED coupling (fixed joint between rotational ports) → same speed
//   - a GEAR mesh → speed × (−teethA / teethB)   (meshing gears counter-rotate)
//   - a HINGE (axle spinning in a bearing) → decoupled (no speed edge)
// Motors are speed sources. Cheap, deterministic, multiplayer-safe.

import type { Assembly, Part, PartInstance, PortType, SnapPort } from '@qubekit/schema';

export type Catalog = Map<string, Part>;

const ROTATIONAL: ReadonlySet<PortType> = new Set<PortType>([
  'axle',
  'axle_socket',
  'gear_center',
  'wheel_hub',
  'motor_out',
  'axle_bearing',
]);

function instanceOf(a: Assembly, id: number): PartInstance | undefined {
  return a.parts.find((p) => p.id === id);
}
function portOf(cat: Catalog, inst: PartInstance | undefined, portId: string): SnapPort | undefined {
  if (!inst) return undefined;
  return cat.get(inst.partType)?.ports.find((p) => p.id === portId);
}
function teethOf(cat: Catalog, inst: PartInstance | undefined): number | undefined {
  return inst ? cat.get(inst.partType)?.teeth : undefined;
}

interface Edge {
  to: number;
  ratio: number;
}

export interface AxleSpeeds {
  /** instance id → angular speed (rad/s). Absent ⇒ not driven (stationary). */
  speeds: Map<number, number>;
  /** instance ids that received two incompatible driven speeds (over-constraint). */
  conflicts: number[];
}

/** Resolve every rotational instance's angular speed from the motor sources. */
export function resolveAxleSpeeds(
  a: Assembly,
  cat: Catalog,
  motorSpeeds: Map<number, number>,
): AxleSpeeds {
  const adj = new Map<number, Edge[]>();
  const link = (x: number, y: number, ratio: number) => {
    (adj.get(x) ?? adj.set(x, []).get(x)!).push({ to: y, ratio });
    (adj.get(y) ?? adj.set(y, []).get(y)!).push({ to: x, ratio: 1 / ratio });
  };

  for (const c of a.connections) {
    const fp = portOf(cat, instanceOf(a, c.fromPart), c.fromPort);
    const tp = portOf(cat, instanceOf(a, c.toPart), c.toPort);
    if (!fp || !tp) continue;

    if (c.constraintType === 'fixed' && ROTATIONAL.has(fp.type) && ROTATIONAL.has(tp.type)) {
      link(c.fromPart, c.toPart, 1); // keyed: same speed
    } else if (c.constraintType === 'gear') {
      const ta = teethOf(cat, instanceOf(a, c.fromPart));
      const tb = teethOf(cat, instanceOf(a, c.toPart));
      if (ta && tb) link(c.fromPart, c.toPart, -ta / tb); // mesh: counter-rotate
    }
    // 'hinge' (axle in a bearing) and structural 'fixed' (stud/pin) add no edge.
  }

  const speeds = new Map<number, number>();
  const conflicts: number[] = [];
  const queue: number[] = [];

  for (const [id, s] of motorSpeeds) {
    speeds.set(id, s);
    queue.push(id);
  }

  while (queue.length) {
    const id = queue.shift()!;
    const s = speeds.get(id)!;
    for (const e of adj.get(id) ?? []) {
      const want = s * e.ratio;
      const have = speeds.get(e.to);
      if (have === undefined) {
        speeds.set(e.to, want);
        queue.push(e.to);
      } else if (Math.abs(have - want) > 1e-6 && !conflicts.includes(e.to)) {
        conflicts.push(e.to);
      }
    }
  }

  return { speeds, conflicts };
}
