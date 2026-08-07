// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENERGY/MASS FLOW SANKEY — transform PURO (ECBYTS-ENERGY-SCENARIOS-001#8)

   Lê o grafo (elementos + route_flow com payload de massa/energia) e produz
   um MODELO de Sankey pronto para desenhar: nós em colunas (topological layers)
   + links com espessura proporcional ao fluxo. Zero DOM, zero dependência —
   testável com node --test. O desenho SVG vive no handler de UI.
   ================================================================ */

import type { FlowType, FlowPayload } from './routeFlowGraph.js';

export interface SankeyInputNode {
    id: string;
    /** Rótulo de exibição (default = id). */
    label?: string;
}
export interface SankeyInputRoute {
    id?: string;
    startNodeId?: string;
    endNodeId?: string;
    payload?: FlowPayload;
}

export interface SankeyNode {
    id: string;
    label: string;
    /** Coluna (0 = fontes; cresce com a profundidade topológica). */
    layer: number;
    /** Fluxo total que passa pelo nó = max(entrada, saída). */
    throughput: number;
    inflow: number;
    outflow: number;
    isSource: boolean;
    isSink: boolean;
}
export interface SankeyLink {
    source: string;
    target: string;
    value: number;
    unit: string;
    label: string;
    /** Fração do fluxo total de saída do nó fonte (para % nas faixas). */
    fraction: number;
}
export interface SankeyModel {
    flowType: FlowType;
    unit: string | null;
    nodes: Array<SankeyNode>;
    links: Array<SankeyLink>;
    /** Número de colunas (layer máximo + 1). */
    layerCount: number;
    /** Fluxo máximo de um único link (para normalizar espessuras). */
    maxLinkValue: number;
    /** true se algum ciclo impediu ordenação topológica limpa. */
    hasCycle: boolean;
}

/**
 * Atribui a cada nó uma coluna (layer) por profundidade topológica:
 * fontes na coluna 0; um nó fica na coluna = maior layer de seus predecessores + 1.
 * Robusto a ciclos (usa Kahn; nós remanescentes recebem layer incremental).
 */
function assignLayers(
    nodeIds: Array<string>,
    edges: Array<{ from: string; to: string }>,
): { layer: Map<string, number>; hasCycle: boolean } {
    const indeg: Map<string, number> = new Map();
    const succ: Map<string, Array<string>> = new Map();
    for (const id of nodeIds) {
        indeg.set(id, 0);
        succ.set(id, []);
    }
    for (const e of edges) {
        if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
        indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
        (succ.get(e.from) as Array<string>).push(e.to);
    }
    const layer: Map<string, number> = new Map();
    let queue = nodeIds.filter((id) => (indeg.get(id) || 0) === 0);
    for (const id of queue) layer.set(id, 0);
    let processed = 0;
    while (queue.length) {
        const next: Array<string> = [];
        for (const cur of queue) {
            processed++;
            const curLayer = layer.get(cur) || 0;
            for (const s of succ.get(cur) || []) {
                layer.set(s, Math.max(layer.get(s) ?? 0, curLayer + 1));
                const d = (indeg.get(s) || 0) - 1;
                indeg.set(s, d);
                if (d === 0) next.push(s);
            }
        }
        queue = next;
    }
    let hasCycle = false;
    if (processed < nodeIds.length) {
        hasCycle = true;
        // Nós em ciclo: coloca depois de qualquer predecessor conhecido.
        for (const id of nodeIds) if (!layer.has(id)) layer.set(id, 0);
    }
    return { layer, hasCycle };
}

/**
 * Constrói o modelo de Sankey a partir de nós + rotas com payload de um dado
 * flowType. Rotas sem payload ou de outro flowType são ignoradas. Nós sem
 * nenhum link são descartados.
 */
export function buildSankeyModel(
    nodes: Array<SankeyInputNode> = [],
    routes: Array<SankeyInputRoute> = [],
    flowType: FlowType = 'mass',
): SankeyModel {
    const labelById: Map<string, string> = new Map();
    for (const n of Array.isArray(nodes) ? nodes : []) {
        if (n?.id) labelById.set(n.id, n.label || n.id);
    }

    const inflow: Map<string, number> = new Map();
    const outflow: Map<string, number> = new Map();
    const used: Set<string> = new Set();
    const edges: Array<{ from: string; to: string }> = [];
    const rawLinks: Array<{ source: string; target: string; value: number; unit: string; label: string }> = [];
    let unit: string | null = null;

    for (const r of Array.isArray(routes) ? routes : []) {
        const p = r?.payload;
        if (!p || p.flowType !== flowType) continue;
        if (!Number.isFinite(p.value) || p.value < 0) continue;
        const from = r.startNodeId;
        const to = r.endNodeId;
        if (!from || !to) continue;
        outflow.set(from, (outflow.get(from) || 0) + p.value);
        inflow.set(to, (inflow.get(to) || 0) + p.value);
        used.add(from);
        used.add(to);
        edges.push({ from, to });
        if (unit == null && p.unit) unit = p.unit;
        rawLinks.push({ source: from, target: to, value: p.value, unit: p.unit || '', label: p.label || '' });
    }

    const usedIds = [...used];
    const { layer, hasCycle } = assignLayers(usedIds, edges);

    const sankeyNodes: Array<SankeyNode> = usedIds.map((id) => {
        const inV = inflow.get(id) || 0;
        const outV = outflow.get(id) || 0;
        return {
            id,
            label: labelById.get(id) || id,
            layer: layer.get(id) || 0,
            throughput: Math.max(inV, outV),
            inflow: inV,
            outflow: outV,
            isSource: inV === 0 && outV > 0,
            isSink: outV === 0 && inV > 0,
        };
    });
    sankeyNodes.sort((a, b) => a.layer - b.layer || (a.id < b.id ? -1 : 1));

    let maxLinkValue = 0;
    const links: Array<SankeyLink> = rawLinks.map((l) => {
        const srcOut = outflow.get(l.source) || l.value;
        if (l.value > maxLinkValue) maxLinkValue = l.value;
        return {
            source: l.source,
            target: l.target,
            value: l.value,
            unit: l.unit,
            label: l.label,
            fraction: srcOut > 0 ? l.value / srcOut : 0,
        };
    });

    const layerCount = usedIds.length ? Math.max(...usedIds.map((id) => layer.get(id) || 0)) + 1 : 0;
    return { flowType, unit, nodes: sankeyNodes, links, layerCount, maxLinkValue, hasCycle };
}
