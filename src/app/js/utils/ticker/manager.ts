// Generated from src/app/js/utils/ticker/manager.ts by TS-MIGRATION-001. Do not edit manually.
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
   TICKER MANAGER — Configurable metrics ticker bar
   Gerenciador da barra de metricas estilo painel financeiro

   Cada item do ticker e uma formula configuravel:
   - Filtros dinamicos (parametro, familia, area, campanha, etc.)
   - Calculo (soma, media, min, max, contagem, variacao %, tendencia)
   - Texto livre de label e sufixo

   Estado mantido em closure do modulo (mesmo padrao de campaigns/manager).
   Persistencia via localStorage + export/import do modelo.
   ================================================================ */
import { getAllElements, getElementsByFamily } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { findContainedElements } from '../edges/manager.js';
import { CONFIG } from '../../config.js';
import { getAllFamilies } from '../../core/elements/families.js';
import { deepClone } from '../helpers/deepClone.js';
import { convert } from '../../core/units/converter.js';
import { formatWithUnit } from '../../core/units/catalog.js';
import { descriptiveStats } from '../../core/analytics/statistics.js';
import { mannKendall } from '../../core/analytics/statistics.js';
import { getVariableValue, inferVariablesFromFamily } from '../../core/calculator/contextResolver.js';
import { isEphemeral, safeSetItem } from '../storage/storageMonitor.js';
// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo - closure privada
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-ticker';
/** @type {{visible: boolean, speed: string, separator: string, items: Array<any>}} */
let tickerConfig = {
    visible: false,
    speed: 'medium',
    separator: ' \u2022 ',
    items: [],
};
let nextId = 1;
// ----------------------------------------------------------------
// INITIALIZATION
// Carrega configuracao salva no localStorage
// ----------------------------------------------------------------
/**
 * Initialize ticker from localStorage.
 * Carrega configuracao salva ou cria estado padrao.
 */
export function initTicker() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            tickerConfig = { ...tickerConfig, ...parsed };
            // Recalcula proximo ID baseado nos itens existentes
            if (tickerConfig.items.length > 0) {
                const maxNum = tickerConfig.items.reduce((max: any, item: any) => {
                    const num = parseInt(item.id?.replace('ticker-', '') || '0');
                    return num > max ? num : max;
                }, 0);
                nextId = maxNum + 1;
            }
        }
    }
    catch (e: any) {
        console.warn('[Ticker] Erro ao carregar localStorage:', /** @type {any} */ (e).message);
    }
}
// ----------------------------------------------------------------
// STATE ACCESS
// Funcoes de leitura do estado
// ----------------------------------------------------------------
/** @returns {Object} Full ticker configuration */
export function getTickerConfig() {
    return tickerConfig;
}
/** @returns {Object[]} Array of ticker items */
export function getTickerItems() {
    return tickerConfig.items;
}
/** @param {string} id @returns {any} Single ticker item by id */
export function getTickerItemById(id: any) {
    return tickerConfig.items.find((item: any) => item.id === id) || null;
}
// ----------------------------------------------------------------
// CRUD - Create, Read, Update, Delete
// Operacoes de leitura e escrita nos itens
// ----------------------------------------------------------------
/**
 * Add a new ticker item with defaults.
 * Adiciona novo item com valores padrao.
 *
 * @param {Object} partial - Campos opcionais para sobrescrever defaults
 * @returns {Object} The new ticker item
 */
export function addTickerItem(partial: any = {}) {
    const item = {
        id: `ticker-${nextId++}`,
        label: '',
        suffix: '',
        filters: [],
        calculation: 'average',
        campaignA: null,
        campaignB: null,
        unitId: null,
        precision: 2,
        color: '',
        enabled: true,
        ...partial,
    };
    (tickerConfig.items as any[]).push(item);
    persist();
    return item;
}
/**
 * Update fields of an existing ticker item.
 * Atualiza campos de um item existente.
 *
 * @param {string} id - Item ID
 * @param {Object} changes - Fields to merge
 */
