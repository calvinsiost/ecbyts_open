// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   REGRAS DE VALIDACAO (VALIDATION RULES)
   ================================================================

   Motor de validacao para observacoes e dados ESG.
   Suporta validacao por CAS Number, limites regulatorios,
   deteccao de outliers e benchmarks.

   TIPOS DE VALIDACAO:
   - CAS Number: Limites por substancia + matriz
   - Statistical: Deteccao de outliers (Z-score, IQR)
   - Regulatory: Conformidade com normas
   - Benchmark: Comparacao com referencias

   ================================================================ */

import { convert } from '../units/converter.js';
import { CONFIG } from '../../config.js';
import { safeSetItem } from '../../utils/storage/storageMonitor.js';

/**
 * @typedef {{ type: string, value: number, matrix: string, unit: string, severity?: string, source: string, jurisdiction?: string, meta?: Record<string, any>, exceedance?: string }} ThresholdEntry
 * @typedef {{ parameter?: { casNumber?: string, matrix?: string }, value: any, unitId?: string, uncertainty?: number, uncertaintyType?: string }} ValidationObservation
 * @typedef {{ landUse?: string }} ThresholdOptions
 * @typedef {{ mean: number, stdDev: number, q1: number, q3: number, min?: number, max?: number, count?: number }} ValidationStats
 */

// ----------------------------------------------------------------
// THRESHOLDS REGULATORIOS - FRAMEWORK VR/VP/VI
// ----------------------------------------------------------------
// Modelo: array aberto de ThresholdEntry por CAS ou parameterId.
// Cada entry e auto-contido (matrix e unit dentro do entry).
// Suporta VI, VP, VR, CMA, screening e tipos customizados.
// ----------------------------------------------------------------

/**
 * Severity default por tipo de threshold.
 * Pode ser sobrescrito pelo campo `severity` no entry.
 * @type {Record<string, string>}
 */
export const DEFAULT_SEVERITY = {
    vi: 'intervention',
    cma: 'intervention',
    vp: 'prevention',
    vr: 'reference',
    screening: 'info',
};

/** @type {Record<string, number>} Prioridade numerica de cada severity (maior = mais severo) */
const _SEVERITY_RANK = { intervention: 4, prevention: 3, reference: 2, info: 1 };

/**
 * Thresholds regulatorios por CAS Number.
 * Estrutura: CAS -> ThresholdEntry[]
 * Cada entry: { type, value, matrix, unit, severity, source, meta }
 * @type {Record<string, ThresholdEntry[]>}
 */
