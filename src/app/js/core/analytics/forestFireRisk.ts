// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Forest Fire Risk Analytics
// Analítica de risco de incêndio florestal - índice de perigo, comportamento do fogo e área de queima.
// Refs: Rothermel (1972) USDA Forest Service Research Paper INT-115;
//       Ångström (1942); Andrews et al. (2008) FCCS;
//       INPE PREVFOGO (2021); IBAMA IN 02/2020

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
 * Computes fire behavior using simplified Rothermel (1972) model.
 * Calcula comportamento do fogo usando modelo simplificado de Rothermel (1972).
 *
 * @param wind_speed_m_s - Wind speed in m/s (velocidade do vento em m/s), ≥ 0
 * @param fuel_moisture_pct - Fuel moisture content in % (umidade do combustível em %), [0, 100]
 * @param fuel_load_t_ha - Fuel load in t/ha (carga de combustível em t/ha), > 0
 * @param slope_pct - Terrain slope in % (inclinação do terreno em %), ≥ 0
 * @returns ROS (m/min), flame length (m) and fireline intensity (kW/m).
 */
export function computeRothermelFireBehavior(
    wind_speed_m_s: number,
    fuel_moisture_pct: number,
    fuel_load_t_ha: number,
    slope_pct: number,
): { ros_m_min: number; flame_length_m: number; fireline_intensity_kW_m: number } {
    if (
        typeof wind_speed_m_s !== 'number' ||
        typeof fuel_moisture_pct !== 'number' ||
        typeof fuel_load_t_ha !== 'number' ||
        typeof slope_pct !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
    if (fuel_moisture_pct < 0 || fuel_moisture_pct > 100) throw new RangeError('fuel_moisture_pct must be in [0, 100]');
    if (fuel_load_t_ha <= 0) throw new RangeError('fuel_load_t_ha must be > 0');
    if (slope_pct < 0) throw new RangeError('slope_pct must be >= 0');

    // R0 = taxa base de espalhamento (função da carga e umidade do combustível)
    const fm_factor = Math.pow(1 - fuel_moisture_pct / 100, 2);
    const R0 = fuel_load_t_ha * fm_factor * 0.05; // m/min base

    // Fator de vento: φw = 1 + 0.12 × U²
    const phi_w = 1 + 0.12 * Math.pow(wind_speed_m_s, 2);

    // Fator de inclinação: φs = 1 + 0.012 × slope
    const phi_s = 1 + 0.012 * slope_pct;

    // Rate of spread - taxa de propagação do fogo
    const ros_m_min = R0 * phi_w * phi_s;

    // Calor de combustão H = 18000 kJ/kg; w em kg/m² (t/ha × 0.1 = kg/m²)
    const H = 18000; // kJ/kg
    const w_kg_m2 = fuel_load_t_ha * 0.1;
    // Intensidade da linha de fogo: I = H × w × ROS / 60 (kW/m)
    const fireline_intensity_kW_m = (H * w_kg_m2 * ros_m_min) / 60;

    // Comprimento da chama: flame_length = 0.0775 × I^0.46 (Byram 1959)
    const flame_length_m = 0.0775 * Math.pow(Math.max(fireline_intensity_kW_m, 0), 0.46);

    return { ros_m_min, flame_length_m, fireline_intensity_kW_m };
}

/**
 * Computes the Ångström fire danger index.
 * Calcula o índice de perigo de incêndio de Ångström.
 *
 * @param temperature_c - Air temperature in °C (temperatura do ar em °C)
 * @param relative_humidity_pct - Relative humidity in % (umidade relativa em %), [0, 100]
 * @returns Ångström index and risk level.
 */
export function computeAngstromIndex(
    temperature_c: number,
    relative_humidity_pct: number,
): { angstrom_index: number; risk_level: string } {
    if (typeof temperature_c !== 'number' || typeof relative_humidity_pct !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (relative_humidity_pct < 0 || relative_humidity_pct > 100) {
        throw new RangeError('relative_humidity_pct must be in [0, 100]');
    }

    // Fórmula de Ångström: Ia = UR/20 - (T-27)/10
    const angstrom_index = relative_humidity_pct / 20 - (temperature_c - 27) / 10;

    let risk_level: string;
    if (angstrom_index < 2.0) risk_level = 'extreme';
    else if (angstrom_index < 2.5) risk_level = 'high';
    else if (angstrom_index < 3.5) risk_level = 'moderate';
    else if (angstrom_index < 4.0) risk_level = 'low';
    else risk_level = 'no_risk';

    return { angstrom_index, risk_level };
}

/**
 * Estimates burned area spread rate and detection time.
 * Estima a taxa de espalhamento de área queimada e o tempo de detecção.
 *
 * @param ros_m_min - Rate of spread in m/min (taxa de propagação em m/min), ≥ 0
 * @param wind_speed_m_s - Wind speed in m/s (velocidade do vento em m/s), ≥ 0
 * @param terrain_roughness - Terrain roughness coefficient [0, 1] (coeficiente de rugosidade do terreno)
 * @returns Spread rate (ha/h) and detection time (min).
 */
export function computeBurnedAreaProbability(
    ros_m_min: number,
    wind_speed_m_s: number,
    terrain_roughness: number,
): { spread_rate_ha_h: number; detection_time_min: number } {
    if (typeof ros_m_min !== 'number' || typeof wind_speed_m_s !== 'number' || typeof terrain_roughness !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (ros_m_min < 0) throw new RangeError('ros_m_min must be >= 0');
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
    if (terrain_roughness < 0 || terrain_roughness > 1) throw new RangeError('terrain_roughness must be in [0, 1]');

    // Taxa de espalhamento em ha/h: área elíptica simplificada
    // spread = ROS × 0.6 × (1 - rugosidade) × 60 × π / 10000 → ha/h
    const spread_rate_ha_h = (ros_m_min * 0.6 * (1 - terrain_roughness) * 60 * Math.PI) / 10000;

    // Tempo de detecção: diminui com aumento da taxa de propagação
    const detection_time_min = 30 / (1 + ros_m_min / 10);

    return { spread_rate_ha_h, detection_time_min };
}

function validateClassifyFireDangerInputs(
    angstrom_index: number,
    fuel_moisture_pct: number,
    wind_speed_m_s: number,
): void {
    if (
        typeof angstrom_index !== 'number' ||
        typeof fuel_moisture_pct !== 'number' ||
        typeof wind_speed_m_s !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (fuel_moisture_pct < 0 || fuel_moisture_pct > 100) throw new RangeError('fuel_moisture_pct must be in [0, 100]');
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
}

interface FireDangerLevel {
    danger: string;
    suppression_difficulty: string;
}

function determineFireDangerLevel(
    angstrom_index: number,
    fuel_moisture_pct: number,
    wind_speed_m_s: number,
): FireDangerLevel {
    const is_extreme = angstrom_index < 2.0 || fuel_moisture_pct < 8 || wind_speed_m_s > 15;
    const is_high = angstrom_index < 2.5 || fuel_moisture_pct < 15 || wind_speed_m_s > 10;
    const is_moderate = angstrom_index < 3.5 || fuel_moisture_pct < 25 || wind_speed_m_s > 5;
    const is_low = angstrom_index < 4.0 || fuel_moisture_pct < 40;

    if (is_extreme) {
        return {
            danger: 'extreme',
            suppression_difficulty: 'Suppression virtually impossible; aerial resources and firebreaks required',
        };
    }
    if (is_high) {
        return {
            danger: 'high',
            suppression_difficulty: 'Difficult suppression; head fire control not possible by hand crews alone',
        };
    }
    if (is_moderate) {
        return {
            danger: 'moderate',
            suppression_difficulty: 'Moderate difficulty; experienced crews can control with proper resources',
        };
    }
    if (is_low) {
        return {
            danger: 'low',
            suppression_difficulty: 'Suppression possible; initial attack typically successful',
        };
    }
    return {
        danger: 'very_low',
        suppression_difficulty: 'Minimal difficulty; fires extinguish or are easily controlled',
    };
}

/**
 * Classifies fire danger based on multiple indicators.
 * Classifica o perigo de incêndio com base em múltiplos indicadores (INPE/PREVFOGO e NFFL).
 *
 * @param angstrom_index - Ångström fire danger index
 * @param fuel_moisture_pct - Fuel moisture content in % (umidade do combustível em %), [0, 100]
 * @param wind_speed_m_s - Wind speed in m/s (velocidade do vento em m/s), ≥ 0
 * @returns Danger level and suppression difficulty.
 */
export function classifyFireDanger(
    angstrom_index: number,
    fuel_moisture_pct: number,
    wind_speed_m_s: number,
): { danger: string; suppression_difficulty: string } {
    validateClassifyFireDangerInputs(angstrom_index, fuel_moisture_pct, wind_speed_m_s);
    return determineFireDangerLevel(angstrom_index, fuel_moisture_pct, wind_speed_m_s);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const forestFireRiskMeta: AnalyticsModuleMeta = {
    name: 'forestFireRisk',
    description: 'forestFireRisk',
    category: 'analytics',
    familyTags: ['risk', 'forest', 'fire'],
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
