// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-FIN-BCR — Discounted Benefit-Cost Ratio (BCR)

   Canonical regulatory cost-benefit metric, complementary to:
   - core/financial/projectValuation.ts (NPV/CRF/VPLA)
   - core/financial/internalRateOfReturn.ts (IRR / discounted payback)
   - core/impact/impactEstimator.ts:calculateCostBenefit (UNDISCOUNTED
     ratio of totals — kept for legacy HUD; BCR here is the time-value
     present-worth version mandated by formal CBA guidance).

   The Benefit-Cost Ratio is the ratio of the present value of a project's
   benefit stream to the present value of its cost stream, both discounted
   at the same social/real rate:

       PV(benefits) = Σ_{t=0..n} B_t / (1 + r)^t
       PV(costs)    = Σ_{t=0..n} C_t / (1 + r)^t
       BCR          = PV(benefits) / PV(costs)

   Decision rule (independent project): accept iff BCR > 1, i.e. iff the
   discounted benefits exceed the discounted costs. BCR > 1 is exactly
   equivalent to Net Present Value > 0, since NPV = PV(benefits) − PV(costs);
   the ratio form is preferred by regulators for ranking and for displaying
   "return per dollar of cost". The Net BCR variant subtracts up-front
   (t=0) capital from the benefit numerator instead of placing it in costs,
   per some agency conventions (we expose both).

   Use in EHS / mining / environmental valuation: appraising remediation
   programs, pollution-control retrofits, watershed restoration, REDD+ and
   ecosystem-service investments where a public agency requires a BCR
   alongside NPV (e.g. comparing CONAMA-mandated controls against avoided
   environmental liability).

   PROVENANCE (canonical references):
   - U.S. Office of Management and Budget (1992, rev. 2023). Circular A-94:
     Guidelines and Discount Rates for Benefit-Cost Analysis of Federal
     Programs. (Defines BCR = PV benefits / PV costs; accept if BCR ≥ 1.)
   - U.S. Environmental Protection Agency (2010, updated 2014). Guidelines
     for Preparing Economic Analyses. EPA 240-R-10-001. Ch. 6
     (present-value benefit-cost comparison; benefit-cost ratio).
   - Boardman, A.E., Greenberg, D.H., Vining, A.R. & Weimer, D.L. (2018).
     Cost-Benefit Analysis: Concepts and Practice, 5th ed. Cambridge Univ.
     Press. ISBN 978-1108415996. §1-2 (BCR definition, net-benefit
     equivalence, ranking caveats).
   - Brealey, R.A., Myers, S.C. & Allen, F. (2020). Principles of Corporate
     Finance, 13th ed. McGraw-Hill. ISBN 978-1260013900. (Profitability
     index = PV(future inflows)/initial investment, the financial twin of
     the net BCR.)

   Sign convention: benefits and costs are supplied as NON-NEGATIVE
   magnitudes in their own streams (this is the regulatory CBA convention,
   distinct from the signed single-stream convention used by NPV/IRR here).
   `r` is a per-period real decimal rate (0.07 = 7%).
   ================================================================ */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Present value of a non-negative magnitude stream at a per-period rate.
 * PV = Σ_{t=0..n} X_t / (1+r)^t  (X_0 at t=0 is undiscounted).
 *
 * @param stream - X_0..X_n; values should be magnitudes (≥ 0 by CBA convention)
 *   but any finite number is accepted and discounted as-is.
 * @param rate - per-period decimal rate (must be > -1).
 * @returns present value in the stream's currency.
 * @throws {TypeError} if stream is not an array of finite numbers.
 * @throws {RangeError} if rate <= -1 (denominator (1+r) non-positive).
 * @internal
 */
function presentValue(stream: readonly number[], rate: number): number {
    if (!Array.isArray(stream)) {
        throw new TypeError('presentValue: stream must be an array');
    }
    if (!Number.isFinite(rate) || rate <= -1) {
        throw new RangeError(`presentValue: rate must be finite and > -1, got ${rate}`);
    }
    const base = 1 + rate;
    let acc = 0;
    let disc = 1; // (1+r)^0
    for (let t = 0; t < stream.length; t++) {
        const x = stream[t] as number;
        if (!Number.isFinite(x)) {
            throw new TypeError(`presentValue: stream[${t}] must be finite, got ${x}`);
        }
        acc += x / disc;
        disc *= base;
    }
    return acc;
}

// ---------------------------------------------------------------------------
// Benefit-Cost Ratio
// ---------------------------------------------------------------------------

export interface BenefitCostInput {
    /** Per-period benefit magnitudes B_0..B_n (≥ 0 by convention). */
    benefits: readonly number[];
    /** Per-period cost magnitudes C_0..C_n (≥ 0 by convention). */
    costs: readonly number[];
    /** Per-period real discount rate (decimal, e.g. 0.07). Default 0. */
    discountRate?: number;
}

