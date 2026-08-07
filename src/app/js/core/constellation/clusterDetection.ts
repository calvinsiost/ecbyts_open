// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Cluster Detection - Phase 1.8 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.8 (2026-05-01) - pure-logic helpers para detectar clusters
 * (comunidades) no grafo constellation. Complementa:
 *   - Phase 1 metricSizing (radius por métrica)
 *   - Phase 1.5 metricBinning (color ramp por bin)
 *   - Phase 1.6 graphLayout (posicionamento)
 *   - Phase 1.7 edgeMetrics (topologia básica)
 *
 * Algoritmos:
 *   - 'connected-components': cada componente conexo é um cluster
 *   - 'attribute-grouping': cluster por valor de atributo (família, tipo)
 *   - 'label-propagation': iteração simples LPA (Raghavan 2007)
 *   - 'manual': clusters explícitos fornecidos pelo caller
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { computeAdjacencyMap, computeConnectedComponents } from './edgeMetrics.js';

/** Estratégias de clustering. */
export const CLUSTER_STRATEGIES = Object.freeze({
    CONNECTED_COMPONENTS: 'connected-components',
    ATTRIBUTE_GROUPING: 'attribute-grouping',
    LABEL_PROPAGATION: 'label-propagation',
    MANUAL: 'manual',
});

/** Identidade do módulo. */
export const CLUSTER_DETECTION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.8',
    deliveredAt: '2026-05-01',
    strategies: Object.values(CLUSTER_STRATEGIES),
});

/** Build a node → cluster id lookup map from a list of clusters. */
function buildClusterByNode(clusters: Array<{ id: string; members: Array<string> }>): Map<string, string> {
    const clusterByNode = new Map<string, string>();
    for (const c of clusters) {
        for (const m of c.members) clusterByNode.set(m, c.id);
    }
    return clusterByNode;
}

/**
 * Cluster por componentes conexos.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @returns {{clusters: Array<{id: string, members: Array<string>}>, clusterByNode: Map<string, string>}}
 */
export function clusterByConnectedComponents(
    nodes: Array<{ id: string }>,
    edges: Array<{ source: string; target: string }>,
): { clusters: Array<{ id: string; members: Array<string>; size: number }>; clusterByNode: Map<string, string> } {
    const adj = computeAdjacencyMap(nodes, edges);
    const components = computeConnectedComponents(Array.isArray(nodes) ? nodes : [], adj);
    const clusters = components.map((members: string[], i: number) => ({
        id: `cluster-cc-${i}`,
        members: [...members],
        size: members.length,
    }));
    const clusterByNode = buildClusterByNode(clusters);
    return { clusters, clusterByNode };
}

/**
 * Cluster por atributo de nó (e.g., family, type, level).
 *
 * @param {Array<Object>} nodes - nodes com `id` + atributo selecionado
 * @param {string} attribute - chave do atributo
 * @returns {{clusters: Array<{id: string, members: Array<string>, value: *}>, clusterByNode: Map<string, string>}}
 */
export function clusterByAttribute(
    nodes: Array<object>,
    attribute: string,
): {
    clusters: Array<{ id: string; members: Array<string>; value: any; size: number }>;
    clusterByNode: Map<string, string>;
} {
    const buckets = new Map<string, string[]>();
    if (!Array.isArray(nodes) || !attribute) {
        return { clusters: [], clusterByNode: new Map() };
    }
    const attr = String(attribute);
    for (const node of nodes) {
        const n = node as Record<string, any>;
        if (!n || n.id == null) continue;
        const value = n[attr];
        const key = value == null ? '__unknown__' : String(value);
        if (!buckets.has(key)) buckets.set(key, []);
        (buckets.get(key) as string[]).push(String(n.id));
    }
    const clusters = [...buckets.entries()].map(([value, members], i) => ({
        id: `cluster-${attr}-${i}`,
        members,
        value: value === '__unknown__' ? null : value,
        size: members.length,
    }));
    const clusterByNode = buildClusterByNode(clusters);
    return { clusters, clusterByNode };
}

function resolveMaxIterations(optMax: number | undefined): number {
    return Number.isInteger(optMax) && optMax !== undefined && optMax > 0 ? optMax : 20;
}

function initLabels(adj: Map<string, Set<string>>): Map<string, string> {
    const labels = new Map<string, string>();
    for (const id of adj.keys()) labels.set(id, id);
    return labels;
}

function countNeighborLabels(neighbors: Set<string>, labels: Map<string, string>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const n of neighbors) {
        const l = labels.get(n);
        if (l === undefined) continue;
        counts.set(l, (counts.get(l) || 0) + 1);
    }
    return counts;
}

function pickBestLabel(counts: Map<string, number>, currentLabel: string): string {
    let bestLabel = currentLabel;
    const sortedEntries = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]));
    });
    const top = sortedEntries[0];
    if (top) {
        const [label] = top;
        bestLabel = label;
    }
    return bestLabel;
}

