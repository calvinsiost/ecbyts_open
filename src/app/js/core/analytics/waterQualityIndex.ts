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
// Application: EHS & Mining - Water Quality Monitoring
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Horton, R.K. (1965). An index-number system for rating water quality.
//   J. Water Pollut. Control Fed. 37(3):300-306.
// - Brown, R.M., McClelland, N.I., Deininger, R.A. & Tozer, R.G. (1970).
//   A water quality index - do we dare? Water Sewage Works 117(10):339-343.
// - CCME (2001). Canadian Water Quality Guidelines for the Protection of
//   Aquatic Life: CCME Water Quality Index 1.0. Canadian Council of
//   Ministers of the Environment.
// - Shannon, C.E. (1948). A mathematical theory of communication.
//   Bell Syst. Tech. J. 27(3):379-423.
// - CONAMA Resolução 357/2005 (padrões de qualidade da água BR)
// - Portaria MS 2914/2011 (padrões de potabilidade BR)

'use strict';

// ---------------------------------------------------------------------------
// IQA-CETESB + WQI-NSF Tier 1 API (computeSubindex, computeWQI, classifyWaterQuality, computeUsabilityScore)
// Referências: CETESB (2021) Relatório IQA; Brown et al. (1970) NSF WQI; CONAMA 357/2005
// ---------------------------------------------------------------------------

/**
 * IQA-CETESB parameter subindex curves (simplified piecewise, 9 parameters).
 * Curvas de sub-índice do IQA-CETESB por parâmetro ambiental.
 * Each entry: [value, subindex_0_100].
 * @private
 */
const _IQA_CURVES = Object.freeze({
    OD: [
        [0, 2],
        [2, 14],
        [4, 32],
        [6, 60],
        [7, 76],
        [8, 88],
        [9, 95],
        [10, 100],
        [12, 99],
        [14, 96],
    ],
    BOD: [
        [0, 100],
        [2, 90],
        [5, 70],
        [10, 50],
        [15, 35],
        [20, 22],
        [30, 8],
        [50, 2],
    ],
    turbidity: [
        [0, 100],
        [5, 97],
        [10, 92],
        [25, 77],
        [50, 60],
        [100, 40],
        [200, 24],
        [300, 12],
    ],
    pH: [
        [3, 2],
        [4, 10],
        [5, 27],
        [6, 60],
        [7, 90],
        [7.5, 95],
        [8, 88],
        [9, 60],
        [10, 30],
        [11, 10],
    ],
    totalColiforms: [
        [1, 100],
        [5, 98],
        [20, 88],
        [100, 66],
        [1000, 42],
        [5000, 22],
        [20000, 8],
        [100000, 2],
    ],
    temperature: [
        [0, 95],
        [5, 100],
        [10, 100],
        [15, 99],
        [20, 95],
        [25, 88],
        [30, 76],
        [35, 60],
        [40, 40],
    ],
    totalN: [
        [0, 100],
        [1, 97],
        [5, 85],
        [10, 72],
        [20, 58],
        [40, 40],
        [60, 28],
        [80, 16],
    ],
    totalP: [
        [0, 100],
        [0.05, 97],
        [0.1, 90],
        [0.5, 75],
        [1, 60],
        [5, 35],
        [10, 18],
    ],
    residues: [
        [0, 100],
        [50, 97],
        [100, 90],
        [250, 80],
        [500, 66],
        [750, 54],
        [1000, 42],
        [2000, 28],
        [3000, 18],
    ],
});

/** IQA-CETESB canonical weights (sum = 1.00). */
const _IQA_WEIGHTS = Object.freeze({
    OD: 0.17,
    BOD: 0.1,
    turbidity: 0.08,
    pH: 0.12,
    totalColiforms: 0.15,
    temperature: 0.1,
    totalN: 0.1,
    totalP: 0.1,
    residues: 0.08,
});

/**
 * @private Piecewise linear interpolation.
 * @param {ReadonlyArray<ReadonlyArray<number>>} table
 * @param {number} x
 * @returns {number}
 */
function _pwl(table: ReadonlyArray<ReadonlyArray<number>>, x: number): number {
    if (x <= table[0]![0]!) return table[0]![1]!;
    if (x >= table[table.length - 1]![0]!) return table[table.length - 1]![1]!;
    for (let i = 0; i < table.length - 1; i++) {
        const [x0, y0] = table[i]!,
            [x1, y1] = table[i + 1]!;
        if (x >= x0! && x <= x1!) return y0! + ((x - x0!) / (x1! - x0!)) * (y1! - y0!);
    }
    return table[table.length - 1]![1]!;
}

