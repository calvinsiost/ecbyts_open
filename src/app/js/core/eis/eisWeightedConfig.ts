// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   EIS Weighted Configuration — P1-50
   Custom axis weights for the TCCCA+T non-compensatory motor.

   Provides:
   - DEFAULT_AXIS_WEIGHTS: frozen gold-standard (sum=12)
   - WEIGHT_PRESETS: named preset identifiers
   - PRESET_WEIGHTS: domain-tuned weight tables
   - createWeightConfig(weights): validate + normalize
   - getPresetWeights(preset): lookup by preset key
   - computeWeightedEIS(axisScores, weightConfig): geom. mean + veto
   - compareWeightedScenarios(axisScores, presets): ranking table

   Mathematical basis: weighted geometric mean (non-compensatory)
     EIS = ∏ score_i ^ (w_i / sum(w))
   Veto: if score(T) ≤ 2 OR score(A) ≤ 2 → EIS = 0.00

   Reference: same algorithm as EisCalculator._calculateGeometric /
   _calculateVeto in eisCalculator.js (framework 3CTA+).
   ================================================================ */

/** All 6 canonical TCCCA+T axes in definition order. */
const EIS_AXES = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'];

// ================================================================
// DEFAULT WEIGHTS (Gold Standard, sum = 12)
// ================================================================

/**
 * Gold-Standard axis weights - frozen, sum = 12.
 * Matches EIS_DEFAULT_WEIGHTS in eisCalculator.js exactly.
 * Do NOT mutate - use createWeightConfig() to build custom configs.
 */
export const DEFAULT_AXIS_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
    T: 3, // Transparência / Evidence origin
    A: 3, // Acurácia / Sensor health
    Cp: 2, // Completude / Coverage uptime
    Ty: 2, // Tempestividade / Delivery latency
    Cs: 1, // Consistência / SI units
    Cm: 1, // Comparabilidade / Taxonomy
});

// ================================================================
// WEIGHT PRESETS - named identifiers
// ================================================================

/**
 * Named preset identifiers.
 */
export const WEIGHT_PRESETS: Readonly<Record<string, string>> = Object.freeze({
    DEFAULT: 'default',
    MINING: 'mining',
    REMEDIATION: 'remediation',
    WATER: 'water',
});

// ================================================================
// PRESET WEIGHT TABLES
// ================================================================

/**
 * Domain-tuned weight tables per preset.
 */
export const PRESET_WEIGHTS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
    default: Object.freeze({ T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 }), // sum=12
    mining: Object.freeze({ T: 4, A: 4, Cp: 2, Ty: 2, Cs: 1, Cm: 1 }), // sum=14 — T+A dominant
    remediation: Object.freeze({ T: 2, A: 2, Cp: 4, Ty: 4, Cs: 1, Cm: 1 }), // sum=14 — Cp+Ty dominant
    water: Object.freeze({ T: 3, A: 4, Cp: 2, Ty: 1, Cs: 3, Cm: 1 }), // sum=14 — A+Cs dominant
});

// ================================================================
// createWeightConfig(weights)
// ================================================================

interface WeightConfig {
    weights: Readonly<Record<string, number>>;
    sum: number;
    normalized: Readonly<Record<string, number>>;
}

/**
 * Validates raw axis weights and builds a frozen WeightConfig object.
 */
export function createWeightConfig(weights: Record<string, number>): Readonly<WeightConfig> {
    if (weights == null || typeof weights !== 'object' || Array.isArray(weights)) {
        throw new Error('[EIS WeightedConfig] weights must be a plain object');
    }

    for (const axis of EIS_AXES) {
        if (!(axis in weights)) {
            throw new Error(
                `[EIS WeightedConfig] Missing axis weight: '${axis}'. All 6 axes required: ${EIS_AXES.join(', ')}`,
            );
        }
        const w = weights[axis];
        if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
            throw new Error(`[EIS WeightedConfig] Invalid weight for '${axis}': ${w}. Must be a finite number > 0.`);
        }
    }

    const sum = EIS_AXES.reduce((acc, a) => acc + weights[a]!, 0);
    const normalized = Object.freeze(Object.fromEntries(EIS_AXES.map((a) => [a, weights[a]! / sum])));

    return Object.freeze({
        weights: Object.freeze({ ...weights }),
        sum,
        normalized,
    });
}

// ================================================================
// getPresetWeights(preset)
// ================================================================

/**
 * Returns the raw weights object for a named preset.
 */
export function getPresetWeights(preset: string): Readonly<Record<string, number>> {
    if (!(preset in PRESET_WEIGHTS)) {
        const valid = Object.keys(PRESET_WEIGHTS).join(', ');
        throw new Error(`[EIS WeightedConfig] Unknown preset: '${preset}'. Valid presets: ${valid}`);
    }
    return PRESET_WEIGHTS[preset]!;
}

// ================================================================
// computeWeightedEIS(axisScores, weightConfig)
// ================================================================

/**
 * Computes EIS using the non-compensatory weighted geometric mean.
 */
export function computeWeightedEIS(
    axisScores: Record<string, number>,
    weightConfig: Readonly<WeightConfig>,
): number {
    if (axisScores == null || typeof axisScores !== 'object') {
        throw new Error('[EIS WeightedConfig] axisScores must be a plain object');
    }
    if (weightConfig == null || !weightConfig.normalized) {
        throw new Error('[EIS WeightedConfig] weightConfig must be the result of createWeightConfig()');
    }

    for (const axis of EIS_AXES) {
        if (!(axis in axisScores)) {
            throw new Error(`[EIS WeightedConfig] Missing axis score: '${axis}'. All 6 axes required.`);
        }
    }

    // Veto check on raw (unclamped) T and A scores
    if (axisScores.T! <= 2 || axisScores.A! <= 2) {
        return 0.0;
    }

    let rawProduct = 1;
    const normalized = weightConfig.normalized as Record<string, number>;
    for (const axis of EIS_AXES) {
        const score = Math.min(5, Math.max(0, axisScores[axis]!));
        const normW = normalized[axis]!;
        rawProduct *= Math.pow(score, normW);
    }

    return parseFloat(rawProduct.toFixed(2));
}

// ================================================================
// compareWeightedScenarios(axisScores, presets)
// ================================================================

interface ScenarioResult {
    preset: string;
    eis: number;
    weights: Record<string, number>;
}

/**
 * Computes EIS under each requested preset and returns a sorted ranking.
 */
export function compareWeightedScenarios(
    axisScores: Record<string, number>,
    presets?: string[],
): ScenarioResult[] {
    const targetPresets = Array.isArray(presets) && presets.length > 0 ? presets : Object.values(WEIGHT_PRESETS);

    const results = targetPresets.map((preset) => {
        const rawWeights = getPresetWeights(preset);
        const weightConfig = createWeightConfig(rawWeights as Record<string, number>);
        const eis = computeWeightedEIS(axisScores, weightConfig);
        return {
            preset,
            eis,
            weights: { ...rawWeights },
        };
    });

    results.sort((a, b) => b.eis - a.eis);
    return results;
}
