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
 * Mine Blasting Vibration Model
 *
 * Implements peak particle velocity (PPV) attenuation and compliance analysis:
 * - Ambraseys, N.R. & Hendron, A.J. (1968). Dynamic behaviour of rock masses.
 *   In: Rock Mechanics in Engineering Practice (eds Stagg & Zienkiewicz). Wiley, London.
 * - ISRM (2010). The ISRM Suggested Methods for Rock Characterization, Testing and Monitoring.
 *   International Society for Rock Mechanics.
 * - ABNT NBR 9653:2018 - Guia para avaliação dos efeitos provocados pelo uso de explosivos
 *   nas minerações em áreas urbanas (Brazil standard).
 * - DIN 4150-3:2016 - Structural vibration: Effects of vibration on structures (Germany).
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module mineBlastingVibration
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

/**
 * Limites de PPV por tipo de estrutura conforme ABNT NBR 9653:2018 e DIN 4150-3.
 * Peak particle velocity limits by structure type.
 * Unidade: mm/s
 * @type {Record<string, number>}
 */
const PPV_LIMITS: Record<string, number> = {
    // ABNT NBR 9653:2018 - limites para estruturas em geral (mm/s)
    abnt_industrial: 50, // estruturas industriais e comerciais robustas
    abnt_residential: 15, // edificações residenciais
    abnt_historic: 5, // monumentos históricos e estruturas sensíveis

    // DIN 4150-3:2016 - valores-guia para proteção de estruturas (mm/s)
    din_class1: 20, // edifícios industriais e comerciais
    din_class2: 5, // edifícios residenciais (frequências 1–10 Hz)
    din_class3: 3, // estruturas sensíveis (museus, hospitais, monumentos)
};

/**
 * Computes Peak Particle Velocity (PPV) using the Ambraseys-Hendron (1968) scaled distance law.
 * Calcula a Velocidade de Partícula de Pico (VPP/PPV) pela lei de distância escalada.
 *
 * PPV = K * (R / sqrt(Q))^(-n)
 *
 * where:
 *   R  = distance from blast [m]
 *   Q  = maximum instantaneous charge (MIC) per delay [kg]
 *   K, n = site-specific attenuation constants (empirical)
 *
 * Typical values: K = 160, n = 1.6 (hard rock); K = 400, n = 1.6 (soft ground).
 *
 * @param {number} distance   - Distance from blast point to receptor [m]
 * @param {number} charge     - Maximum instantaneous charge per delay [kg]
 * @param {number} [K=160]    - Site constant (attenuation amplitude factor)
 * @param {number} [n=1.6]    - Site exponent (attenuation decay factor)
 * @returns {{ ppvMms: number, scaledDistance: number }} PPV [mm/s] and scaled distance [m/kg^0.5]
 */
export function computePPV(
    distance: number,
    charge: number,
    K = 160,
    n = 1.6,
): { ppvMms: number; scaledDistance: number } {
    if (typeof distance !== 'number' || typeof charge !== 'number') {
        throw new TypeError('distance and charge must be numbers');
    }
    if (distance <= 0) throw new RangeError('distance must be > 0');
    if (charge <= 0) throw new RangeError('charge must be > 0');
    if (K <= 0) throw new RangeError('K must be > 0');
    if (n <= 0) throw new RangeError('n must be > 0');

    // Distância escalada (scaled distance) Ds = R / sqrt(Q)  [m / kg^0.5]
    const scaledDistance = distance / Math.sqrt(charge);

    // PPV = K * Ds^(-n)  [mm/s]
    const ppvMms = K * Math.pow(scaledDistance, -n);

    return { ppvMms, scaledDistance };
}

/**
 * Estimates dominant frequency of blast-induced vibration from empirical relationships.
 * Estima a frequência dominante da vibração de detonação por relação empírica.
 *
 * Based on empirical correlations from ISRM (2010) and Dowding (1985):
 * f ≈ A * (Ds)^B  where Ds = scaled distance
 * Typical: A = 160, B = -0.8 for surface mining.
 *
 * @param {number} scaledDistance - Scaled distance [m/kg^0.5]
 * @param {number} [A=160]        - Empirical frequency constant
 * @param {number} [B=-0.8]       - Empirical frequency exponent
 * @returns {number} Estimated dominant frequency [Hz]
 */
