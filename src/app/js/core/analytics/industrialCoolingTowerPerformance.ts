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
 * Industrial Cooling Tower Performance - Desempenho de Torre de Resfriamento Industrial
 *
 * References / Referências:
 *  - Merkel, F. (1925). Verdunstungskühlung. VDI Forschungsarbeit 275, Berlin.
 *    (Basis for NTU integral - Number of Transfer Units)
 *  - Cooling Technology Institute (CTI) ATC-105 (2000). Acceptance Test Code for
 *    Water Cooling Towers.
 *  - ASHRAE Handbook - HVAC Systems and Equipment (2020), Chapter 40: Cooling Towers.
 *  - Perry's Chemical Engineers' Handbook, 9th ed. (2019), Section 12.
 *
 * Calculations:
 *  - Approach temperature = outlet water T − wet-bulb T
 *  - Range = inlet water T − outlet water T
 *  - Cooling efficiency = Range / (Range + Approach) × 100 %
 *  - Merkel NTU (simplified trapezoidal integration): NTU = ∫[T2→T1] c_pw dT / (h_s − h_a)
 *    where h_s = saturation enthalpy at water T, h_a = air enthalpy
 *  - Water consumption: evaporation + drift + blowdown
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Comentários: headers em inglês, explicações em português.
 *
 * @module industrialCoolingTowerPerformance
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

// Specific heat of water (kJ/kg·K) - ASHRAE 2020
// Calor específico da água
const CP_WATER = 4.186;

// Latent heat of vaporization of water at ~35°C (kJ/kg) - ASHRAE 2020
// Calor latente de vaporização da água
const LAMBDA_WATER = 2430;

/**
 * Computes saturation enthalpy of moist air (kJ/kg dry air) from temperature.
 * Calcula entalpia de ar saturado (kJ/kg ar seco) pela temperatura.
 *
 * Approximate formula valid for T = 10–50°C (Perry's, eq. based on Magnus).
 * h_s ≈ 1.006·T + W_s·(2501 + 1.86·T), where W_s = saturation humidity ratio.
 * Saturation W_s derived from August-Roche-Magnus approximation for P = 101.325 kPa.
 *
 * @param tempC - Dry-bulb temperature (°C), valid range 10–60.
 * @returns Saturation enthalpy (kJ/kg dry air).
 * @throws {RangeError} If temperature is out of range.
 */
export function saturationEnthalpy(tempC: number): number {
    if (typeof tempC !== 'number' || tempC < 10 || tempC > 60) {
        throw new RangeError(`tempC must be in [10, 60] °C, got: ${tempC}`);
    }
    // Pressão de saturação (kPa) - Magnus approximation
    // P_sat = 0.61078 × exp(17.27 × T / (T + 237.3)) [kPa]
    const pSat = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
    // Razão de umidade de saturação (kg/kg ar seco) - para pressão total 101.325 kPa
    const wSat = (0.62198 * pSat) / (101.325 - pSat);
    // Entalpia ar saturado (kJ/kg ar seco)
    return 1.006 * tempC + wSat * (2501 + 1.86 * tempC);
}

/**
 * Calculates approach temperature (°C).
 * Calcula a aproximação da torre (diferença entre saída da água e temperatura de bulbo úmido).
 *
 * @param outletWaterTempC - Outlet (cold) water temperature (°C).
 * @param wetBulbTempC - Inlet air wet-bulb temperature (°C).
 * @returns Approach temperature (°C). Must be > 0 for feasible cooling.
 * @throws {RangeError} If outlet water temp is not strictly greater than wet-bulb.
 */
export function approachTemperature(outletWaterTempC: number, wetBulbTempC: number): number {
    if (typeof outletWaterTempC !== 'number') throw new TypeError('outletWaterTempC must be a number');
    if (typeof wetBulbTempC !== 'number') throw new TypeError('wetBulbTempC must be a number');
    if (outletWaterTempC <= wetBulbTempC) {
        throw new RangeError(
            `outletWaterTempC (${outletWaterTempC}) must be > wetBulbTempC (${wetBulbTempC}); thermodynamic limit of cooling tower`,
        );
    }
    return outletWaterTempC - wetBulbTempC;
}

/**
 * Calculates cooling range (°C) - temperature drop across the tower.
 * Calcula o range de resfriamento (queda de temperatura na torre).
 *
 * @param inletWaterTempC - Hot water inlet temperature (°C).
 * @param outletWaterTempC - Cold water outlet temperature (°C).
 * @returns Cooling range (°C). Must be > 0.
 * @throws {RangeError} If inlet is not greater than outlet.
 */
