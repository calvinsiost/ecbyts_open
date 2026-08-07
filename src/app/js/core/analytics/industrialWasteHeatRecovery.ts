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
 * Industrial Waste Heat Recovery Module
 *
 * Recuperação de calor residual industrial para eficiência energética e redução de emissões.
 *
 * References:
 * - Thumann, A. & Mehta, D. (2008). Handbook of Energy Audits. 8th ed. Fairmont Press. ISBN: 978-0881735277
 * - IEA (2014). Capturing the Multiple Benefits of Energy Efficiency. doi:10.1787/9789264220720-en
 * - ABNT NBR ISO 50001:2018 - Sistemas de gestão de energia
 * - Shah, R.K. & Sekulic, D.P. (2003). Fundamentals of Heat Exchanger Design. Wiley. doi:10.1002/9780470172605
 * - US DOE (2008). Waste Heat Recovery: Technology and Opportunities in US Industry.
 *   https://www.energy.gov/sites/prod/files/2014/05/f15/waste_heat_recovery.pdf
 *
 * @module industrialWasteHeatRecovery
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Temperature enthalpy classification for waste heat streams.
 * Classificação de entalpia por faixa de temperatura dos fluxos de calor residual.
 * Based on IEA 2014 and US DOE 2008.
 */
const ENTHALPY_LEVELS = {
    HIGH: { minTempC: 650, label: 'high', description: 'Alta entalpia — acima de 650°C (fornos, gaseificadores)' },
    MEDIUM: {
        minTempC: 230,
        label: 'medium',
        description: 'Média entalpia — 230–650°C (gases de exaustão, caldeiras)',
    },
    LOW: {
        minTempC: 50,
        label: 'low',
        description: 'Baixa entalpia — 50–230°C (vapor de escape, água de resfriamento)',
    },
    VERY_LOW: { minTempC: 0, label: 'very_low', description: 'Muito baixa entalpia — abaixo de 50°C (calor ambiente)' },
};

/**
 * CO2 emission factors by fuel type (kgCO2/GJ) - IPCC 2006 National GHG Inventories
 * Fatores de emissão de CO2 por tipo de combustível (kgCO2/GJ)
 */
const CO2_FACTORS_KG_PER_GJ: Record<string, number> = {
    natural_gas: 56.1,
    diesel: 74.1,
    coal: 98.3,
    fuel_oil: 77.4,
    biomass: 0, // neutro no ciclo de carbono (IPCC 2006 Vol. 2 Ch. 2)
};

// CO2 standard reference kept for documentation only (kgCO2/GJ natural gas)
// Retained as module-level constant for future external consumers

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that a value is a finite number within a range.
 * Valida que o valor é um número finito dentro de uma faixa.
 * @param {*} v @param {string} name @param {number} min @param {number} max
 */
function requireInRange(v: unknown, name: string, min: number, max: number): void {
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
        throw new RangeError(`${name} must be between ${min} and ${max}, got: ${v}`);
    }
}

/**
 * Validates that a value is a finite positive number.
 * Valida que o valor é positivo e finito.
 * @param {*} v @param {string} name
 */
