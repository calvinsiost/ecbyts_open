// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS normalization — pure logic (F3 of SPEC_ODS_IMPACT_RISK).
 *
 * Maps raw indicator values to the [0, 1] scale that the ODS impact/risk
 * profile expects. Every helper here documents its saturation rule so the
 * UI/audit layer can render the formula transparently (SPEC §4 auditability).
 *
 * Anti-requirements honoured:
 *   - N1 (no fabricated data): all functions return `null` when the input is
 *     not finite or out of range — they DO NOT silently coerce to 0/1.
 *   - N4 (non-compensatory): no helper applies negative weights; clamping is
 *     symmetric so callers can compose without sign tricks.
 *   - N6 (no duplication): when a ratio-style normaliser is needed elsewhere
 *     (e.g. severity), this module re-exports compatible building blocks
 *     instead of inventing variants.
 *
 * Tests live in `tests/ods-normalize-pure.test.mjs`.
 */

export type NormalizationKind =
    | 'linear'      // (x − a) / (b − a), clamped to [0, 1]
    | 'inverted'    // 1 − linear (lower x = better outcome)
    | 'logistic'    // 1 / (1 + e^(−k·(x − x0))), bounded, smooth
    | 'ratioCap'    // min(x / threshold, cap) / cap
    | 'piecewise';  // user-declared piecewise function

export interface NormalizationProvenance {
    readonly kind: NormalizationKind;
    /** Plain-text formula description for audit/UI (`§Auditabilidade`). */
    readonly formula: string;
    /** Reference parameters in their original units. */
    readonly params: Readonly<Record<string, number>>;
}

