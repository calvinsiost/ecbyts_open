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
 * Aquatic Biodiversity Index - Índice de biodiversidade aquática
 *
 * Referências acadêmicas:
 *  - Shannon, C.E. & Weaver, W. (1948). A Mathematical Theory of Communication.
 *    Bell System Technical Journal, 27, 379-423. DOI: 10.1002/j.1538-7305.1948.tb01338.x
 *  - Simpson, E.H. (1949). Measurement of diversity. Nature, 163, 688.
 *    DOI: 10.1038/163688a0
 *  - Margalef, R. (1958). Information theory in ecology.
 *    General Systems Yearbook, 3, 36-71.
 *  - Pielou, E.C. (1966). The measurement of diversity in different types of biological
 *    collections. Journal of Theoretical Biology, 13, 131-144.
 *    DOI: 10.1016/0022-5193(66)90013-0
 *  - IBGE/MMA (2010). Mapeamento e avaliação da biodiversidade aquática em bacias
 *    hidrográficas brasileiras. Relatório Técnico PROBIO II.
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * @module aquaticBiodiversityIndex
 */

/**
 * Validates an abundance array: non-negative integers/floats, at least one species.
 * Valida array de abundâncias: não-negativos, pelo menos uma espécie.
 *
 * @param abundances - Array of species counts / contagens de espécies
 * @throws {TypeError} if not an array
 * @throws {RangeError} if empty, all zero, or contains negatives
 * @returns Filtered non-zero abundances
 */
function validateAndFilter(abundances: number[]): number[] {
    if (!Array.isArray(abundances)) throw new TypeError('abundances must be an array');
    if (abundances.length === 0) throw new RangeError('abundances must not be empty');
    if (abundances.some((v) => typeof v !== 'number' || !isFinite(v) || v < 0)) {
        throw new RangeError('all abundance values must be non-negative finite numbers');
    }
    const nonZero = abundances.filter((v) => v > 0);
    if (nonZero.length === 0) throw new RangeError('at least one abundance must be > 0');
    return nonZero;
}

/**
 * Calculates species richness S (total number of species present).
 * Calcula a riqueza de espécies S (número total de espécies presentes).
 *
 * @param abundances - Array of species abundances (counts per species)
 * @returns Species richness S
 */
export function calcSpeciesRichness(abundances: number[]): number {
    validateAndFilter(abundances); // side-effect: validates
    // S = number of species with count > 0 / número de espécies com contagem > 0
    return abundances.filter((v) => v > 0).length;
}

/**
 * Calculates Shannon-Wiener diversity index H'.
 * Calcula o índice de diversidade de Shannon-Wiener H'.
 *
 * H' = -∑(pi * ln(pi))  where pi = ni / N
 * Range: [0, ln(S)]; 0 = single species; ln(S) = perfectly even distribution
 *
 * @param abundances - Array of species abundances
 * @returns Shannon index H' (nats)
 */
export function calcShannonIndex(abundances: number[]): number {
    const nonZero = validateAndFilter(abundances);
    const N = nonZero.reduce((s, v) => s + v, 0);

    // H' = -∑ pi * ln(pi) / índice de Shannon em nats
    return nonZero.reduce((h, ni) => {
        const pi = ni / N;
        return h - pi * Math.log(pi);
    }, 0);
}

/**
 * Calculates Simpson's diversity index D and its complement (1-D).
 * Calcula o índice de diversidade de Simpson D e seu complemento (1-D).
 *
 * D = ∑(ni*(ni-1)) / (N*(N-1))   (probability of same-species draw)
 * 1-D = 1 - D  (probability of inter-species draw, ranges 0-1)
 *
 * @param abundances - Array of species abundances (integer counts recommended)
 * @returns simpson_D: dominance index [0,1] (0=max diversity, 1=single species);
 *   giniSimpson: Gini-Simpson = 1-D [0,1] (higher = more diverse)
 */
