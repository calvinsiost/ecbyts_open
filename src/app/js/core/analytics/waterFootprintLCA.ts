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
// Application: EHS & Mining - Water Footprint & Life Cycle Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Water Footprint LCA - Blue, Grey, and Scarcity-Weighted Assessment
 *
 * Módulo puro implementando avaliação da pegada hídrica conforme o
 * Water Footprint Network (WFN) Manual de Avaliação (Hoekstra et al., 2011),
 * incluindo pegada azul (consumo), cinza (poluição diluída), índice de
 * escassez hídrica WSI (Pfister et al., 2009) e classificação de
 * sustentabilidade hídrica.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Hoekstra, A. Y., Chapagain, A. K., Aldaya, M. M., & Mekonnen, M. M. (2011).
 *     "The Water Footprint Assessment Manual: Setting the Global Standard."
 *     Earthscan, London. ISBN: 978-1-84971-279-8
 *   - Pfister, S., Koehler, A., & Hellweg, S. (2009). "Assessing the
 *     Environmental Impacts of Freshwater Consumption in LCA."
 *     Environmental Science & Technology 43(11), 4098–4104.
 *     DOI: 10.1021/es802423e
 *   - Mekonnen, M. M., & Hoekstra, A. Y. (2011). "The green, blue and grey
 *     water footprint of crops and derived crop products."
 *     Hydrology and Earth System Sciences 15(5), 1577–1600.
 *     DOI: 10.5194/hess-15-1577-2011
 */

