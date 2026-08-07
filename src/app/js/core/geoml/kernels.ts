// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   G4_GEOML — Gaussian Process kernels (pure math)
   Referência: Rasmussen & Williams 2006 §4.2 "Examples of covariance
   functions", Stein 1999 "Interpolation of Spatial Data".

   SPEC: SPEC_G4_GEOML_TRAINING.md §Q1 "GP como default — fornece
   incerteza útil para engenharia".

   Kernels implementados:
   - matern32(x1, x2, lengthScale, variance) — Matern 3/2 (default §Q1)
   - matern52(x1, x2, lengthScale, variance) — Matern 5/2 (twice-diff.)
   - rbf(x1, x2, lengthScale, variance)      — Squared Exponential
   - exponential(x1, x2, lengthScale, variance) — Matern 1/2 (Ornstein-Uhlenbeck)

   Cada kernel aceita vetores 2D [x, y] ou 3D [x, y, z] (space-agnostic).
   Sem DOM, sem rede — lógica pura em node:test.
   ================================================================ */

// ----------------------------------------------------------------
// Distance helpers
// ----------------------------------------------------------------

/**
 * Euclidean distance between two n-D points.
 */
export function euclideanDistance(p1: number[], p2: number[]): number {
    if (!Array.isArray(p1) || !Array.isArray(p2)) {
        throw new TypeError('euclideanDistance: points must be arrays');
    }
    if (p1.length !== p2.length) {
        throw new RangeError(`point dimension mismatch: ${p1.length} vs ${p2.length}`);
    }
    let sum = 0;
    for (let i = 0; i < p1.length; i++) {
        const a = p1[i];
        const b = p2[i];
        if (a === undefined || b === undefined) continue;
        const d = a - b;
        sum += d * d;
    }
    return Math.sqrt(sum);
}

// ----------------------------------------------------------------
// Kernel validation
// ----------------------------------------------------------------

function _validateKernelParams(lengthScale: number, variance: number): void {
    if (typeof lengthScale !== 'number' || !Number.isFinite(lengthScale) || lengthScale <= 0) {
        throw new RangeError('lengthScale must be a finite positive number');
    }
    if (typeof variance !== 'number' || !Number.isFinite(variance) || variance <= 0) {
        throw new RangeError('variance must be a finite positive number');
    }
}

// ----------------------------------------------------------------
// Kernels
// ----------------------------------------------------------------

/**
 * Matern 3/2 kernel - recommended default per Rasmussen & Williams §4.2.
 * k(x1, x2) = σ² · (1 + √3·r/ℓ) · exp(-√3·r/ℓ)
 * where r = ||x1 - x2||.
 *
 * @param lengthScale (ℓ) - controls smoothness (larger = smoother)
 * @param variance (σ²) - signal variance
 */
export function matern32(p1: number[], p2: number[], lengthScale: number, variance: number): number {
    _validateKernelParams(lengthScale, variance);
    const r = euclideanDistance(p1, p2);
    const sqrt3 = Math.sqrt(3);
    const scaled = (sqrt3 * r) / lengthScale;
    return variance * (1 + scaled) * Math.exp(-scaled);
}

/**
 * Matern 5/2 kernel - twice mean-square differentiable (ν = 5/2).
 * k(x1, x2) = σ² · (1 + √5·r/ℓ + 5·r²/(3·ℓ²)) · exp(-√5·r/ℓ)
 * where r = ||x1 - x2||.
 *
 * Smoothness sits between Matern 3/2 (once-differentiable, rougher) and the
 * RBF (infinitely differentiable, often too smooth). Per Rasmussen & Williams
 * §4.2, ν = 5/2 is "probably the only interesting case besides ν = 3/2" for
 * machine-learning use because higher orders are hard to distinguish from the
 * squared-exponential limit given noisy data. Useful for environmental fields
 * that are smooth yet not infinitely differentiable.
 *
 * Reference: Rasmussen, C.E. & Williams, C.K.I. (2006). Gaussian Processes for
 *   Machine Learning, MIT Press, §4.2 eq. (4.17), ISBN 0-262-18253-X.
 *
 * @param lengthScale (ℓ) - controls smoothness (larger = smoother)
 * @param variance (σ²) - signal variance
 */
