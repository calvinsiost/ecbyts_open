// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Mine Closure Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Closure Assessment - Post-Closure Environmental Evaluation
 *
 * Módulo puro para avaliação de prontidão para fechamento de minas:
 * qualidade da água pós-fechamento, custos de reabilitação, plano de
 * monitoramento de longo prazo e índice de prontidão para fechamento.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ICMM (2019). Mine Closure: A Toolbox for Governments, 2nd ed.
 *     International Council on Mining & Metals, London.
 *     (Good practice guidelines for post-closure planning)
 *   - DNPM (2017). Portaria n.º 70.389, de 17 de maio de 2017.
 *     Departamento Nacional de Produção Mineral, Brazil.
 *     (Brazilian regulatory requirements for mine closure plans - PAF)
 *   - World Bank (2010). A Toolkit for Artisanal and Small-Scale Mining
 *     Communities - Mine Closure. Extractive Industries for Development Series.
 *     Washington, DC: The World Bank.
 *     (Rehabilitation cost benchmarks and community engagement metrics)
 *
 * @module mineClosureAssessment
 */

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
 * Base rehabilitation costs per vegetation type (R$/ha)
 * Custos base de reabilitação por tipo de vegetação (ICMM 2019)
 */
const REHAB_BASE_COSTS: Record<string, number> = {
    grassland: 15000,
    shrubland: 25000,
    forest: 35000,
};

/**
 * Monitoring plan configuration by risk level
 * Configuração do plano de monitoramento por nível de risco
 */
const MONITORING_CONFIG: Record<string, { monitoringYears: number; frequency: string }> = {
    high: { monitoringYears: 30, frequency: 'quarterly' },
    moderate: { monitoringYears: 20, frequency: 'semi-annually' },
    low: { monitoringYears: 10, frequency: 'annually' },
};

/**
 * Compute Post-Closure Water Quality - Natural Attenuation
 * Calcula a concentração de contaminantes após fechamento por atenuação natural.
 *
 * Formula: C(t) = C0 × (1 - NA/100)^t
 * where C0 = initial concentration (mg/L)
 *       NA = natural attenuation rate (%/yr)
 *       t  = time (years)
 *
 * @param initialConc_mg_L       - Initial contaminant concentration (mg/L); ≥0
 * @param naturalAttenuation_pct_yr - Natural attenuation rate (%/yr); [0, 100)
 * @param years                  - Projection period (years); >0
 * @returns
 */
export function computePostClosureWaterQuality(
    initialConc_mg_L: number,
    naturalAttenuation_pct_yr: number,
    years: number,
): { concentration_mg_L: number; meetsStandard: (standard: number) => boolean } {
    if (typeof initialConc_mg_L !== 'number' || initialConc_mg_L < 0) {
        throw new RangeError('initialConc_mg_L must be a non-negative number');
    }
    if (
        typeof naturalAttenuation_pct_yr !== 'number' ||
        naturalAttenuation_pct_yr < 0 ||
        naturalAttenuation_pct_yr >= 100
    ) {
        throw new RangeError('naturalAttenuation_pct_yr must be in range [0, 100)');
    }
    if (typeof years !== 'number' || years <= 0) {
        throw new RangeError('years must be a positive number');
    }

    // Modelo de decaimento exponencial discreto (atenuação natural)
    const decayFactor = 1 - naturalAttenuation_pct_yr / 100;
    const concentration_mg_L = initialConc_mg_L * Math.pow(decayFactor, years);

    return {
        concentration_mg_L,
        /**
         * Verifica se a concentração está dentro do padrão regulatório.
         * @param vegetationType - Padrão de qualidade da água (mg/L)
         * @returns
         */
        meetsStandard: (standard: number): boolean => concentration_mg_L <= standard,
    };
}

/**
 * Compute Rehabilitation Cost Estimate
 * Estima o custo total de reabilitação com multiplicadores de slope e acessibilidade.
 *
 * Base costs (R$/ha): grassland=15000, shrubland=25000, forest=35000.
 * Multipliers: slope>30% → ×1.5; accessibility<0.5 → ×1.3 (can stack).
 *
 * @param vegetationType         - Total disturbed area (ha); >0
 * @param vegetationType - Target revegetation type
 * @param vegetationType           - Average slope (%); ≥0
 * @param vegetationType   - Site accessibility score [0, 1] (1=full access)
 * @returns
 */
