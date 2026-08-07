// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GRAPH METRICS — KPIs científicos de network science sobre o grafo do sítio
   GRAPH-KPI-001 (Calvin 2026-06-14). ADR: core/analytics/ADR_GRAPH_METRICS.md
   Pesquisa: .runtime/research/graph-network-science-kpis-2026-06-14.md

   O grafo de Relações (utils/edges/manager.ts) é, formalmente, o modelo
   conceitual de área (CSM fonte→caminho→receptor). Este módulo extrai dele
   métricas QUANTITATIVAS, citáveis e reprodutíveis — a leitura científica que
   complementa a visualização do painel de Relações.

   Algoritmos (proveniência acadêmica para o doutorado Poli/USP):
   - Densidade           Wasserman & Faust 1994 (ISBN 0-521-38707-8)
   - Grau / hubs         Newman 2010 (ISBN 978-0-19-920665-0, §7.1)
   - Betweenness         Freeman 1977 (DOI 10.2307/3033543) + Brandes 2001
                         (DOI 10.1080/0022250X.2001.9990249) — O(V·E)
   - Closeness           Freeman 1979 (DOI 10.1016/0378-8733(78)90021-7),
                         correção p/ desconexo Wasserman & Faust 1994
   - Componentes conexos Hopcroft & Tarjan 1973 (DOI 10.1145/362248.362272)
   - Pontos de articulação / pontes  Hopcroft & Tarjan 1973 / Tarjan 1974
                         (DOI 10.1016/0020-0190(74)90003-9) — low-link, O(V+E)
   - Clustering          Watts & Strogatz 1998 (DOI 10.1038/30918)
   - Diâmetro / APL      Newman 2010 §8
   - Modularidade Q      Newman & Girvan 2004 (DOI 10.1103/PhysRevE.69.026113)
   - k-core / coreness   Seidman 1983 (DOI 10.1016/0378-8733(83)90028-X),
                         algoritmo O(V+E) de Batagelj & Zaversnik 2003
                         (arXiv cs/0310049). Coreness como preditor de
                         espalhamento: Kitsak et al. 2010 (DOI 10.1038/nphys1746)
   - Eigenvector centr.  Bonacich 1972 (DOI 10.1080/0022250X.1972.9989806) —
                         Ax=λx (autovetor dominante) via iteração de potência
                         (von Mises & Pollaczek-Geiringer 1929); positividade
                         por Perron-Frobenius (Perron 1907 / Frobenius 1912)

   Pure: sem DOM, sem mutação da entrada. Resultado frozen + determinístico.
   Grafo tratado como NÃO-DIRIGIDO (relações do ECBT são majoritariamente
   simétricas: monitora/contém/conecta). Self-loops e arestas paralelas
   descartadas (Set de adjacência).
   ================================================================ */

export interface GraphNodeInput {
    readonly id: string;
    readonly family?: string;
    readonly [key: string]: unknown;
}

export interface GraphEdgeInput {
    readonly sourceId: string;
    readonly targetId: string;
    readonly [key: string]: unknown;
}

export interface GraphMetricsOptions {
    /** Acima deste nº de nós, métricas O(V·E) (betweenness/closeness/diâmetro)
     *  são puladas para não travar a UI. Default 400. */
    readonly maxNodesForExpensive?: number;
    /** Partição p/ modularidade (ex.: grupo de família). null → modularidade pulada. */
    readonly partitionOf?: ((node: GraphNodeInput) => string) | null;
    /** Tamanho das listas "top N" (betweenness/grau). Default 8. */
    readonly topN?: number;
}

export interface ScoredNode {
    readonly id: string;
    readonly score: number;
}

export interface DegreeMetric {
    readonly min: number;
    readonly max: number;
    readonly mean: number;
    readonly isolatedCount: number;
    readonly topByDegree: ReadonlyArray<ScoredNode>;
}

export interface ComponentsMetric {
    readonly count: number;
    readonly largestSize: number;
    readonly isolatedCount: number;
    /** Tamanhos ordenados desc. */
    readonly sizes: ReadonlyArray<number>;
}

