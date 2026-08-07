// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty — Monte Carlo engine (UNC-HUB-002 P1)

   Given a list of random variables and a deterministic model function,
   produces:
   - per-variable samples (LHS-stratified)
   - per-output distribution statistics (mean, sd, IC 95%, histogram)
   - bit-for-bit reproducibility with a seed

   Reuses the LHS algorithm from core/analytics/scenarioSimulation/engine.js
   (duplicated here as a pure function to keep core/uncertainty/ self-
   contained — that module has other concerns that would pull in DOM).

   Reference: JCGM 101:2008 (MCM supplement to GUM).
   ================================================================ */

import { mulberry32, sampleFromUniform } from './distributions.js';
import { buildMcVariablesFromQ2Q } from './q2qMcBridge.js';
import { migrateEvidenceToV3, migratePolicyToV3 } from './schemas.js';

/** @typedef {{ id: string, distribution: string, params?: Record<string, unknown> }} McVariable */
/** @typedef {{ bins: number[], min: number, max: number, width?: number }} McHistogram */
/** @typedef {{ mean: number, sd: number, ic95: [number, number], histogram: McHistogram, samples: number[], monteCarloSE: number, mcConvergenceWarning: boolean }} McOutput */
/** @typedef {{ seed: number, n_iter: number, method: string, outputs: Record<string, McOutput>, samples_per_var: Record<string, number[]>, elapsed_ms: number, evidence?: Record<string, unknown>, schema_version?: unknown, method_tier?: unknown, policy_id?: unknown, policy_version?: unknown, matrix?: unknown, mapping_version?: unknown }} McResult */
/** @typedef {{ variables: McVariable[], model: (sample: Record<string, number>) => number | Record<string, number>, n?: number, seed?: number, nBins?: number }} McConfig */
/** @typedef {{ n?: number, seed?: number, nBins?: number }} MonteCarloOptions */

/**
 * Build an LHS (Latin Hypercube) matrix of n samples in dims dimensions,
 * seeded for reproducibility. Each column has one sample in each of n
 * strata, then the columns are independently shuffled.
 * @param {number} n
 * @param {number} dims
 * @param {number} seed
 * @returns {number[][]} n×dims in [0, 1)
 */
export function lhsMatrix(n: any, dims: any, seed = 12345) {
    if (!(n > 0) || !(dims >= 0)) throw new Error('lhsMatrix: n>0 and dims>=0 required');
    const rng = mulberry32(seed);
    const matrix: any = Array.from({ length: n }, () => new Array(dims));
    for (let d = 0; d < dims; d++) {
        const col: any = new Array(n);
        for (let i = 0; i < n; i++) col[i] = (i + rng()) / n;
        // Fisher-Yates shuffle
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = col[i];
            col[i] = col[j];
            col[j] = t;
        }
        for (let i = 0; i < n; i++) matrix[i][d] = col[i];
    }
    return matrix;
}

/**
 * Empirical quantile (nearest-rank) - used for IC bounds.
 * @param {number[]} sortedAsc
 * @param {number} p  0..1
 */
export function quantile(sortedAsc: any, p: any) {
    if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return NaN;
    const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)));
    return sortedAsc[idx];
}

/**
 * Mean + standard deviation of a numeric array.
 * @param {number[]} values
 * @returns {{ mean: number, sd: number }}
 */
export function meanSd(values: any) {
    const n = values.length;
    if (n === 0) return { mean: NaN, sd: NaN };
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[i];
    const mean = sum / n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const d = values[i] - mean;
        acc += d * d;
    }
    const sd = Math.sqrt(acc / Math.max(1, n - 1));
    return { mean, sd };
}

/**
 * Equal-width histogram (40 default bins) - for UI render.
 * @param {number[]} values
 * @param {number} [nBins]
 * @returns {McHistogram}
 */
export function histogram(values: any, nBins = 40) {
    if (!values.length) return { bins: [], min: 0, max: 0 };
    let min = Infinity,
        max = -Infinity;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = Math.max(1e-12, max - min);
    const w = range / nBins;
    const bins = new Array(nBins).fill(0);
    for (let i = 0; i < values.length; i++) {
        const idx = Math.min(nBins - 1, Math.floor((values[i] - min) / w));
        bins[idx]++;
    }
    return { bins, min, max, width: w };
}

