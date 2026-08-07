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
 * Lake Stratification Model - Brunt-Väisälä frequency + Schmidt stability
 *
 * References:
 *   Idso SB (1973) On the concept of lake stability. Limnology and Oceanography
 *     18(4):681-683. DOI:10.4319/lo.1973.18.1.0207
 *   Brunt D (1927) The period of simple vertical oscillations in the atmosphere.
 *     Q. J. R. Meteorol. Soc. 53:30-32. DOI:10.1002/qj.49705322103
 *   Väisälä V (1925) Über die Wirkung der Windschwankungen auf die Pilotbeobachtungen.
 *     Soc. Sci. Fenn. Comment. Phys.-Math. 2(19):19-37.
 *   Read JS et al. (2011) Derivation of lake mixing and stratification indices.
 *     Inland Waters 1(1):25-33. DOI:10.5268/IW-1.1.316
 */

'use strict';

const G_DEFAULT = 9.80665; // m/s² (standard gravity, ISO 80000-3)

/**
 * Calculates the squared Brunt-Väisälä buoyancy frequency N².
 * Positive N² indicates stable stratification; negative = convective instability.
 *
 * Equação: N² = -(g/ρ) × (dρ/dz)   where dρ/dz = (rho2 - rho1)/dz (upward z positive)
 *
 * @param {number} rho1 - Water density at upper layer (kg/m³). Must be > 0.
 * @param {number} rho2 - Water density at lower layer (kg/m³). Must be > 0.
 * @param {number} dz - Vertical distance between layers (m). Must be > 0.
 * @param {number} [g=9.80665] - Gravitational acceleration (m/s²). Must be > 0.
 * @returns {number} N² (s⁻²). Positive = stable, negative = unstable.
 */
export function calcBruntVaisalaFrequency(rho1: number, rho2: number, dz: number, g: number = G_DEFAULT): number {
    if ([rho1, rho2, dz, g].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('calcBruntVaisalaFrequency: all parameters must be finite numbers');
    }
    if (rho1 <= 0) throw new RangeError('calcBruntVaisalaFrequency: rho1 must be > 0');
    if (rho2 <= 0) throw new RangeError('calcBruntVaisalaFrequency: rho2 must be > 0');
    if (dz <= 0) throw new RangeError('calcBruntVaisalaFrequency: dz must be > 0');
    if (g <= 0) throw new RangeError('calcBruntVaisalaFrequency: g must be > 0');

    const rhoMean = (rho1 + rho2) / 2;
    // dρ/dz with z positive upward: rho2 is below rho1 → dρ/dz = (rho1 - rho2) / dz
    const drho_dz = (rho1 - rho2) / dz;
    return -(g / rhoMean) * drho_dz;
}

/**
 * Calculates Schmidt stability - the work required to mix the entire water column
 * to a uniform density (Idso 1973).
 *
 * S = (g/A_s) × Σ [(rho_z - rho_v) × z × A_z × dz]
 *
 * where rho_v is the volume-weighted mean density.
 *
 * @param {number[]} tempProfile - Temperatures at each layer (°C), top to bottom.
 * @param {number[]} rho_profile - Densities at each layer (kg/m³), top to bottom.
 * @param {number} area_m2 - Surface area of the lake (m²). Must be > 0.
 * @param {number} depth_m - Total depth (m). Must be > 0.
 * @returns {number} Schmidt stability S (J/m²). Higher = more stable.
 */
export function calcSchmidtStability(
    tempProfile: number[],
    rho_profile: number[],
    area_m2: number,
    depth_m: number,
): number {
    if (!Array.isArray(tempProfile) || !Array.isArray(rho_profile)) {
        throw new TypeError('calcSchmidtStability: tempProfile and rho_profile must be arrays');
    }
    if (tempProfile.length !== rho_profile.length || tempProfile.length < 2) {
        throw new RangeError('calcSchmidtStability: arrays must be the same length and have >= 2 elements');
    }
    if (area_m2 <= 0) throw new RangeError('calcSchmidtStability: area_m2 must be > 0');
    if (depth_m <= 0) throw new RangeError('calcSchmidtStability: depth_m must be > 0');

    const n = rho_profile.length;
    const dz = depth_m / (n - 1);

    // Volume-weighted mean density (assuming uniform cross-section for simplicity)
    const totalVol = depth_m * area_m2;
    let sumRhoVol = 0;
    for (let i = 0; i < n; i++) {
        const weight = i === 0 || i === n - 1 ? 0.5 : 1;
        sumRhoVol += rho_profile[i]! * weight * dz * area_m2;
    }
    const rho_v = sumRhoVol / totalVol;

    // Schmidt stability integral
    let S = 0;
    for (let i = 0; i < n; i++) {
        const z = i * dz; // depth from surface (m)
        const weight = i === 0 || i === n - 1 ? 0.5 : 1;
        S += (rho_profile[i]! - rho_v) * z * area_m2 * dz * weight;
    }

    return (G_DEFAULT / area_m2) * S;
}

