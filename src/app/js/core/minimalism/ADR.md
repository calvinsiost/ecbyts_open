# ADR — `core/minimalism`: Minimalism Score (UI-MINIMALISM-001)

> **Status:** accepted
> **Date:** 2026-06-15
> **Author:** claude (worktree)
> **Scope:** `_minimalismScorePure.ts` + `_clutterSignalsPure.ts` +
> `_minimalismByScreenPure.ts` + `scripts/minimalism-score.mjs` +
> `scripts/ux-triad-report.mjs` + `docs/reports/minimalism-findings.json`

## A1. Contexto

Calvin 2026-06-15: "criar spec de user friendly UI e minimalismo… começar pela
tela do print". O ecbyts cresceu por acreção — cada feature adicionou painéis,
toggles, chips e texto, resultando em telas **verbosas e de baixa relação
sinal/ruído**. Já existem dois indicadores programáticos de UX (Friendliness/UF
em `core/friendliness` e Quality-per-screen/UI em `scripts/quality`), mas
**nenhum mede minimalismo** diretamente — então o acúmulo de ruído passa
despercebido. O painel "Workspace Loader / Inspector" (Exhibit A da spec §5)
mistura **três jobs não relacionados** num único painel estreito.

O North Star v2 (usabilidade + confiança) + o mantra no-human-tests pedem uma
métrica de ruído **viva, calculável a cada commit, sem questionário humano**.

## A2. Decisão

**Score composto não-compensatório 0-100** sobre **7 dimensões de ruído**
(Tufte data-ink ratio ∩ Nielsen "Aesthetic and Minimalist Design" ∩
progressive disclosure):

| Dimensão                 | Mede                                                    |
| ------------------------ | ------------------------------------------------------- |
| `signal_to_noise`        | razão essencial-à-tarefa / decorativo (data-ink)        |
| `redundancy`             | info repetida (mesma string ≥2×; "Local" 3× no print)   |
| `verbosity`              | texto que podia ser curto/icônico (rótulo longo, frase) |
| `progressive_disclosure` | avançado sempre-visível (controles raros no default)    |
| `visual_hierarchy`       | ação/info primária se destaca (1 CTA primário claro?)   |
| `concern_cohesion`       | a tela faz 1 job ou vários (≥3 concerns = blocker)      |
| `empty_state_clarity`    | guia quando vazio ("0 X" sem CTA; negativo-only)        |

Mecânica (espelha `core/friendliness/_friendlinessScorePure`):

1. **Penalidade por finding = peso(severidade) × fator(alcance)** — blocker 12,
   slows 4, annoys 1 (razão 3:1, auditável à mão); alcance via NN/G frequência
   (1 + 0.15·(reach−1), cap 2×). Resolvido = 0.
2. **Score por dimensão** = clamp(100 − Σpenalidades, 0, 100).
3. **Agregação geométrica ponderada** (NÃO aritmética) — alinhada a
   `core/integrity`, `core/eis`, `core/friendliness`: uma dimensão ruim não é
   mascarada por outra boa (anti-N1, ver `core/severity`).
4. **Veto** — ≥1 bloqueio aberto (job-mixing: ≥3 concerns num painel; controle
   destrutivo sem confirmação) capa o overall em 79 (não há A/B com job-mixing
   grave), espelhando o kill-switch do EIS.
5. **Grade** A≥90 / B≥80 / C≥70 / D≥60 / F<60 (Maze).
6. **Sensibilidade** (`computeMinimalismSensitivity`) — passo final do OECD/JRC
   Handbook on Composite Indicators (arXiv 2008.13637): OAT sobre pesos ±50%,
   alcance, e troca geométrica↔aritmética; reporta robustez da nota.

Os **sinais de ruído** são derivados objetivamente de um `ScreenModel`
(contagens: grupos visuais, controles sempre-visíveis, ratio texto/ícone, nº de
concerns, strings repetidas) por `_clutterSignalsPure.deriveClutterSignals` —
heurística + thresholds calibrados (KQ3), não subjetivo. `stripMarkupLiterals`
evita falso-positivo (ignora comentário/atributo/`aria-*`).

**Fonte de verdade machine-readable:** `docs/reports/minimalism-findings.json`
(seed = auditoria §5 do painel Workspace Loader). Quando o ruído é drenado,
marca-se `resolved:true` → o score sobe sozinho (crédito de progresso).

## A3. Alternativas rejeitadas

1. **Dimensão do Friendliness, não score novo** (KQ1) — rejeitado: minimalismo é
   **ortogonal** a friendliness (uma tela pode ser amigável E verbosa). Juntar
   geraria compensação cruzada (ruído baixo "compraria" friendliness ruim).
2. **Score subjetivo "bonito/feio"** — rejeitado: não reprodutível, não
   ratcheteável, não roda em CI. Só métricas objetivas + thresholds citados.
3. **Média aritmética (compensatória)** — rejeitado por princípio do projeto:
   job-mixing num painel seria mascarado por dimensões boas.
4. **Só redesign manual das telas** — rejeitado: não ratcheteável, regride
   silenciosamente sem um gate que meça o ruído.

## A4. Consequências

- Vira gate de CI ratcheteável (`--strict` vs `.runtime/minimalism-baseline.json`):
  o score de minimalismo não pode regredir. Drenar ruído sobe o número; adicionar
  verbosidade o derruba e falha o gate.
- O número é **auditável**: cada ponto rastreia a um `ClutterFinding` com
  id/dimensão/severidade/evidência no JSON. Sem caixa-preta.
- Completa a **tríade UX** — `scripts/ux-triad-report.mjs` combina UF
  (friendliness) + UI (quality-per-screen) + Minimalismo por tela com veredito
  **não-compensatório** (a pior das três puxa).
- Custo: +1 gate, mitigado por ser puro e barato (< 1s, sem browser na F1).

## A5. Provenance + Testes

**Provenance (independente):** Nielsen NN/g "Aesthetic and Minimalist Design"
(heurística #8) + Progressive Disclosure; Tufte, E. — "The Visual Display of
Quantitative Information" (data-ink ratio); robustez via OECD/JRC Handbook on
Composite Indicators 2008 + arXiv 2008.13637. Implementação independente.

**Testes:** `tests/minimalism-score.test.mjs` — ≥25 cheap (penalidade, score por
dimensão, veto por job-mixing, grade, geométrica não-compensatória provada vs
aritmética, sinais de clutter do markup, por-tela + agregação da suíte,
determinismo, frozen, sensibilidade). Fixture canônica = o painel do print
(Exhibit A): 3 concerns → blocker → veta para faixa F; "Local" 3× → redundancy.
Gate non-no-op: introduzir um blocker derruba o score e o ratchet falha.
