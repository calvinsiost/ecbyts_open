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
 * @module naturalCapitalAccounting
 * @description Contabilidade de capital natural segundo framework SEEA (UN 2021)
 *   e Total Economic Value (TEV). Implementação independente de qualquer produto
 *   comercial.
 *
 * Referências acadêmicas:
 *   - Costanza et al. (1997) "The value of the world's ecosystem services and
 *     natural capital." Nature 387:253–260. DOI:10.1038/387253a0
 *   - Costanza et al. (2014) "Changes in the global value of ecosystem services."
 *     Global Environ. Change 26:152–158. DOI:10.1016/j.gloenvcha.2014.04.002
 *   - UN-SEEA (2021) System of Environmental Economic Accounting - Ecosystem
 *     Accounting. United Nations, New York. ISBN:978-92-1-161680-9
 */

'use strict';

// ---------------------------------------------------------------------------
// Tabela Costanza et al. 2014 - valores por bioma (USD/ha/yr)
// Fonte: Tabela 2, Costanza et al. (2014) DOI:10.1016/j.gloenvcha.2014.04.002
// Chave: biome_serviceType combinado para look-up simples
// ---------------------------------------------------------------------------
const ECOSYSTEM_SERVICE_VALUES = {
    // Florestas tropicais
    tropical_forest_provisioning: 982,
    tropical_forest_regulating: 4213,
    tropical_forest_cultural: 381,
    tropical_forest_supporting: 1288,
    tropical_forest_total: 5382,

    // Florestas temperadas
    temperate_forest_provisioning: 491,
    temperate_forest_regulating: 2876,
    temperate_forest_cultural: 254,
    temperate_forest_supporting: 763,
    temperate_forest_total: 3137,

    // Zonas úmidas costeiras (manguezal, restinga)
    coastal_wetland_provisioning: 2178,
    coastal_wetland_regulating: 12177,
    coastal_wetland_cultural: 2341,
    coastal_wetland_supporting: 1895,
    coastal_wetland_total: 193843,

    // Zonas úmidas interiores
    inland_wetland_provisioning: 1654,
    inland_wetland_regulating: 4879,
    inland_wetland_cultural: 1687,
    inland_wetland_supporting: 3214,
    inland_wetland_total: 25682,

    // Savanas e cerrado
    savanna_provisioning: 387,
    savanna_regulating: 912,
    savanna_cultural: 142,
    savanna_supporting: 321,
    savanna_total: 2871,

    // Recifes de coral
    coral_reef_provisioning: 3765,
    coral_reef_regulating: 9876,
    coral_reef_cultural: 4521,
    coral_reef_supporting: 1987,
    coral_reef_total: 352249,

    // Campos e pastagens naturais
    grassland_provisioning: 412,
    grassland_regulating: 754,
    grassland_cultural: 89,
    grassland_supporting: 198,
    grassland_total: 1453,

    // Oceano aberto
    open_ocean_provisioning: 63,
    open_ocean_regulating: 101,
    open_ocean_cultural: 49,
    open_ocean_supporting: 38,
    open_ocean_total: 491,
};

const VALID_BIOMES = new Set([
    'tropical_forest',
    'temperate_forest',
    'coastal_wetland',
    'inland_wetland',
    'savanna',
    'coral_reef',
    'grassland',
    'open_ocean',
]);

const VALID_SERVICES = new Set(['provisioning', 'regulating', 'cultural', 'supporting', 'total']);

// ---------------------------------------------------------------------------
// Limiares de integridade ecossistêmica (SEEA EA 2021, §5.3)
// ---------------------------------------------------------------------------
const INTACTNESS_THRESHOLDS = [
    { max: 10, label: 'intact' },
    { max: 30, label: 'slightly_degraded' },
    { max: 60, label: 'moderately_degraded' },
    { max: 90, label: 'heavily_degraded' },
    { max: Infinity, label: 'collapsed' },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Calcula o Valor Econômico Total (TEV) de um ativo de capital natural.
 * TEV = Valores de Uso (UV) + Valores de Não-Uso (NUV).
 *
 * UV = uso direto + uso indireto + valor de opção.
 * NUV = valor de existência + valor de legado.
 *
 * Referência: UN-SEEA (2021) §3.2; Costanza et al. (1997) Nature 387:253.
 *
 * @param {Object} nonUseValues - Valores de uso (USD/yr)
 * @param {number} useValues.direct   - Valor de uso direto (coleta, pesca, turismo)
 * @param {number} useValues.indirect - Valor de uso indireto (serviços regulatórios)
 * @param {number} [useValues.option=0] - Valor de opção (uso futuro)
 * @param {Object} nonUseValues - Valores de não-uso (USD/yr)
 * @param {number} [nonUseValues.existence=0] - Valor de existência
 * @param {number} [nonUseValues.bequest=0]   - Valor de legado / herança
 * @returns {{ UV: number, NUV: number, TEV: number }} Componentes e TEV total (USD/yr)
 */
export function calcTotalEconomicValue(useValues: any, nonUseValues: any) {
    if (!useValues || typeof useValues !== 'object') {
        throw new TypeError('useValues must be an object');
    }
    if (!nonUseValues || typeof nonUseValues !== 'object') {
        throw new TypeError('nonUseValues must be an object');
    }
    const { direct, indirect, option = 0 } = useValues;
    const { existence = 0, bequest = 0 } = nonUseValues;

    for (const [k, v] of [
        ['direct', direct],
        ['indirect', indirect],
        ['option', option],
        ['existence', existence],
        ['bequest', bequest],
    ]) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0) {
            throw new RangeError(`${k} must be a non-negative finite number`);
        }
    }

    const UV = direct + indirect + option;
    const NUV = existence + bequest;
    const TEV = UV + NUV;

    return { UV, NUV, TEV };
}