export function updateTickerItem(id: any,changes: any) {
    const item: any = tickerConfig.items.find((i: any) => i.id === id);
    if (!item)
        return;
    Object.assign(item, changes);
    persist();
}
/**
 * Remove a ticker item by id.
 * Remove um item pelo id.
 *
 * @param {string} id - Item ID
 */
export function removeTickerItem(id: any) {
    tickerConfig.items = tickerConfig.items.filter((i: any) => i.id !== id);
    persist();
}
/**
 * Duplicate a ticker item.
 * Clona um item existente com novo ID.
 *
 * @param {string} id - Item ID to duplicate
 * @returns {Object|null} The new cloned item
 */
export function duplicateTickerItem(id: any) {
    const source: any = tickerConfig.items.find((i: any) => i.id === id);
    if (!source)
        return null;
    const clone = {
        ...source,
        id: `ticker-${nextId++}`,
        filters: source.filters.map((f: any) => ({ ...f })),
    };
    (tickerConfig.items as any[]).push(clone);
    persist();
    return clone;
}
/**
 * Reorder a ticker item up or down.
 * Move um item para cima ou para baixo na lista.
 *
 * @param {string} id - Item ID
 * @param {'up'|'down'} direction
 */
export function reorderTickerItem(id: any,direction: any) {
    const idx = tickerConfig.items.findIndex((i: any) => i.id === id);
    if (idx === -1)
        return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= tickerConfig.items.length)
        return;
    const tmp = (tickerConfig.items as any[])[idx];
    (tickerConfig.items as any[])[idx] = (tickerConfig.items as any[])[target];
    (tickerConfig.items as any[])[target] = tmp;
    persist();
}
// ----------------------------------------------------------------
// GLOBAL SETTINGS
// Configuracoes gerais do ticker
// ----------------------------------------------------------------
/** Toggle ticker bar visibility @param {boolean} visible */
export function setTickerVisible(visible: any) {
    tickerConfig.visible = visible;
    persist();
}
/** Set scroll speed preset @param {string} speed */
export function setTickerSpeed(speed: any) {
    tickerConfig.speed = speed;
    persist();
}
/** Set separator string between items @param {string} separator */
export function setTickerSeparator(separator: any) {
    tickerConfig.separator = separator;
    persist();
}
// ----------------------------------------------------------------
// FILTER CRUD
// Operacoes de leitura e escrita nos filtros dinamicos
// ----------------------------------------------------------------
/**
 * Add a new filter to a ticker item.
 * Adiciona um filtro vazio ao item.
 *
 * @param {string} itemId
 * @returns {any} The new filter
 */
export function addTickerFilter(itemId: any) {
    const item: any = tickerConfig.items.find((i: any) => i.id === itemId);
    if (!item)
        return null;
    const filter = { dimension: 'parameter', operator: 'is', value: '' };
    (item.filters as any[]).push(filter);
    persist();
    return filter;
}
/**
 * Remove a filter from a ticker item.
 * Remove filtro pelo indice.
 *
 * @param {string} itemId
 * @param {number} filterIndex
 */
export function removeTickerFilter(itemId: any,filterIndex: any) {
    const item: any = tickerConfig.items.find((i: any) => i.id === itemId);
    if (!item)
        return;
    item.filters.splice(filterIndex, 1);
    persist();
}
/**
 * Update a filter field.
 * Atualiza campo de um filtro (dimension, operator, value).
 *
 * @param {string} itemId
 * @param {number} filterIndex
 * @param {string} field - 'dimension' | 'operator' | 'value'
 * @param {*} value
 */
export function updateTickerFilter(itemId: any,filterIndex: any,field: any,value: any) {
    const item: any = tickerConfig.items.find((i: any) => i.id === itemId);
    if (!item || !item.filters[filterIndex])
        return;
    item.filters[filterIndex][field] = value;
    // Quando troca dimensao, reseta valor e operador para defaults
    if (field === 'dimension') {
        item.filters[filterIndex].operator = 'is';
        item.filters[filterIndex].value = '';
    }
    persist();
}
// ----------------------------------------------------------------
// COMPUTATION ENGINE
// Motor de calculo - avalia cada item contra os dados atuais
// ----------------------------------------------------------------
/**
 * Compute all enabled ticker items.
 * Avalia todos os itens habilitados e retorna textos renderizados.
 *
 * @returns {Array<{ id: string, text: string, color: string }>}
 */
