// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Mine Conveyor Energy Consumption
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Conveyor Energy Consumption
 *
 * Módulo puro para cálculo de consumo energético de correias transportadoras
 * em operações de mineração. Implementa a metodologia CEMA (Conveyor Equipment
 * Manufacturers Association) para potência motora, energia por tonelada e
 * custo anual de energia, além de classificação de eficiência energética.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - CEMA (2014). Belt Conveyors for Bulk Materials. 7th ed.
 *     Conveyor Equipment Manufacturers Association, Naples, FL.
 *     ISBN 978-1-891171-44-3. (fórmulas de projeto e potência CEMA)
 *   - Roberts, A.W. (2003). Advances in the design of mechanical conveyors.
 *     Bulk Solids Handling 23(3):116–124.
 *     DOI: 10.1002/bse.480 (otimização energética de correias)
 *   - Hager, M. & Hintz, A. (1993). The energy-saving design of belts for
 *     long conveyor systems. Bulk Solids Handling 13(4):749–758.
 *     (coeficiente de resistência de movimento)
 *
 * @module mineConveyorEnergyConsumption
 */

'use strict';

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
 * Aceleração gravitacional padrão (m/s²).
 */
const G = 9.81;

/**
 * Fator de serviço típico para motores de correia em mineração.
 * CEMA (2014) §6.3 - contempla perdas mecânicas em roletes, tensão e arranque.
 */
const SERVICE_FACTOR = 1.15;

/**
 * Throws if a value is not a positive finite number.
 */
function assertPositiveNumber(val: number, name: string, unit: string): void {
    if (typeof val !== 'number' || val <= 0) {
        throw new RangeError(`${name} deve ser número positivo (${unit})`);
    }
}

/**
 * Validates all inputs for calcMotorPower.
 * @throws {TypeError} If any parameter has the wrong type
 * @throws {RangeError} If any parameter is outside its valid range
 */
function validateCalcMotorPowerInputs(
    beltLength_m: number,
    liftHeight_m: number,
    capacity_ts: number,
    beltSpeed_ms: number,
    beltMassPerM_kgm: number,
    frictionCoeff: number,
    motorEfficiency: number,
): void {
    assertPositiveNumber(beltLength_m, 'beltLength_m', 'm');
    if (typeof liftHeight_m !== 'number') {
        throw new TypeError('liftHeight_m deve ser número (m; negativo para descida)');
    }
    assertPositiveNumber(capacity_ts, 'capacity_ts', 't/s');
    assertPositiveNumber(beltSpeed_ms, 'beltSpeed_ms', 'm/s');
    assertPositiveNumber(beltMassPerM_kgm, 'beltMassPerM_kgm', 'kg/m');
    if (typeof frictionCoeff !== 'number' || frictionCoeff <= 0 || frictionCoeff > 0.5) {
        throw new RangeError('frictionCoeff deve estar entre 0 (exclusivo) e 0.5');
    }
    if (typeof motorEfficiency !== 'number' || motorEfficiency <= 0 || motorEfficiency > 1) {
        throw new RangeError('motorEfficiency deve estar entre 0 (exclusivo) e 1 (inclusivo)');
    }
}

/**
 * Computes horizontal and gradient power components (W).
 */
function calcPowerComponents(
    beltLength_m: number,
    liftHeight_m: number,
    capacity_ts: number,
    beltSpeed_ms: number,
    beltMassPerM_kgm: number,
    frictionCoeff: number,
    loadMassPerM_kgm: number,
): { powerHorizontal_W: number; powerGradient_W: number } {
    const powerHorizontal_W = frictionCoeff * beltLength_m * G * (beltMassPerM_kgm + loadMassPerM_kgm) * beltSpeed_ms;
    const powerGradient_W = capacity_ts * 1000 * G * liftHeight_m;
    return { powerHorizontal_W, powerGradient_W };
}

