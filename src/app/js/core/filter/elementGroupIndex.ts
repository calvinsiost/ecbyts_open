// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FILTER ELEMENT GROUP INDEX — índice de observações por grupo
   FEAT-FILTER-RADAR-001 §3.4 (Modelo de Dados)

   Constrói índice O(1) que mapeia `groupId -> Array<observation>` para
   renderização rápida do radar HUD. Coleta observations de todos os
   elementos do modelo e agrupa por classificação do parametro via
   radarConfig.findGroupForParameter().

   Pure function — não muta input, retorna structure nova.
   ================================================================ */

import { mergeGroups, findGroupForParameter } from './radarConfig.js';
import { aggregate } from './aggregations.js';

/**
 * Extrai valor numérico de uma observation, considerando shape { value } ou valor direto.
 */
function extractValue(obs: any): number | null {
    if (obs == null) return null;
    if (typeof obs === 'number') return Number.isFinite(obs) ? obs : null;
    if (typeof obs === 'object') {
        const v = Number(obs.value);
        return Number.isFinite(v) ? v : null;
    }
    return null;
}

interface GroupIndexBucket {
    id: string;
    labelKey: string;
    color: string;
    order: number;
    valuesByParam: Record<string, number[]>;
    allValues: number[];
    observationCount: number;
}

interface BuildGroupIndexResult {
    groups: Array<GroupIndexBucket>;
    totalObservations: number;
    unmatchedObservations: number;
}

interface BuildGroupIndexOpts {
    customGroups?: Array<Record<string, any>>;
    filterElementIds?: Array<string>;
    parameterResolver?: (obs: any, el: any) => any;
}

/**
 * Constrói índice de observations por grupo para um conjunto de elementos.
 *
 * @param elements - Array de elementos com observations[]
 */
export function buildGroupIndex(
    elements: Array<Record<string, any>>,
    opts: BuildGroupIndexOpts = {},
): BuildGroupIndexResult {
    const allGroups = mergeGroups(opts.customGroups);
    const index = new Map<string, GroupIndexBucket>();
    for (const g of allGroups) {
        index.set(g.id, {
            id: g.id,
            labelKey: g.labelKey,
            color: g.color,
            order: g.order,
            valuesByParam: {},
            allValues: [],
            observationCount: 0,
        });
    }

    const safeElements = Array.isArray(elements) ? elements : [];
    const filterIds = Array.isArray(opts.filterElementIds) ? new Set(opts.filterElementIds) : null;
    const resolver = typeof opts.parameterResolver === 'function' ? opts.parameterResolver : null;

    let total = 0;
    let unmatched = 0;

    for (const _el of safeElements) {
        const el = _el as any;
        if (!el || typeof el !== 'object') continue;
        if (filterIds && !filterIds.has(el.id)) continue;
        const obs = Array.isArray(el.observations) ? el.observations : [];
        for (const o of obs) {
            total++;
            const paramId = resolver ? resolver(o, el) : o?.parameterType || o?.parameter || o?.parameterId;
            if (!paramId) {
                unmatched++;
                continue;
            }
            const group = findGroupForParameter(paramId);
            // Considera também grupos custom via allGroups lookup
            const targetId = group?.id || _matchCustom(paramId, allGroups);
            if (!targetId || !index.has(targetId)) {
                unmatched++;
                continue;
            }
            const bucket = index.get(targetId) as GroupIndexBucket;
            const value = extractValue(o);
            if (value === null) continue;
            bucket.observationCount++;
            bucket.allValues.push(value);
            if (!bucket.valuesByParam[paramId]) bucket.valuesByParam[paramId] = [];
            bucket.valuesByParam[paramId].push(value);
        }
    }

    return {
        groups: Array.from(index.values()).sort((a, b) => a.order - b.order),
        totalObservations: total,
        unmatchedObservations: unmatched,
    };
}

function _matchCustom(paramId: any, allGroups: any): string | null {
    for (const g of allGroups) {
        if (Array.isArray(g.parameters) && g.parameters.includes(paramId)) return g.id;
    }
    return null;
}

/**
 * Computa valores agregados por grupo para renderização do radar.
 * Aplica função de agregação (mean/median/max/min/p95/stdev) a cada grupo.
 */
export function computeAggregatedRadar(
    indexResult: ReturnType<typeof buildGroupIndex>,
    aggregationId: string = 'mean',
): Array<{ id: any; labelKey: any; color: any; order: any; aggregatedValue: number | null; count: number }> {
    if (!indexResult || !Array.isArray(indexResult.groups)) return [];
    return indexResult.groups.map(
        (g: any) =>
            ({
                id: g.id,
                labelKey: g.labelKey,
                color: g.color,
                order: g.order,
                aggregatedValue: aggregate(g.allValues, aggregationId),
                count: g.observationCount,
            }) as any,
    );
}

/**
 * Drill-down: para um groupId, retorna breakdown por parâmetro individual.
 */
export function drillDownGroup(
    indexResult: ReturnType<typeof buildGroupIndex>,
    groupId: string,
    aggregationId: string = 'mean',
): Array<{ parameter: any; aggregatedValue: any; count: any; values: any }> {
    if (!indexResult || !Array.isArray(indexResult.groups) || !groupId) return [];
    const group = indexResult.groups.find((g) => g.id === groupId);
    if (!group) return [];
    return Object.entries(group.valuesByParam)
        .map(([paramId, _values]) => {
            const values = _values as any[];
            return {
                parameter: paramId,
                aggregatedValue: aggregate(values, aggregationId),
                count: values.length,
                values: values.slice(),
            } as any;
        })
        .sort(
            (a: any, b: any) =>
                (b.aggregatedValue ?? -Infinity) - (a.aggregatedValue ?? -Infinity),
        );
}
