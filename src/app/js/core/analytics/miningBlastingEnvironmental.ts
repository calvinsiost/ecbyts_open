// @ts-check
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
// Application: EHS & Mining - Blasting Environmental Impacts
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mining Blasting Environmental Impact Assessment
 *
 * Módulo puro de avaliação dos impactos ambientais de detonações em mineração:
 * vibração de terreno, sobrepressão de ar (air blast) e projeção de fragmentos.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Nicholls, H. R., Johnson, C. F. & Duvall, W. I. (1971). Blasting
 *     Vibrations and Their Effects on Structures. USBM Bulletin 656.
 *     Washington, DC: US Bureau of Mines. (Scaled Distance Law)
 *   - Siskind, D. E., Stagg, M. S., Kopp, J. W. & Dowding, C. H. (1980).
 *     Structure Response and Damage Produced by Ground Vibration from
 *     Surface Mine Blasting. USBM RI-8507. Washington, DC: US Bureau of Mines.
 *     (PPV prediction; air overpressure formula)
 *   - Kopp, J. W. & Siskind, D. E. (1986). Effects of Millisecond-Delay
 *     Intervals on Vibration and Airblast from Surface Coal Mine Blasting.
 *     USBM RI-9026. Washington, DC: US Bureau of Mines.
 *   - ABNT NBR 9653:2018. Guia para avaliação dos efeitos provocados pelo uso
 *     de explosivos nas minerações em áreas urbanas. Rio de Janeiro: ABNT.
 *     (limites nacionais de vibração para estruturas civis)
 *   - ISEE (2011). Blaster's Handbook. 18th ed. Cleveland: ISEE.
 *     (PPV compliance thresholds: 50 mm/s structures, 25 mm/s sensitive)
 *   - Langefors, U. & Kihlström, B. (1978). The Modern Technique of Rock
 *     Blasting. 3rd ed. New York: Wiley. (flyrock empirical formula)
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * ISEE vibration compliance standards (PPV in mm/s)
 * Padrões ISEE de vibração para estruturas e receptores sensíveis
 */
const ISEE_VIBRATION_LIMITS = {
    structures: 50, // edificações residenciais/comerciais (mm/s)
    sensitive: 25, // receptores sensíveis (hospitais, museus) (mm/s)
    critical_equipment: 10, // equipamentos de precisão (mm/s)
};

/**
 * ABNT NBR 9653:2018 vibration limits by frequency range (mm/s)
 * Limites da norma brasileira para diferentes frequências de vibração
 */
const ABNT_NBR9653_LIMITS = {
    residential_low_freq: 15, // < 4 Hz, residencial
    residential_high_freq: 40, // ≥ 4 Hz, residencial
    commercial: 50, // comercial/industrial
};

/**
 * Safety multiplier for flyrock exclusion zone (Langefors & Kihlström, 1978)
 * Fator de segurança para zona de exclusão de fragmentos
 */
const FLYROCK_SAFETY_FACTOR = 1.5;

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Compute air blast overpressure and sound level from blasting.
 *
 * Calcula a sobrepressão acústica (air blast) usando a fórmula USBM RI-8507:
 *   L_dB = 160 - 14.9 × log10(D / W^(1/3))
 * onde D = distância (m), W = carga máxima por retardo (kg).
 *
 * @param {number} charge_kg  - Maximum instantaneous charge per delay (kg)
 * @param {number} distance_m - Distance from blast to receptor (m)
 * @returns {{ overpressure_Pa: number, dB: number }}
 */
export function computeAirBlast(charge_kg: any, distance_m: any) {
    if (typeof charge_kg !== 'number' || charge_kg <= 0) {
        throw new RangeError('charge_kg must be positive');
    }
    if (typeof distance_m !== 'number' || distance_m <= 0) {
        throw new RangeError('distance_m must be positive');
    }

    // Distância escalada: SD = D / W^(1/3) - escaled distance (m/kg^(1/3))
    const scaledDistance = distance_m / Math.pow(charge_kg, 1 / 3);

    // Nível de pressão sonora (dB) - USBM RI-8507 equação empírica
    const dB = 160 - 14.9 * Math.log10(scaledDistance);

    // Conversão dB → Pa: P = P_ref × 10^(L/20), P_ref = 20 µPa
    const P_REF_PA = 20e-6; // 20 micropascal — limiar auditivo de referência
    const overpressure_Pa = P_REF_PA * Math.pow(10, dB / 20);

    return { overpressure_Pa, dB };
}

