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
 * Slope Mass Movement - Infinite slope stability, rainfall reduction and landslide susceptibility
 * Movimentos de Massa em Encostas - estabilidade infinita, redução por chuva e suscetibilidade
 *
 * References / Referências:
 * - Iverson (2000) Water Resources Research DOI:10.1029/2000WR900090
 * - Taylor (1937) J Boston Soc Civil Eng - Stability of Earth Slopes
 * - Varnes (1978) USGS Circular 794 - Slope Movement Types and Processes
 * - CEPED-UFSC (2013) Atlas Brasileiro de Desastres Naturais 1991–2012
 *
 * @module slopeMassMovement
 */

'use strict';

const DEG_TO_RAD = Math.PI / 180;

// FS threshold for stability classification - FS ≥ 1.3 considerado estável em projetos geotécnicos
const FS_STABLE_THRESHOLD = 1.3;

// Soil type scores for susceptibility index (ordem crescente de risco)
const SOIL_SCORES = { rock: 1, gravel: 2, sand: 3, clay: 4, organic: 5 };

// Land use scores for susceptibility index
const LAND_USE_SCORES = { forest: 1, grassland: 2, agriculture: 3, urban: 4, bare: 5 };

// Maximum combined score for normalization: slope(5) + soil(5) + land_use(5) + fault(2) = 17
const SUSCEPTIBILITY_MAX = 17;

// Susceptibility class thresholds (normalized 0-1)
const SUSCEPTIBILITY_THRESHOLDS = [
    { max: 0.2, cls: 'very_low' },
    { max: 0.4, cls: 'low' },
    { max: 0.6, cls: 'moderate' },
    { max: 0.8, cls: 'high' },
];

/**
 * Compute Factor of Safety using the Infinite Slope Model.
 * Calcula o Fator de Segurança pelo modelo de talude infinito.
 *
 * FS = [c + γ·z·cos²β·(1−ru)·tan(φ)] / [γ·z·sin(β)·cos(β)]
 * Referência: Taylor (1937), Bishop (1955)
 *
 * @param {number} cohesion_kPa - Effective cohesion (kPa)
 * @param {number} friction_angle_deg - Effective friction angle (degrees)
 * @param {number} slope_angle_deg - Slope angle (degrees)
 * @param {number} depth_m - Failure plane depth (m)
 * @param {number} unit_weight_kN_m3 - Soil unit weight (kN/m³)
 * @param {number} pore_pressure_ratio - Pore pressure ratio ru (0–1)
 * @returns {{ fs: number, stable: boolean }}
 */