function requirePositive(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got: ${v}`);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Classifies a waste heat stream by enthalpy level and estimates recoverable heat potential.
 * Classifica fluxo de calor residual por nível de entalpia e estima o potencial recuperável.
 *
 * Q_recoverable = m_dot × Cp × (T_in - T_min_useful) × η_system
 * Onde T_min_useful é a temperatura mínima utilizável (pinch point).
 *
 * @param {number} massFlowKgPerS - Vazão mássica do fluxo (kg/s)
 * @param {number} specificHeatKjPerKgK - Calor específico do fluido (kJ/kg·K)
 * @param {number} inletTempC - Temperatura de entrada do fluxo de calor residual (°C)
 * @param {number} pinchTempC - Temperatura mínima utilizável / pinch point (°C)
 * @param {number} [systemEfficiency=0.75] - Eficiência do sistema de recuperação [0,1]
 * @returns {{ recoverableHeatKw: number, enthalpyLevel: string, annualEnergyGj: number }}
 */
export function classifyAndEstimateRecoverableHeat(
    massFlowKgPerS: number,
    specificHeatKjPerKgK: number,
    inletTempC: number,
    pinchTempC: number,
    systemEfficiency = 0.75,
): { recoverableHeatKw: number; enthalpyLevel: string; annualEnergyGj: number } {
    requirePositive(massFlowKgPerS, 'massFlowKgPerS');
    requirePositive(specificHeatKjPerKgK, 'specificHeatKjPerKgK');
    if (typeof inletTempC !== 'number' || !isFinite(inletTempC)) {
        throw new TypeError('inletTempC must be a finite number');
    }
    if (typeof pinchTempC !== 'number' || !isFinite(pinchTempC)) {
        throw new TypeError('pinchTempC must be a finite number');
    }
    if (inletTempC <= pinchTempC) {
        throw new RangeError('inletTempC must be greater than pinchTempC');
    }
    requireInRange(systemEfficiency, 'systemEfficiency', 0.01, 1.0);

    // Q = m_dot × Cp × ΔT × η  (resultado em kW, pois kJ/s = kW)
    const deltaT = inletTempC - pinchTempC;
    const recoverableHeatKw = massFlowKgPerS * specificHeatKjPerKgK * deltaT * systemEfficiency;

    // Energia anual recuperável (GJ) assumindo operação contínua (8760 h/ano)
    const annualEnergyGj = (recoverableHeatKw * 8760 * 3600) / 1e6;

    // Classificação por nível de entalpia com base na temperatura de entrada
    let enthalpyLevel: string;
    if (inletTempC >= ENTHALPY_LEVELS.HIGH.minTempC) enthalpyLevel = 'high';
    else if (inletTempC >= ENTHALPY_LEVELS.MEDIUM.minTempC) enthalpyLevel = 'medium';
    else if (inletTempC >= ENTHALPY_LEVELS.LOW.minTempC) enthalpyLevel = 'low';
    else enthalpyLevel = 'very_low';

    return { recoverableHeatKw, enthalpyLevel, annualEnergyGj };
}

/**
 * Calculates NTU-effectiveness for a counterflow heat exchanger.
 * Calcula a efetividade pelo método NTU para trocador de calor a contracorrente.
 *
 * Para contracorrente: ε = (1 - exp(-NTU(1-Cr))) / (1 - Cr·exp(-NTU(1-Cr)))
 * Caso especial Cr=1: ε = NTU / (1 + NTU)
 * Referência: Shah & Sekulic (2003), Eq. 3.75.
 *
 * @param {number} ntu - Number of Transfer Units (adimensional) - NTU = UA / C_min
 * @param {number} capacityRatio - Razão de capacidades Cr = C_min / C_max [0,1]
 * @returns {{ effectiveness: number, ntu: number, capacityRatio: number }}
 */
export function calcNtuEffectiveness(
    ntu: number,
    capacityRatio: number,
): { effectiveness: number; ntu: number; capacityRatio: number } {
    requirePositive(ntu, 'ntu');
    requireInRange(capacityRatio, 'capacityRatio', 0, 1);

    let effectiveness: number;
    if (Math.abs(capacityRatio - 1) < 1e-10) {
        // Caso especial: fluxos com capacidades iguais
        effectiveness = ntu / (1 + ntu);
    } else {
        const cr = capacityRatio;
        const exp = Math.exp(-ntu * (1 - cr));
        effectiveness = (1 - exp) / (1 - cr * exp);
    }

    // Clamp para [0, 1] para evitar erros de ponto flutuante
    effectiveness = Math.min(1, Math.max(0, effectiveness));

    return { effectiveness, ntu, capacityRatio };
}

/**
 * Estimates simple payback period for a heat recovery investment.
 * Estima o tempo de retorno simples (payback) de um investimento em recuperação de calor.
 *
 * Payback = CAPEX / (energia_recuperada_anual × preço_energia - OPEX_anual)
 *
 * @param {number} capexUsd - Custo de capital do sistema de recuperação (USD)
 * @param {number} annualEnergyGj - Energia recuperada por ano (GJ/ano)
 * @param {number} energyPriceUsdPerGj - Preço da energia substituída (USD/GJ)
 * @param {number} [annualOpexUsd=0] - Custo operacional anual do sistema (USD/ano)
 * @returns {{ paybackYears: number, annualSavingsUsd: number, roi5YearPercent: number }}
 */
export function estimatePaybackPeriod(
    capexUsd: number,
    annualEnergyGj: number,
    energyPriceUsdPerGj: number,
    annualOpexUsd = 0,
): { paybackYears: number; annualSavingsUsd: number; roi5YearPercent: number } {
    requirePositive(capexUsd, 'capexUsd');
    requirePositive(annualEnergyGj, 'annualEnergyGj');
    requirePositive(energyPriceUsdPerGj, 'energyPriceUsdPerGj');
    if (typeof annualOpexUsd !== 'number' || !isFinite(annualOpexUsd) || annualOpexUsd < 0) {
        throw new RangeError('annualOpexUsd must be >= 0');
    }

    // Economia anual = receita de energia recuperada - custos operacionais
    const annualSavingsUsd = annualEnergyGj * energyPriceUsdPerGj - annualOpexUsd;

    if (annualSavingsUsd <= 0) {
        return { paybackYears: Infinity, annualSavingsUsd, roi5YearPercent: -100 };
    }

    const paybackYears = capexUsd / annualSavingsUsd;

    // ROI em 5 anos = (economia total 5 anos - CAPEX) / CAPEX × 100
    const roi5YearPercent = ((annualSavingsUsd * 5 - capexUsd) / capexUsd) * 100;

    return { paybackYears, annualSavingsUsd, roi5YearPercent };
}

/**
 * Calculates avoided CO2 emissions from waste heat recovery.
 * Calcula emissões de CO2 evitadas pela recuperação de calor residual.
 *
 * CO2_evitado = energia_recuperada × fator_emissão_combustível_substituído
 *
 * @param {number} annualEnergyGj - Energia recuperada por ano (GJ/ano)
 * @param {'natural_gas'|'diesel'|'coal'|'fuel_oil'|'biomass'} fuelType - Combustível substituído
 * @returns {{ avoidedCo2TonPerYear: number, fuelType: string, emissionFactorKgPerGj: number, opportunityClass: string }}
 */
export function calculateAvoidedCo2Emissions(
    annualEnergyGj: number,
    fuelType: 'natural_gas' | 'diesel' | 'coal' | 'fuel_oil' | 'biomass',
): { avoidedCo2TonPerYear: number; fuelType: string; emissionFactorKgPerGj: number; opportunityClass: string } {
    requirePositive(annualEnergyGj, 'annualEnergyGj');
    if (!Object.prototype.hasOwnProperty.call(CO2_FACTORS_KG_PER_GJ, fuelType)) {
        throw new TypeError(`fuelType must be one of: ${Object.keys(CO2_FACTORS_KG_PER_GJ).join(', ')}`);
    }

    const emissionFactorKgPerGj = CO2_FACTORS_KG_PER_GJ[fuelType]!;
    // CO2 evitado em toneladas por ano
    const avoidedCo2TonPerYear = (annualEnergyGj * emissionFactorKgPerGj) / 1000;

    // Classificação de oportunidade baseada na energia recuperada
    let opportunityClass: string;
    if (annualEnergyGj > 100)
        opportunityClass = 'high'; // > 100 GJ/ano → alto potencial
    else if (annualEnergyGj > 10)
        opportunityClass = 'medium'; // 10–100 GJ/ano → médio potencial
    else opportunityClass = 'low'; // < 10 GJ/ano → baixo potencial

    return { avoidedCo2TonPerYear, fuelType, emissionFactorKgPerGj, opportunityClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialWasteHeatRecoveryMeta: AnalyticsModuleMeta = {
    name: 'industrialWasteHeatRecovery',
    description: 'industrialWasteHeatRecovery',
    category: 'analytics',
    familyTags: ['industrial', 'waste'],
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
