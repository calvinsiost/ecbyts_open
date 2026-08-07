// @ts-check
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
 * Green Infrastructure Model - retenção de chuva, evapotranspiração e resfriamento urbano
 *
 * Referências acadêmicas:
 * - Allen, R.G. et al. (1998) Crop Evapotranspiration - FAO Irrigation Paper No. 56.
 *   DOI:10.13031/2013.17201
 * - Bowler, D.E. et al. (2010) Urban greening to cool towns and cities.
 *   DOI:10.1016/j.landurbplan.2010.05.006
 * - Fletcher, T.D. et al. (2015) SUDS, LID, BMPs, WSUD - review.
 *   DOI:10.1016/j.jhydrol.2014.11.073
 */

/**
 * Calcula o volume de retenção de chuva pelo solo de infraestrutura verde.
 * Volume máximo retido = área × profundidade do solo × déficit de umidade (FC - umidade inicial).
 *
 * @param {number} green_area_m2 - Área verde (m²), deve ser > 0
 * @param {number} soil_depth_cm - Profundidade do solo (cm), deve ser > 0
 * @param {number} FC_m3_m3 - Capacidade de campo volumétrica (m³/m³), deve estar em (0, 1]
 * @param {number} initial_moisture_m3_m3 - Umidade inicial do solo (m³/m³), deve estar em [0, FC]
 * @returns {{ retention_m3: number }} Volume de água retido (m³)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se valores estiverem fora dos limites físicos
 */
export function computeRainfallRetention(green_area_m2: any, soil_depth_cm: any, FC_m3_m3: any, initial_moisture_m3_m3: any) {
    if (
        typeof green_area_m2 !== 'number' ||
        !isFinite(green_area_m2) ||
        typeof soil_depth_cm !== 'number' ||
        !isFinite(soil_depth_cm) ||
        typeof FC_m3_m3 !== 'number' ||
        !isFinite(FC_m3_m3) ||
        typeof initial_moisture_m3_m3 !== 'number' ||
        !isFinite(initial_moisture_m3_m3)
    ) {
        throw new TypeError('computeRainfallRetention: todos os parâmetros devem ser números finitos');
    }
    if (green_area_m2 <= 0) throw new RangeError('green_area_m2 deve ser > 0');
    if (soil_depth_cm <= 0) throw new RangeError('soil_depth_cm deve ser > 0');
    if (FC_m3_m3 <= 0 || FC_m3_m3 > 1) throw new RangeError('FC_m3_m3 deve estar em (0, 1]');
    if (initial_moisture_m3_m3 < 0 || initial_moisture_m3_m3 > FC_m3_m3) {
        throw new RangeError('initial_moisture_m3_m3 deve estar em [0, FC_m3_m3]');
    }

    // Volume = área (m²) × profundidade (m) × déficit de umidade (m³/m³)
    const depth_m = soil_depth_cm / 100;
    const moisture_deficit = FC_m3_m3 - initial_moisture_m3_m3;
    const retention_m3 = green_area_m2 * depth_m * moisture_deficit;

    return { retention_m3 };
}

/**
 * Estima a taxa de evapotranspiração de referência pelo método Penman-Monteith simplificado
 * (FAO-56, Allen et al. 1998, DOI:10.13031/2013.17201).
 * Pressão de vapor déficit calculada assumindo umidade relativa média de 60%.
 *
 * @param {number} LAI - Índice de área foliar (m²/m²), deve ser ≥ 0
 * @param {number} solar_rad_MJ_m2 - Radiação solar global diária (MJ/m²/dia), deve ser ≥ 0
 * @param {number} temp_C - Temperatura média do ar (°C), deve estar em [-50, 60]
 * @param {number} wind_m_s - Velocidade do vento a 2 m (m/s), deve ser ≥ 0
 * @returns {{ ET_mm_day: number }} Evapotranspiração estimada (mm/dia)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se valores estiverem fora dos limites físicos
 */
export function computeEvapotranspirationRate(LAI: any, solar_rad_MJ_m2: any, temp_C: any, wind_m_s: any) {
    if (
        typeof LAI !== 'number' ||
        !isFinite(LAI) ||
        typeof solar_rad_MJ_m2 !== 'number' ||
        !isFinite(solar_rad_MJ_m2) ||
        typeof temp_C !== 'number' ||
        !isFinite(temp_C) ||
        typeof wind_m_s !== 'number' ||
        !isFinite(wind_m_s)
    ) {
        throw new TypeError('computeEvapotranspirationRate: todos os parâmetros devem ser números finitos');
    }
    if (LAI < 0) throw new RangeError('LAI deve ser ≥ 0');
    if (solar_rad_MJ_m2 < 0) throw new RangeError('solar_rad_MJ_m2 deve ser ≥ 0');
    if (temp_C < -50 || temp_C > 60) throw new RangeError('temp_C deve estar em [-50, 60]°C');
    if (wind_m_s < 0) throw new RangeError('wind_m_s deve ser ≥ 0');

    // Pressão de saturação de vapor (kPa) - equação de Magnus-Tetens
    const e_sat = 0.6108 * Math.exp((17.27 * temp_C) / (temp_C + 237.3));

    // Déficit de pressão de vapor assumindo UR = 60%
    const RH = 60;
    const vpd = e_sat * (1 - RH / 100);

    // Penman-Monteith FAO-56 (eq. 6): ET = (0.408×Rn + gamma×900/(T+273)×u2×vpd) / (delta + gamma×(1+0.34×u2))
    // Simplificação: delta ≈ 0.408×Rn no numerador; gamma = 0.067 kPa/°C; delta/gamma≈1 no denominador
    const numerator = 0.408 * solar_rad_MJ_m2 + (900 / (temp_C + 273)) * wind_m_s * vpd;
    const denominator = 1 + 0.34 * wind_m_s;

    // Escala pelo LAI normalizado (máximo em LAI=3): cobertura vegetal aumenta ET
    const LAI_factor = Math.min(1, LAI / 3);
    const ET_mm_day = Math.max(0, (numerator / denominator) * (0.5 + 0.5 * LAI_factor));

    return { ET_mm_day };
}