export interface CentralityMetric {
    readonly skipped: boolean;
    readonly reason?: string;
    /** Top N normalizado [0,1] desc. */
    readonly top: ReadonlyArray<ScoredNode>;
}

export interface ConnectivityRiskMetric {
    /** Nós-gargalo cuja remoção desconecta o grafo (ponto único de falha). */
    readonly articulationPoints: ReadonlyArray<string>;
    /** Arestas-ponte cuja remoção desconecta (relação crítica única). */
    readonly bridges: ReadonlyArray<{ readonly sourceId: string; readonly targetId: string }>;
}

export interface SpreadMetric {
    readonly skipped: boolean;
    readonly reason?: string;
    readonly diameter: number;
    readonly averagePathLength: number;
}

export interface KCoreMetric {
    /** Maior k tal que existe um sub-grafo onde todo nó tem grau ≥ k (degeneracy). */
    readonly degeneracy: number;
    /** Nº de nós no k-core máximo (o "núcleo robusto" do CSM). */
    readonly maxCoreSize: number;
    /** Nós do k-core máximo, ordenados (caminhos redundantes mutuamente reforçados). */
    readonly maxCoreNodes: ReadonlyArray<string>;
    /** Top N nós por coreness desc (preditor de espalhamento, Kitsak 2010). */
    readonly topByCoreness: ReadonlyArray<ScoredNode>;
}

export interface EigenvectorMetric {
    readonly skipped: boolean;
    readonly reason?: string;
    /** `true` se a iteração de potência convergiu dentro de `maxIter`. */
    readonly converged: boolean;
    /** Nº de iterações executadas até convergir (ou maxIter). */
    readonly iterations: number;
    /** Top N por centralidade de autovetor desc, normalizada (‖x‖₂ = 1, x ≥ 0). */
    readonly top: ReadonlyArray<ScoredNode>;
}

export interface GraphMetricsResult {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly density: number;
    readonly degree: DegreeMetric;
    readonly components: ComponentsMetric;
    readonly clusteringGlobal: number;
    readonly betweenness: CentralityMetric;
    readonly closeness: CentralityMetric;
    readonly connectivityRisk: ConnectivityRiskMetric;
    readonly spread: SpreadMetric;
    /** Decomposição em k-cores: núcleo robusto + coreness por nó (Seidman 1983). */
    readonly kcore: KCoreMetric;
    /** Centralidade de autovetor (Bonacich 1972) — influência recursiva. */
    readonly eigenvector: EigenvectorMetric;
    /** Modularidade Q da partição informada (null se não informada). */
    readonly modularity: number | null;
    readonly expensiveSkipped: boolean;
}

type Adjacency = Map<string, Set<string>>;

const DEFAULT_MAX_EXPENSIVE = 400;
const DEFAULT_TOP_N = 8;

/**
 * Constrói adjacência NÃO-DIRIGIDA a partir de nós + arestas.
 * - Universo de nós: `nodes` se fornecido, senão derivado dos endpoints.
 * - Arestas com endpoint fora do universo são descartadas (defensivo).
 * - Self-loops e paralelas descartadas (Set).
 */
export function buildUndirectedAdjacency(
    nodes: ReadonlyArray<GraphNodeInput> | null | undefined,
    edges: ReadonlyArray<GraphEdgeInput> | null | undefined,
): Adjacency {
    const adj: Adjacency = new Map();
    const edgeList = Array.isArray(edges) ? edges : [];
    if (Array.isArray(nodes) && nodes.length > 0) {
        for (const n of nodes) {
            if (n && typeof n.id === 'string' && n.id.length > 0 && !adj.has(n.id)) {
                adj.set(n.id, new Set());
            }
        }
    } else {
        for (const e of edgeList) {
            if (e && typeof e.sourceId === 'string' && !adj.has(e.sourceId)) adj.set(e.sourceId, new Set());
            if (e && typeof e.targetId === 'string' && !adj.has(e.targetId)) adj.set(e.targetId, new Set());
        }
    }
    for (const e of edgeList) {
        if (!e) continue;
        const a = e.sourceId;
        const b = e.targetId;
        if (typeof a !== 'string' || typeof b !== 'string') continue;
        if (a === b) continue; // self-loop
        if (!adj.has(a) || !adj.has(b)) continue; // endpoint fora do universo
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
    }
    return adj;
}