/**
 * Computes a normalized subindex (0–100) for a supported IQA-CETESB parameter.
 * Calcula o sub-índice normalizado (0-100) para um parâmetro IQA-CETESB.
 *
 * Supported parameters: 'OD' (mg/L), 'BOD' (mg/L), 'turbidity' (NTU),
 * 'pH', 'totalColiforms' (MPN/100mL), 'temperature' (°C), 'totalN' (mg/L),
 * 'totalP' (mg/L), 'residues' (mg/L).
 *
 * @param {string} parameter - Parameter identifier (see supported list above).
 * @param {number} value - Measured value (units as specified). / Valor medido.
 * @param {string} unit - Unit label for documentation (not used in computation). / Unidade (documentação).
 * @returns {{ qi: number }}
 * @throws {TypeError} If parameter is not a string or value is not finite.
 * @throws {RangeError} If value < 0 or parameter is unsupported.
 * @reference CETESB (2021) Relatório de Qualidade das Águas Interiores SP; Brown et al. (1970)
 */
export function computeSubindex(parameter: string, value: number, unit: string): { qi: number } {
    if (typeof parameter !== 'string' || !parameter) throw new TypeError('parameter must be a non-empty string');
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('value must be a finite number');
    if (value < 0) throw new RangeError('value must be >= 0');
    const curve = (_IQA_CURVES as Record<string, number[][]>)[parameter];
    if (!curve)
        throw new RangeError(`Unsupported parameter '${parameter}'. Supported: ${Object.keys(_IQA_CURVES).join(', ')}`);
    void unit; // Unit provided for documentation only
    const qi = Math.max(0, Math.min(100, _pwl(curve, value)));
    return { qi };
}

/**
 * Computes the IQA-CETESB / WQI-NSF weighted product index.
 * Calcula o IQA ponderado: WQI = ∏(qi_i ^ wi).
 *
 * Pesos devem somar 1.0 ± 0.01.
 *
 * @param {number[]} subindices - Array of qi values (0–100). / Vetor de sub-índices.
 * @param {number[]} weights - Array of weights summing to 1.0. / Pesos normalizados.
 * @returns {{ wqi: number }}
 * @throws {TypeError} If arrays contain non-finite numbers.
 * @throws {RangeError} If arrays have different lengths, are empty, or weights don't sum to 1 ± 0.01.
 * @reference CETESB (2021) IQA; Brown et al. (1970) NSF WQI multiplicative formula
 */
export function computeWQI(subindices: number[], weights: number[]): { wqi: number } {
    if (!Array.isArray(subindices) || !Array.isArray(weights))
        throw new TypeError('subindices and weights must be arrays');
    if (subindices.length === 0) throw new RangeError('subindices must not be empty');
    if (subindices.length !== weights.length) throw new RangeError('subindices and weights must have the same length');
    const wSum = weights.reduce((s, w) => s + w, 0);
    if (Math.abs(wSum - 1.0) > 0.01) throw new RangeError(`weights must sum to 1.0 ± 0.01, got ${wSum.toFixed(4)}`);
    let logSum = 0;
    for (let i = 0; i < subindices.length; i++) {
        if (typeof subindices[i] !== 'number' || !Number.isFinite(subindices[i]))
            throw new TypeError(`subindices[${i}] must be finite`);
        if (typeof weights[i] !== 'number' || !Number.isFinite(weights[i]))
            throw new TypeError(`weights[${i}] must be finite`);
        if (subindices[i]! < 0 || subindices[i]! > 100) throw new RangeError(`subindices[${i}] must be in [0,100]`);
        if (weights[i]! < 0) throw new RangeError(`weights[${i}] must be >= 0`);
        const qi = subindices[i]! > 0 ? subindices[i]! : 1e-9;
        logSum += weights[i]! * Math.log(qi);
    }
    const wqi = Math.max(0, Math.min(100, Math.exp(logSum)));
    return { wqi };
}