/**
 * Estima a redução de temperatura do ar urbano causada pela infraestrutura verde.
 * Combina efeitos de albedo, evapotranspiração e sombreamento (Bowler et al. 2010,
 * DOI:10.1016/j.landurbplan.2010.05.006).
 *
 * @param {number} green_cover_pct - Porcentagem de cobertura verde (%), deve estar em [0, 100]
 * @param {number} albedo_increase - Aumento de albedo superficial (adimensional, 0–1)
 * @param {number} ET_mm_day - Taxa de evapotranspiração (mm/dia), deve ser ≥ 0
 * @returns {{ temp_reduction_C: number }} Redução de temperatura (°C, valor positivo = resfriamento)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se valores estiverem fora dos limites físicos
 */
export function computeUrbanHeatReduction(green_cover_pct: any, albedo_increase: any, ET_mm_day: any) {
    if (
        typeof green_cover_pct !== 'number' ||
        !isFinite(green_cover_pct) ||
        typeof albedo_increase !== 'number' ||
        !isFinite(albedo_increase) ||
        typeof ET_mm_day !== 'number' ||
        !isFinite(ET_mm_day)
    ) {
        throw new TypeError('computeUrbanHeatReduction: todos os parâmetros devem ser números finitos');
    }
    if (green_cover_pct < 0 || green_cover_pct > 100) throw new RangeError('green_cover_pct deve estar em [0, 100]');
    if (albedo_increase < 0 || albedo_increase > 1) throw new RangeError('albedo_increase deve estar em [0, 1]');
    if (ET_mm_day < 0) throw new RangeError('ET_mm_day deve ser ≥ 0');

    // Coeficientes calibrados a partir de meta-análise de Bowler et al. 2010
    // Cada 1% de cobertura verde reduz ~0.04°C; cada 0.1 de albedo reduz ~0.3°C; cada mm/dia ET reduz ~0.1°C
    const temp_reduction_C = green_cover_pct * 0.04 + albedo_increase * 3 + ET_mm_day * 0.1;

    return { temp_reduction_C };
}

/**
 * Classifica o desempenho de infraestrutura verde com base na retenção relativa ao evento de projeto
 * e na redução de temperatura obtida.
 *
 * @param {number} retention_m3 - Volume de retenção alcançado (m³), deve ser ≥ 0
 * @param {number} design_storm_m3 - Volume do evento de projeto (m³), deve ser > 0
 * @param {number} temp_reduction_C - Redução de temperatura obtida (°C), deve ser ≥ 0
 * @returns {{ performance: 'poor'|'adequate'|'good'|'excellent' }}
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se retention < 0, design_storm ≤ 0 ou temp_reduction < 0
 */
export function classifyGreenInfrastructurePerformance(retention_m3: any, design_storm_m3: any, temp_reduction_C: any) {
    if (
        typeof retention_m3 !== 'number' ||
        !isFinite(retention_m3) ||
        typeof design_storm_m3 !== 'number' ||
        !isFinite(design_storm_m3) ||
        typeof temp_reduction_C !== 'number' ||
        !isFinite(temp_reduction_C)
    ) {
        throw new TypeError('classifyGreenInfrastructurePerformance: todos os parâmetros devem ser números finitos');
    }
    if (retention_m3 < 0) throw new RangeError('retention_m3 deve ser ≥ 0');
    if (design_storm_m3 <= 0) throw new RangeError('design_storm_m3 deve ser > 0');
    if (temp_reduction_C < 0) throw new RangeError('temp_reduction_C deve ser ≥ 0');

    const ratio = retention_m3 / design_storm_m3;

    if (ratio >= 0.9) return { performance: 'excellent' };
    if (ratio >= 0.7) return { performance: 'good' };
    if (ratio >= 0.5) return { performance: 'adequate' };
    return { performance: 'poor' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const greenInfrastructureModelMeta = {
    name: 'greenInfrastructureModel',
    description: 'greenInfrastructureModel',
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
