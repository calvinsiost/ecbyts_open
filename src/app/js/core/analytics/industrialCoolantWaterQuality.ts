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
 * Industrial Coolant Water Quality - Qualidade de agua de refrigeracao industrial
 *
 * Implements scaling/corrosion indices and concentration cycles for cooling
 * tower water treatment management.
 *
 * Academic references:
 * - ASTM D4189-07 (2014). Standard Test Method for Silt Density Index (SDI)
 *   of Water. ASTM International. https://www.astm.org/d4189-07r14.html
 * - Langelier, W.F. (1936). The analytical control of anti-corrosion water
 *   treatment. Journal AWWA, 28(10), 1500–1521. DOI: 10.1002/j.1551-8833.1936.tb13785.x
 * - Ryznar, J.W. (1944). A new index for determining the amount of calcium
 *   carbonate scale formed by a water. Journal AWWA, 36(4), 472–486.
 *   DOI: 10.1002/j.1551-8833.1944.tb20016.x
 * - ASHRAE Handbook - HVAC Systems and Equipment (2020). Chapter 43: Cooling Towers.
 *
 * @module core/analytics/industrialCoolantWaterQuality
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
 * Calculate the pH of saturation (pHs) for CaCO3 equilibrium.
 * Calcula o pH de saturacao (pHs) para equilibrio de CaCO3.
 *
 * pHs = pK2 - pKsp + pCa + pAlk + 5pfm
 * Simplified empirical equation (Langelier 1936):
 * pHs = (9.3 + A + B) - (C + D)
 * where A, B, C, D are temperature and ion strength correction factors.
 *
 * @param params - Water chemistry parameters / Parametros de quimica da agua
 * @param params.tempC - Water temperature (°C) / Temperatura da agua
 * @param params.totalDissolvedSolidsMgL - TDS (mg/L) / Solidos dissolvidos totais
 * @param params.calciumHardnessMgLCaCO3 - Calcium hardness as CaCO3 (mg/L) / Dureza de calcio como CaCO3
 * @param params.totalAlkMgLCaCO3 - Total alkalinity as CaCO3 (mg/L) / Alcalinidade total como CaCO3
 * @returns pHs - pH of saturation / pH de saturacao
 */
export function calculatePHSaturation({
    tempC,
    totalDissolvedSolidsMgL,
    calciumHardnessMgLCaCO3,
    totalAlkMgLCaCO3,
}: {
    tempC: number;
    totalDissolvedSolidsMgL: number;
    calciumHardnessMgLCaCO3: number;
    totalAlkMgLCaCO3: number;
}): number {
    if (typeof tempC !== 'number' || tempC < 0 || tempC > 100) {
        throw new RangeError('tempC must be between 0 and 100 °C');
    }
    if (typeof totalDissolvedSolidsMgL !== 'number' || totalDissolvedSolidsMgL < 0) {
        throw new RangeError('totalDissolvedSolidsMgL must be non-negative');
    }
    if (typeof calciumHardnessMgLCaCO3 !== 'number' || calciumHardnessMgLCaCO3 <= 0) {
        throw new RangeError('calciumHardnessMgLCaCO3 must be positive');
    }
    if (typeof totalAlkMgLCaCO3 !== 'number' || totalAlkMgLCaCO3 <= 0) {
        throw new RangeError('totalAlkMgLCaCO3 must be positive');
    }

    // Fator A: correcao de temperatura (ionizacao do acido carbonico)
    const A = Math.log10(totalDissolvedSolidsMgL + 1) - 1;
    // Fator B: correcao de temperatura empirica (Langelier 1936)
    const B = -13.12 * Math.log10(tempC + 273) + 34.55;
    // Fator C: dureza de calcio
    const C = Math.log10(calciumHardnessMgLCaCO3) - 0.4;
    // Fator D: alcalinidade total
    const D = Math.log10(totalAlkMgLCaCO3);

    return 9.3 + A + B - (C + D);
}

/**
 * Calculate Langelier Saturation Index (LSI).
 * Calcula o Indice de Saturacao de Langelier (LSI).
 *
 * LSI = pH_actual - pHs
 * LSI > 0: scaling tendency (tendencia a incrustacao)
 * LSI = 0: balanced (equilibrado)
 * LSI < 0: corrosion tendency (tendencia a corrosao)
 *
 * @param pHActual - Measured pH / pH medido
 * @param pHSat - pH of saturation / pH de saturacao (from calculatePHSaturation)
 */
