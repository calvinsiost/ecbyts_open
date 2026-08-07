// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty — Correlation estimation + Iman-Conover rank induction
   (SPEC-REC-004 v0.4)

   Public API:
   - estimateCorrelationFromData(matrix, variableNames)
       → {pearson, spearman, n, variableNames} (frozen)
   - validateCorrelationMatrix(M)
       → {valid, isPositiveDefinite, minEigenvalue, errors} (frozen)
   - patchNearestPD(M)
       → number[][] — Higham-style nearest PD correction
   - imanConoverRankCorrelation(samples, targetCorrelation)
       → number[][] — reordered samples with induced rank correlation
   - CORRELATION_METHODS — frozen const {PEARSON, SPEARMAN}

   Reference: Iman & Conover (1982) "A distribution-free approach to
   inducing rank correlation among input variables", Commun. Stat.
   Simul. Comp. 11(3):311–334.
   ================================================================ */

import { invNormalCDF } from './distributions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Exported method name constants. */
export const CORRELATION_METHODS = Object.freeze({
    PEARSON: 'pearson',
    SPEARMAN: 'spearman',
});

// Legacy constants kept for backward compat with existing consumers
export const MC_DEFAULTS = Object.freeze({
    N_ITERATIONS: 10_000,
    SE_WARN_THRESHOLD: 0.05,
});

// ---------------------------------------------------------------------------
// Legacy helpers - kept for backward compatibility with existing consumers
// ---------------------------------------------------------------------------

/**
 * Computa MC_SE = sd / sqrt(n) para um output.
 * @param {Array<number>} samples
 * @returns {{ mean: number, sd: number, se: number, n: number }}
 */
export function computeMCStandardError(samples: any) {
    if (!Array.isArray(samples) || samples.length < 2) {
        return { mean: 0, sd: 0, se: 0, n: samples?.length || 0 };
    }
    const n = samples.length;
    let sum = 0;
    for (const v of samples) sum += Number(v) || 0;
    const mean = sum / n;
    let sq = 0;
    for (const v of samples) {
        const d = (Number(v) || 0) - mean;
        sq += d * d;
    }
    const sd = Math.sqrt(sq / (n - 1));
    const se = sd / Math.sqrt(n);
    return { mean, sd, se, n };
}

/**
 * @param {{mean: number, se: number}} stats
 * @param {number} [stats]
 * @returns {boolean} true if MC_SE/|mean| > threshold
 */
export function mcConvergenceWarning(stats: any, threshold: number = MC_DEFAULTS.SE_WARN_THRESHOLD) {
    if (!stats || !Number.isFinite(stats.mean) || !Number.isFinite(stats.se)) return false;
    if (stats.mean === 0) return stats.se > 0;
    return Math.abs(stats.se / stats.mean) > Number(threshold);
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Compute 1-based average ranks for a numeric array (ties get average rank).
 * @param {number[]} arr
 * @returns {number[]}
 */
function rankVector(arr: any) {
    const n = arr.length;
    const indexed = arr.map((v: any, i: any) => ({
        v,
        i
    })).sort((a: any, b: any) => a.v - b.v);
    const ranks: any = new Array(n);
    let j = 0;
    while (j < n) {
        let k = j;
        while (k < n - 1 && indexed[k + 1].v === indexed[k].v) k++;
        const avgRank = (j + 1 + k + 1) / 2;
        for (let t = j; t <= k; t++) ranks[indexed[t].i] = avgRank;
        j = k + 1;
    }
    return ranks;
}

/**
 * Pearson r between two equal-length arrays. Returns 0 if zero variance.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function _pearsonCorr(a: any, b: any) {
    const n = a.length;
    let sumA = 0,
        sumB = 0;
    for (let i = 0; i < n; i++) {
        sumA += a[i];
        sumB += b[i];
    }
    const mA = sumA / n,
        mB = sumB / n;
    let covAB = 0,
        varA = 0,
        varB = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - mA,
            db = b[i] - mB;
        covAB += da * db;
        varA += da * da;
        varB += db * db;
    }
    const denom = Math.sqrt(varA) * Math.sqrt(varB);
    return denom < 1e-15 ? 0 : covAB / denom;
}

/**
 * Cholesky decomposition of a symmetric PD matrix.
 * Returns lower-triangular L such that L × L^T = M.
 * Throws RangeError if not PD.
 * @param {number[][]} M
 * @returns {number[][]}
 */
function _choleskyDecomp(M: any) {
    const k = M.length;
    const L: any = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        for (let j = 0; j <= i; j++) {
            let s = M[i][j];
            for (let p = 0; p < j; p++) s -= L[i][p] * L[j][p];
            if (i === j) {
                if (s <= 0) throw new RangeError(`choleskyDecomp: not positive definite at pivot [${i}][${i}] = ${s}`);
                L[i][j] = Math.sqrt(s);
            } else {
                L[i][j] = s / L[j][j];
            }
        }
    }
    return L;
}

