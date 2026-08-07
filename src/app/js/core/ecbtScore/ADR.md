# ADR — `core/ecbtScore`: Pure monetary net-balance computation

**Status:** accepted · **Date:** 2026-06-03 · **Owner:** claude - executor
**Spec parent:** [`docs/specs/_archived/SPEC_ECBT_SCORE_MONETARY_EIS.md`](../../../../docs/specs/_archived/SPEC_ECBT_SCORE_MONETARY_EIS.md)
**Module:** `src/app/js/core/ecbtScore/_ecbtScorePure.ts`

## Context

Phase F3 of SPEC_ECBT_SCORE_MONETARY_EIS. After F1 (`core/severity`) the
platform can express physical severity S; the EIS module continues to deliver
integrity 3CTA+ and the derived confidence κ = integrity/5. F3 introduces the
**monetary** side of the dual report: a net balance `V_net = Σ assets − Σ
liabilities` with a confidence band that widens as κ falls, plus the
mode-selected normalised percentage that the spec calls "ECBT Score".

The module is pure-logic (no DOM, no IDB, no network), so the UI layer
(F5) and the API layer (F4) can both consume it deterministically.

## Decision

1. **Three quantities returned, one is canonical.**
    - `amount` = V_net in the chosen currency (canonical — never hidden).
    - `low`, `high` = the band around `amount`, _always_ present, even when κ=1.
    - `pct`, `pctLow`, `pctHigh` = mode-selected percentages; `null` when
      `mode='absolute'` or denominator is missing. **No clamp** — a 250 %
      deficit is critical information about insolvency.

2. **Band = GUM tier 1 × κ-widener, not κ inside the sum.**
   This honours anti-requirement N2 ("integrity is NOT a parcel"):

    ```
    U_A = √(Σ (vᵢ · uᵢ)²)   for assets
    U_L = √(Σ (vⱼ · uⱼ)²)   for liabilities
    U   = √(U_A² + U_L²)
    half-band = U × (1 + 2·(1 − κ))    ⇒ κ=1 ×1, κ=0.5 ×2, κ=0 ×3
    ```

    κ never moves `amount`; it widens what surrounds it. Even with κ=1 the GUM
    uncertainty itself can be non-zero (lab uncertainty etc.), so `low ≠ amount`
    in general.

3. **Mode-selected percentage — caller declares; we never fabricate.**
   `mode='marketIntensity'` requires the caller to supply a denominator
   (market cap / EV / equity) with a timestamp. `mode='returnOnCost'` requires
   a remediation/restoration cost. `mode='extension'` requires area or
   population. `mode='absolute'` returns no pct at all. This is anti-N8:
   never invent a synthetic V_m for an entity that has no market value.

4. **Currency resolution — declared > unanimous > 'mixed' fallback.**
    - If `input.currency` is set, that's the output currency.
    - Else, if every entry has the same currency, use that.
    - Else, return `'mixed'` and set `mixedCurrencyFallback: true` (UI must
      warn). We never silently convert: F3 is pure-logic and has no FX engine;
      conversion is the responsibility of `core/currency` upstream.

5. **Output VM is frozen.** Same convention as `core/severity`. Any consumer
   that mutates the result is buggy by construction.

## Alternatives considered

- **Subtract κ from `amount`** ("confidence-discount V_net"). Rejected: that's
  the lesson from natural-capital accounting — uncertainty becomes a single
  discount, hiding magnitude. We keep magnitude visible and widen the band
  instead.
- **Always clamp pct to [−100 %, +100 %]**. Rejected (N8 in spec): the most
  important pct values are exactly those above ±100 % (passive larger than
  the firm = environmental insolvency).
- **Convert all currencies to USD internally.** Rejected for F3 (pure-logic):
  it would require importing the FX engine and pretending FX rates have no
  uncertainty. We delegate to `core/currency` upstream.
- **Use Monte Carlo here for the band.** Out of scope for F3 (that's F6). GUM
  tier 1 + κ-widener is sufficient for the default reporting path.

## Consequences

- **Positive:** `core/ecbtScore` has no dependency on `core/eis`, `core/financial`
  or any browser API; tests run in `node --test` and the layering is clean.
  Phase F4 (dual-report API) consumes both `core/severity` and `core/ecbtScore`
  side by side; neither leaks into the other.
- **Negative:** callers must compute κ themselves (= integrity3CTA / 5) for F3.
  This is intentional — keeping κ explicit at the boundary prevents implicit
  coupling.
- **Trade-off:** the κ-widener formula `1 + 2·(1 − κ)` is a heuristic. It is
  documented here and exposed as `bandWidenerFromKappa` so future ADRs can
  challenge it without rewriting `computeEcbtScore`.

## Test coverage

`tests/ecbt-score-pure.test.mjs` — covers V_net signs, GUM root-sum-square,
the κ-widener (κ=1 → ×1, κ=0.5 → ×2, κ=0 → ×3), band invariant
(`low ≤ amount ≤ high`), all four modes (returnOnCost = BCR−1, marketIntensity
= natural-capital intensity, extension = per-area, absolute = no pct),
no-clamp invariant (pct can exceed ±100 %), mixed-currency fallback, NaN/
Infinity defenses, and frozen-VM invariant.

## References

- BIPM JCGM 100:2008 — _GUM: Guide to the expression of uncertainty in
  measurement_.
- ASTM E2137 — _Standard Guide for Estimating Monetary Costs and Liabilities
  for Environmental Matters_.
- UN SEEA EA (2021) — _System of Environmental-Economic Accounting: Ecosystem
  Accounting_.
- OECD (2018). _Cost-Benefit Analysis and the Environment_.
- Nicholls, J. et al. (2012). _A Guide to Social Return on Investment_.
- Trucost / PwC — natural capital intensity methodology.
- SPEC_ECBT_SCORE_MONETARY_EIS §2 M3/M5/M6/M8 + §10 A3/A4/A9.
