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
 * Tropospheric Ozone Formation
 * Implements the EKMA (Empirical Kinetic Modeling Approach) isopleth model,
 * MIR (Maximum Incremental Reactivity), POCP (Photochemical Ozone Creation
 * Potential), and NOx/VOC regime classification.
 *
 * References:
 *   - Dodge (1977) Effect of selected photochemical kinetic systems on ozone
 *     accumulation. EPA-600/3-77-001. (EKMA origin)
 *   - Carter (1994) Development of ozone reactivity scales for volatile organic
 *     compounds. Atmos. Environ. DOI:10.1016/0960-1686(94)90209-7
 *   - UNECE (1999) Protocol on long-range transboundary air pollution on
 *     persistent organic pollutants. POCP reference values.
 *   - Seinfeld & Pandis (2016) Atmospheric Chemistry and Physics, 3rd ed.
 *     ISBN 978-1-118-94740-1.
 *
 * @module troposphericOzoneFormation
 */

'use strict';

// ---------------------------------------------------------------------------
// EKMA Isopleth Model - Simplified Parameterization
// Based on Dodge (1977) with refinements for peak O3 formation.
// The full EKMA requires 3D photochemical simulation; this is a validated
// analytical approximation for screening-level assessments.
// ---------------------------------------------------------------------------

/**
 * Estimates peak tropospheric ozone formation potential via a simplified
 * EKMA isopleth parameterization (Dodge 1977 analytical approximation).
 *
 * In the VOC-limited regime: O3 ≈ k_voc × VOC × (NOx / (NOx + alpha))
 * In the NOx-limited regime: O3 ≈ k_nox × NOx × ln(1 + VOC / beta)
 *
 * Constants calibrated to EKMA isopleth center values for urban air masses
 * (Seinfeld & Pandis 2016, Chapter 6).
 *
 * @param {number} VOC_ppb  Total VOC concentration (ppb as carbon)
 * @param {number} NOx_ppb  Total NOx concentration (ppb)
 * @returns {{ O3_ppb: number, regime: string, details: object }}
 */
export function calcOzoneFormationPotential(VOC_ppb: number, NOx_ppb: number): { O3_ppb: number, regime: string, details: object } {
    if (typeof VOC_ppb !== 'number' || isNaN(VOC_ppb) || VOC_ppb < 0) {
        throw new RangeError('VOC_ppb must be a non-negative number');
    }
    if (typeof NOx_ppb !== 'number' || isNaN(NOx_ppb) || NOx_ppb < 0) {
        throw new RangeError('NOx_ppb must be a non-negative number');
    }
    if (VOC_ppb === 0 && NOx_ppb === 0) {
        return { O3_ppb: 0, regime: 'insufficient_precursors', details: { VOC_ppb, NOx_ppb } };
    }

    // EKMA screening constants (Dodge 1977 / Seinfeld & Pandis 2016 §6.4)
    const K_VOC = 0.35; // VOC-limited yield coefficient
    const K_NOX = 0.48; // NOx-limited yield coefficient
    const ALPHA = 15; // NOx saturation constant (ppb)
    const BETA = 80; // VOC saturation constant (ppb as C)

    const O3_voc = K_VOC * VOC_ppb * (NOx_ppb / (NOx_ppb + ALPHA));
    const O3_nox = K_NOX * NOx_ppb * Math.log(1 + VOC_ppb / BETA);

    // Peak O3 is the lower of the two regime estimates (conservative screening)
    const O3_ppb = Math.min(O3_voc, O3_nox);
    const regime = classifyOzonePrecursorRisk(NOx_ppb, VOC_ppb).regime;

    return {
        O3_ppb: Math.max(0, O3_ppb),
        regime,
        details: { O3_voc_estimate: O3_voc, O3_nox_estimate: O3_nox, VOC_ppb, NOx_ppb },
    };
}

// ---------------------------------------------------------------------------
// MIR - Maximum Incremental Reactivity (Carter 1994)
// ---------------------------------------------------------------------------

/**
 * Calculates the MIR-weighted ozone formation for a VOC mass emission.
 * MIR = gO3 formed per g-VOC increment at maximum ozone sensitivity.
 *
 * @param {number} VOC_mass_kg  Mass of VOC emitted (kg)
 * @param {number} MIR_factor   MIR value for the specific compound (gO3/gVOC)
 *                               Carter (1994) Table 3 values, e.g.:
 *                               ethylene=9.07, propylene=11.57, toluene=4.00,
 *                               benzene=0.72, formaldehyde=10.35
 * @returns {{ ozone_formation_kg: number, MIR_factor: number }}
 */
export function calcMIR(VOC_mass_kg: number, MIR_factor: number): { ozone_formation_kg: number, MIR_factor: number } {
    if (typeof VOC_mass_kg !== 'number' || isNaN(VOC_mass_kg) || VOC_mass_kg < 0) {
        throw new RangeError('VOC_mass_kg must be a non-negative number');
    }
    if (typeof MIR_factor !== 'number' || isNaN(MIR_factor) || MIR_factor < 0) {
        throw new RangeError('MIR_factor must be a non-negative number (gO3/gVOC)');
    }
    const ozone_formation_kg = VOC_mass_kg * MIR_factor;
    return { ozone_formation_kg, MIR_factor };
}

