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
 * Ecosystem Degradation Index - Índice de degradação de ecossistemas
 *
 * Implementa a estrutura de avaliação do risco de ecossistemas conforme
 * a Lista Vermelha de Ecossistemas da IUCN (IUCN Red List of Ecosystems).
 *
 * Critérios avaliados:
 *   A - Redução do tamanho do ecossistema (distribuição)
 *   B - Distribuição restrita + declínio / perturbações
 *   C - Degradação abiótica do ambiente físico
 *   D - Ruptura biótica (comunidades biológicas)
 *
 * References / Referências:
 *   Keith, D.A. et al. (2013). Scientific Foundations for an IUCN Red List of Ecosystems.
 *     PLOS ONE, 8(5), e62111. https://doi.org/10.1371/journal.pone.0062111
 *   Bland, L.M. et al. (2017). Developing scoring criteria to standardise the IUCN
 *     Red List of Ecosystems categories and criteria. One Ecosystem, 2, e15421.
 *     https://doi.org/10.3897/oneeco.2.e15421
 *   IUCN (2016). An Introduction to the IUCN Red List of Ecosystems Categories and
 *     Criteria. Version 3.1. IUCN, Gland, Switzerland.
 *     ISBN 978-2-8317-1739-6
 *
 * @module ecosystemDegradationIndex
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

type EcosystemCategoryCode = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'CO';

interface CriterionResult<C extends string> {
    score: number;
    category: string;
    criterion: C;
}

// ─── Risk categories ──────────────────────────────────────────────────────────

/**
 * IUCN Red List of Ecosystems categories.
 * Categorias da Lista Vermelha de Ecossistemas da IUCN.
 *
 * @readonly
 * @enum {string}
 */
const ECOSYSTEM_CATEGORIES: Record<EcosystemCategoryCode, string> = {
    LC: 'Least Concern', // Pouco preocupante
    NT: 'Near Threatened', // Quase ameaçado
    VU: 'Vulnerable', // Vulnerável
    EN: 'Endangered', // Em perigo
    CR: 'Critically Endangered', // Criticamente em perigo
    CO: 'Collapsed', // Colapsado
};

/**
 * Maps a severity score [0–100] to an IUCN ecosystem risk category.
 * Mapeia pontuação de severidade [0–100] para categoria de risco IUCN.
 *
 * Thresholds derived from Keith et al. (2013) and IUCN (2016) criteria.
 *
 * @param {number} score - Severity score [0, 100]
 * @returns {string} Category code (LC/NT/VU/EN/CR/CO)
 */
function scoreToCategory(score: number): string {
    if (typeof score !== 'number' || !isFinite(score)) {
        throw new TypeError(`score must be a finite number, got ${score}`);
    }
    if (score < 0 || score > 100) throw new RangeError(`score must be in [0, 100], got ${score}`);
    if (score >= 80) return 'CO'; // Colapsado
    if (score >= 60) return 'CR'; // Criticamente em perigo
    if (score >= 40) return 'EN'; // Em perigo
    if (score >= 25) return 'VU'; // Vulnerável
    if (score >= 10) return 'NT'; // Quase ameaçado
    return 'LC'; // Pouco preocupante
}

// ─── Criterion A - Distribution reduction ────────────────────────────────────

/**
 * Criterion A: Reduction in ecosystem distribution over 50 years.
 * Critério A: Redução na distribuição do ecossistema ao longo de 50 anos.
 *
 * Based on IUCN RLE criteria A2 (past reduction) and A3 (future).
 * The largest percent decline over any 50-year period (past or future) is used.
 *
 * Thresholds (Keith et al. 2013, Table 1):
 *   CR: ≥80%  EN: ≥50%  VU: ≥30%  NT: ≥20%
 *
 * @param {number} reductionPct - Percent reduction in spatial extent / redução percentual na área (0–100)
 * @returns {{ score: number, category: string, criterion: 'A' }}
 */
