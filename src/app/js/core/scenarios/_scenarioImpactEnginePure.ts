// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenario Impact Engine — pure-logic ORCHESTRATION (SCENARIOS-IMPACT-001 §4 / §5.1).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 *
 * THE REAL MOTOR (replaces the fixed stub): when the user mutates a production
 * process, this recomputes CAPEX / OPEX / ECBT Score / ODS *for real* by
 * orchestrating the engines that already exist — it reimplements NONE of them
 * (anti-requirement N4).
 *
 * ─── The mother-formula (§5.1, abstraction of the author's TG II) ───
 *
 *   Impacto_d(cenário) = Σ_rotas ( α_rota × fator_d,rota × A(t) )
 *
 *   - α_rota   : allocation fraction of each process route (Σ α = 1). Derived
 *                from the mutation (throughput split / recoveryRate / yield).
 *   - A(t)     : activity driver (throughput, t/h or bbl/d) — the §5.1 (b) term.
 *   - fator_d  : per-route unit factor for dimension d:
 *                  · CAPEX/OPEX → unit cost R$ per unit of routed material (ERP);
 *                  · ODS        → physical characteristic (m³ water, t tailings,
 *                                 …) fed to the EXISTING ODS measurers/registry.
 *   - ECBT     : derived as V_net over the monetary factors (computeEcbtScore).
 *
 * Data path reused verbatim (ERP "caminho único de dados", §B):
 *   routes → CostRollupLike → costRollupToJournalEntries() → buildLedger()
 *   → buildIncomeStatement('BR-DRE') → toFinancialEntries() → computeEcbtScore()
 *
 * ODS path reused verbatim (core/ods, NÃO duplicado):
 *   route physical characteristics → measureOds6Water / measureOds6WaterStress /
 *   measureOds15Land / measureOds11Cities / measureGenericOds + getOds()
 *
 * Anti-N3 (no fabricated data): a route with no usable reading for a dimension
 * does NOT contribute a 0; the dimension surfaces `semDado=true` / ODS tier 'T0'.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

import { computeOutput, isValidSubtype } from '../elements/families/production/_productionBindingPure.js';
// CFG-40 (spec §2.4) — validação cruzada física: rejeita combinações
// impossíveis (ex.: yield > recoveryRate) com mensagem clara, em vez de
// clampar silenciosamente.
import { assertRatesCrossRules } from './_scenarioCrossValidationPure.js';
import {
    costRollupToJournalEntries,
    type CostRollupLike,
} from '../erp/_costEntryAdapterPure.js';
import { buildLedger } from '../erp/_ledgerPure.js';
import { buildIncomeStatement } from '../erp/_incomeStatementPure.js';
import type { StandardId } from '../erp/_statementStandards.js';
import { defaultChartBR } from '../erp/_chartOfAccountsPure.js';
import { recomputeScenarioEcbtScore } from './_scenarioEcbtScorePure.js';
// CFG-18 (spec §2.4) — moeda BASE/de apresentação do cenário. Reusa o catálogo
// curado do CFG-15 (N4); default BRL reproduz o hardcode anterior.
import { resolveBaseCurrency } from './_scenarioBaseCurrencyPure.js';
// CFG-19 (spec §2.4) — plano de contas selecionável; default BR-DRE reproduz
// exatamente a string que estava cravada nesta cadeia.
import { resolveAccountingPlan } from './_scenarioAccountingPlanPure.js';
// CFG-20 (spec §2.4) — período fiscal configurável; default jan–dez reproduz a
// janela cravada de antes.
import {
    fiscalSpanCovering,
    resolveFiscalCalendar,
    resolveFallbackFiscalYear,
    type FiscalCalendarSpec,
    type FiscalPeriod,
    type ResolvedFallbackFiscalYear,
    type ResolvedFiscalCalendar,
} from '../erp/_fiscalCalendarPure.js';
import { measureOds6Water } from '../ods/measurers/_ods6Pure.js';
import { measureOds6WaterStress } from '../ods/measurers/_ods6WaterStressPure.js';
import { measureOds15Land } from '../ods/measurers/_ods15Pure.js';
import { measureGenericOds } from '../ods/measurers/_genericPure.js';
import { getOds, type OdsTier } from '../ods/_registryPure.js';
import type { OdsImpacto } from './_scenarioComparatorVMPure.js';
import {
    DEFAULT_ECBT_SCENARIO_CONFIG,
    resolveEcbtScenarioConfig,
    type EcbtScenarioConfig,
    type EcbtScenarioConfigOverride,
} from './_scenarioEcbtConfigPure.js';
import {
    DEFAULT_ODS_THRESHOLD,
    DEFAULT_ODS_THRESHOLD_CONFIG,
    resolveOdsThresholdConfig,
    sinalFromThreshold,
    thresholdForGoal,
    type OdsSignalThreshold,
    type OdsThresholdConfig,
    type OdsThresholdConfigOverride,
} from './_scenarioOdsThresholdConfigPure.js';
// CFG-25 (spec §2.4.8) — o catálogo de tipos de impacto virou DADO. As receitas
// (família de medição, goal, código do indicador, direção) saem daqui em vez de
// estarem cravadas num `case` por tipo; registrar um tipo novo não toca o motor.
import {
    DEFAULT_IMPACT_TYPE_CATALOG,
    buildEffectiveImpactTypeCatalog,
    resolveImpactType,
    type EffectiveImpactTypeCatalog,
    type ImpactTypeDefinition,
    type ImpactTypeId,
} from './_impactTypeCatalogPure.js';
// CFG-26 (spec §2.4.8) — as dimensões de análise viraram catálogo. As 4
// canônicas seguem nos campos de sempre; as registradas por dado são agregadas
// pela MESMA fórmula-mãe e viajam num canal separado (`extras`).
import {
    aggregateExtraDimensions,
    buildEffectiveAnalysisDimensionCatalog,
} from './_analysisDimensionCatalogPure.js';

// ───────────────────────────── Types ─────────────────────────────

/** A single process route ("rota") inside a production area. */
export interface ProcessRoute {
    /** Stable route id (e.g. 'concentrate', 'tailings'). */
    readonly id: string;
    /**
     * Allocation share α of the routed material (0..1). The routes' α need not
     * sum to exactly 1 (some mass is lost); the engine normalises only for the
     * ECBT/ODS attribution when a share is required.
     */
    readonly alpha: number;
    /**
     * DECLARES that this route's α follows the process `yield` (CFG-41), instead
     * of being a standalone constant:
     *   - `'yield'`           ⇒ α = yield            (the product/concentrate route)
     *   - `'yieldComplement'` ⇒ α = 1 − yield        (the reject/tailings route)
     *
     * This is what makes the "Rendimento" slider a real lever: the yield stops
     * being an inert scalar and becomes the product/reject split it always meant
     * physically. Routes that omit it keep their α verbatim — water, jobs and any
     * real-element route are untouched (the rate does not move them).
     *
     * It is a DECLARATION, not an override: the engine recomputes α from the
     * resulting yield without triggering the Σα→1 renormalisation, so a scenario
     * whose yield equals the Base's reproduces the Base bit-for-bit (zero
     * regression). Deriving the same split via `routeOverrides` would instead
     * rescale EVERY route by 1/Σα — see the CFG-41 note in the spec.
     */
    readonly alphaFrom?: 'yield' | 'yieldComplement';
    /** Unit CAPEX factor (R$ per unit of A(t) routed through this route). */
    readonly capexUnit?: number;
    /** Unit OPEX factor (R$/ano per unit of A(t) routed through this route). */
    readonly opexUnit?: number;
    /** Physical characteristic this route emits, mapped to an ODS measurer. */
    readonly characteristic?: ProcessCharacteristic;
    /**
     * Per-unit factors for the analysis dimensions REGISTERED by data (CFG-26),
     * id → factor per unit of A(t) (e.g. `{ health: 2.4e-5 }`). A route that
     * declares no factor for a dimension simply does not contribute to it; a
     * dimension no route declares reports `null` (semDado — N3).
     */
    readonly dimensionFactors?: Readonly<Record<string, number | null>> | null;
}

/** Physical characteristic of a route → resolves to an official ODS indicator. */
export interface ProcessCharacteristic {
    /**
     * Impact type id from the curated catalog (CFG-25). The 6 canonical ids
     * still autocomplete; any id REGISTERED by data/config is equally valid,
     * because the engine resolves the measurement recipe from the catalog
     * instead of a closed `switch`. An id absent from the effective catalog
     * yields NO reading (never a fabricated one — N3).
     */
    readonly kind: ImpactTypeId;
    /**
     * Per-unit physical factor (e.g. m³ water per unit A(t), t tailings per
     * unit A(t)). Multiplied by α × A(t) to get the absolute physical flow.
     * `null`/absent ⇒ no reading ⇒ ODS tier T0 (anti-N3, never fabricated).
     */
    readonly factor?: number | null;
    /**
     * Optional reference ceiling/threshold for the measurer (e.g. renewable
     * resource for water stress, area for land). Without it the measurer
     * degrades the tier per its own no-fabrication rule.
     */
    readonly reference?: number | null;
}

/** A production process snapshot the user can mutate. */
export interface BaseProcess {
    /** Production subtype id ('mining' | 'petroleum' | future). */
    readonly subtype: string;
    /** Activity driver A(t): throughput (t/h, bbl/d). */
    readonly throughput: number;
    /** Recovery rate of the valuable material, fraction 0..1. */
    readonly recoveryRate: number;
    /** Product yield/grade, fraction 0..1. */
    readonly yield: number;
    /** The process routes (their α, cost factors and ODS characteristics). */
    readonly routes: readonly ProcessRoute[];
    /** Element id used as provenance in the ERP cost rollup. */
    readonly elementId?: string;
    /** Fiscal year tag for the ledger period (default 2026). */
    readonly fiscalYear?: number;
}

/**
 * A per-route override: change ONE specific route/process of the pipeline (e.g.
 * swap the flotation technology → new capexUnit for that route only). Casado por
 * `routeId`; uma rota sem override fica intacta. Campos omitidos preservam o valor
 * atual da rota (NÃO viram 0 — N3/N8: faixas validadas, não folha em branco).
 */
export interface RouteOverride {
    /** Id of the route to patch (must match an existing {@link ProcessRoute.id}). */
    readonly routeId: string;
    /** New allocation share α (0..1). Σα é revalidado (ver {@link applyProcessMutation}). */
    readonly alpha?: number;
    /** New unit CAPEX factor (R$ per unit of A(t) routed). >= 0. */
    readonly capexUnit?: number;
    /** New unit OPEX factor (R$/ano per unit of A(t) routed). >= 0. */
    readonly opexUnit?: number;
    /**
     * Alias for {@link alpha} expressed as the route's share of throughput. When
     * both are present `alpha` wins; this exists so the UI can speak in "share"
     * terms without a second concept. (0..1)
     */
    readonly throughputShare?: number;
}

/** A single, validated mutation of the process (F2). */
export interface ProcessMutation {
    /** Switch the production subtype (validated via subtypes.ts). */
    readonly subtype?: string;
    /** New activity driver A(t). */
    readonly throughput?: number;
    /** New recovery rate (0..1). */
    readonly recoveryRate?: number;
    /** New product yield (0..1). */
    readonly yield?: number;
    /**
     * Per-route overrides — the answer to the pergunta-mãe "se eu mudar o processo X
     * do pipeline, o CAPEX sobe Y?". Each entry patches the route whose `id` matches
     * `routeId`; routes without an override are copied verbatim. An override whose
     * `routeId` matches nothing is a safe no-op (never creates a phantom route).
     */
    readonly routeOverrides?: ReadonlyArray<RouteOverride>;
}

/** Diagnostic of the α-renormalisation triggered by per-route overrides (N8). */
export interface AlphaRenormalization {
    /** True iff any override touched α (and the engine had to revalidate Σα). */
    readonly applied: boolean;
    /** Σα BEFORE renormalisation (after the raw overrides). null if no α data. */
    readonly sumBefore: number | null;
    /** Σα AFTER renormalisation (≈ the target, normally 1). null if not renormalised. */
    readonly sumAfter: number | null;
    /** True iff Σα drifted from ~1 and the engine rescaled to restore it. */
    readonly renormalized: boolean;
}

/** Activity driver A(t) (§5.1 b). Single value here; series is a future phase. */
export interface ScenarioActivity {
    /** A(t) value; when omitted the engine uses the process throughput. */
    readonly value?: number;
}

/**
 * Optional engine options. `ecbtConfig` is the curated, versioned admin override
 * for the ECBT κ/mode (CFG-24 — NOT N9). `odsThresholds` is the curated,
 * versioned per-ODS-indicator override for the sinal cutoffs (CFG-32 — NOT N9).
 * Omitting either (or passing an invalid partial) resolves to the curated default
 * (ECBT kappa=1/mode='absolute'; ODS melhora≥0.6/piora≤0.4 for every goal) — the
 * exact pre-CFG-24/CFG-32 behaviour, zero regression.
 */
export interface ScenarioEngineOptions {
    /** Curated admin override for the ECBT κ/mode (validated, versioned). */
    readonly ecbtConfig?: EcbtScenarioConfigOverride | null;
    /**
     * Curated admin override for the per-ODS-indicator sinal thresholds
     * (validated, versioned — CFG-32). A per-goal map; goals absent from it keep
     * the default melhora≥0.6/piora≤0.4.
     */
    readonly odsThresholds?: OdsThresholdConfigOverride | null;
    /**
     * Curated admin registration of ADDITIONAL impact types (CFG-25 — NOT N9):
     * an array of recipes coming from data/config (a versioned table), each
     * validated before it reaches the engine. Omitting it uses the 6 canonical
     * types — the exact pre-CFG-25 behaviour. A registered type is measured by
     * the family its recipe names; an invalid one is dropped with a reason and
     * never half-applied (N3).
     */
    readonly impactTypes?: ReadonlyArray<unknown> | null;
    /**
     * Curated admin registration of ADDITIONAL analysis dimensions (CFG-26 —
     * NOT N9): social cost, health, biodiversity, risk… Each registered
     * dimension is aggregated from the routes' `dimensionFactors` by the same
     * mother-formula the canonical dimensions use (§5.1-c). Omitting it keeps
     * exactly the 4 canonical dimensions — the pre-CFG-26 behaviour.
     */
    readonly dimensions?: ReadonlyArray<unknown> | null;
    /**
     * BASE currency of the scenario (CFG-18) — an ISO 4217 code from the curated
     * CFG-15 catalog ('BRL' default, 'AUD', 'EUR', …). It DECLARES the unit the
     * incoming costs are already in; it does NOT convert them (that is CFG-15,
     * which demands an exchange rate). A code outside the catalog falls back to
     * BRL rather than inventing a currency (N8).
     */
    readonly baseCurrency?: string | null;
    /**
     * Accounting plan of the income statement (CFG-19): a standard id
     * ('IFRS-IAS1') or a curated alias ('IFRS'). Default 'BR-DRE' — the string
     * that used to be hardcoded in this chain. A plan outside the curated
     * catalog falls back to BR-DRE instead of inventing a standard (N8).
     */
    readonly accountingPlan?: string | null;
    /**
     * Fiscal calendar (CFG-20): the month the financial year opens plus the
     * convention that labels it. Default Jan–Dec, which reproduces the window
     * this chain used to build by hand. A month outside 1..12 is refused back to
     * the default rather than clamped into a concrete wrong answer.
     */
    readonly fiscalCalendar?: FiscalCalendarSpec | null;
    /**
     * Fiscal year for a process that does NOT declare one (CFG-21). Without it
     * there is no financial year to post into, so the ECBT dimension reports
     * `null` (semDado) instead of the 2026 that used to be hardcoded. To use the
     * current year, pass it explicitly — the assumption is then the caller's,
     * declared and auditable, and this module stays deterministic.
     */
    readonly fallbackFiscalYear?: number | null;
}

/** One ODS dimension result, carrying the official indicator + tier + source. */
export interface OdsImpacto4D extends OdsImpacto {
    /** Official measurability tier from the ODS registry/measurer ('T0'..'T1'). */
    readonly tier: OdsTier;
    /** Impact score [0,1] or null (semDado). */
    readonly impact: number | null;
    /** Absolute physical flow that drove the measurement (provenance). */
    readonly physicalFlow: number | null;
}

/** The REAL metrics of a scenario across the 4 dimensions. */
export interface RealScenarioMetrics {
    /** CAPEX (R$). null = semDado (no cost factor anywhere). */
    readonly capex: number | null;
    /** OPEX (R$/ano). null = semDado. */
    readonly opex: number | null;
    /** ECBT Score V_net (R$). null = semDado. */
    readonly ecbt: number | null;
    /** Affected ODS (by official indicator). */
    readonly ods: readonly OdsImpacto4D[];
    /**
     * Values of the dimensions REGISTERED by data (CFG-26), id → value, each
     * aggregated by the SAME mother-formula `Σ_rotas(α × fator × A(t))` as the
     * canonical ones. Absent when no extra dimension was curated, so the
     * default output keeps the exact pre-CFG-26 shape.
     */
    readonly extras?: Readonly<Record<string, number | null>>;
    /** True iff any dimension lacked the data to compute (provenance). */
    readonly anySemDado: boolean;
    /**
     * α-renormalisation provenance for any per-route override that touched α
     * (anti-N8). `applied=false` when the mutation changed no α.
     */
    readonly alpha: AlphaRenormalization;
}

// ───────────────────────── Mutation (F2) ─────────────────────────

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function clampRate(v: number): number {
    return Math.min(1, Math.max(0, v));
}

/** Non-negative finite guard for monetary unit factors (R$ ≥ 0). */
function isNonNegFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Resolve the requested new α of a route override. `alpha` wins over the
 * `throughputShare` alias; both are validated to a finite [0,1] share. Returns
 * `null` when neither is a usable number (⇒ keep the route's current α).
 */
function resolveOverrideAlpha(ov: RouteOverride): number | null {
    if (isFiniteNumber(ov.alpha)) return clampRate(ov.alpha);
    if (isFiniteNumber(ov.throughputShare)) return clampRate(ov.throughputShare);
    return null;
}

/** Mutable working copy of a route (the public {@link ProcessRoute} is readonly). */
type MutableRoute = { -readonly [K in keyof ProcessRoute]: ProcessRoute[K] };

/**
 * Apply the per-route overrides to the route list (anti-N8: only validated
 * fields override; omitted fields preserve the route's current value — never a
 * blank-slate 0). An override whose `routeId` matches nothing is a safe no-op.
 * Returns the patched routes AND whether any α was touched (so the caller can
 * revalidate Σα).
 */
function applyRouteOverrides(
    routes: readonly ProcessRoute[],
    overrides: ReadonlyArray<RouteOverride> | undefined,
): { routes: MutableRoute[]; alphaTouched: boolean } {
    const list: MutableRoute[] = routes.map((r) => ({ ...r }));
    if (!Array.isArray(overrides) || overrides.length === 0) {
        return { routes: list, alphaTouched: false };
    }
    // Index existing routes by id for O(1) match; last override per id wins.
    const byId = new Map<string, MutableRoute>();
    for (const r of list) byId.set(r.id, r);
    let alphaTouched = false;
    for (const ov of overrides) {
        if (!ov || typeof ov.routeId !== 'string') continue;
        const target = byId.get(ov.routeId);
        if (!target) continue; // routeId matches nothing → safe no-op (no phantom route)
        const newAlpha = resolveOverrideAlpha(ov);
        if (newAlpha !== null) {
            target.alpha = newAlpha;
            alphaTouched = true;
        }
        if (isNonNegFinite(ov.capexUnit)) target.capexUnit = ov.capexUnit;
        if (isNonNegFinite(ov.opexUnit)) target.opexUnit = ov.opexUnit;
    }
    return { routes: list, alphaTouched };
}

/**
 * Renormalise the route α's so Σα is restored to ~1 AFTER a per-route α change
 * (anti-N8: we do NOT invent an α — we rescale the existing shares to keep the
 * mother-formula's allocation conserved). Routes with non-finite α are treated
 * as 0. When Σα is 0 (or no α to scale) the routes are returned untouched and
 * `renormalized=false` (we never fabricate a distribution from nothing).
 *
 * @returns the (possibly) rescaled routes + the Σα before/after diagnostic.
 */
/**
 * CFG-41 — recompute, IN PLACE, the α of every route that declares
 * {@link ProcessRoute.alphaFrom}, from the process' resulting yield:
 * `'yield'` ⇒ α = yield; `'yieldComplement'` ⇒ α = 1 − yield.
 *
 * This is the wiring that makes the yield a real lever instead of an inert
 * scalar: the product/reject split moves with the rate, exactly as the physical
 * meaning of "rendimento" always implied. Routes without the declaration are
 * left verbatim, so a rate that has nothing to do with water or jobs does not
 * silently move them.
 *
 * A route explicitly patched by a `routeOverride` that set its α is skipped —
 * an explicit α wins over the declaration (the user named that route by id).
 *
 * @param routes - Working copy of the routes (mutated in place).
 * @param yieldRate - The process' resulting yield, already clamped to [0,1].
 * @param overrides - The mutation's route overrides, to detect explicit α wins.
 */
function applyYieldDerivedAlphas(
    routes: MutableRoute[],
    yieldRate: number,
    overrides: ReadonlyArray<RouteOverride> | undefined,
): void {
    const explicitAlphaIds = new Set<string>();
    for (const ov of overrides ?? []) {
        if (ov && typeof ov.routeId === 'string' && resolveOverrideAlpha(ov) !== null) {
            explicitAlphaIds.add(ov.routeId);
        }
    }
    for (const route of routes) {
        if (!route.alphaFrom || explicitAlphaIds.has(route.id)) continue;
        route.alpha =
            route.alphaFrom === 'yieldComplement' ? Math.max(0, 1 - yieldRate) : yieldRate;
    }
}

function renormalizeAlphas(
    routes: MutableRoute[],
    target = 1,
): { routes: MutableRoute[]; sumBefore: number; sumAfter: number; renormalized: boolean } {
    let sumBefore = 0;
    for (const r of routes) sumBefore += isFiniteNumber(r.alpha) ? r.alpha : 0;
    // Already ~target, or nothing to scale → leave verbatim (no spurious churn).
    if (sumBefore <= 0 || Math.abs(sumBefore - target) <= 1e-9) {
        return { routes, sumBefore, sumAfter: sumBefore, renormalized: false };
    }
    const k = target / sumBefore;
    let sumAfter = 0;
    const scaled: MutableRoute[] = routes.map((r) => {
        const a = (isFiniteNumber(r.alpha) ? r.alpha : 0) * k;
        sumAfter += a;
        return { ...r, alpha: a };
    });
    return { routes: scaled, sumBefore, sumAfter, renormalized: true };
}

/**
 * Apply a single validated mutation to the process, returning a new frozen
 * process AND the α-renormalisation diagnostic (F1 isolation: base is never
 * mutated). Invalid subtypes are rejected (kept as-is); out-of-range rates are
 * clamped to [0,1]. Per-route overrides ({@link ProcessMutation.routeOverrides})
 * patch matching routes by id; when an α changes, Σα is renormalised back to ~1
 * so the allocation stays conserved (anti-N8 — rescale, never invent).
 *
 * @param base - The base process snapshot.
 * @param mutation - The user-proposed change.
 * @returns `{ process, alpha }` — the frozen mutated process + the α diagnostic.
 */
export function applyProcessMutationWithDiagnostics(
    base: BaseProcess,
    mutation: ProcessMutation,
): { readonly process: BaseProcess; readonly alpha: AlphaRenormalization } {
    const m = mutation || {};
    const subtype =
        typeof m.subtype === 'string' && isValidSubtype(m.subtype) ? m.subtype : base.subtype;
    const throughput = isFiniteNumber(m.throughput) && m.throughput >= 0 ? m.throughput : base.throughput;
    const recoveryRate = isFiniteNumber(m.recoveryRate) ? clampRate(m.recoveryRate) : base.recoveryRate;
    const yld = isFiniteNumber(m.yield) ? clampRate(m.yield) : base.yield;

    // CFG-40: a combinação RESULTANTE precisa ser fisicamente coerente
    // (yield ≤ recoveryRate). Violação = bloqueio com mensagem clara.
    assertRatesCrossRules({ throughput, recoveryRate, yield: yld }, 'applyProcessMutation');

    // Per-route overrides (the pergunta-mãe path) then α revalidation (N8).
    const patched = applyRouteOverrides(base.routes, m.routeOverrides);
    // CFG-41: routes that DECLARE `alphaFrom` follow the resulting yield. Applied
    // after the overrides so an explicit α for that same route still wins (the
    // user asked for it by id), and BEFORE the Σα renormalisation so a declared
    // split never triggers a rescale of the untouched routes.
    applyYieldDerivedAlphas(patched.routes, yld, m.routeOverrides);
    let finalRoutes = patched.routes;
    let alphaDiag: AlphaRenormalization = Object.freeze({
        applied: false,
        sumBefore: null,
        sumAfter: null,
        renormalized: false,
    });
    if (patched.alphaTouched) {
        const norm = renormalizeAlphas(patched.routes, 1);
        finalRoutes = norm.routes;
        alphaDiag = Object.freeze({
            applied: true,
            sumBefore: norm.sumBefore,
            sumAfter: norm.sumAfter,
            renormalized: norm.renormalized,
        });
    }

    const process = Object.freeze({
        ...base,
        subtype,
        throughput,
        recoveryRate,
        yield: yld,
        routes: Object.freeze(finalRoutes.map((r) => Object.freeze({ ...r }))) as readonly ProcessRoute[],
    }) as BaseProcess;
    return Object.freeze({ process, alpha: alphaDiag });
}

/**
 * Apply a single validated mutation to the process, returning a new frozen
 * process (the base is never mutated — F1 isolation). Invalid subtypes are
 * rejected (kept as-is); out-of-range rates are clamped to [0,1]. Per-route
 * overrides are honoured (see {@link applyProcessMutationWithDiagnostics}).
 *
 * @param base - The base process snapshot.
 * @param mutation - The user-proposed change.
 * @returns A frozen mutated copy of the process.
 */
export function applyProcessMutation(base: BaseProcess, mutation: ProcessMutation): BaseProcess {
    return applyProcessMutationWithDiagnostics(base, mutation).process;
}

// ─────────────────── CAPEX / OPEX via ERP chain (F4/F5) ───────────────────

/**
 * Routed material for a route = computeOutput(A(t) × α, recoveryRate). This is
 * the production-binding "input × taxa" reused, not reinvented.
 */
function routedMaterial(process: BaseProcess, route: ProcessRoute, activity: number): number {
    const routedInput = activity * (isFiniteNumber(route.alpha) ? route.alpha : 0);
    // recoveryRate is the universal conversion taxa applied by the binding.
    return computeOutput(routedInput, process.recoveryRate);
}

/**
 * The mother-formula contribution of one route for a monetary dimension:
 *   contribution = α × fator × A(t)   (here folded into routedMaterial × unit).
 * Returns null when this route has no factor for the dimension (anti-N3).
 */
function routeCostContribution(
    process: BaseProcess,
    route: ProcessRoute,
    activity: number,
    which: 'capex' | 'opex',
): number | null {
    const unit = which === 'capex' ? route.capexUnit : route.opexUnit;
    if (!isFiniteNumber(unit)) return null;
    const routed = routedMaterial(process, route, activity);
    return routed * unit;
}

interface CostTotals {
    capex: number | null;
    opex: number | null;
}

/** Σ_rotas of the CAPEX and OPEX contributions; null when no route contributes. */
function aggregateCosts(process: BaseProcess, activity: number): CostTotals {
    let capex = 0;
    let opex = 0;
    let anyCapex = false;
    let anyOpex = false;
    for (const route of process.routes) {
        const c = routeCostContribution(process, route, activity, 'capex');
        if (c !== null) {
            capex += c;
            anyCapex = true;
        }
        const o = routeCostContribution(process, route, activity, 'opex');
        if (o !== null) {
            opex += o;
            anyOpex = true;
        }
    }
    return { capex: anyCapex ? capex : null, opex: anyOpex ? opex : null };
}

/**
 * Build the {@link CostRollupLike} the ERP adapter consumes from the aggregated
 * CAPEX/OPEX totals. This is the bridge into the existing accounting chain — it
 * does not reimplement the rollup, it just shapes the totals as one element row.
 */
function toCostRollup(process: BaseProcess, totals: CostTotals): CostRollupLike {
    const elementId = process.elementId ?? 'scenario:process';
    const fiscalYear = isFiniteNumber(process.fiscalYear) ? process.fiscalYear : 2026;
    const capexTotal = totals.capex ?? 0;
    const opexTotal = totals.opex ?? 0;
    return Object.freeze({
        byElement: Object.freeze({
            [elementId]: Object.freeze({
                name: elementId,
                costs: Object.freeze([
                    Object.freeze({
                        fiscalYear,
                        capexTotal,
                        opexTotal,
                        items: Object.freeze([
                            Object.freeze({ categoryId: 'opex', itemId: 'opex', amount: opexTotal }),
                        ]),
                    }),
                ]),
            }),
        }),
    }) as CostRollupLike;
}

/**
 * Run the full ERP → ECBT chain on the aggregated costs, returning V_net.
 * Reuses costRollupToJournalEntries → buildLedger → buildIncomeStatement →
 * toFinancialEntries → computeEcbtScore (the single data path, §B). Returns
 * null when there is no cost data at all (anti-N3).
 *
 * `ecbtConfig` carries the curated, versioned κ/mode (CFG-24 — NOT N9). It
 * defaults to {@link DEFAULT_ECBT_SCENARIO_CONFIG} (kappa=1, mode='absolute'),
 * which reproduces the pre-CFG-24 hardcode exactly.
 *
 * `baseCurrencyCode` is the scenario's BASE currency (CFG-18) — the unit the
 * incoming costs are ALREADY in, not a conversion. It only labels the ECBT
 * chain: V_net is Σassets − Σliabilities over the very same journal entries, so
 * the NUMBER is invariant under it and only the currency tag moves. Converting
 * a value needs an exchange rate and lives in CFG-15. Default 'BRL' reproduces
 * the pre-CFG-18 hardcode exactly.
 */
function runEcbtChain(
    process: BaseProcess,
    totals: CostTotals,
    ecbtConfig: EcbtScenarioConfig = DEFAULT_ECBT_SCENARIO_CONFIG,
    baseCurrencyCode: string = resolveBaseCurrency().currency.code,
    accountingPlanId: StandardId = resolveAccountingPlan().id,
    fiscalCalendar: ResolvedFiscalCalendar = resolveFiscalCalendar(),
    fallbackFiscalYear: ResolvedFallbackFiscalYear = resolveFallbackFiscalYear(),
): number | null {
    if (totals.capex === null && totals.opex === null) return null;
    // CFG-21 — sem ano no processo E sem fallback DECLARADO não há exercício
    // onde apurar: `null` (semDado), nunca o 2026 que estava cravado aqui.
    const fiscalYear = isFiniteNumber(process.fiscalYear)
        ? process.fiscalYear
        : fallbackFiscalYear.year;
    if (fiscalYear === null) return null;
    const rollup = toCostRollup(process, totals);
    const journal = costRollupToJournalEntries(rollup, { basis: 'budgeted' });
    const chart = defaultChartBR();
    // CFG-20 — a janela do exercício vem do calendário escolhido, não de
    // jan–dez cravado. A âncora `${ano}-12-31` (a data com que o adaptador do
    // ERP carimba o lançamento) entra na união para que um calendário rotulado
    // pelo FIM não descarte o lançamento em silêncio.
    const period = fiscalSpanCovering([fiscalYear], fiscalCalendar, [`${fiscalYear}-12-31`]) as FiscalPeriod;
    const ledger = buildLedger(journal, chart, period);
    const statement = buildIncomeStatement(ledger, chart, accountingPlanId);
    // F5 — recompute ECBT via the dedicated scenario module (which itself
    // reuses toFinancialEntries + computeEcbtScore — single data path, N4).
    const result = recomputeScenarioEcbtScore({
        statement,
        ledger,
        currency: baseCurrencyCode,
        config: { kappa: ecbtConfig.kappa, mode: ecbtConfig.mode, version: ecbtConfig.version },
    });
    return result.vNet;
}

// ──────────────────── ODS via existing measurers (F6, N5) ────────────────────

const ODS_SOURCE_BASE = 'https://odsbrasil.gov.br/objetivo/objetivo?n=';

/**
 * Map a measurer impact + tier into a comparator sinal (no fabrication). The
 * mid-band cutoffs are CURATED PER ODS GOAL (CFG-32): the water goal (6) may use
 * a different melhora/piora than the climate goal (13). `thresholds` defaults to
 * the frozen 0.6/0.4 pair, so an uncurated goal reproduces the pre-CFG-32
 * behaviour byte-for-byte (zero regression).
 */
function sinalFromImpact(
    impact: number | null,
    tier: OdsTier,
    thresholds: OdsSignalThreshold = DEFAULT_ODS_THRESHOLD,
): OdsImpacto4D['sinal'] {
    if (impact === null || tier === 'T0') return 'semDado';
    // Higher impact score = healthier outcome = melhora. Curated per-goal cutoffs.
    return sinalFromThreshold(impact, thresholds);
}

/** Resolve the official indicator code for a goal from the existing registry. */
function indicatorForGoal(goal: number, fallback: string): string {
    const entry = getOds(goal);
    return entry?.officialIndicator ?? fallback;
}

/**
 * Measure ONE ODS for a route by delegating to the EXISTING measurer that fits
 * the route's physical characteristic. The absolute physical flow is α × A(t) ×
 * factor (the mother-formula for the ODS dimension). A missing factor yields
 * tier T0 (anti-N3) — never a fabricated 0.
 */
function _routePhysicalFlow(route: ProcessRoute, activity: number): number | null {
    const ch = route.characteristic;
    if (!ch) return null;
    const share = isFiniteNumber(route.alpha) ? route.alpha : 0;
    const factor = isFiniteNumber(ch.factor) ? (ch.factor as number) : null;
    return factor === null ? null : share * factor * activity;
}

/**
 * Official indicator code EXPOSED for an impact type (CFG-25). `literal` keeps
 * the code the recipe declares; `registry` asks the ODS registry for the goal's
 * `officialIndicator` and falls back to the declared code — exactly the two
 * behaviours the pre-CFG-25 `switch` had hardcoded per `case`.
 */
function indicatorForImpactType(def: ImpactTypeDefinition): string {
    return def.indicatorResolution === 'registry'
        ? indicatorForGoal(def.goal, def.indicator)
        : def.indicator;
}

function _measureOdsWaterQuality(
    flow: number,
    reference: unknown,
    def: ImpactTypeDefinition,
    indicator: string,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
): OdsImpacto4D {
    if (!isFiniteNumber(reference)) {
        return buildOds(def.goal, indicator, null, 'T0', flow, cfg);
    }
    const res = measureOds6Water({
        observations: [{ parameter: 'effluentLoad', value: flow }],
        thresholds: [{ parameter: 'effluentLoad', vi: reference as number }],
    });
    return buildOds(def.goal, indicator, res.impact, res.tier, flow, cfg);
}

function _measureOdsWaterStress(
    flow: number,
    reference: unknown,
    def: ImpactTypeDefinition,
    indicator: string,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
): OdsImpacto4D {
    if (!isFiniteNumber(reference)) {
        return buildOds(def.goal, indicator, null, 'T0', flow, cfg);
    }
    const res = measureOds6WaterStress({
        totalWithdrawal: flow,
        renewableResources: reference as number,
    });
    return buildOds(def.goal, indicator, res.impact, res.tier, flow, cfg);
}

function _measureOdsLand(
    flow: number,
    reference: unknown,
    def: ImpactTypeDefinition,
    indicator: string,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
): OdsImpacto4D {
    const ref = isFiniteNumber(reference) ? (reference as number) : null;
    const degradedRatio = ref && ref > 0 ? Math.min(1, flow / ref) : null;
    const res = measureOds15Land({ degradedAreaRatio: degradedRatio });
    return buildOds(def.goal, indicator, res.impact, res.tier, flow, cfg);
}

function _measureOdsRatio(
    flow: number,
    reference: unknown,
    def: ImpactTypeDefinition,
    indicator: string,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
): OdsImpacto4D {
    if (!isFiniteNumber(reference)) {
        return buildOds(def.goal, indicator, null, 'T0', flow, cfg);
    }
    const res = measureGenericOds({
        subIndicators: [
            {
                key: def.id,
                numerator: flow,
                denominator: reference as number,
                cap: 1,
                direction: def.direction === 'higher' ? 'higher' : 'lower',
            },
        ],
    });
    return buildOds(def.goal, indicator, res.impact, res.tier, flow, cfg);
}

/**
 * Measure ONE route's ODS by looking its impact type up in the CATALOG (CFG-25)
 * and applying the measurer family the recipe names. An impact type registered
 * by data flows through here untouched — the engine has no per-type branch left,
 * only per-FAMILY (the algorithms, which stay curated in code, N9).
 */
function measureRouteOds(
    process: BaseProcess,
    route: ProcessRoute,
    activity: number,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
    catalog: EffectiveImpactTypeCatalog = DEFAULT_IMPACT_TYPE_CATALOG,
): OdsImpacto4D | null {
    const ch = route.characteristic;
    if (!ch) return null;
    // Impact type outside the effective catalog ⇒ no reading at all (N3): the
    // engine never invents a goal/indicator for a type nobody curated.
    const def = resolveImpactType(catalog, ch.kind);
    if (!def) return null;
    const indicator = indicatorForImpactType(def);

    const flow = _routePhysicalFlow(route, activity);
    if (flow === null) return buildOds(def.goal, indicator, null, 'T0', null, cfg);

    switch (def.measurer) {
        case 'waterQuality':
            return _measureOdsWaterQuality(flow, ch.reference, def, indicator, cfg);
        case 'waterStress':
            return _measureOdsWaterStress(flow, ch.reference, def, indicator, cfg);
        case 'land':
            return _measureOdsLand(flow, ch.reference, def, indicator, cfg);
        case 'ratio':
            return _measureOdsRatio(flow, ch.reference, def, indicator, cfg);
        default:
            return null;
    }
}

/**
 * Build one frozen OdsImpacto4D with the citable source from the registry. The
 * sinal cutoffs are curated PER GOAL (CFG-32) via `thresholdConfig` — omitting it
 * uses the frozen default config (melhora≥0.6/piora≤0.4 for every goal), the
 * exact pre-CFG-32 behaviour.
 */
function buildOds(
    goal: number,
    indicator: string,
    impact: number | null,
    tier: OdsTier,
    physicalFlow: number | null,
    thresholdConfig: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
): OdsImpacto4D {
    return Object.freeze({
        goal,
        indicator,
        source: `${ODS_SOURCE_BASE}${goal}`,
        sinal: sinalFromImpact(impact, tier, thresholdForGoal(thresholdConfig, goal)),
        tier,
        impact,
        physicalFlow,
    });
}

/** Σ over routes → the list of affected ODS (deduped by goal:indicator). */
function aggregateOds(
    process: BaseProcess,
    activity: number,
    cfg: OdsThresholdConfig = DEFAULT_ODS_THRESHOLD_CONFIG,
    catalog: EffectiveImpactTypeCatalog = DEFAULT_IMPACT_TYPE_CATALOG,
): OdsImpacto4D[] {
    const byKey = new Map<string, OdsImpacto4D>();
    for (const route of process.routes) {
        const ods = measureRouteOds(process, route, activity, cfg, catalog);
        if (!ods) continue;
        const key = `${ods.goal}:${ods.indicator}`;
        // Keep the most informative (non-T0) reading when routes collide.
        const prev = byKey.get(key);
        if (!prev || (prev.tier === 'T0' && ods.tier !== 'T0')) byKey.set(key, ods);
    }
    return Array.from(byKey.values()).sort(
        (a, b) => a.goal - b.goal || a.indicator.localeCompare(b.indicator),
    );
}

// ─────────────────────────── Public API (F3) ───────────────────────────

/**
 * THE MOTOR. Apply a mutation to a base process and recompute the 4 real
 * dimensions (CAPEX, OPEX, ECBT, ODS) by orchestrating the existing engines.
 *
 * Implements the mother-formula `Impacto_d = Σ_rotas(α_rota × fator_d × A(t))`:
 *   - α comes from each route + the mutated recovery/throughput;
 *   - A(t) is the activity driver (mutation throughput, or `activity.value`);
 *   - fator_d are the per-route unit costs (ERP) and ODS physical factors
 *     (existing measurers via the registry).
 *
 * @param baseProcess - The base process snapshot (never mutated).
 * @param mutation - The user-proposed process change.
 * @param activity - Optional activity driver override (default = throughput).
 * @param options - Optional engine options (curated ECBT κ/mode — CFG-24; curated
 *   per-ODS sinal thresholds — CFG-32).
 * @returns Frozen real metrics; dimensions with no data report null (anti-N3).
 */
export function computeRealScenarioMetrics(
    baseProcess: BaseProcess,
    mutation: ProcessMutation = {},
    activity: ScenarioActivity = {},
    options: ScenarioEngineOptions = {},
): RealScenarioMetrics {
    const { process, alpha } = applyProcessMutationWithDiagnostics(baseProcess, mutation);
    const At = isFiniteNumber(activity.value) ? (activity.value as number) : process.throughput;
    const ecbtConfig = resolveEcbtScenarioConfig(options.ecbtConfig);
    const odsThresholdConfig = resolveOdsThresholdConfig(options.odsThresholds);
    // CFG-25 — sem registro, o catálogo efetivo é só o canônico (zero regressão).
    const impactTypes = options.impactTypes
        ? buildEffectiveImpactTypeCatalog(options.impactTypes)
        : DEFAULT_IMPACT_TYPE_CATALOG;
    const baseCurrency = resolveBaseCurrency(options.baseCurrency);
    const accountingPlan = resolveAccountingPlan(options.accountingPlan);
    const fiscalCalendar = resolveFiscalCalendar(options.fiscalCalendar);
    const fallbackFiscalYear = resolveFallbackFiscalYear(options.fallbackFiscalYear);

    const totals = aggregateCosts(process, At);
    const ecbt = runEcbtChain(
        process,
        totals,
        ecbtConfig,
        baseCurrency.currency.code,
        accountingPlan.id,
        fiscalCalendar,
        fallbackFiscalYear,
    );
    const ods = aggregateOds(process, At, odsThresholdConfig, impactTypes);

    const anySemDado =
        totals.capex === null ||
        totals.opex === null ||
        ecbt === null ||
        ods.length === 0 ||
        ods.some((o) => o.tier === 'T0');

    // CFG-26 — dimensões registradas por dado, agregadas pela MESMA fórmula-mãe
    // Σ_rotas(α × fator × A(t)). Sem registro, a saída nem ganha a chave `extras`
    // (a forma continua a de antes do CFG-26).
    const dimensionCatalog = options.dimensions
        ? buildEffectiveAnalysisDimensionCatalog(options.dimensions)
        : null;
    const metrics = {
        capex: totals.capex,
        opex: totals.opex,
        ecbt,
        ods: Object.freeze(ods) as readonly OdsImpacto4D[],
        anySemDado,
        alpha,
    };
    if (!dimensionCatalog || dimensionCatalog.registeredIds.length === 0) {
        return Object.freeze(metrics);
    }
    const extras = aggregateExtraDimensions(dimensionCatalog, process.routes, At);
    return Object.freeze({ ...metrics, extras });
}

/**
 * Convenience: compute BOTH the base metrics (no mutation) and the alternative
 * metrics (after `mutation`) in one call — the pair the comparator VM consumes.
 *
 * @param baseProcess - The base process snapshot.
 * @param mutation - The mutation that defines the alternative scenario.
 * @param activity - Optional activity driver override.
 * @param options - Optional engine options (curated ECBT κ/mode — CFG-24; curated
 *   per-ODS sinal thresholds — CFG-32).
 * @returns `{ base, alt }`, each a {@link RealScenarioMetrics}.
 */
export function computeScenarioPair(
    baseProcess: BaseProcess,
    mutation: ProcessMutation,
    activity: ScenarioActivity = {},
    options: ScenarioEngineOptions = {},
): { readonly base: RealScenarioMetrics; readonly alt: RealScenarioMetrics } {
    return Object.freeze({
        base: computeRealScenarioMetrics(baseProcess, {}, activity, options),
        alt: computeRealScenarioMetrics(baseProcess, mutation, activity, options),
    });
}
