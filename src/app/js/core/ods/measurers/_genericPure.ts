// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Generic ODS sub-indicator measurer — pure logic (F2 batch).
 *
 * Single-template measurer that the social/economic ODS (1, 2, 4, 5, 7, 9,
 * 10, 16) all share: each takes an array of sub-indicator inputs
 * (`{ key, numerator, denominator?, weight?, direction? }`) and produces a
 * dual-report VM (impact + risk + tier + provenance), reusing the
 * `_normalizePure` non-compensatory aggregator.
 *
 * Why a single template:
 *   - 8 of the 9 remaining ODS resolve to the same shape: "fraction of A in
 *     scope B, optionally inverted". Writing 8 quasi-identical files
 *     duplicates logic and violates SPEC §2 N6.
 *   - Per-ODS specifics live in tiny adapter modules (`_ods1Pure`, ...) that
 *     wire the right sub-indicators; the math stays here.
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_RISK §2):
 *   - N1 no fabricated data: missing numerator OR missing denominator → that
 *     sub-indicator returns null. When every sub-indicator is null the result
 *     is tier=T0, impact/risk=null.
 *   - N4 non-compensatory: uses `nonCompensatoryAggregate` from F3.
 *   - N5 reuse only: no imports outside `_normalizePure` + `_registryPure`.
 *
 * Tests live in `tests/ods-generic-pure.test.mjs`.
 */

import {
    linearNormalize,
    invertedLinearNormalize,
    nonCompensatoryAggregate,
} from '../_normalizePure.js';
import type { OdsTier } from '../_registryPure.js';

export interface GenericSubIndicator {
    /** Stable identifier used as provenance key (e.g. 'genderRatio'). */
    readonly key: string;
    /** Raw numerator from the user model (e.g. number of female employees). */
    readonly numerator: number | null | undefined;
    /** Raw denominator (e.g. total employees). Optional when value is already a ratio. */
    readonly denominator?: number | null;
    /** Optional cap for the linear normalisation. Default 1 (numerator/denominator already in [0,1]). */
    readonly cap?: number;
    /** Sub-indicator weight in the aggregate. Default 1 (uniform). */
    readonly weight?: number;
    /**
     * `higher` (default) — bigger value = better outcome → linear normalise.
     * `lower` — bigger value = worse outcome → invertedLinear normalise.
     */
    readonly direction?: 'higher' | 'lower';
}

export interface GenericOdsResult {
    readonly impact: number | null;
    readonly risk: number | null;
    readonly tier: OdsTier;
    readonly subScoreCount: number;
    readonly inputCount: number;
    readonly provenance: ReadonlyArray<Readonly<{
        readonly key: string;
        readonly score: number | null;
        readonly direction: 'higher' | 'lower';
    }>>;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function readSubIndicator(input: GenericSubIndicator): number | null {
    const n = input?.numerator;
    if (n === null || n === undefined || !isFiniteNumber(n)) return null;
    const cap = isFiniteNumber(input.cap) && (input.cap as number) > 0 ? (input.cap as number) : 1;
    if (input.denominator === undefined) {
        // Caller passed a ready-made [0, 1] value.
        if (n < 0 || n > cap) return null;
        const ratio = n / cap;
        return input.direction === 'lower' ? clamp01(1 - ratio) : clamp01(ratio);
    }
    const d = input.denominator;
    if (!isFiniteNumber(d) || d <= 0) return null;
    const direction = input.direction === 'lower' ? 'lower' : 'higher';
    const norm =
        direction === 'lower'
            ? invertedLinearNormalize(n / d, 0, cap)
            : linearNormalize(n / d, 0, cap);
    return norm.value;
}

/**
 * Compute impact, risk, tier from a list of generic sub-indicators.
 *
 * Tier rule (mirror of ods17):
 *   T1 if every sub-indicator produced a value AND inputCount >= 3 (broad)
 *   T2 if some produced values but coverage is < full
 *   T3 if all inputs returned null but at least one input was given
 *   T0 if no inputs at all
 */
export function measureGenericOds(input: {
    subIndicators: ReadonlyArray<GenericSubIndicator>;
}): GenericOdsResult {
    const subIndicators = Array.isArray(input?.subIndicators) ? input.subIndicators : [];
    if (subIndicators.length === 0) {
        return Object.freeze({
            impact: null,
            risk: null,
            tier: 'T0' as OdsTier,
            subScoreCount: 0,
            inputCount: 0,
            provenance: Object.freeze([]),
        });
    }
    const scores: number[] = [];
    const weights: number[] = [];
    const provenance: Array<{
        key: string;
        score: number | null;
        direction: 'higher' | 'lower';
    }> = [];
    for (const sub of subIndicators) {
        if (!sub || typeof sub.key !== 'string') continue;
        const score = readSubIndicator(sub);
        const dir = sub.direction === 'lower' ? 'lower' : 'higher';
        provenance.push({ key: sub.key, score, direction: dir });
        if (score !== null) {
            scores.push(score);
            const w = isFiniteNumber(sub.weight) && (sub.weight as number) > 0 ? (sub.weight as number) : 1;
            weights.push(w);
        }
    }

    let tier: OdsTier;
    if (scores.length === 0) tier = 'T3';
    else if (scores.length === subIndicators.length && subIndicators.length >= 3) tier = 'T1';
    else tier = 'T2';

    const impact = scores.length > 0 ? nonCompensatoryAggregate(scores, weights) : null;
    const risk = impact === null ? null : clamp01(1 - (impact as number));

    return Object.freeze({
        impact,
        risk,
        tier,
        subScoreCount: scores.length,
        inputCount: subIndicators.length,
        provenance: Object.freeze(provenance.map((p) => Object.freeze(p))),
    });
}