export function calcSimpsonIndex(abundances: number[]): { simpson_D: number; giniSimpson: number } {
    const nonZero = validateAndFilter(abundances);
    const N = nonZero.reduce((s, v) => s + v, 0);

    if (N < 2) {
        // Com uma única ocorrência total, Simpson é 0 por definição
        return { simpson_D: 0, giniSimpson: 1 };
    }

    // Simpson D = ∑ni(ni-1) / N(N-1)
    const sumNiNi1 = nonZero.reduce((s, ni) => s + ni * (ni - 1), 0);
    const simpson_D = sumNiNi1 / (N * (N - 1));

    return { simpson_D, giniSimpson: 1 - simpson_D };
}

/**
 * Calculates Pielou's evenness index J'.
 * Calcula o índice de equitabilidade de Pielou J'.
 *
 * J' = H' / ln(S)   where S = species richness
 * Range: [0, 1]; 1 = perfectly even distribution
 *
 * @param abundances - Array of species abundances
 * @returns Pielou's J' [0, 1]
 */
export function calcPielouEvenness(abundances: number[]): number {
    const nonZero = validateAndFilter(abundances);
    const S = nonZero.length;

    if (S === 1) return 0; // Única espécie: equitabilidade indefinida → 0 por convenção

    const Hprime = calcShannonIndex(abundances);
    const Hmax = Math.log(S); // ln(S) = Shannon máximo possível

    return Hprime / Hmax;
}

/**
 * Calculates Margalef's species richness index d.
 * Calcula o índice de riqueza de Margalef d.
 *
 * d = (S - 1) / ln(N)
 * Higher values indicate greater diversity relative to sample size.
 *
 * @param abundances - Array of species abundances
 * @returns Margalef's d (dimensionless)
 */
export function calcMargalefIndex(abundances: number[]): number {
    const nonZero = validateAndFilter(abundances);
    const S = nonZero.length;
    const N = nonZero.reduce((s, v) => s + v, 0);

    if (N <= 1) throw new RangeError('Total abundance N must be > 1 for Margalef index');

    // d = (S-1) / ln(N) / Margalef 1958
    return (S - 1) / Math.log(N);
}

/**
 * Classifies biotic integrity from Shannon index.
 * Classifica integridade biótica a partir do índice de Shannon.
 *
 * Thresholds adapted from IBGE/MMA (2010) and Hilsenhoff (1988) adapted for Brazil.
 *
 * @param shannonH - Shannon index H' (nats)
 */
function classifyIntegrity(shannonH: number): { class: string; label: string; color: string } {
    if (shannonH >= 3.0) return { class: 'I', label: 'excellent', color: '#1a7f37' };
    if (shannonH >= 2.0) return { class: 'II', label: 'good', color: '#57ab5a' };
    if (shannonH >= 1.0) return { class: 'III', label: 'moderate', color: '#e3b341' };
    if (shannonH > 0) return { class: 'IV', label: 'poor', color: '#d1242f' };
    return { class: 'V', label: 'very_poor', color: '#8d1f1f' };
}

/**
 * Computes a complete aquatic biodiversity assessment from species abundance data.
 * Computa avaliação completa de biodiversidade aquática a partir de dados de abundância.
 *
 * @param abundances - Array of species abundances (one entry per species)
 */
export function calcBiodiversityAssessment(abundances: number[]): {
    S: number;
    shannonH: number;
    simpsonD: number;
    giniSimpson: number;
    pielouJ: number;
    margalefD: number;
    integrityClass: string;
    integrityLabel: string;
    integrityColor: string;
} {
    // Valida e calcula todos os índices / validate and compute all indices
    const S = calcSpeciesRichness(abundances);
    const shannonH = calcShannonIndex(abundances);
    const { simpson_D, giniSimpson } = calcSimpsonIndex(abundances);
    const pielouJ = calcPielouEvenness(abundances);

    const nonZero = abundances.filter((v) => v > 0);
    const N = nonZero.reduce((s, v) => s + v, 0);
    // Margalef requer N > 1; tratar caso especial
    const margalefD = N > 1 ? calcMargalefIndex(abundances) : 0;

    const integrity = classifyIntegrity(shannonH);

    return {
        S,
        shannonH,
        simpsonD: simpson_D,
        giniSimpson,
        pielouJ,
        margalefD,
        integrityClass: integrity.class,
        integrityLabel: integrity.label,
        integrityColor: integrity.color,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const aquaticBiodiversityIndexMeta = {
    name: 'aquaticBiodiversityIndex',
    description: 'aquaticBiodiversityIndex',
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