/**
 * Forward substitution: solve L × x = b.
 * @param {number[][]} L
 * @param {number[]} b
 * @returns {number[]}
 */
function _forwardSolve(L: any, b: any) {
    const n = L.length;
    const x: any = new Array(n);
    for (let i = 0; i < n; i++) {
        let s = b[i];
        for (let j = 0; j < i; j++) s -= L[i][j] * x[j];
        x[i] = s / L[i][i];
    }
    return x;
}

/**
 * Invert lower-triangular L.
 * @param {number[][]} L
 * @returns {number[][]}
 */
function _invertLower(L: any) {
    const n = L.length;
    const inv: any = Array.from({ length: n }, () => new Array(n).fill(0));
    const e: any = new Array(n).fill(0);
    for (let col = 0; col < n; col++) {
        for (let i = 0; i < n; i++) e[i] = i === col ? 1 : 0;
        const x = _forwardSolve(L, e);
        for (let i = 0; i < n; i++) inv[i][col] = x[i];
    }
    return inv;
}

/**
 * Matrix multiply A (m×p) × B (p×n) → C (m×n).
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function _matMul(A: any, B: any) {
    const m = A.length,
        p = B.length,
        n = B[0].length;
    const C: any = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) for (let l = 0; l < p; l++) C[i][j] += A[i][l] * B[l][j];
    return C;
}

/**
 * Transpose a matrix.
 * @param {number[][]} A m×n
 * @returns {number[][]} n×m
 */
function _transpose(A: any) {
    const m = A.length,
        n = A[0].length;
    const T: any = Array.from({ length: n }, () => new Array(m));
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j][i] = A[i][j];
    return T;
}

/**
 * Jacobi eigendecomposition for symmetric matrices.
 * Suitable for small matrices (≤10×10). Returns {values, vectors} where
 * vectors columns are eigenvectors.
 * @param {number[][]} M
 * @param {number} [maxIter=200]
 * @returns {{ values: number[], vectors: number[][] }}
 */
function _jacobiEigen(M: any, maxIter = 200) {
    const n = M.length;
    const A: any = M.map((row: any) => [...row]);
    /** @type {number[][]} */
    const V: any = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    for (let iter = 0; iter < maxIter; iter++) {
        let maxVal = 0,
            p = 0,
            q = 1;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(A[i][j]) > maxVal) {
                    maxVal = Math.abs(A[i][j]);
                    p = i;
                    q = j;
                }
            }
        }
        if (maxVal < 1e-12) break;

        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        const newApp = A[p][p] - t * A[p][q];
        const newAqq = A[q][q] + t * A[p][q];
        A[p][p] = newApp;
        A[q][q] = newAqq;
        A[p][q] = 0;
        A[q][p] = 0;

        for (let i = 0; i < n; i++) {
            if (i !== p && i !== q) {
                const aip = A[i][p],
                    aiq = A[i][q];
                A[i][p] = c * aip - s * aiq;
                A[p][i] = A[i][p];
                A[i][q] = s * aip + c * aiq;
                A[q][i] = A[i][q];
            }
        }

        for (let i = 0; i < n; i++) {
            const vip = V[i][p],
                viq = V[i][q];
            V[i][p] = c * vip - s * viq;
            V[i][q] = s * vip + c * viq;
        }
    }

    return { values: A.map((row: any, i: any) => row[i]), vectors: V };
}

