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
 * @module estuarineWaterExchange
 * Estuarine water exchange and mixing calculations using box models.
 *
 * References:
 * - Dyer, K.R. (1997). Estuaries: A Physical Introduction, 2nd ed.
 *   John Wiley & Sons, Chichester. ISBN 978-0-471-97470-5.
 * - Sanford, L.P., Boicourt, W.C., Rives, S.R. (1992). Model for Estimating Tidal Flushing
 *   of Small Embayments. Journal of Waterway, Port, Coastal and Ocean Engineering, 118(6).
 *   DOI: 10.1061/(ASCE)0733-950X(1992)118:6(635)
 * - Officer, C.B. (1976). Physical Oceanography of Estuaries (and Associated Coastal Waters).
 *   John Wiley, New York. ISBN 978-0-471-65278-0.
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
 * Calculates estuarine flushing time (tidal prism method).
 *
 * T_flush (days) = V / P
 * where V = estuarine volume at mean water level (m³), P = tidal prism (m³).
 * Dyer (1997) Chapter 4.
 *
 * @param volume_m3 - Estuarine volume at mean water level (m³)
 * @param tidalPrism_m3 - Volume of water exchanged per tidal cycle (m³)
 * @returns flushingTime_days: days to flush estuarine volume once;
 *   exchangeRate_pct_per_tide: percent volume exchanged per tidal cycle
 * @throws {RangeError} If volume or tidalPrism are not positive
 */
export function calcFlushingTime(
    volume_m3: number,
    tidalPrism_m3: number,
): { flushingTime_days: number; exchangeRate_pct_per_tide: number } {
    if (volume_m3 <= 0) {
        throw new RangeError('calcFlushingTime: volume_m3 must be >0');
    }
    if (tidalPrism_m3 <= 0) {
        throw new RangeError('calcFlushingTime: tidalPrism_m3 must be >0');
    }
    // Tidal cycle ~12.42 hours → 2 cycles/day (semidiurnal, dominant worldwide)
    const tidalCyclesPerDay = 2;
    const flushingTime_days = volume_m3 / (tidalPrism_m3 * tidalCyclesPerDay);
    const exchangeRate_pct_per_tide = Math.min(100, (tidalPrism_m3 / volume_m3) * 100);
    return { flushingTime_days, exchangeRate_pct_per_tide };
}

/**
 * Calculates tidal prism volume.
 *
 * P = A_total × tidal_range × (1 - intertidal_fraction × 0.5)
 * Simplified: P ≈ estuaryArea_m2 × tidalRange_m / 2 for symmetric tide
 * plus intertidal correction per Dyer (1997).
 *
 * @param tidalRange_m - Mean tidal range from MLLW to MHHW (m)
 * @param estuaryArea_m2 - Planimetric area of estuary at mean high water (m²)
 * @param intertidal_fraction - Fraction of area that is intertidal [0, 1]
 * @returns Tidal prism volume (m³)
 * @throws {RangeError} If tidalRange or estuaryArea are non-positive, or intertidal_fraction out of [0,1]
 */
export function calcTidalPrism(
    tidalRange_m: number,
    estuaryArea_m2: number,
    intertidal_fraction: number,
): { tidalPrism_m3: number } {
    if (tidalRange_m <= 0) {
        throw new RangeError('calcTidalPrism: tidalRange_m must be >0');
    }
    if (estuaryArea_m2 <= 0) {
        throw new RangeError('calcTidalPrism: estuaryArea_m2 must be >0');
    }
    if (intertidal_fraction < 0 || intertidal_fraction > 1) {
        throw new RangeError('calcTidalPrism: intertidal_fraction must be in [0, 1]');
    }
    // Prism = average amplitude × area; amplitude = range / 2
    // Intertidal areas contribute less due to drying at low tide - factor (1 - fraction/2)
    const amplitudeCorrection = 1 - intertidal_fraction * 0.5;
    const tidalPrism_m3 = (tidalRange_m / 2) * estuaryArea_m2 * amplitudeCorrection;
    return { tidalPrism_m3 };
}