export function matern52(p1: number[], p2: number[], lengthScale: number, variance: number): number {
    _validateKernelParams(lengthScale, variance);
    const r = euclideanDistance(p1, p2);
    const sqrt5 = Math.sqrt(5);
    const scaled = (sqrt5 * r) / lengthScale; // √5·r/ℓ
    const poly = 1 + scaled + (5 * r * r) / (3 * lengthScale * lengthScale);
    return variance * poly * Math.exp(-scaled);
}

/**
 * Squared Exponential (RBF / Gaussian) kernel.
 * k(x1, x2) = σ² · exp(-r²/(2ℓ²))
 *
 * Produces infinitely differentiable (very smooth) covariance - often
 * too smooth for environmental data. Use Matern 3/2 instead when unsure.
 */
export function rbf(p1: number[], p2: number[], lengthScale: number, variance: number): number {
    _validateKernelParams(lengthScale, variance);
    const r = euclideanDistance(p1, p2);
    const r2 = r * r;
    const denom = 2 * lengthScale * lengthScale;
    return variance * Math.exp(-r2 / denom);
}

/**
 * Exponential kernel - Matern 1/2, Ornstein-Uhlenbeck process.
 * k(x1, x2) = σ² · exp(-r/ℓ)
 *
 * Non-differentiable - rough sample paths. Suitable for discontinuous
 * geological boundaries.
 */
export function exponential(p1: number[], p2: number[], lengthScale: number, variance: number): number {
    _validateKernelParams(lengthScale, variance);
    const r = euclideanDistance(p1, p2);
    return variance * Math.exp(-r / lengthScale);
}

// ----------------------------------------------------------------
// Kernel registry
// ----------------------------------------------------------------

export const KERNELS = Object.freeze({
    matern32,
    matern52,
    rbf,
    exponential,
});

/**
 * Build a covariance matrix K[i][j] = kernel(X[i], X[j]) for a dataset.
 * K is symmetric positive-definite (required for Cholesky decomposition).
 *
 * @param X - array of n-D points
 * @param kernelFn - curried kernel (params pre-bound)
 * @returns N×N matrix
 */
export function buildCovarianceMatrix(
    X: number[][],
    kernelFn: (p1: number[], p2: number[]) => number,
): number[][] {
    if (!Array.isArray(X)) throw new TypeError('X must be an array');
    if (typeof kernelFn !== 'function') throw new TypeError('kernelFn must be a function');
    const n = X.length;
    const K: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
        K[i] = new Array(n);
        for (let j = 0; j <= i; j++) {
            const xi = X[i];
            const xj = X[j];
            if (xi === undefined || xj === undefined) continue;
            const v = kernelFn(xi, xj);
            (K[i] as number[])[j] = v;
            if (i !== j) {
                if (K[j] === undefined) K[j] = new Array(n);
                (K[j] as number[])[i] = v; // symmetric
            }
        }
    }
    return K;
}

/**
 * Bind kernel parameters, returning a (p1, p2) => number function.
 * Useful for buildCovarianceMatrix.
 *
 * @param name - 'matern32' | 'matern52' | 'rbf' | 'exponential'
 */
export function makeKernel(
    name: string,
    lengthScale: number,
    variance: number,
): (p1: number[], p2: number[]) => number {
    const fn = (KERNELS as Record<string, (p1: number[], p2: number[], l: number, v: number) => number>)[name];
    if (!fn) throw new Error(`unknown kernel: ${name}`);
    _validateKernelParams(lengthScale, variance);
    return (p1: number[], p2: number[]) => fn(p1, p2, lengthScale, variance);
}
