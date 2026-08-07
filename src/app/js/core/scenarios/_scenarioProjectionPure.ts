// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenario TIME-SERIES projection — pure-logic (SCENARIOS-IMPACT-001 §5.2).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 *
 * Generalises the §5.1 "mother-formula" from a single A(t) point into the
 * §5.2 TEMPORAL projection — the behaviour the author's TG II showed in its
 * Figures 17/19/20 (impacts projected year-by-year to a horizon), now across
 * the 4 modern dimensions (CAPEX, OPEX, ECBT, ODS).
 *
 * ─── Fundamented method (§5.2), NOT an arbitrary "d+30" offset ───
 *
 *   Activity driver projected in time (§5.2 abstraction):
 *       A(t) = A0 × (1 + g)^(t − baseYear)
 *   CFG-10 generalises g from a single slope to a PER-PHASE schedule (e.g. 3%/yr
 *   up to 2030, 1%/yr afterwards), so A(t) = A0 × Π(1 + g(y)); with one phase it
 *   collapses back to the identical `(1+g)^k` — see `_scenarioGrowthPure.ts`.
 *   CFG-12 opens the SHAPE of that curve: geometric (default, the compounded
 *   product above), linear (§5.2 d "taxa simples linear") or logistic/S (growth
 *   saturating at a declared capacity) — see `_scenarioDemandCurvePure.ts`. The
 *   geometric path delegates to the very same function as before, so the default
 *   series is bit-for-bit what it was pre-CFG-12.
 *
 *   For each year t ∈ [baseYear, horizon] (k = t − baseYear):
 *     • ENVIRONMENTAL / ODS — projected with A(t), **NO discounting**. GWP-100
 *       (IPCC) integrates 100 years without temporal discount: physical impact
 *       (m³ water, t tailings, kWh, tCO₂e) is not "discounted". (§5.2 b)
 *     • ECONOMIC (CAPEX / OPEX) — brought to NET PRESENT VALUE:
 *           PV_k = value_k / (1 + r)^k                       (§5.2 c)
 *       The discount rate r is a CONFIGURABLE parameter (default 0.08, the
 *       mining BR Tier-2 reference), NEVER a hardcoded immutable constant.
 *       Optional DECLINING rate for the long-term ambient axis (UK Green Book /
 *       CEPAL — uncertainty grows in the future):
 *           r_k = r / (1 + c·k)
 *       CFG-13 turned `c` into a scenario parameter too (default 0.02, the value
 *       that used to be a literal inside the discount factor) — see
 *       `_scenarioDiscountDeclinePure.ts`.
 *
 *   Horizon by institutional milestones (§5.2 a), not a fixed offset:
 *       2030 (Agenda 2030 / TG II horizon) · 2050 (net-zero) · 2100 (SSP long).
 *   CFG-09: those milestones are CURATED SUGGESTIONS, no longer a closed type.
 *   The horizon year is now ANY year inside the validated range (see
 *   `_scenarioHorizonPure.ts`) — 2045 is expressible — and it is resolved by the
 *   SAME resolver the ΔNPV verdict (S1) uses, so "the horizon" is one scenario
 *   parameter instead of one hardcoded constant per consumer.
 *
 * REUSE (anti-N4): this module reimplements NO engine. It calls the existing
 * `computeRealScenarioMetrics` once per year, varying ONLY the A(t) override,
 * then aggregates the per-year results (discounting the economic dimension).
 *
 * Anti-N3 (no fabricated data): when a dimension has no reading in a given year
 * the engine returns null for it; the series carries `null` (never a forged 0),
 * and a null on either side of a delta keeps the delta `null`.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

import {
    computeRealScenarioMetrics,
    type BaseProcess,
    type ProcessMutation,
    type RealScenarioMetrics,
} from './_scenarioImpactEnginePure.js';
import {
    horizonYearsToMilestone,
    resolveHorizon,
    type ResolvedHorizon,
} from './_scenarioHorizonPure.js';
import {
    resolveGrowthSchedule,
    type GrowthPhase,
    type ResolvedGrowthSchedule,
} from './_scenarioGrowthPure.js';
import {
    demandFactorAt,
    resolveDemandCurve,
    type DemandCurveKind,
    type DemandCurveSpec,
    type ResolvedDemandCurve,
} from './_scenarioDemandCurvePure.js';
import {
    declineDiscountFactor,
    resolveDiscountDecline,
    type ResolvedDiscountDecline,
} from './_scenarioDiscountDeclinePure.js';

