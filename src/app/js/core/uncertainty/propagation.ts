// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { createUValue, isUValue, toAbsolute, toRelative } from './primitive.js';
import type { UValue } from './primitive.js';

export interface AdditiveTerm {
    uAbs: number;
    c: number;
}

export interface DOFTerm {
    uAbs: number;
    dof: number;
    c?: number;
}

export type PropagateOp = 'sum' | 'average' | 'min' | 'max' | 'multiply' | 'divide' | 'linear';

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Additive propagation (absolute RSS).
 * u_c = sqrt(sum((c_i * u_i)^2))
 */
export function propagateAdditive(terms: ReadonlyArray<Partial<AdditiveTerm>> | null | undefined): number | null {
    const valid = (terms || []).filter(
        (t): t is AdditiveTerm => !!t && isFiniteNumber(t.uAbs) && isFiniteNumber(t.c),
    );
    if (valid.length === 0) return null;
    const sumSq = valid.reduce((acc, t) => acc + Math.pow(t.uAbs * t.c, 2), 0);
    return Math.sqrt(sumSq);
}

/**
 * Multiplicative propagation (relative RSS).
 */
export function propagateMultiplicative(relPercents: ReadonlyArray<number> | null | undefined): number | null {
    const valid = (relPercents || []).filter((r): r is number => isFiniteNumber(r) && r >= 0);
    if (valid.length === 0) return null;
    const sumSq = valid.reduce((acc, r) => acc + Math.pow(r / 100, 2), 0);
    return Math.sqrt(sumSq) * 100;
}

/**
 * Expanded uncertainty helper (default k=2).
 */
export function expandedUncertainty(uc: number | null | undefined, k: number = 2): number | null {
    if (!isFiniteNumber(uc)) return null;
    const kk = isFiniteNumber(k) && k > 0 ? k : 2;
    return uc * kk;
}

/**
 * Effective degrees of freedom (Welch-Satterthwaite approximation).
 */
export function effectiveDOF(terms: ReadonlyArray<Partial<DOFTerm>> | null | undefined): number | null {
    const valid = (terms || []).filter(
        (t): t is DOFTerm =>
            !!t && isFiniteNumber(t.uAbs) && t.uAbs > 0 && isFiniteNumber(t.dof) && t.dof > 0,
    );
    if (valid.length === 0) return null;
    const num = Math.pow(
        valid.reduce((acc, t) => acc + Math.pow(t.uAbs * (t.c ?? 1), 2), 0),
        2,
    );
    const den = valid.reduce((acc, t) => {
        const ciUi = t.uAbs * (t.c ?? 1);
        return acc + Math.pow(ciUi, 4) / t.dof;
    }, 0);
    if (!Number.isFinite(den) || den <= 0) return null;
    return num / den;
}

// ============================================================================
// GUM Annex G — coverage factor from effective degrees of freedom
// ----------------------------------------------------------------------------
// Provenance / references:
//  - JCGM 100:2008 (GUM), Annex G "Degrees of freedom and levels of confidence",
//    §G.3 (effective degrees of freedom), §G.4 (coverage factor k = t_p(ν_eff)),
//    Table G.2 (t_p(ν) for p = 95.45 % and 99 %). DOI: not assigned; published by
//    BIPM/JCGM (ISBN-equivalent: JCGM 100:2008, freely available from BIPM).
//  - B.L. Welch (1947), "The generalization of Student's problem when several
//    different population variances are involved", Biometrika 34(1-2):28-35.
//    DOI: 10.1093/biomet/34.1-2.28
//  - F.E. Satterthwaite (1946), "An approximate distribution of estimates of
//    variance components", Biometrics Bulletin 2(6):110-114. DOI: 10.2307/3002019
//
// Gap closed: `effectiveDOF` already produced ν_eff (Welch-Satterthwaite) and
// `expandedUncertainty` already scaled by a *fixed* k (default 2). What was
// missing is the canonical GUM Annex G link between them — selecting the
// coverage factor k = t_p(ν_eff) from the Student-t distribution so that the
// expanded uncertainty U = k·u_c actually delivers the requested coverage
// probability p for finite degrees of freedom (k > 2 when ν_eff is small).
//
// Implementation note: the regularized incomplete beta function (Lentz
// continued fraction) gives the two-sided Student-t CDF; the quantile (inverse)
// is obtained by monotone bisection. Self-contained on purpose — keeps this
// pure module free of cross-module imports.
// ============================================================================

/** Default coverage probability used by the GUM (95.45 %, i.e. k≈2 at ν→∞). */
export const GUM_DEFAULT_COVERAGE_PROBABILITY = 0.9545;

