// Quadcopter — control allocation (the "mixer") with physically-correct
// counter-rotation.
//
// The image shows an X-frame quad with four shrouded rotors. The two diagonal
// pairs spin OPPOSITE ways (red vs blue arrows): that is not decoration, it is
// what makes the aircraft yaw-stable. Each spinning rotor drags the air and
// reacts a torque back on the frame; if all four spun the same way the body would
// spin up uncontrollably. Counter-rotating pairs cancel that reaction at hover,
// and a deliberate imbalance between the pairs is exactly how you command yaw —
// while total lift stays put.
//
// A rotor of speed ω makes thrust f = kT·ω² (up) and reacts drag torque
// τ = kD·ω² (opposing its spin). The mixer maps a desired (collective, roll,
// pitch, yaw) to four rotor speeds and reports the net wrench so the balance is
// auditable, not asserted. Lengths mm, mass kg, force N, torque N·m.

export interface QuadParams {
  armLength: number; // motor distance from the frame centre (mm)
  mass: number; // all-up mass (kg)
  thrustCoeff: number; // kT (N per (rad/s)²)
  dragCoeff: number; // kD (N·m per (rad/s)²)
  gravity?: number; // m/s², default 9.81
}

// X layout, motors numbered like a flight controller (front-right, then CCW):
//   0 front-right  CW   1 front-left  CCW
//   3 rear-right   CCW  2 rear-left   CW
// Adjacent arms counter-rotate; diagonals share a direction. spin = +1 CCW.
export interface Rotor {
  x: number; // body +x = right (mm)
  z: number; // body +z = forward (mm)
  spin: 1 | -1; // +1 CCW (drag torque about +y), −1 CW
}

export interface QuadCommand {
  climb?: number; // collective bias, −1..1 (0 = hover thrust)
  roll?: number; // +roll → right side down, −1..1
  pitch?: number; // +pitch → nose up, −1..1
  yaw?: number; // +yaw → nose left (about +y), −1..1
  authority?: number; // fraction of hover thrust each axis may shift (default 0.35)
}

export interface QuadState {
  hoverSpeed: number; // ω so 4·kT·ω² = m·g (rad/s)
  speeds: number[]; // per-rotor ω (rad/s), index-matched to rotors()
  thrusts: number[]; // per-rotor f = kT·ω² (N)
  totalThrust: number; // ΣF (N)
  weight: number; // m·g (N)
  netTorque: { roll: number; pitch: number; yaw: number }; // body torques (N·m)
}

const d2 = (mm: number) => mm / 1000; // mm → m for torque arms

export function quadRotors(p: QuadParams): Rotor[] {
  const a = p.armLength / Math.SQRT2; // X arms: each motor at (±a, ±a)
  return [
    { x: a, z: a, spin: -1 }, // 0 front-right CW
    { x: -a, z: a, spin: 1 }, // 1 front-left  CCW
    { x: -a, z: -a, spin: -1 }, // 2 rear-left   CW
    { x: a, z: -a, spin: 1 }, // 3 rear-right  CCW
  ];
}

export function quadHoverSpeed(p: QuadParams): number {
  const g = p.gravity ?? 9.81;
  return Math.sqrt((p.mass * g) / (4 * p.thrustCoeff));
}

export interface QuadWrench {
  thrusts: number[]; // per-rotor lift f = kT·ω² (N), index-matched to rotors()
  thrust: number; // total upward force (N)
  weight: number; // m·g (N) — the line the craft hovers on
  roll: number; // body roll torque about +x: right side − left side (N·m)
  pitch: number; // body pitch torque about +x-front: rear − front (N·m)
  yaw: number; // body yaw torque about +y: Σ spin·kD·ω² (N·m)
}

// FORWARD dynamics: given four rotor speeds (rad/s), what wrench does the
// airframe feel? This is the natural primitive when the user drives each rotor
// directly (four RPM sliders) — thrust lifts, the thrust imbalance across the
// arms makes roll/pitch, and the reaction-torque imbalance across spin directions
// makes yaw. The inverse of quadMixer.
export function quadWrench(p: QuadParams, speeds: number[]): QuadWrench {
  const g = p.gravity ?? 9.81;
  const rotors = quadRotors(p);
  const thrusts = rotors.map((_, i) => p.thrustCoeff * speeds[i] * speeds[i]);
  return {
    thrusts,
    thrust: thrusts.reduce((s, f) => s + f, 0),
    weight: p.mass * g,
    roll: thrusts.reduce((s, f, i) => s + f * d2(rotors[i].x), 0),
    pitch: thrusts.reduce((s, f, i) => s - f * d2(rotors[i].z), 0),
    yaw: speeds.reduce((s, w, i) => s + rotors[i].spin * p.dragCoeff * w * w, 0),
  };
}

// Allocate a command to four rotor speeds. Each axis shifts thrust between rotors
// by ±(authority·hoverThrust); yaw is applied by SPEEDING UP one spin direction
// and slowing the other (so the reaction torques no longer cancel) without
// changing the collective. Speeds come back as √(f/kT), clamped non-negative.
export function quadMixer(p: QuadParams, cmd: QuadCommand): QuadState {
  const g = p.gravity ?? 9.81;
  const rotors = quadRotors(p);
  const wHover = quadHoverSpeed(p);
  const fHover = p.thrustCoeff * wHover * wHover; // per-rotor hover thrust
  const auth = (cmd.authority ?? 0.35) * fHover;

  const climb = cmd.climb ?? 0, roll = cmd.roll ?? 0, pitch = cmd.pitch ?? 0, yaw = cmd.yaw ?? 0;
  const thrusts = rotors.map((r) => {
    const aSign = Math.sign(r.x) || 0; // right side ↑ for +roll
    const eSign = Math.sign(r.z) || 0; // front side ↑ for −pitch (nose up = rear ↑)
    let f = fHover * (1 + climb)
      + auth * roll * aSign
      - auth * pitch * eSign
      + auth * yaw * r.spin; // CCW faster ⇒ body yaws about +y (nose left)
    return Math.max(0, f);
  });

  const speeds = thrusts.map((f) => Math.sqrt(f / p.thrustCoeff));
  const totalThrust = thrusts.reduce((s, f) => s + f, 0);
  const netTorque = {
    roll: thrusts.reduce((s, f, i) => s + f * d2(rotors[i].x), 0),
    pitch: thrusts.reduce((s, f, i) => s - f * d2(rotors[i].z), 0),
    yaw: speeds.reduce((s, w, i) => s + rotors[i].spin * p.dragCoeff * w * w, 0),
  };
  return { hoverSpeed: wHover, speeds, thrusts, totalThrust, weight: p.mass * g, netTorque };
}
