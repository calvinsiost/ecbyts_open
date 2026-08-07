// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Metric Sizing - Phase 1 pure logic
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md
 *
 * Phase 1 (2026-04-30) - pure logic helpers para dimensionar nós do
 * constellation graph baseado em métricas (violations, observations,
 * EIS score, etc.). Wire-up em UI é Phase 2 (browser-required).
 *
 * 5 métricas canônicas:
 *   - violations: contagem de exceedances (VI/CMA, VP, VR) por elemento
 *   - observation_count: total de observações
 *   - eis_score: score EIS atual do elemento
 *   - connectivity: degree de conectividade no grafo
 *   - uncertainty_aggregated: incerteza agregada
 *
 * Estratégia de sizing:
 *   - Normalização por rank percentil (default - robusta a outliers)
 *   - Linear scale (legível)
 *   - Logarítmica (fallback para distribuições skewed)
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Métricas canônicas suportadas. */
export const CONSTELLATION_METRICS = Object.freeze({
    VIOLATIONS: 'violations',
    OBSERVATION_COUNT: 'observation_count',
    EIS_SCORE: 'eis_score',
    CONNECTIVITY: 'connectivity',
    UNCERTAINTY_AGGREGATED: 'uncertainty_aggregated',
});

/** Estratégias de scaling. */
export const SIZING_STRATEGIES = Object.freeze({
    PERCENTILE: 'percentile',
    LINEAR: 'linear',
    LOGARITHMIC: 'logarithmic',
});

/** Bounds default para raio de nó (px). */
export const DEFAULT_RADIUS_BOUNDS = Object.freeze({ min: 4, max: 24 });

/**
 * Calcula valor da métrica para um elemento.
 *
 * @param {Record<string, any> | null | undefined} element - element com obs, eis, etc.
 * @param {string} any> - uma de CONSTELLATION_METRICS
 * @returns {number} valor numérico (>=0); 0 se não computável
 */
export function computeMetricValue(element: Record<string, any> | null | undefined, metric: string): number {
    if (!element || typeof element !== 'object') return 0;

    switch (metric) {
        case CONSTELLATION_METRICS.VIOLATIONS: {
            const obs = Array.isArray(element.observations) ? element.observations : [];
            return obs.filter(
                /** @param {Record<string, any> | null | undefined} value */
                (o) => !!o && (o.exceedsVI || o.exceedsCMA || o.exceedsVP || o.exceedsVR),
            ).length;
        }
        case CONSTELLATION_METRICS.OBSERVATION_COUNT:
            return Array.isArray(element.observations) ? element.observations.length : 0;
        case CONSTELLATION_METRICS.EIS_SCORE: {
            const score = element.eisScore ?? element.eis?.score ?? null;
            return Number.isFinite(score) ? Math.max(0, (score) as number) : 0;
        }
        case CONSTELLATION_METRICS.CONNECTIVITY:
            return Number.isFinite(element.degree) ? Math.max(0, element.degree) : 0;
        case CONSTELLATION_METRICS.UNCERTAINTY_AGGREGATED: {
            const obs = Array.isArray(element.observations) ? element.observations : [];
            if (obs.length === 0) return 0;
            const uncertainties = (
                obs
                    .map(
                        /** @param {Record<string, any> | null | undefined} value */
                        (o) => Number(o?.uncertainty ?? 0),
                    )
                    .filter(
                        /** @param {number} u */
                        (u) => Number.isFinite(u) && u >= 0,
                    )
            ) as number[];
            if (uncertainties.length === 0) return 0;
            return (
                uncertainties.reduce(
                    /**
                     * @param {number} a
                     * @param {number} b
                     */
                    (a, b) => a + b,
                    0,
                ) / uncertainties.length
            );
        }
        default:
            return 0;
    }
}

/**
 * Computa percentil de um valor num array (0-1).
 *
 * @param {number} value
 * @param {ReadonlyArray<number>} value - array ordenado ASC
 * @returns {number} 0-1
 */
export function computePercentile(value: number, sortedAsc: ReadonlyArray<number>): number {
    if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return 0;
    if (!Number.isFinite(value)) return 0;
    let count = 0;
    for (const v of sortedAsc) {
        if (v <= value) count++;
        else break;
    }
    return count / sortedAsc.length;
}

/**
 * Mapeia percentil [0,1] para raio em [min, max].
 *
 * @param {number} percentile
 * @param {{min: number, max: number}} [bounds]
 * @returns {number}
 */
export function percentileToRadius(percentile: number, bounds: {min: number, max: number} = DEFAULT_RADIUS_BOUNDS): number {
    const { min, max } = bounds;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return min || 0;
    const clamped = Math.max(0, Math.min(1, percentile));
    return min + clamped * (max - min);
}

/**
 * Mapeia valor linear para raio em [min, max] dado [valueMin, valueMax].
 *
 * @param {number} value
 * @param {number} valueMin
 * @param {number} valueMax
 * @param {{min: number, max: number}} [bounds]
 * @returns {number}
 */
export function linearToRadius(value: number, valueMin: number, valueMax: number, bounds: {min: number, max: number} = DEFAULT_RADIUS_BOUNDS): number {
    const { min, max } = bounds;
    if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax) || valueMin >= valueMax) return min;
    if (!Number.isFinite(value)) return min;
    const clamped = Math.max(valueMin, Math.min(valueMax, value));
    const ratio = (clamped - valueMin) / (valueMax - valueMin);
    return min + ratio * (max - min);
}

