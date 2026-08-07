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
 * River network connectivity analysis.
 *
 * References:
 * - Borselli, L., Cassi, P., & Torri, D. (2008). Prolegomena to sediment and flow
 *   connectivity in the landscape: A GIS and field numerical assessment.
 *   Catena, 75(3), 268–277. https://doi.org/10.1016/j.catena.2008.07.006
 * - Cavalli, M., et al. (2013). Geomorphometric assessment of spatial sediment
 *   connectivity in small Alpine catchments. Geomorphology, 188, 31–41.
 *   https://doi.org/10.1016/j.geomorph.2012.05.007
 * - Ward, J.V. (1989). The four-dimensional nature of lotic ecosystems.
 *   J. North American Benthological Society, 8(1), 2–8.
 *   https://doi.org/10.2307/1467397
 */

export interface ConnectivityIndexResult {
    IC: number;
    Dup: number;
    Ddn: number;
}

export interface FragmentationIndexResult {
    FI: number;
    barrierCount: number;
    reachLength_km: number;
}

export interface LateralConnectivityResult {
    LC: number;
    widthRatio: number;
    aspectRatio: number;
}

export type ConnectivityStatus = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

/**
 * Calculate the Connectivity Index (IC) per Borselli et al. (2008).
 * IC = log10(Dup / Ddn), where:
 *   Dup = upslope component = sqrt(A) * S / (W * roughness)
 *   Ddn = downslope component = distance / (S * roughness)  [simplified single reach]
 *
 * @param {number} upstreamArea   - Upslope contributing area (m²); A
 * @param {number} slope          - Mean slope gradient (m/m); 0 < slope ≤ 2
 * @param {number} roughness      - Weighted average roughness coefficient (C-factor or Manning n proxy); > 0
 * @param {number} distance       - Distance from cell to nearest stream/sink (m); > 0
 * @returns {{ IC: number, Dup: number, Ddn: number }}
 */
export function calcConnectivityIndex(
    upstreamArea: number,
    slope: number,
    roughness: number,
    distance: number,
): ConnectivityIndexResult {
    if (upstreamArea <= 0) throw new RangeError(`upstreamArea must be > 0, got ${upstreamArea}`);
    if (slope <= 0 || slope > 2) throw new RangeError(`slope must be in (0, 2], got ${slope}`);
    if (roughness <= 0) throw new RangeError(`roughness must be > 0, got ${roughness}`);
    if (distance <= 0) throw new RangeError(`distance must be > 0, got ${distance}`);

    // Upslope component (Eq. 2 in Borselli et al. 2008)
    const Dup = (Math.sqrt(upstreamArea) * slope) / roughness;
    // Downslope component (Eq. 3 in Borselli et al. 2008)
    const Ddn = distance / (slope * roughness);

    const IC = Math.log10(Dup / Ddn);
    return { IC, Dup, Ddn };
}

/**
 * Calculate river network fragmentation index.
 * FI = number of barriers per km of river reach.
 *
 * @param {number} barrierCount  - Number of in-stream barriers (dams, weirs, culverts)
 * @param {number} reachLength_km - Total river reach length (km)
 * @returns {{ FI: number, barrierCount: number, reachLength_km: number }}
 */
export function calcFragmentationIndex(
    barrierCount: number,
    reachLength_km: number,
): FragmentationIndexResult {
    if (!Number.isInteger(barrierCount) || barrierCount < 0) {
        throw new RangeError(`barrierCount must be a non-negative integer, got ${barrierCount}`);
    }
    if (reachLength_km <= 0) throw new RangeError(`reachLength_km must be > 0, got ${reachLength_km}`);

    const FI = barrierCount / reachLength_km;
    return { FI, barrierCount, reachLength_km };
}

/**
 * Calculate lateral connectivity ratio (Ward 1989 four-dimensional framework).
 * LC = ratio of floodplain area potentially connected during bankfull flow.
 *
 * LC = (floodplainWidth - channelWidth) / (2 * bankfullDepth * aspectRatio)
 * Simplified to: LC = floodplainWidth / channelWidth (dimensionless width ratio)
 *
 * @param {number} floodplainWidth - Active floodplain width (m)
 * @param {number} channelWidth    - Bankfull channel width (m)
 * @param {number} bankfullDepth   - Bankfull channel depth (m)
 * @returns {{ LC: number, widthRatio: number, aspectRatio: number }}
 */
export function calcLateralConnectivity(
    floodplainWidth: number,
    channelWidth: number,
    bankfullDepth: number,
): LateralConnectivityResult {
    if (floodplainWidth <= 0) throw new RangeError(`floodplainWidth must be > 0, got ${floodplainWidth}`);
    if (channelWidth <= 0) throw new RangeError(`channelWidth must be > 0, got ${channelWidth}`);
    if (bankfullDepth <= 0) throw new RangeError(`bankfullDepth must be > 0, got ${bankfullDepth}`);
    if (floodplainWidth < channelWidth) {
        throw new RangeError(`floodplainWidth (${floodplainWidth}) must be >= channelWidth (${channelWidth})`);
    }

    const widthRatio = floodplainWidth / channelWidth;
    const aspectRatio = channelWidth / bankfullDepth;
    // Lateral connectivity: 1 = fully connected channel (no floodplain); grows with floodplain
    const LC = widthRatio;
    return { LC, widthRatio, aspectRatio };
}

/**
 * Classify connectivity status based on IC value (Borselli et al. 2008 thresholds).
 * @param {number} IC - Connectivity Index (log-scale, typically -4 to +4)
 * @returns {'very_low'|'low'|'moderate'|'high'|'very_high'}
 */
export function classifyConnectivityStatus(IC: number): ConnectivityStatus {
    if (typeof IC !== 'number' || !isFinite(IC)) {
        throw new TypeError(`IC must be a finite number, got ${IC}`);
    }
    if (IC < -3) return 'very_low';
    if (IC < -1) return 'low';
    if (IC < 1) return 'moderate';
    if (IC < 3) return 'high';
    return 'very_high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverNetworkConnectivityMeta = {
    name: 'riverNetworkConnectivity',
    description: 'riverNetworkConnectivity',
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
} as const;