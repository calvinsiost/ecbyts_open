// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Graph Patch — Phase 1.57 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S57
 *
 * Phase 1.57 (2026-05-02) — aplicação cirúrgica de patches incrementais
 * ao grafo: add/remove/update nodes e edges sem re-computar tudo.
 * Compatível com graphDiff (1.56) — um diff invertido é um patch válido.
 *
 * NÃO depende de browser. Sem fetch/DOM/Three.js.
 * Owner: Claude (orquestrador apropriador)
 */

export type PatchOpName =
    | 'addNode'
    | 'removeNode'
    | 'updateNode'
    | 'addEdge'
    | 'removeEdge'
    | 'updateEdge';

export type PatchPayload = Readonly<Record<string, unknown>> & {
    readonly id?: string | number;
    readonly from?: string | number;
    readonly to?: string | number;
};

export interface PatchOp {
    readonly op: PatchOpName;
    readonly payload: PatchPayload;
}

export interface Patch {
    readonly ops: ReadonlyArray<PatchOp>;
    readonly size: number;
}

export type GraphNode = Readonly<Record<string, unknown>> & { readonly id?: string | number };
export type GraphEdge = Readonly<Record<string, unknown>> & {
    readonly from?: string | number;
    readonly to?: string | number;
};

export interface PatchableGraph {
    readonly nodes?: ReadonlyArray<GraphNode>;
    readonly edges?: ReadonlyArray<GraphEdge>;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PatchedGraph {
    readonly nodes: ReadonlyArray<GraphNode>;
    readonly edges: ReadonlyArray<GraphEdge>;
    readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PatchValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

export interface PatchSummary {
    readonly total: number;
    readonly byOp: Readonly<Record<string, number>>;
    readonly valid: boolean;
}

/** Identidade do módulo. */
export const GRAPH_PATCH_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.57',
    deliveredAt: '2026-05-02',
});

/** Operações canônicas de patch. */
export const PATCH_OPS: ReadonlyArray<PatchOpName> = Object.freeze([
    'addNode',
    'removeNode',
    'updateNode',
    'addEdge',
    'removeEdge',
    'updateEdge',
]);

function isPatchOpName(op: unknown): op is PatchOpName {
    return typeof op === 'string' && (PATCH_OPS as ReadonlyArray<string>).includes(op);
}

/**
 * Cria uma operação de patch frozen.
 */
export function createPatchOp(op: string, payload: unknown): PatchOp | null {
    if (!isPatchOpName(op)) return null;
    if (!payload || typeof payload !== 'object') return null;
    return Object.freeze({
        op,
        payload: Object.freeze({ ...(payload as Record<string, unknown>) }) as PatchPayload,
    });
}

/**
 * Cria um patch frozen a partir de lista de operações.
 */
export function createPatch(ops: unknown): Patch | null {
    if (!Array.isArray(ops)) return null;
    const valid = ops.filter(
        (o): o is PatchOp =>
            !!o && typeof o === 'object' && isPatchOpName((o as { op?: unknown }).op),
    );
    return Object.freeze({
        ops: Object.freeze(valid.map((o) => Object.freeze({ ...o }))),
        size: valid.length,
    });
}

type MutableNode = Record<string, unknown>;
type MutableEdge = Record<string, unknown>;

function cloneNodes(nodes?: ReadonlyArray<GraphNode>): MutableNode[] {
    return Array.isArray(nodes) ? nodes.map((n) => ({ ...(n as Record<string, unknown>) })) : [];
}

function cloneEdges(edges?: ReadonlyArray<GraphEdge>): MutableEdge[] {
    return Array.isArray(edges) ? edges.map((e) => ({ ...(e as Record<string, unknown>) })) : [];
}

function edgeKey(from: unknown, to: unknown): string {
    return `${String(from)}->${String(to)}`;
}

function applyAddNode(nodes: MutableNode[], p: PatchPayload): void {
    if (p.id !== undefined && !nodes.some((n) => n.id === p.id)) {
        nodes.push({ ...p });
    }
}

function applyRemoveNode(
    nodes: MutableNode[],
    edges: MutableEdge[],
    p: PatchPayload,
): { nodes: MutableNode[]; edges: MutableEdge[] } {
    return {
        nodes: nodes.filter((n) => n.id !== p.id),
        edges: edges.filter((e) => e.from !== p.id && e.to !== p.id),
    };
}

function applyUpdateNode(nodes: MutableNode[], p: PatchPayload): void {
    if (p.id === undefined) return;
    const idx = nodes.findIndex((n) => n.id === p.id);
    if (idx !== -1) nodes[idx] = { ...nodes[idx], ...p };
}

function applyAddEdge(edges: MutableEdge[], p: PatchPayload): void {
    const key = edgeKey(p.from, p.to);
    if (!edges.some((e) => edgeKey(e.from, e.to) === key)) {
        edges.push({ ...p });
    }
}

function applyRemoveEdge(edges: MutableEdge[], p: PatchPayload): MutableEdge[] {
    return edges.filter((e) => !(e.from === p.from && e.to === p.to));
}

function applyUpdateEdge(edges: MutableEdge[], p: PatchPayload): void {
    const idx = edges.findIndex((e) => e.from === p.from && e.to === p.to);
    if (idx !== -1) edges[idx] = { ...edges[idx], ...p };
}

/**
 * Aplica patch a um grafo. Retorna novo grafo frozen ou null em falha.
 */