// ───────────────────────────── Types ─────────────────────────────

/**
 * Horizon YEAR of the series (§5.2 a). CFG-09 opened this: it used to be the
 * closed union `2030 | 2050 | 2100`, which made 2045 inexpressible. It is now
 * any year inside the validated range — the institutional milestones live on as
 * curated suggestions in `CURATED_HORIZON_MILESTONES`, not as the type.
 */
export type TimeHorizon = number;

/** Parameters that drive the temporal projection (§5.2). */
export interface ProjectionParams {
    /** Base year of the series (anchor t0; default = current year is caller's job). */
    readonly baseYear: number;
    /**
     * Horizon YEAR (absolute). Any year in the validated range (CFG-09);
     * defaults to the 2030 milestone (§5.2 a) when omitted.
     */
    readonly horizon?: TimeHorizon;
    /**
     * Horizon as a DURATION in years after the base year (CFG-09) — the same
     * parameter written relatively. `horizon` wins when both are given.
     */
    readonly horizonYears?: number;
    /** Activity growth g of the driver A(t) per year (§5.2 abstraction). */
    readonly activityGrowth?: number;
    /**
     * Growth g PER PHASE (CFG-10) — e.g. 3%/yr up to 2030, 1%/yr afterwards.
     * Wins over the scalar `activityGrowth`; each phase's `fromYear` is the year
     * from which its rate governs the annual steps. Absolute years, so it needs
     * the base year as anchor.
     */
    readonly growthSchedule?: ReadonlyArray<GrowthPhase> | undefined;
    /**
     * SHAPE of the demand curve of A(t) (CFG-12): `'geometric'` (default, the
     * compounded growth of today), `'linear'` (§5.2 d), or `'logistic'` — the
     * latter needs its capacity, `{kind:'logistic', saturationMultiple: 2}`.
     * An unusable request falls back to geometric with `curve.fallback` visible.
     */
    readonly demandCurve?: DemandCurveSpec | DemandCurveKind | string | undefined;
    /** Economic discount rate r (§5.2 c). Default 0.08 (mining BR Tier-2). */
    readonly discountRate?: number;
    /** When true, the economic rate declines: r_k = r / (1 + c·k) (§5.2 c). */
    readonly discountDeclining?: boolean;
    /**
     * Decline coefficient `c` of `r/(1+c·k)` (CFG-13). Default 0.02 — the value
     * that used to be hardcoded inside the discount factor. Only applies with
     * `discountDeclining`; out-of-range requests are clamped, visibly.
     */
    readonly discountDeclineCoefficient?: number | undefined;
}

/** One year of the projected activity driver A(t). */
export interface ActivityPoint {
    readonly year: number;
    readonly activity: number;
}

/** One year of a single scalar dimension (nominal, pre-discount). */
export interface YearValue {
    readonly year: number;
    /** Value for the year; null = semDado in that year (anti-N3, never 0). */
    readonly value: number | null;
}

/** One year of the affected-ODS list (physical, NOT discounted). */
export interface YearOds {
    readonly year: number;
    readonly ods: RealScenarioMetrics['ods'];
}

/** The full projected time-series for ONE scenario (§5.2). */
export interface ScenarioTimeSeries {
    /** The horizon actually applied (CFG-09) — year AND duration, auditable. */
    readonly horizon: ResolvedHorizon;
    /** The growth schedule actually applied (CFG-10) — one phase = constant g. */
    readonly growth: ResolvedGrowthSchedule;
    /** The demand curve actually applied (CFG-12) — geometric = today's series. */
    readonly curve: ResolvedDemandCurve;
    /** The rate decline actually applied (CFG-13) — inactive = flat rate. */
    readonly decline: ResolvedDiscountDecline;
    /**
     * The economic discount rate r actually applied (§5.2 c) — the last resolved
     * parameter that was NOT auditable from the result. Exposing it also lets a
     * downstream re-aggregation (e.g. the CFG-15 currency conversion of the NPV,
     * where a per-year exchange rate must be applied BEFORE discounting) reuse
     * the very rate this series used instead of being told one that may disagree.
     */
    readonly discountRate: number;
    /** The years covered, baseYear..horizon inclusive. */
    readonly years: readonly number[];
    /** Projected activity driver A(t) per year. */
    readonly activitySeries: readonly ActivityPoint[];
    /** CAPEX brought to Net Present Value over the horizon (null = semDado). */
    readonly capexNPV: number | null;
    /** OPEX brought to Net Present Value over the horizon (null = semDado). */
    readonly opexNPV: number | null;
    /** Nominal (pre-discount) CAPEX per year. */
    readonly capexSeries: readonly YearValue[];
    /** Nominal (pre-discount) OPEX per year. */
    readonly opexSeries: readonly YearValue[];
    /** ECBT Score V_net per year (monetary, not discounted at series level). */
    readonly ecbtSeries: readonly YearValue[];
    /** Affected ODS per year (physical, NOT discounted — §5.2 b). */
    readonly odsSeries: readonly YearOds[];
    /**
     * Environmental physical-flow proxy per year, summed over the affected ODS
     * (NOT discounted). Surfaces the §5.2 (b) "physical impact, no discount".
     */
    readonly environmentalSeries: readonly YearValue[];
}

