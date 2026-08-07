// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-FIN-EAC — Equivalent Annual Cost / Equivalent Annual Annuity

   Canonical method for comparing mutually-exclusive projects (or
   equipment / remediation alternatives) that have DIFFERENT SERVICE
   LIVES. Complementary to:
   - core/financial/projectValuation.ts (VPL/CRF/VPLA — display-oriented
     annualization; crf() there is LENIENT and returns 1 on bad input)
   - core/financial/benefitCostRatio.ts (discounted BCR)
   - core/financial/internalRateOfReturn.ts (IRR / discounted payback)
   - core/financial/modifiedInternalRateOfReturn.ts (MIRR)

   Why a dedicated module: NPV alone cannot rank alternatives with
   unequal lives, because a project that simply runs longer accrues more
   (positive or negative) cash flow. The textbook fix is to convert each
   alternative's present worth into a LEVEL annual equivalent over its own
   life and compare the annual figures (which implicitly assumes identical
   replacement in perpetuity — the "replacement-chain / EAC" assumption).

       CRF(r,n) = r(1+r)^n / ((1+r)^n − 1)        (capital recovery factor)
       EAA      = PW × CRF(r,n)                    (equivalent annual annuity)
       EAC      = (PW of costs) × CRF(r,n)         (cost magnitudes, EAA's
                                                    sign-positive twin)

   Capital-recovery form with salvage (engineering-economy standard):

       EAC = (P − S)·CRF(r,n) + S·r                (Newnan capital-recovery
                                                    with return; S = salvage
                                                    at end of life n)
       + A  (level annual operating cost, added directly)

   This identity ((P − S)·CRF + S·r) equals  P·CRF − S·SFF, where
   SFF = CRF − r is the sinking-fund factor; both forms are exposed-equivalent
   and unit-tested against each other.

   Decision rule:
   - Costs only (EAC): choose the alternative with the LOWEST EAC.
   - Net benefits (EAA): choose the alternative with the HIGHEST EAA.

   Use in EHS / mining / environmental valuation: comparing a 20-year
   liner-and-cap landfill closure against a 30-year engineered-barrier
   alternative; pump-and-treat vs. permeable-reactive-barrier groundwater
   remediation with different design lives; replacement timing of
   pollution-control equipment with salvage value.

   PROVENANCE (canonical references):
   - Newnan, D.G., Lavelle, J.P. & Eschenbach, T.G. (2020). Engineering
     Economic Analysis, 14th ed. Oxford University Press.
     ISBN 978-0190931919. Ch. 6 (Annual Cash Flow Analysis: EUAC/EUAB,
     capital recovery with salvage), Ch. 8 (comparing alternatives with
     different useful lives).
   - Brealey, R.A., Myers, S.C. & Allen, F. (2020). Principles of Corporate
     Finance, 13th ed. McGraw-Hill. ISBN 978-1260013900. Ch. 6
     (Equivalent Annual Cost / annuity for unequal-life comparison).
   - Park, C.S. (2019). Fundamentals of Engineering Economics, 4th ed.
     Pearson. ISBN 978-0134870687. (Capital-recovery factor (A/P,i,N),
     sinking-fund factor (A/F,i,N), annual-equivalent comparison).

   Sign convention: PW / costs / salvage / annualOperatingCost are supplied
   as their own MAGNITUDES (≥ 0) in the cost-oriented EAC API; `r` is a
   per-period real decimal rate (0.07 = 7%). The EAA helper accepts a signed
   present worth and returns a signed annual equivalent.
   ================================================================ */

// ---------------------------------------------------------------------------
// Capital recovery / sinking fund factors (STRICT — throw on bad input)
// ---------------------------------------------------------------------------

/**
 * Capital Recovery Factor (A/P, r, n) = r(1+r)^n / ((1+r)^n − 1).
 *
 * STRICT variant: unlike projectValuation.crf (which returns 1 on bad input
 * for lenient HUD display), this validates and throws, because an EAC built
 * on a silently-wrong factor would mis-rank real remediation alternatives.
 * Degenerate r = 0 returns 1/n (level repayment of principal, no interest).
 *
 * @param r - per-period real decimal rate (must be finite, > -1).
 * @param n - number of periods (integer ≥ 1).
 * @returns the capital recovery factor (annuity per unit of present worth).
 * @throws {RangeError} if r ≤ -1 or n is not an integer ≥ 1.
 */
export function capitalRecoveryFactor(r: number, n: number): number {
    if (!Number.isFinite(r) || r <= -1) {
        throw new RangeError(`capitalRecoveryFactor: rate must be finite and > -1, got ${r}`);
    }
    if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(`capitalRecoveryFactor: periods must be an integer >= 1, got ${n}`);
    }
    if (r === 0) return 1 / n;
    const factor = Math.pow(1 + r, n);
    return (r * factor) / (factor - 1);
}

