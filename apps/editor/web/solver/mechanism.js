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
