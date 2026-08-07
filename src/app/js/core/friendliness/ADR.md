# ADR — `core/friendliness`: Friendliness Score (FRIEND-SCORE-001)

> **Status:** accepted
> **Date:** 2026-06-13
> **Author:** claude - ui
> **Scope:** `_friendlinessScorePure.ts` + `scripts/friendliness-score.mjs` +
> `docs/reports/friendliness-findings.json`

## A1. Contexto

Calvin 2026-06-13: "crie um score programático (pesquise boas práticas online)".
A auditoria de personas (`PERSONA_JOURNEY_PAIN_AUDIT_2026_06_11`) e o passe Via
Negativa (`USER_FRIENDLINESS_VIA_NEGATIVA_2026_06_13`) produziram um mapa de
fricção rico, porém **estático** — um documento que envelhece. O North Star v2
(usabilidade + confiança) + o mantra no-human-tests pedem uma **métrica viva,
calculável a cada commit, sem questionário humano**.

## A2. Decisão

**Score composto não-compensatório 0-100** sobre 5 dimensões (Nielsen ∩ HEART):
aprendizagem, eficiência, experiência-de-erro, carga-cognitiva, tédio/delight.

Pesquisa (`.runtime/research/friendliness-score-2026-06-13.md`): Google HEART,
SUM/Maze (benchmarks ≥90/70), Friction Score (Mouseflow), UX Debt NN/G
(severidade × frequência). Mecânica:

1. **Penalidade por finding = peso(severidade) × fator(alcance)** — 🔴 12, 🟡 4,
   🟢 1; alcance via NN/G frequência (1 + 0.15·(reach−1), cap 2×). Resolvido = 0.
2. **Score por dimensão** = clamp(100 − Σpenalidades, 0, 100).
3. **Agregação geométrica ponderada** (NÃO aritmética como o SUM original) —
   alinhada a `core/integrity` e `core/eis`: uma dimensão ruim não é mascarada
   por outra boa (anti-N1, ver `core/severity`).
4. **Veto** — ≥1 bloqueio aberto capa o overall em 79 (não há "A/B" com bloqueio
   aberto), espelhando o kill-switch do EIS (T≤2 → 0).
5. **Grade** A≥90 / B≥80 / C≥70 / D≥60 / F<60 (Maze).

**Fonte de verdade machine-readable:** `docs/reports/friendliness-findings.json`.
Quando uma dor é resolvida, marca-se `resolved:true` → o score sobe sozinho
(crédito de progresso, igual ao ratchet do projeto).

## A3. Alternativas rejeitadas

1. **SUS/UMUX (questionário humano)** — viola no-human-tests; não roda em CI.
2. **Média aritmética (SUM puro)** — compensatória: error 40 + delight 100 daria
   "70 ok", mascarando o bloqueio. Rejeitado por princípio do projeto.
3. **Score só de contagem de findings** — ignora severidade e alcance; um 🟢 e um
   🔴 contariam igual. Rejeitado.

## A4. Consequências

- Vira gate de CI ratcheteável (`--strict` vs `.runtime/friendliness-baseline.json`):
  o score não pode regredir. Resolver dor sobe o número; introduzir fricção o
  derruba e falha o gate.
- O número é **auditável**: cada ponto rastreia a um finding com id/severidade/
  alcance no JSON. Sem caixa-preta.
- Risco: o score é tão bom quanto o dataset. O JSON precisa ser mantido junto às
  entregas (resolver dor → marcar resolved). Mitigação: o CLI imprime os
  topOffenders, lembrando o que falta.

## A5. Testes

`tests/friendliness-score.test.mjs` — cheap (penalidade, score por dimensão,
veto, grade, geométrica não-compensatória provada vs aritmética, determinismo,
frozen, breakdown por seção). Gate non-no-op: introduzir um blocker derruba o
score e o ratchet falha.

## A6b. Peer-review + melhorias (Calvin 2026-06-13, "avaliar online + coleção de códigos")

Avaliação contra literatura (arXiv/boas práticas) e contra os scores internos
do projeto (core/eis, core/integrity, core/severity, scripts/quality/
deliverableScorePure). Achados e melhorias aplicadas:

**Diagnóstico:** a literatura de composite indicators (OECD/JRC Handbook 2008;
arXiv 2008.13637 "should policy makers trust composite indices") define o
pipeline canônico: framework → seleção → imputação → análise → normalização →
weighting → aggregation → **robustez/sensibilidade**. Os scores internos —
incluindo core/integrity, cujos pesos são declaradamente "provisional until
Calibration Protocol" — pulavam o passo de **sensibilidade**. Esse era o maior
gap.

**M1 (aplicado) — Análise de sensibilidade.** `computeFriendlinessSensitivity()`
perturba one-at-a-time cada peso de severidade ±50%, o fator de alcance, e troca
a agregação geométrica↔aritmética; reporta faixa do overall, estabilidade da
nota e veredito. **Descoberta honesta:** o dataset real é `weight_sensitive` —
a nota oscila **C↔D** (60.29–79). O 71.61 está na fronteira C/D; o score agora
DECLARA essa incerteza em vez de fingir precisão (exigência de explainability/
transparency, arXiv 2506.13259).

**M2 (aplicado) — Derivação documentada dos pesos** (a literatura aponta a
subjetividade dos pesos como o calcanhar do weighted product). Severidade
12/4/1 = razão 3:1 entre tiers (blocker:slows:annoys), calibrada para que ~8
bloqueios zerem uma dimensão (alinha ao tamanho típico de um cluster de dor por
seção). Não é empírico-ML (como arXiv 2307.12082) por design: o score precisa
ser **auditável à mão**, não caixa-preta. A sensibilidade (M1) compensa a
arbitrariedade mostrando o impacto da escolha.

**Construct validity (ISO 9241-11 / HEART):** as 5 dimensões mapeiam aos
atributos canônicos de usabilidade — effectiveness≈{error}, efficiency≈
{efficiency}, satisfaction≈{learnability, cognitive, delight}. Cobre o modelo
consolidado sem inventar dimensões.

**M3 (aplicado) — Cobertura.** `totals.sectionsWithDebt` evita falsa precisão:
o score reflete só as seções já mapeadas (17 hoje). Não inflar com "% do app"
sem inventário completo (pitfall de normalização, arXiv 2008.13637).

**Adiado (registrado):** calibração empírica dos pesos por dados de uso real
(quando houver telemetria de task-success); snapshot histórico/tendência (a
sessão paralela deliverableScorePure já tem "delta por execução" — reusar o
padrão quando o friendliness virar gate de CI persistente).

## A6. Breakdown por seção de código (Calvin 2026-06-13)

"Ser possível avaliar por seção de código" → cada finding ganhou `section`
(módulo/área de código responsável) e `computeFriendlinessBySection()` agrega a
penalidade por seção, ordenando por dívida (qual pedaço do código mais precisa
de trabalho de UX). Mesma penalidade severidade×alcance; score da seção =
100 − Σpenalidade; resolvidos não entram. Não-compensatório NÃO se aplica aqui
(uma seção é uma lista plana, sem sub-dimensões a proteger) — a soma de
penalidade já é o sinal honesto de "quanto trabalho falta neste arquivo". Topo
atual: `ui/broadcast` (2 bloqueios: tradução leiga + tela-morta do share_code).
