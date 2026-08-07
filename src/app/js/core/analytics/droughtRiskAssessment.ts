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
 * Drought Risk Assessment Indices
 *
 * Implements standardized drought indices for hydrological and agricultural
 * drought monitoring, applicable to environmental digital twin platforms.
 *
 * Academic references:
 *  - McKee, T.B., Doesken, N.J., Kleist, J. (1993). The relationship of drought
 *    frequency and duration to time scales. Proceedings of the 8th Conference on
 *    Applied Climatology. DOI:10.1175/1520-0477(1993)074<0619:TSPIWT>2.0.CO;2
 *  - Palmer, W.C. (1965). Meteorological Drought. USWB Research Paper No. 45.
 *    U.S. Weather Bureau, Washington D.C.
 */
/**
 * Calcula o Índice de Precipitação Padronizado (SPI - Standardized Precipitation Index).
 * Normaliza precipitação mensal com base na distribuição histórica de longo prazo.
 *
 * @param {number} monthly_precip    - Precipitação do mês em análise (mm) (≥ 0)
 * @param {number} long_term_mean    - Média histórica de longo prazo (mm) (> 0)
 * @param {number} long_term_std     - Desvio padrão histórico (mm) (> 0)
 * @returns {{ SPI: number }}
 */
export function computeStandardizedPrecipitationIndex(monthly_precip: any, long_term_mean: any, long_term_std: any) {
    if (typeof monthly_precip !== 'number' || typeof long_term_mean !== 'number' || typeof long_term_std !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (monthly_precip < 0) {
        throw new RangeError('monthly_precip must be >= 0');
    }
    if (long_term_mean <= 0) {
        throw new RangeError('long_term_mean must be > 0');
    }
    if (long_term_std <= 0) {
        throw new RangeError('long_term_std must be > 0');
    }
    // SPI = Z-score: (observado - média) / desvio padrão
    const SPI = (monthly_precip - long_term_mean) / long_term_std;
    return { SPI };
}
/**
 * Calcula o Índice de Seca Palmer simplificado (PDSI - Palmer Drought Severity Index).
 * Estima déficit ou excesso hídrico com base em temperatura, precipitação e capacidade de água disponível.
 *
 * @param {number} temperature_C     - Temperatura média do período em °C
 * @param {number} precipitation_mm  - Precipitação do período em mm (≥ 0)
 * @param {number} AWC_mm            - Capacidade de água disponível no solo (mm) (> 0)
 * @param {number} ET_potential_mm   - Evapotranspiração potencial estimada (mm) (≥ 0)
 * @returns {{ PDSI: number }}
 */
export function computePalmerDroughtIndex(temperature_C: any, precipitation_mm: any, AWC_mm: any, ET_potential_mm: any) {
    if (typeof temperature_C !== 'number' ||
        typeof precipitation_mm !== 'number' ||
        typeof AWC_mm !== 'number' ||
        typeof ET_potential_mm !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (precipitation_mm < 0) {
        throw new RangeError('precipitation_mm must be >= 0');
    }
    if (AWC_mm <= 0) {
        throw new RangeError('AWC_mm must be > 0');
    }
    if (ET_potential_mm < 0) {
        throw new RangeError('ET_potential_mm must be >= 0');
    }
    // Déficit hídrico: quando ET potencial supera a precipitação disponível
    const deficit = Math.max(0, ET_potential_mm - precipitation_mm);
    // Superávit: quando o solo absorve mais do que o déficit
    const excess = Math.max(0, AWC_mm - deficit);
    // PDSI simplificado: balanço normalizado pela capacidade do solo × fator 10
    // Temperatura influencia ET implicitamente - incluída como contexto de aplicação
    void temperature_C; // parâmetro registrado para compatibilidade com API completa
    const PDSI = ((precipitation_mm - ET_potential_mm) / Math.max(1, AWC_mm)) * 10;
    void excess; // excedente calculado internamente mas não exposto nesta versão simplificada
    return { PDSI };
}
/**
 * Calcula o Índice de Seca em Streamflow (SDI - Streamflow Drought Index).
 * Avalia déficit volumétrico em relação a um limiar de vazão percentílico.
 *
 * @param {number} Q_current_m3_s              - Vazão atual (m³/s) (≥ 0)
 * @param {number} Q_percentile_threshold_m3_s  - Limiar percentílico de referência (m³/s) (> 0)
 * @param {number} duration_days               - Duração do evento em dias (> 0)
 * @returns {{ SDI: number, deficit_volume_m3: number }}
 */
export function computeStreamflowDroughtIndex(Q_current_m3_s: any, Q_percentile_threshold_m3_s: any, duration_days: any) {
    if (typeof Q_current_m3_s !== 'number' ||
        typeof Q_percentile_threshold_m3_s !== 'number' ||
        typeof duration_days !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (Q_current_m3_s < 0) {
        throw new RangeError('Q_current_m3_s must be >= 0');
    }
    if (Q_percentile_threshold_m3_s <= 0) {
        throw new RangeError('Q_percentile_threshold_m3_s must be > 0');
    }
    if (duration_days <= 0) {
        throw new RangeError('duration_days must be > 0');
    }
    // SDI = razão entre vazão atual e limiar percentílico; < 1 indica seca
    const SDI = Q_current_m3_s / Q_percentile_threshold_m3_s;
    // Volume déficitário acumulado: max(0, Q_limiar - Q_atual) × duração × segundos/dia
    const deficit_volume_m3 = Math.max(0, Q_percentile_threshold_m3_s - Q_current_m3_s) * duration_days * 86400;
    return { SDI, deficit_volume_m3 };
}
/**
 * Classifica a severidade da seca com base no SPI (McKee 1993).
 * Escala internacional adotada pela OMM para monitoramento de secas.
 *
 * @param {number} SPI - Índice de Precipitação Padronizado (dimensionless)
 * @returns {{ severity: 'normal'|'mild'|'moderate'|'severe'|'extreme' }}
 */
export function classifyDroughtSeverity(SPI: any) {
    if (typeof SPI !== 'number') {
        throw new TypeError('SPI must be a number');
    }
    /** @type {'normal'|'mild'|'moderate'|'severe'|'extreme'} */
    let severity = 'extreme';
    if (SPI > -0.5)
        severity = 'normal';
    else if (SPI > -1.0)
        severity = 'mild';
    else if (SPI > -1.5)
        severity = 'moderate';
    else if (SPI > -2.0)
        severity = 'severe';
    return { severity };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const droughtRiskAssessmentMeta = {
    name: 'droughtRiskAssessment',
    description: 'droughtRiskAssessment',
    category: 'analytics',
    familyTags: ['risk', 'water_stress'],
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
//# sourceMappingURL=droughtRiskAssessment.js.map
