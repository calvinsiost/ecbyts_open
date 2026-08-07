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
 * Environmental Epidemiology Metrics - Attributable fraction, DALYs and collective health indicators
 * Métricas de Epidemiologia Ambiental - fração atribuível, DALYs e indicadores de saúde coletiva
 *
 * References / Referências:
 * - Murray & Lopez (1997) Lancet DOI:10.1016/S0140-6736(96)07495-8 - Global Burden of Disease
 * - WHO (2016) Global Health Estimates - Disease burden thresholds
 * - Levin (1953) Acta Unio Internationalis Contra Cancrum - Population Attributable Fraction
 * - Prüss-Üstün & Corvalán (2006) WHO - Preventing Disease Through Healthy Environments
 *
 * @module environmentalEpidemiologyMetrics
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

type DalyBurden = 'negligible' | 'low' | 'moderate' | 'high' | 'critical';

// WHO (2016) DALY burden thresholds per 1000 population per year
/** @type {Array<{max: number, burden: 'negligible'|'low'|'moderate'|'high', percentile_est: string}>} */
const DALY_THRESHOLDS: Array<{
    max: number;
    burden: 'negligible' | 'low' | 'moderate' | 'high';
    percentile_est: string;
}> = [
    { max: 1, burden: 'negligible', percentile_est: '< 10th percentile globally' },
    { max: 5, burden: 'low', percentile_est: '10–30th percentile globally' },
    { max: 20, burden: 'moderate', percentile_est: '30–60th percentile globally' },
    { max: 50, burden: 'high', percentile_est: '60–85th percentile globally' },
];
/** @type {{burden: 'critical', percentile_est: string}} */
const DALY_CRITICAL: { burden: 'critical'; percentile_est: string } = {
    burden: 'critical',
    percentile_est: '> 85th percentile globally',
};

/**
 * Compute Population Attributable Fraction (PAF) for an environmental exposure.
 * Calcula a Fração Atribuível Populacional (PAF) de uma exposição ambiental.
 *
 * PAF = [Pe × (RR − 1)] / [1 + Pe × (RR − 1)]   (Levin, 1953)
 *
 * Interpreta-se como a proporção de casos que seriam evitados se a exposição fosse eliminada.
 *
 * @param {number} relative_risk - Relative risk (RR ≥ 1.0)
 * @param {number} exposed_fraction - Proportion of population exposed (0–1)
 * @returns {{ af: number, af_pct: number }}
 */
export function computeAttributableFraction(
    relative_risk: number,
    exposed_fraction: number,
): { af: number; af_pct: number } {
    if (typeof relative_risk !== 'number' || typeof exposed_fraction !== 'number') {
        throw new TypeError('relative_risk and exposed_fraction must be numbers');
    }
    if (relative_risk < 1) {
        throw new RangeError('relative_risk must be >= 1 (protective exposures not supported by this formula)');
    }
    if (exposed_fraction < 0 || exposed_fraction > 1) {
        throw new RangeError('exposed_fraction must be in [0, 1]');
    }

    // Caso especial: sem exposição ou sem risco adicional → PAF = 0
    if (exposed_fraction === 0 || relative_risk === 1) {
        return { af: 0, af_pct: 0 };
    }

    // Fórmula de Levin (1953): denominator evita divisão por zero quando Pe=0
    const numerator = exposed_fraction * (relative_risk - 1);
    const af = numerator / (1 + numerator);
    const af_pct = af * 100;

    return { af, af_pct };
}

/**
 * Compute Disability-Adjusted Life Years (DALYs).
 * Calcula os Anos de Vida Ajustados por Incapacidade (DALYs).
 *
 * DALY = YLL + YLD   (Murray & Lopez, 1997)
 * YLL = years of life lost to premature mortality
 * YLD = years lived with disability (weighted by severity)
 *
 * @param {number} yll_years - Years of life lost (premature mortality)
 * @param {number} yld_years - Years lived with disability
 * @returns {{ daly: number }}
 */
export function computeDALY(yll_years: number, yld_years: number): { daly: number } {
    if (typeof yll_years !== 'number' || typeof yld_years !== 'number') {
        throw new TypeError('yll_years and yld_years must be numbers');
    }
    if (yll_years < 0) throw new RangeError('yll_years must be >= 0');
    if (yld_years < 0) throw new RangeError('yld_years must be >= 0');

    return { daly: yll_years + yld_years };
}

/**
 * Compute excess risk attributable to an environmental factor in a population.
 * Calcula o risco em excesso atribuível a um fator ambiental em uma população.
 *
 * excess_cases = population × background_rate × (RR − 1) / 100 000
 *
 * @param {number} background_rate_per_100k - Background incidence rate (cases per 100,000/yr)
 * @param {number} rr_environmental - Relative risk from environmental exposure (≥ 1)
 * @param {number} population - Total population size
 * @returns {{ excess_cases: number, excess_rate_per_100k: number }}
 */
export function computeExcessRisk(
    background_rate_per_100k: number,
    rr_environmental: number,
    population: number,
): { excess_cases: number; excess_rate_per_100k: number } {
    if ([background_rate_per_100k, rr_environmental, population].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (background_rate_per_100k < 0) throw new RangeError('background_rate_per_100k must be >= 0');
    if (rr_environmental < 1) throw new RangeError('rr_environmental must be >= 1');
    if (population <= 0) throw new RangeError('population must be > 0');

    // Casos esperados na população sem exposição ambiental
    const baseline_cases = (population * background_rate_per_100k) / 100000;

    // Casos em excesso devidos ao fator ambiental (RR - 1 representa o excesso relativo)
    const excess_cases = baseline_cases * (rr_environmental - 1);

    // Taxa de excesso por 100 000 habitantes
    const excess_rate_per_100k = (excess_cases / population) * 100000;

    return { excess_cases, excess_rate_per_100k };
}

/**
 * Classify environmental disease burden using WHO (2016) DALY thresholds.
 * Classifica a carga de doença ambiental usando limiares de DALYs da OMS (2016).
 *
 * critical > 50 | high 20–50 | moderate 5–20 | low 1–5 | negligible < 1  (DALYs/1000/yr)
 *
 * @param {number} daly_per_1000_pop - DALYs per 1,000 population per year
 * @returns {{ burden: 'negligible'|'low'|'moderate'|'high'|'critical', percentile_est: string }}
 */
export function classifyEnvironmentalBurden(daly_per_1000_pop: number): {
    burden: DalyBurden;
    percentile_est: string;
} {
    if (typeof daly_per_1000_pop !== 'number') {
        throw new TypeError('daly_per_1000_pop must be a number');
    }
    if (daly_per_1000_pop < 0) throw new RangeError('daly_per_1000_pop must be >= 0');

    const threshold = DALY_THRESHOLDS.find((t) => daly_per_1000_pop <= t.max);
    const { burden, percentile_est } = threshold || DALY_CRITICAL;

    return { burden, percentile_est };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalEpidemiologyMetricsMeta: AnalyticsModuleMeta = {
    name: 'environmentalEpidemiologyMetrics',
    description: 'environmentalEpidemiologyMetrics',
    category: 'analytics',
    familyTags: ['epidemiology'],
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
