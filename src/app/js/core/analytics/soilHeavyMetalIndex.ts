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
 * Soil Heavy Metal Index - Índice de Metais Pesados no Solo
 *
 * Implements:
 *  - Geo-accumulation index (Igeo) - Müller, R.O. (1969). Geo-Chemistry of Sediments.
 *  - Enrichment Factor (EF) - Sinex & Helz (1981), doi:10.1016/0269-7491(81)90007-3
 *  - Contamination Factor (Cf) and Contamination Degree (Cd) - Hakanson, L. (1980).
 *    doi:10.1016/0043-1354(80)90143-8
 *  - Potential Ecological Risk Index (RI) - Hakanson (1980)
 *  - Brazilian reference values: CETESB DD-256/2016; CONAMA Resolucao 420/2009
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Comentários: headers em inglês, explicações em português.
 *
 * @module soilHeavyMetalIndex
 */

// Toxic response factors (Er) per metal - Hakanson 1980, Table 1
// Fatores de resposta tóxica por metal conforme Hakanson (1980)
const TOXIC_RESPONSE_FACTORS = {
    Cd: 30,
    Pb: 5,
    As: 10,
    Hg: 40,
    Cu: 5,
    Zn: 1,
    Ni: 5,
    Cr: 2,
    Co: 5,
};

// Default geochemical background values (mg/kg) - CETESB DD-256/2016 Valor de Referência (VR)
// Valores de referência geoquímica de fundo para o estado de SP
const CETESB_VR_MG_KG = {
    Cd: 0.5,
    Pb: 17,
    As: 3.5,
    Hg: 0.05,
    Cu: 35,
    Zn: 60,
    Ni: 13,
    Cr: 40,
    Co: 13,
};

/**
 * Calculates the Geo-accumulation Index (Igeo) for a single metal.
 * Calcula o índice de geoacumulação de Müller (1969) para um único metal.
 *
 * Formula: Igeo = log2(Cn / (1.5 * Bn))
 * where Cn = measured concentration, Bn = geochemical background.
 *
 * @param {number} measured - Measured concentration (mg/kg). Concentração medida.
 * @param {number} background - Geochemical background value (mg/kg). Valor de fundo.
 * @returns {number} Igeo value. Valor do índice.
 * @throws {RangeError} If measured or background are not positive numbers.
 */
export function geoAccumulationIndex(measured: any, background: any) {
    if (typeof measured !== 'number' || measured < 0) {
        throw new RangeError(`measured must be a non-negative number, got: ${measured}`);
    }
    if (typeof background !== 'number' || background <= 0) {
        throw new RangeError(`background must be a positive number, got: ${background}`);
    }
    // Divisor 1.5 compensa variações naturais do fundo geoquímico
    return Math.log2(measured / (1.5 * background));
}

/**
 * Classifies contamination level from Igeo value.
 * Classifica o nível de contaminação com base no Igeo (Müller 1969).
 *
 * @param {number} igeo - Geo-accumulation index value.
 * @returns {'unpolluted'|'unpolluted_to_moderately'|'moderately'|'moderately_to_heavily'|'heavily'|'heavily_to_very_heavily'|'very_heavily'} Classification.
 */
export function classifyIgeo(igeo: any) {
    if (typeof igeo !== 'number' || !isFinite(igeo)) {
        throw new TypeError(`igeo must be a finite number, got: ${igeo}`);
    }
    if (igeo <= 0) return 'unpolluted';
    if (igeo <= 1) return 'unpolluted_to_moderately';
    if (igeo <= 2) return 'moderately';
    if (igeo <= 3) return 'moderately_to_heavily';
    if (igeo <= 4) return 'heavily';
    if (igeo <= 5) return 'heavily_to_very_heavily';
    return 'very_heavily';
}

/**
 * Calculates the Enrichment Factor (EF) for a metal.
 * Calcula o Fator de Enriquecimento em relação a um elemento de referência (ex: Fe, Al).
 *
 * Formula: EF = (Cn/Cref)_sample / (Bn/Bref)_background
 *
 * @param {number} metalMeasured - Measured metal concentration (mg/kg).
 * @param {number} refMeasured - Measured reference element concentration (mg/kg).
 * @param {number} metalBackground - Background metal concentration (mg/kg).
 * @param {number} refBackground - Background reference element concentration (mg/kg).
 * @returns {number} Enrichment Factor.
 * @throws {RangeError} If any input is not a positive number.
 */
export function enrichmentFactor(metalMeasured: any, refMeasured: any, metalBackground: any, refBackground: any) {
    for (const [name, val] of [
        ['metalMeasured', metalMeasured],
        ['refMeasured', refMeasured],
        ['metalBackground', metalBackground],
        ['refBackground', refBackground],
    ]) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError(`${name} must be a positive number, got: ${val}`);
        }
    }
    return metalMeasured / refMeasured / (metalBackground / refBackground);
}

/**
 * Calculates Contamination Factor (Cf) for a single metal.
 * Fator de contaminação individual de Hakanson (1980).
 *
 * Formula: Cf = Cmeasured / Cbackground
 *
 * @param {number} measured - Measured concentration (mg/kg).
 * @param {number} background - Background concentration (mg/kg).
 * @returns {number} Contamination Factor.
 * @throws {RangeError} If inputs are invalid.
 */
export function contaminationFactor(measured: any, background: any) {
    if (typeof measured !== 'number' || measured < 0) {
        throw new RangeError(`measured must be a non-negative number, got: ${measured}`);
    }
    if (typeof background !== 'number' || background <= 0) {
        throw new RangeError(`background must be a positive number, got: ${background}`);
    }
    return measured / background;
}

