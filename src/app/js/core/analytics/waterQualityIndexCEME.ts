// @ts-check
// Generated from src/app/js/core/analytics/waterQualityIndexCEME.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Water Quality Index - NSF/CETESB/ANA (IQA)
 *
 * Implements the IQA as adapted by CETESB and ANA from the original NSF WQI:
 * - NSF WQI (1970): Brown, R.M. et al. "A water quality index - do we dare?" Water &
 *   Sewage Works 117(10):339–343. (original development, no DOI - pre-digital)
 * - CETESB (2021): Apêndice D - Índice de Qualidade das Águas. In: Qualidade das Águas
 *   Superficiais no Estado de São Paulo. CETESB, São Paulo.
 * - ANA (2019): Atlas Esgotos - Índice de Qualidade de Água. Agência Nacional de Águas.
 * - CONAMA Resolution 357/2005: Classificação dos corpos de água e diretrizes ambientais.
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module waterQualityIndexCEME
 */
/**
 * NSF WQI parameter weights as adopted by CETESB.
 * Pesos dos parâmetros do IQA conforme CETESB.
 *
 * Reference: CETESB (2021) Apêndice D, Tabela D.1
 * Sum of weights = 1.00
 */
const PARAMETER_WEIGHTS = {
    do: 0.17, // Dissolved Oxygen (OD) — oxigênio dissolvido
    fecalColiforms: 0.15, // Fecal coliforms (NMP/100mL) — coliformes fecais
    ph: 0.12, // pH
    bod: 0.1, // BOD5 (mg/L) — DBO5
    nitrate: 0.1, // Nitrate (mg/L NO3-) — nitrato
    phosphate: 0.1, // Total phosphate (mg/L PO4) — fosfato total
    temperature: 0.1, // Temperature deviation (°C) — desvio de temperatura
    turbidity: 0.08, // Turbidity (NTU) — turbidez
    totalSolids: 0.08, // Total dissolved solids (mg/L) — sólidos totais dissolvidos
};
/**
 * Compute individual quality sub-index (qi) for each parameter.
 * Computa o sub-índice de qualidade individual (qi) para cada parâmetro.
 *
 * The CETESB curves are approximated by piecewise linear functions.
 * Curvas CETESB aproximadas por funções lineares por partes.
 *
 * Reference: CETESB (2021) Figuras D.1–D.9
 *
 * @param {string} parameter - Parameter name (must match PARAMETER_WEIGHTS keys)
 * @param {number} value     - Measured value in parameter-specific units
 * @returns {number} quality sub-index qi in [0, 100]
 */
