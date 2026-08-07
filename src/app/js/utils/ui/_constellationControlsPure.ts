// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Wave QQQ4 (Tier B per MONOLITH_IMPACT_ANALYSIS_2026_05_27).
// Pure-logic extraction from utils/ui/constellationControls.js
// (densidade seam 10.0/100L — Tier B hidden gem #4, fecha onda QQQ).
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller monta painel)
// - NÃO ler i18n (caller resolve labels)
// - NÃO ler window.* / callbacks (caller wireia integração)
// - NÃO emoji
//
// Extracted helpers:
//   - LAYOUT_MODES / VIEW_MODES_KEYS / METRIC_OPTIONS   (frozen catalogs)
//   - escapeXml                (XML/SVG attribute-safe escape)
//   - applyLayerFilter         (edge layer filter, pure)
//   - calculateGraphSummary    (nodes/edges/clusters heuristic, pure)
//   - exportGraphToSvg         (graph → SVG string, pure)
//   - resolveMetricOption      (find by key + fallback to default)
//   - isValidLayoutMode        (type-guard)

export type LayoutMode = 'force' | 'hierarchical' | 'spatial' | 'circular';
export type ViewModeKey = '2d' | '3d' | 'split';

export interface MetricOption {
    key: string;
    field: string;
    label: string;
}

export interface MetricSizingResolved {
    enabled: boolean;
    metric: string;
    metricField: string;
    label: string;
}

export interface GraphEdgeLike {
    layer?: string;
    source?: unknown;
    target?: unknown;
    sourceX?: number;
    sourceY?: number;
    targetX?: number;
    targetY?: number;
}

export interface GraphNodeLike {
    x?: number;
    y?: number;
    radius?: number;
    color?: string;
    name?: string;
}

export interface GraphLike {
    nodes?:
        | Map<unknown, GraphNodeLike>
        | ReadonlyArray<GraphNodeLike>
        | { size?: number; values?: () => Iterable<GraphNodeLike> };
    edges?: ReadonlyArray<GraphEdgeLike>;
    stats?: { nodeCount?: number; edgeCount?: number };
}

export interface GraphSummary {
    nodes: number;
    edges: number;
    clusters: number;
}

/** Frozen layout modes in canonical order. */
export const LAYOUT_MODES: ReadonlyArray<LayoutMode> = Object.freeze([
    'force',
    'hierarchical',
    'spatial',
    'circular',
] as const);

/** Frozen view mode keys. */
export const VIEW_MODES_KEYS: ReadonlyArray<ViewModeKey> = Object.freeze(['2d', '3d', 'split'] as const);

/** Frozen metric options catalog. */
export const METRIC_OPTIONS: ReadonlyArray<MetricOption> = Object.freeze([
    { key: 'violations', field: 'violationScore', label: 'Violations' },
    { key: 'observation_count', field: 'obsCount', label: 'Observations' },
    { key: 'eis_score', field: 'eisScore', label: 'EIS score' },
    { key: 'connectivity', field: 'degree', label: 'Connections' },
    { key: 'uncertainty_aggregated', field: 'uncertainty', label: 'Uncertainty' },
    { key: 'uniform', field: 'degree', label: 'Uniform' },
] as const);

/**
 * XML/SVG attribute-safe escape (5-char minimum: & < > " ').
 * Note: 4-char variant in legacy code; we add &apos; for safety in attributes.
 */
export function escapeXml(str: unknown): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Filter edges by active layers.
 * Empty/missing activeLayers → returns []. Non-array edges → returns [].
 */
export function applyLayerFilter(
    edges: ReadonlyArray<GraphEdgeLike> | null | undefined,
    activeLayers: ReadonlyArray<string> | null | undefined,
): GraphEdgeLike[] {
    if (!Array.isArray(edges)) return [];
    if (!Array.isArray(activeLayers) || activeLayers.length === 0) return [];
    const set = new Set(activeLayers);
    return edges.filter((e) => e != null && typeof e === 'object' && typeof e.layer === 'string' && set.has(e.layer));
}

/**
 * Resolve a metric option by key. Falls back to METRIC_OPTIONS[0] if unknown.
 * `enabled` flag is gated by metric !== 'uniform' (uniform = sizing off).
 */