function runLabelPropagation(
    adj: Map<string, Set<string>>,
    labels: Map<string, string>,
    maxIterations: number,
): { iterations: number; converged: boolean } {
    let iter = 0;
    let converged = false;
    for (; iter < maxIterations; iter++) {
        let anyChange = false;
        const ids = [...adj.keys()].sort();
        for (const id of ids) {
            const neighbors = adj.get(id);
            if (!(neighbors instanceof Set) || neighbors.size === 0) continue;
            const counts = countNeighborLabels(neighbors, labels);
            const currentLabel = labels.get(id);
            const bestLabel = pickBestLabel(counts, currentLabel === undefined ? id : currentLabel);
            if (labels.get(id) !== bestLabel) {
                labels.set(id, bestLabel);
                anyChange = true;
            }
        }
        if (!anyChange) {
            converged = true;
            break;
        }
    }
    return { iterations: iter + (converged ? 1 : 0), converged };
}

function collectLabelsByCluster(labels: Map<string, string>): Map<string, string[]> {
    const buckets = new Map<string, string[]>();
    for (const [id, label] of labels) {
        if (!buckets.has(label)) buckets.set(label, []);
        (buckets.get(label) as string[]).push(id);
    }
    return buckets;
}

function buildClustersFromBuckets(
    buckets: Map<string, string[]>,
    prefix: string,
): Array<{ id: string; label: string; members: string[]; size: number }> {
    return [...buckets.entries()].map(([label, members], i) => ({
        id: `${prefix}-${i}`,
        label,
        members,
        size: members.length,
    }));
}

/**
 * Label Propagation Algorithm (LPA) simplificado.
 * Cada nó adota o label mais frequente entre seus vizinhos.
 * Iterações: até convergência ou maxIterations.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @param {Object} [options]
 * @param {number} [options.maxIterations=20]
 * @returns {{clusters: any[], clusterByNode: Map<string, string>, iterations: number, converged: boolean}}
 */
export function clusterByLabelPropagation(
    nodes: Array<{ id: string }>,
    edges: Array<{ source: string; target: string }>,
    options: { maxIterations?: number } = {},
): { clusters: any[]; clusterByNode: Map<string, string>; iterations: number; converged: boolean } {
    const adj = computeAdjacencyMap(nodes, edges);
    const maxIterations = resolveMaxIterations(options.maxIterations);
    const labels = initLabels(adj);
    const { iterations, converged } = runLabelPropagation(adj, labels, maxIterations);
    const buckets = collectLabelsByCluster(labels);
    const clusters = buildClustersFromBuckets(buckets, 'cluster-lpa');
    const clusterByNode = buildClusterByNode(clusters);
    return { clusters, clusterByNode, iterations, converged };
}

/**
 * Cluster manual a partir de mapa explícito.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Map<string, string> | Object} mapping - id → clusterName
 * @returns {{clusters: any[], clusterByNode: Map<string, string>}}
 */
export function clusterByManual(
    nodes: Array<{ id: string }>,
    mapping: Map<string, string> | object,
): { clusters: any[]; clusterByNode: Map<string, string> } {
    const map = mapping instanceof Map ? mapping : new Map(Object.entries(mapping || {}));
    const buckets = new Map<string, string[]>();
    if (!Array.isArray(nodes)) return { clusters: [], clusterByNode: new Map() };
    for (const node of nodes) {
        const nd = node as Record<string, any>;
        if (!nd || nd.id == null) continue;
        const id = String(nd.id);
        const cluster = map.get(id) || '__unassigned__';
        if (!buckets.has(cluster)) buckets.set(cluster, []);
        (buckets.get(cluster) as string[]).push(id);
    }
    const clusters = [...buckets.entries()].map(([name, members], i) => ({
        id: `cluster-manual-${i}`,
        name: name === '__unassigned__' ? null : name,
        members,
        size: members.length,
    }));
    const clusterByNode = buildClusterByNode(clusters);
    return { clusters, clusterByNode };
}

/**
 * Sumário estatístico de clusters.
 *
 * @param {Array<{members: any[]}>} clusters
 * @returns {{count: number, totalNodes: number, sizes: Array<number>, largestSize: number, smallestSize: number, avgSize: number}}
 */
export function summarizeClusters(clusters: Array<{ members: any[] }>): {
    count: number;
    totalNodes: number;
    sizes: Array<number>;
    largestSize: number;
    smallestSize: number;
    avgSize: number;
} {
    if (!Array.isArray(clusters) || clusters.length === 0) {
        return {
            count: 0,
            totalNodes: 0,
            sizes: [],
            largestSize: 0,
            smallestSize: 0,
            avgSize: 0,
        };
    }
    const sizes = clusters.map((c) => (Array.isArray(c.members) ? c.members.length : 0));
    const totalNodes = sizes.reduce((a, b) => a + b, 0);
    return {
        count: clusters.length,
        totalNodes,
        sizes,
        largestSize: Math.max(...sizes),
        smallestSize: Math.min(...sizes),
        avgSize: totalNodes / clusters.length,
    };
}

/**
 * Module identity export.
 */
export const clusterDetectionMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.8',
    deliveredAt: '2026-05-01',
    strategies: Object.values(CLUSTER_STRATEGIES),
    exports: [
        'CLUSTER_STRATEGIES',
        'CLUSTER_DETECTION_META',
        'clusterByConnectedComponents',
        'clusterByAttribute',
        'clusterByLabelPropagation',
        'clusterByManual',
        'summarizeClusters',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
