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
// Ore Grade Estimation - weighted average grade, strip ratio, metallurgical recovery, resource estimate
// Estimativa de teor de minério - interpolação de teor, razão de estéril e cálculo de recuperação.
//
// References / Referências:
//   Isaaks & Srivastava (1989) Applied Geostatistics. Oxford University Press.
//   Sinclair & Blackwell (2002) Applied Mineral Inventory Estimation. Cambridge University Press.
//   SME Mining Handbook (2011). Society for Mining, Metallurgy & Exploration.
//   JORC Code (2012). Australasian Code for Reporting of Exploration Results, Mineral Resources and Ore Reserves.

'use strict';

/**
 * Computes the weighted average grade of a set of ore samples.
 * Calcula o teor médio ponderado de um conjunto de amostras de minério.
 *
 * @param {Array<{grade: number, weight: number}>} samples - Array de amostras com teor e peso/volume.
 * @returns {{ grade: number, total_weight: number }} Teor médio ponderado e soma dos pesos.
 * @throws {TypeError} Se samples não for um array ou elementos inválidos.
 * @throws {RangeError} Se array vazio ou pesos/teores negativos.
 */
export function computeWeightedAverageGrade(samples: any) {
    if (!Array.isArray(samples)) throw new TypeError('samples must be an array');
    if (samples.length === 0) throw new RangeError('samples array must not be empty');

    let weighted_sum = 0;
    let total_weight = 0;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        if (typeof s.grade !== 'number' || typeof s.weight !== 'number') {
            throw new TypeError(`samples[${i}] must have numeric grade and weight`);
        }
        if (s.grade < 0) throw new RangeError(`samples[${i}].grade must be >= 0`);
        if (s.weight <= 0) throw new RangeError(`samples[${i}].weight must be > 0`);
        weighted_sum += s.grade * s.weight;
        total_weight += s.weight;
    }

    // Média ponderada: soma(grade_i × weight_i) / soma(weight_i)
    const grade = weighted_sum / total_weight;
    return { grade, total_weight };
}

/**
 * Computes the strip ratio (waste to ore volume) and mining efficiency classification.
 * Calcula a razão de estéril/minério e classifica a eficiência da lavra.
 *
 * @param {number} waste_volume_m3 - Volume de estéril em metros cúbicos.
 * @param {number} ore_volume_m3 - Volume de minério em metros cúbicos.
 * @returns {{ strip_ratio: number, mining_efficiency: 'excellent'|'good'|'fair'|'poor' }}
 * @throws {RangeError} Se volumes negativos ou ore_volume_m3 = 0.
 */
export function computeStripRatio(waste_volume_m3: any, ore_volume_m3: any) {
    if (typeof waste_volume_m3 !== 'number' || typeof ore_volume_m3 !== 'number') {
        throw new TypeError('waste_volume_m3 and ore_volume_m3 must be numbers');
    }
    if (waste_volume_m3 < 0) throw new RangeError('waste_volume_m3 must be >= 0');
    if (ore_volume_m3 <= 0) throw new RangeError('ore_volume_m3 must be > 0');

    // Razão de estéril: volume de estéril dividido pelo volume de minério
    const strip_ratio = waste_volume_m3 / ore_volume_m3;

    /** @type {'excellent'|'good'|'fair'|'poor'} */
    let mining_efficiency;
    if (strip_ratio < 1) {
        mining_efficiency = 'excellent';
    } else if (strip_ratio < 3) {
        mining_efficiency = 'good';
    } else if (strip_ratio < 6) {
        mining_efficiency = 'fair';
    } else {
        mining_efficiency = 'poor';
    }

    return { strip_ratio, mining_efficiency };
}

/**
 * Computes metallurgical recovery and concentration ratio from feed/concentrate/tailings grades.
 * Calcula a recuperação metalúrgica e razão de concentração a partir dos teores de alimentação,
 * concentrado e rejeito.
 *
 * Formula: Recovery (%) = [(feed - tailings) / feed] × 100
 * Concentration ratio = concentrate_grade / feed_grade
 *
 * @param {number} feed_grade - Teor da alimentação (%).
 * @param {number} concentrate_grade - Teor do concentrado (%).
 * @param {number} tailings_grade - Teor do rejeito (%).
 * @returns {{ recovery_pct: number, concentration_ratio: number }}
 * @throws {RangeError} Se teores negativos ou tailings >= feed.
 */
export function computeMetallurgicalRecovery(feed_grade: any, concentrate_grade: any, tailings_grade: any) {
    if (typeof feed_grade !== 'number' || typeof concentrate_grade !== 'number' || typeof tailings_grade !== 'number') {
        throw new TypeError('feed_grade, concentrate_grade and tailings_grade must be numbers');
    }
    if (feed_grade <= 0) throw new RangeError('feed_grade must be > 0');
    if (concentrate_grade < 0) throw new RangeError('concentrate_grade must be >= 0');
    if (tailings_grade < 0) throw new RangeError('tailings_grade must be >= 0');
    if (tailings_grade >= feed_grade) throw new RangeError('tailings_grade must be < feed_grade');

    // Recuperação metalúrgica pelo balanço de massas (método das duas equações)
    const recovery_pct = ((feed_grade - tailings_grade) / feed_grade) * 100;
    const concentration_ratio = concentrate_grade / feed_grade;

    return { recovery_pct, concentration_ratio };
}

/**
 * Estimates ore resource tonnage, metal content, and economic viability.
 * Estima tonelagem do recurso mineral, conteúdo de metal e viabilidade econômica.
 *
 * @param {number} volume_m3 - Volume do corpo mineralizado em m³.
 * @param {number} density_t_m3 - Densidade do minério em t/m³.
 * @param {number} grade_pct - Teor médio do minério em %.
 * @param {number} cutoff_grade_pct - Teor de corte (cutoff) em %.
 * @returns {{ tonnage_t: number, metal_content_t: number, economic: boolean }}
 * @throws {RangeError} Se parâmetros negativos ou zero.
 */
export function estimateOreResource(volume_m3: any, density_t_m3: any, grade_pct: any, cutoff_grade_pct: any) {
    if (
        typeof volume_m3 !== 'number' ||
        typeof density_t_m3 !== 'number' ||
        typeof grade_pct !== 'number' ||
        typeof cutoff_grade_pct !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (density_t_m3 <= 0) throw new RangeError('density_t_m3 must be > 0');
    if (grade_pct < 0) throw new RangeError('grade_pct must be >= 0');
    if (cutoff_grade_pct < 0) throw new RangeError('cutoff_grade_pct must be >= 0');

    // Tonelagem = volume × densidade; conteúdo de metal = tonelagem × teor/100
    const tonnage_t = volume_m3 * density_t_m3;
    const metal_content_t = tonnage_t * (grade_pct / 100);
    const economic = grade_pct >= cutoff_grade_pct;

    return { tonnage_t, metal_content_t, economic };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const oreGradeEstimationMeta = {
    name: 'oreGradeEstimation',
    description: 'oreGradeEstimation',
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
