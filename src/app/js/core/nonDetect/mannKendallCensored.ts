// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Mann-Kendall trend test for LEFT-CENSORED environmental data
   ----------------------------------------------------------------
   Pure-logic core module: zero DOM, zero network, zero browser deps.

   Provenance (academic):
   - Helsel, D.R. (2012). "Statistics for Censored Environmental Data
     Using Minitab and R", 2nd ed., Wiley. Chapter 12 ("Trend Analysis").
     ISBN: 978-0-470-47988-9.
   - Helsel, D.R. & Hirsch, R.M. (2002). "Statistical Methods in Water
     Resources", USGS Techniques of Water-Resources Investigations,
     Book 4, Chapter A3. (Mann-Kendall S statistic + tie-corrected
     variance + normal approximation with continuity correction.)
   - Kendall, M.G. (1975). "Rank Correlation Methods", 4th ed., Griffin.
   - Mann, H.B. (1945). "Nonparametric tests against trend",
     Econometrica 13(3):245-259. DOI: 10.2307/1907187.

   Why a dedicated censored variant (vs. analytics/statistics.ts::mannKendall):
   The ordinary Mann-Kendall sums sgn(x_j - x_i) over all i<j pairs, which is
   undefined when some x are non-detects (only known to be < their reporting
   limit). For censored data the sign of a pairwise comparison is scored only
   when it is *determinate* given the detection limits; otherwise the pair is
   treated as a tie (contributes 0 to S and is excluded from the determinate
   count). This is the canonical "score the concordant/discordant pairs you
   can resolve" treatment of Helsel 2012 §12.

   Pairwise sign rule (a = earlier observation, b = later observation):
   - both detected:                sgn(b.value - a.value)
   - a detected, b non-detect<DLb: if a.value >= DLb  -> -1 (b < DLb <= a)
                                   else                 ->  0 (indeterminate)
   - a non-detect<DLa, b detected: if b.value >= DLa  -> +1 (b > a's true val)
                                   else                 ->  0 (indeterminate)
   - both non-detect:              0 (ordering of two `<DL` values unknown;
                                      conservative, even when DLs differ)
   - equal determinate values:     0 (tie)

   Variance uses the tie correction (Kendall 1975; Helsel & Hirsch 2002 eq 12.6):
       Var(S) = [ n(n-1)(2n+5)
                  - Σ_t t(t-1)(2t+5) ] / 18
   where the tie groups {t} are groups of EQUAL DETERMINATE values. Non-detect
   groups (sharing a reporting limit) are also tie groups for the purpose of the
   reduction term, following the standard EPA/USGS handling for left-censored
   series. Significance via the normal approximation with continuity correction.
   ================================================================ */

interface MKObservation {
    /** Reported numeric value. For a non-detect this is the detection / reporting limit. */
    value: number;
    /** true => the true concentration is somewhere in (0, value) (left-censored). */
    censored: boolean;
}

interface MannKendallCensoredResult {
    /** Mann-Kendall S statistic (sum of determinate pairwise signs). */
    readonly S: number;
    /** Tie-corrected variance of S. */
    readonly varS: number;
    /** Standard-normal Z statistic (continuity-corrected). */
    readonly z: number;
    /** Two-sided p-value from the normal approximation. */
    readonly pValue: number;
    /** Direction at the given alpha: 'increasing' | 'decreasing' | 'no-trend'. */
    readonly trend: 'increasing' | 'decreasing' | 'no-trend';
    /** Kendall's tau-b restricted to determinate pairs (S / nDeterminate). */
    readonly tau: number;
    /** Number of observations. */
    readonly n: number;
    /** Number of censored (non-detect) observations. */
    readonly nCensored: number;
    /** Number of pairwise comparisons whose sign could be resolved. */
    readonly nDeterminate: number;
    /** Total number of i<j pairs = n(n-1)/2. */
    readonly nPairs: number;
    /** Significance level used for the trend label. */
    readonly alpha: number;
}

/**
 * Standard normal CDF Φ(x) via the Abramowitz & Stegun 7.1.26 erf approximation.
 * Max abs error ~1.5e-7 — adequate for a trend p-value.
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

/**
 * Determinate pairwise sign for a left-censored Mann-Kendall comparison.
 * Returns +1 (increase), -1 (decrease), or 0 (tie / indeterminate).
 * @internal exported for unit testing of the sign rule in isolation.
 */
export function _censoredPairSign(a: MKObservation, b: MKObservation): -1 | 0 | 1 {
    if (!a.censored && !b.censored) {
        if (b.value > a.value) return 1;
        if (b.value < a.value) return -1;
        return 0;
    }
    if (!a.censored && b.censored) {
        // b is < DLb. Determinate only if a.value >= DLb (then b < a).
        return a.value >= b.value ? -1 : 0;
    }
    if (a.censored && !b.censored) {
        // a is < DLa. Determinate only if b.value >= DLa (then b > a).
        return b.value >= a.value ? 1 : 0;
    }
    // both censored — ordering of two `<DL` values is unknown.
    return 0;
}

/**
 * Mann-Kendall monotonic trend test for left-censored (non-detect) time series.
 *
 * Observations MUST be supplied in time order (earliest first). Each entry is
 * `{value, censored}`; for a non-detect, `value` is its detection/reporting limit.
 *
 * @param observations time-ordered observations
 * @param alpha two-sided significance level for the trend label (default 0.05)
 * @returns frozen result object (see {@link MannKendallCensoredResult})
 * @throws {TypeError}  on non-array input or malformed observations
 * @throws {RangeError} when fewer than 4 observations are supplied
 *
 * @example
 *   mannKendallCensored([
 *     { value: 5,  censored: false },
 *     { value: 1,  censored: true  }, // <1
 *     { value: 8,  censored: false },
 *     { value: 12, censored: false },
 *   ]);
 */
export function mannKendallCensored(
    observations: Array<MKObservation>,
    alpha: number = 0.05,
): Readonly<MannKendallCensoredResult> {
    if (!Array.isArray(observations)) {
        throw new TypeError('mannKendallCensored: observations must be an array');
    }
    const n = observations.length;
    if (n < 4) {
        throw new RangeError('mannKendallCensored: requires at least 4 observations');
    }
    if (
        !observations.every(
            (o) => o && typeof o === 'object' && Number.isFinite(o.value) && typeof o.censored === 'boolean',
        )
    ) {
        throw new TypeError('mannKendallCensored: each observation must have {value: number, censored: boolean}');
    }
    if (!(alpha > 0 && alpha < 1)) {
        throw new RangeError('mannKendallCensored: alpha must be in (0, 1)');
    }

    const nCensored = observations.filter((o) => o.censored === true).length;

    // ── 1. S statistic over all i < j determinate pairs ──
    let S = 0;
    let nDeterminate = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const s = _censoredPairSign(observations[i]!, observations[j]!);
            if (s !== 0) {
                S += s;
                nDeterminate++;
            }
        }
    }

    const nPairs = (n * (n - 1)) / 2;

    // ── 2. Tie correction. Tie groups = equal detected values, plus groups of
    //       non-detects sharing a reporting limit. (Helsel & Hirsch 2002 eq 12.6) ──
    const detectGroups = new Map<number, number>();
    const censorGroups = new Map<number, number>();
    for (const o of observations) {
        const bucket = o.censored ? censorGroups : detectGroups;
        bucket.set(o.value, (bucket.get(o.value) ?? 0) + 1);
    }
    let tieReduction = 0;
    for (const t of detectGroups.values()) {
        if (t > 1) tieReduction += t * (t - 1) * (2 * t + 5);
    }
    for (const t of censorGroups.values()) {
        if (t > 1) tieReduction += t * (t - 1) * (2 * t + 5);
    }

    const varS = (n * (n - 1) * (2 * n + 5) - tieReduction) / 18;

    // ── 3. Normal approximation with continuity correction ──
    let z: number;
    if (varS <= 0) {
        z = 0;
    } else if (S > 0) {
        z = (S - 1) / Math.sqrt(varS);
    } else if (S < 0) {
        z = (S + 1) / Math.sqrt(varS);
    } else {
        z = 0;
    }

    const pValue = 2 * (1 - _normalCdf(Math.abs(z)));

    // ── 4. Labels ──
    let trend: 'increasing' | 'decreasing' | 'no-trend';
    if (pValue < alpha && S > 0) trend = 'increasing';
    else if (pValue < alpha && S < 0) trend = 'decreasing';
    else trend = 'no-trend';

    const tau = nDeterminate > 0 ? S / nDeterminate : 0;

    return Object.freeze({
        S,
        varS,
        z,
        pValue,
        trend,
        tau,
        n,
        nCensored,
        nDeterminate,
        nPairs,
        alpha,
    });
}
