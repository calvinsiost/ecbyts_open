// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS 15 Life on Land — pure measurer (F2).
 *
 * Targets UN indicator 15.3.1 — "Proportion of land that is degraded over
 * total land area". Combines three sub-indicators:
 *
 *   - `degradedAreaRatio` — fraction of the project area classified as
 *     degraded (from CETESB GAC + IBAMA PRODES/DETER overlays). Direction
 *     `lower` (less degraded = better).
 *   - `soilErosionRate` — USLE/RUSLE rate ton/(ha·year). Cap at 50 t/(ha·y)
 *     which is the IBGE classification ceiling for "very severe" erosion.
 *   - `protectedAreaRatio` — fraction of project area inside an ICMBio UC.
 *     Direction `higher` (more protected = better).
 *
 * Anti-requirements (SPEC_ODS_IMPACT_RISK §2):
 *   - N1 no fabricated data: any missing sub-indicator returns `null` per
 *     `_genericPure` rules; T1 only when all 3 readings present.
 *   - N5 reuse only: pipes through `measureGenericOds`.
 */

import { measureGenericOds, type GenericOdsResult } from './_genericPure.js';

export interface LandSubIndicators {
    /** Fraction of project area classified as degraded [0, 1]. */
    readonly degradedAreaRatio?: number | null;
    /** Total project area for degraded ratio denominator. Optional when
     *  degradedAreaRatio is already pre-normalised. */
    readonly totalAreaHa?: number | null;
    /** USLE/RUSLE soil erosion rate, ton/(ha·year). */
    readonly soilErosionRate?: number | null;
    /** Fraction of project area inside an ICMBio Conservation Unit [0, 1]. */
    readonly protectedAreaRatio?: number | null;
}

const SOIL_EROSION_CAP_TONS_HA_YEAR = 50;

/**
 * Measure ODS 15 from land-state inputs. Mixes `lower` (degraded, erosion)
 * and `higher` (protected) directions in a single call.
 */
export function measureOds15Land(input: LandSubIndicators): GenericOdsResult {
    return measureGenericOds({
        subIndicators: [
            {
                key: 'degradedAreaRatio',
                numerator: input?.degradedAreaRatio ?? null,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'soilErosionRate',
                numerator: input?.soilErosionRate ?? null,
                denominator: SOIL_EROSION_CAP_TONS_HA_YEAR,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'protectedAreaRatio',
                numerator: input?.protectedAreaRatio ?? null,
                cap: 1,
                direction: 'higher',
            },
        ],
    });
}
