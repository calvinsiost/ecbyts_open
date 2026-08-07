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
 * Construction Waste Model - estimativa de geração e potencial de reciclagem
 * de resíduos de construção e demolição (RCD/CDW).
 *
 * Referências:
 * Eurostat (2020). Generation of waste by waste category, hazardousness and NACE Rev. 2 activity.
 * https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Waste_statistics
 *
 * EU Waste Framework Directive 2008/98/EC - metas de recuperação de materiais CDW.
 * https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32008L0098
 *
 * CONAMA Resolução 307/2002 - Gestão dos resíduos da construção civil no Brasil.
 * https://www.gov.br/mma/pt-br
 *
 * DOI de referência:
 * Mália, M. et al. (2013). Construction and demolition waste indicators.
 * Waste Management & Research 31(3):241–255.
 * DOI: 10.1177/0734242X12471707
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

// Taxas de geração de resíduos por tipo de construção (kg/m²)
// Benchmarks Eurostat 2020 + CONAMA 307/2002 adaptados para Brasil
const WASTE_RATES_KG_M2: Record<string, number> = {
    residential: 150,
    commercial: 200,
    industrial: 250,
    demolition: 1200,
};

/**
 * Estima a taxa e o total de geração de resíduos de construção.
 *
 * Taxas de referência (Eurostat 2020 / Mália et al. 2013):
 *   residential : 150 kg/m²
 *   commercial  : 200 kg/m²
 *   industrial  : 250 kg/m²
 *   demolition  : 1200 kg/m²
 *
 * @param construction_area_m2 - Área construída ou demolida (m², > 0)
 * @param building_type        - Tipo: 'residential'|'commercial'|'industrial'|'demolition'
 * @returns Taxa unitária e total gerado
 * @throws {TypeError} se construction_area_m2 não for número finito ou building_type não for string
 * @throws {RangeError} se construction_area_m2 ≤ 0
 * @throws {RangeError} se building_type não pertencer ao conjunto válido
 */
export function computeWasteGenerationRate(
    construction_area_m2: number,
    building_type: string,
): { waste_kg_m2: number; total_kg: number } {
    if (typeof construction_area_m2 !== 'number' || !isFinite(construction_area_m2))
        throw new TypeError('construction_area_m2 deve ser número finito');
    if (construction_area_m2 <= 0) throw new RangeError('construction_area_m2 deve ser positivo');
    if (typeof building_type !== 'string') throw new TypeError('building_type deve ser uma string');

    const waste_kg_m2 = WASTE_RATES_KG_M2[building_type];
    if (waste_kg_m2 === undefined) {
        throw new RangeError(
            `building_type inválido: "${building_type}". Use um de: ${Object.keys(WASTE_RATES_KG_M2).join(', ')}`,
        );
    }

    const total_kg = waste_kg_m2 * construction_area_m2;
    return { waste_kg_m2, total_kg };
}

/**
 * Calcula o potencial de reciclagem baseado na composição dos resíduos.
 *
 * Fatores de reciclabilidade por material (Mália et al. 2013 / EU WFD 2008/98/EC):
 *   concreto : 90% (britagem e reutilização como agregado reciclado)
 *   aço      : 95% (sucata metálica - cadeia de reciclagem consolidada)
 *   madeira  : 70% (compostagem, energia biomassa, MDF reciclado)
 *   outros   : 30% (cerâmica, gesso, plástico - reciclagem mista)
 *
 * @param total_kg   - Total de resíduos gerados (kg, > 0)
 * @param composition - Composição percentual
 * @returns Massa reciclável e percentual
 * @throws {TypeError} se total_kg não for número finito ou composition inválido
 * @throws {RangeError} se total_kg <= 0 ou frações fora de [0, 100] ou soma != 100
 */
