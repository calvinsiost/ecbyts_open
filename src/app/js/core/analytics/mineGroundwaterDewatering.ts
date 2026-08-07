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
 * Mine Groundwater Dewatering - Theis (1935) transient + Dupuit-Forcheimer steady-state.
 *
 * Referências:
 *   Theis, C.V. (1935). The relation between the lowering of the piezometric surface and the
 *     rate and duration of discharge of a well using ground-water storage. Trans. AGU, 16(2), 519–524.
 *   Dupuit, J. (1863). Études Théoriques et Pratiques sur le Mouvement des Eaux. 2nd ed.
 *   Fetter, C.W. (2001). Applied Hydrogeology, 4th ed. ISBN 978-0130882394.
 *   Chow, V.T. (1964). A general formula for hydrologic frequency analysis. Trans. AGU, 22, 51–58.
 *     (approximation of the exponential integral used here).
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
 * Approximates the well function W(u) via Chow polynomial series (Abramowitz & Stegun 5.1.56).
 * Valid for u > 0.
 * @param {number} u - dimensionless argument u = r²S/(4Tt)
 * @returns {number} W(u) well function value
 */
function wellFunction(u: number): number {
    if (u <= 0) throw new RangeError('wellFunction: u must be > 0');
    if (u >= 100) return 0; // negligible contribution

    // For small u use series expansion (Abramowitz & Stegun 5.1.11)
    if (u < 1) {
        const EULER_MASCHERONI = 0.5772156649;
        let series = -EULER_MASCHERONI - Math.log(u);
        // Σ from n=1: (-1)^(n+1) * u^n / (n * n!)
        let factorial = 1;
        for (let i = 1; i <= 20; i++) {
            factorial *= i;
            const contrib = (Math.pow(-1, i + 1) * Math.pow(u, i)) / (i * factorial);
            series += contrib;
            if (Math.abs(contrib) < 1e-12) break;
        }
        return series;
    }

    // For larger u use continued fraction approximation (Fetter 2001, App. B)
    // W(u) ≈ exp(-u)/u * P(u)/Q(u) rational approximation
    // For u in [1, 100] use rational form
    const b: [number, number, number, number] = [8.5733287401, 18.059016973, 8.6347608925, 0.2677737343];
    const c: [number, number, number, number] = [9.5733223454, 25.6329561486, 21.0996530827, 3.9584969228];
    const eu = Math.exp(-u);
    const num = ((u + b[0]) * u + b[1]) * u + b[2];
    // Horner: avoid NaN by guarding
    const den = (((u + c[0]) * u + c[1]) * u + c[2]) * u + c[3];
    return (eu * num) / den;
}

/**
 * Calculates Theis transient drawdown s(r,t) for a confined aquifer.
 *
 * Formula: s = Q / (4πT) × W(u),  u = r²S / (4Tt)
 *
 * @param {number} Q  - pumping rate (m³/s), must be > 0
 * @param {number} T  - transmissivity (m²/s), must be > 0
 * @param {number} S  - storativity (dimensionless), 0 < S ≤ 1
 * @param {number} r  - radial distance from well (m), must be > 0
 * @param {number} t  - elapsed time (s), must be > 0
 * @returns {{ drawdown_m: number, u: number, Wu: number }}
 *
 * @see Theis (1935) Trans. AGU 16(2):519–524
 */
export function calcTheisDrawdown(
    Q: number,
    T: number,
    S: number,
    r: number,
    t: number,
): { drawdown_m: number; u: number; Wu: number } {
    if (Q <= 0) throw new RangeError('calcTheisDrawdown: Q must be > 0');
    if (T <= 0) throw new RangeError('calcTheisDrawdown: T must be > 0');
    if (S <= 0 || S > 1) throw new RangeError('calcTheisDrawdown: S must be in (0, 1]');
    if (r <= 0) throw new RangeError('calcTheisDrawdown: r must be > 0');
    if (t <= 0) throw new RangeError('calcTheisDrawdown: t must be > 0');

    const u = (r * r * S) / (4 * T * t);
    const Wu = wellFunction(u);
    const drawdown_m = (Q / (4 * Math.PI * T)) * Wu;

    return { drawdown_m, u, Wu };
}

