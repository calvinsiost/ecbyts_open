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
 * Industrial Heat Stress Control - Controle de estresse térmico industrial
 *
 * Referências acadêmicas:
 *  - ACGIH (2024). TLVs and BEIs. WBGT-based exposure limits for heat stress.
 *    ISBN 978-1-607260-97-8
 *  - ISO 7933:2004. Ergonomics of the thermal environment - Analytical determination
 *    and interpretation of heat stress using calculation of the predicted heat strain.
 *    DOI: 10.3403/01898476
 *  - NR-15 Anexo 3 (2023). Operações e Atividades Insalubres - Calor.
 *    Portaria MTE nº 3.214/1978 atualizada.
 *  - Steadman, R.G. (1979). The assessment of sultriness. Part I: A temperature-humidity
 *    index based on human physiology and clothing science. J. Appl. Meteorol., 18, 861–873.
 *    DOI: 10.1175/1520-0450(1979)018<0861:TAOSPI>2.0.CO;2
 *  - Bernard, T.E. & Barrow, C. (2014). The WBGT index as a guide to heat stress exposures.
 *    In: Stull, R. Meteorology for Scientists and Engineers, 3rd ed.
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * @module industrialHeatStressControl
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * ACGIH 2024 WBGT Threshold Limit Values by metabolic rate and acclimatization.
 * Limites WBGT ACGIH 2024 por taxa metabólica e estado de aclimatação.
 *
 * Metabolic rate categories (W):
 *   rest ≤ 115 W, light ≤ 230 W, moderate ≤ 345 W, heavy ≤ 460 W, very_heavy > 460 W
 * Values in °C WBGT
 */
const ACGIH_TLV_WBGT = {
    // { acclimated: [°C], unacclimated: [°C] }
    rest: { acclimated: 33, unacclimated: 32 },
    light: { acclimated: 30, unacclimated: 29 },
    moderate: { acclimated: 28, unacclimated: 26 },
    heavy: { acclimated: 25, unacclimated: 22 },
    very_heavy: { acclimated: 23, unacclimated: 18 },
};

const METABOLIC_RATE_CATEGORIES = ['rest', 'light', 'moderate', 'heavy', 'very_heavy'];

/**
 * Calculates WBGT (Wet Bulb Globe Temperature) - indoor or outdoor.
 * Calcula WBGT para ambientes internos (sem sol) ou externos (com radiação solar).
 *
 * Indoor: WBGT = 0.7 * NWB + 0.3 * GT
 * Outdoor: WBGT = 0.7 * NWB + 0.2 * GT + 0.1 * DB
 *
 * where NWB = natural wet bulb (°C), GT = globe temp (°C), DB = dry bulb (°C)
 *
 * @param {number} nwbC - Natural wet bulb temperature (°C) / Temperatura de bulbo úmido natural
 * @param {number} gtC - Globe temperature (°C) / Temperatura de globo negro
 * @param {number} dbC - Dry bulb (air) temperature (°C) / Temperatura do ar (bulbo seco)
 * @param {boolean} [outdoor=false] - Include solar radiation factor / Incluir fator solar
 * @returns {number} WBGT index (°C)
 */
export function calcWBGT(nwbC: number, gtC: number, dbC: number, outdoor = false): number {
    if (!isFinite(nwbC) || !isFinite(gtC) || !isFinite(dbC)) {
        throw new TypeError('All temperatures must be finite numbers');
    }
    if (nwbC < -10 || nwbC > 60) throw new RangeError('nwbC out of plausible range [-10, 60] °C');
    if (gtC < -10 || gtC > 100) throw new RangeError('gtC out of plausible range [-10, 100] °C');

    return outdoor ? 0.7 * nwbC + 0.2 * gtC + 0.1 * dbC : 0.7 * nwbC + 0.3 * gtC;
}

/**
 * Determines the metabolic rate category from power output in watts.
 * Determina a categoria de taxa metabólica a partir da potência em watts.
 *
 * @param {number} metabolicRateW - Metabolic rate (W) / Taxa metabólica em watts
 * @returns {string} Category key: 'rest'|'light'|'moderate'|'heavy'|'very_heavy'
 */
export function classifyMetabolicRate(metabolicRateW: number): string {
    if (typeof metabolicRateW !== 'number' || metabolicRateW < 0) {
        throw new RangeError('metabolicRateW must be a non-negative number');
    }
    if (metabolicRateW <= 115) return 'rest';
    if (metabolicRateW <= 230) return 'light';
    if (metabolicRateW <= 345) return 'moderate';
    if (metabolicRateW <= 460) return 'heavy';
    return 'very_heavy';
}

/**
 * Evaluates WBGT exposure against ACGIH 2024 TLV.
 * Avalia exposição WBGT em relação ao TLV da ACGIH 2024.
 *
 * @param {number} wbgtC - Measured WBGT (°C)
 * @param {string} metabolicCategory - One of METABOLIC_RATE_CATEGORIES
 * @param {boolean} [acclimated=true] - Worker acclimated to heat / Trabalhador aclimatado
 * @returns {{ tlvC: number, exceedance: number, workCapacityFraction: number, requiresControl: boolean }}
 */