/**
 * Run Monte Carlo propagation.
 *
 * @param {Partial<McConfig> | null | undefined} config
 * @returns {McResult}
 */
export function runMonteCarlo(config: any) {
    const { variables, model, n = 10000, seed = 42, nBins = 40 } = config || {};
    if (!Array.isArray(variables)) throw new Error('runMonteCarlo: variables must be an array');
    if (typeof model !== 'function') throw new Error('runMonteCarlo: model must be a function');
    if (!(n > 0)) throw new Error('runMonteCarlo: n must be > 0');

    const t0 = Date.now();
    const dims = variables.length;
    const uMat: any = lhsMatrix(n, dims, seed);

    const samplesPerVar: any = ({} as Record<string, any>);
    for (let d = 0; d < dims; d++) {
        const variable = (variables[d] as any);
        samplesPerVar[variable.id] = new Array(n);
    }

    // Transform uniforms → distribution samples
    for (let i = 0; i < n; i++) {
        for (let d = 0; d < dims; d++) {
            const v = (variables[d] as any);
            samplesPerVar[v.id][i] = sampleFromUniform(v.distribution, v.params, uMat[i][d]);
        }
    }

    // Evaluate the model at each iteration; detect single vs multi output
    const outputsAccum = ({} as Record<string, number[]>);
    for (let i = 0; i < n; i++) {
        const sample = ({} as Record<string, number>);
        for (let d = 0; d < dims; d++) {
            const variable = (variables[d] as any);
            sample[variable.id] = samplesPerVar[variable.id][i];
        }
        const y = model(sample);
        if (y !== null && typeof y === 'object' && !Array.isArray(y)) {
            const yRecord = (y as Record<string, unknown>);
            for (const key of Object.keys(yRecord)) {
                (outputsAccum[key] ||= new Array(n))[i] = Number(yRecord[key]);
            }
        } else {
            (outputsAccum.y ||= new Array(n))[i] = Number(y);
        }
    }

    const outputs = ({} as Record<string, any>);
    for (const [k, arr] of Object.entries(outputsAccum)) {
        const sorted = [...arr].sort((a, b) => a - b);
        const { mean, sd } = meanSd(arr);
        // MC standard error = sd / sqrt(n) - indicates precision of the MC mean estimate (JCGM 101)
        const monteCarloSE = n > 1 ? sd / Math.sqrt(n) : 0;
        // Convergence warning: relative SE > 5% suggests more iterations may be needed
        const mcConvergenceWarning = mean !== 0 && monteCarloSE / Math.abs(mean) > 0.05;
        outputs[k] = {
            mean,
            sd,
            ic95: [quantile(sorted, 0.025), quantile(sorted, 0.975)],
            histogram: histogram(arr, nBins),
            samples: arr,
            monteCarloSE,
            mcConvergenceWarning,
        };
    }

    return {
        seed,
        n_iter: n,
        method: 'LHS-independent',
        outputs,
        samples_per_var: samplesPerVar,
        elapsed_ms: Date.now() - t0,
    };
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function _cheapHash(input: any) {
    const s = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `fnv1a:${(h >>> 0).toString(16)}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} policy
 * @param {ReadonlyArray<McVariable> | null | undefined} variables
 * @param {Partial<McResult> | null | undefined} result
 * @param {MonteCarloOptions} [opts]
 * @returns {Record<string, unknown>}
 */
export function buildMonteCarloEvidence(policy: any, variables: any, result: any, opts: any = {}) {
    const policyV3 = (
        policy?.schema_version === 'v3' ? policy : migratePolicyToV3(policy || {})
    ) as Record<string, unknown>;
    const runtime = ((result || {}) as any);
    const config = {
        method: runtime.method || 'LHS',
        n_iter: runtime.n_iter || opts.n || 1000,
        seed: runtime.seed ?? opts.seed ?? 42,
        n_bins: opts.nBins ?? 40,
        variable_count: Array.isArray(variables) ? variables.length : 0,
    };
    const fingerprint = {
        policy_id: policyV3?.policy_id || null,
        policy_version: policyV3?.policy_version || '1.0.0',
        mapping_version: policyV3?.mapping_version || policyV3?.policy_version || '1.0.0',
        matrix: policyV3?.matrix || 'groundwater',
        variables: Array.isArray(variables)
            ? variables.map((v) => ({
                  id: v.id,
                  distribution: v.distribution,
                  params: v.params,
              }))
            : [],
        q2q_overrides: policyV3?.q2q_overrides || {},
        config,
    };

    return (migrateEvidenceToV3({
        evidence_id: `unc-ev-${Date.now()}`,
        method: 'MonteCarlo',
        policy_id: policyV3?.policy_id || 'unknown-policy',
        policy_version: policyV3?.policy_version || '1.0.0',
        mapping_version: policyV3?.mapping_version || policyV3?.policy_version || '1.0.0',
        matrix: policyV3?.matrix || 'groundwater',
        nd_method: policyV3?.nd_method || 'auto',
        q2q_inputs: policyV3?.q2q_overrides || {},
        mc_config: config,
        inputs_hash: _cheapHash(JSON.stringify(fingerprint)),
        outputs: runtime.outputs || {},
        supabase_policy_source: policyV3?.supabase_source || null,
        generated_at: new Date().toISOString(),
    }) as Record<string, unknown>);
}

/**
 * runMonteCarloFromQ2Q - Tier-2 MC entry point that consumes a policy
 * object (from hubStore or migratePolicyToV3) with Q2Q overrides.
 *
 * Bridges the Q2Q→MC gap identified in Gemini review 2026-04-17 (finding High #2):
 * variables are built automatically from the policy's q2q_overrides without
 * manual re-entry of distributions.
 *
 * @param {Record<string, unknown> | null | undefined} policy - v3 policy object (or v1/v2 migrated via migratePolicyToV3)
 * @param {(sample: Record<string, number>) => number|Record<string, number>} model
 * @param {MonteCarloOptions} [opts] - forwarded to runMonteCarlo: { n, seed, nBins }
 * @returns {Promise<{ result: McResult | null, evidence: Record<string, unknown> | null, skipped: string[], errors: string[] }>}
 */
export async function runMonteCarloFromQ2Q(policy: any, model: any, opts: any = {}) {
    /** @type {string[]} */
    const skipped: any = [];
    /** @type {string[]} */
    const errors: any = [];

    if (!policy || typeof policy !== 'object') {
        return { result: null, evidence: null, skipped, errors: ['policy_required'] };
    }

    // Migrate to v3 if needed
    const policyV3 = (
        policy.schema_version === 'v3' ? policy : migratePolicyToV3(policy)
    ) as Record<string, unknown>;

    // Build variables from q2q_overrides
    // centralValues extracted from mc_variables if present (id → central)
    const centralValues = ({} as Record<string, number>);
    if (Array.isArray(policyV3.mc_variables)) {
        const mcVariables = (policyV3.mc_variables as Array<Record<string, unknown>>);
        for (const v of mcVariables) {
            if (typeof v.id === 'string' && typeof v.central === 'number') centralValues[v.id] = v.central;
        }
    }

    const built = (
        buildMcVariablesFromQ2Q(policyV3, centralValues)
    ) as any;
    if (Array.isArray(built.skipped)) skipped.push(...built.skipped.map((s: any) => String(s)));

    const variables = built.variables || [];
    if (!variables.length) {
        return {
            result: null,
            evidence: null,
            skipped,
            errors: ['no_variables_built — ensure policy has q2q_overrides + mc_variables with central values'],
        };
    }

    const result: any = runMonteCarlo({ variables, model, ...opts });
    const evidence = buildMonteCarloEvidence(policyV3, variables, result, opts);

    // Mirror evidence metadata on the runtime result for UI callers.
    result.evidence = evidence;
    result.schema_version = evidence.schema_version;
    result.method_tier = evidence.method_tier;
    result.policy_id = evidence.policy_id;
    result.policy_version = evidence.policy_version;
    result.matrix = evidence.matrix;
    result.mapping_version = evidence.mapping_version;

    return { result, evidence, skipped, errors };
}
