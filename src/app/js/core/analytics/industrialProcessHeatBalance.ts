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
 * Industrial Process Heat Balance (Balanço Térmico de Processo Industrial)
 *
 * References / Referências:
 *   - Perry, R.H. & Green, D.W. (2018). Perry's Chemical Engineers' Handbook, 9th ed.
 *     McGraw-Hill. ISBN 978-0-07-183408-7 (Sections 4, 11, 27)
 *   - Smith, J.M., Van Ness, H.C. & Abbott, M.M. (2005). Introduction to Chemical
 *     Engineering Thermodynamics, 7th ed. McGraw-Hill. ISBN 978-0-07-310445-4
 *   - Incropera, F.P. et al. (2007). Fundamentals of Heat and Mass Transfer, 6th ed.
 *     Wiley. ISBN 978-0-471-45728-2 (Newton's law of cooling, Stefan-Boltzmann)
 *
 * Pure math module - zero DOM/IDB/Three.js/fetch dependencies.
 * Módulo matemático puro - sem dependências de DOM/IDB/Three.js/fetch.
 *
 * @module industrialProcessHeatBalance
 */

/** Stefan-Boltzmann constant σ (W·m⁻²·K⁻⁴) */
const SIGMA = 5.670374419e-8;

/** Absolute zero offset (°C → K) */
const KELVIN_OFFSET = 273.15;

/**
 * Compute enthalpy of a single stream (entalpia de uma corrente).
 * H = ṁ × Cp × (T - T_ref)
 * where T_ref is typically 25°C (298.15 K) - Perry's §4-1.
 *
 * @param {number} massFlowRate - Mass flow rate ṁ (kg/s), must be > 0
 * @param {number} specificHeat - Specific heat Cp (kJ/(kg·K)), must be > 0
 * @param {number} temperature - Stream temperature T (°C)
 * @param {number} [referenceTemperature=25] - Reference temperature T_ref (°C)
 * @returns {{ enthalpyKW: number, temperatureK: number, referenceK: number }}
 *   enthalpyKW in kW (positive = above reference, negative = below)
 * @throws {RangeError} If massFlowRate or specificHeat are not positive
 * @throws {TypeError} If any argument is not a finite number
 */
export function streamEnthalpy(
    massFlowRate: number,
    specificHeat: number,
    temperature: number,
    referenceTemperature: number = 25,
): { enthalpyKW: number; temperatureK: number; referenceK: number } {
    if (
        !Number.isFinite(massFlowRate) ||
        !Number.isFinite(specificHeat) ||
        !Number.isFinite(temperature) ||
        !Number.isFinite(referenceTemperature)
    ) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (massFlowRate <= 0) {
        throw new RangeError(`massFlowRate must be > 0, got: ${massFlowRate}`);
    }
    if (specificHeat <= 0) {
        throw new RangeError(`specificHeat must be > 0, got: ${specificHeat}`);
    }

    const temperatureK = temperature + KELVIN_OFFSET;
    const referenceK = referenceTemperature + KELVIN_OFFSET;

    // H = ṁ × Cp × ΔT (resultado em kW, já que Cp em kJ/(kg·K) e ṁ em kg/s)
    const enthalpyKW = massFlowRate * specificHeat * (temperature - referenceTemperature);

    return { enthalpyKW, temperatureK, referenceK };
}

/**
 * Compute heat of reaction contribution (calor de reação ΔHr).
 * Q_rxn = ṁ_reactant × ΔHr (exothermic: ΔHr < 0, releases heat to process).
 * Per Smith 2005 §4.4 and Perry's §7-4.
 *
 * @param {number} massFlowRate - Reactant mass flow rate (kg/s), must be > 0
 * @param {number} heatOfReaction - ΔHr (kJ/kg); negative = exothermic, positive = endothermic
 * @returns {{ heatFlowKW: number, isExothermic: boolean }}
 * @throws {RangeError} If massFlowRate is not positive
 * @throws {TypeError} If arguments are not finite numbers
 */
export function reactionHeat(
    massFlowRate: number,
    heatOfReaction: number,
): { heatFlowKW: number; isExothermic: boolean } {
    if (!Number.isFinite(massFlowRate) || !Number.isFinite(heatOfReaction)) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (massFlowRate <= 0) {
        throw new RangeError(`massFlowRate must be > 0, got: ${massFlowRate}`);
    }

    // Q_rxn = ṁ × ΔHr (kW)
    const heatFlowKW = massFlowRate * heatOfReaction;
    const isExothermic = heatOfReaction < 0;

    return { heatFlowKW, isExothermic };
}

/**
 * Radiative heat loss (perda por radiação) via Stefan-Boltzmann law.
 * Q_rad = ε × σ × A × (T_s⁴ - T_amb⁴)
 * Per Incropera et al. (2007) §12.1, eq. 12.28.
 *
 * @param {number} emissivity - Surface emissivity ε (0–1)
 * @param {number} surfaceAreaM2 - Radiating surface area A (m²), must be > 0
 * @param {number} surfaceTempC - Surface temperature T_s (°C)
 * @param {number} ambientTempC - Ambient temperature T_amb (°C)
 * @returns {{ radiativeLossW: number, radiativeLossKW: number }}
 * @throws {RangeError} If emissivity is outside [0,1] or surfaceAreaM2 <= 0
 * @throws {TypeError} If arguments are not finite numbers
 */
export function radiativeLoss(
    emissivity: number,
    surfaceAreaM2: number,
    surfaceTempC: number,
    ambientTempC: number,
): { radiativeLossW: number; radiativeLossKW: number } {
    if (
        !Number.isFinite(emissivity) ||
        !Number.isFinite(surfaceAreaM2) ||
        !Number.isFinite(surfaceTempC) ||
        !Number.isFinite(ambientTempC)
    ) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (emissivity < 0 || emissivity > 1) {
        throw new RangeError(`emissivity must be in [0, 1], got: ${emissivity}`);
    }
    if (surfaceAreaM2 <= 0) {
        throw new RangeError(`surfaceAreaM2 must be > 0, got: ${surfaceAreaM2}`);
    }

    const T_s = surfaceTempC + KELVIN_OFFSET;
    const T_amb = ambientTempC + KELVIN_OFFSET;

    // Q_rad = ε × σ × A × (T_s⁴ − T_amb⁴)  [W]
    const radiativeLossW = emissivity * SIGMA * surfaceAreaM2 * (Math.pow(T_s, 4) - Math.pow(T_amb, 4));
    const radiativeLossKW = radiativeLossW / 1000;

    return { radiativeLossW, radiativeLossKW };
}

/**
 * Convective heat loss (perda por convecção) via Newton's law of cooling.
 * Q_conv = h × A × (T_s - T_f)
 * Per Incropera et al. (2007) §1.2, eq. 1.3a.
 *
 * @param {number} heatTransferCoeff - Convective heat transfer coefficient h (W/(m²·K)), must be > 0
 * @param {number} surfaceAreaM2 - Surface area A (m²), must be > 0
 * @param {number} surfaceTempC - Surface temperature T_s (°C)
 * @param {number} fluidTempC - Fluid (air/coolant) temperature T_f (°C)
 * @returns {{ convectiveLossW: number, convectiveLossKW: number }}
 * @throws {RangeError} If h or A are not positive
 * @throws {TypeError} If arguments are not finite numbers
 */
export function convectiveLoss(
    heatTransferCoeff: number,
    surfaceAreaM2: number,
    surfaceTempC: number,
    fluidTempC: number,
): { convectiveLossW: number; convectiveLossKW: number } {
    if (
        !Number.isFinite(heatTransferCoeff) ||
        !Number.isFinite(surfaceAreaM2) ||
        !Number.isFinite(surfaceTempC) ||
        !Number.isFinite(fluidTempC)
    ) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (heatTransferCoeff <= 0) {
        throw new RangeError(`heatTransferCoeff must be > 0, got: ${heatTransferCoeff}`);
    }
    if (surfaceAreaM2 <= 0) {
        throw new RangeError(`surfaceAreaM2 must be > 0, got: ${surfaceAreaM2}`);
    }

    // Q_conv = h × A × (T_s − T_f)  [W]
    const convectiveLossW = heatTransferCoeff * surfaceAreaM2 * (surfaceTempC - fluidTempC);
    const convectiveLossKW = convectiveLossW / 1000;

    return { convectiveLossW, convectiveLossKW };
}

/**
 * Energy integration index via pinch analysis (índice de integração energética / análise de pinch).
 * Estimates theoretical minimum heating/cooling utility and heat recovery potential.
 * Simplified composite curve approach - Linnhoff & Hindmarsh (1983) as cited in Perry's §27.
 *
 * @param {Array<{massFlowRate: number, specificHeat: number, tempIn: number, tempOut: number}>} hotStreams
 *   Hot streams (to be cooled): each with massFlowRate (kg/s), specificHeat (kJ/(kg·K)), tempIn, tempOut (°C)
 * @param {Array<{massFlowRate: number, specificHeat: number, tempIn: number, tempOut: number}>} coldStreams
 *   Cold streams (to be heated): same structure
 * @param {number} minimumDeltaT - Minimum temperature approach ΔT_min (°C), must be > 0
 * @returns {{ totalHotDutyKW: number, totalColdDutyKW: number, maxRecoveryKW: number, energyIntegrationIndex: number }}
 *   energyIntegrationIndex: 0 = no integration, 1 = theoretical maximum recovery
 * @throws {RangeError} If streams array is empty or minimumDeltaT <= 0
 * @throws {TypeError} If arguments have wrong types
 */
export function energyIntegrationIndex(
    hotStreams: Array<{ massFlowRate: number; specificHeat: number; tempIn: number; tempOut: number }>,
    coldStreams: Array<{ massFlowRate: number; specificHeat: number; tempIn: number; tempOut: number }>,
    minimumDeltaT: number,
): { totalHotDutyKW: number; totalColdDutyKW: number; maxRecoveryKW: number; energyIntegrationIndex: number } {
    if (!Array.isArray(hotStreams) || !Array.isArray(coldStreams)) {
        throw new TypeError('hotStreams and coldStreams must be arrays');
    }
    if (hotStreams.length === 0 || coldStreams.length === 0) {
        throw new RangeError('hotStreams and coldStreams must each have at least one entry');
    }
    if (!Number.isFinite(minimumDeltaT) || minimumDeltaT <= 0) {
        throw new RangeError(`minimumDeltaT must be > 0, got: ${minimumDeltaT}`);
    }

    /**
     * Capacidade calorífica de uma corrente: CP = ṁ × Cp (kW/K)
     * Heat capacity flow rate: CP = ṁ × Cp
     * @param {{massFlowRate: number, specificHeat: number, tempIn: number, tempOut: number}} stream
     * @returns {number}
     */
    const streamDuty = (stream: { massFlowRate: number; specificHeat: number; tempIn: number; tempOut: number }): number => {
        const { massFlowRate, specificHeat, tempIn, tempOut } = stream;
        if (!Number.isFinite(massFlowRate) || massFlowRate <= 0) throw new RangeError('massFlowRate must be > 0');
        if (!Number.isFinite(specificHeat) || specificHeat <= 0) throw new RangeError('specificHeat must be > 0');
        if (!Number.isFinite(tempIn) || !Number.isFinite(tempOut))
            throw new TypeError('tempIn and tempOut must be finite');
        return massFlowRate * specificHeat * Math.abs(tempIn - tempOut); // kW
    };

    const totalHotDutyKW = hotStreams.reduce((sum, s) => sum + streamDuty(s), 0);
    const totalColdDutyKW = coldStreams.reduce((sum, s) => sum + streamDuty(s), 0);

    // Estimativa simplificada de recuperação máxima:
    // A corrente fria pode absorver calor até onde a diferença de temperatura permite (ΔT_min).
    // Simplified pinch: maximum recovery bounded by minimum duty and temperature feasibility.
    // For a rigorous composite curve analysis, a full interval method is required.
    const theoreticalMax = Math.min(totalHotDutyKW, totalColdDutyKW);

    // Penalidade por ΔT_min elevado: quanto maior o ΔT_min, menor o aproveitamento real
    // High ΔT_min reduces practical heat recovery (simplified empirical penalty)
    const dtPenalty = Math.max(0, 1 - minimumDeltaT / 50); // 0% penalty at ΔT_min=0; ~100% at 50°C
    const maxRecoveryKW = theoreticalMax * dtPenalty;

    // Índice de integração energética: recuperação real vs. maior demanda
    const maxDuty = Math.max(totalHotDutyKW, totalColdDutyKW);
    const energyIntegrationIndex = maxDuty > 0 ? maxRecoveryKW / maxDuty : 0;

    return { totalHotDutyKW, totalColdDutyKW, maxRecoveryKW, energyIntegrationIndex };
}

/**
 * Overall thermal efficiency of a process (eficiência térmica global do processo η_th%).
 * η_th = (useful output energy) / (total input energy) × 100
 * Per Perry's §27-3.
 *
 * @param {number} usefulOutputKW - Useful energy output (kW), must be >= 0
 * @param {number} totalInputKW - Total energy input (kW), must be > 0
 * @returns {{ thermalEfficiencyPct: number, lossesKW: number }}
 * @throws {RangeError} If inputs are out of range
 * @throws {TypeError} If inputs are not finite numbers
 */
export function thermalEfficiency(
    usefulOutputKW: number,
    totalInputKW: number,
): { thermalEfficiencyPct: number; lossesKW: number } {
    if (!Number.isFinite(usefulOutputKW) || !Number.isFinite(totalInputKW)) {
        throw new TypeError('All arguments must be finite numbers');
    }
    if (usefulOutputKW < 0) {
        throw new RangeError(`usefulOutputKW must be >= 0, got: ${usefulOutputKW}`);
    }
    if (totalInputKW <= 0) {
        throw new RangeError(`totalInputKW must be > 0, got: ${totalInputKW}`);
    }
    if (usefulOutputKW > totalInputKW) {
        throw new RangeError('usefulOutputKW cannot exceed totalInputKW (energy conservation violated)');
    }

    const thermalEfficiencyPct = (usefulOutputKW / totalInputKW) * 100;
    const lossesKW = totalInputKW - usefulOutputKW;

    return { thermalEfficiencyPct, lossesKW };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialProcessHeatBalanceMeta = {
    name: 'industrialProcessHeatBalance',
    description: 'industrialProcessHeatBalance',
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
