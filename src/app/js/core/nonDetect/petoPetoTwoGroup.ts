// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Peto-Peto (Peto-Prentice) generalized Wilcoxon two-group test
   for LEFT-CENSORED environmental data.
   ----------------------------------------------------------------
   Pure-logic core module: zero DOM, zero network, zero browser deps.

   Provenance (academic):
   - Helsel, D.R. (2012). "Statistics for Censored Environmental Data
     Using Minitab and R", 2nd ed., Wiley. Chapter 9 ("Comparing Two
     Groups"), §9.2 — recommends the Peto-Peto generalized Wilcoxon
     (a.k.a. Peto-Prentice) score test for two groups containing
     non-detects (multiple/differing reporting limits). ISBN 978-0-470-47988-9.
   - Peto, R. & Peto, J. (1972). "Asymptotically Efficient Rank Invariant
     Test Procedures", Journal of the Royal Statistical Society, Series A,
     135(2):185-207. DOI: 10.2307/2344317.
   - Prentice, R.L. (1978). "Linear rank tests with right censored data",
     Biometrika 65(1):167-179. DOI: 10.1093/biomet/65.1.167.
   - Kaplan, E.L. & Meier, P. (1958). "Nonparametric Estimation from
     Incomplete Observations", JASA 53(282):457-481. DOI: 10.2307/2281868.

   Why a dedicated two-group censored test:
   The ordinary Wilcoxon rank-sum (Mann-Whitney) cannot rank a non-detect
   `<DL` against detects/non-detects with a different DL, so it fails on
   real environmental data with multiple reporting limits. The Peto-Peto
   procedure assigns each observation a SCORE derived from the pooled
   left-censored Kaplan-Meier survival function, sums the scores within
   one group, and compares that sum to its permutation variance via a
   chi-square(1) / standard-normal approximation. This is the canonical
   distribution-free comparison for left-censored data (Helsel 2012 §9.2).

   Scoring (Peto-Prentice convention, adapted to left-censoring):
   We follow Helsel's flip trick — left-censored X with detection limit C is
   mapped to right-censored Y = M - X (M = max + 1). The pooled KM survival
   Ŝ(t) on Y is estimated once over BOTH groups combined. Each observation
   gets a Peto-Prentice score:
     - an EVENT (a detect, after the flip) at flipped value y_i:
           score = Ŝ(y_i) + Ŝ(y_i^-) - 1
       where Ŝ(y_i^-) is the survival just BEFORE y_i (i.e. at the previous
       distinct event time); for the first event Ŝ(y_i^-)=1.
     - a CENSORED observation (a non-detect, after the flip) at y_i:
           score = Ŝ(y_i) - 1
   The group test statistic is U = Σ_{i∈group1} score_i. Under H0 (equal
   distributions) E[U]=0 and the permutation variance is
       Var(U) = (n1 · n2) / (N · (N-1)) · Σ_i score_i^2 ,
   so χ² = U² / Var(U) ~ χ²(1), z = U / √Var(U) ~ N(0,1) (two-sided).
   ================================================================ */

interface PPObservation {
    /** Reported numeric value. For a non-detect this is the detection / reporting limit. */
    value: number;
    /** true => the true concentration is somewhere in (0, value) (left-censored). */
    censored: boolean;
}

interface PetoPetoResult {
    /** Peto-Prentice score sum for group 1 (the test statistic U). */
    readonly U: number;
    /** Permutation variance of U. */
    readonly varU: number;
    /** Chi-square(1) statistic = U² / Var(U). */
    readonly chiSquare: number;
    /** Standard-normal Z statistic = U / √Var(U). */
    readonly z: number;
    /** Two-sided p-value from the chi-square(1) / normal approximation. */
    readonly pValue: number;
    /** Decision label at the supplied alpha. */
    readonly conclusion: 'different' | 'no-difference';
    /** Size of group 1. */
    readonly n1: number;
    /** Size of group 2. */
    readonly n2: number;
    /** Number of non-detects in group 1. */
    readonly nCensored1: number;
    /** Number of non-detects in group 2. */
    readonly nCensored2: number;
    /** Significance level used for the conclusion label. */
    readonly alpha: number;
}

/**
 * Standard normal CDF Φ(x) via the Abramowitz & Stegun 7.1.26 erf
 * approximation (max abs error ~1.5e-7) — adequate for a test p-value.
 */
function _normalCdf(x: number): number {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
            t *
            Math.exp(-x * x);
    const cdfAbs = 0.5 * (1 + y);
    return x >= 0 ? cdfAbs : 1 - cdfAbs;
}

interface ScoredPoint {
    /** Flipped value Y = M - value. */
    y: number;
    /** Is this a (post-flip) event = original detect. */
    event: boolean;
    /** Which group (1 or 2). */
    group: 1 | 2;
    /** Peto-Prentice score assigned to this observation. */
    score: number;
}

function _validateGroup(g: unknown, label: string): asserts g is PPObservation[] {
    if (!Array.isArray(g)) {
        throw new TypeError(`petoPetoTwoGroup: ${label} must be an array`);
    }
    if (g.length < 2) {
        throw new RangeError(`petoPetoTwoGroup: ${label} requires at least 2 observations`);
    }
    for (const o of g) {
        if (!o || typeof o !== 'object' || !Number.isFinite((o as PPObservation).value) || typeof (o as PPObservation).censored !== 'boolean') {
            throw new TypeError(`petoPetoTwoGroup: each observation in ${label} must be {value: number, censored: boolean}`);
        }
    }
}

