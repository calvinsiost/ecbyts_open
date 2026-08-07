// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GHG INVENTORY — GHG Protocol Brasil aggregators (8 tables)
   ================================================================
   Pure-logic aggregators to build a Programa Brasileiro GHG Protocol
   v2026 "Resumo" report from ecbyts emission_source elements plus
   observations indexed by gas (parameterId = 'gas:CO2', 'gas:CH4', ...).

   Output mirrors the official 8-table layout:
     T1 — Emissions consolidated by GEE × Scope
     T2 — Biogenic CO2 (separate)
     T3 — Categories within Scope 1
     T4 — Categories within Scope 2 (location-based)
     T5 — Categories within Scope 2 (market-based)
     T6 — Categories within Scope 3
     T7 — Intensity indicators (user denominators)
     T8 — Year-over-year comparison (optional)

   Pure TypeScript, no DOM, no Three.js — safe for Node tests.

   References:
   - GHG Protocol Corporate Standard (WBCSD/WRI 2004, rev. 2015)
   - Programa Brasileiro GHG Protocol v2026.0.1 (FGV/CEBDS)
   - IPCC AR6 GWP-100 (via ../chemistry/gwp.ts)

   @since v0.1.6
   ================================================================ */

import type { GhgGas, GwpVersion } from '../chemistry/gwp.js';
import { getGwp, isGhgGas, listGhgGases, toCo2eq } from '../chemistry/gwp.js';

console.debug('[mod:load]', 'app/js/core/reports/ghgInventory.ts');

// ----------------------------------------------------------------
// TYPES — domain enums and row contracts
// Tipos — enums do dominio e contratos das linhas
// ----------------------------------------------------------------

/** GHG Protocol scope. '2-loc' = location-based, '2-mb' = market-based. */
export type GhgScope = '1' | '2-loc' | '2-mb' | '3';

/**
 * 27 categories recognized by `docs/templates/domain-gee-ghg-br.json`.
 * Categorias por escopo segundo Programa Brasileiro GHG Protocol.
 */
export type GhgCategory =
    // Scope 1
    | 'combustao_estacionaria'
    | 'combustao_movel'
    | 'emissoes_fugitivas'
    | 'processos_industriais'
    | 'atividades_agricultura'
    | 'mudanca_uso_solo'
    | 'residuos'
    // Scope 2 — location-based
    | 'eletricidade_localizacao'
    | 'perdas_td_localizacao'
    | 'energia_termica'
    // Scope 2 — market-based
    | 'eletricidade_escolha_compra'
    | 'perdas_td_escolha_compra'
    // Scope 3 (15 categories)
    | 'bens_servicos'
    | 'bens_capital'
    | 'combustivel_energia_upstream'
    | 'transporte_upstream'
    | 'residuos_operacao'
    | 'viagens_negocios'
    | 'casa_trabalho'
    | 'arrendados_upstream'
    | 'transporte_downstream'
    | 'processamento_produtos'
    | 'uso_produtos'
    | 'fim_vida_produtos'
    | 'arrendados_downstream'
    | 'franquias'
    | 'investimentos';

/**
 * Minimal element shape expected by the aggregator. Subset of full ECBT element.
 * Only the fields actually consumed are typed; `data` is left wide for forward
 * compatibility with element schema evolution.
 */
export interface GhgInventoryElement {
    readonly id: string;
    readonly family: string;
    readonly name: string;
    readonly data: {
        readonly ghgScope?: GhgScope;
        readonly ghgCategory?: GhgCategory;
        readonly biogenic?: boolean;
        readonly organizationalUnit?: string;
        readonly intensityDenominators?: Readonly<Record<string, number>>;
        readonly [key: string]: unknown;
    };
}

/**
 * Minimal observation shape expected by the aggregator.
 * `parameterId` MUST follow the `gas:XXX` convention (e.g. `gas:CO2`).
 */
export interface GhgInventoryObservation {
    readonly id: string;
    readonly elementId: string;
    readonly parameterId: string; // expected format: 'gas:CO2', 'gas:CH4', ...
    readonly value: number;
    readonly unit: string;
    readonly date: string; // ISO YYYY-MM-DD
    readonly data?: {
        readonly emissionFactor?: number;
        readonly gwp?: number;
        readonly co2e?: number;
        readonly sourceQuantity?: number;
        readonly sourceUnit?: string;
        readonly verified?: boolean;
        readonly [key: string]: unknown;
    };
}

