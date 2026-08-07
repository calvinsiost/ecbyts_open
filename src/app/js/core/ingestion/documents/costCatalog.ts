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
   COST CATALOG — Catálogo de Custos de Referência
   ================================================================

   Módulo compartilhado pelos ADR-022 (Document Ingestion) e ADR-023
   (Spatial Optimization). Fornece preços de referência para ensaios
   analíticos, CAPEX de instalação e OPEX operacional.

   PADRÃO FIELDMANAGER:
   - Defaults estáticos neste arquivo (CONFIG level)
   - User overrides em localStorage('ecbyts_cost_catalog') — Category B
   - Runtime: merge(defaults, overrides) → catálogo ativo
   - Tudo é editável pelo usuário: categorias, itens, preços, moeda

   NÍVEIS DO COST FRAMEWORK:
   L1 Reading  → observation.cost      (preço do ensaio analítico)
   L2 Element  → element.data.costs[]  (CAPEX+OPEX anual por fiscal year)
   L3 Campaign → campaign.costs[]      (mobilização, logística, coleta)
   L4 Project  → wbsItems[] (já existe em governance/wbsManager.js)

   ================================================================ */

import { safeSetItem } from '../../../utils/storage/storageMonitor.js';

// ----------------------------------------------------------------
// STORAGE KEY - Category B (preservado em version changes)
// ----------------------------------------------------------------

const STORAGE_KEY = 'ecbyts_cost_catalog';

// ----------------------------------------------------------------
// DEFAULT CATALOG - Preços de referência (editável pelo usuário)
// Valores em BRL baseados em mercado brasileiro 2024-2026
// ----------------------------------------------------------------

