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
 * Industrial Ecology Model - fluxos de materiais, circularidade e simbiose industrial.
 *
 * Referências acadêmicas:
 * - Eurostat (2018). Economy-wide material flow accounts: Handbook 2018.
 *   European Commission. DOI:10.2785/166494
 * - Ellen MacArthur Foundation (2015). Towards a circular economy: Business
 *   rationale for an accelerated transition. ISBN:978-0-9927784-1-2
 * - Frosch, R.A., & Gallopoulos, N.E. (1989). Strategies for manufacturing.
 *   Scientific American, 261(3), 144-152. DOI:10.1038/scientificamerican0989-144
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

/**
 * Computes material flow balance and resource efficiency for an industrial system.
 * Balanço de fluxo de materiais - base do MFA (Material Flow Analysis) da Eurostat 2018.
 *
 * @param inputs_t       - Massa de entradas de materiais em toneladas (≥ 0)
 * @param outputs_t      - Massa de saídas de produtos em toneladas (≥ 0)
 * @param stock_change_t - Variação do estoque em toneladas (pode ser negativo)
 * @returns
 *   balance_t = inputs - outputs - stock_change; efficiency_pct = outputs/inputs × 100
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se inputs_t < 0 ou outputs_t < 0
 */
export function computeMaterialFlowBalance(
    inputs_t: number,
    outputs_t: number,
    stock_change_t: number,
): { balance_t: number; efficiency_pct: number } {
    if (typeof inputs_t !== 'number' || typeof outputs_t !== 'number' || typeof stock_change_t !== 'number') {
        throw new TypeError('computeMaterialFlowBalance: all arguments must be numbers');
    }
    if (inputs_t < 0) throw new RangeError('computeMaterialFlowBalance: inputs_t must be >= 0');
    if (outputs_t < 0) throw new RangeError('computeMaterialFlowBalance: outputs_t must be >= 0');
    const balance_t = inputs_t - outputs_t - stock_change_t;
    // Eficiência: se inputs = 0, retorna 0 para evitar divisão por zero
    const efficiency_pct = inputs_t > 0 ? (outputs_t / inputs_t) * 100 : 0;
    return { balance_t, efficiency_pct };
}

/**
 * Computes the circularity rate of an industrial system.
 * Taxa de circularidade - fração de materiais reciclados em relação ao total produzido.
 * Referência: Ellen MacArthur Foundation (2015) ISBN:978-0-9927784-1-2
 *
 * @param recycled_mass_t      - Massa reciclada/reaproveitada em toneladas (≥ 0)
 * @param total_output_mass_t  - Massa total de saída em toneladas (> 0)
 * @returns circularity_pct ∈ [0,100]
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se recycled_mass_t < 0 ou total_output_mass_t ≤ 0
 */
export function computeCircularityRate(
    recycled_mass_t: number,
    total_output_mass_t: number,
): { circularity_pct: number } {
    if (typeof recycled_mass_t !== 'number' || typeof total_output_mass_t !== 'number') {
        throw new TypeError('computeCircularityRate: both arguments must be numbers');
    }
    if (recycled_mass_t < 0) throw new RangeError('computeCircularityRate: recycled_mass_t must be >= 0');
    if (total_output_mass_t <= 0) throw new RangeError('computeCircularityRate: total_output_mass_t must be > 0');
    if (recycled_mass_t > total_output_mass_t) {
        throw new RangeError('computeCircularityRate: recycled_mass_t cannot exceed total_output_mass_t');
    }
    const circularity_pct = (recycled_mass_t / total_output_mass_t) * 100;
    return { circularity_pct };
}

/**
 * Computes the economic and environmental value of industrial symbiosis.
 * Valor da simbiose industrial - desvio de resíduos evita custos e emissões de CO2.
 * Referência: Frosch & Gallopoulos (1989) DOI:10.1038/scientificamerican0989-144
 *
 * @param waste_redirected_t   - Resíduo desviado/reaproveitado em toneladas (≥ 0)
 * @param disposal_cost_BRL_t  - Custo de disposição evitado por tonelada em BRL (≥ 0)
 * @param resource_value_BRL_t - Valor do recurso recuperado por tonelada em BRL (≥ 0)
 * @returns
 *   economic_value_BRL = (disposal_cost + resource_value) × waste_redirected;
 *   CO2_avoided_t = waste_redirected × 0.5 tCO2/t resíduo (fator genérico)
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se qualquer argumento for negativo
 */
export function computeIndustrialSymbiosisValue(
    waste_redirected_t: number,
    disposal_cost_BRL_t: number,
    resource_value_BRL_t: number,
): { economic_value_BRL: number; CO2_avoided_t: number } {
    if (
        typeof waste_redirected_t !== 'number' ||
        typeof disposal_cost_BRL_t !== 'number' ||
        typeof resource_value_BRL_t !== 'number'
    ) {
        throw new TypeError('computeIndustrialSymbiosisValue: all arguments must be numbers');
    }
    if (waste_redirected_t < 0)
        throw new RangeError('computeIndustrialSymbiosisValue: waste_redirected_t must be >= 0');
    if (disposal_cost_BRL_t < 0)
        throw new RangeError('computeIndustrialSymbiosisValue: disposal_cost_BRL_t must be >= 0');
    if (resource_value_BRL_t < 0)
        throw new RangeError('computeIndustrialSymbiosisValue: resource_value_BRL_t must be >= 0');
    const economic_value_BRL = (disposal_cost_BRL_t + resource_value_BRL_t) * waste_redirected_t;
    // Fator de emissão genérico: 0.5 tCO2 evitado por tonelada de resíduo desviado
    const CO2_avoided_t = waste_redirected_t * 0.5;
    return { economic_value_BRL, CO2_avoided_t };
}

/**
 * Classifies industrial ecology maturity level based on circularity and symbiosis links.
 * Classifica a maturidade da ecologia industrial em 4 estágios evolutivos.
 *
 * @param circularity_pct - Taxa de circularidade [0,100]
 * @param symbiosis_links - Número de vínculos de simbiose industrial (inteiro ≥ 0)
 * @returns
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se circularity_pct fora de [0,100] ou symbiosis_links < 0
 */
export function classifyIndustrialEcologyMaturity(
    circularity_pct: number,
    symbiosis_links: number,
): { maturity: 'linear' | 'transitional' | 'circular' | 'regenerative' } {
    if (typeof circularity_pct !== 'number' || typeof symbiosis_links !== 'number') {
        throw new TypeError('classifyIndustrialEcologyMaturity: both arguments must be numbers');
    }
    if (circularity_pct < 0 || circularity_pct > 100)
        throw new RangeError('classifyIndustrialEcologyMaturity: circularity_pct must be in [0,100]');
    if (symbiosis_links < 0) throw new RangeError('classifyIndustrialEcologyMaturity: symbiosis_links must be >= 0');
    // Linear: sistema aberto sem circularidade ou simbiose
    if (circularity_pct < 20 || symbiosis_links === 0) return { maturity: 'linear' };
    // Transitional: início de práticas circulares
    if (circularity_pct < 50) return { maturity: 'transitional' };
    // Circular: maioria dos materiais reciclados
    if (circularity_pct < 80) return { maturity: 'circular' };
    // Regenerative: sistema que devolve mais do que consome
    return { maturity: 'regenerative' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialEcologyModelMeta: AnalyticsModuleMeta = {
    name: 'industrialEcologyModel',
    description: 'industrialEcologyModel',
    category: 'analytics',
    familyTags: ['industrial'],
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
