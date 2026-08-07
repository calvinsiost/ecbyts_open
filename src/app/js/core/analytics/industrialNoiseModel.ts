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
 * Industrial Noise Model -- Propagation, Attenuation, and Exposure Assessment
 * Modelagem de ruido industrial: propagacao, atenuacao e avaliacao de exposicao.
 *
 * References:
 * [1] Maekawa, Z. (1968). Noise reduction by screens. Applied Acoustics 1(3):157-173.
 *     doi:10.1016/0003-682X(68)90020-5
 * [2] NIOSH (1998). Criteria for a Recommended Standard -- Occupational Noise Exposure.
 *     DHHS Publication No. 98-126.
 * [3] ISO 9613-2:1996. Acoustics -- Attenuation of sound during propagation outdoors.
 * [4] ABNT NBR 10151:2019. Acustica -- Medicao e avaliacao de niveis de pressao sonora.
 */

'use strict';

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

// Speed of sound in air at 20 C (m/s) -- ISO 9613-2:1996
const SPEED_OF_SOUND_M_S = 343;

// NIOSH (1998): 85 dB(A) reference level for 8h permissible exposure
const NIOSH_REF_LEVEL_DB = 85;
const NIOSH_REF_HOURS = 8;
const NIOSH_EXCHANGE_RATE_DB = 3; // 3-dB exchange rate (halving rate)

/**
 * Computes the Sound Pressure Level (SPL) at distance r from a point source.
 * Calcula o Nivel de Pressao Sonora (NPS) a distancia r de uma fonte pontual.
 *
 * SPL = PWL + 10 * log10(Q / (4 * pi * r^2))
 * Q: 1 (free field), 2 (floor/hemispherical), 4 (edge/corner).
 *
 * @param {number} power_dB - Sound power level (dB re 1 pW). / Nivel de potencia sonora.
 * @param {number} distance_m - Distance from source to receiver (m). / Distancia fonte-receptor.
 * @param {number} directivity_factor - Q: 1, 2, or 4. / Fator de diretividade.
 * @returns {{ spl_dB: number }}
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If distance_m <= 0 or directivity_factor not in {1,2,4}.
 * @reference ISO 9613-2:1996 Sec 8.1; Maekawa (1968) Applied Acoustics 1(3):157
 */
export function computeSoundPressureLevel(
    power_dB: number,
    distance_m: number,
    directivity_factor: number,
): { spl_dB: number } {
    if (typeof power_dB !== 'number' || !Number.isFinite(power_dB))
        throw new TypeError('power_dB must be a finite number');
    if (typeof distance_m !== 'number' || !Number.isFinite(distance_m))
        throw new TypeError('distance_m must be a finite number');
    if (typeof directivity_factor !== 'number' || !Number.isFinite(directivity_factor))
        throw new TypeError('directivity_factor must be a finite number');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');
    if (![1, 2, 4].includes(directivity_factor))
        throw new RangeError('directivity_factor must be 1 (free field), 2 (floor), or 4 (corner)');
    // SPL = PWL + 10*log10(Q/(4*pi*r^2))
    const spl_dB = power_dB + 10 * Math.log10(directivity_factor / (4 * Math.PI * distance_m * distance_m));
    return { spl_dB };
}

/**
 * Computes SPL at a new distance r2 given SPL at reference distance r1.
 * Calcula NPS a distancia r2 dado NPS na distancia de referencia r1.
 *
 * Inverse square law: delta_L = 20 * log10(r1 / r2).
 * A cada dobramento de distancia, atenuacao de ~6 dB.
 *
 * @param {number} spl_source_dB - SPL at reference distance r1 (dB). / NPS na distancia r1.
 * @param {number} r1_m - Reference distance (m). / Distancia de referencia.
 * @param {number} r2_m - Target distance (m). / Distancia alvo.
 * @returns {{ spl_r2_dB: number, attenuation_dB: number }}
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If r1_m <= 0 or r2_m <= 0.
 * @reference ISO 9613-2:1996 Sec 8.2; ABNT NBR 10151:2019
 */
