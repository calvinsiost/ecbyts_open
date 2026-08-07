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
 * @module extremePrecipitationIndex
 * Extreme Precipitation Analysis - Generalized Extreme Value (GEV) distribution
 * with L-moments parameter estimation.
 *
 * Academic references:
 *   Jenkinson, A.F. (1955). The frequency distribution of the annual maximum
 *     (or minimum) values of meteorological elements.
 *     Q. J. R. Meteorol. Soc., 81(348), 158–171.
 *   Hosking, J.R.M. (1990). L-moments: Analysis and estimation of distributions
 *     using linear combinations of order statistics.
 *     J. R. Stat. Soc. B, 52(1), 105–124.
 *     DOI:10.1111/j.2517-6161.1990.tb01775.x
 *
 * GEV CDF: F(x) = exp{ -[1 + shape*(x-location)/scale]^(-1/shape) }, shape ≠ 0
 *          F(x) = exp{ -exp[-(x-location)/scale] },                   shape = 0 (Gumbel)
 */

'use strict';

// Gamma function approximation (Lanczos, sufficient for shape ∈ (-0.5, 0.5))
/**
 * @param {number} z
 * @returns {number}
 */
function _gamma(z: any): number {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * _gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = c[0]!;
    for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Computes the GEV quantile (design precipitation) for a given return period.
 * Inverse CDF: x = location + scale * { [(-ln(1-1/T))^(-shape) - 1] / shape }  (shape ≠ 0)
 *              x = location - scale * ln(-ln(1-1/T))                             (shape = 0)
 *
 * @param {number} returnPeriod_yr - Return period in years (e.g. 100). Must be > 1.
 * @param {number} location        - GEV location parameter (µ), mm.
 * @param {number} scale           - GEV scale parameter (σ > 0), mm.
 * @param {number} shape           - GEV shape parameter (ξ); negative = Weibull,
 *                                   zero = Gumbel, positive = Fréchet.
 * @returns {number} Design precipitation in mm.
 */
export function calcGEVQuantile(returnPeriod_yr: any, location: any, scale: any, shape: any) {
    if (!Number.isFinite(returnPeriod_yr) || returnPeriod_yr <= 1) {
        throw new RangeError('returnPeriod_yr must be > 1');
    }
    if (!Number.isFinite(location)) throw new TypeError('location must be finite');
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale must be > 0');
    if (!Number.isFinite(shape)) throw new TypeError('shape must be finite');

    // Non-exceedance probability for return period T
    const p = 1 - 1 / returnPeriod_yr;
    const y = -Math.log(p); // reduced variate (-ln F)

    if (Math.abs(shape) < 1e-8) {
        // Gumbel (shape → 0)
        return location - scale * Math.log(y);
    }
    return location + (scale / shape) * (Math.pow(y, -shape) - 1);
}

/**
 * Computes the return period (years) for an observed precipitation value.
 * Inverse of the GEV CDF.
 *
 * @param {number} value    - Observed precipitation (mm). Must be > location when shape > 0.
 * @param {number} location - GEV location parameter (µ).
 * @param {number} scale    - GEV scale parameter (σ > 0).
 * @param {number} shape    - GEV shape parameter (ξ).
 * @returns {number} Return period in years (≥ 1).
 */
export function calcReturnPeriod(value: any, location: any, scale: any, shape: any) {
    if (!Number.isFinite(value)) throw new TypeError('value must be finite');
    if (!Number.isFinite(location)) throw new TypeError('location must be finite');
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale must be > 0');
    if (!Number.isFinite(shape)) throw new TypeError('shape must be finite');

    let logF;
    if (Math.abs(shape) < 1e-8) {
        // Gumbel
        logF = -Math.exp(-(value - location) / scale);
    } else {
        const z = 1 + (shape * (value - location)) / scale;
        if (z <= 0) throw new RangeError('value is outside GEV support for given parameters');
        logF = -Math.pow(z, -1 / shape);
    }
    const F = Math.exp(logF);
    if (F >= 1) return Infinity;
    return 1 / (1 - F);
}

/**
 * Fits GEV parameters using L-moments (Hosking 1990).
 * Requires at least 3 data points. Data sorted in ascending order internally.
 *
 * L-moments:
 *   λ1 = arithmetic mean
 *   λ2 = 0.5 * E[X(2:2) - X(1:2)]
 *   τ3 = λ3/λ2  (L-skewness)
 *
 * GEV estimation via L-moment ratios (Hosking & Wallis 1997, Table A3):
 *   ξ (shape) solved numerically from τ3
 *   σ (scale) = λ2 * ξ / [Γ(1+ξ) * (1 - 2^(-ξ))]
 *   µ (location) = λ1 - σ/ξ * [Γ(1+ξ) - 1]
 *
 * @param {number[]} data - Array of annual maximum precipitation values (mm). n ≥ 3.
 * @returns {{ location: number, scale: number, shape: number }} Fitted GEV parameters.
 */
export function fitGEVByLMoments(data: any) {
    if (!Array.isArray(data) || data.length < 3) {
        throw new RangeError('data must have at least 3 observations');
    }
    if (!data.every(Number.isFinite)) throw new TypeError('all data values must be finite numbers');

    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);

    // Compute probability-weighted moments (PWM) b0, b1, b2
    // br = (1/n) * Σ [(j-1)(j-2)...(j-r) / (n-1)(n-2)...(n-r)] * X(j:n)
    let b0 = 0,
        b1 = 0,
        b2 = 0;
    for (let i = 0; i < n; i++) {
        b0 += sorted[i];
        if (i >= 1) b1 += (sorted[i] * i) / (n - 1);
        if (i >= 2) b2 += (sorted[i] * i * (i - 1)) / ((n - 1) * (n - 2));
    }
    b0 /= n;
    b1 /= n;
    b2 /= n;

    // L-moments from PWMs
    const l1 = b0;
    const l2 = 2 * b1 - b0;
    const l3 = 6 * b2 - 6 * b1 + b0;

    if (l2 <= 0) throw new RangeError('L-moment λ2 ≤ 0; data may be constant or invalid');

    const tau3 = l3 / l2; // L-skewness

    // Approximate shape via rational approximation (Hosking & Wallis 1997, eq A3)
    // Valid for |τ3| < 0.95
    let shape;
    if (Math.abs(tau3) < 1e-8) {
        shape = 0; // Gumbel
    } else {
        // Two-step approximation
        const c = tau3 < 0 ? (2 * tau3) / (tau3 - 1) : tau3;
        // Polynomial approx for positive range, mirrored for negative
        const z = Math.abs(c);
        const k = 0.2777749 + z * (0.1189 + z * -0.2777749);
        shape = tau3 < 0 ? -k : k;

        // Newton refinement (2 iterations suffice)
        for (let iter = 0; iter < 4; iter++) {
            if (Math.abs(shape) < 1e-8) break;
            // eslint-disable-next-line
            const g1 = _gamma(1 + shape);
            // eslint-disable-next-line
            const g2 = _gamma(1 + 2 * shape);
            const f = (3 + tau3) / 2 - (1 - Math.pow(3, -shape)) / (1 - Math.pow(2, -shape));
            const df =
                (Math.pow(3, -shape) * Math.log(3) -
                    (Math.pow(2, -shape) * Math.log(2) * (1 - Math.pow(3, -shape))) / (1 - Math.pow(2, -shape))) /
                (1 - Math.pow(2, -shape));
            const delta = f / df;
            shape -= delta;
            if (Math.abs(delta) < 1e-10) break;
        }
    }

    let scale, location;
    if (Math.abs(shape) < 1e-8) {
        // Gumbel
        scale = l2 / Math.log(2);
        location = l1 - 0.5772156649 * scale;
    } else {
        const g = _gamma(1 + shape);
        scale = (shape * l2) / (g * (1 - Math.pow(2, -shape)));
        location = l1 - (scale / shape) * (g - 1);
    }

    return { location, scale, shape };
}

/**
 * Classifies the rarity of an extreme precipitation event by return period.
 *
 * Classification (adapted from WMO No. 1192, 2018 & CEPED/USP criteria):
 *   common       : TR ≤ 5 yr
 *   uncommon     : 5 < TR ≤ 25 yr
 *   rare         : 25 < TR ≤ 100 yr
 *   very_rare    : 100 < TR ≤ 500 yr
 *   extreme      : TR > 500 yr
 *
 * @param {number} returnPeriod_yr - Return period in years.
 * @returns {'common'|'uncommon'|'rare'|'very_rare'|'extreme'} Event classification.
 */
export function classifyExtremeEvent(returnPeriod_yr: any) {
    if (!Number.isFinite(returnPeriod_yr) || returnPeriod_yr < 1) {
        throw new RangeError('returnPeriod_yr must be ≥ 1');
    }
    if (returnPeriod_yr <= 5) return 'common';
    if (returnPeriod_yr <= 25) return 'uncommon';
    if (returnPeriod_yr <= 100) return 'rare';
    if (returnPeriod_yr <= 500) return 'very_rare';
    return 'extreme';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const extremePrecipitationIndexMeta = {
    name: 'extremePrecipitationIndex',
    description: 'extremePrecipitationIndex',
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