/**
 * Compute Peak Particle Velocity (PPV) from blasting ground vibration.
 *
 * Aplica a Scaled Distance Law (USBM RI-8507 / Nicholls et al., 1971):
 *   PPV = k × (D / W^(1/3))^(-alpha)
 * Valores padrão: k = 160, alpha = 1.6 (rocha dura; calibrar localmente).
 *
 * @param {number} charge_kg  - Maximum instantaneous charge per delay (kg)
 * @param {number} distance_m - Distance from blast to receptor (m)
 * @param {number} [k=160]    - Site-specific vibration coefficient
 * @param {number} [alpha=1.6]- Site-specific attenuation exponent
 * @returns {{ ppv_mm_s: number, scaledDistance: number }}
 */
export function computeGroundVibration(charge_kg: any, distance_m: any, k = 160, alpha = 1.6) {
    if (typeof charge_kg !== 'number' || charge_kg <= 0) {
        throw new RangeError('charge_kg must be positive');
    }
    if (typeof distance_m !== 'number' || distance_m <= 0) {
        throw new RangeError('distance_m must be positive');
    }
    if (typeof k !== 'number' || k <= 0) {
        throw new RangeError('k must be positive');
    }
    if (typeof alpha !== 'number' || alpha <= 0) {
        throw new RangeError('alpha must be positive');
    }

    // Distância escalada (m/kg^(1/3))
    const scaledDistance = distance_m / Math.pow(charge_kg, 1 / 3);

    // PPV em mm/s
    const ppv_mm_s = k * Math.pow(scaledDistance, -alpha);

    return { ppv_mm_s, scaledDistance };
}

/**
 * Check vibration compliance against ISEE or ABNT NBR 9653 standard.
 *
 * Verifica se o PPV está dentro dos limites normativos.
 * Suporta padrões: 'ISEE_structures', 'ISEE_sensitive', 'ABNT_residential',
 * 'ABNT_commercial'.
 *
 * @param {number} ppv      - Peak particle velocity (mm/s)
 * @param {string} standard - Standard key to evaluate against
 * @returns {{ compliant: boolean, limit: number, standard: string }}
 */
export function checkVibrationCompliance(ppv: any, standard: any) {
    if (typeof ppv !== 'number' || ppv < 0) {
        throw new RangeError('ppv must be non-negative (mm/s)');
    }
    if (typeof standard !== 'string') {
        throw new TypeError('standard must be a string');
    }

    /** @type {Record<string, number>} */
    const LIMITS = {
        ISEE_structures: ISEE_VIBRATION_LIMITS.structures,
        ISEE_sensitive: ISEE_VIBRATION_LIMITS.sensitive,
        ISEE_critical: ISEE_VIBRATION_LIMITS.critical_equipment,
        ABNT_residential: ABNT_NBR9653_LIMITS.residential_high_freq,
        ABNT_commercial: ABNT_NBR9653_LIMITS.commercial,
    };

const limit = (LIMITS as Record<string, number>)[standard];
    if (limit === undefined) {
        throw new RangeError(`Unknown standard '${standard}'. Valid: ${Object.keys(LIMITS).join(', ')}`);
    }

    return { compliant: ppv <= limit, limit, standard };
}

/**
 * Estimate maximum flyrock throw distance and safety exclusion radius.
 *
 * Usa fórmula empírica de Langefors & Kihlström (1978) para estimar o alcance
 * máximo de fragmentos projetados durante uma detonação:
 *   maxRange = 260 × (burden / stemming) × sqrt(charge)
 * A zona de segurança aplica um fator de segurança adicional de 1.5×.
 *
 * @param {number} charge_kg  - Total charge mass (kg)
 * @param {number} burden_m   - Burden distance (m) - distância ao talude livre
 * @param {number} stemming_m - Stemming length (m) - comprimento do tampão
 * @returns {{ maxRange_m: number, safetyRadius_m: number }}
 */
export function estimateFlyrock(charge_kg: any, burden_m: any, stemming_m: any) {
    if (typeof charge_kg !== 'number' || charge_kg <= 0) {
        throw new RangeError('charge_kg must be positive');
    }
    if (typeof burden_m !== 'number' || burden_m <= 0) {
        throw new RangeError('burden_m must be positive');
    }
    if (typeof stemming_m !== 'number' || stemming_m <= 0) {
        throw new RangeError('stemming_m must be positive');
    }

    // Alcance máximo (m) - Langefors & Kihlström (1978)
    const maxRange_m = 260 * (burden_m / stemming_m) * Math.sqrt(charge_kg);
    const safetyRadius_m = maxRange_m * FLYROCK_SAFETY_FACTOR;

    return { maxRange_m, safetyRadius_m };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningBlastingEnvironmentalMeta = {
    name: 'miningBlastingEnvironmental',
    description: 'Blasting Environmental Impacts',
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