/** Nº de arestas não-dirigidas únicas (cada par contado uma vez). */
function countUndirectedEdges(adj: Adjacency): number {
    let sum = 0;
    for (const nbrs of adj.values()) sum += nbrs.size;
    return Math.floor(sum / 2);
}

/**
 * Densidade do grafo não-dirigido: D = 2E / (V(V-1)). (Wasserman & Faust 1994)
 * 0 quando V < 2.
 */
export function computeDensity(nodeCount: number, edgeCount: number): number {
    if (nodeCount < 2) return 0;
    return (2 * edgeCount) / (nodeCount * (nodeCount - 1));
}

/** Estatísticas de grau + top hubs. (Newman 2010 §7.1) */
export function computeDegreeMetric(adj: Adjacency, topN: number = DEFAULT_TOP_N): DegreeMetric {
    const ids = Array.from(adj.keys());
    if (ids.length === 0) {
        return Object.freeze({ min: 0, max: 0, mean: 0, isolatedCount: 0, topByDegree: Object.freeze([]) });
    }
    let min = Infinity;
    let max = 0;
    let sum = 0;
    let isolated = 0;
    const scored: ScoredNode[] = [];
    for (const id of ids) {
        const d = adj.get(id)!.size;
        if (d < min) min = d;
        if (d > max) max = d;
        sum += d;
        if (d === 0) isolated++;
        scored.push({ id, score: d });
    }
    scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
    return Object.freeze({
        min: min === Infinity ? 0 : min,
        max,
        mean: sum / ids.length,
        isolatedCount: isolated,
        topByDegree: Object.freeze(scored.slice(0, Math.max(1, topN)).map((s) => Object.freeze(s))),
    });
}

/** Componentes conexos via BFS. Tamanhos ordenados desc. (Hopcroft & Tarjan 1973) */
export function computeComponents(adj: Adjacency): ComponentsMetric {
    const visited = new Set<string>();
    const sizes: number[] = [];
    for (const start of adj.keys()) {
        if (visited.has(start)) continue;
        let size = 0;
        const queue: string[] = [start];
        visited.add(start);
        while (queue.length > 0) {
            const u = queue.shift()!;
            size++;
            for (const v of adj.get(u)!) {
                if (!visited.has(v)) {
                    visited.add(v);
                    queue.push(v);
                }
            }
        }
        sizes.push(size);
    }
    sizes.sort((a, b) => b - a);
    return Object.freeze({
        count: sizes.length,
        largestSize: sizes.length > 0 ? sizes[0]! : 0,
        isolatedCount: sizes.filter((s) => s === 1).length,
        sizes: Object.freeze(sizes),
    });
}

/**
 * Coeficiente de agrupamento global = média do clustering local sobre nós com
 * grau ≥ 2. (Watts & Strogatz 1998). 0 se nenhum nó qualifica.
 */
export function computeClusteringGlobal(adj: Adjacency): number {
    let sum = 0;
    let qualifying = 0;
    for (const [, nbrs] of adj) {
        const k = nbrs.size;
        if (k < 2) continue;
        const neighborArr = Array.from(nbrs);
        let links = 0;
        for (let i = 0; i < neighborArr.length; i++) {
            const ni = adj.get(neighborArr[i]!)!;
            for (let j = i + 1; j < neighborArr.length; j++) {
                if (ni.has(neighborArr[j]!)) links++;
            }
        }
        sum += (2 * links) / (k * (k - 1));
        qualifying++;
    }
    return qualifying === 0 ? 0 : sum / qualifying;
}

/**
 * Betweenness normalizado (Brandes 2001, não-ponderado). Top N desc.
 * Normalização não-dirigida: C_B(v) / [(n-1)(n-2)/2] ∈ [0,1].
 */