export function computeAll() {
    return tickerConfig.items
        .filter((item: any) => item.enabled)
        .map((item: any) => {
        const result = computeItem(item);
        return {
            id: item.id,
            text: result.text,
            color: item.color || '',
        };
    });
}
/**
 * Compute a single ticker item against current model data.
 * Avalia um item: aplica filtros, executa calculo, formata resultado.
 *
 * @param {any} item - TickerItem
 * @returns {{ text: string, value: number|null, error?: string }}
 */
export function computeItem(item: any) {
    try {
        // 1. Começa com todos os elementos
        let elements = getAllElements();
        // 2. Aplica filtros de nível de elemento (family, element, area)
        const elementFilters = item.filters.filter((f: any) => ['family', 'element', 'area'].includes(f.dimension));
        for (const filter of elementFilters) {
            elements = applyElementFilter(elements, filter);
        }
        // 3. Coleta observações dos elementos filtrados
        let observations = [];
        for (const el of elements) {
            const obs = el.data?.observations || [];
            observations.push(...obs.map((o: any) => ({
                ...o,
                _elementId: el.id,
                _elementName: el.name,
                _variables: o.variables || inferVariablesFromFamily(el.family),
            })));
            // Inclui latestReadings de sensores como pseudo-observações
            // Permite ticker mostrar dados live do Open-Meteo
            if (el.family === 'sensor' && Array.isArray(el.data?.latestReadings)) {
                for (const r of el.data.latestReadings) {
                    observations.push({
                        parameterId: r.parameterId,
                        value: r.value,
                        unitId: r.unit,
                        date: r.timestamp || el.data?.lastFetch || new Date().toISOString(),
                        source: 'sensor-live',
                        _elementId: el.id,
                        _elementName: el.name,
                        _variables: inferVariablesFromFamily('sensor'),
                    });
                }
            }
        }
        // 4. Aplica filtros de nível de observação (parameter, campaign, category, variable)
        const obsFilters = item.filters.filter((f: any) => ['parameter', 'campaign', 'category', 'variable'].includes(f.dimension));
        for (const filter of obsFilters) {
            observations = applyObservationFilter(observations, filter);
        }
        // 5. Extrai valores numéricos e converte unidades se necessário
    const values: any[] = [];
        for (const obs of observations) {
            if (obs.value == null || isNaN(obs.value))
                continue;
            let v = Number(obs.value);
            if (item.unitId && obs.unitId && obs.unitId !== item.unitId) {
                const result: any = convert(v, obs.unitId, item.unitId);
                if (result.success)
                    v = result.value;
            }
            (values as any[]).push({ value: v, date: obs.date, campaignId: obs.campaignId });
        }
        // 6. Executa cálculo
        const calcResult = executeCalculation(item, values);
        // 7. Formata resultado
        const formatted = formatResult(calcResult, item);
        return {
            text: `${item.label}${formatted}${item.suffix}`,
            value: calcResult.value,
        };
    }
    catch (e: any) {
        return { text: `${item.label}[error]${item.suffix}`, value: null, error: /** @type {any} */ (e).message };
    }
}
// ----------------------------------------------------------------
// FILTER APPLICATION
// Aplicacao dos filtros dinamicos nos dados
// ----------------------------------------------------------------
/**
 * Apply an element-level filter.
 * Filtra lista de elementos por uma dimensao (family, element, area).
 *
 * @param {any[]} elements
 * @param {any} filter
 * @returns {any[]}
 */
