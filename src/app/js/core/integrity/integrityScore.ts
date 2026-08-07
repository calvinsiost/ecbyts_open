// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/integrity/integrityScore.js
// Integrity Score aggregate engine (ADR-INTEGRITY-001).
//
// Non-compensatory weighted geometric mean with per-axis kill-switch.
// All output is flagged `publishable: false` until the publish gate
// conditions documented in ADR Publish Gate are met via feature flag
// CONFIG.FEATURES.LAUNCHPAD_V3_INTEGRITY_AGGREGATE.

export interface IntegrityWeights {
    wC: number;
    wT: number;
    wU: number;
}

export interface IntegrityFloors {
    C_floor: number;
    T_floor: number;
    U_floor: number;
}

export interface IntegrityScoreInput {
    C?: unknown;
    T?: unknown;
    U?: unknown;
}

export interface IntegrityScoreOptions {
    weights?: Partial<IntegrityWeights> | null;
    floors?: Partial<IntegrityFloors> | null;
}

export type IntegrityStatus = 'pre-calibration' | 'calibrated';
export type IntegrityVetoAxis = 'C' | 'T';
export type IntegrityDownweightedAxis = 'U';
export type IntegrityReason =
    | 'data_insufficient'
    | 'compliance_below_floor'
    | 'traceability_below_floor'
    | 'invalid_weights'
    | 'uncertainty_below_floor_downweighted';

export interface IntegrityComponents {
    C: number | null;
    T: number | null;
    U: number | null;
    G: number | null;
}

export interface IntegrityScoreResult {
    score: number | null;
    status: IntegrityStatus;
    publishable: boolean;
    formulaVersion: string;
    vetoed: IntegrityVetoAxis | null;
    downweighted: IntegrityDownweightedAxis | null;
    reason?: IntegrityReason;
    components: IntegrityComponents;
}

export interface IntegrityCounts {
    compliancePassed?: unknown;
    complianceTotal?: unknown;
    signed?: unknown;
    totalElements?: unknown;
    obsWithUncertainty?: unknown;
    totalQuantObs?: unknown;
}

/**
 * Default weights - provisional until Calibration Protocol completes.
 * @see ADR-INTEGRITY-001 Weights
 */
export const DEFAULT_WEIGHTS: Readonly<IntegrityWeights> = Object.freeze({
    wC: 0.4,
    wT: 0.35,
    wU: 0.25,
});

/**
 * Default kill-switch floors - provisional until calibration.
 * @see ADR-INTEGRITY-001 Weights
 */
export const DEFAULT_FLOORS: Readonly<IntegrityFloors> = Object.freeze({
    C_floor: 0.5,
    T_floor: 0.3,
    U_floor: 0.1,
});

/**
 * Current formula version. Increment when weights or formula shape changes
 * post-calibration. Consumers include this in emitted payloads to allow
 * historical comparison.
 */
export const FORMULA_VERSION = '1.0.0-pre-calibration';

function createIntegrityResult(): IntegrityScoreResult {
    return {
        score: null,
        status: 'pre-calibration',
        publishable: false,
        formulaVersion: FORMULA_VERSION,
        vetoed: null,
        downweighted: null,
        components: { C: null, T: null, U: null, G: null },
    };
}

function setVeto(out: IntegrityScoreResult, axis: IntegrityVetoAxis, reason: IntegrityReason): IntegrityScoreResult {
    out.vetoed = axis;
    out.score = 0;
    out.components.G = 0;
    out.reason = reason;
    return out;
}

function computeGeometricMean(
    weights: IntegrityWeights,
    floors: IntegrityFloors,
    components: { C: number; T: number; U: number },
): { G: number; downweighted: boolean; reason?: IntegrityReason | undefined } {
    const sumW = weights.wC + weights.wT + weights.wU;
    if (sumW <= 0) {
        return { G: 0, downweighted: false, reason: 'invalid_weights' };
    }

    const { C, T, U } = components;
    let G: number;
    if (C === 0 || T === 0 || U === 0) {
        G = 0;
    } else {
        const logG = (weights.wC * Math.log(C) + weights.wT * Math.log(T) + weights.wU * Math.log(U)) / sumW;
        G = Math.exp(logG);
    }

    let downweighted = false;
    let reason: IntegrityReason | undefined;
    if (U < floors.U_floor) {
        downweighted = true;
        G *= 0.5;
        reason = 'uncertainty_below_floor_downweighted';
    }
    return { G, downweighted, reason };
}

