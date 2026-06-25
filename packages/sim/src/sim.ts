// The in-page authority: a World (op store) + a fixed-rate kinematic tick. The
// tick resolves the symbolic gear/axle graph and integrates each rotational
// instance's angle. Rigid-body settling/collision is the ENGINE's job (quine
// Jolt); this produces the deterministic kinematic state the renderer applies.

import type { Assembly } from '@qubekit/schema';
import { resolveAxleSpeeds, type AxleSpeeds, type Catalog } from './gears';
import { World } from './world';

/** Where motor speeds come from each tick. In Milestone A this is a JS stub or
 *  a Q64 controller host; in Milestone B the same interface runs server-side.
 *  An implementation mutates `world` via `motor.set` ops (or world.motorSpeeds). */
export interface ControllerHost {
  step(dt: number, world: World): void;
}

export interface TickState extends AxleSpeeds {
  /** instance id → accumulated rotation (rad) about its axle axis. */
  angles: Map<number, number>;
}

export class Sim {
  readonly world: World;
  controllerHost?: ControllerHost;
  private angles = new Map<number, number>();

  constructor(catalog: Catalog, assembly?: Assembly, controllerHost?: ControllerHost) {
    this.world = new World(catalog, assembly);
    this.controllerHost = controllerHost;
  }

  /** Advance the simulation by `dt` seconds. Returns the resolved kinematics. */
  tick(dt: number): TickState {
    this.controllerHost?.step(dt, this.world);
    const resolved = resolveAxleSpeeds(this.world.assembly, this.world.catalog, this.world.motorSpeeds);
    for (const [id, w] of resolved.speeds) {
      this.angles.set(id, (this.angles.get(id) ?? 0) + w * dt);
    }
    return { ...resolved, angles: this.angles };
  }

  /** Current kinematic angles (renderer reads this to spin axles/wheels/gears). */
  kinematics(): Map<number, number> {
    return this.angles;
  }
}
