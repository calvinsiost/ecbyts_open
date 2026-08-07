// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   G4_GEOML — Matrix ops for Gaussian Process regression
   Referência: Rasmussen & Williams 2006 Algorithm 2.1 (p.19).

   Operações mínimas para GP regression sem dependência externa:
   - cholesky(K) → L tal que L·L^T = K (K SPD)
   - solveLower(L, b) → x tal que L·x = b
   - solveUpper(LT, b) → x tal que L^T·x = b
   - matVec(A, v) → Av
   - dot(a, b) → a·b
   - logDiag(L) → sum(log(diag(L)))

   Para N pequeno (≤20 campanhas no contexto ambiental de treino),
   O(N³) Cholesky ingênuo é suficiente. Otimização SIMD/workers fica
   para Fase 2 se N crescer.

   Sem DOM, sem rede — pure math.
   ================================================================ */

// ----------------------------------------------------------------
// Cholesky decomposition (Rasmussen & Williams p.19 line 2)
// ----------------------------------------------------------------

/**
 * Cholesky decomposition: finds L (lower triangular) such that L·L^T = A.
 * Requires A symmetric positive-definite. Fails if A is not SPD.
 *
 * For GP regression, A is typically K + σ_n²·I (jitter added to diagonal
 * for numerical stability). If Cholesky fails, increase jitter.
 *
 * @param A - N×N symmetric positive-definite matrix
 * @returns N×N lower triangular L
 * @throws {Error} if A is not SPD
 */
export function cholesky(A: number[][]): number[][] {
    if (!Array.isArray(A) || A.length === 0) {
        throw new TypeError('A must be a non-empty square matrix');
    }
    const n = A.length;
    for (const row of A) {
        if (!Array.isArray(row) || row.length !== n) {
            throw new RangeError(`A must be square ${n}×${n}`);
        }
    }

    const L: number[][] = new Array(n);
    for (let i = 0; i < n; i++) L[i] = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = A[i]![j]!;
            for (let k = 0; k < j; k++) {
                sum -= L[i]![k]! * L[j]![k]!;
            }
            if (i === j) {
                if (sum <= 0) {
                    throw new Error(
                        `cholesky: matrix not positive-definite (diag[${i}] = ${sum}). ` +
                            `Add jitter to diagonal and retry.`,
                    );
                }
                L[i]![j] = Math.sqrt(sum);
            } else {
                L[i]![j] = sum / L[j]![j]!;
            }
        }
    }
    return L;
}

// ----------------------------------------------------------------
// Triangular solve
// ----------------------------------------------------------------

/**
 * Forward substitution: solve L·x = b where L is lower triangular.
 * @param L - N×N lower triangular
 * @param b - N-vector
 * @returns x
 */
export function solveLower(L: number[][], b: number[]): number[] {
    const n = L.length;
    if (b.length !== n) throw new RangeError('b.length must match L dimension');
    const x: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        let sum = b[i]!;
        for (let j = 0; j < i; j++) {
            sum -= L[i]![j]! * x[j]!;
        }
        if (L[i]![i]! === 0) throw new Error(`solveLower: singular at row ${i}`);
        x[i] = sum / L[i]![i]!;
    }
    return x;
}

/**
 * Backward substitution: solve L^T·x = b where L is lower triangular
 * (so L^T is upper triangular).
 * @param L - N×N lower triangular (takes transpose on the fly)
 * @param b
 * @returns
 */
export function solveUpper(L: number[][], b: number[]): number[] {
    const n = L.length;
    if (b.length !== n) throw new RangeError('b.length must match L dimension');
    const x: number[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        let sum = b[i]!;
        for (let j = i + 1; j < n; j++) {
            sum -= L[j]![i]! * x[j]!; // L^T[i][j] = L[j][i]
        }
        if (L[i]![i]! === 0) throw new Error(`solveUpper: singular at row ${i}`);
        x[i] = sum / L[i]![i]!;
    }
    return x;
}

// ----------------------------------------------------------------
// Basic ops
// ----------------------------------------------------------------

/**
 * Matrix-vector product: A·v.
 * @param A - M×N
 * @param v - N-vector
 * @returns M-vector
 */
export function matVec(A: number[][], v: number[]): number[] {
    const m = A.length;
    const n = v.length;
    if (!m || A[0]!.length !== n) {
        throw new RangeError(`matVec: dimension mismatch A[${m}×${A[0]?.length}] · v[${n}]`);
    }
    const out: number[] = new Array(m).fill(0);
    for (let i = 0; i < m; i++) {
        let s = 0;
        const row = A[i]!;
        for (let j = 0; j < n; j++) {
            s += row[j]! * v[j]!;
        }
        out[i] = s;
    }
    return out;
}

/**
 * Vector dot product.
 * @param a
 * @param b
 * @returns
 */
export function dot(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new RangeError('dot: length mismatch');
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
    return s;
}

/**
 * Sum of log of diagonal entries. For Cholesky L, log|K| = 2·sum(log(diag(L))).
 * @param L
 * @returns
 */
export function logDiag(L: number[][]): number {
    const n = L.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
        if (L[i]![i]! <= 0) throw new Error(`logDiag: non-positive diag[${i}]`);
        s += Math.log(L[i]![i]!);
    }
    return s;
}

/**
 * Add jitter (small positive value) to diagonal for numerical stability.
 * Returns a new matrix - does not mutate input.
 * @param K - N×N
 * @param jitter - typically 1e-6 to 1e-8
 * @returns
 */
export function addJitter(K: number[][], jitter: number): number[][] {
    if (!Number.isFinite(jitter) || jitter < 0) {
        throw new RangeError('jitter must be a non-negative finite number');
    }
    const n = K.length;
    const out: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = K[i]!.slice();
        out[i]![i]! += jitter;
    }
    return out;
}
