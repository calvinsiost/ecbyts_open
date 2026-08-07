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
// Environmental Health Score - integrated exposure, vulnerability, and environmental justice index
// Score de saúde ambiental - índice integrado de exposição, vulnerabilidade e justiça ambiental
'use strict';
/**
 * Computes composite exposure score from pollutant concentrations relative to references.
 * Calcula o score de exposição composto a partir das concentrações de poluentes vs. referências.
 *
 * score = mean(Ci / RVi)
 * exceedances = count(Ci > RVi)
 *
 * @param {number[]} pollutant_concentrations - Array of measured concentrations
 * @param {number[]} reference_values - Array of regulatory reference values (must be > 0)
 * @returns {{ score: number, exceedances: number }}
 *
 * @references
 *   EPA (2023). EJScreen Technical Documentation v2.3. US Environmental Protection Agency.
 *   WHO (2010). Environment and Health Risks: A Review of the Influence and Effects of Social Inequities. WHO/UNEP.
 */
export function computeExposureScore(pollutant_concentrations: any, reference_values: any) {
    if (!Array.isArray(pollutant_concentrations) || !Array.isArray(reference_values)) {
        throw new TypeError('pollutant_concentrations and reference_values must be arrays');
    }
    if (pollutant_concentrations.length === 0)
        throw new RangeError('Arrays must not be empty');
    if (pollutant_concentrations.length !== reference_values.length) {
        throw new RangeError('pollutant_concentrations and reference_values must have the same length');
    }
    // Validar cada par de valores
    for (let i = 0; i < reference_values.length; i++) {
        if (typeof pollutant_concentrations[i] !== 'number') {
            throw new TypeError(`pollutant_concentrations[${i}] must be a number`);
        }
        if (typeof reference_values[i] !== 'number' || reference_values[i] <= 0) {
            throw new RangeError(`reference_values[${i}] must be a positive number`);
        }
        if (pollutant_concentrations[i] < 0) {
            throw new RangeError(`pollutant_concentrations[${i}] must be >= 0`);
        }
    }
    // Score = média dos quocientes Ci/RVi (ratio of concentration to reference)
    let sum = 0;
    let exceedances = 0;
    for (let i = 0; i < pollutant_concentrations.length; i++) {
        const ratio = pollutant_concentrations[i] / reference_values[i];
        sum += ratio;
        if (pollutant_concentrations[i] > reference_values[i])
            exceedances++;
    }
    const score = sum / pollutant_concentrations.length;
    return { score, exceedances };
}
/**
 * Computes vulnerability index from socioeconomic and health-access indicators.
 * Calcula o índice de vulnerabilidade por indicadores socioeconômicos e acesso à saúde.
 *
 * VI = (age_pct/20 + poverty_pct/30 + (1 − healthcare_score) + (1 − green_pct/30)) / 4
 *
 * @param {number} age_pct_over65 - Percentage of population over 65 years old (%)
 * @param {number} poverty_pct - Percentage of population below poverty line (%)
 * @param {number} healthcare_access_score - Healthcare access score [0, 1]; 1 = full access
 * @param {number} green_area_pct - Green area as percentage of total area (%)
 * @returns {{ vi: number, category: 'low'|'moderate'|'high'|'very_high' }}
 *
 * @references
 *   CalEPA (2022). CalEnviroScreen 4.0 Methodology. Office of Environmental Health Hazard Assessment.
 *   Morello-Frosch, R. et al. (2011). Am J Public Health DOI:10.2105/AJPH.2010.300166.
 */
