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
 * @module industrialElectrochemicalCorrosion
 * @description Electrochemical corrosion calculations - Stern-Geary linear
 * polarisation resistance, Faraday's law corrosion rate, and ISO 9226 severity
 * classification.
 *
 * References:
 * - Stern, M. & Geary, A.L. (1957). Electrochemical polarization: I. A theoretical
 *   analysis of the shape of polarization curves. J. Electrochem. Soc. 104(1):56-63.
 *   DOI: 10.1149/1.2428496
 * - ISO 9226:2012. Corrosion of metals and alloys - Corrosivity of atmospheres -
 *   Method of determination of corrosion rate of standard specimens for the
 *   evaluation of corrosivity.
 * - Pourbaix, M. (1966). Atlas of Electrochemical Equilibria in Aqueous Solutions.
 *   Pergamon Press, Oxford. ISBN 978-0-915567-98-2.
 * - Jones, D.A. (1996). Principles and Prevention of Corrosion (2nd ed.).
 *   Prentice Hall. ISBN 0-13-359993-0.
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

/** Faraday's constant F = 96485 C/mol */
// eslint-disable-next-line
const FARADAY = 96485;

/**
 * Calculate corrosion rate from corrosion current density using Faraday's law.
 *
 * CR (mm/yr) = (icorr × EW) / (ρ × F) × K
 * where K = 3.27×10⁻³ (unit conversion constant for mm/yr when icorr in µA/cm²)
 *
 * @param icorr_uA_cm2    - Corrosion current density (µA/cm²), >0
 * @param equivalentWeight - Equivalent weight of metal (g/eq), >0
 * @param density          - Metal density (g/cm³), >0
 */
export function calcCorrosionRate(
    icorr_uA_cm2: number,
    equivalentWeight: number,
    density: number,
): { corrosionRate_mm_yr: number } {
    if (icorr_uA_cm2 <= 0) {
        throw new RangeError('Corrosion current density must be positive (µA/cm²).');
    }
    if (equivalentWeight <= 0) {
        throw new RangeError('Equivalent weight must be positive (g/eq).');
    }
    if (density <= 0) {
        throw new RangeError('Density must be positive (g/cm³).');
    }
    // K = 3.27e-3 mm·g / (µA·cm·yr) - derived from Faraday unit conversion
    // CR = K × icorr × EW / density
    const K = 3.27e-3;
    const corrosionRate_mm_yr = (K * icorr_uA_cm2 * equivalentWeight) / density;
    return { corrosionRate_mm_yr };
}

/**
 * Calculate Stern-Geary constant B from anodic and cathodic Tafel slopes.
 *
 * B = (βa × βc) / (2.303 × (βa + βc))   [Stern & Geary 1957, eq. 1]
 *
 * @param betaA - Anodic Tafel slope βa (mV/decade), >0
 * @param betaC - Cathodic Tafel slope βc (mV/decade), >0
 */
export function calcSternGearyConstant(betaA: number, betaC: number): { B_mV: number } {
    if (betaA <= 0) {
        throw new RangeError('Anodic Tafel slope must be positive (mV/decade).');
    }
    if (betaC <= 0) {
        throw new RangeError('Cathodic Tafel slope must be positive (mV/decade).');
    }
    const B_mV = (betaA * betaC) / (2.303 * (betaA + betaC));
    return { B_mV };
}

/**
 * Calculate linear polarisation resistance from Stern-Geary constant and i_corr.
 *
 * Rp = B / i_corr   [Stern & Geary 1957]
 *
 * @param B_mV        - Stern-Geary constant (mV), >0
 * @param icorr_uA_cm2 - Corrosion current density (µA/cm²), >0
 */
export function calcPolarisationResistance(B_mV: number, icorr_uA_cm2: number): { Rp_ohm_cm2: number } {
    if (B_mV <= 0) {
        throw new RangeError('Stern-Geary constant must be positive (mV).');
    }
    if (icorr_uA_cm2 <= 0) {
        throw new RangeError('Corrosion current density must be positive (µA/cm²).');
    }
    // B (mV) / icorr (µA/cm²) → Rp in kΩ·cm² → convert to Ω·cm²: × 1000 / 1 (mV=mA·Ω, µA→mA ×1e-3)
    // B(V) / icorr(A/cm²): B_mV×1e-3 / (icorr_uA_cm2×1e-6) = B_mV/icorr × 1e3  (Ω·cm²)
    const Rp_ohm_cm2 = (B_mV / icorr_uA_cm2) * 1e3;
    return { Rp_ohm_cm2 };
}

/**
 * Classify corrosion severity per ISO 9226:2012 corrosion category.
 *
 * Categories (mass loss criteria for carbon steel, first year exposure):
 * - negligible: <0.013 mm/yr   (C1)
 * - low:        0.013–0.025    (C2)
 * - moderate:   0.025–0.050    (C3)
 * - high:       0.050–0.200    (C4)
 * - very_high:  >0.200         (C5)
 *
 * Note: ISO 9226 primary units are g/m²/yr; 0.013 mm/yr ≈ 100 g/m²/yr for steel.
 * Approximate mm/yr thresholds derived using ρ=7.87 g/cm³.
 *
 * @param rate_mm_yr - Corrosion rate (mm/yr), ≥0
 */
export function classifyCorrosionSeverity(rate_mm_yr: number): {
    severityClass: 'negligible' | 'low' | 'moderate' | 'high' | 'very_high';
    isoCategory: string;
} {
    if (rate_mm_yr < 0) {
        throw new RangeError('Corrosion rate must be non-negative (mm/yr).');
    }
    let severityClass: 'negligible' | 'low' | 'moderate' | 'high' | 'very_high';
    let isoCategory: string;
    if (rate_mm_yr < 0.013) {
        severityClass = 'negligible';
        isoCategory = 'C1';
    } else if (rate_mm_yr < 0.025) {
        severityClass = 'low';
        isoCategory = 'C2';
    } else if (rate_mm_yr < 0.05) {
        severityClass = 'moderate';
        isoCategory = 'C3';
    } else if (rate_mm_yr < 0.2) {
        severityClass = 'high';
        isoCategory = 'C4';
    } else {
        severityClass = 'very_high';
        isoCategory = 'C5';
    }
    return { severityClass, isoCategory };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialElectrochemicalCorrosionMeta: AnalyticsModuleMeta = {
    name: 'industrialElectrochemicalCorrosion',
    description: 'industrialElectrochemicalCorrosion',
    category: 'analytics',
    familyTags: ['industrial', 'chemical'],
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
