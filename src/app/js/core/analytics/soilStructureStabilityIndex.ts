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
/**
 * @module soilStructureStabilityIndex
 * @description Índice de estabilidade estrutural do solo: MWD (Mean Weight Diameter),
 *   WSA (Water-Stable Aggregates) e Razão de Dispersão, conforme Le Bissonnais (1996)
 *   e Kemper & Rosenau (1986). Implementação independente.
 *
 * Referências acadêmicas:
 *   - Le Bissonnais, Y. (1996) "Aggregate stability and assessment of soil crustability
 *     and erodibility: I. Theory and methodology." Eur. J. Soil Sci. 47:425–437.
 *     DOI:10.1111/j.1365-2389.1996.tb01843.x
 *   - Kemper, W.D. & Rosenau, R.C. (1986) "Aggregate stability and size distribution."
 *     In: Methods of Soil Analysis, Part 1. Soil Sci. Soc. Am., Madison, WI. pp. 425–442.
 *     ISBN:978-0-89118-088-3
 *   - Six, J. et al. (2000) "Soil macroaggregate turnover and microaggregate formation:
 *     a mechanism for C sequestration under no-tillage agriculture." Soil Biol. Biochem.
 *     32:2099–2103. DOI:10.1016/S0038-0717(00)00179-6
 */

'use strict';