export function computeRecyclingPotential(
    total_kg: number,
    composition: { concrete_pct: number; steel_pct: number; wood_pct: number; others_pct: number },
): { recyclable_kg: number; recycling_pct: number } {
    if (typeof total_kg !== 'number' || !isFinite(total_kg)) throw new TypeError('total_kg deve ser número finito');
    if (total_kg <= 0) throw new RangeError('total_kg deve ser positivo');
    if (typeof composition !== 'object' || composition === null) throw new TypeError('composition deve ser um objeto');

    const { concrete_pct, steel_pct, wood_pct, others_pct } = composition;
    for (const [k, v] of [
        ['concrete_pct', concrete_pct],
        ['steel_pct', steel_pct],
        ['wood_pct', wood_pct],
        ['others_pct', others_pct],
    ] as Array<[string, unknown]>) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`composition.${k} deve ser número finito`);
        if (v < 0 || v > 100) throw new RangeError(`composition.${k} deve estar em [0, 100]`);
    }

    const total_pct = concrete_pct + steel_pct + wood_pct + others_pct;
    if (Math.abs(total_pct - 100) > 0.01) {
        throw new RangeError(`Soma das frações deve ser 100%. Obtido: ${total_pct.toFixed(2)}%`);
    }

    // Cálculo da fração reciclável ponderada pelos fatores de recuperação
    const recyclable_fraction = (concrete_pct * 0.9 + steel_pct * 0.95 + wood_pct * 0.7 + others_pct * 0.3) / 100;

    const recyclable_kg = total_kg * recyclable_fraction;
    const recycling_pct = recyclable_fraction * 100;

    return { recyclable_kg, recycling_pct };
}

/**
 * Calcula a Taxa de Desvio de Aterro (Landfill Diversion Rate).
 * Indica a proporção de resíduos que evitaram disposição em aterro
 * através de reciclagem ou reutilização.
 *
 * diversion_pct = (recycled_kg + reused_kg) / total_kg × 100
 *
 * Meta EU 2020 (WFD 2008/98/EC): ≥ 70% de desvio para CDW
 *
 * @param recycled_kg - Massa reciclada (kg, ≥ 0)
 * @param reused_kg   - Massa reutilizada diretamente (kg, ≥ 0)
 * @param total_kg    - Total de resíduos gerados (kg, > 0)
 * @returns Taxa de desvio em %
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se valores inválidos ou soma > total
 */
export function computeLandfillDiversionRate(
    recycled_kg: number,
    reused_kg: number,
    total_kg: number,
): { diversion_pct: number } {
    if (
        typeof recycled_kg !== 'number' ||
        !isFinite(recycled_kg) ||
        typeof reused_kg !== 'number' ||
        !isFinite(reused_kg) ||
        typeof total_kg !== 'number' ||
        !isFinite(total_kg)
    ) {
        throw new TypeError('recycled_kg, reused_kg e total_kg devem ser números finitos');
    }
    if (recycled_kg < 0) throw new RangeError('recycled_kg não pode ser negativo');
    if (reused_kg < 0) throw new RangeError('reused_kg não pode ser negativo');
    if (total_kg <= 0) throw new RangeError('total_kg deve ser positivo');
    if (recycled_kg + reused_kg > total_kg + 0.001) {
        throw new RangeError('recycled_kg + reused_kg não pode exceder total_kg');
    }

    const diversion_pct = ((recycled_kg + reused_kg) / total_kg) * 100;
    return { diversion_pct: Math.min(100, diversion_pct) };
}

/**
 * Classifica o desempenho de gestão de resíduos de construção.
 *
 * Baseado nas metas da EU Waste Framework Directive 2008/98/EC:
 *   poor      : < 30%  - abaixo do mínimo aceitável
 *   basic     : < 55%  - abaixo da meta intermediária
 *   good      : < 70%  - próximo à meta EU 2020
 *   excellent : ≥ 70%  - atende ou supera a meta EU 2020
 *
 * @param diversion_pct - Taxa de desvio de aterro (%, 0–100)
 * @returns Classe de desempenho
 * @throws {TypeError} se diversion_pct não for número finito
 * @throws {RangeError} se diversion_pct fora de [0, 100]
 */
export function classifyWasteManagementPerformance(diversion_pct: number): { performance: string } {
    if (typeof diversion_pct !== 'number' || !isFinite(diversion_pct))
        throw new TypeError('diversion_pct deve ser número finito');
    if (diversion_pct < 0 || diversion_pct > 100) throw new RangeError('diversion_pct deve estar em [0, 100]');

    let performance: string;
    if (diversion_pct >= 70) performance = 'excellent';
    else if (diversion_pct >= 55) performance = 'good';
    else if (diversion_pct >= 30) performance = 'basic';
    else performance = 'poor';

    return { performance };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const constructionWasteModelMeta: AnalyticsModuleMeta = {
    name: 'constructionWasteModel',
    description: 'constructionWasteModel',
    category: 'analytics',
    familyTags: ['waste', 'construction'],
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
