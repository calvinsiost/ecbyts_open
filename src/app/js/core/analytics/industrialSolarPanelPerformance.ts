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
 * Industrial Solar Panel Performance Analytics
 *
 * Métricas de desempenho de painéis solares industriais.
 *
 * References:
 *   IEC 61215:2021 - Terrestrial photovoltaic (PV) modules - Design qualification and type approval.
 *   ASTM E1021-15(2019) - Standard Test Method for Spectral Responsivity Measurements of Photovoltaic Devices.
 *   INMET Solarimetric Atlas of Brazil (2017) - Instituto Nacional de Meteorologia.
 *   Jordan & Kurtz (2013). Photovoltaic Degradation Rates. Progress in Photovoltaics, 21(1), 12-29.
 *     DOI: 10.1002/pip.1182
 *
 * @module industrialSolarPanelPerformance
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

// --- Constants ---

/** Standard Test Conditions irradiance (W/m²) - IEC 61215 */
const STC_IRRADIANCE = 1000; // W/m²

/** Standard Test Conditions temperature (°C) - IEC 61215 */
const STC_TEMPERATURE = 25; // °C

// --- Helpers ---

/**
 * Validates a numeric value.
 * Valida se um valor numérico é finito e dentro de limites opcionais.
 * @param {number} v
 * @param {string} name
 * @param {number} [min]
 * @param {number} [max]
 */
function validateNum(v: number, name: string, min: number = -Infinity, max: number = Infinity): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got ${v}`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got ${v}`);
    }
}

// --- Core exports ---

/**
 * Calculates effective irradiance ratio vs STC.
 * Calcula a razão de irradiância efetiva em relação ao STC.
 *
 * @param {number} irradianceWm2 - measured plane-of-array irradiance (W/m²)
 * @returns {{ irradianceRatio: number, irradianceWm2: number, stcWm2: number }}
 */
export function computeIrradianceRatio(
    irradianceWm2: number,
): { irradianceRatio: number; irradianceWm2: number; stcWm2: number } {
    validateNum(irradianceWm2, 'irradianceWm2', 0);
    const irradianceRatio = irradianceWm2 / STC_IRRADIANCE;
    return { irradianceRatio: +irradianceRatio.toFixed(6), irradianceWm2, stcWm2: STC_IRRADIANCE };
}

/**
 * Computes DC power generated corrected for temperature and irradiance (IEC 61215).
 * Calcula a potência CC gerada corrigida por temperatura e irradiância.
 *
 * P = P_stc × (G / G_stc) × [1 + γ × (T_cell - T_stc)]
 * where γ is the temperature coefficient of power (typically -0.004 /°C for Si).
 *
 * @param {object} opts
 * @param {number} opts.pStcW         - rated power at STC (W)
 * @param {number} opts.irradianceWm2 - measured irradiance (W/m²)
 * @param {number} opts.cellTempC     - cell temperature (°C)
 * @param {number} [opts.gammaPct=-0.4] - temperature coefficient (%/°C), typically -0.3 to -0.5
 * @returns {{ dcPowerW: number, temperatureDerating: number, irradianceDerating: number }}
 */
export function computeDcPower({
    pStcW,
    irradianceWm2,
    cellTempC,
    gammaPct = -0.4,
}: {
    pStcW: number;
    irradianceWm2: number;
    cellTempC: number;
    gammaPct?: number;
}): { dcPowerW: number; temperatureDerating: number; irradianceDerating: number } {
    validateNum(pStcW, 'pStcW', 0);
    validateNum(irradianceWm2, 'irradianceWm2', 0);
    validateNum(cellTempC, 'cellTempC', -50, 100);
    validateNum(gammaPct, 'gammaPct', -5, 5);

    const irradianceDerating = irradianceWm2 / STC_IRRADIANCE;
    const gamma = gammaPct / 100; // convert %/°C to /°C
    const temperatureDerating = 1 + gamma * (cellTempC - STC_TEMPERATURE);
    const dcPowerW = pStcW * irradianceDerating * temperatureDerating;

    return {
        dcPowerW: +Math.max(0, dcPowerW).toFixed(4),
        temperatureDerating: +temperatureDerating.toFixed(6),
        irradianceDerating: +irradianceDerating.toFixed(6),
    };
}

