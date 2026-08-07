// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS impact engine — pure logic (RF-2 of SPEC_ODS_IMPACT_PARAMS).
 *
 * `computeOdsImpact(model, indicators)` aggregates raw model readings into a
 * per-ODS impact score with an EXPLICIT evidence tier, reusing the T0..T3
 * ordering already curated in `_registryPure.ts` (`isClaimedTierHonest`).
 *
 * This module does NOT recompute or reweight EIS/ECBT Score (kappa, CFG-24)
 * — the ODS impact profile is a parallel read-only layer over the same
 * underlying data (SPEC_ODS_IMPACT_PARAMS §3 RF-2, N3).
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_PARAMS §4/§5):
 *   - N1/N2: missing data for an ODS → `tier:'absent'`, `score:null`. NEVER
 *     a green/neutral 0. A `claimed` tier is surfaced as-is, never promoted.
 *   - N3: no import of EIS/ECBT aggregation modules; pure read-only layer.
 *   - N4: thresholds/direction come only from the curated indicator registry
 *     (RF-1 `data/ods-indicators.json` shape) — no user-supplied threshold.
 *   - Honesty of tier: the reported tier is the MINIMUM (least precise) of
 *     every indicator's provenance tier that contributed a value for that
 *     ODS — a single `claimed` reading vetoes a `measured` tier label for
 *     the whole ODS result (no averaging-away of weak evidence).
 *
 * Tests live in `tests/ods-impact-pure.test.mjs`.
 */

import { invertedLinearNormalize, linearNormalize, nonCompensatoryAggregate } from './_normalizePure.js';

/** Evidence tier as exposed by this engine (distinct from the registry's T0..T3 slugs). */
export type OdsImpactTier = 'measured' | 'estimated' | 'claimed' | 'absent';

/** Direction of a raw indicator value, as curated in the RF-1 registry. */
export type OdsIndicatorDirection = 'higher_is_better' | 'lower_is_better';

/** Provenance tier of a single raw reading, as attached by the caller/model. */
export type OdsIndicatorProvenanceTier = 'measured' | 'estimated' | 'claimed';

/**
 * Curated indicator definition — shape matches the `domainRelevant:true`
 * entries of `data/ods-indicators.json` (RF-1). Only the fields RF-2 needs
 * to compute a signal are required here.
 */
export interface OdsImpactIndicatorDef {
    readonly code: string;
    readonly goal: number;
    readonly direction: OdsIndicatorDirection;
    readonly thresholds: {
        readonly improve: number;
        readonly worsen: number;
    };
}

/**
 * Raw reading for one indicator code, supplied by the caller (`model`).
 * `tier` is the REAL provenance of this specific value — measured from a
 * campaign, estimated from a simulation, or claimed/declared without lastro.
 * Absence of an entry (or of `value`) means the indicator is not available;
 * it must NEVER be synthesised as 0.
 */
export interface OdsImpactModelReading {
    readonly value: number | null | undefined;
    readonly tier: OdsIndicatorProvenanceTier;
}

/** `model` = raw readings keyed by official indicator code (e.g. '6.3.2'). */
export type OdsImpactModel = Readonly<Record<string, OdsImpactModelReading | undefined>>;

export interface OdsImpactIndicatorSignal {
    readonly code: string;
    readonly value: number;
    readonly unit: 'index_normalized';
    readonly direction: OdsIndicatorDirection;
    /** Normalised signal in [0, 1] (1 = best outcome), per RF-1 thresholds. */
    readonly signal: number;
}

export interface OdsImpactResult {
    readonly odsId: number;
    readonly score: number | null;
    readonly tier: OdsImpactTier;
    readonly indicators: ReadonlyArray<OdsImpactIndicatorSignal>;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Order used to pick the WEAKEST (least precise) tier among contributing
 * indicators — mirrors `isClaimedTierHonest`'s T0 < T3 < T2 < T1 ordering,
 * translated to this engine's tier vocabulary (T1→measured, T2→estimated,
 * T3→claimed, T0→absent).
 */
const TIER_ORDER: Readonly<Record<OdsImpactTier, number>> = Object.freeze({
    absent: 0,
    claimed: 1,
    estimated: 2,
    measured: 3,
});

function weakestTier(a: OdsImpactTier, b: OdsImpactTier): OdsImpactTier {
    return TIER_ORDER[a] <= TIER_ORDER[b] ? a : b;
}

