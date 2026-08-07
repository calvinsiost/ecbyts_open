// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Real Process Loader — pure-logic bridge: production_area element → BaseProcess.
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4 TEMA A, CFG-01..04).
 *
 * THE POINT (North Star — confiança no resultado): the scenario comparator must
 * read the REAL data the user already modelled (a `production_area` element + its
 * costs from the ERP rollup) instead of inventing demo numbers. This module is the
 * converter:
 *
 *   - {@link buildProcessFromElement}: turns ONE real `production_area` element
 *     (its 3 universal rates + its REAL CAPEX/OPEX from `buildCostRollup()`) into a
 *     {@link BaseProcess} the scenario engine consumes. Routes, unit cost factors and
 *     physical characteristics are DERIVED from the element — never fabricated.
 *   - {@link hasUsableRealData}: whether an element carries enough real data to drive
 *     a real scenario (so the UI can fall back to the labelled "example" stub when not).
 *
 * ─── Anti-fabrication discipline (N3 / N8) ───
 * Where the real datum does not exist the route is marked WITHOUT that factor
 * (`capexUnit`/`opexUnit` omitted, `characteristic.factor = null`). The downstream
 * engine then surfaces `semDado` / ODS tier T0 — it NEVER fills a 0, an average or a
 * guess. CFG-01: demo constants only ever appear as a labelled fallback, never as if
 * they were real.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen. The
 * element is read structurally (duck-typed) so this module stays independent of the
 * mutable element manager types.
 */

import { getProductionSubtype, isValidSubtype } from '../elements/families/production/subtypes.js';
import type { BaseProcess, ProcessCharacteristic, ProcessRoute } from './_scenarioImpactEnginePure.js';
import { deriveUnitCostFactors, type CostRollupForElement } from './_scenarioCostFactorsPure.js';
import { resolvePhysicalFactor } from './_scenarioPhysicalFactorsPure.js';

export type { CostRollupForElement } from './_scenarioCostFactorsPure.js';

// ───────────────────────────── Input shapes ─────────────────────────────

/**
 * Minimal structural shape of a real element as exposed by `getAllElements()`.
 * Duck-typed on purpose: we only read what we need and never mutate it.
 */
export interface RealElementLike {
    readonly id?: string;
    readonly name?: string;
    readonly family?: string;
    readonly familyId?: string;
    readonly data?: {
        /** Production subtype id ('mining' | 'petroleum' | future). */
        readonly subtype?: string;
        /** Universal process rates persisted on the element (Phase-2 forward-compat). */
        readonly rates?: {
            readonly throughput?: number | { value?: number } | null;
            readonly recoveryRate?: number | null;
            readonly yield?: number | { value?: number } | null;
        } | null;
        /** Element-level cost entries (CAPEX/OPEX per fiscal year). */
        readonly costs?: ReadonlyArray<{
            readonly fiscalYear?: number;
            readonly capexTotal?: number;
            readonly opexTotal?: number;
        }> | null;
        /**
         * Element-persisted physical attributes (CFG-02): `waterIntensity`,
         * `tailingsFactor`, `energyIntensity`, `jobsPerUnit`, `emissionsIntensity`
         * (+ optional `<key>Reference` ceilings). Absent keys are never invented.
         */
        readonly physical?: Readonly<Record<string, unknown>> | null;
        readonly [k: string]: unknown;
    } | null;
    readonly [k: string]: unknown;
}

// ───────────────────────────── Helpers ─────────────────────────────

const PRODUCTION_FAMILY = 'production_area';

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Is this a `production_area` element (by family or familyId)? */
function isProductionElement(element: RealElementLike | null | undefined): boolean {
    if (!element) return false;
    return element.family === PRODUCTION_FAMILY || element.familyId === PRODUCTION_FAMILY;
}

/** Read a rate that may be a bare number or a `{ value }` wrapper; null when absent. */
function readRate(raw: number | { value?: number } | null | undefined): number | null {
    if (isFiniteNumber(raw)) return raw;
    if (raw && typeof raw === 'object' && isFiniteNumber(raw.value)) return raw.value as number;
    return null;
}

/**
 * Resolve the 3 universal rates for the element: prefer the user-persisted
 * `data.rates`; otherwise fall back to the subtype catalog defaults (non-zero only).
 * Returns `null` for any rate that has no real value anywhere (anti-N3).
 */