/** Per-year, per-dimension delta (alt − base) of a paired projection (N3). */
export interface YearDelta {
    readonly year: number;
    /** alt − base; null when either side lacks data (NEVER a forged 0 — N3). */
    readonly delta: number | null;
}

/** The delta time-series between an alternative and a base scenario (§5.2). */
export interface ScenarioPairTimeSeries {
    /** The horizon actually applied to BOTH sides (CFG-09). */
    readonly horizon: ResolvedHorizon;
    /** The growth schedule actually applied to BOTH sides (CFG-10). */
    readonly growth: ResolvedGrowthSchedule;
    /** The demand curve actually applied to BOTH sides (CFG-12). */
    readonly curve: ResolvedDemandCurve;
    /** The rate decline actually applied to BOTH sides (CFG-13). */
    readonly decline: ResolvedDiscountDecline;
    /** The economic discount rate r actually applied to BOTH sides (§5.2 c). */
    readonly discountRate: number;
    readonly years: readonly number[];
    readonly base: ScenarioTimeSeries;
    readonly alt: ScenarioTimeSeries;
    /** ΔCAPEX NPV (alt − base); null if either side semDado. */
    readonly capexNPVDelta: number | null;
    /** ΔOPEX NPV (alt − base); null if either side semDado. */
    readonly opexNPVDelta: number | null;
    /** Nominal ΔCAPEX per year. */
    readonly capexDelta: readonly YearDelta[];
    /** Nominal ΔOPEX per year. */
    readonly opexDelta: readonly YearDelta[];
    /** ΔECBT Score per year. */
    readonly ecbtDelta: readonly YearDelta[];
    /** Δ environmental physical-flow proxy per year (not discounted). */
    readonly environmentalDelta: readonly YearDelta[];
}

// ───────────────────────────── Helpers ─────────────────────────────

const DEFAULT_DISCOUNT_RATE = 0.08;

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Resolve the configured (or default) economic discount rate (§5.2 c). */
function resolveRate(params: ProjectionParams): number {
    return isFiniteNumber(params.discountRate) ? (params.discountRate as number) : DEFAULT_DISCOUNT_RATE;
}

/**
 * Resolve the horizon of a projection (CFG-09) through the SHARED resolver, so
 * the series honours any horizon year in range (2045 included) instead of the
 * old closed union, and an unusable request falls back to the 2030 milestone
 * (§5.2 a) rather than silently yielding an empty series.
 *
 * @param params - The projection parameters as given by the caller.
 * @returns The resolved horizon (`horizonYear` is null when there is no anchor).
 */
function resolveProjectionHorizon(params: ProjectionParams): ResolvedHorizon {
    const baseYear = isFiniteNumber(params.baseYear) ? Math.floor(params.baseYear) : undefined;
    return resolveHorizon(
        { baseYear, horizonYear: params.horizon, horizonYears: params.horizonYears },
        { horizonYears: baseYear === undefined ? undefined : horizonYearsToMilestone(baseYear) },
    );
}

/**
 * The per-year discount factor (1+r)^k for the ECONOMIC dimension (§5.2 c).
 * With `discountDeclining` the rate declines as r_k = r / (1 + c·k), so the far
 * future is discounted LESS (UK Green Book / CEPAL intergenerational rule).
 * CFG-13: `c` is a scenario parameter (default 0.02, the value that used to be
 * hardcoded here) resolved by `_scenarioDiscountDeclinePure.ts`.
 */
function discountFactor(r: number, k: number, decline: ResolvedDiscountDecline): number {
    return declineDiscountFactor(r, k, decline);
}