export function computeRehabilitationCost(
    disturbed_ha: number,
    vegetationType: 'grassland' | 'shrubland' | 'forest',
    slopeClass: number,
    accessibilityScore: number,
): { costPerHa: number; totalCost: number } {
    if (typeof disturbed_ha !== 'number' || disturbed_ha <= 0) {
        throw new RangeError('disturbed_ha must be a positive number');
    }
    if (!Object.prototype.hasOwnProperty.call(REHAB_BASE_COSTS, vegetationType)) {
        throw new TypeError(`vegetationType must be one of: ${Object.keys(REHAB_BASE_COSTS).join(', ')}`);
    }
    if (typeof slopeClass !== 'number' || slopeClass < 0) {
        throw new RangeError('slopeClass must be a non-negative number');
    }
    if (typeof accessibilityScore !== 'number' || accessibilityScore < 0 || accessibilityScore > 1) {
        throw new RangeError('accessibilityScore must be in range [0, 1]');
    }

    let costPerHa = REHAB_BASE_COSTS[vegetationType]!;

    // Multiplicador por declividade acentuada (>30%) - dificulta operações de campo
    if (slopeClass > 30) costPerHa *= 1.5;

    // Multiplicador por baixa acessibilidade (<0.5) - aumenta logística
    if (accessibilityScore < 0.5) costPerHa *= 1.3;

    return {
        costPerHa,
        totalCost: costPerHa * disturbed_ha,
    };
}

/**
 * Compute Long-Term Monitoring Plan
 * Gera plano de monitoramento de longo prazo baseado em nível de risco.
 *
 * Risk levels: high → 30yr/quarterly, moderate → 20yr/semi-annually, low → 10yr/annually.
 * Parameters are filtered to those required by regulatoryRequirements (if provided).
 *
 * @param contaminants            - List of contaminant names to monitor
 * @param riskLevel - Site risk classification
 * @param regulatoryRequirements - Optional list of required monitoring parameters
 * @returns
 */
export function computeLongTermMonitoringPlan(
    contaminants: string[],
    riskLevel: 'high' | 'moderate' | 'low',
    regulatoryRequirements: string[] = [],
): { monitoringYears: number; frequency: string; parameters: string[] } {
    if (!Array.isArray(contaminants) || contaminants.length === 0) {
        throw new TypeError('contaminants must be a non-empty array of strings');
    }
    if (!Object.prototype.hasOwnProperty.call(MONITORING_CONFIG, riskLevel)) {
        throw new TypeError(`riskLevel must be one of: ${Object.keys(MONITORING_CONFIG).join(', ')}`);
    }
    if (!Array.isArray(regulatoryRequirements)) {
        throw new TypeError('regulatoryRequirements must be an array');
    }

    const config = MONITORING_CONFIG[riskLevel]!;

    // Filtra contaminantes pelos requisitos regulatórios (se especificados)
    const parameters =
        regulatoryRequirements.length > 0
            ? contaminants.filter((c) => regulatoryRequirements.includes(c))
            : [...contaminants];

    return {
        monitoringYears: config.monitoringYears,
        frequency: config.frequency,
        parameters,
    };
}

/**
 * Classify Mine Closure Readiness
 * Avalia a prontidão para fechamento com média ponderada de quatro dimensões.
 *
 * Weights: stability=0.30, waterQuality=0.30, vegetation=0.20, community=0.20
 * Thresholds: ready ≥ 0.75, conditional ≥ 0.50, not_ready < 0.50
 *
 * @param stabilityScore    - Geotechnical stability score [0, 1]
 * @param waterQualityScore - Water quality compliance score [0, 1]
 * @param vegetationScore   - Revegetation success score [0, 1]
 * @param communityScore    - Community acceptance score [0, 1]
 * @returns
 */
export function classifyClosureReadiness(
    stabilityScore: number,
    waterQualityScore: number,
    vegetationScore: number,
    communityScore: number,
): { readiness: 'not_ready' | 'conditional' | 'ready'; score: number; gaps: string[] } {
    const scores = { stabilityScore, waterQualityScore, vegetationScore, communityScore };
    for (const [key, val] of Object.entries(scores)) {
        if (typeof val !== 'number' || val < 0 || val > 1) {
            throw new RangeError(`${key} must be a number in range [0, 1]`);
        }
    }

    // Ponderação conforme ICMM (2019) - estabilidade e qualidade da água são críticas
    const score = stabilityScore * 0.3 + waterQualityScore * 0.3 + vegetationScore * 0.2 + communityScore * 0.2;

    // Identificação de lacunas (scores abaixo de 0.75)
    const gaps: string[] = [];
    if (stabilityScore < 0.75) gaps.push('geotechnical_stability');
    if (waterQualityScore < 0.75) gaps.push('water_quality_compliance');
    if (vegetationScore < 0.75) gaps.push('revegetation_success');
    if (communityScore < 0.75) gaps.push('community_acceptance');

    let readiness: 'ready' | 'conditional' | 'not_ready';
    if (score >= 0.75) readiness = 'ready';
    else if (score >= 0.5) readiness = 'conditional';
    else readiness = 'not_ready';

    return { readiness, score, gaps };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineClosureAssessmentMeta: AnalyticsModuleMeta = {
    name: 'mineClosureAssessment',
    description: 'Mine Closure Assessment',
    category: 'analytics',
    familyTags: ['mining'],
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