export function computeDistanceAttenuation(
    spl_source_dB: number,
    r1_m: number,
    r2_m: number,
): { spl_r2_dB: number; attenuation_dB: number } {
    if (typeof spl_source_dB !== 'number' || !Number.isFinite(spl_source_dB))
        throw new TypeError('spl_source_dB must be a finite number');
    if (typeof r1_m !== 'number' || !Number.isFinite(r1_m)) throw new TypeError('r1_m must be a finite number');
    if (typeof r2_m !== 'number' || !Number.isFinite(r2_m)) throw new TypeError('r2_m must be a finite number');
    if (r1_m <= 0) throw new RangeError('r1_m must be > 0');
    if (r2_m <= 0) throw new RangeError('r2_m must be > 0');
    const attenuation_dB = 20 * Math.log10(r1_m / r2_m);
    return { spl_r2_dB: spl_source_dB + attenuation_dB, attenuation_dB };
}

/**
 * Estimates sound barrier insertion loss using the Maekawa (1968) formula.
 * Estima a perda por insercao de barreira acustica pela formula de Maekawa (1968).
 *
 * IL = 10 * log10(3 + 20 * N), N = 2 * delta / lambda, lambda = c / f.
 * IL minimo = 0 dB (barreira nao amplifica som).
 *
 * @param {number} frequency_hz - Octave-band center frequency (Hz). / Frequencia central.
 * @param {number} path_difference_m - Acoustic path difference delta (m). / Diferenca de caminho acustico.
 * @returns {{ attenuation_dB: number }}
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If frequency_hz <= 0.
 * @reference Maekawa, Z. (1968). Applied Acoustics 1(3):157-173. doi:10.1016/0003-682X(68)90020-5
 */
export function computeBarrierAttenuation(
    frequency_hz: number,
    path_difference_m: number,
): { attenuation_dB: number } {
    if (typeof frequency_hz !== 'number' || !Number.isFinite(frequency_hz))
        throw new TypeError('frequency_hz must be a finite number');
    if (typeof path_difference_m !== 'number' || !Number.isFinite(path_difference_m))
        throw new TypeError('path_difference_m must be a finite number');
    if (frequency_hz <= 0) throw new RangeError('frequency_hz must be > 0');
    const lambda = SPEED_OF_SOUND_M_S / frequency_hz;
    const N = (2 * path_difference_m) / lambda;
    const il = 10 * Math.log10(3 + 20 * N);
    return { attenuation_dB: Math.max(0, il) };
}

/**
 * Assesses occupational noise exposure dose according to NIOSH (1998) criteria.
 * Avalia a dose de exposicao ao ruido ocupacional conforme NIOSH (1998).
 *
 * Permissible exposure time: Tc = T_ref * 2^((L_ref - L) / ER)
 * T_ref = 8 h at 85 dB(A), ER = 3 dB (NIOSH exchange rate).
 * Dose = (T / Tc) * 100%.
 * safe < 50% | caution [50%, 100%) | hazardous >= 100%.
 *
 * @param {number} leq_dB - Equivalent continuous noise level dB(A). / Nivel equivalente continuo.
 * @param {number} exposure_hours - Duration of exposure (hours, 0 < h <= 24). / Duracao.
 * @returns {{ dose_pct: number, criterion: 'safe'|'caution'|'hazardous' }}
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If leq_dB < 0, exposure_hours <= 0, or exposure_hours > 24.
 * @reference NIOSH (1998). DHHS Publication No. 98-126. Section 3.1.
 */
export function assessNoiseExposure(
    leq_dB: number,
    exposure_hours: number,
): { dose_pct: number; criterion: 'safe' | 'caution' | 'hazardous' } {
    if (typeof leq_dB !== 'number' || !Number.isFinite(leq_dB)) throw new TypeError('leq_dB must be a finite number');
    if (typeof exposure_hours !== 'number' || !Number.isFinite(exposure_hours))
        throw new TypeError('exposure_hours must be a finite number');
    if (leq_dB < 0) throw new RangeError('leq_dB must be >= 0');
    if (exposure_hours <= 0) throw new RangeError('exposure_hours must be > 0');
    if (exposure_hours > 24) throw new RangeError('exposure_hours must be <= 24');
    // Tempo permissivel em horas neste nivel
    const Tc = NIOSH_REF_HOURS * Math.pow(2, (NIOSH_REF_LEVEL_DB - leq_dB) / NIOSH_EXCHANGE_RATE_DB);
    const dose_pct = (exposure_hours / Tc) * 100;
    const criterion = dose_pct >= 100 ? 'hazardous' : dose_pct >= 50 ? 'caution' : 'safe';
    return { dose_pct, criterion };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialNoiseModelMeta: AnalyticsModuleMeta = {
    name: 'industrialNoiseModel',
    description: 'industrialNoiseModel',
    category: 'analytics',
    familyTags: ['industrial', 'noise'],
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