/**
 * Estimates mean estuarine salinity via steady-state salt balance (Officer 1976).
 *
 * Steady-state: riverFlow × 0 + tidalMixing × salinity_ocean = (riverFlow + tidalMixing) × S_estuary
 * Simplified: S_estuary = salinity_ocean × tidalMixing / (riverFlow_m3_s + tidalMixing)
 *
 * @param riverFlow_m3_s - Mean freshwater river discharge (m³/s)
 * @param tidalMixing - Effective tidal exchange flow rate (m³/s)
 * @param salinity_ocean - Oceanic end-member salinity (ppt or PSU)
 * @returns salinityMean_ppt: mean estuarine salinity (ppt);
 *   freshwaterFraction: fraction of freshwater in estuarine volume
 * @throws {RangeError} If tidalMixing is zero or salinity_ocean is negative
 */
export function calcSalinityMixing(
    riverFlow_m3_s: number,
    tidalMixing: number,
    salinity_ocean: number,
): { salinityMean_ppt: number; freshwaterFraction: number } {
    if (riverFlow_m3_s < 0) {
        throw new RangeError('calcSalinityMixing: riverFlow_m3_s must be ≥0');
    }
    if (tidalMixing <= 0) {
        throw new RangeError('calcSalinityMixing: tidalMixing must be >0');
    }
    if (salinity_ocean < 0) {
        throw new RangeError('calcSalinityMixing: salinity_ocean must be ≥0');
    }
    const totalFlow = riverFlow_m3_s + tidalMixing;
    const salinityMean_ppt = salinity_ocean * (tidalMixing / totalFlow);
    const freshwaterFraction = riverFlow_m3_s / totalFlow;
    return { salinityMean_ppt, freshwaterFraction };
}

/**
 * Classifies estuary type based on salinity variability and stratification index.
 *
 * Classification scheme after Dyer (1997) and Pritchard (1955):
 * - salt_wedge: high stratification, low tidal mixing (large river dominated)
 * - partially_mixed: moderate stratification, moderate tidal energy
 * - well_mixed: low stratification, high tidal energy
 * - fjord: extreme stratification, deep sill with restricted exchange
 *
 * @param salinityVariability - Ratio of surface-to-bottom salinity difference (ΔS/S_ocean) [0-1]
 * @param stratification - Stratification index (0 = fully mixed, 1 = maximum stratification)
 * @throws {TypeError} If inputs are not numbers in [0, 1]
 */
export function classifyEstuaryType(
    salinityVariability: number,
    stratification: number,
): { estuaryType: string; description: string } {
    if (
        typeof salinityVariability !== 'number' ||
        typeof stratification !== 'number' ||
        salinityVariability < 0 ||
        salinityVariability > 1 ||
        stratification < 0 ||
        stratification > 1
    ) {
        throw new TypeError('classifyEstuaryType: salinityVariability and stratification must be numbers in [0, 1]');
    }
    if (stratification > 0.8 && salinityVariability > 0.5) {
        return {
            estuaryType: 'fjord',
            description: 'Deep basin with sill; strong permanent halocline; restricted deep-water renewal',
        };
    }
    if (stratification > 0.6 || salinityVariability > 0.7) {
        return {
            estuaryType: 'salt_wedge',
            description: 'River-dominated; sharp halocline; saline wedge intrudes at depth below freshwater',
        };
    }
    if (stratification > 0.3 || salinityVariability > 0.35) {
        return {
            estuaryType: 'partially_mixed',
            description: 'Tidal and river forces balanced; moderate vertical salinity gradient',
        };
    }
    return {
        estuaryType: 'well_mixed',
        description: 'Tide-dominated; uniform salinity top-to-bottom; high horizontal mixing',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const estuarineWaterExchangeMeta: AnalyticsModuleMeta = {
    name: 'estuarineWaterExchange',
    description: 'estuarineWaterExchange',
    category: 'analytics',
    familyTags: ['water'],
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
