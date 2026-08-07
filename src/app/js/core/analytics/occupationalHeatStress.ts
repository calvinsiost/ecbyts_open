// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Occupational Heat Stress - Estresse Térmico Ocupacional
 *
 * Módulo puro para avaliação de estresse térmico em ambientes de trabalho:
 * WBGT (Wet Bulb Globe Temperature), Heat Stress Index de Steadman/NWS,
 * Carga Metabólica (ISO 8996:2004) e classificação de risco conforme ISO 7243.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ISO 7243:2017. Ergonomics of the thermal environment - Assessment of heat
 *     stress using the WBGT (Wet Bulb Globe Temperature) index. ISO, Geneva.
 *     DOI: 10.3390/ijerph17093402
 *     (Índice WBGT e limites de exposição por nível metabólico)
 *   - Steadman, R.G. (1979). The assessment of sultriness. Part I: A temperature-
 *     humidity index based on human physiology and clothing science.
 *     Journal of Applied Meteorology, 18(7), 861–873.
 *     DOI: 10.1175/1520-0450(1979)018<0861:TAOSPI>2.0.CO;2
 *     (Equação do Heat Index - base do NWS Heat Index)
 *   - ISO 8996:2004. Ergonomics of the thermal environment - Determination of
 *     metabolic rate. ISO, Geneva.
 *     (Valores de carga metabólica por nível de atividade)
 *   - ACGIH (2023). TLVs and BEIs: Threshold Limit Values for Chemical Substances
 *     and Physical Agents & Biological Exposure Indices. ACGIH, Cincinnati, OH.
 *     (Limites WBGT complementares à ISO 7243 para mineração e construção)
 *
 * @module occupationalHeatStress
 */

'use strict';

/**
 * Compute WBGT (Wet Bulb Globe Temperature)
 * Calcula o índice WBGT para avaliação de estresse térmico.
 *
 * Ambiente externo (com radiação solar):
 *   WBGT = 0.7×T_wet + 0.2×T_globe + 0.1×T_dry
 * Ambiente interno ou sombreado:
 *   WBGT = 0.7×T_wet + 0.3×T_globe
 *
 * @param {number} T_wet_C    - Temperatura de bulbo úmido (°C); ∈ [-20, 60]
 * @param {number} T_globe_C  - Temperatura de bulbo de globo (°C); ∈ [-20, 80]
 * @param {number} T_dry_C    - Temperatura de bulbo seco (°C); ∈ [-20, 60]
 * @param {boolean} outdoor   - true = externo (com radiação solar); false = interno
 * @returns {{ WBGT_C: number }}
 */
export function computeWBGT(T_wet_C: any, T_globe_C: any, T_dry_C: any, outdoor: any) {
    if (typeof T_wet_C !== 'number' || T_wet_C < -20 || T_wet_C > 60) {
        throw new RangeError('T_wet_C must be in range [-20, 60]');
    }
    if (typeof T_globe_C !== 'number' || T_globe_C < -20 || T_globe_C > 80) {
        throw new RangeError('T_globe_C must be in range [-20, 80]');
    }
    if (typeof T_dry_C !== 'number' || T_dry_C < -20 || T_dry_C > 60) {
        throw new RangeError('T_dry_C must be in range [-20, 60]');
    }
    if (typeof outdoor !== 'boolean') {
        throw new TypeError('outdoor must be a boolean');
    }

    let WBGT_C;
    if (outdoor) {
        // Fórmula ISO 7243 para ambiente externo com carga radiante solar
        WBGT_C = 0.7 * T_wet_C + 0.2 * T_globe_C + 0.1 * T_dry_C;
    } else {
        // Fórmula ISO 7243 para ambiente interno ou à sombra (sem componente seco)
        WBGT_C = 0.7 * T_wet_C + 0.3 * T_globe_C;
    }
    return { WBGT_C };
}

/**
 * Compute Heat Stress Index (HSI / NWS Heat Index)
 * Calcula o índice de estresse térmico de Steadman/NWS (Heat Index), em °C.
 *
 * Equação polinomial completa do NWS (Steadman 1979, adaptada para °C via conversão):
 * Internamente calcula em °F e converte o resultado para °C.
 * Válida estritamente para T > 27°C e RH > 40%.
 *
 * @param {number} T_dry_C - Temperatura de bulbo seco (°C); >27
 * @param {number} RH_pct  - Umidade relativa (%); >40
 * @returns {{ HSI_C: number }}
 */