/** Full input contract for {@link buildGhgInventory}. */
export interface GhgInventoryInput {
    readonly elements: readonly GhgInventoryElement[];
    readonly observations: readonly GhgInventoryObservation[];
    readonly inventoryYear: number;
    readonly baselineYear?: number;
    readonly organizationalBoundary: 'financial_control' | 'operational_control' | 'equity_share';
    readonly gwpVersion: GwpVersion;
    /** Denominator values for intensity indicators (T7) keyed by metric label. */
    readonly intensityDenominators?: Readonly<Record<string, { value: number; unit: string }>>;
}

// ----------------------------------------------------------------
// ROW SHAPES — output contracts mirrored from the official spreadsheet
// Linhas — contratos de saida espelhados da planilha oficial
// ----------------------------------------------------------------

export interface T1Row {
    /** Gas identifier or `'Total'` for the footer row. */
    readonly gas: GhgGas | 'Total';
    readonly tonnesScope1: number;
    readonly tonnesScope2Loc: number;
    readonly tonnesScope2Mb: number;
    readonly tonnesScope3: number;
    readonly co2eScope1: number;
    readonly co2eScope2Loc: number;
    readonly co2eScope2Mb: number;
    readonly co2eScope3: number;
}

export interface T2Row {
    readonly source: string;
    readonly biogenicCo2t: number;
    readonly note?: string;
}

export interface T3Row {
    readonly category: GhgCategory;
    readonly tco2e: number;
    /** Share of scope total (0..1). */
    readonly share: number;
    readonly sourceCount: number;
}

export type T4Row = T3Row;
export type T5Row = T3Row;
export type T6Row = T3Row;

export interface T7Row {
    readonly denominator: string;
    readonly value: number;
    readonly unit: string;
    /** Computed intensity; `null` if denominator is zero or invalid. */
    readonly tco2ePerUnit: number | null;
    readonly trend?: number;
}

export interface T8Row {
    readonly metric: string;
    readonly baselineValue: number;
    readonly currentValue: number;
    readonly absoluteDelta: number;
    /** Percent delta (0..1 representation, e.g. 0.15 = +15%). */
    readonly percentDelta: number;
}

export interface GhgInventoryCoverPage {
    readonly inventoryYear: number;
    readonly baselineYear?: number;
    readonly gwpVersion: GwpVersion;
    readonly organizationalBoundary: GhgInventoryInput['organizationalBoundary'];
    readonly generatedAt: string;
}

export interface GhgInventoryReport {
    readonly coverPage: GhgInventoryCoverPage;
    readonly t1_consolidatedByGasAndScope: readonly T1Row[];
    readonly t2_biogenicEmissions: readonly T2Row[];
    readonly t3_scope1ByCategory: readonly T3Row[];
    readonly t4_scope2LocationByCategory: readonly T4Row[];
    readonly t5_scope2MarketBasedByCategory: readonly T5Row[];
    readonly t6_scope3ByCategory: readonly T6Row[];
    readonly t7_intensityIndicators: readonly T7Row[];
    readonly t8_yearOverYearComparison?: readonly T8Row[];
    readonly totalTCO2e: number;
    readonly metadata: {
        readonly generatedAt: string;
        readonly gwpVersion: GwpVersion;
        readonly toolVersion: string;
    };
}

// ----------------------------------------------------------------
// CONSTANTS — tool version, gas universe, category buckets
// Constantes — versao da ferramenta, gases, categorias por escopo
// ----------------------------------------------------------------

const TOOL_VERSION = 'ghgInventory@0.1.0';

const SCOPE1_CATEGORIES: readonly GhgCategory[] = Object.freeze([
    'combustao_estacionaria',
    'combustao_movel',
    'emissoes_fugitivas',
    'processos_industriais',
    'atividades_agricultura',
    'mudanca_uso_solo',
    'residuos',
]);

const SCOPE2_LOC_CATEGORIES: readonly GhgCategory[] = Object.freeze([
    'eletricidade_localizacao',
    'perdas_td_localizacao',
    'energia_termica',
]);

const SCOPE2_MB_CATEGORIES: readonly GhgCategory[] = Object.freeze([
    'eletricidade_escolha_compra',
    'perdas_td_escolha_compra',
    'energia_termica',
]);

