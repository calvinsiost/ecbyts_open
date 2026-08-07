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
 * @fileoverview Industrial Boiler Efficiency - Pure scientific analytics module.
 *
 * Implements the indirect (heat loss) method for boiler efficiency calculation.
 *
 * Academic and regulatory references:
 * - ASME PTC 4:2013 - Fired Steam Generators Performance Test Codes
 * - ABNT NBR 12316:1990 - Caldeiras a vapor: determinacao do rendimento pelo metodo indireto
 * - Babcock & Wilcox (2005). Steam: Its Generation and Use. 41st ed. ISBN 978-0963457028
 * - CONAMA Resolution 382/2006 - Emission limits for stationary combustion sources, Brazil.
 * - Turns, S.R. (2012). An Introduction to Combustion. 3rd ed. McGraw-Hill. ISBN 978-0073380193
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * @module industrialBoilerEfficiency
 */

// ---------------------------------------------------------------------------
// Flue Gas Heat Loss (Stack Loss)
// Perda de calor nos gases de exaustao (perda na chamine)
// ---------------------------------------------------------------------------

/**
 * Calculate the heat loss in flue gas (stack loss) using the indirect method.
 * Calcula a perda de calor nos gases de exaustao pelo metodo indireto.
 *
 * Based on Siegert formula (ASME PTC 4:2013 §5.5):
 *   L_flue (%) = A_f * (T_stack - T_ambient) / (CO2% + CO%)
 *
 * Where A_f is the fuel-specific Siegert factor:
 *   Natural gas: A_f ≈ 0.63
 *   Fuel oil:    A_f ≈ 0.68
 *   Coal:        A_f ≈ 0.65 (bituminous)
 *
 * @param {number} stackTemperature - Flue gas temperature at stack exit (°C), > ambient
 * @param {number} ambientTemperature - Combustion air inlet temperature (°C)
 * @param {number} co2Percent - CO₂ concentration in flue gas (% by volume), > 0
 * @param {number} [coPercent=0] - CO concentration in flue gas (% by volume), >= 0
 * @param {'natural_gas'|'fuel_oil'|'coal'|'biomass'} [fuelType='natural_gas'] - Fuel type
 * @returns {{ stackLossPercent: number, siegertFactor: number }}
 * @throws {RangeError} if temperatures or concentrations are out of valid range
 * @throws {TypeError} if inputs are not finite numbers or fuelType is invalid
 */
