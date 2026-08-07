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
 * Industrial Noise Exposure Dose - OSHA 29 CFR 1910.95, NIOSH REL (1998), ISO 9612:2009.
 *
 * Referências:
 *   OSHA (1983). 29 CFR 1910.95 Occupational Noise Exposure. Fed. Reg. 48, 9776–9785.
 *   NIOSH (1998). Criteria for a Recommended Standard: Occupational Noise Exposure (DHHS 98-126).
 *     DOI:10.26616/NIOSHPUB98126
 *   ISO 9612:2009. Acoustics - Determination of occupational noise exposure.
 *   Berger, E.H. et al. (2003). The Noise Manual, 5th ed. AIHA. ISBN 978-0932627841.
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

/**
 * OSHA permissible exposure durations (hours) at given dB(A) levels.
 * Exchange rate: 5 dB doubling (OSHA); 3 dB for NIOSH REL.
 * @private
 */
const OSHA_CRITERION_LEVEL = 90; // dB(A)
const OSHA_CRITERION_DURATION = 8; // hours
const OSHA_EXCHANGE_RATE = 5; // dB

const NIOSH_CRITERION_LEVEL = 85; // dB(A)
const NIOSH_CRITERION_DURATION = 8; // hours
const NIOSH_EXCHANGE_RATE = 3; // dB

/**
 * Calculates permissible exposure duration T(L) for a given level.
 *
 * OSHA: T(L) = 8 / 2^((L-90)/5)  hours
 * NIOSH: T(L) = 8 / 2^((L-85)/3) hours
 *
 * @param level_dBA    - noise level in dB(A)
 * @param std  - standard to apply (default 'osha')
 * @returns permissible duration in hours
 */
export function calcPermissibleDuration(level_dBA: number, std: 'osha' | 'niosh' = 'osha'): number {
    if (typeof level_dBA !== 'number' || isNaN(level_dBA)) {
        throw new TypeError('calcPermissibleDuration: level_dBA must be a number');
    }
    if (level_dBA < 0 || level_dBA > 140) {
        throw new RangeError('calcPermissibleDuration: level_dBA must be in [0, 140] dB(A)');
    }

    let crit, dur, er;
    if (std === 'niosh') {
        crit = NIOSH_CRITERION_LEVEL;
        dur = NIOSH_CRITERION_DURATION;
        er = NIOSH_EXCHANGE_RATE;
    } else {
        crit = OSHA_CRITERION_LEVEL;
        dur = OSHA_CRITERION_DURATION;
        er = OSHA_EXCHANGE_RATE;
    }

    // Below 80 dB(A): no exposure limit triggered; return practical infinite
    if (level_dBA < 80) return Infinity;

    return dur / Math.pow(2, (level_dBA - crit) / er);
}

/**
 * Calculates cumulative noise dose D (%) for multiple time-level segments.
 *
 * D = Σ (Ci / Ti) × 100%
 * where Ci = actual exposure time at level Li (hours)
 *       Ti = permissible duration at Li (hours)
 *
 * OSHA action level: D ≥ 50% → monitoring required; D ≥ 100% → overexposure.
 *
 * @param segments - exposure segments
 * @param std - standard (default 'osha')
 *
 * @see OSHA 29 CFR 1910.95(d); ISO 9612:2009 §6
 */
export function calcNoiseDose(
    segments: Array<{ level_dBA: number; duration_h: number }>,
    std: 'osha' | 'niosh' = 'osha',
): {
    dose_pct: number;
    overexposed: boolean;
    action_level_triggered: boolean;
    standard: 'osha' | 'niosh';
    segments_detail: Array<{
        level_dBA: number;
        duration_h: number;
        T_permissible_h: number;
        contribution_pct: number;
    }>;
} {
    if (!Array.isArray(segments) || segments.length === 0) {
        throw new TypeError('calcNoiseDose: segments must be a non-empty array');
    }

    let doseSum = 0;
    const segments_detail = segments.map(({ level_dBA, duration_h }) => {
        if (duration_h < 0) throw new RangeError('calcNoiseDose: duration_h must be >= 0');
        const T = calcPermissibleDuration(level_dBA, std);
        const contribution = T === Infinity ? 0 : duration_h / T;
        doseSum += contribution;
        return { level_dBA, duration_h, T_permissible_h: T, contribution_pct: contribution * 100 };
    });

    const dose_pct = doseSum * 100;
    return {
        dose_pct,
        overexposed: dose_pct >= 100,
        action_level_triggered: dose_pct >= 50,
        standard: std,
        segments_detail,
    };
}

/**
 * Calculates time-weighted average noise level (TWA) from dose percentage.
 *
 * OSHA TWA formula: TWA = 16.61 × log10(D/100) + 90  dB(A)
 * NIOSH REL TWA:    TWA = 10   × log10(D/100) + 85  dB(A) (3-dB exchange)
 *
 * @param dose_pct  - noise dose percentage (0–∞)
 * @param std - standard
 * @returns TWA in dB(A)
 *
 * @see Berger et al. (2003) The Noise Manual, 5th ed., Ch. 9
 */
export function calcTWA(dose_pct: number, std: 'osha' | 'niosh' = 'osha'): number {
    if (dose_pct <= 0) throw new RangeError('calcTWA: dose_pct must be > 0');

    if (std === 'niosh') {
        return 10 * Math.log10(dose_pct / 100) + NIOSH_CRITERION_LEVEL;
    }
    // OSHA: factor = 10/log10(2) × 1/er = 10/log10(2)/5 × 10 ≈ 16.61
    const factor = (10 / (Math.log10(2) * OSHA_EXCHANGE_RATE)) * 10;
    return factor * Math.log10(dose_pct / 100) + OSHA_CRITERION_LEVEL;
}

/**
 * Classifies hearing risk based on TWA noise level.
 *
 * @param twa_dBA - time-weighted average level in dB(A)
 *
 * @see NIOSH (1998) DHHS Pub. 98-126; OSHA 29 CFR 1910.95
 */
export function classifyHearingRisk(
    twa_dBA: number,
): 'safe' | 'monitoring_required' | 'hearing_protection_required' | 'engineering_controls_required' | 'hazardous' {
    if (typeof twa_dBA !== 'number' || isNaN(twa_dBA)) {
        throw new TypeError('classifyHearingRisk: twa_dBA must be a number');
    }
    if (twa_dBA < 70) return 'safe';
    if (twa_dBA < 80) return 'monitoring_required';
    if (twa_dBA < 85) return 'hearing_protection_required';
    if (twa_dBA < 100) return 'engineering_controls_required';
    return 'hazardous';
}

/**
 * Calculates equivalent continuous sound level Leq from instantaneous readings.
 *
 * Leq = 10 × log10( (1/N) × Σ 10^(Li/10) )
 *
 * @param levels_dBA - array of instantaneous dB(A) readings
 * @returns Leq in dB(A)
 *
 * @see ISO 9612:2009 §4
 */
export function calcLeq(levels_dBA: number[]): number {
    if (!Array.isArray(levels_dBA) || levels_dBA.length === 0) {
        throw new TypeError('calcLeq: levels_dBA must be a non-empty array');
    }
    const sum = levels_dBA.reduce((acc, L) => acc + Math.pow(10, L / 10), 0);
    return 10 * Math.log10(sum / levels_dBA.length);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialNoiseExposureDoseMeta: AnalyticsModuleMeta = {
    name: 'industrialNoiseExposureDose',
    description: 'industrialNoiseExposureDose',
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