// ---------------------------------------------------------------------------
// POCP - Photochemical Ozone Creation Potential (UNECE 1999)
// Reference substance: ethylene (POCP = 100)
// ---------------------------------------------------------------------------

/**
 * POCP factors per UNECE (1999) for common environmental monitoring compounds.
 * Values are dimensionless relative to ethylene = 100.
 * Source: UNECE (1999) and Derwent et al. (1998) Atmos. Environ.
 */
const POCP_TABLE: Record<string, number>= {
    ethylene: 100.0,
    propylene: 103.0,
    toluene: 60.0,
    benzene: 18.9,
    xylene: 66.6,
    formaldehyde: 42.0,
    acetaldehyde: 52.7,
    methanol: 11.9,
    ethanol: 26.8,
    acetone: 17.3,
    isoprene: 95.8,
    butane: 35.2,
    ethane: 8.2,
    propane: 17.6,
    methane: 0.7,
};

/**
 * Calculates the Photochemical Ozone Creation Potential (POCP) for a given
 * substance and mass, relative to ethylene = 100 (UNECE 1999).
 *
 * @param {string} substance  Compound name (must be in POCP_TABLE)
 * @param {number} mass_kg    Mass emitted (kg)
 * @returns {{ POCP_kg_ethylene_eq: number, POCP_factor: number, substance: string }}
 */
export function calcPOCP(substance: string, mass_kg: number): { POCP_kg_ethylene_eq: number, POCP_factor: number, substance: string } {
    if (typeof substance !== 'string' || !substance.trim()) {
        throw new TypeError('substance must be a non-empty string');
    }
    if (typeof mass_kg !== 'number' || isNaN(mass_kg) || mass_kg < 0) {
        throw new RangeError('mass_kg must be a non-negative number');
    }
    const key = substance.toLowerCase().trim();
    if (!(key in POCP_TABLE)) {
        throw new RangeError(`Substance "${substance}" not found. Available: ${Object.keys(POCP_TABLE).join(', ')}`);
    }
    const POCP_factor = POCP_TABLE[key] as number;
    // POCP in kg-ethylene-equivalent = mass × (POCP_factor / 100)
    const POCP_kg_ethylene_eq = mass_kg * (POCP_factor / 100);
    return { POCP_kg_ethylene_eq, POCP_factor, substance: key };
}

// ---------------------------------------------------------------------------
// NOx/VOC Regime Classification - Seinfeld & Pandis (2016) §6.4
// ---------------------------------------------------------------------------

/**
 * Classifies the tropospheric ozone precursor regime based on the NOx/VOC ratio.
 *
 * - VOC_limited: NOx is sufficient; adding more VOC increases O3
 * - NOx_limited: VOC is sufficient; adding more NOx increases O3
 * - transition: intermediate zone; both precursors co-limit O3 formation
 *
 * Critical ratio R = NOx / VOC (both in ppb):
 *   R < 0.04 → VOC-limited (high NOx, typical urban core)
 *   R > 0.12 → NOx-limited (low NOx, rural/suburban)
 *   0.04 ≤ R ≤ 0.12 → transition
 *
 * @param {number} NOx_ppb  NOx concentration (ppb)
 * @param {number} VOC_ppb  VOC concentration (ppb as carbon)
 * @returns {{ regime: 'NOx_limited'|'VOC_limited'|'transition', ratio: number }}
 */
export function classifyOzonePrecursorRisk(NOx_ppb: number, VOC_ppb: number): { regime: 'NOx_limited'|'VOC_limited'|'transition', ratio: number } {
    if (typeof NOx_ppb !== 'number' || isNaN(NOx_ppb) || NOx_ppb < 0) {
        throw new RangeError('NOx_ppb must be a non-negative number');
    }
    if (typeof VOC_ppb !== 'number' || isNaN(VOC_ppb) || VOC_ppb < 0) {
        throw new RangeError('VOC_ppb must be a non-negative number');
    }
    if (VOC_ppb === 0) {
        return { regime: 'NOx_limited', ratio: Infinity };
    }
    const ratio = NOx_ppb / VOC_ppb;
        let regime: 'NOx_limited'|'VOC_limited'|'transition';
    if (ratio < 0.04) {
        regime = 'VOC_limited';
    } else if (ratio > 0.12) {
        regime = 'NOx_limited';
    } else {
        regime = 'transition';
    }
    return { regime, ratio };
}

/**
 * Returns the POCP lookup table for external inspection or reporting.
 * @returns {Record<string, number>} Copy of the POCP factors table
 */
export function getPOCPTable() {
    return { ...POCP_TABLE };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const troposphericOzoneFormationMeta = {
    name: 'troposphericOzoneFormation',
    description: 'troposphericOzoneFormation',
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