export function calculateStackLoss(
    stackTemperature: number,
    ambientTemperature: number,
    co2Percent: number,
    coPercent: number = 0,
    fuelType: 'natural_gas' | 'fuel_oil' | 'coal' | 'biomass' = 'natural_gas',
): { stackLossPercent: number; siegertFactor: number } {
    // Fatores de Siegert por tipo de combustivel (ASME PTC 4:2013 Tabela 5.5-1)
    const SIEGERT_FACTORS: Record<string, number> = {
        natural_gas: 0.63,
        fuel_oil: 0.68,
        coal: 0.65,
        biomass: 0.62,
    };

    for (const [k, v] of [
        ['stackTemperature', stackTemperature],
        ['ambientTemperature', ambientTemperature],
        ['co2Percent', co2Percent],
        ['coPercent', coPercent],
    ] as Array<[string, number]>) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateStackLoss: '${k}' must be a finite number`);
        }
    }
    if (!Object.keys(SIEGERT_FACTORS).includes(fuelType)) {
        throw new TypeError(`calculateStackLoss: fuelType must be one of ${Object.keys(SIEGERT_FACTORS).join(', ')}`);
    }
    if (stackTemperature <= ambientTemperature) {
        throw new RangeError('stackTemperature must be greater than ambientTemperature');
    }
    if (co2Percent <= 0 || co2Percent > 21) {
        throw new RangeError('co2Percent must be in (0, 21]');
    }
    if (coPercent < 0 || coPercent > 5) {
        throw new RangeError('coPercent must be in [0, 5]');
    }

    const siegertFactor = SIEGERT_FACTORS[fuelType]!;
    // Perda de calor nos gases - formula de Siegert
    const stackLossPercent = (siegertFactor * (stackTemperature - ambientTemperature)) / (co2Percent + coPercent);

    return { stackLossPercent, siegertFactor };
}

// ---------------------------------------------------------------------------
// Gross Boiler Efficiency (Indirect Method)
// Eficiencia bruta da caldeira pelo metodo indireto (ASME PTC 4, §5.1)
// ---------------------------------------------------------------------------

/**
 * Calculate gross boiler efficiency by indirect (heat loss) method.
 * Calcula a eficiencia bruta da caldeira pelo metodo das perdas (indireto).
 *
 * η_b = 100% - Σ(heat losses %)
 * Losses considered:
 *   1. Stack loss (flue gas sensible heat)
 *   2. Moisture in fuel combustion loss
 *   3. Incomplete combustion (CO) loss
 *   4. Radiation + convection loss (default 0.5%)
 *
 * ASME PTC 4:2013 §5.5; ABNT NBR 12316:1990 §6
 *
 * @param {number} stackLossPercent - Flue gas heat loss (%), >= 0
 * @param {number} moistureLossPercent - Moisture in fuel + H₂ combustion loss (%), >= 0
 * @param {number} [incompleteCombustionLoss=0] - Unburned CO/carbon loss (%), >= 0
 * @param {number} [radiationLossPercent=0.5] - Radiation + convection loss (%), >= 0
 * @returns {{ grossEfficiencyPercent: number, totalLossPercent: number,
 *             lossBreakdown: Record<string, number> }}
 * @throws {RangeError} if any loss is negative or total losses exceed 100%
 * @throws {TypeError} if inputs are not finite numbers
 */
export function calculateBoilerEfficiency(
    stackLossPercent: number,
    moistureLossPercent: number,
    incompleteCombustionLoss: number = 0,
    radiationLossPercent: number = 0.5,
): { grossEfficiencyPercent: number; totalLossPercent: number; lossBreakdown: Record<string, number> } {
    const losses: Record<string, number> = { stackLossPercent, moistureLossPercent, incompleteCombustionLoss, radiationLossPercent };
    for (const [k, v] of Object.entries(losses)) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateBoilerEfficiency: '${k}' must be a finite number`);
        }
        if (v < 0) throw new RangeError(`calculateBoilerEfficiency: '${k}' must be >= 0`);
    }

    const totalLossPercent = stackLossPercent + moistureLossPercent + incompleteCombustionLoss + radiationLossPercent;

    if (totalLossPercent >= 100) {
        throw new RangeError('Total heat losses must be < 100% (physically impossible boiler)');
    }

    // Eficiencia bruta = 100% - perdas totais
    const grossEfficiencyPercent = 100 - totalLossPercent;

    return {
        grossEfficiencyPercent,
        totalLossPercent,
        lossBreakdown: {
            stack: stackLossPercent,
            moisture: moistureLossPercent,
            incompleteCombustion: incompleteCombustionLoss,
            radiation: radiationLossPercent,
        },
    };
}

// ---------------------------------------------------------------------------
// Specific CO₂ Emissions per GJ
// Emissoes especificas de CO2 por GJ de energia util gerada
// ---------------------------------------------------------------------------

/**
 * Calculate specific CO₂ emissions per GJ of useful heat output.
 * Calcula as emissoes especificas de CO2 por GJ de calor util gerado.
 *
 * e_CO2 = EF_CO2 / η_b
 * Where EF_CO2 is the fuel emission factor (kg CO₂/GJ, LHV basis).
 *
 * Default emission factors from IPCC 2006 Guidelines for National GHG Inventories, Vol. 2, Ch. 1:
 *   Natural gas: 56.1 kg CO₂/GJ
 *   Fuel oil:    77.4 kg CO₂/GJ
 *   Coal (bituminous): 94.6 kg CO₂/GJ
 *   Biomass: 112.0 kg CO₂/GJ (biogenic - net zero for LCA purposes)
 *
 * @param {number} boilerEfficiencyPercent - Gross boiler efficiency (%), > 0 and <= 100
 * @param {'natural_gas'|'fuel_oil'|'coal'|'biomass'} [fuelType='natural_gas'] - Fuel type
 * @param {number | null} [customEmissionFactor=null] - Custom EF (kg CO₂/GJ LHV), overrides default if provided
 * @returns {{ specificCO2_kgPerGJ: number, emissionFactor_kgPerGJ: number, fuelType: string }}
 * @throws {RangeError} if efficiency is out of (0, 100]
 * @throws {TypeError} if efficiency is not a finite number
 */