function criterionA(reductionPct: number): CriterionResult<'A'> {
    if (typeof reductionPct !== 'number' || !isFinite(reductionPct)) {
        throw new TypeError(`reductionPct must be a finite number, got ${reductionPct}`);
    }
    if (reductionPct < 0 || reductionPct > 100) {
        throw new RangeError(`reductionPct must be in [0, 100], got ${reductionPct}`);
    }
    // Mapeamento linear por faixas de limiar IUCN
    let score;
    if (reductionPct >= 80)
        score = 60 + ((reductionPct - 80) / 20) * 20; // → 60–80
    else if (reductionPct >= 50)
        score = 40 + ((reductionPct - 50) / 30) * 20; // → 40–60
    else if (reductionPct >= 30)
        score = 25 + ((reductionPct - 30) / 20) * 15; // → 25–40
    else if (reductionPct >= 20)
        score = 10 + ((reductionPct - 20) / 10) * 15; // → 10–25
    else score = (reductionPct / 20) * 10; // → 0–10
    score = Math.min(100, score);
    return { score, category: scoreToCategory(score), criterion: 'A' };
}

// ─── Criterion B - Restricted distribution ───────────────────────────────────

/**
 * Criterion B: Restricted distribution with decline or threatening processes.
 * Critério B: Distribuição restrita com declínio ou processos ameaçadores.
 *
 * Uses Extent of Occurrence (EOO, km²) and Area of Occupancy (AOO, km²).
 * Requeira também pelo menos um sub-critério de declínio (Bi, Bii, Biii).
 *
 * Thresholds (IUCN RLE v3.1, Table 4):
 *   CR: EOO < 2000 km² or AOO < 200 km²
 *   EN: EOO < 20000 km² or AOO < 2000 km²
 *   VU: EOO < 50000 km² or AOO < 5000 km²
 *
 * @param {{ eoo_km2: number, aoo_km2: number, declinePresent: boolean }} params
 *   eoo_km2: Extent of Occurrence in km² / extensão de ocorrência em km²
 *   aoo_km2: Area of Occupancy in km² / área de ocupação em km²
 *   declinePresent: at least one decline sub-criterion met / sub-critério de declínio satisfeito
 * @returns {{ score: number, category: string, criterion: 'B' }}
 */
function criterionB({
    eoo_km2,
    aoo_km2,
    declinePresent,
}: {
    eoo_km2: number;
    aoo_km2: number;
    declinePresent: boolean;
}): CriterionResult<'B'> {
    if (typeof eoo_km2 !== 'number' || eoo_km2 < 0) throw new RangeError(`eoo_km2 must be >= 0, got ${eoo_km2}`);
    if (typeof aoo_km2 !== 'number' || aoo_km2 < 0) throw new RangeError(`aoo_km2 must be >= 0, got ${aoo_km2}`);

    // Sem sub-critério de declínio, critério B não se aplica
    if (!declinePresent) return { score: 0, category: 'LC', criterion: 'B' };

    // EOO e AOO geram pontuações independentes; usa-se o maior (mais precautório)
    const scoreEOO =
        eoo_km2 < 2000 ? 65 : eoo_km2 < 20000 ? 45 : eoo_km2 < 50000 ? 30 : 5;
    const scoreAOO =
        aoo_km2 < 200 ? 65 : aoo_km2 < 2000 ? 45 : aoo_km2 < 5000 ? 30 : 5;

    const score = Math.max(scoreEOO, scoreAOO);
    return { score, category: scoreToCategory(score), criterion: 'B' };
}

// ─── Criterion C - Abiotic degradation ───────────────────────────────────────

/**
 * Criterion C: Abiotic (physical/chemical) environmental degradation.
 * Critério C: Degradação abiótica (física/química) do ambiente.
 *
 * Measures the proportion of the ecosystem affected by a specific
 * abiotic degradation process and its relative severity.
 *
 * Score = proportionAffected × severityScore (0–100)
 *
 * @param {{ proportionAffected: number, severityScore: number }} params
 *   proportionAffected: fraction of ecosystem affected [0, 1] / fração do ecossistema afetada
 *   severityScore: abiotic severity score [0, 100] (e.g., pH change, salinity, erosion)
 * @returns {{ score: number, category: string, criterion: 'C' }}
 */
function criterionC({
    proportionAffected,
    severityScore,
}: {
    proportionAffected: number;
    severityScore: number;
}): CriterionResult<'C'> {
    if (typeof proportionAffected !== 'number' || proportionAffected < 0 || proportionAffected > 1) {
        throw new RangeError(`proportionAffected must be in [0, 1], got ${proportionAffected}`);
    }
    if (typeof severityScore !== 'number' || severityScore < 0 || severityScore > 100) {
        throw new RangeError(`severityScore must be in [0, 100], got ${severityScore}`);
    }
    const score = proportionAffected * severityScore;
    return { score, category: scoreToCategory(score), criterion: 'C' };
}