/**
 * Normalise one raw reading into a [0, 1] signal using the curated
 * threshold band. `improve` = value at/above (or at/below, when
 * `lower_is_better`) which the outcome is considered fully favourable;
 * `worsen` = the opposite end. Returns `null` when the reading, direction,
 * or thresholds are malformed (never fabricates a signal).
 */
function normalizeIndicator(
    value: number,
    direction: OdsIndicatorDirection,
    thresholds: { readonly improve: number; readonly worsen: number },
): number | null {
    if (!isFiniteNumber(value)) return null;
    const { improve, worsen } = thresholds || ({} as { improve: number; worsen: number });
    if (!isFiniteNumber(improve) || !isFiniteNumber(worsen)) return null;

    if (direction === 'higher_is_better') {
        // worsen (low anchor) -> improve (high anchor), higher raw = better.
        if (worsen >= improve) return null;
        return linearNormalize(value, worsen, improve).value;
    }
    if (direction === 'lower_is_better') {
        // improve (low anchor) -> worsen (high anchor), lower raw = better.
        if (improve >= worsen) return null;
        return invertedLinearNormalize(value, improve, worsen).value;
    }
    return null;
}

/**
 * Compute per-ODS impact from raw model readings + the curated indicator
 * registry. Deterministic, no I/O, no DOM.
 *
 * - Indicators are grouped by `goal` (the ODS id).
 * - An ODS with no curated indicators supplied, OR none of its indicators
 *   present/usable in `model`, resolves to `{ score: null, tier: 'absent' }`.
 * - Otherwise the ODS tier is the WEAKEST provenance tier among the
 *   indicators that contributed a signal (never averaged away) and the
 *   score is the non-compensatory aggregate of their normalised signals.
 * - A `claimed` tier is reported as-is (never promoted to measured/estimated)
 *   per `isClaimedTierHonest`'s honesty gate — the score field is still
 *   populated (RF-4 is responsible for suppressing the numeric highlight in
 *   the UI for claimed/absent tiers; this engine only reports facts).
 *
 * Result is sorted by `odsId` ascending and deep-frozen.
 */
export function computeOdsImpact(
    model: OdsImpactModel | null | undefined,
    indicators: ReadonlyArray<OdsImpactIndicatorDef> | null | undefined,
): ReadonlyArray<OdsImpactResult> {
    const defs = Array.isArray(indicators) ? indicators : [];
    const readings = model && typeof model === 'object' ? model : {};

    const byGoal = new Map<number, OdsImpactIndicatorDef[]>();
    for (const def of defs) {
        if (!def || typeof def.code !== 'string' || !isFiniteNumber(def.goal)) continue;
        const goal = Math.trunc(def.goal);
        if (goal < 1 || goal > 17) continue;
        const list = byGoal.get(goal);
        if (list) list.push(def);
        else byGoal.set(goal, [def]);
    }

    const results: OdsImpactResult[] = [];
    const goalIds = Array.from(byGoal.keys()).sort((a, b) => a - b);

    for (const odsId of goalIds) {
        const defsForGoal = byGoal.get(odsId) as OdsImpactIndicatorDef[];
        const signals: OdsImpactIndicatorSignal[] = [];
        let tier: OdsImpactTier = 'absent';
        let hasTier = false;

        for (const def of defsForGoal) {
            const reading = readings[def.code];
            if (!reading || reading.value === null || reading.value === undefined) continue;
            if (!isFiniteNumber(reading.value)) continue;

            const signal = normalizeIndicator(reading.value, def.direction, def.thresholds);
            if (signal === null) continue;

            signals.push(
                Object.freeze({
                    code: def.code,
                    value: reading.value,
                    unit: 'index_normalized' as const,
                    direction: def.direction,
                    signal,
                }),
            );

            const readingTier: OdsImpactTier =
                reading.tier === 'measured' || reading.tier === 'estimated' || reading.tier === 'claimed'
                    ? reading.tier
                    : 'claimed';
            tier = hasTier ? weakestTier(tier, readingTier) : readingTier;
            hasTier = true;
        }

        const score =
            signals.length > 0
                ? nonCompensatoryAggregate(signals.map((s) => s.signal))
                : null;

        results.push(
            Object.freeze({
                odsId,
                score: signals.length > 0 ? score : null,
                tier: signals.length > 0 ? tier : 'absent',
                indicators: Object.freeze(signals),
            }),
        );
    }

    return Object.freeze(results);
}
