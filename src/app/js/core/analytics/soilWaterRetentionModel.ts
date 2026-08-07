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
 * Van Genuchten parameters for common soil textures.
 * Parâmetros típicos de van Genuchten por textura (Carsel & Parrish 1988).
 */
interface VGParam {
    alpha: number;
    n: number;
    thetaR: number;
    thetaS: number;
    Ks: number;
}

export const VG_TEXTURE_PARAMS: Record<string, VGParam> = {
    sand: { alpha: 0.145, n: 2.68, thetaR: 0.045, thetaS: 0.43, Ks: 712.8 },
    loamy_sand: { alpha: 0.124, n: 2.28, thetaR: 0.057, thetaS: 0.41, Ks: 350.2 },
    sandy_loam: { alpha: 0.075, n: 1.89, thetaR: 0.065, thetaS: 0.41, Ks: 106.1 },
    loam: { alpha: 0.036, n: 1.56, thetaR: 0.078, thetaS: 0.43, Ks: 25.0 },
    silt: { alpha: 0.016, n: 1.37, thetaR: 0.034, thetaS: 0.46, Ks: 6.0 },
    silt_loam: { alpha: 0.02, n: 1.41, thetaR: 0.067, thetaS: 0.45, Ks: 10.8 },
    sandy_clay_loam: { alpha: 0.059, n: 1.48, thetaR: 0.1, thetaS: 0.39, Ks: 31.4 },
    clay_loam: { alpha: 0.019, n: 1.31, thetaR: 0.095, thetaS: 0.41, Ks: 6.2 },
    silty_clay_loam: { alpha: 0.01, n: 1.23, thetaR: 0.089, thetaS: 0.43, Ks: 1.7 },
    sandy_clay: { alpha: 0.027, n: 1.23, thetaR: 0.1, thetaS: 0.38, Ks: 2.9 },
    silty_clay: { alpha: 0.005, n: 1.09, thetaR: 0.07, thetaS: 0.36, Ks: 0.5 },
    clay: { alpha: 0.008, n: 1.09, thetaR: 0.068, thetaS: 0.38, Ks: 4.8 },
};

interface VGParamsBase {
    alpha: number;
    n: number;
    thetaR: number;
    thetaS: number;
}

/**
 * Compute volumetric water content using the van Genuchten (1980) model.
 * Calcula o conteúdo volumétrico de água pelo modelo de van Genuchten.
 *
 * theta(h) = thetaR + (thetaS - thetaR) / [1 + (alpha * |h|)^n]^m
 * where m = 1 - 1/n (Mualem constraint)
 *
 * @param {number} h - Matric potential head in cm (negative = unsaturated; use |h|)
 * @param {{alpha: number, n: number, thetaR: number, thetaS: number}} params - van Genuchten parameters
 * @returns {number} Volumetric water content theta (cm^3/cm^3)
 */
export function vanGenuchtenTheta(h: number, params: VGParamsBase): number {
    if (typeof h !== 'number' || !isFinite(h)) throw new TypeError('h must be a finite number');
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { alpha, n, thetaR, thetaS } = params;
    if (typeof alpha !== 'number' || alpha <= 0) throw new RangeError('alpha must be > 0');
    if (typeof n !== 'number' || n <= 1) throw new RangeError('n must be > 1');
    if (typeof thetaR !== 'number' || thetaR < 0) throw new RangeError('thetaR must be >= 0');
    if (typeof thetaS !== 'number' || thetaS <= thetaR) throw new RangeError('thetaS must be > thetaR');

    // Se h >= 0, solo saturado
    // If h >= 0, soil is saturated
    if (h >= 0) return thetaS;

    const absH = Math.abs(h);
    const m = 1 - 1 / n;
    const denom = Math.pow(1 + Math.pow(alpha * absH, n), m);
    return thetaR + (thetaS - thetaR) / denom;
}

/**
 * Compute relative hydraulic conductivity using the Mualem (1976) / van Genuchten model.
 * Calcula a condutividade hidráulica relativa pelo modelo de Mualem-van Genuchten.
 *
 * Kr(Se) = Se^l * [1 - (1 - Se^(1/m))^m]^2
 * where Se = effective saturation, l = 0.5 (Mualem tortuosity factor)
 *
 * @param {number} h - Matric potential head in cm (negative)
 * @param {{alpha: number, n: number, thetaR: number, thetaS: number}} params - van Genuchten parameters
 * @param {number} [l=0.5] - Mualem tortuosity/connectivity factor
 * @returns {number} Relative hydraulic conductivity Kr (0-1)
 */
export function mualemKr(h: number, params: VGParamsBase, l: number = 0.5): number {
    if (typeof l !== 'number') throw new TypeError('l must be a number');
    if (h >= 0) return 1.0;

    const theta = vanGenuchtenTheta(h, params);
    const { thetaR, thetaS, n } = params;
    const m = 1 - 1 / n;

    // Saturação efetiva - effective saturation
    const Se = (theta - thetaR) / (thetaS - thetaR);
    if (Se <= 0) return 0;
    if (Se >= 1) return 1;

    const inner = 1 - Math.pow(1 - Math.pow(Se, 1 / m), m);
    return Math.pow(Se, l) * inner * inner;
}

