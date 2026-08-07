// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — constellation #3 monolito.
// Pure-logic extraction from src/app/js/utils/scene/constellation.ts (3059L,
// fanin=5, score 1560 per MONOLITH_IMPACT_ANALYSIS_2026_05_27 rank #3).
//
// Read from canonical TS per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Primeira extração para utils/scene/constellation.ts —
// nenhum _*Pure helper existia (graph.ts já é pure-by-design).
//
// Spec NOT:
// - NÃO ler THREE.js / scene state (caller resolve mesh/positions)
// - NÃO ler module state (_metricSizingState passado por caller)
// - NÃO emoji
//
// Extracted helpers:
//   - VIOLATION_SCORE_WEIGHTS         (frozen VI=4, VP=2, VR=1, plain=1)
//   - getElementObservations          (data.obs | obs | [])
//   - computeViolationScore           (weighted threshold-level sum)
//   - computeMeanUncertainty          (filtered finite >=0 mean)
//   - buildNodeMetricPayload          (element + degree → 5-field metric)

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

export type ThresholdLevel = 'VI' | 'CMA' | 'VP' | 'VR' | string;

export interface ObservationLike {
    exceedsVI?: boolean;
    exceedsCMA?: boolean;
    exceedsVP?: boolean;
    exceedsVR?: boolean;
    exceeded?: boolean;
    isExceedance?: boolean;
    thresholdLevel?: ThresholdLevel;
    uncertainty?: number;
    uncertaintyPct?: number;
}

export interface ElementLike {
    observations?: ReadonlyArray<ObservationLike>;
    data?: {
        observations?: ReadonlyArray<ObservationLike>;
        eisScore?: number;
    };
    eisScore?: number;
    eis?: { score?: number };
}

export interface NodeMetricPayload {
    obsCount: number;
    violationScore: number;
    eisScore: number;
    degree: number;
    uncertainty: number;
}

/**
 * Frozen weights for violation score by threshold level.
 *   VI / CMA   → 4 (Intervention / site-specific risk)
 *   VP         → 2 (Prevention)
 *   VR         → 1 (Reference)
 *   generic    → 1 (exceeded flag without canonical level)
 *
 * Aligned with docs/IMPLEMENTATION_ROADMAP CONAMA 420 + CETESB.
 */
export const VIOLATION_SCORE_WEIGHTS: Readonly<{
    VI: number;
    CMA: number;
    VP: number;
    VR: number;
    generic: number;
}> = Object.freeze({
    VI: 4,
    CMA: 4,
    VP: 2,
    VR: 1,
    generic: 1,
});

/**
 * Resolve observations from an element-like object.
 * Prefers `element.data.observations` (canonical), fallback `element.observations`.
 */
export function getElementObservations(element: ElementLike | null | undefined): ObservationLike[] {
    if (!element || typeof element !== 'object') return [];
    if (Array.isArray(element.data?.observations)) return [...element.data!.observations!];
    if (Array.isArray(element.observations)) return [...element.observations];
    return [];
}

/**
 * Compute violation score over observations using VIOLATION_SCORE_WEIGHTS.
 * Each observation contributes the highest applicable weight (VI/CMA > VP > VR > generic).
 * Non-array input → 0.
 *
 * Matches _computeViolationScore @ scene/constellation.ts:191.
 */
export function computeViolationScore(observations: ReadonlyArray<ObservationLike> | null | undefined): number {
    if (!Array.isArray(observations)) return 0;
    let sum = 0;
    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        if (obs.exceedsVI || obs.exceedsCMA || obs.thresholdLevel === 'VI' || obs.thresholdLevel === 'CMA') {
            sum += VIOLATION_SCORE_WEIGHTS.VI;
            continue;
        }
        if (obs.exceedsVP || obs.thresholdLevel === 'VP') {
            sum += VIOLATION_SCORE_WEIGHTS.VP;
            continue;
        }
        if (obs.exceedsVR || obs.thresholdLevel === 'VR') {
            sum += VIOLATION_SCORE_WEIGHTS.VR;
            continue;
        }
        if (obs.exceeded === true || obs.isExceedance === true) {
            sum += VIOLATION_SCORE_WEIGHTS.generic;
        }
    }
    return sum;
}

/**
 * Compute mean uncertainty from observations.
 * Reads `obs.uncertainty` (preferred) or `obs.uncertaintyPct` (legacy).
 * Filters non-finite + negative values. Empty → 0.
 */
export function computeMeanUncertainty(observations: ReadonlyArray<ObservationLike> | null | undefined): number {
    if (!Array.isArray(observations)) return 0;
    const valid: number[] = [];
    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const v = Number(obs.uncertainty ?? obs.uncertaintyPct ?? 0);
        if (Number.isFinite(v) && v >= 0) valid.push(v);
    }
    if (valid.length === 0) return 0;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Build the full 5-field metric payload for a constellation node.
 *   { obsCount, violationScore, eisScore, degree, uncertainty }
 *
 * - obsCount        = observations.length
 * - violationScore  = weighted threshold-level sum
 * - eisScore        = element.eisScore | element.eis.score | element.data.eisScore (>=0)
 * - degree          = passed by caller (graph in/out edges count)
 * - uncertainty     = mean of finite >=0 uncertainty values
 *
 * Matches _buildNodeMetricPayload @ scene/constellation.ts:209.
 */
export function buildNodeMetricPayload(
    element: ElementLike | null | undefined,
    degree: number = 0,
): NodeMetricPayload {
    const observations = getElementObservations(element);
    const uncertainty = computeMeanUncertainty(observations);
    const rawEis = Number(element?.eisScore ?? element?.eis?.score ?? element?.data?.eisScore ?? 0);
    const eisScore = toFiniteNumber(rawEis, 0, { min: 0 });
    const safeDegree = toFiniteNumber(degree, 0, { min: 0 });
    return {
        obsCount: observations.length,
        violationScore: computeViolationScore(observations),
        eisScore,
        degree: safeDegree,
        uncertainty,
    };
}