function populateComponents(
    input: IntegrityScoreInput | null | undefined,
    out: IntegrityScoreResult,
): { C: number; T: number; U: number } | null {
    const C = coerceFraction(input?.C);
    const T = coerceFraction(input?.T);
    const U = coerceFraction(input?.U);
    if (C == null || T == null || U == null) {
        out.reason = 'data_insufficient';
        return null;
    }
    out.components.C = C;
    out.components.T = T;
    out.components.U = U;
    return { C, T, U };
}

/**
 * Compute the aggregate Integrity Score.
 */
export function computeIntegrityScore(
    input: IntegrityScoreInput | null | undefined,
    opts: IntegrityScoreOptions = {},
): IntegrityScoreResult {
    const weights: IntegrityWeights = { ...DEFAULT_WEIGHTS, ...(opts?.weights || {}) };
    const floors: IntegrityFloors = { ...DEFAULT_FLOORS, ...(opts?.floors || {}) };
    const out = createIntegrityResult();

    const components = populateComponents(input, out);
    if (!components) return out;
    const { C, T } = components;

    if (C < floors.C_floor) {
        return setVeto(out, 'C', 'compliance_below_floor');
    }

    if (T < floors.T_floor) {
        return setVeto(out, 'T', 'traceability_below_floor');
    }

    const geo = computeGeometricMean(weights, floors, components);
    out.components.G = geo.G;
    out.downweighted = geo.downweighted ? 'U' : null;
    if (geo.reason !== undefined) {
        out.reason = geo.reason;
    }
    out.score = clampScore(Math.round(geo.G * 100));
    return out;
}

