// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Geotechnical bearing capacity analysis.
 *
 * References:
 * - Terzaghi, K. (1943). Theoretical Soil Mechanics. Wiley, New York.
 * - Meyerhof, G.G. (1963). Some recent research on the bearing capacity of foundations.
 *   Canadian Geotechnical Journal, 1(1), 16–26. https://doi.org/10.1139/t63-003
 * - Das, B.M. (2014). Principles of Foundation Engineering, 8th ed. Cengage Learning.
 *   ISBN 978-1-305-08155-0
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

const DEG_TO_RAD = Math.PI / 180;

/**
 * Compute Terzaghi bearing capacity factors Nc, Nq, Nγ.
 * @param phi_deg - Internal friction angle (degrees)
 * @returns
 */
function _terzaghiFactors(phi_deg: number): { Nc: number; Nq: number; Ngamma: number } {
    const phi = phi_deg * DEG_TO_RAD;
    const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
    const Nc = phi_deg === 0 ? 5.14 : (Nq - 1) / Math.tan(phi);
    const Ngamma = 2 * (Nq + 1) * Math.tan(phi);
    return { Nc, Nq, Ngamma };
}

/**
 * Calculate ultimate bearing capacity per Terzaghi (1943).
 * Supports strip, square, and circular footings.
 *
 * qu = c·Nc·Sc + q·Nq + 0.5·γ·B·Nγ·Sγ
 *
 * @param c      - Cohesion (kPa)
 * @param phi_deg - Internal friction angle (degrees, 0–45)
 * @param gamma   - Unit weight of soil (kN/m³)
 * @param Df      - Depth of foundation (m)
 * @param B       - Width of foundation (m)
 * @param foundation - Footing type
 * @returns
 */
export function calcTerzaghiBearingCapacity(
    c: number,
    phi_deg: number,
    gamma: number,
    Df: number,
    B: number,
    foundation: 'strip' | 'square' | 'circular' = 'strip',
): { qu_kPa: number; Nc: number; Nq: number; Ngamma: number } {
    if (c < 0) throw new RangeError(`c (cohesion) must be >= 0, got ${c}`);
    if (phi_deg < 0 || phi_deg > 45) throw new RangeError(`phi_deg must be 0–45, got ${phi_deg}`);
    if (gamma <= 0) throw new RangeError(`gamma must be > 0, got ${gamma}`);
    if (Df < 0) throw new RangeError(`Df must be >= 0, got ${Df}`);
    if (B <= 0) throw new RangeError(`B must be > 0, got ${B}`);
    const validTypes = ['strip', 'square', 'circular'];
    if (!validTypes.includes(foundation)) {
        throw new TypeError(`foundation must be one of ${validTypes.join(', ')}, got "${foundation}"`);
    }

    const { Nc, Nq, Ngamma } = _terzaghiFactors(phi_deg);
    const q = gamma * Df; // surcharge at foundation level

    // Shape factors (Terzaghi 1943, Table 4.3 in Das 2014)
    let Sc: number, Sgamma: number;
    if (foundation === 'strip') {
        Sc = 1.0;
        Sgamma = 1.0;
    } else if (foundation === 'square') {
        Sc = 1.3;
        Sgamma = 0.8;
    } else {
        // circular
        Sc = 1.3;
        Sgamma = 0.6;
    }

    const qu_kPa = c * Nc * Sc + q * Nq + 0.5 * gamma * B * Ngamma * Sgamma;
    return { qu_kPa, Nc, Nq, Ngamma };
}

/**
 * Meyerhof (1963) bearing capacity factors.
 * @param phi_deg
 * @returns
 */
function _meyerhofFactors(phi_deg: number): { Nc: number; Nq: number; Ngamma: number } {
    const phi = phi_deg * DEG_TO_RAD;
    const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
    const Nc = phi_deg === 0 ? 5.14 : (Nq - 1) / Math.tan(phi);
    // Meyerhof's Nγ (1963 expression, Eq. 10 in Das 2014 §3.4)
    const Ngamma = (Nq - 1) * Math.tan(1.4 * phi);
    return { Nc, Nq, Ngamma };
}

