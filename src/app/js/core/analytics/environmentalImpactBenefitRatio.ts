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
 * Environmental Impact-Benefit Ratio Analytics
 *
 * Razão custo-benefício ambiental: valoração de serviços ecossistêmicos,
 * custo de mitigação e análise de custo-efetividade ambiental.
 *
 * References:
 *   US EPA (2023). Guidelines for Preparing Economic Analyses. EPA 240-R-10-001.
 *   CONAMA Resolução 1/1986 - Critérios básicos e diretrizes gerais para EIA.
 *   Pearce, D.W. & Turner, R.K. (1990). Economics of Natural Resources and the Environment.
 *     Johns Hopkins University Press. ISBN: 978-0-8018-3986-3.
 *   Costanza, R. et al. (1997). The value of the world's ecosystem services and natural capital.
 *     Nature, 387, 253-260. DOI: 10.1038/387253a0.
 *   de Groot, R. et al. (2012). Global estimates of the value of ecosystems and their services
 *     in monetary units. Ecosystem Services, 1(1), 50–61. DOI: 10.1016/j.ecoser.2012.07.005.
 *
 * @module environmentalImpactBenefitRatio
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

interface EcosystemServiceEntry {
    name: string;
    unitValueUsdHaYr: number;
    affectedAreaHa: number;
    impactFraction: number;
    yearsAffected: number;
}

// --- Helpers ---

/**
 * Validates a numeric value with optional bounds.
 * Valida valor numérico com limites opcionais.
 */
function validateNum(v: number, name: string, min = -Infinity, max = Infinity): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got ${v}`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got ${v}`);
    }
}

// --- Core exports ---

/**
 * Computes the total monetary value of affected ecosystem services.
 * Calcula o valor monetário total dos serviços ecossistêmicos afetados.
 *
 * Based on de Groot et al. (2012) biome-specific unit values (US$/ha/year)
 * adjusted by area and impact fraction.
 *
 * @param services - array of ecosystem service entries
 * @returns Total value (US$) and per-service breakdown.
 */
export function valuateEcosystemServices(services: EcosystemServiceEntry[]): {
    totalValueUsd: number;
    breakdown: { name: string; annualLossUsd: number; totalLossUsd: number }[];
} {
    if (!Array.isArray(services) || services.length === 0) {
        throw new TypeError('services must be a non-empty array');
    }

    let totalValueUsd = 0;
    const breakdown = services.map((s) => {
        if (typeof s.name !== 'string' || !s.name) throw new TypeError('service.name must be a non-empty string');
        validateNum(s.unitValueUsdHaYr, 'unitValueUsdHaYr', 0);
        validateNum(s.affectedAreaHa, 'affectedAreaHa', 0);
        validateNum(s.impactFraction, 'impactFraction', 0, 1);
        validateNum(s.yearsAffected, 'yearsAffected', 0);

        // Annual loss = unit_value × area × impact_fraction
        // Perda anual = valor unitário × área × fração de impacto
        const annualLossUsd = s.unitValueUsdHaYr * s.affectedAreaHa * s.impactFraction;
        const totalLossUsd = annualLossUsd * s.yearsAffected;
        totalValueUsd += totalLossUsd;
        return { name: s.name, annualLossUsd: +annualLossUsd.toFixed(2), totalLossUsd: +totalLossUsd.toFixed(2) };
    });

    return { totalValueUsd: +totalValueUsd.toFixed(2), breakdown };
}

/**
 * Calculates cost per unit of environmental impact mitigated.
 * Calcula o custo de mitigação por unidade de impacto ambiental evitado.
 *
 * @param opts.mitigationCostUsd  - total mitigation cost (US$)
 * @param opts.unitsOfImpact      - quantified impact units (e.g. tCO2eq, ha, mg/L·m³)
 * @returns Cost per unit and unit label.
 */
export function computeMitigationCostPerUnit({
    mitigationCostUsd,
    unitsOfImpact,
}: {
    mitigationCostUsd: number;
    unitsOfImpact: number;
}): { costPerUnit: number; unit: string } {
    validateNum(mitigationCostUsd, 'mitigationCostUsd', 0);
    validateNum(unitsOfImpact, 'unitsOfImpact', 0.001);

    const costPerUnit = mitigationCostUsd / unitsOfImpact;
    return { costPerUnit: +costPerUnit.toFixed(4), unit: 'USD/impact-unit' };
}

