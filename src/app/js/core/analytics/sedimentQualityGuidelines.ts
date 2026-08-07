// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

interface TEL_PEL_Value { TEL: number; PEL: number }
interface ClassifyResult { classification: string; guideline: TEL_PEL_Value | null; exceedance: string }
interface Measurement { parameter: string; value: number }
interface PELQuotientResult { mPELQ: number; n: number; toxicityProbable: boolean }
interface PLIResult { PLI: number; interpretation: string }

/**
 * Sediment Quality Guidelines - TEL/PEL (CCME 2002) + ERM/ERL (Long et al. 1995).
 * Indices de qualidade de sedimentos para avaliacao de contaminacao.
 *
 * References:
 *   CCME (2002) Canadian Sediment Quality Guidelines for the Protection of Aquatic Life.
 *   Long E.R. et al. (1995) Incidence of adverse biological effects within ranges of
 *     chemical concentrations in marine and estuarine sediments. Environ. Manage. 19:81-97.
 *   Hakanson L. (1980) An ecological risk index for aquatic pollution control.
 *     Water Research 14:975-1001.
 */

/**
 * TEL/PEL thresholds (mg/kg dry weight) - CCME 2002.
 * TEL = Threshold Effect Level (below = rarely toxic)
 * PEL = Probable Effect Level (above = frequently toxic)
 */
const TEL_PEL: Record<string, TEL_PEL_Value> = {
    arsenic: { TEL: 5.9, PEL: 17.0 },
    cadmium: { TEL: 0.596, PEL: 3.53 },
    chromium: { TEL: 37.3, PEL: 90.0 },
    copper: { TEL: 35.7, PEL: 197.0 },
    lead: { TEL: 35.0, PEL: 91.3 },
    mercury: { TEL: 0.174, PEL: 0.486 },
    nickel: { TEL: 18.0, PEL: 35.9 },
    zinc: { TEL: 123.0, PEL: 315.0 },
};

/**
 * Classifica concentracao de sedimento usando TEL/PEL (CCME 2002).
 * Classifies sediment concentration using TEL/PEL thresholds.
 *
 * @param {string} parameter - Nome do parametro (ex: 'arsenic', 'copper')
 * @param {number} value_mg_kg - Concentracao medida em mg/kg peso seco
 * @returns {ClassifyResult}
 */
export function classifyBySedimentQuality(parameter: string, value_mg_kg: number): ClassifyResult {
    if (typeof parameter !== 'string' || !parameter) {
        throw new TypeError('parameter must be a non-empty string');
    }
    if (typeof value_mg_kg !== 'number' || !isFinite(value_mg_kg) || value_mg_kg < 0) {
        throw new RangeError('value_mg_kg must be a non-negative finite number');
    }
    const key = parameter.toLowerCase();
    const guideline = TEL_PEL[key] ?? null;

    if (!guideline) {
        return { classification: 'unknown_parameter', guideline: null, exceedance: 'N/A' };
    }

    let classification: string;
    let exceedance: string;

    if (value_mg_kg < guideline.TEL) {
        classification = 'below_TEL';
        exceedance = 'none';
    } else if (value_mg_kg <= guideline.PEL) {
        classification = 'between_TEL_PEL';
        exceedance = 'TEL';
    } else {
        classification = 'above_PEL';
        exceedance = 'PEL';
    }

    return { classification, guideline, exceedance };
}

/**
 * Calcula o Mean PEL Quotient (mPEL-Q) - indicador de toxicidade provavel.
 * Calcula a media dos quocientes PEL para um conjunto de medicoes.
 * mPEL-Q = (1/n) * SUM(C_i / PEL_i)
 *
 * @param {Measurement[]} measurements - Array de { parameter, value }
 * @returns {PELQuotientResult}
 */
export function calcMeanPELQuotient(measurements: Measurement[]): PELQuotientResult {
    if (!Array.isArray(measurements) || measurements.length === 0) {
        throw new TypeError('measurements must be a non-empty array');
    }
    let sum = 0;
    let n = 0;
    for (const m of measurements) {
        const key = (m.parameter || '').toLowerCase();
        const guideline = TEL_PEL[key];
        if (!guideline) continue;
        if (typeof m.value !== 'number' || !isFinite(m.value) || m.value < 0) {
            throw new RangeError(`Invalid value for parameter "${m.parameter}"`);
        }
        sum += m.value / guideline.PEL;
        n++;
    }
    if (n === 0) return { mPELQ: 0, n: 0, toxicityProbable: false };
    const mPELQ = sum / n;
    return { mPELQ, n, toxicityProbable: mPELQ > 0.5 };
}

/**
 * Calcula o Fator de Contaminacao (CF) - Hakanson (1980).
 * CF = C_sample / C_background
 *
 * @param {number} value - Concentracao medida na amostra (mg/kg)
 * @param {number} background - Concentracao de background / referencia (mg/kg)
 * @returns {number} CF (adimensional)
 */
export function calcContaminationFactor(value: number, background: number): number {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        throw new RangeError('value must be a non-negative finite number');
    }
    if (typeof background !== 'number' || !isFinite(background) || background <= 0) {
        throw new RangeError('background must be a positive finite number');
    }
    return value / background;
}

/**
 * Calcula o Pollution Load Index (PLI) - Tomlinson et al. (1980) adaptado Hakanson 1980.
 * PLI = (CF1 * CF2 * ... * CFn)^(1/n)
 * PLI > 1 indica deterioracao da qualidade do sedimento.
 *
 * @param {number[]} contaminationFactors - Array de CFs calculados por calcContaminationFactor
 * @returns {PLIResult}
 */
export function calcPollutionLoadIndex(contaminationFactors: number[]): PLIResult {
    if (!Array.isArray(contaminationFactors) || contaminationFactors.length === 0) {
        throw new TypeError('contaminationFactors must be a non-empty array');
    }
    for (const cf of contaminationFactors) {
        if (typeof cf !== 'number' || !isFinite(cf) || cf < 0) {
            throw new RangeError('Each CF must be a non-negative finite number');
        }
    }
    const n = contaminationFactors.length;
    const product = contaminationFactors.reduce((acc, cf) => acc * cf, 1);
    const PLI = Math.pow(product, 1 / n);
    const interpretation = PLI <= 1 ? 'no_pollution' : PLI <= 2 ? 'moderate_pollution' : 'severe_pollution';
    return { PLI, interpretation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const sedimentQualityGuidelinesMeta = {
    name: 'sedimentQualityGuidelines',
    description: 'sedimentQualityGuidelines',
    category: 'analytics',
    familyTags: ['sediment'],
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
