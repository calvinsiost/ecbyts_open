// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CALCULATOR ENGINE — Generic filter + metric + rule pipeline
   Motor de calculo generico para metricas, regras compostas e ratios

   Reutiliza o mesmo pattern do ticker/manager.js (2-stage filter)
   mas adiciona:
   - Dimensao 'variable' para filtrar por OBSERVATION_VARIABLES
   - Regras compostas (AND/OR com thresholds)
   - Ratios entre parametros
   ================================================================ */
import { getAllElements } from '../elements/manager.js';
import { findContainedElements } from '../../utils/edges/manager.js';
import { CONFIG } from '../../config.js';
import { convert } from '../units/converter.js';
import { calculatorMean, calculatorMannKendall } from './_calculatorStatisticsPure.js';
import { getVariableValue, inferVariablesFromFamily } from './contextResolver.js';
import { getUserConstantById } from '../constants/manager.js';
import { createUValue } from '../uncertainty/primitive.js';
import { propagate } from '../uncertainty/propagation.js';
import { resolveCustomHandler } from './customHandlers.js';
type AnyRecord = Record<string, any>;
/**
 * @typedef {Record<string, any>} AnyRecord
 * @typedef {{ id?: string, name?: string, family?: string, data?: AnyRecord, [key: string]: any }} ElementRecord
 * @typedef {{ dimension?: string, operator?: string, value?: any, variableId?: string, [key: string]: any }} FilterRecord
 * @typedef {{ parameterId?: string, campaignId?: string, category?: string, variables?: AnyRecord, value?: any, unitId?: string, date?: string, uncertainty?: any, uncertaintyType?: string, _elementId?: string, _elementName?: string, _elementFamily?: string, _variables?: AnyRecord, [key: string]: any }} ObservationRecord
 * @typedef {{ parameterId?: string, thresholdUnit?: string, operator?: string, threshold?: any }} RuleCondition
 * @typedef {{ logic?: 'AND'|'OR'|string, conditions?: RuleCondition[] }} CompoundConditions
 * @typedef {{ numeratorParameterId?: string, denominatorParameterId?: string, threshold?: number|null, operator?: string }} RatioConfig
 * @typedef {{ op: string, constantId: string, constantId2?: string, mode?: string, snapshot?: { value?: number|null, uncertainty?: number|null }, fraction?: number, fraction2?: number }} PostProcessingStep
 * @typedef {{ value: number, symbol?: string, uncertainty?: number|null, uncertaintyType?: string, [key: string]: any }} UserConstant
 * @typedef {{ value: number, date?: string, campaignId?: string, uncertainty?: number|null }} CalculationValue
 * @typedef {{ value: number|null, uncertainty?: number|null, label?: string, isPct?: boolean, isTrend?: boolean }} CalculationResult
 * @typedef {{ value: number|null, uncertainty: number|null, note: string|null }} PostProcessingResult
 * @typedef {{ value: number|null, text: string, details?: AnyRecord, error?: string, severity?: string, meta?: any, uncertainty?: number|null, count?: number, postProcessingNote?: string }} CalculatorResult
 * @typedef {{ type?: string, calculation?: string, label?: string, suffix?: string, precision?: number, unitId?: string, filters?: FilterRecord[], conditions?: CompoundConditions, ratio?: RatioConfig, postProcessing?: PostProcessingStep[], campaignA?: string, campaignB?: string, [key: string]: any }} CalculatorItem
 */
/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    return error instanceof Error ? error.message : String(error);
}
// ----------------------------------------------------------------
// MAIN COMPUTE
// ----------------------------------------------------------------
/**
 * Compute a single calculator item against current model data.
 * Pipeline: element filters → obs filters (incl. variable) → calculation.
 *
 * @param {CalculatorItem} item - CalculatorItem
 * @returns {CalculatorResult|Promise<CalculatorResult>}
 */