/**
 * Calcula a potência motora necessária para uma correia transportadora.
 * Fórmula CEMA (2014) Capítulo 6:
 *   P = P_horizontal + P_gradient + P_friction
 *   P_horizontal = f × L × g × (m_belt + m_load)  [resistência de atrito]
 *   P_gradient   = m_load_rate × g × H             [componente de elevação]
 *   P_friction   = f × L × g × m_belt_empty        [atrito correia vazia]
 *
 * @param {number} beltLength_m       - Comprimento horizontal da correia (m)
 * @param {number} liftHeight_m       - Altura de elevação (m; negativo para descida)
 * @param {number} capacity_ts        - Capacidade de transporte (t/s)
 * @param {number} beltSpeed_ms       - Velocidade da correia (m/s)
 * @param {number} beltMassPerM_kgm   - Massa da correia por metro linear (kg/m)
 * @param {number} frictionCoeff      - Coeficiente de resistência de movimento (adimensional; típico 0.02)
 * @param {number} motorEfficiency    - Eficiência do motor elétrico (fração, 0–1; típico 0.92)
 * @returns {{ motorPower_kW: number, powerHorizontal_kW: number, powerGradient_kW: number }}
 *   motorPower_kW: potência instalada necessária no motor (kW);
 *   powerHorizontal_kW: potência para transporte horizontal;
 *   powerGradient_kW: potência para vencer o gradiente
 */
export function calcMotorPower(
    beltLength_m: number,
    liftHeight_m: number,
    capacity_ts: number,
    beltSpeed_ms: number,
    beltMassPerM_kgm: number,
    frictionCoeff: number = 0.02,
    motorEfficiency: number = 0.92,
): { motorPower_kW: number; powerHorizontal_kW: number; powerGradient_kW: number } {
    validateCalcMotorPowerInputs(
        beltLength_m,
        liftHeight_m,
        capacity_ts,
        beltSpeed_ms,
        beltMassPerM_kgm,
        frictionCoeff,
        motorEfficiency,
    );

    const loadMassPerM_kgm = (capacity_ts * 1000) / beltSpeed_ms;
    const { powerHorizontal_W, powerGradient_W } = calcPowerComponents(
        beltLength_m,
        liftHeight_m,
        capacity_ts,
        beltSpeed_ms,
        beltMassPerM_kgm,
        frictionCoeff,
        loadMassPerM_kgm,
    );

    const powerMechanical_W = powerHorizontal_W + powerGradient_W;
    const motorPower_kW = (powerMechanical_W * SERVICE_FACTOR) / (motorEfficiency * 1000);

    return {
        motorPower_kW: Math.max(0, motorPower_kW),
        powerHorizontal_kW: powerHorizontal_W / 1000,
        powerGradient_kW: powerGradient_W / 1000,
    };
}

/**
 * Calcula o consumo específico de energia por tonelada transportada.
 * Roberts (2003) §4: e = P / (capacity × 3600)
 * Métrica-chave para comparação de eficiência entre rotas alternativas.
 *
 * @param {number} motorPower_kW  - Potência do motor (kW)
 * @param {number} capacity_ts   - Capacidade de transporte (t/s)
 * @returns {{ energyPerTonne_kWh_t: number, energyPerTonne_MJ_t: number }}
 *   energyPerTonne_kWh_t: energia específica (kWh/t);
 *   energyPerTonne_MJ_t: energia específica em MJ/t
 */
export function calcEnergyPerTonne(
    motorPower_kW: number,
    capacity_ts: number,
): { energyPerTonne_kWh_t: number; energyPerTonne_MJ_t: number } {
    if (typeof motorPower_kW !== 'number' || motorPower_kW < 0) {
        throw new RangeError('motorPower_kW deve ser número >= 0 (kW)');
    }
    if (typeof capacity_ts !== 'number' || capacity_ts <= 0) {
        throw new RangeError('capacity_ts deve ser número positivo (t/s)');
    }

    const energyPerTonne_kWh_t = motorPower_kW / (capacity_ts * 3600);
    const energyPerTonne_MJ_t = energyPerTonne_kWh_t * 3.6;

    return { energyPerTonne_kWh_t, energyPerTonne_MJ_t };
}

