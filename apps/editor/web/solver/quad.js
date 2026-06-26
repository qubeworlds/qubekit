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
const d2 = (mm) => mm / 1000; // mm → m for torque arms
export function quadRotors(p) {
    const a = p.armLength / Math.SQRT2; // X arms: each motor at (±a, ±a)
    return [
        { x: a, z: a, spin: -1 }, // 0 front-right CW
        { x: -a, z: a, spin: 1 }, // 1 front-left  CCW
        { x: -a, z: -a, spin: -1 }, // 2 rear-left   CW
        { x: a, z: -a, spin: 1 }, // 3 rear-right  CCW
    ];
}
export function quadHoverSpeed(p) {
    const g = p.gravity ?? 9.81;
    return Math.sqrt((p.mass * g) / (4 * p.thrustCoeff));
}
// FORWARD dynamics: given four rotor speeds (rad/s), what wrench does the
// airframe feel? This is the natural primitive when the user drives each rotor
// directly (four RPM sliders) — thrust lifts, the thrust imbalance across the
// arms makes roll/pitch, and the reaction-torque imbalance across spin directions
// makes yaw. The inverse of quadMixer.
export function quadWrench(p, speeds) {
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
export function quadMixer(p, cmd) {
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
