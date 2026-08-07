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
 * @module industrialEcosystemMetabolism
 * Metabolismo industrial e indicadores de economia circular para avaliação de eficiência de recursos.
 *
 * Referências acadêmicas:
 * - Eurostat 2021 - Economy-wide Material Flow Accounts: Handbook
 *   DOI: 10.2785/145311
 * - European Environment Agency 2019 - Resource efficiency and the circular economy
 *   ISBN: 978-92-9480-098-5
 * - Kirchherr et al. 2017 - Conceptualizing the Circular Economy
 *   DOI: 10.1016/j.resconrec.2017.09.005
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * Calcula a produtividade material (Material Productivity - MP).
 * MP = PIB / Consumo Doméstico de Materiais (CDM)
 * Indica quanto valor econômico é gerado por unidade de material consumido.
 *
 * @param GDP_BRL - Produto Interno Bruto em Reais (BRL)
 * @param domestic_material_consumption_t - Consumo Doméstico de Materiais em toneladas
 * @returns Produtividade material em BRL por tonelada
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se GDP <= 0 ou DMC <= 0
 */
export function computeMaterialProductivity(
    GDP_BRL: number,
    domestic_material_consumption_t: number,
): { MP_BRL_per_t: number } {
    if (typeof GDP_BRL !== 'number' || typeof domestic_material_consumption_t !== 'number') {
        throw new TypeError('computeMaterialProductivity: parâmetros devem ser números');
    }
    if (GDP_BRL <= 0) {
        throw new RangeError('computeMaterialProductivity: GDP_BRL deve ser positivo');
    }
    if (domestic_material_consumption_t <= 0) {
        throw new RangeError('computeMaterialProductivity: domestic_material_consumption_t deve ser positivo');
    }

    const MP_BRL_per_t = GDP_BRL / domestic_material_consumption_t;
    return { MP_BRL_per_t };
}

/**
 * Calcula o Índice de Eficiência de Recursos (Resource Efficiency Index - REI).
 * REI = MP_current / MP_baseline
 * Valores > 1 indicam melhora na eficiência de recursos em relação à linha de base.
 *
 * @param MP_current - Produtividade material atual (BRL/t)
 * @param MP_baseline - Produtividade material de referência (BRL/t)
 * @returns Índice de eficiência de recursos (adimensional)
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se MP_baseline <= 0 ou MP_current < 0
 */
export function computeResourceEfficiencyIndex(MP_current: number, MP_baseline: number): { REI: number } {
    if (typeof MP_current !== 'number' || typeof MP_baseline !== 'number') {
        throw new TypeError('computeResourceEfficiencyIndex: parâmetros devem ser números');
    }
    if (MP_baseline <= 0) {
        throw new RangeError('computeResourceEfficiencyIndex: MP_baseline deve ser positivo');
    }
    if (MP_current < 0) {
        throw new RangeError('computeResourceEfficiencyIndex: MP_current não pode ser negativo');
    }

    const REI = MP_current / MP_baseline;
    return { REI };
}

/**
 * Calcula a intensidade de resíduo por milhão de BRL de PIB.
 * WI = resíduo_gerado (t) / (PIB / 1.000.000)
 * Quanto menor, mais eficiente a economia em termos de geração de resíduos.
 *
 * @param waste_generated_t - Resíduo gerado em toneladas
 * @param GDP_BRL - PIB em Reais (BRL)
 * @returns Intensidade de resíduo (t por milhão de BRL)
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se GDP_BRL <= 0 ou waste_generated_t < 0
 */
export function computeWasteIntensity(waste_generated_t: number, GDP_BRL: number): { WI_t_per_MBRL: number } {
    if (typeof waste_generated_t !== 'number' || typeof GDP_BRL !== 'number') {
        throw new TypeError('computeWasteIntensity: parâmetros devem ser números');
    }
    if (GDP_BRL <= 0) {
        throw new RangeError('computeWasteIntensity: GDP_BRL deve ser positivo');
    }
    if (waste_generated_t < 0) {
        throw new RangeError('computeWasteIntensity: waste_generated_t não pode ser negativo');
    }

    // Divisão por 1e6 converte BRL para milhões de BRL
    const WI_t_per_MBRL = waste_generated_t / (GDP_BRL / 1e6);
    return { WI_t_per_MBRL };
}

/**
 * Classifica o desempenho de economia circular de uma organização ou setor.
 * Critérios baseados na literatura de economia circular (Kirchherr 2017, Ellen MacArthur Foundation):
 * - restorative: REI > 1.2 E reciclagem > 70% E intensidade de resíduo < 0.5
 * - circular:    REI > 1.0 E reciclagem > 50%
 * - transitioning: reciclagem > 30%
 * - linear: demais casos
 *
 * @param REI - Índice de eficiência de recursos (adimensional)
 * @param WI_t_per_MBRL - Intensidade de resíduo (t/M BRL)
 * @param recycling_rate_pct - Taxa de reciclagem em percentual (0–100)
 * @returns Classificação de desempenho circular
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se recycling_rate_pct fora de [0, 100]
 */
export function classifyCircularEconomyPerformance(
    REI: number,
    WI_t_per_MBRL: number,
    recycling_rate_pct: number,
): { performance: string } {
    if (typeof REI !== 'number' || typeof WI_t_per_MBRL !== 'number' || typeof recycling_rate_pct !== 'number') {
        throw new TypeError('classifyCircularEconomyPerformance: parâmetros devem ser números');
    }
    if (recycling_rate_pct < 0 || recycling_rate_pct > 100) {
        throw new RangeError('classifyCircularEconomyPerformance: recycling_rate_pct deve estar entre 0 e 100');
    }

    let performance;
    if (REI > 1.2 && recycling_rate_pct > 70 && WI_t_per_MBRL < 0.5) {
        performance = 'restorative';
    } else if (REI > 1.0 && recycling_rate_pct > 50) {
        performance = 'circular';
    } else if (recycling_rate_pct > 30) {
        performance = 'transitioning';
    } else {
        performance = 'linear';
    }

    return { performance };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialEcosystemMetabolismMeta: AnalyticsModuleMeta = {
    name: 'industrialEcosystemMetabolism',
    description: 'industrialEcosystemMetabolism',
    category: 'analytics',
    familyTags: ['industrial', 'ecosystem'],
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
