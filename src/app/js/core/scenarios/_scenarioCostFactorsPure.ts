// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenario Cost Factors — pure-logic (CFG-01, TEMA A "Dados reais").
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4.2 CFG-01).
 *
 * Derives the per-route CAPEX/OPEX UNIT factors of the scenario engine from the
 * REAL aggregated costs the user already launched on the element (the
 * `buildCostRollup().byElement[id]` slice) — never from demo constants.
 *
 * The conversion inverts the engine's mother-formula so that
 *   Σ_rotas ( α × recoveryRate × A(t) × unit ) = REAL aggregate
 * reproduces the real total exactly (the CFG-01 testable clause: comparator
 * CAPEX/OPEX = saída de `buildCostRollup()`).
 *
 * ─── N3 (honestidade de dado) ───
 * A side (capex|opex) with no REAL positive aggregate yields `null` — the
 * downstream engine then surfaces `semDado`. A forged 0 would read as "real
 * CAPEX of zero", so it is NEVER produced here.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

/**
 * Per-element slice of `buildCostRollup().byElement[id]` — the REAL aggregated
 * CAPEX/OPEX for one element. `null`/absent ⇒ the element has no cost data and
 * nothing is fabricated (anti-N3).
 */
export interface CostRollupForElement {
    readonly capex?: number | null;
    readonly opex?: number | null;
    readonly total?: number | null;
    readonly family?: string;
}

/** The derived per-unit cost factors for the scenario routes (CFG-01). */
export interface ScenarioCostFactors {
    /** R$ per unit of routed material — `null` = semDado (no real CAPEX). */
    readonly capexUnit: number | null;
    /** R$/ano per unit of routed material — `null` = semDado (no real OPEX). */
    readonly opexUnit: number | null;
    /** true when NEITHER side has a real datum (N3). */
    readonly semDado: boolean;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Real positive aggregate or `null` — 0/absent is indistinguishable from "no data" (N3). */
function realPositive(v: number | null | undefined): number | null {
    return isFiniteNumber(v) && v > 0 ? v : null;
}

/**
 * Derive the per-unit CAPEX/OPEX factors from the REAL aggregated element costs
 * (CFG-01). Spread evenly across the `routeCount` cost-bearing routes with a
 * uniform α share, so the engine's Σ(α × rec × A(t) × unit) over those routes
 * reproduces the real aggregate exactly.
 *
 * @param rollup - The element's `buildCostRollup().byElement[id]` slice (real costs).
 * @param rates - The resolved real rates (`null` = no real value; treated as neutral 1).
 * @param routeCount - Number of cost-bearing routes the factors are spread over (≥ 1).
 * @returns Frozen factors; a side without a real aggregate is `null` (N3, never 0).
 */
export function deriveUnitCostFactors(
    rollup: CostRollupForElement | null | undefined,
    rates: { readonly throughput: number | null; readonly recoveryRate: number | null },
    routeCount: number,
): ScenarioCostFactors {
    const realCapex = realPositive(rollup?.capex);
    const realOpex = realPositive(rollup?.opex);
    const count = isFiniteNumber(routeCount) && routeCount >= 1 ? Math.floor(routeCount) : 1;

    // Neutral A(t)/recovery of 1 when the real rate is absent: the factor then
    // carries the aggregate proportionally without inventing a throughput.
    const At = isFiniteNumber(rates.throughput) ? rates.throughput : 1;
    const rec = isFiniteNumber(rates.recoveryRate) ? rates.recoveryRate : 1;
    const alphaShare = 1 / count;
    const denom = At * rec * alphaShare * count; // = At×rec when summed over routes

    const capexUnit = realCapex !== null && denom > 0 ? realCapex / denom : null;
    const opexUnit = realOpex !== null && denom > 0 ? realOpex / denom : null;
    return Object.freeze({
        capexUnit,
        opexUnit,
        semDado: capexUnit === null && opexUnit === null,
    });
}