export function coolingRange(inletWaterTempC: number, outletWaterTempC: number): number {
    if (typeof inletWaterTempC !== 'number') throw new TypeError('inletWaterTempC must be a number');
    if (typeof outletWaterTempC !== 'number') throw new TypeError('outletWaterTempC must be a number');
    if (inletWaterTempC <= outletWaterTempC) {
        throw new RangeError(`inletWaterTempC (${inletWaterTempC}) must be > outletWaterTempC (${outletWaterTempC})`);
    }
    return inletWaterTempC - outletWaterTempC;
}

/**
 * Calculates cooling efficiency (%).
 * Calcula a eficiência de resfriamento da torre (%).
 *
 * Formula: η = Range / (Range + Approach) × 100 (CTI ATC-105)
 * Indica quão próxima a saída da água está do limite teórico (bulbo úmido).
 *
 * @param range - Cooling range (°C). Must be > 0.
 * @param approach - Approach temperature (°C). Must be > 0.
 * @returns Cooling efficiency (%).
 * @throws {RangeError} If range or approach are not positive.
 */
export function coolingEfficiency(range: number, approach: number): number {
    if (typeof range !== 'number' || range <= 0) {
        throw new RangeError(`range must be > 0, got: ${range}`);
    }
    if (typeof approach !== 'number' || approach <= 0) {
        throw new RangeError(`approach must be > 0, got: ${approach}`);
    }
    return (range / (range + approach)) * 100;
}

/**
 * Calculates Number of Transfer Units (NTU) using Merkel's simplified method.
 * Calcula NTU de Merkel por integração trapezoidal simplificada.
 *
 * NTU = ∫[T_out → T_in] (c_pw / (h_s(T) − h_a)) dT
 * h_a is the air enthalpy at inlet conditions (estimated from wet-bulb T).
 * Uses 4-point trapezoidal integration for accuracy.
 *
 * @param inletWaterTempC - Hot water inlet temperature (°C).
 * @param outletWaterTempC - Cold water outlet temperature (°C).
 * @param wetBulbTempC - Inlet air wet-bulb temperature (°C).
 * @param steps - Integration steps (default 20).
 * @returns NTU (dimensionless).
 * @throws {RangeError} If temperatures are thermodynamically infeasible.
 */
export function merkelNTU(
    inletWaterTempC: number,
    outletWaterTempC: number,
    wetBulbTempC: number,
    steps: number = 20,
): number {
    if (typeof steps !== 'number' || steps < 2 || !Number.isInteger(steps)) {
        throw new RangeError(`steps must be an integer >= 2, got: ${steps}`);
    }
    // Valida range e approach antes de calcular
    coolingRange(inletWaterTempC, outletWaterTempC);
    approachTemperature(outletWaterTempC, wetBulbTempC);

    // Entalpia do ar na entrada (bulbo úmido = ponto de saturação do ar de entrada)
    const hAirIn = saturationEnthalpy(wetBulbTempC);

    // Integração trapezoidal de T_out até T_in
    const dT = (inletWaterTempC - outletWaterTempC) / steps;
    let ntu = 0;
    let prevIntegrand: number | null = null;

    for (let i = 0; i <= steps; i++) {
        const T = outletWaterTempC + i * dT;
        const hSat = saturationEnthalpy(T);
        // Aproximação: h_a aumenta linearmente com T (adiabatic saturation)
        // h_a(T) = h_air_in + (T − T_wb) × c_ps, c_ps ≈ 1.006 kJ/(kg·K)
        const hAir = hAirIn + (T - wetBulbTempC) * 1.006;
        const denominator = hSat - hAir;
        if (denominator <= 0) {
            throw new RangeError(
                `Air enthalpy exceeds saturation enthalpy at T=${T.toFixed(1)}°C — thermodynamically infeasible`,
            );
        }
        const integrand = CP_WATER / denominator;
        if (prevIntegrand !== null) {
            ntu += 0.5 * (prevIntegrand + integrand) * dT;
        }
        prevIntegrand = integrand;
    }
    return ntu;
}

