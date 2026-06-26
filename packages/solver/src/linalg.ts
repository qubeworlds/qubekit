// Dense linear algebra, only what the solver needs: solve A x = b for a
// symmetric positive-definite A via Cholesky. The solver's normal-equations
// matrix (JᵀJ + λ·diag) is SPD by construction once λ > 0, so this is the only
// factorization required.

export type Matrix = number[][];

// Cholesky solve. Returns null if A is not positive-definite (caller bumps λ).
export function solveSPD(A: Matrix, b: number[]): number[] | null {
  const n = b.length;
  const L: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) return null; // not PD
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // Forward solve L y = b.
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / L[i][i];
  }

  // Back solve Lᵀ x = y.
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}