function _validateVulnerabilityIndex(
    age_pct_over65: any,
    poverty_pct: any,
    healthcare_access_score: any,
    green_area_pct: any,
): void {
    if (typeof age_pct_over65 !== 'number' ||
        typeof poverty_pct !== 'number' ||
        typeof healthcare_access_score !== 'number' ||
        typeof green_area_pct !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (age_pct_over65 < 0 || age_pct_over65 > 100) {
        throw new RangeError('age_pct_over65 must be in [0, 100]');
    }
    if (poverty_pct < 0 || poverty_pct > 100) {
        throw new RangeError('poverty_pct must be in [0, 100]');
    }
    if (healthcare_access_score < 0 || healthcare_access_score > 1) {
        throw new RangeError('healthcare_access_score must be in [0, 1]');
    }
    if (green_area_pct < 0 || green_area_pct > 100) {
        throw new RangeError('green_area_pct must be in [0, 100]');
    }
}

export function computeVulnerabilityIndex(age_pct_over65: any, poverty_pct: any, healthcare_access_score: any, green_area_pct: any) {
    _validateVulnerabilityIndex(age_pct_over65, poverty_pct, healthcare_access_score, green_area_pct);
    // Cada componente normalizado para [0, 1] aproximado
    // age: referência 20% (proporção representativa de idosos em regiões vulneráveis)
    // poverty: referência 30%
    // healthcare: invertido (0=sem acesso → vulnerável)
    // green: referência 30% (OMS recomenda ≥30% de área verde por habitante)
    const c_age = Math.min(age_pct_over65 / 20, 1);
    const c_poverty = Math.min(poverty_pct / 30, 1);
    const c_health = 1 - healthcare_access_score;
    const c_green = 1 - Math.min(green_area_pct / 30, 1);
    const vi = (c_age + c_poverty + c_health + c_green) / 4;
    return { vi, category: _categoryFromVI(vi) };
}

function _categoryFromVI(vi: number): 'low' | 'moderate' | 'high' | 'very_high' {
    if (vi >= 0.75) return 'very_high';
    if (vi >= 0.5) return 'high';
    if (vi >= 0.25) return 'moderate';
    return 'low';
}
/**
 * Computes the integrated Environmental Health Score (EHS).
 * Calcula o score integrado de saúde ambiental (EHS).
 *
 * EHS = exposure_score × (1 + vulnerability_index) × cumulative_impact_factor
 * Capped at 10.0 for percentile estimation.
 *
 * @param {number} exposure_score - From computeExposureScore (≥ 0)
 * @param {number} vulnerability_index - From computeVulnerabilityIndex [0, 1]
 * @param {number} cumulative_impact_factor - Multiplicative burden factor (≥ 1)
 * @returns {{ ehs: number, percentile_est: string }}
 *
 * @references
 *   EPA (2023). EJScreen Technical Documentation v2.3.
 *   CalEPA (2022). CalEnviroScreen 4.0 Methodology.
 */
function _validateEnvironmentalHealthScore(
    exposure_score: any,
    vulnerability_index: any,
    cumulative_impact_factor: any,
): void {
    if (typeof exposure_score !== 'number' ||
        typeof vulnerability_index !== 'number' ||
        typeof cumulative_impact_factor !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (exposure_score < 0)
        throw new RangeError('exposure_score must be >= 0');
    if (vulnerability_index < 0 || vulnerability_index > 1) {
        throw new RangeError('vulnerability_index must be in [0, 1]');
    }
    if (cumulative_impact_factor < 1) {
        throw new RangeError('cumulative_impact_factor must be >= 1');
    }
}

function _percentileFromEHS(ehs: number): string {
    if (ehs >= 9) return '>95th';
    if (ehs >= 7) return '80th–95th';
    if (ehs >= 5) return '60th–80th';
    if (ehs >= 3) return '40th–60th';
    if (ehs >= 1) return '20th–40th';
    return '<20th';
}

export function computeEnvironmentalHealthScore(exposure_score: any, vulnerability_index: any, cumulative_impact_factor: any) {
    _validateEnvironmentalHealthScore(exposure_score, vulnerability_index, cumulative_impact_factor);
    // EHS = exposição × (1 + vulnerabilidade) × fator cumulativo; cap em 10
    const raw = exposure_score * (1 + vulnerability_index) * cumulative_impact_factor;
    const ehs = Math.min(raw, 10);
    return { ehs, percentile_est: _percentileFromEHS(ehs) };
}
/**
 * Classifies Environmental Justice concern based on EHS and demographic burden.
 * Classifica a preocupação de Justiça Ambiental por EHS e carga demográfica.
 *
 * @param {number} ehs - Environmental Health Score from computeEnvironmentalHealthScore [0, 10]
 * @param {number} demographic_burden_score - Demographic burden index [0, 1]
 * @returns {{ ej_concern: boolean, priority_level: 'standard'|'elevated'|'priority'|'critical', recommendation: string }}
 *
 * @references
 *   EPA (2023). EJScreen Technical Documentation v2.3.
 *   Morello-Frosch, R. et al. (2011). Am J Public Health DOI:10.2105/AJPH.2010.300166.
 */
export function classifyEnvironmentalJustice(ehs: any, demographic_burden_score: any) {
    if (typeof ehs !== 'number' || typeof demographic_burden_score !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (ehs < 0 || ehs > 10)
        throw new RangeError('ehs must be in [0, 10]');
    if (demographic_burden_score < 0 || demographic_burden_score > 1) {
        throw new RangeError('demographic_burden_score must be in [0, 1]');
    }
    // Critério crítico: EHS > 7 E carga demográfica > 0.7 (EJScreen methodology)
    const ej_concern = ehs > 5 || demographic_burden_score > 0.5;
    /** @type {'standard'|'elevated'|'priority'|'critical'} */
    let priority_level;
    /** @type {string} */
    let recommendation;
    if (ehs > 7 && demographic_burden_score > 0.7) {
        priority_level = 'critical';
        recommendation = 'Immediate EJ review required; prioritize community engagement and regulatory action';
    }
    else if (ehs > 5 && demographic_burden_score > 0.5) {
        priority_level = 'priority';
        recommendation = 'Elevated EJ concern; develop community health impact assessment and mitigation plan';
    }
    else if (ehs > 3 || demographic_burden_score > 0.4) {
        priority_level = 'elevated';
        recommendation = 'Monitor EJ indicators; engage community in participatory risk communication';
    }
    else {
        priority_level = 'standard';
        recommendation = 'Continue routine environmental monitoring; no immediate EJ action required';
    }
    return { ej_concern, priority_level, recommendation };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalHealthScoreMeta = {
    name: 'environmentalHealthScore',
    description: 'environmentalHealthScore',
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
//# sourceMappingURL=environmentalHealthScore.js.map
