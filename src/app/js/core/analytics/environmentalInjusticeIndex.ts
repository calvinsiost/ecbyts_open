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
 * Environmental Injustice Index - indicadores de desigualdade ambiental e injustiça socioambiental.
 *
 * Referências acadêmicas:
 * - Mohai, P., & Saha, R. (2006). Reassessing racial and socioeconomic disparities in
 *   environmental justice research. Demography, 43(2), 383-399.
 *   DOI:10.1353/dem.2006.0017
 * - CalEPA (2017). CalEnviroScreen 3.0. Office of Environmental Health Hazard Assessment.
 *   https://oehha.ca.gov/calenviroscreen
 * - Bullard, R.D. (1990). Dumping in Dixie: Race, Class, and Environmental Quality.
 *   Westview Press. ISBN:978-0-8133-1585-7
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
 * Computes the Exposure Disparity Ratio (EDR) between population groups.
 * Razão de disparidade de exposição - indica injustiça ambiental quando EDR > 1.
 * Referência: Mohai & Saha (2006) DOI:10.1353/dem.2006.0017
 *
 * @param minority_exposure - Nível de exposição do grupo minoritário (≥ 0)
 * @param majority_exposure - Nível de exposição do grupo majoritário (> 0)
 * @returns EDR > 1 indica injustiça; EDR = 1 indica paridade
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se minority_exposure < 0 ou majority_exposure ≤ 0
 */
export function computeExposureDisparityRatio(
    minority_exposure: number,
    majority_exposure: number,
): { EDR: number } {
    if (typeof minority_exposure !== 'number' || typeof majority_exposure !== 'number') {
        throw new TypeError('computeExposureDisparityRatio: both arguments must be numbers');
    }
    if (minority_exposure < 0) throw new RangeError('computeExposureDisparityRatio: minority_exposure must be >= 0');
    if (majority_exposure <= 0) throw new RangeError('computeExposureDisparityRatio: majority_exposure must be > 0');
    const EDR = minority_exposure / majority_exposure;
    return { EDR };
}

/**
 * Computes the Cumulative Impact Score (CIS) using an adapted CalEnviroScreen methodology.
 * Score de impacto cumulativo - combina poluição, vulnerabilidade social e carga de saúde.
 * Referência: CalEPA CalEnviroScreen 3.0 (2017)
 *
 * @param pollution_score       - Score de poluição normalizado [0,1]
 * @param social_vulnerability  - Índice de vulnerabilidade social [0,1]
 * @param health_burden         - Carga de doença associada [0,1]
 * @returns CIS ∈ [0,1]; valores maiores = maior impacto cumulativo
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se qualquer valor estiver fora de [0,1]
 */
export function computeCumulativeImpactScore(
    pollution_score: number,
    social_vulnerability: number,
    health_burden: number,
): { CIS: number } {
    if (
        typeof pollution_score !== 'number' ||
        typeof social_vulnerability !== 'number' ||
        typeof health_burden !== 'number'
    ) {
        throw new TypeError('computeCumulativeImpactScore: all arguments must be numbers');
    }
    for (const [name, val] of [
        ['pollution_score', pollution_score],
        ['social_vulnerability', social_vulnerability],
        ['health_burden', health_burden],
    ] as [string, number][]) {
        if (val < 0 || val > 1) throw new RangeError(`computeCumulativeImpactScore: ${name} must be in [0,1]`);
    }
    // CIS = poluição × média(vulnerabilidade social, carga de saúde)
    const population_factor = (social_vulnerability + health_burden) / 2;
    const CIS = pollution_score * population_factor;
    return { CIS };
}

/**
 * Computes the percentage gap in environmental quality between affluent and disadvantaged communities.
 * Gap percentual de qualidade ambiental entre grupos socioeconômicos.
 *
 * @param affluent_score      - Score ambiental do grupo abastado (> 0, menor = pior)
 * @param disadvantaged_score - Score ambiental do grupo vulnerável (≥ 0)
 * @returns gap_pct positivo = desvantagem; negativo = vantagem
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se affluent_score ≤ 0 ou disadvantaged_score < 0
 */
export function computeEnvironmentalJusticeGap(
    affluent_score: number,
    disadvantaged_score: number,
): { gap_pct: number } {
    if (typeof affluent_score !== 'number' || typeof disadvantaged_score !== 'number') {
        throw new TypeError('computeEnvironmentalJusticeGap: both arguments must be numbers');
    }
    if (affluent_score <= 0) throw new RangeError('computeEnvironmentalJusticeGap: affluent_score must be > 0');
    if (disadvantaged_score < 0)
        throw new RangeError('computeEnvironmentalJusticeGap: disadvantaged_score must be >= 0');
    const gap_pct = ((disadvantaged_score - affluent_score) / affluent_score) * 100;
    return { gap_pct };
}

/**
 * Classifies the level of environmental injustice based on EDR and CIS.
 * Classifica o nível de injustiça ambiental combinando razão de exposição e impacto cumulativo.
 *
 * @param EDR - Exposure Disparity Ratio (≥ 0)
 * @param CIS - Cumulative Impact Score [0,1]
 * @returns
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se EDR < 0 ou CIS fora de [0,1]
 */
export function classifyInjusticeLevel(
    EDR: number,
    CIS: number,
): { level: 'equitable' | 'mild_disparity' | 'significant' | 'severe' } {
    if (typeof EDR !== 'number' || typeof CIS !== 'number') {
        throw new TypeError('classifyInjusticeLevel: EDR and CIS must be numbers');
    }
    if (EDR < 0) throw new RangeError('classifyInjusticeLevel: EDR must be >= 0');
    if (CIS < 0 || CIS > 1) throw new RangeError('classifyInjusticeLevel: CIS must be in [0,1]');
    if (EDR < 1.1 && CIS < 0.3) return { level: 'equitable' };
    if (EDR < 1.5 && CIS < 0.6) return { level: 'mild_disparity' };
    if (EDR < 2.0) return { level: 'significant' };
    return { level: 'severe' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalInjusticeIndexMeta: AnalyticsModuleMeta = {
    name: 'environmentalInjusticeIndex',
    description: 'environmentalInjusticeIndex',
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
