// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-FIN-IRR — Internal Rate of Return + Discounted Payback

   Canonical discounted-cash-flow profitability metrics, complementary
   to core/financial/projectValuation.ts (which provides NPV/CRF/VPLA).

   The Internal Rate of Return (IRR) is the discount rate r* that makes
   the Net Present Value of a cash-flow stream exactly zero:

       NPV(r*) = Σ_{t=0..n} CF_t / (1 + r*)^t = 0

   There is no closed form for n >= 4 (Abel–Ruffini), so IRR is found
   numerically. We use Newton–Raphson seeded near a guess, with a
   robust bracketing-bisection fallback when the derivative is poorly
   conditioned or the iterate leaves a sign-bracketed interval. This is
   the same hybrid strategy used by spreadsheet engines (Excel IRR/XIRR,
   LibreOffice Calc).

   Use in EHS / mining: appraising remediation programs, tailings-dam
   closure investments, energy-efficiency retrofits, and carbon-credit
   projects where regulators/financiers require a rate-of-return hurdle
   in addition to NPV.

   PROVENANCE (academic):
   - Fisher, I. (1930). The Theory of Interest. Macmillan. (rate of
     return concept; "rate of return over cost").
   - Boulding, K.E. (1935). "The Theory of a Single Investment."
     Quarterly Journal of Economics 49(3): 475-494. doi:10.2307/1885206
     (formal IRR as the root of the discounted-value polynomial).
   - Brealey, R.A., Myers, S.C. & Allen, F. (2020). Principles of
     Corporate Finance, 13th ed. McGraw-Hill. ISBN 978-1260013900.
     (NPV/IRR/discounted-payback definitions; multiple-IRR caveat).
   - Press, W.H. et al. (2007). Numerical Recipes, 3rd ed. Cambridge
     Univ. Press. ISBN 978-0521880688. §9.4 (Newton–Raphson with
     bracketing / safe root-finding hybrid).

   Sign convention: outflows negative, inflows positive. CF[0] is the
   cash flow at t=0 (typically the initial CAPEX, negative). `r` is a
   per-period decimal rate (0.10 = 10%).
   ================================================================ */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Net Present Value of a cash-flow stream at a given per-period rate.
 * NPV(r) = Σ_{t=0..n} CF_t / (1+r)^t
 *
 * @param cashflows - CF_0..CF_n; CF_0 is at t=0 (no discounting).
 * @param rate - per-period decimal rate (must be > -1).
 * @returns Net Present Value in the cash-flow currency.
 * @throws {TypeError} if cashflows is not an array of finite numbers.
 * @throws {RangeError} if rate <= -1 (denominator (1+r) non-positive).
 */
export function npv(cashflows: readonly number[], rate: number): number {
    if (!Array.isArray(cashflows)) {
        throw new TypeError('npv: cashflows must be an array');
    }
    if (!Number.isFinite(rate) || rate <= -1) {
        throw new RangeError(`npv: rate must be finite and > -1, got ${rate}`);
    }
    const base = 1 + rate;
    let acc = 0;
    let disc = 1; // (1+r)^0
    for (let t = 0; t < cashflows.length; t++) {
        const cf = cashflows[t] as number;
        if (!Number.isFinite(cf)) {
            throw new TypeError(`npv: cashflows[${t}] must be finite, got ${cf}`);
        }
        acc += cf / disc;
        disc *= base;
    }
    return acc;
}

/**
 * First derivative of NPV with respect to the rate:
 *   dNPV/dr = Σ_{t=1..n} (-t) * CF_t / (1+r)^(t+1)
 * Used by the Newton–Raphson step. t=0 term vanishes.
 *
 * @internal
 */
function npvDerivative(cashflows: readonly number[], rate: number): number {
    const base = 1 + rate;
    let acc = 0;
    // disc starts at (1+r)^(1+1) for t=1
    for (let t = 1; t < cashflows.length; t++) {
        const cf = cashflows[t] as number;
        acc += (-t * cf) / Math.pow(base, t + 1);
    }
    return acc;
}

/**
 * Count sign changes in the cash-flow sequence (Descartes' rule of signs).
 * Zero or one sign change guarantees a unique non-negative-rate IRR for a
 * conventional investment; more than one sign change warns of possible
 * multiple IRRs (Brealey, Myers & Allen 2020).
 *
 * @internal
 */
function countSignChanges(cashflows: readonly number[]): number {
    let changes = 0;
    let prevSign = 0;
    for (const cf of cashflows) {
        const s = cf > 0 ? 1 : cf < 0 ? -1 : 0;
        if (s !== 0) {
            if (prevSign !== 0 && s !== prevSign) changes++;
            prevSign = s;
        }
    }
    return changes;
}