const SCOPE3_CATEGORIES: readonly GhgCategory[] = Object.freeze([
    'bens_servicos',
    'bens_capital',
    'combustivel_energia_upstream',
    'transporte_upstream',
    'residuos_operacao',
    'viagens_negocios',
    'casa_trabalho',
    'arrendados_upstream',
    'transporte_downstream',
    'processamento_produtos',
    'uso_produtos',
    'fim_vida_produtos',
    'arrendados_downstream',
    'franquias',
    'investimentos',
]);

// ----------------------------------------------------------------
// HELPERS — internal parsing and lookups
// Auxiliares — parsing interno e lookups
// ----------------------------------------------------------------

/**
 * Extracts the gas identifier from a `parameterId` formatted as `gas:XXX`.
 * Returns `null` if the parameterId is malformed or the gas is unrecognized.
 * Extrai o identificador de gas de um parameterId no formato `gas:XXX`.
 */
function extractGas(parameterId: string): GhgGas | null {
    if (typeof parameterId !== 'string' || !parameterId.startsWith('gas:')) {
        return null;
    }
    const candidate = parameterId.slice(4).trim();
    if (!isGhgGas(candidate)) {
        return null;
    }
    return candidate;
}

/**
 * Builds an index of elements by id for O(1) lookup during aggregation.
 * Indexa elementos por id para lookup O(1) durante agregacao.
 */
function indexElements(
    elements: readonly GhgInventoryElement[],
): ReadonlyMap<string, GhgInventoryElement> {
    const map = new Map<string, GhgInventoryElement>();
    for (const el of elements) {
        if (el && typeof el.id === 'string') {
            map.set(el.id, el);
        }
    }
    return map;
}

/** Safe numeric add — treats NaN/undefined as 0. */
function safeAdd(a: number, b: number): number {
    const aa = Number.isFinite(a) ? a : 0;
    const bb = Number.isFinite(b) ? b : 0;
    return aa + bb;
}

/**
 * Resolves the CO2-equivalent for an observation. If `data.co2e` is provided
 * we trust it (auditor-overridable); otherwise compute via GWP table.
 */
function resolveCo2eq(obs: GhgInventoryObservation, gas: GhgGas, version: GwpVersion): number {
    const explicit = obs.data?.co2e;
    if (typeof explicit === 'number' && Number.isFinite(explicit)) {
        return explicit;
    }
    return toCo2eq(obs.value, gas, version);
}

// ----------------------------------------------------------------
// FILTERS — element/observation filtering
// Filtros — elementos e observacoes
// ----------------------------------------------------------------

/**
 * Returns only elements whose `family` is `'emission_source'`.
 * Filtra elementos com family `emission_source`.
 */
export function filterEmissionSources(
    elements: readonly GhgInventoryElement[],
): readonly GhgInventoryElement[] {
    return elements.filter((el) => el && el.family === 'emission_source');
}

/**
 * Compute T2 — biogenic CO2 emissions (one row per emission_source flagged biogenic).
 * Biogenic emissions are reported separately and do NOT add to scope totals.
 * Calcula T2 — emissoes de CO2 biogenico (uma linha por fonte com biogenic=true).
 */
export function filterBiogenic(input: GhgInventoryInput): readonly T2Row[] {
    const sources = filterEmissionSources(input.elements).filter((el) => el.data?.biogenic === true);
    const byElement = new Map<string, number>();
    for (const obs of input.observations) {
        const gas = extractGas(obs.parameterId);
        if (gas !== 'CO2') continue; // biogenic table tracks only CO2 biogenic
        if (!byElement.has(obs.elementId) && !sources.find((s) => s.id === obs.elementId)) continue;
        if (!sources.find((s) => s.id === obs.elementId)) continue;
        byElement.set(obs.elementId, safeAdd(byElement.get(obs.elementId) ?? 0, obs.value));
    }
    const rows: T2Row[] = [];
    for (const el of sources) {
        const total = byElement.get(el.id) ?? 0;
        rows.push({
            source: el.name || el.id,
            biogenicCo2t: total,
            note: 'Reported separately per GHG Protocol — does not count toward scope totals.',
        });
    }
    return rows;
}

// ----------------------------------------------------------------
// T1 — gas × scope matrix
// T1 — matriz gas × escopo
// ----------------------------------------------------------------