function coerceFraction(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

// ── Sensitivity / robustness analysis (FRIEND-SCORE-001 pattern, 2026-06-13) ──
// The OECD/JRC Handbook on Composite Indicators ends the pipeline in a
// robustness step that ADR-INTEGRITY-001 itself flags as pending ("weights
// provisional until Calibration Protocol"). This answers the peer-review
// question: is the published score an artifact of the provisional weights?
// Refs: arXiv 2008.13637 "should policy makers trust composite indices".

export interface IntegritySensitivityScenario {
    readonly label: string;
    readonly score: number | null;
    readonly vetoed: IntegrityVetoAxis | null;
    readonly downweighted: IntegrityDownweightedAxis | null;
}

export interface IntegritySensitivityResult {
    readonly baseline: { score: number | null; vetoed: IntegrityVetoAxis | null };
    readonly min: number | null;
    readonly max: number | null;
    readonly range: number | null;
    /** Score stays within ±maxDelta of baseline across all scenarios? */
    readonly scoreStable: boolean;
    /** Veto/downweight verdict identical across all weight perturbations? */
    readonly vetoStable: boolean;
    readonly scenarios: ReadonlyArray<IntegritySensitivityScenario>;
    readonly verdict: 'robust' | 'weight_sensitive' | 'floor_sensitive';
}

/** Pontuação considerada "estável" se a faixa fica dentro de ±this. */
export const INTEGRITY_STABILITY_DELTA = 5;

function addSingleAxisScenarios<K extends string>(
    scenarios: IntegritySensitivityScenario[],
    input: IntegrityScoreInput | null | undefined,
    keys: ReadonlyArray<K>,
    baseValues: Record<K, number>,
    opts: IntegrityScoreOptions,
    labelPrefix: 'w' | 'floor',
    valuePath: 'weights' | 'floors',
): void {
    for (const k of keys) {
        for (const [tag, mult] of [['−50%', 0.5], ['+50%', 1.5]] as const) {
            const perturbed = { ...baseValues, [k]: baseValues[k] * mult } as Record<K, number>;
            const r = computeIntegrityScore(input, {
                ...opts,
                [valuePath]: perturbed,
            });
            scenarios.push({
                label: `${labelPrefix}:${String(k)} ${tag}`,
                score: r.score,
                vetoed: r.vetoed,
                downweighted: r.downweighted,
            });
        }
    }
}

function addPerturbationScenarios(
    scenarios: IntegritySensitivityScenario[],
    input: IntegrityScoreInput | null | undefined,
    baseW: IntegrityWeights,
    baseF: IntegrityFloors,
): void {
    const wKeys: Array<keyof IntegrityWeights> = ['wC', 'wT', 'wU'];
    addSingleAxisScenarios(scenarios, input, wKeys, baseW, { floors: baseF }, 'w', 'weights');

    const fKeys: Array<keyof IntegrityFloors> = ['C_floor', 'T_floor', 'U_floor'];
    addSingleAxisScenarios(scenarios, input, fKeys, baseF, { weights: baseW }, 'floor', 'floors');
}

function computeScoreRange(scenarios: ReadonlyArray<IntegritySensitivityScenario>): number {
    const scores = scenarios.map((s) => s.score).filter((s): s is number => typeof s === 'number');
    return scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
}

function computeSensitivityVerdict(
    scenarios: ReadonlyArray<IntegritySensitivityScenario>,
    scoreStable: boolean,
    vetoStable: boolean,
): IntegritySensitivityResult['verdict'] {
    if (scoreStable && vetoStable) return 'robust';

    const weightScenarios = scenarios.filter((s) => s.label === 'baseline' || s.label.startsWith('w:'));
    const floorScenarios = scenarios.filter((s) => s.label.startsWith('floor:'));
    const floorRange = computeScoreRange(floorScenarios);
    const weightRange = computeScoreRange(weightScenarios);
    return floorRange > weightRange ? 'floor_sensitive' : 'weight_sensitive';
}

/**
 * One-at-a-time sensitivity over the provisional weights and floors.
 * Perturbs each weight ±50% and each floor ±50%, recomputes, and reports
 * whether the score and the veto/downweight verdict are robust. Pure;
 * baseline reuses computeIntegrityScore so the formula stays single-source.
 */
export function computeIntegritySensitivity(
    input: IntegrityScoreInput | null | undefined,
    opts: IntegrityScoreOptions = {},
): IntegritySensitivityResult {
    const base = computeIntegrityScore(input, opts);
    const scenarios: IntegritySensitivityScenario[] = [
        { label: 'baseline', score: base.score, vetoed: base.vetoed, downweighted: base.downweighted },
    ];

    const baseW: IntegrityWeights = { ...DEFAULT_WEIGHTS, ...(opts?.weights || {}) };
    const baseF: IntegrityFloors = { ...DEFAULT_FLOORS, ...(opts?.floors || {}) };

    addPerturbationScenarios(
        scenarios,
        input,
        baseW,
        baseF,
    );

    const numericScores = scenarios.map((s) => s.score).filter((s): s is number => typeof s === 'number');
    const min = numericScores.length ? Math.min(...numericScores) : null;
    const max = numericScores.length ? Math.max(...numericScores) : null;
    const range = min != null && max != null ? max - min : null;
    const scoreStable = range != null && range <= INTEGRITY_STABILITY_DELTA;

    const weightScenarios = scenarios.filter((s) => s.label === 'baseline' || s.label.startsWith('w:'));
    const vetoSet = new Set(weightScenarios.map((s) => `${s.vetoed}/${s.downweighted}`));
    const vetoStable = vetoSet.size === 1;

    const verdict = computeSensitivityVerdict(scenarios, scoreStable, vetoStable);

    return Object.freeze({
        baseline: Object.freeze({ score: base.score, vetoed: base.vetoed }),
        min,
        max,
        range,
        scoreStable,
        vetoStable,
        scenarios: Object.freeze(scenarios),
        verdict,
    });
}

/**
 * Convenience: compute score from raw counts rather than fractions.
 */
export function computeFromCounts(
    counts: IntegrityCounts | null | undefined,
    opts: IntegrityScoreOptions = {},
): IntegrityScoreResult {
    const safeFrac = (num: unknown, den: unknown): number | null => {
        const n = Number(num);
        const d = Number(den);
        if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
        return n / d;
    };

    const C = safeFrac(counts?.compliancePassed, counts?.complianceTotal);
    const T = safeFrac(counts?.signed, counts?.totalElements);
    const U = safeFrac(counts?.obsWithUncertainty, counts?.totalQuantObs);

    if (C == null || T == null || U == null) {
        return {
            score: null,
            status: 'pre-calibration',
            publishable: false,
            formulaVersion: FORMULA_VERSION,
            vetoed: null,
            downweighted: null,
            reason: 'data_insufficient',
            components: { C, T, U, G: null },
        };
    }

    return computeIntegrityScore({ C, T, U }, opts);
}