/**
 * Mapeia valor via log para raio em [min, max].
 * Tolera value=0 via log(1+x) shift.
 *
 * @param {number} value
 * @param {number} valueMax
 * @param {{min: number, max: number}} [bounds]
 * @returns {number}
 */
export function logarithmicToRadius(value: number, valueMax: number, bounds: {min: number, max: number} = DEFAULT_RADIUS_BOUNDS): number {
    const { min, max } = bounds;
    if (!Number.isFinite(valueMax) || valueMax <= 0) return min;
    if (!Number.isFinite(value) || value < 0) return min;
    const numerator = Math.log1p(value);
    const denominator = Math.log1p(valueMax);
    if (denominator === 0) return min;
    const ratio = Math.max(0, Math.min(1, numerator / denominator));
    return min + ratio * (max - min);
}

/**
 * Escolhe estratégia automaticamente baseada na distribuição.
 * Skew >2 ou max/median >100 → logarithmic; senão → percentile.
 *
 * @param {ReadonlyArray<number>} values
 * @returns {string} estratégia recomendada
 */
export function pickStrategy(values: ReadonlyArray<number>): string {
    if (!Array.isArray(values) || values.length === 0) return SIZING_STRATEGIES.PERCENTILE;
    const sorted = [...values].filter(Number.isFinite).sort(
        /**
         * @param {number} a
         * @param {number} b
         */
        (a, b) => a - b,
    );
    if (sorted.length === 0) return SIZING_STRATEGIES.PERCENTILE;

    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];

    if (median > 0 && max / median > 100) return SIZING_STRATEGIES.LOGARITHMIC;
    if (max > 1000 && median < 10) return SIZING_STRATEGIES.LOGARITHMIC;
    return SIZING_STRATEGIES.PERCENTILE;
}

/**
 * Computa raios para todos os elementos baseado na métrica + estratégia.
 *
 * @param {ReadonlyArray<Record<string, any>>} elements
 * @param {string} metric - CONSTELLATION_METRICS
 * @param {{strategy?: string, bounds?: {min: number, max: number}}} [options]
 * @returns {Map<string, {value: number, radius: number}>} - element id → metric data
 */
export function computeNodeRadii(elements: ReadonlyArray<Record<string, any>>, metric: string, options: {strategy?: string, bounds?: {min: number, max: number}} = {}): Map<string, {value: number, radius: number}> {
    
    const result: Map<string, {value: number, radius: number}>= new Map();
    if (!Array.isArray(elements) || elements.length === 0) return result;
    const bounds = options.bounds || DEFAULT_RADIUS_BOUNDS;

    // Compute values
    
    const valuesByElement: Map<string, number>= new Map();
    for (const el of elements) {
        if (!el || el.id == null) continue;
        const value = computeMetricValue(el, metric);
        valuesByElement.set(String(el.id), value);
    }

    const allValues = [...valuesByElement.values()];
    if (allValues.length === 0) return result;

    const strategy = options.strategy || pickStrategy(allValues);
    const sortedAsc = [...allValues].sort(
        /**
         * @param {number} metric
         * @param {number} any>>
         */
        (a, b) => a - b,
    );
    const valueMin = sortedAsc[0] ?? 0;
    const valueMax = sortedAsc[sortedAsc.length - 1] ?? 0;

    for (const [id, value] of valuesByElement) {
        
        let radius: number;
        if (strategy === SIZING_STRATEGIES.LOGARITHMIC) {
            radius = logarithmicToRadius(value, valueMax, bounds);
        } else if (strategy === SIZING_STRATEGIES.LINEAR) {
            radius = linearToRadius(value, valueMin, valueMax, bounds);
        } else {
            const pct = computePercentile(value, sortedAsc);
            radius = percentileToRadius(pct, bounds);
        }
        result.set(id, { value, radius });
    }

    return result;
}

/**
 * Sumário estatístico para UI tooltip / debug.
 *
 * @param {ReadonlyArray<Record<string, any>>} metric
 * @param {string} metric
 * @returns {{count: number, min: number, max: number, median: number, sum: number}}
 */
export function summarizeMetric(elements: ReadonlyArray<Record<string, any>>, metric: string): {count: number, min: number, max: number, median: number, sum: number} {
    
    const values: number[]= [];
    if (Array.isArray(elements)) {
        for (const el of elements) {
            const v = computeMetricValue(el, metric);
            if (Number.isFinite(v)) values.push(v);
        }
    }
    if (values.length === 0) return { count: 0, min: 0, max: 0, median: 0, sum: 0 };

    const sorted = [...values].sort(
        /**
         * @param {number} a
         * @param {number} b
         */
        (a, b) => a - b,
    );
    return {
        count: sorted.length,
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        median: sorted[Math.floor(sorted.length / 2)] ?? 0,
        sum: sorted.reduce(
            /**
             * @param {number} a
             * @param {number} b
             */
            (a, b) => a + b,
            0,
        ),
    };
}

/**
 * Module identity export.
 */
export const constellationMetricSizingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: 1,
    deliveredAt: '2026-04-30',
    metrics: Object.values(CONSTELLATION_METRICS),
    strategies: Object.values(SIZING_STRATEGIES),
    exports: [
        'computeMetricValue',
        'computePercentile',
        'percentileToRadius',
        'linearToRadius',
        'logarithmicToRadius',
        'pickStrategy',
        'computeNodeRadii',
        'summarizeMetric',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
