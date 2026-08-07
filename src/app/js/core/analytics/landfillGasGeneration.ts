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
 * @fileoverview Landfill Gas Generation - LandGEM model (EPA AP-42 + IPCC 2006 Waste)
 *
 * Implements the EPA LandGEM v3.02 first-order decay model for estimating
 * methane and total landfill gas generation rates, plus IPCC Tier 2 gas
 * potential estimation from waste composition.
 *
 * References:
 *   EPA (2005). LandGEM v3.02 Landfill Gas Emissions Model, EPA-600/R-05/047.
 *   IPCC (2006). Guidelines for National Greenhouse Gas Inventories, Vol. 5, Waste, Ch. 3.
 *   Tchobanoglous, G. et al. (1993). Integrated Solid Waste Management. ISBN 978-0-07-063237-9.
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
 * Default first-order decay rate constants (yr⁻¹) by climate.
 * Source: EPA LandGEM v3.02 Table 2-1.
 */
const K_DEFAULTS = {
    wet: 0.04, // Annual precipitation > 1000 mm
    dry: 0.02, // Annual precipitation < 500 mm
    moderate: 0.03,
};

/**
 * Default methane generation potential by waste type (m³ CH4 / Mg waste).
 * Source: EPA LandGEM v3.02 Table 2-2.
 */
const L0_DEFAULTS = {
    municipal: 170,
    food_waste: 200,
    wood: 100,
    paper: 150,
};

/**
 * Risk thresholds (ppmv) for common landfill gases.
 * CH4: LEL = 50 000 ppm (5% v/v); alert at 10% LEL per OSHA 29 CFR 1910.146.
 * H2S: IDLH = 100 ppm (NIOSH); alert = 10 ppm (OSHA PEL).
 * CO2: IDLH = 40 000 ppm; alert = 5000 ppm (OSHA PEL / ACGIH TLV-TWA).
 */
const THRESHOLDS: Record<string, { alert: number; danger: number }> = {
    CH4: { alert: 5_000, danger: 50_000 },
    H2S: { alert: 10, danger: 100 },
    CO2: { alert: 5_000, danger: 40_000 },
};

/**
 * Calculates annual CH4 generation rate using the EPA LandGEM first-order decay model.
 *
 * Q_CH4(t) = k * L0 * M * exp(-k * (t - t_accept))   for t > t_accept, else 0
 *
 * @param {number} mass_Mg      - Total waste mass accepted (Mg, i.e. metric tons)
 * @param {number} k            - First-order decay rate (yr⁻¹); default 0.04 (wet climate)
 * @param {number} L0           - Methane generation potential (m³ CH4 / Mg); default 170
 * @param {number} t            - Current year (yr, relative to site open)
 * @param {number} t_accept     - Year waste was accepted (yr, relative to site open); default 0
 * @returns {{ Q_CH4_m3_yr: number, Q_LFG_m3_yr: number }}
 *   Q_CH4_m3_yr - CH4 generation rate (m³/yr)
 *   Q_LFG_m3_yr - Total LFG at 50% CH4 (m³/yr)
 */
export function calcLandGEMEmission(
    mass_Mg: number,
    k: number = K_DEFAULTS.wet,
    L0: number = L0_DEFAULTS.municipal,
    t: number = 1,
    t_accept: number = 0,
): { Q_CH4_m3_yr: number; Q_LFG_m3_yr: number } {
    if (typeof mass_Mg !== 'number' || mass_Mg < 0) {
        throw new RangeError('mass_Mg must be a non-negative number (Mg)');
    }
    if (typeof k !== 'number' || k <= 0) {
        throw new RangeError('k must be a positive decay rate (yr⁻¹)');
    }
    if (typeof L0 !== 'number' || L0 <= 0) {
        throw new RangeError('L0 must be a positive methane potential (m³/Mg)');
    }

    const age = t - t_accept;
    if (age <= 0) {
        return { Q_CH4_m3_yr: 0, Q_LFG_m3_yr: 0 };
    }

    // LandGEM Equation 2-1: Q = k * L0 * M_i * exp(-k * t_ij)
    const Q_CH4 = k * L0 * mass_Mg * Math.exp(-k * age);
    // Typical LFG composition: ~50% CH4, ~50% CO2
    const Q_LFG = Q_CH4 / 0.5;

    return {
        Q_CH4_m3_yr: Q_CH4,
        Q_LFG_m3_yr: Q_LFG,
    };
}

/**
 * Calculates methane generation potential (L0) from waste composition using IPCC Tier 2.
 *
 * L0 = DOCf * MCF * DOC * F * (16/12) * (1000/1)   [converted to m³ CH4/Mg at STP]
 * Note: simplified form; full IPCC uses normalisation by 16/44 (CH4 fraction of CO2e).
 *
 * @param {number} docf  - Fraction of degradable organic carbon that decomposes (0–1); typ. 0.5–0.6
 * @param {number} mcf   - Methane correction factor (0–1); 1.0 for managed anaerobic landfill
 * @param {number} doc   - Fraction of degradable organic carbon in waste (0–1); typ. 0.15–0.20 MSW
 * @returns {{ L0_m3_per_Mg: number, description: string }}
 */
