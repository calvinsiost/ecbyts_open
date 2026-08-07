// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CAMPAIGN AGGREGATION — navegação temporal "<"/">" entre campanhas +
   agregação de observações por fator (Calvin 2026-06-14, GRAPH-KPI-001).

   O grafo de Relações colore os nós por severidade (compliance). Por padrão a
   severidade considera TODAS as observações. Estes helpers permitem:
   (a) navegar entre campanhas no MESMO gráfico ("<"/">"), escopando a
       severidade a uma campanha específica;
   (b) AGREGAR múltiplas observações por parâmetro num único valor representativo
       (média/mediana/primeiro/último/mín/máx) antes de avaliar o limite.

   Pure: sem DOM, sem mutação. Determinístico. A avaliação de limite (matrix +
   thresholds) fica em core/elements/complianceOverlay.ts, que consome
   groupAndAggregateObservations daqui.
   ================================================================ */

export type AggregationFactor = 'last' | 'first' | 'mean' | 'median' | 'min' | 'max';

/** Ordem canônica para a UI (último = default: estado mais recente). */
export const AGGREGATION_FACTORS: ReadonlyArray<AggregationFactor> = Object.freeze([
    'last',
    'first',
    'mean',
    'median',
    'min',
    'max',
]);

export const DEFAULT_AGGREGATION: AggregationFactor = 'last';

export interface ObservationLike {
    readonly parameterId?: string;
    readonly value?: unknown;
    readonly campaignId?: string;
    readonly variables?: Record<string, unknown>;
    readonly sampleDate?: string;
    readonly date?: string;
    readonly timestamp?: string | number;
    readonly [key: string]: unknown;
}

/**
 * Agrega um vetor de valores numéricos por fator. Ignora não-finitos.
 * 'first'/'last' operam na ORDEM dada (caller ordena cronologicamente).
 * Retorna null se não houver valor finito.
 */
export function aggregateValues(values: ReadonlyArray<number>, factor: AggregationFactor): number | null {
    const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return null;
    // nums.length > 0 garantido pelo guard acima → índices presentes (`!`).
    switch (factor) {
        case 'first':
            return nums[0]!;
        case 'last':
            return nums[nums.length - 1]!;
        case 'min':
            return Math.min(...nums);
        case 'max':
            return Math.max(...nums);
        case 'mean':
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'median': {
            const sorted = nums.slice().sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
        }
        default:
            return nums[nums.length - 1]!;
    }
}

/** Resolve uma data ordenável da observação (sampleDate > date > timestamp). */
export function resolveObservationOrder(obs: ObservationLike): number {
    const raw = obs?.sampleDate ?? obs?.date ?? obs?.timestamp;
    if (raw == null) return Number.NEGATIVE_INFINITY;
    const ts = typeof raw === 'number' ? raw : Date.parse(String(raw));
    return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}

/** Chave de agrupamento estável: parâmetro + variáveis (matriz depende delas). */
function _groupKey(obs: ObservationLike): string {
    const pid = String(obs?.parameterId ?? '');
    let vars = '';
    try {
        const v = obs?.variables;
        if (v && typeof v === 'object') {
            vars = Object.keys(v)
                .sort()
                .map((k) => `${k}=${String((v as any)[k])}`)
                .join('&');
        }
    } catch {
        vars = '';
    }
    return `${pid}|${vars}`;
}

/**
 * Agrupa observações por (parâmetro + variáveis) e colapsa cada grupo num único
 * valor representativo conforme o fator. Ordena cada grupo cronologicamente
 * antes de aplicar 'first'/'last'. Retorna observações sintéticas (uma por
 * grupo) prontas para avaliação de limite. Observações sem parameterId ou sem
 * valor finito são descartadas.
 */
