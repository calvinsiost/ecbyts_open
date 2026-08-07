// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   G4_GEOML — Gaussian Process regression
   Referência: Rasmussen & Williams 2006 Algorithm 2.1 (p.19).

   Entrega:
   - fitGP({ X, y, kernelFn, noise, jitter }) → posterior params
   - predictGP(posterior, Xtest) → { mean, variance }

   Uso típico (SPEC §Q1/Q3):
     const kern = makeKernel('matern32', 100, 2.0);
     const gp = fitGP({ X: campaignPoints, y: concentrations, kernelFn: kern, noise: 0.1 });
     const pred = predictGP(gp, gridPoints);  // pred.mean + pred.variance por ponto

   GP fornece INCERTEZA explícita (pred.variance) — diferencial principal
   vs Kriging clássico (§Q1 "útil para engenharia").

   Sem DOM, sem rede — pure math.
   ================================================================ */

import { buildCovarianceMatrix } from './kernels.js';
import { cholesky, solveLower, solveUpper, addJitter, dot } from './matrix.js';

interface GPPosterior {
    X: number[][];
    L: number[][];
    alpha: number[];
    kernelFn: (p1: number[], p2: number[]) => number;
    noise: number;
}

// ----------------------------------------------------------------
// Fit
// ----------------------------------------------------------------

/**
 * Fit a zero-mean Gaussian Process to training data.
 *
 * Algorithm 2.1 (Rasmussen & Williams p.19):
 *   L = cholesky(K + σ_n²·I)
 *   α = L^T \ (L \ y)
 * Store L and α for prediction.
 *
 * @param params
 * @param params.X - training points, shape [N][D]
 * @param params.y - training outputs, shape [N]
 * @param params.kernelFn - bound kernel
 * @param params.noise - observation noise variance σ_n²
 * @param params.jitter - extra diagonal for numerical stability
 */
export function fitGP({
    X,
    y,
    kernelFn,
    noise = 1e-4,
    jitter = 1e-8,
}: {
    X: number[][];
    y: number[];
    kernelFn: (p1: number[], p2: number[]) => number;
    noise?: number;
    jitter?: number;
}): { X: number[][]; L: number[][]; alpha: number[]; kernelFn: Function; noise: number } {
    if (!Array.isArray(X) || X.length === 0) throw new TypeError('X must be non-empty array');
    if (!Array.isArray(y) || y.length !== X.length) {
        throw new RangeError('y must have same length as X');
    }
    if (typeof kernelFn !== 'function') throw new TypeError('kernelFn must be function');
    if (!Number.isFinite(noise) || noise < 0) throw new RangeError('noise must be ≥0');
    if (!Number.isFinite(jitter) || jitter < 0) throw new RangeError('jitter must be ≥0');

    const K = buildCovarianceMatrix(X, kernelFn);
    const Kn = addJitter(K, noise + jitter);

    const L = cholesky(Kn);
    // α = L^T \ (L \ y)
    const z = solveLower(L, y);
    const alpha = solveUpper(L, z);

    return Object.freeze({
        X: X.map((row) => row.slice()),
        L,
        alpha,
        kernelFn,
        noise,
    });
}

// ----------------------------------------------------------------
// Predict
// ----------------------------------------------------------------

/**
 * Predict posterior mean and variance at test points.
 *
 * Algorithm 2.1 (Rasmussen & Williams p.19):
 *   For each x* in Xtest:
 *     k* = [k(x*, x_1), ..., k(x*, x_N)]
 *     mean*   = k*^T · α
 *     v       = L \ k*
 *     var*    = k(x*, x*) - v·v
 *
 * @param posterior - from fitGP
 * @param Xtest - test points, shape [M][D]
 */
export function predictGP(posterior: object, Xtest: number[][]): { mean: number[]; variance: number[] } {
    if (!posterior || typeof posterior !== 'object') {
        throw new TypeError('posterior required (from fitGP)');
    }
    if (!Array.isArray(Xtest)) throw new TypeError('Xtest must be array');

    const { X, L, alpha, kernelFn } = posterior as any as GPPosterior;
    const m = Xtest.length;
    const mean = new Array(m);
    const variance = new Array(m);

    for (let i = 0; i < m; i++) {
        const xStar = Xtest[i]!;
        const kStar = X.map((xTrain: any) => kernelFn(xStar, xTrain as any));
        // posterior mean = k*^T · α
        mean[i] = dot(kStar, alpha);
        // v = L \ k*
        const v = solveLower(L, kStar);
        // posterior variance = k(x*, x*) - v·v
        const kss = kernelFn(xStar, xStar);
        variance[i] = Math.max(0, kss - dot(v, v));
    }

    return { mean, variance };
}

/**
 * Convenience: compute standard deviation (sqrt variance) alongside mean.
 * Useful for producing 95% CI bands (mean ± 1.96·std).
 *
 * @param posterior
 * @param Xtest
 */
export function predictGPWithStd(posterior: object, Xtest: number[][]): { mean: number[]; std: number[] } {
    const { mean, variance } = predictGP(posterior, Xtest);
    const std = variance.map((v) => Math.sqrt(Math.max(0, v)));
    return { mean, std };
}