export function evaluateWBGTExposure(
    wbgtC: number,
    metabolicCategory: string,
    acclimated = true,
): { tlvC: number; exceedance: number; workCapacityFraction: number; requiresControl: boolean } {
    if (!isFinite(wbgtC)) throw new TypeError('wbgtC must be finite');
    if (!METABOLIC_RATE_CATEGORIES.includes(metabolicCategory)) {
        throw new RangeError(`metabolicCategory must be one of: ${METABOLIC_RATE_CATEGORIES.join(', ')}`);
    }

    const tlvEntry = (ACGIH_TLV_WBGT as Record<string, { acclimated: number; unacclimated: number }>)[
        metabolicCategory
    ]!;
    const tlvC = acclimated ? tlvEntry.acclimated : tlvEntry.unacclimated;

    // Exceedância positiva = calor excessivo / positive = excess heat above limit
    const exceedance = wbgtC - tlvC;

    // Fração de capacidade de trabalho restante (linear, zerado abaixo de 5°C excesso)
    // ISO 7933 work capacity model: each 1°C above TLV reduces capacity ~10%
    const workCapacityFraction = Math.max(0, Math.min(1, 1 - exceedance * 0.1));

    return {
        tlvC,
        exceedance,
        workCapacityFraction,
        requiresControl: exceedance > 0,
    };
}

/**
 * Calculates Heat Index (HI) using NOAA/NWS Rothfusz regression.
 * Calcula o Índice de Calor (HI) pela regressão de Rothfusz (NOAA/NWS).
 *
 * Steadman (1979) / Rothfusz (1990) full regression equation.
 * Valid for T ≥ 27°C (80°F) and RH ≥ 40%.
 *
 * @param {number} tempC - Air temperature (°C) / Temperatura do ar
 * @param {number} rhPct - Relative humidity (%) / Umidade relativa
 * @returns {{ hiC: number, category: string }}
 */
export function calcHeatIndex(tempC: number, rhPct: number): { hiC: number; category: string } {
    if (!isFinite(tempC)) throw new TypeError('tempC must be a finite number');
    if (rhPct < 0 || rhPct > 100) throw new RangeError('rhPct must be between 0 and 100');

    // Rothfusz regression is in Fahrenheit - convert and back
    const T = (tempC * 9) / 5 + 32;
    const R = rhPct;

    // Full Rothfusz regression (NOAA NWS)
    let HI =
        -42.379 +
        2.04901523 * T +
        10.14333127 * R -
        0.22475541 * T * R -
        0.00683783 * T * T -
        0.05481717 * R * R +
        0.00122874 * T * T * R +
        0.00085282 * T * R * R -
        0.00000199 * T * T * R * R;

    // Ajuste para baixa umidade / low humidity adjustment
    if (R < 13 && T >= 80 && T <= 112) {
        HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    }
    // Ajuste para alta umidade / high humidity adjustment
    if (R > 85 && T >= 80 && T <= 87) {
        HI += ((R - 85) / 10) * ((87 - T) / 5);
    }

    const hiC = ((HI - 32) * 5) / 9;

    // Classificação NOAA / NOAA category
    let category: string;
    if (hiC < 27) category = 'comfortable';
    else if (hiC < 33) category = 'caution';
    else if (hiC < 39) category = 'extreme_caution';
    else if (hiC < 51) category = 'danger';
    else category = 'extreme_danger';

    return { hiC, category };
}

/**
 * Estimates recommended recovery time after heat exposure.
 * Estima o tempo de recuperação recomendado após exposição ao calor.
 *
 * Based on NR-15 Anexo 3 work-rest regime table and ACGIH work/rest allowance.
 * Returns work minutes per hour based on WBGT exceedance.
 *
 * @param {number} wbgtC - Measured WBGT (°C)
 * @param {string} metabolicCategory - Metabolic rate category
 * @param {boolean} [acclimated=true] - Worker acclimatization status
 * @returns {{ workMinPerHour: number, restMinPerHour: number, regime: string }}
 */
export function calcWorkRestRegime(
    wbgtC: number,
    metabolicCategory: string,
    acclimated = true,
): { workMinPerHour: number; restMinPerHour: number; regime: string } {
    const { exceedance } = evaluateWBGTExposure(wbgtC, metabolicCategory, acclimated);

    // Régime de trabalho/descanso baseado em excedência do TLV
    // NR-15 Anexo 3: 15°C excedência = trabalho proibido
    let regime: string, workMinPerHour: number;

    if (exceedance <= 0) {
        regime = 'continuous_work';
        workMinPerHour = 60;
    } else if (exceedance <= 2) {
        regime = '45min_work_15min_rest';
        workMinPerHour = 45;
    } else if (exceedance <= 5) {
        regime = '30min_work_30min_rest';
        workMinPerHour = 30;
    } else if (exceedance <= 10) {
        regime = '15min_work_45min_rest';
        workMinPerHour = 15;
    } else {
        regime = 'work_prohibited';
        workMinPerHour = 0;
    }

    return {
        workMinPerHour,
        restMinPerHour: 60 - workMinPerHour,
        regime,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialHeatStressControlMeta: AnalyticsModuleMeta = {
    name: 'industrialHeatStressControl',
    description: 'industrialHeatStressControl',
    category: 'analytics',
    familyTags: ['industrial'],
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
