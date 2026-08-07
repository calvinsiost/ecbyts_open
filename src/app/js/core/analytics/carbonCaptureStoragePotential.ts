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
 * @module carbonCaptureStoragePotential
 * @description Carbon Capture and Storage (CCS) potential assessment - geological
 * storage capacity, capture cost (levelised), net CO2 avoided and viability
 * classification.
 *
 * References:
 * - IPCC (2005). IPCC Special Report on Carbon Dioxide Capture and Storage.
 *   Cambridge University Press. ISBN 0-521-86643-X.
 *   Chapter 5: Underground Geological Storage.
 * - IEAGHG (2009). CO2 Storage in Depleted Gas Fields. IEAGHG Technical Report
 *   2009-01. IEA Greenhouse Gas R&D Programme.
 * - Metz, B. et al. (eds.) (2005). SRCCS - storage capacity equation (eq. 5.1).
 * - Rubin, E.S. et al. (2015). The cost of CO2 capture and storage. Int. J. Greenhouse
 *   Gas Control 40:378-400. DOI: 10.1016/j.ijggc.2015.05.018
 */

'use strict';

/**
 * Calculate geological CO2 storage capacity (volumetric method).
 *
 * G_CO2 = A × h × φ × S_g × ρ_CO2   [IPCC SRCCS 2005, eq. 5.1]
 *
 * @param porosity        - Effective porosity (fraction 0–1), >0
 * @param area_km2        - Reservoir area (km²), >0
 * @param thickness_m     - Net reservoir thickness (m), >0
 * @param Sg              - CO2 saturation (fraction 0–1), >0
 * @param CO2density_kg_m3 - CO2 density at reservoir conditions (kg/m³), >0
 */
export function calcStorageCapacity(
    porosity: number,
    area_km2: number,
    thickness_m: number,
    Sg: number,
    CO2density_kg_m3: number,
): { volume_m3: number; capacity_Mt_CO2: number } {
    if (porosity <= 0 || porosity > 1) {
        throw new RangeError('Porosity must be in (0, 1].');
    }
    if (area_km2 <= 0) {
        throw new RangeError('Reservoir area must be positive (km²).');
    }
    if (thickness_m <= 0) {
        throw new RangeError('Thickness must be positive (m).');
    }
    if (Sg <= 0 || Sg > 1) {
        throw new RangeError('CO2 saturation must be in (0, 1].');
    }
    if (CO2density_kg_m3 <= 0) {
        throw new RangeError('CO2 density must be positive (kg/m³).');
    }
    // Area: km² → m²: × 1e6
    const area_m2 = area_km2 * 1e6;
    const volume_m3 = area_m2 * thickness_m * porosity * Sg;
    // Mass: kg → Mt: ÷ 1e9
    const capacity_Mt_CO2 = (volume_m3 * CO2density_kg_m3) / 1e9;
    return { volume_m3, capacity_Mt_CO2 };
}

/**
 * Calculate levelised capture cost ($/tCO2).
 *
 * Cost = (CAPEX × CRF + OPEX) / (captureRate × lifetime × (1 − parasitic/100))
 * But simplified to annual basis:
 * Cost_annual = CAPEX × CRF + OPEX_yr
 * Cost_per_tCO2 = Cost_annual / captureRate_tCO2_yr
 *
 * CRF (Capital Recovery Factor) = r(1+r)^n / ((1+r)^n − 1)
 *
 * @param captureRate_tCO2_yr - Annual CO2 capture rate (t/yr), >0
 * @param capex               - Total capital expenditure ($), ≥0
 * @param opex_yr             - Annual operating cost ($/yr), ≥0
 * @param discountRate        - Discount rate (fraction, e.g. 0.08), >0
 * @param lifetime_yr         - Project lifetime (years), >0
 */
