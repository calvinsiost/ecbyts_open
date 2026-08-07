// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   G4_GEOML Fase 2 — Hyperparameter optimization via MLE
   Referência: Rasmussen & Williams 2006 §5.4.1 eq. 2.30 + §5.4.2.

   SPEC §Spec-to-Green "Otimizar hiperparâmetros (length scale, variance)".

   Entregas:
   - logMarginalLikelihood(X, y, kernelName, lengthScale, variance, noise)
       → log p(y|X, θ)  (Rasmussen & Williams eq. 2.30 p.19)
   - optimizeHyperparams(X, y, kernelName, {grid, refine})
       → argmax θ* via grid search log-space + local refinement
   - gridSearchLog(min, max, steps) → helper de grade logarítmica

   Decisão de algoritmo (A7 ADR):
   Grid search log-space com refinement em vez de gradient ascent:
   - 2-3 hiperparâmetros apenas (lengthScale, variance, opcionalmente noise)
   - N pequeno (≤20 campanhas) torna cada avaliação barata
   - Grid evita NaN/inf issues de gradient em regiões singulares
   - Não requer derivatives analíticas do kernel (preserva extensibilidade)

   Sem DOM, sem rede — pure math.
   ================================================================ */

import { makeKernel, buildCovarianceMatrix } from './kernels.js';
import { cholesky, solveLower, solveUpper, addJitter, logDiag, dot } from './matrix.js';

// ----------------------------------------------------------------
// Log marginal likelihood (R&W eq. 2.30)
// ----------------------------------------------------------------

/**
 * Compute log marginal likelihood log p(y | X, θ) for a zero-mean GP.
 *
 * Rasmussen & Williams 2006 eq. 2.30 p.19:
 *   log p(y|X) = -½·y^T·α - Σ log(diag(L)) - (N/2)·log(2π)
 * where L = cholesky(K + σ_n²·I), α = L^T \ (L \ y).
 *
 * Returns -Infinity if K is not SPD (unstable hyperparams).
 *
 * @param {object} params
 * @param {number[][]} params.X
 * @param {number[]} params.y
 * @param {string} params.kernelName - 'matern32' | 'rbf' | 'exponential'
 * @param {number} params.lengthScale
 * @param {number} params.variance
 * @param {number} [params.noise=1e-4]
 * @param {number} [params.jitter=1e-8]
 * @returns {number} log marginal likelihood (higher is better)
 */
export function logMarginalLikelihood({
    X,
    y,
    kernelName,
    lengthScale,
    variance,
    noise = 1e-4,
    jitter = 1e-8,
}: {
    X: number[][];
    y: number[];
    kernelName: string;
    lengthScale: number;
    variance: number;
    noise?: number;
    jitter?: number;
}): number {
    if (!Array.isArray(X) || X.length === 0) throw new TypeError('X required');
    if (!Array.isArray(y) || y.length !== X.length) throw new RangeError('y length mismatch');

    let kernelFn;
    try {
        kernelFn = makeKernel(kernelName, lengthScale, variance);
    } catch (_) {
        return -Infinity; // invalid hyperparams
    }

    const K = buildCovarianceMatrix(X, kernelFn);
    const Kn = addJitter(K, noise + jitter);

    let L;
    try {
        L = cholesky(Kn);
    } catch (_) {
        // Not SPD - hyperparams produce unstable K, penalize
        return -Infinity;
    }

    const z = solveLower(L, y);
    const alpha = solveUpper(L, z);

    const n = X.length;
    const term1 = -0.5 * dot(y, alpha);
    const term2 = -logDiag(L); // = -½ log |K_n| since log|K_n| = 2·sum(log(diag(L)))
    const term3 = -0.5 * n * Math.log(2 * Math.PI);

    return term1 + term2 + term3;
}

// ----------------------------------------------------------------
// Grid generation
// ----------------------------------------------------------------

/**
 * Generate a logarithmically-spaced grid.
 * @param {number} min - inclusive lower bound (>0)
 * @param {number} max - inclusive upper bound (>min)
 * @param {number} steps - number of points (≥2)
 * @returns {number[]}
 */
export function gridSearchLog(min: number, max: number, steps: number): number[] {
    if (!(min > 0) || !(max > min)) throw new RangeError('require 0 < min < max');
    if (!Number.isInteger(steps) || steps < 2) throw new RangeError('steps must be integer ≥2');
    const lmin = Math.log(min);
    const lmax = Math.log(max);
    const out = new Array(steps);
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        out[i] = Math.exp(lmin + t * (lmax - lmin));
    }
    return out;
}

// ----------------------------------------------------------------
// Optimization
// ----------------------------------------------------------------

const DEFAULT_GRID = Object.freeze({
    lengthScaleMin: 0.1,
    lengthScaleMax: 100,
    lengthScaleSteps: 8,
    varianceMin: 0.01,
    varianceMax: 10,
    varianceSteps: 6,
});

/**
 * Optimize GP hyperparameters (lengthScale, variance) via MLE grid search.
 * Coarse search → local refinement around argmax.
 *
 * @param {object} params
 * @param {number[][]} params.X
 * @param {number[]} params.y
 * @param {string} params.kernelName
 * @param {number} [params.noise=1e-4]
 * @param {object} [params.grid] - override default grid bounds
 * @param {boolean} [params.refine=true] - run 2nd pass around coarse argmax
 * @returns {{ lengthScale: number, variance: number, logLik: number, evaluations: number }}
 */
export function optimizeHyperparams({
    X,
    y,
    kernelName,
    noise = 1e-4,
    grid = {},
    refine = true,
}: {
    X: number[][];
    y: number[];
    kernelName: string;
    noise?: number;
    grid?: any;
    refine?: boolean;
}): { lengthScale: number; variance: number; logLik: number; evaluations: number } {
    if (!Array.isArray(X) || X.length < 2) {
        throw new RangeError('optimize requires X.length ≥ 2');
    }
    if (!Array.isArray(y) || y.length !== X.length) {
        throw new RangeError('y length mismatch');
    }

    const g = { ...DEFAULT_GRID, ...grid };
    const lScales = gridSearchLog(g.lengthScaleMin, g.lengthScaleMax, g.lengthScaleSteps);
    const vars = gridSearchLog(g.varianceMin, g.varianceMax, g.varianceSteps);

    let evaluations = 0;
    let best = { lengthScale: lScales[0] as number, variance: vars[0] as number, logLik: -Infinity };

    for (const ls of lScales) {
        for (const v of vars) {
            evaluations++;
            const ll = logMarginalLikelihood({
                X,
                y,
                kernelName,
                lengthScale: ls,
                variance: v,
                noise,
            });
            if (ll > best.logLik) {
                best = { lengthScale: ls, variance: v, logLik: ll };
            }
        }
    }

    if (!refine) {
        return { ...best, evaluations };
    }

    // Local refinement: narrow window around coarse argmax, 5×5 grid
    const lsCenter = best.lengthScale;
    const vCenter = best.variance;
    const lsFine = gridSearchLog(lsCenter * 0.3, lsCenter * 3, 5);
    const vFine = gridSearchLog(vCenter * 0.3, vCenter * 3, 5);

    for (const ls of lsFine) {
        for (const v of vFine) {
            evaluations++;
            const ll = logMarginalLikelihood({
                X,
                y,
                kernelName,
                lengthScale: ls,
                variance: v,
                noise,
            });
            if (ll > best.logLik) {
                best = { lengthScale: ls, variance: v, logLik: ll };
            }
        }
    }

    return { ...best, evaluations };
}