/**
 * Classifies water quality according to IQA-CETESB thresholds.
 * Classifica a qualidade da água segundo faixas IQA-CETESB.
 *
 * Faixas IQA-CETESB (2021):
 *   ≥79 excelente (cyan)  | ≥52 bom (green)   | ≥37 aceitável (yellow)
 *   ≥20 ruim (orange)     | <20  péssimo (red)
 *
 * @param {number} wqi - WQI value in [0,100]. / Valor do IQA.
 * @returns {{ category: 'excellent'|'good'|'acceptable'|'bad'|'very_bad', color: string, description: string }}
 * @throws {TypeError} If wqi is not a finite number.
 * @throws {RangeError} If wqi is outside [0,100].
 * @reference CETESB (2021) Relatório IQA; CONAMA 357/2005
 */
export function classifyWaterQuality(wqi: number): { category: 'excellent'|'good'|'acceptable'|'bad'|'very_bad', color: string, description: string } {
    if (typeof wqi !== 'number' || !Number.isFinite(wqi)) throw new TypeError('wqi must be a finite number');
    if (wqi < 0 || wqi > 100) throw new RangeError('wqi must be in [0,100]');
    if (wqi >= 79)
        return {
            category: 'excellent',
            color: '#00bcd4',
            description: 'Excelente — todos os usos permitidos / All uses suitable',
        };
    if (wqi >= 52)
        return {
            category: 'good',
            color: '#4caf50',
            description: 'Bom — captação com tratamento convencional / Good — conventional treatment required',
        };
    if (wqi >= 37)
        return {
            category: 'acceptable',
            color: '#ffeb3b',
            description: 'Aceitável — tratamento avançado necessário / Acceptable — advanced treatment required',
        };
    if (wqi >= 20)
        return {
            category: 'bad',
            color: '#ff9800',
            description: 'Ruim — elevado grau de poluição / Poor — high pollution level',
        };
    return {
        category: 'very_bad',
        color: '#f44336',
        description: 'Péssimo — comprometimento severo / Very bad — severely compromised',
    };
}

/**
 * Computes usability score and suitability for a given intended water use.
 * Calcula aptidão da água para um uso específico conforme IQA-CETESB.
 *
 * Minimum WQI thresholds per use:
 *   drinking    : >= 79 (excelente)
 *   irrigation  : >= 52 (bom)
 *   recreation  : >= 37 (aceitável)
 *   industrial  : >= 20 (não péssimo)
 *
 * @param {number} wqi - WQI value in [0,100]. / Valor do IQA.
 * @param {'drinking'|'irrigation'|'recreation'|'industrial'} intendedUse - Target use. / Uso pretendido.
 * @returns {{ score: number, suitable: boolean }}
 * @throws {TypeError} If wqi is not finite or intendedUse is not a string.
 * @throws {RangeError} If wqi is outside [0,100] or intendedUse is unsupported.
 * @reference CETESB (2021) IQA; CONAMA 357/2005 classificação de usos
 */
export function computeUsabilityScore(wqi: number, intendedUse: 'drinking'|'irrigation'|'recreation'|'industrial'): { score: number, suitable: boolean } {
    if (typeof wqi !== 'number' || !Number.isFinite(wqi)) throw new TypeError('wqi must be a finite number');
    if (wqi < 0 || wqi > 100) throw new RangeError('wqi must be in [0,100]');
    const thresholds = { drinking: 79, irrigation: 52, recreation: 37, industrial: 20 };
    if (!(intendedUse in thresholds))
        throw new RangeError(`intendedUse must be one of: ${Object.keys(thresholds).join(', ')}`);
    const threshold = thresholds[intendedUse];
    const score = Math.max(0, Math.min(100, (wqi / threshold) * 100));
    return { score, suitable: wqi >= threshold };
}

// ---------------------------------------------------------------------------
// Padrões de referência exportados
// Valores de referência para uso nos métodos de cálculo
// ---------------------------------------------------------------------------

/**
 * Padrões de qualidade de água para uso com computeHortonWQI e computeNSFWQI.
 * Baseado em CONAMA 357/2005 Classe 2 (rios doce) e WHO Guidelines 2011.
 * @type {Readonly<Object>}
 */
export const WATER_QUALITY_STANDARDS = Object.freeze({
    CONAMA_357_2005_CLASS_2: Object.freeze({
        pH: Object.freeze({ min: 6.0, max: 9.0 }),
        OD_mgL: Object.freeze({ min: 5.0 }),
        turbidity_NTU: Object.freeze({ max: 100 }),
        BOD5_mgL: Object.freeze({ max: 5 }),
        nitrate_mgL: Object.freeze({ max: 10 }),
        totalPhosphorus_mgL: Object.freeze({ max: 0.1 }),
        fecalColiforms_per100mL: Object.freeze({ max: 1000 }),
    }),
    WHO_DRINKING_2011: Object.freeze({
        pH: Object.freeze({ min: 6.5, max: 8.5 }),
        turbidity_NTU: Object.freeze({ max: 4 }),
        nitrate_mgL: Object.freeze({ max: 50 }),
        totalPhosphorus_mgL: Object.freeze({ max: 0.5 }),
    }),
});

