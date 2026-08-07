// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SENTINEL Calvin 2026-06-11 (print): "a tela tree deveria ter essa forma de
// visualização" — o modo Tree do painel Full Model/Relations deve renderizar
// o grafo hierárquico em CAMADAS (nós circulares coloridos por família,
// arestas pontilhadas em leque, folhas densas na base — visual constellation),
// não a lista indentada.
//
// Pure-logic: converte a árvore de descendentes (SunburstNode-like) em
// posições de nós/arestas REUSANDO o pipeline Sugiyama testado de
// core/constellation/hierarchicalLayout (assignLayers → minimizeCrossings →
// computePositions) e normalizando para o viewport do canvas.
// Zero DOM/Canvas — o paint vive em homeRelationsPanel._renderTreeView.

import {
    assignLayers,
    minimizeCrossings,
    computePositions,
} from '../../../core/constellation/hierarchicalLayout.js';

console.debug('[mod:load]', 'app/js/utils/ui/homeGrid/_relationsTierGraphLayout.ts');

export interface TierGraphInputNode {
    readonly id: string;
    readonly name: string;
    readonly family?: string;
    readonly severity?: 'intervention' | 'prevention' | 'reference' | null;
    readonly children?: ReadonlyArray<TierGraphInputNode>;
}

export interface TierGraphConfig {
    readonly width: number;
    readonly height: number;
    /** Profundidade máxima (default 4). */
    readonly maxDepth?: number;
    /** Margem do viewport (default 20). */
    readonly margin?: number;
}

export interface TierGraphNode {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly severity: 'intervention' | 'prevention' | 'reference' | null;
    readonly depth: number;
    readonly x: number;
    readonly y: number;
    readonly r: number;
}

export interface TierGraphEdge {
    readonly sourceId: string;
    readonly targetId: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
}

export interface TierGraphLayout {
    readonly nodes: ReadonlyArray<TierGraphNode>;
    readonly edges: ReadonlyArray<TierGraphEdge>;
    readonly layerCount: number;
}

/** Raio base por profundidade (afunila como na referência visual). */
const RADIUS_BY_DEPTH = [10, 7, 5.5, 4.5, 3.5];

function flatten(root: TierGraphInputNode, maxDepth: number) {
    const nodes: Array<{ id: string; name: string; family: string; severity: any; depth: number }> = [];
    const edges: Array<{ source: string; target: string }> = [];
    const walk = (n: TierGraphInputNode, depth: number) => {
        nodes.push({
            id: n.id,
            name: n.name || n.id,
            family: n.family || '',
            severity: n.severity ?? null,
            depth,
        });
        if (depth >= maxDepth) return;
        for (const child of n.children || []) {
            edges.push({ source: n.id, target: child.id });
            walk(child, depth + 1);
        }
    };
    walk(root, 0);
    return { nodes, edges };
}

/**
 * Layout do grafo em camadas para o modo Tree.
 * Determinístico: mesma árvore + mesmo viewport → mesmas posições.
 */
export function computeTierGraphLayout(
    root: TierGraphInputNode,
    cfg: TierGraphConfig,
): TierGraphLayout {
    const maxDepth = cfg.maxDepth ?? 4;
    const margin = cfg.margin ?? 20;
    const { nodes, edges } = flatten(root, maxDepth);
    if (nodes.length === 0) return Object.freeze({ nodes: [], edges: [], layerCount: 0 });

    // Pipeline Sugiyama reusado (unidades abstratas; normalizamos depois).
    const { layers } = assignLayers(nodes, edges);
    const ordered = minimizeCrossings(layers, edges, { iterations: 2 });
    const positions = computePositions(ordered, { layerSpacing: 1, nodeSpacing: 1, direction: 'TB' });

    // Normalização global do X → o nível mais largo define a escala; os
    // demais ficam centrados proporcionalmente (leque da referência visual).
    let minX = Infinity;
    let maxX = -Infinity;
    positions.forEach((p: any) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
    });
    const spanX = maxX - minX;
    const usableW = Math.max(1, cfg.width - margin * 2);
    const layerCount = ordered.length;
    const usableH = Math.max(1, cfg.height - margin * 2);
    const yStep = layerCount > 1 ? usableH / (layerCount - 1) : 0;

    const xy = new Map<string, { x: number; y: number; layer: number }>();
    positions.forEach((p: any, id: any) => {
        const x =
            spanX > 0
                ? margin + ((p.x - minX) / spanX) * usableW
                : cfg.width / 2;
        const y = layerCount > 1 ? margin + p.layer * yStep : cfg.height / 2;
        xy.set(String(id), { x, y, layer: p.layer });
    });

    // Raio por camada com auto-shrink quando o nível é denso (folhas viram
    // a fileira compacta da base, como na referência).
    const countByLayer = ordered.map((l: any) => l.length);
    const radiusForLayer = (layer: number) => {
        const base = RADIUS_BY_DEPTH[Math.min(layer, RADIUS_BY_DEPTH.length - 1)] ?? 3.5;
        const count = countByLayer[layer] || 1;
        const fit = (usableW / count) * 0.48;
        return Math.max(2.5, Math.min(base, fit));
    };

    const outNodes: TierGraphNode[] = nodes.map((n) => {
        const p = xy.get(n.id) || { x: cfg.width / 2, y: cfg.height / 2, layer: n.depth };
        return Object.freeze({
            id: n.id,
            name: n.name,
            family: n.family,
            severity: n.severity,
            depth: p.layer,
            x: p.x,
            y: p.y,
            r: radiusForLayer(p.layer),
        });
    });

    const outEdges: TierGraphEdge[] = [];
    for (const e of edges) {
        const a = xy.get(e.source);
        const b = xy.get(e.target);
        if (!a || !b) continue;
        outEdges.push(
            Object.freeze({ sourceId: e.source, targetId: e.target, x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
        );
    }

    return Object.freeze({
        nodes: Object.freeze(outNodes),
        edges: Object.freeze(outEdges),
        layerCount,
    });
}

/** Hit-test de clique: nó mais próximo dentro de r+slop. */
export function hitTestTierGraph(
    layout: TierGraphLayout,
    x: number,
    y: number,
    slopPx = 4,
): TierGraphNode | null {
    let best: TierGraphNode | null = null;
    let bestDist = Infinity;
    for (const n of layout.nodes) {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d <= n.r + slopPx && d < bestDist) {
            best = n;
            bestDist = d;
        }
    }
    return best;
}
