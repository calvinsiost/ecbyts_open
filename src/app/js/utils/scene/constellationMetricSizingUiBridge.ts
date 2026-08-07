// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/*
 * CONSTELLATION METRIC SIZING UI BRIDGE
 *
 * Browser-facing adapter for the pure constellation Phase 1.29-1.32 helpers.
 * It keeps renderers thin: semantic zoom decides visibility, focus mode
 * decides opacity, and graph diff produces a compact UI status line.
 */

import { resolveLodConfig, filterNodesByZoom, filterEdgesByZoom } from '../../core/constellation/semanticZoom.js';
import { computeFocusState, computeOpacityMap, summarizeFocus } from '../../core/constellation/focusMode.js';
import { createSnapshot, diffSnapshots, summarizeDiff } from '../../core/constellation/graphDiff.js';

const DEFAULT_METRIC_FIELD = '_lodImportance';
const DEFAULT_SIZING_BOUNDS_BY_LEVEL = Object.freeze({
    0: Object.freeze({ min: 14, max: 28 }),
    1: Object.freeze({ min: 9, max: 22 }),
    2: Object.freeze({ min: 6, max: 15 }),
    3: Object.freeze({ min: 4, max: 10 }),
    default: Object.freeze({ min: 5, max: 18 }),
});

/** @param {any} value @param {number} [fallback] */
function _finiteNumber(value: any, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

/** @param {any} node @param {any} metricField */
function _nodeImportance(node: any, metricField: any) {
    if (!node) return 0;
    return _finiteNumber(
        node[metricField],
        _finiteNumber(node.importance, _finiteNumber(node.degree, _finiteNumber(node.obsCount, node.radius || 0))),
    );
}

/** @param {any} node @param {any} metricField */
function _metricValue(node: any, metricField: any) {
    if (!node) return 0;
    return _finiteNumber(
        node[metricField],
        _finiteNumber(node.metrics?.[metricField], _finiteNumber(node.degree, _finiteNumber(node.obsCount, 0))),
    );
}

/** @param {any} node @param {any} [config] */
function _boundsForNode(node: any, config: any = {}) {
    const levelKey = Number.isFinite(node?.level) ? node.level : 'default';
    const configured = (config as any).boundsByLevel?.[levelKey] || (config as any).boundsByLevel?.default;
    const map = (DEFAULT_SIZING_BOUNDS_BY_LEVEL as Record<string|number, {min:number,max:number}>);
    return configured || map[levelKey] || map.default;
}

/** @param {any[]} values */
function _percentileByValue(values: any) {
    const sorted = [...values].filter(Number.isFinite).sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
    if (sorted.length === 0) return new Map();
    const maxIndex = Math.max(sorted.length - 1, 1);
    const ranks = new Map();
    sorted.forEach((value, index) => {
        if (!ranks.has(value)) ranks.set(value, index / maxIndex);
    });
    return ranks;
}

/** @param {any[]} nodes @param {any} metricField @param {any} [metricSizing] */
function _applyMetricSizing(nodes: any, metricField: any, metricSizing: any = {}) {
    if ((metricSizing as any).enabled === false) return nodes;
    const values = nodes.map((/** @type {any} */ node: any) => _metricValue(node, metricField));
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length === 0) return nodes;
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    if (min === max) return nodes;

    const percentileByValue = _percentileByValue(finiteValues);
    return nodes.map((/** @type {any} */ node: any, /** @type {number} */ index: any) => {
        if (node.isObservation) return node;
        const value = values[index];
        const percentile = percentileByValue.get(value) ?? 0;
        const bounds = _boundsForNode(node, metricSizing);
        const radius = bounds.min + percentile * (bounds.max - bounds.min);
        return Object.freeze({
            ...node,
            radius: Math.max(_finiteNumber(node.radius, bounds.min), radius),
            _metricSizing: Object.freeze({
                enabled: true,
                metric: metricSizing.metric || metricField,
                metricField,
                value,
                percentile,
            }),
        });
    });
}

