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
// Application: EHS & Mining - Ecological Carrying Capacity
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Ecological Carrying Capacity - Population Dynamics & Trophic Analysis
 *
 * Módulo puro implementando modelos clássicos de capacidade de suporte ecológica:
 * crescimento logístico de Verhulst (1838), cascata trófica de Lindeman (1942),
 * capacidade de habitat e classificação de status populacional com critério MVP
 * de Shaffer (1981).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module ecologicalCarryingCapacity
 * @references
 *   Verhulst (1838) Nouv. Mém. Acad. Roy. Bruxelles 18:1-42 - Logistic growth
 *   Lindeman (1942) Ecology 23(4):399-417 - Trophic dynamics (10% rule)
 *   Shaffer (1981) BioScience 31(2):131-134 - Minimum Viable Population (MVP)
 *   MacArthur & Wilson (1967) - Island Biogeography (habitat capacity theory)
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

type PopulationStatus = 'extinct' | 'critical' | 'vulnerable' | 'stable' | 'thriving';

// Default trophic transfer efficiency (Lindeman 1942 "10% rule")
// Eficiência de transferência trófica padrão - regra dos 10% de Lindeman
const DEFAULT_TRANSFER_EFFICIENCY = 0.1;

/**
 * Compute population size using the Verhulst logistic growth model.
 * Calcula o tamanho populacional pelo modelo de crescimento logístico de Verhulst (1838).
 *
 * P(t) = K / (1 + ((K - P0) / P0) × exp(-r × t))
 *
 * onde:
 *   K = capacidade de suporte (carrying capacity)
 *   P0 = população inicial
 *   r = taxa de crescimento intrínseca (por ano)
 *   t = tempo (anos)
 *
 * @param {number} population        - Initial population P0 / População inicial
 * @param {number} carryingCapacity  - Environmental carrying capacity K / Capacidade de suporte K
 * @param {number} growthRate        - Intrinsic growth rate r (per year) / Taxa de crescimento
 * @param {number} time_yr           - Time elapsed (years) / Tempo decorrido (anos)
 * @returns {{ population: number, saturation_pct: number }}
 * @throws {RangeError} If carryingCapacity <= 0 or initial population is negative
 */
export function computeLogisticGrowth(
    population: number,
    carryingCapacity: number,
    growthRate: number,
    time_yr: number,
): { population: number; saturation_pct: number } {
    if (carryingCapacity <= 0) throw new RangeError('carryingCapacity must be positive');
    if (population < 0) throw new RangeError('population must be non-negative');
    if (time_yr < 0) throw new RangeError('time_yr must be non-negative');

    // Caso especial: população inicial zero permanece zero
    if (population === 0) {
        return { population: 0, saturation_pct: 0 };
    }

    // Parâmetro A do modelo logístico: razão (K - P0) / P0
    // Indica quão longe a população está da capacidade de suporte
    const A = (carryingCapacity - population) / population;

    // Equação logística de Verhulst (1838)
    const finalPop = carryingCapacity / (1 + A * Math.exp(-growthRate * time_yr));

    // Percentual de saturação da capacidade de suporte
    const saturation_pct = (finalPop / carryingCapacity) * 100;

    return {
        population: finalPop,
        saturation_pct,
    };
}

/**
 * Compute biomass distribution across trophic levels (Lindeman 1942).
 * Calcula a biomassa por nível trófico baseado na pirâmide de Lindeman (1942).
 *
 * B_n = B_0 × ε^n  (regra dos 10%: apenas 10% da energia é transferida entre níveis)
 *
 * onde ε = eficiência de transferência (padrão 0,1 = 10%)
 *
 * @param {number}   primaryProducer_g_m2  - Biomass of primary producers (g/m²) / Biomassa de produtores
 * @param {number}   transferEfficiency    - Trophic efficiency [0.05, 0.20] / Eficiência de transferência
 * @param {number}   trophicLevels         - Number of trophic levels / Número de níveis tróficos
 * @returns {{ biomassPerLevel: number[], totalBiomass: number }}
 * @throws {RangeError} If parameters are out of valid range
 */
export function computeTrophicCascade(
    primaryProducer_g_m2: number,
    transferEfficiency: number,
    trophicLevels: number,
): { biomassPerLevel: number[]; totalBiomass: number } {
    if (primaryProducer_g_m2 <= 0) throw new RangeError('primaryProducer_g_m2 must be positive');
    if (trophicLevels < 1 || !Number.isInteger(trophicLevels)) {
        throw new RangeError('trophicLevels must be a positive integer');
    }

    // Validação da eficiência de transferência
    const eff =
        transferEfficiency === undefined || transferEfficiency === null
            ? DEFAULT_TRANSFER_EFFICIENCY
            : transferEfficiency;

    if (eff <= 0 || eff > 1) {
        throw new RangeError('transferEfficiency must be in (0, 1]');
    }

    // Cálculo da biomassa por nível trófico: B_n = B_0 × ε^n
    // Nível 0 = produtores primários, nível 1 = herbívoros, etc.
    const biomassPerLevel = [];
    let totalBiomass = 0;

    for (let n = 0; n < trophicLevels; n++) {
        const biomass = primaryProducer_g_m2 * Math.pow(eff, n);
        biomassPerLevel.push(biomass);
        totalBiomass += biomass;
    }

    return { biomassPerLevel, totalBiomass };
}

