// Construction ops + the wire envelope (spec/protocol.md).
//
// The op union is identical in both milestones. In Milestone A @qubekit/sim
// applies ops inline; in Milestone B they ride world's qubegame rev/origin
// envelope. The shapes do not change between the two.

import type { Transform } from './types';

/** Place a new part — either an explicit transform OR a snap target the
 *  authority resolves into one. Assigns a fresh PartInstance id. */
export type PlaceOp =
  | { op: 'part.place'; partType: string; transform: Transform }
  | {
      op: 'part.place';
      partType: string;
      snap: { fromPort: string; toPart: number; toPort: string };
    };

export type MoveOp = { op: 'part.move'; instance: number; transform: Transform };
export type DeleteOp = { op: 'part.delete'; instance: number };

export type ConnectOp = {
  op: 'port.connect';
  fromPart: number;
  fromPort: string;
  toPart: number;
  toPort: string;
};
export type DisconnectOp = { op: 'port.disconnect'; connection: number };

export type ControllerSetOp = {
  op: 'controller.set';
  part: number;
  q64Module: string;
  params: Record<string, number>;
};
export type MotorSetOp = { op: 'motor.set'; part: number; speed: number };

/** Command a servo part to a target rotor angle (rad). The authority clamps to
 *  the part's hardware `ServoSpec`; the tick tracks the target at bounded
 *  velocity (respecting the joint Controller's software limits, if any). */
export type ServoSetOp = { op: 'servo.set'; part: number; angle: number };

export type GroupOp = { op: 'group.subassembly'; instances: number[] };

export type Op =
  | PlaceOp
  | MoveOp
  | DeleteOp
  | ConnectOp
  | DisconnectOp
  | ControllerSetOp
  | MotorSetOp
  | ServoSetOp
  | GroupOp;

export type OpKind = Op['op'];

/** client → authority. `clientSeq` lets undo/redo address the op even in A. */
export interface ClientMsg {
  clientSeq: number;
  op: Op;
}

/** authority → client (Milestone B; in A the sim applies inline). */
export interface ServerMsg {
  rev: number;
  op: Op;
  origin?: { clientId: number; clientSeq: number };
}

/** Result of attempting to apply an op (spec/protocol.md §Validation). */
export interface ApplyResult {
  ok: boolean;
  /** Newly assigned id (instance/connection/group), when the op creates one. */
  assignedId?: number;
  /** Reason on rejection — surfaced by the client (red ghost / toast). */
  reason?: string;
}