/**
 * Build k×k correlation matrix from row-major score matrix T (k×n).
 * @param {number[][]} T
 * @returns {number[][]}
 */
function _corrMatrixFromRows(T: any) {
    const k = T.length;
    const corr: any = Array.from({ length: k }, () => new Array(k));
    for (let i = 0; i < k; i++) {
        for (let j = i; j < k; j++) {
            const r = i === j ? 1 : _pearsonCorr(T[i], T[j]);
            corr[i][j] = r;
            corr[j][i] = r;
        }
    }
    return corr;
}

// ---------------------------------------------------------------------------
// Legacy public helpers (kept for backward compat)
// ---------------------------------------------------------------------------

/**
 * Pearson correlation coefficient (public legacy export).
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number}
 */
export function pearsonCorrelation(x: any, y: any) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) return 0;
    return _pearsonCorr(x.map(Number), y.map(Number));
}

/**
 * Rank transform - public legacy export.
 * @param {number[]} values
 * @returns {number[]}
 */
export function rankTransform(values: any) {
    if (!Array.isArray(values)) return [];
    return rankVector(values.map(Number));
}

/**
 * Spearman rank correlation (public legacy export).
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number}
 */
export function spearmanCorrelation(x: any, y: any) {
    return pearsonCorrelation(rankTransform(x), rankTransform(y));
}

/**
 * Cholesky decomposition (public legacy export - returns null on failure).
 * @param {number[][]} M
 * @returns {number[][]|null}
 */
export function choleskyDecomposition(M: any) {
    if (!Array.isArray(M) || M.length === 0) return null;
    try {
        return _choleskyDecomp(M);
    } catch {
        return null;
    }
}

/**
 * Nearest PD via progressive ε·I regularisation (legacy - fast but less accurate).
 * Use patchNearestPD() for Higham-style eigenvalue correction.
 * @param {number[][]} M
 * @returns {number[][]|null}
 */
export function nearestPositiveDefinite(M: any) {
    if (!Array.isArray(M) || M.length === 0) return null;
    const n = M.length;
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (M[i][j] + M[j][i]) / 2));
    for (let eps = 0; eps < 0.5; eps += 0.001) {
        const T = S.map((row, i) => row.map((v, j) => (i === j ? 1 : v * (1 - eps))));
        if (choleskyDecomposition(T)) return T;
    }
    return null;
}

// ---------------------------------------------------------------------------
// SPEC-REC-004 v0.4 - Primary public API
// ---------------------------------------------------------------------------

/**
 * Estimate Pearson and Spearman correlation matrices from observed data.
 *
 * Input convention: matrix[i] is the array of n observations for variable i.
 *
 * @param {number[][]} matrix - k×n: each inner array = one variable's observations
 * @param {string[]} [variableNames]
 * @returns {{pearson: number[][], spearman: number[][], n: number, variableNames: string[]}}
 */
export function estimateCorrelationFromData(matrix: any, variableNames: any) {
    if (!Array.isArray(matrix) || matrix.length < 2) {
        throw new RangeError('estimateCorrelationFromData: matrix must have at least 2 variables');
    }
    const k = matrix.length;
    const n = matrix[0].length;
    if (n < 3) {
        throw new RangeError('estimateCorrelationFromData: each variable must have at least 3 observations');
    }
    for (let i = 1; i < k; i++) {
        if (matrix[i].length !== n) {
            throw new RangeError(
                `estimateCorrelationFromData: variable lengths differ (variable 0: ${n}, variable ${i}: ${matrix[i].length})`,
            );
        }
    }

    const pearson: any = Array.from({ length: k }, () => new Array(k));
    const spearman: any = Array.from({ length: k }, () => new Array(k));
    const ranks: any = matrix.map(rankVector);

    for (let i = 0; i < k; i++) {
        for (let j = i; j < k; j++) {
            if (i === j) {
                pearson[i][j] = 1;
                spearman[i][j] = 1;
            } else {
                const pr = _pearsonCorr(matrix[i], matrix[j]);
                const sr = _pearsonCorr(ranks[i], ranks[j]);
                pearson[i][j] = pr;
                pearson[j][i] = pr;
                spearman[i][j] = sr;
                spearman[j][i] = sr;
            }
        }
    }

    return Object.freeze({
        pearson,
        spearman,
        n,
        variableNames: Array.isArray(variableNames) ? variableNames.slice() : [],
    });
}

