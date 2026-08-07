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
 * Constellation Graph Diff — Phase 1.56
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S30/S56
 *
 * Phase 1.30 (2026-05-01) — snapshot-based diff engine.
 * Phase 1.56 (2026-05-02) — adds diffGraphs/diffNode/diffEdge/summarizeDiff(description).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador)
 */

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export type GraphItem = Readonly<Record<string, unknown>> & { readonly id?: string | number };

export interface ModifiedEntry<T = GraphItem> {
    readonly id: string | number;
    readonly before: T;
    readonly after: T;
}

export interface DiffItemsResult<T = GraphItem> {
    readonly added: ReadonlyArray<T>;
    readonly removed: ReadonlyArray<T>;
    readonly modified: ReadonlyArray<ModifiedEntry<T>>;
    readonly unchanged: ReadonlyArray<T>;
}

export interface GraphSnapshot {
    readonly nodes: ReadonlyArray<GraphItem>;
    readonly edges: ReadonlyArray<GraphItem>;
    readonly timestamp: string;
    readonly label: string | null;
}

export interface SnapshotDiff {
    readonly nodes: DiffItemsResult;
    readonly edges: DiffItemsResult;
    readonly timestamp: string;
    readonly from?: string | null;
    readonly to?: string | null;
}

export interface GraphInput {
    readonly nodes?: ReadonlyArray<GraphItem>;
    readonly edges?: ReadonlyArray<GraphItem>;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GraphDiffSummary {
    readonly totalChanges: number;
    readonly hasChanges: boolean;
}

export interface GraphsDiff {
    readonly nodes: DiffItemsResult;
    readonly edges: DiffItemsResult;
    readonly summary: GraphDiffSummary;
}

export interface FieldChange {
    readonly field: string;
    readonly from: unknown;
    readonly to: unknown;
}

export interface NodeOrEdgeDiff {
    readonly type: ChangeType;
    readonly changes: ReadonlyArray<FieldChange>;
}

export interface DiffSummary {
    readonly totalAdded: number;
    readonly totalRemoved: number;
    readonly totalModified: number;
    readonly nodesAdded: number;
    readonly nodesRemoved: number;
    readonly nodesModified: number;
    readonly edgesAdded: number;
    readonly edgesRemoved: number;
    readonly edgesModified: number;
    readonly totalChanges: number;
    readonly hasChanges: boolean;
    readonly description: string;
}

/** Change types canônicos. */
export const CHANGE_TYPES: ReadonlyArray<ChangeType> = Object.freeze([
    'added',
    'removed',
    'modified',
    'unchanged',
]);

/** Identidade do módulo. */
export const GRAPH_DIFF_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.56',
    deliveredAt: '2026-05-02',
    types: CHANGE_TYPES,
});

/**
 * Verifica se change type é canônico.
 */
export function isValidChangeType(t: unknown): t is ChangeType {
    return typeof t === 'string' && (CHANGE_TYPES as ReadonlyArray<string>).includes(t);
}

/**
 * Cria snapshot frozen.
 */
export function createSnapshot(
    nodes: ReadonlyArray<GraphItem> | unknown,
    edges: ReadonlyArray<GraphItem> | unknown,
    meta: { timestamp?: string; label?: string | null } = {},
): GraphSnapshot {
    const nodeArr = Array.isArray(nodes)
        ? Object.freeze((nodes as ReadonlyArray<GraphItem>).map((n) => Object.freeze({ ...n })))
        : Object.freeze<GraphItem[]>([]);
    const edgeArr = Array.isArray(edges)
        ? Object.freeze((edges as ReadonlyArray<GraphItem>).map((e) => Object.freeze({ ...e })))
        : Object.freeze<GraphItem[]>([]);
    return Object.freeze({
        nodes: nodeArr,
        edges: edgeArr,
        timestamp: meta.timestamp || new Date().toISOString(),
        label: meta.label ?? null,
    });
}