// ---------------------------------------------------------------------------
// Funções auxiliares internas
// ---------------------------------------------------------------------------

/**
 * Clamp numérico entre min e max.
 * @param {number} table
 * @param {number} x
 * @param {number} hi
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

/**
 * Interpolação linear por partes entre pares (x, y) ordenados por x.
 * Extrapolação: usa o valor extremo do segmento mais próximo.
 * @param {ReadonlyArray<ReadonlyArray<number>>} table - Pares [x, y] ordenados por x crescente
 * @param {number} x - Valor de entrada
 * @returns {number} Valor interpolado
 */
function piecewiseLinear(table: ReadonlyArray<ReadonlyArray<number>>, x: number): number {
    if (x <= table[0]![0]!) return table[0]![1]!;
    if (x >= table[table.length - 1]![0]!) return table[table.length - 1]![1]!;
    for (let i = 0; i < table.length - 1; i++) {
        const [x0, y0] = table[i]!;
        const [x1, y1] = table[i + 1]!;
        if (x >= x0! && x <= x1!) {
            const t = (x - x0!) / (x1! - x0!);
            return y0! + t * (y1! - y0!);
        }
    }
    return table[table.length - 1]![1]!;
}

/**
 * Determina categoria NSF/Horton WQI a partir do valor (0-100).
 * Faixas Horton 1965: ≥90 excellent, ≥70 good, ≥50 fair, ≥25 poor, <25 very-poor.
 * @param {number} wqi
 * @returns {'excellent'|'good'|'fair'|'poor'|'very-poor'}
 */
function hortonCategory(wqi: number): 'excellent'|'good'|'fair'|'poor'|'very-poor' {
    if (wqi >= 90) return 'excellent';
    if (wqi >= 70) return 'good';
    if (wqi >= 50) return 'fair';
    if (wqi >= 25) return 'poor';
    return 'very-poor';
}

/**
 * Determina categoria CCME WQI.
 * Faixas CCME 2001: 95-100 excellent, 80-94 good, 65-79 fair, 45-64 marginal, 0-44 poor.
 * @param {number} ccme
 * @returns {'excellent'|'good'|'fair'|'marginal'|'poor'}
 */
function ccmeCategory(ccme: number): 'excellent'|'good'|'fair'|'marginal'|'poor' {
    if (ccme >= 95) return 'excellent';
    if (ccme >= 80) return 'good';
    if (ccme >= 65) return 'fair';
    if (ccme >= 45) return 'marginal';
    return 'poor';
}

// ---------------------------------------------------------------------------
// Curvas NSF WQI (Brown 1970) - tabelas de interpolação por parâmetro
// Baseadas nas curvas gráficas originais do National Sanitation Foundation.
// Cada tabela: array de [x_value, qi_subindex]
// ---------------------------------------------------------------------------