export function computeBetweenness(adj: Adjacency, topN: number = DEFAULT_TOP_N): ReadonlyArray<ScoredNode> {
    const nodes = Array.from(adj.keys());
    const n = nodes.length;
    const cb = new Map<string, number>();
    for (const v of nodes) cb.set(v, 0);
    if (n < 3) return Object.freeze([]);

    for (const s of nodes) {
        // BFS single-source shortest paths counting (Brandes)
        const stack: string[] = [];
        const pred = new Map<string, string[]>();
        const sigma = new Map<string, number>();
        const dist = new Map<string, number>();
        for (const t of nodes) {
            pred.set(t, []);
            sigma.set(t, 0);
            dist.set(t, -1);
        }
        sigma.set(s, 1);
        dist.set(s, 0);
        const queue: string[] = [s];
        while (queue.length > 0) {
            const v = queue.shift()!;
            stack.push(v);
            for (const w of adj.get(v)!) {
                if (dist.get(w)! < 0) {
                    dist.set(w, dist.get(v)! + 1);
                    queue.push(w);
                }
                if (dist.get(w)! === dist.get(v)! + 1) {
                    sigma.set(w, sigma.get(w)! + sigma.get(v)!);
                    pred.get(w)!.push(v);
                }
            }
        }
        // accumulation
        const delta = new Map<string, number>();
        for (const t of nodes) delta.set(t, 0);
        while (stack.length > 0) {
            const w = stack.pop()!;
            for (const v of pred.get(w)!) {
                const c = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
                delta.set(v, delta.get(v)! + c);
            }
            if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
        }
    }
    // grafo não-dirigido: cada par contado duas vezes → /2
    const norm = ((n - 1) * (n - 2)) / 2;
    const scored: ScoredNode[] = nodes.map((id) => ({
        id,
        score: norm > 0 ? cb.get(id)! / 2 / norm : 0,
    }));
    scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
    return Object.freeze(scored.slice(0, Math.max(1, topN)).map((s) => Object.freeze(s)));
}

/**
 * Closeness (Freeman 1979) com correção de Wasserman & Faust para grafos
 * desconexos: C(v) = ((r-1)/(n-1)) · ((r-1)/Σdist), r = nós alcançáveis. Top N.
 */
export function computeCloseness(adj: Adjacency, topN: number = DEFAULT_TOP_N): ReadonlyArray<ScoredNode> {
    const nodes = Array.from(adj.keys());
    const n = nodes.length;
    if (n < 2) return Object.freeze([]);
    const scored: ScoredNode[] = [];
    for (const s of nodes) {
        const dist = new Map<string, number>();
        dist.set(s, 0);
        const queue: string[] = [s];
        let sum = 0;
        let reachable = 1;
        while (queue.length > 0) {
            const u = queue.shift()!;
            const du = dist.get(u)!;
            for (const v of adj.get(u)!) {
                if (!dist.has(v)) {
                    dist.set(v, du + 1);
                    sum += du + 1;
                    reachable++;
                    queue.push(v);
                }
            }
        }
        const closeness = sum > 0 ? ((reachable - 1) / (n - 1)) * ((reachable - 1) / sum) : 0;
        scored.push({ id: s, score: closeness });
    }
    scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
    return Object.freeze(scored.slice(0, Math.max(1, topN)).map((s) => Object.freeze(s)));
}

/**
 * Pontos de articulação + pontes (Hopcroft–Tarjan low-link, DFS ITERATIVO para
 * não estourar a pilha em cadeias longas). O(V+E).
 */