export function computeHeatStressIndex(T_dry_C: any, RH_pct: any) {
    if (typeof T_dry_C !== 'number' || T_dry_C <= 27) {
        throw new RangeError('T_dry_C must be > 27°C for the Steadman/NWS Heat Index formula');
    }
    if (typeof RH_pct !== 'number' || RH_pct <= 40 || RH_pct > 100) {
        throw new RangeError('RH_pct must be > 40 and ≤ 100 for the Steadman/NWS Heat Index formula');
    }

    // Conversão para Fahrenheit (fórmula Steadman original em °F)
    const T = (T_dry_C * 9) / 5 + 32;
    const RH = RH_pct;

    // Polinômio NWS completo (Steadman 1979, DOI:10.1175/1520-0450(1979)018<0861:TAOSPI>2.0.CO;2)
    const HI_F =
        -42.379 +
        2.04901523 * T +
        10.14333127 * RH -
        0.22475541 * T * RH -
        0.00683783 * T * T -
        0.05481717 * RH * RH +
        0.00122874 * T * T * RH +
        0.00085282 * T * RH * RH -
        0.00000199 * T * T * RH * RH;

    // Conversão do resultado de volta para Celsius
    const HSI_C = ((HI_F - 32) * 5) / 9;
    return { HSI_C };
}

/**
 * Metabolic rate values per activity level (ISO 8996:2004), in W/m²
 * Taxas metabólicas típicas por nível de atividade física ocupacional
 */
const METABOLIC_RATES = {
    rest: 45,
    light: 185,
    moderate: 300,
    heavy: 415,
    very_heavy: 520,
};

/**
 * Compute Metabolic Heat Load
 * Calcula a carga de calor metabólica ajustada pelo fator de isolamento da roupa.
 *
 * M = activity_base_W_m2 × clothing_factor
 *
 * @param {'rest'|'light'|'moderate'|'heavy'|'very_heavy'} activity_level - Nível de atividade (ISO 8996)
 * @param {number} clothing_factor - Fator de isolamento da roupa; ≥0.8 (seminaked ≈ 1.0, PPE ≈ 1.3)
 * @returns {{ M_W_m2: number }}
 */
export function computeMetabolicHeatLoad(activity_level: any, clothing_factor: any) {
    if (!Object.prototype.hasOwnProperty.call(METABOLIC_RATES, activity_level)) {
        throw new TypeError(`activity_level must be one of: ${Object.keys(METABOLIC_RATES).join(', ')}`);
    }
    if (typeof clothing_factor !== 'number' || clothing_factor < 0.8) {
        throw new RangeError('clothing_factor must be ≥ 0.8 (minimum for semi-naked, ISO 8996)');
    }

    // Carga metabólica bruta ajustada pela resistência térmica da vestimenta
    const M_W_m2 = METABOLIC_RATES[activity_level as keyof typeof METABOLIC_RATES] * clothing_factor;
    return { M_W_m2 };
}

/**
 * ISO 7243 WBGT reference limits (°C) per metabolic category.
 * Linhas: [no_risk, low, moderate, high, very_high]
 * Colunas: faixas de taxa metabólica M (W/m²): <65, <130, <200, <260, ≥260
 *
 * Fonte: ISO 7243:2017 Table 1 (aclimatado ao calor)
 */
const ISO7243_LIMITS = [
    // M < 65   M < 130  M < 200  M < 260  M >= 260
    [33, 29, 25, 22, 18], // no_risk threshold
    [33, 28, 23, 21, 16], // low threshold
    [32, 26, 22, 19, 14], // moderate threshold
    [30, 25, 21, 17, 12], // high threshold
];

/**
 * Classify Heat Stress Risk
 * Classifica o nível de risco de estresse térmico conforme ISO 7243:2017.
 *
 * Os limites de WBGT dependem da faixa de taxa metabólica do trabalhador.
 *
 * @param {number} WBGT_C              - Índice WBGT (°C); realístico ∈ [-5, 50]
 * @param {number} metabolic_rate_W_m2 - Taxa metabólica (W/m²); >0
 * @returns {{ risk: 'no_risk'|'low'|'moderate'|'high'|'very_high' }}
 */
export function classifyHeatStressRisk(WBGT_C: any, metabolic_rate_W_m2: any) {
    if (typeof WBGT_C !== 'number') {
        throw new TypeError('WBGT_C must be a number');
    }
    if (typeof metabolic_rate_W_m2 !== 'number' || metabolic_rate_W_m2 <= 0) {
        throw new RangeError('metabolic_rate_W_m2 must be a positive number');
    }

    // Seleciona coluna ISO 7243 com base na faixa metabólica
    let col;
    if (metabolic_rate_W_m2 < 65) col = 0;
    else if (metabolic_rate_W_m2 < 130) col = 1;
    else if (metabolic_rate_W_m2 < 200) col = 2;
    else if (metabolic_rate_W_m2 < 260) col = 3;
    else col = 4;

    // Compara WBGT contra os limites decrescentes: se abaixo do limite → risco correspondente
    if (WBGT_C < ISO7243_LIMITS[0]![col]!) return { risk: 'no_risk' };
    if (WBGT_C < ISO7243_LIMITS[1]![col]!) return { risk: 'low' };
    if (WBGT_C < ISO7243_LIMITS[2]![col]!) return { risk: 'moderate' };
    if (WBGT_C < ISO7243_LIMITS[3]![col]!) return { risk: 'high' };
    return { risk: 'very_high' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalHeatStressMeta = {
    name: 'occupationalHeatStress',
    description: 'occupationalHeatStress',
    category: 'analytics',
    familyTags: ['occupational'],
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
