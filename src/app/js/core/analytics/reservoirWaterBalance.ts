// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Reservoir Water Balance - Hydrological analysis of reservoir inflows,
 * outflows, evaporation, precipitation, and residence time.
 *
 * Balanço hídrico de reservatórios - análise hidrológica de entradas,
 * saídas, evaporação, precipitação e tempo de residência.
 *
 * References / Referências:
 * - FAO (1998) Crop Evapotranspiration - Irrigation and Drainage Paper 56
 *   (Allen et al., doi:10.1016/j.agrformet.2011.06.010 for validation)
 * - Carlson, R.E. (1977) A trophic state index for lakes.
 *   Limnol. Oceanogr. 22(2):361-369
 * - ANA (2019) Conjuntura dos Recursos Hídricos no Brasil
 * - CONAMA 357/2005 - classificação de corpos d'água
 */
'use strict';

const SECONDS_PER_DAY = 86400;
const PSYCHROMETRIC_CONST = 0.066; // γ (kPa/°C) — constante psicrométrica

interface WaterBalanceResult { net_m3_s: number; storage_change_m3_day: number; }
interface ResidenceTimeResult { residence_days: number; residence_years: number; }
interface EvaporationLossResult { pet_mm_day: number; }
interface HealthResult { health: string; risk: string; }

/**
 * Compute reservoir water balance over one day.
 * Calcula o balanço hídrico diário do reservatório.
 *
 * ΔS = (Qin - Qout + P×A - E×A) × 86400
 *
 * @param {number} inflow_m3_s       - Inflow rate (m³/s) / Vazão de entrada
 * @param {number} outflow_m3_s      - Outflow rate (m³/s) / Vazão de saída
 * @param {number} evaporation_mm_day - Evaporation depth (mm/day) / Evaporação
 * @param {number} precipitation_mm_day - Precipitation depth (mm/day) / Precipitação
 * @param {number} area_m2           - Water surface area (m²) / Área superficial
 * @returns {{ net_m3_s: number, storage_change_m3_day: number }}
 */
