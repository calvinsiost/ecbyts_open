// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   FILTER PIPELINE — Reusable 2-stage filter + value extraction
   Pipeline reutilizavel de filtros para qualquer modulo analitico

   Extraido de engine.js para permitir reutilizacao por modulos
   standalone (hypothesis test, background analysis, MAC curve)
   sem depender do calculator engine completo.
   ================================================================ */
import { getAllElements } from '../elements/manager.js';
import { findContainedElements } from '../../utils/edges/manager.js';
import { CONFIG } from '../../config.js';
import { convert } from '../units/converter.js';
import { getVariableValue, inferVariablesFromFamily } from './contextResolver.js';
import { buildAggregationKey } from '../eis/weightedGovernance.js';
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// MAIN FILTER PIPELINE
// 2-stage: element filters → observation filters (incl. variable)
// ----------------------------------------------------------------
/**
 * Apply all filters from a config object with filters[] array.
 * Pipeline 2-stage: element-level → observation-level.
 *
 * @param {{ filters: Array<*> }} config - Object with filters array
 * @returns {{ elements: Array<*>, observations: Array<*> }}
 */
export function applyFilters(config: AnyRecord) {
    let elements = getAllElements();
    // Stage 1: element-level filters
    const elFilters = (config.filters || []).filter((f: any) => ['family', 'element', 'area'].includes(f.dimension));
    for (const filter of elFilters) {
        elements = applyElementFilter(elements, filter);
    }
    // Collect observations from filtered elements
    /** @type {any[]} */
    let observations = [];
    for (const _el of elements) {
        const el = (_el);
        const obs = el.data?.observations || [];
        observations.push(...obs.map((o: any) => ({
            ...o,
            _elementId: el.id,
            _elementName: el.name,
            _elementFamily: el.family,
            _variables: o.variables || inferVariablesFromFamily(el.family)
        })));
    }
    // Stage 2: observation-level filters
    const obsFilters = (config.filters || []).filter((f: any) => ['parameter', 'campaign', 'category', 'variable', 'aggregation_key'].includes(f.dimension));
    for (const filter of obsFilters) {
        observations = applyObservationFilter(observations, filter);
    }
    return { elements, observations };
}
// ----------------------------------------------------------------
// ELEMENT FILTERS
// ----------------------------------------------------------------
/**
 * Apply a single element-level filter.
 * @param {Array<*>} elements
 * @param {*} filter - { dimension, operator, value }
 * @returns {Array<*>}
 */
export function applyElementFilter(elements: any[], filter: AnyRecord) {
    const { dimension, operator, value } = filter;
    if (!value || (Array.isArray(value) && value.length === 0))
        return elements;
    if (dimension === 'family') {
        return matchFilter(elements, (el: any) => el.family, operator, value);
    }
    if (dimension === 'element') {
        return matchFilter(elements, (el: any) => el.id, operator, value);
    }
    if (dimension === 'area') {
        const areaIds = Array.isArray(value) ? value : [value];
        const containedIds = new Set();
        for (const areaId of areaIds) {
            for (const id of findContainedElements(areaId)) {
                containedIds.add(id);
            }
        }
        if (operator === 'is' || operator === 'in') {
            return elements.filter((el: any) => containedIds.has(el.id));
        }
        return elements.filter((el: any) => !containedIds.has(el.id));
    }
    return elements;
}
// ----------------------------------------------------------------
// OBSERVATION FILTERS
// ----------------------------------------------------------------
/**
 * Apply a single observation-level filter.
 * @param {Array<*>} observations
 * @param {*} filter - { dimension, operator, value, variableId? }
 * @returns {Array<*>}
 */
export function applyObservationFilter(observations: any[], filter: AnyRecord) {
    const { dimension, operator, value } = filter;
    if (!value || (Array.isArray(value) && value.length === 0))
        return observations;
    if (dimension === 'parameter') {
        return matchFilter(observations, (o: any) => o.parameterId, operator, value);
    }
    if (dimension === 'campaign') {
        return matchFilter(observations, (o: any) => o.campaignId, operator, value);
    }
    if (dimension === 'category') {
        return matchFilter(observations, (o: any) => {
            const param = CONFIG.PARAMETERS?.find((p: any) => p.id === o.parameterId);
            return param?.category || '';
        }, operator, value);
    }
    if (dimension === 'variable') {
        const varId = filter.variableId;
        if (!varId)
            return observations;
        return matchFilter(observations, (o: any) => {
            return getVariableValue(o._variables || o.variables, varId);
        }, operator, value);
    }
    if (dimension === 'aggregation_key') {
        const keys = new Set((Array.isArray(value) ? value : [value]).map((v: any) => String(v || '').toLowerCase()));
        const include = operator === 'is' || operator === 'in';
        return observations.filter((o: any) => {
            const hasMatch = buildObservationAggregationKeys(o).some((k: string) => keys.has(k));
            return include ? hasMatch : !hasMatch;
        });
    }
    return observations;
}
/**
 * Build aggregation keys from observation + attached element context.
 * Keys follow `scope:key` convention from weighted governance runtime.
 *
 * @param {*} obs
 * @returns {string[]}
 */
