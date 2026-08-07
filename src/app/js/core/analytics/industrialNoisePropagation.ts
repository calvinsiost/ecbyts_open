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
 * @module industrialNoisePropagation
 * @description Industrial vibration transmissibility - ISO 10816 + classical damped single-DOF theory.
 * Computes transmissibility, natural frequency, isolation efficiency, and vibration severity
 * classification for rotating machinery and vibration-sensitive industrial installations.
 *
 * Academic references:
 * - ISO 10816-1:1995 Mechanical vibration - Evaluation of machine vibration by measurements
 *   on non-rotating parts - Part 1: General guidelines
 * - Den Hartog, J.P. (1956). Mechanical Vibrations, 4th ed. McGraw-Hill / Dover.
 *   ISBN: 9780486647852
 * - Thomson, W.T. & Dahleh, M.D. (1998). Theory of Vibration with Applications, 5th ed. Prentice Hall.
 *   ISBN: 9780139484667
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

type SeverityLabel = 'good' | 'satisfactory' | 'unsatisfactory' | 'unacceptable';

/**
 * ISO 10816-1:1995 vibration severity zones (Table 1 - velocity rms mm/s).
 * Machine classes (I = small machines <15 kW, II = medium 15-75 kW,
 * III = large rigid-mounted, IV = large flexibly-mounted turbo-generators).
 */
const SEVERITY_ZONES: Record<string, Array<{ max: number; label: SeverityLabel }>> = {
    I: [
        { max: 0.71, label: 'good' },
        { max: 1.8, label: 'satisfactory' },
        { max: 4.5, label: 'unsatisfactory' },
        { max: Infinity, label: 'unacceptable' },
    ],
    II: [
        { max: 1.12, label: 'good' },
        { max: 2.8, label: 'satisfactory' },
        { max: 7.1, label: 'unsatisfactory' },
        { max: Infinity, label: 'unacceptable' },
    ],
    III: [
        { max: 1.8, label: 'good' },
        { max: 4.5, label: 'satisfactory' },
        { max: 11.2, label: 'unsatisfactory' },
        { max: Infinity, label: 'unacceptable' },
    ],
    IV: [
        { max: 2.8, label: 'good' },
        { max: 7.1, label: 'satisfactory' },
        { max: 18.0, label: 'unsatisfactory' },
        { max: Infinity, label: 'unacceptable' },
    ],
};

/**
 * Calculates the force transmissibility for a viscously-damped single-degree-of-freedom (SDOF) system.
 * Classic formula (Den Hartog 1956 eq. 3.3.6):
 *
 *   TR = sqrt[ (1 + (2ζr)²) / ((1 - r²)² + (2ζr)²) ]
 *
 * where r = ω / ωn (frequency ratio), ζ = damping ratio.
 *
 * @param omega_rad_s   - Excitation angular frequency (rad/s), must be > 0
 * @param omega_n_rad_s - Natural angular frequency (rad/s), must be > 0
 * @param damping       - Damping ratio ζ (0 = undamped … 1 = critically damped)
 * @returns
 * @throws {RangeError} if any parameter is outside its valid range
 * @throws {TypeError} if any parameter is not a finite number
 *
 * Reference: Den Hartog (1956) §3.3; Thomson & Dahleh (1998) Chapter 3
 */
export function calcTransmissibility(
    omega_rad_s: number,
    omega_n_rad_s: number,
    damping: number,
): { TR: number; frequencyRatio: number; omega_rad_s: number; omega_n_rad_s: number; damping: number } {
    if (!Number.isFinite(omega_rad_s) || !Number.isFinite(omega_n_rad_s) || !Number.isFinite(damping)) {
        throw new TypeError('calcTransmissibility: all parameters must be finite numbers');
    }
    if (omega_rad_s <= 0) throw new RangeError('calcTransmissibility: omega_rad_s must be > 0');
    if (omega_n_rad_s <= 0) throw new RangeError('calcTransmissibility: omega_n_rad_s must be > 0');
    if (damping < 0 || damping > 1) throw new RangeError('calcTransmissibility: damping must be in [0, 1]');

    const r = omega_rad_s / omega_n_rad_s;
    const numerator = Math.sqrt(1 + Math.pow(2 * damping * r, 2));
    const denominator = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(2 * damping * r, 2));
    // Prevent division by zero at exact resonance with zero damping
    const TR = denominator === 0 ? Infinity : numerator / denominator;
    return { TR, frequencyRatio: r, omega_rad_s, omega_n_rad_s, damping };
}

