# ADR — Split da Home Grid (ARCH-SPLIT-HOMEGRID-001)

> Status: **em andamento** (S1-S6 entregues, S7 = este ADR + registro de slots).
> Contexto: `app/js/utils/ui/homeGrid.ts` cresceu para ~4.550 linhas — último
> monolito de UI, concentrando scaffold do shell, render de cards, estatísticas,
> hospedagem de painéis 3D/ações e ciclo de vida. Decisão de quebrá-lo em módulos
> pequenos e testáveis sem mudar o comportamento da tela inicial.

## Decisão A1 — Extração pure-logic-first (não big-bang)

Em vez de mover toda a renderização DOM de uma vez (alto risco numa tela
crítica, com várias sessões LLM editando o arquivo ao vivo), extraímos **fatia
por fatia**, começando pela **lógica pura** (sem DOM), cada uma com:

1. módulo `_*Pure.ts` (ou helper) em `homeGrid/`, congelado e determinístico;
2. cheap tests (`tests/home-*-pure.test.mjs`);
3. wire mínimo no `homeGrid.ts` consumindo a lógica pura;
4. prova em pixels (smoke E2E) de que o comportamento é idêntico;
5. commit + push isolado (worktree) por fatia.

**Trade-off aceito:** isso NÃO reduz a contagem de linhas tão rápido quanto uma
extração DOM completa, mas elimina o risco de quebrar a home e mantém o gate de
regressão verde a cada passo. A redução para ≤300 linhas (DoD) vem nas fatias
DOM (S5-completo/S6-runtime/S8) sobre esta fundação testada.

## Decisão A2 — Contrato como dado (não como código imperativo)

Estruturas estáveis da home viram **dados congelados testáveis**, não blocos
imperativos espalhados:

| Módulo | Contrato | Fatia |
| --- | --- | --- |
| `_homeStatsPure` | os 4 cards de estatística (valor, ícone, % e cor da completude) | S4 |
| `_homeCardsPure` | filtro/ordem + **agrupamento por categoria** (ordem canônica, fallback `data`) | S5 |
| `_homeShellScaffoldPure` | os **6 elementos do shell** (root + 3 colunas + 2 divisores) com ids/classes/a11y | S6 |
| `_homeShellHostingPure` | **registro de slots** → container designado + ativação exclusiva | S7 |

Benefício: o contrato (incl. **acessibilidade** — `role=separator`,
`aria-orientation`, `tabindex` nos divisores) fica coberto por cheap test,
endereçando o item de a11y do DoD sem depender de browser.

## Decisão A3 — Contrato do shell (scaffold + slots)

O **scaffold** (`_homeShellScaffoldPure`) define a moldura: `actions-shell-root`
(div) → `left` (aside) + `leftSplitter` (div separator) + `main` (section) +
`rightSplitter` (div separator) + `right` (aside). Ordem do array = ordem de
inserção no DOM. `root` é o único ancorado no `#home-container`; os demais no
root.

A **hospedagem** (`_homeShellHostingPure`) define QUAL conteúdo mora em QUAL
coluna e qual está ativo:

| Slot | Container | Conteúdo |
| --- | --- | --- |
| `workspace` | `left` | árvore/sidebar de trabalho |
| `actions` | `main` | cards de ação (home) |
| `context` | `right` | painel de contexto/relações |
| `constellation` | `right` | host do grafo 3D (constelação) |

**Regras (fail-safe):** um slot só registra numa coluna **válida** e **uma única
vez** (1 registro por nome); ativação é **exclusiva** (um ativo por vez); ativar
slot não-registrado ou registrar container desconhecido é **no-op** (estado
inalterado, congelado). Transições são imutáveis (devolvem novo estado).

## Decisão A4 — Wire incremental, sem quebrar `window.handleHome*`

O barril `homeGrid.ts` permanece o ponto de entrada e **preserva todos os
handlers `window.handleHome*`** (o HTML depende deles). O wire consome a lógica
pura via thin-calls; nenhuma assinatura pública muda. Rollback de qualquer fatia
= reverter o commit dela (o módulo puro fica órfão mas inócuo).

## Consequências

- ✅ Cada fatia é testável, reversível e provada em pixels.
- ✅ A11y do shell coberta por cheap test (não só E2E).
- ⏳ Pendente para fechar o DoD: extração DOM completa de cards (S5-runtime),
  scaffold runtime (S6-runtime via `initShellRoot`), hospedagem runtime (S7
  via este registro), barril ≤300 linhas (S8), feature flag `HOMEGRID_SPLIT`,
  axe ≥90, ratchet de monolito.

## Referências

- Spec: `docs/specs/arch/SPEC_SPLIT_HOMEGRID.md` (ou `_archived`)
- Precedente de extração DOM: `homeGrid/homeEisDashboard.ts` (init/render/destroy)
- Pure-logic vizinhos: `homeColumnResize.ts` (matemática de resize),
  `homeLayoutController.ts` (resizers + densidade), `homeCompletenessHelpers.ts`
