// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty — Sobol sensitivity indices (Saltelli 2010).

   Computes first-order (S1) and total (ST) sensitivity indices using
   the 2-matrix scheme from Saltelli et al. (2010), "Variance based
   sensitivity analysis of model output. Design and estimator for the
   total sensitivity index", Computer Physics Communications 181.

   S1_i estimates: the share of V(Y) explained by variable i alone.
   ST_i estimates: the share of V(Y) that vanishes if variable i is fixed.
   ST_i > S1_i signals interaction with other variables.

   Standard estimators used:
   - S1_i   ≈  (1/N) Σ_j B_j · (A_Bi_j − A_j) / V(Y)           (Saltelli 2010, eq. (b))
   - ST_i   ≈  (1/(2N)) Σ_j (A_j − A_Bi_j)^2 / V(Y)            (Saltelli 2010, eq. (f), Jansen 1999)

   Inputs:
   - A, B: two N×d matrices of independent random samples in the input space.
   - AB_i: copy of A where column i is replaced by column i of B.
   - model: function (row) -> number (scalar output).
   ================================================================ */

import { mulberry32, sampleFromUniform } from './distributions.js';

/**
 * Build a fresh sample matrix of n rows, using seeded uniforms → distributions.
 * Each row contains one realization for every variable, in the order given.
 * @param variables
 * @param n
 * @param seed
 */
function _sampleMatrix(
    variables: Array<{ id: any; distribution: any; params: any }>,
    n: number,
    seed: number,
): number[][] {
    const rng = mulberry32(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const row = new Array(variables.length);
        for (let d = 0; d < variables.length; d++) {
            row[d] = sampleFromUniform(variables[d]!.distribution, variables[d]!.params, rng());
        }
        rows[i] = row;
    }
    return rows;
}

function _variance(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[i]!;
    const mean = sum / n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const d = values[i]! - mean;
        acc += d * d;
    }
    return acc / (n - 1);
}

/**
 * @param model
 * @param variables
 * @param matrix
 */
function _evaluateMatrix(model: Function, variables: Array<any>, matrix: number[][]) {
    const out = new Array(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
        const sample: Record<string, number> = {};
        for (let d = 0; d < variables.length; d++) sample[variables[d]!.id] = matrix[i]![d]!;
        const y = model(sample);
        out[i] = typeof y === 'object' && y !== null ? Number(y.y ?? Object.values(y)[0]) : Number(y);
    }
    return out;
}

/**
 * Compute Sobol S1 (first-order) and ST (total) indices for every variable.
 *
 * @param config
 * @param config.variables
 * @param config.model
 * @param config.n  - samples per matrix. Total model evaluations ≈ n*(d+2).
 * @param config.seed
 */
export function computeSobolIndices(config: {
    variables: Array<{ id: any; distribution: any; params: any }>;
    model: (sample: Record<string, number>) => number | Record<string, number>;
    n?: number;
    seed?: number;
}): {
    s1: Record<string, number>;
    st: Record<string, number>;
    variance: number;
    n_evaluations: number;
} {
    const { variables, model, n = 500, seed = 101 } = config || ({} as any);
    if (!Array.isArray(variables) || variables.length === 0) {
        throw new Error('computeSobolIndices: variables array required');
    }
    if (typeof model !== 'function') throw new Error('computeSobolIndices: model must be a function');

    const d = variables.length;
    const A = _sampleMatrix(variables, n, seed);
    const B = _sampleMatrix(variables, n, seed + 99991);

    const yA = _evaluateMatrix(model, variables, A);
    const yB = _evaluateMatrix(model, variables, B);
    const V = _variance(yA.concat(yB));

    const s1: Record<string, number> = {};
    const st: Record<string, number> = {};
    let evals = yA.length + yB.length;

    if (V <= 1e-18) {
        for (let i = 0; i < d; i++) {
            s1[variables[i]!.id] = 0;
            st[variables[i]!.id] = 0;
        }
        return { s1, st, variance: V, n_evaluations: evals };
    }

    for (let i = 0; i < d; i++) {
        // Build AB_i: A with column i replaced by B's column i
        const ABi = new Array(n);
        for (let r = 0; r < n; r++) {
            const row = A[r]!.slice();
            row[i] = B[r]![i]!;
            ABi[r] = row;
        }
        const yABi = _evaluateMatrix(model, variables, ABi);
        evals += yABi.length;

        let sumS1 = 0;
        let sumST = 0;
        for (let r = 0; r < n; r++) {
            sumS1 += yB[r] * (yABi[r] - yA[r]);
            const diff = yA[r] - yABi[r];
            sumST += diff * diff;
        }
        s1[variables[i]!.id] = Number((sumS1 / n / V).toFixed(6));
        st[variables[i]!.id] = Number((sumST / (2 * n) / V).toFixed(6));
    }

    return { s1, st, variance: V, n_evaluations: evals };
}
