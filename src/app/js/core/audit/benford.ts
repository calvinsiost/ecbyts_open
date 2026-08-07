// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   BENFORD'S LAW ANALYSIS - First-digit distribution test
   ================================================================

   Tests the distribution of reported values' first digits against the
   expected logarithmic distribution. Fabricated data often deviates from
   this distribution.

   CHI-SQUARED TEST:
   Compares observed vs expected frequencies.
   Low p-value = significant deviation = suspicious.

   ================================================================ */

export type BenfordConformity = 'insufficient_data' | 'conforming' | 'suspicious' | 'non-conforming';

/**
 * Nigrini (2012) MAD first-digit conformity grades.
 * Distinct from chi-squared conformity: MAD is sample-size independent.
 */
export type BenfordMADConformity =
    | 'insufficient_data'
    | 'close'
    | 'acceptable'
    | 'marginal'
    | 'nonconforming';

export interface BenfordMADResult {
    /** Mean Absolute Deviation of observed vs expected first-digit proportions. */
    mad: number;
    conformity: BenfordMADConformity;
    /** Per-digit absolute deviations (|observed - expected|), length 9. */
    deviations: number[];
    n: number;
}

export interface ChiSquaredResult {
    chiSquared: number;
    pValue: number;
}

export interface BenfordResult extends ChiSquaredResult {
    observed: number[];
    expected: number[];
    conformity: BenfordConformity;
    n: number;
    digits: number[];
}

// ================================================================
// BENFORD EXPECTED DISTRIBUTION
// Expected first-digit distribution for digits 1-9.
// ================================================================

const BENFORD_EXPECTED = [
    0.301, // 1
    0.176, // 2
    0.125, // 3
    0.097, // 4
    0.079, // 5
    0.067, // 6
    0.058, // 7
    0.051, // 8
    0.046, // 9
];

// ================================================================
// FIRST-DIGIT EXTRACTION
// ================================================================

/**
 * Extract the leading significant digit from a number.
 */
function getFirstDigit(value: number): number | null {
    const absVal = Math.abs(value);
    if (absVal === 0 || !isFinite(absVal)) return null;

    const str = absVal.toExponential();
    const digit = parseInt(str.charAt(0), 10);

    return digit >= 1 && digit <= 9 ? digit : null;
}

// ================================================================
// DIGIT DISTRIBUTION
// ================================================================

/**
 * Calculate first-digit frequency distribution.
 */
export function benfordDigitDistribution(values: readonly number[]): number[] {
    const counts = new Array<number>(9).fill(0);
    let validCount = 0;

    for (const val of values) {
        const digit = getFirstDigit(val);
        if (digit !== null) {
            counts[digit - 1]!++;
            validCount++;
        }
    }

    if (validCount === 0) return counts;
    return counts.map((c) => c / validCount);
}

// ================================================================
// CHI-SQUARED TEST
// ================================================================

/**
 * Chi-squared test comparing observed vs expected distributions.
 */
export function chiSquaredTest(observed: readonly number[], expected: readonly number[], n: number): ChiSquaredResult {
    let chiSq = 0;

    for (let i = 0; i < observed.length; i++) {
        const oCount = observed[i]! * n;
        const eCount = expected[i]! * n;
        if (eCount > 0) {
            chiSq += Math.pow(oCount - eCount, 2) / eCount;
        }
    }

    const df = 8;
    const pValue = chiSquaredPValue(chiSq, df);

    return { chiSquared: chiSq, pValue };
}

/**
 * Approximate chi-squared p-value using Wilson-Hilferty transform.
 */
function chiSquaredPValue(x: number, df: number): number {
    if (x <= 0) return 1;
    if (df <= 0) return 0;

    const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
    const denom = Math.sqrt(2 / (9 * df));
    const zScore = z / denom;

    return 1 - normalCDF(zScore);
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(x: number): number {
    if (x < -8) return 0;
    if (x > 8) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);

    return 0.5 * (1.0 + sign * y);
}

// ================================================================
// MAIN BENFORD TEST
// ================================================================

/**
 * Run Benford's Law test on a dataset.
 */
export function benfordTest(values: readonly number[]): BenfordResult {
    const numericValues = values.filter((v) => typeof v === 'number' && isFinite(v) && v !== 0);

    if (numericValues.length < 10) {
        return {
            observed: new Array<number>(9).fill(0),
            expected: BENFORD_EXPECTED,
            chiSquared: 0,
            pValue: 1,
            conformity: 'insufficient_data',
            n: numericValues.length,
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        };
    }

    const observed = benfordDigitDistribution(numericValues);
    const { chiSquared, pValue } = chiSquaredTest(observed, BENFORD_EXPECTED, numericValues.length);

    let conformity: BenfordConformity;
    if (pValue >= 0.05) {
        conformity = 'conforming';
    } else if (pValue >= 0.01) {
        conformity = 'suspicious';
    } else {
        conformity = 'non-conforming';
    }

    return {
        observed,
        expected: BENFORD_EXPECTED,
        chiSquared,
        pValue,
        conformity,
        n: numericValues.length,
        digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
}

// ================================================================
// NIGRINI MAD CONFORMITY TEST
// ================================================================

/**
 * Mean Absolute Deviation (MAD) first-digit conformity test.
 *
 * Reference: Nigrini, M.J. (2012). "Benford's Law: Applications for
 *   Forensic Accounting, Auditing, and Fraud Detection". Wiley.
 *   ISBN 978-1-118-15285-0. First-digit MAD critical ranges (Ch. 5, Table 5.1).
 *
 * Rationale: the chi-squared test is sample-size sensitive — for large N even
 * trivial deviations become "significant" (the excess power / "too big to test"
 * problem). MAD measures the average absolute distance between observed and
 * expected proportions and uses FIXED critical cutoffs independent of N, so it
 * is the recommended conformity statistic for forensic Benford analysis on
 * large datasets.
 *
 *   MAD = (1/K) · Σ |observed_i − expected_i|,  K = 9 first-digit bins.
 *
 * First-digit conformity cutoffs (Nigrini 2012):
 *   [0.000, 0.006) close, [0.006, 0.012) acceptable,
 *   [0.012, 0.015) marginal, ≥ 0.015 nonconforming.
 *
 * Pure: no DOM, no side effects. Mirrors `benfordTest`'s 10-value minimum.
 */
export function benfordMAD(values: readonly number[]): BenfordMADResult {
    const numericValues = values.filter((v) => typeof v === 'number' && isFinite(v) && v !== 0);

    if (numericValues.length < 10) {
        return {
            mad: 0,
            conformity: 'insufficient_data',
            deviations: new Array<number>(9).fill(0),
            n: numericValues.length,
        };
    }

    const observed = benfordDigitDistribution(numericValues);
    const deviations = observed.map((o, i) => Math.abs(o - BENFORD_EXPECTED[i]!));
    const mad = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;

    let conformity: BenfordMADConformity;
    if (mad < 0.006) {
        conformity = 'close';
    } else if (mad < 0.012) {
        conformity = 'acceptable';
    } else if (mad < 0.015) {
        conformity = 'marginal';
    } else {
        conformity = 'nonconforming';
    }

    return { mad, conformity, deviations, n: numericValues.length };
}