/**
 * Computes Performance Ratio (PR%) - ratio of actual to ideal energy yield.
 * Calcula o Performance Ratio (PR%) - razão entre produção real e ideal.
 *
 * PR = E_actual / (P_stc × H_poa / G_stc)
 * where H_poa is the plane-of-array irradiation (kWh/m²).
 *
 * @param {object} opts
 * @param {number} opts.actualEnergyKwh  - measured AC energy output (kWh)
 * @param {number} opts.pStcKwp          - rated peak power (kWp)
 * @param {number} opts.irradiationKwhM2 - total plane-of-array irradiation (kWh/m²)
 * @returns {{ performanceRatioPct: number, yieldSpecificKwhKwp: number }}
 */
export function computePerformanceRatio({
    actualEnergyKwh,
    pStcKwp,
    irradiationKwhM2,
}: {
    actualEnergyKwh: number;
    pStcKwp: number;
    irradiationKwhM2: number;
}): { performanceRatioPct: number; yieldSpecificKwhKwp: number } {
    validateNum(actualEnergyKwh, 'actualEnergyKwh', 0);
    validateNum(pStcKwp, 'pStcKwp', 0.001);
    validateNum(irradiationKwhM2, 'irradiationKwhM2', 0.001);

    // Ideal yield (kWh) = P_stc (kWp) × H_poa (kWh/m²) / G_stc (kW/m²)
    // Rendimento ideal: potência nominal × irradiação total / irradiância STC
    const idealEnergyKwh = (pStcKwp * irradiationKwhM2) / (STC_IRRADIANCE / 1000);
    const performanceRatioPct = (actualEnergyKwh / idealEnergyKwh) * 100;
    const yieldSpecificKwhKwp = actualEnergyKwh / pStcKwp;

    return {
        performanceRatioPct: +performanceRatioPct.toFixed(3),
        yieldSpecificKwhKwp: +yieldSpecificKwhKwp.toFixed(3),
    };
}

/**
 * Estimates annual degradation loss and energy payback time (EPBT).
 * Estima a perda anual por degradação e o tempo de retorno energético (EPBT).
 *
 * EPBT = E_manufacturing / (E_annual_production)
 *
 * @param {object} opts
 * @param {number} opts.initialPowerW        - initial rated power (W)
 * @param {number} opts.degradationRatePctYr - annual degradation rate (%/year), typical 0.5–1.0
 * @param {number} opts.yearsInService       - years of operation
 * @param {number} opts.annualYieldKwh       - first-year annual yield (kWh)
 * @param {number} opts.embodiedEnergyKwh    - energy to manufacture (kWh)
 * @returns {{ remainingPowerW: number, cumulativeDegradationPct: number, annualLossW: number, epbtYears: number }}
 */
export function computeDegradationAndEpbt({
    initialPowerW,
    degradationRatePctYr,
    yearsInService,
    annualYieldKwh,
    embodiedEnergyKwh,
}: {
    initialPowerW: number;
    degradationRatePctYr: number;
    yearsInService: number;
    annualYieldKwh: number;
    embodiedEnergyKwh: number;
}): {
    remainingPowerW: number;
    cumulativeDegradationPct: number;
    annualLossW: number;
    epbtYears: number;
} {
    validateNum(initialPowerW, 'initialPowerW', 0);
    validateNum(degradationRatePctYr, 'degradationRatePctYr', 0, 100);
    validateNum(yearsInService, 'yearsInService', 0);
    validateNum(annualYieldKwh, 'annualYieldKwh', 0.001);
    validateNum(embodiedEnergyKwh, 'embodiedEnergyKwh', 0.001);

    const rate = degradationRatePctYr / 100;
    // Compound degradation model - Jordan & Kurtz 2013
    // Modelo de degradação composta conforme Jordan & Kurtz 2013
    const remainingPowerW = initialPowerW * Math.pow(1 - rate, yearsInService);
    const cumulativeDegradationPct = (1 - remainingPowerW / initialPowerW) * 100;
    const annualLossW = initialPowerW * rate;
    const epbtYears = embodiedEnergyKwh / annualYieldKwh;

    return {
        remainingPowerW: +remainingPowerW.toFixed(3),
        cumulativeDegradationPct: +cumulativeDegradationPct.toFixed(4),
        annualLossW: +annualLossW.toFixed(4),
        epbtYears: +epbtYears.toFixed(4),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialSolarPanelPerformanceMeta: AnalyticsModuleMeta = {
    name: 'industrialSolarPanelPerformance',
    description: 'industrialSolarPanelPerformance',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
