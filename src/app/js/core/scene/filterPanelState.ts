// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Filter Panel State — pure-logic, zero DOM/three.js
 *
 * Estado imutável (frozen) de filtros para exploração 3D do modelo ambiental.
 * Cada setter retorna NOVO estado congelado; jamais muta o anterior.
 *
 * Filtros suportados (composição AND entre tipos, OR via Set dentro do mesmo tipo):
 *   - family:         Set<string> de family IDs (well, plume, lake, ...)
 *   - parameter:      string única (ex.: "benzeno") ou null
 *   - thresholdRange: { min, max } numérico aplicado a element.value/concentration
 *   - campaign:       Set<string> de campaign IDs
 *   - dateRange:      { from, to } ISO strings, parsing tolerante
 *
 * UX-29 — Phase 2 SPEC_3D_MODEL_EXPLORATION_JOURNEY.
 *
 * @module core/scene/filterPanelState
 */

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

export interface ThresholdRange {
    readonly min: number | null;
    readonly max: number | null;
}

export interface DateRange {
    readonly from: number | null;
    readonly to: number | null;
}

export interface FilterPanelState {
    readonly family: ReadonlySet<string>;
    readonly parameter: string | null;
    readonly thresholdRange: ThresholdRange | null;
    readonly campaign: ReadonlySet<string>;
    readonly dateRange: DateRange | null;
}

export interface FilterSummary {
    readonly activeCount: number;
    readonly description: string;
}

export interface FilterableElement {
    readonly value?: number;
    readonly concentration?: number;
    readonly familyId?: string | null;
    readonly family?: string | null;
    readonly parameter?: string | null;
    readonly param?: string | null;
    readonly campaignId?: string | null;
    readonly campaign?: string | null;
    readonly date?: string | number | Date | null;
    readonly timestamp?: string | number | Date | null;
    readonly observedAt?: string | number | Date | null;
    readonly [key: string]: unknown;
}

export interface ThresholdRangeInput {
    readonly min?: number | null;
    readonly max?: number | null;
}

export interface DateRangeInput {
    readonly from?: string | number | Date | null;
    readonly to?: string | number | Date | null;
}

/**
 * Cria estado inicial vazio (todos os filtros inativos).
 */
export function createFilterState(): FilterPanelState {
    return Object.freeze({
        family: EMPTY_SET,
        parameter: null,
        thresholdRange: null,
        campaign: EMPTY_SET,
        dateRange: null,
    });
}

function freezeState(next: FilterPanelState): FilterPanelState {
    if (next.family) Object.freeze(next.family);
    if (next.campaign) Object.freeze(next.campaign);
    if (next.thresholdRange) Object.freeze(next.thresholdRange);
    if (next.dateRange) Object.freeze(next.dateRange);
    return Object.freeze(next);
}

/**
 * Define o conjunto de famílias selecionadas.
 */
export function setFamilyFilter(
    state: FilterPanelState,
    familyIds: Iterable<string> | null | undefined,
): FilterPanelState {
    if (!state) throw new Error('filterPanelState: state is required');
    const set: ReadonlySet<string> =
        familyIds == null
            ? EMPTY_SET
            : new Set(Array.from(familyIds).filter((id) => typeof id === 'string' && id.length > 0));
    return freezeState({ ...state, family: set });
}

/**
 * Define filtro de parâmetro (ex.: "benzeno"). null/'' limpa.
 */
export function setParameterFilter(state: FilterPanelState, parameter: string | null | undefined): FilterPanelState {
    if (!state) throw new Error('filterPanelState: state is required');
    const p = typeof parameter === 'string' && parameter.trim().length > 0 ? parameter.trim() : null;
    return freezeState({ ...state, parameter: p });
}

/**
 * Define faixa numérica { min, max }. null limpa.
 */
export function setThresholdFilter(
    state: FilterPanelState,
    range: ThresholdRangeInput | null | undefined,
): FilterPanelState {
    if (!state) throw new Error('filterPanelState: state is required');
    if (range == null) return freezeState({ ...state, thresholdRange: null });
    const min = typeof range.min === 'number' && Number.isFinite(range.min) ? range.min : null;
    const max = typeof range.max === 'number' && Number.isFinite(range.max) ? range.max : null;
    if (min == null && max == null) return freezeState({ ...state, thresholdRange: null });
    if (min != null && max != null && min > max) {
        throw new Error('filterPanelState: thresholdRange.min > max');
    }
    return freezeState({ ...state, thresholdRange: { min, max } });
}

/**
 * Define o conjunto de campaign IDs.
 */
