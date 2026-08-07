// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Cost-Benefit Analysis Module
// Módulo de análise custo-benefício ambiental - VPL de projetos, externalidades e custo social do carbono.
//
// References / Referências:
// - Stern (2006) The Economics of Climate Change: The Stern Review, Cambridge University Press
// - US IWG (2021) Technical Support Document: Social Cost of Carbon, Methane, and Nitrous Oxide
// - OECD (2018) Cost-Benefit Analysis and the Environment: Further Developments and Policy Use
// - Hanley & Spash (1993) Cost-Benefit Analysis and the Environment, Edward Elgar Publishing

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
 * Compute NPV with and without environmental externalities.
 * Calcula VPL com e sem externalidades ambientais.
 *
 * @param cash_flows - Annual cash flows in USD / Fluxos de caixa anuais em USD
 * @param discount_rate - Annual discount rate (0–1) / Taxa de desconto anual (0–1)
 * @param externality_costs_per_year - Annual externality costs in USD / Custos externos anuais em USD
 * @returns NPV, NPV with externalities and externality burden (%).
 */
export function computeNPVWithExternalities(
    cash_flows: number[],
    discount_rate: number,
    externality_costs_per_year: number[],
): { npv_USD: number; npv_with_externalities_USD: number; externality_burden_pct: number } {
    if (!Array.isArray(cash_flows) || cash_flows.length === 0)
        throw new TypeError('cash_flows must be a non-empty array');
    if (!Array.isArray(externality_costs_per_year)) throw new TypeError('externality_costs_per_year must be an array');
    if (cash_flows.length !== externality_costs_per_year.length)
        throw new RangeError('cash_flows and externality_costs_per_year must have the same length');
    if (typeof discount_rate !== 'number' || discount_rate < 0 || discount_rate >= 1)
        throw new RangeError('discount_rate must be in [0, 1)');

    // VPL = Σ CF_t / (1+r)^t - t=0 para o primeiro período
    // NPV = Σ CF_t / (1+r)^t starting at t=0
    let npv_USD = 0;
    let npv_with_externalities_USD = 0;

    for (let t = 0; t < cash_flows.length; t++) {
        const cf = cash_flows[t];
        const ext = externality_costs_per_year[t];
        if (typeof cf !== 'number') throw new TypeError(`cash_flows[${t}] must be a number`);
        if (typeof ext !== 'number') throw new TypeError(`externality_costs_per_year[${t}] must be a number`);

        const discount_factor = Math.pow(1 + discount_rate, t);
        npv_USD += cf / discount_factor;
        npv_with_externalities_USD += (cf - ext) / discount_factor;
    }

    // Carga de externalidade: (VPL - VPL_ext) / |VPL| × 100
    const externality_burden_pct =
        npv_USD !== 0 ? ((npv_USD - npv_with_externalities_USD) / Math.abs(npv_USD)) * 100 : 0;

    return { npv_USD, npv_with_externalities_USD, externality_burden_pct };
}

/**
 * Compute the present value of the social cost of carbon emissions.
 * Calcula o valor presente do custo social das emissões de carbono.
 *
 * Default SCC: USD 190/tCO₂ - US IWG (2021) central estimate.
 * SCC padrão: USD 190/tCO₂ - estimativa central do US IWG (2021).
 *
 * @param emissions_tCO2eq - Total emissions in tonnes CO₂ equivalent / Emissões totais em toneladas de CO₂eq
 * @param scc_USD_tCO2 - Social cost of carbon per tonne (USD) / Custo social do carbono por tonelada (USD)
 * @param discount_rate - Annual discount rate (0–1) / Taxa de desconto anual (0–1)
 * @param time_horizon_yr - Time horizon in years / Horizonte temporal em anos
 * @returns Present value (USD) and annualized cost (USD/yr).
 */
export function computeSocialCostCarbon(
    emissions_tCO2eq: number,
    scc_USD_tCO2: number,
    discount_rate: number,
    time_horizon_yr: number,
): { present_value_USD: number; annualized_USD_yr: number } {
    if (typeof emissions_tCO2eq !== 'number' || emissions_tCO2eq < 0)
        throw new RangeError('emissions_tCO2eq must be >= 0');
    if (typeof scc_USD_tCO2 !== 'number' || scc_USD_tCO2 < 0) throw new RangeError('scc_USD_tCO2 must be >= 0');
    if (typeof discount_rate !== 'number' || discount_rate < 0 || discount_rate >= 1)
        throw new RangeError('discount_rate must be in [0, 1)');
    if (typeof time_horizon_yr !== 'number' || time_horizon_yr <= 0)
        throw new RangeError('time_horizon_yr must be a positive number');

    // Valor presente dos danos: emissões × SCC / (1+r)^(horizonte/2)
    // Desconto ao ponto médio do horizonte temporal (Stern 2006)
    const present_value_USD = (emissions_tCO2eq * scc_USD_tCO2) / Math.pow(1 + discount_rate, time_horizon_yr / 2);

    // Custo anualizado: PV × r / (1 - (1+r)^-n) - anuidade de valor presente
    const annualized_USD_yr =
        discount_rate > 0
            ? (present_value_USD * discount_rate) / (1 - Math.pow(1 + discount_rate, -time_horizon_yr))
            : present_value_USD / time_horizon_yr;

    return { present_value_USD, annualized_USD_yr };
}

