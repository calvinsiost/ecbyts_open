// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Soil Freezing-Thaw Cycles - Stefan frost depth + foundation damage risk.
 * Ciclos de congelamento-descongelamento no solo e dano a fundacoes.
 *
 * References:
 *   Stefan H.P.G. (1946) adapted by Aldrich H.P. (1956) Frost penetration below highway and
 *     airfield pavements. Highway Research Board Bulletin 135.
 *   Simonsen E. & Isacsson U. (1999) Thaw weakening of pavement structures in cold regions.
 *     Cold Regions Science and Technology 29(2):135-151. DOI:10.1016/S0165-232X(99)00020-8
 *   US Army Corps of Engineers (1984) Pavement Design for Frost Conditions. TM 5-818-2.
 *   Casagrande A. (1931) Discussion on frost heaving. Highway Research Board Proc. 11:168-172.
 */

/**
 * Calcula a profundidade de congelamento pela formula de Stefan modificada.
 * d = sqrt((2 * k * FI) / (L * rho * w))
 *   k  = condutividade termica do solo congelado (W/m·K)
 *   FI = freezing index (°C·dias)
 *   L  = calor latente de fusao da agua (J/kg), tipico 334,000 J/kg
 *   rho = densidade seca do solo (kg/m3)
 *   w  = teor de agua (fracao decimal, ex: 0.20 = 20%)
 *
 * @param {number} value - Indice de congelamento (°C·dias, valor positivo)
 * @param {number} name - Condutividade termica (W/m·K, tipico 0.5-3.0)
 * @param {number} latentHeat - Calor latente de fusao (J/kg, default 334000)
 * @param {number} density - Densidade seca do solo (kg/m3, tipico 1400-1900)
 * @param {number} waterContent - Teor de agua (fracao 0-1, ex: 0.20)
 * @returns {number} Profundidade de congelamento (m)
 */
function validateNonNegativeNumber(value: number, name: string): void {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative finite number`);
    }
}

function validatePositiveNumber(value: number, name: string): void {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive finite number`);
    }
}

function validateWaterContent(value: number): void {
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('waterContent must be between 0 and 1');
    }
}

export function calcStefanFrostDepth(freezingIndex_degC_days: number, thermalConductivity: number, latentHeat: number, density: number, waterContent: number): number {
    validateNonNegativeNumber(freezingIndex_degC_days, 'freezingIndex_degC_days');
    validatePositiveNumber(thermalConductivity, 'thermalConductivity');
    validatePositiveNumber(latentHeat, 'latentHeat');
    validatePositiveNumber(density, 'density');
    validateWaterContent(waterContent);
    if (waterContent === 0 || freezingIndex_degC_days === 0) return 0;

    // Converter FI de °C·dias para °C·segundos
    const FI_seconds = freezingIndex_degC_days * 86400;
    const numerator = 2 * thermalConductivity * FI_seconds;
    const denominator = latentHeat * density * waterContent;
    return Math.sqrt(numerator / denominator);
}

interface FreezingIndexResult {
    freezingIndex: number;
    thawingIndex: number;
    freezeDays: number;
    thawDays: number;
}

/**
 * Calcula o indice de congelamento (FI) a partir de serie de temperaturas diarias.
 * FI = soma acumulada de temperaturas negativas (°C·dias).
 * Utiliza o maximo acumulado negativo da serie.
 *
 * @param {number[]} tempSeries - Array de temperaturas medias diarias (°C)
 * @returns {{ freezingIndex: number, thawingIndex: number, freezeDays: number, thawDays: number }}
 */
export function calcFreezingIndex(tempSeries: number[]): FreezingIndexResult {
    if (!Array.isArray(tempSeries) || tempSeries.length === 0) {
        throw new TypeError('tempSeries must be a non-empty array');
    }
    let freezingIndex = 0;
    let thawingIndex = 0;
    let freezeDays = 0;
    let thawDays = 0;
    for (const t of tempSeries) {
        if (typeof t !== 'number' || !isFinite(t)) {
            throw new TypeError('Each temperature must be a finite number');
        }
        if (t < 0) {
            freezingIndex += Math.abs(t);
            freezeDays++;
        } else if (t > 0) {
            thawingIndex += t;
            thawDays++;
        }
    }
    return { freezingIndex, thawingIndex, freezeDays, thawDays };
}

/**
 * Calcula o fator de enfraquecimento por degelo (Simonsen & Isacsson 1999).
 * Modela a reducao de resistencia do pavimento apos N ciclos gelo-degelo.
 * f(n) = 1 / (1 + 0.15 * n^0.8) — formulacao simplificada calibrada (Simonsen 1999 Fig.8).
 * Valor 1 = resistencia original; valores menores = enfraquecimento maior.
 *
 * @param {number} cycles - Numero de ciclos de gelo-degelo (inteiro >= 0)
 * @returns {number} Fator de enfraquecimento (0 < f <= 1)
 */
export function calcThawWeakeningFactor(cycles: number): number {
    if (typeof cycles !== 'number' || !isFinite(cycles) || cycles < 0) {
        throw new RangeError('cycles must be a non-negative finite number');
    }
    if (cycles === 0) return 1.0;
    return 1 / (1 + 0.15 * Math.pow(cycles, 0.8));
}

/**
 * Classifica a susceptibilidade a geada do solo (USACE TM 5-818-2 / Casagrande 1931).
 * Baseado no teor de finos (fração que passa na peneira 0.075mm) e Indice de Plasticidade (IP).
 *
 * @param {number} finesContent_pct - Teor de finos (% passante #200, 0-100)
 * @param {number} PI - Indice de Plasticidade (%) - 0 se nao plastico
 * @returns {'non'|'low'|'medium'|'high'} Susceptibilidade a geada
 */
export function classifyFrostSusceptibility(finesContent_pct: number, PI: number): 'non' | 'low' | 'medium' | 'high' {
    if (
        typeof finesContent_pct !== 'number' ||
        !isFinite(finesContent_pct) ||
        finesContent_pct < 0 ||
        finesContent_pct > 100
    ) {
        throw new RangeError('finesContent_pct must be between 0 and 100');
    }
    if (typeof PI !== 'number' || !isFinite(PI) || PI < 0) {
        throw new RangeError('PI must be a non-negative finite number');
    }
    // USACE Classification (Casagrande criterion extended)
    if (finesContent_pct < 3) return 'non';
    if (finesContent_pct < 10) return 'low';
    if (finesContent_pct < 20 || PI < 12) return 'medium';
    return 'high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilFreezingThawCyclesMeta = {
    name: 'soilFreezingThawCycles',
    description: 'soilFreezingThawCycles',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
