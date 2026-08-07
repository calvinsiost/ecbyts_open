# ADR — CONSENSUS-MATRIX-001 (Matriz de Consenso para Validação Final)

**Status**: Accepted
**Date**: 2026-06-02
**Author**: claude - ui (delivery)
**Spec**: [`docs/specs/_archived/SPEC_CONSENSUS_VALIDATION_MATRIX.md`](../../../../../docs/specs/_archived/SPEC_CONSENSUS_VALIDATION_MATRIX.md)
**Module**: `core/ingestion/documents/` (8 pure-logic submodules)

---

## Contexto

O pipeline de extração de PDF/DOCX (RICH-DOC-FULL-001) hoje produz outputs textuais
de **uma única origem** (heurística baseline = T0). Quando o usuário recebe esses
campos pré-preenchidos no wizard de ingestão, **não há indicação se algum valor é
incerto** ou se múltiplas origens divergiriam sobre ele. Em produção, isso significa
que erros silenciosos em campos críticos (CNPJ inválido, município errado, tipo de
documento mal classificado) escapam pela validação e entram no modelo.

Adicionalmente, o roadmap do ecbyts contempla **adicionar fontes paralelas** ao
extrator textual:

- **T1** — regex paralelo (validação determinística, ex.: módulo 11 de CNPJ)
- **T3** — visão computacional (extrair do header/logo do PDF)
- **T4** — LLM remoto (consensus semântico)

Sem uma camada que **combine essas fontes e detecte divergências**, adicionar T1/T3/T4
significaria escolher uma fonte arbitrariamente ou mostrar todas as alternativas
indiscriminadamente.

## Decisão

Criar **8 módulos pure-logic** que formam um pipeline de validação multi-tier
determinístico, com 7 categorias canônicas de veredito:

| Módulo                             | RF         | Responsabilidade                                                                                                   |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `_tierWeightsPure.ts`              | RF-4       | Pesos calibrados por (tier × fieldType): T1 regex CNPJ = 1.0; T1 client.name = 0.3; T3 vision document.type = 0.85 |
| `_disagreementEntropyPure.ts`      | RF-3       | Shannon entropy H = -Σ p_i log2(p_i) + normalização                                                                |
| `_consensusMatrixBuilderPure.ts`   | RF-1+RF-2  | Combina TierOutput[] por campo → ConsensusVerdict em 7 categorias                                                  |
| `_consensusModalRendererPure.ts`   | RF-5       | HTML do modal "Revisão final" + ordenação por urgência                                                             |
| `_consensusModalNavPure.ts`        | F3         | State machine de keyboard navigation (Enter/Esc/↑↓/Tab/Ctrl+Enter)                                                 |
| `_humanCorrectionLogPure.ts`       | RF-7       | Registra correções humanas em IDB local (LGPD)                                                                     |
| `_tierAccuracyCalculatorPure.ts`   | RF-8       | Wilson 95% CI por (tier × fieldType) + weight adjustment suggestions                                               |
| `_tierMetricsViewModelPure.ts`     | RF-9       | View model + renderer HTML para painel customize                                                                   |
| `_richDocToConsensusMatrixPure.ts` | F6 adapter | Converte RICH-DOC outputs → TierOutput[] T0                                                                        |

### 7 categorias canônicas de veredito

| Categoria        | Critério                            | Ação                      |
| ---------------- | ----------------------------------- | ------------------------- |
| `unanimous`      | 100% tiers concordam, conf ≥0.8     | auto-aplica               |
| `majority`       | ≥2 tiers concordam, 1 diverge       | auto-aplica flag amarela  |
| `split`          | 50-50 entre 2 valores               | **HITL obrigatório**      |
| `low-confidence` | todos concordam mas conf média <0.5 | **HITL**                  |
| `single-source`  | só 1 tier respondeu                 | aplica com source visível |
| `disagree-3way`  | 3+ valores distintos                | **HITL**                  |
| `empty`          | nenhum tier respondeu               | campo manual              |

## Princípios

1. **Pure-logic 100%** — sem DOM, sem IDB, sem rede. Determinístico. Object.freeze em todos os returns.
2. **MCHR preservado** — não aplica veredito automaticamente; humano confirma via modal.
3. **Defensive em 3 camadas** — input null/inválido → resultado vazio bem formado (nunca throws).
4. **Single source types** — `ConsensusCategory`, `TierOutput`, `ConsensusVerdict` exportados de `_consensusMatrixBuilderPure` e re-imported pelos outros.
5. **Backward compat** — quando T1/T3/T4 chegarem, basta passar `additionalTierOutputs` ao adapter; nenhum extractor existente precisa mudar.
6. **LGPD** — correction log fica em IDB local. NUNCA syncado para server.
7. **Wilson score 95% CI** — preferido a Wald approximation por ser mais robusto com n pequeno (típico no início do dataset de correções).
8. **i18n EN/PT/ES** — 10 chaves `ingestion.consensus.*` cobertas em 3 locales.

## Estado atual (2026-06-02)

