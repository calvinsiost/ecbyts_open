// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Data Studio - Advanced Aggregation Engine
 * Motor de agregação avançado com suporte a agrupamento por parâmetro/família/campanha.
 * P1-40: groupBy parameter/family/campaign + 7 aggregation functions.
 */

type AggFunc = 'mean' | 'median' | 'min' | 'max' | 'count' | 'sum' | 'stddev';
type GroupByKey = 'parameter' | 'family' | 'campaign';

interface AggObservation {
    parameter: string;
    value: number;
    elementId: string;
    familyId?: string;
    campaignId?: string;
}

/**
 * Agrupa observações por uma chave de agrupamento.
 * Groups observations by a grouping key.
 *
 * @param observations
 * @param groupBy - Campo de agrupamento
 * @returns chave → array de valores
 */
export function groupObservations(
    observations: AggObservation[],
    groupBy: GroupByKey,
): Map<string, number[]> {
    const groups = new Map<string, number[]>();
    // Mapeia o campo de agrupamento para a propriedade correspondente da observação
    const fieldMap = {
        parameter: 'parameter',
        family: 'familyId',
        campaign: 'campaignId',
    };
    const field: string = (fieldMap as Record<string, string>)[groupBy] ?? groupBy;
    for (const obs of observations) {
        const key = (obs as any)[field] ?? 'unknown';
        if (!groups.has(key)) groups.set(key, []);
        (groups.get(key) as number[]).push(obs.value);
    }
    return groups;
}

/**
 * Aplica função de agregação em cada grupo.
 * Applies aggregation function to each group.
 *
 * @param groups - Mapa de grupos
 * @param aggFunc - Função de agregação
 * @returns Resultados ordenados por chave
 */
export function aggregateGroups(
    groups: Map<string, number[]>,
    aggFunc: AggFunc,
): Array<{ key: string; value: number; count: number }> {
    const results: Array<{ key: string; value: number; count: number }> = [];
    for (const [key, values] of groups) {
        results.push({
            key,
            value: applyAggregation(values, aggFunc),
            count: values.length,
        });
    }
    return results.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Aplica uma função de agregação a um array de valores numéricos.
 * Applies an aggregation function to a numeric array.
 *
 * @param values - Valores numéricos
 * @param func - Função
 * @returns Resultado da agregação
 */
export function applyAggregation(values: number[], func: AggFunc): number {
    if (!values || !values.length) return 0;
    switch (func) {
        case 'mean':
            return values.reduce((a, b) => a + b, 0) / values.length;
        case 'median': {
            const s = [...values].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
        }
        case 'min':
            return Math.min(...values);
        case 'max':
            return Math.max(...values);
        case 'count':
            return values.length;
        case 'sum':
            return values.reduce((a, b) => a + b, 0);
        case 'stddev': {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
            return Math.sqrt(variance);
        }
        default:
            return 0;
    }
}

/**
 * Pipeline completo: observações → grupos → resultados agregados.
 * Full pipeline: observations → groups → aggregated results.
 *
 * @param observations - Array de observações
 * @param options
 */
export function runAggregationPipeline(
    observations: Array<object>,
    { groupBy = 'parameter', aggFunc = 'mean' }: { groupBy?: GroupByKey; aggFunc?: string } = {},
): Array<{ key: string; value: number; count: number }> {
    const groups = groupObservations(observations as any, groupBy);
    return aggregateGroups(groups, aggFunc as any);
}
