// Articulated robot arm — serial revolute chain, forward + inverse kinematics.
//
// The image shows a 6-axis collaborative arm picking shapes off a table and
// dropping them into a sorter. The kinematics that actually matter for that task
// are: a base that YAWS to face the target's azimuth, and a vertical shoulder–
// elbow–wrist linkage that REACHES a point in that vertical plane. So the model
// is a base yaw joint plus a planar 3R arm working in the (radial, height) plane,
// with an analytic inverse kinematics — no diffusion-model hand-waving, the law
// of cosines places the elbow exactly and reachability is a hard check.
//
// Lengths in mm (metric, like the rest of the kit), angles in radians, y up.
const TAU = Math.PI * 2;
const wrap = (a) => {
    let x = a % TAU;
    if (x > Math.PI)
        x -= TAU;
    if (x < -Math.PI)
        x += TAU;
    return x;
};
// Place the 3D polyline from the base, given a yaw and the three planar link
// angles. The arm plane is spanned by the radial direction (cos yaw on +x /
// sin yaw on +z) and world +y; planar (r, h) maps to world (r·dir, h).
export function armForward(p, yaw, q1, q2, q3) {
    const dirX = Math.sin(yaw), dirZ = Math.cos(yaw); // yaw 0 faces +z
    const toWorld = (r, h) => [r * dirX, h, r * dirZ];
    const base = [0, 0, 0];
    const sR = p.shoulderOffset, sH = p.baseHeight;
    const eR = sR + p.upperArm * Math.cos(q1), eH = sH + p.upperArm * Math.sin(q1);
    const wR = eR + p.forearm * Math.cos(q2), wH = eH + p.forearm * Math.sin(q2);
    const tR = wR + p.tool * Math.cos(q3), tH = wH + p.tool * Math.sin(q3);
    return [base, toWorld(sR, sH), toWorld(eR, eH), toWorld(wR, wH), toWorld(tR, tH)];
}
// Inverse kinematics for a top-down grasp: the gripper points straight down
// (wrist angle = −90°), so the wrist sits L3 directly above the target. The base
// yaws to the target azimuth; the shoulder/elbow form a 2-link reach to the
// wrist, solved by the law of cosines (elbow-up branch by default).
export function armInverse(p, target) {
    const [tx, ty, tz] = target;
    const yaw = Math.atan2(tx, tz); // azimuth in the world x/z plane
    const r = Math.hypot(tx, tz); // radial distance from the yaw axis
    const h = ty;
    // Top-down tool: tip points down, so the wrist is L3 above the target.
    const q3 = -Math.PI / 2;
    const wristR = r, wristH = h + p.tool;
    // 2-link reach: shoulder → wrist over L1 (upper arm) + L2 (forearm).
    const sR = p.shoulderOffset, sH = p.baseHeight;
    const dR = wristR - sR, dH = wristH - sH;
    const D = Math.hypot(dR, dH);
    const L1 = p.upperArm, L2 = p.forearm;
    const reachable = D <= L1 + L2 + 1e-6 && D >= Math.abs(L1 - L2) - 1e-6;
    // Circle–circle intersection for the elbow. a = projection of the elbow onto
    // the shoulder→wrist line; height = perpendicular offset to the elbow.
    const Dc = Math.max(D, 1e-9);
    const a = (Dc * Dc + L1 * L1 - L2 * L2) / (2 * Dc);
    const hPerp = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dR / Dc, uh = dH / Dc; // unit shoulder→wrist
    const sign = p.elbowUp === false ? -1 : 1; // perp = rotate +90° (elbow-up)
    const elbowR = sR + a * ux - sign * hPerp * uh;
    const elbowH = sH + a * uh + sign * hPerp * ux;
    const q1 = Math.atan2(elbowH - sH, elbowR - sR);
    const q2 = Math.atan2(wristH - elbowH, wristR - elbowR);
    const points = armForward(p, yaw, q1, q2, q3);
    return {
        reachable,
        yaw, shoulder: q1, elbow: q2, wrist: q3,
        joints: { base: yaw, shoulder: q1, elbow: wrap(q2 - q1), wrist: wrap(q3 - q2) },
        points,
        tip: points[4],
    };
}
