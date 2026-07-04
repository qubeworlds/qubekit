// Core data shapes — the canonical contract from spec/{parts,assembly}.md.
// SI units throughout: metres, kilograms, radians. Right-handed, Y-up.

/** `[x, y, z]` in metres (or a unit axis vector). */
export type Vec3 = [number, number, number];

/** Quaternion in **wxyz** order — matches world/packages/qubegame Transform. */
export type Quat = [number, number, number, number];

/** Position + rotation + scale. The qubegame transform shape, reused verbatim. */
export interface Transform {
  p: Vec3;
  q: Quat;
  s: Vec3;
}

export const IDENTITY_TRANSFORM: Transform = {
  p: [0, 0, 0],
  q: [1, 0, 0, 0],
  s: [1, 1, 1],
};

/** Snap-port kinds (spec/parts.md §taxonomy). Open-ended by design — catalog
 *  authors may introduce new kinds; the compatibility table is data, not code. */
export type PortType =
  | 'stud'
  | 'anti_stud'
  | 'pin'
  | 'pin_socket'
  | 'axle'
  | 'axle_bearing'
  | 'axle_socket'
  | 'gear_center'
  | 'wheel_hub'
  | 'motor_out'
  | 'sensor_mount'
  | 'sensor'
  | 'electric'
  | 'signal';

/** The physics joint a connection generates. Maps 1:1 onto quine's generic Jolt
 *  joints (A1). `gear` is the symbolic gear/axle graph; `none` is logical-only. */
export type ConstraintType =
  | 'fixed'
  | 'hinge'
  | 'slider'
  | 'distance'
  | 'gear'
  | 'none';

/** A connection point on a part — pure geometry + a declared compatibility set.
 *  The engine assigns no meaning to it beyond "a point with an axis". */
export interface SnapPort {
  id: string;
  type: PortType;
  localPos: Vec3;
  localAxis: Vec3;
  allowedCounterparts: PortType[];
  tolerance: number;
  constraint: ConstraintType;
  spacing?: number;
  diameter?: number;
}

/** Position-servo envelope for servo parts (e.g. an STS3215). This is the
 *  HARDWARE envelope of the part; per-joint software limits belong to the
 *  assembly (the joint's Controller params), not the catalog. */
export interface ServoSpec {
  /** Lowest reachable rotor angle (rad). */
  minAngle: number;
  /** Highest reachable rotor angle (rad). */
  maxAngle: number;
  /** No-load angular speed cap (rad/s). */
  maxVelocity: number;
}

/** A catalog part: geometry + mass + ordered ports. Pure data, no behaviour. */
export interface Part {
  id: string;
  name: string;
  geometry: string;
  mass: number;
  material: string;
  ports: SnapPort[];
  /** Gear tooth count, for gear parts (drives the symbolic mesh ratio). */
  teeth?: number;
  /** Present iff the part is a position servo — enables the `servo.set` op. */
  servo?: ServoSpec;
}

/** A placed instance of a catalog Part. Ports are read from the catalog by
 *  `partType`, never copied here; a port is addressed as `(id, portId)`. */
export interface PartInstance {
  id: number;
  partType: string;
  transform: Transform;
  materialOverride?: string | null;
  owner?: string | null;
}

/** A first-class connection between two ports → exactly one physics joint. */
export interface Connection {
  id: number;
  fromPart: number;
  fromPort: string;
  toPart: number;
  toPort: string;
  constraintType: ConstraintType;
}

/** A controller bound to a controllable instance; runs as a Q64 @realtime fn. */
export interface Controller {
  id: number;
  part: number;
  q64Module: string;
  inputs: string[];
  outputs: string[];
  params: Record<string, number>;
}

/** The authoritative world state — produced by applying the op log in order. */
export interface Assembly {
  id: string;
  name: string;
  rev: number;
  parts: PartInstance[];
  connections: Connection[];
  controllers: Controller[];
}

export function emptyAssembly(id: string, name: string): Assembly {
  return { id, name, rev: 0, parts: [], connections: [], controllers: [] };
}