| Fase      | Entrega                                                 | Sentinels                | Commit     |
| --------- | ------------------------------------------------------- | ------------------------ | ---------- |
| F1        | 3 módulos pure-logic core (RF-1+RF-2+RF-3+RF-4)         | 29                       | `f4a6d3ef` |
| F2        | Modal renderer + wire em `_renderDocReview` (RF-5+RF-6) | 33                       | `f4a6d3ef` |
| F3        | Keyboard navigation (RF-5 atalhos)                      | 29                       | anterior   |
| F4        | Correction log + accuracy calculator (RF-7+RF-8)        | 26                       | anterior   |
| F5        | Tier metrics view model (RF-9)                          | 17                       | anterior   |
| F6        | Adapter RICH-DOC + wire produção + badge UI             | 21                       | anterior   |
| F7        | i18n EN/PT/ES (10 chaves × 3 locales)                   | 15                       | anterior   |
| **Total** | **8 módulos**                                           | **170 sentinels verdes** | —          |

## Onde aparece na UI

**Importar Dados → PDF/DOCX → painel "Resultados da Extração"**:

1. 🤖 N campos auto-preenchidos do PDF (RICH-DOC-FULL)
2. 🗺 N figuras geo-localizadas (FIGURE-GEOM, se houver)
3. ⚙ **Matriz de Consenso — N campos, X% assertividade** (F6 badge)

Modal "Revisão final" (F2) aparece quando `shouldRenderModal=true`:

- `criticalCount > 0` (split / 3way / low-confidence)
- OU `majority com confidence < 0.7`

**Hoje (só T0 ativo)** todos os campos viram `single-source` — modal não aparece.
Quando T1/T3/T4 forem wired, divergências reais emergem e o modal acionará HITL.

## Consequências

**Positivas**

- Pipeline de validação multi-tier 100% determinístico, custo zero, custo dormente baixo.
- Adicionar nova origem (T1 regex CNPJ, T3 visão Track B já existente, T4 LLM) é **additive** — basta passar `additionalTierOutputs[fieldId]` ao adapter.
- Correction log offline permite calcular accuracy real por tier sem expor PII.
- Wilson 95% CI dá intervalos de confiança honestos mesmo com n pequeno.
- Badge UI dá visibilidade humana do estado da matriz sem bloquear fluxo.
- 170 sentinels protegem contra regressão em refactors futuros.

**Negativas**

- Hoje (só T0) o modal não aparece — é "infraestrutura à frente do consumo". Custo: ~155 LOC vivas sem feedback de produção até T1/T3/T4 chegarem.
- Pesos T0..T4 são calibrados empiricamente, não estatisticamente. Suggestion engine (RF-8 `suggestWeightAdjustments`) só dará dados úteis após ≥30 correções por (tier × fieldType).
- IDB store é adapter injetado — wire de produção para `_humanCorrectionLogPure` ainda não existe (próximo ciclo).
- 6 fields canônicos cobertos pelo adapter F6 (`client.name`, `client.cnpj`, `area.city/state`, `document.reference`, `status.classification`). Litologia/campanhas/wells ainda fora do escopo de consensus.

## Não-objetivos (NOT)

- NÃO substitui validação de domínio (CONAMA 420, CETESB DD 256/2017) — esses continuam separados.
- NÃO sincroniza correction log com server (LGPD).
- NÃO faz ensemble pré-treinado de modelos (DISCOUQ-style — escopo separado).
- NÃO integra com EU AI Act Article 14 audit endpoints (jurisdição específica).
- NÃO faz A/B testing automático de pesos de tier (mantém deploy estável).
- NÃO inclui T1/T3/T4 nesta fase — apenas a infraestrutura.

## Riscos residuais + mitigação

| Risco                                        | Mitigação                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Pesos T0..T4 não calibrados estatisticamente | RF-8 calculator + suggestion engine roda offline; Calvin pode revisar via painel customize quando RF-9 viewer for wired                   |
| LLM remoto (T4) custo $/PDF                  | Spec proíbe T4 para extração numérica (alucinação inaceitável); só para classificação textual. Custo estimado <$0.005/PDF em swarm gemma4 |
| IDB store cresce indefinidamente             | `CorrectionLogStore.deleteBefore(timestamp)` adapter contract permite retenção ≤90 dias                                                   |
| Mudança de pesos quebra reprodutibilidade    | `_tierWeightsPure` exporta `getTierWeight` puro + version no META; mudança requer bump                                                    |

## Próximos passos (fora desta ADR)

1. Wire IDB real para `_humanCorrectionLogPure` (idbStore.js adapter)
2. Adicionar T1 regex paralelo para CNPJ (módulo 11 validation) — ~50 LOC + 1 sentinel
3. Adicionar T3 visão via Track B existente (documentAssets) — adapter ~80 LOC
4. Wire viewer RF-9 em painel customize — botão "Métricas dos tiers"
5. Adicionar T4 LLM via openrouter swarm gemma4 (custo baixo) — só para classification

## Referências

- Spec mãe: `docs/specs/_archived/SPEC_CONSENSUS_VALIDATION_MATRIX.md`
- Auditoria heurísticas: `docs/reports/AUDIT_HEURISTIC_VS_CONNECTED_2026_06_02.md`
- ADR-022 (parent): `core/ingestion/documents/ADR.md`
- Pesquisa: 11 fontes acadêmicas (multi-LLM consensus, MCHR, EU AI Act) consolidadas pre-spec
- Wilson interval: Wilson, E. B. (1927). _Probable Inference, the Law of Succession, and Statistical Inference_. JASA 22(158): 209–212.

---

— claude - ui (2026-06-02)