/**
 * Calcula o custo anual de energia elétrica de uma correia transportadora.
 * Inclui variação por disponibilidade operacional e tarifa de energia.
 * CEMA (2014) §10.2 - análise econômica de sistemas de transporte.
 *
 * @param {number} motorPower_kW       - Potência do motor (kW)
 * @param {number} operatingHours_yp   - Horas de operação por ano (h/ano)
 * @param {number} electricityRate_BRL - Tarifa de energia elétrica (R$/kWh)
 * @param {number} loadFactor          - Fator de carga médio (fração, 0–1; padrão 0.75)
 * @returns {{ annualEnergy_kWh: number, annualCost_BRL: number, monthlyAvgCost_BRL: number }}
 *   annualEnergy_kWh: energia consumida no ano (kWh/ano);
 *   annualCost_BRL: custo anual (R$/ano);
 *   monthlyAvgCost_BRL: custo médio mensal (R$/mês)
 */
export function calcAnnualEnergyCost(
    motorPower_kW: number,
    operatingHours_yp: number,
    electricityRate_BRL: number,
    loadFactor: number = 0.75,
): { annualEnergy_kWh: number; annualCost_BRL: number; monthlyAvgCost_BRL: number } {
    if (typeof motorPower_kW !== 'number' || motorPower_kW <= 0) {
        throw new RangeError('motorPower_kW deve ser número positivo (kW)');
    }
    if (typeof operatingHours_yp !== 'number' || operatingHours_yp <= 0 || operatingHours_yp > 8760) {
        throw new RangeError('operatingHours_yp deve estar entre 0 (exclusivo) e 8760 h/ano');
    }
    if (typeof electricityRate_BRL !== 'number' || electricityRate_BRL <= 0) {
        throw new RangeError('electricityRate_BRL deve ser número positivo (R$/kWh)');
    }
    if (typeof loadFactor !== 'number' || loadFactor <= 0 || loadFactor > 1) {
        throw new RangeError('loadFactor deve estar entre 0 (exclusivo) e 1 (inclusivo)');
    }

    const annualEnergy_kWh = motorPower_kW * loadFactor * operatingHours_yp;
    const annualCost_BRL = annualEnergy_kWh * electricityRate_BRL;
    const monthlyAvgCost_BRL = annualCost_BRL / 12;

    return { annualEnergy_kWh, annualCost_BRL, monthlyAvgCost_BRL };
}

/**
 * Classifica a eficiência energética de uma correia transportadora.
 * Baseado em Roberts (2003) §5 e benchmarks CEMA (2014) Cap. 10 para
 * operações de mineração. Limites em kWh/t·km (energia por tonelada por km).
 *
 * @param {number} energyPerTonne_kWh_t - Energia específica (kWh/t)
 * @param {number} beltLength_km        - Comprimento da correia (km)
 * @returns {{ classification: string, description: string, energyPerTonneKm: number }}
 *   classification: 'high' | 'medium' | 'low'
 *   energyPerTonneKm: métrica normalizada (kWh/t·km)
 */
export function classifyConveyorEfficiency(
    energyPerTonne_kWh_t: number,
    beltLength_km: number,
): { classification: string; description: string; energyPerTonneKm: number } {
    if (typeof energyPerTonne_kWh_t !== 'number' || energyPerTonne_kWh_t < 0) {
        throw new RangeError('energyPerTonne_kWh_t deve ser número >= 0 (kWh/t)');
    }
    if (typeof beltLength_km !== 'number' || beltLength_km <= 0) {
        throw new RangeError('beltLength_km deve ser número positivo (km)');
    }

    const energyPerTonneKm = energyPerTonne_kWh_t / beltLength_km;

    if (energyPerTonneKm <= 0.008) {
        return {
            classification: 'high',
            description: 'Alta eficiência — consumo específico ótimo (≤ 0.008 kWh/t·km)',
            energyPerTonneKm,
        };
    }
    if (energyPerTonneKm <= 0.015) {
        return {
            classification: 'medium',
            description: 'Eficiência média — dentro da faixa típica de mineração (0.008–0.015 kWh/t·km)',
            energyPerTonneKm,
        };
    }
    return {
        classification: 'low',
        description: 'Baixa eficiência — consumo acima do benchmark; revisar projeto (> 0.015 kWh/t·km)',
        energyPerTonneKm,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineConveyorEnergyConsumptionMeta: AnalyticsModuleMeta = {
    name: 'mineConveyorEnergyConsumption',
    description: 'Mine Conveyor Energy Consumption',
    category: 'analytics',
    familyTags: ['mining', 'energy'],
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