/** @param {any} line @param {number} index */
function _normalizeLine(line: any, index: any) {
    const source = line?.fromNodeId || line?.edge?.sourceId || line?.edge?.source || line?.source || line?.from?.id;
    const target = line?.toNodeId || line?.edge?.targetId || line?.edge?.target || line?.target || line?.to?.id;
    const type = line?.edge?.type || line?.type || '';
    const id = line?.id || line?.edge?.id || `${source || 'unknown'}->${target || 'unknown'}:${type || index}`;
    return { id, source, target, type, line, index };
}

/** @param {any[]} nodes */
function _snapshotNodes(nodes: any) {
    return nodes.map((/** @type {any} */ node: any) => ({
        id: node.id,
        x: _finiteNumber(node.x),
        y: _finiteNumber(node.y),
        radius: _finiteNumber(node.radius),
        level: node.level ?? null,
        degree: node.degree ?? null,
        status: node.status ?? null
    }));
}

/** @param {any[]} edges */
function _snapshotEdges(edges: any) {
    return edges.map((/** @type {any} */ edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type
    }));
}

function _formatStatus(/** @type {any} */ {
    lod,
    focusSummary,
    diffSummary,
    focusedNodeId,
    metricSizing
}: any) {
    const parts = [
        `LOD ${lod.level}: ${lod.visibleNodes}/${lod.totalNodes} nodes, ${lod.visibleEdges}/${lod.totalEdges} edges`,
    ];
    if (metricSizing?.enabled !== false) {
        parts.push(`metric ${metricSizing.label || metricSizing.metric || metricSizing.metricField}`);
    }
    if (focusedNodeId) {
        parts.push(`focus ${focusedNodeId}: ${focusSummary.focusedCount} hot, ${focusSummary.dimmedCount} dimmed`);
    }
    if (diffSummary.hasChanges) {
        parts.push(
            `diff ${diffSummary.totalChanges}: +${diffSummary.nodesAdded}/-${diffSummary.nodesRemoved}/~${diffSummary.nodesModified} nodes`,
        );
    }
    return parts.join(' | ');
}

/**
 * Build the UI-ready constellation render payload.
 *
 * @param {{nodes?: Array<any>, lines?: Array<any>, zoom?: number, focusedNodeId?: string|null, previousSnapshot?: any, metricField?: string, metricSizing?: any, label?: string}} [input]
 * @returns {Object}
 */
