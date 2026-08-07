// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// occupationalNoiseDosimetry.js - Occupational Noise Dosimetry
// Dosimetria de ruído ocupacional: dose diária, ponderação A e critérios NR-15/ISO 1999.
// Refs: IEC 61672-1:2013; ISO 1999:2013 Acoustics - Estimation of noise-induced hearing loss;
//       MTE NR-15 Anexo 1 (BR); ACGIH (2024) TLV Noise; NIOSH (1998) Occupational Noise Exposure

'use strict';

/**
 * Compute the A-weighting correction (dB) for a given frequency.
 * Calcula a ponderação A em dB para uma frequência, conforme IEC 61672-1:2013.
 *
 * @param {number} frequency_hz - Frequency in Hz (must be > 0).
 * @returns {{ weight_dB: number }}
 * @throws {RangeError} If frequency_hz <= 0.
 */
export function computeAWeighting(frequency_hz: any) {
    if (typeof frequency_hz !== 'number' || frequency_hz <= 0) {
        throw new RangeError(`frequency_hz must be positive; got ${frequency_hz}`);
    }
    const f = frequency_hz;
    const f2 = f * f;
    // IEC 61672-1 Equação A: RA²(f) = (12194² × f⁴) / denominator
    const num = 12194 ** 2 * f2 ** 2;
    const d1 = f2 + 20.6 ** 2;
    const d2 = Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2));
    const d3 = f2 + 12194 ** 2;
    const RA2 = num / (d1 * d2 * d3);
    // A(f) = 20 log10(RA2) + 2.0 (normalização para 1kHz ≈ 0 dB)
    const weight_dB = 20 * Math.log10(RA2) + 2.0;
    return { weight_dB };
}

/**
 * Compute daily noise dose and equivalent level per NR-15 / ISO 1999.
 * Calcula dose diária de ruído e Leq conforme NR-15 Anexo 1.
 *
 * @param {Array<{level_dBA: number, duration_h: number}>} measurements - Array of noise exposures.
 * @returns {{ dose_pct: number, leq_dB: number, exceeded: boolean }}
 * @throws {TypeError} If measurements is not an array or entries are malformed.
 * @throws {RangeError} If any level < 80 or duration < 0, or array is empty.
 */
export function computeDailyNoiseDose(measurements: any) {
    if (!Array.isArray(measurements)) throw new TypeError('measurements must be an array');
    if (measurements.length === 0) throw new RangeError('measurements must not be empty');

    let dose_sum = 0;
    let energy_sum = 0;
    let total_duration = 0;

    for (const m of measurements) {
        if (typeof m.level_dBA !== 'number') throw new TypeError('level_dBA must be a number');
        if (typeof m.duration_h !== 'number' || m.duration_h < 0) {
            throw new RangeError(`duration_h must be non-negative; got ${m.duration_h}`);
        }
        // NR-15 Tabela 1: Tc(L) = 8 / 2^((L-85)/5) para L >= 85 dB(A)
        // Para L < 85, o limite prático é 8h (sem critério de dano conforme NR-15 básica)
        const Tc = m.level_dBA >= 80 ? 8 / Math.pow(2, (m.level_dBA - 85) / 5) : Infinity; // nível abaixo de 80 dBA: dose desprezível
        if (isFinite(Tc)) dose_sum += m.duration_h / Tc;
        // Acúmulo de energia para Leq
        energy_sum += m.duration_h * Math.pow(10, m.level_dBA / 10);
        total_duration += m.duration_h;
    }

    const dose_pct = dose_sum * 100;
    const leq_dB = total_duration > 0 ? 10 * Math.log10(energy_sum / total_duration) : 0;
    const exceeded = dose_pct >= 100;

    return { dose_pct, leq_dB, exceeded };
}

/**
 * Compute the equivalent continuous sound level (Leq) from discrete measurements.
 * Calcula o nível de pressão sonora equivalente contínuo (Leq).
 *
 * @param {number[]} sound_levels_dBA - Array of sound levels in dB(A).
 * @param {number[]} durations_h - Array of exposure durations in hours (same length).
 * @returns {{ leq_dBA: number }}
 * @throws {RangeError} If arrays have different lengths or are empty.
 */