const DEFAULT_CATALOG = {
    version: '1.0',
    currency: 'BRL',
    escalationRate: 0,

    // Categorias de custo - user-extensible
    categories: {
        capex: {
            label: { en: 'CAPEX', pt: 'CAPEX', es: 'CAPEX' },
            items: [
                {
                    id: 'drilling',
                    label: { en: 'Drilling', pt: 'Perfuração', es: 'Perforación' },
                    defaultPerUnit: 350,
                    unit: '/m',
                },
                {
                    id: 'installation',
                    label: { en: 'Installation', pt: 'Instalação', es: 'Instalación' },
                    defaultPerUnit: 2500,
                    unit: 'fixed',
                },
                {
                    id: 'equipment',
                    label: { en: 'Equipment', pt: 'Equipamento', es: 'Equipamiento' },
                    defaultPerUnit: 0,
                    unit: 'fixed',
                },
                {
                    id: 'decommission',
                    label: { en: 'Decommission', pt: 'Descomissionamento', es: 'Desmantelamiento' },
                    defaultPerUnit: 1500,
                    unit: 'fixed',
                },
            ],
        },
        opex: {
            label: { en: 'OPEX', pt: 'OPEX', es: 'OPEX' },
            items: [
                {
                    id: 'analytical',
                    label: { en: 'Analytical', pt: 'Analítico', es: 'Analítico' },
                    defaultPerUnit: 0,
                    unit: '/test',
                },
                {
                    id: 'sampling',
                    label: { en: 'Sampling', pt: 'Coleta', es: 'Muestreo' },
                    defaultPerUnit: 0,
                    unit: '/test',
                },
                {
                    id: 'maintenance',
                    label: { en: 'Maintenance', pt: 'Manutenção', es: 'Mantenimiento' },
                    defaultPerUnit: 0,
                    unit: '/year',
                },
                {
                    id: 'travel',
                    label: { en: 'Mobilization', pt: 'Mobilização', es: 'Movilización' },
                    defaultPerUnit: 0,
                    unit: '/visit',
                },
                {
                    id: 'logistics',
                    label: { en: 'Logistics', pt: 'Logística', es: 'Logística' },
                    defaultPerUnit: 0,
                    unit: '/visit',
                },
                {
                    id: 'reporting',
                    label: { en: 'Reporting', pt: 'Relatórios', es: 'Informes' },
                    defaultPerUnit: 0,
                    unit: 'fixed',
                },
            ],
        },
    },

    // Preços analíticos por parâmetro - baseados em métodos EPA/CETESB
    // Agrupados por método analítico (ensaios do mesmo método têm preço similar)
    analyticalPrices: {
        // BTEX + Naftaleno - EPA 8260 (VOCs por GC-MS purge-and-trap)
        benzene: { price: 150, method: 'EPA 8260', samplingCost: 45 },
        toluene: { price: 150, method: 'EPA 8260', samplingCost: 45 },
        ethylbenzene: { price: 150, method: 'EPA 8260', samplingCost: 45 },
        xylenes: { price: 150, method: 'EPA 8260', samplingCost: 45 },
        naphthalene: { price: 180, method: 'EPA 8270', samplingCost: 45 },
        btex: { price: 180, method: 'EPA 8260', samplingCost: 45 },
        voc: { price: 250, method: 'EPA 8260', samplingCost: 45 },
        tph: { price: 220, method: 'EPA 8015', samplingCost: 45 },

        // Parâmetros físico-químicos - métodos rápidos (menor custo)
        pH: { price: 25, method: 'SMEWW 4500-H', samplingCost: 20 },
        conductivity: { price: 25, method: 'SMEWW 2510', samplingCost: 20 },
        temperature: { price: 15, method: 'Field', samplingCost: 10 },
        redox: { price: 30, method: 'SMEWW 2580', samplingCost: 20 },
        water_level: { price: 10, method: 'Field', samplingCost: 5 },
        flow_rate: { price: 35, method: 'Field', samplingCost: 15 },

        // Emissões - GHG Protocol / ABNT NBR
        ghg_scope1: { price: 500, method: 'GHG Protocol', samplingCost: 200 },
        ghg_scope2: { price: 350, method: 'GHG Protocol', samplingCost: 100 },
        pm25: { price: 280, method: 'EPA 40 CFR 50', samplingCost: 150 },
        pm10: { price: 280, method: 'EPA 40 CFR 50', samplingCost: 150 },
        nox: { price: 320, method: 'EPA 7E', samplingCost: 150 },
        sox: { price: 320, method: 'EPA 6C', samplingCost: 150 },

        // Resíduos
        waste_total: { price: 180, method: 'ABNT 10004', samplingCost: 80 },
        waste_hazardous: { price: 350, method: 'ABNT 10004', samplingCost: 120 },
        waste_recycled_pct: { price: 50, method: 'Inventory', samplingCost: 0 },

        // Efluentes - SMEWW / CONAMA 430
        effluent_flow: { price: 35, method: 'Field', samplingCost: 15 },
        bod: { price: 120, method: 'SMEWW 5210', samplingCost: 40 },
        cod: { price: 95, method: 'SMEWW 5220', samplingCost: 40 },
        tss: { price: 60, method: 'SMEWW 2540', samplingCost: 30 },

        // H&S - Não são ensaios laboratoriais (custo de registro/auditoria)
        frequency_rate: { price: 0, method: 'Record', samplingCost: 0 },
        severity_rate: { price: 0, method: 'Record', samplingCost: 0 },
        ltir: { price: 0, method: 'Record', samplingCost: 0 },
        near_miss: { price: 0, method: 'Record', samplingCost: 0 },
        noise_exposure: { price: 85, method: 'NHO-01', samplingCost: 30 },

        // Biodiversidade
        species_count: { price: 2000, method: 'Field Survey', samplingCost: 500 },
        protected_area: { price: 0, method: 'GIS', samplingCost: 0 },
        biodiversity_index: { price: 3000, method: 'Shannon-Wiener', samplingCost: 800 },
    },

    // Custos de instalação por família de elemento (CAPEX defaults)
    elementCosts: {
        well: { drilling: 350, installation: 2500, decommission: 1500 },
        spring: { drilling: 0, installation: 800, decommission: 500 },
        lake: { drilling: 0, installation: 0, decommission: 0 },
        river: { drilling: 0, installation: 0, decommission: 0 },
        tank: { drilling: 0, installation: 5000, decommission: 3000 },
        plume: { drilling: 0, installation: 0, decommission: 0 },
        sensor: { drilling: 0, installation: 1200, decommission: 400 },
        emission_source: { drilling: 0, installation: 2000, decommission: 800 },
        waste_stream: { drilling: 0, installation: 0, decommission: 0 },
        effluent_point: { drilling: 0, installation: 1500, decommission: 600 },
        area: { drilling: 0, installation: 0, decommission: 0 },
        habitat: { drilling: 0, installation: 0, decommission: 0 },
        individual: { drilling: 0, installation: 0, decommission: 0 },
    },

    // Custos de campanha (L3) - defaults por visita
    campaignCosts: {
        mobilization: 2500,
        sampling_team: 1800,
        logistics: 1200,
        equipment: 500,
        per_diem: 450,
    },
};

// ----------------------------------------------------------------
// RUNTIME STATE - Merged catalog (defaults + user overrides)
// ----------------------------------------------------------------