export function resolveMetricOption(
    key: string | null | undefined,
    enabled: boolean = true,
    catalog: ReadonlyArray<MetricOption> = METRIC_OPTIONS,
): MetricSizingResolved {
    const safe = Array.isArray(catalog) && catalog.length > 0 ? catalog : METRIC_OPTIONS;
    const found = safe.find((opt) => opt.key === key) || safe[0]!;
    return {
        enabled: enabled === true && found.key !== 'uniform',
        metric: found.key,
        metricField: found.field,
        label: found.label,
    };
}

/**
 * Calculate graph summary: nodes, edges, clusters (heuristic).
 * Clusters heuristic: isolated nodes + ceil(connected/5).
 */
export function calculateGraphSummary(graph: GraphLike | null | undefined): GraphSummary {
    if (!graph || typeof graph !== 'object') return { nodes: 0, edges: 0, clusters: 0 };
    const nodes = graph.nodes;
    let nodeCount = 0;
    if (typeof graph.stats?.nodeCount === 'number') {
        nodeCount = graph.stats.nodeCount;
    } else if (nodes && typeof (nodes as { size?: number }).size === 'number') {
        nodeCount = (nodes as { size: number }).size;
    } else if (Array.isArray(nodes)) {
        nodeCount = nodes.length;
    }
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const edgeCount = typeof graph.stats?.edgeCount === 'number' ? graph.stats.edgeCount : edges.length;
    let clusters: number;
    if (edges.length > 0) {
        const connected = new Set<unknown>();
        for (const e of edges) {
            if (e?.source != null) connected.add(e.source);
            if (e?.target != null) connected.add(e.target);
        }
        const isolated = Math.max(0, nodeCount - connected.size);
        clusters = isolated + Math.max(1, Math.ceil(connected.size / 5));
    } else {
        clusters = nodeCount;
    }
    return { nodes: nodeCount, edges: edgeCount, clusters };
}

/**
 * Convert a graph-like object to an SVG string.
 * Defaults: 800×600 viewport, nodes laid out in 10-col grid if (x,y) missing.
 * Pure: no DOM, no document; output is a serializable string.
 */
export function exportGraphToSvg(graph: GraphLike | null | undefined): string {
    if (!graph || typeof graph !== 'object' || !graph.nodes) return '<svg></svg>';
    let nodeList: GraphNodeLike[] = [];
    const nodes = graph.nodes;
    if (Array.isArray(nodes)) {
        nodeList = nodes as GraphNodeLike[];
    } else if (typeof (nodes as { values?: () => Iterable<GraphNodeLike> }).values === 'function') {
        try {
            nodeList = Array.from((nodes as { values: () => Iterable<GraphNodeLike> }).values());
        } catch (e) {
            console.debug('[constellationPure:exportSvg]', (e as Error)?.message || e);
            nodeList = [];
        }
    }
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const width = 800;
    const height = 600;
    const parts: string[] = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push('  <rect width="100%" height="100%" fill="transparent"/>');
    for (const e of edges) {
        const sx = e.sourceX ?? 100;
        const sy = e.sourceY ?? 100;
        const tx = e.targetX ?? 200;
        const ty = e.targetY ?? 200;
        parts.push(
            `  <line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#90A4AE" stroke-width="1" opacity="0.6"/>`,
        );
    }
    nodeList.forEach((n, i) => {
        const x = n.x ?? 100 + (i % 10) * 60;
        const y = n.y ?? 100 + Math.floor(i / 10) * 60;
        const r = n.radius ?? 8;
        const color = n.color ?? '#4FC3F7';
        parts.push(`  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`);
        if (n.name) {
            parts.push(
                `  <text x="${x}" y="${y + r + 12}" text-anchor="middle" font-size="10" fill="#E0E0E0">${escapeXml(n.name)}</text>`,
            );
        }
    });
    parts.push('</svg>');
    return parts.join('\n');
}

/** Type-guard for LayoutMode. */
export function isValidLayoutMode(value: unknown): value is LayoutMode {
    return value === 'force' || value === 'hierarchical' || value === 'spatial' || value === 'circular';
}

/** Type-guard for ViewModeKey. */
export function isValidViewMode(value: unknown): value is ViewModeKey {
    return value === '2d' || value === '3d' || value === 'split';
}