/**
 * Calculates the undamped natural frequency of a spring-mass system.
 * ωn = sqrt(k / m) [rad/s], fn = ωn / (2π) [Hz]
 *
 * @param stiffness_N_m - System stiffness k (N/m), must be > 0
 * @param mass_kg       - Effective mass m (kg), must be > 0
 * @returns
 * @throws {RangeError} if stiffness or mass are <= 0
 * @throws {TypeError} if parameters are not finite numbers
 *
 * Reference: Thomson & Dahleh (1998) eq. 2.1.5
 */
export function calcNaturalFrequency(
    stiffness_N_m: number,
    mass_kg: number,
): { omega_n_rad_s: number; fn_Hz: number; stiffness_N_m: number; mass_kg: number } {
    if (!Number.isFinite(stiffness_N_m) || !Number.isFinite(mass_kg)) {
        throw new TypeError('calcNaturalFrequency: stiffness_N_m and mass_kg must be finite numbers');
    }
    if (stiffness_N_m <= 0) throw new RangeError('calcNaturalFrequency: stiffness_N_m must be > 0');
    if (mass_kg <= 0) throw new RangeError('calcNaturalFrequency: mass_kg must be > 0');

    const omega_n_rad_s = Math.sqrt(stiffness_N_m / mass_kg);
    const fn_Hz = omega_n_rad_s / (2 * Math.PI);
    return { omega_n_rad_s, fn_Hz, stiffness_N_m, mass_kg };
}

/**
 * Calculates vibration isolation efficiency from transmissibility.
 * η = (1 - TR) × 100 [%]. Effective isolation only when TR < 1 (r > sqrt(2)).
 *
 * @param TR - Transmissibility (from calcTransmissibility)
 * @returns
 * @throws {RangeError} if TR is negative
 * @throws {TypeError} if TR is not a finite number
 *
 * Reference: Den Hartog (1956) §3.3; ISO 10816-1:1995 §4.2
 */
export function calcIsolationEfficiency(TR: number): { isolationEfficiency_pct: number; isIsolating: boolean } {
    if (!Number.isFinite(TR)) {
        throw new TypeError('calcIsolationEfficiency: TR must be a finite number');
    }
    if (TR < 0) throw new RangeError('calcIsolationEfficiency: TR must be >= 0');
    const isolationEfficiency_pct = (1 - TR) * 100;
    const isIsolating = TR < 1;
    return { isolationEfficiency_pct, isIsolating };
}

/**
 * Classifies vibration severity per ISO 10816-1:1995 Table 1.
 *
 * Machine classes:
 * - 'I'  : Small machines < 15 kW
 * - 'II' : Medium machines 15–75 kW
 * - 'III': Large rigid-mounted machines > 75 kW
 * - 'IV' : Large flexibly-mounted turbo-generators
 *
 * @param velocity_mm_s - Vibration velocity RMS in mm/s, must be >= 0
 * @param machineClass - ISO 10816 machine class
 * @returns
 * @throws {RangeError} if velocity_mm_s is negative
 * @throws {TypeError} if parameters have wrong types
 * @throws {Error} if machineClass is not a known class
 *
 * Reference: ISO 10816-1:1995 §5 and Table 1
 */
export function classifyVibrationSeverity(
    velocity_mm_s: number,
    machineClass: 'I' | 'II' | 'III' | 'IV',
): SeverityLabel {
    if (!Number.isFinite(velocity_mm_s)) {
        throw new TypeError('classifyVibrationSeverity: velocity_mm_s must be a finite number');
    }
    if (velocity_mm_s < 0) throw new RangeError('classifyVibrationSeverity: velocity_mm_s must be >= 0');
    const zones = SEVERITY_ZONES[machineClass];
    if (!zones) {
        throw new Error(`classifyVibrationSeverity: unknown machineClass '${machineClass}'. Use I, II, III, or IV`);
    }
    for (const zone of zones) {
        if (velocity_mm_s <= zone.max) return zone.label;
    }
    return 'unacceptable';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialNoisePropagationMeta: AnalyticsModuleMeta = {
    name: 'industrialNoisePropagation',
    description: 'industrialNoisePropagation',
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