/**
 * Sinking Fund Factor (A/F, r, n) = r / ((1+r)^n − 1) = CRF(r,n) − r.
 * The level annual deposit that accumulates to 1 at end of period n.
 * Degenerate r = 0 returns 1/n.
 *
 * @param r - per-period real decimal rate (must be finite, > -1).
 * @param n - number of periods (integer ≥ 1).
 * @returns the sinking fund factor.
 * @throws {RangeError} if r ≤ -1 or n is not an integer ≥ 1.
 */
export function sinkingFundFactor(r: number, n: number): number {
    // CRF − r is exact and reuses the same validation.
    return capitalRecoveryFactor(r, n) - r;
}

// ---------------------------------------------------------------------------
// Equivalent Annual Annuity (signed) — Brealey-Myers unequal-life comparison
// ---------------------------------------------------------------------------

/**
 * Equivalent Annual Annuity of a (signed) present worth over n periods.
 *   EAA = PW × CRF(r, n)
 *
 * Use to compare mutually-exclusive projects of different lives by their
 * level annual equivalent. A higher EAA (for a net-benefit PW) is better.
 *
 * @param presentWorth - signed present value (NPV) of the alternative.
 * @param r - per-period real decimal rate.
 * @param n - service life in periods (integer ≥ 1).
 * @returns the signed equivalent annual annuity.
 * @throws {TypeError} if presentWorth is not finite.
 * @throws {RangeError} via capitalRecoveryFactor on bad r/n.
 */
export function equivalentAnnualAnnuity(presentWorth: number, r: number, n: number): number {
    if (!Number.isFinite(presentWorth)) {
        throw new TypeError(`equivalentAnnualAnnuity: presentWorth must be finite, got ${presentWorth}`);
    }
    return presentWorth * capitalRecoveryFactor(r, n);
}

// ---------------------------------------------------------------------------
// Equivalent Annual Cost (capital recovery with salvage) — Newnan EUAC
// ---------------------------------------------------------------------------

export interface EquivalentAnnualCostInput {
    /** First (capital) cost P at t=0, as a non-negative magnitude. */
    firstCost: number;
    /** Service life n in periods (integer ≥ 1). */
    life: number;
    /** Per-period real discount rate (decimal, e.g. 0.07). Default 0. */
    discountRate?: number;
    /** Salvage value S recovered at end of life n (magnitude, ≥ 0). Default 0. */
    salvage?: number;
    /** Level annual operating/maintenance cost A (magnitude, ≥ 0). Default 0. */
    annualOperatingCost?: number;
}

export interface EquivalentAnnualCostResult {
    /** Equivalent Annual Cost = capitalRecovery + annualOperatingCost. */
    eac: number;
    /** Capital-recovery portion: (P − S)·CRF + S·r. */
    capitalRecovery: number;
    /** Annual operating cost passed through (A). */
    annualOperatingCost: number;
    /** Capital recovery factor (A/P, r, n) actually used. */
    crf: number;
    /** Sinking fund factor (A/F, r, n) = crf − r. */
    sff: number;
    /** Discount rate applied. */
    discountRate: number;
    /** Service life in periods. */
    life: number;
}

/**
 * Equivalent Annual Cost via the capital-recovery-with-salvage identity:
 *
 *   capitalRecovery = (P − S)·CRF(r,n) + S·r
 *   EAC             = capitalRecovery + A
 *
 * Algebraically identical to  P·CRF(r,n) − S·SFF(r,n) + A  (verified in
 * tests). Lower EAC = preferred alternative when lives differ.
 *
 * @param input - firstCost / life / discountRate / salvage / annualOperatingCost.
 * @returns frozen EquivalentAnnualCostResult.
 * @throws {TypeError} if any numeric input is non-finite.
 * @throws {RangeError} if life < 1, discountRate ≤ -1, or salvage/firstCost
 *   are negative (cost magnitudes must be ≥ 0).
 */
