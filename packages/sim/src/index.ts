// @qubekit/sim — the PORTABLE authoritative world logic. Host-agnostic on
// purpose: the qubepods stateful runtime imports it; qubepods stays a generic
// stateful host that knows nothing about beams or gears.
//
// Responsibilities (PHASED_PLAN.md Phase 1/4/6):
//   - validate construction ops (port compatibility, collision, over-constraint)
//   - resolve the symbolic gear/axle graph (rpm/torque) — cheap + deterministic
//   - apply ops to the assembly graph and emit rev-stamped diffs
//
// Runs headless (CI, prediction) as well as in the runtime — keep it free of any
// engine/runtime/transport import.

export {};