export function setCampaignFilter(
    state: FilterPanelState,
    campaignIds: Iterable<string> | null | undefined,
): FilterPanelState {
    if (!state) throw new Error('filterPanelState: state is required');
    const set: ReadonlySet<string> =
        campaignIds == null
            ? EMPTY_SET
            : new Set(Array.from(campaignIds).filter((id) => typeof id === 'string' && id.length > 0));
    return freezeState({ ...state, campaign: set });
}

function parseDateTolerant(value: unknown): number | null {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const t = Date.parse(value);
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

/**
 * Define janela temporal { from, to }. null limpa.
 */
export function setDateRangeFilter(
    state: FilterPanelState,
    range: DateRangeInput | null | undefined,
): FilterPanelState {
    if (!state) throw new Error('filterPanelState: state is required');
    if (range == null) return freezeState({ ...state, dateRange: null });
    const from = parseDateTolerant(range.from);
    const to = parseDateTolerant(range.to);
    if (from == null && to == null) return freezeState({ ...state, dateRange: null });
    if (from != null && to != null && from > to) {
        throw new Error('filterPanelState: dateRange.from > to');
    }
    return freezeState({ ...state, dateRange: { from, to } });
}

/**
 * Limpa todos os filtros, retornando estado vazio.
 */
export function clearFilters(_state?: FilterPanelState): FilterPanelState {
    return createFilterState();
}

function elementValue(el: FilterableElement): number | null {
    if (typeof el.value === 'number') return el.value;
    if (typeof el.concentration === 'number') return el.concentration;
    return null;
}

function elementDate(el: FilterableElement): number | null {
    return parseDateTolerant(el.date ?? el.timestamp ?? el.observedAt ?? null);
}

function matchesFamily(el: FilterableElement, set: ReadonlySet<string>): boolean {
    if (set.size === 0) return true;
    const fam = el.familyId ?? el.family ?? null;
    if (!fam) return false;
    return set.has(fam);
}

function matchesParameter(el: FilterableElement, parameter: string | null): boolean {
    if (!parameter) return true;
    const p = el.parameter ?? el.param ?? null;
    if (!p) return false;
    return p === parameter;
}

function matchesThreshold(el: FilterableElement, range: ThresholdRange | null): boolean {
    if (!range) return true;
    const v = elementValue(el);
    if (v == null) return false;
    if (range.min != null && v < range.min) return false;
    if (range.max != null && v > range.max) return false;
    return true;
}

function matchesCampaign(el: FilterableElement, set: ReadonlySet<string>): boolean {
    if (set.size === 0) return true;
    const c = el.campaignId ?? el.campaign ?? null;
    if (!c) return false;
    return set.has(c);
}

function matchesDate(el: FilterableElement, range: DateRange | null): boolean {
    if (!range) return true;
    const t = elementDate(el);
    if (t == null) return false;
    if (range.from != null && t < range.from) return false;
    if (range.to != null && t > range.to) return false;
    return true;
}

/**
 * Aplica filtros a um array de elementos.
 */
export function applyFilters<T extends FilterableElement>(elements: T[], state: FilterPanelState | null): T[] {
    if (!Array.isArray(elements)) return [];
    if (!state) return elements.slice();
    return elements.filter(
        (el) =>
            el != null &&
            matchesFamily(el, state.family) &&
            matchesParameter(el, state.parameter) &&
            matchesThreshold(el, state.thresholdRange) &&
            matchesCampaign(el, state.campaign) &&
            matchesDate(el, state.dateRange),
    );
}

/**
 * Resumo legível dos filtros ativos.
 */
export function summarizeFilters(state: FilterPanelState | null): FilterSummary {
    if (!state) return { activeCount: 0, description: 'no filters' };
    const parts: string[] = [];
    if (state.family && state.family.size > 0) parts.push(`family(${state.family.size})`);
    if (state.parameter) parts.push(`parameter=${state.parameter}`);
    if (state.thresholdRange) {
        const { min, max } = state.thresholdRange;
        parts.push(`threshold[${min ?? '-∞'}..${max ?? '+∞'}]`);
    }
    if (state.campaign && state.campaign.size > 0) parts.push(`campaign(${state.campaign.size})`);
    if (state.dateRange) {
        const { from, to } = state.dateRange;
        const f = from != null ? new Date(from).toISOString().slice(0, 10) : '-∞';
        const t = to != null ? new Date(to).toISOString().slice(0, 10) : '+∞';
        parts.push(`date[${f}..${t}]`);
    }
    return {
        activeCount: parts.length,
        description: parts.length === 0 ? 'no filters' : parts.join(' AND '),
    };
}