export function applyPatch(graph: PatchableGraph | null | undefined, patch: Patch | null | undefined): PatchedGraph | null {
    if (!graph || typeof graph !== 'object') return null;
    if (!patch || !Array.isArray(patch.ops)) return null;

    let nodes = cloneNodes(graph.nodes);
    let edges = cloneEdges(graph.edges);

    for (const { op, payload } of patch.ops) {
        const p = payload as PatchPayload;
        if (op === 'addNode') {
            applyAddNode(nodes, p);
        } else if (op === 'removeNode') {
            const result = applyRemoveNode(nodes, edges, p);
            nodes = result.nodes;
            edges = result.edges;
        } else if (op === 'updateNode') {
            applyUpdateNode(nodes, p);
        } else if (op === 'addEdge') {
            applyAddEdge(edges, p);
        } else if (op === 'removeEdge') {
            edges = applyRemoveEdge(edges, p);
        } else if (op === 'updateEdge') {
            applyUpdateEdge(edges, p);
        }
    }

    return Object.freeze({
        nodes: Object.freeze(nodes.map((n) => Object.freeze({ ...n }))) as ReadonlyArray<GraphNode>,
        edges: Object.freeze(edges.map((e) => Object.freeze({ ...e }))) as ReadonlyArray<GraphEdge>,
        metadata: graph.metadata ? Object.freeze({ ...graph.metadata }) : Object.freeze({}),
    });
}

function findNodeById(
    nodes: ReadonlyArray<GraphNode> | undefined,
    id: unknown,
): Record<string, unknown> | undefined {
    return nodes?.find((n) => (n as Record<string, unknown>).id === id) as
        | Record<string, unknown>
        | undefined;
}

function findEdgeByEndpoints(
    edges: ReadonlyArray<GraphEdge> | undefined,
    from: unknown,
    to: unknown,
): Record<string, unknown> | undefined {
    return edges?.find(
        (e) => (e as Record<string, unknown>).from === from && (e as Record<string, unknown>).to === to,
    ) as Record<string, unknown> | undefined;
}

function invertSingleOp(
    op: PatchOpName,
    p: PatchPayload,
    originalGraph?: PatchableGraph | null,
): PatchOp | null {
    if (op === 'addNode') return createPatchOp('removeNode', { id: p.id });
    if (op === 'removeNode') {
        const orig = findNodeById(originalGraph?.nodes, p.id);
        return createPatchOp('addNode', orig ? { ...orig } : p);
    }
    if (op === 'updateNode') {
        const orig = findNodeById(originalGraph?.nodes, p.id);
        return createPatchOp('updateNode', orig ? { ...orig } : p);
    }
    if (op === 'addEdge') return createPatchOp('removeEdge', { from: p.from, to: p.to });
    if (op === 'removeEdge') {
        const orig = findEdgeByEndpoints(originalGraph?.edges, p.from, p.to);
        return createPatchOp('addEdge', orig ? { ...orig } : p);
    }
    if (op === 'updateEdge') {
        const orig = findEdgeByEndpoints(originalGraph?.edges, p.from, p.to);
        return createPatchOp('updateEdge', orig ? { ...orig } : p);
    }
    return null;
}

/**
 * Inverte patch (para undo): addNode↔removeNode, addEdge↔removeEdge,
 * updateNode/updateEdge precisam de grafo original para reconstituir.
 */
export function invertPatch(
    patch: Patch | null | undefined,
    originalGraph?: PatchableGraph | null,
): Patch | null {
    if (!patch || !Array.isArray(patch.ops)) return null;

    const inverted = patch.ops
        .map(({ op, payload }): PatchOp | null => {
            const p = payload as PatchPayload;
            return invertSingleOp(op, p, originalGraph);
        })
        .filter((x): x is PatchOp => x !== null);

    return createPatch(inverted);
}

/**
 * Valida patch: verifica se todas as ops são válidas.
 */
export function validatePatch(patch: unknown): PatchValidationResult {
    const errors: string[] = [];
    if (!patch || typeof patch !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['patch required']) });
    }
    const p = patch as { ops?: unknown };
    if (!Array.isArray(p.ops)) {
        return Object.freeze({ valid: false, errors: Object.freeze(['ops must be array']) });
    }
    for (let i = 0; i < p.ops.length; i++) {
        const op = p.ops[i] as { op?: unknown; payload?: unknown } | null | undefined;
        if (!op || !isPatchOpName(op.op)) {
            errors.push(`op[${i}]: invalid op '${String(op?.op)}'`);
        }
        if (!op?.payload || typeof op.payload !== 'object') {
            errors.push(`op[${i}]: payload required`);
        }
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Compõe múltiplos patches em sequência em um único patch.
 */
export function composePatches(patches: ReadonlyArray<Patch | null | undefined> | unknown): Patch | null {
    if (!Array.isArray(patches)) return null;
    const allOps: PatchOp[] = [];
    for (const p of patches) {
        if (p && Array.isArray((p as Patch).ops)) allOps.push(...(p as Patch).ops);
    }
    return createPatch(allOps);
}

/**
 * Sumariza patch.
 */
export function summarizePatch(patch: Patch | null | undefined): PatchSummary {
    const empty: PatchSummary = Object.freeze({
        total: 0,
        byOp: Object.freeze<Record<string, number>>({}),
        valid: false,
    });
    if (!patch || !Array.isArray(patch.ops)) return empty;
    const byOp: Record<string, number> = {};
    for (const { op } of patch.ops) {
        byOp[op] = (byOp[op] || 0) + 1;
    }
    return Object.freeze({
        total: patch.ops.length,
        byOp: Object.freeze(byOp),
        valid: validatePatch(patch).valid,
    });
}

/** Module identity export. */
export const graphPatchMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.57',
    deliveredAt: '2026-05-02',
    exports: [
        'GRAPH_PATCH_META',
        'PATCH_OPS',
        'createPatchOp',
        'createPatch',
        'applyPatch',
        'invertPatch',
        'validatePatch',
        'composePatches',
        'summarizePatch',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
