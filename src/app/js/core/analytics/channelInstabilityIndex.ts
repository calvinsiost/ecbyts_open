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
 * Channel Instability Index - Rosgen (1994) Stream Classification + Lane (1955) Balance
 *
 * Provides morphological diagnostics for fluvial channels: width/depth ratio,
 * entrenchment, Rosgen stream type classification, and Lane's geomorphic balance.
 *
 * References:
 *   - Rosgen, D.L. (1994). A classification of natural rivers. Catena 22(3):169-199.
 *     DOI: 10.1016/0341-8162(94)90051-5
 *   - Lane, E.W. (1955). The importance of fluvial morphology in hydraulic engineering.
 *     Proc. ASCE 81(745):1-17.
 *   - Thorne, C.R. (1998). Stream Reconnaissance Handbook. Wiley, Chichester.
 *   - Montgomery, D.R. & Buffington, J.M. (1997). Geol. Soc. Am. Bull. 109(5):596-611.
 *
 * @module channelInstabilityIndex
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assert finite positive number.
 */
function assertPos(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`channelInstabilityIndex: ${name} must be a positive finite number, got ${v}`);
    }
}

/**
 * Assert finite non-negative number.
 */
function assertNonNeg(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`channelInstabilityIndex: ${name} must be a non-negative finite number, got ${v}`);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate bankfull width-to-depth ratio (W/D).
 *
 * W/D is a primary discriminator in Rosgen classification:
 *   W/D < 12 → incised/entrenched; W/D > 40 → braided tendency.
 *
 * @param width_m  - Bankfull channel width (m)
 * @param depth_m  - Mean bankfull depth (m)
 * @returns Width-to-depth ratio (dimensionless)
 */
export function calcWidthDepthRatio(width_m: number, depth_m: number): number {
    assertPos(width_m, 'width_m');
    assertPos(depth_m, 'depth_m');
    return width_m / depth_m;
}

/**
 * Calculate entrenchment ratio (ER).
 *
 * ER = flood-prone width / bankfull width.
 * Rosgen classification bands:
 *   ER > 2.2  → slightly entrenched (A, B, C, E)
 *   ER 1.4–2.2 → moderately entrenched (D, F)
 *   ER < 1.4  → entrenched (G)
 *
 * @param floodProneWidth_m  - Flood-prone width at 2× maximum bankfull depth (m)
 * @param bankfullWidth_m    - Bankfull channel width (m)
 * @returns Entrenchment ratio (dimensionless)
 */
export function calcEntrenchmentRatio(floodProneWidth_m: number, bankfullWidth_m: number): number {
    assertPos(floodProneWidth_m, 'floodProneWidth_m');
    assertPos(bankfullWidth_m, 'bankfullWidth_m');
    return floodProneWidth_m / bankfullWidth_m;
}

/**
 * Classify Rosgen stream type from morphological parameters.
 *
 * Decision logic follows Rosgen (1994) Table 1 and Level II classification key.
 * Simplified to single-letter type (A–G).
 *
 * @param slope       - Channel gradient (m/m, e.g. 0.02 = 2%)
 * @param W_D         - Width-to-depth ratio (from calcWidthDepthRatio)
 * @param sinuosity   - Channel sinuosity (planform length / valley length, ≥1)
 * @param ER          - Entrenchment ratio (from calcEntrenchmentRatio)
 * @returns Rosgen stream type
 */
export function calcRosgenStreamType(
    slope: number,
    W_D: number,
    sinuosity: number,
    ER: number,
): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' {
    assertNonNeg(slope, 'slope');
    assertPos(W_D, 'W_D');
    if (typeof sinuosity !== 'number' || !isFinite(sinuosity) || sinuosity < 1) {
        throw new RangeError('channelInstabilityIndex: sinuosity must be >= 1 (valley length <= channel length)');
    }
    assertPos(ER, 'ER');

    // Rosgen decision tree (simplified):
    // Type A: very steep, low W/D, slightly entrenched
    if (slope >= 0.04 && W_D < 12 && ER > 2.2) return 'A';

    // Type G: entrenched, low W/D, incised gully
    if (ER < 1.4 && W_D < 12) return 'G';

    // Type F: entrenched to moderately entrenched, high W/D
    if (ER < 1.4 && W_D >= 12) return 'F';

    // Type D: braided, high W/D, low sinuosity, low-moderate slope
    if (W_D > 40 && sinuosity < 1.2 && slope < 0.04) return 'D';

    // Type B: moderate slope, moderate W/D, slightly entrenched
    if (slope >= 0.02 && slope < 0.04 && W_D < 40 && ER > 2.2) return 'B';

    // Type E: very low W/D, high sinuosity (meandering), low slope
    if (W_D < 12 && sinuosity >= 1.5 && slope < 0.005 && ER > 2.2) return 'E';

    // Type C: sinuous, moderate W/D, slightly entrenched (most common)
    if (sinuosity >= 1.2 && W_D >= 12 && W_D < 40 && ER > 1.4) return 'C';

    // Default: B (transitional)
    return 'B';
}

/**
 * Calculate Lane's geomorphic balance indicator.
 *
 * Lane (1955) balance concept: Q_s * D_50 ∝ Q * S
 *   Positive value → aggrading tendency (deposition)
 *   Negative value → degrading tendency (erosion / incision)
 *   Near zero → dynamic equilibrium
 *
 * Balance = (sedimentLoad * particleSize) - (streamPower * discharge)
 * All inputs are relative/dimensionless ratios or normalized values;
 * the sign and magnitude are what matter, not absolute units.
 *
 * Interpretation guidance (Thorne 1998):
 *   balance > +0.1  → significant aggradation risk
 *   |balance| ≤ 0.1 → near-equilibrium
 *   balance < -0.1  → significant incision risk
 *
 * @param sedimentLoad  - Bed-material sediment transport rate (relative, e.g. kg/s)
 * @param particleSize  - Median particle diameter D50 (relative, e.g. mm)
 * @param streamPower   - Unit stream power (W/m² or relative)
 * @param discharge     - Bankfull discharge (m³/s or relative)
 */
export function calcLaneBalance(
    sedimentLoad: number,
    particleSize: number,
    streamPower: number,
    discharge: number,
): { balance: number; tendency: 'aggradation' | 'equilibrium' | 'degradation' } {
    assertNonNeg(sedimentLoad, 'sedimentLoad');
    assertNonNeg(particleSize, 'particleSize');
    assertNonNeg(streamPower, 'streamPower');
    assertNonNeg(discharge, 'discharge');

    const lhs = sedimentLoad * particleSize; // sediment supply side
    const rhs = streamPower * discharge; // transport capacity side
    const balance = lhs - rhs;

    let tendency: 'aggradation' | 'equilibrium' | 'degradation';
    if (balance > 0.1 * rhs) {
        tendency = 'aggradation';
    } else if (balance < -0.1 * rhs) {
        tendency = 'degradation';
    } else {
        tendency = 'equilibrium';
    }

    return { balance, tendency };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const channelInstabilityIndexMeta: AnalyticsModuleMeta = {
    name: 'channelInstabilityIndex',
    description: 'channelInstabilityIndex',
    category: 'analytics',
    familyTags: ['environmental'],
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