/**
 * Detecta se 2 objetos são "shallow equal" (mesmas keys/values primitivos).
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keysA = Object.keys(ao);
    const keysB = Object.keys(bo);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
        if (ao[k] !== bo[k]) return false;
    }
    return true;
}

/**
 * Compara dois sets de items (nodes ou edges) e retorna change list.
 */
export function diffItems(
    oldItems: ReadonlyArray<GraphItem> | unknown,
    newItems: ReadonlyArray<GraphItem> | unknown,
    keyField: string = 'id',
): DiffItemsResult {
    const oldArr: ReadonlyArray<GraphItem> = Array.isArray(oldItems) ? (oldItems as ReadonlyArray<GraphItem>) : [];
    const newArr: ReadonlyArray<GraphItem> = Array.isArray(newItems) ? (newItems as ReadonlyArray<GraphItem>) : [];
    const oldMap = new Map<string | number, GraphItem>();
    const newMap = new Map<string | number, GraphItem>();
    for (const item of oldArr) {
        const key = (item as Record<string, unknown>)[keyField];
        if (item && key !== undefined) oldMap.set(key as string | number, item);
    }
    for (const item of newArr) {
        const key = (item as Record<string, unknown>)[keyField];
        if (item && key !== undefined) newMap.set(key as string | number, item);
    }
    const added: GraphItem[] = [];
    const removed: GraphItem[] = [];
    const modified: ModifiedEntry[] = [];
    const unchanged: GraphItem[] = [];
    for (const [id, newItem] of newMap.entries()) {
        if (!oldMap.has(id)) {
            added.push(newItem);
        } else {
            const oldItem = oldMap.get(id) as GraphItem;
            if (shallowEqual(oldItem, newItem)) {
                unchanged.push(newItem);
            } else {
                modified.push(Object.freeze({ id, before: oldItem, after: newItem }));
            }
        }
    }
    for (const [id, oldItem] of oldMap.entries()) {
        if (!newMap.has(id)) removed.push(oldItem);
    }
    return Object.freeze({
        added: Object.freeze([...added]),
        removed: Object.freeze([...removed]),
        modified: Object.freeze([...modified]),
        unchanged: Object.freeze([...unchanged]),
    });
}

/**
 * Compara dois snapshots completos.
 */
export function diffSnapshots(
    oldSnap: Partial<GraphSnapshot> | null | undefined,
    newSnap: Partial<GraphSnapshot> | null | undefined,
): SnapshotDiff {
    if (!oldSnap || !newSnap) {
        const empty: DiffItemsResult = Object.freeze({
            added: Object.freeze<GraphItem[]>([]),
            removed: Object.freeze<GraphItem[]>([]),
            modified: Object.freeze<ModifiedEntry[]>([]),
            unchanged: Object.freeze<GraphItem[]>([]),
        });
        return Object.freeze({
            nodes: empty,
            edges: empty,
            timestamp: new Date().toISOString(),
        });
    }
    return Object.freeze({
        nodes: diffItems(oldSnap.nodes || [], newSnap.nodes || [], 'id'),
        edges: diffItems(oldSnap.edges || [], newSnap.edges || [], 'id'),
        timestamp: new Date().toISOString(),
        from: oldSnap.label ?? null,
        to: newSnap.label ?? null,
    });
}

/**
 * Aplica diff a snapshot (forward).
 */
