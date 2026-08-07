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
 * Manual Handling Risk Index
 * Implements the Revised NIOSH Lifting Equation (1994) and REBA (2000).
 *
 * References:
 *   - NIOSH (1994) Applications Manual for the Revised NIOSH Lifting Equation.
 *     DHHS (NIOSH) Publication No. 94-110.
 *   - Hignett & McAtamney (2000) Applied Ergonomics: Rapid Entire Body Assessment (REBA).
 *     DOI:10.1016/S0003-6870(99)00039-3
 *
 * @module manualHandlingRiskIndex
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

// ---------------------------------------------------------------------------
// NIOSH Lifting Equation constants (1994 revision)
// LC  = Load Constant (23 kg)
// HM  = Horizontal Multiplier = 25 / H
// VM  = Vertical Multiplier  = 1 - 0.003|V - 75|
// DM  = Distance Multiplier  = 0.82 + 4.5/D
// AM  = Asymmetry Multiplier = 1 - 0.0032A
// FM  = Frequency Multiplier (table-based, simplified to input)
// CM  = Coupling Multiplier  (Good=1.00, Fair=0.95, Poor=0.90)
// ---------------------------------------------------------------------------

const LOAD_CONSTANT = 23; // kg

/**
 * Calculates the Recommended Weight Limit (RWL) using the Revised NIOSH
 * Lifting Equation (1994).
 *
 * RWL = LC × HM × VM × DM × AM × FM × CM
 *
 * @param {number} HM  Horizontal Multiplier [0..1]  (25/H where H is horiz dist cm)
 * @param {number} VM  Vertical Multiplier   [0..1]  (1 - 0.003|V-75| where V in cm)
 * @param {number} DM  Distance Multiplier   [0..1]  (0.82 + 4.5/D where D in cm)
 * @param {number} AM  Asymmetry Multiplier  [0..1]  (1 - 0.0032A where A in degrees)
 * @param {number} FM  Frequency Multiplier  [0..1]  from NIOSH Table 5
 * @param {number} CM  Coupling Multiplier   (0.90|0.95|1.00)
 * @returns {number} RWL in kg
 */
export function calcNIOSHRecommendedWeightLimit(
    HM: number,
    VM: number,
    DM: number,
    AM: number,
    FM: number,
    CM: number,
): number {
    if ([HM, VM, DM, AM, FM, CM].some((v) => typeof v !== 'number' || isNaN(v))) {
        throw new TypeError('All multipliers must be finite numbers');
    }
    if (HM < 0 || HM > 1) throw new RangeError('HM must be in [0, 1]');
    if (VM < 0 || VM > 1) throw new RangeError('VM must be in [0, 1]');
    if (DM < 0 || DM > 1) throw new RangeError('DM must be in [0, 1]');
    if (AM < 0 || AM > 1) throw new RangeError('AM must be in [0, 1]');
    if (FM < 0 || FM > 1) throw new RangeError('FM must be in [0, 1]');
    if (CM < 0.9 || CM > 1.0) throw new RangeError('CM must be 0.90, 0.95, or 1.00');

    const rwl = LOAD_CONSTANT * HM * VM * DM * AM * FM * CM;
    return Math.max(0, rwl);
}

/**
 * Calculates the Lifting Index (LI) - ratio of actual load to RWL.
 * LI > 1.0 indicates increased risk of musculoskeletal injury.
 *
 * @param {number} L   Actual load being lifted (kg)
 * @param {number} RWL Recommended Weight Limit (kg), from calcNIOSHRecommendedWeightLimit
 * @returns {number} Lifting Index (dimensionless)
 */
export function calcLiftingIndex(L: number, RWL: number): number {
    if (typeof L !== 'number' || isNaN(L) || L < 0) {
        throw new RangeError('Load L must be a non-negative number');
    }
    if (typeof RWL !== 'number' || isNaN(RWL) || RWL <= 0) {
        throw new RangeError('RWL must be a positive number');
    }
    return L / RWL;
}

/**
 * Classifies lifting risk based on Lifting Index per NIOSH (1994) guidelines.
 *
 * @param {number} LI Lifting Index from calcLiftingIndex
 * @returns {'acceptable'|'moderate_risk'|'high_risk'} Risk classification
 */
export function classifyLiftingRisk(LI: number): 'acceptable' | 'moderate_risk' | 'high_risk' {
    if (typeof LI !== 'number' || isNaN(LI) || LI < 0) {
        throw new RangeError('LI must be a non-negative number');
    }
    if (LI <= 1.0) return 'acceptable';
    if (LI <= 3.0) return 'moderate_risk';
    return 'high_risk';
}

