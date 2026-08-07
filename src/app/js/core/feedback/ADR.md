# ADR — `core/feedback`: Trust-of-use feedback signals (pure-logic)

**Status:** accepted · **Date:** 2026-06-17 · **Owner:** claude - omni (DoD finishing)
**Spec parent:** [`docs/specs/features/SPEC_SYSTEM_TRUST_OF_USE.md`](../../../../docs/specs/features/SPEC_SYSTEM_TRUST_OF_USE.md) (SYS-TRUST-USE-001)
**Also referenced by:** [`docs/specs/_archived/SPEC_UNIVERSAL_FEEDBACK_WIDGET.md`](../../../../docs/specs/_archived/SPEC_UNIVERSAL_FEEDBACK_WIDGET.md) · [`docs/specs/arch/SPEC_UI_EXPLORATION_HARNESS.md`](../../../../docs/specs/arch/SPEC_UI_EXPLORATION_HARNESS.md)
**Modules:**
`src/app/js/core/feedback/aggregator.ts` ·
`src/app/js/core/feedback/manager.ts` ·
`src/app/js/core/feedback/bootProgressEstimator.ts` ·
`src/app/js/core/feedback/freshnessClassifier.ts` ·
`src/app/js/core/feedback/nielsenHeuristicsAudit.ts`

## Context

`core/feedback/` collects the **trust-of-use signal layer** of ecbyts — the
parts of the product that tell the user "you can trust what you are seeing"
(North Star v2: Pilar 1 usabilidade + Pilar 2 confiança no resultado). It grew
incrementally from the universal like/dislike widget (RLHF signal) into the home
of the SYS-TRUST-USE-001 pure-logic helpers (boot ETA, result freshness, Nielsen
heuristics audit). This ADR was missing — it is created here to satisfy the
mandatory `core/` ADR rule and to document the decisions already shipped in code.

Each helper is **pure-logic** (no DOM / no `localStorage` / no Supabase / no
i18n binding): clocks, locale and storage are injected by the caller, so every
module is testable under the Node `--test` runner without a browser.

## Decision

1. **Pure core, impure edge.** All math/classification lives in `core/feedback`;
   all DOM/`localStorage`/Supabase wiring lives in `utils/` (e.g.
   `main/startup-feedback.ts`, the widget UI). The split is enforced by the
   cheap Node gates — they import the `core/` module directly and would fail if a
   browser-only dependency leaked in.

2. **`aggregator.ts` — feedback vote math (SPEC_UNIVERSAL_FEEDBACK_WIDGET §A4).**
   Role-weighted votes (`anon=0.3`, `authed=1.0`, `p2p_early=1.5`), aggregate
   like/dislike ratio, rate-limit check, regression detection (score < −0.3 for 3
   runs), payload builder/validator. Frozen constant tables (`VOTE_VALUES`,
   `WEIGHT_BY_ROLE`). State + sync stay in `manager.ts`.

3. **`manager.ts` — localStorage-first persistence (Phase 1 MVP).** Votes persist
   via `safeSetItem()` (never raw `localStorage.setItem`, per tech-debt rule).
   Phase 2 will wire sync to Supabase `public.model_feedback` through the existing
   `syncQueue`. Per-screen rate limit `RATE_LIMIT_MS = 60_000`.

4. **`bootProgressEstimator.ts` — boot ETA + smooth fill + stuck detection
   (TRUST-011).** EMA (α=0.30, NIST/SEMATECH e-Handbook §6.4.3 EWMA) over the
   per-phase durations of the last N boots, persisted as a validated, corruption-
   resilient JSON history. `estimateEtaMs`, `computeSmoothFill` (linear
   interpolation clamped at target), and a `stuck` flag (elapsed > 2× EMA AND
   rendered < target − 0.5). 2× is the empirical stuck threshold (1.5× = too many
   false positives, 3× = too late to reassure). Ref: Nielsen NN/g 2014, continuous
   progress reduces perceived wait by 30–40%.

5. **`freshnessClassifier.ts` — result freshness (TRUST-012).** Discrete tier
   `recent / fresh / stale / outdated / unknown` from age vs domain-aware
   thresholds (`default / sensor / spatial / eis / sample`). Each tier carries a
   non-color-only icon (WCAG 1.4.1). `formatRelativeTimeI18n` returns a
   `{ key, vars }` payload (not a rendered string) so the caller renders it with
   `t(key, vars)` — same shape as `core/models/modelVcsViewModel.formatRelativeTime`
   for horizontal dedup. Ref: Nielsen NN/g 2018 "Display the date of data".

6. **`nielsenHeuristicsAudit.ts` — golden-path audit (TRUST-014).** Frozen
   registry of Nielsen's 10 heuristics (1994/2020) with i18n keys for
   name/summary/auditQuestions/violationExamples, plus a scorer with quadratic
   severity penalty (`severity² × 5`) so "catastrophic dominates" (1 sev-4 issue
   ⇒ score 20; 4 sev-1 issues ⇒ score 80). Verdicts: excellent ≥90 / good ≥75 /
   acceptable ≥60 / needsImprovement ≥40 / critical <40. No I/O — observations are
   collected by the E2E/audit caller and passed to `scoreGoldenPath()`.

7. **i18n is data, not string literals.** User-facing strings emitted by these
   modules (or by their thin wire layer) are i18n keys resolved at the edge via
   `t(key, vars)` with `{{var}}` placeholders. TRUST-011's `boot.stuck.message`
   (var `{{phase}}`) and `boot.eta.short` (var `{{eta}}`) and TRUST-012's
   `freshness.tier.*` / `freshness.time.*` all live in `en-US` / `pt-BR` / `es-LA`
   (the three base locales). The boot stuck wire previously hard-coded a Portuguese
   string in `main/startup-feedback.ts`; that is now resolved through
   `boot.stuck.message`.

## Alternatives considered

- **Simple moving average for boot ETA** — rejected: a single slow boot (cold
  cache, GC pause) skews the mean for many subsequent boots. EMA decays old
  outliers gracefully.
- **Continuous freshness score instead of discrete tiers** — rejected for the UI
  badge: a 0–1 number is not actionable for a non-technical user. Discrete tiers
  with an explicit recommendation ("recompute") are. The raw age is still
  available for callers that want it.
- **A discrete Nielsen severity matrix as the decision rule** — rejected (Cox
  2008): the matrix is for grouping/display only; the continuous score is the
  source of truth.
- **Rendering relative-time strings inside the classifier** — rejected: would
  couple the pure module to a locale. Returning `{ key, vars }` keeps it pure and
  lets the edge layer localize.

## Consequences

- Every module has a Node cheap gate, all of which run without a browser:
  `tests/trust-011-boot-progress-estimator.test.mjs`,
  `tests/trust-011-startup-feedback-wire.test.mjs`,
  `tests/trust-011-boot-progress-integration.test.mjs`,
  `tests/trust-012-freshness-classifier.test.mjs`,
  `tests/trust-014-nielsen-heuristics-audit.test.mjs`.
- Adoption of the freshness badge in `eis/dashboard` + `temporalAnalysisPanel`,
  and a boot-delta E2E spec, remain open per the TRUST-011/012 "Próximos passos"
  tables in the spec — the pure-logic + i18n DoD layer is complete.
- Any new feedback/trust signal SHOULD land here as a pure-logic helper with an
  injected clock/locale/storage and a Node cheap gate, then be wired at the edge.
