// Planar linkages, closed-form. The slider-crank converts between rotary motion
// (a crank pin on a wheel) and reciprocating linear motion (a piston on a fixed
// axis) — the heart of a steam engine, pump, or compressor.
// Solve the slider-crank at crank angle θ. The piston rides the vertical line
// x = axisX; the connecting rod pins it to the crank pin. Closed form: pick the
// upper intersection of the rod circle with that line.
export function sliderCrank(p, theta) {
    const r = p.crankRadius;
    const L = p.rodLength;
    const axisX = p.center[0] + (p.offset ?? 0);
    const a = theta + (p.phase ?? 0);
    const pinX = p.center[0] + r * Math.cos(a);
    const pinY = p.center[1] + r * Math.sin(a);
    // (pinX − axisX)² + (pistonY − pinY)² = L²  →  pistonY = pinY + √(L² − dx²)
    const dx = pinX - axisX;
    const pistonY = pinY + Math.sqrt(Math.max(0, L * L - dx * dx));
    return { crankPin: [pinX, pinY], piston: [axisX, pistonY], axisX, stroke: 2 * r };
}
// Solve the equilibrium arm angle at spindle speed ω (rad/s). Net moment about
// the pivot M(θ) = centrifugal − gravity − spring; M decreases with θ, so a
// bisection finds the root (clamped to [0, thetaMax]).
export function governor(p, omega) {
    const g = p.gravity ?? 9.81;
    const L = p.armLength / 1000, e = p.pivotRadius / 1000, b = p.sleeveArm / 1000, m = p.ballMass;
    const moment = (theta) => {
        const r = e + L * Math.sin(theta);
        const Mc = m * omega * omega * r * (L * Math.cos(theta)); // centrifugal
        const Mg = m * g * (L * Math.sin(theta)); // gravity
        const S = p.springPreload + p.springRate * (b * Math.sin(theta)); // spring force on sleeve
        const Ms = S * (b * Math.cos(theta)); // spring moment
        return Mc - Mg - Ms;
    };
    let theta;
    if (moment(0) <= 0)
        theta = 0; // below the threshold speed — balls on the rest
    else if (moment(p.thetaMax) >= 0)
        theta = p.thetaMax; // pinned at the stop
    else {
        let lo = 0, hi = p.thetaMax;
        for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            if (moment(mid) > 0)
                lo = mid;
            else
                hi = mid;
        }
        theta = (lo + hi) / 2;
    }
    return {
        theta,
        ballRadius: p.pivotRadius + p.armLength * Math.sin(theta),
        ballHeight: p.armLength * Math.cos(theta),
        sleeveLift: p.sleeveArm * Math.sin(theta),
        flyingOut: theta > 1e-4,
    };
}