/**
 * Project the activity driver A(t) = A0 × (1+g)^(t−baseYear) for every year of
 * the horizon (§5.2 abstraction). With g = 0 the series is constant. The
 * horizon comes from the shared resolver (CFG-09), so any year in range works.
 *
 * @param a0 - The base-year activity A0 (the §5.1 (b) driver).
 * @param params - The projection parameters (baseYear, horizon, growth).
 * @returns Frozen array of `{ year, activity }` from baseYear to horizon.
 */
export function projectActivity(a0: number, params: ProjectionParams): readonly ActivityPoint[] {
    const horizon = resolveProjectionHorizon(params);
    return projectActivityOverHorizon(
        a0,
        horizon,
        resolveProjectionGrowth(params, horizon),
        resolveDemandCurve(params.demandCurve),
    );
}

/**
 * Resolve the growth of a projection (CFG-10): the per-phase schedule when the
 * caller gives one, otherwise the scalar `activityGrowth` as a single phase —
 * which keeps the pre-CFG-10 `(1+g)^k` path bit-for-bit identical.
 *
 * @param params - The projection parameters as given by the caller.
 * @param horizon - The already-resolved horizon (supplies the anchor year).
 * @returns The resolved growth schedule (auditable: anchored/clamped/rejected).
 */
function resolveProjectionGrowth(
    params: ProjectionParams,
    horizon: ResolvedHorizon,
): ResolvedGrowthSchedule {
    const scalar = isFiniteNumber(params.activityGrowth) ? (params.activityGrowth as number) : 0;
    return resolveGrowthSchedule(params.growthSchedule, horizon.baseYear, scalar);
}

/** Same as {@link projectActivity} with horizon/growth/curve resolved (no rework). */
function projectActivityOverHorizon(
    a0: number,
    horizon: ResolvedHorizon,
    growth: ResolvedGrowthSchedule,
    curve: ResolvedDemandCurve,
): readonly ActivityPoint[] {
    const base = isFiniteNumber(a0) ? a0 : 0;
    const out: ActivityPoint[] = [];
    // N3: no anchor ⇒ no series (the module never invents a base year).
    if (horizon.baseYear === null || horizon.horizonYear === null) return Object.freeze(out);
    for (let year = horizon.baseYear; year <= horizon.horizonYear; year += 1) {
        // A(t) = A0 × factor(curve) — geometric keeps the Π(1+g(y)) of always.
        out.push(
            Object.freeze({ year, activity: base * demandFactorAt(curve, growth, horizon.baseYear, year) }),
        );
    }
    return Object.freeze(out);
}

/** Sum the physical flows of all affected ODS for one year (anti-N3 aware). */
function environmentalFlow(metrics: RealScenarioMetrics): number | null {
    let sum = 0;
    let any = false;
    for (const o of metrics.ods) {
        if (isFiniteNumber(o.physicalFlow)) {
            sum += o.physicalFlow as number;
            any = true;
        }
    }
    return any ? sum : null;
}

/** alt − base, preserving null (N3): a missing side keeps the delta null. */
function safeDelta(alt: number | null, base: number | null): number | null {
    if (alt === null || base === null) return null;
    return alt - base;
}

// ───────────────────────── Single-scenario series (§5.2) ─────────────────────────

/**
 * Compute the full projected TIME-SERIES of a scenario (§5.2). For each year it
 * REUSES `computeRealScenarioMetrics` with the year's A(t) override (the engine
 * is never reimplemented — anti-N4). The economic dimension (CAPEX/OPEX) is
 * brought to Net Present Value: Σ value_k/(1+r)^k; the environmental/ODS
 * dimension is projected with A(t) WITHOUT discounting (GWP-100 — §5.2 b).
 *
 * @param baseProcess - The base process snapshot (never mutated).
 * @param mutation - The mutation defining this scenario (`{}` = the base).
 * @param params - The temporal projection parameters (§5.2).
 * @returns A frozen {@link ScenarioTimeSeries}; semDado dimensions stay null.
 */
