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
 * Tunnel Water Ingress Model
 * Implements the Goodman (1965) analytical solution for steady-state tunnel
 * inflow from a saturated aquifer, Darcy's Law, grouting effectiveness,
 * and ITA WG12 risk classification for tunnel water ingress.
 *
 * References:
 *   - Goodman R.E., Moye D.G., Van Schalkwyk A., Javandel I. (1965) Ground
 *     water inflows during tunnel driving. Engineering Geology 2(1):39-56.
 *     Proc. 6th Symposium on Rock Mechanics, Rolla MO, 1964.
 *   - Darcy H. (1856) Les fontaines publiques de la ville de Dijon. Victor Dalmont, Paris.
 *   - ITA-AITES Working Group 12 (2007) Recommendations on the development of
 *     underground space. ITA Report 004. International Tunnelling Association.
 *   - Lei (1999) Numerische Berechnung von Tunnelzufluss. Norwegian University of
 *     Science and Technology thesis (validates Goodman eq.).
 *
 * @module tunnelWaterIngressModel
 */

'use strict';

const TWO_PI = 2 * Math.PI;

interface GoodmanInflowResult {
    inflow_m3_s: number;
    inflow_per_meter_m3_s_m: number;
    inflow_L_s: number;
    inflow_L_s_m: number;
}

/**
 * Calculates steady-state groundwater inflow per unit length of circular tunnel
 * using the Goodman (1965) analytical solution.
 *
 * Q/L = 2πKH / ln(2H/r)
 *
 * Assumptions: homogeneous isotropic aquifer, fully saturated, tunnel below
 * water table, steady-state conditions, H >> r (depth much greater than radius).
 *
 * @param {number} K_m_s   Hydraulic conductivity (m/s)
 * @param {number} H_m     Depth to tunnel axis below water table (m)
 * @param {number} r_m     Tunnel radius (m)
 * @param {number} L_m     Tunnel section length (m); returns total if > 1
 * @returns {{ inflow_m3_s: number, inflow_per_meter_m3_s_m: number,
 *             inflow_L_s: number, inflow_L_s_m: number }}
 */
export function calcGoodmanInflow(K_m_s: number, H_m: number, r_m: number, L_m: number = 1): GoodmanInflowResult {
    if (typeof K_m_s !== 'number' || isNaN(K_m_s) || K_m_s <= 0) {
        throw new RangeError('K_m_s (hydraulic conductivity) must be > 0');
    }
    if (typeof H_m !== 'number' || isNaN(H_m) || H_m <= 0) {
        throw new RangeError('H_m (depth to water table) must be > 0');
    }
    if (typeof r_m !== 'number' || isNaN(r_m) || r_m <= 0) {
        throw new RangeError('r_m (tunnel radius) must be > 0');
    }
    if (H_m <= r_m) {
        throw new RangeError('H_m must be > r_m (tunnel must be below water table)');
    }
    if (typeof L_m !== 'number' || isNaN(L_m) || L_m <= 0) {
        throw new RangeError('L_m (tunnel length) must be > 0');
    }

    // Goodman (1965) eq.: Q/L = 2πKH / ln(2H/r)
    const inflow_per_meter_m3_s_m = (TWO_PI * K_m_s * H_m) / Math.log((2 * H_m) / r_m);
    const inflow_m3_s = inflow_per_meter_m3_s_m * L_m;

    return {
        inflow_m3_s,
        inflow_per_meter_m3_s_m,
        inflow_L_s: inflow_m3_s * 1000,
        inflow_L_s_m: inflow_per_meter_m3_s_m * 1000,
    };
}

interface DarcyInflowResult {
    inflow_m3_s: number;
    inflow_L_s: number;
    darcy_velocity_m_s: number;
}

/**
 * Calculates groundwater inflow using Darcy's Law: Q = K × i × A
 *
 * Used for planar seepage faces (e.g., cut slopes, retaining structures)
 * or as a cross-check for the Goodman analytical solution.
 *
 * @param {number} K                Hydraulic conductivity (m/s)
 * @param {number} hydraulicGradient Hydraulic gradient i = Δh/ΔL (dimensionless)
 * @param {number} area_m2          Cross-sectional area perpendicular to flow (m²)
 * @returns {{ inflow_m3_s: number, inflow_L_s: number, darcy_velocity_m_s: number }}
 */