export function computeConnectivityRisk(adj: Adjacency): ConnectivityRiskMetric {
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const visited = new Set<string>();
    const artic = new Set<string>();
    const bridges: Array<{ sourceId: string; targetId: string }> = [];
    let timer = 0;

    interface Frame {
        u: string;
        parent: string | null;
        nbrs: string[];
        idx: number;
    }

    for (const start of adj.keys()) {
        if (visited.has(start)) continue;
        let rootChildren = 0;
        const stack: Frame[] = [{ u: start, parent: null, nbrs: Array.from(adj.get(start)!), idx: 0 }];
        visited.add(start);
        disc.set(start, timer);
        low.set(start, timer);
        timer++;
        while (stack.length > 0) {
            const frame = stack[stack.length - 1]!; // while length>0
            if (frame.idx < frame.nbrs.length) {
                const v = frame.nbrs[frame.idx]!; // idx < nbrs.length
                frame.idx++;
                if (v === frame.parent) continue; // aresta para o pai (sem paralelas: Set)
                if (!visited.has(v)) {
                    visited.add(v);
                    disc.set(v, timer);
                    low.set(v, timer);
                    timer++;
                    if (frame.u === start) rootChildren++;
                    stack.push({ u: v, parent: frame.u, nbrs: Array.from(adj.get(v)!), idx: 0 });
                } else {
                    // back edge
                    low.set(frame.u, Math.min(low.get(frame.u)!, disc.get(v)!));
                }
            } else {
                stack.pop();
                if (stack.length > 0) {
                    const parentFrame = stack[stack.length - 1]!;
                    const pu = parentFrame.u;
                    const cu = frame.u;
                    low.set(pu, Math.min(low.get(pu)!, low.get(cu)!));
                    // articulação (não-raiz): low[filho] >= disc[pai]
                    if (parentFrame.parent !== null && low.get(cu)! >= disc.get(pu)!) {
                        artic.add(pu);
                    }
                    // ponte: low[filho] > disc[pai]
                    if (low.get(cu)! > disc.get(pu)!) {
                        bridges.push({ sourceId: pu, targetId: cu });
                    }
                }
            }
        }
        if (rootChildren >= 2) artic.add(start);
    }
    return Object.freeze({
        articulationPoints: Object.freeze(Array.from(artic).sort((a, b) => a.localeCompare(b))),
        bridges: Object.freeze(bridges.map((b) => Object.freeze(b))),
    });
}

/**
 * Diâmetro + comprimento médio de caminho no MAIOR componente (Newman 2010 §8).
 * Só roda até maxNodes (BFS all-pairs é O(V·(V+E))).
 */
export function computeSpread(adj: Adjacency, maxNodes: number): SpreadMetric {
    const nodes = Array.from(adj.keys());
    if (nodes.length > maxNodes) {
        return Object.freeze({ skipped: true, reason: 'too_large', diameter: 0, averagePathLength: 0 });
    }
    if (nodes.length < 2) {
        return Object.freeze({ skipped: false, diameter: 0, averagePathLength: 0 });
    }
    let diameter = 0;
    let totalDist = 0;
    let pairs = 0;
    for (const s of nodes) {
        const dist = new Map<string, number>();
        dist.set(s, 0);
        const queue: string[] = [s];
        while (queue.length > 0) {
            const u = queue.shift()!;
            const du = dist.get(u)!;
            for (const v of adj.get(u)!) {
                if (!dist.has(v)) {
                    dist.set(v, du + 1);
                    queue.push(v);
                }
            }
        }
        for (const [t, d] of dist) {
            if (t === s) continue;
            if (d > diameter) diameter = d;
            totalDist += d;
            pairs++;
        }
    }
    return Object.freeze({
        skipped: false,
        diameter,
        averagePathLength: pairs > 0 ? totalDist / pairs : 0,
    });
}

/**
 * Modularidade Q (Newman & Girvan 2004) de uma partição informada.
 * Q = Σ_c [ e_c/m − (deg_c/2m)² ], e_c = arestas internas, deg_c = soma graus.
 */