export function computeScenarioTimeSeries(
    baseProcess: BaseProcess,
    mutation: ProcessMutation,
    params: ProjectionParams,
): ScenarioTimeSeries {
    const r = resolveRate(params);
    const decline = resolveDiscountDecline(params.discountDeclining, params.discountDeclineCoefficient);
    const horizon = resolveProjectionHorizon(params);
    const growth = resolveProjectionGrowth(params, horizon);
    const curve = resolveDemandCurve(params.demandCurve);
    const a0 = isFiniteNumber(baseProcess.throughput) ? baseProcess.throughput : 0;
    const activitySeries = projectActivityOverHorizon(a0, horizon, growth, curve);

    const years: number[] = [];
    const capexSeries: YearValue[] = [];
    const opexSeries: YearValue[] = [];
    const ecbtSeries: YearValue[] = [];
    const odsSeries: YearOds[] = [];
    const environmentalSeries: YearValue[] = [];

    let capexNPV = 0;
    let opexNPV = 0;
    let anyCapex = false;
    let anyOpex = false;

    for (const { year, activity } of activitySeries) {
        const k = year - (horizon.baseYear as number);
        // REUSE the real motor, varying ONLY A(t) for this year (anti-N4).
        const m = computeRealScenarioMetrics(baseProcess, mutation, { value: activity });

        years.push(year);
        capexSeries.push(Object.freeze({ year, value: m.capex }));
        opexSeries.push(Object.freeze({ year, value: m.opex }));
        ecbtSeries.push(Object.freeze({ year, value: m.ecbt }));
        odsSeries.push(Object.freeze({ year, ods: m.ods }));
        environmentalSeries.push(Object.freeze({ year, value: environmentalFlow(m) }));

        // Economic → NPV (§5.2 c). Ambient/ODS stays nominal (§5.2 b).
        const factor = discountFactor(r, k, decline);
        if (isFiniteNumber(m.capex)) {
            capexNPV += (m.capex as number) / factor;
            anyCapex = true;
        }
        if (isFiniteNumber(m.opex)) {
            opexNPV += (m.opex as number) / factor;
            anyOpex = true;
        }
    }

    return Object.freeze({
        horizon,
        growth,
        curve,
        decline,
        discountRate: r,
        years: Object.freeze(years) as readonly number[],
        activitySeries,
        capexNPV: anyCapex ? capexNPV : null,
        opexNPV: anyOpex ? opexNPV : null,
        capexSeries: Object.freeze(capexSeries) as readonly YearValue[],
        opexSeries: Object.freeze(opexSeries) as readonly YearValue[],
        ecbtSeries: Object.freeze(ecbtSeries) as readonly YearValue[],
        odsSeries: Object.freeze(odsSeries) as readonly YearOds[],
        environmentalSeries: Object.freeze(environmentalSeries) as readonly YearValue[],
    });
}

// ───────────────────────── Paired delta series (§5.2) ─────────────────────────

/** Build the per-year delta list between two scalar series (alt − base, N3). */
function deltaSeries(
    alt: readonly YearValue[],
    base: readonly YearValue[],
): readonly YearDelta[] {
    const byYear = new Map<number, number | null>();
    for (const b of base) byYear.set(b.year, b.value);
    const out: YearDelta[] = [];
    for (const a of alt) {
        const baseValue = byYear.has(a.year) ? (byYear.get(a.year) as number | null) : null;
        out.push(Object.freeze({ year: a.year, delta: safeDelta(a.value, baseValue) }));
    }
    return Object.freeze(out);
}

/**
 * Compute the DELTA time-series (alt − base) across the dimensions and years
 * (§5.2). Each scenario is projected via {@link computeScenarioTimeSeries}; the
 * delta is taken per year per dimension, preserving null where either side has
 * no data (N3 — a missing reading never becomes a forged 0).
 *
 * @param baseProcess - The base process snapshot (never mutated).
 * @param altMutation - The mutation defining the alternative scenario.
 * @param params - The temporal projection parameters (§5.2).
 * @returns A frozen {@link ScenarioPairTimeSeries} with per-year deltas + ΔNPV.
 */
export function computeScenarioPairTimeSeries(
    baseProcess: BaseProcess,
    altMutation: ProcessMutation,
    params: ProjectionParams,
): ScenarioPairTimeSeries {
    const base = computeScenarioTimeSeries(baseProcess, {}, params);
    const alt = computeScenarioTimeSeries(baseProcess, altMutation, params);

    return Object.freeze({
        horizon: base.horizon,
        growth: base.growth,
        curve: base.curve,
        decline: base.decline,
        discountRate: base.discountRate,
        years: base.years,
        base,
        alt,
        capexNPVDelta: safeDelta(alt.capexNPV, base.capexNPV),
        opexNPVDelta: safeDelta(alt.opexNPV, base.opexNPV),
        capexDelta: deltaSeries(alt.capexSeries, base.capexSeries),
        opexDelta: deltaSeries(alt.opexSeries, base.opexSeries),
        ecbtDelta: deltaSeries(alt.ecbtSeries, base.ecbtSeries),
        environmentalDelta: deltaSeries(alt.environmentalSeries, base.environmentalSeries),
    });
}
