// Port compatibility + constraint resolution (spec/parts.md).
//
// This is the one place the "which ports mate, and into what joint" knowledge
// lives. It is shared by @qubekit/sim and @qubekit/client. The ENGINE never sees
// it — quine only answers the geometric "nearest ports within radius" query;
// the meaning is resolved here.

import type { ConstraintType, PortType, SnapPort } from './types';

/** The default counterpart table (spec/parts.md). Catalog parts may override via
 *  each port's own `allowedCounterparts`; this is the reference + a fallback. */
export const DEFAULT_COUNTERPARTS: Record<PortType, PortType[]> = {
  stud: ['anti_stud'],
  anti_stud: ['stud'],
  pin: ['pin_socket'],
  pin_socket: ['pin'],
  axle: ['axle_bearing', 'axle_socket', 'gear_center', 'wheel_hub', 'motor_out'],
  axle_bearing: ['axle'],
  axle_socket: ['axle'],
  gear_center: ['axle'],
  wheel_hub: ['axle'],
  motor_out: ['axle'],
  sensor_mount: ['sensor'],
  sensor: ['sensor_mount'],
  electric: ['electric'],
  signal: ['signal'],
};

/** The constraint each port kind contributes when it is the *defining* side of a
 *  connection (the socket/bearing, not the passive axle). spec/parts.md table. */
const PORT_CONSTRAINT: Record<PortType, ConstraintType> = {
  stud: 'fixed',
  anti_stud: 'fixed',
  pin: 'fixed',
  pin_socket: 'fixed',
  axle: 'none', // a passive shaft — the counterpart decides the joint
  axle_bearing: 'hinge',
  axle_socket: 'fixed',
  gear_center: 'fixed',
  wheel_hub: 'fixed',
  motor_out: 'fixed',
  sensor_mount: 'fixed',
  sensor: 'fixed',
  electric: 'none',
  signal: 'none',
};

/** Symmetric: do these two ports mate? Uses the ports' own declared
 *  `allowedCounterparts` (authoritative); both directions must agree. */
export function canMate(a: SnapPort, b: SnapPort): boolean {
  return (
    a.allowedCounterparts.includes(b.type) &&
    b.allowedCounterparts.includes(a.type)
  );
}

/** The ConstraintType a connection between these two ports generates. The
 *  passive `axle` defers to its counterpart; otherwise the more specific
 *  (non-`none`) side wins, falling back to `a`. */
export function constraintForPair(a: SnapPort, b: SnapPort): ConstraintType {
  const ca = PORT_CONSTRAINT[a.type];
  const cb = PORT_CONSTRAINT[b.type];
  if (ca === 'none') return cb;
  if (cb === 'none') return ca;
  return ca; // both specific (e.g. stud↔anti_stud): identical fixed
}