interface ScopeBuckets {
    tonnesScope1: number;
    tonnesScope2Loc: number;
    tonnesScope2Mb: number;
    tonnesScope3: number;
    co2eScope1: number;
    co2eScope2Loc: number;
    co2eScope2Mb: number;
    co2eScope3: number;
}

function emptyScopeBuckets(): ScopeBuckets {
    return {
        tonnesScope1: 0,
        tonnesScope2Loc: 0,
        tonnesScope2Mb: 0,
        tonnesScope3: 0,
        co2eScope1: 0,
        co2eScope2Loc: 0,
        co2eScope2Mb: 0,
        co2eScope3: 0,
    };
}

/**
 * Compute T1 — gas × scope matrix plus a footer Total row.
 * Each cell pair (tonnes vs co2e) reports raw tonnes of the gas and its CO2-eq.
 * Biogenic CO2 is excluded from T1 (lives in T2).
 *
 * @param input - Validated inventory input
 */
export function aggregateByGasAndScope(input: GhgInventoryInput): readonly T1Row[] {
    const sources = indexElements(filterEmissionSources(input.elements));
    const perGas = new Map<GhgGas, ScopeBuckets>();
    const total = emptyScopeBuckets();

    for (const obs of input.observations) {
        const el = sources.get(obs.elementId);
        if (!el) continue;
        // Skip biogenic CO2 — counted in T2 only.
        if (el.data?.biogenic === true) continue;
        const gas = extractGas(obs.parameterId);
        if (!gas) continue;
        const scope = el.data?.ghgScope;
        if (!scope) continue;

        let bucket = perGas.get(gas);
        if (!bucket) {
            bucket = emptyScopeBuckets();
            perGas.set(gas, bucket);
        }

        const co2e = resolveCo2eq(obs, gas, input.gwpVersion);
        const tonnes = Number.isFinite(obs.value) ? obs.value : 0;

        switch (scope) {
            case '1':
                bucket.tonnesScope1 = safeAdd(bucket.tonnesScope1, tonnes);
                bucket.co2eScope1 = safeAdd(bucket.co2eScope1, co2e);
                total.tonnesScope1 = safeAdd(total.tonnesScope1, tonnes);
                total.co2eScope1 = safeAdd(total.co2eScope1, co2e);
                break;
            case '2-loc':
                bucket.tonnesScope2Loc = safeAdd(bucket.tonnesScope2Loc, tonnes);
                bucket.co2eScope2Loc = safeAdd(bucket.co2eScope2Loc, co2e);
                total.tonnesScope2Loc = safeAdd(total.tonnesScope2Loc, tonnes);
                total.co2eScope2Loc = safeAdd(total.co2eScope2Loc, co2e);
                break;
            case '2-mb':
                bucket.tonnesScope2Mb = safeAdd(bucket.tonnesScope2Mb, tonnes);
                bucket.co2eScope2Mb = safeAdd(bucket.co2eScope2Mb, co2e);
                total.tonnesScope2Mb = safeAdd(total.tonnesScope2Mb, tonnes);
                total.co2eScope2Mb = safeAdd(total.co2eScope2Mb, co2e);
                break;
            case '3':
                bucket.tonnesScope3 = safeAdd(bucket.tonnesScope3, tonnes);
                bucket.co2eScope3 = safeAdd(bucket.co2eScope3, co2e);
                total.tonnesScope3 = safeAdd(total.tonnesScope3, tonnes);
                total.co2eScope3 = safeAdd(total.co2eScope3, co2e);
                break;
            default:
                // Unknown scope value — silently skip (validation belongs upstream).
                break;
        }
    }

    // Emit rows ordered by the canonical gas catalogue (stable presentation).
    const rows: T1Row[] = [];
    for (const gas of listGhgGases()) {
        const bucket = perGas.get(gas);
        if (!bucket) continue;
        rows.push({ gas, ...bucket });
    }
    rows.push({ gas: 'Total', ...total });
    return rows;
}

// ----------------------------------------------------------------
// T3-T6 — categories per scope
// T3-T6 — categorias por escopo
// ----------------------------------------------------------------