/** Tabelas de sub-índice NSF por parâmetro (Brown 1970). */
const NSF_CURVES = Object.freeze({
    /** OD como % de saturação */
    OD_pct_sat: [
        [0, 0],
        [10, 8],
        [20, 18],
        [30, 28],
        [40, 38],
        [50, 60],
        [70, 80],
        [85, 90],
        [100, 100],
        [110, 98],
        [120, 95],
        [130, 93],
        [140, 92],
    ],
    /** Coliformes fecais (UFC/100mL) */
    fecalColiforms_per100mL: [
        [0, 100],
        [1, 99],
        [5, 97],
        [10, 95],
        [30, 87],
        [100, 70],
        [300, 52],
        [1000, 40],
        [3000, 30],
        [10000, 20],
        [30000, 10],
        [100000, 2],
    ],
    /** pH */
    pH: [
        [2, 0],
        [4, 8],
        [5, 25],
        [6, 55],
        [6.5, 78],
        [7.0, 93],
        [7.5, 95],
        [8.0, 90],
        [8.5, 76],
        [9, 60],
        [10, 35],
        [11, 15],
        [12, 0],
    ],
    /** DBO5 (mg/L) */
    BOD5_mgL: [
        [0, 99],
        [1, 90],
        [2, 80],
        [5, 60],
        [7, 47],
        [10, 40],
        [15, 25],
        [30, 8],
        [50, 2],
    ],
    /** Nitratos (mg/L como N) */
    nitrate_mgL: [
        [0, 100],
        [1, 98],
        [5, 80],
        [10, 60],
        [20, 50],
        [40, 30],
        [60, 20],
        [80, 10],
        [100, 2],
    ],
    /** Fosfato total (mg/L) */
    totalPhosphorus_mgL: [
        [0, 100],
        [1, 97],
        [5, 85],
        [10, 70],
        [15, 62],
        [20, 55],
        [50, 30],
        [100, 10],
    ],
    /** Temperatura — desvio do valor natural (ΔT °C) */
    temperature_delta_C: [
        [0, 100],
        [1, 97],
        [3, 90],
        [5, 80],
        [7, 72],
        [10, 68],
        [12, 62],
        [15, 55],
        [20, 43],
        [25, 35],
        [30, 12],
    ],
    /** Turbidez (NTU) */
    turbidity_NTU: [
        [0, 100],
        [5, 95],
        [10, 90],
        [25, 70],
        [50, 55],
        [100, 40],
        [200, 28],
        [300, 20],
        [500, 12],
        [750, 5],
    ],
    /** TDS — Sólidos Totais Dissolvidos (mg/L) */
    TDS_mgL: [
        [0, 100],
        [50, 95],
        [100, 90],
        [250, 80],
        [500, 70],
        [750, 60],
        [1000, 50],
        [2000, 32],
        [3000, 22],
        [5000, 10],
    ],
});

/** Pesos NSF padronizados (Brown 1970). */
const NSF_WEIGHTS = Object.freeze({
    OD_pct_sat: 0.17,
    fecalColiforms_per100mL: 0.15,
    pH: 0.12,
    BOD5_mgL: 0.1,
    nitrate_mgL: 0.1,
    totalPhosphorus_mgL: 0.1,
    temperature_delta_C: 0.1,
    turbidity_NTU: 0.08,
    TDS_mgL: 0.08,
});

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Normaliza um valor de parâmetro para sub-índice (0-100) conforme tipo de limite.
 *
 * Três modos de cálculo:
 *   - 'max': parâmetro tem limite superior (turbidez, coliformes) - quanto menor, melhor
 *   - 'min': parâmetro tem limite inferior (OD) - quanto maior, melhor
 *   - 'range': parâmetro tem faixa ótima (pH) - distância ao ponto médio determina qualidade
 *
 * @param {number} value - Valor medido
 * @param {'max'|'min'|'range'} paramType - Tipo de limite do parâmetro
 * @param {number|{min:number,max:number}} standard
 *   - Para 'max': valor máximo aceitável
 *   - Para 'min': valor mínimo ideal (saturação)
 *   - Para 'range': objeto {min, max} definindo a faixa ótima
 * @returns {{ subIndex: number, normalized: number, exceedance: boolean }}
 */
export function computeSubIndex(value: number, paramType: 'max'|'min'|'range', standard: number|{min:number,max:number}): { subIndex: number, normalized: number, exceedance: boolean } {
    let subIndex: number;
    let exceedance: boolean;

    if (paramType === 'max') {
        // Maior é pior - sub-índice cai linearmente
        const limit = (standard as number);
        exceedance = value > limit;
        subIndex = clamp(100 * (1 - value / limit), 0, 100);
    } else if (paramType === 'min') {
        // Menor é pior - sub-índice cresce linearmente (ex: OD)
        const saturation = (standard as number);
        exceedance = value < saturation;
        subIndex = clamp(100 * (value / saturation), 0, 100);
    } else if (paramType === 'range') {
        // Faixa ótima - desvio do ponto médio penaliza o sub-índice
        const { min, max } = (standard as {min:number,max:number});
        const midpoint = (min + max) / 2;
        const halfRange = (max - min) / 2;
        exceedance = value < min || value > max;
        subIndex = clamp(100 - (100 * Math.abs(value - midpoint)) / halfRange, 0, 100);
    } else {
        throw new Error(`[waterQualityIndex] paramType desconhecido: ${paramType}`);
    }

    return Object.freeze({
        subIndex,
        normalized: subIndex / 100,
        exceedance,
    });
}

