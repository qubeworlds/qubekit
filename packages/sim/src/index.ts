// @qubekit/sim — the PORTABLE authoritative world logic. Host-agnostic: it runs
// in-page (Milestone A, single-user authority) and, unchanged, inside the
// qubepods DO (Milestone B, server authority). No engine/DOM/transport imports.

export { World } from './world';
export { Sim, type ControllerHost, type TickState } from './sim';
export { resolveAxleSpeeds, type AxleSpeeds, type Catalog } from './gears';
