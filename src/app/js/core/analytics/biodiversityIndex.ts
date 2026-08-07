// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Biodiversity Index Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

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
 * Biodiversity Index - Ecological Community Assessment
 *
 * Módulo puro com índices clássicos de biodiversidade: Shannon H', Simpson D,
 * similaridade de Jaccard e classificação de status segundo critérios IUCN.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Shannon, C. E. & Weaver, W. (1949). The Mathematical Theory of
 *     Communication. Urbana: University of Illinois Press. (entropy index H')
 *   - Simpson, E. H. (1949). "Measurement of diversity." Nature, 163, 688.
 *     DOI: 10.1038/163688a0. (dominance index D)
 *   - Jaccard, P. (1901). "Étude comparative de la distribution florale dans
 *     une portion des Alpes et des Jura." Bulletin de la Société Vaudoise des
 *     Sciences Naturelles, 37, 547–579. (community similarity coefficient)
 *   - IUCN (2012). IUCN Red List Categories and Criteria, Version 3.1. 2nd ed.
 *     Gland, Switzerland: IUCN. (threat status thresholds)
 */

/**
 * Compute Shannon diversity index H' and Pielou's evenness J.
 * Calcula o índice de diversidade de Shannon H' e equitabilidade de Pielou J.
 *
 * H' = -Σ(pi × ln(pi))   where pi = ni / N
 * J  = H' / ln(S)         (Pielou 1966, evenness)
 *
 * @param speciesCounts - Array of species abundance counts / Array de abundâncias por espécie
 * @throws {TypeError} If input is not an array of positive numbers
 * @throws {RangeError} If all counts are zero or array is empty
 */
export function computeShannonIndex(speciesCounts: number[]): { h: number; evenness: number } {
    if (!Array.isArray(speciesCounts)) throw new TypeError('speciesCounts must be an array');
    if (speciesCounts.length === 0) throw new RangeError('speciesCounts must not be empty');

    // Filtrar espécies com abundância > 0 (presentes na amostra)
    const positive = speciesCounts.filter((n) => {
        if (typeof n !== 'number' || n < 0) throw new TypeError('All counts must be non-negative numbers');
        return n > 0;
    });

    if (positive.length === 0) throw new RangeError('At least one species count must be > 0');

    const N = positive.reduce((sum, n) => sum + n, 0);
    const S = positive.length; // riqueza de espécies / species richness

    // H' = -Σ pi × ln(pi) / Shannon entropy
    let h = 0;
    for (const n of positive) {
        const pi = n / N;
        h -= pi * Math.log(pi);
    }

    // Equitabilidade de Pielou J = H' / ln(S); se S=1, J=1 por definição
    const evenness = S > 1 ? h / Math.log(S) : 1;

    return { h, evenness };
}

/**
 * Compute Simpson diversity index D (1 - dominance).
 * Calcula o índice de diversidade de Simpson D (1 - dominância).
 *
 * D = 1 - Σ(ni×(ni-1)) / (N×(N-1))   (finite population form)
 *
 * @param speciesCounts - Array of species abundance counts / Array de abundâncias por espécie
 * @throws {TypeError} If input is not an array of positive numbers
 * @throws {RangeError} If fewer than 2 individuals are present
 */
export function computeSimpsonIndex(speciesCounts: number[]): { d: number; dominance: number } {
    if (!Array.isArray(speciesCounts)) throw new TypeError('speciesCounts must be an array');
    if (speciesCounts.length === 0) throw new RangeError('speciesCounts must not be empty');

    for (const n of speciesCounts) {
        if (typeof n !== 'number' || n < 0) throw new TypeError('All counts must be non-negative numbers');
    }

    const N = speciesCounts.reduce((sum, n) => sum + n, 0);
    if (N < 2) throw new RangeError('Total abundance N must be >= 2 for Simpson index');

    // Σ ni×(ni-1) / sum of n_i(n_i-1)
    const sumNiNi1 = speciesCounts.reduce((sum, n) => sum + n * (n - 1), 0);
    const dominance = sumNiNi1 / (N * (N - 1));
    const d = 1 - dominance;

    return { d, dominance };
}

/**
 * Compute Jaccard similarity coefficient between two species assemblages.
 * Calcula o coeficiente de similaridade de Jaccard entre duas comunidades.
 *
 * J = |A ∩ B| / |A ∪ B|
 *
 * @param setA - Species list at site A / Lista de espécies no sítio A
 * @param setB - Species list at site B / Lista de espécies no sítio B
 * @throws {TypeError} If inputs are not arrays of strings
 * @throws {RangeError} If both arrays are empty
 */
export function computeJaccardSimilarity(
    setA: string[],
    setB: string[],
): { jaccard: number; shared: number; total: number } {
    if (!Array.isArray(setA) || !Array.isArray(setB)) {
        throw new TypeError('setA and setB must be arrays');
    }
    if (setA.length === 0 && setB.length === 0) {
        throw new RangeError('At least one set must be non-empty');
    }

    // Validar que todos os elementos são strings
    for (const sp of [...setA, ...setB]) {
        if (typeof sp !== 'string') throw new TypeError('Species names must be strings');
    }

    const unionSet = new Set([...setA, ...setB]);
    const intersectionSize = setA.filter((sp) => setB.includes(sp)).length;
    const total = unionSet.size;
    const jaccard = total > 0 ? intersectionSize / total : 0;

    return { jaccard, shared: intersectionSize, total };
}

/**
 * Classify biodiversity conservation status based on ecological metrics.
 * Classifica o status de conservação da biodiversidade com base em métricas ecológicas.
 *
 * Classification thresholds:
 *   rich:       H' > 3.0 AND richness > 50 AND endemic > 5
 *   stable:     H' >= 2.0 AND richness >= 20
 *   vulnerable: H' >= 1.0 AND richness >= 10
 *   critical:   H' < 1.0 OR richness < 10
 *
 * @param shannonH - Shannon index H' / Índice de Shannon H'
 * @param speciesRichness - Total number of species observed / Riqueza de espécies observada
 * @param endemicCount - Number of endemic species / Número de espécies endêmicas
 * @throws {RangeError} If any metric is negative
 */
export function classifyBiodiversityStatus(
    shannonH: number,
    speciesRichness: number,
    endemicCount: number,
): { status: string; iucnCategory: string } {
    if (typeof shannonH !== 'number' || typeof speciesRichness !== 'number' || typeof endemicCount !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (shannonH < 0) throw new RangeError('shannonH must be >= 0');
    if (speciesRichness < 0) throw new RangeError('speciesRichness must be >= 0');
    if (endemicCount < 0) throw new RangeError('endemicCount must be >= 0');

    let status;
    let iucnCategory;

    // Classificação hierárquica / Hierarchical classification
    if (shannonH > 3 && speciesRichness > 50 && endemicCount > 5) {
        // Alta diversidade, riqueza e endemismo / High diversity, richness and endemism
        status = 'rich';
        iucnCategory = 'LC'; // Least Concern
    } else if (shannonH < 1 || speciesRichness < 10) {
        // Diversidade ou riqueza criticamente baixa / Critically low diversity or richness
        status = 'critical';
        iucnCategory = 'CR'; // Critically Endangered
    } else if (shannonH >= 2 && speciesRichness >= 20) {
        // Comunidade estável / Stable community
        status = 'stable';
        iucnCategory = 'NT'; // Near Threatened
    } else {
        // Comunidade vulnerável / Vulnerable community
        status = 'vulnerable';
        iucnCategory = 'VU'; // Vulnerable
    }

    return { status, iucnCategory };
}

/**
 * Compute Shannon diversity index (alias matching spec signature).
 * Calcula H = -Σ(pi × ln(pi)) com nomenclatura canônica da spec.
 *
 * Shannon, C. E. & Weaver, W. (1949). The Mathematical Theory of Communication.
 * Urbana: University of Illinois Press. ISBN:9780252725463
 *
 * @param species_counts - Array of abundance counts per species
 * @throws {TypeError} If input is not a valid array
 * @throws {RangeError} If array is empty or all zeros
 */
export function computeShannonDiversity(species_counts: number[]): { H: number } {
    const { h } = computeShannonIndex(species_counts);
    return { H: h };
}

/**
 * Compute Simpson diversity index and complement (1 - D).
 * Calcula D = Σ(ni×(ni-1))/(N×(N-1)) e D_complement = 1 - D.
 *
 * Simpson, E. H. (1949). "Measurement of diversity." Nature, 163, 688.
 * DOI: 10.1038/163688a0
 *
 * @param species_counts - Array of abundance counts per species
 * @throws {TypeError} If input is not a valid array
 * @throws {RangeError} If total N < 2
 */
export function computeSimpsonDiversity(species_counts: number[]): { D: number; D_complement: number } {
    const { d, dominance } = computeSimpsonIndex(species_counts);
    // D (dominance) = Σ ni(ni-1)/N(N-1); D_complement = 1-D
    return { D: dominance, D_complement: d };
}

/**
 * Compute species richness, total abundance N, and Pielou evenness.
 * Calcula S (número de espécies), N (total de indivíduos) e J de Pielou.
 *
 * Pielou, E. C. (1966). "The measurement of diversity in different types of
 * biological collections." Journal of Theoretical Biology, 13, 131–144.
 * DOI: 10.1016/0022-5193(66)90013-0
 *
 * @param species_counts - Array of abundance counts per species
 * @throws {TypeError} If input is not a valid array
 * @throws {RangeError} If array is empty or all zeros
 */
export function computeSpeciesRichness(species_counts: number[]): { S: number; N: number; evenness: number } {
    if (!Array.isArray(species_counts)) throw new TypeError('species_counts must be an array');
    if (species_counts.length === 0) throw new RangeError('species_counts must not be empty');

    for (const n of species_counts) {
        if (typeof n !== 'number' || n < 0) throw new TypeError('All counts must be non-negative numbers');
    }

    // S = número de espécies com abundância > 0 / species with positive count
    const S = species_counts.filter((n) => n > 0).length;
    if (S === 0) throw new RangeError('At least one species count must be > 0');

    const N = species_counts.reduce((sum, n) => sum + n, 0);

    // Evenness J = H' / ln(S); requires Shannon computation
    const { h } = computeShannonIndex(species_counts);
    const evenness = S > 1 ? h / Math.log(S) : 1;

    return { S, N, evenness };
}

/**
 * Classify biodiversity level based on Shannon H index.
 * Classifica o nível de biodiversidade com base no índice H de Shannon.
 *
 * Thresholds (conventional ecological interpretation):
 *   very_low:  H < 0.5
 *   low:       0.5 <= H < 1.0
 *   moderate:  1.0 <= H < 2.0
 *   high:      2.0 <= H < 3.0
 *   very_high: H >= 3.0
 *
 * @param H - Shannon diversity index value
 * @throws {TypeError} If H is not a number
 * @throws {RangeError} If H is negative
 */
export function classifyBiodiversityLevel(H: number): { level: string } {
    if (typeof H !== 'number') throw new TypeError('H must be a number');
    if (H < 0) throw new RangeError('H must be >= 0');

    let level;
    if (H < 0.5) {
        level = 'very_low';
    } else if (H < 1.0) {
        level = 'low';
    } else if (H < 2.0) {
        level = 'moderate';
    } else if (H < 3.0) {
        level = 'high';
    } else {
        level = 'very_high';
    }

    return { level };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const biodiversityIndexMeta: AnalyticsModuleMeta = {
    name: 'biodiversityIndex',
    description: 'Biodiversity Index Assessment',
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
