// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Graph Serialization - Phase 1.54 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S54
 *
 * Phase 1.54 (2026-05-02) - pure-logic serialização determinística do
 * grafo (nodes + edges + metadata). Suporta export JSON, GraphML-like,
 * TSV. Validação de round-trip.
 *
 * NÃO depende de browser. Sem fetch/Blob/File.
 *
 * Owner: Claude (orquestrador apropriador)
 */

type GraphNode = { id: string; [k: string]: unknown };
type GraphEdge = { from: string; to: string; [k: string]: unknown };
type GraphSpec = { nodes?: unknown; edges?: unknown; metadata?: unknown };
type NormalizedGraph = {
    nodes: ReadonlyArray<GraphNode>;
    edges: ReadonlyArray<GraphEdge>;
    metadata: Readonly<Record<string, unknown>>;
};

/** Identidade do módulo. */
export const SERIALIZATION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.54',
    deliveredAt: '2026-05-02',
});

/** Formats canônicos. */
export const FORMATS = Object.freeze(['json', 'tsv', 'graphml']);

/**
 * Verifica format canônico.
 * @param {unknown} f
 * @returns {boolean}
 */
export function isValidFormat(f: unknown): boolean {
    return typeof f === 'string' && FORMATS.includes(f);
}

/**
 * Normaliza graph para serialização.
 * @param {unknown} spec
 * @returns {NormalizedGraph | null}
 */
export function normalizeGraph(spec: unknown): NormalizedGraph | null {
    if (!spec || typeof spec !== 'object') return null;
    const s = (spec) as GraphSpec;
    const nodes = Array.isArray(s.nodes)
        ? (s.nodes.filter((n: any) => n && typeof n.id === 'string')) as GraphNode[]
        : [];
    const edges = Array.isArray(s.edges)
        ? (
              s.edges.filter((e: any) => e && typeof e.from === 'string' && typeof e.to === 'string')
          ) as GraphEdge[]
        : [];
    return (
        Object.freeze({
            nodes: Object.freeze(
                nodes
                    .slice()
                    .sort((a: GraphNode, b: GraphNode) => a.id.localeCompare(b.id))
                    .map((n: GraphNode) => Object.freeze({ ...n })),
            ),
            edges: Object.freeze(
                edges
                    .slice()
                    .sort((a: GraphEdge, b: GraphEdge) => {
                        const ka = `${a.from}->${a.to}`;
                        const kb = `${b.from}->${b.to}`;
                        return ka.localeCompare(kb);
                    })
                    .map((e: GraphEdge) => Object.freeze({ ...e })),
            ),
            metadata:
                s.metadata && typeof s.metadata === 'object'
                    ? Object.freeze({ ...(s.metadata) as Record<string, unknown> })
                    : Object.freeze({}),
        })
    ) as NormalizedGraph;
}

/**
 * Serializa para JSON string determinística.
 * @param {unknown} graph
 * @param {number} [indent=0]
 * @returns {string}
 */
export function toJSON(graph: unknown, indent: number = 0): string {
    const norm = normalizeGraph(graph);
    if (!norm) return '';
    try {
        return indent > 0 ? JSON.stringify(norm, null, indent) : JSON.stringify(norm);
    } catch {
        return '';
    }
}

/**
 * Parse JSON → graph (com validação).
 * @param {unknown} s
 * @returns {NormalizedGraph | null}
 */
export function fromJSON(s: unknown): NormalizedGraph | null {
    if (typeof s !== 'string' || !s.trim()) return null;
    try {
        const obj = JSON.parse(s);
        return normalizeGraph(obj);
    } catch {
        return null;
    }
}

/**
 * Serializa nodes/edges para TSV.
 * @param {unknown} graph
 * @returns {string}
 */
