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

interface MobilityThreshold {
    max: number;
    label: 'immobile' | 'low' | 'medium' | 'high' | 'very_high';
}

interface TessierFraction {
    name: string;
    mass: number;
    pct: number;
}

interface TessierResult {
    total: number;
    fractions: TessierFraction[];
    mobilityPct: number;
}

interface MobilityInput {
    fractions: { name: string; mass: number }[];
    total: number;
}

interface BioavailabilityResult {
    bioavailabilityFactor: number;
    pH_modifier: number;
    OM_modifier: number;
    CEC_modifier: number;
}

/**
 * Mobility index classification thresholds (Kabata-Pendias 2001 Table 2.3).
 * MI = (F1_exchangeable + F2_carbonate) / total × 100
 */
const MOBILITY_THRESHOLDS: MobilityThreshold[] = [
    { max: 5, label: 'immobile' },
    { max: 15, label: 'low' },
    { max: 40, label: 'medium' },
    { max: 70, label: 'high' },
    { max: 100, label: 'very_high' },
];

/**
 * Calculates the five Tessier fractions as percentages and returns
 * relative mobility for each phase.
 *
 * Tessier fractions (in order of decreasing mobility):
 * F1 - Exchangeable (most mobile / bioavailable)
 * F2 - Carbonate (acid-soluble)
 * F3 - Reducible (Fe/Mn oxides)
 * F4 - Oxidizable (sulfides / organic matter)
 * F5 - Residual (silicate lattice, least mobile)
 *
 * @param {number} exchangeable  - F1 mass (mg/kg or µg/g)
 * @param {number} carbonate     - F2 mass (same unit)
 * @param {number} oxidizable    - F4 mass (same unit)
 * @param {number} reducible     - F3 mass (same unit)
 * @param {number} residual      - F5 mass (same unit)
 * @returns {{ total: number, fractions: Array<{name: string, mass: number, pct: number}>, mobilityPct: number }}
 * @throws {RangeError} if any fraction is negative
 * @throws {TypeError} if any argument is not a finite number
 *
 * Reference: Tessier et al. (1979) Anal. Chem. DOI:10.1021/ac50043a017
 */
export function calcTessierFractions(exchangeable: number, carbonate: number, oxidizable: number, reducible: number, residual: number): TessierResult {
    const args = { exchangeable, carbonate, oxidizable, reducible, residual };
    for (const [key, val] of Object.entries(args)) {
        if (!Number.isFinite(val)) {
            throw new TypeError(`calcTessierFractions: '${key}' must be a finite number`);
        }
        if (val < 0) {
            throw new RangeError(`calcTessierFractions: '${key}' must be >= 0`);
        }
    }
    const total = exchangeable + carbonate + oxidizable + reducible + residual;
    if (total === 0) {
        throw new RangeError('calcTessierFractions: total metal content must be > 0');
    }
    const pct = (v: number) => (v / total) * 100;
    const fractions: TessierFraction[] = [
        { name: 'F1_exchangeable', mass: exchangeable, pct: pct(exchangeable) },
        { name: 'F2_carbonate', mass: carbonate, pct: pct(carbonate) },
        { name: 'F3_reducible', mass: reducible, pct: pct(reducible) },
        { name: 'F4_oxidizable', mass: oxidizable, pct: pct(oxidizable) },
        { name: 'F5_residual', mass: residual, pct: pct(residual) },
    ];
    const mobilityPct = pct(exchangeable) + pct(carbonate); // F1 + F2
    return { total, fractions, mobilityPct };
}

/**
 * Calculates the Mobility Index (MI) for heavy metals in soil.
 * MI = (F1 + F2) / totalMetal × 100
 * where F1 = exchangeable fraction, F2 = carbonate fraction (Kabata-Pendias 2001).
 *
 * @param {{ fractions: Array<{name: string, mass: number}>, total: number }} fractions
 *   Output from calcTessierFractions.
 * @returns {number} Mobility Index in percent (0–100)
 * @throws {TypeError} if fractions object is malformed
 *
 * Reference: Kabata-Pendias (2001) ISBN:9780849315756, Table 2.3
 */
