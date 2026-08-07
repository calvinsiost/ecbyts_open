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
 * Air Pollution Health Burden - Population Health Impact Assessment
 *
 * Módulo puro para avaliação do impacto sanitário da poluição do ar em populações.
 * Implementa métricas de exposição populacional, mortalidade atribuível, DALY e
 * classificação de carga de doença baseada no framework GBD 2019.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Anenberg, S. C. et al. (2010). "An Estimate of the Global Burden of
 *     Anthropogenic Ozone and Fine Particulate Matter on Premature Human
 *     Mortality Using Atmospheric Modeling." Environmental Health Perspectives,
 *     118(9), 1189–1195. DOI: 10.1289/ehp.0901226
 *   - GBD 2019 Risk Factors Collaborators (2020). "Global burden of 87 risk
 *     factors in 204 countries and territories, 1990–2019." The Lancet,
 *     396(10258), 1223–1249. DOI: 10.1016/S0140-6736(20)30752-2
 *   - WHO (2021). WHO Global Air Quality Guidelines: Particulate Matter (PM2.5
 *     and PM10), Ozone, Nitrogen Dioxide, Sulfur Dioxide and Carbon Monoxide.
 *     Geneva: World Health Organization. ISBN: 9789240034228
 *   - Murray, C. J. L. & Lopez, A. D. (1996). "Evidence-based health policy -
 *     lessons from the Global Burden of Disease Study." Science, 274, 740–743.
 *     DOI: 10.1126/science.274.5288.740
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

/**
 * Compute population exposure metric (person-hours × µg/m³).
 * Calcula a métrica de exposição populacional (pessoa-horas × µg/m³).
 *
 * Exposição = C × P × T
 *
 * Métrica de exposição integrada usada em avaliações HIA (Health Impact Assessment)
 * para comparar cenários de controle de emissões.
 *
 * @param concentration_ug_m3 - PM2.5 or pollutant concentration in µg/m³ / Concentração do poluente em µg/m³
 * @param population - Number of exposed individuals / Número de indivíduos expostos
 * @param exposure_hours - Duration of exposure in hours / Duração da exposição em horas
 * @returns Integrated population exposure
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If any parameter is negative
 */
export function computePopulationExposure(
    concentration_ug_m3: number,
    population: number,
    exposure_hours: number,
): { person_hours_ug_m3: number } {
    if (typeof concentration_ug_m3 !== 'number') throw new TypeError('concentration_ug_m3 must be a number');
    if (typeof population !== 'number') throw new TypeError('population must be a number');
    if (typeof exposure_hours !== 'number') throw new TypeError('exposure_hours must be a number');
    if (concentration_ug_m3 < 0) throw new RangeError('concentration_ug_m3 must be >= 0');
    if (population < 0) throw new RangeError('population must be >= 0');
    if (exposure_hours < 0) throw new RangeError('exposure_hours must be >= 0');

    // Métrica integrada de exposição populacional / Integrated population exposure metric
    const person_hours_ug_m3 = concentration_ug_m3 * population * exposure_hours;

    return { person_hours_ug_m3 };
}

/**
 * Compute air pollution attributable mortality using the relative risk approach.
 * Calcula mortalidade atribuível à poluição do ar pelo método de risco relativo.
 *
 * ΔRR = RR ^ ((C - C0) / 10)
 * PAF = (ΔRR - 1) / ΔRR
 * attributable_deaths = PAF × (baseline_mortality_per_100k / 100000) × population
 *
 * Onde C0 é a concentração de fundo (contrafactual), RR é o risco relativo por 10 µg/m³
 *
 * @param concentration_ug_m3 - Observed pollutant concentration in µg/m³
 * @param background_ug_m3 - Counterfactual (background) concentration in µg/m³
 * @param RR_per_10ug - Relative risk per 10 µg/m³ increment (e.g. 1.06 for PM2.5 all-cause)
 * @param population - Population size exposed
 * @param baseline_mortality_per_100k - Baseline mortality rate per 100,000 persons/year
 * @returns Estimated attributable deaths per year
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If concentration < background, RR <= 1, or other invalid values
 */
