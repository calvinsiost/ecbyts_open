// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Hierarchical Layout - Phase 1.40 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S40
 *
 * Phase 1.40 (2026-05-01) - pure-logic Sugiyama-simplified hierarchical
 * layout para DAGs (directed acyclic graphs). Pipeline canônico:
 *
 *   1. assignLayers(nodes, edges)         - BFS de roots → camadas (rank)
 *   2. minimizeCrossings(layers, edges)   - heurística da mediana
 *   3. computePositions(layers, opts)     - coords (x,y) determinísticas
 *   4. summarizeHierarchy(result)         - métricas agregadas
 *
 * Cycles são tratados ignorando back-edges (camada já atribuída ≤ atual).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const HIERARCHICAL_LAYOUT_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.40',
    deliveredAt: '2026-05-01',
});

/** Defaults para computePositions. */
export const DEFAULT_HIERARCHICAL_OPTIONS = Object.freeze({
    layerSpacing: 100,
    nodeSpacing: 80,
    direction: 'TB', // TB=top-bottom, LR=left-right
    originX: 0,
    originY: 0,
});

function toArray(x: any) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (x instanceof Set) return Array.from(x);
    throw new TypeError('expected Array or Set');
}

function buildAdjacency(nodes: any, edges: any) {
    const out = new Map();
    const inDeg = new Map();
    const ids = new Set();
    for (const n of nodes) {
        if (!n || typeof n.id !== 'string') throw new TypeError('node.id required');
        ids.add(n.id);
        out.set(n.id, []);
        inDeg.set(n.id, 0);
    }
    for (const e of edges) {
        if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') {
            throw new TypeError('edge.source/target required');
        }
        if (!ids.has(e.source) || !ids.has(e.target)) continue;
        out.get(e.source).push(e.target);
        inDeg.set(e.target, inDeg.get(e.target) + 1);
    }
    return { out, inDeg, ids };
}

/**
 * Atribui cada node a uma camada (rank) usando BFS a partir dos roots
 * (in-degree 0). Nodes desconectados sem in-edges também são roots.
 * Para grafos com ciclos, back-edges são ignoradas (não rebaixa node já visitado).
 *
 * @returns {{ layers: string[][], layerOf: Map<string, number> }}
 */
export function assignLayers(nodes: any, edges: any) {
    const nList = toArray(nodes);
    const eList = toArray(edges);
    const { out, inDeg, ids } = buildAdjacency(nList, eList);

    
    const layerOf: Map<any, any>= new Map();
    
    const queue: any[]= [];
    // Roots: in-degree 0 (deterministic order = input order)
    for (const n of nList) {
        if (inDeg.get(n.id) === 0) {
            layerOf.set(n.id, 0);
            queue.push(n.id);
        }
    }
    // Edge case: ciclo puro sem root → primeiro node vira root
    if (queue.length === 0 && nList.length > 0) {
        const first = nList[0].id;
        layerOf.set(first, 0);
        queue.push(first);
    }

    let head = 0;
    while (head < queue.length) {
        const u = queue[head++];
        const lu = layerOf.get(u);
        for (const v of out.get(u) || []) {
            const lv = layerOf.has(v) ? layerOf.get(v) : -1;
            const candidate = lu + 1;
            if (lv < candidate) {
                layerOf.set(v, candidate);
                queue.push(v);
            }
        }
    }

    // Nodes nunca alcançados (em ciclo isolado) → camada 0
    for (const id of ids) {
        if (!layerOf.has(id)) layerOf.set(id, 0);
    }

    const maxLayer = Math.max(0, ...Array.from(layerOf.values()));
    
    const layers: any[][]= Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of nList) {
        layers[layerOf.get(n.id)]!.push(n.id);
    }
    return { layers, layerOf };
}