export function estimateDominantFrequency(scaledDistance: number, A = 160, B = -0.8): number {
    if (typeof scaledDistance !== 'number') throw new TypeError('scaledDistance must be a number');
    if (scaledDistance <= 0) throw new RangeError('scaledDistance must be > 0');
    if (typeof A !== 'number' || A <= 0) throw new RangeError('A must be a positive number');

    // Frequência estimada em Hz
    const freqHz = A * Math.pow(scaledDistance, B);
    return Math.max(1, freqHz); // frequência mínima de 1 Hz por convenção de campo
}

/**
 * Checks compliance of measured or predicted PPV against regulatory limits.
 * Verifica conformidade da VPP/PPV com limites regulatórios (ABNT NBR 9653 / DIN 4150-3).
 *
 * @param {number} ppvMms         - Measured or predicted PPV [mm/s]
 * @param {string} standard       - Regulatory standard key (see PPV_LIMITS)
 * @param {number} [frequency=10] - Dominant frequency [Hz] (used for DIN frequency-dependent limits)
 * @returns {{ compliant: boolean, ppvMms: number, limit: number, standard: string, margin: number }}
 */
export function checkPPVCompliance(
    ppvMms: number,
    standard: string,
    frequency = 10,
): { compliant: boolean; ppvMms: number; limit: number; standard: string; margin: number } {
    if (typeof ppvMms !== 'number') throw new TypeError('ppvMms must be a number');
    if (ppvMms < 0) throw new RangeError('ppvMms must be >= 0');
    if (typeof standard !== 'string') throw new TypeError('standard must be a string');

    let limit = PPV_LIMITS[standard];
    if (limit === undefined) {
        throw new RangeError(`Unknown standard '${standard}'. Valid: ${Object.keys(PPV_LIMITS).join(', ')}`);
    }

    // DIN 4150-3: limite varia com frequência para classes residencial e sensível
    if (standard === 'din_class2') {
        if (frequency < 10) limit = 5;
        else if (frequency < 50) limit = 15;
        else limit = 20;
    }
    if (standard === 'din_class3') {
        if (frequency < 10) limit = 3;
        else if (frequency < 50) limit = 8;
        else limit = 10;
    }

    const compliant = ppvMms <= limit;
    // Margem positiva = espaço restante até o limite; negativa = excedência
    const margin = limit - ppvMms;

    return { compliant, ppvMms, limit, standard, margin };
}

/**
 * Estimates the radius of influence zone for a blast event at a given PPV threshold.
 * Estima o raio de zona de influência para um evento de detonação dado o limite de PPV.
 *
 * Inverts the Ambraseys-Hendron equation: R = sqrt(Q) * (PPV_lim / K)^(-1/n)
 *
 * @param {number} charge       - Maximum instantaneous charge [kg]
 * @param {number} ppvLimit     - PPV threshold [mm/s] (typically a regulatory limit)
 * @param {number} [K=160]      - Site constant
 * @param {number} [n=1.6]      - Site exponent
 * @returns {{ influenceRadiusM: number, scaledDistanceLimit: number }}
 */
export function blastInfluenceRadius(
    charge: number,
    ppvLimit: number,
    K = 160,
    n = 1.6,
): { influenceRadiusM: number; scaledDistanceLimit: number } {
    if (typeof charge !== 'number' || typeof ppvLimit !== 'number') {
        throw new TypeError('charge and ppvLimit must be numbers');
    }
    if (charge <= 0) throw new RangeError('charge must be > 0');
    if (ppvLimit <= 0) throw new RangeError('ppvLimit must be > 0');
    if (K <= 0) throw new RangeError('K must be > 0');
    if (n <= 0) throw new RangeError('n must be > 0');

    // Distância escalada no limite: Ds_lim = (K / ppvLimit)^(1/n)
    const scaledDistanceLimit = Math.pow(K / ppvLimit, 1 / n);

    // Raio real: R = Ds_lim * sqrt(Q)
    const influenceRadiusM = scaledDistanceLimit * Math.sqrt(charge);

    return { influenceRadiusM, scaledDistanceLimit };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineBlastingVibrationMeta: AnalyticsModuleMeta = {
    name: 'mineBlastingVibration',
    description: 'mineBlastingVibration',
    category: 'analytics',
    familyTags: ['mining', 'blasting'],
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
