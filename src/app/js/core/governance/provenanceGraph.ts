// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

import {
    computeCircularLayout as _computeCircularLayout,
    escapeSvgText as _escapeSvgText,
    getNodeColorByType as _getNodeColorByType,
    truncateLabel as _truncateLabel,
} from './_provenanceSvgPure.js';

/* ================================================================
   PROVENANCE GRAPH — G9: Data lineage visualization

   Constrói um grafo de proveniência (lineage) a partir de:
   - Audit trail (G1) — quem-fez-o-quê-quando em qual recurso
   - Decision log (G6) — por que uma decisão foi tomada
   - Links refContext entre decisões e recursos

   Objetivo: responder "de onde vem esse valor?" em termos de cadeia
   sensor → lab → interpretação → decisão → relatório.

   Modelo do grafo:
   - Nodes: recursos (element, observation, campaign, decision, export)
   - Edges: relações temporais (precedes, corrects, references, exports)

   Funções puras: recebe arrays de entries, devolve { nodes, edges }.
   Não depende de IDB nem DOM — testável direto em Node.

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G9)
   ================================================================ */

interface ProvenanceNodeMeta {
    resourceId?: string | undefined;
    action?: string | undefined;
    family?: string | undefined;
    category?: string | undefined;
}

interface ProvenanceNode {
    /** Unique identifier (composed: "{type}:{entityId}") */
    id: string;
    /** Node type: 'element'|'observation'|'campaign'|'decision'|'export'|'audit' */
    type: string;
    /** Human-readable label */
    label: string;
    /** When the node was created (ISO 8601) */
    timestamp?: string | undefined;
    /** Who created it */
    actor?: string | undefined;
    /** Type-specific metadata */
    meta?: ProvenanceNodeMeta | undefined;
}

interface ProvenanceEdge {
    /** Source node id */
    from: string;
    /** Target node id */
    to: string;
    /** 'precedes'|'corrects'|'references'|'derives_from'|'exports' */
    relation: string;
}

interface ProvenanceGraph {
    nodes: ProvenanceNode[];
    edges: ProvenanceEdge[];
}

interface AuditEntry {
    id?: string;
    resourceId?: string;
    action?: string;
    timestamp?: string;
    userId?: string;
    actor?: string;
    data?: { previousVersionId?: string };
}

interface DecisionRefContext {
    type: string;
    id: string;
    label?: string;
}

interface DecisionEntry {
    id?: string;
    title?: string;
    timestamp?: string;
    actor?: string;
    category?: string;
    refContext?: DecisionRefContext;
}

interface ElementEntry {
    id?: string;
    name?: string;
    family?: string;
}

export const NODE_TYPES: ReadonlyArray<string> = Object.freeze([
    'element',
    'observation',
    'campaign',
    'decision',
    'export',
    'audit',
]);

export const EDGE_RELATIONS: ReadonlyArray<string> = Object.freeze([
    'precedes',
    'corrects',
    'references',
    'derives_from',
    'exports',
]);

/**
 * Build a node id from type + entity id.
 * @param type
 * @param entityId
 */
function _nodeId(type: string, entityId: string): string {
    return `${type}:${entityId}`;
}

/**
 * Build a provenance graph from audit entries and decision entries.
 *
 * @param input
 */
export function buildGraph(
    input: {
        auditEntries?: AuditEntry[];
        decisions?: DecisionEntry[];
        elements?: ElementEntry[];
    } = {},
): ProvenanceGraph {
    const { auditEntries = [], decisions = [], elements = [] } = input;

    if (!Array.isArray(auditEntries) || !Array.isArray(decisions) || !Array.isArray(elements)) {
        throw new Error('buildGraph: auditEntries, decisions, elements must be arrays');
    }

    const nodeMap = new Map<string, ProvenanceNode>();
    const edges: ProvenanceEdge[] = [];

    const addNode = (node: ProvenanceNode): ProvenanceNode | undefined => {
        if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, node);
        }
        return nodeMap.get(node.id);
    };

    // Step 1: elements as foundational nodes
    for (const el of elements) {
        if (!el || !el.id) continue;
        addNode({
            id: _nodeId('element', el.id),
            type: 'element',
            label: el.name || el.id,
            meta: { family: el.family },
        });
    }

    // Step 2: audit entries - one node per distinct resource touched, edges per action
    // Filtra entries inválidas ANTES do sort para evitar crash em null.timestamp
    // (gap descoberto por tests/provenance-graph.test.mjs, 2026-04-20)
    const auditSorted = [...auditEntries]
        .filter((e) => e && e.id && e.resourceId)
        .sort((a, b) => {
            const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
            const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
            return ta - tb;
        });

    /** previousAuditByResource: resourceId → last audit node id */
    const lastAuditByResource = new Map<string, string>();

    for (const entry of auditSorted) {
        if (!entry || !entry.id || !entry.resourceId) continue;

        const auditNodeId = _nodeId('audit', entry.id);
        addNode({
            id: auditNodeId,
            type: 'audit',
            label: entry.action || 'audit',
            timestamp: entry.timestamp,
            actor: entry.userId || entry.actor || 'unknown',
            meta: { action: entry.action, resourceId: entry.resourceId },
        });

        // Ensure target resource node exists (best-effort inference from action type)
        const targetType =
            entry.action && entry.action.startsWith('observation')
                ? 'observation'
                : entry.action && entry.action.startsWith('campaign')
                  ? 'campaign'
                  : entry.action && entry.action.startsWith('export')
                    ? 'export'
                    : 'element';
        const targetNodeId = _nodeId(targetType, entry.resourceId);
        addNode({
            id: targetNodeId,
            type: targetType,
            label: entry.resourceId,
            timestamp: entry.timestamp,
        });

        // Edge: audit entry derives_from the resource it touched
        edges.push({ from: auditNodeId, to: targetNodeId, relation: 'derives_from' });

        // Edge: previous audit on same resource precedes this one (timeline)
        const prev = lastAuditByResource.get(entry.resourceId);
        if (prev) {
            edges.push({ from: prev, to: auditNodeId, relation: 'precedes' });
        }
        lastAuditByResource.set(entry.resourceId, auditNodeId);

        // Edge: correct actions create a 'corrects' link
        if (entry.action && entry.action.includes('correct') && entry.data && entry.data.previousVersionId) {
            const prevVersionId = _nodeId(targetType, entry.data.previousVersionId);
            addNode({
                id: prevVersionId,
                type: targetType,
                label: entry.data.previousVersionId,
            });
            edges.push({ from: targetNodeId, to: prevVersionId, relation: 'corrects' });
        }
    }

    // Step 3: decisions as nodes; edges to referenced entities
    for (const decision of decisions) {
        if (!decision || !decision.id) continue;
        const decisionNodeId = _nodeId('decision', decision.id);
        addNode({
            id: decisionNodeId,
            type: 'decision',
            label: decision.title || decision.id,
            timestamp: decision.timestamp,
            actor: decision.actor || 'unknown',
            meta: { category: decision.category },
        });

        if (decision.refContext && decision.refContext.type && decision.refContext.id) {
            const targetNodeId = _nodeId(decision.refContext.type, decision.refContext.id);
            addNode({
                id: targetNodeId,
                type: decision.refContext.type,
                label: decision.refContext.label || decision.refContext.id,
            });
            edges.push({ from: decisionNodeId, to: targetNodeId, relation: 'references' });
        }
    }

    return {
        nodes: Array.from(nodeMap.values()),
        edges,
    };
}