function lnGammaLanczos(z: number): number {
    // Lanczos approximation (g = 7), valid for z > 0.
    const coefs = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = coefs[0] as number;
    for (let i = 1; i < 9; i++) x += (coefs[i] as number) / (z + i - 1);
    const t = z + 7 - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Symmetry relation for faster / stable convergence.
    if (x > (a + 1) / (a + b + 2)) return 1 - regularizedIncompleteBeta(1 - x, b, a);
    const lnBeta = lnGammaLanczos(a) + lnGammaLanczos(b) - lnGammaLanczos(a + b);
    const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
    let c = 1;
    let d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let f = d;
    for (let m = 1; m <= 300; m++) {
        let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 + num * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + num / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        f *= c * d;
        num = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + num * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + num / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const delta = c * d;
        f *= delta;
        if (Math.abs(delta - 1) < 1e-12) break;
    }
    return front * f;
}

/** Student-t CDF P(T ≤ t) for `dof` degrees of freedom. */
function studentTCdf(t: number, dof: number): number {
    if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
    const x = dof / (dof + t * t);
    const tail = 0.5 * regularizedIncompleteBeta(x, dof / 2, 0.5);
    return t >= 0 ? 1 - tail : tail;
}

/**
 * Two-sided Student-t critical value t_p(ν) used as the GUM coverage factor.
 *
 * Returns the value t such that P(−t ≤ T ≤ t) = p for T ~ Student-t(ν), i.e.
 * the (1 + p)/2 quantile. This is the `t_p(ν_eff)` of GUM Annex G, Table G.2.
 *
 * @param nu  Degrees of freedom (ν > 0; need not be integer — ν_eff rarely is).
 * @param p   Two-sided coverage probability in (0, 1). Default 95.45 % (GUM).
 * @returns t_p(ν), or null on invalid input.
 */
export function studentTCriticalValue(
    nu: number | null | undefined,
    p: number = GUM_DEFAULT_COVERAGE_PROBABILITY,
): number | null {
    if (!isFiniteNumber(nu) || nu <= 0) return null;
    if (!isFiniteNumber(p) || p <= 0 || p >= 1) return null;
    const target = (1 + p) / 2; // one-sided upper quantile
    // Large ν → normal limit (avoids beta cost and matches Table G.2 ν=∞ row).
    if (nu >= 1e6) {
        // Acklam-style normal quantile is unnecessary here; bisection below also
        // handles it, but the closed limit keeps ν→∞ exact for common p values.
        return normalQuantile(target);
    }
    // Monotone bisection on the t-CDF: F is strictly increasing in t.
    let lo = 0;
    let hi = 1e4;
    // Ensure bracket covers the target (very small ν can need large t).
    while (studentTCdf(hi, nu) < target && hi < 1e9) hi *= 2;
    for (let i = 0; i < 200; i++) {
        const mid = 0.5 * (lo + hi);
        if (studentTCdf(mid, nu) < target) lo = mid;
        else hi = mid;
        if (hi - lo < 1e-10) break;
    }
    return 0.5 * (lo + hi);
}