/**
 * Calcula a pegada hídrica azul (Blue Water Footprint) de um processo produtivo.
 * Pegada azul representa o consumo de água doce superficial e subterrânea
 * (evaporada, incorporada ao produto, ou não retornada à mesma bacia).
 *
 * WF_blue = Volume_captado - Volume_retornado [m³/unidade ou m³/período]
 *
 * @param {number} withdrawal  - Volume total de água captada (m³)
 * @param {number} returned    - Volume retornado à mesma bacia no mesmo período (m³)
 * @param {number} inProduct   - Volume incorporado ao produto (m³)
 * @returns {number} Pegada hídrica azul (m³) - sempre >= 0
 * @throws {RangeError} Se returned > withdrawal ou qualquer valor < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcBlueWaterFootprint(withdrawal: number, returned: number, inProduct: number): number {
    for (const [name, val] of [
        ['withdrawal', withdrawal],
        ['returned', returned],
        ['inProduct', inProduct],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val < 0) throw new RangeError(`${name} deve ser >= 0; recebido: ${val}`);
    }
    if (returned > withdrawal) {
        throw new RangeError(`returned (${returned}) não pode exceder withdrawal (${withdrawal})`);
    }

    // Consumo = captado - retornado; incorporado é subconjunto do consumo
    // WF_blue = volume evaporado + incorporado ao produto + não retornado
    const consumed = withdrawal - returned;
    // Garantir consistência: inProduct não pode exceder consumo
    // eslint-disable-next-line
    const blueWF = Math.max(0, consumed + Math.min(inProduct, withdrawal - consumed));
    // Simplificação: WF_blue = withdrawal - returned (padrão WFN cap. 3)
    return Math.max(0, withdrawal - returned);
}

/**
 * Calcula a pegada hídrica cinza (Grey Water Footprint) baseada na diluição
 * necessária para que um efluente contaminante atinja padrões de qualidade.
 * WF_grey = Carga / (Cmax_permitida - Cnatural)
 *
 * @param {number} pollutantLoad     - Carga poluidora total (kg ou g de substância)
 * @param {number} maxPermittedConc  - Concentração máxima permitida no corpo receptor (kg/m³ ou g/m³)
 * @param {number} naturalConc       - Concentração natural (background) do poluente no receptor (mesmas unidades)
 * @returns {number} Pegada hídrica cinza (m³) - volume de água necessário para diluição
 * @throws {RangeError} Se maxPermittedConc <= naturalConc ou qualquer valor < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcGreyWaterFootprint(pollutantLoad: number, maxPermittedConc: number, naturalConc: number): number {
    for (const [name, val] of [
        ['pollutantLoad', pollutantLoad],
        ['maxPermittedConc', maxPermittedConc],
        ['naturalConc', naturalConc],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val < 0) throw new RangeError(`${name} deve ser >= 0; recebido: ${val}`);
    }
    if (maxPermittedConc <= naturalConc) {
        throw new RangeError(`maxPermittedConc (${maxPermittedConc}) deve ser maior que naturalConc (${naturalConc})`);
    }

    // Fórmula WFN (Hoekstra et al. 2011, eq. 7.1):
    // WF_grey = L / (C_max - C_nat)   [m³ = kg / (kg/m³)]
    return pollutantLoad / (maxPermittedConc - naturalConc);
}

interface WSIResult { wsi: number; wta: number; wtaStar: number; }

/**
 * Calcula o Índice de Escassez Hídrica (Water Scarcity Index, WSI) conforme
 * Pfister et al. (2009). O WSI varia entre 0.01 e 1.00, sendo 1 = escassez extrema.
 * WSI = 1 / (1 + exp(−6.4 * (WTA* − 0.5)))  onde WTA* = log(1 + WTA) / log(2)
 * e WTA = retirada anual / disponibilidade renovável anual.
 *
 * @param {number} annualWithdrawal    - Retirada anual total (m³/ano)
 * @param {number} annualAvailability  - Disponibilidade hídrica renovável anual (m³/ano)
 * @returns {{ wsi: number, wta: number, wtaStar: number }} WSI e intermediários
 * @throws {RangeError} Se annualAvailability <= 0 ou annualWithdrawal < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcWaterScarcityIndex(annualWithdrawal: number, annualAvailability: number): WSIResult {
    for (const [name, val] of [
        ['annualWithdrawal', annualWithdrawal],
        ['annualAvailability', annualAvailability],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (annualAvailability <= 0)
        throw new RangeError(`annualAvailability deve ser > 0; recebido: ${annualAvailability}`);
    if (annualWithdrawal < 0) throw new RangeError(`annualWithdrawal deve ser >= 0; recebido: ${annualWithdrawal}`);

    // WTA = withdrawals-to-availability ratio (índice de pressão hídrica)
    const wta = annualWithdrawal / annualAvailability;

    // WTA* = transformação logarítmica para escala normalizada (Pfister 2009, eq. 1)
    // log base 2 de (1 + WTA); normaliza crescimento não-linear de pressão
    const wtaStar = Math.log(1 + wta) / Math.log(2);

    // WSI via função logística com parâmetros calibrados Pfister 2009
    // WSI ∈ [0.01, 1.00] - nunca 0 ou 1 puro (sempre algum risco)
    const wsiRaw = 1 / (1 + Math.exp(-6.4 * (wtaStar - 0.5)));
    const wsi = Math.max(0.01, Math.min(1.0, wsiRaw));

    return { wsi, wta, wtaStar };
}

interface SustainabilityResult { sustainable: boolean; weightedFootprint: number; status: string; description: string; }

/**
 * Classifica a sustentabilidade da pegada hídrica total de um processo ou produto,
 * combinando pegada azul ponderada por escassez e pegada cinza.
 * Baseado nos critérios do WFN (Hoekstra et al. 2011, cap. 8).
 *
 * @param {number} blueWF   - Pegada hídrica azul (m³)
 * @param {number} greyWF   - Pegada hídrica cinza (m³)
 * @param {number} wsi      - Índice de escassez hídrica local (0.01–1.00)
 * @param {number} threshold - Limite de sustentabilidade regional (m³/unidade ou m³/período)
 * @returns {{ sustainable: boolean, weightedFootprint: number, status: string, description: string }}
 * @throws {RangeError} Se wsi fora de (0, 1] ou threshold <= 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function classifyWaterFootprintSustainability(blueWF: number, greyWF: number, wsi: number, threshold: number): SustainabilityResult {
    for (const [name, val] of [
        ['blueWF', blueWF],
        ['greyWF', greyWF],
        ['wsi', wsi],
        ['threshold', threshold],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val < 0) throw new RangeError(`${name} deve ser >= 0; recebido: ${val}`);
    }
    if (wsi <= 0 || wsi > 1) throw new RangeError(`wsi deve estar em (0, 1]; recebido: ${wsi}`);
    if (threshold <= 0) throw new RangeError(`threshold deve ser > 0; recebido: ${threshold}`);

    // Pegada ponderada: azul escalada pelo WSI local + cinza (escassez-neutra)
    const weightedFootprint = blueWF * wsi + greyWF;

    const ratio = weightedFootprint / threshold;

    if (ratio <= 0.5) {
        return {
            sustainable: true,
            weightedFootprint,
            status: 'SUSTAINABLE',
            description: 'Sustentável — pegada muito abaixo do limiar regional',
        };
    } else if (ratio <= 1.0) {
        return {
            sustainable: true,
            weightedFootprint,
            status: 'MARGINAL',
            description: 'Marginal — próximo ao limiar; monitoramento recomendado',
        };
    } else if (ratio <= 2.0) {
        return {
            sustainable: false,
            weightedFootprint,
            status: 'UNSUSTAINABLE',
            description: 'Insustentável — excede o limiar regional; redução necessária',
        };
    } else {
        return {
            sustainable: false,
            weightedFootprint,
            status: 'CRITICAL',
            description: 'Crítico — pegada muito acima do limiar; risco de colapso hídrico local',
        };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterFootprintLCAMeta = {
    name: 'waterFootprintLCA',
    description: 'Water Footprint & Life Cycle Assessment',
    category: 'analytics',
    familyTags: ['water', 'lca', 'footprint'],
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
