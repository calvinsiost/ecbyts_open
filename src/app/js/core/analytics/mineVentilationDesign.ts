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
 * Mine Ventilation Design Analytics
 *
 * Implements underground mine ventilation engineering calculations per:
 * - McPherson, M.J. (1993). Subsurface Ventilation and Environmental Engineering.
 *   Chapman & Hall. ISBN 978-0412352805. DOI: 10.1007/978-94-011-1550-6
 * - MSHA (2022). Metal and Nonmetal Mine Safety and Health Regulations. 30 CFR Part 57.
 * - ABNT NBR 15066:2004 - Mineração subterrânea - Requisitos mínimos de ventilação
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module mineVentilationDesign
 */

// --- Physical constants ---
// Constantes físicas
// eslint-disable-next-line
const AIR_DENSITY_STD = 1.2; // kg/m³ at 20°C, 101.325 kPa
// eslint-disable-next-line
const G = 9.81; // m/s² gravitational acceleration

/**
 * MSHA / ABNT NBR 15066 minimum air quantity per pollutant source (m³/s per unit).
 * Quantidade mínima de ar por fonte de poluição conforme MSHA / ABNT NBR 15066 (m³/s por unidade).
 * @type {Record<string, number>}
 */
const POLLUTANT_LIMITS: Record<string, number> = {
    co_ppm: 25, // MSHA TLV CO (ppm)
    nox_ppm: 3, // MSHA TLV NOx as NO2 (ppm)
    dust_mgm3: 5, // ABNT NBR 15066 dust limit (mg/m³) — respirable fraction
    diesel_ppm: 1, // CO surrogate for diesel equipment (ppm)
};

/**
 * Calculate airway resistance using Atkinson's equation.
 * Calcula a resistência de galeria usando a equação de Atkinson.
 *
 * R = k · L · Per / A³
 * where:
 *   k = Atkinson friction factor (kg/m³)
 *   L = airway length (m)
 *   Per = perimeter (m)
 *   A = cross-sectional area (m²)
 *
 * Reference: McPherson (1993) §2.3.2, eq. 2.40
 *
 * @param {{ frictionFactor_k?: number, length_m?: number, perimeter_m?: number, area_m2?: number }} [params]
 * @returns {{ resistance_Ns2m8: number, pressureDropPa_per_m3s: number }}
 * @throws {RangeError} if any dimension is non-positive or friction factor out of range
 */
export function calcAirwayResistance({
    frictionFactor_k,
    length_m,
    perimeter_m,
    area_m2,
}: { frictionFactor_k?: number; length_m?: number; perimeter_m?: number; area_m2?: number } = {}): {
    resistance_Ns2m8: number;
    pressureDropPa_per_m3s: number;
} {
    if (typeof frictionFactor_k !== 'number' || frictionFactor_k <= 0 || frictionFactor_k > 1) {
        throw new RangeError(`calcAirwayResistance: frictionFactor_k must be in (0, 1], got ${frictionFactor_k}`);
    }
    if (typeof length_m !== 'number' || length_m <= 0) {
        throw new RangeError(`calcAirwayResistance: length_m must be positive, got ${length_m}`);
    }
    if (typeof perimeter_m !== 'number' || perimeter_m <= 0) {
        throw new RangeError(`calcAirwayResistance: perimeter_m must be positive, got ${perimeter_m}`);
    }
    if (typeof area_m2 !== 'number' || area_m2 <= 0) {
        throw new RangeError(`calcAirwayResistance: area_m2 must be positive, got ${area_m2}`);
    }

    // R [Ns²/m⁸] = k [kg/m³] × L [m] × Per [m] / A³ [m⁶]
    // Resistência em Ns²/m⁸ (Atkinson)
    const resistance_Ns2m8 = (frictionFactor_k * length_m * perimeter_m) / Math.pow(area_m2, 3);

    // ΔP = R × Q² - pressure drop per unit flow squared
    // Queda de pressão por unidade de fluxo ao quadrado
    return {
        resistance_Ns2m8: Math.round(resistance_Ns2m8 * 1e6) / 1e6,
        pressureDropPa_per_m3s: Math.round(resistance_Ns2m8 * 1e6) / 1e6, // alias for clarity
    };
}