function computeQi( parameter: any, value: any) {
    // Clamp helper for linear interpolation between breakpoints
    // Função auxiliar de interpolação linear com clamp
    /**
     * @param {number} measurements
     * @param {number} x0
     * @param {number} x1
     * @param {number} y0
     * @param {number} y1
     * @returns {number}
     */
    const lerp = (x: any, x0: any, x1: any, y0: any, y1: any) => {
        if (x <= x0) return y0;
        if (x >= x1) return y1;
        return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    };
    switch (parameter) {
        case 'do': {
            // DO saturation % - CETESB Figure D.1
            // Saturação de OD (%)
            const doSat = Math.min(200, Math.max(0, value)); // % saturation
            if (doSat >= 90) return lerp(doSat, 90, 140, 97, 100);
            if (doSat >= 70) return lerp(doSat, 70, 90, 80, 97);
            if (doSat >= 50) return lerp(doSat, 50, 70, 50, 80);
            if (doSat >= 20) return lerp(doSat, 20, 50, 10, 50);
            return lerp(doSat, 0, 20, 2, 10);
        }
        case 'fecalColiforms': {
            // NMP/100mL - CETESB Figure D.2 (log scale approximated)
            // Coliformes fecais - escala logarítmica
            const v = Math.max(1, value);
            const logV = Math.log10(v);
            if (logV <= 1) return lerp(logV, 0, 1, 100, 90);
            if (logV <= 2) return lerp(logV, 1, 2, 90, 72);
            if (logV <= 3) return lerp(logV, 2, 3, 72, 50);
            if (logV <= 4) return lerp(logV, 3, 4, 50, 22);
            if (logV <= 5) return lerp(logV, 4, 5, 22, 4);
            return 2;
        }
        case 'ph': {
            // pH 0–14 - CETESB Figure D.3 (optimal near 7.5)
            // pH - ideal próximo de 7,5
            const ph = Math.min(14, Math.max(0, value));
            if (ph >= 6 && ph <= 8) return lerp(Math.abs(ph - 7.5), 0, 1.5, 100, 80);
            if (ph > 8 && ph <= 9) return lerp(ph, 8, 9, 80, 40);
            if (ph < 6 && ph >= 5) return lerp(ph, 5, 6, 30, 80);
            return 5;
        }
        case 'bod': {
            // BOD5 mg/L - CETESB Figure D.4
            // DBO5 em mg/L
            const b = Math.max(0, value);
            if (b <= 1) return 100;
            if (b <= 2) return lerp(b, 1, 2, 100, 92);
            if (b <= 4) return lerp(b, 2, 4, 92, 72);
            if (b <= 8) return lerp(b, 4, 8, 72, 40);
            if (b <= 15) return lerp(b, 8, 15, 40, 15);
            return Math.max(2, lerp(b, 15, 30, 15, 2));
        }
        case 'nitrate': {
            // NO3- mg/L - CETESB Figure D.5
            // Nitrato em mg/L
            const n = Math.max(0, value);
            if (n <= 1) return 100;
            if (n <= 5) return lerp(n, 1, 5, 100, 90);
            if (n <= 10) return lerp(n, 5, 10, 90, 70);
            if (n <= 30) return lerp(n, 10, 30, 70, 30);
            return Math.max(2, lerp(n, 30, 100, 30, 2));
        }
        case 'phosphate': {
            // Total phosphate mg/L - CETESB Figure D.6
            // Fosfato total em mg/L
            const p = Math.max(0, value);
            if (p <= 0.01) return 100;
            if (p <= 0.05) return lerp(p, 0.01, 0.05, 100, 90);
            if (p <= 0.1) return lerp(p, 0.05, 0.1, 90, 70);
            if (p <= 0.5) return lerp(p, 0.1, 0.5, 70, 30);
            return Math.max(2, lerp(p, 0.5, 5, 30, 2));
        }
        case 'temperature': {
            // Temperature deviation from natural (°C) - CETESB Figure D.7
            // Desvio de temperatura em relação ao natural (°C)
            const dev = Math.abs(value);
            if (dev <= 1) return 100;
            if (dev <= 3) return lerp(dev, 1, 3, 100, 80);
            if (dev <= 6) return lerp(dev, 3, 6, 80, 40);
            if (dev <= 9) return lerp(dev, 6, 9, 40, 10);
            return Math.max(2, 10 - (dev - 9) * 0.8);
        }
        case 'turbidity': {
            // NTU - CETESB Figure D.8
            // Turbidez em NTU
            const t = Math.max(0, value);
            if (t <= 1) return 100;
            if (t <= 5) return lerp(t, 1, 5, 100, 90);
            if (t <= 10) return lerp(t, 5, 10, 90, 75);
            if (t <= 50) return lerp(t, 10, 50, 75, 35);
            if (t <= 100) return lerp(t, 50, 100, 35, 10);
            return Math.max(2, lerp(t, 100, 500, 10, 2));
        }
        case 'totalSolids': {
            // TDS mg/L - CETESB Figure D.9
            // Sólidos totais dissolvidos em mg/L
            const s = Math.max(0, value);
            if (s <= 50) return 100;
            if (s <= 150) return lerp(s, 50, 150, 100, 90);
            if (s <= 300) return lerp(s, 150, 300, 90, 70);
            if (s <= 500) return lerp(s, 300, 500, 70, 40);
            return Math.max(2, lerp(s, 500, 1500, 40, 2));
        }
        default:
            throw new TypeError(`computeQi: unknown parameter "${parameter}"`);
    }
}
/**
 * Calculate the IQA (Water Quality Index) using the weighted geometric mean.
 * Calcula o IQA (Índice de Qualidade da Água) pela média geométrica ponderada.
 *
 * IQA = ∏(qi^wi)  for i = 1..9
 *
 * Reference: CETESB (2021) Apêndice D, eq. D.1
 *
 * @param {object} measurements - Object mapping parameter name → measured value
 *   {
 *     do: number,              // DO saturation (%)
 *     fecalColiforms: number,  // NMP/100 mL
 *     ph: number,              // dimensionless
 *     bod: number,             // BOD5 (mg/L)
 *     nitrate: number,         // NO3- (mg/L)
 *     phosphate: number,       // Total phosphate (mg/L)
 *     temperature: number,     // Temperature deviation (°C)
 *     turbidity: number,       // NTU
 *     totalSolids: number,     // mg/L
 *   }
 * @returns {{
 *   iqa: number,
 *   classification: string,
 *   conama357Class: string,
 *   parameterSubIndices: object
 * }}
 * @throws {TypeError} if measurements is not an object
 * @throws {RangeError} if any measurement value is negative
 */