interface AWC_Options {
    hFC?: number;
    hPWP?: number;
}

interface AWC_Result {
    thetaFC: number;
    thetaPWP: number;
    AWC: number;
}

/**
 * Compute available water capacity (AWC) of the soil.
 * Calcula a capacidade de água disponível (AWC) entre CC e PMP.
 *
 * AWC = theta(hFC) - theta(hPWP)
 * Field capacity (FC): h = -100 cm (pF 2.0 - European standard) or -330 cm (pF 2.5 - US standard)
 * Permanent wilting point (PWP): h = -15 300 cm (pF 4.18 = 1500 kPa)
 *
 * @param {{alpha: number, n: number, thetaR: number, thetaS: number}} params - van Genuchten parameters
 * @param {{hFC?: number, hPWP?: number}} [options]
 * @returns {{ thetaFC: number, thetaPWP: number, AWC: number }} Water content values (cm^3/cm^3)
 */
export function availableWaterCapacity(params: VGParamsBase, options: AWC_Options = {}): AWC_Result {
    const hFC = options.hFC ?? -100;
    const hPWP = options.hPWP ?? -15300;

    if (hFC >= 0 || hPWP >= 0) throw new RangeError('hFC and hPWP must be negative');
    if (hPWP >= hFC) throw new RangeError('hPWP must be more negative than hFC');

    const thetaFC = vanGenuchtenTheta(hFC, params);
    const thetaPWP = vanGenuchtenTheta(hPWP, params);
    const AWC = thetaFC - thetaPWP;

    return { thetaFC, thetaPWP, AWC };
}

interface QualityIndex_Result {
    score: number;
    rating: string;
    description: string;
}

function _awcScore(AWC: number): number {
    if (AWC >= 0.2) return 1.0;
    if (AWC >= 0.15) return 0.75;
    if (AWC >= 0.1) return 0.5;
    if (AWC >= 0.05) return 0.25;
    return 0.1;
}

function _ksScore(Ks: number): number {
    if (Ks >= 10 && Ks <= 100) return 1.0;
    if (Ks > 100) return 0.7;
    if (Ks >= 1) return 0.55;
    return 0.25;
}

function _ratingFromScore(score: number): string {
    if (score >= 0.85) return 'Excellent';
    if (score >= 0.65) return 'Good';
    if (score >= 0.45) return 'Fair';
    return 'Poor';
}

/**
 * Classify soil hydraulic quality based on AWC and saturated hydraulic conductivity.
 * Classifica a qualidade hídrica do solo com base na AWC e Ks.
 *
 * Classification follows FAO/USDA soil quality index guidelines.
 * Fonte: Karlen et al. (1997), Soil Sci. Soc. Am. J. DOI: 10.2136/sssaj1997.0361...
 *
 * @param {number} AWC - Available water capacity (cm³/cm³)
 * @param {number} Ks - Saturated hydraulic conductivity (cm/day)
 * @returns {{ score: number, rating: string, description: string }}
 */
export function soilHydraulicQualityIndex(AWC: number, Ks: number): QualityIndex_Result {
    if (typeof AWC !== 'number' || AWC < 0 || AWC > 1) throw new RangeError('AWC must be in [0, 1]');
    if (typeof Ks !== 'number' || Ks < 0) throw new RangeError('Ks must be >= 0');

    const awcScore = _awcScore(AWC);
    const ksScore = _ksScore(Ks);
    const score = (awcScore + ksScore) / 2;
    const rating = _ratingFromScore(score);
    const description = `AWC=${(AWC * 100).toFixed(1)}% | Ks=${Ks.toFixed(1)} cm/d | Score=${score.toFixed(2)}`;

    return { score, rating, description };
}

interface RetentionCurve_Point {
    h: number;
    theta: number;
    Kr: number;
}

/**
 * Compute full van Genuchten retention curve for an array of matric heads.
 * Gera a curva de retenção completa para um vetor de potenciais.
 *
 * @param {number[]} hArray - Array of matric potential heads in cm (negative)
 * @param {{alpha: number, n: number, thetaR: number, thetaS: number}} params - van Genuchten parameters
 * @returns {{ h: number, theta: number, Kr: number }[]} Retention curve data
 */
export function retentionCurve(hArray: number[], params: VGParamsBase): RetentionCurve_Point[] {
    if (!Array.isArray(hArray) || hArray.length === 0) {
        throw new TypeError('hArray must be a non-empty array');
    }
    return hArray.map((h) => ({
        h,
        theta: vanGenuchtenTheta(h, params),
        Kr: mualemKr(h, params),
    }));
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilWaterRetentionModelMeta = {
    name: 'soilWaterRetentionModel',
    description: 'soilWaterRetentionModel',
    category: 'analytics',
    familyTags: ['soil', 'water', 'hydrocarbon'],
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