/**
 * Calculate air balance for a split ventilation network section.
 * Calcula o balanço de ar para uma seção de rede de ventilação em paralelo.
 *
 * For parallel airways: P = R₁Q₁² = R₂Q₂² (same pressure drop)
 * Airflow splits inversely proportional to √R.
 *
 * Reference: McPherson (1993) §7.2, eq. 7.7
 *
 * @param {{ totalFlowRate_m3s?: number, resistances?: number[] }} [params]
 * @returns {{ branchFlows_m3s: number[], branchVelocities_ms: number[], pressureDrop_Pa: number }}
 * @throws {TypeError} if resistances is not an array
 * @throws {RangeError} if total flow or any resistance is non-positive
 */
export function calcSplitVentilation({
    totalFlowRate_m3s,
    resistances,
}: { totalFlowRate_m3s?: number; resistances?: number[] } = {}): {
    branchFlows_m3s: number[];
    branchVelocities_ms: number[];
    pressureDrop_Pa: number;
} {
    if (typeof totalFlowRate_m3s !== 'number' || totalFlowRate_m3s <= 0) {
        throw new RangeError(`calcSplitVentilation: totalFlowRate_m3s must be positive, got ${totalFlowRate_m3s}`);
    }
    if (!Array.isArray(resistances) || resistances.length < 2) {
        throw new TypeError('calcSplitVentilation: resistances must be an array with at least 2 branches');
    }
    for (const r of resistances) {
        if (typeof r !== 'number' || r <= 0) {
            throw new RangeError(`calcSplitVentilation: all resistances must be positive, got ${r}`);
        }
    }

    // Equivalent resistance for parallel network: 1/√R_eq = Σ(1/√R_i)
    // Resistência equivalente da rede paralela
    const sumInvSqrtR = resistances.reduce((s, r) => s + 1 / Math.sqrt(r), 0);
    const R_eq = 1 / (sumInvSqrtR * sumInvSqrtR);

    // Network pressure drop: ΔP = R_eq × Q_total²
    const pressureDrop_Pa = R_eq * totalFlowRate_m3s * totalFlowRate_m3s;

    // Branch flows: Q_i = √(ΔP / R_i)
    // Vazão por ramo: Q_i = √(ΔP / R_i)
    const branchFlows_m3s = resistances.map((r) => Math.round(Math.sqrt(pressureDrop_Pa / r) * 1000) / 1000);

    // Approximate branch velocities using average area (not accurate without area per branch)
    // Velocidade aproximada por ramo (requer área por ramo para precisão)
    const branchVelocities_ms = branchFlows_m3s.map(
        (q) => Math.round((q / (totalFlowRate_m3s / branchFlows_m3s.reduce((a, b) => a + b, 0))) * 2 * 100) / 100,
    );

    return {
        branchFlows_m3s,
        branchVelocities_ms,
        pressureDrop_Pa: Math.round(pressureDrop_Pa * 100) / 100,
    };
}

/**
 * Select main fan parameters (power and pressure) for required airflow.
 * Seleciona os parâmetros do ventilador principal (potência e pressão) para a vazão requerida.
 *
 * Fan power: P = (ΔP × Q) / η_fan
 * Reference: McPherson (1993) §9.4; ABNT NBR 15066 §6.2
 *
 * @param {{ requiredFlow_m3s?: number, networkResistance?: number, fanEfficiency?: number, motorEfficiency?: number, safetyFactor?: number }} [params]
 * @returns {{ fanPressure_Pa: number, shaftPower_kW: number, installedPower_kW: number, operatingPoint: { flow_m3s: number, pressure_Pa: number } }}
 * @throws {RangeError} if flow, resistance, or efficiencies are out of range
 */