/**
 * Validate every row has length k.
 * @param {number[][]} M
 * @param {number} k
 * @param {string[]} errors
 */
function _validateMatrixShape(M: any, k: number, errors: string[]) {
    for (let i = 0; i < k; i++) {
        if (!Array.isArray(M[i]) || M[i].length !== k) {
            errors.push(`row_${i}_bad_length`);
        }
    }
}

/**
 * Validate unit diagonal.
 * @param {number[][]} M
 * @param {number} k
 * @param {string[]} errors
 */
function _validateDiagonal(M: any, k: number, errors: string[]) {
    for (let i = 0; i < k; i++) {
        if (Math.abs(M[i][i] - 1) > 1e-9) {
            errors.push(`diagonal_not_1_at_${i}:${M[i][i]}`);
        }
    }
}

/**
 * Validate symmetry and bounded values.
 * @param {number[][]} M
 * @param {number} k
 * @param {string[]} errors
 */
function _validateSymmetryAndRange(M: any, k: number, errors: string[]) {
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            if (Math.abs(M[i][j] - M[j][i]) > 1e-9) {
                errors.push(`not_symmetric_at_${i}_${j}`);
            }
            if (M[i][j] < -1 - 1e-9 || M[i][j] > 1 + 1e-9) {
                errors.push(`out_of_range_at_${i}_${j}:${M[i][j]}`);
            }
        }
    }
}

/**
 * Compute positive-definiteness and minimum eigenvalue.
 * @param {number[][]} M
 * @param {string[]} errors
 * @returns {{isPositiveDefinite: boolean, minEigenvalue: number|null}}
 */
function _computePDAndMinEigen(M: any, errors: string[]) {
    let isPositiveDefinite: boolean;
    let minEigenvalue: number | null;

    try {
        _choleskyDecomp(M);
        isPositiveDefinite = true;
    } catch {
        isPositiveDefinite = false;
        errors.push('not_positive_definite');
    }

    try {
        const { values } = _jacobiEigen(M);
        minEigenvalue = Math.min(...values);
    } catch {
        minEigenvalue = null;
    }

    return { isPositiveDefinite, minEigenvalue };
}

/**
 * Validate a correlation matrix for symmetry, unit diagonal, bounded values,
 * and positive definiteness (via Cholesky + approx min eigenvalue via Jacobi).
 *
 * @param {number[][]} M
 * @returns {{valid: boolean, isPositiveDefinite: boolean, minEigenvalue: number|null, errors: string[]}}
 */
export function validateCorrelationMatrix(M: any) {
    if (!Array.isArray(M) || M.length === 0) {
        return Object.freeze({
            valid: false,
            isPositiveDefinite: false,
            minEigenvalue: null,
            errors: ['not_an_array'],
        });
    }

    const errors: string[] = [];
    const k = M.length;

    _validateMatrixShape(M, k, errors);
    if (errors.length === 0) {
        _validateDiagonal(M, k, errors);
        _validateSymmetryAndRange(M, k, errors);
    }

    let isPositiveDefinite;
    let minEigenvalue;

    if (errors.length === 0) {
        ({ isPositiveDefinite, minEigenvalue } = _computePDAndMinEigen(M, errors));
    }

    return Object.freeze({ valid: errors.length === 0, isPositiveDefinite, minEigenvalue, errors });
}

/**
 * Return the nearest positive-definite correlation matrix to M,
 * using a simplified Higham (1988) algorithm:
 * 1. Symmetrize S = (M + M^T)/2
 * 2. Eigendecompose S (Jacobi)
 * 3. Clamp λ_i = max(λ_i, ε)
 * 4. Reconstruct V × diag(λ) × V^T
 * 5. Reset diagonal to 1
 * 6. Re-symmetrize
 *
 * @param {number[][]} M
 * @returns {number[][]} corrected PD correlation matrix (plain array, mutable)
 */