export function calculateSpecificCO2Emissions(
    boilerEfficiencyPercent: number,
    fuelType: 'natural_gas' | 'fuel_oil' | 'coal' | 'biomass' = 'natural_gas',
    customEmissionFactor: number | null = null,
): { specificCO2_kgPerGJ: number; emissionFactor_kgPerGJ: number; fuelType: string } {
    // Fatores de emissao IPCC 2006 Vol. 2 Cap. 1 Tabela 1.4 (kg CO2/GJ, PCI)
    const IPCC_EF: Record<string, number> = {
        natural_gas: 56.1,
        fuel_oil: 77.4,
        coal: 94.6,
        biomass: 112.0,
    };

    if (typeof boilerEfficiencyPercent !== 'number' || !isFinite(boilerEfficiencyPercent)) {
        throw new TypeError('calculateSpecificCO2Emissions: boilerEfficiencyPercent must be a finite number');
    }
    if (boilerEfficiencyPercent <= 0 || boilerEfficiencyPercent > 100) {
        throw new RangeError('boilerEfficiencyPercent must be in (0, 100]');
    }
    if (!Object.keys(IPCC_EF).includes(fuelType)) {
        throw new TypeError(
            `calculateSpecificCO2Emissions: fuelType must be one of ${Object.keys(IPCC_EF).join(', ')}`,
        );
    }
    if (customEmissionFactor !== null) {
        if (typeof customEmissionFactor !== 'number' || !isFinite(customEmissionFactor) || customEmissionFactor <= 0) {
            throw new RangeError('customEmissionFactor must be a positive finite number');
        }
    }

    const emissionFactor_kgPerGJ = customEmissionFactor !== null ? customEmissionFactor : IPCC_EF[fuelType]!;

    // Emissoes especificas por GJ util = fator de emissao / eficiencia (fracional)
    const specificCO2_kgPerGJ = emissionFactor_kgPerGJ / (boilerEfficiencyPercent / 100);

    return { specificCO2_kgPerGJ, emissionFactor_kgPerGJ, fuelType };
}

// ---------------------------------------------------------------------------
// CONAMA 382/2006 Emission Compliance Check
// Conformidade com limites de emissao (CONAMA 382/2006 Tabela 1)
// ---------------------------------------------------------------------------

type PollutantType = 'SO2' | 'NOx' | 'PM' | 'CO';

/**
 * Check boiler flue gas emission compliance with CONAMA Resolution 382/2006.
 * Verifica conformidade das emissoes da caldeira com a Resolucao CONAMA 382/2006.
 *
 * CONAMA 382/2006 - Limites para caldeiras a vapor (fonte estacionaria de combustao):
 *   SO₂: 2500 mg/Nm³  (> 70 MW input or oil-fired)
 *   NOx: 500  mg/Nm³  (after 2014)
 *   PM:  250  mg/Nm³  (solid fuels); 150 mg/Nm³ (liquid fuels)
 *   CO:  200  mg/Nm³  (reference value - not legally binding in BR)
 *
 * Reference O₂ correction: 7% O₂ (dry basis) per CONAMA 382 §4.
 *
 * @param {Record<PollutantType, number>} emissions - Measured concentrations at stack (mg/Nm³)
 * @param {'solid'|'liquid'|'gaseous'} number> - Fuel phase (determines PM limit)
 * @returns {{ compliant: boolean, results: Record<PollutantType, { value: number, limit: number, compliant: boolean }> }}
 * @throws {TypeError} if emissions is not an object or fuelPhase is invalid
 * @throws {RangeError} if any emission value is negative
 */
export function checkCONAMA382Compliance(
    emissions: Record<PollutantType, number>,
    fuelPhase: 'solid' | 'liquid' | 'gaseous' = 'liquid',
): { compliant: boolean; results: Record<string, { value: number; limit: number; compliant: boolean }> } {
    const validPhases = ['solid', 'liquid', 'gaseous'];
    if (!validPhases.includes(fuelPhase)) {
        throw new TypeError(`checkCONAMA382Compliance: fuelPhase must be one of ${validPhases.join(', ')}`);
    }
    if (typeof emissions !== 'object' || emissions === null || Array.isArray(emissions)) {
        throw new TypeError('checkCONAMA382Compliance: emissions must be a plain object');
    }

    // Limites CONAMA 382/2006 Tabela 1 (mg/Nm3, base seca, 7% O2)
    const limits: Record<string, number> = {
        SO2: 2500,
        NOx: 500,
        PM: fuelPhase === 'solid' ? 250 : 150,
        CO: 200, // valor de referencia
    };

    const results: Record<string, { value: number; limit: number; compliant: boolean }> = {};
    let compliant = true;

    for (const [pollutant, limit] of Object.entries(limits)) {
        if (!(pollutant in emissions)) continue;
        const value = (emissions as Record<string, number>)[pollutant];
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new TypeError(`checkCONAMA382Compliance: emission value for '${pollutant}' must be a finite number`);
        }
        if (value < 0) {
            throw new RangeError(`checkCONAMA382Compliance: emission value for '${pollutant}' must be >= 0`);
        }
        const pollutantCompliant = value <= limit;
        if (!pollutantCompliant) compliant = false;
        results[pollutant] = { value, limit, compliant: pollutantCompliant };
    }

    return { compliant, results };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialBoilerEfficiencyMeta = {
    name: 'industrialBoilerEfficiency',
    description: 'industrialBoilerEfficiency',
    category: 'analytics',
    familyTags: ['industrial', 'hydrocarbon'],
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