export function computeLeq(sound_levels_dBA: any, durations_h: any) {
    if (!Array.isArray(sound_levels_dBA) || !Array.isArray(durations_h)) {
        throw new TypeError('sound_levels_dBA and durations_h must be arrays');
    }
    if (sound_levels_dBA.length === 0 || durations_h.length === 0) {
        throw new RangeError('Arrays must not be empty');
    }
    if (sound_levels_dBA.length !== durations_h.length) {
        throw new RangeError(
            `Array length mismatch: sound_levels_dBA(${sound_levels_dBA.length}) vs durations_h(${durations_h.length})`,
        );
    }
    for (const d of durations_h) {
        if (typeof d !== 'number' || d < 0) throw new RangeError(`durations_h entries must be non-negative; got ${d}`);
    }

    // Leq = 10 log10 (Σ Ti × 10^(Li/10) / Σ Ti) - média energética ponderada pelo tempo
    const total_T = durations_h.reduce((s, t) => s + t, 0);
    if (total_T === 0) throw new RangeError('Sum of durations must be positive');
    const energy = sound_levels_dBA.reduce((s, L, i) => s + durations_h[i] * Math.pow(10, L / 10), 0);
    const leq_dBA = 10 * Math.log10(energy / total_T);
    return { leq_dBA };
}

/**
 * Classify occupational noise exposure risk and estimate NIPTS probability.
 * Classifica o risco de exposição e estima probabilidade de PAIR (NIPTS) conforme ISO 1999:2013.
 *
 * @param {number} leq_dBA - Equivalent continuous sound level in dB(A).
 * @param {number} dose_pct - Daily noise dose in percent.
 * @param {number} years_of_exposure - Years of occupational exposure.
 * @returns {{ risk: string, nipts_probability_pct: number, recommendation: string }}
 * @throws {RangeError} If any input is negative.
 */
export function classifyNoiseExposureRisk(leq_dBA: any, dose_pct: any, years_of_exposure: any) {
    if (typeof leq_dBA !== 'number' || leq_dBA < 0) {
        throw new RangeError(`leq_dBA must be non-negative; got ${leq_dBA}`);
    }
    if (typeof dose_pct !== 'number' || dose_pct < 0) {
        throw new RangeError(`dose_pct must be non-negative; got ${dose_pct}`);
    }
    if (typeof years_of_exposure !== 'number' || years_of_exposure < 0) {
        throw new RangeError(`years_of_exposure must be non-negative; got ${years_of_exposure}`);
    }

    // ISO 1999:2013 - estimativa logística de probabilidade de NIPTS após exposição cumulativa
    // nipts_prob = 1 / (1 + exp(-0.1 × (years × dose_pct/100 - 20)))
    const cumulative_dose = years_of_exposure * (dose_pct / 100);
    const nipts_probability_pct = 100 / (1 + Math.exp(-0.1 * (cumulative_dose - 20)));

    let risk, recommendation;
    if (leq_dBA > 90 && years_of_exposure > 5) {
        risk = 'critical';
        recommendation =
            'Immediate engineering controls and mandatory hearing protection; audiometry every 6 months (NR-15)';
    } else if (leq_dBA > 85 || dose_pct >= 100) {
        risk = 'high';
        recommendation = 'Engineering controls required; hearing protection mandatory; annual audiometry (NR-7)';
    } else if (leq_dBA > 80 || dose_pct >= 50) {
        risk = 'moderate';
        recommendation = 'Administrative controls; hearing protection recommended; biennial audiometry';
    } else if (leq_dBA > 70) {
        risk = 'low';
        recommendation = 'Monitor exposure; hearing protection available; periodic audiometry';
    } else {
        risk = 'negligible';
        recommendation = 'No specific controls required; routine monitoring';
    }

    return { risk, nipts_probability_pct, recommendation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalNoiseDosimetryMeta = {
    name: 'occupationalNoiseDosimetry',
    description: 'occupationalNoiseDosimetry',
    category: 'analytics',
    familyTags: ['noise', 'occupational'],
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