export function selectMainFan({
    requiredFlow_m3s,
    networkResistance,
    fanEfficiency = 0.75,
    motorEfficiency = 0.92,
    safetyFactor = 1.15,
}: {
    requiredFlow_m3s?: number;
    networkResistance?: number;
    fanEfficiency?: number;
    motorEfficiency?: number;
    safetyFactor?: number;
} = {}): {
    fanPressure_Pa: number;
    shaftPower_kW: number;
    installedPower_kW: number;
    operatingPoint: { flow_m3s: number; pressure_Pa: number };
} {
    if (typeof requiredFlow_m3s !== 'number' || requiredFlow_m3s <= 0 || requiredFlow_m3s > 500) {
        throw new RangeError(`selectMainFan: requiredFlow_m3s must be in (0, 500], got ${requiredFlow_m3s}`);
    }
    if (typeof networkResistance !== 'number' || networkResistance <= 0) {
        throw new RangeError(`selectMainFan: networkResistance must be positive, got ${networkResistance}`);
    }
    if (fanEfficiency <= 0 || fanEfficiency > 1) {
        throw new RangeError(`selectMainFan: fanEfficiency must be in (0, 1], got ${fanEfficiency}`);
    }
    if (motorEfficiency <= 0 || motorEfficiency > 1) {
        throw new RangeError(`selectMainFan: motorEfficiency must be in (0, 1], got ${motorEfficiency}`);
    }

    // Design flow with safety factor
    const designFlow = requiredFlow_m3s * safetyFactor;
    // Fan static pressure = R × Q² (Pa)
    const fanPressure_Pa = networkResistance * designFlow * designFlow;
    // Shaft power = ΔP × Q / η_fan (W → kW)
    const shaftPower_kW = (fanPressure_Pa * designFlow) / (fanEfficiency * 1000);
    // Installed motor power accounting for motor efficiency
    const installedPower_kW = shaftPower_kW / motorEfficiency;

    return {
        fanPressure_Pa: Math.round(fanPressure_Pa),
        shaftPower_kW: Math.round(shaftPower_kW * 10) / 10,
        installedPower_kW: Math.round(installedPower_kW * 10) / 10,
        operatingPoint: {
            flow_m3s: Math.round(designFlow * 100) / 100,
            pressure_Pa: Math.round(fanPressure_Pa),
        },
    };
}

/**
 * Calculate annual ventilation cost and check regulatory compliance.
 * Calcula o custo anual de ventilação e verifica conformidade regulatória.
 *
 * @param {{ installedPower_kW?: number, operatingHoursPerYear?: number, energyCostKWh?: number, totalFlow_m3s?: number, pollutantLoads?: Record<string, number> }} [params]
 * @returns {{ annualCostBRL: number, compliance: Record<string, { measured: number, limit: number, ratio: number, compliant: boolean }>, recommendations: string[] }}
 * @throws {RangeError} if power or operating hours are non-positive
 */
export function calcVentilationCostCompliance({
    installedPower_kW,
    operatingHoursPerYear = 7000,
    energyCostKWh = 0.7,
    totalFlow_m3s,
    pollutantLoads = {},
}: {
    installedPower_kW?: number;
    operatingHoursPerYear?: number;
    energyCostKWh?: number;
    totalFlow_m3s?: number;
    pollutantLoads?: Record<string, number>;
} = {}): {
    annualCostBRL: number;
    compliance: Record<string, { measured: number; limit: number; ratio: number; compliant: boolean }>;
    recommendations: string[];
} {
    if (typeof installedPower_kW !== 'number' || installedPower_kW <= 0) {
        throw new RangeError(
            `calcVentilationCostCompliance: installedPower_kW must be positive, got ${installedPower_kW}`,
        );
    }
    if (operatingHoursPerYear <= 0 || operatingHoursPerYear > 8760) {
        throw new RangeError(
            `calcVentilationCostCompliance: operatingHoursPerYear must be in (0, 8760], got ${operatingHoursPerYear}`,
        );
    }

    const annualCostBRL = installedPower_kW * operatingHoursPerYear * energyCostKWh;

    // Compliance check against MSHA / ABNT NBR 15066 limits
    // Verificação de conformidade com MSHA / ABNT NBR 15066
    const compliance: Record<string, { measured: number; limit: number; ratio: number; compliant: boolean }> = {};
    const recommendations: string[] = [];

    for (const [pollutant, measured] of Object.entries(pollutantLoads)) {
        const limit = POLLUTANT_LIMITS[pollutant];
        if (limit == null) continue;
        const ratio = measured / limit;
        compliance[pollutant] = {
            measured,
            limit,
            ratio: Math.round(ratio * 100) / 100,
            compliant: ratio <= 1.0,
        };
        if (ratio > 1.0) {
            recommendations.push(
                `Increase airflow to dilute ${pollutant} — current ${measured} exceeds limit ${limit}`,
            );
        }
    }

    if (typeof totalFlow_m3s === 'number' && totalFlow_m3s < 3) {
        recommendations.push('ABNT NBR 15066: minimum 3 m³/s required per active face');
    }

    return {
        annualCostBRL: Math.round(annualCostBRL * 100) / 100,
        compliance,
        recommendations,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineVentilationDesignMeta = {
    name: 'mineVentilationDesign',
    description: 'mineVentilationDesign',
    category: 'analytics',
    familyTags: ['mining'],
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
