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
 * Industrial Vibration Fatigue
 * S-N curve (Wöhler) and Palmgren-Miner cumulative damage rule for
 * fatigue life estimation of industrial components under cyclic loading.
 *
 * References:
 *   Wöhler, A. (1870). Über die Festigkeitsversuche mit Eisen und Stahl.
 *     Zeitschrift für Bauwesen, 20, 73-106.
 *   Palmgren, A. (1924). Die Lebensdauer von Kugellagern.
 *     VDI-Zeitschrift, 68(14), 339-341.
 *   Miner, M.A. (1945). Cumulative damage in fatigue.
 *     Journal of Applied Mechanics, 12(3), A159-A164.
 *     DOI: 10.1115/1.4009458
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
 * Calculates the number of cycles to failure using the S-N (Wöhler) curve.
 * N = (stress / Sf)^(1 / b)
 *
 * where:
 *   stress = applied stress amplitude (MPa)
 *   Sf     = fatigue strength coefficient (MPa) - material-specific intercept at N=1
 *   b      = fatigue strength exponent (negative; typically -0.05 to -0.12 for metals)
 *
 * @param {number} stress_MPa - Applied cyclic stress amplitude (MPa), must be > 0
 * @param {number} Sf         - Fatigue strength coefficient (MPa), must be > 0
 * @param {number} b          - Fatigue strength exponent (dimensionless, typically < 0)
 * @returns {number} Number of cycles to failure N
 *
 * Reference: Miner (1945), eq. 1; Wöhler (1870) original empirical basis.
 */
export function calcCyclesToFailure(stress_MPa: number, Sf: number, b: number): number {
    if (typeof stress_MPa !== 'number' || typeof Sf !== 'number' || typeof b !== 'number') {
        throw new TypeError('calcCyclesToFailure: all arguments must be numbers');
    }
    if (stress_MPa <= 0) {
        throw new RangeError('calcCyclesToFailure: stress_MPa must be > 0');
    }
    if (Sf <= 0) {
        throw new RangeError('calcCyclesToFailure: Sf must be > 0');
    }
    if (b === 0) {
        throw new RangeError('calcCyclesToFailure: b must be non-zero');
    }
    return Math.pow(stress_MPa / Sf, 1 / b);
}

/**
 * Calculates the Palmgren-Miner cumulative damage index.
 * D = Σ (ni / Ni)  where Ni = calcCyclesToFailure(stressLevels[i], Sf, b)
 *
 * D >= 1.0 indicates expected failure.
 *
 * @param {number[]} cycles       - Array of applied cycle counts ni at each stress level
 * @param {number[]} stressLevels - Array of stress amplitudes (MPa) corresponding to cycles
 * @param {number}   Sf           - Fatigue strength coefficient (MPa)
 * @param {number}   b            - Fatigue strength exponent
 * @returns {number} Cumulative damage D (dimensionless)
 *
 * Reference: Palmgren (1924); Miner (1945) J. Applied Mechanics.
 */
export function calcMinerDamage(cycles: number[], stressLevels: number[], Sf: number, b: number): number {
    if (!Array.isArray(cycles) || !Array.isArray(stressLevels)) {
        throw new TypeError('calcMinerDamage: cycles and stressLevels must be arrays');
    }
    if (cycles.length !== stressLevels.length) {
        throw new RangeError('calcMinerDamage: cycles and stressLevels must have the same length');
    }
    if (cycles.length === 0) return 0;

    let D = 0;
    for (let i = 0; i < cycles.length; i++) {
        const ni = cycles[i]!;
        const si = stressLevels[i]!;
        if (typeof ni !== 'number' || ni < 0) {
            throw new RangeError(`calcMinerDamage: cycles[${i}] must be a non-negative number`);
        }
        const Ni = calcCyclesToFailure(si, Sf, b);
        D += ni / Ni;
    }
    return D;
}

/**
 * Estimates the fatigue life in days given an operating stress and daily cycle rate.
 * Life (days) = N_failure / cyclesPerDay
 *
 * @param {number} operatingStress_MPa - Constant operating stress amplitude (MPa)
 * @param {number} Sf                  - Fatigue strength coefficient (MPa)
 * @param {number} b                   - Fatigue strength exponent
 * @param {number} cyclesPerDay        - Number of load cycles per day (must be > 0)
 * @returns {number} Estimated fatigue life in days
 *
 * Reference: derived from Wöhler (1870) S-N curve.
 */
export function calcFatigueLife(
    operatingStress_MPa: number,
    Sf: number,
    b: number,
    cyclesPerDay: number,
): number {
    if (typeof cyclesPerDay !== 'number' || cyclesPerDay <= 0) {
        throw new RangeError('calcFatigueLife: cyclesPerDay must be > 0');
    }
    const N = calcCyclesToFailure(operatingStress_MPa, Sf, b);
    return N / cyclesPerDay;
}

/**
 * Classifies the fatigue risk level based on the Miner damage index.
 *
 * Risk classification:
 *   D < 0.5  → 'safe'     (below half the expected damage accumulation)
 *   0.5–1.0  → 'warning'  (approaching failure; schedule inspection)
 *   D >= 1.0 → 'critical' (failure predicted; immediate action required)
 *
 * @param {number} damage - Miner cumulative damage index D
 * @returns {'safe'|'warning'|'critical'} Risk level
 */
export function classifyFatigueRisk(damage: number): 'safe' | 'warning' | 'critical' {
    if (typeof damage !== 'number') {
        throw new TypeError('classifyFatigueRisk: damage must be a number');
    }
    if (damage < 0) {
        throw new RangeError('classifyFatigueRisk: damage must be non-negative');
    }
    if (damage < 0.5) return 'safe';
    if (damage < 1.0) return 'warning';
    return 'critical';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialVibrationFatigueMeta: AnalyticsModuleMeta = {
    name: 'industrialVibrationFatigue',
    description: 'industrialVibrationFatigue',
    category: 'analytics',
    familyTags: ['industrial'],
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
