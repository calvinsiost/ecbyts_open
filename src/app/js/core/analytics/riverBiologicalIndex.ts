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
'use strict';

/**
 * River Biological Index
 * Índices biológicos fluviais baseados em macroinvertebrados bentônicos.
 *
 * Referências:
 *   Armitage et al. (1983) Water Research 17(3):333-347. DOI:10.1016/0043-1354(83)90188-4
 *   Simpson (1949) Nature 163:688. DOI:10.1038/163688a0
 *   Alba-Tercedor & Sánchez-Ortega (1988) - adaptação BMWP ibérico
 */

/**
 * Tabela de pontuação BMWP por família de macroinvertebrado (Armitage et al. 1983).
 * Pontuação reflete sensibilidade à poluição (10 = muito sensível, 1 = tolerante).
 * @type {Record<string, number>}
 */
const BMWP_SCORES = {
    // Score 10 - altamente sensíveis
    Siphlonuridae: 10,
    Heptageniidae: 10,
    Leptophlebiidae: 10,
    Ephemerellidae: 10,
    Potamanthidae: 10,
    Ephemeridae: 10,
    Taeniopterygidae: 10,
    Leuctridae: 10,
    Capniidae: 10,
    Perlodidae: 10,
    Perlidae: 10,
    Chloroperlidae: 10,
    Aphelocheiridae: 10,
    Phryganeidae: 10,
    Molannidae: 10,
    Beraeidae: 10,
    Odontoceridae: 10,
    Leptoceridae: 10,
    Goeridae: 10,
    Lepidostomatidae: 10,
    Brachycentridae: 10,
    Sericostomatidae: 10,

    // Score 8 - muito sensíveis
    Astacidae: 8,
    Lestidae: 8,
    Agriidae: 8,
    Gomphidae: 8,
    Cordulegasteridae: 8,
    Aeshnidae: 8,
    Corduliidae: 8,
    Libellulidae: 8,
    Psychomyiidae: 8,
    Philopotamidae: 8,

    // Score 7 - sensíveis
    Caenidae: 7,
    Nemouridae: 7,
    Rhyacophilidae: 7,
    Polycentropodidae: 7,
    Limnephilidae: 7,

    // Score 6 - moderadamente sensíveis
    Neritidae: 6,
    Viviparidae: 6,
    Ancylidae: 6,
    Hydroptilidae: 6,
    Unionidae: 6,
    Corophiidae: 6,
    Gammaridae: 6,
    Platycnemididae: 6,
    Coenagrionidae: 6,

    // Score 5 - moderados
    Mesoveliidae: 5,
    Hydrometridae: 5,
    Gerridae: 5,
    Nepidae: 5,
    Naucoridae: 5,
    Notonectidae: 5,
    Pleidae: 5,
    Corixidae: 5,
    Haliplidae: 5,
    Hygrobiidae: 5,
    Dytiscidae: 5,
    Gyrinidae: 5,
    Hydrophilidae: 5,
    Clambidae: 5,
    Helodidae: 5,
    Dryopidae: 5,
    Elmidae: 5,
    Chrysomelidae: 5,
    Curculionidae: 5,
    Hydropsychidae: 5,
    Tipulidae: 5,
    Simuliidae: 5,
    Planariidae: 5,
    Dendrocoelidae: 5,

    // Score 4 - tolerantes intermediários
    Baetidae: 4,
    Chironomidae: 4,
    Valvatidae: 4,
    Hydrobiidae: 4,
    Lymnaeidae: 4,
    Physidae: 4,
    Planorbidae: 4,
    Sphaeriidae: 4,
    Glossiphoniidae: 4,
    Hirudinidae: 4,
    Erpobdellidae: 4,
    Asellidae: 4,

    // Score 3 - semi-tolerantes
    Sialidae: 3,
    Pisicolidae: 3,

    // Score 2 - tolerantes
    Oligochaeta: 2,

    // Score 1 - muito tolerantes
    Eristalinae: 1,
    Syrphidae: 1,
};

/**
 * Calcula o score BMWP total para uma lista de famílias de macroinvertebrados.
 * Cada família é contada uma única vez (presença/ausência), mesmo se múltiplos indivíduos.
 *
 * @param {string[]} macroinvertebrateList - Lista de nomes de famílias presentes
 * @returns {number} Score BMWP total
 */
