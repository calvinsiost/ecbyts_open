# ADR — `core/erp`: Double-entry mini-ERP + multi-standard income-statement engine

**Status:** accepted · **Date:** 2026-06-21 · **Owner:** claude - adm
**Spec parent:** [`docs/specs/features/SPEC_ERP_SIMPLE_MODULES_AND_CONSOLIDATED_DRE.md`](../../../../docs/specs/features/SPEC_ERP_SIMPLE_MODULES_AND_CONSOLIDATED_DRE.md) (ERP-DRE-001)
**Modules:** `src/app/js/core/erp/_chartOfAccountsPure.ts`, `_journalPure.ts`, `_ledgerPure.ts`, `_statementStandards.ts`, `_incomeStatementPure.ts`, `_ebitdaReconciliationPure.ts`, `_ecbtScoreAdapterPure.ts`

## Context

The ecbyts platform models the environmental side of a venture well and already
computes the ECBT Score as a monetary net balance (`V_net = Σ assets − Σ
liabilities`). What was missing is the financial-operational side: a place to
record revenue/cost/expense and a way to assemble a period result (profit or
loss) that the accountant/bank/regulator recognises — and that feeds the ECBT
Score with traceable numbers instead of hand-keyed ones.

This ADR records three structural decisions for the new `core/erp/` module.

## Decision

### D1 — Double-entry bookkeeping (partida dobrada)

Every movement is a `JournalEntry` with ≥2 `Posting`s where Σdebit = Σcredit.
This is the universal accounting model: the balance check detects errors by
construction, the audit trail is native, and the ledger maps directly to the
income statement. Posted entries are immutable (frozen); corrections happen only
through a **reversal** (`reverseEntry`) that swaps debit/credit and references
the original — so the history is never rewritten (RF-3).

*Alternatives rejected:* single-entry (a flat list of revenues/expenses) never
self-balances and yields no asset/liability trail for the Score; integrating an
external ERP (ERPNext/LedgerSMB) adds a heavy backend dependency that conflicts
with "produto ASAP" and with the Score's own monetary engine.

### D2 — Three dimensions per account

Each `Account` carries, beyond its `rootType`
(ativo/passivo/patrimonio/receita/despesa), three optional dimensions:

| Dimension      | Values                                              | Purpose |
| -------------- | --------------------------------------------------- | ------- |
| `function`     | cost_of_sales / selling / admin / other             | by-function P&L (IFRS/US GAAP face) |
| `nature`       | personnel / depreciation / materials / services / … | by-nature note (IAS 1 §104, ASU 2024-03) |
| `ifrsCategory` | operating / investing / financing                   | IFRS 18 (2027) subtotals + finance-result split |

A single chart of accounts thus projects into **all** of: BR-DRE, IFRS by
function, IFRS by nature, IFRS 18 and US GAAP ASC 220 — and already covers the
disaggregation notes those standards require. Building with the IFRS 18
categories present today avoids a re-tagging migration when IFRS 18 takes effect
on 2027-01-01.

*Alternative rejected:* a single `dreLine` tag per account (the original v0.1
sketch). It hard-codes one statement shape and cannot reproduce three standards
from the same data — exactly the requirement Calvin raised ("não apenas BR").

### D3 — Table-driven engine (STANDARDS), not `if/else` per standard

`_statementStandards.ts` holds `STANDARDS = { 'BR-DRE', 'IFRS-IAS1',
'US-GAAP-ASC220' }`, each an ordered list of line specs. A line is either a
`projection` (sum of account balances selected by a predicate over the three
dimensions, with a sign) or a `subtotal` (a signed combination of earlier
lines). `_incomeStatementPure.buildIncomeStatement` is a generic evaluator over
that table — it contains **no** per-standard branching. Adding or amending a
standard (e.g. IFRS 18 in 2027) is a data change in one file, testable in
isolation, with zero risk to the other standards' code paths.

*Alternative rejected:* one `buildBrDre` / `buildIfrs` / `buildUsGaap` function
each. It triples the surface that can drift, duplicates the projection logic,
and makes "the three standards agree on a reference dataset" (RF-5) a cross-cutting
test instead of a single parametrised one.

## Consequences

- **Positive:** the DRE always balances; the ECBT Score's assets/liabilities are
  traceable to journal entries; three reporting standards come from one ledger;
  the module has no dependency on the DOM, IDB or network, so it runs under
  `node --test` and layers cleanly under `core/ecbtScore`.
- **Negative:** a new core module to maintain and a small amount of accounting
  vocabulary in the codebase (debit/credit, rootType). The UI (`utils/ui/erp/`)
  hides débito/crédito behind a green/red balance indicator, so the end user
  never confronts the theory.
- **Trade-off:** the EBITDA add-back of depreciation/amortization is supplied by
  the caller (`computeEbitda(..., { depreciationAmortization })`) because D&A is
  not a face line in any of the three standards — it lives inside operating
  expenses. This keeps the engine honest (it never guesses D&A) at the cost of
  one explicit parameter.
- **Reversibility:** Medium. The whole feature sits behind
  `CONFIG.FEATURES.ERP_DRE`; turning it off restores the manual Score. The data
  model is internal to ecbyts — no external-vendor lock-in.
- **When to revisit:** if full Balance Sheet / Cash Flow, multi-entity
  consolidation or statutory tax computation become requirements, re-evaluate an
  external ERP integration.

## Test coverage

One `tests/erp-*.test.mjs` suite per module: chart leaf/group validation;
double-entry rejection of unbalanced entries; immutability + reversal; ledger
aggregation by natural side; each of the three standards reproducing the correct
lines from a shared reference dataset; EBITDA reconciliation closing from net
income; and the adapter producing valid `FinancialEntry[]`.

## References

- Lei 6.404/76 Art. 187 + CPC 26 (R1) — Apresentação das Demonstrações Contábeis.
- IAS 1 — *Presentation of Financial Statements*; IFRS 18 (effective 2027-01-01).
- FASB ASC 220 — *Income Statement*; SEC Reg G (non-GAAP measures); ASU 2024-03 (DISE).
- Resolução CVM 156/2022 — LAJIDA/EBITDA reconciliation.
- ERP-DRE-001 §1.4 (line-by-line mapping), §4 (architecture), §10 (ADR A1–A5).