function applyElementFilter(elements: any,filter: any) {
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
        // Busca elementos contidos na area via grafo de edges
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
/**
 * Apply an observation-level filter.
 * Filtra lista de observações por uma dimensao (parameter, campaign, category).
 *
 * @param {any[]} observations
 * @param {any} filter
 * @returns {any[]}
 */
function applyObservationFilter(observations: any,filter: any) {
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
        // Resolve categoria do parâmetro da observação
        return matchFilter(observations, (o: any) => {
            const param = CONFIG.PARAMETERS?.find((p: any) => p.id === o.parameterId);
            return param?.category || '';
        }, operator, value);
    }
    if (dimension === 'variable') {
        // Filtro generico por qualquer OBSERVATION_VARIABLE
        const varId = filter.variableId;
        if (!varId)
            return observations;
        return matchFilter(observations, (o: any) => {
            return getVariableValue(o._variables || o.variables, varId);
        }, operator, value);
    }
    return observations;
}
/**
 * Generic filter matcher supporting is/is_not/in/not_in operators.
 * Comparador genérico - funciona para qualquer dimensao.
 *
 * @param {any[]} items
 * @param {(item: any) => any} accessor
 * @param {string} operator
 * @param {any} value
 * @returns {any[]}
 */
function matchFilter(items: any,accessor: any,operator: any,value: any) {
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
// CALCULATION EXECUTION
// Execução do cálculo selecionado
// ----------------------------------------------------------------
/**
 * Execute the selected calculation on numeric values.
 * Executa soma, media, min, max, contagem, ultimo, variacao %, tendencia.
 *
 * @param {any} item - TickerItem (para campaignA/B no change_pct)
 * @param {Array<{ value: number, date: string, campaignId: string }>} values
 * @returns {any}
 */
function executeCalculation(item: any,values: any) {
    const nums = values.map((v: any) => v.value);
    if (nums.length === 0 && item.calculation !== 'count') {
        return { value: null, label: '—' };
    }
    switch (item.calculation) {
        case 'sum':
            return { value: nums.reduce((a: any, b: any) => a + b, 0) };
        case 'average': {
            const stats: any = descriptiveStats(nums);
            return { value: stats.mean };
        }
        case 'min': {
            const stats: any = descriptiveStats(nums);
            return { value: stats.min };
        }
        case 'max': {
            const stats: any = descriptiveStats(nums);
            return { value: stats.max };
        }
        case 'count':
            return { value: nums.length };
        case 'latest': {
            // Ordena por data decrescente, pega o primeiro valor
            const sorted = [...values].filter((v: any) => v.date).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
            return { value: sorted.length > 0 ? sorted[0].value : null };
        }
        case 'sensor_live': {
            // Ultimo valor + timestamp HH:MM:SS (para ticker live de sensor)
            const liveSorted = [...values]
                .filter((v: any) => v.date)
                .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
            if (liveSorted.length === 0)
                return { value: null, label: '—' };
            const latest = liveSorted[0];
            const ts = new Date(latest.date);
            const hms = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
            return { value: latest.value, timeLabel: hms };
        }
        case 'change_pct': {
            // Variacao percentual entre campanha A e campanha B
            const valsA = values.filter((v: any) => v.campaignId === item.campaignA).map((v: any) => v.value);
            const valsB = values.filter((v: any) => v.campaignId === item.campaignB).map((v: any) => v.value);
            if (valsA.length === 0 || valsB.length === 0)
                return { value: null, label: '—' };
            const meanA = (descriptiveStats(valsA) as any).mean;
            const meanB = (descriptiveStats(valsB) as any).mean;
            if (meanA === 0)
                return { value: null, label: '—' };
            const pct = ((meanB - meanA) / Math.abs(meanA)) * 100;
            return { value: pct, isPct: true };
        }
        case 'trend': {
            // Mann-Kendall: tendencia monotonica nao-parametrica
            if (nums.length < 4)
                return { value: null, label: '—' };
            const result = /** @type {any} */ (mannKendall(nums)) as any;
            
            const arrows = { increasing: '\u2191', decreasing: '\u2193', stable: '\u2192' };
            const arrow = (arrows as Record<string,any>)[result.trend] || '\u2192';
            return { value: result.tau, label: `${arrow} ${result.trend}`, isTrend: true, trend: result.trend };
        }
        default:
            return { value: null, label: '?' };
    }
}
// ----------------------------------------------------------------
// FORMATTING
// Formatação do resultado para exibição
// ----------------------------------------------------------------
/**
 * Format computed result as display string.
 * Formata valor numerico com unidade e precisao.
 *
 * @param {any} calcResult
 * @param {any} item
 * @returns {string}
 */
function formatResult(calcResult: any,item: any) {
    if (calcResult.label && calcResult.value == null) {
        return calcResult.label;
    }
    if (calcResult.isTrend) {
        return calcResult.label;
    }
    // sensor_live: valor + timestamp HH:MM:SS
    if (calcResult.timeLabel) {
        const v = calcResult.value != null ? calcResult.value.toFixed(item.precision) : '—';
        return `${calcResult.timeLabel} ${v}`;
    }
    if (calcResult.isPct) {
        const sign = calcResult.value > 0 ? '+' : '';
        return `${sign}${calcResult.value.toFixed(item.precision)}%`;
    }
    if (calcResult.value == null)
        return '—';
    if (item.unitId) {
        return formatWithUnit(calcResult.value, item.unitId, item.precision);
    }
    return calcResult.value.toFixed(item.precision);
}
// ----------------------------------------------------------------
// PERSISTENCE
// Salva estado no localStorage
// ----------------------------------------------------------------
function persist() {
    if (isEphemeral())
        return;
    safeSetItem(STORAGE_KEY, JSON.stringify(tickerConfig));
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// Serialização para modelo ECO
// ----------------------------------------------------------------
/**
 * Clear all ticker items and reset to defaults.
 * Limpa todos os itens e reseta configuracao.
 */
export function clearTicker() {
    tickerConfig = { visible: false, speed: 'medium', separator: ' \u2022 ', items: [] };
    nextId = 1;
    persist();
}
/**
 * Export ticker config for model serialization.
 * Exporta configuração completa para buildModel().
 *
 * @returns {Object} TickerConfig
 */
export function exportTicker() {
    return deepClone(tickerConfig);
}
/**
 * Import ticker config from model.
 * Restaura configuração a partir de modelo importado.
 *
 * @param {any} config - TickerConfig from model
 */
export function importTicker(config: any) {
    if (!config)
        return;
    tickerConfig = {
        visible: config.visible ?? false,
        speed: config.speed || 'medium',
        separator: config.separator || ' \u2022 ',
        items: Array.isArray(config.items) ? config.items : [],
    };
    // Recalcula proximo ID
    if (tickerConfig.items.length > 0) {
        const maxNum = tickerConfig.items.reduce((max: any, item: any) => {
            const num = parseInt(item.id?.replace('ticker-', '') || '0');
            return num > max ? num : max;
        }, 0);
        nextId = maxNum + 1;
    }
    persist();
}
// ----------------------------------------------------------------
// DIMENSION OPTIONS
// Opcoes disponiveis para cada dimensao de filtro
// Usado pelo editor de filtros no modal de configuracao
// ----------------------------------------------------------------
/**
 * Get available values for a filter dimension.
 * Retorna lista de opcoes para popular dropdown de valores.
 *
 * @param {string} dimension
 * @returns {Array<{ id: string, label: string }>}
 */
export function getDimensionOptions(dimension: any) {
    switch (dimension) {
        case 'parameter':
            return (CONFIG.PARAMETERS || []).map((p: any) => ({
                id: p.id,
                label: p.name,
            }));
        case 'family':
            return Object.values(getAllFamilies() || {}).map((f: any) => ({
                id: f.id,
                label: f.nameKey || f.name || f.id,
            }));
        case 'element':
            return getAllElements().map((el: any) => ({
                id: el.id,
                label: el.name || el.id,
            }));
        case 'area':
            return getElementsByFamily('area').map((el: any) => ({
                id: el.id,
                label: el.name || el.id,
            }));
        case 'campaign':
            return getAllCampaigns().map((c: any) => ({
                id: c.id,
                label: c.name || c.id,
            }));
        case 'category': {
            const cats = new Set();
            (CONFIG.PARAMETERS || []).forEach((p: any) => {
                if (p.category)
                    cats.add(p.category);
            });
            return [...cats].sort().map((c: any) => ({ id: c, label: c }));
        }
        case 'variable':
            // Retorna todas as OBSERVATION_VARIABLES como opcoes de filtro
            return (CONFIG.OBSERVATION_VARIABLES || []).map((v: any) => ({
                id: v.id,
                label: v.name,
                group: v.group,
                type: v.type,
                options: v.options || null,
            }));
        default:
            return [];
    }
}
// ----------------------------------------------------------------
// RANDOM GENERATION
// Gera itens de ticker aleatorios para o modelo random
// ----------------------------------------------------------------
/**
 * Generate random ticker items based on current model data.
 * Cria 3-5 itens de exemplo com filtros e calculos variados.
 * Chamado apos generateRandomModel() no main.js.
 */
export function generateRandomTicker() {
    const params = CONFIG.PARAMETERS || [];
    const campaigns = getAllCampaigns();
    const elements = getAllElements();
    if (params.length === 0)
        return;
    // eslint-disable-next-line
    const calcs = ['sum', 'average', 'min', 'max', 'count', 'latest'];
    const randChoice = (arr: any) => arr[Math.floor(Math.random() * arr.length)];
    // Item 1: Media de pH (todos os elementos)
    const phParam = params.find((p: any) => p.id === 'pH');
    if (phParam) {
        addTickerItem({
            label: 'pH ',
            suffix: '',
            filters: [{ dimension: 'parameter', operator: 'is', value: 'pH' }],
            calculation: 'average',
            precision: 1,
            color: '#2d8a7a',
        });
    }
    // Item 2: Contaminante aleatorio - contagem
    const contaminants = params.filter((p: any) => p.category === 'contaminant');
    if (contaminants.length > 0) {
        const contam = randChoice(contaminants);
        addTickerItem({
            label: `${contam.name}: `,
            suffix: ' obs',
            filters: [{ dimension: 'parameter', operator: 'is', value: contam.id }],
            calculation: 'count',
            precision: 0,
            color: '#b84444',
        });
    }
    // Item 3: Variação % entre campanhas (se existirem 2+)
    if (campaigns.length >= 2) {
        const param = params.find((p: any) => p.id === 'temperature') || randChoice(params);
        addTickerItem({
            label: `${param.name} \u0394: `,
            suffix: '',
            filters: [{ dimension: 'parameter', operator: 'is', value: param.id }],
            calculation: 'change_pct',
            campaignA: campaigns[0].id,
            campaignB: campaigns[campaigns.length - 1].id,
            precision: 1,
            color: '#3d8a5c',
        });
    }
    // Item 4: Maximo de parametro aleatorio nos pocos
    const wells = elements.filter((e: any) => e.family === 'well');
    if (wells.length > 0 && params.length > 3) {
        const param = randChoice(params.slice(0, 5));
        addTickerItem({
            label: `${param.name} max: `,
            suffix: '',
            filters: [
                { dimension: 'parameter', operator: 'is', value: param.id },
                { dimension: 'family', operator: 'is', value: 'well' },
            ],
            calculation: 'max',
            unitId: param.defaultUnitId || null,
            precision: 2,
            color: '#b8862e',
        });
    }
    // Item 5: Temperatura live dos sensores (HH:MM:SS + valor)
    const sensors = elements.filter((e: any) => e.family === 'sensor');
    if (sensors.length > 0) {
        addTickerItem({
            label: 'Sensor Temp: ',
            suffix: ' °C',
            filters: [
                { dimension: 'parameter', operator: 'is', value: 'temperature' },
                { dimension: 'family', operator: 'is', value: 'sensor' },
            ],
            calculation: 'sensor_live',
            precision: 1,
            color: '#4a90d9',
        });
    }
    // Ativar ticker bar
    tickerConfig.visible = true;
    persist();
}
