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
 * Pesticides Environmental Risk Assessment
 *
 * Implements EQR, BQR, GUS index, DT50 persistence classification,
 * and ecotoxicological risk classification for pesticides.
 *
 * References:
 * - USEPA (2016). Ecological Risk Assessment for Pesticides.
 *   https://www.epa.gov/pesticide-science-and-assessing-pesticide-risks
 * - EFSA (2013). Guidance on tiered risk assessment for plant protection products.
 *   EFSA Journal 11(7):3333. DOI: 10.2903/j.efsa.2013.3333
 * - IBAMA (2009). Instrucao Normativa IBAMA n. 411/2009 (I-411).
 *   Procedimento para avaliacao do potencial de perigo de agrotoxicos.
 * - Gustafson, D.I. (1989). Groundwater ubiquity score: a simple method
 *   for assessing pesticide leachability. Environ. Toxicol. Chem. 8(4).
 *   DOI: 10.1002/etc.5620080411
 *
 * @module pesticidesRiskAssessment
 */

/**
 * Environmental Quotient Ratio (EQR) = PEC / PNEC.
 * EQR > 1 indica risco inaceitavel.
 *
 * Quociente de risco ambiental: razao entre concentracao prevista no ambiente
 * e concentracao sem efeito observado (PNEC).
 *
 * @param {number} pec - Predicted Environmental Concentration (mg/L ou mg/kg)
 * @param {number} pnec - Predicted No Effect Concentration (mesma unidade de PEC)
 * @returns {number} EQR (adimensional)
 * @throws {RangeError} Se pec < 0 ou pnec <= 0
 */
export function environmentalQuotientRatio(pec: any, pnec: any) {
    if (typeof pec !== 'number' || pec < 0) {
        throw new RangeError('pec deve ser >= 0');
    }
    if (typeof pnec !== 'number' || pnec <= 0) {
        throw new RangeError('pnec deve ser > 0');
    }
    return pec / pnec;
}

/**
 * Bee Quotient Ratio (BQR): risk index for pollinators.
 * Based on contact/oral LD50 and exposure in ug/bee.
 *
 * Indice de risco para polinizadores: razao dose de exposicao / LD50 abelha.
 *
 * @param {number} exposureDose - Dose de exposicao estimada (ug/abelha)
 * @param {number} ld50Bee - LD50 para Apis mellifera (ug/abelha)
 * @returns {number} BQR (adimensional); BQR > 1 = risco inaceitavel
 * @throws {RangeError} Se exposureDose < 0 ou ld50Bee <= 0
 */
export function beeQuotientRatio(exposureDose: any, ld50Bee: any) {
    if (typeof exposureDose !== 'number' || exposureDose < 0) {
        throw new RangeError('exposureDose deve ser >= 0');
    }
    if (typeof ld50Bee !== 'number' || ld50Bee <= 0) {
        throw new RangeError('ld50Bee deve ser > 0');
    }
    return exposureDose / ld50Bee;
}

/**
 * Groundwater Ubiquity Score (GUS index) - Gustafson 1989.
 * GUS = log10(DT50_soil) * (4 - log10(Koc))
 *
 * Indice de potencial de lixiviacao de pesticidas para aguas subterraneas.
 * GUS > 2.8 = alta tendencia de lixiviacao; GUS < 1.8 = nao lixiviante.
 *
 * @param {number} dt50Soil - Meia-vida no solo (dias)
 * @param {number} koc - Coeficiente de adsorcao organica (mL/g)
 * @returns {number} GUS index
 * @throws {RangeError} Se dt50Soil <= 0 ou koc <= 0
 */
export function gusLeachingIndex(dt50Soil: any, koc: any) {
    if (typeof dt50Soil !== 'number' || dt50Soil <= 0) {
        throw new RangeError('dt50Soil deve ser > 0 (dias)');
    }
    if (typeof koc !== 'number' || koc <= 0) {
        throw new RangeError('koc deve ser > 0 (mL/g)');
    }
    return Math.log10(dt50Soil) * (4 - Math.log10(koc));
}