export function buildObservationAggregationKeys(obs: any) {
    /** @type {string[]} */
    const keys: string[] = [];
    if (!obs || typeof obs !== 'object')
        return keys;
    if (obs.campaignId)
        keys.push(buildAggregationKey('campaign', obs.campaignId));
    if (obs.parameterId)
        keys.push(buildAggregationKey('parameter', obs.parameterId));
    if (obs._elementId)
        keys.push(buildAggregationKey('element', obs._elementId));
    if (obs._elementFamily)
        keys.push(buildAggregationKey('family', obs._elementFamily));
    if (obs.groupId)
        keys.push(buildAggregationKey('group', obs.groupId));
    if (obs.matrix)
        keys.push(buildAggregationKey('matrix', obs.matrix));
    return [...new Set(keys)];
}
// ----------------------------------------------------------------
// GENERIC FILTER MATCHER
// ----------------------------------------------------------------
/**
 * Generic filter matcher - is/is_not/in/not_in.
 * @param {Array<*>} items
 * @param {Function} accessor - extracts value from item
 * @param {string} operator
 * @param {*} value
 * @returns {Array<*>}
 */
export function matchFilter(items: any[], accessor: (item: any) => any, operator: any, value: any) {
    const vals = Array.isArray(value) ? value : [value];
    switch (operator) {
        case 'is':
            return items.filter((item: any) => vals.includes(accessor(item)));
        case 'is_not':
            return items.filter((item: any) => !vals.includes(accessor(item)));
        case 'in':
            return items.filter((item: any) => vals.includes(accessor(item)));
        case 'not_in':
            return items.filter((item: any) => !vals.includes(accessor(item)));
        default:
            return items;
    }
}
// ----------------------------------------------------------------
// VALUE EXTRACTION (with unit conversion)
// ----------------------------------------------------------------
/**
 * Extract numeric values from observations with optional unit conversion.
 * Extrai valores numericos com conversao de unidade.
 *
 * @param {Array<*>} observations
 * @param {string} [targetUnitId] - Target unit for conversion
 * @returns {Array<{ value: number, date: string, campaignId: string }>}
 */
export function extractValues(observations: any[], targetUnitId?: any) {
    /** @type {any[]} */
    const values = [];
    for (const obs of observations) {
        if (obs.value == null || isNaN(obs.value))
            continue;
        let v = Number(obs.value);
        if (targetUnitId && obs.unitId && obs.unitId !== targetUnitId) {
            const result = convert(v, obs.unitId, targetUnitId);
            if (result.success)
                v = result.value ?? v;
        }
        values.push({ value: v, date: obs.date, campaignId: obs.campaignId });
    }
    return values;
}
/**
 * Build paired data for two campaigns.
 * Para cada elemento, extrai media de valores na campanha A e campanha B.
 * Usado por testes de hipotese pareados.
 *
 * @param {Array<*>} elements - Filtered elements
 * @param {Array<*>} observations - Filtered observations
 * @param {string} campaignA - Campaign A id
 * @param {string} campaignB - Campaign B id
 * @param {string} [unitId] - Target unit for conversion
 * @returns {Array<{ x: number, y: number, elementId: string, elementName: string }>}
 */
export function buildPairedData(elements: any[], observations: any[], campaignA: any, campaignB: any, unitId?: any) {
    /** @type {any[]} */
    const pairs = [];
    for (const _el of elements) {
        const el = (_el);
        const elObs = observations.filter((o: any) => o._elementId === el.id);
        const obsA = elObs.filter((o: any) => o.campaignId === campaignA);
        const obsB = elObs.filter((o: any) => o.campaignId === campaignB);
        const valsA = extractValues(obsA, unitId).map((v: any) => v.value);
        const valsB = extractValues(obsB, unitId).map((v: any) => v.value);
        if (valsA.length === 0 || valsB.length === 0)
            continue;
        const meanA = valsA.reduce((a: number, b: number) => a + b, 0) / valsA.length;
        const meanB = valsB.reduce((a: number, b: number) => a + b, 0) / valsB.length;
        pairs.push({ x: meanA, y: meanB, elementId: el.id, elementName: el.name });
    }
    return pairs;
}
//# sourceMappingURL=filterPipeline.js.map
//# sourceMappingURL=filterPipeline.js.map
