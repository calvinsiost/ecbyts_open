// @ts-check
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
 * Product Carbon Footprint - ISO 14067:2018 + GHG Protocol Product Standard (2011)
 *
 * Calculates greenhouse gas emissions across the full product life cycle:
 * raw materials, energy, transport, use phase, and end-of-life.
 *
 * References:
 *   - ISO 14067:2018 - Greenhouse gases - Carbon footprint of products
 *   - GHG Protocol Product Standard (2011), World Resources Institute / WBCSD
 *   - IPCC AR6 WG1 (2021) - emission factors (Table 7.SM.7)
 *   - Ecoinvent v3.9 - background system emission factors
 *
 * @module productCarbonFootprint
 */

'use strict';

/**
 * Emission factors (kgCO2e per unit) for common raw materials.
 * Source: Ecoinvent v3.9 + IPCC AR6 supply-chain factors.
 * Units are kgCO2e / kg of material unless noted.
 * @type {Record<string, number>}
 */
const MATERIAL_FACTORS = {
    steel: 1.85, // kgCO2e/kg — primary steel (BF-BOF route)
    recycled_steel: 0.6, // kgCO2e/kg — secondary steel (EAF route)
    aluminum: 11.89, // kgCO2e/kg — primary aluminum (smelting)
    recycled_aluminum: 0.66,
    concrete: 0.159, // kgCO2e/kg
    hdpe: 2.08, // kgCO2e/kg — high-density polyethylene
    pvc: 2.41, // kgCO2e/kg — polyvinyl chloride
    glass: 0.85, // kgCO2e/kg
    copper: 3.18, // kgCO2e/kg — primary copper
    wood: 0.46, // kgCO2e/kg — timber (cradle to gate)
    paper: 1.09, // kgCO2e/kg
    cotton: 5.89, // kgCO2e/kg
    generic: 2.5, // fallback
};

/**
 * Transport emission factors (kgCO2e per tonne·km).
 * Source: GLEC Framework v2.0, ITF Transport Outlook (2023).
 * @type {Record<string, number>}
 */
const TRANSPORT_FACTORS = {
    road_heavy: 0.0621, // HGV >32t, diesel
    road_medium: 0.106, // 7.5–16t truck
    rail: 0.0028, // freight train (average grid mix)
    sea: 0.0119, // container ship
    air: 0.6024, // air cargo
    inland_waterway: 0.0331,
    generic: 0.0621, // fallback = road_heavy
};

/**
 * Carbon rating thresholds per product category (kgCO2e/unit).
 * Simplified look-up based on typical PCF benchmarks.
 * Source: EC Product Environmental Footprint (PEF) benchmarks.
 * @type {Record<string, number[]>}
 */