/**
 * Calculates Ecological Risk Factor (Er) for a single metal.
 * Fator de risco ecológico individual para um metal (Hakanson 1980).
 *
 * Formula: Er = Tr * Cf, where Tr is toxic response factor.
 *
 * @param {string} metal - Metal symbol (e.g. 'Cd', 'Pb', 'As').
 * @param {number} cf - Contamination Factor.
 * @param {number} [customTr] - Optional custom toxic response factor.
 * @returns {number} Ecological risk factor for the metal.
 * @throws {TypeError} If metal is unknown and no customTr provided.
 */
export function ecologicalRiskFactor(metal: any, cf: any, customTr: any) {
    if (typeof cf !== 'number' || cf < 0) {
        throw new RangeError(`cf must be a non-negative number, got: ${cf}`);
    }
    const tr =
        customTr !== undefined ? customTr : (TOXIC_RESPONSE_FACTORS as Record<string, number>)[metal];
    if (tr === undefined) {
        throw new TypeError(
            `Unknown metal "${metal}". Provide customTr or use one of: ${Object.keys(TOXIC_RESPONSE_FACTORS).join(', ')}`,
        );
    }
    if (typeof tr !== 'number' || tr <= 0) {
        throw new RangeError(`toxic response factor must be a positive number, got: ${tr}`);
    }
    return tr * cf;
}

/**
 * Calculates comprehensive Hakanson indices for a set of metals at a sampling point.
 * Calcula índices de Hakanson (Cd, RI) para um conjunto de metais num ponto amostral.
 *
 * @param {Record<string, number>} samples - Object mapping metal symbol -> measured concentration (mg/kg).
 * @param {Record<string, number>} [backgrounds] - Optional backgrounds; defaults to CETESB_VR_MG_KG.
 * @param {Record<string, number>} [toxicFactors] - Optional toxic response factors; defaults to TOXIC_RESPONSE_FACTORS.
 * @returns {{
 *   metals: Object.<string, {cf: number, igeo: number, er: number, igeoClass: string}>,
 *   cd: number,
 *   ri: number,
 *   riClass: string
 * }}
 * @throws {TypeError} If samples is not a plain object with at least one entry.
 */
export function hakansonIndices(samples: any, backgrounds = CETESB_VR_MG_KG, toxicFactors = TOXIC_RESPONSE_FACTORS) {
    if (!samples || typeof samples !== 'object' || Array.isArray(samples)) {
        throw new TypeError('samples must be a plain object mapping metal → concentration');
    }
    const metals = Object.keys(samples);
    if (metals.length === 0) throw new RangeError('samples must contain at least one metal');

    /** @type {{ metals: Record<string, {cf: number, igeo: number, er: number, igeoClass: string}>, cd: number, ri: number, riClass: string }} */
    const result = { metals: {}, cd: 0, ri: 0, riClass: '' };

    for (const metal of metals) {
        const measured = samples[metal];
        const bg = (backgrounds as Record<string, number>)[metal];
        if (bg === undefined) {
            throw new TypeError(`No background value for metal "${metal}". Provide custom backgrounds.`);
        }
        if (typeof measured !== 'number' || measured < 0) {
            throw new RangeError(`Concentration for "${metal}" must be a non-negative number, got: ${measured}`);
        }
        const cf = contaminationFactor(measured, bg);
        const igeo = geoAccumulationIndex(measured, bg);
        const tr = (toxicFactors as Record<string, number>)[metal];
        if (tr === undefined) {
            throw new TypeError(`No toxic response factor for "${metal}". Provide custom toxicFactors.`);
        }
        const er = tr * cf;
        (result.metals as Record<string, any>)[metal] = { cf, igeo, er, igeoClass: classifyIgeo(igeo) };
        result.cd += cf;
        result.ri += er;
    }

    // Classifica RI conforme Hakanson (1980) Tabela 5
    result.riClass = classifyRI(result.ri);
    return result;
}

/**
 * Classifies Potential Ecological Risk Index (RI).
 * Classifica o Índice de Risco Ecológico Potencial (Hakanson 1980, Tabela 5).
 *
 * @param {number} ri - RI value.
 * @returns {'low'|'moderate'|'considerable'|'very_high'} Risk classification.
 */
export function classifyRI(ri: any) {
    if (typeof ri !== 'number' || ri < 0) {
        throw new RangeError(`ri must be a non-negative number, got: ${ri}`);
    }
    if (ri < 150) return 'low';
    if (ri < 300) return 'moderate';
    if (ri < 600) return 'considerable';
    return 'very_high';
}

/**
 * Returns CETESB DD-256/2016 background values (read-only copy).
 * Retorna cópia dos valores de referência de fundo do CETESB DD-256/2016.
 *
 * @returns {Object.<string, number>} Background values by metal (mg/kg).
 */
export function getCetesbBackgrounds() {
    return { ...CETESB_VR_MG_KG };
}

/**
 * Returns default Hakanson toxic response factors (read-only copy).
 * Retorna cópia dos fatores de resposta tóxica de Hakanson (1980).
 *
 * @returns {Object.<string, number>} Toxic response factors by metal.
 */
export function getToxicResponseFactors() {
    return { ...TOXIC_RESPONSE_FACTORS };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilHeavyMetalIndexMeta = {
    name: 'soilHeavyMetalIndex',
    description: 'soilHeavyMetalIndex',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
