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
 * Air Quality Health Impact - Impacto a Saude por Qualidade do Ar
 *
 * References / Referencias:
 *   - WHO (2021). WHO Global Air Quality Guidelines. ISBN 978-92-4-003422-8
 *     https://www.who.int/publications/i/item/9789240034228
 *   - GBD 2019 Risk Factors Collaborators (2020). Global burden of 87 risk factors.
 *     Lancet 396(10258):1223-1249. DOI: 10.1016/S0140-6736(20)30752-2
 *   - Burnett, R. et al. (2018). Global estimates of mortality from long-term
 *     exposure to outdoor fine particle pollution. PNAS 115(38):9592-9597.
 *     DOI: 10.1073/pnas.1803222115 (Global Exposure Mortality Model - GEMM)
 *   - Cohen, A.J. et al. (2017). GBD 2015 Risk Factors. Lancet 389:1907-1960.
 *     DOI: 10.1016/S0140-6736(17)32366-8
 *
 * Zero DOM/IDB/Three.js/fetch dependencies - pure math module.
 * Sem dependencias de DOM/IDB/Three.js/fetch - modulo de matematica pura.
 *
 * @module airQualityHealthImpact
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
 * WHO AQG annual mean guideline values (ug/m3)
 * Valores-guia anuais da OMS (WHO AQGs 2021)
 */
const WHO_GUIDELINES = {
    pm25: 5, // ug/m3 annual mean (WHO 2021, reduced from 10 ug/m3 in 2005)
    pm10: 15, // ug/m3 annual mean
    o3: 60, // ug/m3 peak season mean (8-hour)
    no2: 10, // ug/m3 annual mean
};

/**
 * Concentration-response function coefficients for PM2.5 mortality (GEMM model)
 * Coeficientes da funcao concentracao-resposta para mortalidade por PM2.5 (modelo GEMM)
 * Based on Burnett et al. (2018), Table S4 for non-communicable diseases (NCD+LRI)
 *
 * hazard(c) = exp(theta * ln(1 + (c - cf) / alpha) / (1 + exp(-(c - mu) / nu)))
 * Simplified linear approximation used here for computational tractability:
 * hazardRatio ≈ 1 + beta * (c - cf) for c > cf
 */
const GEMM_PM25 = {
    cf: 2.4, // counterfactual concentration (ug/m3) — below which no added risk
    beta: 0.013, // approx. excess risk per ug/m3 above cf (linearized, NCD+LRI)
};

/** Baseline annual mortality rate (deaths/100k) — global average circa GBD 2019 */
const BASELINE_MORTALITY_PER_100K = 750;

/** Disability weight for chronic respiratory disease (GBD 2019, Table S6) */
const DISABILITY_WEIGHT_RESPIRATORY = 0.379;

/** Years lived with disability per premature death (YLD/death, approximate) */
const YLD_PER_DEATH = 2.1;

/**
 * Compute attributable fraction (AF) of mortality due to PM2.5 exposure
 * Fracao atribuivel (FA) de mortalidade por exposicao a PM2.5
 *
 * AF = (HR - 1) / HR, where HR = hazard ratio relative to counterfactual
 * Linearized GEMM approximation for annual mean concentrations.
 *
 * @param pm25Concentration - Annual mean PM2.5 (ug/m3)
 * @returns Attributable fraction [0, 1]
 * @throws {RangeError} if concentration is negative
 */
export function pm25AttributableFraction(pm25Concentration: number): number {
    if (pm25Concentration < 0) throw new RangeError('Concentracao de PM2.5 deve ser >= 0 ug/m3');
    const excess = Math.max(0, pm25Concentration - GEMM_PM25.cf);
    const hr = 1 + GEMM_PM25.beta * excess;
    return (hr - 1) / hr;
}

/**
 * Estimate premature mortality attributable to PM2.5 (deaths per 100k/year)
 * Mortalidade prematura atribuivel ao PM2.5 (mortes/100k/ano)
 *
 * @param pm25Concentration - Annual mean PM2.5 (ug/m3)
 * @param baselineMortality - Baseline mortality rate (deaths/100k/year)
 * @returns Attributable deaths per 100,000 persons per year
 * @throws {RangeError} on invalid inputs
 */
export function pm25PrematureMortality(
    pm25Concentration: number,
    baselineMortality: number = BASELINE_MORTALITY_PER_100K,
): number {
    if (pm25Concentration < 0) throw new RangeError('Concentracao de PM2.5 deve ser >= 0 ug/m3');
    if (baselineMortality <= 0) throw new RangeError('Taxa de mortalidade basal deve ser > 0');
    const af = pm25AttributableFraction(pm25Concentration);
    return af * baselineMortality;
}