// ---------------------------------------------------------------------------
// Limiares de classificacao MWD - Le Bissonnais (1996) Tabela 3
// ---------------------------------------------------------------------------
/** @type {Array<{max: number, label: 'very_unstable'|'unstable'|'medium'|'stable'|'very_stable'}>} */
const MWD_CLASSES = [
    { max: 0.4, label: 'very_unstable' },
    { max: 0.8, label: 'unstable' },
    { max: 1.3, label: 'medium' },
    { max: 2.0, label: 'stable' },
    { max: Infinity, label: 'very_stable' },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Calcula o Diâmetro Médio Ponderado (MWD - Mean Weight Diameter) de agregados
 * do solo após peneiramento úmido.
 *
 * MWD = Σ(xᵢ × wᵢ)  onde xᵢ = ponto médio da fração (mm) e wᵢ = proporção mássica.
 *
 * Referência: Kemper & Rosenau (1986); Le Bissonnais (1996) §2.1.
 *
 * @param {number[]} sieveClasses  - Tamanhos médios de peneira (mm), ex: [4.75, 2.0, 1.0, 0.5, 0.25, 0.1]
 * @param {number[]} massRetained  - Massa retida em cada fração (g), mesmo comprimento que sieveClasses
 * @returns {{ MWD_mm: number, fractions: { size_mm: number, proportion: number }[] }}
 */
export function calcMWD(sieveClasses: any, massRetained: any) {
    if (!Array.isArray(sieveClasses) || !Array.isArray(massRetained)) {
        throw new TypeError('sieveClasses and massRetained must be arrays');
    }
    if (sieveClasses.length !== massRetained.length) {
        throw new RangeError('sieveClasses and massRetained must have the same length');
    }
    if (sieveClasses.length === 0) {
        throw new RangeError('Arrays must have at least one element');
    }
    for (let i = 0; i < sieveClasses.length; i++) {
        if (typeof sieveClasses[i] !== 'number' || sieveClasses[i] <= 0) {
            throw new RangeError(`sieveClasses[${i}] must be a positive number`);
        }
        if (typeof massRetained[i] !== 'number' || massRetained[i] < 0) {
            throw new RangeError(`massRetained[${i}] must be a non-negative number`);
        }
    }

    const totalMass = massRetained.reduce((s, m) => s + m, 0);
    if (totalMass === 0) {
        throw new RangeError('Sum of massRetained must be > 0');
    }

    const fractions = sieveClasses.map((size, i) => ({
        size_mm: size,
        proportion: massRetained[i] / totalMass,
    }));

    const MWD_mm = fractions.reduce((sum, f) => sum + f.size_mm * f.proportion, 0);
    return { MWD_mm, fractions };
}

/**
 * Calcula a percentagem de Agregados Estáveis em Água (WSA - Water-Stable Aggregates).
 *
 * WSA (%) = (massStable / totalMass) × 100
 *
 * Referência: Kemper & Rosenau (1986) pp. 428–430.
 *
 * @param {number} massStable - Massa de agregados que resistiram ao peneiramento úmido (g)
 * @param {number} totalMass  - Massa total inicial de agregados (g)
 * @returns {{ WSA_pct: number }} Percentagem de agregados estáveis
 */
export function calcWSA(massStable: any, totalMass: any) {
    if (typeof massStable !== 'number' || !isFinite(massStable) || massStable < 0) {
        throw new RangeError('massStable must be a non-negative finite number');
    }
    if (typeof totalMass !== 'number' || !isFinite(totalMass) || totalMass <= 0) {
        throw new RangeError('totalMass must be a positive finite number');
    }
    if (massStable > totalMass) {
        throw new RangeError('massStable cannot exceed totalMass');
    }

    const WSA_pct = (massStable / totalMass) * 100;
    return { WSA_pct };
}

/**
 * Classifica a estabilidade de agregados com base no MWD segundo Le Bissonnais (1996).
 *
 * Classes (MWD em mm):
 *   ≤ 0.4  → 'very_unstable'
 *   ≤ 0.8  → 'unstable'
 *   ≤ 1.3  → 'medium'
 *   ≤ 2.0  → 'stable'
 *   > 2.0  → 'very_stable'
 *
 * Referência: Le Bissonnais (1996) Eur. J. Soil Sci. Tabela 3.
 *
 * @param {number} MWD_mm - Diâmetro médio ponderado (mm, ≥ 0)
 * @returns {'very_unstable'|'unstable'|'medium'|'stable'|'very_stable'}
 */
export function classifyAggregateStability(MWD_mm: any) {
    if (typeof MWD_mm !== 'number' || !isFinite(MWD_mm) || MWD_mm < 0) {
        throw new RangeError('MWD_mm must be a non-negative finite number');
    }

    for (const { max, label } of MWD_CLASSES) {
        if (MWD_mm <= max) return label;
    }
    return 'very_stable'; // fallback
}

/**
 * Calcula a Razão de Dispersão (DR - Dispersion Ratio) do solo.
 *
 * DR = (argila + silte em água) / (argila + silte em dispersão mecânica)
 *
 * DR próximo de 1 indica solo dispersivo (alta erosividade); DR próximo de 0
 * indica boa floculação e estabilidade.
 *
 * Referência: Middleton (1930) apud Kemper & Rosenau (1986); values interpreted
 * per Igwe et al. (2005) Soil Use Manage. 21:396–401.
 *
 * @param {number} clay_silt_water      - (argila + silte) em suspensão em água (g)
 * @param {number} clay_silt_mechanical - (argila + silte) com dispersão mecânica total (g)
 * @returns {{ DR: number, interpretation: string }} Razão e interpretação
 */
export function calcDispersionRatio(clay_silt_water: any, clay_silt_mechanical: any) {
    if (typeof clay_silt_water !== 'number' || !isFinite(clay_silt_water) || clay_silt_water < 0) {
        throw new RangeError('clay_silt_water must be a non-negative finite number');
    }
    if (typeof clay_silt_mechanical !== 'number' || !isFinite(clay_silt_mechanical) || clay_silt_mechanical <= 0) {
        throw new RangeError('clay_silt_mechanical must be a positive finite number');
    }
    if (clay_silt_water > clay_silt_mechanical) {
        throw new RangeError('clay_silt_water cannot exceed clay_silt_mechanical');
    }

    const DR = clay_silt_water / clay_silt_mechanical;

    let interpretation;
    if (DR < 0.15) {
        interpretation = 'highly_flocculated';
    } else if (DR < 0.5) {
        interpretation = 'moderately_stable';
    } else if (DR < 0.75) {
        interpretation = 'dispersive_tendency';
    } else {
        interpretation = 'highly_dispersive';
    }

    return { DR, interpretation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilStructureStabilityIndexMeta = {
    name: 'soilStructureStabilityIndex',
    description: 'soilStructureStabilityIndex',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