export function calculateLSI(
    pHActual: number,
    pHSat: number,
): { lsi: number; tendency: string; severity: string } {
    if (typeof pHActual !== 'number' || pHActual < 0 || pHActual > 14) {
        throw new RangeError('pHActual must be between 0 and 14');
    }
    if (typeof pHSat !== 'number') {
        throw new TypeError('pHSat must be a number');
    }

    const lsi = pHActual - pHSat;

    // Classificacao de tendencia e severidade
    let tendency, severity;
    if (lsi > 0.5) {
        tendency = 'scaling';
        severity = 'severe';
    } else if (lsi > 0.2) {
        tendency = 'scaling';
        severity = 'moderate';
    } else if (lsi > -0.2) {
        tendency = 'balanced';
        severity = 'acceptable';
    } else if (lsi > -0.5) {
        tendency = 'corrosive';
        severity = 'moderate';
    } else {
        tendency = 'corrosive';
        severity = 'severe';
    }

    return { lsi, tendency, severity };
}

/**
 * Calculate Ryznar Stability Index (RSI).
 * Calcula o Indice de Estabilidade de Ryznar (RSI).
 *
 * RSI = 2 * pHs - pH_actual (Ryznar 1944)
 * RSI < 6.0: scaling (incrustacao)
 * 6.0–6.9: scale-forming tendency (tendencia de incrustacao)
 * 7.0–7.5: balanced (equilibrado)
 * 7.5–9.0: mildly corrosive (levemente corrosivo)
 * > 9.0: severely corrosive (severamente corrosivo)
 *
 * @param pHActual - Measured pH / pH medido
 * @param pHSat - pH of saturation / pH de saturacao
 */
export function calculateRSI(
    pHActual: number,
    pHSat: number,
): { rsi: number; tendency: string; description: string } {
    if (typeof pHActual !== 'number' || pHActual < 0 || pHActual > 14) {
        throw new RangeError('pHActual must be between 0 and 14');
    }
    if (typeof pHSat !== 'number') {
        throw new TypeError('pHSat must be a number');
    }

    const rsi = 2 * pHSat - pHActual;

    let tendency, description;
    if (rsi < 6.0) {
        tendency = 'scaling';
        description = 'Heavy scale formation expected';
    } else if (rsi < 7.0) {
        tendency = 'scale_tendency';
        description = 'Scale-forming tendency — monitor closely';
    } else if (rsi <= 7.5) {
        tendency = 'balanced';
        description = 'Balanced — stable water';
    } else if (rsi <= 9.0) {
        tendency = 'corrosive';
        description = 'Mildly corrosive — treatment recommended';
    } else {
        tendency = 'severely_corrosive';
        description = 'Severely corrosive — immediate treatment required';
    }

    return { rsi, tendency, description };
}

/**
 * Calculate blowdown flow rate and cycles of concentration for cooling tower.
 * Calcula a vazao de purga e ciclos de concentracao de torre de resfriamento.
 *
 * Cycles of Concentration (CoC) = makeup conductivity / blowdown conductivity
 * Blowdown = (Evaporation / (CoC - 1)) - Drift
 *
 * @param params - Cooling tower parameters / Parametros da torre de resfriamento
 * @param params.evaporationRateM3h - Evaporation rate (m³/h) / Taxa de evaporacao
 * @param params.driftLossM3h - Drift loss (m³/h) / Perda por arraste
 * @param params.targetCOC - Target cycles of concentration (≥1) / Ciclos de concentracao alvo
 */
export function calculateCoolingTowerBlowdown({
    evaporationRateM3h,
    driftLossM3h,
    targetCOC,
}: {
    evaporationRateM3h: number;
    driftLossM3h: number;
    targetCOC: number;
}): { blowdownM3h: number; makeupM3h: number; coc: number } {
    if (typeof evaporationRateM3h !== 'number' || evaporationRateM3h <= 0) {
        throw new RangeError('evaporationRateM3h must be positive');
    }
    if (typeof driftLossM3h !== 'number' || driftLossM3h < 0) {
        throw new RangeError('driftLossM3h must be non-negative');
    }
    if (typeof targetCOC !== 'number' || targetCOC <= 1) {
        throw new RangeError('targetCOC must be greater than 1');
    }

    // Purga = (Evaporacao / (COC - 1)) - Arraste
    const blowdownM3h = evaporationRateM3h / (targetCOC - 1) - driftLossM3h;
    // Reposicao = Evaporacao + Purga + Arraste
    const makeupM3h = evaporationRateM3h + blowdownM3h + driftLossM3h;

    return {
        blowdownM3h: Math.max(0, blowdownM3h),
        makeupM3h,
        coc: targetCOC,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialCoolantWaterQualityMeta: AnalyticsModuleMeta = {
    name: 'industrialCoolantWaterQuality',
    description: 'industrialCoolantWaterQuality',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
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