export function computeCalculatorItem(item: any) {
    try {
        if (item.type === 'rule')
            return evaluateCompoundRule(item);
        if (item.type === 'ratio')
            return evaluateRatio(item);
        // V3 Phase 1: calculations "custom-*" delegam para handler
        // registrado em customHandlers.js. Retornam Promise - caller
        // precisa await (usado pelo launchpad hero, async por design).
        if (typeof item.calculation === 'string' && item.calculation.startsWith('custom-')) {
            return evaluateCustom(item);
        }
        return evaluateMetric(item);
    }
    catch (e) {
        return { value: null, text: `${item.label || ''}[error]`, error: _errorMessage(e) };
    }
}
/**
 * V3 Phase 1: execução de calculation custom-*. Async — retorna Promise.
 * Handler registry em customHandlers.js.
 * @param {CalculatorItem} item
 * @returns {Promise<CalculatorResult>}
 */
async function evaluateCustom(item: any) {
    const handler = resolveCustomHandler(item.calculation || '');
    if (!handler) {
        return { value: null, text: `${item.label || ''}[no-handler]` };
    }
    try {
        const r = await handler(item);
        const value = r?.value ?? null;
        const severity = r?.severity || 'ok';
        const meta = r?.meta;
        return {
            value,
            text: `${item.label || ''}${value == null ? '—' : value}${item.suffix || ''}`,
            severity,
            meta,
        };
    }
    catch (e) {
        return { value: null, text: `${item.label || ''}[error]`, error: _errorMessage(e) };
    }
}
/**
 * Compute a calculator item scoped to a single element.
 * Avalia metrica/regra/ratio restrita a um unico elemento.
 * Usado pelo pipeline de treinamento da rede neural.
 *
 * @param {CalculatorItem} item - CalculatorItem
 * @param {ElementRecord} element - Target element (needs .id)
 * @returns {number|null} Numeric result or null if no data
 */
export function computeCalculatorItemForElement(item: any, element: any) {
    // Guard: tipos multi-elemento ou sem observacoes nao suportam escopo per-element
    if (['hypothesis', 'background', 'mac_curve'].includes(item.type || ''))
        return null;
    try {
        const scopedItem = {
            ...item,
            filters: [
                { dimension: 'element', operator: 'is', value: element.id },
                ...(item.filters || []).filter((f: any) => ['parameter', 'campaign', 'category', 'variable'].includes(f.dimension || '')),
            ],
        };
        const result: any = computeCalculatorItem(scopedItem);
        return result.value != null && !isNaN(result.value) ? result.value : null;
    }
    catch {
        return null;
    }
}
// ----------------------------------------------------------------
// METRIC EVALUATION
// ----------------------------------------------------------------
/**
 * Evaluate a standard metric (filter + calculate).
 * @param {CalculatorItem} item
 * @returns {CalculatorResult}
 */
function evaluateMetric(item: any) {
    const { observations } = applyFilters(item);
    // Extrai valores numericos com conversao de unidades
    const values = extractValues(observations, item.unitId);
    // Executa calculo
    const result = executeCalculation(item.calculation, values, item);
    // Formata
    const formatted = formatResult(result, item);
    // Aplica pos-processamento por constantes (array de operacoes sequenciais)
    const ppResult = applyPostProcessing(result.value, item.postProcessing, result.uncertainty);
    return {
        value: ppResult.value,
        uncertainty: ppResult.uncertainty,
        text: `${item.label || ''}${formatted}${item.suffix || ''}`,
        count: values.length,
        postProcessingNote: ppResult.note || undefined,
    };
}
// ----------------------------------------------------------------
// COMPOUND RULE EVALUATION
// ----------------------------------------------------------------
/**
 * Evaluate compound rule (AND/OR conditions) per element.
 * Retorna pass/fail por elemento com detalhes.
 *
 * @param {CalculatorItem} item - CalculatorItem with type='rule' + conditions
 * @returns {CalculatorResult}
 */