// Standard normal quantile (Acklam, 2003) — used only for the ν→∞ limit.
function normalQuantile(p: number): number {
    const a = [
        -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
        2.506628277459239,
    ];
    const b = [
        -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
    ];
    const c = [
        -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
        2.938163982698783,
    ];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    const ph = 1 - pl;
    if (p < pl) {
        const q = Math.sqrt(-2 * Math.log(p));
        return (
            (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
            ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
        );
    }
    if (p > ph) {
        const q = Math.sqrt(-2 * Math.log(1 - p));
        return -(
            (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
            ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
        );
    }
    const q = p - 0.5;
    const r = q * q;
    return (
        ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
        (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
}

/**
 * GUM coverage factor k = t_p(ν_eff) (GUM Annex G, §G.4).
 *
 * Thin alias over {@link studentTCriticalValue} expressing intent at the call
 * site: given the effective degrees of freedom (e.g. from {@link effectiveDOF})
 * and a coverage probability, return the coverage factor to apply to u_c.
 *
 * @param nuEff Effective degrees of freedom ν_eff.
 * @param p     Coverage probability (default 95.45 %).
 * @returns k, or null on invalid input.
 */
export function coverageFactorFromDOF(
    nuEff: number | null | undefined,
    p: number = GUM_DEFAULT_COVERAGE_PROBABILITY,
): number | null {
    return studentTCriticalValue(nuEff, p);
}

/**
 * Expanded uncertainty per GUM Annex G: U = t_p(ν_eff) · u_c.
 *
 * Unlike {@link expandedUncertainty} (which uses a fixed k, default 2), this
 * derives k from the effective degrees of freedom so the interval delivers the
 * requested coverage probability even when ν_eff is small (k > 2).
 *
 * @returns `{ U, k, nuEff, p }` or null on invalid input.
 */
export function expandedUncertaintyFromDOF(
    uc: number | null | undefined,
    nuEff: number | null | undefined,
    p: number = GUM_DEFAULT_COVERAGE_PROBABILITY,
): { U: number; k: number; nuEff: number; p: number } | null {
    if (!isFiniteNumber(uc) || uc < 0) return null;
    const k = coverageFactorFromDOF(nuEff, p);
    if (!isFiniteNumber(k)) return null;
    return { U: uc * k, k, nuEff: Number(nuEff), p };
}

function propagateMinMax(rows: UValue[], values: number[], abs: (number | null)[], op: 'min' | 'max'): UValue {
    const selectedValue = op === 'min' ? Math.min(...values) : Math.max(...values);
    const i = values.indexOf(selectedValue);
    return createUValue(selectedValue, abs[i], { type: 'absolute' });
}

function propagateMultiplyDivide(rows: UValue[], values: number[], rel: (number | null)[], op: 'multiply' | 'divide'): UValue {
    let value = values[0] ?? 0;
    for (let i = 1; i < values.length; i++) {
        const next = values[i] ?? 0;
        if (op === 'multiply') value *= next;
        else value = next === 0 ? value : value / next;
    }
    const relFiltered = rel.filter((r): r is number => isFiniteNumber(r));
    const uRel = propagateMultiplicative(relFiltered);
    const uAbs = isFiniteNumber(uRel) ? (Math.abs(value) * uRel) / 100 : null;
    return createUValue(value, uAbs, { type: 'absolute' });
}

function resolveLinearCoeffs(rows: UValue[], weights: ReadonlyArray<number>): number[] {
    return rows.map((_, i) => {
        const w = weights[i];
        return isFiniteNumber(w) ? Number(w) : 1;
    });
}

function resolveAverageCoeffs(rows: UValue[]): number[] {
    return rows.map(() => 1 / rows.length);
}

function resolveSumCoeffs(rows: UValue[]): number[] {
    return rows.map(() => 1);
}

function resolveCoeffs(rows: UValue[], op: 'sum' | 'average' | 'linear', weights: ReadonlyArray<number>): number[] {
    if (op === 'linear') return resolveLinearCoeffs(rows, weights);
    if (op === 'average') return resolveAverageCoeffs(rows);
    return resolveSumCoeffs(rows);
}

function resolveAggregatedValue(rows: UValue[], values: number[], coeffs: number[], op: 'sum' | 'average' | 'linear'): number {
    if (op === 'linear') return rows.reduce((acc, r, i) => acc + r.value * (coeffs[i] ?? 0), 0);
    const sum = values.reduce((a, b) => a + b, 0);
    return op === 'average' ? sum / values.length : sum;
}

function propagateAdditiveFromAbs(abs: (number | null)[], coeffs: number[]): number | null {
    return propagateAdditive(
        abs.map((uAbs, i) => ({
            uAbs: isFiniteNumber(uAbs) ? uAbs : NaN,
            c: coeffs[i] ?? 1,
        })),
    );
}

function propagateSumAverageLinear(
    rows: UValue[],
    values: number[],
    abs: (number | null)[],
    op: 'sum' | 'average' | 'linear',
    weights: ReadonlyArray<number>,
): UValue {
    const coeffs = resolveCoeffs(rows, op, weights);
    const value = resolveAggregatedValue(rows, values, coeffs, op);
    const uc = propagateAdditiveFromAbs(abs, coeffs);
    return createUValue(value, uc, { type: 'absolute' });
}

/**
 * Generic propagation adapter used by UNC-001 MVP.
 */
export function propagate(
    op: PropagateOp,
    inputs: ReadonlyArray<unknown> | null | undefined,
    weights: ReadonlyArray<number> = [],
): UValue {
    const rows = (inputs || []).filter(isUValue);
    if (rows.length === 0) return createUValue(0, null);

    const values = rows.map((r) => r.value);
    const abs = rows.map((r) => toAbsolute(r));
    const rel = rows.map((r) => toRelative(r));

    if (op === 'min' || op === 'max') {
        return propagateMinMax(rows, values, abs, op);
    }
    if (op === 'multiply' || op === 'divide') {
        return propagateMultiplyDivide(rows, values, rel, op);
    }
    return propagateSumAverageLinear(rows, values, abs, op, weights);
}