export function calcIQA( measurements: any) {
    if (typeof measurements !== 'object' || measurements === null) {
        throw new TypeError('calcIQA: measurements must be a non-null object');
    }
    const parameterSubIndices: any = {};
    let geometricProduct = 1;
    const meas = (measurements) as Record<string, number>;
    for (const [param, weight] of Object.entries(PARAMETER_WEIGHTS)) {
        const value = meas[param];
        if (typeof value !== 'number' || value < 0) {
            throw new RangeError(`calcIQA: measurements.${param} must be a non-negative number, got ${value}`);
        }
        const qi = computeQi(param, value);
        parameterSubIndices[param] = Math.round(qi * 100) / 100;
        geometricProduct *= Math.pow(qi, weight);
    }
    const iqa = Math.round(geometricProduct * 100) / 100;
    // CETESB classification thresholds (2021)
    // Classificação CETESB (2021)
    let classification;
    if (iqa >= 80)
        classification = 'optimal'; // ótima
    else if (iqa >= 52)
        classification = 'good'; // boa
    else if (iqa >= 37)
        classification = 'fair'; // razoável
    else if (iqa >= 20)
        classification = 'poor'; // ruim
    else classification = 'very_poor'; // péssima
    // Approximate CONAMA 357/2005 class mapping
    // Mapeamento aproximado para classes CONAMA 357/2005
    let conama357Class;
    if (iqa >= 79) conama357Class = 'Class I';
    else if (iqa >= 51) conama357Class = 'Class II';
    else if (iqa >= 36) conama357Class = 'Class III';
    else conama357Class = 'Class IV';
    return { iqa, classification, conama357Class, parameterSubIndices };
}
/**
 * Check whether individual parameters comply with CONAMA 357/2005 Class II limits.
 * Verifica se parâmetros individuais estão em conformidade com os limites CONAMA 357/2005 Classe II.
 *
 * @param {object} measurements - Same structure as calcIQA parameter
 * @returns {{ compliant: boolean, violations: Array<{parameter: string, measured: number, limit: string}> }}
 * @throws {TypeError} if measurements is not an object
 */
export function checkCONAMA357Compliance( measurements: any) {
    if (typeof measurements !== 'object' || measurements === null) {
        throw new TypeError('checkCONAMA357Compliance: measurements must be a non-null object');
    }
    // CONAMA 357/2005 Classe II limits (freshwater - doces)
    // Limites CONAMA 357/2005 Classe II (águas doces)
    /** @type {Record<string, { min?: number, max: number, unit: string }>} */
    const CONAMA_LIMITS = {
        ph: { min: 6.0, max: 9.0, unit: 'dimensionless' },
        bod: { max: 5, unit: 'mg/L DBO5' },
        turbidity: { max: 100, unit: 'NTU' },
        totalSolids: { max: 500, unit: 'mg/L' },
        nitrate: { max: 10, unit: 'mg/L NO3-' },
        phosphate: { max: 0.1, unit: 'mg/L PO4' },
        fecalColiforms: { max: 1000, unit: 'NMP/100mL' },
    };
    /** @type {Array<{parameter: string, measured: number, limit: string}>} */
    const violations = [];
    const meas = (measurements) as Record<string, number>;
    for (const [param, limits] of Object.entries(CONAMA_LIMITS) as [string, any][]) {
        const value = meas[param];
        if (typeof value !== 'number') continue;
        if ((limits.min !== undefined && value < limits.min) || (limits.max !== undefined && value > limits.max)) {
            violations.push({
                parameter: param,
                measured: value,
                limit:
                    limits.min !== undefined
                        ? `[${limits.min}, ${limits.max}] ${limits.unit}`
                        : `<= ${limits.max} ${limits.unit}`,
            });
        }
    }
    return {
        compliant: violations.length === 0,
        violations,
    };
}
/**
 * Get the IQA classification label and CETESB color code for display.
 * Retorna o rótulo de classificação IQA e código de cor CETESB para exibição.
 *
 * @param {number} iqa - IQA value (0–100)
 * @returns {{ classification: string, color: string, labelPT: string }}
 * @throws {RangeError} if iqa is outside [0, 100]
 */
export function getIQAClassification( iqa: any) {
    if (typeof iqa !== 'number' || iqa < 0 || iqa > 100) {
        throw new RangeError(`getIQAClassification: iqa must be in [0, 100], got ${iqa}`);
    }
    if (iqa >= 80) return { classification: 'optimal', color: '#1a9641', labelPT: 'Ótima' };
    if (iqa >= 52) return { classification: 'good', color: '#a6d96a', labelPT: 'Boa' };
    if (iqa >= 37) return { classification: 'fair', color: '#fdae61', labelPT: 'Razoável' };
    if (iqa >= 20) return { classification: 'poor', color: '#d7191c', labelPT: 'Ruim' };
    return { classification: 'very_poor', color: '#7b0000', labelPT: 'Péssima' };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const waterQualityIndexCEMEMeta = {
    name: 'waterQualityIndexCEME',
    description: 'waterQualityIndexCEME',
    category: 'analytics',
    familyTags: ['water'],
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
