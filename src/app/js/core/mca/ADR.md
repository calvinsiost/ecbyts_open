# ADR — core/mca (Modelo Conceitual da Área / Conceptual Site Model)

| Campo  | Valor                                                    |
| ------ | -------------------------------------------------------- |
| Status | Accepted (Fase A — pure-logic)                           |
| Data   | 2026-05-28                                               |
| Spec   | `docs/specs/_archived/SPEC_MCA_CONCEPTUAL_SITE_MODEL.md` |
| Autor  | Claude (claude-otimizacao)                               |

## A1: Contexto

O Modelo Conceitual da Área (MCA) é o deliverable central do Gerenciamento de Áreas
Contaminadas (CETESB DD 038/2017): Cap. 9 da Avaliação Preliminar (MCA 1 + confiança
A/B/C) e Cap. 5 da Investigação Confirmatória (MCA 2). Representa o fluxo
**fonte → caminho → receptor** (ASTM E1689-20) que organiza a investigação e a avaliação
de risco. O ecbyts não tinha um construtor de MCA — era o maior gap de conformidade GAC.

## A2: Opções consideradas

1. **CSM derivado dos elementos do modelo + matriz/diagrama** (escolhida) — vincula o MCA
   aos dados reais (famílias, observações), reusa o sistema de figuras e os templates CETESB.
2. Editor de grafo livre desacoplado dos dados — rejeitado: re-trabalho + risco de divergência
   entre o MCA e o modelo 3D.
3. Apenas seção textual no relatório — rejeitado: não suporta a matriz de vias para avaliação
   de risco exigida pela CETESB.

## A3: Devil's Advocate

- "Auto-derivação da tipologia da fonte pode errar" → todas as fontes começam como `potential`
  (alinhado à CETESB: fonte potencial até confirmação); editável na UI (Fase B). Auto-sugestão ≠ trava.
- "Confiança A/B/C é subjetiva" → proxy determinístico de completude (`coverageFromSources` →
  observed/sources/gaps) + `overrideConfidence` manual com justificativa obrigatória (auditável).
- "Linkages podem explodir combinatorialmente" → filtrados por `RECEPTOR_MEDIA` (só meios
  plausíveis por tipo de receptor), mantendo a matriz interpretável.

## A4: Decisão

Núcleo pure-logic `_csmPure.ts`: `buildCsmFromElements` (auto-deriva por família),
`deriveLinkages` (matriz filtrada por meio×receptor), `computeConfidence`/`overrideConfidence`
(A/B/C proxy + override), `snapshotCsm` (versionamento MCA1→MCA2), `buildMcaSectionHtml`
(seção + matriz escapada). Catálogos congelados: `SOURCE_FAMILIES`, `RECEPTOR_FAMILIES`,
`CANONICAL_PATHWAYS`. Sem `Date.now()` interno — timestamps injetados (determinismo de teste).

## A5: Consequências

- (+) MCA vinculado a dados reais; reusa famílias + figuras (P1-9) + templates CETESB.
- (+) Alimenta a avaliação de risco (tier2Risk) e o Plano de Investigação Confirmatória.
- (+) Snapshot serializável → candidato a kind `csm` do SPEC_ECBT_PORTABLE_ARTIFACTS (P1-10).
- (−) Heurísticas de auto-derivação por família exigem manutenção ao adicionar novas famílias.
- (−) O diagrama source-pathway-receptor (Fase B) é um componente de UI novo.
