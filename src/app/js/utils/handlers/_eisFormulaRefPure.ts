// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — eis.ts #8 monolito (2971L, score 1250).
// Pure-logic extraction from src/app/js/utils/handlers/eis.ts (canonical .ts).
//
// Read from canonical TS source per memory/feedback_read_ts_canonical_not_js_derived.md.
// Complementa _eisTooltipsPure.ts existente (2 exports cobrem tooltip building).
//
// Hand-authored R1-safe. Separado para evitar contenção multi-LLM.
//
// Spec NOT:
// - NÃO ler CONFIG.* / window.* / módulos externos (caller injeta arrays)
// - NÃO ler DOM (caller usa retornado color string)
// - NÃO emoji
//
// Extracted helpers:
//   - CANONICAL_AXIS_FORMULA_PREFIX     ('eis.axis.')
//   - LEGACY_AXIS_FORMULA_PREFIX        ('eis-default:')
//   - EIS_SCORE_GRADIENT_STOPS          (5 stops frozen)
//   - EIS_SCORE_FALLBACK_COLOR          (red rgb for invalid input)
//   - canonicalFormulaRefForAxis(axisId)
//   - normalizeAxisFormulaRef(axisId, rawRef, canonicalAxes)
//   - isCanonicalAxisFormulaRef(ref, axisId)
//   - scoreToGradientColor(score)
//   - clampEisScore(score)

export interface GradientStop {
    score: number;
    rgb: readonly [number, number, number];
}

/** Canonical prefix for EIS axis formula refs (e.g., "eis.axis.T.v1"). */
export const CANONICAL_AXIS_FORMULA_PREFIX = 'eis.axis.';

/** Canonical suffix version for axis formula refs. */
export const CANONICAL_AXIS_FORMULA_VERSION = '.v1';

/** Legacy alias prefix (backward compat). */
export const LEGACY_AXIS_FORMULA_PREFIX = 'eis-default:';

/** Fallback CSS color for invalid/NaN scores (red). */
export const EIS_SCORE_FALLBACK_COLOR = 'rgb(239,68,68)';

/**
 * Frozen 5-stop gradient for EIS score (0.0 to 5.0) → CSS color.
 *   0.0  → red    [239, 68, 68]
 *   1.5  → orange [249, 115, 22]
 *   2.5  → yellow [234, 179, 8]
 *   3.5  → green  [34, 197, 94]
 *   5.0  → teal   [5, 150, 105]
 *
 * Different from getVerdictColor() which returns 3 categorical colors.
 */
export const EIS_SCORE_GRADIENT_STOPS: ReadonlyArray<GradientStop> = Object.freeze([
    { score: 0.0, rgb: [239, 68, 68] },
    { score: 1.5, rgb: [249, 115, 22] },
    { score: 2.5, rgb: [234, 179, 8] },
    { score: 3.5, rgb: [34, 197, 94] },
    { score: 5.0, rgb: [5, 150, 105] },
] as const);

/**
 * Build canonical formula ref for a given axis id.
 *   axisId='T' → 'eis.axis.T.v1'
 */
export function canonicalFormulaRefForAxis(axisId: string): string {
    return `${CANONICAL_AXIS_FORMULA_PREFIX}${axisId}${CANONICAL_AXIS_FORMULA_VERSION}`;
}

/**
 * Check whether a ref matches the canonical pattern for a specific axis.
 *   isCanonicalAxisFormulaRef('eis.axis.T.v1', 'T') → true
 *   isCanonicalAxisFormulaRef('eis.axis.A.v1', 'T') → false
 */
export function isCanonicalAxisFormulaRef(ref: string | null | undefined, axisId: string): boolean {
    if (typeof ref !== 'string' || !ref) return false;
    return ref === canonicalFormulaRefForAxis(axisId);
}

/**
 * Normalize an axis formula ref:
 *   - Trim whitespace
 *   - Empty + canonical axis → canonical default
 *   - Empty + non-canonical axis → ''
 *   - Legacy alias 'eis-default:T' → 'eis.axis.T.v1'
 *   - Otherwise → unchanged
 *
 * Caller passes `canonicalAxes` (e.g., EIS_AXES ['T','A','Cp','Ty','Cs','Cm']).
 */
export function normalizeAxisFormulaRef(
    axisId: string,
    rawRef: unknown,
    canonicalAxes: ReadonlyArray<string>,
): string {
    const ref = typeof rawRef === 'string' ? rawRef.trim() : '';
    const isCanonical = Array.isArray(canonicalAxes) && canonicalAxes.includes(axisId);
    if (!ref) return isCanonical ? canonicalFormulaRefForAxis(axisId) : '';
    if (ref === `${LEGACY_AXIS_FORMULA_PREFIX}${axisId}`) {
        return canonicalFormulaRefForAxis(axisId);
    }
    return ref;
}

/**
 * Clamp an EIS score to [0, 5]. Non-finite → 0.
 */
export function clampEisScore(score: unknown): number {
    if (!Number.isFinite(score)) return 0;
    const n = score as number;
    if (n < 0) return 0;
    if (n > 5) return 5;
    return n;
}

/**
 * Map an EIS score (0-5) to a CSS rgb() string via 5-stop linear gradient.
 * Non-finite input → EIS_SCORE_FALLBACK_COLOR (red).
 *
 * Used for ring chart segments, scale strip marker, badge backgrounds.
 */
export function scoreToGradientColor(score: unknown): string {
    if (!Number.isFinite(score)) return EIS_SCORE_FALLBACK_COLOR;
    const s = clampEisScore(score);
    const stops = EIS_SCORE_GRADIENT_STOPS;
    let lo: GradientStop = stops[0]!;
    let hi: GradientStop = stops[stops.length - 1]!;
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i]!;
        const b = stops[i + 1]!;
        if (s >= a.score && s <= b.score) {
            lo = a;
            hi = b;
            break;
        }
    }
    const range = hi.score - lo.score;
    const t = range === 0 ? 0 : (s - lo.score) / range;
    const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t);
    const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t);
    const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t);
    return `rgb(${r},${g},${b})`;
}