const CATEGORY_THRESHOLDS = {
    electronics: [1, 10, 50, 200], // A≤1, B≤10, C≤50, D≤200, E>200
    apparel: [2, 8, 20, 50],
    food: [0.5, 2, 5, 15],
    construction: [50, 200, 500, 2000],
    chemicals: [0.5, 3, 10, 50],
    generic: [1, 10, 50, 200],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assert a value is a finite number >= 0.
 * @param {*} v
 * @param {string} name
 */
function assertNonNeg(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`productCarbonFootprint: ${name} must be a non-negative finite number, got ${v}`);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate raw material emissions from a materials manifest.
 * Each entry: { material: string, quantity_kg: number }.
 *
 * @param {Array<{material: string, quantity_kg: number}>} materials
 * @returns {{ total_kgCO2e: number, breakdown: Object }}
 */
export function calcRawMaterialEmissions(materials: any) {
    if (!Array.isArray(materials)) {
        throw new TypeError('productCarbonFootprint.calcRawMaterialEmissions: materials must be an array');
    }
    let total = 0;
    /** @type {Record<string, number>} */
    const breakdown = {};
    for (const item of materials) {
        const qty = item.quantity_kg;
        assertNonNeg(qty, 'quantity_kg');
        const mat = (item.material || 'generic').toLowerCase().replace(/[^a-z_]/g, '_');
const factor = (MATERIAL_FACTORS as any)[mat] ?? MATERIAL_FACTORS.generic;
        const em = qty * factor;
        total += em;
        (breakdown as any)[mat] = (breakdown[mat as keyof typeof breakdown] || 0) + em;
    }
    return { total_kgCO2e: total, breakdown };
}

/**
 * Calculate transport emissions.
 * distance_km: transport distance; mass_kg: cargo mass; mode: transport mode key.
 *
 * Formula: emission = (mass_kg / 1000) * distance_km * factor  [tonne·km basis]
 *
 * @param {number} distance_km
 * @param {number} mass_kg
 * @param {string} [mode='road_heavy']
 * @returns {number} kgCO2e
 */
export function calcTransportEmissions(distance_km: any, mass_kg: any, mode = 'road_heavy') {
    assertNonNeg(distance_km, 'distance_km');
    assertNonNeg(mass_kg, 'mass_kg');
const factor = TRANSPORT_FACTORS[((mode || 'generic').toLowerCase() as keyof typeof TRANSPORT_FACTORS)] ?? TRANSPORT_FACTORS.generic;
    return (mass_kg / 1000) * distance_km * factor;
}

/**
 * Calculate the total Product Carbon Footprint (PCF) across all life-cycle phases.
 *
 * ISO 14067 system boundary: A1-A3 (production) + A4 (transport) + B (use) + C (end-of-life).
 *
 * @param {Array<{material: string, quantity_kg: number}>} materials - A1-A3 raw materials
 * @param {number} materials - A3 process energy emissions (kgCO2e, pre-calculated)
 * @param {number} energy_kgCO2e - A4 transport emissions (kgCO2e, pre-calculated or from calcTransportEmissions)
 * @param {number} transport_kgCO2e - B use-phase emissions (kgCO2e)
 * @param {number} use_kgCO2e - C end-of-life emissions (kgCO2e); negative values = credits
 * @returns {{ pcf_kgCO2e: number, phases: Object }}
 */
export function calcProductCarbonFootprint(materials: any, energy_kgCO2e: any, transport_kgCO2e: any, use_kgCO2e: any, endOfLife_kgCO2e: any) {
    const matResult = calcRawMaterialEmissions(materials);
    assertNonNeg(energy_kgCO2e, 'energy_kgCO2e');
    assertNonNeg(transport_kgCO2e, 'transport_kgCO2e');
    assertNonNeg(use_kgCO2e, 'use_kgCO2e');
    // endOfLife can be negative (avoided burden / credits)
    if (typeof endOfLife_kgCO2e !== 'number' || !isFinite(endOfLife_kgCO2e)) {
        throw new RangeError('productCarbonFootprint: endOfLife_kgCO2e must be a finite number');
    }
    const phases = {
        rawMaterials: matResult.total_kgCO2e,
        energy: energy_kgCO2e,
        transport: transport_kgCO2e,
        use: use_kgCO2e,
        endOfLife: endOfLife_kgCO2e,
    };
    const pcf_kgCO2e = Object.values(phases).reduce((a, b) => a + b, 0);
    return { pcf_kgCO2e, phases };
}

/**
 * Classify product carbon rating (A–E) based on PCF and product category.
 *
 * Rating bands are inspired by EU Energy Label / PEF benchmarks.
 * Returns 'A' (best) through 'E' (worst).
 *
 * @param {number} pcf_kgCO2e - Total PCF
 * @param {string} [category='generic'] - Product category key
 * @returns {'A'|'B'|'C'|'D'|'E'}
 */
export function classifyProductCarbonRating(pcf_kgCO2e: any, category = 'generic') {
    if (typeof pcf_kgCO2e !== 'number' || !isFinite(pcf_kgCO2e)) {
        throw new TypeError('productCarbonFootprint.classifyProductCarbonRating: pcf_kgCO2e must be a finite number');
    }
const thresholds = (CATEGORY_THRESHOLDS as any)[(category || 'generic').toLowerCase()] ?? CATEGORY_THRESHOLDS.generic;
    const [tA, tB, tC, tD] = thresholds;
    if (pcf_kgCO2e <= tA) return 'A';
    if (pcf_kgCO2e <= tB) return 'B';
    if (pcf_kgCO2e <= tC) return 'C';
    if (pcf_kgCO2e <= tD) return 'D';
    return 'E';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const productCarbonFootprintMeta = {
    name: 'productCarbonFootprint',
    description: 'productCarbonFootprint',
    category: 'analytics',
    familyTags: ['climate', 'footprint'],
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