function medianOf(positions: any) {
    if (positions.length === 0) return -1;
    const sorted = positions.slice().sort((a: any, b: any) => a - b);
    const m = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[m];
    return (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Reduz crossings usando heurística da mediana (Gansner et al.).
 * Para cada camada (top→bottom), reordena nodes pela mediana das posições
 * dos seus predecessores na camada anterior.
 *
 * @param {any} layers - saída de assignLayers
 * @param {any} edges  - Array de arestas
 * @param {any} [opts] - opções
 * @returns {any} novas camadas reordenadas
 */
export function minimizeCrossings(layers: any, edges: any, opts: any = {}): any {
    
    const iterations: any= Number.isFinite(opts.iterations) ? Math.max(1, opts.iterations) : 2;
    const eList = toArray(edges);
    const result = layers.map((l: any) => l.slice());

    // predecessors map: target → [sources]
    const preds = new Map();
    const succs = new Map();
    for (const e of eList) {
        if (!preds.has(e.target)) preds.set(e.target, []);
        preds.get(e.target).push(e.source);
        if (!succs.has(e.source)) succs.set(e.source, []);
        succs.get(e.source).push(e.target);
    }

    for (let iter = 0; iter < iterations; iter++) {
        // Down-sweep: usar predecessores
        for (let li = 1; li < result.length; li++) {
            const prevPos = new Map();
            result[li - 1].forEach((id: any, idx: any) =>
                prevPos.set(id, (idx as any)),
            );
            const scored = result[li].map((id: any, originalIdx: any) => {
                const ps = (preds.get(id) || [])
                    .filter((p: any) => prevPos.has((p as any)))
                    .map((p: any) => prevPos.get((p as any)));
                const med = medianOf(ps);
                return { id, score: med < 0 ? originalIdx : med, originalIdx };
            });
            scored.sort((a: any, b: any) => {
                if (a.score !== b.score) return a.score - b.score;
                return a.originalIdx - b.originalIdx;
            });
            result[li] = scored.map((s: any) => s.id);
        }
        // Up-sweep: usar sucessores
        for (let li = result.length - 2; li >= 0; li--) {
            const nextPos = new Map();
            result[li + 1].forEach((id: any, idx: any) =>
                nextPos.set(id, (idx as any)),
            );
            const scored = result[li].map((id: any, originalIdx: any) => {
                const ss = (succs.get(id) || [])
                    .filter((s: any) => nextPos.has((s as any)))
                    .map((s: any) => nextPos.get((s as any)));
                const med = medianOf(ss);
                return { id, score: med < 0 ? originalIdx : med, originalIdx };
            });
            scored.sort((a: any, b: any) => {
                if (a.score !== b.score) return a.score - b.score;
                return a.originalIdx - b.originalIdx;
            });
            result[li] = scored.map((s: any) => s.id);
        }
    }

    return result;
}

/**
 * Calcula coordenadas (x,y) determinísticas para cada node.
 * Camadas centralizadas em torno de originX (TB) ou originY (LR).
 *
 * @returns Map<nodeId, {x, y, layer, indexInLayer}>
 */
export function computePositions(layers: any, opts = {}) {
    
    const cfg: any= { ...DEFAULT_HIERARCHICAL_OPTIONS, ...opts };
    if (!Array.isArray(layers)) throw new TypeError('layers must be Array');
    const positions = new Map();
    const isTB = cfg.direction !== 'LR';

    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        const count = layer.length;
        const totalSpan = (count - 1) * cfg.nodeSpacing;
        const start = -totalSpan / 2;
        for (let i = 0; i < count; i++) {
            const id = layer[i];
            const along = start + i * cfg.nodeSpacing;
            const across = li * cfg.layerSpacing;
            if (isTB) {
                positions.set(id, {
                    x: cfg.originX + along,
                    y: cfg.originY + across,
                    layer: li,
                    indexInLayer: i,
                });
            } else {
                positions.set(id, {
                    x: cfg.originX + across,
                    y: cfg.originY + along,
                    layer: li,
                    indexInLayer: i,
                });
            }
        }
    }
    return positions;
}

/**
 * Conta crossings entre duas camadas adjacentes (top, bottom).
 * Para todo par de edges (u1→v1, u2→v2), há crossing se
 * (pos(u1) < pos(u2)) XOR (pos(v1) < pos(v2)).
 */
export function countCrossings(layerTop: any, layerBottom: any, edges: any) {
    const topPos = new Map();
    layerTop.forEach((id: any, i: any) =>
        topPos.set((id as any), (i as any)),
    );
    const botPos = new Map();
    layerBottom.forEach((id: any, i: any) =>
        botPos.set((id as any), (i as any)),
    );
    const relevant = toArray(edges).filter((e) => topPos.has(e.source) && botPos.has(e.target));
    let count = 0;
    for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
            const a = relevant[i];
            const b = relevant[j];
            const su = topPos.get(a.source);
            const sv = topPos.get(b.source);
            const tu = botPos.get(a.target);
            const tv = botPos.get(b.target);
            if ((su < sv && tu > tv) || (su > sv && tu < tv)) count++;
        }
    }
    return count;
}

/**
 * Resumo agregado: contagem de camadas, nodes/camada, crossings totais,
 * largura/altura do bounding box.
 */
export function summarizeHierarchy(result: any) {
    if (!result || !Array.isArray(result.layers)) {
        throw new TypeError('result.layers required');
    }
    const layers = result.layers;
    const positions = result.positions instanceof Map ? result.positions : new Map();
    const layerCount = layers.length;
    const nodeCount = layers.reduce((acc: any, l: any) => acc + l.length, 0);
    const widest = layers.reduce(
        (acc: any, l: any) => Math.max((acc as any), (l as any).length),
        0,
    );
    const layerSizes = layers.map((l: any) => l.length);

    let totalCrossings = 0;
    if (Array.isArray(result.edges)) {
        for (let i = 0; i < layers.length - 1; i++) {
            totalCrossings += countCrossings(layers[i], layers[i + 1], result.edges);
        }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const bbox =
        positions.size > 0
            ? { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
            : { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };

    return {
        layerCount,
        nodeCount,
        widest,
        layerSizes,
        totalCrossings,
        bbox,
    };
}
