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
 * Heavy Rainfall Model analytics module.
 * Modelos de chuvas intensas para dimensionamento hidrológico em projetos ambientais.
 *
 * Referências acadêmicas:
 * - Pfafstetter, O. (1982). "Chuvas Intensas no Brasil". DNOS, Rio de Janeiro.
 *   (Método empírico brasileiro para curvas IDF)
 * - USDA-SCS (1986). "Urban Hydrology for Small Watersheds". Technical Release 55.
 *   (Método CN para escoamento superficial)
 * - WMO (2008). "Guide to Hydrological Practices". WMO-No. 168, 6th ed.
 *   (Classificação de intensidade de chuva)
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

function validateIDFScalarInputs(return_period_yr: number, duration_min: number): void {
    if (typeof return_period_yr !== 'number' || typeof duration_min !== 'number') {
        throw new TypeError('return_period_yr e duration_min devem ser números');
    }
    if (!Number.isFinite(return_period_yr) || return_period_yr < 2) {
        throw new RangeError('return_period_yr deve ser ≥ 2 anos');
    }
    if (!Number.isFinite(duration_min) || duration_min <= 0) {
        throw new RangeError('duration_min deve ser um número finito positivo');
    }
}

function validateIDFRegionParams(region_params: { a: number; b: number; c: number }): void {
    if (
        typeof region_params !== 'object' ||
        region_params === null ||
        typeof region_params.a !== 'number' ||
        typeof region_params.b !== 'number' ||
        typeof region_params.c !== 'number'
    ) {
        throw new TypeError('region_params deve ser objeto com propriedades numéricas a, b, c');
    }
    if (!Number.isFinite(region_params.a) || region_params.a <= 0) {
        throw new RangeError('region_params.a deve ser positivo');
    }
    if (!Number.isFinite(region_params.b) || region_params.b < 0) {
        throw new RangeError('region_params.b deve ser não-negativo');
    }
    if (!Number.isFinite(region_params.c) || region_params.c <= 0) {
        throw new RangeError('region_params.c deve ser positivo');
    }
}

/**
 * Calcula a intensidade pluviométrica pela curva IDF (Intensidade-Duração-Frequência).
 * Equação de Pfafstetter: i = a / (duration + b)^c
 *
 * @param return_period_yr - Período de retorno (anos, ≥ 2)
 * @param duration_min - Duração da chuva (minutos, > 0)
 * @param region_params - Parâmetros regionais calibrados
 * @returns intensity_mm_h
 */
export function computeIDF(
    return_period_yr: number,
    duration_min: number,
    region_params: { a: number; b: number; c: number },
): { intensity_mm_h: number } {
    validateIDFScalarInputs(return_period_yr, duration_min);
    validateIDFRegionParams(region_params);
    // Nota: return_period entra via parâmetros regionais já calibrados para o Tr específico
    // O parâmetro 'a' absorve o fator de frequência do período de retorno na prática brasileira
    const intensity_mm_h = region_params.a / Math.pow(duration_min + region_params.b, region_params.c);
    return { intensity_mm_h };
}

/**
 * Calcula a lâmina de precipitação para uma intensidade e duração.
 * depth_mm = intensity_mm_h × (duration_min / 60)
 *
 * @param intensity_mm_h - Intensidade pluviométrica (mm/h, > 0)
 * @param duration_min - Duração da chuva (minutos, > 0)
 * @returns depth_mm
 */
export function computeRainfallDepth(intensity_mm_h: number, duration_min: number): { depth_mm: number } {
    if (typeof intensity_mm_h !== 'number' || typeof duration_min !== 'number') {
        throw new TypeError('intensity_mm_h e duration_min devem ser números');
    }
    if (!Number.isFinite(intensity_mm_h) || intensity_mm_h <= 0) {
        throw new RangeError('intensity_mm_h deve ser um número finito positivo');
    }
    if (!Number.isFinite(duration_min) || duration_min <= 0) {
        throw new RangeError('duration_min deve ser um número finito positivo');
    }
    const depth_mm = intensity_mm_h * (duration_min / 60);
    return { depth_mm };
}

/**
 * Calcula a vazão de pico pelo método SCS racional modificado.
 * S (mm) = (25400/CN) - 254
 * Q (mm) = (P - 0.2S)² / (P + 0.8S) - volume de escoamento (P > 0.2S)
 * peak_flow (m³/s) = Q × A / 3.6
 * Fator 3.6 converte mm·km²/h → m³/s (usado com área em km²)
 *
 * @param catchment_area_km2 - Área da bacia hidrográfica (km², > 0)
 * @param CN - Curve Number do SCS (1–100)
 * @param rainfall_depth_mm - Lâmina de precipitação total (mm, > 0)
 * @returns peak_flow_m3_s
 */
export function computeDesignFlood(
    catchment_area_km2: number,
    CN: number,
    rainfall_depth_mm: number,
): { peak_flow_m3_s: number } {
    if (typeof catchment_area_km2 !== 'number' || typeof CN !== 'number' || typeof rainfall_depth_mm !== 'number') {
        throw new TypeError('Todos os parâmetros devem ser números');
    }
    if (!Number.isFinite(catchment_area_km2) || catchment_area_km2 <= 0) {
        throw new RangeError('catchment_area_km2 deve ser um número finito positivo');
    }
    if (!Number.isFinite(CN) || CN < 1 || CN > 100) {
        throw new RangeError('CN deve estar entre 1 e 100');
    }
    if (!Number.isFinite(rainfall_depth_mm) || rainfall_depth_mm <= 0) {
        throw new RangeError('rainfall_depth_mm deve ser um número finito positivo');
    }
    const S = 25400 / CN - 254; // retenção potencial máxima (mm)
    const threshold = 0.2 * S;
    let Q = 0;
    if (rainfall_depth_mm > threshold) {
        const numerator = Math.pow(rainfall_depth_mm - threshold, 2);
        const denominator = rainfall_depth_mm + 0.8 * S;
        Q = numerator / denominator; // lâmina de escoamento (mm)
    }
    // Conversão: Q(mm) × A(km²) / 3.6 = m³/s (para chura com duração de 1h equivalente)
    const peak_flow_m3_s = (Q * catchment_area_km2) / 3.6;
    return { peak_flow_m3_s };
}

/**
 * Classifica a intensidade de chuva segundo a WMO (2008).
 *
 * @param intensity_mm_h - Intensidade pluviométrica (mm/h, ≥ 0)
 * @returns class
 */
export function classifyRainfallIntensity(
    intensity_mm_h: number,
): { class: 'light' | 'moderate' | 'heavy' | 'very_heavy' | 'extreme' } {
    if (typeof intensity_mm_h !== 'number' || !Number.isFinite(intensity_mm_h)) {
        throw new TypeError('intensity_mm_h deve ser um número finito');
    }
    if (intensity_mm_h < 0) {
        throw new RangeError('intensity_mm_h deve ser não-negativo');
    }
    let cls: 'light' | 'moderate' | 'heavy' | 'very_heavy' | 'extreme';
    if (intensity_mm_h < 2.5) cls = 'light';
    else if (intensity_mm_h < 10) cls = 'moderate';
    else if (intensity_mm_h < 50) cls = 'heavy';
    else if (intensity_mm_h < 100) cls = 'very_heavy';
    else cls = 'extreme';
    return { class: cls };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const heavyRainfallModelMeta: AnalyticsModuleMeta = {
    name: 'heavyRainfallModel',
    description: 'heavyRainfallModel',
    category: 'analytics',
    familyTags: ['environmental'],
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