export function calcGasPotential(
    docf: number,
    mcf: number,
    doc: number,
): { L0_m3_per_Mg: number; description: string } {
    if (typeof docf !== 'number' || docf < 0 || docf > 1) {
        throw new RangeError('docf must be between 0 and 1');
    }
    if (typeof mcf !== 'number' || mcf < 0 || mcf > 1) {
        throw new RangeError('mcf must be between 0 and 1');
    }
    if (typeof doc !== 'number' || doc < 0 || doc > 1) {
        throw new RangeError('doc must be between 0 and 1');
    }

    // IPCC 2006 Eq. 3.1 derived: CH4 mass (Gg/Gg waste) * density conversion
    // CH4_mass_frac = DOCf * MCF * DOC * F (F=0.5, CH4 fraction of biogas)
    const F = 0.5; // fraction CH4 in biogas (IPCC default)
    const CH4_mass_fraction = docf * mcf * doc * F; // kg CH4 / kg waste

    // Convert to m³ CH4 / Mg waste: density CH4 at STP = 0.716 kg/m³
    const CH4_density_kg_m3 = 0.716;
    const L0 = (CH4_mass_fraction * 1000) / CH4_density_kg_m3; // m³ CH4 / Mg waste

    return {
        L0_m3_per_Mg: L0,
        description: `IPCC Tier 2: DOCf=${docf}, MCF=${mcf}, DOC=${doc} → L0=${L0.toFixed(1)} m³/Mg`,
    };
}

/**
 * Calculates electrical energy recovery from landfill gas collection.
 *
 * E = Q_CH4 * HHV_CH4 * eff_elec / 3600   [MWh/yr]
 * HHV CH4 = 39.8 MJ/m³ (at STP, 0°C, 101.325 kPa)
 *
 * @param {number} Q_m3_yr   - Collected CH4 flow rate (m³/yr)
 * @param {number} eff_elec  - Generator electrical efficiency (0–1); typical 0.28–0.35 for ICE
 * @returns {{ E_MWh_yr: number, E_kWh_yr: number, capacityFactor_kW: number }}
 */
export function calcEnergyRecovery(
    Q_m3_yr: number,
    eff_elec: number = 0.3,
): { E_MWh_yr: number; E_kWh_yr: number; capacityFactor_kW: number } {
    if (typeof Q_m3_yr !== 'number' || Q_m3_yr < 0) {
        throw new RangeError('Q_m3_yr must be a non-negative number');
    }
    if (typeof eff_elec !== 'number' || eff_elec <= 0 || eff_elec > 1) {
        throw new RangeError('eff_elec must be between 0 and 1 exclusive');
    }

    const HHV_MJ_m3 = 39.8; // Higher heating value of CH4 at STP
    const E_MJ_yr = Q_m3_yr * HHV_MJ_m3 * eff_elec;
    const E_MWh_yr = E_MJ_yr / 3600;
    const E_kWh_yr = E_MWh_yr * 1000;
    const capacityFactor_kW = E_kWh_yr / 8760; // average continuous power (kW)

    return {
        E_MWh_yr,
        E_kWh_yr,
        capacityFactor_kW,
    };
}

/**
 * Classifies landfill gas concentration risk level for key gases.
 *
 * @param {number} concentration_ppm  - Gas concentration (ppmv)
 * @param {'CH4'|'H2S'|'CO2'} gas     - Gas identifier
 * @returns {'safe'|'alert'|'danger'}
 */
export function classifyLandfillGasRisk(
    concentration_ppm: number,
    gas: 'CH4' | 'H2S' | 'CO2',
): 'safe' | 'alert' | 'danger' {
    if (typeof concentration_ppm !== 'number' || concentration_ppm < 0) {
        throw new RangeError('concentration_ppm must be a non-negative number');
    }
    const thresholds = THRESHOLDS[gas];
    if (!thresholds) {
        throw new TypeError(`Unsupported gas identifier: ${gas}. Supported: CH4, H2S, CO2`);
    }

    if (concentration_ppm >= thresholds.danger) return 'danger';
    if (concentration_ppm >= thresholds.alert) return 'alert';
    return 'safe';
}

/**
 * Estimates cumulative CH4 generated over the full site life.
 * Integrates the LandGEM decay curve from t_accept to t_close + projection years.
 *
 * @param {number} mass_Mg       - Waste mass accepted (Mg)
 * @param {number} k             - Decay rate (yr⁻¹)
 * @param {number} L0            - Methane potential (m³/Mg)
 * @param {number} projectYears  - Years to project after waste acceptance
 * @returns {{ totalCH4_m3: number, halfLifeYears: number }}
 */
export function calcCumulativeCH4(
    mass_Mg: number,
    k: number = K_DEFAULTS.wet,
    L0: number = L0_DEFAULTS.municipal,
    projectYears: number = 100,
): { totalCH4_m3: number; halfLifeYears: number } {
    if (typeof mass_Mg !== 'number' || mass_Mg < 0) throw new RangeError('mass_Mg must be >= 0');
    if (typeof projectYears !== 'number' || projectYears <= 0) throw new RangeError('projectYears must be > 0');

    // Analytical integral of LandGEM: ∫₀ᵀ k*L0*M*exp(-k*t) dt = L0*M*(1 - exp(-k*T))
    const totalCH4_m3 = L0 * mass_Mg * (1 - Math.exp(-k * projectYears));
    const halfLifeYears = Math.LN2 / k;

    return { totalCH4_m3, halfLifeYears };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const landfillGasGenerationMeta: AnalyticsModuleMeta = {
    name: 'landfillGasGeneration',
    description: 'landfillGasGeneration',
    category: 'analytics',
    familyTags: ['landfill'],
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
