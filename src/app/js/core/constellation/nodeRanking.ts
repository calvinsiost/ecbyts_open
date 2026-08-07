// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Ranking - Phase 1.40 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S40
 *
 * Phase 1.40 (2026-05-02) - pure-logic node ranking via centrality
 * measures e métricas configuráveis. Suporta:
 *   - degree centrality (in/out/total)
 *   - weighted score por métricas {field: weight}
 *   - top-N selection
 *   - rank ties resolvidos deterministically (id asc)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const RANKING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.40',
    deliveredAt: '2026-05-02',
});

/**
 * Calcula degree centrality.
 * @param {Array<{id?: string}>} nodes
 * @param {Array<{from?: string, to?: string}>} edges
 * @returns {Map<string, {in: number, out: number, total: number}>}
 */
export function degreeCentrality(nodes: Array<{id?: string}>, edges: Array<{from?: string, to?: string}>): Map<string, {in: number, out: number, total: number}> {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return new Map();
    
    const map: Map<string, {in: number, out: number, total: number}>= new Map();
    for (const n of nodes) {
        if (n && typeof n.id === 'string') {
            map.set(n.id, { in: 0, out: 0, total: 0 });
        }
    }
    for (const e of edges) {
        if (!e) continue;
        if (typeof e.from === 'string' && map.has(e.from)) {
            const v = map.get(e.from);
            if (v) map.set(e.from, { in: v.in, out: v.out + 1, total: v.total + 1 });
        }
        if (typeof e.to === 'string' && map.has(e.to)) {
            const v = map.get(e.to);
            if (v) map.set(e.to, { in: v.in + 1, out: v.out, total: v.total + 1 });
        }
    }
    return map;
}

/**
 * Calcula score ponderado a partir de fields {field: weight}.
 * @param {Record<string, any> | null | undefined} node
 * @param {Record<string, number> | null | undefined} any>
 * @returns {number}
 */
export function weightedScore(node: Record<string, any> | null | undefined, weights: Record<string, number> | null | undefined): number {
    if (!node || !weights || typeof weights !== 'object') return 0;
    let score = 0;
    for (const [field, w] of Object.entries(weights)) {
        if (!Number.isFinite(w)) continue;
        const v = node[field];
        if (Number.isFinite(v)) score += v * w;
    }
    return score;
}

/**
 * Rankeia nodes por scoreFn(node) desc, id asc tie-break.
 * @param {Array<{id?: string} & Record<string, any>>} nodes
 * @param {(node: any) => number} scoreFn
 * @returns {ReadonlyArray<Readonly<{node: any, score: number, rank: number}>>}
 */
export function rankNodes(nodes: Array<{id?: string} & Record<string, any>>, scoreFn: (node: any) => number): ReadonlyArray<Readonly<{node: any, score: number, rank: number}>> {
    if (!Array.isArray(nodes)) return Object.freeze([]);
    if (typeof scoreFn !== 'function') return Object.freeze([]);
    const scored = nodes
        .filter((n) => n && typeof n.id === 'string')
        .map((n) => Object.freeze({ node: n, score: Number(scoreFn(n)) || 0 }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(a.node.id).localeCompare(String(b.node.id));
        })
        .map((s, idx) => Object.freeze({ ...s, rank: idx + 1 }));
    return Object.freeze(scored);
}

/**
 * Retorna top N rankeados.
 * @param {ReadonlyArray<any>} rankings
 * @param {number} n
 * @returns {ReadonlyArray<any>}
 */
export function topN(rankings: ReadonlyArray<any>, n: number): ReadonlyArray<any> {
    if (!Array.isArray(rankings)) return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 0) return Object.freeze([]);
    return Object.freeze(rankings.slice(0, n));
}

/**
 * Rankeia por degree centrality (combinador conveniente).
 * @param {Array<{id?: string} & Record<string, any>>} nodes
 * @param {Array<{from?: string, to?: string}>} edges
 * @param {'in' | 'out' | 'total'} [mode]
 */
export function rankByDegree(nodes: Array<{id?: string} & Record<string, any>>, edges: Array<{from?: string, to?: string}>, mode: 'in' | 'out' | 'total' = 'total') {
    const m = degreeCentrality(nodes, edges);
    
    const safeMode: 'in' | 'out' | 'total'= ['in', 'out', 'total'].includes(mode) ? mode : 'total';
    return rankNodes(nodes, (n) => {
        const v = m.get(n.id);
        return v ? v[safeMode] : 0;
    });
}

/**
 * Rankeia por weighted fields.
 * @param {Array<{id?: string} & Record<string, any>>} nodes
 * @param {Record<string, number> | null | undefined} weights
 */
export function rankByWeights(nodes: Array<{id?: string} & Record<string, any>>, weights: Record<string, number> | null | undefined) {
    return rankNodes(nodes, (n) => weightedScore(n, weights));
}

/**
 * Sumariza ranking.
 * @param {ReadonlyArray<{score: number}>} rankings
 */
export function summarizeRanking(rankings: ReadonlyArray<{score: number}>) {
    const empty = { count: 0, topScore: 0, bottomScore: 0, mean: 0 };
    if (!Array.isArray(rankings) || rankings.length === 0) return empty;
    const scores = rankings.map((r) => r.score);
    const sum = scores.reduce((a, b) => a + b, 0);
    return Object.freeze({
        count: rankings.length,
        topScore: scores[0],
        bottomScore: scores[scores.length - 1],
        mean: sum / rankings.length,
    });
}

/**
 * Module identity export.
 */
export const nodeRankingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.40',
    deliveredAt: '2026-05-02',
    exports: [
        'RANKING_META',
        'degreeCentrality',
        'weightedScore',
        'rankNodes',
        'topN',
        'rankByDegree',
        'rankByWeights',
        'summarizeRanking',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