/**
 * Calcula o Índice de Qualidade de Água de Horton (1965).
 *
 * Fórmula: WQI = Σ(wi × qi) / Σ(wi)
 *
 * Referência: Horton, R.K. (1965). An index-number system for rating water quality.
 * J. Water Pollut. Control Fed. 37(3):300-306.
 *
 * @param {Array<{param: string, value: number, paramType?: 'max'|'min'|'range'}>} measurements
 *   Medições - cada entrada requer `param` e `value`. `paramType` opcional (default: 'max').
 * @param {Object.<string, number>} weights - Peso de cada parâmetro {param: weight}
 * @param {Object.<string, number|{min:number,max:number}>} standards - Padrão de cada parâmetro
 * @returns {{ wqi: number, category: string, subIndices: Object, method: string }}
 */
export function computeHortonWQI(measurements: Array<{param: string, value: number, paramType?: 'max'|'min'|'range'}>, weights: Record<string, number>, standards: Record<string, number|{min:number,max:number}>): { wqi: number, category: string, subIndices: Object, method: string } {
    if (!measurements || measurements.length === 0) {
        return Object.freeze({
            wqi: 100,
            category: 'excellent',
            subIndices: Object.freeze({}),
            method: 'horton',
        });
    }

        const subIndices: Record<string, number>= {};
    let weightedSum = 0;
    let weightSum = 0;

    for (const { param, value, paramType = 'max' } of measurements) {
        const std = standards[param];
        if (std === undefined || std === null) continue;

        const w = weights[param] ?? 1;
        const { subIndex } = computeSubIndex(value, paramType, std);
        subIndices[param] = subIndex;
        weightedSum += w * subIndex;
        weightSum += w;
    }

    const wqi = weightSum > 0 ? clamp(weightedSum / weightSum, 0, 100) : 100;

    return Object.freeze({
        wqi,
        category: hortonCategory(wqi),
        subIndices: Object.freeze(subIndices),
        method: 'horton',
    });
}

/**
 * Calcula o NSF Water Quality Index (Brown et al., 1970).
 *
 * Utiliza 9 parâmetros fixos com pesos estabelecidos e curvas de sub-índice
 * definidas graficamente no estudo original (interpolação linear por partes).
 *
 * Fórmula multiplicativa: WQI_NSF = Π(qi^wi)
 *
 * Referência: Brown, R.M. et al. (1970). A water quality index - do we dare?
 * Water Sewage Works 117(10):339-343.
 *
 * @param {Object.<string, number>} measurements
 *   Objeto com valores medidos. Chaves devem corresponder aos parâmetros NSF:
 *   OD_pct_sat, fecalColiforms_per100mL, pH, BOD5_mgL, nitrate_mgL,
 *   totalPhosphorus_mgL, temperature_delta_C, turbidity_NTU, TDS_mgL
 * @returns {{ wqiNSF: number, category: string, subIndices: Object, method: string, paramCount: number }}
 */
export function computeNSFWQI(measurements: Record<string, number>): { wqiNSF: number, category: string, subIndices: Object, method: string, paramCount: number } {
        const subIndices: Record<string, number>= {};
    let logSum = 0;
    let paramCount = 0;

    for (const [param, curve] of Object.entries(NSF_CURVES)) {
        const value = measurements[param];
        if (value === undefined || value === null) continue;

        const qi = clamp(piecewiseLinear(curve, value), 0, 100);
        const wi = (NSF_WEIGHTS as Record<string, number>)[param] ?? 0;
        subIndices[param] = qi;

        // Fórmula multiplicativa: Π(qi^wi) = exp(Σ wi × ln(qi))
        // qi=0 resulta em WQI=0 por definição (produto zera)
        logSum += wi * Math.log(qi > 0 ? qi : 1e-9);
        paramCount++;
    }

    const wqiNSF = paramCount > 0 ? clamp(Math.exp(logSum), 0, 100) : 100;

    return Object.freeze({
        wqiNSF,
        category: hortonCategory(wqiNSF),
        subIndices: Object.freeze(subIndices),
        method: 'nsf',
        paramCount,
    });
}