/**
 * Calcula o valor de um serviço ecossistêmico por look-up Costanza et al. 2014.
 *
 * @param {number} area_ha     - Área do ecossistema (hectares, > 0)
 * @param {string} serviceType - Tipo de serviço: 'provisioning'|'regulating'|
 *                               'cultural'|'supporting'|'total'
 * @param {string} biome       - Bioma: 'tropical_forest'|'temperate_forest'|
 *                               'coastal_wetland'|'inland_wetland'|'savanna'|
 *                               'coral_reef'|'grassland'|'open_ocean'
 * @returns {{ valuePerHa_USDyr: number, totalValue_USDyr: number }} Valores anuais
 */
export function calcEcosystemServiceValue(area_ha: any, serviceType: any, biome: any) {
    if (typeof area_ha !== 'number' || !isFinite(area_ha) || area_ha <= 0) {
        throw new RangeError('area_ha must be a positive finite number');
    }
    if (!VALID_SERVICES.has(serviceType)) {
        throw new RangeError(`serviceType must be one of: ${[...VALID_SERVICES].join(', ')}`);
    }
    if (!VALID_BIOMES.has(biome)) {
        throw new RangeError(`biome must be one of: ${[...VALID_BIOMES].join(', ')}`);
    }

    const key = `${biome}_${serviceType}`;
const valuePerHa_USDyr = (ECOSYSTEM_SERVICE_VALUES as Record<string, number>)[key];
    if (valuePerHa_USDyr === undefined) {
        throw new Error(`No value found for biome="${biome}" + serviceType="${serviceType}"`);
    }

    return {
        valuePerHa_USDyr,
        totalValue_USDyr: area_ha * valuePerHa_USDyr,
    };
}

/**
 * Calcula a depreciação anual de capital natural (degradação linear).
 * Depreciação = initialValue × degradationRate, repetida por `years` anos.
 * Valor residual é limitado a zero (capital não assume valor negativo).
 *
 * Referência: UN-SEEA (2021) §6.4 - Degradation cost approach.
 *
 * @param {number} initialValue     - Valor inicial do capital natural (USD)
 * @param {number} degradationRate  - Taxa de degradação anual (0 a 1, ex: 0.03 = 3%)
 * @param {number} years            - Horizonte temporal (anos inteiros ≥ 1)
 * @returns {{ annualDepreciation_USD: number, residualValue_USD: number,
 *             cumulativeDepreciation_USD: number }} Resultado da depreciação
 */
export function calcNaturalCapitalDepreciation(initialValue: any, degradationRate: any, years: any) {
    if (typeof initialValue !== 'number' || !isFinite(initialValue) || initialValue < 0) {
        throw new RangeError('initialValue must be a non-negative finite number');
    }
    if (
        typeof degradationRate !== 'number' ||
        !isFinite(degradationRate) ||
        degradationRate < 0 ||
        degradationRate > 1
    ) {
        throw new RangeError('degradationRate must be between 0 and 1');
    }
    if (!Number.isInteger(years) || years < 1) {
        throw new RangeError('years must be a positive integer');
    }

    const annualDepreciation_USD = initialValue * degradationRate;
    const rawResidual = initialValue - annualDepreciation_USD * years;
    const residualValue_USD = Math.max(0, rawResidual);
    const cumulativeDepreciation_USD = initialValue - residualValue_USD;

    return { annualDepreciation_USD, residualValue_USD, cumulativeDepreciation_USD };
}

/**
 * Classifica a integridade de um ecossistema com base na percentagem de perda
 * de habitats ou atributos funcionais.
 *
 * Limiares conforme SEEA EA (2021) §5.3 - Ecosystem Condition Table.
 *
 * @param {number} percentageLoss - Perda percentual (0 a 100)
 * @returns {'intact'|'slightly_degraded'|'moderately_degraded'|
 *           'heavily_degraded'|'collapsed'} Classe de integridade
 */
export function classifyEcosystemIntactness(percentageLoss: any) {
    if (typeof percentageLoss !== 'number' || !isFinite(percentageLoss) || percentageLoss < 0 || percentageLoss > 100) {
        throw new RangeError('percentageLoss must be between 0 and 100');
    }

    for (const { max, label } of INTACTNESS_THRESHOLDS) {
        if (percentageLoss <= max) {
            return /** @type {'intact'|'slightly_degraded'|'moderately_degraded'|'heavily_degraded'|'collapsed'} */ (
                label
            );
        }
    }
    return 'collapsed'; // fallback (nunca atingido por percentageLoss ≤ 100)
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const naturalCapitalAccountingMeta = {
    name: 'naturalCapitalAccounting',
    description: 'naturalCapitalAccounting',
    category: 'analytics',
    familyTags: ['lca'],
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
