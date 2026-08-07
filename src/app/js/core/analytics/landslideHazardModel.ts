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
 * @module landslideHazardModel
 * Modelo de perigo de deslizamento de terra (landslide hazard).
 * Implementa fator de segurança de talude infinito, pressão de poros,
 * limiar de chuva e classificação de risco.
 *
 * Referências acadêmicas:
 * - Taylor, D.W. (1937). Stability of Earth Slopes. J. Boston Soc. Civ. Eng., 24(3), 197–246.
 *   DOI:10.1139/t37-001
 * - Caine, N. (1980). The Rainfall Intensity-Duration Control of Shallow Landslides and Debris Flows.
 *   Geografiska Annaler, 62A(1-2), 23–27.
 *   DOI:10.1111/j.1475-4754.1980.tb00351.x
 * - ABNT NBR 11682:2009 - Estabilidade de Encostas
 */

const TO_RAD = Math.PI / 180;

/**
 * Calcula o fator de segurança (FS) de talude infinito saturado.
 * FS = (c + (gamma×z×cos²θ - u)×tan(phi)) / (gamma×z×sinθ×cosθ)
 *
 * @param {number} slope_angle_deg   - Ângulo do talude (graus), [0, 90)
 * @param {number} soil_cohesion_kPa - Coesão do solo (kPa), >= 0
 * @param {number} friction_angle_deg - Ângulo de atrito interno (graus), (0, 90)
 * @param {number} soil_depth_m      - Profundidade da camada de solo (m), > 0
 * @param {number} unit_weight_kN_m3 - Peso específico do solo (kN/m³), > 0
 * @returns {{ FS: number }} Fator de segurança (adimensional)
 */
export function computeSlopeFactor(slope_angle_deg: number, soil_cohesion_kPa: number, friction_angle_deg: number, soil_depth_m: number, unit_weight_kN_m3: number): { FS: number } {
    if (
        typeof slope_angle_deg !== 'number' ||
        typeof soil_cohesion_kPa !== 'number' ||
        typeof friction_angle_deg !== 'number' ||
        typeof soil_depth_m !== 'number' ||
        typeof unit_weight_kN_m3 !== 'number'
    ) {
        throw new TypeError('computeSlopeFactor: todos os parâmetros devem ser números');
    }
    if (slope_angle_deg < 0 || slope_angle_deg >= 90) {
        throw new RangeError('computeSlopeFactor: slope_angle_deg deve estar em [0, 90)');
    }
    if (soil_cohesion_kPa < 0) {
        throw new RangeError('computeSlopeFactor: soil_cohesion_kPa deve ser >= 0');
    }
    if (friction_angle_deg <= 0 || friction_angle_deg >= 90) {
        throw new RangeError('computeSlopeFactor: friction_angle_deg deve estar em (0, 90)');
    }
    if (soil_depth_m <= 0) {
        throw new RangeError('computeSlopeFactor: soil_depth_m deve ser > 0');
    }
    if (unit_weight_kN_m3 <= 0) {
        throw new RangeError('computeSlopeFactor: unit_weight_kN_m3 deve ser > 0');
    }

    const theta = slope_angle_deg * TO_RAD;
    const phi = friction_angle_deg * TO_RAD;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const cos2Theta = cosTheta * cosTheta;

    // Tensão normal efetiva sem pressão de poros (u=0 neste método)
    const normal_stress = unit_weight_kN_m3 * soil_depth_m * cos2Theta;
    // Resistência ao cisalhamento (kPa)
    const shear_resistance = soil_cohesion_kPa + normal_stress * Math.tan(phi);
    // Tensão cisalhante mobilizada (kPa)
    const shear_stress = unit_weight_kN_m3 * soil_depth_m * sinTheta * cosTheta;

    if (Math.abs(shear_stress) < 1e-15) {
        // Talude horizontal: estável por definição
        return { FS: Infinity };
    }

    const FS = shear_resistance / shear_stress;
    return { FS };
}

/**
 * Calcula a pressão de água nos poros em função da posição do nível d'água.
 * u = gamma_w × max(0, depth - water_table_depth)
 *
 * @param {number} depth_m              - Profundidade do ponto de interesse (m), >= 0
 * @param {number} water_table_depth_m  - Profundidade do nível freático (m), >= 0
 * @param {number} unit_weight_water_kN_m3 - Peso específico da água (kN/m³), normalmente 9.81
 * @returns {{ u_kPa: number }} Pressão de poros (kPa)
 */