export function applyDiff(
    snapshot: Partial<GraphSnapshot> | null | undefined,
    diff: Partial<SnapshotDiff> | null | undefined,
): GraphSnapshot | Partial<GraphSnapshot> | null | undefined {
    if (!snapshot || !diff) return snapshot;
    const nodeMap = new Map<string | number, GraphItem>();
    const edgeMap = new Map<string | number, GraphItem>();
    for (const n of snapshot.nodes || []) {
        if (n && (n as Record<string, unknown>).id !== undefined) {
            nodeMap.set((n as Record<string, unknown>).id as string | number, n);
        }
    }
    for (const e of snapshot.edges || []) {
        if (e && (e as Record<string, unknown>).id !== undefined) {
            edgeMap.set((e as Record<string, unknown>).id as string | number, e);
        }
    }
    // Apply node changes
    for (const n of diff.nodes?.added || []) {
        const id = (n as Record<string, unknown>).id;
        if (n && id !== undefined) nodeMap.set(id as string | number, n);
    }
    for (const n of diff.nodes?.removed || []) {
        const id = (n as Record<string, unknown>).id;
        if (n && id !== undefined) nodeMap.delete(id as string | number);
    }
    for (const m of diff.nodes?.modified || []) {
        if (m && m.id !== undefined) nodeMap.set(m.id, m.after);
    }
    // Apply edge changes
    for (const e of diff.edges?.added || []) {
        const id = (e as Record<string, unknown>).id;
        if (e && id !== undefined) edgeMap.set(id as string | number, e);
    }
    for (const e of diff.edges?.removed || []) {
        const id = (e as Record<string, unknown>).id;
        if (e && id !== undefined) edgeMap.delete(id as string | number);
    }
    for (const m of diff.edges?.modified || []) {
        if (m && m.id !== undefined) edgeMap.set(m.id, m.after);
    }
    return createSnapshot([...nodeMap.values()], [...edgeMap.values()], {});
}

/**
 * Inverte um diff (added↔removed, modified before↔after).
 */
export function invertDiff(diff: Partial<SnapshotDiff> | null | undefined): SnapshotDiff | null {
    if (!diff) return null;
    const invertItems = (items: Partial<DiffItemsResult> | undefined): DiffItemsResult => ({
        added: Object.freeze([...(items?.removed || [])]),
        removed: Object.freeze([...(items?.added || [])]),
        modified: Object.freeze(
            (items?.modified || []).map((m) =>
                Object.freeze({ id: m.id, before: m.after, after: m.before }),
            ),
        ),
        unchanged: Object.freeze([...(items?.unchanged || [])]),
    });
    return Object.freeze({
        nodes: Object.freeze(invertItems(diff.nodes)),
        edges: Object.freeze(invertItems(diff.edges)),
        timestamp: new Date().toISOString(),
        from: diff.to ?? null,
        to: diff.from ?? null,
    });
}

/**
 * Reverte diff em snapshot (undo).
 */
export function revertDiff(
    snapshot: Partial<GraphSnapshot> | null | undefined,
    diff: Partial<SnapshotDiff> | null | undefined,
): GraphSnapshot | Partial<GraphSnapshot> | null | undefined {
    return applyDiff(snapshot, invertDiff(diff));
}

/**
 * Sumariza diff.
 */
export function summarizeDiff(diff: Partial<SnapshotDiff> | null | undefined): DiffSummary {
    const empty: DiffSummary = Object.freeze({
        totalAdded: 0,
        totalRemoved: 0,
        totalModified: 0,
        nodesAdded: 0,
        nodesRemoved: 0,
        nodesModified: 0,
        edgesAdded: 0,
        edgesRemoved: 0,
        edgesModified: 0,
        totalChanges: 0,
        hasChanges: false,
        description: 'No changes',
    });
    if (!diff) return empty;
    const nodes = (diff.nodes || {}) as Partial<DiffItemsResult>;
    const edges = (diff.edges || {}) as Partial<DiffItemsResult>;
    const nodesAdded = (nodes.added || []).length;
    const nodesRemoved = (nodes.removed || []).length;
    const nodesModified = (nodes.modified || []).length;
    const edgesAdded = (edges.added || []).length;
    const edgesRemoved = (edges.removed || []).length;
    const edgesModified = (edges.modified || []).length;
    const totalAdded = nodesAdded + edgesAdded;
    const totalRemoved = nodesRemoved + edgesRemoved;
    const totalModified = nodesModified + edgesModified;
    const totalChanges = totalAdded + totalRemoved + totalModified;
    const parts: string[] = [];
    if (totalAdded > 0) parts.push(`+${totalAdded}`);
    if (totalRemoved > 0) parts.push(`-${totalRemoved}`);
    if (totalModified > 0) parts.push(`~${totalModified}`);
    const description = totalChanges === 0 ? 'No changes' : parts.join(', ');
    return Object.freeze({
        totalAdded,
        totalRemoved,
        totalModified,
        nodesAdded,
        nodesRemoved,
        nodesModified,
        edgesAdded,
        edgesRemoved,
        edgesModified,
        totalChanges,
        hasChanges: totalChanges > 0,
        description,
    });
}