/**
 * Calculate ultimate bearing capacity per Meyerhof (1963) with shape factors.
 * qu = c·Nc·Fcs + q·Nq·Fqs + 0.5·γ·B·Nγ·Fγs
 *
 * @param c      - Cohesion (kPa)
 * @param phi_deg - Friction angle (degrees, 0–45)
 * @param gamma   - Unit weight of soil (kN/m³)
 * @param Df      - Depth (m)
 * @param B       - Foundation width (m)
 * @param L       - Foundation length (m); L >= B
 * @returns
 */
export function calcMeyerhofCapacity(
    c: number,
    phi_deg: number,
    gamma: number,
    Df: number,
    B: number,
    L: number,
): { qu_kPa: number; Nc: number; Nq: number; Ngamma: number; Fcs: number; Fqs: number; Fgs: number } {
    if (c < 0) throw new RangeError(`c must be >= 0, got ${c}`);
    if (phi_deg < 0 || phi_deg > 45) throw new RangeError(`phi_deg must be 0–45, got ${phi_deg}`);
    if (gamma <= 0) throw new RangeError(`gamma must be > 0, got ${gamma}`);
    if (Df < 0) throw new RangeError(`Df must be >= 0, got ${Df}`);
    if (B <= 0) throw new RangeError(`B must be > 0, got ${B}`);
    if (L < B) throw new RangeError(`L must be >= B, got L=${L}, B=${B}`);

    const { Nc, Nq, Ngamma } = _meyerhofFactors(phi_deg);
    const q = gamma * Df;
    const phi = phi_deg * DEG_TO_RAD;
    const BoverL = B / L;

    // Meyerhof shape factors (Das 2014, Table 3.4)
    const Fcs = 1 + BoverL * (Nq / Nc);
    const Fqs = 1 + BoverL * Math.tan(phi);
    const Fgs = 1 - 0.4 * BoverL;

    const qu_kPa = c * Nc * Fcs + q * Nq * Fqs + 0.5 * gamma * B * Ngamma * Fgs;
    return { qu_kPa, Nc, Nq, Ngamma, Fcs, Fqs, Fgs };
}

/**
 * Calculate allowable bearing capacity.
 * @param qu - Ultimate bearing capacity (kPa)
 * @param FS - Factor of safety (typically 2.5–3.0)
 * @returns qa in kPa
 */
export function calcAllowableCapacity(qu: number, FS: number = 3.0): number {
    if (qu <= 0) throw new RangeError(`qu must be > 0, got ${qu}`);
    if (FS <= 1) throw new RangeError(`FS must be > 1, got ${FS}`);
    return qu / FS;
}

/**
 * Classify soil/foundation based on ultimate bearing capacity.
 * @param qu_kPa - Ultimate bearing capacity
 * @returns
 */
export function classifyFoundationSoil(
    qu_kPa: number,
): 'very_soft' | 'soft' | 'medium' | 'stiff' | 'very_stiff' | 'hard' {
    if (typeof qu_kPa !== 'number' || qu_kPa < 0) {
        throw new RangeError(`qu_kPa must be a non-negative number, got ${qu_kPa}`);
    }
    if (qu_kPa < 25) return 'very_soft';
    if (qu_kPa < 50) return 'soft';
    if (qu_kPa < 100) return 'medium';
    if (qu_kPa < 200) return 'stiff';
    if (qu_kPa < 400) return 'very_stiff';
    return 'hard';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const geotechnicalBearingCapacityMeta: AnalyticsModuleMeta = {
    name: 'geotechnicalBearingCapacity',
    description: 'geotechnicalBearingCapacity',
    category: 'analytics',
    familyTags: ['geotechnical'],
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