export interface BenefitCostResult {
    /** Discounted Benefit-Cost Ratio = PV(benefits) / PV(costs). null if PV(costs) == 0. */
    bcr: number | null;
    /**
     * Net BCR (a.k.a. profitability index variant): treats the t=0 cost as
     * up-front investment and divides discounted net benefits of t≥1 by it.
     *   netBcr = PV_{t>=1}(B_t - C_t) / C_0   (C_0 > 0), else null.
     */
    netBcr: number | null;
    /** Present value of the benefit stream. */
    pvBenefits: number;
    /** Present value of the cost stream. */
    pvCosts: number;
    /** Net Present Value = PV(benefits) − PV(costs). Sign-consistent with BCR>1. */
    npv: number;
    /** Decision flag: true iff bcr is finite and > 1 (equivalently npv > 0). */
    viable: boolean;
    /** Discount rate actually applied. */
    discountRate: number;
    /** Number of periods compared (max stream length). */
    periods: number;
}

/**
 * Compute the discounted Benefit-Cost Ratio of a project.
 *
 * Both streams are discounted at the same rate and divided. Streams of
 * unequal length are right-padded with zeros to the longer length (a shorter
 * cost stream simply contributes nothing in its missing late periods).
 *
 * Equivalence guarantee: `viable === (npv > 0)` always holds, because
 * BCR > 1  ⇔  PV(benefits) > PV(costs)  ⇔  NPV > 0. This cross-check is
 * what makes the ratio a faithful restatement of the NPV rule.
 *
 * @param input - benefits / costs magnitude streams + discountRate.
 * @returns BenefitCostResult (bcr is null when PV(costs) == 0).
 * @throws {TypeError} if benefits or costs is not a finite-number array.
 * @throws {RangeError} if discountRate <= -1.
 */
export function computeBenefitCostRatio(input: BenefitCostInput): Readonly<BenefitCostResult> {
    if (!input || typeof input !== 'object') {
        throw new TypeError('computeBenefitCostRatio: input object required');
    }
    const { benefits, costs } = input;
    if (!Array.isArray(benefits)) {
        throw new TypeError('computeBenefitCostRatio: benefits must be an array');
    }
    if (!Array.isArray(costs)) {
        throw new TypeError('computeBenefitCostRatio: costs must be an array');
    }
    const r = Number.isFinite(input.discountRate) ? (input.discountRate as number) : 0;
    if (r <= -1) {
        throw new RangeError(`computeBenefitCostRatio: discountRate must be > -1, got ${r}`);
    }

    const pvBenefits = presentValue(benefits, r); // also validates finiteness
    const pvCosts = presentValue(costs, r);

    const bcr = pvCosts === 0 ? null : pvBenefits / pvCosts;
    const npv = pvBenefits - pvCosts;
    const viable = bcr !== null && bcr > 1;

    // Net BCR / profitability-index variant: up-front cost in denominator,
    // discounted net benefits of t >= 1 in numerator.
    const n = Math.max(benefits.length, costs.length);
    const c0 = (costs[0] as number) || 0;
    let pvNetFuture = 0;
    if (c0 > 0) {
        const base = 1 + r;
        let disc = base; // (1+r)^1
        for (let t = 1; t < n; t++) {
            const b = (benefits[t] as number) || 0;
            const c = (costs[t] as number) || 0;
            pvNetFuture += (b - c) / disc;
            disc *= base;
        }
    }
    const netBcr = c0 > 0 ? pvNetFuture / c0 : null;

    return Object.freeze({
        bcr,
        netBcr,
        pvBenefits,
        pvCosts,
        npv,
        viable,
        discountRate: r,
        periods: n,
    });
}

/**
 * Convenience overload for the common "single up-front cost + level annual
 * benefit" appraisal (e.g. a remediation CAPEX with constant avoided-liability
 * benefit). Builds the streams and delegates to computeBenefitCostRatio.
 *
 *   costs    = [capex, 0, 0, ...]            (length = periods + 1)
 *   benefits = [0, annualBenefit, ...]       (t=1..periods)
 *
 * @param capex - up-front cost at t=0 (magnitude, ≥ 0).
 * @param annualBenefit - level benefit received in each period t=1..periods.
 * @param periods - number of benefit periods (n ≥ 1).
 * @param discountRate - per-period real decimal rate. Default 0.
 * @returns BenefitCostResult.
 * @throws {RangeError} if periods < 1.
 */
export function benefitCostRatioLevel(
    capex: number,
    annualBenefit: number,
    periods: number,
    discountRate = 0,
): Readonly<BenefitCostResult> {
    const n = Number(periods);
    if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(`benefitCostRatioLevel: periods must be an integer >= 1, got ${periods}`);
    }
    const cx = Number(capex) || 0;
    const ab = Number(annualBenefit) || 0;
    const costs = new Array<number>(n + 1).fill(0);
    costs[0] = cx;
    const benefits = new Array<number>(n + 1).fill(0);
    for (let t = 1; t <= n; t++) benefits[t] = ab;
    return computeBenefitCostRatio({ benefits, costs, discountRate });
}
