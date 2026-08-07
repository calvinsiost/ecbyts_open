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
   CALCULATOR MANAGER — CRUD, persistence, import/export
   Gerenciador de metricas, regras compostas e ratios

   Segue o mesmo padrao de ticker/manager.js:
   - Estado em closure do modulo
   - Persistencia em localStorage + export/import do modelo
   - Eventos CustomEvent para notificar UI
   ================================================================ */
import { generateId } from '../../utils/helpers/id.js';
import { safeJsonParse } from '../../utils/helpers/safeJsonParse.js';
import { CONFIG } from '../../config.js';
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { computeCalculatorItem } from './engine.js';
import { isEphemeral, safeSetItem } from '../../utils/storage/storageMonitor.js';
import {
    buildHypothesisTemplates,
    buildBackgroundTemplates,
    resolveTemplateContaminant,
    filterOutTemplatesByType,
} from './_calculatorTemplatesPure.js';
// Adopt own pure helpers (Module C extraction commit ba7cf7ab) — DRY interno.
// _calculatorItemPure has no state side-effects, can be safely imported.
import {
    createItemFromPartial,
    cloneCalculatorItem,
    reorderItemsArray,
    serializeItemForExport,
    computeExceedanceProbability,
} from './_calculatorItemPure.js';
import * as _uncertaintyMod from '../uncertainty/index.js';
const convertQualitativeUncertainty = (_uncertaintyMod).convertQualitativeUncertainty;
const evaluateUncertaintyDecisionRules = /** @type {any} */ (_uncertaintyMod).evaluateUncertaintyDecisionRules;
// V3 Phase 1: seeds canônicos dos KPIs do Launchpad
import { injectLaunchpadSeeds, filterLaunchpadItems, isLaunchpadSeed } from './launchpadSeeds.js';
// V3 Phase 1: registra handlers custom-* no engine
import './customHandlers.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-calculator';
/** @type {{items: any[]}} */
let calculatorConfig: any = {
    items: [],
};
/** @type {{q2qLabel: string, runType: string, rules: any[]}} */
let calculatorUncertaintyContext: any = {
    q2qLabel: 'medium',
    runType: 'exploratory',
    rules: [],
};
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize calculator from localStorage.
 * Carrega estado salvo ou cria padrao vazio.
 */
export function initCalculator() {
    const saved = safeJsonParse<Partial<typeof calculatorConfig>>(localStorage.getItem(STORAGE_KEY), null, 'Calculator');
    if (saved) {
        calculatorConfig = { ...calculatorConfig, ...saved };
    }
    // V3 Phase 1: injeta seeds canônicos idempotente (LAUNCHPAD_*)
    calculatorConfig.items = injectLaunchpadSeeds(calculatorConfig.items || []);
}
// ----------------------------------------------------------------
// STATE ACCESS
// ----------------------------------------------------------------
/** @returns {Object[]} All calculator items */
export function getCalculatorItems() {
    return calculatorConfig.items;
}
/** @returns {Object|null} Single item by id */
export function getCalculatorItemById(id: any) {
    return calculatorConfig.items.find((/** @type {any} */ item: any) => item.id === id) || null;
}
/**
 * Sets uncertainty context used to classify calculator outputs.
 * Context comes from Uncertainty Hub (IDB/ECBT workflow).
 * @param {{q2qLabel?:string, runType?:string, rules?:Array<any>}} ctx
 */