export function groupAndAggregateObservations(
    observations: ReadonlyArray<ObservationLike>,
    factor: AggregationFactor,
): ObservationLike[] {
    const groups = new Map<string, ObservationLike[]>();
    for (const obs of observations || []) {
        if (!obs || obs.parameterId == null) continue;
        const val = typeof obs.value === 'number' ? obs.value : Number(obs.value);
        if (!Number.isFinite(val)) continue;
        const key = _groupKey(obs);
        const arr = groups.get(key) || [];
        arr.push(obs);
        groups.set(key, arr);
    }
    const result: ObservationLike[] = [];
    for (const arr of groups.values()) {
        const sorted = arr
            .slice()
            .sort((a, b) => resolveObservationOrder(a) - resolveObservationOrder(b));
        const values = sorted.map((o) => Number(o.value));
        const agg = aggregateValues(values, factor);
        if (agg == null) continue;
        // observação sintética: herda parameterId/variables do representante
        // (último cronológico), substitui value pelo agregado.
        const rep = sorted[sorted.length - 1];
        result.push(Object.freeze({ ...rep, value: agg, __aggregated: true, __aggFactor: factor }));
    }
    return result;
}

/** Filtra observações por campanha (null/undefined → todas). */
export function selectObservationsForCampaign(
    observations: ReadonlyArray<ObservationLike>,
    campaignId: string | null | undefined,
): ObservationLike[] {
    if (!campaignId) return (observations || []).slice();
    return (observations || []).filter((o) => o?.campaignId === campaignId);
}

// ----------------------------------------------------------------
// NAVEGAÇÃO "<"/">" ENTRE CAMPANHAS
// Sequência: [campanha 0] [campanha 1] ... [campanha N-1] [Todas (agregado)]
// índice `total` = posição "Todas".
// ----------------------------------------------------------------

export interface CampaignLike {
    readonly id?: string;
    readonly name?: string;
    readonly [key: string]: unknown;
}

export interface CampaignNavState {
    readonly index: number;
    readonly total: number;
    readonly mode: 'single' | 'all';
    readonly campaignId: string | null;
    readonly label: string;
    readonly canPrev: boolean;
    readonly canNext: boolean;
    /** Posição 1-based só para exibição (ex.: "2 / 5"); 0 quando "all". */
    readonly position: number;
}

/**
 * Resolve o estado de navegação para um índice. Índice `total` = "Todas".
 * Clampa a [0, total]. `allLabel` é o rótulo da posição agregada.
 */
export function resolveCampaignNavState(
    campaigns: ReadonlyArray<CampaignLike>,
    index: number,
    opts: { allLabel?: string } = {},
): CampaignNavState {
    const list = Array.isArray(campaigns) ? campaigns : [];
    const total = list.length;
    const allLabel = opts.allLabel || 'Todas (agregado)';
    if (total === 0) {
        return Object.freeze({
            index: 0,
            total: 0,
            mode: 'all',
            campaignId: null,
            label: allLabel,
            canPrev: false,
            canNext: false,
            position: 0,
        });
    }
    const i = Math.max(0, Math.min(Number.isFinite(index) ? Math.floor(index) : total, total));
    if (i === total) {
        return Object.freeze({
            index: total,
            total,
            mode: 'all',
            campaignId: null,
            label: allLabel,
            canPrev: true,
            canNext: false,
            position: 0,
        });
    }
    const c = list[i] || {};
    return Object.freeze({
        index: i,
        total,
        mode: 'single',
        campaignId: c.id != null ? String(c.id) : null,
        label: String(c.name || `Campanha ${i + 1}`),
        canPrev: i > 0,
        canNext: i < total,
        position: i + 1,
    });
}

/** Passo de navegação clampado a [0, total]. dir: -1 (anterior) | +1 (próximo). */
export function stepCampaignIndex(index: number, total: number, dir: number): number {
    const t = Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
    const i = Number.isFinite(index) ? Math.floor(index) : t;
    const step = dir < 0 ? -1 : 1;
    return Math.max(0, Math.min(i + step, t));
}

/** Rótulo i18n-friendly de cada fator (chave + fallback). */
export function aggregationFactorLabelKey(factor: AggregationFactor): { key: string; fallback: string } {
    const map: Record<AggregationFactor, string> = {
        last: 'Último',
        first: 'Primeiro',
        mean: 'Média',
        median: 'Mediana',
        min: 'Mínimo',
        max: 'Máximo',
    };
    return { key: `actionsRelations.agg_${factor}`, fallback: map[factor] || factor };
}
