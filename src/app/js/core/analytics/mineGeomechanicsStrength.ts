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
 * Mine Geomechanics Strength - RMR and Q-System Rock Mass Classification
 *
 * Implements the Rock Mass Rating (RMR) system by Bieniawski (1989) and
 * the Q-index by Barton et al. (1974) for underground excavation design and
 * rock mass characterization in mining and tunneling applications.
 *
 * Academic references:
 *   - Bieniawski, Z.T. (1989). Engineering Rock Mass Classifications.
 *     Wiley-Interscience. ISBN: 978-0-471-60172-2.
 *   - Barton, N., Lien, R., & Lunde, J. (1974). Engineering classification of
 *     rock masses for the design of tunnel support. Rock Mechanics, 6(4), 189–236.
 *     DOI:10.1007/BF01239496
 *
 * @module mineGeomechanicsStrength
 */

'use strict';

/**
 * Rating tables for RMR (Bieniawski 1989).
 * Each entry maps [upper bound of range, rating].
 * @type {Array<[number, number]>}
 */
const UCS_RATINGS = [
    [1, 0],
    [5, 1],
    [25, 2],
    [50, 4],
    [100, 7],
    [250, 12],
    [Infinity, 15],
];
/** @type {Array<[number, number]>} */
const RQD_RATINGS = [
    [25, 3],
    [50, 8],
    [75, 13],
    [90, 17],
    [100, 20],
];
/** @type {Array<[number, number]>} */
const SPACING_RATINGS = [
    [0.06, 5],
    [0.2, 8],
    [0.6, 10],
    [2.0, 15],
    [Infinity, 20],
];
const GROUNDWATER_RATINGS = {
    dry: 15,
    damp: 10,
    wet: 7,
    dripping: 4,
    flowing: 0,
};
const ORIENTATION_RATINGS = {
    very_favorable: 0,
    favorable: -2,
    fair: -5,
    unfavorable: -10,
    very_unfavorable: -12,
};

/**
 * Helper: lookup a value in a step-rating table.
 * @param {Array<[number, number]>} table - Array of [threshold, rating]
 * @param {number} value - Value to look up
 * @returns {number} Rating
 */
function stepRating(table: Array<[number, number]>, value: number): number {
    for (const [limit, rating] of table) {
        if (value <= limit) return rating;
    }
    return table[table.length - 1]![1];
}

/**
 * Asserts that value is a finite number strictly greater than zero.
 * @param {string} name - Parameter name for error messages
 * @param {number} value - Value to validate
 * @param {string} errorPrefix - Prefix used in thrown RangeError messages
 * @throws {RangeError} If value is not a positive finite number
 */
function _assertPositiveFiniteNumber(name: string, value: number, errorPrefix: string): void {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
        throw new RangeError(`${errorPrefix}: ${name} must be a positive finite number`);
    }
}

/**
 * Asserts that value is a finite number inside an inclusive range.
 * @param {string} name - Parameter name for error messages
 * @param {number} value - Value to validate
 * @param {number} min - Inclusive minimum
 * @param {number} max - Inclusive maximum
 * @param {string} errorPrefix - Prefix used in thrown RangeError messages
 * @throws {RangeError} If value is outside [min, max] or not finite
 */
function _assertFiniteRange(name: string, value: number, min: number, max: number, errorPrefix: string): void {
    if (typeof value !== 'number' || !isFinite(value) || value < min || value > max) {
        throw new RangeError(`${errorPrefix}: ${name} must be ${min}–${max}`);
    }
}

/**
 * Asserts that value is a key of the provided lookup object.
 * @param {string} name - Parameter name for error messages
 * @param {string} value - Value to validate
 * @param {Record<string, unknown>} allowed - Allowed keys lookup
 * @param {string} unknown> - Prefix used in thrown TypeError messages
 * @throws {TypeError} If value is not one of the allowed keys
 */
