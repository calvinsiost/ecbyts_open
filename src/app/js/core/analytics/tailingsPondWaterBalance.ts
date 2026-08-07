// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// tailingsPondWaterBalance.js - Tailings Pond Water Balance & Risk Classification
// Balanço hídrico de bacias de rejeitos: entradas, saídas, evaporação, infiltração e risco.
// Refs: ANCOLD (2019) Guidelines on Tailings Dams; ICOLD Bulletin 121;
//       ANM Portaria 70.389/2017; FAO-56 (1998) Penman-Monteith;
//       INAP (2017) Global Cover Manual

'use strict';

interface TailingsBalanceResult { net_change_m3_day: number, water_recovery_pct: number }
interface SeepageRateResult { seepage_m3_day: number, seepage_rate_m_s: number }
interface EvaporationResult { pet_mm_day: number, actual_mm_day: number }
interface RiskResult { risk: 'low'|'moderate'|'high'|'critical', failure_modes: string[] }

/**
 * Compute daily water balance for a tailings storage facility (TSF).
 * Calcula balanço hídrico diário de uma bacia de rejeitos.
 *
 * @param {number} inflow_m3_day - Process water inflow in m³/day.
 * @param {number} process_water_return_m3_day - Reclaimed (return) water in m³/day.
 * @param {number} evaporation_mm_day - Evaporation rate in mm/day.
 * @param {number} seepage_m3_day - Seepage (percolation) loss in m³/day.
 * @param {number} area_ha - Pond surface area in hectares.
 * @param {number} precipitation_mm_day - Precipitation rate in mm/day.
 * @returns {{ net_change_m3_day: number, water_recovery_pct: number }}
 * @throws {RangeError} If area_ha <= 0 or any required numeric is negative.
 */
export function computeTailingsPondBalance(
    inflow_m3_day: number,
    process_water_return_m3_day: number,
    evaporation_mm_day: number,
    seepage_m3_day: number,
    area_ha: number,
    precipitation_mm_day: number,
): TailingsBalanceResult {
    if (typeof area_ha !== 'number' || area_ha <= 0) {
        throw new RangeError(`area_ha must be positive; got ${area_ha}`);
    }
    const args = {
        inflow_m3_day,
        process_water_return_m3_day,
        evaporation_mm_day,
        seepage_m3_day,
        precipitation_mm_day,
    };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || v < 0) throw new RangeError(`${k} must be a non-negative number; got ${v}`);
    }

    // Converter área de ha para m² e mm para m³
    const area_m2 = area_ha * 10000;
    const precip_m3_day = (precipitation_mm_day * area_m2) / 1000; // mm → m³
    const evap_m3_day = (evaporation_mm_day * area_m2) / 1000; // mm → m³

    // ΔV = Qin + Qprecip - Qevap - seepage - Qout (retorno já é saída de processo)
    const net_change_m3_day =
        inflow_m3_day + precip_m3_day - evap_m3_day - seepage_m3_day - process_water_return_m3_day;

    // Recuperação de água: porcentagem do inflow retornada ao processo
    const water_recovery_pct =
        inflow_m3_day > 0 ? Math.min(100, (process_water_return_m3_day / inflow_m3_day) * 100) : 0;

    return { net_change_m3_day, water_recovery_pct };
}

/**
 * Compute seepage rate through a pond liner using Darcy's Law.
 * Calcula taxa de infiltração através do liner de bacia de rejeitos (Lei de Darcy).
 *
 * @param {number} hydraulic_conductivity_m_s - Hydraulic conductivity of liner in m/s.
 * @param {number} pond_area_m2 - Liner area in m².
 * @param {number} head_differential_m - Hydraulic head difference across liner in m.
 * @param {number} liner_thickness_m - Liner thickness in m.
 * @returns {{ seepage_m3_day: number, seepage_rate_m_s: number }}
 * @throws {RangeError} If liner_thickness_m <= 0 or any input is negative.
 */
export function computeSeepageRate(hydraulic_conductivity_m_s: number, pond_area_m2: number, head_differential_m: number, liner_thickness_m: number): SeepageRateResult {
    if (typeof liner_thickness_m !== 'number' || liner_thickness_m <= 0) {
        throw new RangeError(`liner_thickness_m must be positive; got ${liner_thickness_m}`);
    }
    const args = { hydraulic_conductivity_m_s, pond_area_m2, head_differential_m };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || v < 0) throw new RangeError(`${k} must be non-negative; got ${v}`);
    }

    // Lei de Darcy: Q = K × A × (ΔH / L)
    const seepage_rate_m_s = hydraulic_conductivity_m_s * (head_differential_m / liner_thickness_m);
    const seepage_m3_day = seepage_rate_m_s * pond_area_m2 * 86400; // s/day

    return { seepage_m3_day, seepage_rate_m_s };
}