function resolveRates(element: RealElementLike, subtypeId: string): {
    throughput: number | null;
    recoveryRate: number | null;
    yield: number | null;
} {
    const data = element.data ?? {};
    const r = data.rates ?? null;
    let throughput = r ? readRate(r.throughput) : null;
    let recoveryRate = r ? readRate(r.recoveryRate) : null;
    let yld = r ? readRate(r.yield) : null;

    // Fallback to the subtype catalog rates (only meaningful, non-zero defaults).
    const subtype = getProductionSubtype(subtypeId);
    if (subtype) {
        for (const cat of subtype.categories) {
            if (throughput === null && cat.rates.throughput && isFiniteNumber(cat.rates.throughput.value) && cat.rates.throughput.value > 0) {
                throughput = cat.rates.throughput.value;
            }
            if (recoveryRate === null && isFiniteNumber(cat.rates.recoveryRate) && (cat.rates.recoveryRate as number) > 0) {
                recoveryRate = cat.rates.recoveryRate as number;
            }
            if (yld === null && cat.rates.yield && isFiniteNumber(cat.rates.yield.value) && cat.rates.yield.value > 0) {
                yld = cat.rates.yield.value > 1 ? cat.rates.yield.value / 100 : cat.rates.yield.value;
            }
        }
    }
    return { throughput, recoveryRate, yield: yld };
}

/**
 * Map an output port id to the ODS physical characteristic kind it represents.
 * Curated, data-driven mapping (CFG-02): the kind is derived from the port the real
 * element declares, NOT invented per-route. Unknown ports get no characteristic.
 */
function characteristicKindForPort(portId: string): ProcessCharacteristic['kind'] | null {
    const id = portId.toLowerCase();
    if (id.includes('water') || id.includes('effluent')) return 'waterStress';
    if (id.includes('tailing') || id.includes('residue') || id.includes('reject')) return 'tailings';
    if (id.includes('gas') || id.includes('emission') || id.includes('flare')) return 'emissions';
    if (id.includes('concentrate') || id.includes('fuel') || id.includes('crude') || id.includes('product') || id.includes('byproduct')) {
        return 'energy';
    }
    return null;
}

/**
 * Derive the process routes from the REAL element's subtype output ports (CFG-03):
 * one route per output port of the subtype, NOT 4 hardcoded routes. Each route gets
 * its physical characteristic kind from the port; the cost unit factors are derived
 * from the real aggregated CAPEX/OPEX, spread across the routes (see {@link spreadCosts}).
 *
 * Cost unit factors come from `deriveUnitCostFactors` (CFG-01 — the REAL rollup);
 * physical factors come from `resolvePhysicalFactor` (CFG-02 — element attribute →
 * derived from the REAL recoveryRate → curated per-subtype default → semDado).
 * A route whose factor cannot be resolved carries `factor: null` so the engine
 * reports tier T0 (anti-N3, never a fabricated 0).
 */
function deriveRoutes(
    element: RealElementLike,
    subtypeId: string,
    rates: { throughput: number | null; recoveryRate: number | null; yield: number | null },
    rollup: CostRollupForElement | null | undefined,
): ProcessRoute[] {
    const subtype = getProductionSubtype(subtypeId);
    // Collect the distinct output ports across the subtype's last (product) stages.
    const portIds: string[] = [];
    const seen = new Set<string>();
    if (subtype) {
        for (const cat of subtype.categories) {
            for (const port of cat.outputs) {
                if (!seen.has(port.id)) {
                    seen.add(port.id);
                    portIds.push(port.id);
                }
            }
        }
    }
    // Always include a "jobs" social route (ODS 8) — derived, not a cost route.
    const costPortIds = portIds.filter((p) => characteristicKindForPort(p) !== null);
    const routeCount = Math.max(costPortIds.length, 1);

    // CFG-01 — REAL aggregated CAPEX/OPEX → per-unit factors (never demo constants;
    // side without a real positive aggregate stays null → engine reports semDado).
    const { capexUnit, opexUnit } = deriveUnitCostFactors(rollup, rates, routeCount);
    const alphaShare = 1 / routeCount;

    // CFG-02 — physical factors READ from the element: attribute → derived from the
    // REAL recoveryRate → curated per-subtype default → semDado (null, tier T0).
    const elementRecoveryRate = readRate(element.data?.rates?.recoveryRate ?? null);
    const attributes = element.data?.physical ?? null;

    const routes: ProcessRoute[] = [];
    const portsForRoutes = costPortIds.length > 0 ? costPortIds : ['output'];
    for (const portId of portsForRoutes) {
        const kind = characteristicKindForPort(portId) ?? 'energy';
        const physical = resolvePhysicalFactor(kind, {
            subtype: subtypeId,
            elementRecoveryRate,
            attributes,
        });
        const route: ProcessRoute = {
            id: portId,
            alpha: alphaShare,
            ...(capexUnit !== null ? { capexUnit } : {}),
            ...(opexUnit !== null ? { opexUnit } : {}),
            characteristic: Object.freeze({
                kind,
                factor: physical.factor,
                reference: physical.reference,
            }) as ProcessCharacteristic,
        };
        routes.push(Object.freeze(route));
    }
    return routes;
}