/**
 * Calcula o CCME Water Quality Index (Canadian Council of Ministers, 2001).
 *
 * Baseado em três fatores F1, F2, F3 combinados geometricamente:
 *   F1 (escopo) = % de variáveis que falham ao menos 1 objetivo
 *   F2 (frequência) = % de testes que não atingem objetivos
 *   F3 (amplitude) = magnitude normalizada de excursões
 *
 * CCME_WQI = 100 - √(F1² + F2² + F3²) / 1.732
 *
 * Referência: CCME (2001). Canadian Water Quality Guidelines for the Protection
 * of Aquatic Life: CCME Water Quality Index 1.0.
 *
 * @param {Array<{param: string, values: number[]}>} measurements
 *   Uma série de medições por parâmetro (múltiplos testes no tempo/espaço).
 * @param {Object.<string, {max?: number, min?: number, type?: 'max'|'min'|'range'}>} objectives
 *   Objetivos de qualidade de água para cada parâmetro.
 *   type='max' → valor não deve exceder max
 *   type='min' → valor não deve ser menor que min
 *   type='range' → valor deve estar entre min e max
 * @returns {{ ccmeWQI: number, category: string, F1: number, F2: number, F3: number,
 *             nVariablesFailing: number, nTestsFailing: number, method: string }}
 */
export function computeCCMEWQI(measurements: Array<{param: string, values: number[]}>, objectives: Record<string, {max?: number, min?: number, type?: 'max'|'min'|'range'}>): { ccmeWQI: number, category: string, F1: number, F2: number, F3: number, nVariablesFailing: number, nTestsFailing: number, method: string } {
    if (!measurements || measurements.length === 0) {
        return Object.freeze({
            ccmeWQI: 100,
            category: 'excellent',
            F1: 0,
            F2: 0,
            F3: 0,
            nVariablesFailing: 0,
            nTestsFailing: 0,
            method: 'ccme',
        });
    }

    const nVariablesTotal = measurements.length;
    let nVariablesFailing = 0;
    let nTestsTotal = 0;
    let nTestsFailing = 0;
    let sumExcursions = 0;

    for (const { param, values } of measurements) {
        const obj = objectives[param];
        if (!obj || !values || values.length === 0) continue;

        const objType = obj.type ?? (obj.max !== undefined ? 'max' : 'min');
        let paramFailed = false;

        for (const v of values) {
            nTestsTotal++;
            let failed = false;
            let excursion = 0;

            if (objType === 'max' && obj.max !== undefined) {
                if (v > obj.max) {
                    failed = true;
                    // excursion: quanto excede o objetivo (CCME eq. 4)
                    excursion = v / obj.max - 1;
                }
            } else if (objType === 'min' && obj.min !== undefined) {
                if (v < obj.min) {
                    failed = true;
                    // excursion: quanto fica abaixo do mínimo (CCME eq. 5)
                    excursion = obj.min / v - 1;
                }
            } else if (objType === 'range' && obj.max !== undefined && obj.min !== undefined) {
                if (v > obj.max) {
                    failed = true;
                    excursion = v / obj.max - 1;
                } else if (v < obj.min) {
                    failed = true;
                    excursion = obj.min / v - 1;
                }
            }

            if (failed) {
                nTestsFailing++;
                sumExcursions += excursion;
                paramFailed = true;
            }
        }

        if (paramFailed) nVariablesFailing++;
    }

    // F1: escopo - % de variáveis com ao menos 1 falha
    const F1 = (nVariablesFailing / nVariablesTotal) * 100;

    // F2: frequência - % de testes que falham
    const F2 = nTestsTotal > 0 ? (nTestsFailing / nTestsTotal) * 100 : 0;

    // F3: amplitude - excursão normalizada (CCME eq. 6-8)
    // nse = soma das excursões / nTestsFailing (mean excursion per failing test)
    // F3 = nse / (0.01 × nse + 0.01) × ... ver CCME eq. 8
    // Fórmula oficial: F3 = (nse / (0.01 × nse + 1)) onde nse = sumExcursions/nTestsFailing
    // O fator 100 na equação original normaliza 0-100 mas está implicitamente em F1,F2
    let F3 = 0;
    if (nTestsFailing > 0) {
        const nse = sumExcursions / nTestsFailing;
        F3 = (nse / (0.01 * nse + 1)) * 100;
    }

    // CCME WQI = 100 - √(F1² + F2² + F3²) / 1.732
    const ccmeWQI = clamp(100 - Math.sqrt(F1 * F1 + F2 * F2 + F3 * F3) / 1.732, 0, 100);

    return Object.freeze({
        ccmeWQI,
        category: ccmeCategory(ccmeWQI),
        F1,
        F2,
        F3,
        nVariablesFailing,
        nTestsFailing,
        method: 'ccme',
    });
}