/**
 * Compute habitat carrying capacity for a species based on area and space requirement.
 * Calcula a capacidade de suporte do habitat para uma espécie.
 *
 * K = floor(A / R)  onde A = área (ha), R = requisito por indivíduo (ha/indivíduo)
 *
 * @param {number} habitatArea_ha                     - Available habitat area (ha) / Área de habitat
 * @param {number} speciesRequirement_ha_per_individual - Space per individual (ha) / Espaço por indivíduo
 * @returns {{ individuals: number, fractionUsed: (population: number) => number }}
 * @throws {RangeError} If area is non-positive or requirement is non-positive
 */
export function computeHabitatCapacity(
    habitatArea_ha: number,
    speciesRequirement_ha_per_individual: number,
): { individuals: number; fractionUsed: (population: number) => number } {
    if (habitatArea_ha <= 0) throw new RangeError('habitatArea_ha must be positive');
    if (speciesRequirement_ha_per_individual <= 0) {
        throw new RangeError('speciesRequirement_ha_per_individual must be positive');
    }

    // Capacidade máxima: número inteiro de indivíduos suportados pelo habitat
    const K = habitatArea_ha / speciesRequirement_ha_per_individual;
    const individuals = Math.floor(K);

    return {
        individuals,
        /**
         * Fraction of carrying capacity used by a given population.
         * Fração da capacidade de suporte utilizada por uma determinada população.
         * @param {number} carryingCapacity - Current population / População atual
         * @returns {number} Fraction [0, ...] / Fração utilizada
         */
        fractionUsed: (population: number) => population / K,
    };
}

/**
 * Classify population conservation status against carrying capacity and MVP.
 * Classifica o status de conservação da população em relação à capacidade de suporte e MVP.
 *
 * Critérios de Shaffer (1981) e IUCN:
 *   - extinct: population = 0
 *   - critical: population < MVP (abaixo do mínimo viável)
 *   - vulnerable: population < 10% de K
 *   - stable: population < 80% de K
 *   - thriving: population >= 80% de K (próximo à capacidade de suporte)
 *
 * @param {number} carryingCapacity        - Current population size / Tamanho da população atual
 * @param {number} carryingCapacity  - Environmental carrying capacity K / Capacidade de suporte K
 * @param {number} carryingCapacity     - Minimum Viable Population (MVP) / População mínima viável
 * @returns {{ status: 'extinct'|'critical'|'vulnerable'|'stable'|'thriving', mvpRatio: number }}
 * @throws {RangeError} If any parameter is negative or carryingCapacity/minimumViable are non-positive
 */
export function classifyPopulationStatus(
    population: number,
    carryingCapacity: number,
    minimumViable: number,
): { status: PopulationStatus; mvpRatio: number } {
    if (population < 0) throw new RangeError('population must be non-negative');
    if (carryingCapacity <= 0) throw new RangeError('carryingCapacity must be positive');
    if (minimumViable <= 0) throw new RangeError('minimumViable must be positive');

    // Razão MVP: indica quantas vezes a população excede o mínimo viável
    const mvpRatio = population / minimumViable;

    /** @type {'extinct'|'critical'|'vulnerable'|'stable'|'thriving'} */
    let status: PopulationStatus;

    if (population === 0) {
        status = 'extinct';
    } else if (population < minimumViable) {
        // Abaixo do mínimo viável - risco de extinção por estocasticidade (Shaffer 1981)
        status = 'critical';
    } else if (population < 0.1 * carryingCapacity) {
        // Menos de 10% da capacidade de suporte - vulnerável a perturbações
        status = 'vulnerable';
    } else if (population < 0.8 * carryingCapacity) {
        // Entre 10% e 80% da capacidade - população estável
        status = 'stable';
    } else {
        // >= 80% da capacidade de suporte - população próspera
        status = 'thriving';
    }

    return { status, mvpRatio };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const ecologicalCarryingCapacityMeta: AnalyticsModuleMeta = {
    name: 'ecologicalCarryingCapacity',
    description: 'Ecological Carrying Capacity',
    category: 'analytics',
    familyTags: ['ecosystem', 'lca'],
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