/**
 * Trace the lineage of a specific resource: all audit nodes touching it,
 * plus any decisions referencing it, ordered chronologically.
 *
 * @param graph
 * @param resourceId - Raw resource id (not composed)
 */
export function traceLineage(graph: ProvenanceGraph, resourceId: string): ProvenanceNode[] {
    if (!graph || !Array.isArray(graph.nodes)) return [];
    if (!resourceId) return [];

    const matches = graph.nodes.filter((node) => {
        if (!node) return false;
        // Direct match: resource node
        if (node.id.endsWith(`:${resourceId}`)) return true;
        // Audit entry targeting this resource
        if (node.type === 'audit' && node.meta?.resourceId === resourceId) return true;
        return false;
    });

    return matches.sort((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
        return ta - tb;
    });
}

/**
 * Get all ancestors of a node (nodes that derives_from or precedes).
 * Walks the graph backwards via edges.
 *
 * @param graph
 * @param nodeId
 * @param maxDepth - Cycle safety
 */
export function getAncestors(graph: ProvenanceGraph, nodeId: string, maxDepth: number = 10): ProvenanceNode[] {
    if (!graph || !Array.isArray(graph.edges)) return [];
    const visited = new Set<string>();
    const result: ProvenanceNode[] = [];

    const walk = (currentId: string, depth: number): void => {
        if (depth >= maxDepth) return;
        if (visited.has(currentId)) return;
        visited.add(currentId);

        const incoming = graph.edges.filter(
            (e) => e.to === currentId && (e.relation === 'derives_from' || e.relation === 'precedes'),
        );
        for (const edge of incoming) {
            const parentNode = graph.nodes.find((n) => n.id === edge.from);
            if (parentNode) {
                result.push(parentNode);
                walk(edge.from, depth + 1);
            }
        }
    };

    walk(nodeId, 0);
    return result;
}

/**
 * Render a compact SVG representation of the graph (small enough to inline
 * in the governance panel). Returns a string (caller inserts into DOM).
 *
 * Layout is trivial: nodes laid out in a circle. This is a preview only -
 * a proper force-directed layout is out of scope for the client-side panel.
 *
 * @param graph
 * @param options
 * @returns SVG markup
 */
export function renderGraphSvg(
    graph: ProvenanceGraph,
    options: { width?: number; height?: number } = {},
): string {
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100" viewBox="0 0 600 100"><text x="300" y="50" text-anchor="middle" fill="#888">No provenance data</text></svg>';
    }

    const { width = 600, height = 400 } = options;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.4;
    const n = graph.nodes.length;

    const layout = _computeCircularLayout(n, cx, cy, radius);
    const positions = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((node, i) => {
        positions.set(node.id, layout[i]!); // layout dimensionado por n = nodes.length
    });

    const edgeLines = graph.edges
        .map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return '';
            const strokeColor = edge.relation === 'corrects' ? '#f44336' : '#888';
            return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${strokeColor}" stroke-width="1" opacity="0.6"/>`;
        })
        .join('');

    const nodeCircles = graph.nodes
        .map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return '';
            const color = _getNodeColorByType(node.type);
            const label = _truncateLabel(node.label, 12);
            return `
                <g>
                    <circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="6" fill="${color}" stroke="#fff" stroke-width="1"/>
                    <title>${_escapeSvgText(node.type)}: ${_escapeSvgText(node.label)}</title>
                    <text x="${pos.x.toFixed(1)}" y="${(pos.y + 18).toFixed(1)}" text-anchor="middle" font-size="10" fill="#ccc">${_escapeSvgText(label)}</text>
                </g>
            `;
        })
        .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#1a1a1a;border-radius:4px">${edgeLines}${nodeCircles}</svg>`;
}