export function computeModularity(
    adj: Adjacency,
    nodes: ReadonlyArray<GraphNodeInput>,
    partitionOf: (node: GraphNodeInput) => string,
): number {
    const m = countUndirectedEdges(adj);
    if (m === 0) return 0;
    const comm = new Map<string, string>();
    for (const n of nodes) {
        if (n && typeof n.id === 'string' && adj.has(n.id)) comm.set(n.id, String(partitionOf(n)));
    }
    const internal = new Map<string, number>(); // e_c (arestas internas, não duplicadas)
    const degSum = new Map<string, number>(); // Σ grau por comunidade
    for (const [u, nbrs] of adj) {
        const cu = comm.get(u);
        if (cu === undefined) continue;
        degSum.set(cu, (degSum.get(cu) || 0) + nbrs.size);
        for (const v of nbrs) {
            const cv = comm.get(v);
            if (cv === cu) internal.set(cu, (internal.get(cu) || 0) + 1);
        }
    }
    let q = 0;
    for (const c of degSum.keys()) {
        const ec = (internal.get(c) || 0) / 2; // cada aresta interna contada 2×
        const dc = degSum.get(c) || 0;
        q += ec / m - Math.pow(dc / (2 * m), 2);
    }
    return q;
}

/**
 * Decomposição em k-cores / coreness (Seidman 1983). Coreness(v) = maior k tal
 * que v pertence ao k-core (sub-grafo maximal onde todo nó tem grau ≥ k dentro
 * dele). Degeneracy = max coreness do grafo. Algoritmo O(V+E) de bin-sort de
 * Batagelj & Zaversnik 2003: remove repetidamente o nó de menor grau corrente,
 * fixando sua coreness, e decrementa o grau dos vizinhos restantes.
 *
 * Leitura ambiental: o k-core máximo é o "núcleo robusto" do CSM — conjunto de
 * fonte/caminho/receptor mutuamente reforçados por caminhos redundantes (oposto
 * de ponte/articulação). Coreness alta também prediz capacidade de espalhamento
 * de um nó (Kitsak et al. 2010), relevante p/ propagação de contaminante.
 *
 * Self-loops/paralelas já descartados na adjacência → grau = nº de vizinhos.
 */
export function computeKCore(adj: Adjacency, topN: number = DEFAULT_TOP_N): KCoreMetric {
    const n = adj.size;
    if (n === 0) {
        return Object.freeze({
            degeneracy: 0,
            maxCoreSize: 0,
            maxCoreNodes: Object.freeze([]),
            topByCoreness: Object.freeze([]),
        });
    }

    // grau corrente por nó
    const deg = new Map<string, number>();
    let maxDeg = 0;
    for (const [id, nbrs] of adj) {
        const d = nbrs.size;
        deg.set(id, d);
        if (d > maxDeg) maxDeg = d;
    }

    // bin[d] = lista de nós com grau corrente d; pos = índice do nó no array ordenado
    const bin: string[][] = Array.from({ length: maxDeg + 1 }, () => []);
    for (const [id, d] of deg) bin[d]!.push(id);

    const core = new Map<string, number>();
    const removed = new Set<string>();
    let degeneracy = 0;

    // processa por grau corrente crescente; ao "remover" um nó, decrementa
    // vizinhos vivos e os re-enfileira no bin do grau menor.
    for (let d = 0; d <= maxDeg; d++) {
        // bin[d] cresce dinamicamente quando vizinhos caem para o grau d
        for (let i = 0; i < bin[d]!.length; i++) {
            const u = bin[d]![i]!;
            if (removed.has(u)) continue; // entrada obsoleta (já processado com grau menor)
            const cu = deg.get(u)!;
            if (cu !== d) continue; // grau mudou desde o enfileiramento → ignora aqui
            // coreness de u = grau corrente; degeneracy é o máximo visto
            if (cu > degeneracy) degeneracy = cu;
            core.set(u, cu);
            removed.add(u);
            for (const v of adj.get(u)!) {
                if (removed.has(v)) continue;
                const dv = deg.get(v)!;
                if (dv > d) {
                    deg.set(v, dv - 1);
                    bin[dv - 1]!.push(v); // re-enfileira no novo grau (≥ d, não retrocede)
                }
            }
        }
    }

    const maxCoreNodes: string[] = [];
    const scored: ScoredNode[] = [];
    for (const [id, c] of core) {
        scored.push({ id, score: c });
        if (c === degeneracy) maxCoreNodes.push(id);
    }
    maxCoreNodes.sort((a, b) => a.localeCompare(b));
    scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));

    return Object.freeze({
        degeneracy,
        maxCoreSize: maxCoreNodes.length,
        maxCoreNodes: Object.freeze(maxCoreNodes),
        topByCoreness: Object.freeze(scored.slice(0, Math.max(1, topN)).map((s) => Object.freeze(s))),
    });
}