/** @type {any} */
let _catalog: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Retorna catálogo ativo (defaults + user overrides merged).
 * Lazy-load: lê localStorage apenas na primeira chamada.
 * @returns {any} Catálogo de custos
 */
export function getCostCatalog() {
    if (!_catalog) _catalog = _loadCatalog();
    return _catalog;
}

/**
 * Retorna moeda ativa do catálogo.
 * @returns {string} Código ISO 4217 (ex: 'BRL', 'USD')
 */
export function getCurrency() {
    return getCostCatalog().currency;
}

/**
 * Retorna taxa de escalação anual (inflação).
 * @returns {number} Taxa decimal (ex: 0.05 = 5%)
 */
export function getEscalationRate() {
    return getCostCatalog().escalationRate || 0;
}

/**
 * Retorna preço analítico de referência para um parâmetro.
 * @param {string} parameterId - ID do parâmetro (ex: 'benzene')
 * @returns {{ price: number, method: string, samplingCost: number } | null}
 */
export function getAnalyticalPrice(parameterId: any) {
    const cat = getCostCatalog();
    return cat.analyticalPrices[parameterId] || null;
}

/**
 * Retorna custos de instalação default para uma família de elemento.
 * @param {string} familyId - ID da família (ex: 'well')
 * @returns {{ drilling: number, installation: number, decommission: number } | null}
 */
export function getElementCostDefaults(familyId: any) {
    const cat = getCostCatalog();
    return cat.elementCosts[familyId] || null;
}

/**
 * Retorna custos de campanha default.
 * @returns {Object} Map de item → valor
 */
export function getCampaignCostDefaults() {
    return getCostCatalog().campaignCosts;
}

/**
 * Retorna categorias de custo (CAPEX, OPEX, + user-defined).
 * @returns {Object} Map de categoryId → { label, items[] }
 */
export function getCostCategories() {
    return getCostCatalog().categories;
}

/**
 * Constrói objeto cost para uma observation (L1).
 * Usa preço analítico do catálogo se disponível.
 *
 * @param {string} parameterId - ID do parâmetro medido
 * @param {string} [source='catalog'] - Origem: 'catalog' | 'document' | 'user'
 * @returns {Object} Cost object no formato L1
 */
export function buildObservationCost(parameterId: any, source = 'catalog') {
    const cat = getCostCatalog();
    const priceInfo = cat.analyticalPrices[parameterId];
    const items = [];

    if (priceInfo && priceInfo.price > 0) {
        items.push({ categoryId: 'opex', itemId: 'analytical', amount: priceInfo.price });
    }
    if (priceInfo && priceInfo.samplingCost > 0) {
        items.push({ categoryId: 'opex', itemId: 'sampling', amount: priceInfo.samplingCost });
    }

    const total = items.reduce((s, it) => s + it.amount, 0);

    return {
        items,
        total,
        currency: cat.currency,
        source,
        catalogRef: parameterId,
        invoiceRef: null,
    };
}

/**
 * Constrói array de costs para um element (L2) num fiscal year.
 * Inclui CAPEX (instalação) e OPEX (analítico agregado + manutenção).
 *
 * @param {string} familyId - Família do elemento
 * @param {number} fiscalYear - Ano fiscal
 * @param {Object} [options] - Opções
 * @param {number} [options.depth] - Profundidade total (para drilling cost)
 * @param {number} [options.numReadings] - Número de leituras/ano (para OPEX analítico)
 * @param {number} [options.avgAnalyticalCost] - Custo médio por leitura
 * @param {string} [options.basis='estimate'] - 'estimate' | 'budget' | 'actual'
 * @param {boolean} [options.includeCapex=true] - Se inclui CAPEX (false para anos subsequentes)
 * @returns {Object} Cost entry para element.data.costs[]
 */