/**
 * Compute potential and actual evaporation from a tailings pond (Penman-Monteith FAO-56 + salinity correction).
 * Calcula evaporação potencial e real da superfície da bacia (FAO-56 + correção de salinidade).
 *
 * @param {number} net_radiation_MJ_m2_day - Net radiation at surface in MJ/m²/day.
 * @param {number} temperature_c - Mean air temperature in °C.
 * @param {number} wind_2m_m_s - Wind speed at 2m height in m/s.
 * @param {number} humidity_pct - Relative humidity in percent [0–100].
 * @param {number} salinity_ppt - Water salinity in parts-per-thousand (g/kg).
 * @returns {{ pet_mm_day: number, actual_mm_day: number }}
 * @throws {RangeError} If humidity not in [0,100] or any input is negative.
 */
export function computeEvaporationFromPond(
    net_radiation_MJ_m2_day: number,
    temperature_c: number,
    wind_2m_m_s: number,
    humidity_pct: number,
    salinity_ppt: number,
): EvaporationResult {
    if (typeof humidity_pct !== 'number' || humidity_pct < 0 || humidity_pct > 100) {
        throw new RangeError(`humidity_pct must be in [0, 100]; got ${humidity_pct}`);
    }
    const nonneg = { net_radiation_MJ_m2_day, wind_2m_m_s, salinity_ppt };
    for (const [k, v] of Object.entries(nonneg)) {
        if (typeof v !== 'number' || v < 0) throw new RangeError(`${k} must be non-negative; got ${v}`);
    }
    if (typeof temperature_c !== 'number') throw new TypeError('temperature_c must be a number');

    // Penman-Monteith FAO-56 para superfície aberta (rs=0, ra conforme vento)
    // Slope of saturation vapour pressure curve Δ (kPa/°C)
    const delta =
        (4098 * (0.6108 * Math.exp((17.27 * temperature_c) / (temperature_c + 237.3)))) / (temperature_c + 237.3) ** 2;
    // Psychrometric constant γ ≈ 0.0665 kPa/°C (altitude 0m, P=101.325kPa)
    const gamma = 0.0665;
    // Saturação do vapor (kPa)
    const es = 0.6108 * Math.exp((17.27 * temperature_c) / (temperature_c + 237.3));
    // Vapour pressure actual (kPa)
    const ea = es * (humidity_pct / 100);
    // Soil heat flux G ≈ 0 para passo diário (FAO-56 Eq 42)
    const G = 0;
    // Densidade do ar × calor específico / ra → termo aerodinâmico simplificado
    // FAO-56 Eq 6 (superfície de referência adaptada para água livre): ra = 208/u2
    // eslint-disable-next-line
    const ra_s_m = 208 / (wind_2m_m_s + 0.0001); // evitar divisão por zero
    // PET (mm/day) - Penman-Monteith para superfície de água livre (rs=0)
    const num =
        0.408 * delta * (net_radiation_MJ_m2_day - G) + gamma * (900 / (temperature_c + 273)) * wind_2m_m_s * (es - ea);
    const den = delta + gamma * (1 + 0.34 * wind_2m_m_s);
    const pet_mm_day = Math.max(0, num / den);

    // Correção de salinidade (Salhotra et al., citado em INAP 2017):
    // Ea = PET × (1 - 0.00057 × salinity_ppt)
    const salinity_factor = Math.max(0, 1 - 0.00057 * salinity_ppt);
    const actual_mm_day = pet_mm_day * salinity_factor;

    return { pet_mm_day, actual_mm_day };
}

/**
 * Classify tailings pond failure risk based on operational parameters.
 * Classifica o risco de ruptura da bacia de rejeitos com base em parâmetros operacionais.
 *
 * @param {number} water_recovery_pct - Process water recovery percentage.
 * @param {number} seepage_m3_day - Measured seepage rate in m³/day.
 * @param {number} freeboard_m - Available freeboard in metres.
 * @param {number} supernatant_volume_m3 - Volume of supernatant pond water in m³.
 * @returns {{ risk: 'low'|'moderate'|'high'|'critical', failure_modes: string[] }}
 * @throws {RangeError} If any input is negative.
 */
export function classifyTailingsPondRisk(water_recovery_pct: number, seepage_m3_day: number, freeboard_m: number, supernatant_volume_m3: number): RiskResult {
    const args = { water_recovery_pct, seepage_m3_day, freeboard_m, supernatant_volume_m3 };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || v < 0) throw new RangeError(`${k} must be non-negative; got ${v}`);
    }

    const failure_modes = [];
    // ANM Portaria 70.389/2017: freeboard mínimo 1m para bacias alteadas
    if (freeboard_m < 0.5) failure_modes.push('overtopping');
    if (seepage_m3_day > 20) failure_modes.push('piping');
    if (supernatant_volume_m3 > 100000) failure_modes.push('foundation_failure');

    let risk: 'low'|'moderate'|'high'|'critical';
    if (freeboard_m < 0.5 || seepage_m3_day > 50) {
        risk = 'critical';
    } else if (freeboard_m < 1.0 || seepage_m3_day > 20 || water_recovery_pct < 30) {
        risk = 'high';
    } else if (freeboard_m < 2.0 || seepage_m3_day > 5 || water_recovery_pct < 60) {
        risk = 'moderate';
    } else {
        risk = 'low';
    }

    return { risk, failure_modes };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tailingsPondWaterBalanceMeta = {
    name: 'tailingsPondWaterBalance',
    description: 'tailingsPondWaterBalance',
    category: 'analytics',
    familyTags: ['water'],
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