function evaluateCompoundRule(item: any) {
    const conditions = item.conditions;
    if (!conditions || !conditions.conditions || conditions.conditions.length === 0) {
        return { value: null, text: `${item.label || ''}[no conditions]` };
    }
    const { elements, observations } = applyFilters(item);
    const logic = conditions.logic || 'AND';
    let passing = 0;
    let failing = 0;
    const elementResults: any[] = [];
    for (const el of elements) {
        const elObs = observations.filter((o: any) => o._elementId === el.id);
        if (elObs.length === 0)
            continue;
        const condResults = conditions.conditions.map((cond: any) => {
            const condObs = elObs.filter((o: any) => o.parameterId === cond.parameterId);
            if (condObs.length === 0)
                return null; // sem dados para esta condicao
            // Pega ultimo valor (mais recente)
            const sorted = [...condObs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const latest = sorted[0] as any;
            let val = Number(latest.value);
            // Converte unidade se necessario
            if (cond.thresholdUnit && latest.unitId && latest.unitId !== cond.thresholdUnit) {
                const cv = convert(val, latest.unitId, cond.thresholdUnit);
                if (cv.success)
                    val = (cv.value ?? val) as number;
            }
            return compareValue(val, cond.operator, cond.threshold);
        });
        // Remove nulls (sem dados)
        const evaluated = condResults.filter((r: any) => r !== null);
        if (evaluated.length === 0)
            continue;
        const pass = logic === 'AND' ? evaluated.every((r: any) => r) : evaluated.some((r: any) => r);
        if (pass)
            passing++;
        else
            failing++;
        elementResults.push({ elementId: el.id, name: el.name, pass });
    }
    const total = passing + failing;
    const pct = total > 0 ? ((passing / total) * 100).toFixed(1) : '—';
    return {
        value: total > 0 ? passing / total : null,
        text: `${item.label || ''}${passing}/${total} (${pct}%)`,
        details: { passing, failing, total, elementResults },
    };
}
// ----------------------------------------------------------------
// RATIO EVALUATION
// ----------------------------------------------------------------
/**
 * Evaluate parameter ratio (numerator / denominator).
 *
 * @param {CalculatorItem} item - CalculatorItem with type='ratio' + ratio
 * @returns {CalculatorResult}
 */
function evaluateRatio(item: any) {
    const ratio = item.ratio;
    if (!ratio || !ratio.numeratorParameterId || !ratio.denominatorParameterId) {
        return { value: null, text: `${item.label || ''}[no ratio]` };
    }
    const { observations } = applyFilters(item);
    const numObs = observations.filter((o: any) => o.parameterId === ratio.numeratorParameterId);
    const denObs = observations.filter((o: any) => o.parameterId === ratio.denominatorParameterId);
    const numVals = numObs.map((o: any) => Number(o.value)).filter((v: any) => !isNaN(v));
    const denVals = denObs.map((o: any) => Number(o.value)).filter((v: any) => !isNaN(v));
    if (numVals.length === 0 || denVals.length === 0) {
        return { value: null, text: `${item.label || ''}—` };
    }
    const numMean = calculatorMean(numVals);
    const denMean = calculatorMean(denVals);
    if (denMean === 0) {
        return { value: null, text: `${item.label || ''}÷0` };
    }
    const ratioValue = numMean / denMean;
    const pass = ratio.threshold != null ? compareValue(ratioValue, ratio.operator || 'gt', ratio.threshold) : null;
    return {
        value: ratioValue,
        text: `${item.label || ''}${ratioValue.toFixed(item.precision || 2)}${item.suffix || ''}`,
        details: { numerator: numMean, denominator: denMean, pass },
    };
}
// ----------------------------------------------------------------
// FILTER PIPELINE
// 2-stage: element filters → observation filters (incl. variable)
// ----------------------------------------------------------------
/**
 * Apply all filters from a calculator item.
 * @param {CalculatorItem} item
 * @returns {{ elements: ElementRecord[], observations: ObservationRecord[] }}
 */
function applyFilters(item: any) {
    /** @type {ElementRecord[]} */
    let elements = /** @type {ElementRecord[]} */ (getAllElements());
    // Stage 1: element-level filters
    const elFilters = (item.filters || []).filter((f: any) => ['family', 'element', 'area'].includes(f.dimension || ''));
    for (const filter of elFilters) {
        elements = applyElementFilter(elements, filter);
    }
    // Collect observations from filtered elements
    /** @type {ObservationRecord[]} */
    let observations: any[] = [];
    for (const el of elements) {
        const obs = (el.data?.observations || []);
        observations.push(...obs.map((o: any) => ({
            ...o,
            _elementId: el.id,
            _elementName: el.name,
            _elementFamily: el.family,
            _variables: o.variables || inferVariablesFromFamily(el.family || '')
        })));
    }
    // Stage 2: observation-level filters
    const obsFilters = (item.filters || []).filter((f: any) => ['parameter', 'campaign', 'category', 'variable'].includes(f.dimension || ''));
    for (const filter of obsFilters) {
        observations = applyObservationFilter(observations, filter);
    }
    return { elements, observations };
}
// ----------------------------------------------------------------
// ELEMENT FILTERS
// ----------------------------------------------------------------
/**
 * @param {ElementRecord[]} elements
 * @param {FilterRecord} filter
 * @returns {ElementRecord[]}
 */
function applyElementFilter(elements: any, filter: any) {
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
// OBSERVATION FILTERS (incl. variable dimension)
// ----------------------------------------------------------------
/**
 * @param {ObservationRecord[]} observations
 * @param {FilterRecord} filter
 * @returns {ObservationRecord[]}
 */
function applyObservationFilter(observations: any, filter: any) {
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
            const param = CONFIG.PARAMETERS?.find((p) => p.id === o.parameterId);
            return param?.category || '';
        }, operator, value);
    }
    if (dimension === 'variable') {
        // Filtro generico por qualquer OBSERVATION_VARIABLE
        const varId = filter.variableId;
        if (!varId)
            return observations;
        return matchFilter(observations, (o: any) => {
            return getVariableValue(o._variables || o.variables || {}, varId);
        }, operator, value);
    }
    return observations;
}
// ----------------------------------------------------------------
// GENERIC FILTER MATCHER (same as ticker)
// ----------------------------------------------------------------
/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => any} accessor
 * @param {string|undefined} operator
 * @param {any} value
 * @returns {T[]}
 */
