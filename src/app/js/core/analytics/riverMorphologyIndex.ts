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
 * riverMorphologyIndex.js
 * Hidráulica fluvial - raio hidráulico, equação de Manning-Strickler e Chezy,
 * número de Froude e classificação de regime de escoamento.
 *
 * References:
 *   [1] Manning, R. (1891). "On the flow of water in open channels and pipes."
 *       Trans. Inst. Civil Eng. Ireland, 20, 161-207.
 *   [2] Chezy, A. (1769). Memoir on the velocity of water in channels. (trans. Mouret, 1921)
 *   [3] Chow, V.T. (1959). Open-Channel Hydraulics. McGraw-Hill, New York.
 *       ISBN: 07-010776-9
 *   [4] Henderson, F.M. (1966). Open Channel Flow. Prentice Hall.
 *       ISBN: 0-02-353510-2
 *
 * @module core/analytics/riverMorphologyIndex
 */

'use strict';

const G = 9.80665; // m/s² — aceleração gravitacional padrão (ISO 80000-3)

interface HydraulicRadiusResult { hydraulicRadius_m: number }
interface ManningVelocityResult { velocity_m_s: number }
interface ChezyCoeffResult { chezyCoeff_m05_s: number }
interface FroudeResult { froudeNumber: number, regime: string }

/**
 * Calcula o raio hidráulico de uma seção transversal.
 * R = A / P   [Chow 1959, eq. 2-1]
 *
 * @param {number} crossSectionArea_m2  - área molhada da seção (m²), > 0
 * @param {number} wettedPerimeter_m    - perímetro molhado (m), > 0
 * @returns {{ hydraulicRadius_m: number }}
 */
export function calcHydraulicRadius(crossSectionArea_m2: number, wettedPerimeter_m: number): HydraulicRadiusResult {
    if (typeof crossSectionArea_m2 !== 'number' || crossSectionArea_m2 <= 0) {
        throw new RangeError('crossSectionArea_m2 must be a positive number');
    }
    if (typeof wettedPerimeter_m !== 'number' || wettedPerimeter_m <= 0) {
        throw new RangeError('wettedPerimeter_m must be a positive number');
    }
    return { hydraulicRadius_m: crossSectionArea_m2 / wettedPerimeter_m };
}

/**
 * Calcula a velocidade média de escoamento pela equação de Manning.
 * V = (1/n) × R^(2/3) × S^(1/2)   [Manning 1891, Chow 1959 eq. 5-16]
 *
 * @param {number} n       - coeficiente de rugosidade de Manning (adim.), > 0
 * @param {number} R       - raio hidráulico (m), > 0
 * @param {number} slope   - declividade da linha de energia (m/m), > 0
 * @returns {{ velocity_m_s: number }}
 */
export function calcManningVelocity(n: number, R: number, slope: number): ManningVelocityResult {
    if (typeof n !== 'number' || n <= 0) {
        throw new RangeError('n (Manning roughness) must be a positive number');
    }
    if (typeof R !== 'number' || R <= 0) {
        throw new RangeError('R (hydraulic radius) must be a positive number');
    }
    if (typeof slope !== 'number' || slope <= 0) {
        throw new RangeError('slope must be a positive number');
    }
    const velocity_m_s = (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(slope);
    return { velocity_m_s };
}

/**
 * Calcula o coeficiente de Chezy a partir de condições de escoamento conhecidas.
 * C = V / √(R × S)   [Chezy 1769, Henderson 1966 eq. 4-3]
 *
 * @param {number} R        - raio hidráulico (m), > 0
 * @param {number} slope    - declividade (m/m), > 0
 * @param {number} velocity - velocidade média de escoamento (m/s), > 0
 * @returns {{ chezyCoeff_m05_s: number }}
 */
export function calcChezyCoeff(R: number, slope: number, velocity: number): ChezyCoeffResult {
    if (typeof R !== 'number' || R <= 0) {
        throw new RangeError('R must be a positive number');
    }
    if (typeof slope !== 'number' || slope <= 0) {
        throw new RangeError('slope must be a positive number');
    }
    if (typeof velocity !== 'number' || velocity <= 0) {
        throw new RangeError('velocity must be a positive number');
    }
    const chezyCoeff_m05_s = velocity / Math.sqrt(R * slope);
    return { chezyCoeff_m05_s };
}

/**
 * Calcula o número de Froude e identifica o regime de escoamento.
 * Fr = V / √(g × d)   [Henderson 1966 eq. 8-2]
 *
 * @param {number} velocity_m_s - velocidade média (m/s), >= 0
 * @param {number} depth_m      - lâmina d'água (m), > 0
 * @returns {{ froudeNumber: number, regime: string }}
 */
export function calcFroudeNumber(velocity_m_s: number, depth_m: number): FroudeResult {
    if (typeof velocity_m_s !== 'number' || velocity_m_s < 0) {
        throw new RangeError('velocity_m_s must be a non-negative number');
    }
    if (typeof depth_m !== 'number' || depth_m <= 0) {
        throw new RangeError('depth_m must be a positive number');
    }
    const froudeNumber = velocity_m_s / Math.sqrt(G * depth_m);
    const regime = classifyFlowRegime(froudeNumber);
    return { froudeNumber, regime };
}

/**
 * Classifica o regime hidráulico pelo número de Froude.
 * Fr < 1 → subcritical; Fr = 1 → critical; Fr > 1 → supercritical
 * Tolerância de ±0.5% ao redor de Fr=1 para regime crítico prático.
 * [Chow 1959 Cap. 1, Henderson 1966 Cap. 1]
 *
 * @param {number} Fr - número de Froude adimensional, >= 0
 * @returns {'subcritical'|'critical'|'supercritical'}
 */
export function classifyFlowRegime(Fr: number): 'subcritical' | 'critical' | 'supercritical' {
    if (typeof Fr !== 'number' || Fr < 0) {
        throw new RangeError('Fr must be a non-negative number');
    }
    if (Math.abs(Fr - 1.0) <= 0.005) return 'critical';
    if (Fr < 1.0) return 'subcritical';
    return 'supercritical';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverMorphologyIndexMeta = {
    name: 'riverMorphologyIndex',
    description: 'riverMorphologyIndex',
    category: 'analytics',
    familyTags: ['river'],
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
