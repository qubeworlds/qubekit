// Levenberg–Marquardt over SE(3). Minimizes ½‖r(x)‖² where r is the stacked
// constraint residual and x is the 6-DOF-per-free-body parameter vector.
//
// The Jacobian is computed numerically by perturbing each free DOF through the
// body retraction. Numeric J keeps constraints as *just* residual functions —
// adding a constraint type never touches the solver — and the systems here
// (a handful of bodies) are tiny, so the finite-difference cost is irrelevant.
// LM (vs. plain Gauss–Newton) is what makes it robust to the rank-deficient
// blocks that 3D mates produce (parallel is 3 eqns / 2 DOF; gauge freedoms when
// nothing is grounded).
import { cloneBody, retract } from './body.js';
import { solveSPD } from './linalg.js';
function residualVector(bodies, constraints) {
    const out = [];
    for (const c of constraints)
        for (const v of c.residual(bodies))
            out.push(v);
    return out;
}
const sumSq = (v) => v.reduce((s, x) => s + x * x, 0);
export function solve(input, constraints, opts = {}) {
    const maxIters = opts.maxIters ?? 200;
    const tol = opts.tol ?? 1e-9;
    const epsFD = opts.epsFD ?? 1e-6;
    let lambda = opts.lambda0 ?? 1e-3;
    const bodies = input.map(cloneBody);
    const free = bodies.map((b, i) => (b.grounded ? -1 : i)).filter((i) => i >= 0);
    const n = free.length * 6;
    let r = residualVector(bodies, constraints);
    let cost = sumSq(r);
    let iter = 0;
    const rms = () => Math.sqrt(cost / Math.max(1, r.length));
    if (n === 0)
        return { bodies, iterations: 0, residualNorm: Math.sqrt(cost), converged: rms() < tol };
    for (; iter < maxIters; iter++) {
        if (rms() < tol)
            break;
        const m = r.length;
        // Numeric Jacobian J (m × n): column = ∂r/∂(free DOF) via retraction.
        const J = Array.from({ length: m }, () => new Array(n).fill(0));
        for (let col = 0; col < n; col++) {
            const fb = free[Math.floor(col / 6)];
            const dof = col % 6;
            const delta = [0, 0, 0, 0, 0, 0];
            delta[dof] = epsFD;
            const saved = cloneBody(bodies[fb]);
            retract(bodies[fb], delta);
            const rp = residualVector(bodies, constraints);
            bodies[fb] = saved; // restore
            for (let row = 0; row < m; row++)
                J[row][col] = (rp[row] - r[row]) / epsFD;
        }
        // Normal equations: A = JᵀJ (symmetric), g = Jᵀr.
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const g = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                let s = 0;
                for (let row = 0; row < m; row++)
                    s += J[row][i] * J[row][j];
                A[i][j] = s;
                A[j][i] = s;
            }
            let gi = 0;
            for (let row = 0; row < m; row++)
                gi += J[row][i] * r[row];
            g[i] = gi;
        }
        // LM inner loop: grow λ until the damped step actually reduces the cost.
        let stepTaken = false;
        for (let tries = 0; tries < 16; tries++) {
            // Marquardt damping: scale by the diagonal (fall back to 1 for empty DOFs).
            const Ad = A.map((rowv, i) => rowv.map((v, j) => (i === j ? v + lambda * (Math.abs(v) || 1) : v)));
            const step = solveSPD(Ad, g.map((x) => -x));
            if (!step) {
                lambda *= 10;
                continue;
            }
            const trial = bodies.map(cloneBody);
            for (let k = 0; k < free.length; k++)
                retract(trial[free[k]], step.slice(k * 6, k * 6 + 6));
            const rt = residualVector(trial, constraints);
            const ct = sumSq(rt);
            if (ct < cost) {
                for (let i = 0; i < bodies.length; i++)
                    bodies[i] = trial[i];
                r = rt;
                cost = ct;
                lambda = Math.max(lambda * 0.5, 1e-12);
                stepTaken = true;
                break;
            }
            lambda *= 4;
        }
        if (!stepTaken)
            break; // converged or stuck — no downhill step exists
    }
    return { bodies, iterations: iter, residualNorm: Math.sqrt(cost), converged: rms() < tol };
}