export function computeInfiniteSlope(cohesion_kPa: number, friction_angle_deg: number, slope_angle_deg: number, depth_m: number, unit_weight_kN_m3: number, pore_pressure_ratio: number): { fs: number, stable: boolean } {
    if (
        [cohesion_kPa, friction_angle_deg, slope_angle_deg, depth_m, unit_weight_kN_m3, pore_pressure_ratio].some(
            (v) => typeof v !== 'number',
        )
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (friction_angle_deg < 0 || friction_angle_deg >= 90) {
        throw new RangeError('friction_angle_deg must be in [0, 90)');
    }
    if (slope_angle_deg <= 0 || slope_angle_deg >= 90) {
        throw new RangeError('slope_angle_deg must be in (0, 90)');
    }
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');
    if (unit_weight_kN_m3 <= 0) throw new RangeError('unit_weight_kN_m3 must be > 0');
    if (pore_pressure_ratio < 0 || pore_pressure_ratio > 1) {
        throw new RangeError('pore_pressure_ratio must be in [0, 1]');
    }
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be >= 0');

    const beta = slope_angle_deg * DEG_TO_RAD;
    const phi = friction_angle_deg * DEG_TO_RAD;
    const gamma_z = unit_weight_kN_m3 * depth_m;

    // Resistência ao cisalhamento (numerador): coesão + componente friccional reduzida por poro-pressão
    const shear_resistance = cohesion_kPa + gamma_z * Math.cos(beta) ** 2 * (1 - pore_pressure_ratio) * Math.tan(phi);

    // Força motriz cisalhante (denominador): componente tangencial do peso
    const shear_driving = gamma_z * Math.sin(beta) * Math.cos(beta);

    // FS indefinido quando shear_driving ≈ 0 (encosta plana) - retorna Infinity como caso especial
    const fs = shear_driving > 0 ? shear_resistance / shear_driving : Infinity;

    return { fs, stable: fs >= FS_STABLE_THRESHOLD };
}

/**
 * Compute rainfall-induced Factor of Safety reduction.
 * Calcula a redução do Fator de Segurança por chuva intensa.
 *
 * Simplificação baseada em Iverson (2000): FS_wet = FS_dry × f_rain × f_permeability
 * f_rain = 1 − 0.1 × min(1, rainfall/50)
 * f_perm = 1 − 0.05 × min(1, 1e-6 / permeability)   (solos pouco permeáveis retêm mais água)
 *
 * @param {number} fs_dry - Factor of Safety under dry conditions
 * @param {number} rainfall_mm_h - Rainfall intensity (mm/h)
 * @param {number} soil_permeability_m_s - Hydraulic conductivity (m/s)
 * @returns {{ fs_wet: number, reduction_pct: number }}
 */
export function computeRainfall_FS_Reduction(fs_dry: number, rainfall_mm_h: number, soil_permeability_m_s: number): { fs_wet: number, reduction_pct: number } {
    if ([fs_dry, rainfall_mm_h, soil_permeability_m_s].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (fs_dry <= 0) throw new RangeError('fs_dry must be > 0');
    if (rainfall_mm_h < 0) throw new RangeError('rainfall_mm_h must be >= 0');
    if (soil_permeability_m_s <= 0) throw new RangeError('soil_permeability_m_s must be > 0');

    // Fator de redução por chuva (até 10% em 50 mm/h)
    const f_rain = 1 - 0.1 * Math.min(1, rainfall_mm_h / 50);

    // Fator de redução por baixa permeabilidade (favorece acúmulo de poro-pressão)
    const f_perm = 1 - 0.05 * Math.min(1, 1e-6 / soil_permeability_m_s);

    const fs_wet = fs_dry * f_rain * f_perm;
    const reduction_pct = ((fs_dry - fs_wet) / fs_dry) * 100;

    return { fs_wet, reduction_pct };
}

/**
 * Compute multi-criteria landslide susceptibility index.
 * Calcula o índice de suscetibilidade a deslizamentos por múltiplos critérios.
 *
 * Score aditivo: slope(1-5) + soil_type(1-5) + land_use(1-5) + fault_proximity(0-2)
 * Normalizado para [0, 1].
 *
 * @param {number} slope_angle_deg - Slope angle (degrees)
 * @param {'rock'|'gravel'|'sand'|'clay'|'organic'} soil_type - Soil type
 * @param {'forest'|'grassland'|'agriculture'|'urban'|'bare'} land_use - Land use
 * @param {number} proximity_to_fault_m - Distance to nearest fault (m)
 * @returns {{ index: number, class: 'very_low'|'low'|'moderate'|'high'|'very_high' }}
 */
export function computeSusceptibilityIndex(slope_angle_deg: number, soil_type: 'rock'|'gravel'|'sand'|'clay'|'organic', land_use: 'forest'|'grassland'|'agriculture'|'urban'|'bare', proximity_to_fault_m: number): { index: number, class: 'very_low'|'low'|'moderate'|'high'|'very_high' } {
    if (typeof slope_angle_deg !== 'number' || typeof proximity_to_fault_m !== 'number') {
        throw new TypeError('slope_angle_deg and proximity_to_fault_m must be numbers');
    }
    if (slope_angle_deg < 0 || slope_angle_deg >= 90) {
        throw new RangeError('slope_angle_deg must be in [0, 90)');
    }
    if (proximity_to_fault_m < 0) throw new RangeError('proximity_to_fault_m must be >= 0');

    if (!(soil_type in SOIL_SCORES)) {
        throw new TypeError(`soil_type must be one of: ${Object.keys(SOIL_SCORES).join(', ')}`);
    }
    if (!(land_use in LAND_USE_SCORES)) {
        throw new TypeError(`land_use must be one of: ${Object.keys(LAND_USE_SCORES).join(', ')}`);
    }

    // Pontuação por declividade (1=plano, 5=muito íngreme) - baseado em Varnes (1978)
    let slope_score;
    if (slope_angle_deg < 5) slope_score = 1;
    else if (slope_angle_deg < 15) slope_score = 2;
    else if (slope_angle_deg < 25) slope_score = 3;
    else if (slope_angle_deg < 35) slope_score = 4;
    else slope_score = 5;

    // Pontuação por proximidade a falha geológica (adiciona risco sísmico/estrutural)
    let fault_score = 0;
    if (proximity_to_fault_m < 500) fault_score = 2;
    else if (proximity_to_fault_m < 1000) fault_score = 1;

    const raw_score = slope_score + SOIL_SCORES[soil_type] + LAND_USE_SCORES[land_use] + fault_score;
    const index = raw_score / SUSCEPTIBILITY_MAX;

    const threshold = SUSCEPTIBILITY_THRESHOLDS.find((t) => index <= t.max);
        const cls: 'very_low'|'low'|'moderate'|'high'|'very_high'= threshold ? (threshold.cls as 'very_low'|'low'|'moderate'|'high') : 'very_high';

    return { index, class: cls };
}

/**
 * Classify landslide hazard combining susceptibility and rainfall return period.
 * Classifica o grau de perigo a deslizamento combinando suscetibilidade e período de retorno da chuva.
 *
 * @param {number} susceptibility_index - Susceptibility index (0–1)
 * @param {number} rainfall_return_period_yr - Rainfall return period (years)
 * @returns {{ hazard: 'low'|'moderate'|'high'|'very_high', return_period_trigger_yr: number }}
 */
export function classifyLandslideHazard(susceptibility_index: number, rainfall_return_period_yr: number): { hazard: 'low'|'moderate'|'high'|'very_high', return_period_trigger_yr: number } {
    if (typeof susceptibility_index !== 'number' || typeof rainfall_return_period_yr !== 'number') {
        throw new TypeError('Both arguments must be numbers');
    }
    if (susceptibility_index < 0 || susceptibility_index > 1) {
        throw new RangeError('susceptibility_index must be in [0, 1]');
    }
    if (rainfall_return_period_yr <= 0) {
        throw new RangeError('rainfall_return_period_yr must be > 0');
    }

    // Amplificação de perigo por evento de chuva extrema (período de retorno curto = mais frequente)
    const rain_amplifier = rainfall_return_period_yr <= 5 ? 2 : rainfall_return_period_yr <= 25 ? 1 : 0;

    // Score combinado: suscetibilidade × 3 (escala 0-3) + amplificador de chuva (0-2)
    const combined = susceptibility_index * 3 + rain_amplifier;

        let hazard: 'low'|'moderate'|'high'|'very_high';
    if (combined < 1) hazard = 'low';
    else if (combined < 2) hazard = 'moderate';
    else if (combined < 3.5) hazard = 'high';
    else hazard = 'very_high';

    return { hazard, return_period_trigger_yr: rainfall_return_period_yr };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const slopeMassMovementMeta = {
    name: 'slopeMassMovement',
    description: 'slopeMassMovement',
    category: 'analytics',
    familyTags: ['geotechnical'],
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
