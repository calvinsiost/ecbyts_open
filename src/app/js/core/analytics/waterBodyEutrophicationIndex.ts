// @ts-check
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
 * Water Body Eutrophication Index
 *
 * Implements the Carlson Trophic State Index (TSI) - Carlson (1977) - adapted for
 * Brazilian conditions per CONAMA Resolution 357/2005 and IHF (2007) guidelines.
 *
 * References:
 *   - Carlson, R.E. (1977). "A trophic state index for lakes." Limnology and Oceanography,
 *     22(2), 361–369. DOI: 10.4319/lo.1977.22.2.0361
 *   - CONAMA Resolução 357/2005. "Classificação de corpos de água e padrões de qualidade."
 *     Ministério do Meio Ambiente, Brasil.
 *   - Toledo, A.P. et al. (1990). "Aplicação de modelos simplificados para a avaliação
 *     do processo de eutrofização em lagos e reservatórios tropicais." CETESB, São Paulo.
 *   - Lamparelli, M.C. (2004). "Graus de trofia em corpos d'água do estado de SP." Tese
 *     USP. ISBN: não disponível (dissertação).
 *
 * @module waterBodyEutrophicationIndex
 */

// ─── Constants - TSI thresholds (Carlson 1977; adapted Lamparelli 2004) ─────

const TSI_CLASSES = [
    { max: 47, label: 'ultraoligotrophic', labelPT: 'ultraoligotrófico' },
    { max: 52, label: 'oligotrophic', labelPT: 'oligotrófico' },
    { max: 59, label: 'mesotrophic', labelPT: 'mesotrófico' },
    { max: 63, label: 'eutrophic', labelPT: 'eutrófico' },
    { max: 67, label: 'supereutrophic', labelPT: 'supereutrófico' },
    { max: Infinity, label: 'hypereutrophic', labelPT: 'hipereutrófico' },
];

// CONAMA 357/2005 - limites de fósforo total por classe de uso (µg/L)
const CONAMA_TP_LIMITS = {
    class1_lotic: 0.1e3, // Classe 1 — rios: 100 µg/L (convertido de mg/L)
    class2_lotic: 0.1e3, // Classe 2 — rios: 100 µg/L
    class1_lentic: 20, // Classe 1 — lagos/reservatórios ambientes lênticos: 20 µg/L
    class2_lentic: 30, // Classe 2 — lagos/reservatórios: 30 µg/L
};

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate TSI from chlorophyll-a concentration (Carlson 1977, eq. 1).
 *
 * TSI(CHL) = 10 × (6 - (2.04 - 0.68 × ln(CHL)) / ln(2))
 *
 * @param {number} chl_a - Chlorophyll-a concentration (µg/L)
 * @returns {number} TSI value (dimensionless)
 * @throws {TypeError}  if chl_a is not a number
 * @throws {RangeError} if chl_a <= 0
 */
export function tsiFromChlorophyll(chl_a: any) {
    if (typeof chl_a !== 'number' || isNaN(chl_a)) throw new TypeError('chl_a must be a number');
    if (chl_a <= 0) throw new RangeError('chl_a must be positive (µg/L)');
    // Equação Carlson 1977 - TSI baseado em clorofila-a
    return 10 * (6 - (2.04 - 0.68 * Math.log(chl_a)) / Math.log(2));
}

/**
 * Calculate TSI from Secchi disk transparency depth (Carlson 1977, eq. 2).
 *
 * TSI(SD) = 10 × (6 - ln(SD) / ln(2))
 *
 * @param {number} secchi_m - Secchi disk depth (m)
 * @returns {number} TSI value (dimensionless)
 * @throws {TypeError}  if secchi_m is not a number
 * @throws {RangeError} if secchi_m <= 0
 */
export function tsiFromSecchi(secchi_m: any) {
    if (typeof secchi_m !== 'number' || isNaN(secchi_m)) throw new TypeError('secchi_m must be a number');
    if (secchi_m <= 0) throw new RangeError('secchi_m must be positive (m)');
    // Transparência Secchi: inversamente proporcional ao TSI
    return 10 * (6 - Math.log(secchi_m) / Math.log(2));
}

/**
 * Calculate TSI from total phosphorus concentration (Toledo et al. 1990 tropical adaptation).
 *
 * TSI(TP) = 10 × (6 - (0.42 - 0.36 × ln(TP)) / ln(2))
 * Equação adaptada por Toledo et al. (1990) para reservatórios tropicais brasileiros.
 *
 * @param {number} tp_ug_L - Total phosphorus (µg/L)
 * @returns {number} TSI value (dimensionless)
 * @throws {TypeError}  if tp_ug_L is not a number
 * @throws {RangeError} if tp_ug_L <= 0
 */
