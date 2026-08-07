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
 * @module greenInfrastructureCostBenefit
 * @description Análise de custo-benefício de infraestrutura verde (Green Infrastructure, GI).
 * Implementa metodologias EPA (2014) e TEEB (2010) para valoração de serviços ecossistêmicos
 * e avaliação econômica de investimentos em GI (telhados verdes, biovaletas, wetlands construídas).
 *
 * References:
 *   - EPA (2014) Exploring the Multiple Benefits of Green Infrastructure.
 *     U.S. Environmental Protection Agency, Washington DC. EPA/600/R-14/170.
 *   - TEEB (2010) The Economics of Ecosystems and Biodiversity: Mainstreaming the Economics
 *     of Nature. UNEP/Earthscan. ISBN 978-1-84971-212-5.
 *   - Elmqvist T et al. (2015) Benefits of restoring ecosystem services in urban areas.
 *     Nature Communications 6:7423. DOI:10.1038/ncomms8495
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
 * Calcula o Valor Presente Líquido (VPL) de um projeto de infraestrutura verde.
 *
 * VPL = Σ(t=1 to T) [(B_t - C_t) / (1 + r)^t] - C_0
 *
 * onde B_t são benefícios anuais, C_t custos anuais, r taxa de desconto social e
 * C_0 é o custo inicial de implantação (incluído em costs_yr[0] ou separado).
 *
 * Para simplificação, assume fluxos anuais constantes (anuidade).
 *
 * @param benefits_yr   - Benefícios anuais totais (USD/ano), >= 0
 * @param costs_yr      - Custos anuais de O&M (USD/ano), >= 0
 * @param discountRate  - Taxa de desconto social anual (decimal, ex.: 0.05), [0, 0.30]
 * @param lifetime_yr   - Vida útil do projeto (anos), [1, 100]
 * @returns NPV_USD, annualNetBenefit_USD, breakEvenYear
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see EPA (2014) EPA/600/R-14/170 §3.2.
 * @see TEEB (2010) Ch. 5: Valuing the benefits of GI.
 */