/**
 * Centralidade de autovetor (Bonacich 1972, DOI 10.1080/0022250X.1972.9989806).
 *
 * Definição: a importância de um nó é proporcional à soma das importâncias dos
 * seus vizinhos — x_i = (1/λ)·Σ_j A_ij·x_j, ou seja, A·x = λ·x para o MAIOR
 * autovalor λ (raio espectral). Em grafo conexo não-dirigido, A é simétrica e
 * irredutível: o teorema de Perron–Frobenius garante que esse autovetor dominante
 * é único e estritamente positivo, justificando o sinal não-negativo.
 *
 * Distinção do grau: grau conta vizinhos; autovetor pesa COM QUEM você se conecta
 * (um vizinho central vale mais que um periférico) — daí "influência recursiva".
 *
 * Algoritmo: iteração de potência (von Mises) sobre a matriz DESLOCADA
 * B = A + c·I, com c = grau_máx + 1 (shift de Perron). Como B·x = (λ+c)·x, o
 * autovetor dominante é o MESMO de A, mas o deslocamento elimina a degenerescência
 * ±λ de grafos BIPARTIDOS (estrela, caminho, ciclo par) — onde a iteração crua
 * em A oscila e nunca converge. x ← B·x; renormaliza por ‖·‖₂; repete até
 * ‖xₖ₊₁ − xₖ‖∞ < tol ou maxIter. Resultado normalizado a ‖x‖₂ = 1, sinal x ≥ 0.
 * O(maxIter·E). Leitura ambiental: nós de alta centralidade de autovetor são os
 * mais entranhados no núcleo do CSM — sua perturbação propaga-se por toda a rede
 * de fonte→caminho→receptor.
 *
 * Casos degenerados: V<1 ou E=0 → skipped (sem estrutura para influência mútua;
 * autovetor seria uniforme/zero, sem informação). Grafo desconexo: a iteração
 * converge para o autovetor do componente de maior raio espectral; nós dos demais
 * componentes tendem a 0 — comportamento padrão e documentado da métrica.
 */
export function computeEigenvector(
    adj: Adjacency,
    topN: number = DEFAULT_TOP_N,
    maxIter: number = 1000,
    tol: number = 1e-9,
): EigenvectorMetric {
    const nodes = Array.from(adj.keys());
    const n = nodes.length;
    if (n === 0) {
        return Object.freeze({
            skipped: true,
            reason: 'empty',
            converged: false,
            iterations: 0,
            top: Object.freeze([]),
        });
    }
    if (countUndirectedEdges(adj) === 0) {
        // Sem arestas não há influência mútua; o autovetor seria arbitrário.
        return Object.freeze({
            skipped: true,
            reason: 'no_edges',
            converged: false,
            iterations: 0,
            top: Object.freeze([]),
        });
    }

    // Shift de Perron: c = grau_máx + 1. Itera sobre B = A + c·I para remover a
    // degenerescência ±λ de grafos bipartidos (B fica positiva-definida → λ_max
    // estritamente dominante; o autovetor é o mesmo de A pois B·x=(λ+c)·x).
    let maxDeg = 0;
    for (const nbrs of adj.values()) if (nbrs.size > maxDeg) maxDeg = nbrs.size;
    const shift = maxDeg + 1;

    // x⁰ uniforme positivo (evita ortogonalidade acidental ao autovetor dominante).
    let x = new Map<string, number>();
    for (const id of nodes) x.set(id, 1 / Math.sqrt(n));

    let converged = false;
    let iterations = 0;
    for (let it = 0; it < maxIter; it++) {
        iterations = it + 1;
        // y = B·x = A·x + c·x  (vizinhança não-dirigida + auto-influência do shift)
        const y = new Map<string, number>();
        let normSq = 0;
        for (const u of nodes) {
            let acc = shift * x.get(u)!;
            for (const v of adj.get(u)!) acc += x.get(v)!;
            y.set(u, acc);
            normSq += acc * acc;
        }
        const norm = Math.sqrt(normSq);
        if (norm === 0) break; // não deve ocorrer com E>0, mas defensivo
        // renormaliza para ‖y‖₂ = 1
        let maxDelta = 0;
        for (const u of nodes) {
            const val = y.get(u)! / norm;
            const d = Math.abs(val - x.get(u)!);
            if (d > maxDelta) maxDelta = d;
            y.set(u, val);
        }
        x = y;
        if (maxDelta < tol) {
            converged = true;
            break;
        }
    }

    // Fixa sinal não-negativo (Perron–Frobenius): se a maioria do peso for
    // negativa por convenção da iteração, espelha. Soma como referência de sinal.
    let signSum = 0;
    for (const val of x.values()) signSum += val;
    if (signSum < 0) {
        for (const [k, v] of x) x.set(k, -v);
    }

    const scored: ScoredNode[] = nodes.map((id) => ({ id, score: x.get(id)! }));
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return Object.freeze({
        skipped: false,
        converged,
        iterations,
        top: Object.freeze(scored.slice(0, Math.max(1, topN)).map((s) => Object.freeze(s))),
    });
}