export function tsiFromTotalPhosphorus(tp_ug_L: any) {
    if (typeof tp_ug_L !== 'number' || isNaN(tp_ug_L)) throw new TypeError('tp_ug_L must be a number');
    if (tp_ug_L <= 0) throw new RangeError('tp_ug_L must be positive (µg/L)');
    // Toledo et al. 1990 - adaptação tropical (lagos rasos do SE brasileiro)
    return 10 * (6 - (0.42 - 0.36 * Math.log(tp_ug_L)) / Math.log(2));
}

/**
 * Classify a TSI value into a trophic state label.
 *
 * Classifica um valor de TSI em estado trófico conforme Lamparelli (2004).
 *
 * @param {number} tsi - TSI value
 * @returns {{ label: string, labelPT: string }} English and Portuguese labels
 * @throws {TypeError} if tsi is not a number
 */
export function classifyTSI(tsi: any) {
    if (typeof tsi !== 'number' || isNaN(tsi)) throw new TypeError('tsi must be a number');
    // TSI_CLASSES has Infinity sentinel as last entry, so find always succeeds
    const cls = (TSI_CLASSES.find((c) => tsi < c.max) ?? TSI_CLASSES[TSI_CLASSES.length - 1])!;
    return { label: cls.label, labelPT: cls.labelPT };
}

/**
 * Compute composite eutrophication index from multiple TSI indicators.
 *
 * Índice composto = média dos TSI disponíveis com pesos diferenciados:
 * Carlson recomenda média aritmética; Lamparelli (2004) sugere prioridade a CHL-a e TP.
 * Weights: CHL-a = 0.4, TP = 0.4, Secchi = 0.2 (quando disponíveis).
 *
 * @param {object} indicators
 * @param {number|null} [indicators.chl_a_ug_L]  - Chlorophyll-a (µg/L) - null if unavailable
 * @param {number|null} [indicators.secchi_m]     - Secchi depth (m) - null if unavailable
 * @param {number|null} [indicators.tp_ug_L]      - Total phosphorus (µg/L) - null if unavailable
 * @param {'lentic'|'lotic'} [indicators.waterBodyType='lentic'] - Tipo de corpo hídrico
 * @returns {{
 *   tsiChl:   number|null,
 *   tsiSd:    number|null,
 *   tsiTp:    number|null,
 *   tsiComposite: number,
 *   trophicState: { label: string, labelPT: string },
 *   conamaConformity: { class1: boolean|null, class2: boolean|null }
 * }}
 * @throws {TypeError}  if indicators is not an object
 * @throws {RangeError} if no valid indicator is provided
 */
export function compositeEutrophicationIndex({
    chl_a_ug_L = null,
    secchi_m = null,
    tp_ug_L = null,
    waterBodyType = 'lentic',
} = {}) {
    if (!['lentic', 'lotic'].includes(waterBodyType)) {
        throw new RangeError('waterBodyType must be "lentic" or "lotic"');
    }

    const tsiChl = chl_a_ug_L !== null ? tsiFromChlorophyll(chl_a_ug_L) : null;
    const tsiSd = secchi_m !== null ? tsiFromSecchi(secchi_m) : null;
    const tsiTp = tp_ug_L !== null ? tsiFromTotalPhosphorus(tp_ug_L) : null;

    // Calcular média ponderada com pesos Lamparelli (2004)
    let weightedSum = 0;
    let totalWeight = 0;
    if (tsiChl !== null) {
        weightedSum += tsiChl * 0.4;
        totalWeight += 0.4;
    }
    if (tsiTp !== null) {
        weightedSum += tsiTp * 0.4;
        totalWeight += 0.4;
    }
    if (tsiSd !== null) {
        weightedSum += tsiSd * 0.2;
        totalWeight += 0.2;
    }

    if (totalWeight === 0) {
        throw new RangeError('At least one indicator (chl_a_ug_L, secchi_m, or tp_ug_L) must be provided');
    }

    const tsiComposite = weightedSum / totalWeight;
    const trophicState = classifyTSI(tsiComposite);

    // Verificação de conformidade CONAMA 357/2005 - baseada em fósforo total
    /** @type {{ class1: boolean|null, class2: boolean|null }} */
    let conamaConformity: { class1: boolean | null; class2: boolean | null } = { class1: null, class2: null };
    if (tp_ug_L !== null) {
        const key = waterBodyType === 'lentic' ? 'lentic' : 'lotic';
        conamaConformity = {
            class1: tp_ug_L <= CONAMA_TP_LIMITS[`class1_${key}`],
            class2: tp_ug_L <= CONAMA_TP_LIMITS[`class2_${key}`],
        };
    }

    return { tsiChl, tsiSd, tsiTp, tsiComposite, trophicState, conamaConformity };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterBodyEutrophicationIndexMeta = {
    name: 'waterBodyEutrophicationIndex',
    description: 'waterBodyEutrophicationIndex',
    category: 'analytics',
    familyTags: ['water', 'eutrophication', 'ecological_network'],
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