export function toTSV(graph: unknown): string {
    const norm = normalizeGraph(graph);
    if (!norm) return '';
    const nodeFields = collectFields(norm.nodes);
    const edgeFields = collectFields(norm.edges);
    const nodeHeader = '#NODES\t' + nodeFields.join('\t');
    const nodeRows = norm.nodes.map((n: GraphNode) =>
        nodeFields
            .map((f: string) => sanitizeTsv((n as Record<string, unknown>)[f]))
            .join('\t'),
    );
    const edgeHeader = '#EDGES\t' + edgeFields.join('\t');
    const edgeRows = norm.edges.map((e: GraphEdge) =>
        edgeFields
            .map((f: string) => sanitizeTsv((e as Record<string, unknown>)[f]))
            .join('\t'),
    );
    return [nodeHeader, ...nodeRows, edgeHeader, ...edgeRows].join('\n');
}

/**
 * @param {ReadonlyArray<unknown>} items
 * @returns {string[]}
 */
function collectFields(items: ReadonlyArray<unknown>): string[] {
    const set = new Set();
    for (const it of items) {
        if (it && typeof it === 'object') {
            for (const k of Object.keys((it) as object)) set.add(k);
        }
    }
    return (Array.from(set).sort()) as string[];
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function sanitizeTsv(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch {
            return '';
        }
    }
    return String(v).replace(/[\t\r\n]/g, ' ');
}

/**
 * Serializa para GraphML-like XML simplificado.
 * @param {unknown} graph
 * @returns {string}
 */
export function toGraphML(graph: unknown): string {
    const norm = normalizeGraph(graph);
    if (!norm) return '';
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<graphml>', '  <graph edgedefault="directed">'];
    for (const n of norm.nodes) {
        lines.push(`    <node id="${escapeXml(n.id)}"/>`);
    }
    for (const e of norm.edges) {
        lines.push(`    <edge source="${escapeXml(e.from)}" target="${escapeXml(e.to)}"/>`);
    }
    lines.push('  </graph>', '</graphml>');
    return lines.join('\n');
}

/**
 * @param {unknown} s
 * @returns {string}
 */
function escapeXml(s: unknown): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Despacha por format.
 * @param {unknown} graph
 * @param {string} [format='json']
 * @returns {string}
 */
export function serialize(graph: unknown, format: string = 'json'): string {
    if (!isValidFormat(format)) return '';
    switch (format) {
        case 'json':
            return toJSON(graph);
        case 'tsv':
            return toTSV(graph);
        case 'graphml':
            return toGraphML(graph);
        default:
            return '';
    }
}

/**
 * Verifica round-trip (apenas para JSON).
 * @param {unknown} graph
 * @returns {Readonly<{ valid: boolean, reason?: string, original?: string, restored?: string }>}
 */
export function verifyRoundtrip(graph: unknown): Readonly<{ valid: boolean, reason?: string, original?: string, restored?: string }> {
    const s = toJSON(graph);
    const g = fromJSON(s);
    if (!g) return Object.freeze({ valid: false, reason: 'parse failed' });
    const s2 = toJSON(g);
    return Object.freeze({ valid: s === s2, original: s, restored: s2 });
}

/**
 * Sumariza serialization.
 * @param {unknown} graph
 * @param {string} [format='json']
 * @returns {Readonly<{ format: string, bytes: number, nodes: number, edges: number }>}
 */
export function summarizeSerialization(graph: unknown, format: string = 'json'): Readonly<{ format: string, bytes: number, nodes: number, edges: number }> {
    const s = serialize(graph, format);
    const g = (graph && typeof graph === 'object' ? graph : {}) as { nodes?: unknown, edges?: unknown };
    return Object.freeze({
        format,
        bytes: typeof s === 'string' ? s.length : 0,
        nodes: Array.isArray(g.nodes) ? g.nodes.length : 0,
        edges: Array.isArray(g.edges) ? g.edges.length : 0,
    });
}

/**
 * Module identity export.
 */
export const graphSerializationMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.54',
    deliveredAt: '2026-05-02',
    exports: [
        'SERIALIZATION_META',
        'FORMATS',
        'isValidFormat',
        'normalizeGraph',
        'toJSON',
        'fromJSON',
        'toTSV',
        'toGraphML',
        'serialize',
        'verifyRoundtrip',
        'summarizeSerialization',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