// ---------------------------------------------------------------------------
// REBA (Rapid Entire Body Assessment) - Hignett & McAtamney 2000
// Simplified scoring: trunk + neck + legs (Group A) + upper arm + lower arm +
// wrist (Group B) → Table A score + Table B score → Table C → REBA total
// ---------------------------------------------------------------------------

/** Table A lookup: rows = trunk (1-5), cols = neck/legs combined score (1-6) */
const TABLE_A = [
    [1, 2, 3, 4, 1, 2], // trunk 1
    [2, 3, 4, 5, 2, 3], // trunk 2
    [2, 4, 5, 6, 3, 4], // trunk 3
    [3, 5, 6, 7, 4, 5], // trunk 4
    [4, 6, 7, 8, 5, 6], // trunk 5
];

/** Table B lookup: rows = upper arm (1-6), cols = lower arm/wrist combined (1-3) */
const TABLE_B = [
    [1, 2, 2], // upper arm 1
    [1, 2, 3], // upper arm 2
    [3, 4, 5], // upper arm 3
    [4, 5, 5], // upper arm 4
    [6, 7, 8], // upper arm 5
    [7, 8, 8], // upper arm 6
];

/** Table C lookup: rows = Score A (1-12), cols = Score B (1-12) capped at 8 */
const TABLE_C = [
    [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
    [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
    [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
    [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
    [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
    [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
    [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
    [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
    [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
    [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
    [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

const REBA_ACTION = [
    { min: 1, max: 1, action: 'none', risk: 'negligible' },
    { min: 2, max: 3, action: 'may_needed', risk: 'low' },
    { min: 4, max: 7, action: 'necessary', risk: 'medium' },
    { min: 8, max: 10, action: 'soon', risk: 'high' },
    { min: 11, max: 15, action: 'immediately', risk: 'very_high' },
];

/**
 * Calculates the REBA (Rapid Entire Body Assessment) score.
 *
 * @param {number} trunk      Trunk posture score 1-5 (1=neutral, 5=extreme)
 * @param {number} neck       Neck posture score 1-3
 * @param {number} legs       Legs posture score 1-4
 * @param {number} upperArm   Upper arm score 1-6
 * @param {number} lowerArm   Lower arm score 1-3
 * @param {number} wrist      Wrist score 1-3
 * @param {number} grip       Load/grip score 0-3 (added to group A total)
 * @param {number} activity   Activity score 0-3 (added to REBA total)
 * @returns {{ rebaScore: number, scoreA: number, scoreB: number,
 *             action: string, risk: string }}
 */
export function calcREBAScore(
    trunk: number,
    neck: number,
    legs: number,
    upperArm: number,
    lowerArm: number,
    wrist: number,
    grip: number = 0,
    activity: number = 0,
): { rebaScore: number; scoreA: number; scoreB: number; action: string; risk: string } {
    /** @type {(v: number, name: string, min: number, max: number) => void} */
    const intCheck = (v: number, name: string, min: number, max: number): void => {
        if (!Number.isInteger(v) || v < min || v > max) {
            throw new RangeError(`${name} must be integer in [${min}, ${max}], got ${v}`);
        }
    };
    intCheck(trunk, 'trunk', 1, 5);
    intCheck(neck, 'neck', 1, 3);
    intCheck(legs, 'legs', 1, 4);
    intCheck(upperArm, 'upperArm', 1, 6);
    intCheck(lowerArm, 'lowerArm', 1, 3);
    intCheck(wrist, 'wrist', 1, 3);
    intCheck(grip, 'grip', 0, 3);
    intCheck(activity, 'activity', 0, 3);

    // Neck+legs combined index for Table A (simplified: neck + legs - 2, capped 0-5)
    const neckLegsIdx = Math.min(5, neck - 1 + (legs - 1));
    const tableAVal = TABLE_A[trunk - 1]![neckLegsIdx]!;
    const scoreA = Math.min(12, tableAVal + grip);

    // Lower arm + wrist combined for Table B (0-2 index)
    const laWristIdx = Math.min(2, lowerArm - 1 + (wrist - 1));
    const tableBVal = TABLE_B[upperArm - 1]![laWristIdx]!;
    const scoreB = Math.min(12, tableBVal);

    const tableC = TABLE_C[Math.min(11, scoreA - 1)]![Math.min(11, scoreB - 1)]!;
    const rebaScore = Math.min(15, tableC + activity);

    const { action, risk } = REBA_ACTION.find((r) => rebaScore >= r.min && rebaScore <= r.max) || {
        action: 'immediately',
        risk: 'very_high',
    };

    return { rebaScore, scoreA, scoreB, action, risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const manualHandlingRiskIndexMeta: AnalyticsModuleMeta = {
    name: 'manualHandlingRiskIndex',
    description: 'manualHandlingRiskIndex',
    category: 'analytics',
    familyTags: ['risk'],
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
