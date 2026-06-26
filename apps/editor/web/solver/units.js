// Units. QubeKit is metric end-to-end.
//
// The solver and gear geometry work in a single linear unit, and that unit is
// the **millimetre** — it matches the gear `module` (always quoted in mm), keeps
// part geometry in human, machine-shop numbers (a 12-tooth m=1 gear has a 6 mm
// pitch radius), and avoids tiny floats. The 3D scene / quine engine works in
// **metres**, so convert at that single boundary with `mmToM`.
//
// Rule of thumb for realistic construction-kit sizing:
//   module m = 1 mm           → fine kit gears   (pitch radius = z/2 mm)
//   module m = 1.5–2 mm       → chunky, toy-scale, more robust teeth
//   beam stud/hole pitch ≈ 8 mm (the classic technic spacing)
export const MM_PER_M = 1000;
export const mmToM = (mm) => mm / MM_PER_M;
export const mToMm = (m) => m * MM_PER_M;