// ─── Phase 1.56 additions ────────────────────────────────────────────────────

/**
 * Retorna lista de {field, from, to} para dois objetos ou null se iguais.
 */
function _fieldChanges(a: GraphItem | null | undefined, b: GraphItem | null | undefined): FieldChange[] {
    const changes: FieldChange[] = [];
    if (!a || !b) return changes;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set<string>([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
        if (ao[k] !== bo[k]) changes.push(Object.freeze({ field: k, from: ao[k], to: bo[k] }));
    }
    return changes;
}

/**
 * Computa diff entre dois grafos normalizados {nodes, edges, metadata}.
 */
export function diffGraphs(
    graphA: GraphInput | null | undefined,
    graphB: GraphInput | null | undefined,
): GraphsDiff | null {
    if (!graphA || !graphB) return null;
    const nodesA = Array.isArray(graphA.nodes) ? graphA.nodes : [];
    const nodesB = Array.isArray(graphB.nodes) ? graphB.nodes : [];
    const edgesA = Array.isArray(graphA.edges) ? graphA.edges : [];
    const edgesB = Array.isArray(graphB.edges) ? graphB.edges : [];

    const nodesDiff = diffItems(nodesA, nodesB, 'id');
    const edgesDiff = diffItems(edgesA, edgesB, 'id');

    const totalChanges =
        nodesDiff.added.length +
        nodesDiff.removed.length +
        nodesDiff.modified.length +
        edgesDiff.added.length +
        edgesDiff.removed.length +
        edgesDiff.modified.length;

    return Object.freeze({
        nodes: nodesDiff,
        edges: edgesDiff,
        summary: Object.freeze({
            totalChanges,
            hasChanges: totalChanges > 0,
        }),
    });
}

/**
 * Diff de um único node (por conteúdo, não por id).
 */
export function diffNode(
    nodeA: GraphItem | null | undefined,
    nodeB: GraphItem | null | undefined,
): NodeOrEdgeDiff {
    if (!nodeA && !nodeB) return Object.freeze({ type: 'unchanged' as ChangeType, changes: Object.freeze<FieldChange[]>([]) });
    if (!nodeA) return Object.freeze({ type: 'added' as ChangeType, changes: Object.freeze<FieldChange[]>([]) });
    if (!nodeB) return Object.freeze({ type: 'removed' as ChangeType, changes: Object.freeze<FieldChange[]>([]) });
    const changes = _fieldChanges(nodeA, nodeB);
    return Object.freeze({
        type: (changes.length === 0 ? 'unchanged' : 'modified') as ChangeType,
        changes: Object.freeze(changes),
    });
}

/**
 * Diff de um único edge (por conteúdo, não por id).
 */
export function diffEdge(
    edgeA: GraphItem | null | undefined,
    edgeB: GraphItem | null | undefined,
): NodeOrEdgeDiff {
    return diffNode(edgeA, edgeB);
}

/**
 * Module identity export.
 */
export const graphDiffMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.56',
    deliveredAt: '2026-05-02',
    types: CHANGE_TYPES,
    exports: [
        'CHANGE_TYPES',
        'GRAPH_DIFF_META',
        'isValidChangeType',
        'createSnapshot',
        'shallowEqual',
        'diffItems',
        'diffSnapshots',
        'diffGraphs',
        'diffNode',
        'diffEdge',
        'applyDiff',
        'invertDiff',
        'revertDiff',
        'summarizeDiff',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