/**
 * Computes Net Environmental Benefit (NBA) and present value (VPLA).
 * Calcula o Benefício Líquido Ambiental (NBA) e valor presente ambiental (VPLA).
 *
 * NBA = total_benefit - total_cost
 * VPLA = Σ NBA_t / (1 + r)^t  for t = 1..years
 *
 * @param opts.totalBenefitUsd   - total environmental benefit (US$)
 * @param opts.totalCostUsd      - total mitigation/intervention cost (US$)
 * @param opts.discountRate      - social discount rate [0–1], e.g. 0.05 for 5%
 * @param opts.years             - project lifetime (years)
 * @returns NBA, VPLA and benefit-cost ratio.
 */
export function computeNetBenefit({
    totalBenefitUsd,
    totalCostUsd,
    discountRate,
    years,
}: {
    totalBenefitUsd: number;
    totalCostUsd: number;
    discountRate: number;
    years: number;
}): { nba: number; vpla: number; bcRatio: number | null } {
    validateNum(totalBenefitUsd, 'totalBenefitUsd', 0);
    validateNum(totalCostUsd, 'totalCostUsd', 0);
    validateNum(discountRate, 'discountRate', 0, 1);
    validateNum(years, 'years', 1);

    const nba = totalBenefitUsd - totalCostUsd;

    // VPLA: present value assuming uniform annual benefits and costs (EPA 2023 §4.3)
    // VPLA: valor presente com benefícios e custos anuais uniformes
    const annualNba = nba / years;
    let vpla = 0;
    for (let t = 1; t <= years; t++) {
        vpla += annualNba / Math.pow(1 + discountRate, t);
    }

    // Benefit-cost ratio - US EPA guidance: BCR > 1 = project economically justified
    // Razão benefício-custo - BCR > 1 indica projeto economicamente justificado
    const bcRatio = totalCostUsd > 0 ? totalBenefitUsd / totalCostUsd : Infinity;

    return {
        nba: +nba.toFixed(2),
        vpla: +vpla.toFixed(2),
        bcRatio: isFinite(bcRatio) ? +bcRatio.toFixed(4) : null,
    };
}

/**
 * Computes the Cost-Effectiveness Analysis (CEA) index.
 * Calcula o índice de custo-efetividade ambiental (CEA).
 *
 * CEA = total_cost / environmental_outcome_units
 * Lower CEA = better - indicates less cost per unit of environmental improvement.
 * Menor CEA = melhor - menor custo por unidade de melhoria ambiental.
 *
 * @param opts.totalCostUsd          - total project cost (US$)
 * @param opts.environmentalOutcome  - quantified positive environmental outcome
 * @param opts.outcomeUnit - label for the outcome unit (default 'unit')
 * @returns CEA index, outcome unit and interpretation.
 */
export function computeCeaIndex({
    totalCostUsd,
    environmentalOutcome,
    outcomeUnit = 'unit',
}: {
    totalCostUsd: number;
    environmentalOutcome: number;
    outcomeUnit?: string;
}): { ceaIndexUsdPerUnit: number; outcomeUnit: string; interpretation: string } {
    validateNum(totalCostUsd, 'totalCostUsd', 0);
    validateNum(environmentalOutcome, 'environmentalOutcome', 0.001);

    const ceaIndexUsdPerUnit = totalCostUsd / environmentalOutcome;
    let interpretation: string;
    if (ceaIndexUsdPerUnit < 100) interpretation = 'highly_cost_effective';
    else if (ceaIndexUsdPerUnit < 1000) interpretation = 'cost_effective';
    else if (ceaIndexUsdPerUnit < 10000) interpretation = 'marginally_cost_effective';
    else interpretation = 'not_cost_effective';

    return {
        ceaIndexUsdPerUnit: +ceaIndexUsdPerUnit.toFixed(4),
        outcomeUnit,
        interpretation,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalImpactBenefitRatioMeta: AnalyticsModuleMeta = {
    name: 'environmentalImpactBenefitRatio',
    description: 'environmentalImpactBenefitRatio',
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