/**
 * Peto-Peto (Peto-Prentice) generalized Wilcoxon test comparing two groups
 * of left-censored (non-detect) environmental data.
 *
 * Each observation is `{value, censored}`; for a non-detect, `value` is its
 * detection / reporting limit. Groups may have different reporting limits.
 *
 * @param group1 first group of observations (>= 2)
 * @param group2 second group of observations (>= 2)
 * @param alpha two-sided significance level for the conclusion (default 0.05)
 * @returns frozen result object (see {@link PetoPetoResult})
 * @throws {TypeError}  on non-array / malformed input
 * @throws {RangeError} when a group has fewer than 2 observations or alpha ∉ (0,1)
 *
 * @example
 *   petoPetoTwoGroup(
 *     [ { value: 1, censored: true }, { value: 3, censored: false }, { value: 2, censored: false } ],
 *     [ { value: 8, censored: false }, { value: 5, censored: true }, { value: 9, censored: false } ],
 *   );
 */
export function petoPetoTwoGroup(
    group1: Array<PPObservation>,
    group2: Array<PPObservation>,
    alpha: number = 0.05,
): Readonly<PetoPetoResult> {
    _validateGroup(group1, 'group1');
    _validateGroup(group2, 'group2');
    if (!(alpha > 0 && alpha < 1)) {
        throw new RangeError('petoPetoTwoGroup: alpha must be in (0, 1)');
    }

    const n1 = group1.length;
    const n2 = group2.length;
    const N = n1 + n2;
    const nCensored1 = group1.filter((o) => o.censored === true).length;
    const nCensored2 = group2.filter((o) => o.censored === true).length;

    // ── 1. Flip left-censoring → right-censoring: Y = M - X, M = maxValue + 1.
    //       After the flip, an original DETECT becomes a right-censored "event"
    //       observed exactly; a non-detect `<C` (value C) becomes a right-
    //       censored observation at Y = M - C (true survival time > Y). ──
    let maxValue = -Infinity;
    for (const o of group1) if (o.value > maxValue) maxValue = o.value;
    for (const o of group2) if (o.value > maxValue) maxValue = o.value;
    const M = maxValue + 1;

    const points: ScoredPoint[] = [];
    for (const o of group1) points.push({ y: M - o.value, event: !o.censored, group: 1, score: 0 });
    for (const o of group2) points.push({ y: M - o.value, event: !o.censored, group: 2, score: 0 });

    // ── 2. Pooled Kaplan-Meier survival on Y over BOTH groups (right-censored).
    //       Sort ascending by y; at each tie-group, censored come AFTER events
    //       at the same time (standard KM convention). ──
    points.sort((a, b) => (a.y !== b.y ? a.y - b.y : (a.event === b.event ? 0 : a.event ? -1 : 1)));

    // Walk distinct event times computing S(t) = Π (1 - d_k / n_k).
    // For each distinct y value, count events d and the number "at risk" n
    // (= number of observations with Y >= current y, classic KM risk set).
    // We also remember S just-before (sPrev) each event time for the score.
    // Build a lookup: for each point, S at its time and S just before its time.
    let atRisk = N;
    let survival = 1; // S at the current step (after applying events at processed times)
    let i = 0;
    // sBefore for an event time = survival just before that time's events.
    while (i < points.length) {
        const y = points[i]!.y;
        // collect all points at this y
        let j = i;
        let dEvents = 0;
        let nAtThisTime = 0;
        while (j < points.length && points[j]!.y === y) {
            nAtThisTime++;
            if (points[j]!.event) dEvents++;
            j++;
        }
        const sBefore = survival; // S(t^-) — survival before this time's events
        let sAfter = survival;
        if (dEvents > 0 && atRisk > 0) {
            sAfter = survival * (1 - dEvents / atRisk);
        }
        // Assign Peto-Prentice scores to every point sharing this time.
        for (let k = i; k < j; k++) {
            const p = points[k]!;
            if (p.event) {
                // event score = S(t) + S(t^-) - 1
                p.score = sAfter + sBefore - 1;
            } else {
                // censored score = S(t) - 1   (uses S at/after this time)
                p.score = sAfter - 1;
            }
        }
        // advance
        survival = sAfter;
        atRisk -= nAtThisTime;
        i = j;
    }

    // ── 3. Test statistic U = Σ scores in group 1, and permutation variance. ──
    let U = 0;
    let sumSqScores = 0;
    for (const p of points) {
        if (p.group === 1) U += p.score;
        sumSqScores += p.score * p.score;
    }

    const varU = N > 1 ? ((n1 * n2) / (N * (N - 1))) * sumSqScores : 0;

    let z: number;
    let chiSquare: number;
    if (varU <= 0) {
        z = 0;
        chiSquare = 0;
    } else {
        z = U / Math.sqrt(varU);
        chiSquare = (U * U) / varU;
    }

    const pValue = 2 * (1 - _normalCdf(Math.abs(z)));

    const conclusion: 'different' | 'no-difference' = pValue < alpha ? 'different' : 'no-difference';

    return Object.freeze({
        U,
        varU,
        chiSquare,
        z,
        pValue,
        conclusion,
        n1,
        n2,
        nCensored1,
        nCensored2,
        alpha,
    });
}