export function setCalculatorUncertaintyContext(ctx = {}) {
    calculatorUncertaintyContext = {
        ...calculatorUncertaintyContext,
        ...(ctx || {}),
    };
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
/**
 * Add a new calculator item with defaults.
 * @param {Object} partial - campos opcionais
 * @returns {Object} novo item
 */
export function addCalculatorItem(partial = {}) {
    const item = createItemFromPartial(generateId('calc'), partial as any);
    calculatorConfig.items.push(item);
    _persist();
    return item;
}
/**
 * Update fields of an existing item.
 * @param {string} id
 * @param {Object} changes
 */
export function updateCalculatorItem(id: any, changes: any) {
    const item = calculatorConfig.items.find((/** @type {any} */ i: any) => i.id === id);
    if (!item)
        return;
    Object.assign(item, changes);
    _persist();
}
/**
 * Remove item by id.
 * @param {string} id
 */
export function removeCalculatorItem(id: any) {
    // V3 Phase 1: protege seeds canônicos contra deleção
    if (isLaunchpadSeed(id)) {
        console.warn('[Calculator] seed canônico não pode ser deletado:', id);
        return;
    }
    calculatorConfig.items = calculatorConfig.items.filter((i: any) => i.id !== id);
    _persist();
}
/**
 * V3 Phase 1: retorna items pinned no Launchpad hero, ordenados por
 * heroSlot. Launchpad consome isto - não calcula nada próprio.
 *
 * @returns {Object[]}
 */
export function getLaunchpadItems() {
    const aggregateEnabled = CONFIG?.FEATURES?.LAUNCHPAD_V3_INTEGRITY_AGGREGATE === true;
    return filterLaunchpadItems(calculatorConfig.items || [], { aggregateEnabled });
}
/**
 * Duplicate an item.
 * @param {string} id
 * @returns {Object|null}
 */
export function duplicateCalculatorItem(id: any) {
    const source = calculatorConfig.items.find((/** @type {any} */ i: any) => i.id === id);
    if (!source) return null;
    const clone = cloneCalculatorItem(source as any, generateId('calc'));
    calculatorConfig.items.push(clone);
    _persist();
    return clone;
}
/**
 * Reorder item up or down.
 * @param {string} id
 * @param {'up'|'down'} direction
 */
export function reorderCalculatorItem(id: any, direction: any) {
    if (direction !== 'up' && direction !== 'down') return;
    const reordered = reorderItemsArray(calculatorConfig.items, id, direction);
    calculatorConfig.items = reordered;
    _persist();
}
// ----------------------------------------------------------------
// FILTER CRUD (per item)
// ----------------------------------------------------------------
/**
 * Add filter to item.
 * @param {string} itemId
 * @param {Object} filter - { dimension, operator, value, variableId? }
 * @returns {Object|null}
 */
export function addCalculatorFilter(itemId: any, filter = {}) {
    const item = calculatorConfig.items.find((i: any) => i.id === itemId);
    if (!item)
        return null;
    const f = { dimension: 'parameter', operator: 'is', value: '', ...filter };
    item.filters.push(f);
    _persist();
    return f;
}
/**
 * Remove filter from item by index.
 */
export function removeCalculatorFilter(itemId: any, filterIndex: any) {
    const item = calculatorConfig.items.find((i: any) => i.id === itemId);
    if (!item)
        return;
    item.filters.splice(filterIndex, 1);
    _persist();
}
/**
 * Update a filter field.
 */
export function updateCalculatorFilter(
/** @type {string} */ itemId: any, filterIndex: any, field: any, value: any) {
    const item = calculatorConfig.items.find((i: any) => i.id === itemId);
    if (!item || !item.filters[filterIndex])
        return;
    item.filters[filterIndex][field] = value;
    if (field === 'dimension') {
        item.filters[filterIndex].operator = 'is';
        item.filters[filterIndex].value = '';
        if (value !== 'variable') {
            delete item.filters[filterIndex].variableId;
        }
    }
    _persist();
}
// ----------------------------------------------------------------
// COMPUTE ALL
// ----------------------------------------------------------------
/**
 * Compute all enabled items.
 * @returns {Array<{ id:any, text:any, value:any, color:any, type:any, details?:any }>}
 */
export function computeAllCalculator() {
    return calculatorConfig.items
        .filter((/** @type {any} */ item: any) => item.enabled)
        .map((/** @type {any} */ item: any) => {
        const result: any = computeCalculatorItem(item);
        const uncertaintyGate = _classifyCalculatorUncertainty(result);
        return {
            id: item.id,
            type: item.type,
            text: result.text,
            value: result.value,
            color: item.color || '',
            details: result.details || null,
            error: result.error || null,
            uncertaintyGate,
        };
    });
}
function _classifyCalculatorUncertainty(result: any) {
    const q2q: any = convertQualitativeUncertainty({ label: calculatorUncertaintyContext.q2qLabel || 'medium' }, { runType: calculatorUncertaintyContext.runType || 'exploratory' });
    const exceedanceProb = computeExceedanceProbability(result?.uncertainty, result?.value, q2q?.mapped?.pMax);
    const decision: any = evaluateUncertaintyDecisionRules(Array.isArray(calculatorUncertaintyContext.rules) ? calculatorUncertaintyContext.rules : [], { exceedanceProb }, { runType: calculatorUncertaintyContext.runType || 'exploratory' });
    return {
        action: decision?.action || 'allow',
        exceedanceProb,
        source: q2q?.fallback ? 'q2q_fallback' : 'q2q_map',
    };
}
// ----------------------------------------------------------------
// TEMPLATE METRICS - Read-only examples for statistical modules
// Metricas-exemplo para guiar o usuario
// ----------------------------------------------------------------
/**
 * Create read-only template metrics that serve as examples.
 * Cria metricas-modelo para o tipo de analise especificado.
 * Templates nao podem ser editados pelo usuario, apenas duplicados ou removidos.
 *
 * @param {'hypothesis'|'background'} analysisType - Tipo de analise
 */
export function createTemplateMetrics(analysisType: any) {
    const contaminant = resolveTemplateContaminant(CONFIG.PARAMETERS || []);
    if (!contaminant) return;
    // Remove templates existentes do mesmo tipo antes de recriar (pure helper)
    calculatorConfig.items = filterOutTemplatesByType(calculatorConfig.items, analysisType);
    let templates: any[] = [];
    if (analysisType === 'hypothesis') {
        templates = buildHypothesisTemplates(contaminant, getAllCampaigns());
    } else if (analysisType === 'background') {
        templates = buildBackgroundTemplates(contaminant, getAllElements());
    }
    for (const cfg of templates) {
        addCalculatorItem(cfg);
    }
    _persist();
}
/**
 * Remove all template metrics.
 * Remove todas as metricas-modelo.
 */
export function clearTemplateMetrics() {
    calculatorConfig.items = calculatorConfig.items.filter((/** @type {any} */ i: any) => !i.readonly);
    _persist();
}
// ----------------------------------------------------------------
// CLEAR / EXPORT / IMPORT
// ----------------------------------------------------------------
/** Remove all items */
export function clearCalculator() {
    calculatorConfig.items = [];
    _persist();
}
/**
 * Export calculator state for model.
 * @returns {Object}
 */
export function exportCalculator() {
    return {
        items: calculatorConfig.items.map((item: any) => serializeItemForExport(item)),
    };
}
/**
 * Import calculator state from model.
 * @param {Object} config
 */
export function importCalculator(config: any) {
    if (!config)
        return;
    calculatorConfig = {
        items: Array.isArray(config.items) ? config.items : [],
    };
    // V3 Phase 1: re-injeta seeds canônicos após import (fixture pode
    // vir sem eles; seeds devem persistir entre imports).
    calculatorConfig.items = injectLaunchpadSeeds(calculatorConfig.items);
    _persist();
}
// ----------------------------------------------------------------
// RANDOM GENERATION
// ----------------------------------------------------------------
/**
 * Generate random calculator items based on current model.
 * Cria 2-4 itens de exemplo com filtros e calculos variados.
 */
export function generateRandomCalculator() {
    const params = CONFIG.PARAMETERS || [];
    const elements = getAllElements();
    const campaigns = getAllCampaigns();
    if (params.length === 0 || elements.length === 0)
        return;
    const randChoice = (/** @type {any[]} */ arr: any) => arr[Math.floor(Math.random() * arr.length)];
    const colors = ['#2d8a7a', '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
    // Metrica simples: media de benzene em pocos
    const wells = elements.filter((/** @type {any} */ e) => e.family === 'well');
    if (wells.length > 0) {
        const contaminant: any = (params.find((p: any) => p.id === 'benzene') || params[0]);
        addCalculatorItem({
            label: `Avg ${contaminant.name || contaminant.id} `,
            type: 'metric',
            filters: [
                { dimension: 'family', operator: 'is', value: 'well' },
                { dimension: 'parameter', operator: 'is', value: contaminant.id },
                { dimension: 'variable', variableId: 'is_matrix_water', operator: 'is', value: '1' },
            ],
            calculation: 'average',
            unitId: contaminant.defaultUnitId || 'ug_L',
            precision: 2,
            color: randChoice(colors),
        });
    }
    // Regra composta: benzene > 5 AND/OR toluene > 700
    const benzene = params.find((/** @type {any} */ p) => p.id === 'benzene');
    const toluene = params.find((/** @type {any} */ p) => p.id === 'toluene');
    if (benzene && toluene) {
        addCalculatorItem({
            label: 'BTEX Compliance ',
            type: 'rule',
            filters: [{ dimension: 'family', operator: 'is', value: 'well' }],
            conditions: {
                logic: 'AND',
                conditions: [
                    { parameterId: 'benzene', operator: 'gt', threshold: 5, thresholdUnit: 'ug_L' },
                    { parameterId: 'toluene', operator: 'gt', threshold: 700, thresholdUnit: 'ug_L' },
                ],
            },
            color: randChoice(colors),
        });
    }
    // Ratio: benzene/toluene
    if (benzene && toluene) {
        addCalculatorItem({
            label: 'B/T Ratio ',
            type: 'ratio',
            filters: [{ dimension: 'family', operator: 'is', value: 'well' }],
            ratio: {
                numeratorParameterId: 'benzene',
                denominatorParameterId: 'toluene',
                operator: 'gt',
                threshold: 0.02,
            },
            precision: 3,
            color: randChoice(colors),
        });
    }
    // Tendencia: contagem de observacoes por campanha
    if (campaigns.length >= 2) {
        addCalculatorItem({
            label: 'Obs Count ',
            type: 'metric',
            filters: [],
            calculation: 'count',
            color: randChoice(colors),
        });
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function _persist() {
    if (isEphemeral())
        return;
    safeSetItem(STORAGE_KEY, JSON.stringify(calculatorConfig));
}
//# sourceMappingURL=manager.js.map