export function computeEquivalentAnnualCost(
    input: EquivalentAnnualCostInput,
): Readonly<EquivalentAnnualCostResult> {
    if (!input || typeof input !== 'object') {
        throw new TypeError('computeEquivalentAnnualCost: input object required');
    }
    const P = Number(input.firstCost);
    const n = Number(input.life);
    const r = input.discountRate === undefined ? 0 : Number(input.discountRate);
    const S = input.salvage === undefined ? 0 : Number(input.salvage);
    const A = input.annualOperatingCost === undefined ? 0 : Number(input.annualOperatingCost);

    if (!Number.isFinite(P)) {
        throw new TypeError(`computeEquivalentAnnualCost: firstCost must be finite, got ${input.firstCost}`);
    }
    if (!Number.isFinite(S)) {
        throw new TypeError(`computeEquivalentAnnualCost: salvage must be finite, got ${input.salvage}`);
    }
    if (!Number.isFinite(A)) {
        throw new TypeError(
            `computeEquivalentAnnualCost: annualOperatingCost must be finite, got ${input.annualOperatingCost}`,
        );
    }
    if (P < 0) {
        throw new RangeError(`computeEquivalentAnnualCost: firstCost must be >= 0, got ${P}`);
    }
    if (S < 0) {
        throw new RangeError(`computeEquivalentAnnualCost: salvage must be >= 0, got ${S}`);
    }
    if (A < 0) {
        throw new RangeError(`computeEquivalentAnnualCost: annualOperatingCost must be >= 0, got ${A}`);
    }
    if (r <= -1) {
        throw new RangeError(`computeEquivalentAnnualCost: discountRate must be > -1, got ${r}`);
    }
    if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(`computeEquivalentAnnualCost: life must be an integer >= 1, got ${input.life}`);
    }

    const crfValue = capitalRecoveryFactor(r, n);
    const sffValue = crfValue - r;
    // (P − S)·CRF + S·r  ≡  P·CRF − S·SFF
    const capitalRecovery = (P - S) * crfValue + S * r;
    const eac = capitalRecovery + A;

    return Object.freeze({
        eac,
        capitalRecovery,
        annualOperatingCost: A,
        crf: crfValue,
        sff: sffValue,
        discountRate: r,
        life: n,
    });
}

// ---------------------------------------------------------------------------
// Unequal-life comparator
// ---------------------------------------------------------------------------

export interface EacAlternative extends EquivalentAnnualCostInput {
    /** Stable identifier for the alternative (for reporting / selection). */
    id: string;
}

export interface EacComparisonEntry {
    id: string;
    eac: number;
    life: number;
}

export interface EacComparisonResult {
    /** Per-alternative EACs, in input order. */
    entries: ReadonlyArray<EacComparisonEntry>;
    /** id of the lowest-EAC (preferred) alternative; null if none provided. */
    bestId: string | null;
    /** The minimum EAC value; null if none provided. */
    bestEac: number | null;
}

/**
 * Compare mutually-exclusive cost alternatives of (possibly) unequal lives by
 * Equivalent Annual Cost and select the cheapest. Each alternative is
 * annualized over ITS OWN life — the EAC method's defining feature, which
 * sidesteps the need to build an explicit least-common-multiple replacement
 * chain while preserving the same ranking under the identical-replacement
 * assumption (Newnan Ch. 8; Brealey-Myers Ch. 6).
 *
 * Ties: the FIRST alternative achieving the minimum EAC keeps `bestId`
 * (deterministic, input order).
 *
 * @param alternatives - array of EacAlternative (each with a unique id).
 * @param sharedDiscountRate? - optional rate applied to alternatives that omit
 *   their own discountRate (a common appraisal uses one social rate for all).
 * @returns frozen EacComparisonResult.
 * @throws {TypeError} if alternatives is not an array or an id is missing.
 * @throws {RangeError}/{TypeError} propagated from computeEquivalentAnnualCost.
 */
export function compareEquivalentAnnualCost(
    alternatives: ReadonlyArray<EacAlternative>,
    sharedDiscountRate?: number,
): Readonly<EacComparisonResult> {
    if (!Array.isArray(alternatives)) {
        throw new TypeError('compareEquivalentAnnualCost: alternatives must be an array');
    }
    const entries: EacComparisonEntry[] = [];
    let bestId: string | null = null;
    let bestEac: number | null = null;

    for (let i = 0; i < alternatives.length; i++) {
        const alt = alternatives[i];
        if (!alt || typeof alt !== 'object') {
            throw new TypeError(`compareEquivalentAnnualCost: alternatives[${i}] must be an object`);
        }
        if (typeof alt.id !== 'string' || alt.id.length === 0) {
            throw new TypeError(`compareEquivalentAnnualCost: alternatives[${i}].id must be a non-empty string`);
        }
        const discountRate =
            alt.discountRate === undefined ? sharedDiscountRate : alt.discountRate;
        const result = computeEquivalentAnnualCost({ ...alt, discountRate });
        entries.push({ id: alt.id, eac: result.eac, life: result.life });
        if (bestEac === null || result.eac < bestEac) {
            bestEac = result.eac;
            bestId = alt.id;
        }
    }

    return Object.freeze({
        entries: Object.freeze(entries),
        bestId,
        bestEac,
    });
}
