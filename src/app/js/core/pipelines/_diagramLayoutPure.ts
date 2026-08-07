// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   NATIVE-PIPELINE-DIAGRAM-001 — Layout em camadas do DAG do pipeline. Pure-logic.

   Substitui o canvas bpmn-js (CDN + marca d'água bpmn.io) por uma elaboração
   PRÓPRIA do ecbyts. Esta é a parte algorítmica: posicionar os nós do pipeline
   (DAG { nodes, edges, startNodeId }) num fluxograma legível.

   Algoritmo (Sugiyama simplificado):
   1. CAMADA por caminho mais longo a partir das fontes (rank topológico);
   2. ORDEM dentro da camada por descoberta (determinística);
   3. COORDENADAS: x = camada × passo, y = ordem × passo (centralizado).
   Tolerante a ciclos (quebra defensiva) — o pipeline deve ser DAG.

   O renderizador SVG (runtime) consome estas posições. Determinístico; sem DOM.
   ================================================================ */

export interface DiagramNodeInput {
    readonly id: string;
    readonly type?: string;
    readonly label?: string;
}
export interface DiagramEdgeInput {
    readonly from: string;
    readonly to: string;
    readonly label?: string;
}

export interface LaidOutNode {
    readonly id: string;
    readonly type: string;
    readonly label: string;
    readonly layer: number;
    readonly order: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface LaidOutEdge {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    /** Pontos do conector: saída (direita do source) → entrada (esquerda do target). */
    readonly points: ReadonlyArray<readonly [number, number]>;
}
export interface DiagramLayout {
    readonly nodes: ReadonlyArray<LaidOutNode>;
    readonly edges: ReadonlyArray<LaidOutEdge>;
    readonly width: number;
    readonly height: number;
}

export interface LayoutOptions {
    readonly nodeWidth?: number;
    readonly nodeHeight?: number;
    readonly gapX?: number; // entre camadas
    readonly gapY?: number; // entre nós da mesma camada
    readonly marginX?: number;
    readonly marginY?: number;
}

/**
 * Calcula o layout do pipeline. Determinístico; entradas inválidas (nó solto,
 * ciclo) são tratadas defensivamente (sem laço infinito).
 */
export function layoutPipeline(
    nodes: ReadonlyArray<DiagramNodeInput>,
    edges: ReadonlyArray<DiagramEdgeInput>,
    startNodeId: string | null = null,
    opts: LayoutOptions = {},
): DiagramLayout {
    const nodeWidth = opts.nodeWidth ?? 160;
    const nodeHeight = opts.nodeHeight ?? 64;
    const gapX = opts.gapX ?? 80;
    const gapY = opts.gapY ?? 32;
    const marginX = opts.marginX ?? 24;
    const marginY = opts.marginY ?? 24;

    const ids = new Set(nodes.map((n) => n.id));
    // só arestas entre nós existentes
    const validEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
    const outgoing = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const n of nodes) {
        outgoing.set(n.id, []);
        indeg.set(n.id, 0);
    }
    for (const e of validEdges) {
        outgoing.get(e.from)!.push(e.to);
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }

    // --- 1. CAMADA por caminho mais longo (Kahn + longest path) ---
    const layer = new Map<string, number>();
    for (const n of nodes) layer.set(n.id, 0);
    // ordem de processamento topológica; guarda anti-ciclo
    const tempIndeg = new Map(indeg);
    const queue: string[] = nodes
        .filter((n) => (tempIndeg.get(n.id) ?? 0) === 0)
        .map((n) => n.id);
    // startNodeId fica na camada 0 (fonte canônica)
    let processed = 0;
    const maxIter = nodes.length * 4 + 8;
    let guard = 0;
    while (queue.length > 0 && guard++ < maxIter) {
        const u = queue.shift()!;
        processed++;
        const lu = layer.get(u)!;
        for (const v of outgoing.get(u) ?? []) {
            if (layer.get(v)! < lu + 1) layer.set(v, lu + 1);
            tempIndeg.set(v, (tempIndeg.get(v) ?? 0) - 1);
            if ((tempIndeg.get(v) ?? 0) === 0) queue.push(v);
        }
    }
    // ciclo: nós não processados ganham camada após seus predecessores conhecidos
    if (processed < nodes.length) {
        for (const e of validEdges) {
            const lf = layer.get(e.from)!;
            if (layer.get(e.to)! <= lf) layer.set(e.to, lf + 1);
        }
    }

    // --- 2. ORDEM dentro da camada (por ordem de declaração dos nós) ---
    const byLayer = new Map<number, DiagramNodeInput[]>();
    for (const n of nodes) {
        const l = layer.get(n.id)!;
        if (!byLayer.has(l)) byLayer.set(l, []);
        byLayer.get(l)!.push(n);
    }

    // --- 3. COORDENADAS ---
    const laidNodes: LaidOutNode[] = [];
    const posById = new Map<string, LaidOutNode>();
    let maxLayer = 0;
    let maxOrder = 0;
    for (const [l, group] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
        group.forEach((n, order) => {
            const x = marginX + l * (nodeWidth + gapX);
            const y = marginY + order * (nodeHeight + gapY);
            const node: LaidOutNode = {
                id: n.id,
                type: n.type ?? 'action',
                label: n.label ?? n.id,
                layer: l,
                order,
                x,
                y,
                width: nodeWidth,
                height: nodeHeight,
            };
            laidNodes.push(node);
            posById.set(n.id, node);
            if (l > maxLayer) maxLayer = l;
            if (order > maxOrder) maxOrder = order;
        });
    }

    // --- conectores: direita-centro do source → esquerda-centro do target ---
    const laidEdges: LaidOutEdge[] = validEdges.map((e) => {
        const s = posById.get(e.from)!;
        const t = posById.get(e.to)!;
        const start: [number, number] = [s.x + s.width, s.y + s.height / 2];
        const end: [number, number] = [t.x, t.y + t.height / 2];
        return { from: e.from, to: e.to, label: e.label ?? '', points: [start, end] };
    });

    const width = marginX * 2 + (maxLayer + 1) * nodeWidth + maxLayer * gapX;
    const height = marginY * 2 + (maxOrder + 1) * nodeHeight + maxOrder * gapY;
    void startNodeId; // startNodeId já é fonte (indeg 0) na prática; reservado p/ destaque visual
    return Object.freeze({ nodes: laidNodes, edges: laidEdges, width, height });
}