export interface NormalizationResult {
    /** Normalised value in [0, 1] or `null` when input is invalid. */
    readonly value: number | null;
    readonly provenance: NormalizationProvenance;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Linear normalisation between min/max.
 *
 *   y = clamp01((x − a) / (b − a))
 *
 * Returns null when:
 *   - x is not finite
 *   - a >= b (degenerate range)
 *   - a or b are not finite
 */
export function linearNormalize(x: number, a: number, b: number): NormalizationResult {
    const provenance: NormalizationProvenance = {
        kind: 'linear',
        formula: 'y = clamp01((x − a) / (b − a))',
        params: Object.freeze({ a, b }),
    };
    if (!isFiniteNumber(x) || !isFiniteNumber(a) || !isFiniteNumber(b)) {
        return { value: null, provenance };
    }
    if (a >= b) {
        return { value: null, provenance };
    }
    return { value: clamp01((x - a) / (b - a)), provenance };
}

/**
 * Inverted linear: 1 − linearNormalize(x, a, b). For indicators where LOWER
 * raw values mean BETTER outcome (eg. concentration relative to threshold).
 */
export function invertedLinearNormalize(
    x: number,
    a: number,
    b: number,
): NormalizationResult {
    const direct = linearNormalize(x, a, b);
    const provenance: NormalizationProvenance = {
        kind: 'inverted',
        formula: 'y = 1 − clamp01((x − a) / (b − a))',
        params: Object.freeze({ a, b }),
    };
    if (direct.value === null) return { value: null, provenance };
    return { value: clamp01(1 - direct.value), provenance };
}

/**
 * Logistic / sigmoid normalisation.
 *
 *   y = 1 / (1 + e^(−k · (x − x0)))
 *
 * Smooth, asymptotic to (0, 1). Useful when there's no obvious "max" bound
 * — eg. integrating HQ or odds. Returns null on non-finite inputs OR
 * non-positive k (degenerate slope).
 */
export function logisticNormalize(
    x: number,
    x0: number,
    k: number,
): NormalizationResult {
    const provenance: NormalizationProvenance = {
        kind: 'logistic',
        formula: 'y = 1 / (1 + exp(−k · (x − x0)))',
        params: Object.freeze({ x0, k }),
    };
    if (!isFiniteNumber(x) || !isFiniteNumber(x0) || !isFiniteNumber(k)) {
        return { value: null, provenance };
    }
    if (k <= 0) return { value: null, provenance };
    // Use the numerically stable form to avoid overflow with large exponents.
    const z = -k * (x - x0);
    const y = z > 30 ? 0 : z < -30 ? 1 : 1 / (1 + Math.exp(z));
    return { value: clamp01(y), provenance };
}

/**
 * Ratio with saturation cap.
 *
 *   y = min(x / threshold, cap) / cap          (cap > 0)
 *
 * Same shape as `core/severity` normalizeRisk('ratio'). Returns null when
 * threshold <= 0 or any input is not finite.
 */
export function ratioCapNormalize(
    x: number,
    threshold: number,
    cap = 10,
): NormalizationResult {
    const provenance: NormalizationProvenance = {
        kind: 'ratioCap',
        formula: 'y = min(x / threshold, cap) / cap',
        params: Object.freeze({ threshold, cap }),
    };
    if (!isFiniteNumber(x) || !isFiniteNumber(threshold) || !isFiniteNumber(cap)) {
        return { value: null, provenance };
    }
    if (threshold <= 0 || cap <= 0 || x < 0) return { value: null, provenance };
    const ratio = x / threshold;
    return { value: clamp01(Math.min(ratio, cap) / cap), provenance };
}

/**
 * Piecewise: caller provides `breakpoints` as ascending [(x, y), ...] pairs
 * (e.g. CONAMA water classes mapped to severity bands). Returns linear
 * interpolation between consecutive breakpoints; clamps to endpoints.
 *
 * Validates ordering + finite values; returns null on malformed input.
 */
export interface Breakpoint {
    readonly x: number;
    readonly y: number;
}

export function piecewiseNormalize(
    x: number,
    breakpoints: ReadonlyArray<Breakpoint>,
): NormalizationResult {
    const provenance: NormalizationProvenance = {
        kind: 'piecewise',
        formula: 'y = linear interpolation between ascending {(x_i, y_i)} pairs',
        params: Object.freeze({ count: breakpoints?.length ?? 0 }),
    };
    if (!Array.isArray(breakpoints) || breakpoints.length < 2) {
        return { value: null, provenance };
    }
    for (let i = 0; i < breakpoints.length; i++) {
        const b = breakpoints[i];
        if (!b || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
            return { value: null, provenance };
        }
        if (i > 0 && breakpoints[i].x <= breakpoints[i - 1].x) {
            return { value: null, provenance };
        }
    }
    if (!isFiniteNumber(x)) return { value: null, provenance };

    const first = breakpoints[0];
    const last = breakpoints[breakpoints.length - 1];
    if (x <= first.x) return { value: clamp01(first.y), provenance };
    if (x >= last.x) return { value: clamp01(last.y), provenance };

    for (let i = 1; i < breakpoints.length; i++) {
        const b1 = breakpoints[i - 1];
        const b2 = breakpoints[i];
        if (x <= b2.x) {
            const t = (x - b1.x) / (b2.x - b1.x);
            return { value: clamp01(b1.y + t * (b2.y - b1.y)), provenance };
        }
    }
    return { value: null, provenance };
}

/**
 * Non-compensatory aggregator (anti-N4): combines several normalised
 * sub-indicators into a single [0,1] score using the geometric mean of
 * (1 - subscore_i) ^ w_i, then inverts. Equivalent to the EIS aggregation.
 *
 * Returns null when:
 *   - subscores empty
 *   - any subscore is not in [0, 1]
 *   - weights array length mismatch
 *   - weights sum to 0
 */
export function nonCompensatoryAggregate(
    subscores: ReadonlyArray<number>,
    weights?: ReadonlyArray<number>,
): number | null {
    if (!Array.isArray(subscores) || subscores.length === 0) return null;
    for (const s of subscores) {
        if (!isFiniteNumber(s) || s < 0 || s > 1) return null;
    }
    const w = weights && weights.length === subscores.length
        ? weights
        : subscores.map(() => 1);
    let wsum = 0;
    for (const wi of w) {
        if (!isFiniteNumber(wi) || wi < 0) return null;
        wsum += wi;
    }
    if (wsum === 0) return null;
    // y = 1 - product((1 - s_i) ^ (w_i / wsum))
    let logSum = 0;
    for (let i = 0; i < subscores.length; i++) {
        const s = subscores[i] as number;
        const wi = (w[i] as number) / wsum;
        const oneMinusS = Math.max(1e-9, 1 - s);
        logSum += wi * Math.log(oneMinusS);
    }
    const product = Math.exp(logSum);
    return clamp01(1 - product);
}