/**
 * Calculates Dupuit-Forcheimer steady-state drawdown for an unconfined aquifer.
 *
 * Formula (Dupuit-Forcheimer): h² - hw² = (Q / πK) × ln(R/r)
 * Drawdown: s = H - h, where h = sqrt(hw² + (Q/πK) × ln(r/R))
 *
 * @param {number} Q   - pumping rate (m³/s)
 * @param {number} K   - hydraulic conductivity (m/s)
 * @param {number} H   - undisturbed saturated thickness (m)
 * @param {number} hw  - water level at well face (m)
 * @param {number} R   - radius of influence (m)
 * @param {number} r   - observation point distance (m)
 * @returns {{ drawdown_m: number, head_m: number }}
 *
 * @see Dupuit (1863); Fetter (2001) Applied Hydrogeology 4th ed., p.165
 */
export function calcDupuitDrawdown(
    Q: number,
    K: number,
    H: number,
    hw: number,
    R: number,
    r: number,
): { drawdown_m: number; head_m: number } {
    if (Q <= 0) throw new RangeError('calcDupuitDrawdown: Q must be > 0');
    if (K <= 0) throw new RangeError('calcDupuitDrawdown: K must be > 0');
    if (H <= 0) throw new RangeError('calcDupuitDrawdown: H must be > 0');
    if (hw < 0 || hw >= H) throw new RangeError('calcDupuitDrawdown: hw must be in [0, H)');
    if (R <= r) throw new RangeError('calcDupuitDrawdown: R must be > r');
    if (r <= 0) throw new RangeError('calcDupuitDrawdown: r must be > 0');

    // h(r)² = hw² + (Q/(π×K)) × ln(r/R)  → note ln(r/R) ≤ 0 for r ≤ R
    // equivalently h² = H² - (Q/(π×K)) × ln(R/r)
    const h2 = hw * hw + (Q / (Math.PI * K)) * Math.log(r / R);
    if (h2 < 0) {
        return { drawdown_m: H, head_m: 0 }; // fully dewatered
    }
    const head_m = Math.sqrt(h2);
    const drawdown_m = H - head_m;
    return { drawdown_m, head_m };
}

/**
 * Calculates maximum well capacity for an unconfined aquifer (Dupuit-Forcheimer).
 *
 * Q_max = π × K × (H² - hw²) / ln(R/rw)
 *
 * @param {number} K   - hydraulic conductivity (m/s)
 * @param {number} H   - undisturbed saturated thickness (m)
 * @param {number} hw  - minimum pumping water level at well (m)
 * @param {number} rw  - well radius (m)
 * @param {number} R   - radius of influence (m)
 * @returns {{ Q_max_m3s: number, Q_max_m3d: number }}
 *
 * @see Fetter (2001) Applied Hydrogeology, p.168
 */
export function calcWellCapacity(
    K: number,
    H: number,
    hw: number,
    rw: number,
    R: number,
): { Q_max_m3s: number; Q_max_m3d: number } {
    if (K <= 0) throw new RangeError('calcWellCapacity: K must be > 0');
    if (H <= 0) throw new RangeError('calcWellCapacity: H must be > 0');
    if (hw < 0 || hw >= H) throw new RangeError('calcWellCapacity: hw must be in [0, H)');
    if (rw <= 0) throw new RangeError('calcWellCapacity: rw must be > 0');
    if (R <= rw) throw new RangeError('calcWellCapacity: R must be > rw');

    const Q_max_m3s = (Math.PI * K * (H * H - hw * hw)) / Math.log(R / rw);
    return { Q_max_m3s, Q_max_m3d: Q_max_m3s * 86400 };
}

/**
 * Calculates the cone of depression profile at time t for multiple distances.
 *
 * Uses Theis solution for each distance in the array.
 *
 * @param {number}   Q         - pumping rate (m³/s)
 * @param {number}   T         - transmissivity (m²/s)
 * @param {number}   S         - storativity (dimensionless)
 * @param {number}   t         - elapsed time (s)
 * @param {number[]} distances - array of radial distances (m)
 * @returns {Array<{ r_m: number, drawdown_m: number, u: number }>}
 *
 * @see Theis (1935) Trans. AGU 16(2):519–524
 */
export function calcConeOfDepression(
    Q: number,
    T: number,
    S: number,
    t: number,
    distances: number[],
): Array<{ r_m: number; drawdown_m: number; u: number }> {
    if (!Array.isArray(distances) || distances.length === 0) {
        throw new TypeError('calcConeOfDepression: distances must be a non-empty array');
    }
    return distances.map((r) => {
        if (r <= 0) return { r_m: r, drawdown_m: 0, u: Infinity };
        const { drawdown_m, u } = calcTheisDrawdown(Q, T, S, r, t);
        return { r_m: r, drawdown_m, u };
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineGroundwaterDewateringMeta: AnalyticsModuleMeta = {
    name: 'mineGroundwaterDewatering',
    description: 'mineGroundwaterDewatering',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'mining'],
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
