# ADR — core/compliance (COMPLIANCE-PRESET-001)

> Módulo: Model Baseline Compliance Preset — preset regulatório agregado +
> banner visual persistente.
> Spec canônica: [`docs/specs/features/SPEC_MODEL_BASELINE_COMPLIANCE_PRESET.md`](../../../../../docs/specs/features/SPEC_MODEL_BASELINE_COMPLIANCE_PRESET.md)
> (§10 ADRs A1–A11 + §15 decisões Calvin D1–D9 são a fonte de verdade detalhada;
> este arquivo é o índice navegável do módulo, exigido pela convenção CLAUDE.md
> "cada módulo `core/` contém um `ADR.md`").

## Contexto

O técnico escolhia **separadamente** thresholds de validação, presets de
elements, fatores GWP/emissão, taxonomy e templates. Cada item vivia em seu
silo, causando: (a) sem auditoria forense regulatória (mesmo modelo reporta
números diferentes para reguladores diferentes — CH₄=25 AR4 vs 30 AR6 ⇒ 20%
diff em CO₂e), (b) sem banner visual (não se sabe qual regime está ativo),
(c) sem mecânica para órgãos publicarem baseline oficial.

## Decisões (resumo — racional completo em spec §10/§15)

| ADR     | Decisão                                                                                                              | Pure-logic / evidência                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **A1**  | Preset **agregador** vs múltiplos sliders — agregador força coerência.                                               | `_presetPure.ts`                                             |
| **A2**  | Banner **persistente** vs ícone discreto — Calvin "vialmente claro".                                                 | `_bannerMarkupPure.ts` + `utils/ui/complianceUiBootstrap.ts` |
| **A3**  | **Seedar** presets canônicos em código (offline-first); registry é progressive enhancement.                          | `_canonicalPresetsCatalog.ts` (8 presets, 6 categorias)      |
| **A4**  | Mudança de preset permitida mas **COM AUDIT obrigatório** + alert.                                                   | `_auditDedupPure.ts` + migration RPC `register_preset_audit` |
| **A5**  | Compatibilidade com legados — campo opcional, banner "Sem preset".                                                   | `_modelBindingsPure.ts` (single→multi anti-regressivo)       |
| **A6**  | Banner separa **preset ATIVO de CONFORMIDADE CALCULADA** (B1) — risco legal real.                                    | `_complianceIndicatorPairPure.ts`                            |
| **A7**  | **Trust chain** cripto para presets do registry (B2) — V1 badge "não verificado".                                    | `_trustChainBadgePure.ts`                                    |
| **A8**  | Versionamento **`(id, version)` imutável** (B3 + B12) — `supersededBy` + cascade `componentsHash`.                   | `_supersessionPure.ts` + `_componentsHashPure.ts`            |
| **A9**  | **Multi-jurisdição** via array de bindings com escopo (B4/B5) — 9 `PresetScope`.                                     | `_modelBindingsPure.ts`                                      |
| **A10** | Naming convention `{jurisdiction}-{authority}-{instrument}-{version}` (B22).                                         | `PRESET_ID_REGEX` em `_presetPure.ts`                        |
| **A11** | Presets **dinâmicos** com trust-preserving `provenance` (canonical/authority/derived/community/forked/user-defined). | `_presetPure.ts` + catálogo                                  |

## Decisões Calvin homologadas (spec §15 D1–D9, 2026-06-05; D4-rev 2026-06-11)

- **D4-rev**: boot sem binding ativa `global-pareto-most-restrictive-worldwide`
  scope `all` — "preset mais restritivo sempre ligado por default". O anti-risco
  (aparentar conformidade não-pretendida) é mitigado pelo D5 (preset-state ≠
  verdict). Wire: `complianceUiBootstrap.initComplianceUi`.
- **D5** (ADR A6), **D6** (A7), **D7** (A9), **D8** lock (`_lockStatePure.ts`),
  **D9** retroativo (`_retroactiveSnapshotPure.ts`).

## Rollback (spec §8)

Feature flag `CONFIG.FEATURES.COMPLIANCE_PRESET_ENABLED` (default ON por D4-rev;
a flag é a **alça de rollback**, não um A/B test). `=== false` ⇒
`initComplianceUi()` é no-op silencioso: o módulo não monta, não seleciona o
preset default e não registra listeners; os cálculos do app seguem com defaults
(zero regressão, anti-requisito N5). Helper testável
`isCompliancePresetEnabled()`. Gate: `tests/compliance-preset-flag.test.mjs`
(gate-proven-non-no-op). Mesmo precedente de `isCourseAuthoringEnabled()` /
`isPptxImportSupported()`.

## Registry Supabase + RLS (spec §4.4, RF7/RS1, decisão D3 curada V1)

Migration `supabase/migrations/20260606020000_compliance_presets_registry.sql`
— idempotente (`IF NOT EXISTS`), RLS habilitado em ambas as tabelas, **todas as
policies com cláusula `TO` explícita** (RLS default-deny rule): leitura pública
de presets não-revogados (`TO authenticated, anon`), escrita só `service_role`
(D3 curada); audit log com user-own-rows (`auth.uid()`) + RPC `SECURITY DEFINER`
anti-spoof. Gate estático: `tests/compliance-preset-migration-static-gate.test.mjs`.

## Referências académicas / normativas

IPCC AR6 WG1 Ch.7 (GWP-100) · CONAMA 420/2009 · CETESB DD 256/2016 · 40 CFR §98
EPA MRR · UNFCCC Decision 24/CP.19 (AR4) · IFRS ISSB S2 (AR6) · ACGIH TLV/BEI
2024 · NR-7 PCMSO / NR-15 (saúde ocupacional, §18 B-HS).
