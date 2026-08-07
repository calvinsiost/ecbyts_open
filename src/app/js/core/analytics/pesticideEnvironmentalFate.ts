// @ts-check
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
 * Pesticide Environmental Fate Module
 *
 * Modela o destino ambiental de pesticidas no solo, água e biota.
 * Referências acadêmicas:
 *   - Mackay, D. (1982). Correlation of bioconcentration factors.
 *     Environmental Science & Technology, 16(5), 274–278.
 *     DOI: 10.1021/es00127a005
 *   - Gustafson, D.I. (1989). Groundwater ubiquity score: A simple method
 *     for assessing pesticide leachability. Environmental Toxicology and
 *     Chemistry, 8(4), 339–357.
 *     DOI: 10.1002/etc.5620080411
 *   - Jury, W.A. et al. (1983). Behavior Assessment Model for trace organics
 *     in soil. Journal of Environmental Quality, 12(4), 558–564.
 *     DOI: 10.2134/jeq1983.00472425001200040025x
 *
 * @module pesticideEnvironmentalFate
 */

/**
 * Computes remaining fraction of pesticide in soil after degradation.
 *
 * Calcula a fração remanescente de pesticida após degradação de 1ª ordem.
 * Fórmula: C(t) = C₀ × e^(-k × t)  → remaining = e^(-k × t)
 *
 * @param {number} k_deg_per_day - Constante de degradação [1/dia]; deve ser > 0
 * @param {number} t_days - Tempo decorrido [dias]; deve ser ≥ 0
 * @returns {{ remaining_fraction: number }} Fração remanescente (0–1)
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se k_deg_per_day ≤ 0 ou t_days < 0
 */
export function computeHalfLifeSoil(k_deg_per_day: any, t_days: any) {
    if (typeof k_deg_per_day !== 'number' || typeof t_days !== 'number') {
        throw new TypeError('computeHalfLifeSoil: k_deg_per_day e t_days devem ser números');
    }
    if (k_deg_per_day <= 0) {
        throw new RangeError(`computeHalfLifeSoil: k_deg_per_day deve ser > 0, recebido ${k_deg_per_day}`);
    }
    if (t_days < 0) {
        throw new RangeError(`computeHalfLifeSoil: t_days deve ser ≥ 0, recebido ${t_days}`);
    }
    return { remaining_fraction: Math.exp(-k_deg_per_day * t_days) };
}

/**
 * Computes bioconcentration factor (BCF) from octanol-water partition coefficient.
 *
 * Calcula o fator de bioconcentração usando a equação empírica de Mackay (1982):
 * BCF = 0.048 × Kow^0.85
 *
 * O BCF representa a razão entre a concentração no organismo e na água no
 * estado estacionário - valores > 1000 indicam alto potencial de bioacumulação.
 *
 * @param {number} Kow - Coeficiente de partição octanol-água (adimensional); deve ser > 0
 * @returns {{ BCF: number }} Fator de bioconcentração [L/kg peso úmido]
 * @throws {TypeError} Se Kow não for número
 * @throws {RangeError} Se Kow ≤ 0
 */
export function computeBioconcentrationFactor(Kow: any) {
    if (typeof Kow !== 'number') {
        throw new TypeError('computeBioconcentrationFactor: Kow deve ser um número');
    }
    if (Kow <= 0) {
        throw new RangeError(`computeBioconcentrationFactor: Kow deve ser > 0, recebido ${Kow}`);
    }
    return { BCF: 0.048 * Math.pow(Kow, 0.85) };
}

/**
 * Computes the Groundwater Ubiquity Score (GUS) for pesticide leaching.
 *
 * Calcula o índice GUS (Gustafson 1989) para avaliar o potencial de lixiviação
 * de pesticidas para águas subterrâneas:
 * GUS = log₁₀(DT50) × (4 - log₁₀(Koc))
 *
 * Koc: coeficiente de sorção normalizado por carbono orgânico [mL/g]
 * DT50: meia-vida no solo (dias)
 *
 * @param {number} Koc - Coeficiente de sorção carbono orgânico [mL/g]; deve ser > 0
 * @param {number} DT50_days - Meia-vida no solo [dias]; deve ser > 0
 * @param {number} rainfall_mm - Precipitação anual [mm]; deve ser ≥ 0 (reservado para extensão futura)
 * @returns {{ GUS: number }} Índice de lixiviação (adimensional)
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se Koc ≤ 0, DT50_days ≤ 0 ou rainfall_mm < 0
 */
export function computeGroundwaterLeachingIndex(Koc: any, DT50_days: any, rainfall_mm: any) {
    if (typeof Koc !== 'number' || typeof DT50_days !== 'number' || typeof rainfall_mm !== 'number') {
        throw new TypeError('computeGroundwaterLeachingIndex: Koc, DT50_days e rainfall_mm devem ser números');
    }
    if (Koc <= 0) {
        throw new RangeError(`computeGroundwaterLeachingIndex: Koc deve ser > 0, recebido ${Koc}`);
    }
    if (DT50_days <= 0) {
        throw new RangeError(`computeGroundwaterLeachingIndex: DT50_days deve ser > 0, recebido ${DT50_days}`);
    }
    if (rainfall_mm < 0) {
        throw new RangeError(`computeGroundwaterLeachingIndex: rainfall_mm deve ser ≥ 0, recebido ${rainfall_mm}`);
    }
    const GUS = Math.log10(DT50_days) * (4 - Math.log10(Koc));
    return { GUS };
}

/**
 * Classifies pesticide leaching risk based on GUS index.
 *
 * Classifica o risco de lixiviação conforme os critérios de Gustafson (1989):
 *   GUS ≤ 1.8  → unlikely (improvável)
 *   1.8 < GUS ≤ 2.8 → transition (transição)
 *   GUS > 2.8  → leacher (lixiviante)
 *
 * @param {number} GUS - Índice Groundwater Ubiquity Score (adimensional)
 * @returns {{ risk: 'unlikely'|'transition'|'leacher', GUS: number }} Classificação de risco
 * @throws {TypeError} Se GUS não for número
 */
export function classifyPesticideLeachingRisk(GUS: any) {
    if (typeof GUS !== 'number') {
        throw new TypeError('classifyPesticideLeachingRisk: GUS deve ser um número');
    }
    /** @type {'unlikely'|'transition'|'leacher'} */
    let risk;
    if (GUS <= 1.8) {
        risk = 'unlikely';
    } else if (GUS <= 2.8) {
        risk = 'transition';
    } else {
        risk = 'leacher';
    }
    return { risk, GUS };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const pesticideEnvironmentalFateMeta = {
    name: 'pesticideEnvironmentalFate',
    description: 'pesticideEnvironmentalFate',
    category: 'analytics',
    familyTags: ['pesticide', 'fate_transport'],
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