export function computeWaterBalance(inflow_m3_s: number, outflow_m3_s: number, evaporation_mm_day: number, precipitation_mm_day: number, area_m2: number): WaterBalanceResult {
    if (
        typeof inflow_m3_s !== 'number' ||
        typeof outflow_m3_s !== 'number' ||
        typeof evaporation_mm_day !== 'number' ||
        typeof precipitation_mm_day !== 'number' ||
        typeof area_m2 !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (inflow_m3_s < 0) throw new RangeError('inflow_m3_s must be >= 0');
    if (outflow_m3_s < 0) throw new RangeError('outflow_m3_s must be >= 0');
    if (evaporation_mm_day < 0) throw new RangeError('evaporation_mm_day must be >= 0');
    if (precipitation_mm_day < 0) throw new RangeError('precipitation_mm_day must be >= 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');

    // Converter mm/dia → m/dia, depois m³/s equivalente via área
    // Convert mm/day → m/day, then to volumetric flux using surface area
    const evap_m3_s = ((evaporation_mm_day / 1000) * area_m2) / SECONDS_PER_DAY;
    const prec_m3_s = ((precipitation_mm_day / 1000) * area_m2) / SECONDS_PER_DAY;

    const net_m3_s = inflow_m3_s - outflow_m3_s + prec_m3_s - evap_m3_s;
    const storage_change_m3_day = net_m3_s * SECONDS_PER_DAY;

    return { net_m3_s, storage_change_m3_day };
}

/**
 * Compute hydraulic residence time of a reservoir.
 * Calcula o tempo de residência hidráulico do reservatório.
 *
 * τ = V / Q  (Chapra, Surface Water Quality Modeling, 1997)
 *
 * @param {number} volume_m3   - Reservoir volume (m³) / Volume do reservatório
 * @param {number} inflow_m3_s - Inflow rate (m³/s) / Vazão de entrada
 * @returns {{ residence_days: number, residence_years: number }}
 */
export function computeResidenceTime(volume_m3: number, inflow_m3_s: number): ResidenceTimeResult {
    if (typeof volume_m3 !== 'number' || typeof inflow_m3_s !== 'number') {
        throw new TypeError('volume_m3 and inflow_m3_s must be numbers');
    }
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (inflow_m3_s <= 0) throw new RangeError('inflow_m3_s must be > 0 (cannot divide by zero)');

    const residence_seconds = volume_m3 / inflow_m3_s;
    const residence_days = residence_seconds / SECONDS_PER_DAY;
    const residence_years = residence_days / 365.25;

    return { residence_days, residence_years };
}

/**
 * Compute potential evapotranspiration using the FAO-56 Penman-Monteith equation.
 * Calcula a evapotranspiração potencial pelo método Penman-Monteith (FAO-56).
 *
 * PET = (0.408×Δ×Rn + γ×[900/(T+273)]×u2×(es-ea)) / (Δ + γ×(1+0.34×u2))
 *
 * @param {number} net_radiation_MJ_m2_day - Net radiation (MJ/m²/day) / Radiação líquida
 * @param {number} temperature_c           - Mean temperature (°C) / Temperatura média
 * @param {number} wind_speed_m_s          - Wind speed at 2m height (m/s) / Velocidade do vento
 * @param {number} humidity_pct            - Relative humidity (%) / Umidade relativa
 * @returns {{ pet_mm_day: number }}
 */
export function computeEvaporationLoss(net_radiation_MJ_m2_day: number, temperature_c: number, wind_speed_m_s: number, humidity_pct: number): EvaporationLossResult {
    if ([net_radiation_MJ_m2_day, temperature_c, wind_speed_m_s, humidity_pct].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (net_radiation_MJ_m2_day < 0) throw new RangeError('net_radiation_MJ_m2_day must be >= 0');
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
    if (humidity_pct < 0 || humidity_pct > 100) {
        throw new RangeError('humidity_pct must be in [0, 100]');
    }

    const T = temperature_c;
    // Saturation vapor pressure (kPa) / Pressão de vapor de saturação
    const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
    // Actual vapor pressure / Pressão de vapor atual
    const ea = es * (humidity_pct / 100);
    // Slope of saturation vapor pressure curve (kPa/°C) / Inclinação da curva de pressão de vapor
    const delta = (4098 * es) / Math.pow(T + 237.3, 2);
    const gamma = PSYCHROMETRIC_CONST;
    const u2 = wind_speed_m_s;
    const Rn = net_radiation_MJ_m2_day;

    const numerator = 0.408 * delta * Rn + gamma * (900 / (T + 273)) * u2 * (es - ea);
    const denominator = delta + gamma * (1 + 0.34 * u2);

    const pet_mm_day = Math.max(0, numerator / denominator);

    return { pet_mm_day };
}

/**
 * Classify reservoir trophic health based on TSI and residence time.
 * Classifica a saúde trófica do reservatório usando o Índice de Estado Trófico de Carlson (1977).
 *
 * TSI < 40: oligotrófico | 40-50: mesotrófico | 50-70: eutrófico | >70: hipereutrófico
 *
 * @param {number} residence_days   - Hydraulic residence time (days) / Tempo de residência
 * @param {number} trophic_state_tsi - Carlson TSI (dimensionless) / Índice de estado trófico
 * @returns {{ health: string, risk: string }}
 */
export function classifyReservoirHealth(residence_days: number, trophic_state_tsi: number): HealthResult {
    if (typeof residence_days !== 'number' || typeof trophic_state_tsi !== 'number') {
        throw new TypeError('residence_days and trophic_state_tsi must be numbers');
    }
    if (residence_days <= 0) throw new RangeError('residence_days must be > 0');
    if (trophic_state_tsi < 0) throw new RangeError('trophic_state_tsi must be >= 0');

    let health: string;
    if (trophic_state_tsi < 40) {
        health = 'oligotrophic';
    } else if (trophic_state_tsi < 50) {
        health = 'mesotrophic';
    } else if (trophic_state_tsi < 70) {
        health = 'eutrophic';
    } else {
        health = 'hypereutrophic';
    }

    // Risco combinado: estado trófico + tempo de residência curto intensifica problemas
    // Combined risk: trophic state + short residence time worsens algal bloom potential
    let risk: string;
    const shortResidence = residence_days < 30;
    if (health === 'oligotrophic') {
        risk = shortResidence ? 'low' : 'minimal';
    } else if (health === 'mesotrophic') {
        risk = shortResidence ? 'moderate' : 'low';
    } else if (health === 'eutrophic') {
        risk = shortResidence ? 'high' : 'moderate';
    } else {
        risk = shortResidence ? 'critical' : 'high';
    }

    return { health, risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const reservoirWaterBalanceMeta = {
    name: 'reservoirWaterBalance',
    description: 'reservoirWaterBalance',
    category: 'analytics',
    familyTags: ['water', 'lake'],
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