/** Returns the canonical category catalogue for a given scope. */
function categoryCatalogueFor(scope: GhgScope): readonly GhgCategory[] {
    switch (scope) {
        case '1':
            return SCOPE1_CATEGORIES;
        case '2-loc':
            return SCOPE2_LOC_CATEGORIES;
        case '2-mb':
            return SCOPE2_MB_CATEGORIES;
        case '3':
            return SCOPE3_CATEGORIES;
        default:
            return [];
    }
}

/**
 * Compute T3-T6 — emissions aggregated by category within a single scope.
 * For each known category we emit one row with tCO2e, share-of-scope, and
 * the number of distinct emission sources contributing to the row.
 *
 * @param input - Validated inventory input
 * @param scope - Scope filter ('1' | '2-loc' | '2-mb' | '3')
 */
export function aggregateByCategoryAndScope(
    input: GhgInventoryInput,
    scope: GhgScope,
): readonly T3Row[] {
    const sources = indexElements(filterEmissionSources(input.elements));
    const perCategory = new Map<GhgCategory, { tco2e: number; sources: Set<string> }>();
    let scopeTotal = 0;

    for (const obs of input.observations) {
        const el = sources.get(obs.elementId);
        if (!el) continue;
        if (el.data?.biogenic === true) continue;
        if (el.data?.ghgScope !== scope) continue;
        const category = el.data?.ghgCategory;
        if (!category) continue;
        const gas = extractGas(obs.parameterId);
        if (!gas) continue;

        const co2e = resolveCo2eq(obs, gas, input.gwpVersion);
        let bucket = perCategory.get(category);
        if (!bucket) {
            bucket = { tco2e: 0, sources: new Set<string>() };
            perCategory.set(category, bucket);
        }
        bucket.tco2e = safeAdd(bucket.tco2e, co2e);
        bucket.sources.add(el.id);
        scopeTotal = safeAdd(scopeTotal, co2e);
    }

    const catalogue = categoryCatalogueFor(scope);
    const rows: T3Row[] = [];
    for (const category of catalogue) {
        const bucket = perCategory.get(category);
        if (!bucket) continue;
        const share = scopeTotal > 0 ? bucket.tco2e / scopeTotal : 0;
        rows.push({
            category,
            tco2e: bucket.tco2e,
            share,
            sourceCount: bucket.sources.size,
        });
    }
    return rows;
}

// ----------------------------------------------------------------
// T7 — intensity indicators
// T7 — indicadores de intensidade
// ----------------------------------------------------------------

/**
 * Compute T7 — intensity indicators (tCO2e per denominator unit).
 * Denominators come from `input.intensityDenominators` (e.g. revenue, production).
 * Returns `tco2ePerUnit = null` when the denominator value is zero or non-finite.
 *
 * @param input - Validated inventory input
 * @param totalCo2e - Total CO2-eq across all scopes (numerator)
 */
export function computeIntensityIndicators(
    input: GhgInventoryInput,
    totalCo2e: number,
): readonly T7Row[] {
    const denominators = input.intensityDenominators;
    if (!denominators) {
        return [];
    }
    const rows: T7Row[] = [];
    for (const [denominator, spec] of Object.entries(denominators)) {
        if (!spec || typeof spec.value !== 'number' || typeof spec.unit !== 'string') {
            continue;
        }
        const value = spec.value;
        const unit = spec.unit;
        const tco2ePerUnit =
            !Number.isFinite(value) || value === 0 ? null : totalCo2e / value;
        rows.push({ denominator, value, unit, tco2ePerUnit });
    }
    return rows;
}

// ----------------------------------------------------------------
// T8 — year-over-year comparison
// T8 — comparativo ano-base x ano-corrente
// ----------------------------------------------------------------

/**
 * Compute T8 — year-over-year comparison between current and baseline reports.
 * Emits one row per metric (total + each scope), with absolute and percent deltas.
 *
 * @param current - Report for the inventory year
 * @param baseline - Report from the baseline year
 */
