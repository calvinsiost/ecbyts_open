# ADR-GRAPH-METRICS-001 — KPIs científicos de network science sobre o grafo do sítio

**Status:** Accepted · **Data:** 2026-06-14 · **Autor:** claude - ui (Calvin GRAPH-KPI-001)
**Módulo:** `core/analytics/graphMetrics.ts`
**Pesquisa:** `.runtime/research/graph-network-science-kpis-2026-06-14.md`

## Contexto

O grafo de Relações (`utils/edges/manager.ts`, Any-to-Any) é, formalmente, o
modelo conceitual de área (CSM fonte→caminho→receptor; ASTM E1689, CETESB
DD 038/2017). O painel de Relações já o **visualiza** (RELATIONS-UX-001). Faltava
a **leitura quantitativa** — métricas citáveis e reprodutíveis que traduzam o
grafo em decisão (North Star v2: confiança no resultado; contexto doutorado
Poli/USP: algoritmos com proveniência).

## Decisão

Criar um motor **pure-logic** que computa KPIs canônicos de network science a
partir de `{nodes, edges}`, sem DOM e sem mutação de entrada, resultado frozen e
determinístico. Cada algoritmo carrega proveniência (DOI/ISBN) no header.

### A1 — Grafo NÃO-DIRIGIDO por padrão

As relações do ECBT são majoritariamente simétricas (monitora/contém/conecta).
Densidade, componentes, articulação, clustering e centralidades operam sobre a
adjacência não-dirigida. Self-loops e arestas paralelas são descartadas (Set).
_Alternativa rejeitada:_ tratar como dirigido — exigiria semântica de direção
por tipo de aresta que o registro atual não garante; introduziria viés.

### A2 — Guarda de custo (`maxNodesForExpensive`, default 400)

Betweenness (Brandes O(V·E)), closeness, diâmetro (BFS all-pairs O(V·(V+E))) e
eigenvector (iteração de potência O(maxIter·E)) são puladas acima do teto,
retornando `skipped: true` + `reason`. Densidade,
grau, componentes, articulação, pontes, clustering, modularidade e
**k-core/coreness** (bin-sort Batagelj–Zaversnik O(V+E)) são O(V+E) e
sempre rodam. _Razão:_ nunca travar a UI; modelos típicos têm centenas de nós.

### A3 — Algoritmos canônicos (citáveis)

| KPI                  | Algoritmo              | Fonte                                                                                |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| Densidade            | `2E/V(V−1)`            | Wasserman & Faust 1994 (ISBN 0-521-38707-8)                                          |
| Grau / hubs          | contagem               | Newman 2010 (ISBN 978-0-19-920665-0 §7.1)                                            |
| Betweenness          | Brandes                | Freeman 1977 (DOI 10.2307/3033543); Brandes 2001 (DOI 10.1080/0022250X.2001.9990249) |
| Closeness            | BFS + correção WF      | Freeman 1979 (DOI 10.1016/0378-8733(78)90021-7)                                      |
| Componentes          | BFS                    | Hopcroft & Tarjan 1973 (DOI 10.1145/362248.362272)                                   |
| Articulação / pontes | low-link DFS iterativo | Hopcroft & Tarjan 1973 / Tarjan 1974 (DOI 10.1016/0020-0190(74)90003-9)              |
| Clustering           | razão de triângulos    | Watts & Strogatz 1998 (DOI 10.1038/30918)                                            |
| Diâmetro / APL       | BFS all-pairs          | Newman 2010 §8                                                                       |
| Modularidade Q       | soma por comunidade    | Newman & Girvan 2004 (DOI 10.1103/PhysRevE.69.026113)                                |
| k-core / coreness    | bin-sort O(V+E)        | Seidman 1983 (DOI 10.1016/0378-8733(83)90028-X); algoritmo Batagelj & Zaversnik 2003 (arXiv cs/0310049); espalhamento Kitsak et al. 2010 (DOI 10.1038/nphys1746) |
| Eigenvector centr.   | iteração de potência   | Bonacich 1972 (DOI 10.1080/0022250X.1972.9989806); power iteration von Mises & Pollaczek-Geiringer 1929; positividade Perron-Frobenius |

### A6 — Eigenvector centrality via iteração de potência

Centralidade de autovetor (Bonacich 1972): influência recursiva — um nó é
importante se está ligado a nós importantes (distingue-se do grau, que conta
vizinhos sem pesá-los). Computada por **iteração de potência** (von Mises 1929)
sobre a matriz **deslocada** `B = A + c·I`, com `c = grau_máx + 1` (shift de
Perron): `x ← B·x`, renormaliza ‖·‖₂, repete até `‖Δx‖∞ < tol` (default 1e-9)
ou `maxIter` (default 1000). O shift é **necessário**: grafos bipartidos
(estrela, caminho, ciclo par) têm autovalores ±λ de igual magnitude, e a
iteração crua em A oscila sem convergir; `B·x=(λ+c)·x` torna λ_max estritamente
dominante e positivo SEM alterar o autovetor. O vetor dominante existe, é único
e positivo em componente conexo por **Perron–Frobenius** — o sinal é fixado
x ≥ 0. Custo O(maxIter·E), gateado por `maxNodesForExpensive` junto das demais
centralidades.
_Casos degenerados:_ grafo sem arestas (E=0) → `skipped: 'no_edges'` (não há
influência mútua a propagar); vazio → `skipped: 'empty'`. Grafo desconexo: a
iteração converge para o autovetor do componente de maior raio espectral (nós
dos demais → 0), comportamento padrão e documentado da métrica.
_Alternativa rejeitada:_ decomposição espectral densa (QR/Jacobi) — O(V³) e
desnecessária quando só o par dominante (λ, x) interessa.

### A4 — DFS iterativo para articulação/pontes

Hopcroft–Tarjan implementado **iterativo** (pilha explícita) para não estourar a
call stack em cadeias longas. _Alternativa rejeitada:_ recursivo (mais simples,
porém com risco latente de stack overflow em grafos profundos).

### A5 — Leitura ambiental anexada ao número

O resultado é genérico (network science), mas a UI traduz cada KPI para a
decisão de sítio (articulação = elo único do CSM; componentes>1 = parte isolada;
betweenness = caminho crítico; **k-core máximo = núcleo robusto de fonte/caminho/
receptor com caminhos redundantes mutuamente reforçados — o oposto de uma ponte;
coreness alta prediz capacidade de espalhamento de contaminante**). A tradução
fica na camada de VM da UI, não no motor — mantendo o motor domain-agnostic e
reusável.

## Consequências

- **Positivas:** leitura quantitativa citável; reusa `_edgeGraphPure`; testável
  em Node; domain-agnostic (serve qualquer grafo do app).
- **Negativas/limites:** centralidades caras puladas em grafos grandes;
  modularidade exige partição informada (família/zona); grafo não-dirigido
  perde direção de fluxo (aceito por A1).

## Testes

`tests/graph-metrics.test.mjs` — algoritmos validados contra grafos de referência
(triângulo, caminho, estrela, dois componentes, ponte/articulação conhecidas).