/**
 * Calculates cooling tower water consumption (m³/h).
 * Calcula consumo de água da torre de resfriamento (m³/h).
 *
 * Evaporation ≈ (Range × c_pw / λ) × flowRate  [ASHRAE 2020 Ch.40]
 * Drift ≈ driftRate (fraction) × flowRate
 * Blowdown = Evaporation / (COC − 1), where COC = cycles of concentration
 * Total = Evaporation + Drift + Blowdown
 *
 * @param waterFlowM3h - Circulating water flow rate (m³/h). Must be > 0.
 * @param range - Cooling range (°C). Must be > 0.
 * @param cyclesOfConcentration - COC - ratio of dissolved solids (default 3).
 * @param driftFraction - Drift rate as fraction of flow (default 0.02%).
 * @returns All in m³/h.
 * @throws {RangeError} If waterFlowM3h or range are not positive.
 */
export function waterConsumption(
    waterFlowM3h: number,
    range: number,
    cyclesOfConcentration: number = 3,
    driftFraction: number = 0.0002,
): { evaporation: number; drift: number; blowdown: number; total: number } {
    if (typeof waterFlowM3h !== 'number' || waterFlowM3h <= 0) {
        throw new RangeError(`waterFlowM3h must be > 0, got: ${waterFlowM3h}`);
    }
    if (typeof range !== 'number' || range <= 0) {
        throw new RangeError(`range must be > 0, got: ${range}`);
    }
    if (typeof cyclesOfConcentration !== 'number' || cyclesOfConcentration <= 1) {
        throw new RangeError(`cyclesOfConcentration must be > 1, got: ${cyclesOfConcentration}`);
    }
    if (typeof driftFraction !== 'number' || driftFraction < 0 || driftFraction > 0.1) {
        throw new RangeError(`driftFraction must be in [0, 0.1], got: ${driftFraction}`);
    }
    // Evaporação: calor removido / calor latente; densidade água ≈ 1 t/m³
    const evaporation = ((range * CP_WATER) / LAMBDA_WATER) * waterFlowM3h;
    const drift = driftFraction * waterFlowM3h;
    // Purga necessária para manter COC (controla concentração de sais)
    const blowdown = evaporation / (cyclesOfConcentration - 1);
    return { evaporation, drift, blowdown, total: evaporation + drift + blowdown };
}

/**
 * Classifies cooling tower performance from efficiency and approach.
 * Classifica desempenho da torre com base em eficiência e aproximação (CTI ATC-105).
 *
 * @param efficiency - Cooling efficiency (%).
 * @param approach - Approach temperature (°C).
 * @returns Performance class.
 */
export function classifyPerformance(
    efficiency: number,
    approach: number,
): 'excellent' | 'good' | 'fair' | 'poor' {
    if (typeof efficiency !== 'number' || efficiency < 0 || efficiency > 100) {
        throw new RangeError(`efficiency must be in [0, 100], got: ${efficiency}`);
    }
    if (typeof approach !== 'number' || approach <= 0) {
        throw new RangeError(`approach must be > 0, got: ${approach}`);
    }
    // Torre excelente: alta eficiência E baixa aproximação
    if (efficiency >= 75 && approach <= 3) return 'excellent';
    if (efficiency >= 65 && approach <= 5) return 'good';
    if (efficiency >= 55 && approach <= 8) return 'fair';
    return 'poor';
}

/**
 * Full cooling tower performance analysis.
 * Análise completa de desempenho da torre de resfriamento.
 *
 * @param params
 * @returns
 */
export function coolingTowerAnalysis(params: {
    inletWaterTempC: number;
    outletWaterTempC: number;
    wetBulbTempC: number;
    waterFlowM3h: number;
    cyclesOfConcentration?: number;
    driftFraction?: number;
    ntuSteps?: number;
}): {
    approach: number;
    range: number;
    efficiency: number;
    ntu: number;
    water: { evaporation: number; drift: number; blowdown: number; total: number };
    performanceClass: string;
} {
    const {
        inletWaterTempC,
        outletWaterTempC,
        wetBulbTempC,
        waterFlowM3h,
        cyclesOfConcentration,
        driftFraction,
        ntuSteps,
    } = params;
    const range = coolingRange(inletWaterTempC, outletWaterTempC);
    const approach = approachTemperature(outletWaterTempC, wetBulbTempC);
    const efficiency = coolingEfficiency(range, approach);
    const ntu = merkelNTU(inletWaterTempC, outletWaterTempC, wetBulbTempC, ntuSteps || 20);
    const water = waterConsumption(waterFlowM3h, range, cyclesOfConcentration, driftFraction);
    const performanceClass = classifyPerformance(efficiency, approach);
    return { approach, range, efficiency, ntu, water, performanceClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialCoolingTowerPerformanceMeta: AnalyticsModuleMeta = {
    name: 'industrialCoolingTowerPerformance',
    description: 'industrialCoolingTowerPerformance',
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