export function calcNPVGreenInfrastructure(
    benefits_yr: number,
    costs_yr: number,
    discountRate: number,
    lifetime_yr: number,
): { NPV_USD: number; annualNetBenefit_USD: number; breakEvenYear: number | null } {
    if ([benefits_yr, costs_yr, discountRate, lifetime_yr].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (benefits_yr < 0) {
        throw new RangeError('benefits_yr must be non-negative');
    }
    if (costs_yr < 0) {
        throw new RangeError('costs_yr must be non-negative');
    }
    if (discountRate < 0 || discountRate > 0.3) {
        throw new RangeError('discountRate must be between 0 and 0.30');
    }
    if (lifetime_yr < 1 || lifetime_yr > 100 || !Number.isInteger(lifetime_yr)) {
        throw new RangeError('lifetime_yr must be an integer between 1 and 100');
    }

    const annualNetBenefit_USD = benefits_yr - costs_yr;
    let NPV_USD = 0;
    let breakEvenYear: number | null = null;
    let cumulativeNPV = 0;

    for (let t = 1; t <= lifetime_yr; t++) {
        const discountFactor = Math.pow(1 + discountRate, t);
        const presentValue = annualNetBenefit_USD / discountFactor;
        NPV_USD += presentValue;
        cumulativeNPV += presentValue;
        if (breakEvenYear === null && cumulativeNPV >= 0) {
            breakEvenYear = t;
        }
    }

    return {
        NPV_USD: +NPV_USD.toFixed(2),
        annualNetBenefit_USD: +annualNetBenefit_USD.toFixed(2),
        breakEvenYear,
    };
}

/**
 * Calcula a Relação Benefício-Custo (BCR) de um projeto de GI.
 *
 * BCR = VPL_benefícios / VPL_custos
 *
 * BCR > 1 → projeto é viável economicamente.
 *
 * @param NPV_benefits - VPL dos benefícios totais (USD), >= 0
 * @param NPV_costs    - VPL dos custos totais (USD), > 0
 * @returns BCR and netPresentValue_USD
 * @throws {RangeError} Se custos forem zero ou negativos
 *
 * @see TEEB (2010) Ch. 5. DOI:10.1038/ncomms8495 (Elmqvist et al. 2015)
 */
export function calcBenefitCostRatio(
    NPV_benefits: number,
    NPV_costs: number,
): { BCR: number; netPresentValue_USD: number } {
    if (typeof NPV_benefits !== 'number' || typeof NPV_costs !== 'number') {
        throw new TypeError('NPV values must be numbers');
    }
    if (!isFinite(NPV_benefits) || !isFinite(NPV_costs)) {
        throw new RangeError('NPV values must be finite');
    }
    if (NPV_costs <= 0) {
        throw new RangeError('NPV_costs must be positive');
    }
    if (NPV_benefits < 0) {
        throw new RangeError('NPV_benefits must be non-negative');
    }

    const BCR = NPV_benefits / NPV_costs;
    const netPresentValue_USD = NPV_benefits - NPV_costs;

    return {
        BCR: +BCR.toFixed(4),
        netPresentValue_USD: +netPresentValue_USD.toFixed(2),
    };
}

/**
 * Calcula o benefício anual monetário da redução de escoamento superficial
 * proporcionado pela infraestrutura verde (biovaletas, telhados verdes, wetlands).
 *
 * Benefício = reducaoEscoamento (m³/ano) × custoEvitado (USD/m³)
 *
 * O custo evitado inclui: tratamento de águas pluviais, danos por inundação e
 * custos de retrofit de infraestrutura cinza (EPA 2014, §4).
 *
 * @param runoffReduction_m3_yr - Redução anual de escoamento (m³/ano), >= 0
 * @param avoidedCost_per_m3    - Custo evitado por m³ de escoamento (USD/m³), > 0
 * @returns annualBenefit_USD and annualBenefit_BRL
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see EPA (2014) EPA/600/R-14/170 §4: Stormwater Management Benefits.
 */
export function calcStormwaterBenefit(
    runoffReduction_m3_yr: number,
    avoidedCost_per_m3: number,
): { annualBenefit_USD: number; annualBenefit_BRL: number } {
    if (typeof runoffReduction_m3_yr !== 'number' || typeof avoidedCost_per_m3 !== 'number') {
        throw new TypeError('Parameters must be numbers');
    }
    if (!isFinite(runoffReduction_m3_yr) || !isFinite(avoidedCost_per_m3)) {
        throw new RangeError('Parameters must be finite');
    }
    if (runoffReduction_m3_yr < 0) {
        throw new RangeError('runoffReduction_m3_yr must be non-negative');
    }
    if (avoidedCost_per_m3 <= 0) {
        throw new RangeError('avoidedCost_per_m3 must be positive');
    }

    const annualBenefit_USD = runoffReduction_m3_yr * avoidedCost_per_m3;
    // Conversão aproximada USD→BRL (referência taxa de câmbio de 2026)
    const USD_TO_BRL = 5.15;
    const annualBenefit_BRL = annualBenefit_USD * USD_TO_BRL;

    return {
        annualBenefit_USD: +annualBenefit_USD.toFixed(2),
        annualBenefit_BRL: +annualBenefit_BRL.toFixed(2),
    };
}

/**
 * Classifica a viabilidade de investimento em infraestrutura verde com base no BCR.
 *
 * | BCR            | Classificação   | Recomendação                              |
 * |----------------|-----------------|-------------------------------------------|
 * | < 1.0          | not_viable      | Custo supera benefícios; requer redesign   |
 * | 1.0 – 1.5      | marginal        | Marginalmente viável; sensibilidade alta   |
 * | 1.5 – 2.5      | viable          | Viável; análise de co-benefícios indicada  |
 * | > 2.5          | highly_viable   | Alta rentabilidade social; priorizar       |
 *
 * @param BCR - Relação benefício-custo calculada, >= 0
 * @returns viability classification
 * @throws {RangeError} Se BCR for negativo ou não numérico
 *
 * @see EPA (2014) §5: Decision Framework for GI investments.
 * @see Elmqvist et al. (2015) Nature Comm. 6:7423. DOI:10.1038/ncomms8495.
 */
export function classifyInvestmentViability(
    BCR: number,
): 'not_viable' | 'marginal' | 'viable' | 'highly_viable' {
    if (typeof BCR !== 'number' || !isFinite(BCR)) {
        throw new TypeError('BCR must be a finite number');
    }
    if (BCR < 0) {
        throw new RangeError('BCR must be non-negative');
    }

    if (BCR < 1.0) return 'not_viable';
    if (BCR < 1.5) return 'marginal';
    if (BCR < 2.5) return 'viable';
    return 'highly_viable';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const greenInfrastructureCostBenefitMeta: AnalyticsModuleMeta = {
    name: 'greenInfrastructureCostBenefit',
    description: 'greenInfrastructureCostBenefit',
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