/**
 * Orquestrador. Retorna VM frozen com todos os KPIs. Métricas O(V·E)
 * (betweenness/closeness/diâmetro) puladas acima de maxNodesForExpensive.
 */
export function computeGraphMetrics(
    input: { nodes?: ReadonlyArray<GraphNodeInput>; edges?: ReadonlyArray<GraphEdgeInput> },
    opts: GraphMetricsOptions = {},
): GraphMetricsResult {
    const nodes = Array.isArray(input?.nodes) ? input.nodes : [];
    const edges = Array.isArray(input?.edges) ? input.edges : [];
    const maxExpensive = _posInt(opts.maxNodesForExpensive, DEFAULT_MAX_EXPENSIVE);
    const topN = _posInt(opts.topN, DEFAULT_TOP_N);

    const adj = buildUndirectedAdjacency(nodes, edges);
    const nodeCount = adj.size;
    const edgeCount = countUndirectedEdges(adj);
    const expensiveSkipped = nodeCount > maxExpensive;

    const degree = computeDegreeMetric(adj, topN);
    const components = computeComponents(adj);
    const clusteringGlobal = computeClusteringGlobal(adj);
    const connectivityRisk = computeConnectivityRisk(adj);
    const kcore = computeKCore(adj, topN); // O(V+E), sempre roda

    const betweenness: CentralityMetric = expensiveSkipped
        ? Object.freeze({ skipped: true, reason: 'too_large', top: Object.freeze([]) })
        : Object.freeze({ skipped: false, top: computeBetweenness(adj, topN) });
    const closeness: CentralityMetric = expensiveSkipped
        ? Object.freeze({ skipped: true, reason: 'too_large', top: Object.freeze([]) })
        : Object.freeze({ skipped: false, top: computeCloseness(adj, topN) });
    const eigenvector: EigenvectorMetric = expensiveSkipped
        ? Object.freeze({
              skipped: true,
              reason: 'too_large',
              converged: false,
              iterations: 0,
              top: Object.freeze([]),
          })
        : computeEigenvector(adj, topN);
    const spread = computeSpread(adj, maxExpensive);

    const modularity =
        typeof opts.partitionOf === 'function' && nodes.length > 0
            ? computeModularity(adj, nodes, opts.partitionOf)
            : null;

    return Object.freeze({
        nodeCount,
        edgeCount,
        density: computeDensity(nodeCount, edgeCount),
        degree,
        components,
        clusteringGlobal,
        betweenness,
        closeness,
        connectivityRisk,
        spread,
        kcore,
        eigenvector,
        modularity,
        expensiveSkipped,
    });
}

function _posInt(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}