/**
 * Compute benefit-cost ratio with and without environmental co-benefits.
 * Calcula a relação benefício-custo com e sem co-benefícios ambientais.
 *
 * @param total_benefits_USD - Total monetized project benefits (USD) / Benefícios totais monetizados do projeto
 * @param total_costs_USD - Total project costs (USD) / Custos totais do projeto
 * @param environmental_benefits_USD - Environmental co-benefits (USD) / Co-benefícios ambientais
 * @returns BCR, BCR with environment and recommendation.
 */
export function computeBenefitCostRatio(
    total_benefits_USD: number,
    total_costs_USD: number,
    environmental_benefits_USD: number,
): { bcr: number; bcr_with_environment: number; recommendation: 'proceed' | 'marginal' | 'reject' } {
    if (typeof total_benefits_USD !== 'number' || total_benefits_USD < 0)
        throw new RangeError('total_benefits_USD must be >= 0');
    if (typeof total_costs_USD !== 'number' || total_costs_USD <= 0)
        throw new RangeError('total_costs_USD must be a positive number (> 0)');
    if (typeof environmental_benefits_USD !== 'number' || environmental_benefits_USD < 0)
        throw new RangeError('environmental_benefits_USD must be >= 0');

    // BCR = benefícios / custos (OECD 2018, cap. 3)
    const bcr = total_benefits_USD / total_costs_USD;
    // BCR ambiental inclui co-benefícios ecossistêmicos e de saúde pública
    const bcr_with_environment = (total_benefits_USD + environmental_benefits_USD) / total_costs_USD;

    // Recomendação baseada no BCR ambiental expandido
    let recommendation: 'proceed' | 'marginal' | 'reject';
    if (bcr_with_environment > 1.5) {
        recommendation = 'proceed';
    } else if (bcr_with_environment >= 1.0) {
        recommendation = 'marginal';
    } else {
        recommendation = 'reject';
    }

    return { bcr, bcr_with_environment, recommendation };
}

function validateViabilityInputs(
    npv_USD: number,
    bcr: number,
    payback_years: number,
    carbon_neutrality_yr: number,
): void {
    if (typeof npv_USD !== 'number') throw new TypeError('npv_USD must be a number');
    if (typeof bcr !== 'number' || bcr < 0) throw new RangeError('bcr must be >= 0');
    if (typeof payback_years !== 'number' || payback_years <= 0)
        throw new RangeError('payback_years must be a positive number');
    if (typeof carbon_neutrality_yr !== 'number' || carbon_neutrality_yr <= 0)
        throw new RangeError('carbon_neutrality_yr must be a positive number');
}

function computeViabilityLevel(
    npv_USD: number,
    bcr: number,
    payback_years: number,
    carbon_neutrality_yr: number,
): 'excellent' | 'good' | 'marginal' | 'poor' {
    // Excellent: VPL > 0 E BCR > 2 E payback < 5 E carbon_neutral < 10
    // Good: VPL > 0 E BCR > 1.5 E payback < 10 E carbon_neutral < 20
    // Marginal: VPL > 0 OU BCR > 1
    // Poor: todos os demais
    if (npv_USD > 0 && bcr > 2 && payback_years < 5 && carbon_neutrality_yr < 10) {
        return 'excellent';
    }
    if (npv_USD > 0 && bcr > 1.5 && payback_years < 10 && carbon_neutrality_yr < 20) {
        return 'good';
    }
    if (npv_USD > 0 || bcr > 1) {
        return 'marginal';
    }
    return 'poor';
}

function computeEsgScore(
    payback_years: number,
    bcr: number,
    carbon_neutrality_yr: number,
): number {
    const payback_score = Math.min(10, (1 / payback_years) * 10);
    const bcr_score = Math.min(10, bcr);
    const carbon_score = Math.min(10, (1 / carbon_neutrality_yr) * 20);
    return 0.4 * payback_score + 0.3 * bcr_score + 0.3 * carbon_score;
}

/**
 * Classify overall project viability integrating financial and ESG dimensions.
 * Classifica a viabilidade geral do projeto integrando dimensões financeiras e de ESG.
 *
 * @param npv_USD - Net present value (USD) / Valor presente líquido (USD)
 * @param bcr - Benefit-cost ratio / Relação benefício-custo
 * @param payback_years - Payback period in years / Período de payback em anos
 * @param carbon_neutrality_yr - Years to carbon neutrality / Anos para neutralidade de carbono
 * @returns Viability, ESG score and investment grade flag.
 */
export function classifyProjectViability(
    npv_USD: number,
    bcr: number,
    payback_years: number,
    carbon_neutrality_yr: number,
): { viability: 'excellent' | 'good' | 'marginal' | 'poor'; esg_score: number; investment_grade: boolean } {
    validateViabilityInputs(npv_USD, bcr, payback_years, carbon_neutrality_yr);

    const viability = computeViabilityLevel(npv_USD, bcr, payback_years, carbon_neutrality_yr);
    const esg_score = computeEsgScore(payback_years, bcr, carbon_neutrality_yr);
    const investment_grade = (viability === 'excellent' || viability === 'good') && esg_score > 5;

    return { viability, esg_score, investment_grade };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalCostBenefitMeta: AnalyticsModuleMeta = {
    name: 'environmentalCostBenefit',
    description: 'environmentalCostBenefit',
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
