// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Impact Significance - Leopold matrix, RIAM and ISO 14001 classification
// Significância de impactos ambientais - matriz de Leopold, critérios RIAM e ISO 14001
// Refs: Leopold et al. (1971); Pastakia (1998); CONAMA 001/1986; ISO 14001:2015

'use strict';

/**
 * Compute Leopold impact score and significance class.
 * Calcula a pontuação do impacto pela matriz de Leopold e classifica a significância.
 * score = magnitude × importance; critical se |score| >= 70
 * Ref: Leopold, L.B. et al. (1971) USGS Circular 645. A Procedure for Evaluating EIA.
 *
 * @param magnitude - Impact magnitude [-10 to +10]; negative = adverse
 * @param importance - Environmental importance [1 to 10]
 */
export function computeLeopoldScore(
    magnitude: number,
    importance: number,
): { score: number; significance: string } {
    if (typeof magnitude !== 'number' || typeof importance !== 'number') {
        throw new TypeError('magnitude and importance must be numbers');
    }
    if (magnitude < -10 || magnitude > 10) {
        throw new RangeError('magnitude must be in [-10, +10]');
    }
    if (importance < 1 || importance > 10) {
        throw new RangeError('importance must be in [1, 10]');
    }

    const score = magnitude * importance;
    const abs_score = Math.abs(score);

    // Classificação de significância por limiar absoluto (adaptado de CONAMA 001/1986)
    let significance;
    if (abs_score >= 70) {
        significance = 'critical';
    } else if (abs_score >= 40) {
        significance = 'major';
    } else if (abs_score >= 20) {
        significance = 'moderate';
    } else if (abs_score >= 5) {
        significance = 'minor';
    } else {
        significance = 'negligible';
    }

    return { score, significance };
}

/**
 * Compute RIAM (Rapid Impact Assessment Matrix) Environmental Significance score.
 * Calcula o escore de Significância Ambiental pelo método RIAM (Pastakia 1998).
 * ES = (A × B) + (C + D)
 * Ref: Pastakia, C.M.R. (1998) Environ Impact Assess Rev. DOI:10.1016/S0195-9255(98)00004-8
 *
 * @param condition_score - Component condition A [-3 to +3]; +3 = major positive
 * @param importance_score - Importance B [1 to 5]; 5 = critical importance
 * @param magnitude_score - Magnitude of change C [0 to 3]; 3 = major change
 * @param reversibility_score - Reversibility D [0 to 3]; 0 = reversible
 */