export function calcDarcyInflow(K: number, hydraulicGradient: number, area_m2: number): DarcyInflowResult {
    if (typeof K !== 'number' || isNaN(K) || K <= 0) {
        throw new RangeError('K (hydraulic conductivity) must be > 0');
    }
    if (typeof hydraulicGradient !== 'number' || isNaN(hydraulicGradient) || hydraulicGradient <= 0) {
        throw new RangeError('hydraulicGradient must be > 0');
    }
    if (typeof area_m2 !== 'number' || isNaN(area_m2) || area_m2 <= 0) {
        throw new RangeError('area_m2 must be > 0');
    }

    const darcy_velocity_m_s = K * hydraulicGradient;
    const inflow_m3_s = darcy_velocity_m_s * area_m2;

    return {
        inflow_m3_s,
        inflow_L_s: inflow_m3_s * 1000,
        darcy_velocity_m_s,
    };
}

interface GroutingEffectivenessResult {
    effectiveness_pct: number;
    conductivity_ratio: number;
    reduction_factor: number;
}

/**
 * Calculates grouting effectiveness as reduction in hydraulic conductivity.
 * Grouting seals fractures, reducing K by 1-3 orders of magnitude in practice
 * (ITA WG12 2007; Brantberger et al. 1998 Tunnelling and Underground Space Technology).
 *
 * Effectiveness = (1 - K_after/K_before) × 100 (%)
 *
 * @param {number} K_before  Hydraulic conductivity before grouting (m/s)
 * @param {number} K_after   Hydraulic conductivity after grouting (m/s)
 * @returns {{ effectiveness_pct: number, conductivity_ratio: number,
 *             reduction_factor: number }}
 */
export function calcGroutingEffectiveness(K_before: number, K_after: number): GroutingEffectivenessResult {
    if (typeof K_before !== 'number' || isNaN(K_before) || K_before <= 0) {
        throw new RangeError('K_before must be > 0');
    }
    if (typeof K_after !== 'number' || isNaN(K_after) || K_after < 0) {
        throw new RangeError('K_after must be >= 0');
    }
    if (K_after > K_before) {
        throw new RangeError('K_after must be <= K_before (grouting cannot increase conductivity)');
    }

    const conductivity_ratio = K_after / K_before;
    const effectiveness_pct = (1 - conductivity_ratio) * 100;
    const reduction_factor = K_before / (K_after > 0 ? K_after : Number.EPSILON);

    return { effectiveness_pct, conductivity_ratio, reduction_factor };
}

// ---------------------------------------------------------------------------
// ITA WG12 (2007) Tunnel Water Ingress Risk Classification
// Based on field measurement reporting guidelines for tunnel drainage
// ---------------------------------------------------------------------------

interface IngressClass {
    max: number;
    label: string;
    description: string;
}

/** ITA WG12 (2007) classification thresholds for tunnel water ingress (L/s/m) */
const ITA_INGRESS_CLASSES: IngressClass[] = [
    { max: 0.0001, label: 'dry', description: 'No visible seepage' },
    { max: 0.001, label: 'damp', description: 'Surface dampness, no drips' },
    { max: 0.01, label: 'wet', description: 'Visible seepage, localized drips' },
    { max: 0.1, label: 'dripping', description: 'Continuous dripping, minor flows' },
    { max: Infinity, label: 'flowing', description: 'Significant water flow, pumping required' },
];

interface IngressRiskResult {
    classification: string;
    description: string;
    inflow_L_s_m: number;
    requiresPumping: boolean;
}

/**
 * Classifies tunnel water ingress risk per ITA WG12 (2007) reporting categories.
 *
 * @param {number} inflow_L_s_m  Water inflow rate per unit tunnel length (L/s/m)
 * @returns {{ classification: string, description: string, inflow_L_s_m: number,
 *             requiresPumping: boolean }}
 */
export function classifyTunnelWaterIngressRisk(inflow_L_s_m: number): IngressRiskResult {
    if (typeof inflow_L_s_m !== 'number' || isNaN(inflow_L_s_m) || inflow_L_s_m < 0) {
        throw new RangeError('inflow_L_s_m must be a non-negative number');
    }

    // Safe: last entry has max=Infinity so find() always returns a class
    const cls = ITA_INGRESS_CLASSES.find((c) => inflow_L_s_m <= c.max)!;
    return {
        classification: cls.label,
        description: cls.description,
        inflow_L_s_m,
        requiresPumping: cls.label === 'flowing',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tunnelWaterIngressModelMeta = {
    name: 'tunnelWaterIngressModel',
    description: 'tunnelWaterIngressModel',
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
