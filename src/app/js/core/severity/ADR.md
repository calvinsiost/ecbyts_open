# ADR — `core/severity`: Pure severity composition

**Status:** accepted · **Date:** 2026-06-03 · **Owner:** claude - executor
**Spec parent:** [`docs/specs/_archived/SPEC_ECBT_SCORE_MONETARY_EIS.md`](../../../../docs/specs/_archived/SPEC_ECBT_SCORE_MONETARY_EIS.md)
**Module:** `src/app/js/core/severity/_severityPure.ts`

## Context

Phase F1 of SPEC_ECBT_SCORE_MONETARY_EIS. The EIS (3CTA+) module today measures
only **data integrity** ("can I trust the record?"). It does not express how
**severe** the underlying environmental/occupational situation is. The spec
introduces a second axis — physical severity S ∈ [0,1] composed from risk R
and impact I — that EIS then qualifies via confidence κ (Phase F2).

This module is the deterministic numerical core of S, with no DOM/IDB/network
dependency.

## Decision

1. **Two pure normalizers, one composer.**
   `normalizeRisk(input) → R ∈ [0,1]` and `normalizeImpact(input) → I ∈ [0,1]`
   take discriminated-union inputs (kind tag) so the caller declares the
   semantic of the value being passed. `composeSeverity(R_in, I_in, opts)`
   returns a frozen VM `⟨R, I, S, method, label⟩`.

2. **R normalization — four kinds.**
    - `hq` (RBCA ASTM E2081): R = HQ / (HQ + 1) — bounded asymptote, HQ=1 ⇒ R=0.5,
      HQ=10 ⇒ R≈0.91, so the result naturally signals "well above unity ≠ infinity".
    - `ratio` (concentration ÷ VI/VRC): R = min(c/vi, 10) / 10 — cap at 10× VI
      because beyond that the linear ratio loses operational meaning (the area is
      "well past intervention").
    - `gac` (CETESB DD 038/2017 ordinal): AP=0.85, AS=0.5, ACI=0.2 — chosen to
      keep AP firmly above the high/severe boundary (≥0.8) and AS at the
      transition between moderate and high.
    - `normalized`: caller provides pre-normalized 0-1.

3. **I normalization — two kinds.**
    - `ods` (magnitude × scope × reversibility): aggregation by **max**, not
      product. Each dimension is already a fraction of "worst case"; multiplying
      a moderate magnitude by a partial scope dilutes the signal. Max preserves
      the worst dimension per SDG framing.
    - `normalized`: caller provides pre-normalized 0-1.

4. **Composition — `max(R, I)` by default.**
   The conservative non-compensatory choice. `S ≥ max(R, I)` always, so a high
   risk **or** a high impact is sufficient to flag the area. The alternative
   `geometric_weak` (S = √(R·I)) is exposed but defaults off; it is only
   semantically valid when R and I are commensurable, which is rare.

5. **Label mapping — 5 ordinal tiers**, 0.2 wide each: `baixa`, `moderada`,
   `alta`, `severa`, `critica`. Used for UI grouping only; the continuous S is
   the source of truth (Cox 2008: never use a discrete matrix as the decision
   rule).

## Alternatives considered

- **Multiplying R × I directly** — rejected (N4 in the spec): allows a low
  reversibility (high I) to be cancelled by a low concentration (low R), which
  is exactly the compensation that the non-compensatory framing forbids.
- **Weighted sum α·R + (1−α)·I** — rejected: requires a justification for α
  that does not exist universally; compensation again.
- **Cap-and-floor matrix lookup** (the CETESB 5×5 colored quadrant) — kept only
  as a UI presentation layer; never as the rule (Cox 2008).
- **Embedding HQ asymptote with a different formula** (e.g. 1 − e^(−HQ)) —
  considered but the chosen `HQ/(HQ+1)` is the standard logistic-style mapping
  used in many RBCA spreadsheets and is easier to invert mentally.

## Consequences

- **Positive:** pure-logic module passes `node --test`; no browser, no IDB, no
  network. The EIS canonical engine (Phase F2) can consume `composeSeverity()`
  directly. The ECBT Score module (Phase F3) reads `S` and `κ` only and never
  touches the raw R/I — clean layering.
- **Negative:** the HQ-to-R mapping is opinionated (a different lab might
  prefer a different curve); documented here so reviewers can challenge.
- **Trade-off:** `max` composition is conservative — it will sometimes flag
  areas that a compensatory model would not, which is the explicit goal.

## Test coverage

`tests/severity-pure.test.mjs` — Node `--test` cheap tests covering all four R
kinds, both I kinds, both composition methods, label thresholds, defensive
clamping on NaN/Infinity/negative inputs, frozen VM invariant, and the
non-compensatory invariant `S ≥ max(R, I)` under `method='max'`.

## References

- Cox, L.A. (2008). _What's Wrong with Risk Matrices?_ Risk Analysis 28(2).
- ASTM E2081 — _Standard Guide for Risk-Based Corrective Action_.
- CETESB DD 038/2017 — Classificação GAC AP/AS/ACI.
- Munda, G. (2008). _Social Multi-Criteria Evaluation for a Sustainable Economy_.
- SPEC_ECBT_SCORE_MONETARY_EIS §2 (M1, N4) — anti-requirements honored here.