function _assertEnumKey(
    name: string,
    value: string,
    allowed: Record<string, unknown>,
    errorPrefix: string,
): void {
    if (!(value in allowed)) {
        throw new TypeError(`${errorPrefix}: ${name} must be one of: ${Object.keys(allowed).join(', ')}`);
    }
}

/**
 * Calculates the Rock Mass Rating (RMR) per Bieniawski (1989).
 *
 * RMR = R1(UCS) + R2(RQD) + R3(spacing) + R4(condition) + R5(groundwater) + R6(orientation)
 * Range: 0–100. Classes: I(81-100) to V(0-20).
 *
 * @param {number} UCS_MPa - Uniaxial Compressive Strength (MPa), > 0
 * @param {number} RQD_pct - Rock Quality Designation (%), 0–100
 * @param {number} spacing_m - Discontinuity spacing (m), > 0
 * @param {number} condition - Condition rating (0–30), per Bieniawski Table 6
 * @param {'dry'|'damp'|'wet'|'dripping'|'flowing'} groundwater - Groundwater state
 * @param {'very_favorable'|'favorable'|'fair'|'unfavorable'|'very_unfavorable'} orientation - Joint orientation
 * @returns {{ RMR: number, ratings: object }} Total RMR and component breakdown
 * @throws {TypeError} If parameters have wrong types
 * @throws {RangeError} If numerical parameters are out of range
 */
function _validateRMRInputs(
    UCS_MPa: number,
    RQD_pct: number,
    spacing_m: number,
    condition: number,
    groundwater: string,
    orientation: string,
): void {
    const prefix = 'calcRMR';
    _assertPositiveFiniteNumber('UCS_MPa', UCS_MPa, prefix);
    _assertFiniteRange('RQD_pct', RQD_pct, 0, 100, prefix);
    _assertPositiveFiniteNumber('spacing_m', spacing_m, prefix);
    _assertFiniteRange('condition rating', condition, 0, 30, prefix);
    _assertEnumKey('groundwater', groundwater, GROUNDWATER_RATINGS, prefix);
    _assertEnumKey('orientation', orientation, ORIENTATION_RATINGS, prefix);
}

export function calcRMR(UCS_MPa: number, RQD_pct: number, spacing_m: number, condition: number, groundwater: 'dry'|'damp'|'wet'|'dripping'|'flowing', orientation: 'very_favorable'|'favorable'|'fair'|'unfavorable'|'very_unfavorable'): { RMR: number, ratings: object } {
    _validateRMRInputs(UCS_MPa, RQD_pct, spacing_m, condition, groundwater, orientation);

    const R1 = stepRating(UCS_RATINGS as Array<[number, number]>, UCS_MPa);
    const R2 = stepRating(RQD_RATINGS as Array<[number, number]>, RQD_pct);
    const R3 = stepRating(SPACING_RATINGS as Array<[number, number]>, spacing_m);
    const R4 = condition; // supplied directly (0–30)
    const R5 = GROUNDWATER_RATINGS[groundwater];
    const R6 = ORIENTATION_RATINGS[orientation];

    const RMR = Math.max(0, Math.min(100, R1 + R2 + R3 + R4 + R5 + R6));
    return { RMR, ratings: { R1_ucs: R1, R2_rqd: R2, R3_spacing: R3, R4_condition: R4, R5_gw: R5, R6_orient: R6 } };
}

/**
 * Calculates the Tunneling Quality Index Q (Barton et al. 1974).
 *
 * Q = (RQD/Jn) × (Jr/Ja) × (Jw/SRF)
 *
 * The three quotients represent:
 *   - RQD/Jn: block size
 *   - Jr/Ja: inter-block shear strength
 *   - Jw/SRF: active stress
 *
 * @param {number} RQD - Rock Quality Designation (%), 0–100
 * @param {number} Jn - Joint set number (0.5–20)
 * @param {number} Jr - Joint roughness number (0.5–4)
 * @param {number} Ja - Joint alteration number (0.75–20)
 * @param {number} Jw - Joint water reduction factor (0.05–1.0)
 * @param {number} SRF - Stress Reduction Factor (0.5–20)
 * @returns {number} Q-index (0.001–1000)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If Jn or Ja is zero (division by zero)
 */