// ─── Criterion D - Biotic disruption ─────────────────────────────────────────

/**
 * Criterion D: Disruption of biotic processes/interactions.
 * Critério D: Ruptura de processos e interações bióticas.
 *
 * Evaluates change in relative abundance of key biotic components
 * (e.g., functional groups, dominant species, trophic levels).
 *
 * @param {{ proportionAffected: number, severityScore: number }} params
 *   proportionAffected: fraction of ecosystem with biotic disruption [0, 1]
 *   severityScore: disruption severity [0, 100]
 * @returns {{ score: number, category: string, criterion: 'D' }}
 */
function criterionD({
    proportionAffected,
    severityScore,
}: {
    proportionAffected: number;
    severityScore: number;
}): CriterionResult<'D'> {
    if (typeof proportionAffected !== 'number' || proportionAffected < 0 || proportionAffected > 1) {
        throw new RangeError(`proportionAffected must be in [0, 1], got ${proportionAffected}`);
    }
    if (typeof severityScore !== 'number' || severityScore < 0 || severityScore > 100) {
        throw new RangeError(`severityScore must be in [0, 100], got ${severityScore}`);
    }
    const score = proportionAffected * severityScore;
    return { score, category: scoreToCategory(score), criterion: 'D' };
}

// ─── Overall assessment ───────────────────────────────────────────────────────

/**
 * Overall ecosystem risk assessment following IUCN RLE precautionary principle.
 * Avaliação global de risco do ecossistema segundo o princípio da precaução IUCN RLE.
 *
 * The overall category is the MOST THREATENED outcome across all criteria
 * (precautionary approach - Keith et al. 2013, §Assessment Rules).
 *
 * @param {{
 *   A?: { reductionPct: number },
 *   B?: { eoo_km2: number, aoo_km2: number, declinePresent: boolean },
 *   C?: { proportionAffected: number, severityScore: number },
 *   D?: { proportionAffected: number, severityScore: number },
 * }} criteria - Input data for each applicable criterion
 * @returns {{
 *   overall_category: string,
 *   overall_category_label: string,
 *   overall_score: number,
 *   criteria_results: object[],
 * }}
 */
function assessEcosystemRisk(criteria: {
    A?: { reductionPct: number };
    B?: { eoo_km2: number; aoo_km2: number; declinePresent: boolean };
    C?: { proportionAffected: number; severityScore: number };
    D?: { proportionAffected: number; severityScore: number };
}): {
    overall_category: string;
    overall_category_label: string;
    overall_score: number;
    criteria_results: object[];
} {
    if (!criteria || typeof criteria !== 'object') {
        throw new TypeError('criteria must be an object');
    }
    const ORDER = ['CO', 'CR', 'EN', 'VU', 'NT', 'LC'];
    const results: Array<CriterionResult<'A' | 'B' | 'C' | 'D'>> = [];

    if (criteria.A) results.push(criterionA(criteria.A.reductionPct));
    if (criteria.B) results.push(criterionB(criteria.B));
    if (criteria.C) results.push(criterionC(criteria.C));
    if (criteria.D) results.push(criterionD(criteria.D));

    if (results.length === 0) {
        throw new TypeError('At least one criterion (A, B, C, or D) must be provided');
    }

    // Princípio da precaução: categoria mais ameaçada entre os critérios
    let worstIdx = ORDER.length - 1;
    let worstScore = 0;
    for (const r of results) {
        const idx = ORDER.indexOf(r.category);
        if (idx < worstIdx) {
            worstIdx = idx;
            worstScore = r.score;
        } else if (idx === worstIdx && r.score > worstScore) {
            worstScore = r.score;
        }
    }

    const worstKey = ORDER[worstIdx] as keyof typeof ECOSYSTEM_CATEGORIES;
    return {
        overall_category: worstKey,
        overall_category_label: ECOSYSTEM_CATEGORIES[worstKey],
        overall_score: worstScore,
        criteria_results: results,
    };
}

export { ECOSYSTEM_CATEGORIES, scoreToCategory, criterionA, criterionB, criterionC, criterionD, assessEcosystemRisk };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecosystemDegradationIndexMeta: AnalyticsModuleMeta = {
    name: 'ecosystemDegradationIndex',
    description: 'ecosystemDegradationIndex',
    category: 'analytics',
    familyTags: ['ecosystem'],
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
