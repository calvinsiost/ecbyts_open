// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Fluvial Geomorphology Index Module
 *
 * Implements channel morphology assessment indices per:
 * - Rosgen, D.L. (1994). A classification of natural rivers.
 *   Catena 22:169-199. DOI: 10.1016/0341-8162(94)90001-9
 * - Pfankuch, D.J. (1975). Stream reach inventory and channel stability evaluation.
 *   USDA Forest Service Region 1, Missoula, MT.
 * - Montgomery, D.R. & Buffington, J.M. (1997). Channel-reach morphology in mountain drainage basins.
 *   GSA Bulletin 109(5):596-611. DOI: 10.1130/0016-7606(1997)109<0596:CRMIMD>2.3.CO;2
 *
 * Zero dependencies - pure math, no DOM/IDB/Three.js/fetch.
 *
 * @module fluvialGeomorphologyIndex
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

// ---------------------------------------------------------------------------
// Rosgen stream classification types (Rosgen 1994, Table 1)
// Tipos de canal do sistema Rosgen: sinuosidade, inclinação, razão largura/profundidade
// ---------------------------------------------------------------------------
const ROSGEN_TYPES = Object.freeze({
    A: {
        sinuosityMin: 1.0,
        sinuosityMax: 1.2,
        wdRatioMax: 12,
        slopeMin: 0.04,
        desc: 'Steep, entrenched, low w/d, high gradient',
    },
    B: {
        sinuosityMin: 1.2,
        sinuosityMax: 1.5,
        wdRatioMax: 12,
        slopeMin: 0.02,
        desc: 'Moderate gradient, slightly entrenched',
    },
    C: {
        sinuosityMin: 1.4,
        sinuosityMax: 9.9,
        wdRatioMax: 12,
        slopeMin: 0.001,
        desc: 'Low gradient, meandering, broad floodplain',
    },
    D: { sinuosityMin: 1.0, sinuosityMax: 9.9, wdRatioMin: 40, slopeMin: 0, desc: 'Braided, very high w/d ratio' },
    DA: { sinuosityMin: 1.0, sinuosityMax: 9.9, wdRatioMax: 40, slopeMin: 0, desc: 'Anastomosing, multiple channels' },
    E: {
        sinuosityMin: 1.5,
        sinuosityMax: 9.9,
        wdRatioMax: 12,
        slopeMin: 0,
        desc: 'Low gradient, highly sinuous, narrow',
    },
    F: { sinuosityMin: 1.0, sinuosityMax: 1.4, wdRatioMin: 12, slopeMin: 0, desc: 'Entrenched, meandering, high w/d' },
    G: {
        sinuosityMin: 1.2,
        sinuosityMax: 9.9,
        wdRatioMax: 12,
        slopeMin: 0.02,
        desc: 'Incised, low w/d, moderate sinuosity',
    },
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Assert finite positive number.
 */
function assertPositive(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${v}`);
    }
}

/**
 * Assert finite non-negative number.
 */
function assertNonNegative(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Calculate channel sinuosity index (Rosgen 1994, eq. 1).
 * Calcula o índice de sinuosidade do canal - razão entre comprimento do canal e comprimento do vale.
 *
 * Sinuosity = channel length / valley length
 * Straight channel: ~1.0; Meandering: >1.5; Highly meandering: >2.5
 *
 * @param channelLengthM  - Measured channel length along thalweg (m)
 * @param valleyLengthM   - Straight-line valley length (m)
 * @returns sinuosity and classification
 */
export function sinuosityIndex(
    channelLengthM: number,
    valleyLengthM: number,
): { sinuosity: number; classification: 'straight' | 'sinuous' | 'meandering' | 'highly_meandering' } {
    assertPositive(channelLengthM, 'channelLengthM');
    assertPositive(valleyLengthM, 'valleyLengthM');

    const sinuosity = channelLengthM / valleyLengthM;
    let classification: 'straight' | 'sinuous' | 'meandering' | 'highly_meandering';
    if (sinuosity < 1.05) classification = 'straight';
    else if (sinuosity < 1.25) classification = 'sinuous';
    else if (sinuosity < 1.5) classification = 'meandering';
    else classification = 'highly_meandering';

    return { sinuosity, classification };
}

/**
 * Calculate bankfull width-to-depth ratio (Rosgen 1994, eq. 2).
 * Calcula a razão largura/profundidade na cheia plena (bankfull).
 *
 * w/d ratio distinguishes entrenched (low) from braided (high) channel types.
 * Razão w/d: canais entalhados (<12), meandrantes moderados (12-40), trançados (>40)
 *
 * @param bankfullWidthM   - Bankfull channel width (m)
 * @param bankfullDepthM   - Mean bankfull depth (m)
 * @returns wdRatio and entrenchmentClass
 */
export function widthDepthRatio(
    bankfullWidthM: number,
    bankfullDepthM: number,
): {
    wdRatio: number;
    entrenchmentClass: 'entrenched' | 'moderately_entrenched' | 'slightly_entrenched' | 'not_entrenched';
} {
    assertPositive(bankfullWidthM, 'bankfullWidthM');
    assertPositive(bankfullDepthM, 'bankfullDepthM');

    const wdRatio = bankfullWidthM / bankfullDepthM;
    let entrenchmentClass: 'entrenched' | 'moderately_entrenched' | 'slightly_entrenched' | 'not_entrenched';
    // Entrenchment ratio < 1.4 = entrenched; 1.4-2.2 = moderately; 2.2+ = not entrenched
    // Approximate from w/d for bankfull:
    if (wdRatio < 12) entrenchmentClass = 'entrenched';
    else if (wdRatio < 20) entrenchmentClass = 'moderately_entrenched';
    else if (wdRatio < 40) entrenchmentClass = 'slightly_entrenched';
    else entrenchmentClass = 'not_entrenched';

    return { wdRatio, entrenchmentClass };
}

/**
 * Calculate Pfankuch Channel Stability Index (Pfankuch 1975).
 * Calcula o Índice de Estabilidade de Canal de Pfankuch - avaliação de campo em 3 seções.
 *
 * Scores represent field observations of bank and bed stability (1=excellent, 5=poor per item).
 * Each section contributes a weighted subtotal; total ≤ 30 = stable, 31-45 = moderately stable,
 * 46-60 = unstable, >60 = severely unstable.
 *
 * Ref: Pfankuch 1975, Stream Reach Inventory, USDA FS Region 1.
 *
 * @param scores - section scores
 * @returns total, stability, scores
 */
export function pfankuchStabilityIndex(scores: {
    upperBanks: number;
    lowerBanks: number;
    streamBottom: number;
}): { total: number; stability: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor'; scores: object } {
    if (!scores || typeof scores !== 'object') {
        throw new TypeError('scores must be an object with upperBanks, lowerBanks, streamBottom');
    }
    const { upperBanks, lowerBanks, streamBottom } = scores;
    assertPositive(upperBanks, 'upperBanks');
    assertPositive(lowerBanks, 'lowerBanks');
    assertPositive(streamBottom, 'streamBottom');

    if (upperBanks > 20 || lowerBanks > 20 || streamBottom > 20) {
        throw new RangeError('Each Pfankuch section score must be between 1 and 20');
    }

    const total = upperBanks + lowerBanks + streamBottom;
    let stability: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
    if (total <= 30) stability = 'excellent';
    else if (total <= 40) stability = 'good';
    else if (total <= 50) stability = 'fair';
    else if (total <= 60) stability = 'poor';
    else stability = 'very_poor';

    return { total, stability, scores: { upperBanks, lowerBanks, streamBottom } };
}

/**
 * Classify Rosgen stream type based on morphological parameters (Rosgen 1994).
 * Classifica o tipo de rio pelo sistema Rosgen usando sinuosidade, razão w/d e declividade.
 *
 * @param sinuosity   - Channel sinuosity (1.0+)
 * @param wdRatio     - Bankfull width-to-depth ratio
 * @param slope       - Channel slope (m/m, dimensionless)
 * @returns type, description, confidence
 */
export function classifyRosgenType(
    sinuosity: number,
    wdRatio: number,
    slope: number,
): { type: string; description: string; confidence: 'high' | 'medium' | 'low' } {
    assertPositive(sinuosity, 'sinuosity');
    assertPositive(wdRatio, 'wdRatio');
    assertNonNegative(slope, 'slope');

    if (sinuosity < 1.0) throw new RangeError('sinuosity must be >= 1.0');

    // Braided (D): very high w/d regardless of sinuosity
    if (wdRatio >= 40) {
        return { type: 'D', description: ROSGEN_TYPES.D.desc, confidence: 'high' };
    }

    // High gradient entrenched (A): very steep + low sinuosity
    if (slope >= 0.04 && sinuosity < 1.2 && wdRatio < 12) {
        return { type: 'A', description: ROSGEN_TYPES.A.desc, confidence: 'high' };
    }

    // Highly sinuous narrow (E): low gradient, high sinuosity, narrow
    if (sinuosity >= 1.5 && wdRatio < 12 && slope < 0.02) {
        return { type: 'E', description: ROSGEN_TYPES.E.desc, confidence: 'high' };
    }

    // Meandering low gradient (C): sinuous, moderate w/d
    if (sinuosity >= 1.4 && wdRatio <= 12 && slope < 0.01) {
        return { type: 'C', description: ROSGEN_TYPES.C.desc, confidence: 'high' };
    }

    // Slightly entrenched meandering (F): low sinuosity, high w/d
    if (sinuosity >= 1.0 && sinuosity < 1.4 && wdRatio > 12 && slope < 0.02) {
        return { type: 'F', description: ROSGEN_TYPES.F.desc, confidence: 'medium' };
    }

    // Incised moderate gradient (G): moderate sinuosity, moderate slope, low w/d
    if (sinuosity >= 1.2 && wdRatio < 12 && slope >= 0.02) {
        return { type: 'G', description: ROSGEN_TYPES.G.desc, confidence: 'medium' };
    }

    // Moderate gradient (B): default moderate condition
    if (sinuosity >= 1.2 && sinuosity < 1.5 && wdRatio < 12) {
        return { type: 'B', description: ROSGEN_TYPES.B.desc, confidence: 'medium' };
    }

    return { type: 'C', description: ROSGEN_TYPES.C.desc, confidence: 'low' };
}

/**
 * Calculate dimensionless stream power index (SPI) - a proxy for erosion potential.
 * Calcula o índice de potência do fluxo adimensional - proxy para potencial erosivo.
 *
 * SPI = As × tan(β) where As = specific catchment area (m²/m), β = slope angle (rad)
 * Ref: Moore et al. (1991), Earth Surface Processes and Landforms 16:107-130.
 * DOI: 10.1002/esp.3290160202
 *
 * @param specificCatchmentAreaM2perM - Specific catchment area (m²/m)
 * @param slopeRadians                - Channel slope in radians
 * @returns spi and erosionRisk
 */
export function streamPowerIndex(
    specificCatchmentAreaM2perM: number,
    slopeRadians: number,
): { spi: number; erosionRisk: 'low' | 'moderate' | 'high' | 'very_high' } {
    assertPositive(specificCatchmentAreaM2perM, 'specificCatchmentAreaM2perM');
    assertNonNegative(slopeRadians, 'slopeRadians');

    if (slopeRadians > Math.PI / 2) {
        throw new RangeError('slopeRadians must be between 0 and π/2');
    }

    const spi = specificCatchmentAreaM2perM * Math.tan(slopeRadians);
    let erosionRisk: 'low' | 'moderate' | 'high' | 'very_high';
    if (spi < 5) erosionRisk = 'low';
    else if (spi < 20) erosionRisk = 'moderate';
    else if (spi < 50) erosionRisk = 'high';
    else erosionRisk = 'very_high';

    return { spi, erosionRisk };
}

export { ROSGEN_TYPES };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const fluvialGeomorphologyIndexMeta: AnalyticsModuleMeta = {
    name: 'fluvialGeomorphologyIndex',
    description: 'fluvialGeomorphologyIndex',
    category: 'analytics',
    familyTags: ['river'],
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