// ---------------------------------------------------------------------------
// IRR
// ---------------------------------------------------------------------------

export interface IRRResult {
    /** The internal rate of return (per-period decimal), or null if none found. */
    irr: number | null;
    /** True if the solver converged to a root with |NPV| <= tolerance. */
    converged: boolean;
    /** NPV evaluated at the returned `irr` (residual; ~0 on convergence). */
    residual: number;
    /** Number of iterations consumed (Newton + bisection). */
    iterations: number;
    /** Solver branch that produced the result. */
    method: 'newton' | 'bisection' | 'none';
    /** Number of sign changes in the cash-flow stream (>1 ⇒ multiple IRRs possible). */
    signChanges: number;
}

export interface IRROptions {
    /** Initial guess for the per-period rate. Default 0.1 (10%). */
    guess?: number;
    /** Absolute NPV tolerance for convergence. Default 1e-7. */
    tolerance?: number;
    /** Maximum iterations per branch. Default 100. */
    maxIterations?: number;
}

/**
 * Compute the Internal Rate of Return of a cash-flow stream.
 *
 * Algorithm (Numerical Recipes §9.4 hybrid):
 *   1. Newton–Raphson from `guess`, rejecting steps that produce a
 *      non-finite NPV, leave the domain (r <= -1), or stall (|dNPV/dr|
 *      negligibly small).
 *   2. If Newton fails to converge, bracket a sign change of NPV over a
 *      wide rate grid and refine with bisection (guaranteed convergence
 *      when a bracket exists).
 *
 * @param cashflows - CF_0..CF_n (CF_0 at t=0). Needs ≥2 entries and at
 *   least one sign change, otherwise no real IRR exists.
 * @param options - guess / tolerance / maxIterations.
 * @returns IRRResult; `irr` is null and `converged` false when no root is found.
 * @throws {TypeError} if cashflows is not a finite-number array.
 */
export function computeIRR(cashflows: readonly number[], options: IRROptions = {}): Readonly<IRRResult> {
    if (!Array.isArray(cashflows)) {
        throw new TypeError('computeIRR: cashflows must be an array');
    }
    if (cashflows.length < 2) {
        throw new RangeError('computeIRR: need at least 2 cash flows');
    }
    for (let i = 0; i < cashflows.length; i++) {
        if (!Number.isFinite(cashflows[i] as number)) {
            throw new TypeError(`computeIRR: cashflows[${i}] must be finite`);
        }
    }

    const guess = Number.isFinite(options.guess) ? (options.guess as number) : 0.1;
    const tol = Number.isFinite(options.tolerance) ? (options.tolerance as number) : 1e-7;
    const maxIter = Number.isInteger(options.maxIterations) ? (options.maxIterations as number) : 100;

    const signChanges = countSignChanges(cashflows);

    // No sign change ⇒ NPV is strictly monotone in the same direction for
    // all admissible rates ⇒ no real IRR (e.g. all-positive or all-negative).
    if (signChanges === 0) {
        return Object.freeze({
            irr: null,
            converged: false,
            residual: Number.NaN,
            iterations: 0,
            method: 'none' as const,
            signChanges,
        });
    }

    let iterations = 0;

    // --- Branch 1: Newton–Raphson ---
    let r = guess <= -1 ? 0 : guess;
    for (let i = 0; i < maxIter; i++) {
        iterations++;
        const f = npv(cashflows, r);
        if (Math.abs(f) <= tol) {
            return Object.freeze({
                irr: r,
                converged: true,
                residual: f,
                iterations,
                method: 'newton' as const,
                signChanges,
            });
        }
        const df = npvDerivative(cashflows, r);
        if (!Number.isFinite(df) || Math.abs(df) < 1e-12) break; // derivative too flat → fall back
        const next = r - f / df;
        if (!Number.isFinite(next) || next <= -1) break; // left the domain → fall back
        if (Math.abs(next - r) <= tol * (1 + Math.abs(r))) {
            r = next;
            const fr = npv(cashflows, r);
            if (Math.abs(fr) <= Math.max(tol, 1e-6)) {
                return Object.freeze({
                    irr: r,
                    converged: true,
                    residual: fr,
                    iterations,
                    method: 'newton' as const,
                    signChanges,
                });
            }
            break;
        }
        r = next;
    }

    // --- Branch 2: bracketing + bisection ---
    // Scan a wide rate grid for a sign change of NPV, then bisect.
    const lo0 = -0.9999;
    const hi0 = 100; // 10000% per period upper bound — generous
    const steps = 400;
    let a = lo0;
    let fa = npv(cashflows, a);
    let bracketLo = Number.NaN;
    let bracketHi = Number.NaN;
    for (let k = 1; k <= steps; k++) {
        const b = lo0 + ((hi0 - lo0) * k) / steps;
        const fb = npv(cashflows, b);
        if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb < 0) {
            bracketLo = a;
            bracketHi = b;
            break;
        }
        a = b;
        fa = fb;
    }

    if (!Number.isFinite(bracketLo)) {
        // No sign-bracketed root found on the grid.
        return Object.freeze({
            irr: null,
            converged: false,
            residual: Number.NaN,
            iterations,
            method: 'none' as const,
            signChanges,
        });
    }

    let loR = bracketLo;
    let hiR = bracketHi;
    let fLo = npv(cashflows, loR);
    for (let i = 0; i < maxIter; i++) {
        iterations++;
        const mid = 0.5 * (loR + hiR);
        const fMid = npv(cashflows, mid);
        if (Math.abs(fMid) <= tol || (hiR - loR) / 2 <= tol) {
            return Object.freeze({
                irr: mid,
                converged: true,
                residual: fMid,
                iterations,
                method: 'bisection' as const,
                signChanges,
            });
        }
        if (fLo * fMid < 0) {
            hiR = mid;
        } else {
            loR = mid;
            fLo = fMid;
        }
    }

    // Exhausted iterations — return best estimate (midpoint) as non-converged.
    const mid = 0.5 * (loR + hiR);
    return Object.freeze({
        irr: mid,
        converged: false,
        residual: npv(cashflows, mid),
        iterations,
        method: 'bisection' as const,
        signChanges,
    });
}