function _validateRIAMScore(
    condition_score: number,
    importance_score: number,
    magnitude_score: number,
    reversibility_score: number,
): void {
    if (
        typeof condition_score !== 'number' ||
        typeof importance_score !== 'number' ||
        typeof magnitude_score !== 'number' ||
        typeof reversibility_score !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (condition_score < -3 || condition_score > 3) {
        throw new RangeError('condition_score (A) must be in [-3, +3]');
    }
    if (importance_score < 1 || importance_score > 5) {
        throw new RangeError('importance_score (B) must be in [1, 5]');
    }
    if (magnitude_score < 0 || magnitude_score > 3) {
        throw new RangeError('magnitude_score (C) must be in [0, 3]');
    }
    if (reversibility_score < 0 || reversibility_score > 3) {
        throw new RangeError('reversibility_score (D) must be in [0, 3]');
    }
}

function _riamSignificance(abs_es: number): { significance_class: string; description: string } {
    if (abs_es > 120) {
        return { significance_class: 'A', description: 'Extreme significant impact — immediate action required' };
    }
    if (abs_es >= 72) {
        return { significance_class: 'B', description: 'Significant impact — detailed monitoring required' };
    }
    if (abs_es >= 36) {
        return { significance_class: 'C', description: 'Moderate significant impact — mitigation recommended' };
    }
    if (abs_es >= 12) {
        return { significance_class: 'D', description: 'Low significant impact — routine monitoring' };
    }
    return { significance_class: 'E', description: 'Negligible impact — no action required' };
}

export function computeRIAMScore(
    condition_score: number,
    importance_score: number,
    magnitude_score: number,
    reversibility_score: number,
): { riam_es: number; significance_class: string; description: string } {
    _validateRIAMScore(condition_score, importance_score, magnitude_score, reversibility_score);

    // Fórmula RIAM: ES = (A × B) + (C + D)
    const riam_es = condition_score * importance_score + (magnitude_score + reversibility_score);
    const abs_es = Math.abs(riam_es);

    return { riam_es, ..._riamSignificance(abs_es) };
}

/**
 * Compute cumulative impact score across environmental components.
 * Calcula o impacto cumulativo somando pontuações de múltiplos componentes ambientais.
 * Identifica componentes dominantes (|score| > 50% do maior individual).
 *
 * @param individual_impacts - Array of impacts
 */
export function computeCumulativeImpact(
    individual_impacts: { component: string; leopold_score: number }[],
): { cumulative_score: number; dominant_components: string[] } {
    if (!Array.isArray(individual_impacts)) {
        throw new TypeError('individual_impacts must be an array');
    }
    if (individual_impacts.length === 0) {
        throw new RangeError('individual_impacts must have at least one entry');
    }

    for (const item of individual_impacts) {
        if (typeof item.component !== 'string' || typeof item.leopold_score !== 'number') {
            throw new TypeError('Each impact must have { component: string, leopold_score: number }');
        }
    }

    // Soma linear dos impactos - abordagem aditiva da matriz de Leopold (USGS 1971)
    const cumulative_score = individual_impacts.reduce((sum, i) => sum + i.leopold_score, 0);

    // Componentes dominantes: |score| > 50% do máximo individual em valor absoluto
    const max_abs = Math.max(...individual_impacts.map((i) => Math.abs(i.leopold_score)));
    const threshold = max_abs * 0.5;
    const dominant_components = individual_impacts
        .filter((i) => Math.abs(i.leopold_score) >= threshold)
        .map((i) => i.component);

    return { cumulative_score, dominant_components };
}

/**
 * Classify overall impact significance per CONAMA 001/1986 and ISO 14001:2015 criteria.
 * Classifica a significância do impacto conforme CONAMA 001/1986 e ISO 14001:2015.
 * EIA obrigatório se highly_significant OU área > 100 ha (CONAMA 001/1986 Art. 2).
 *
 * @param abs_leopold - Leopold matrix combined score
 * @param abs_riam - RIAM Environmental Significance score
 * @param affected_area_ha - Area affected [hectares]
 * @param duration_years - Duration of impact [years]
 * @param reversible - Whether the impact is reversible
 */
function _baseSignificance(abs_leopold: number, abs_riam: number): string {
    if (abs_leopold >= 70 || abs_riam >= 72) return 'highly_significant';
    if (abs_leopold >= 20 || abs_riam >= 36) return 'significant';
    return 'not_significant';
}

function _applyAttenuation(significance: string): string {
    if (significance === 'highly_significant') return 'significant';
    if (significance === 'significant') return 'not_significant';
    return significance;
}

function _validateImpactSignificance(
    leopold_score: number,
    riam_es: number,
    affected_area_ha: number,
    duration_years: number,
    reversible: boolean,
): void {
    if (
        typeof leopold_score !== 'number' ||
        typeof riam_es !== 'number' ||
        typeof affected_area_ha !== 'number' ||
        typeof duration_years !== 'number'
    ) {
        throw new TypeError('Numeric inputs must be numbers');
    }
    if (typeof reversible !== 'boolean') {
        throw new TypeError('reversible must be a boolean');
    }
    if (affected_area_ha < 0) throw new RangeError('affected_area_ha must be >= 0');
    if (duration_years < 0) throw new RangeError('duration_years must be >= 0');
}

export function classifyImpactSignificance(
    leopold_score: number,
    riam_es: number,
    affected_area_ha: number,
    duration_years: number,
    reversible: boolean,
): { significance: string; requires_mitigation: boolean; eia_required: boolean } {
    _validateImpactSignificance(leopold_score, riam_es, affected_area_ha, duration_years, reversible);

    const abs_leopold = Math.abs(leopold_score);
    const abs_riam = Math.abs(riam_es);

    // Classificação base combinando Leopold e RIAM (critério mais restritivo prevalece)
    let significance = _baseSignificance(abs_leopold, abs_riam);

    // Atenuação: reversível E curta duração reduz um nível (CONAMA 001/1986 Art. 1 §1)
    if (reversible && duration_years < 1) {
        significance = _applyAttenuation(significance);
    }

    // Mitigação obrigatória para impactos significant ou acima
    const requires_mitigation = significance !== 'not_significant';

    // EIA obrigatório: CONAMA 001/1986 Art. 2 - altamente significativo OU área > 100ha
    const eia_required = significance === 'highly_significant' || affected_area_ha > 100;

    return { significance, requires_mitigation, eia_required };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalImpactSignificanceMeta = {
    name: 'environmentalImpactSignificance',
    description: 'environmentalImpactSignificance',
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