export function patchNearestPD(M: any) {
    const k = M.length;
    const EPS = 1e-8;

    // Step 1: symmetrize
    const S = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (M[i][j] + M[j][i]) / 2));

    // Step 2: Jacobi eigendecomposition
    const { values, vectors } = _jacobiEigen(S);

    // Step 3: clamp
    const lam = values.map((v: any) => Math.max(v, EPS));

    // Step 4: reconstruct V × diag(lam) × V^T
    const C: any = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            let s = 0;
            for (let r = 0; r < k; r++) s += vectors[i][r] * lam[r] * vectors[j][r];
            C[i][j] = s;
        }
    }

    // Step 5: reset diagonal to 1
    for (let i = 0; i < k; i++) C[i][i] = 1;

    // Step 6: re-symmetrize
    for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
            const avg = (C[i][j] + C[j][i]) / 2;
            C[i][j] = avg;
            C[j][i] = avg;
        }
    }

    return C;
}

/**
 * Iman-Conover (1982) rank correlation induction.
 *
 * Reorders already-sampled columns so that rank correlation approximates the
 * target Pearson correlation matrix, preserving marginal distributions exactly.
 *
 * Algorithm (I&C §3):
 * 1. Compute van der Waerden scores: T[i][j] = Φ^{-1}(rank(s_i[j]) / (n+1))
 * 2. P = Cholesky(targetCorrelation)
 * 3. Q = corrMatrix(T)  (k×k Pearson of the score rows)
 * 4. S = Cholesky(Q)
 * 5. C = S^{-1} × P
 * 6. T* = C^T × T  (k×n)
 * 7. Rearrange each sample vector to match rank order of its T* row
 *
 * @param {number[][]} samples - k×n (each row = one variable's LHS samples)
 * @param {number[][]} targetCorrelation - k×k Pearson target
 * @returns {number[][]} reordered samples (k×n, same marginals)
 */
export function imanConoverRankCorrelation(samples: any, targetCorrelation: any) {
    if (!Array.isArray(samples) || samples.length === 0) {
        throw new RangeError('imanConoverRankCorrelation: samples must be a non-empty array');
    }
    const k = samples.length;
    const n = samples[0].length;

    if (!Array.isArray(targetCorrelation) || targetCorrelation.length !== k) {
        throw new RangeError(`imanConoverRankCorrelation: targetCorrelation must be ${k}×${k}`);
    }
    for (let i = 0; i < k; i++) {
        if (samples[i].length !== n) {
            throw new RangeError(
                `imanConoverRankCorrelation: all sample arrays must have length ${n}, got ${samples[i].length} for index ${i}`,
            );
        }
    }

    // Step 1: Van der Waerden normal scores (k×n)
    const T: any = samples.map((s: any) => {
        const r = rankVector(s);
        return r.map((rank: any) => invNormalCDF(rank / (n + 1)));
    });

    // Step 2: Cholesky of target
    let P;
    try {
        P = _choleskyDecomp(targetCorrelation);
    } catch (e: any) {
        throw new RangeError(
            `imanConoverRankCorrelation: targetCorrelation is not positive definite — use patchNearestPD first. ${(e as any)?.message || e}`,
            { cause: e },
        );
    }

    // Step 3: Correlation matrix of T
    const Q = _corrMatrixFromRows(T);

    // Step 4: Cholesky of Q
    let S;
    try {
        S = _choleskyDecomp(Q);
    } catch {
        // Degenerate case (k=1 or identical scores): use identity
        S = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    }

    // Step 5: C = S^{-1} × P
    const Sinv = _invertLower(S);
    const C = _matMul(Sinv, P);

    // Step 6: T* = C × T  (k×n) - row-major: variables as rows
    // In column-major form the paper writes T* = T C^T; transposing both sides gives C T.
    const Tstar = _matMul(C, T);

    // Step 7: Rearrange each variable's samples to match rank order of Tstar[i]
    return samples.map((s: any, i: any) => {
        const sorted = [...s].sort((a: any, b: any) => a - b);
        const order: any = Tstar[i].map((v: any, idx: any) => ({ v, idx })).sort((a: any, b: any) => a.v - b.v);
        const out: any = new Array(n);
        for (let j = 0; j < n; j++) out[order[j].idx] = sorted[j];
        return out;
    });
}