/**
 * Calcula pesos por entropia de Shannon (1948) para múltiplas estações/amostras.
 *
 * Parâmetros com maior variabilidade relativa entre estações recebem maior peso,
 * pois carregam mais informação discriminante sobre a qualidade da água.
 *
 * Fórmulas:
 *   p_ij = x_ij / Σ_i(x_ij)              (proporção da estação i no parâmetro j)
 *   E_j  = -1/ln(n) × Σ_i(p_ij × ln(p_ij))   (entropia de Shannon normalizada)
 *   d_j  = 1 - E_j                         (grau de divergência)
 *   w_j  = d_j / Σ_j(d_j)                 (peso normalizado)
 *
 * Referência: Shannon, C.E. (1948). A mathematical theory of communication.
 * Bell Syst. Tech. J. 27(3):379-423.
 *
 * @param {Array<{station: string, values: Object.<string, number>}>} measurements
 *   Array de estações, cada uma com valores por parâmetro.
 * @returns {{ weights: Object.<string,number>, entropy: Object.<string,number>, divergence: Object.<string,number> }}
 */
export function computeEntropyWeights(measurements: Array<{station: string, values: Record<string, number>}>): { weights: Record<string,number>, entropy: Record<string,number>, divergence: Record<string,number> } {
    if (!measurements || measurements.length === 0) {
        return Object.freeze({
            weights: Object.freeze({}),
            entropy: Object.freeze({}),
            divergence: Object.freeze({}),
        });
    }

    // Coleta todos os parâmetros presentes nas medições
    const paramSet = new Set<string>();
    for (const { values } of measurements) {
        for (const p of Object.keys(values)) paramSet.add(p);
    }
    const params = Array.from(paramSet);
    const n = measurements.length;

        const entropy: Record<string, number>= {};
        const divergence: Record<string, number>= {};
        const weights: Record<string, number>= {};

    for (const param of params) {
        // Coleta valores de todas as estações para este parâmetro
        const vals = measurements.map(({ values }) => values[param] ?? 0);
        const total = vals.reduce((s, v) => s + v, 0);

        if (total === 0) {
            // Todos zeros: entropia máxima, peso zero
            entropy[param] = 1;
            divergence[param] = 0;
            continue;
        }

        // p_ij = x_ij / Σ_i(x_ij)
        const props = vals.map((v) => v / total);

        // E_j = -1/ln(n) × Σ(p_ij × ln(p_ij))
        // Se p_ij = 0, contribuição é 0 (limite: lim x→0 x×ln(x) = 0)
        let shannonSum = 0;
        for (const p of props) {
            if (p > 0) shannonSum += p * Math.log(p);
        }

        // ln(n) normaliza entre 0 e 1; se n=1, entropia=1 (sem variação possível)
        const Ej = n > 1 ? -shannonSum / Math.log(n) : 1;
        entropy[param] = clamp(Ej, 0, 1);
        divergence[param] = 1 - entropy[param];
    }

    // w_j = d_j / Σ(d_j)
    const totalDivergence = Object.values(divergence).reduce((s, d) => s + d, 0);

    for (const param of params) {
        weights[param] = totalDivergence > 0 ? (divergence[param] ?? 0) / totalDivergence : 1 / params.length;
    }

    return Object.freeze({
        weights: Object.freeze(weights),
        entropy: Object.freeze(entropy),
        divergence: Object.freeze(divergence),
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const waterQualityIndexMeta = {
    name: 'waterQualityIndex',
    description: 'Water Quality Monitoring',
    category: 'analytics',
    familyTags: ['water'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — WQI (NSF + CETESB) + uso pretendido
    // Reference: CETESB Qualidade das Águas Interiores + NSF WQI
    inputSchema: {
        type: 'object',
        properties: {
            mode: { type: 'string', enum: ['subindex', 'wqi', 'classify', 'usability'], default: 'wqi' },
            subindices: { type: 'array', items: { type: 'number', minimum: 0, maximum: 100 } },
            weights: { type: 'array', items: { type: 'number', minimum: 0, maximum: 1 } },
            wqi: { type: 'number', minimum: 0, maximum: 100, description: 'Para classify/usability' },
            intendedUse: { type: 'string', enum: ['drinking', 'irrigation', 'recreation', 'industrial'] },
        },
        required: ['mode'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            wqi: { type: 'number', minimum: 0, maximum: 100 },
            category: { type: 'string', enum: ['excellent', 'good', 'acceptable', 'bad', 'very_bad'] },
            suitable: { type: 'boolean' },
            score: { type: 'number' },
        },
    },
};