export function buildElementCostEntry(familyId: any, fiscalYear: any, options: any = {}) {
    const cat = getCostCatalog();
    const elCosts = cat.elementCosts[familyId] || {};
    const items = [];
    const includeCapex = options.includeCapex !== false;

    // CAPEX items (somente se includeCapex = true, tipicamente primeiro ano)
    if (includeCapex) {
        const depth = options.depth || 0;
        const drillingCost = (elCosts.drilling || 0) * depth;
        if (drillingCost > 0) {
            items.push({
                categoryId: 'capex',
                itemId: 'drilling',
                amount: Math.round(drillingCost * 100) / 100,
                note: `${depth}m × ${cat.currency} ${elCosts.drilling}/m`,
            });
        }
        if (elCosts.installation > 0) {
            items.push({ categoryId: 'capex', itemId: 'installation', amount: elCosts.installation });
        }
    }

    // OPEX items (se houver readings)
    const numReadings = options.numReadings || 0;
    const avgCost = options.avgAnalyticalCost || 0;
    if (numReadings > 0 && avgCost > 0) {
        items.push({
            categoryId: 'opex',
            itemId: 'analytical',
            amount: Math.round(numReadings * avgCost * 100) / 100,
            note: `${numReadings} readings × ${cat.currency} ${avgCost}`,
        });
    }

    // Manutenção anual (se família tem custo de instalação, assume manutenção ~10%)
    const maintCost = Math.round((elCosts.installation || 0) * 0.1);
    if (maintCost > 0) {
        items.push({ categoryId: 'opex', itemId: 'maintenance', amount: maintCost });
    }

    const capexTotal = items.filter((i) => i.categoryId === 'capex').reduce((s, i) => s + i.amount, 0);
    const opexTotal = items.filter((i) => i.categoryId === 'opex').reduce((s, i) => s + i.amount, 0);

    return {
        fiscalYear,
        items,
        currency: cat.currency,
        basis: options.basis || 'estimate',
        capexTotal: Math.round(capexTotal * 100) / 100,
        opexTotal: Math.round(opexTotal * 100) / 100,
        total: Math.round((capexTotal + opexTotal) * 100) / 100,
    };
}

/**
 * Constrói array de costs para uma campaign (L3).
 *
 * @param {number} numElements - Número de elementos amostrados
 * @param {number} numReadings - Número total de leituras
 * @param {number} [avgAnalyticalCost] - Custo médio por leitura
 * @returns {Object} Cost entry para campaign.costs
 */
export function buildCampaignCost(numElements: any, numReadings: any, avgAnalyticalCost = 0) {
    const cat = getCostCatalog();
    const defaults = cat.campaignCosts;
    const items = [];

    if (defaults.mobilization > 0) {
        items.push({ categoryId: 'opex', itemId: 'travel', amount: defaults.mobilization });
    }
    if (defaults.sampling_team > 0) {
        items.push({
            categoryId: 'opex',
            itemId: 'sampling',
            amount: defaults.sampling_team,
            note: `${numElements} elements`,
        });
    }
    if (defaults.logistics > 0) {
        items.push({ categoryId: 'opex', itemId: 'logistics', amount: defaults.logistics });
    }
    if (numReadings > 0 && avgAnalyticalCost > 0) {
        items.push({
            categoryId: 'opex',
            itemId: 'analytical',
            amount: Math.round(numReadings * avgAnalyticalCost * 100) / 100,
            note: `${numReadings} readings`,
        });
    }

    const total = items.reduce((s, i) => s + i.amount, 0);
    return {
        items,
        total: Math.round(total * 100) / 100,
        currency: cat.currency,
        source: 'catalog',
    };
}

/**
 * Salva overrides do usuário no localStorage.
 * Merge inteligente: só salva campos alterados.
 * @param {Object} overrides - Campos a sobrescrever
 */
export function saveCostOverrides(overrides: any) {
    try {
        const current = _loadOverrides();
        const merged = _deepMerge(current, overrides);
        safeSetItem(STORAGE_KEY, JSON.stringify(merged));
        _catalog = null; // Invalida cache → próximo getCostCatalog() recarrega
    } catch (e) {
        console.error('[CostCatalog] Erro ao salvar overrides:', e);
    }
}

/**
 * Reseta catálogo para defaults (remove overrides do localStorage).
 */
export function resetCostCatalog() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        _catalog = null;
    } catch (e) {
        console.error('[CostCatalog] Erro ao resetar:', e);
    }
}

/**
 * Exporta catálogo completo para serialização (ECO1).
 * @returns {Object} Catálogo ativo
 */
export function exportCostCatalog() {
    return getCostCatalog();
}

/**
 * Importa catálogo de dados salvos.
 * @param {Object} data - Catálogo a importar
 */
export function importCostCatalog(data: any) {
    if (data && typeof data === 'object') {
        saveCostOverrides(data);
    }
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

function _loadCatalog() {
    const overrides = _loadOverrides();
    return _deepMerge(structuredClone(DEFAULT_CATALOG), overrides);
}

function _loadOverrides() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn('[CostCatalog] Overrides inválidos no localStorage:', e);
        return {};
    }
}

function _deepMerge(/** @type {any} */ target: any, /** @type {any} */ source: any) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            _deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