// ---------------------------------------------------------------------------
// Discounted Payback Period
// ---------------------------------------------------------------------------

export interface DiscountedPaybackResult {
    /** Payback period in periods (fractional, linear interpolation), or null if never recovered. */
    paybackPeriods: number | null;
    /** True if cumulative discounted cash flow reaches >= 0 within the horizon. */
    recovered: boolean;
    /** Cumulative discounted cash flow at the end of the horizon. */
    cumulativeAtEnd: number;
}

/**
 * Discounted payback period: the (fractional) number of periods at which
 * the cumulative *discounted* cash flow first turns non-negative
 * (Brealey, Myers & Allen 2020, ch. 5). Unlike simple payback, this
 * accounts for the time value of money.
 *
 * Linear interpolation is applied within the crossing period:
 *   payback = (k-1) + |cum_{k-1}| / dcf_k
 * where cum_{k-1} < 0 <= cum_k and dcf_k is the discounted flow at period k.
 *
 * @param cashflows - CF_0..CF_n (CF_0 at t=0, usually negative CAPEX).
 * @param rate - per-period decimal discount rate (> -1).
 * @returns DiscountedPaybackResult; paybackPeriods null when never recovered.
 * @throws {TypeError}/{RangeError} on invalid inputs.
 */
export function discountedPayback(cashflows: readonly number[], rate: number): Readonly<DiscountedPaybackResult> {
    if (!Array.isArray(cashflows)) {
        throw new TypeError('discountedPayback: cashflows must be an array');
    }
    if (!Number.isFinite(rate) || rate <= -1) {
        throw new RangeError(`discountedPayback: rate must be finite and > -1, got ${rate}`);
    }

    const base = 1 + rate;
    let cum = 0;
    let prevCum: number;
    let disc = 1; // (1+r)^0

    // Relative epsilon so an *exact* zero crossing degraded by floating-point
    // (e.g. 110/1.1 = 99.999…9 instead of 100) still registers as recovered.
    // Scaled to the largest absolute flow to stay dimensionally consistent.
    let scale = 0;
    for (const cf of cashflows) {
        const a = Math.abs(cf as number);
        if (a > scale) scale = a;
    }
    const eps = scale * 1e-9;

    for (let t = 0; t < cashflows.length; t++) {
        const cf = cashflows[t] as number;
        if (!Number.isFinite(cf)) {
            throw new TypeError(`discountedPayback: cashflows[${t}] must be finite, got ${cf}`);
        }
        const dcf = cf / disc;
        prevCum = cum;
        cum += dcf;
        if (cum >= -eps && t === 0) {
            // Recovered immediately (degenerate: first flow already non-negative).
            return Object.freeze({ paybackPeriods: 0, recovered: true, cumulativeAtEnd: cum });
        }
        if (cum >= -eps && prevCum < -eps) {
            // Crossing between t-1 and t; interpolate within period t.
            const fraction = dcf !== 0 ? -prevCum / dcf : 0;
            return Object.freeze({
                paybackPeriods: t - 1 + fraction,
                recovered: true,
                cumulativeAtEnd: cum,
            });
        }
        disc *= base;
    }

    return Object.freeze({ paybackPeriods: null, recovered: false, cumulativeAtEnd: cum });
}
