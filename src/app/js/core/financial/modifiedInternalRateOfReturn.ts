// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-FIN-MIRR — Modified Internal Rate of Return

   Canonical discounted-cash-flow profitability metric, complementary
   to core/financial/internalRateOfReturn.ts (plain IRR) and
   core/financial/projectValuation.ts (NPV/CRF/VPLA).

   The plain IRR implicitly assumes every interim positive cash flow is
   re-invested at the IRR itself, and that financing is costed at the IRR
   too. For most real projects neither holds: surpluses are re-invested at
   a (lower) reinvestment/cost-of-capital rate, and outlays are funded at a
   (possibly different) finance rate. The Modified IRR (MIRR) fixes both by
   compounding all positive flows forward to the horizon at a reinvestment
   rate r_re, discounting all negative flows back to t=0 at a finance rate
   r_fin, and reporting the single per-period rate that links the two:

       MIRR = ( FV+ / |PV-| )^(1/n) - 1

   where
       FV+  = Σ_{t: CF_t>0}  CF_t · (1 + r_re )^(n - t)   (terminal value of inflows)
       PV-  = Σ_{t: CF_t<0}  CF_t / (1 + r_fin)^t          (present value of outflows, ≤ 0)
       n    = number of periods (cashflows.length - 1)

   Unlike IRR, MIRR is CLOSED-FORM (no root-finding), always unique, and
   immune to the multiple-IRR pathology of non-conventional flows
   (Descartes' rule). This makes it the preferred ranking metric when
   appraising mutually-exclusive remediation/closure investments.

   Use in EHS / mining: ranking tailings-dam closure options,
   energy-efficiency retrofits, and carbon-credit programs where the
   reinvestment rate of interim revenues differs materially from the
   project's internal return — exactly the regime where naive IRR
   overstates profitability.

   PROVENANCE (academic):
   - Lin, S.A.Y. (1976). "The Modified Internal Rate of Return and
     Investment Criterion." The Engineering Economist 21(4): 237-247.
     doi:10.1080/00137917608902796 (formal MIRR criterion).
   - Brealey, R.A., Myers, S.C. & Allen, F. (2020). Principles of
     Corporate Finance, 13th ed. McGraw-Hill. ISBN 978-1260013900.
     (reinvestment-rate critique of IRR; modified rate of return).
   - Newnan, D.G., Lavelle, J.P. & Eschenbach, T.G. (2020). Engineering
     Economic Analysis, 14th ed. Oxford Univ. Press. ISBN 978-0190931919.
     (external/modified rate of return for engineering projects).
   - Kierulff, H. (2008). "MIRR: A better measure." Business Horizons
     51(4): 321-329. doi:10.1016/j.bushor.2008.02.005 (separate finance
     vs. reinvestment rates; equivalence to Excel MIRR).

   Sign convention: outflows negative, inflows positive. CF[0] is the cash
   flow at t=0 (typically the initial CAPEX, negative). Rates are
   per-period decimals (0.10 = 10%).
   ================================================================ */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MIRROptions {
    /**
     * Finance rate r_fin (per-period decimal): the cost of capital used to
     * discount negative cash flows back to t=0. Must be > -1.
     */
    financeRate: number;
    /**
     * Reinvestment rate r_re (per-period decimal): the rate at which positive
     * cash flows are compounded forward to the horizon. Must be > -1.
     */
    reinvestmentRate: number;
}

export interface MIRRResult {
    /** The modified internal rate of return (per-period decimal), or null when undefined. */
    mirr: number | null;
    /** Terminal (future) value of all positive cash flows compounded at the reinvestment rate. */
    terminalValuePositive: number;
    /** Present value (at t=0) of all negative cash flows discounted at the finance rate (≤ 0). */
    presentValueNegative: number;
    /** Number of periods n = cashflows.length - 1. */
    periods: number;
    /**
     * Reason MIRR is null, when applicable:
     *  - 'no-positive-flows'  : Σ inflows compounds to 0 ⇒ undefined ratio.
     *  - 'no-negative-flows'  : no outflow to recover ⇒ undefined ratio.
     *  - null                 : MIRR is defined.
     */
    undefinedReason: 'no-positive-flows' | 'no-negative-flows' | null;
}

// ---------------------------------------------------------------------------
// MIRR
// ---------------------------------------------------------------------------

/**
 * Compute the Modified Internal Rate of Return of a cash-flow stream.
 *
 * MIRR = ( FV+ / |PV-| )^(1/n) - 1, where positive flows are compounded
 * forward at the reinvestment rate and negative flows discounted back at
 * the finance rate. This matches the spreadsheet MIRR(values, finance_rate,
 * reinvest_rate) function and Newnan's external rate of return.
 *
 * @param cashflows - CF_0..CF_n (CF_0 at t=0). Needs ≥2 entries.
 * @param options - { financeRate, reinvestmentRate } per-period decimals (> -1).
 * @returns Frozen MIRRResult; `mirr` is null with an `undefinedReason` when the
 *   stream lacks either positive or negative flows (ratio undefined).
 * @throws {TypeError} if cashflows is not a finite-number array.
 * @throws {RangeError} if length < 2 or either rate is non-finite / ≤ -1.
 */
export function computeMIRR(
    cashflows: readonly number[],
    options: MIRROptions,
): Readonly<MIRRResult> {
    if (!Array.isArray(cashflows)) {
        throw new TypeError('computeMIRR: cashflows must be an array');
    }
    if (cashflows.length < 2) {
        throw new RangeError('computeMIRR: need at least 2 cash flows');
    }
    if (options == null || typeof options !== 'object') {
        throw new TypeError('computeMIRR: options { financeRate, reinvestmentRate } required');
    }

    const { financeRate, reinvestmentRate } = options;
    if (!Number.isFinite(financeRate) || financeRate <= -1) {
        throw new RangeError(
            `computeMIRR: financeRate must be finite and > -1, got ${financeRate}`,
        );
    }
    if (!Number.isFinite(reinvestmentRate) || reinvestmentRate <= -1) {
        throw new RangeError(
            `computeMIRR: reinvestmentRate must be finite and > -1, got ${reinvestmentRate}`,
        );
    }

    const n = cashflows.length - 1; // number of periods
    const reBase = 1 + reinvestmentRate;
    const finBase = 1 + financeRate;

    // FV of positive flows compounded forward to t=n; PV of negative flows at t=0.
    let terminalValuePositive = 0;
    let presentValueNegative = 0;
    let hasPositive = false;
    let hasNegative = false;

    for (let t = 0; t < cashflows.length; t++) {
        const cf = cashflows[t] as number;
        if (!Number.isFinite(cf)) {
            throw new TypeError(`computeMIRR: cashflows[${t}] must be finite, got ${cf}`);
        }
        if (cf > 0) {
            terminalValuePositive += cf * Math.pow(reBase, n - t);
            hasPositive = true;
        } else if (cf < 0) {
            presentValueNegative += cf / Math.pow(finBase, t); // cf < 0 ⇒ accumulates negative
            hasNegative = true;
        }
        // cf === 0 contributes nothing to either leg.
    }

    if (!hasPositive) {
        return Object.freeze({
            mirr: null,
            terminalValuePositive,
            presentValueNegative,
            periods: n,
            undefinedReason: 'no-positive-flows' as const,
        });
    }
    if (!hasNegative) {
        return Object.freeze({
            mirr: null,
            terminalValuePositive,
            presentValueNegative,
            periods: n,
            undefinedReason: 'no-negative-flows' as const,
        });
    }

    // ratio = FV+ / |PV-|  (presentValueNegative is ≤ 0, so negate for magnitude)
    const ratio = terminalValuePositive / -presentValueNegative;
    const mirr = Math.pow(ratio, 1 / n) - 1;

    return Object.freeze({
        mirr,
        terminalValuePositive,
        presentValueNegative,
        periods: n,
        undefinedReason: null,
    });
}