export function buildConstellationMetricSizingUiState(input: any = {}): Record<string, any> {
    const sourceNodes = Array.isArray(input.nodes) ? input.nodes : [];
    const sourceLines = Array.isArray(input.lines) ? input.lines : [];
    const zoom = (Number.isFinite(input.zoom) ? input.zoom : 1 as number);
    const requestedMetricField = input.metricField || 'degree';
    const metricSizing = input.metricSizing || { enabled: false, metric: requestedMetricField };
    const focusedNodeId = input.focusedNodeId || null;
    const lodConfig = resolveLodConfig(zoom);

    const enrichedNodes = _applyMetricSizing(
        sourceNodes.map((/** @type {any} */ node: any) => ({
            ...node,
            [DEFAULT_METRIC_FIELD]: _nodeImportance(node, requestedMetricField)
        })),
        requestedMetricField,
        metricSizing,
    );
    const normalizedEdges = sourceLines.map(_normalizeLine).filter((/** @type {any} */ edge: any) => edge.source && edge.target);

    const focusState = focusedNodeId
        ? computeFocusState(focusedNodeId, enrichedNodes, normalizedEdges, { maxHops: 2 })
        : Object.fromEntries(enrichedNodes.filter((/** @type {any} */ node: any) => node.id).map((/** @type {any} */ node: any) => [node.id, 'focused']));
    const opacityMap = (computeOpacityMap(focusState) as Record<string, number>);

    const lodNodes = filterNodesByZoom(enrichedNodes, zoom, { metricField: DEFAULT_METRIC_FIELD });
    const visibleNodeIds = new Set(lodNodes.map((/** @type {any} */ node: any) => node.id));
    for (const node of enrichedNodes) {
        if (node.isCenter || node.id === focusedNodeId) visibleNodeIds.add(node.id);
    }

    const visibleNodes = enrichedNodes
        .filter((/** @type {any} */ node: any) => visibleNodeIds.has(node.id))
        .map((/** @type {any} */ node: any) => {
            const opacity = _finiteNumber(opacityMap[node.id], 1);
            return Object.freeze({
                ...node,
                radius: Math.max(_finiteNumber(node.radius, 1), lodConfig.minNodeSize || 0),
                _uiOpacity: opacity,
                _focusLevel: focusState[node.id] || 'focused',
                _lodLevel: lodConfig.level,
                _lodShowLabel: lodConfig.showLabels,
            });
        });

    const lodEdges = filterEdgesByZoom(normalizedEdges, zoom);
    const visibleEdges = lodEdges
        .filter((/** @type {any} */ edge: any) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
        .map((/** @type {any} */ edge: any) => {
            const sourceOpacity = _finiteNumber(opacityMap[edge.source], 1);
            const targetOpacity = _finiteNumber(opacityMap[edge.target], 1);
            const from = visibleNodes.find((/** @type {any} */ node: any) => node.id === edge.source);
            const to = visibleNodes.find((/** @type {any} */ node: any) => node.id === edge.target);
            return Object.freeze({
                ...edge.line,
                id: edge.id,
                fromNodeId: edge.source,
                toNodeId: edge.target,
                from,
                to,
                _uiOpacity: Math.min(sourceOpacity, targetOpacity),
                _lodEdgeOpacity: lodConfig.edgeOpacity,
            });
        });

    const snapshot = createSnapshot(_snapshotNodes(sourceNodes), _snapshotEdges(normalizedEdges), {
        label: input.label || 'constellation-ui',
    });
    const diff = input.previousSnapshot ? diffSnapshots(input.previousSnapshot, snapshot) : null;
    const diffSummary = summarizeDiff(diff);
    const focusSummary = summarizeFocus(focusState);
    const lod = Object.freeze({
        level: lodConfig.level,
        showLabels: lodConfig.showLabels,
        showEdges: lodConfig.showEdges,
        edgeOpacity: lodConfig.edgeOpacity,
        totalNodes: sourceNodes.length,
        visibleNodes: visibleNodes.length,
        totalEdges: normalizedEdges.length,
        visibleEdges: visibleEdges.length,
    });
    const nodeUiById = Object.freeze(
        Object.fromEntries(
            visibleNodes.map((/** @type {any} */ node: any) => [
                node.id,
                Object.freeze({
                    lodLevel: node._lodLevel,
                    focusLevel: node._focusLevel,
                    opacity: node._uiOpacity,
                    visibleLabel: node._lodShowLabel && !node.suppressLabel,
                }),
            ]),
        ),
    );

    return Object.freeze({
        nodes: Object.freeze(visibleNodes),
        lines: Object.freeze(visibleEdges),
        lod,
        focusState: Object.freeze({ ...focusState }),
        focusSummary,
        diff,
        diffSummary,
        snapshot,
        nodeUiById,
        metricSizing: Object.freeze({
            enabled: (metricSizing as any).enabled !== false,
            metric: (metricSizing as any).metric || requestedMetricField,
            metricField: requestedMetricField,
            label: (metricSizing as any).label || (metricSizing as any).metric || requestedMetricField,
        }),
        statusText: _formatStatus({ lod, focusSummary, diffSummary, focusedNodeId, metricSizing }),
    });
}

export const constellationMetricSizingUiBridgeMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '2-ui-bridge',
    surfaced: Object.freeze(['semanticZoom', 'LOD', 'focusMode', 'graphDiff']),
});
