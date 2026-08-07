// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Layout Quality Score - Phase 1.51 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S51
 *
 * Phase 1.51 (2026-05-02) - pure-logic métricas de qualidade estética
 * para layouts de grafos: variância de comprimento de arestas, contagem
 * de sobreposição de nós, contagem de cruzamentos de arestas, e score
 * agregado [0,1] para comparar layouts alternativos.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const LAYOUT_QUALITY_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.51',
    deliveredAt: '2026-05-02',
});

function getPos(nodePositions: any, id: any): any {
    if (!nodePositions) return null;
    if (nodePositions instanceof Map) return nodePositions.get(id) || null;
    if (typeof nodePositions === 'object') return nodePositions[id] || null;
    return null;
}

function isFiniteNum(v: any): boolean {
    return typeof v === 'number' && Number.isFinite(v);
}

function edgeLength(e: any, nodePositions: any): number | null {
    const a = getPos(nodePositions, e.from);
    const b = getPos(nodePositions, e.to);
    if (!a || !b || !isFiniteNum(a.x) || !isFiniteNum(a.y) || !isFiniteNum(b.x) || !isFiniteNum(b.y)) {
        return null;
    }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Variância (population) dos comprimentos de aresta. Quanto menor, mais
 * uniforme o layout. Edges inválidas são ignoradas.
 */
export function edgeLengthVariance(edges: any, nodePositions: any): number {
    if (!Array.isArray(edges) || edges.length === 0) return 0;
    const lengths: number[] = [];
    for (const e of edges) {
        if (!e || e.from === e.to) continue;
        const len = edgeLength(e, nodePositions);
        if (len !== null) lengths.push(len);
    }
    if (lengths.length === 0) return 0;
    const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
    let varSum = 0;
    for (const v of lengths) varSum += (v - mean) * (v - mean);
    return varSum / lengths.length;
}

/**
 * Número de pares de nós sobrepostos (distância < 2*radius). Espera
 * `nodes` no formato [{id, x, y}, ...]. radius default 10.
 */
export function nodeOverlapCount(nodes: any, radius = 10): number {
    if (!Array.isArray(nodes) || nodes.length < 2) return 0;
    const r = isFiniteNum(radius) && radius > 0 ? radius : 10;
    const minDist = 2 * r;
    const minDist2 = minDist * minDist;
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!a || !isFiniteNum(a.x) || !isFiniteNum(a.y)) continue;
        for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            if (!b || !isFiniteNum(b.x) || !isFiniteNum(b.y)) continue;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            if (dx * dx + dy * dy < minDist2) count++;
        }
    }
    return count;
}

function segmentsCross(p1: any, p2: any, p3: any, p4: any): boolean {
    // Returns true if segments (p1,p2) and (p3,p4) cross (strict interior).
    const d = (a: any, b: any, c: any) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = d(p3, p4, p1);
    const d2 = d(p3, p4, p2);
    const d3 = d(p1, p2, p3);
    const d4 = d(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Conta cruzamentos de arestas (geometric, ignora arestas que compartilham nó).
 */
export function edgeCrossingCount(edges: any, nodePositions: any): number {
    if (!Array.isArray(edges) || edges.length < 2) return 0;
    const segs: any[] = [];
    for (const e of edges) {
        if (!e || e.from === e.to) continue;
        const a = getPos(nodePositions, e.from);
        const b = getPos(nodePositions, e.to);
        if (!a || !b || !isFiniteNum(a.x) || !isFiniteNum(a.y) || !isFiniteNum(b.x) || !isFiniteNum(b.y)) continue;
        segs.push({ from: e.from, to: e.to, a, b });
    }
    let count = 0;
    for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
            const s1 = segs[i];
            const s2 = segs[j];
            // Skip shared endpoint
            if (s1.from === s2.from || s1.from === s2.to || s1.to === s2.from || s1.to === s2.to) continue;
            if (segmentsCross(s1.a, s1.b, s2.a, s2.b)) count++;
        }
    }
    return count;
}

/**
 * Combina métricas em score [0,1]. Penaliza variância, sobreposição e
 * cruzamentos. Higher = better.
 */
export function aestheticScore(metrics: any): number {
    if (!metrics || typeof metrics !== 'object') return 0;
    const variance = isFiniteNum(metrics.variance) ? Math.max(0, metrics.variance) : 0;
    const overlaps = isFiniteNum(metrics.overlaps) ? Math.max(0, metrics.overlaps) : 0;
    const crossings = isFiniteNum(metrics.crossings) ? Math.max(0, metrics.crossings) : 0;
    // Smooth decay: each penalty halves contribution per unit.
    const vTerm = 1 / (1 + variance / 1000);
    const oTerm = 1 / (1 + overlaps);
    const cTerm = 1 / (1 + crossings);
    // Weighted: crossings worst, then overlaps, then variance.
    const score = 0.25 * vTerm + 0.35 * oTerm + 0.4 * cTerm;
    if (!isFiniteNum(score)) return 0;
    return Math.max(0, Math.min(1, score));
}

/**
 * Sumariza métricas + score para um layout.
 */
export function summarizeQuality(nodes: any, edges: any, nodePositions: any, radius = 10) {
    const variance = edgeLengthVariance(edges, nodePositions);
    const overlaps = nodeOverlapCount(nodes, radius);
    const crossings = edgeCrossingCount(edges, nodePositions);
    const score = aestheticScore({ variance, overlaps, crossings });
    return Object.freeze({
        nodes: Array.isArray(nodes) ? nodes.length : 0,
        edges: Array.isArray(edges) ? edges.length : 0,
        variance,
        overlapPairs: overlaps,
        crossings,
        score,
    });
}

/**
 * Compara dois layouts e retorna delta. Positive deltaScore = b melhor que a.
 */
export function compareLayouts(a: any, b: any) {
    const sa = a && typeof a === 'object' ? a : {};
    const sb = b && typeof b === 'object' ? b : {};
    const num = (v: any) => (isFiniteNum(v) ? v : 0);
    return Object.freeze({
        deltaVariance: num(sb.variance) - num(sa.variance),
        deltaOverlaps: num(sb.overlapPairs) - num(sa.overlapPairs),
        deltaCrossings: num(sb.crossings) - num(sa.crossings),
        deltaScore: num(sb.score) - num(sa.score),
        winner: num(sb.score) > num(sa.score) ? 'b' : num(sa.score) > num(sb.score) ? 'a' : 'tie',
    });
}

/**
 * Module identity export.
 */
export const layoutQualityScoreMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.51',
    deliveredAt: '2026-05-02',
    exports: [
        'LAYOUT_QUALITY_META',
        'edgeLengthVariance',
        'nodeOverlapCount',
        'edgeCrossingCount',
        'aestheticScore',
        'summarizeQuality',
        'compareLayouts',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