function matchFilter(items: any, accessor: any, operator: any, value: any) {
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
// CALCULATION (same calculations as ticker)
// ----------------------------------------------------------------
/**
 * @param {string|undefined} calculation
 * @param {CalculationValue[]} values
 * @param {CalculatorItem} item
 * @returns {CalculationResult}
 */
function executeCalculation(calculation: any, values: any, item: any) {
    const nums = values.map((v: any) => v.value);
    const uncertaintyInputs = values.map((v: any) => createUValue(v.value, Number.isFinite(v.uncertainty) ? v.uncertainty : null, { type: 'absolute' }));
    if (nums.length === 0 && calculation !== 'count') {
        return { value: null, uncertainty: null, label: '—' };
    }
    switch (calculation) {
        case 'sum': {
            const sumResult = propagate('sum', uncertaintyInputs);
            return { value: sumResult.value, uncertainty: sumResult.u };
        }
        case 'average': {
            const avgResult = propagate('average', uncertaintyInputs);
            return { value: avgResult.value, uncertainty: avgResult.u };
        }
        case 'min': {
            const minResult = propagate('min', uncertaintyInputs);
            return { value: minResult.value, uncertainty: minResult.u };
        }
        case 'max': {
            const maxResult = propagate('max', uncertaintyInputs);
            return { value: maxResult.value, uncertainty: maxResult.u };
        }
        case 'count':
            return { value: nums.length, uncertainty: null };
        case 'latest': {
            const sorted = [...values].filter((v) => v.date).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return {
                value: sorted.length > 0 ? sorted[0].value : null,
                uncertainty: sorted.length > 0 ? (sorted[0].uncertainty ?? null) : null,
            };
        }
        case 'change_pct': {
            const valsA = values.filter((v: any) => v.campaignId === item.campaignA).map((v: any) => v.value);
            const valsB = values.filter((v: any) => v.campaignId === item.campaignB).map((v: any) => v.value);
            if (valsA.length === 0 || valsB.length === 0)
                return { value: null, uncertainty: null, label: '—' };
            const meanA = calculatorMean(valsA);
            const meanB = calculatorMean(valsB);
            if (meanA === 0)
                return { value: null, uncertainty: null, label: '—' };
            return { value: ((meanB - meanA) / Math.abs(meanA)) * 100, uncertainty: null, isPct: true };
        }
        case 'trend': {
            if (nums.length < 4)
                return { value: null, uncertainty: null, label: '—' };
            const result = calculatorMannKendall(nums) as any;
            /** @type {Record<string, string>} */
            const arrows: AnyRecord = { increasing: '\u2191', decreasing: '\u2193', stable: '\u2192' };
            return {
                value: result.tau,
                uncertainty: null,
                label: `${arrows[result.trend] || '\u2192'} ${result.trend}`,
                isTrend: true,
            };
        }
        default:
            return { value: null, uncertainty: null, label: '?' };
    }
}
// ----------------------------------------------------------------
// VALUE EXTRACTION
// ----------------------------------------------------------------
/**
 * @param {ObservationRecord[]} observations
 * @param {string|undefined} targetUnitId
 * @returns {CalculationValue[]}
 */
function extractValues(observations: any, targetUnitId: any) {
    /** @type {CalculationValue[]} */
    const values: any[] = [];
    for (const obs of observations) {
        if (obs.value == null || isNaN(obs.value))
            continue;
        let v = Number(obs.value);
        let unc = null;
        if (obs.uncertainty != null && Number.isFinite(obs.uncertainty) && obs.uncertainty >= 0) {
            // Converter incerteza para absoluta na mesma unidade do valor
            unc = obs.uncertaintyType === 'relative' ? (Math.abs(v) * obs.uncertainty) / 100 : obs.uncertainty;
        }
        if (targetUnitId && obs.unitId && obs.unitId !== targetUnitId) {
            const result = convert(v, obs.unitId, targetUnitId);
            if (result.success) {
                // Escalar incerteza pelo mesmo fator de conversão
                if (unc != null) {
                    const factor = v !== 0 ? (result.value ?? 0) / v : 1;
                    unc = unc * Math.abs(factor);
                }
                v = result.value ?? v;
            }
        }
        values.push({ value: v, date: obs.date, campaignId: obs.campaignId, uncertainty: unc });
    }
    return values;
}
// ----------------------------------------------------------------
// COMPARISON
// ----------------------------------------------------------------
/**
 * @param {number} val
 * @param {string|undefined} operator
 * @param {any} threshold
 * @returns {boolean}
 */
function compareValue(val: any, operator: any, threshold: any) {
    switch (operator) {
        case 'gt':
            return val > threshold;
        case 'gte':
            return val >= threshold;
        case 'lt':
            return val < threshold;
        case 'lte':
            return val <= threshold;
        case 'eq':
            return val === threshold;
        case 'neq':
            return val !== threshold;
        default:
            return false;
    }
}
// ----------------------------------------------------------------
// POST-PROCESSING - apply user-defined constants to metric result
// Pos-processamento: aplica constantes do usuario ao resultado da metrica
// ----------------------------------------------------------------
/**
 * Apply a chain of post-processing operations using user constants.
 * Aplica cadeia de operacoes pos-calculo usando constantes do usuario.
 *
 * Regras:
 * - Execucao sequencial na ordem do array
 * - Divisao por zero: preserva valor anterior, emite console.warn
 * - constantId nao encontrado: step ignorado, emite console.warn
 *
 * @param {number|null} rawValue - Valor calculado pela metrica
 * @param {PostProcessingStep[]|undefined} postProcessing
 * @param {number|null|undefined} rawUncertainty
 * @returns {PostProcessingResult}
 */
export function applyPostProcessing(rawValue: any, postProcessing: any, rawUncertainty: any) {
    if (!Array.isArray(postProcessing) || postProcessing.length === 0 || rawValue == null) {
        return { value: rawValue, uncertainty: rawUncertainty ?? null, note: null };
    }
    let value = rawValue;
    let unc = rawUncertainty ?? null;
    const labels = [];
    for (const step of postProcessing) {
        // Step com snapshot congelado: usa valor/incerteza do snapshot diretamente
        // O resultado da cadeia ate este ponto e substituido pelo valor capturado
        if (step.mode === 'snapshot' && step.snapshot != null && step.snapshot.value != null) {
            value = step.snapshot.value;
            unc = step.snapshot.uncertainty ?? null;
            labels.push(`=${value}`);
            continue;
        }
        const c = (getUserConstantById(step.constantId));
        if (!c) {
            console.warn(`[ecbyts] postProcessing: constante '${step.constantId}' nao encontrada`);
            continue;
        }
        if (step.op === 'divide' && c.value === 0) {
            console.warn(`[ecbyts] postProcessing: divisao por zero ignorada (${c.symbol})`);
            continue;
        }
        switch (step.op) {
            case 'multiply':
            case 'divide': {
                const prevValue = value;
                const propagated = propagate(/** @type {'multiply'|'divide'} */ (step.op), [
                    _toUValue(prevValue, unc),
                    _toUValue(c.value, _toAbsoluteUnc(c)),
                ]);
                value = propagated.value;
                unc = propagated.u ?? null;
                break;
            }
            case 'add':
            case 'subtract': {
                if (step.op === 'add') {
                    const propagated = propagate('sum', [_toUValue(value, unc), _toUValue(c.value, _toAbsoluteUnc(c))]);
                    value = propagated.value;
                    unc = propagated.u ?? null;
                }
                else {
                    const propagated = propagate('linear', [_toUValue(value, unc), _toUValue(c.value, _toAbsoluteUnc(c))], [1, -1]);
                    value = propagated.value;
                    unc = propagated.u ?? null;
                }
                break;
            }
            case 'blend': {
                // blend: result = prev � (fA � cA + fB � cB)
                // Mistura ponderada de dois componentes: result = prev � (fA � cA + fB � cB)
                const c2 = (getUserConstantById(step.constantId2 || ''));
                if (!c2) {
                    console.warn(`[ecbyts] blend: constantId2 '${step.constantId2}' nao encontrada � step ignorado`);
                    continue;
                }
                const fA = typeof step.fraction === 'number' && Number.isFinite(step.fraction) ? step.fraction : 0.5;
                const fB = typeof step.fraction2 === 'number' && Number.isFinite(step.fraction2) ? step.fraction2 : 0.5;
                const prevValue = value;
                const blendValue = propagate('linear', [_toUValue(c.value, _toAbsoluteUnc(c)), _toUValue(c2.value, _toAbsoluteUnc(c2))], [fA, fB]);
                const multiplied = propagate('multiply', [_toUValue(prevValue, unc), blendValue]);
                value = multiplied.value;
                unc = multiplied.u ?? null;
                labels.push(`�(${fA}�${c.symbol}+${fB}�${c2.symbol})`);
                continue; // label ja adicionado acima � pular o push generico abaixo
            }
        }
        labels.push(`${_opSymbol(step.op)}${c.symbol}`);
    }
    return { value, uncertainty: unc, note: labels.length > 0 ? labels.join(' ') : null };
}
/**
 * @param {UserConstant|null|undefined} constant
 * @returns {number|null}
 */
function _toAbsoluteUnc(constant: any) {
    if (!constant ||
        constant.uncertainty == null ||
        !Number.isFinite(constant.uncertainty) ||
        constant.uncertainty <= 0) {
        return null;
    }
    return constant.uncertaintyType === 'relative'
        ? (Math.abs(constant.value) * constant.uncertainty) / 100
        : constant.uncertainty;
}
/**
 * @param {number|null} value
 * @param {number|null|undefined} uncertainty
 * @returns {import('../uncertainty/primitive.js' as string).UValue}
 */
function _toUValue(value: any, uncertainty: any) {
    return createUValue(value, Number.isFinite(uncertainty) ? uncertainty : null, { type: 'absolute' });
}
/**
 * @param {string} op
 * @returns {string}
 */
function _opSymbol(op: any) {
    switch (op) {
        case 'multiply':
            return '\u00d7';
        case 'divide':
            return '\u00f7';
        case 'add':
            return '+';
        case 'subtract':
            return '\u2212';
        case 'blend':
            return '\u2248'; // ≈
        default:
            return op;
    }
}
// ----------------------------------------------------------------
// FORMATTING
// ----------------------------------------------------------------
/**
 * @param {CalculationResult} calcResult
 * @param {CalculatorItem} item
 * @returns {string}
 */
function formatResult(calcResult: any, item: any) {
    if (calcResult.label && calcResult.value == null)
        return calcResult.label;
    if (calcResult.value == null)
        return '—';
    if (calcResult.isTrend)
        return calcResult.label || '';
    if (calcResult.isPct) {
        const sign = calcResult.value > 0 ? '+' : '';
        return `${sign}${calcResult.value.toFixed(item.precision || 2)}%`;
    }
    return calcResult.value.toFixed(item.precision || 2);
}
//# sourceMappingURL=engine.js.map