export function calcBMWP(macroinvertebrateList: any) {
    if (!Array.isArray(macroinvertebrateList)) {
        throw new TypeError('calcBMWP: macroinvertebrateList deve ser um array.');
    }

    // Usar Set para garantir presença/ausência (cada família conta uma vez)
    const uniqueFamilies = new Set(macroinvertebrateList);
    let totalScore = 0;

    for (const family of uniqueFamilies) {
        if (typeof family !== 'string') {
            throw new TypeError('calcBMWP: todos os elementos da lista devem ser strings.');
        }
const score = (BMWP_SCORES as Record<string, number>)[family];
        if (score !== undefined) {
            totalScore += score;
        }
        // Famílias não reconhecidas são ignoradas (sem pontuação)
    }

    return totalScore;
}

/**
 * Calcula o ASPT (Average Score Per Taxon).
 * ASPT = BMWP / n_famílias_pontuadas  (Armitage et al. 1983)
 *
 * @param {number} bmwpScore  - Score BMWP total
 * @param {number} familyCount - Número de famílias que contribuíram para o score
 * @returns {number} ASPT (0 se familyCount = 0)
 */
export function calcASPT(bmwpScore: any, familyCount: any) {
    if (typeof bmwpScore !== 'number' || typeof familyCount !== 'number') {
        throw new TypeError('calcASPT: parâmetros devem ser números.');
    }
    if (bmwpScore < 0 || familyCount < 0) {
        throw new RangeError('calcASPT: parâmetros devem ser não-negativos.');
    }
    if (familyCount === 0) return 0;

    return bmwpScore / familyCount;
}

/**
 * Classifica a qualidade da água com base no ASPT (Armitage et al. 1983, Tabela 5).
 *
 * @param {number} aspt - Average Score Per Taxon
 * @returns {'unpolluted'|'doubtful'|'moderately_polluted'|'polluted'|'heavily_polluted'}
 */
export function classifyWaterQuality(aspt: any) {
    if (typeof aspt !== 'number' || aspt < 0) {
        throw new RangeError('classifyWaterQuality: aspt deve ser número não-negativo.');
    }

    if (aspt >= 6.0) return 'unpolluted';
    if (aspt >= 5.0) return 'doubtful';
    if (aspt >= 4.0) return 'moderately_polluted';
    if (aspt >= 2.0) return 'polluted';
    return 'heavily_polluted';
}

/**
 * Calcula o índice de diversidade de Simpson (1 - D).
 * D = Σ [n_i × (n_i - 1)] / [N × (N - 1)]
 * Diversity = 1 - D   (Simpson 1949, Nature 163:688)
 *
 * @param {number[]} abundances - Array com a abundância de cada táxon (inteiros ≥ 0)
 * @returns {number} Índice de Simpson (0 = sem diversidade, ~1 = alta diversidade)
 */
export function calcSimpsonsIndex(abundances: any) {
    if (!Array.isArray(abundances) || abundances.length === 0) {
        throw new TypeError('calcSimpsonsIndex: abundances deve ser array não-vazio.');
    }

    let N = 0;
    let sumNiNiMinus1 = 0;

    for (const n of abundances) {
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
            throw new TypeError('calcSimpsonsIndex: abundâncias devem ser inteiros não-negativos.');
        }
        N += n;
        sumNiNiMinus1 += n * (n - 1);
    }

    if (N <= 1) return 0; // Com 0 ou 1 indivíduo, diversidade indefinida → 0

    const D = sumNiNiMinus1 / (N * (N - 1));
    return 1 - D;
}

/**
 * Retorna a pontuação BMWP de uma família específica (utilitário para UI).
 *
 * @param {string} family - Nome da família
 * @returns {number|null} Pontuação (1-10) ou null se não reconhecida
 */
export function getFamilyBMWPScore(family: any) {
    if (typeof family !== 'string') {
        throw new TypeError('getFamilyBMWPScore: family deve ser string.');
    }
// eslint-disable-next-line
const familyKey = family as keyof typeof BMWP_SCORES;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverBiologicalIndexMeta = {
    name: 'riverBiologicalIndex',
    description: 'riverBiologicalIndex',
    category: 'analytics',
    familyTags: ['river'],
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
