// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS 11 Sustainable Cities — pure measurer (F2).
 *
 * Targets UN indicator 11.6.2 — "Annual mean levels of fine particulate matter
 * (PM2.5 and PM10) in cities". Adapter that delegates to `_genericPure` with
 * three air-quality sub-indicators relativised against WHO 2021 guideline
 * values (used because they are stricter than CETESB and act as the policy
 * ceiling for urban planning).
 *
 * WHO 2021 annual guideline values:
 *   - PM2.5: 5 μg/m³
 *   - PM10:  15 μg/m³
 *   - NO2:   10 μg/m³
 *
 * Reuses entire pipeline (anti-N6): only thresholds vary. Tests live in
 * `tests/ods11-pure.test.mjs`.
 */

import { measureGenericOds, type GenericOdsResult } from './_genericPure.js';

export interface UrbanAirInput {
    /** PM2.5 annual mean μg/m³ (city / project-area). */
    readonly pm25?: number | null;
    /** PM10 annual mean μg/m³. */
    readonly pm10?: number | null;
    /** NO2 annual mean μg/m³. */
    readonly no2?: number | null;
    /** Optional override of the WHO guideline values (defaults below). */
    readonly thresholds?: { pm25?: number; pm10?: number; no2?: number };
}

const WHO_2021: Required<NonNullable<UrbanAirInput['thresholds']>> = Object.freeze({
    pm25: 5,
    pm10: 15,
    no2: 10,
});

/**
 * Measure ODS 11 from urban air-quality readings. Direction `lower` (lower
 * concentration is better outcome). Threshold cap is the WHO guideline ×3
 * (point at which the impact score saturates at 0).
 */
export function measureOds11Cities(input: UrbanAirInput): GenericOdsResult {
    const t = { ...WHO_2021, ...(input?.thresholds || {}) };
    return measureGenericOds({
        subIndicators: [
            {
                key: 'pm25',
                numerator: input?.pm25 ?? null,
                denominator: t.pm25 * 3,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'pm10',
                numerator: input?.pm10 ?? null,
                denominator: t.pm10 * 3,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'no2',
                numerator: input?.no2 ?? null,
                denominator: t.no2 * 3,
                cap: 1,
                direction: 'lower',
            },
        ],
    });
}
