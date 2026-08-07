// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Hydraulic Fracturing Environmental Risk Analytics
// Analítica de risco ambiental do fraturamento hidráulico - uso de água, sismicidade induzida e integridade de poço.
// Refs: McGarr (2014) Science DOI:10.1126/science.1255802;
//       EPA (2016) Hydraulic Fracturing Study;
//       Davies et al. (2013) Marine Petrol Geol;
//       CONAMA 462/2014 (exploração petróleo em terra)

'use strict';

/**
 * Computes water usage intensity for hydraulic fracturing operations.
 * Calcula a intensidade hídrica do fraturamento hidráulico.
 *
 * @param {number} water_volume_m3 - Total water volume used in m³ (volume de água usado em m³), ≥ 0
 * @param {number} gas_production_GJ - Gas energy production in GJ (produção de gás em GJ), > 0
 * @returns {{ water_intensity_m3_GJ: number, category: string }}
 */
export function computeWaterUsageIntensity(water_volume_m3: number, gas_production_GJ: number) {
    if (typeof water_volume_m3 !== 'number' || typeof gas_production_GJ !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (water_volume_m3 < 0) throw new RangeError('water_volume_m3 must be >= 0');
    if (gas_production_GJ <= 0) throw new RangeError('gas_production_GJ must be > 0');

    const water_intensity_m3_GJ = water_volume_m3 / gas_production_GJ;

    let category;
    if (water_intensity_m3_GJ < 1) category = 'low';
    else if (water_intensity_m3_GJ < 5) category = 'moderate';
    else category = 'high';

    return { water_intensity_m3_GJ, category };
}

/**
 * Estimates induced seismicity risk from injection operations.
 * Estima o risco de sismicidade induzida por operações de injeção (McGarr 2014).
 *
 * @param {number} injection_volume_m3 - Total injected fluid volume in m³ (volume injetado em m³), > 0
 * @param {number} injection_rate_m3_min - Injection rate in m³/min (taxa de injeção em m³/min), > 0
 * @param {number} fault_proximity_km - Distance to nearest known fault in km (distância à falha mais próxima em km), ≥ 0
 * @returns {{ risk_score: number, magnitude_estimate: number, risk_level: string }}
 */
export function computeInducedSeismicityRisk(
    injection_volume_m3: number,
    injection_rate_m3_min: number,
    fault_proximity_km: number,
) {
    if (
        typeof injection_volume_m3 !== 'number' ||
        typeof injection_rate_m3_min !== 'number' ||
        typeof fault_proximity_km !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (injection_volume_m3 <= 0) throw new RangeError('injection_volume_m3 must be > 0');
    if (injection_rate_m3_min <= 0) throw new RangeError('injection_rate_m3_min must be > 0');
    if (fault_proximity_km < 0) throw new RangeError('fault_proximity_km must be >= 0');

    // Estimativa de magnitude máxima (McGarr 2014): Mmax = 0.67 × log10(V) - 1.5
    const magnitude_estimate = 0.67 * Math.log10(injection_volume_m3) - 1.5;

    // Score base proporcional ao volume e taxa de injeção
    let risk_score = injection_rate_m3_min * 0.1 + Math.log10(injection_volume_m3 + 1) * 0.5;

    // Proximidade de falha: < 5 km duplica o risco (influência direta na transmissão de pressão)
    if (fault_proximity_km < 5) risk_score *= 2;
    else if (fault_proximity_km < 15) risk_score *= 1.5;

    let risk_level;
    if (risk_score < 1) risk_level = 'negligible';
    else if (risk_score < 3) risk_level = 'low';
    else if (risk_score < 6) risk_level = 'moderate';
    else risk_level = 'high';

    return { risk_score, magnitude_estimate, risk_level };
}

/**
 * Computes well integrity risk score.
 * Calcula o score de integridade do poço para avaliação de risco de vazamento.
 *
 * @param {number} casing_age_years - Age of well casing in years (idade do revestimento em anos), ≥ 0
 * @param {number} cement_quality_score - Cement quality score [1, 5] (score de qualidade do cimento)
 * @param {boolean} pressure_test_passed - Whether pressure test was passed (se o teste de pressão foi aprovado)
 * @returns {{ integrity_score: number, risk: string }}
 */
export function computeWellIntegrityRisk(
    casing_age_years: number,
    cement_quality_score: number,
    pressure_test_passed: boolean,
) {
    if (typeof casing_age_years !== 'number' || typeof cement_quality_score !== 'number') {
        throw new TypeError('casing_age_years and cement_quality_score must be numbers');
    }
    if (typeof pressure_test_passed !== 'boolean') {
        throw new TypeError('pressure_test_passed must be a boolean');
    }
    if (casing_age_years < 0) throw new RangeError('casing_age_years must be >= 0');
    if (cement_quality_score < 1 || cement_quality_score > 5) {
        throw new RangeError('cement_quality_score must be in [1, 5]');
    }

    // Score de integridade: reduzido por idade e má qualidade do cimento
    const integrity_score = 100 - casing_age_years * 2 - (5 - cement_quality_score) * 10;

    let risk;
    if (!pressure_test_passed || integrity_score < 40) risk = 'critical';
    else if (integrity_score < 60) risk = 'high';
    else if (integrity_score < 80) risk = 'moderate';
    else risk = 'low';

    return { integrity_score, risk };
}

/**
 * Classifies the overall environmental risk of hydraulic fracturing operations.
 * Classifica o risco ambiental global do fraturamento hidráulico com recomendações de mitigação.
 *
 * @param {number} water_intensity - Water intensity category score from computeWaterUsageIntensity
 * @param {string} seismic_risk_level - Seismic risk level from computeInducedSeismicityRisk
 * @param {number} integrity_score - Well integrity score from computeWellIntegrityRisk
 * @param {number} methane_emissions_pct - Methane leak rate as % of production (taxa de vazamento de metano em %), [0, 100]
 * @returns {{ overall_risk: string, mitigation_required: string[] }}
 */
function validateFracturingEnvironmentalRiskInputs(
    water_intensity: number,
    seismic_risk_level: string,
    integrity_score: number,
    methane_emissions_pct: number,
): void {
    if (
        typeof water_intensity !== 'number' ||
        typeof seismic_risk_level !== 'string' ||
        typeof integrity_score !== 'number' ||
        typeof methane_emissions_pct !== 'number'
    ) {
        throw new TypeError('Invalid parameter types');
    }
    if (methane_emissions_pct < 0 || methane_emissions_pct > 100) {
        throw new RangeError('methane_emissions_pct must be in [0, 100]');
    }
}

function collectMitigationMeasures(
    is_critical: boolean,
    is_high_methane: boolean,
    is_high_water: boolean,
    is_moderate_seismic: boolean,
    integrity_score: number,
): string[] {
    const mitigation_required: string[] = [];

    if (is_critical) {
        mitigation_required.push('Immediate halt to injection operations pending review');
        mitigation_required.push('Emergency well integrity assessment and pressure logging');
    }
    if (is_high_methane) {
        mitigation_required.push(
            'Methane emissions control: green completions and LDAR program required (EPA 40 CFR Part 60 Subpart OOOO)',
        );
    }
    if (is_high_water) {
        mitigation_required.push('Water recycling and treatment program: target > 75% reuse');
    }
    if (is_moderate_seismic) {
        mitigation_required.push(
            'Traffic light protocol (TLP) for induced seismicity: reduce injection rate if M > 2.0',
        );
    }
    if (integrity_score < 60) {
        mitigation_required.push('Casing inspection and cement squeeze remediation before resuming operations');
    }

    return mitigation_required;
}

function determineOverallFracturingRisk(
    is_critical: boolean,
    is_high_methane: boolean,
    is_high_water: boolean,
    is_moderate_seismic: boolean,
    integrity_score: number,
): string {
    if (is_critical) return 'unacceptable';
    if (is_high_methane || is_high_water) return 'high';
    if (is_moderate_seismic || integrity_score < 80) return 'moderate';
    return 'low';
}

export function classifyFracturingEnvironmentalRisk(
    water_intensity: number,
    seismic_risk_level: string,
    integrity_score: number,
    methane_emissions_pct: number,
) {
    validateFracturingEnvironmentalRiskInputs(
        water_intensity,
        seismic_risk_level,
        integrity_score,
        methane_emissions_pct,
    );

    const is_critical = integrity_score < 40 || seismic_risk_level === 'high';
    const is_high_methane = methane_emissions_pct >= 1; // EPA 2016: < 1% aceitável
    const is_high_water = water_intensity >= 5;
    const is_moderate_seismic = seismic_risk_level === 'moderate';

    const mitigation_required = collectMitigationMeasures(
        is_critical,
        is_high_methane,
        is_high_water,
        is_moderate_seismic,
        integrity_score,
    );
    const overall_risk = determineOverallFracturingRisk(
        is_critical,
        is_high_methane,
        is_high_water,
        is_moderate_seismic,
        integrity_score,
    );

    return { overall_risk, mitigation_required };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const hydraulicFracturingRiskMeta = {
    name: 'hydraulicFracturingRisk',
    description: 'hydraulicFracturingRisk',
    category: 'analytics',
    familyTags: ['risk'],
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