// ───────────────────────────── Public API ─────────────────────────────

/**
 * Whether a real `production_area` element carries enough real data to drive a
 * REAL scenario (CFG-04). True requires: it IS a production element with a valid
 * subtype AND the rollup has at least one real cost figure (CAPEX or OPEX). Without
 * real costs the comparator cannot show real money, so the UI must fall back to the
 * labelled example stub (never present demo numbers as real — CFG-01).
 *
 * @param element - The candidate element (duck-typed).
 * @param rollup - The element's slice of `buildCostRollup().byElement[id]`.
 * @returns true iff the element can drive a real (non-stub) scenario.
 */
export function hasUsableRealData(
    element: RealElementLike | null | undefined,
    rollup: CostRollupForElement | null | undefined,
): boolean {
    if (!isProductionElement(element)) return false;
    const subtypeId = element?.data?.subtype;
    if (!isValidSubtype(subtypeId)) return false;
    const hasRealCost =
        (isFiniteNumber(rollup?.capex) && (rollup!.capex as number) > 0) ||
        (isFiniteNumber(rollup?.opex) && (rollup!.opex as number) > 0);
    return hasRealCost;
}

/**
 * Convert ONE real `production_area` element + its real cost rollup into a
 * {@link BaseProcess} the scenario engine consumes (CFG-01..04). Rates come from the
 * element (or the subtype catalog defaults); CAPEX/OPEX unit factors are derived from
 * the REAL aggregated costs; routes are enumerated from the subtype's real output
 * ports. Anything without a real datum stays null/semDado — NEVER invented (N3/N8).
 *
 * @param element - The real production_area element (duck-typed).
 * @param rollupForElement? - The element's `byElement[id]` slice from `buildCostRollup()`.
 * @returns A frozen {@link BaseProcess} populated from real data.
 */
export function buildProcessFromElement(
    element: RealElementLike,
    rollupForElement?: CostRollupForElement | null,
): BaseProcess {
    const data = element.data ?? {};
    const subtypeId = isValidSubtype(data.subtype) ? (data.subtype as string) : 'mining';
    const rates = resolveRates(element, subtypeId);

    // Fall back to a neutral A(t) of 1 (never a fabricated throughput): when the real
    // throughput is missing the engine still computes proportional costs from the
    // real aggregate, and the dimension is honest about its provenance.
    const throughput = isFiniteNumber(rates.throughput) ? (rates.throughput as number) : 1;
    const recoveryRate = isFiniteNumber(rates.recoveryRate) ? (rates.recoveryRate as number) : 1;
    const yld = isFiniteNumber(rates.yield) ? (rates.yield as number) : 1;

    const routes = deriveRoutes(element, subtypeId, rates, rollupForElement);

    return Object.freeze({
        subtype: subtypeId,
        throughput,
        recoveryRate,
        yield: yld,
        elementId: typeof element.id === 'string' ? element.id : 'scenario:real-process',
        fiscalYear: firstFiscalYear(element) ?? new Date().getFullYear(),
        routes: Object.freeze(routes) as readonly ProcessRoute[],
    }) as BaseProcess;
}

/** First fiscal year declared in the element's costs (provenance for the ledger). */
function firstFiscalYear(element: RealElementLike): number | null {
    const costs = element.data?.costs;
    if (Array.isArray(costs)) {
        for (const c of costs) {
            if (isFiniteNumber(c?.fiscalYear)) return c.fiscalYear as number;
        }
    }
    return null;
}