/**
 * Persistence classification by DT50 values in soil and water.
 *
 * Classificacao de persistencia de pesticidas conforme DT50.
 * Baseado em EFSA 2013 Guidance e EU Directive 91/414.
 *
 * | DT50 solo (dias) | Persistencia          |
 * |------------------|-----------------------|
 * | < 30             | Nao persistente        |
 * | 30–60            | Levemente persistente  |
 * | 60–120           | Moderadamente persist. |
 * | > 120            | Muito persistente      |
 *
 * @param {number} dt50Soil - Meia-vida no solo (dias)
 * @param {number} dt50Water - Meia-vida na agua (dias)
 * @returns {{ soilClass: string, waterClass: string }}
 * @throws {RangeError} Se qualquer DT50 <= 0
 */
export function persistenceClassification(dt50Soil: any, dt50Water: any) {
    if (typeof dt50Soil !== 'number' || dt50Soil <= 0) {
        throw new RangeError('dt50Soil deve ser > 0');
    }
    if (typeof dt50Water !== 'number' || dt50Water <= 0) {
        throw new RangeError('dt50Water deve ser > 0');
    }

    /**
     * @param {number} dt50
     * @returns {string}
     */
    function classify(dt50: any) {
        if (dt50 < 30) return 'non_persistent';
        if (dt50 < 60) return 'slightly_persistent';
        if (dt50 < 120) return 'moderately_persistent';
        return 'very_persistent';
    }

    return {
        soilClass: classify(dt50Soil),
        waterClass: classify(dt50Water),
    };
}

/**
 * Overall ecotoxicological risk classification for a pesticide.
 * Combines EQR and persistence into a risk tier.
 *
 * Classificacao de risco ecotoxicologico geral combinando EQR e persistencia.
 * Metodologia I-411 IBAMA simplificada.
 *
 * | Tier | Criterio                                        |
 * |------|-------------------------------------------------|
 * | I    | EQR <= 1 e nao persistente                      |
 * | II   | EQR <= 1 mas persistente                        |
 * | III  | 1 < EQR <= 10 e nao muito persistente           |
 * | IV   | EQR > 10 ou muito persistente com EQR > 1      |
 *
 * @param {number} eqr - Environmental Quotient Ratio
 * @param {string} soilPersistence - soilClass from persistenceClassification()
 * @returns {{ tier: number, label: string, risk: string }}
 * @throws {RangeError} Se eqr < 0
 * @throws {TypeError} Se soilPersistence nao for string valida
 */
export function ecotoxRiskClassification(eqr: any, soilPersistence: any) {
    if (typeof eqr !== 'number' || eqr < 0) {
        throw new RangeError('eqr deve ser >= 0');
    }
    const validPersistence = ['non_persistent', 'slightly_persistent', 'moderately_persistent', 'very_persistent'];
    if (!validPersistence.includes(soilPersistence)) {
        throw new TypeError(`soilPersistence invalida: ${soilPersistence}`);
    }
    const veryPersistent = soilPersistence === 'very_persistent';

    if (eqr <= 1 && !veryPersistent) {
        return { tier: 1, label: 'Tier I', risk: 'Baixo risco ecotoxicologico' };
    }
    if (eqr <= 1 && veryPersistent) {
        return { tier: 2, label: 'Tier II', risk: 'Risco medio (persistencia alta)' };
    }
    if (eqr <= 10 && !veryPersistent) {
        return { tier: 3, label: 'Tier III', risk: 'Risco moderado' };
    }
    return { tier: 4, label: 'Tier IV', risk: 'Risco alto — revisao necessaria' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const pesticidesRiskAssessmentMeta = {
    name: 'pesticidesRiskAssessment',
    description: 'pesticidesRiskAssessment',
    category: 'analytics',
    familyTags: ['risk', 'pesticide'],
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