export function computePoreWaterPressure(depth_m: number, water_table_depth_m: number, unit_weight_water_kN_m3: number): { u_kPa: number } {
    if (
        typeof depth_m !== 'number' ||
        typeof water_table_depth_m !== 'number' ||
        typeof unit_weight_water_kN_m3 !== 'number'
    ) {
        throw new TypeError('computePoreWaterPressure: todos os parâmetros devem ser números');
    }
    if (depth_m < 0) throw new RangeError('computePoreWaterPressure: depth_m deve ser >= 0');
    if (water_table_depth_m < 0) throw new RangeError('computePoreWaterPressure: water_table_depth_m deve ser >= 0');
    if (unit_weight_water_kN_m3 <= 0)
        throw new RangeError('computePoreWaterPressure: unit_weight_water_kN_m3 deve ser > 0');

    // Coluna d'água: somente abaixo do nível freático há pressão positiva
    const water_column_m = Math.max(0, depth_m - water_table_depth_m);
    const u_kPa = unit_weight_water_kN_m3 * water_column_m;
    return { u_kPa };
}

/**
 * Avalia se a chuva excede o limiar de disparo de deslizamento.
 * Limiar aproximado: T = 10 + 1.5 × log10(antecedent + 1)  (mm/h)
 * Baseado no modelo empírico de Caine (1980).
 *
 * @param {number} antecedent_rainfall_mm - Chuva antecedente acumulada (mm), >= 0
 * @param {number} intensity_mm_h         - Intensidade de chuva atual (mm/h), >= 0
 * @returns {{ exceeds_threshold: boolean, threshold_mm_h: number }}
 */
export function computeRainfallTriggerThreshold(antecedent_rainfall_mm: number, intensity_mm_h: number): { exceeds_threshold: boolean, threshold_mm_h: number } {
    if (typeof antecedent_rainfall_mm !== 'number' || typeof intensity_mm_h !== 'number') {
        throw new TypeError('computeRainfallTriggerThreshold: parâmetros devem ser números');
    }
    if (antecedent_rainfall_mm < 0) {
        throw new RangeError('computeRainfallTriggerThreshold: antecedent_rainfall_mm deve ser >= 0');
    }
    if (intensity_mm_h < 0) {
        throw new RangeError('computeRainfallTriggerThreshold: intensity_mm_h deve ser >= 0');
    }
    // Limiar empírico de Caine adaptado (mm/h)
    const threshold_mm_h = 10 + 1.5 * Math.log10(antecedent_rainfall_mm + 1);
    const exceeds_threshold = intensity_mm_h > threshold_mm_h;
    return { exceeds_threshold, threshold_mm_h };
}

/**
 * Classifica o risco de deslizamento combinando FS, ângulo e chuva.
 *
 * @param {number} FS              - Fator de segurança (adimensional)
 * @param {number} slope_angle_deg - Ângulo do talude (graus)
 * @param {number} rainfall_mm     - Precipitação nas últimas 24h (mm), >= 0
 * @returns {{ risk: 'stable'|'low'|'moderate'|'high'|'imminent' }}
 */
export function classifyLandslideRisk(FS: number, slope_angle_deg: number, rainfall_mm: number): { risk: 'stable'|'low'|'moderate'|'high'|'imminent' } {
    if (typeof FS !== 'number' || typeof slope_angle_deg !== 'number' || typeof rainfall_mm !== 'number') {
        throw new TypeError('classifyLandslideRisk: todos os parâmetros devem ser números');
    }
    if (FS < 0) throw new RangeError('classifyLandslideRisk: FS deve ser >= 0');
    if (rainfall_mm < 0) throw new RangeError('classifyLandslideRisk: rainfall_mm deve ser >= 0');

    // Critério baseado em FS (primário) com modificador de chuva intensa
    if (FS <= 1.0) return { risk: 'imminent' };
    // Chuva intensa (>100 mm/24h) rebaixa uma classe
    const heavy_rain = rainfall_mm > 100;
    if (FS <= 1.2) return { risk: heavy_rain ? 'imminent' : 'high' };
    if (FS <= 1.5) return { risk: heavy_rain ? 'high' : 'moderate' };
    if (FS <= 2.0) return { risk: heavy_rain ? 'moderate' : 'low' };
    return { risk: 'stable' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const landslideHazardModelMeta: AnalyticsModuleMeta = {
    name: 'landslideHazardModel',
    description: 'landslideHazardModel',
    category: 'analytics',
    familyTags: ['risk', 'landslide'],
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