export const REGULATORY_THRESHOLDS = {
    // Benzeno (CAS 71-43-2) - BTEX
    '71-43-2': [
        {
            type: 'vi',
            value: 5,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { fraction: 'dissolved' },
        },
        {
            type: 'vi',
            value: 0.03,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vi',
            value: 0.06,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'agricultural' },
        },
        {
            type: 'vi',
            value: 0.08,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'industrial' },
        },
        {
            type: 'vp',
            value: 0.015,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 1,
            matrix: 'air',
            unit: 'ppm',
            severity: 'intervention',
            source: 'NR-15',
            jurisdiction: 'BR_NR15',
            meta: { type: 'TWA_8h' },
        },
    ],
    // Tolueno (CAS 108-88-3) - BTEX
    '108-88-3': [
        {
            type: 'vi',
            value: 700,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 0.14,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vp',
            value: 0.14,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 78,
            matrix: 'air',
            unit: 'ppm',
            severity: 'intervention',
            source: 'NR-15',
            jurisdiction: 'BR_NR15',
            meta: { type: 'TWA_8h' },
        },
    ],
    // Etilbenzeno (CAS 100-41-4) - BTEX
    '100-41-4': [
        {
            type: 'vi',
            value: 300,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 0.072,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
    ],
    // Xilenos (CAS 1330-20-7) - BTEX
    '1330-20-7': [
        {
            type: 'vi',
            value: 500,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 0.13,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
    ],
    // Arsenio (CAS 7440-38-2) - Metal
    '7440-38-2': [
        {
            type: 'vi',
            value: 10,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 396/2008',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 35,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vp',
            value: 15,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    // Chumbo (CAS 7439-92-1) - Metal
    '7439-92-1': [
        {
            type: 'vi',
            value: 10,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 396/2008',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 150,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vp',
            value: 72,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    // Cadmio (CAS 7440-43-9) - Metal
    '7440-43-9': [
        {
            type: 'vi',
            value: 5,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 396/2008',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 3,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vp',
            value: 1.3,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    // Cromo VI (CAS 18540-29-9) - Metal
    '18540-29-9': [
        {
            type: 'vi',
            value: 50,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 396/2008',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 0.4,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
    ],
    // Mercurio (CAS 7439-97-6) - Metal
    '7439-97-6': [
        {
            type: 'vi',
            value: 1,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 396/2008',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 12,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
        {
            type: 'vp',
            value: 0.5,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'prevention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    // Naftaleno (CAS 91-20-3) - PAH
    '91-20-3': [
        {
            type: 'vi',
            value: 60,
            matrix: 'groundwater',
            unit: 'ug_L',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
        {
            type: 'vi',
            value: 0.12,
            matrix: 'soil',
            unit: 'mg_kg',
            severity: 'intervention',
            source: 'CONAMA 420/2009',
            jurisdiction: 'BR_CONAMA',
            meta: { landUse: 'residential' },
        },
    ],
};

/**
 * Thresholds para parametros sem CAS (agregados).
 * Estrutura: parameterId -> ThresholdEntry[]
 * @type {Record<string, ThresholdEntry[]>}
 */
export const PARAMETER_THRESHOLDS = {
    // Efluentes - CONAMA 430/2011
    bod: [
        {
            type: 'vi',
            value: 60,
            matrix: 'effluent',
            unit: 'mg_L',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    cod: [
        {
            type: 'vi',
            value: 120,
            matrix: 'effluent',
            unit: 'mg_L',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    tss: [
        {
            type: 'vi',
            value: 100,
            matrix: 'effluent',
            unit: 'mg_L',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    pH_effluent: [
        {
            type: 'vi',
            value: 9,
            matrix: 'effluent',
            unit: 'pH',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: { bound: 'max' },
        },
        {
            type: 'vi',
            value: 5,
            matrix: 'effluent',
            unit: 'pH',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: { bound: 'min' },
        },
    ],
    temperature_effluent: [
        {
            type: 'vi',
            value: 40,
            matrix: 'effluent',
            unit: 'celsius',
            severity: 'intervention',
            source: 'CONAMA 430/2011',
            jurisdiction: 'BR_CONAMA',
            meta: {},
        },
    ],
    // Qualidade do ar - OMS 2021
    pm25: [
        {
            type: 'vi',
            value: 25,
            matrix: 'air',
            unit: 'ug_m3',
            severity: 'intervention',
            source: 'OMS 2021',
            jurisdiction: 'WHO',
            meta: {},
        },
    ],
    pm10: [
        {
            type: 'vi',
            value: 45,
            matrix: 'air',
            unit: 'ug_m3',
            severity: 'intervention',
            source: 'OMS 2021',
            jurisdiction: 'WHO',
            meta: {},
        },
    ],
    // Ruido ocupacional - NR-15
    noise_exposure_8h: [
        {
            type: 'vi',
            value: 85,
            matrix: 'occupational',
            unit: 'dBA',
            severity: 'intervention',
            source: 'NR-15',
            jurisdiction: 'BR_NR15',
            meta: {},
        },
    ],
    noise_exposure_4h: [
        {
            type: 'vi',
            value: 90,
            matrix: 'occupational',
            unit: 'dBA',
            severity: 'intervention',
            source: 'NR-15',
            jurisdiction: 'BR_NR15',
            meta: {},
        },
    ],
    noise_exposure_2h: [
        {
            type: 'vi',
            value: 95,
            matrix: 'occupational',
            unit: 'dBA',
            severity: 'intervention',
            source: 'NR-15',
            jurisdiction: 'BR_NR15',
            meta: {},
        },
    ],
};

// ----------------------------------------------------------------
// CUSTOM THRESHOLDS (site-specific, incluindo CMA)
// ----------------------------------------------------------------

/** @type {Record<string, ThresholdEntry[]>} Custom thresholds definidos pelo usuario. CAS|parameterId -> ThresholdEntry[] */
let _customThresholds: any = {};
const STORAGE_KEY = 'ecbyts-custom-regulatory-thresholds';

/** Carrega custom thresholds do localStorage */
function _loadCustom() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) _customThresholds = JSON.parse(raw);
    } catch (e) {
        console.debug('[validation/rules] loadCustom:', (e as any)?.message || e);
        /* silent */
    }
}

/** Persiste custom thresholds no localStorage */
function _saveCustom() {
    safeSetItem(STORAGE_KEY, JSON.stringify(_customThresholds));
}

// Inicializa ao carregar modulo
_loadCustom();

/**
 * Adiciona threshold customizado.
 * @param {string} casOrParamId
 * @param {ThresholdEntry} entry
 */
export function addCustomThreshold(casOrParamId: any, entry: any) {
    if (!_customThresholds[casOrParamId]) _customThresholds[casOrParamId] = [];
    _customThresholds[casOrParamId].push(entry);
    _saveCustom();
}

/**
 * Remove threshold customizado por indice.
 * @param {string} casOrParamId
 * @param {number} index
 */
export function removeCustomThreshold(casOrParamId: any, index: any) {
    if (!_customThresholds[casOrParamId]) return;
    _customThresholds[casOrParamId].splice(index, 1);
    if (_customThresholds[casOrParamId].length === 0) delete _customThresholds[casOrParamId];
    _saveCustom();
}

/**
 * Retorna custom thresholds para um CAS/parameterId.
 * @param {string} casOrParamId
 * @returns {ThresholdEntry[]}
 */
export function getCustomThresholds(casOrParamId: any) {
    return _customThresholds[casOrParamId] || [];
}

/** Limpa todos os custom thresholds */
export function clearCustomThresholds() {
    _customThresholds = {};
    _saveCustom();
}

/** Exporta custom thresholds para serialização (ECO1) */
export function exportCustomThresholds() {
    return { ..._customThresholds };
}

/**
 * Importa custom thresholds (merge com existentes).
 * @param {Record<string, ThresholdEntry[]>} data
 */
export function importCustomThresholds(data: any) {
    if (!data || typeof data !== 'object') return;
    for (const [key, entries] of Object.entries(data)) {
        if (!Array.isArray(entries)) continue;
        if (!_customThresholds[key]) _customThresholds[key] = [];
        _customThresholds[key].push(...entries);
    }
    _saveCustom();
}

// ----------------------------------------------------------------
// HELPERS DE RESOLUCAO DE THRESHOLDS
// ----------------------------------------------------------------

/**
 * Retorna todos os thresholds para um CAS, mergeando built-in + custom.
 * Filtra por matrix se fornecido.
 * @param {string} cas - CAS Number
 * @param {string} [matrix] - Matriz ambiental (filtra se fornecido)
 * @param {ThresholdOptions} [options]
 * @returns {ThresholdEntry[]}
 */
export function getAllThresholds(cas: any, matrix: any, options: any = {}) {
    const builtIn = (REGULATORY_THRESHOLDS as any)[cas] || [];
    const custom = _customThresholds[cas] || [];
    let merged = [...builtIn, ...custom];

    if (matrix) {
        merged = merged.filter((t) => t.matrix === matrix);
    }
    if (options.landUse) {
        merged = merged.filter((t) => !t.meta?.landUse || t.meta.landUse === options.landUse);
    }
    return merged;
}

/**
 * Retorna todos os thresholds para um parameterId (sem CAS), mergeando built-in + custom.
 * @param {string} parameterId
 * @param {string} [matrix]
 * @returns {ThresholdEntry[]}
 */
export function getParameterThresholds(parameterId: any, matrix: any) {
    const builtIn = (PARAMETER_THRESHOLDS as any)[parameterId] || [];
    const custom = _customThresholds[parameterId] || [];
    let merged = [...builtIn, ...custom];

    if (matrix) {
        merged = merged.filter((t) => t.matrix === matrix);
    }
    return merged;
}

/**
 * Retorna o threshold mais severo excedido por um valor.
 * Itera thresholds ordenados por valor desc, retorna o primeiro excedido.
 * Para pH com bound='min', inverte a comparacao.
 * @param {number} value - Valor convertido
 * @param {ThresholdEntry[]} thresholds - ThresholdEntry[]
 * @returns {(ThresholdEntry & { severity: string, exceedance: string })|null} - { ...ThresholdEntry, exceedance } ou null
 */
export function getExceededThreshold(value: any, thresholds: any) {
    if (!thresholds || thresholds.length === 0) return null;

    // Ordenar por valor desc (maior primeiro = threshold mais alto primeiro)
    const sorted = [...thresholds].sort((a, b) => b.value - a.value);

    for (const t of sorted) {
        const isMin = t.meta?.bound === 'min';
        const exceeded = isMin ? value < t.value : value >= t.value;

        if (exceeded) {
            const severity = t.severity || (DEFAULT_SEVERITY as any)[t.type] || 'info';
            const excPct = isMin
                ? (((t.value - value) / t.value) * 100).toFixed(1)
                : (((value - t.value) / t.value) * 100).toFixed(1);
            return { ...t, severity, exceedance: `${excPct}%` };
        }
    }
    return null;
}

/**
 * Busca thresholds para um parametro, resolvendo CAS automaticamente.
 * API publica principal - substitui getRegulatoryLimit().
 * @param {string} parameterId - ID do parametro
 * @param {string} [matrix='groundwater'] - Matriz ambiental
 * @param {ThresholdOptions} [options] - { landUse }
 * @returns {ThresholdEntry[]}
 */
export function getThresholds(parameterId: any, matrix = 'groundwater', options: any = {}) {
    // 1. Tenta por CAS via CONFIG.PARAMETERS
    const paramDef = CONFIG.PARAMETERS.find((p: any) => p.id === parameterId);
    if (paramDef?.casNumber) {
        const casThresholds = getAllThresholds(paramDef.casNumber, matrix, options);
        if (casThresholds.length > 0) return casThresholds;
    }
    // 2. Tenta por parameterId direto
    return getParameterThresholds(parameterId, matrix);
}

/**
 * Retorna tabela completa de standards para UI de gestao.
 * Merge built-in + custom, agrupado por CAS/parameterId.
 * @returns {Array<{ id: string, name: string, formula: string, category: string, thresholds: ThresholdEntry[] }>}
 */
export function getAllRegulatoryStandards() {
    /** @type {Array<{ id: string, name: string, formula: string, category: string, thresholds: ThresholdEntry[] }>} */
    const results = [];
    // CAS-based
    const allCas = new Set([
        ...Object.keys(REGULATORY_THRESHOLDS),
        ...Object.keys(_customThresholds).filter((k) => /^\d/.test(k)),
    ]);
    for (const cas of allCas) {
        const info = getSubstanceInfo(cas);
        const builtIn = (REGULATORY_THRESHOLDS as any)[cas] || [];
        const custom = _customThresholds[cas] || [];
        results.push({
            id: cas,
            name: info?.name || cas,
            formula: info?.formula || '',
            category: info?.category || '',
            thresholds: [...builtIn, ...custom],
        });
    }
    // Parameter-based
    const allParams = new Set([
        ...Object.keys(PARAMETER_THRESHOLDS),
        ...Object.keys(_customThresholds).filter((k) => !/^\d/.test(k)),
    ]);
    for (const pid of allParams) {
        if (allCas.has(pid)) continue;
        const builtIn = (PARAMETER_THRESHOLDS as any)[pid] || [];
        const custom = _customThresholds[pid] || [];
        results.push({
            id: pid,
            name: pid,
            formula: '',
            category: 'aggregate',
            thresholds: [...builtIn, ...custom],
        });
    }
    return results;
}

// ----------------------------------------------------------------
// VALIDACAO POR CAS NUMBER
// ----------------------------------------------------------------

/**
 * Valida observacao por CAS Number contra thresholds multi-tier (VI/VP/VR/CMA).
 * Itera thresholds do mais alto ao mais baixo, retorna o primeiro excedido.
 * @param {ValidationObservation} observation - Observacao com parameter, value, unitId
 * @param {string|null} [parameterId] - ID do parametro (fallback para lookup de CAS)
 * @param {string} [matrix='groundwater'] - Matriz ambiental
 * @returns {Record<string, any>|null} - Resultado de validacao ou null se nao aplicavel
 */
export function validateByCAS(observation: any, parameterId: any, matrix = 'groundwater') {
    const { parameter, value, unitId } = observation;

    // Resolve CAS: direto do parameter ou fallback pelo CONFIG
    let casNumber = parameter?.casNumber;
    if (!casNumber && parameterId) {
        const paramDef = CONFIG.PARAMETERS.find((p: any) => p.id === parameterId);
        casNumber = paramDef?.casNumber || undefined;
    }
    if (!casNumber) return null;

    // Resolve matriz e busca thresholds
    const resolvedMatrix = parameter?.matrix || matrix;
    const thresholds = getAllThresholds(casNumber, resolvedMatrix);
    if (thresholds.length === 0) return null;

    // Converter valor para unidade do threshold
    const targetUnit = thresholds[0].unit;
    const result = convert(value, unitId, targetUnit);
    if (!result.success) {
        return {
            type: 'error',
            severity: 'warning',
            message: 'Nao foi possivel converter unidade para validacao',
        };
    }

    const convertedValue = result.value;
    const exceeded = getExceededThreshold(convertedValue, thresholds);

    if (exceeded) {
        return {
            type: 'regulatory',
            severity: exceeded.severity,
            thresholdType: exceeded.type,
            casNumber,
            matrix: resolvedMatrix,
            message: `Excede ${exceeded.type.toUpperCase()} ${exceeded.source}: ${convertedValue!.toFixed(3)} > ${exceeded.value} ${exceeded.unit}`,
            exceedance: exceeded.exceedance,
            limit: exceeded.value,
            value: convertedValue,
            source: exceeded.source,
            meta: exceeded.meta,
        };
    }

    return null;
}

/**
 * Valida observacao por parametro (sem CAS) contra thresholds multi-tier.
 * @param {ValidationObservation} observation - Observacao
 * @param {string} parameterId - ID do parametro
 * @param {string} [matrix] - Matriz ambiental (filtra thresholds se fornecido)
 * @returns {Record<string, any>|null}
 */
export function validateByParameter(observation: any, parameterId: any, matrix: any) {
    const { value, unitId } = observation;
    const thresholds = getParameterThresholds(parameterId, matrix);
    if (thresholds.length === 0) return null;

    // Converter valor
    const targetUnit = thresholds[0].unit;
    const result = convert(value, unitId, targetUnit);
    if (!result.success) return null;

    const convertedValue = result.value;
    const exceeded = getExceededThreshold(convertedValue, thresholds);

    if (exceeded) {
        return {
            type: 'regulatory',
            severity: exceeded.severity,
            thresholdType: exceeded.type,
            parameterId,
            message: `Excede ${exceeded.type.toUpperCase()} ${exceeded.source}: ${convertedValue!.toFixed(2)} ${exceeded.meta?.bound === 'min' ? '<' : '>'} ${exceeded.value} ${exceeded.unit}`,
            exceedance: exceeded.exceedance,
            limit: exceeded.value,
            value: convertedValue,
            source: exceeded.source,
            meta: exceeded.meta,
        };
    }

    return null;
}

// ----------------------------------------------------------------
// VALIDACAO UNIFICADA
// Combina CAS + parametro numa unica chamada
// ----------------------------------------------------------------

/**
 * Tenta converter o valor da observacao para a unidade do primeiro threshold.
 * @returns {{success: true, value: number}|{success: false, error: Record<string, any>}}
 */
function _convertObservationValue(obs: any, thresholds: any[]): { success: true; value: number } | { success: false; error: any } {
    const targetUnit = thresholds[0].unit;
    const convResult = convert(obs.value, obs.unitId, targetUnit);
    if (!convResult.success) {
        return {
            success: false,
            error: {
                type: 'error',
                severity: 'warning',
                message: 'Nao foi possivel converter unidade para validacao',
            },
        };
    }
    return { success: true, value: convResult.value! };
}

/**
 * Calcula o limite superior da faixa de incerteza.
 * @returns {{upperBound: number, hasUncertainty: boolean}}
 */
function _calculateUpperBound(value: number, uncertainty: any, uncertaintyType: any) {
    let upperBound = value;
    let hasUncertainty = false;
    if (uncertainty != null && Number.isFinite(uncertainty) && uncertainty > 0) {
        hasUncertainty = true;
        const absUnc = uncertaintyType === 'relative' ? (Math.abs(value) * uncertainty) / 100 : uncertainty;
        upperBound = value + absUnc;
    }
    return { upperBound, hasUncertainty };
}

/**
 * Monta resultado de excedencia regulatoria.
 */
function _buildRegulatoryResult(value: number, exceeded: any, parameterId: any, matrix: string) {
    return {
        type: 'regulatory',
        severity: exceeded.severity,
        thresholdType: exceeded.type,
        parameterId,
        matrix,
        message: `Excede ${exceeded.type.toUpperCase()} ${exceeded.source}: ${value.toFixed(3)} ${exceeded.meta?.bound === 'min' ? '<' : '>'} ${exceeded.value} ${exceeded.unit}`,
        exceedance: exceeded.exceedance,
        limit: exceeded.value,
        value,
        source: exceeded.source,
        meta: exceeded.meta,
    };
}

/**
 * Monta resultado de excedencia pela faixa de incerteza.
 */
function _buildUncertainResult(
    value: number,
    upperBound: number,
    uncertainty: any,
    uncertaintyType: any,
    uncertainExceeded: any,
    parameterId: any,
    matrix: string,
) {
    return {
        type: 'regulatory_uncertain',
        severity: uncertainExceeded.severity + '_uncertain',
        thresholdType: uncertainExceeded.type,
        parameterId,
        matrix,
        message: `Faixa de incerteza cruza ${uncertainExceeded.type.toUpperCase()} ${uncertainExceeded.source}: ${value.toFixed(3)} \u00B1 ${uncertainty}${uncertaintyType === 'relative' ? '%' : ''} ~ ${uncertainExceeded.value} ${uncertainExceeded.unit}`,
        exceedance: uncertainExceeded.exceedance,
        limit: uncertainExceeded.value,
        value,
        upperBound,
        source: uncertainExceeded.source,
        meta: uncertainExceeded.meta,
    };
}

/**
 * Valida observacao usando pipeline multi-tier (VI/VP/VR/CMA).
 * Usa getThresholds() para resolver CAS automaticamente + fallback parameterId.
 * Retorna array de resultados (pode ter 0 ou mais).
 * @param {ValidationObservation} obs - {value, unitId, ...}
 * @param {string} parameterId - ID do parametro
 * @param {string} [matrix='groundwater'] - Matriz ambiental
 * @param {ThresholdOptions} [options] - { landUse }
 * @returns {Array<Record<string, any>>} - Array de resultados de validacao
 */
export function validateObservationFull(obs: any, parameterId: any, matrix = 'groundwater', options: any = {}) {
    /** @type {Array<Record<string, any>>} */
    const results: any = [];
    if (obs.value == null || isNaN(obs.value)) return results;

    // Resolve thresholds (CAS-first + fallback parameterId)
    const thresholds = getThresholds(parameterId, matrix, options);
    if (thresholds.length === 0) return results;

    // Converter valor para unidade do threshold
    const conv = _convertObservationValue(obs, thresholds);
    if (!conv.success) {
        results.push(conv.error);
        return results;
    }

    const convertedValue = conv.value;

    // Calcular limite superior da faixa de incerteza
    const { upperBound, hasUncertainty } = _calculateUpperBound(convertedValue, obs.uncertainty, obs.uncertaintyType);

    // Verificar excedencia pelo valor principal
    const exceeded = getExceededThreshold(convertedValue, thresholds);
    if (exceeded) {
        results.push(_buildRegulatoryResult(convertedValue, exceeded, parameterId, matrix));
    } else if (hasUncertainty) {
        // Valor principal não excede, mas faixa de incerteza pode cruzar o threshold
        const uncertainExceeded = getExceededThreshold(upperBound, thresholds);
        if (uncertainExceeded) {
            results.push(
                _buildUncertainResult(
                    convertedValue,
                    upperBound,
                    obs.uncertainty,
                    obs.uncertaintyType,
                    uncertainExceeded,
                    parameterId,
                    matrix,
                ),
            );
        }
    }

    return results;
}

// ----------------------------------------------------------------
// DETECCAO DE OUTLIERS
// ----------------------------------------------------------------

/**
 * Detecta outliers usando Z-score.
 * @param {number} value - Valor a testar
 * @param {number} mean - Media da serie
 * @param {number} stdDev - Desvio padrao
 * @param {number} threshold - Limiar de Z-score (default: 3)
 * @returns {Record<string, any>|null}
 */
export function detectOutlierZScore(value: any, mean: any, stdDev: any, threshold = 3) {
    if (stdDev === 0) return null;

    const zscore = (value - mean) / stdDev;

    if (Math.abs(zscore) > threshold) {
        return {
            type: 'outlier',
            method: 'zscore',
            severity: 'warning',
            message: `Valor ${value} e outlier (Z=${zscore.toFixed(2)})`,
            zscore,
            mean,
            stdDev,
            threshold,
        };
    }

    return null;
}

/**
 * Detecta outliers usando IQR (Interquartile Range).
 * @param {number} value - Valor a testar
 * @param {number} q1 - Primeiro quartil
 * @param {number} q3 - Terceiro quartil
 * @param {number} factor - Fator IQR (default: 1.5)
 * @returns {Record<string, any>|null}
 */
export function detectOutlierIQR(value: any, q1: any, q3: any, factor = 1.5) {
    const iqr = q3 - q1;
    const lowerBound = q1 - factor * iqr;
    const upperBound = q3 + factor * iqr;

    if (value < lowerBound || value > upperBound) {
        return {
            type: 'outlier',
            method: 'iqr',
            severity: 'warning',
            message: `Valor ${value} fora da faixa [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
            value,
            lowerBound,
            upperBound,
            iqr,
        };
    }

    return null;
}

/**
 * Calcula estatisticas para deteccao de outliers.
 * @param {number[]} values - Array de valores
 * @returns {{ mean: number, stdDev: number, q1: number, q3: number, min: number, max: number, count: number }}
 */
export function calculateStats(values: any) {
    if (!values || values.length === 0) {
        return { mean: 0, stdDev: 0, q1: 0, q3: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Media
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Desvio padrao
    const squaredDiffs = sorted.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Quartis
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);

    return {
        mean,
        stdDev,
        q1: sorted[q1Index],
        q3: sorted[q3Index],
        min: sorted[0],
        max: sorted[n - 1],
        count: n,
    };
}

// ----------------------------------------------------------------
// VALIDACAO COMPLETA
// ----------------------------------------------------------------

/**
 * Valida observacao contra todas as regras aplicaveis (regulatorio + outliers).
 * @param {ValidationObservation} observation - Observacao a validar
 * @param {{ stats?: ValidationStats, parameterId?: string, matrix?: string, landUse?: string }} options - Opcoes
 * @returns {Array<Record<string, any>>} - Array de resultados de validacao
 */
export function validateObservation(observation: any, options: any = {}) {
    /** @type {Array<Record<string, any>>} */
    const results = [];
    const matrix = options.matrix || 'groundwater';

    // 1. Validacao regulatoria multi-tier
    if (options.parameterId) {
        const regResults = validateObservationFull(observation, options.parameterId, matrix, {
            landUse: options.landUse,
        });
        results.push(...regResults);
    } else if (observation.parameter?.casNumber) {
        const casResult = validateByCAS(observation, null, matrix);
        if (casResult) results.push(casResult);
    }

    // 2. Deteccao de outliers
    if (options.stats) {
        const { mean, stdDev, q1, q3 } = options.stats;

        const zscoreResult = detectOutlierZScore(observation.value, mean, stdDev);
        if (zscoreResult) results.push(zscoreResult);

        const iqrResult = detectOutlierIQR(observation.value, q1, q3);
        if (iqrResult) results.push(iqrResult);
    }

    return results;
}

// ----------------------------------------------------------------
// BENCHMARKS
// ----------------------------------------------------------------

/**
 * Benchmarks de referencia para indicadores ESG.
 * @type {Record<string, Record<string, any>>}
 */
export const BENCHMARKS = {
    // Taxas H&S (industria geral)
    frequency_rate: {
        industry_avg: 2.5,
        top_quartile: 1.0,
        world_class: 0.5,
        unit: 'per_1M_hh',
        source: 'ILO Statistics',
    },
    severity_rate: {
        industry_avg: 50,
        top_quartile: 20,
        world_class: 10,
        unit: 'days_per_1M',
        source: 'ILO Statistics',
    },
    ltir: {
        industry_avg: 0.5,
        top_quartile: 0.2,
        world_class: 0.1,
        unit: 'per_200k_hh',
        source: 'OSHA Statistics',
    },

    // Emissoes (intensidade)
    ghg_intensity: {
        baseline_2020: 100,
        target_2030: 50,
        target_2050: 0,
        unit: 'tCO2e_unit',
        source: 'SBTi',
    },

    // Residuos
    waste_recycled_pct: {
        industry_avg: 50,
        top_quartile: 75,
        zero_waste: 95,
        unit: 'percent',
        source: 'EPA Statistics',
    },
};

/**
 * Compara valor com benchmark.
 * @param {number} value - Valor
 * @param {string} indicatorId - ID do indicador
 * @returns {Record<string, any>|null}
 */
export function compareToBenchmark(value: any, indicatorId: any) {
    const benchmark = (BENCHMARKS as any)[indicatorId];
    if (!benchmark) return null;

    /** @type {string|undefined} */
    let performance;
    /** @type {number|undefined} */
    let percentile;

    // Determinar performance (para metricas onde menor e melhor)
    if (indicatorId.includes('rate') || indicatorId.includes('ghg')) {
        if (value <= benchmark.world_class || value <= benchmark.target_2050) {
            performance = 'world_class';
            percentile = 99;
        } else if (value <= benchmark.top_quartile || value <= benchmark.target_2030) {
            performance = 'top_quartile';
            percentile = 75;
        } else if (value <= benchmark.industry_avg || value <= benchmark.baseline_2020) {
            performance = 'average';
            percentile = 50;
        } else {
            performance = 'below_average';
            percentile = 25;
        }
    } else {
        // Para metricas onde maior e melhor (ex: reciclagem)
        if (value >= (benchmark.zero_waste || benchmark.world_class)) {
            performance = 'world_class';
            percentile = 99;
        } else if (value >= benchmark.top_quartile) {
            performance = 'top_quartile';
            percentile = 75;
        } else if (value >= benchmark.industry_avg) {
            performance = 'average';
            percentile = 50;
        } else {
            performance = 'below_average';
            percentile = 25;
        }
    }

    return {
        type: 'benchmark',
        indicatorId,
        value,
        performance,
        percentile,
        benchmark,
        source: benchmark.source,
    };
}

// ----------------------------------------------------------------
// VALIDACAO CAS NUMBER FORMAT
// ----------------------------------------------------------------

/**
 * Valida formato de CAS Registry Number.
 * Formato: XXXXXXX-XX-X (digitos separados por hifen)
 * @param {string} casNumber - Numero CAS
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCASFormat(casNumber: any) {
    if (!casNumber || typeof casNumber !== 'string') {
        return { valid: false, error: 'CAS Number deve ser uma string' };
    }

    // Padrao: 2-7 digitos, hifen, 2 digitos, hifen, 1 digito
    const pattern = /^\d{2,7}-\d{2}-\d$/;
    if (!pattern.test(casNumber)) {
        return { valid: false, error: 'Formato invalido. Use: XXXXXXX-XX-X' };
    }

    // Validar digito verificador
    const parts = casNumber.split('-');
    const digits = parts.join('').split('').map(Number);
    const checkDigit = digits.pop();

    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        sum += digits[digits.length - 1 - i]! * (i + 1);
    }

    const calculatedCheck = sum % 10;
    if (calculatedCheck !== checkDigit) {
        return { valid: false, error: 'Digito verificador invalido' };
    }

    return { valid: true };
}

/**
 * Busca informacoes de substancia por CAS.
 * @param {string} casNumber - Numero CAS
 * @returns {{ name: string, formula: string, category: string }|null}
 */
export function getSubstanceInfo(casNumber: any) {
    // Dicionario basico de substancias
    /** @type {Record<string, { name: string, formula: string, category: string }>} */
    const SUBSTANCES = {
        '71-43-2': { name: 'Benzeno', formula: 'C6H6', category: 'BTEX' },
        '108-88-3': { name: 'Tolueno', formula: 'C7H8', category: 'BTEX' },
        '100-41-4': { name: 'Etilbenzeno', formula: 'C8H10', category: 'BTEX' },
        '1330-20-7': { name: 'Xilenos', formula: 'C8H10', category: 'BTEX' },
        '7440-38-2': { name: 'Arsenio', formula: 'As', category: 'Metal' },
        '7439-92-1': { name: 'Chumbo', formula: 'Pb', category: 'Metal' },
        '7440-43-9': { name: 'Cadmio', formula: 'Cd', category: 'Metal' },
        '18540-29-9': { name: 'Cromo Hexavalente', formula: 'Cr(VI)', category: 'Metal' },
        '7439-97-6': { name: 'Mercurio', formula: 'Hg', category: 'Metal' },
        '91-20-3': { name: 'Naftaleno', formula: 'C10H8', category: 'PAH' },
    };

    return (SUBSTANCES as any)[casNumber] || null;
}
