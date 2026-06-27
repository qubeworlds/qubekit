// Paper / Fabric — a draped sheet simulated as a REAL Jolt soft body (XPBD) by
// the Quine engine. This isn't @qubekit/solver (that solves the rigid mechanisms);
// it's the engine's soft-body cloth: an nx×nz vertex grid wired with structural,
// shear and bend constraints, pinned along its back edge, with one front corner a
// host-driven "handle" the Lift slider peels upward to reveal what's underneath.
//
// The model holds just the two presentation knobs — the material (paper vs fabric)
// and the Lift amount — and exposes the cloth parameters the 3D view turns into a
// scene. Paper is stiffer and coarser (holds a crease, peels as a stiff sheet);
// fabric is finer and softer (more iterations relax it into a heavier drape).

const MODES = {
  paper: {
    label: 'Paper',
    nx: 22, nz: 22, spacing: 0.038, iterations: 12,
    color: [0.93, 0.90, 0.82, 1],          // warm off-white stock
    note: 'a stiff sheet — more solver iterations, holds its crease',
  },
  fabric: {
    label: 'Fabric',
    nx: 26, nz: 26, spacing: 0.032, iterations: 6,
    color: [0.62, 0.20, 0.26, 1],          // deep red cloth
    note: 'a soft drape — finer grid, fewer constraints met, folds heavily',
  },
};

export function buildPaper(opts = {}) {
  let mode = MODES[opts.mode] ? opts.mode : 'paper';
  let lift = 0; // 0..100 (% of full peel)

  const m = {
    kind: 'paper',
    sliderConfig: { label: 'Lift', min: 0, max: 100, step: 1, unit: '%', param: 'lift' },
    modes: ['paper', 'fabric'],

    get mode() { return mode; },
    get modeLabel() { return MODES[mode].label; },
    get sliderValue() { return lift; },
    get liftFraction() { return lift / 100; },

    setSlider(v) { lift = Math.max(0, Math.min(100, v)); return lift; },
    setMode(next) { if (MODES[next]) mode = next; return mode; },

    // The cloth params the 3D view bakes into the scene's `kind:"cloth"` entity.
    // The grid is pinned along its back edge; the front-right corner is the handle.
    clothParams() {
      const c = MODES[mode];
      return {
        nx: c.nx, nz: c.nz, spacing: c.spacing, iterations: c.iterations,
        pin: 'backEdge',
        handleI: c.nx - 1, handleJ: c.nz - 1, // front-right corner
        color: c.color,
      };
    },

    // Peel mapping: the handle lifts in +Y and pulls back in −Z as Lift rises, so
    // the sheet rolls back off whatever it covers (axes the engine reads: 1 = Y,
    // 2 = Z, off the handle's rest position).
    handleOffset() {
      const f = m.liftFraction;
      return { x: 0, y: f * 0.9, z: -f * 0.45 };
    },

    factsHTML() {
      const c = MODES[mode];
      const verts = c.nx * c.nz;
      return `<b>${c.label}</b> cloth — a real Jolt <b>soft body</b> (XPBD): ` +
        `<b>${c.nx}×${c.nz}</b> = ${verts} vertices, structural + shear + bend ` +
        `constraints, <b>${c.iterations}</b> solver iterations/step. The back edge ` +
        `is pinned (inverse-mass 0); the front corner is a host-driven handle. ` +
        `${c.note}. Lift: <b>${lift}%</b>.`;
    },
  };
  return m;
}