export function calcMobilityIndex(fractions: MobilityInput): number {
    if (!fractions || !Array.isArray(fractions.fractions) || !Number.isFinite(fractions.total)) {
        throw new TypeError('calcMobilityIndex: expects output from calcTessierFractions');
    }
    const f1 = fractions.fractions.find((f) => f.name === 'F1_exchangeable');
    const f2 = fractions.fractions.find((f) => f.name === 'F2_carbonate');
    if (!f1 || !f2) throw new TypeError('calcMobilityIndex: F1 and F2 fractions are required');
    const MI = ((f1.mass + f2.mass) / fractions.total) * 100;
    return MI;
}

/**
 * Calculates a soil-adjusted bioavailability factor for heavy metals.
 * Corrects for pH, organic matter content, and clay CEC following
 * Kabata-Pendias (2001) Chapter 4 guidance on soil factors controlling metal availability.
 *
 * BF = baseFactor × pH_modifier × OM_modifier × CEC_modifier
 * where baseFactor = 1.0 (dimensionless, relative scale).
 *
 * @param {number} pH                - Soil pH (3.0–10.0)
 * @param {number} organicMatter_pct - Organic matter content (0–100 %)
 * @param {number} clayCEC           - Clay CEC in cmol(+)/kg (0–150)
 * @returns {{ bioavailabilityFactor: number, pH_modifier: number, OM_modifier: number, CEC_modifier: number }}
 * @throws {RangeError} if parameters are outside valid ranges
 * @throws {TypeError} if parameters are not finite numbers
 *
 * Reference: Kabata-Pendias (2001) Chapter 4; Alloway (2013) Heavy Metals in Soils 3rd ed.
 */
export function calcBioavailabilityFactor(pH: number, organicMatter_pct: number, clayCEC: number): BioavailabilityResult {
    if (!Number.isFinite(pH) || !Number.isFinite(organicMatter_pct) || !Number.isFinite(clayCEC)) {
        throw new TypeError('calcBioavailabilityFactor: all parameters must be finite numbers');
    }
    if (pH < 3.0 || pH > 10.0) throw new RangeError('calcBioavailabilityFactor: pH must be in [3, 10]');
    if (organicMatter_pct < 0 || organicMatter_pct > 100) {
        throw new RangeError('calcBioavailabilityFactor: organicMatter_pct must be in [0, 100]');
    }
    if (clayCEC < 0 || clayCEC > 150) {
        throw new RangeError('calcBioavailabilityFactor: clayCEC must be in [0, 150] cmol+/kg');
    }

    // pH modifier: mobility increases at low pH (acid soils); peak at pH 4.5 → modifier 2.0
    // Simplified linear model: modifier = 2.0 - (pH - 4.5) * 0.2, clamped [0.2, 2.0]
    const pH_modifier = Math.max(0.2, Math.min(2.0, 2.0 - (pH - 4.5) * 0.2));

    // OM modifier: higher organic matter reduces mobility (complexation / sorption)
    // modifier = 1 / (1 + organicMatter_pct * 0.05)
    const OM_modifier = 1 / (1 + organicMatter_pct * 0.05);

    // CEC modifier: higher CEC → stronger retention → lower bioavailability
    // modifier = 1 / (1 + clayCEC * 0.01)
    const CEC_modifier = 1 / (1 + clayCEC * 0.01);

    const bioavailabilityFactor = pH_modifier * OM_modifier * CEC_modifier;
    return { bioavailabilityFactor, pH_modifier, OM_modifier, CEC_modifier };
}

/**
 * Classifies heavy metal mobility based on the Mobility Index (%).
 *
 * @param {number} MI_pct - Mobility Index in percent (0–100)
 * @returns {'immobile'|'low'|'medium'|'high'|'very_high'}
 * @throws {RangeError} if MI_pct is outside [0, 100]
 * @throws {TypeError} if MI_pct is not a finite number
 *
 * Reference: Kabata-Pendias (2001) Table 2.3
 */
export function classifyMetalMobility(MI_pct: number): 'immobile' | 'low' | 'medium' | 'high' | 'very_high' {
    if (!Number.isFinite(MI_pct)) {
        throw new TypeError('classifyMetalMobility: MI_pct must be a finite number');
    }
    if (MI_pct < 0 || MI_pct > 100) {
        throw new RangeError('classifyMetalMobility: MI_pct must be in [0, 100]');
    }
    for (const tier of MOBILITY_THRESHOLDS) {
        if (MI_pct <= tier.max) return tier.label;
    }
    return 'very_high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilHeavyMetalMobilityMeta = {
    name: 'soilHeavyMetalMobility',
    description: 'soilHeavyMetalMobility',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