/**
 * Estimate Disability-Adjusted Life Years (DALYs) per 100k from PM2.5
 * Anos de vida perdidos ajustados por incapacidade (DALYs/100k) por PM2.5
 *
 * DALY = YLL + YLD
 * YLL (years of life lost) = premature deaths * life expectancy at death (~15 years avg)
 * YLD (years lived with disability) = deaths * YLD_PER_DEATH * disability_weight
 *
 * @param pm25Concentration - Annual mean PM2.5 (ug/m3)
 * @param baselineMortality - Baseline mortality (deaths/100k/year)
 * @param lifeExpectancyAtDeath - Average years of life lost per premature death
 * @returns DALYs per 100k/year
 * @throws {RangeError} on invalid inputs
 */
export function dalysFromPm25(
    pm25Concentration: number,
    baselineMortality: number = BASELINE_MORTALITY_PER_100K,
    lifeExpectancyAtDeath: number = 15,
): { yll: number; yld: number; daly: number } {
    if (lifeExpectancyAtDeath <= 0) throw new RangeError('Expectativa de vida ao morrer deve ser > 0');
    const prematureDeaths = pm25PrematureMortality(pm25Concentration, baselineMortality);
    const yll = prematureDeaths * lifeExpectancyAtDeath;
    const yld = prematureDeaths * YLD_PER_DEATH * DISABILITY_WEIGHT_RESPIRATORY;
    return { yll, yld, daly: yll + yld };
}

/**
 * Estimate economic health cost per capita due to air pollution (USD/person/year)
 * Custo economico de saude per capita por poluicao do ar (USD/habitante/ano)
 *
 * Uses Value of Statistical Life (VSL) approach, conservative estimate.
 * Usa abordagem do Valor de Vida Estatistica (VSL) - estimativa conservadora.
 * VSL reference: USD 1.5M (World Bank low-income, 2019 PPP)
 *
 * @param pm25Concentration - Annual mean PM2.5 (ug/m3)
 * @param population        - Population size
 * @param vsl     - Value of statistical life (USD)
 * @param baselineMortality - Baseline mortality (deaths/100k/year)
 * @throws {RangeError} on invalid inputs
 */
export function economicHealthCost(
    pm25Concentration: number,
    population: number,
    vsl: number = 1_500_000,
    baselineMortality: number = BASELINE_MORTALITY_PER_100K,
): { attributableDeaths: number; totalCostUSD: number; perCapitaCostUSD: number } {
    if (population <= 0) throw new RangeError('Populacao deve ser > 0');
    if (vsl <= 0) throw new RangeError('VSL deve ser > 0');
    const deathsPer100k = pm25PrematureMortality(pm25Concentration, baselineMortality);
    const attributableDeaths = (deathsPer100k / 100_000) * population;
    const totalCostUSD = attributableDeaths * vsl;
    const perCapitaCostUSD = totalCostUSD / population;
    return { attributableDeaths, totalCostUSD, perCapitaCostUSD };
}

/**
 * WHO guideline exceedance report for multiple pollutants
 * Relatorio de excedencia das diretrizes da OMS para multiplos poluentes
 *
 * @param concentrations - Map of pollutant to concentration (ug/m3)
 */
export function whoGuidelineExceedance(
    concentrations: { pm25?: number; pm10?: number; o3?: number; no2?: number },
): Array<{ pollutant: string; measured: number; guideline: number; ratio: number; exceeds: boolean }> {
    if (!concentrations || typeof concentrations !== 'object') {
        throw new TypeError('concentrations deve ser um objeto com chaves de poluentes');
    }
    return Object.entries(concentrations)
        .filter(([key]) => key in WHO_GUIDELINES)
        .map(([pollutant, measured]) => {
            if (typeof measured !== 'number' || measured < 0) {
                throw new RangeError(`Concentracao de ${pollutant} deve ser numero >= 0`);
            }
            const guideline = (WHO_GUIDELINES as Record<string, number>)[pollutant] as number;
            const ratio = measured / guideline;
            return { pollutant, measured, guideline, ratio, exceeds: measured > guideline };
        });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityHealthImpactMeta: AnalyticsModuleMeta = {
    name: 'airQualityHealthImpact',
    description: 'airQualityHealthImpact',
    category: 'analytics',
    familyTags: ['air'],
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
