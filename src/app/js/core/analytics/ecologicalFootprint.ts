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
// Application: EHS & Mining - Ecological Footprint
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Ecological Footprint & Biocapacity - Land Accounting
 *
 * Módulo puro implementando cálculo de pegada ecológica e biocapacidade conforme
 * metodologia da Global Footprint Network (Wackernagel & Rees, 1996).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Wackernagel, M. & Rees, W. E. (1996). Our Ecological Footprint: Reducing
 *     Human Impact on the Earth. Gabriola Island: New Society Publishers.
 *     ISBN: 0-86571-312-X. (Metodologia original de pegada ecológica)
 *   - Global Footprint Network (2023). National Footprint and Biocapacity Accounts
 *     2023 Edition. Oakland: GFN. https://www.footprintnetwork.org/
 *     (Yield factors e equivalence factors atualizados)
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

// Categorias de uso da terra reconhecidas pela metodologia GFN
const FOOTPRINT_COMPONENTS = ['cropland', 'pasture', 'forest', 'fishing', 'builtup', 'carbon'];

/**
 * Compute a single footprint component in global hectares (gha).
 * Calcula um componente da pegada ecológica em hectares globais.
 *
 * FP = (consumption / yieldFactor) * equivalenceFactor
 *
 * @param consumption        - Consumo de recurso (unidade física)
 * @param yieldFactor        - Fator de rendimento local vs global (adimensional, > 0)
 * @param equivalenceFactor  - Fator de equivalência do tipo de terra (> 0)
 * @returns Componente da pegada em hectares globais
 * @throws {RangeError} Se consumption < 0 ou yieldFactor / equivalenceFactor <= 0
 */
export function computeFootprintComponent(
    consumption: number,
    yieldFactor: number,
    equivalenceFactor: number,
): { component_gha: number } {
    if (consumption < 0) throw new RangeError('consumption must be >= 0');
    if (yieldFactor <= 0) throw new RangeError('yieldFactor must be > 0');
    if (equivalenceFactor <= 0) throw new RangeError('equivalenceFactor must be > 0');

    // Pegada em hectares globais: normaliza produtividade local para global
    const component_gha = (consumption / yieldFactor) * equivalenceFactor;
    return { component_gha: +component_gha.toFixed(6) };
}

/**
 * Compute total ecological footprint from all land-use components.
 * Calcula a pegada ecológica total somando os componentes por tipo de uso da terra.
 *
 * @param components
 *   Componentes já em gha (resultado de computeFootprintComponent ou valor direto)
 * @returns Total e categoria dominante
 * @throws {TypeError} Se components não for um objeto
 * @throws {RangeError} Se qualquer componente for negativo
 */
export function computeTotalFootprint(components: {
    cropland?: number;
    pasture?: number;
    forest?: number;
    fishing?: number;
    builtup?: number;
    carbon?: number;
}): { totalGha: number; dominant: string } {
    if (!components || typeof components !== 'object') {
        throw new TypeError('components must be a plain object');
    }

    let totalGha = 0;
    let dominant = 'cropland';
    let maxVal = -Infinity;

    const comp = components as Record<string, number | undefined>;
    for (const key of FOOTPRINT_COMPONENTS) {
        const val = comp[key] ?? 0;
        if (val < 0) throw new RangeError(`components.${key} must be >= 0`);
        totalGha += val;
        if (val > maxVal) {
            maxVal = val;
            dominant = key;
        }
    }

    return { totalGha: +totalGha.toFixed(6), dominant };
}

/**
 * Compute biocapacity of a land area in global hectares.
 * Calcula a biocapacidade de uma área em hectares globais.
 *
 * BC = area_ha * yieldFactor * equivalenceFactor
 *
 * @param area_ha            - Área de terra disponível (ha)
 * @param yieldFactor        - Fator de rendimento local vs global (> 0)
 * @param equivalenceFactor  - Fator de equivalência do tipo de terra (> 0)
 * @returns Biocapacidade em hectares globais
 * @throws {RangeError} Se area_ha < 0 ou fatores <= 0
 */
export function computeBiocapacity(
    area_ha: number,
    yieldFactor: number,
    equivalenceFactor: number,
): { biocapacity_gha: number } {
    if (area_ha < 0) throw new RangeError('area_ha must be >= 0');
    if (yieldFactor <= 0) throw new RangeError('yieldFactor must be > 0');
    if (equivalenceFactor <= 0) throw new RangeError('equivalenceFactor must be > 0');

    const biocapacity_gha = area_ha * yieldFactor * equivalenceFactor;
    return { biocapacity_gha: +biocapacity_gha.toFixed(6) };
}

/**
 * Classify ecological deficit or reserve.
 * Classifica se há déficit ecológico ou reserva de biocapacidade.
 *
 * Déficit: pegada > biocapacidade; overshootFactor = FP/BC
 *
 * @param footprint_gha    - Pegada ecológica total (gha)
 * @param biocapacity_gha  - Biocapacidade disponível (gha)
 * @throws {RangeError} Se footprint_gha < 0 ou biocapacity_gha <= 0
 */
export function classifyEcologicalDeficit(
    footprint_gha: number,
    biocapacity_gha: number,
): { deficit_gha: number; status: 'reserve' | 'deficit'; overshootFactor: number } {
    if (footprint_gha < 0) throw new RangeError('footprint_gha must be >= 0');
    if (biocapacity_gha <= 0) throw new RangeError('biocapacity_gha must be > 0');

    const deficit_gha = footprint_gha - biocapacity_gha;
    const status: 'reserve' | 'deficit' = deficit_gha > 0 ? 'deficit' : 'reserve';
    const overshootFactor = +(footprint_gha / biocapacity_gha).toFixed(6);

    return { deficit_gha: +deficit_gha.toFixed(6), status, overshootFactor };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalFootprintMeta: AnalyticsModuleMeta = {
    name: 'ecologicalFootprint',
    description: 'Ecological Footprint',
    category: 'analytics',
    familyTags: ['ecosystem', 'footprint'],
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