export function compareYearOverYear(
    current: GhgInventoryReport,
    baseline: GhgInventoryReport,
): readonly T8Row[] {
    const rows: T8Row[] = [];
    rows.push(buildT8Row('Total tCO2e', baseline.totalTCO2e, current.totalTCO2e));

    const baseTotals = totalsByScope(baseline.t1_consolidatedByGasAndScope);
    const curTotals = totalsByScope(current.t1_consolidatedByGasAndScope);
    rows.push(buildT8Row('Scope 1 tCO2e', baseTotals.scope1, curTotals.scope1));
    rows.push(buildT8Row('Scope 2 (loc) tCO2e', baseTotals.scope2Loc, curTotals.scope2Loc));
    rows.push(buildT8Row('Scope 2 (mb) tCO2e', baseTotals.scope2Mb, curTotals.scope2Mb));
    rows.push(buildT8Row('Scope 3 tCO2e', baseTotals.scope3, curTotals.scope3));

    return rows;
}

interface ScopeTotals {
    scope1: number;
    scope2Loc: number;
    scope2Mb: number;
    scope3: number;
}

/** Sum the Total row of a T1 array; returns zeros if the Total row is missing. */
function totalsByScope(t1: readonly T1Row[]): ScopeTotals {
    const total = t1.find((r) => r.gas === 'Total');
    if (!total) {
        return { scope1: 0, scope2Loc: 0, scope2Mb: 0, scope3: 0 };
    }
    return {
        scope1: total.co2eScope1,
        scope2Loc: total.co2eScope2Loc,
        scope2Mb: total.co2eScope2Mb,
        scope3: total.co2eScope3,
    };
}

function buildT8Row(metric: string, baselineValue: number, currentValue: number): T8Row {
    const absoluteDelta = currentValue - baselineValue;
    const percentDelta =
        baselineValue !== 0 && Number.isFinite(baselineValue) ? absoluteDelta / baselineValue : 0;
    return { metric, baselineValue, currentValue, absoluteDelta, percentDelta };
}

// ----------------------------------------------------------------
// MAIN ENTRY — buildGhgInventory
// Entrada principal — buildGhgInventory
// ----------------------------------------------------------------

/**
 * Build a complete GHG Protocol inventory report from raw input.
 * Constroi o relatorio completo de inventario GHG Protocol a partir do input.
 *
 * Aggregation pipeline:
 *   1. Filter emission_source elements
 *   2. T1 — gas × scope matrix (excludes biogenic)
 *   3. T2 — biogenic CO2 (separate)
 *   4. T3-T6 — categories per scope
 *   5. T7 — intensity indicators (using totalCo2e)
 *   6. T8 — emitted only when caller invokes {@link compareYearOverYear}
 *
 * @param input - Inventory input contract
 * @returns Immutable report snapshot
 */
export function buildGhgInventory(input: GhgInventoryInput): GhgInventoryReport {
    const generatedAt = new Date().toISOString();

    const t1 = aggregateByGasAndScope(input);
    const t2 = filterBiogenic(input);
    const t3 = aggregateByCategoryAndScope(input, '1');
    const t4 = aggregateByCategoryAndScope(input, '2-loc');
    const t5 = aggregateByCategoryAndScope(input, '2-mb');
    const t6 = aggregateByCategoryAndScope(input, '3');

    const totals = totalsByScope(t1);
    // Total CO2e — sum of scope1, scope2 (use location-based as primary), scope3.
    // Market-based scope 2 is reported alongside for dual reporting per GHG Protocol.
    const totalTCO2e = safeAdd(safeAdd(totals.scope1, totals.scope2Loc), totals.scope3);

    const t7 = computeIntensityIndicators(input, totalTCO2e);

    const report: GhgInventoryReport = {
        coverPage: {
            inventoryYear: input.inventoryYear,
            ...(typeof input.baselineYear === 'number' ? { baselineYear: input.baselineYear } : {}),
            gwpVersion: input.gwpVersion,
            organizationalBoundary: input.organizationalBoundary,
            generatedAt,
        },
        t1_consolidatedByGasAndScope: t1,
        t2_biogenicEmissions: t2,
        t3_scope1ByCategory: t3,
        t4_scope2LocationByCategory: t4,
        t5_scope2MarketBasedByCategory: t5,
        t6_scope3ByCategory: t6,
        t7_intensityIndicators: t7,
        totalTCO2e,
        metadata: {
            generatedAt,
            gwpVersion: input.gwpVersion,
            toolVersion: TOOL_VERSION,
        },
    };
    return report;
}

// ----------------------------------------------------------------
// Re-exports for caller convenience
// Reexports para conveniencia dos consumidores
// ----------------------------------------------------------------

export type { GhgGas, GwpVersion };
export { getGwp, toCo2eq, isGhgGas };
