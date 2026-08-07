// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Stormwater Runoff Quality - pollutant loads, EMC, and First Flush analysis
// Qualidade da água de escoamento pluvial - carga de poluentes, EMC e First Flush

'use strict';

interface EMCResult { emc_mg_L: number }
interface PollutantLoadResult { load_kg: number }

/**
 * Compute Event Mean Concentration (EMC) of a pollutant in stormwater runoff.
 * Calcula a Concentração Média de Evento (EMC) de um poluente no escoamento pluvial.
 *
 * EMC = pollutant_load_kg / runoff_volume_m3 × 1e6
 * (conversão kg→mg e m³→L, mantendo mg/L como unidade padrão)
 *
 * @param {number} pollutant_load_kg - Total pollutant mass exported during event (kg)
 * @param {number} runoff_volume_m3 - Total runoff volume during event (m³)
 * @returns {EMCResult} EMC in mg/L
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If runoff_volume_m3 <= 0 or pollutant_load_kg < 0
 *
 * Refs:
 *   Stahre & Urbonas (1990) Stormwater Detention, Prentice-Hall.
 *   EPA (1983) Results of the Nationwide Urban Runoff Program (NURP), EPA/832-R-83-112.
 *   Bertrand-Krajewski et al. (1998) Water Res DOI:10.1016/S0043-1354(97)00279-1
 */
export function computeEventMeanConcentration(pollutant_load_kg: number, runoff_volume_m3: number): EMCResult {
    if (!Number.isFinite(pollutant_load_kg) || !Number.isFinite(runoff_volume_m3)) {
        throw new TypeError('computeEventMeanConcentration: inputs must be finite numbers');
    }
    if (pollutant_load_kg < 0) {
        throw new RangeError('computeEventMeanConcentration: pollutant_load_kg must be >= 0');
    }
    if (runoff_volume_m3 <= 0) {
        throw new RangeError('computeEventMeanConcentration: runoff_volume_m3 must be > 0');
    }
    // 1 kg = 1e6 mg; 1 m³ = 1000 L → mg/L = kg/m³ × 1e6/1000 = kg/m³ × 1000
    // EMC (mg/L) = (load_kg × 1e6 mg/kg) / (volume_m3 × 1000 L/m³)
    const emc_mg_L = (pollutant_load_kg * 1e6) / (runoff_volume_m3 * 1000);
    return { emc_mg_L };
}

/**
 * Compute total pollutant load exported from a catchment during a rainfall event.
 * Calcula a carga total de poluente exportada de uma bacia durante um evento de chuva.
 *
 * L (kg) = A (ha) × C (adimensional) × P (mm) / 1000 (m) × EMC (mg/L) / 1e6 × 1000 (L/m³) × 10000 (m²/ha)
 * Simplificado: L = A × C × P × EMC × 0.01  [unidades conferidas]
 * Derivação: A_m2 = ha×1e4; V = A_m2 × P_m = ha×1e4×P/1e3 m³ = ha×P×10 m³
 *            load = V_L × EMC_mg_L / 1e6 = ha×P×10×1000 × EMC/1e6 = ha×P×EMC×0.01 kg
 *
 * @param {number} area_ha - Drainage area (hectares)
 * @param {number} runoff_coefficient - Rational method runoff coefficient C [0,1]
 * @param {number} rainfall_mm - Rainfall depth (mm)
 * @param {number} emc_mg_L - Event Mean Concentration (mg/L)
 * @returns {PollutantLoadResult} Total pollutant load in kg
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If any input is negative, or runoff_coefficient not in [0,1]
 *
 * Refs: EPA NURP (1983); CONAMA 357/2005.
 */
export function computePollutantLoad(area_ha: number, runoff_coefficient: number, rainfall_mm: number, emc_mg_L: number): PollutantLoadResult {
    if (
        !Number.isFinite(area_ha) ||
        !Number.isFinite(runoff_coefficient) ||
        !Number.isFinite(rainfall_mm) ||
        !Number.isFinite(emc_mg_L)
    ) {
        throw new TypeError('computePollutantLoad: all inputs must be finite numbers');
    }
    if (area_ha < 0 || rainfall_mm < 0 || emc_mg_L < 0) {
        throw new RangeError('computePollutantLoad: area_ha, rainfall_mm, and emc_mg_L must be >= 0');
    }
    if (runoff_coefficient < 0 || runoff_coefficient > 1) {
        throw new RangeError('computePollutantLoad: runoff_coefficient must be in [0, 1]');
    }
    // Carga (kg) = Área (ha) × C × Precipitação (m) × EMC (mg/L) × 1000 L/m³ × 10000 m²/ha / 1e6 mg/kg
    //            = area_ha × C × (rainfall_mm/1000) × emc_mg_L × 0.01
    const load_kg = area_ha * runoff_coefficient * (rainfall_mm / 1000) * emc_mg_L * 0.01;
    return { load_kg };
}

/**
 * Compute the First Flush ratio comparing early-event to overall event pollutant concentration.
 * Calcula o índice de First Flush comparando a concentração do início do evento com a média total.
 *
 * FF_ratio = EMC_first20% / EMC_total
 * First Flush effect confirmed when FF_ratio > 1.5 (bibliographic convention).
 *
 * @param {number} em
* @param {number} em
 */