export function calcCaptureCost(
    captureRate_tCO2_yr: number,
    capex: number,
    opex_yr: number,
    discountRate: number,
    lifetime_yr: number,
): { CRF: number; annualCost_USD: number; cost_per_tCO2: number } {
    if (captureRate_tCO2_yr <= 0) {
        throw new RangeError('Capture rate must be positive (t CO2/yr).');
    }
    if (capex < 0 || opex_yr < 0) {
        throw new RangeError('CAPEX and OPEX must be non-negative ($).');
    }
    if (discountRate <= 0) {
        throw new RangeError('Discount rate must be positive (fraction).');
    }
    if (lifetime_yr <= 0) {
        throw new RangeError('Project lifetime must be positive (years).');
    }
    const r = discountRate;
    const n = lifetime_yr;
    const CRF = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const annualCost_USD = capex * CRF + opex_yr;
    const cost_per_tCO2 = annualCost_USD / captureRate_tCO2_yr;
    return { CRF, annualCost_USD, cost_per_tCO2 };
}

/**
 * Calculate net CO2 avoided after accounting for energy penalty (parasitic load).
 *
 * Net = gross × (1 − parasitic_pct / 100)
 *
 * @param grossCapture  - Gross CO2 captured (t/yr), ≥0
 * @param parasitic_pct - Energy penalty as percent of gross capture (%), 0–100
 */
export function calcNetCO2Avoided(
    grossCapture: number,
    parasitic_pct: number,
): { netCO2Avoided_t_yr: number; parasitic_t_yr: number } {
    if (grossCapture < 0) {
        throw new RangeError('Gross capture must be non-negative (t/yr).');
    }
    if (parasitic_pct < 0 || parasitic_pct > 100) {
        throw new RangeError('Parasitic percentage must be in [0, 100].');
    }
    const parasitic_t_yr = grossCapture * (parasitic_pct / 100);
    const netCO2Avoided_t_yr = grossCapture - parasitic_t_yr;
    return { netCO2Avoided_t_yr, parasitic_t_yr };
}

/**
 * Classify CCS project viability based on cost and storage capacity.
 *
 * Thresholds informed by Rubin et al. (2015) cost ranges and IEAGHG (2009)
 * capacity definitions:
 * - not_viable:    cost > $120/tCO2 OR capacity < 1 Mt
 * - marginal:      cost 60–120 $/tCO2 AND capacity ≥ 1 Mt
 * - viable:        cost 20–60 $/tCO2 AND capacity ≥ 10 Mt
 * - highly_viable: cost ≤ $20/tCO2 AND capacity ≥ 50 Mt
 *
 * @param cost_per_tCO2      - Levelised capture cost ($/tCO2), ≥0
 * @param storageCapacity_Mt - Storage capacity (Mt CO2), ≥0
 */
export function classifyCCSViability(
    cost_per_tCO2: number,
    storageCapacity_Mt: number,
): { viabilityClass: 'not_viable' | 'marginal' | 'viable' | 'highly_viable' } {
    if (cost_per_tCO2 < 0) {
        throw new RangeError('Cost must be non-negative ($/tCO2).');
    }
    if (storageCapacity_Mt < 0) {
        throw new RangeError('Storage capacity must be non-negative (Mt CO2).');
    }
    let viabilityClass: 'not_viable' | 'marginal' | 'viable' | 'highly_viable';
    if (cost_per_tCO2 <= 20 && storageCapacity_Mt >= 50) {
        viabilityClass = 'highly_viable';
    } else if (cost_per_tCO2 <= 60 && storageCapacity_Mt >= 10) {
        viabilityClass = 'viable';
    } else if (cost_per_tCO2 <= 120 && storageCapacity_Mt >= 1) {
        viabilityClass = 'marginal';
    } else {
        viabilityClass = 'not_viable';
    }
    return { viabilityClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const carbonCaptureStoragePotentialMeta = {
    name: 'carbonCaptureStoragePotential',
    description: 'carbonCaptureStoragePotential',
    category: 'analytics',
    familyTags: ['climate'],
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