export function calcQIndex(RQD: number, Jn: number, Jr: number, Ja: number, Jw: number, SRF: number): number {
    for (const [name, val] of [
        ['RQD', RQD],
        ['Jn', Jn],
        ['Jr', Jr],
        ['Ja', Ja],
        ['Jw', Jw],
        ['SRF', SRF],
    ]) {
        if (typeof val !== 'number' || !isFinite(val))
            throw new TypeError(`calcQIndex: '${name}' must be a finite number`);
    }
    if (RQD < 0 || RQD > 100) throw new RangeError('calcQIndex: RQD must be 0–100');
    if (Jn <= 0) throw new RangeError('calcQIndex: Jn must be > 0');
    if (Ja <= 0) throw new RangeError('calcQIndex: Ja must be > 0');
    if (SRF <= 0) throw new RangeError('calcQIndex: SRF must be > 0');

    return (RQD / Jn) * (Jr / Ja) * (Jw / SRF);
}

/**
 * Classifies rock mass quality from RMR per Bieniawski (1989) Table 2.
 *
 * Class I   (RMR 81–100): very good rock
 * Class II  (RMR 61–80):  good rock
 * Class III (RMR 41–60):  fair rock
 * Class IV  (RMR 21–40):  poor rock
 * Class V   (RMR 0–20):   very poor rock
 *
 * @param {number} RMR - Rock Mass Rating (0–100)
 * @returns {'very_good'|'good'|'fair'|'poor'|'very_poor'} Classification
 * @throws {RangeError} If RMR is outside 0–100
 */
export function classifyRockMass(RMR: number): 'very_good'|'good'|'fair'|'poor'|'very_poor' {
    if (typeof RMR !== 'number' || !isFinite(RMR)) throw new TypeError('classifyRockMass: RMR must be a finite number');
    if (RMR < 0 || RMR > 100) throw new RangeError('classifyRockMass: RMR must be 0–100');
    if (RMR > 80) return 'very_good';
    if (RMR > 60) return 'good';
    if (RMR > 40) return 'fair';
    if (RMR > 20) return 'poor';
    return 'very_poor';
}

/**
 * Estimates tunnel support pressure from RMR (Bieniawski 1989, eq. 6.4):
 *
 * p_r = (100 - RMR) / (100 × RMR) × γ × B (kPa)
 *
 * where:
 *   B = excavation width (m)
 *   γ = unit weight of rock (kN/m³)
 *
 * @param {number} RMR - Rock Mass Rating (1–100)
 * @param {number} B_m - Excavation span/width (m), > 0
 * @param {number} gamma_kN_m3 - Unit weight of rock mass (kN/m³), typical 20–28
 * @returns {number} Support pressure (kPa)
 * @throws {RangeError} If inputs are out of valid range
 */
export function calcSupportPressure(RMR: number, B_m: number, gamma_kN_m3: number): number {
    if (typeof RMR !== 'number' || !isFinite(RMR) || RMR <= 0 || RMR > 100)
        throw new RangeError('calcSupportPressure: RMR must be 1–100');
    if (typeof B_m !== 'number' || !isFinite(B_m) || B_m <= 0)
        throw new RangeError('calcSupportPressure: B_m must be > 0');
    if (typeof gamma_kN_m3 !== 'number' || !isFinite(gamma_kN_m3) || gamma_kN_m3 <= 0)
        throw new RangeError('calcSupportPressure: gamma_kN_m3 must be > 0');
    return ((100 - RMR) / (100 * RMR)) * gamma_kN_m3 * B_m;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const mineGeomechanicsStrengthMeta: AnalyticsModuleMeta = {
    name: 'mineGeomechanicsStrength',
    description: 'mineGeomechanicsStrength',
    category: 'analytics',
    familyTags: ['mining'],
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