/**
 * Finds thermocline depth as the depth of maximum temperature gradient.
 *
 * @param {number[]} tempProfile - Temperatures at each layer (°C), top to bottom. Length >= 2.
 * @param {number[]} depths - Corresponding depths (m), same length as tempProfile.
 * @returns {{depth_m: number, gradient_C_per_m: number, layer_index: number}}
 */
export function calcThermoclineDepth(
    tempProfile: number[],
    depths: number[],
): { depth_m: number; gradient_C_per_m: number; layer_index: number } {
    if (!Array.isArray(tempProfile) || !Array.isArray(depths)) {
        throw new TypeError('calcThermoclineDepth: tempProfile and depths must be arrays');
    }
    if (tempProfile.length !== depths.length || tempProfile.length < 2) {
        throw new RangeError('calcThermoclineDepth: arrays must match in length and have >= 2 elements');
    }

    let maxGradient = -Infinity;
    let maxIndex = 0;

    for (let i = 0; i < tempProfile.length - 1; i++) {
        const dT = Math.abs(tempProfile[i]! - tempProfile[i + 1]!);
        const dz = Math.abs(depths[i + 1]! - depths[i]!);
        if (dz === 0) continue;
        const gradient = dT / dz;
        if (gradient > maxGradient) {
            maxGradient = gradient;
            maxIndex = i;
        }
    }

    return {
        depth_m: (depths[maxIndex]! + depths[maxIndex + 1]!) / 2,
        gradient_C_per_m: maxGradient,
        layer_index: maxIndex,
    };
}

/**
 * Classifies lake mixing regime based on thermal stratification pattern.
 * Uses surface-to-bottom temperature difference and profile shape.
 *
 * Classification per Hutchinson & Löffler (1956) + Wetzel (2001):
 *   'monomictic'  - one mixing period/year (tropical/warm temperate)
 *   'dimictic'    - two mixing periods (cold temperate, 4°C inversions)
 *   'polymictic'  - frequent/continuous mixing (shallow/wind-exposed)
 *   'meromictic'  - permanently stratified layers (chemical/saline barrier)
 *
 * Heuristic rules (simplified for absence of multi-year time series):
 *   |deltaT| < 1 °C throughout → polymictic
 *   Bottom temp < 4 °C AND surface > 10 °C → dimictic candidate
 *   Surface-bottom deltaT > 20 °C with strong thermocline → monomictic
 *   Maximum deltaT in ANY adjacent pair < 0.1 °C/m → meromictic (chemical barrier assumed)
 *
 * @param {number[]} tempProfile - Temperatures (°C), top to bottom. Length >= 3.
 * @returns {'monomictic'|'dimictic'|'polymictic'|'meromictic'} Mixing regime.
 */
export function classifyLakeMixing(tempProfile: number[]): 'monomictic' | 'dimictic' | 'polymictic' | 'meromictic' {
    if (!Array.isArray(tempProfile) || tempProfile.length < 3) {
        throw new RangeError('classifyLakeMixing: tempProfile must be an array with >= 3 elements');
    }

    const surface = tempProfile[0]!;
    const bottom = tempProfile[tempProfile.length - 1]!;
    const deltaT = Math.abs(surface - bottom);

    // Check for very uniform column → polymictic
    const maxGrad = tempProfile.slice(0, -1).reduce((max, t, i) => {
        return Math.max(max, Math.abs(t - tempProfile[i + 1]!));
    }, 0);
    if (deltaT < 1) return 'polymictic';

    // Meromictic heuristic: very low inter-layer gradients despite temperature difference
    // (chemical stratification - not thermal)
    if (maxGrad < 0.1 && deltaT > 2) return 'meromictic';

    // Dimictic: cold bottom (near 4°C) + warm surface
    if (bottom <= 5 && surface >= 10) return 'dimictic';

    // Monomictic: strong single thermocline
    if (deltaT >= 20) return 'monomictic';

    // Default moderate stratification → monomictic
    return 'monomictic';
}

/**
 * Converts temperature (°C) to water density (kg/m³) using Kell (1975) equation.
 * Valid for 0–100 °C at 1 atm.
 * Reference: Kell GS (1975) J. Chem. Eng. Data 20(1):97-105. DOI:10.1021/je60064a005
 *
 * @param {number} T_C - Temperature in °C.
 * @returns {number} Density (kg/m³).
 */
export function tempToDensity(T_C: number): number {
    if (typeof T_C !== 'number' || !isFinite(T_C)) {
        throw new TypeError('tempToDensity: T_C must be a finite number');
    }
    if (T_C < 0 || T_C > 100) {
        throw new RangeError('tempToDensity: T_C must be between 0 and 100 °C');
    }

    // Kell (1975) polynomial coefficients
    const num =
        999.83952 +
        16.945176 * T_C -
        7.9870401e-3 * T_C ** 2 -
        46.170461e-6 * T_C ** 3 +
        105.56302e-9 * T_C ** 4 -
        280.54253e-12 * T_C ** 5;
    const den = 1 + 16.87985e-3 * T_C;
    return num / den;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const lakeStratificationModelMeta = {
    name: 'lakeStratificationModel',
    description: 'lakeStratificationModel',
    category: 'analytics',
    familyTags: ['lake'],
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