export function computeAttributableMortality(
    concentration_ug_m3: number,
    background_ug_m3: number,
    RR_per_10ug: number,
    population: number,
    baseline_mortality_per_100k: number,
): { attributable_deaths: number } {
    if (typeof concentration_ug_m3 !== 'number') throw new TypeError('concentration_ug_m3 must be a number');
    if (typeof background_ug_m3 !== 'number') throw new TypeError('background_ug_m3 must be a number');
    if (typeof RR_per_10ug !== 'number') throw new TypeError('RR_per_10ug must be a number');
    if (typeof population !== 'number') throw new TypeError('population must be a number');
    if (typeof baseline_mortality_per_100k !== 'number')
        throw new TypeError('baseline_mortality_per_100k must be a number');
    if (concentration_ug_m3 < 0) throw new RangeError('concentration_ug_m3 must be >= 0');
    if (background_ug_m3 < 0) throw new RangeError('background_ug_m3 must be >= 0');
    if (RR_per_10ug <= 1) throw new RangeError('RR_per_10ug must be > 1 (must represent increased risk)');
    if (population < 0) throw new RangeError('population must be >= 0');
    if (baseline_mortality_per_100k < 0) throw new RangeError('baseline_mortality_per_100k must be >= 0');

    if (concentration_ug_m3 <= background_ug_m3) {
        // Concentração não supera a linha de base: sem mortalidade atribuível
        return { attributable_deaths: 0 };
    }

    // Risco relativo para o excesso de concentração (Anenberg 2010, eq. 1)
    const delta_conc = concentration_ug_m3 - background_ug_m3;
    const deltaRR = Math.pow(RR_per_10ug, delta_conc / 10);

    // Fração atribuível na população (Population Attributable Fraction)
    const PAF = (deltaRR - 1) / deltaRR;

    // Mortalidade atribuível = PAF × taxa de mortalidade de base × população
    const attributable_deaths = PAF * (baseline_mortality_per_100k / 100000) * population;

    return { attributable_deaths };
}

/**
 * Compute Disability-Adjusted Life Years (DALY) from mortality and morbidity.
 * Calcula os Anos de Vida Ajustados por Incapacidade (DALY) considerando mortalidade e morbidade.
 *
 * DALY = YLL + YLD
 * YLL = deaths × YLL_per_death
 * YLD = morbidity_rate × population × YLD_per_case
 *
 * Onde YLL = Years of Life Lost, YLD = Years Lived with Disability
 *
 * @param attributable_deaths - Attributable deaths per year / Mortes atribuíveis por ano
 * @param YLL_per_death - Years of life lost per death / Anos de vida perdidos por morte
 * @param morbidity_rate - Morbidity incidence rate (0–1) / Taxa de incidência de morbidade
 * @param YLD_per_case - Years lived with disability per case / Anos de incapacidade por caso
 * @param population - Total exposed population / População exposta total
 * @returns Total disability-adjusted life years
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If any parameter is negative or morbidity_rate > 1
 */
export function computeDALY(
    attributable_deaths: number,
    YLL_per_death: number,
    morbidity_rate: number,
    YLD_per_case: number,
    population: number,
): { DALY: number } {
    if (typeof attributable_deaths !== 'number') throw new TypeError('attributable_deaths must be a number');
    if (typeof YLL_per_death !== 'number') throw new TypeError('YLL_per_death must be a number');
    if (typeof morbidity_rate !== 'number') throw new TypeError('morbidity_rate must be a number');
    if (typeof YLD_per_case !== 'number') throw new TypeError('YLD_per_case must be a number');
    if (typeof population !== 'number') throw new TypeError('population must be a number');
    if (attributable_deaths < 0) throw new RangeError('attributable_deaths must be >= 0');
    if (YLL_per_death < 0) throw new RangeError('YLL_per_death must be >= 0');
    if (morbidity_rate < 0 || morbidity_rate > 1) throw new RangeError('morbidity_rate must be in [0, 1]');
    if (YLD_per_case < 0) throw new RangeError('YLD_per_case must be >= 0');
    if (population < 0) throw new RangeError('population must be >= 0');

    // Anos de vida perdidos por mortalidade prematura / Years of Life Lost
    const YLL = attributable_deaths * YLL_per_death;

    // Anos vividos com incapacidade / Years Lived with Disability
    const YLD = morbidity_rate * population * YLD_per_case;

    const DALY = YLL + YLD;

    return { DALY };
}

/**
 * Classify health burden severity based on DALY per 100,000 persons.
 * Classifica a gravidade da carga de saúde com base em DALY por 100.000 pessoas.
 *
 * Thresholds (GBD 2019 framework, adapted for environmental health):
 *   negligible:  DALY/100k < 10
 *   low:         10 <= DALY/100k < 50
 *   moderate:    50 <= DALY/100k < 200
 *   high:        200 <= DALY/100k < 500
 *   critical:    DALY/100k >= 500
 *
 * @param DALY_per_100k - DALY per 100,000 persons / DALY por 100.000 pessoas
 * @returns Health burden classification
 * @throws {TypeError} If DALY_per_100k is not a number
 * @throws {RangeError} If DALY_per_100k is negative
 */
export function classifyHealthBurden(DALY_per_100k: number): { burden: string } {
    if (typeof DALY_per_100k !== 'number') throw new TypeError('DALY_per_100k must be a number');
    if (DALY_per_100k < 0) throw new RangeError('DALY_per_100k must be >= 0');

    let burden: string;
    if (DALY_per_100k < 10) {
        burden = 'negligible';
    } else if (DALY_per_100k < 50) {
        burden = 'low';
    } else if (DALY_per_100k < 200) {
        burden = 'moderate';
    } else if (DALY_per_100k < 500) {
        burden = 'high';
    } else {
        burden = 'critical';
    }

    return { burden };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airPollutionHealthBurdenMeta: AnalyticsModuleMeta = {
    name: 'airPollutionHealthBurden',
    description: 'airPollutionHealthBurden',
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
