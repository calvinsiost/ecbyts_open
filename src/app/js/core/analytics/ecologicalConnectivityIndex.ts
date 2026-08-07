// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Ecological Connectivity Index
// Índice de conectividade ecológica: fragmentação, corredores e permeabilidade da paisagem.
//
// References:
//   McGarigal & Marks (1995) FRAGSTATS - USDA Forest Service General Technical Report
//   Urban & Keitt (2001) Ecology DOI:10.1890/0012-9658(2001)082[1205:LGCA]2.0.CO;2
//   McRae et al. (2008) Ecology DOI:10.1890/07-1861.1 - Circuit theory connectivity
//   MMA (2010) Áreas Prioritárias para Conservação da Biodiversidade - MMA/Brazil

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
 * Computes landscape fragmentation index based on patch statistics.
 * Calcula o índice de fragmentação da paisagem com base em estatísticas de manchas.
 *
 * @param total_area_ha    - Total habitat area (ha)
 * @param n_patches        - Number of patches (> 0)
 * @param largest_patch_ha - Area of the largest patch (ha)
 */
export function computeFragmentationIndex(
    total_area_ha: number,
    n_patches: number,
    largest_patch_ha: number,
): { frag_index: number; isolation_class: string } {
    if ([total_area_ha, n_patches, largest_patch_ha].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (n_patches <= 0) throw new RangeError('n_patches must be > 0');
    if (total_area_ha <= 0) throw new RangeError('total_area_ha must be > 0');
    if (largest_patch_ha < 0) throw new RangeError('largest_patch_ha must be >= 0');
    if (largest_patch_ha > total_area_ha) {
        throw new RangeError('largest_patch_ha cannot exceed total_area_ha');
    }

    // FI = 1 - (n^(-0.5) × LPI) - baseado em McGarigal & Marks (1995) FRAGSTATS
    // LPI (Largest Patch Index) = proporção da maior mancha sobre a área total
    const lpi = largest_patch_ha / total_area_ha;
    const frag_index = Math.min(1, Math.max(0, 1 - Math.pow(n_patches, -0.5) * lpi));

    // Classificação com critério duplo (FI e número de manchas)
    let isolation_class;
    if (frag_index > 0.8 || n_patches > 50) {
        isolation_class = 'highly_fragmented';
    } else if (frag_index > 0.5) {
        isolation_class = 'fragmented';
    } else if (frag_index > 0.2) {
        isolation_class = 'moderate';
    } else {
        isolation_class = 'high_connectivity';
    }

    return { frag_index, isolation_class };
}

/**
 * Computes ecological corridor effectiveness for wildlife movement.
 * Calcula a efetividade de corredor ecológico para movimento da fauna.
 *
 * @param corridor_width_m        - Width of the corridor (m)
 * @param corridor_length_m       - Length of the corridor (m)
 * @param vegetation_quality_score - Vegetation quality [1–5]
 */
export function computeCorridorEffectiveness(
    corridor_width_m: number,
    corridor_length_m: number,
    vegetation_quality_score: number,
): { permeability: number; connectivity_benefit: string } {
    if ([corridor_width_m, corridor_length_m, vegetation_quality_score].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (corridor_width_m < 0) throw new RangeError('corridor_width_m must be >= 0');
    if (corridor_length_m < 0) throw new RangeError('corridor_length_m must be >= 0');
    if (vegetation_quality_score < 1 || vegetation_quality_score > 5) {
        throw new RangeError('vegetation_quality_score must be in [1, 5]');
    }

    // Permeabilidade: função da largura (saturação em 500 m), qualidade da vegetação
    // e decaimento exponencial com o comprimento (referência: Urban & Keitt 2001)
    const width_factor = Math.sqrt(corridor_width_m / 500);
    const quality_factor = vegetation_quality_score / 5;
    const length_decay = Math.exp(-corridor_length_m / 10000);
    const permeability = Math.min(1, width_factor * quality_factor * length_decay);

    let connectivity_benefit;
    if (permeability > 0.6) {
        connectivity_benefit = 'high';
    } else if (permeability > 0.3) {
        connectivity_benefit = 'moderate';
    } else {
        connectivity_benefit = 'low';
    }

    return { permeability, connectivity_benefit };
}

/**
 * Computes circuit-theoretic connectivity metrics for a habitat graph.
 * Calcula métricas de conectividade por teoria de circuitos para grafo de habitats.
 *
 * @param n_nodes      - Number of habitat nodes (>= 2)
 * @param n_edges      - Number of edges (connections) between nodes
 * @param edge_weights - Conductance weights of edges (> 0)
 */
export function computeCircuitConnectivity(
    n_nodes: number,
    n_edges: number,
    edge_weights: number[],
): { algebraic_connectivity: number; mean_resistance: number } {
    if (typeof n_nodes !== 'number' || typeof n_edges !== 'number') {
        throw new TypeError('n_nodes and n_edges must be numbers');
    }
    if (!Array.isArray(edge_weights)) throw new TypeError('edge_weights must be an array');
    if (n_nodes < 2) throw new RangeError('n_nodes must be >= 2');
    if (n_edges < 0) throw new RangeError('n_edges must be >= 0');
    if (edge_weights.some((w) => typeof w !== 'number' || w <= 0)) {
        throw new RangeError('All edge_weights must be positive numbers');
    }

    if (edge_weights.length === 0 || n_edges === 0) {
        return { algebraic_connectivity: 0, mean_resistance: Infinity };
    }

    const min_w = Math.min(...edge_weights);
    const mean_w = edge_weights.reduce((a, b) => a + b, 0) / edge_weights.length;

    // Conectividade algébrica (aproximação do segundo menor autovalor do Laplaciano - Fiedler value)
    // Bound inferior: λ₂ ≥ 2·|E|·w_min / n² - McRae et al. (2008)
    const algebraic_connectivity = (2 * n_edges * min_w) / (n_nodes * n_nodes);

    // Resistência média: proporcional ao número de nós e inversamente às arestas ponderadas
    // Baseado na analogia resistência-distância de circuit theory (Urban & Keitt 2001)
    const mean_resistance = (n_nodes / n_edges) * (1 / mean_w);

    return { algebraic_connectivity, mean_resistance };
}

function assertAllNumbers(values: unknown[], message: string): asserts values is number[] {
    if (values.some((v) => typeof v !== 'number')) {
        throw new TypeError(message);
    }
}

function classifyPermeabilityClass(
    frag_index: number,
    corridor_effectiveness: number,
    human_pressure_score: number,
): string {
    if (frag_index < 0.2 && human_pressure_score < 0.2) return 'natural';
    if (frag_index > 0.9) return 'impermeable';
    if (frag_index < 0.4 && corridor_effectiveness > 0.5) return 'high';
    if (frag_index < 0.6 && corridor_effectiveness > 0.3) return 'medium';
    return 'low';
}

function classifyRestorationPriority(
    permeability_class: string,
    frag_index: number,
    human_pressure_score: number,
): string {
    const pressure_score_combined = frag_index * 0.6 + human_pressure_score * 0.4;
    if (permeability_class === 'impermeable' || pressure_score_combined > 0.8) return 'critical';
    if (pressure_score_combined > 0.55) return 'high';
    if (pressure_score_combined > 0.3) return 'medium';
    return 'low';
}

/**
 * Classifies overall landscape permeability for biodiversity conservation.
 * Classifica a permeabilidade geral da paisagem para conservação da biodiversidade.
 *
 * @param frag_index              - Fragmentation index [0–1] from computeFragmentationIndex
 * @param corridor_effectiveness  - Corridor permeability [0–1] from computeCorridorEffectiveness
 * @param human_pressure_score    - Human pressure index [0–1] (0=pristine, 1=heavily disturbed)
 */
export function classifyLandscapePermeability(
    frag_index: number,
    corridor_effectiveness: number,
    human_pressure_score: number,
): { permeability_class: string; restoration_priority: string } {
    assertAllNumbers([frag_index, corridor_effectiveness, human_pressure_score], 'All parameters must be numbers');
    if (frag_index < 0 || frag_index > 1) throw new RangeError('frag_index must be in [0, 1]');
    if (corridor_effectiveness < 0 || corridor_effectiveness > 1) {
        throw new RangeError('corridor_effectiveness must be in [0, 1]');
    }
    if (human_pressure_score < 0 || human_pressure_score > 1) {
        throw new RangeError('human_pressure_score must be in [0, 1]');
    }

    const permeability_class = classifyPermeabilityClass(frag_index, corridor_effectiveness, human_pressure_score);
    const restoration_priority = classifyRestorationPriority(permeability_class, frag_index, human_pressure_score);
    return { permeability_class, restoration_priority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalConnectivityIndexMeta: AnalyticsModuleMeta = {
    name: 'ecologicalConnectivityIndex',
    description: 'ecologicalConnectivityIndex',
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
