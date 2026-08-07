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
 * graphLayoutPersistence.ts
 * CONSTELLATION_METRIC_SIZING Phase 1.60 — Graph Layout Persistence
 *
 * Serialization and restoration of graph node layout positions.
 * Pure math/logic — zero browser/DOM/Three.js/Supabase/Promise/setTimeout deps.
 */

export interface LayoutPosition {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
}

export type PositionsMap = Readonly<Record<string, LayoutPosition>>;

export interface LayoutSnapshot {
    readonly version: string;
    readonly graphId: string;
    readonly positions: PositionsMap;
    readonly createdAt: number;
    readonly nodeCount: number;
}

export interface LayoutCoverageReport {
    readonly covered: number;
    readonly total: number;
    readonly missing: ReadonlyArray<string>;
    readonly complete: boolean;
}

export interface LayoutGraphNode {
    readonly id: string;
    readonly position?: LayoutPosition;
    readonly [k: string]: unknown;
}

export interface LayoutGraph {
    readonly nodes?: ReadonlyArray<LayoutGraphNode>;
    readonly [k: string]: unknown;
}

export const LAYOUT_PERSISTENCE_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.60',
    deliveredAt: '2026-05-02',
} as const);

export const LAYOUT_VERSION = '1.0';

interface RawPositionLike {
    x: unknown;
    y: unknown;
    z?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates a frozen layout snapshot.
 */
export function createLayoutSnapshot(
    graphId: string,
    positions: Record<string, LayoutPosition | RawPositionLike>,
    createdAt: number = 0,
): LayoutSnapshot {
    if (!graphId) throw new Error('graphId is required');
    if (!isRecord(positions)) {
        throw new Error('positions must be a non-array object');
    }
    const frozenPositions: Record<string, LayoutPosition> = {};
    for (const [id, pos] of Object.entries(positions)) {
        const p = pos as RawPositionLike;
        const fp: { x: number; y: number; z?: number } = {
            x: p.x as number,
            y: p.y as number,
        };
        if (p.z !== undefined) fp.z = p.z as number;
        frozenPositions[id] = Object.freeze(fp);
    }
    return Object.freeze({
        version: LAYOUT_VERSION,
        graphId: String(graphId),
        positions: Object.freeze(frozenPositions),
        createdAt: typeof createdAt === 'number' ? createdAt : 0,
        nodeCount: Object.keys(frozenPositions).length,
    });
}

/**
 * Serializes a layout snapshot to a deterministic JSON string.
 */
export function serializeLayout(snapshot: LayoutSnapshot | null | undefined): string {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
        const sortedPositions: Record<string, LayoutPosition> = {};
        const positions = snapshot.positions || {};
        for (const key of Object.keys(positions).sort()) {
            const v = positions[key];
            if (v !== undefined) sortedPositions[key] = v;
        }
        return JSON.stringify({
            version: snapshot.version,
            graphId: snapshot.graphId,
            positions: sortedPositions,
            createdAt: snapshot.createdAt,
            nodeCount: snapshot.nodeCount,
        });
    } catch (e) {
        console.debug('[graphLayoutPersistence:serialize]', (e as Error)?.message || e);
        return '';
    }
}

/**
 * Deserializes a JSON string to a layout snapshot (with validation).
 */
export function deserializeLayout(s: string): LayoutSnapshot | null {
    if (typeof s !== 'string' || !s) return null;
    try {
        const obj = JSON.parse(s) as unknown;
        if (!isRecord(obj)) return null;
        const graphId = obj.graphId;
        const positions = obj.positions;
        if (typeof graphId !== 'string' || !graphId) return null;
        if (!isRecord(positions)) return null;
        const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : 0;
        return createLayoutSnapshot(
            graphId,
            positions as Record<string, RawPositionLike>,
            createdAt,
        );
    } catch (e) {
        console.debug('[graphLayoutPersistence:deserialize]', (e as Error)?.message || e);
        return null;
    }
}

/**
 * Applies positions from a snapshot to a graph, returning a new graph object.
 */
export function applyLayoutToGraph(
    graph: LayoutGraph | null | undefined,
    snapshot: LayoutSnapshot | null | undefined,
): LayoutGraph | null {
    if (!graph || typeof graph !== 'object') return null;
    const positions = snapshot && snapshot.positions ? snapshot.positions : {};
    const newNodes = (graph.nodes || []).map((node) => {
        const pos = positions[node.id];
        if (pos !== undefined) {
            return Object.freeze({ ...node, position: Object.freeze({ ...pos }) });
        }
        return Object.freeze({ ...node });
    });
    return Object.freeze({ ...graph, nodes: Object.freeze(newNodes) });
}

/**
 * Extracts positions from a graph (only nodes with .position).
 */
export function extractPositions(graph: LayoutGraph | null | undefined): Record<string, LayoutPosition> {
    if (!graph || !graph.nodes) return {};
    const result: Record<string, LayoutPosition> = {};
    for (const node of graph.nodes) {
        if (node.position !== undefined && node.id !== undefined) {
            result[node.id] = { ...node.position };
        }
    }
    return result;
}

/**
 * Validates whether a snapshot covers all nodes in the graph.
 */
export function validateLayoutCoverage(
    graph: LayoutGraph | null | undefined,
    snapshot: LayoutSnapshot | null | undefined,
): LayoutCoverageReport {
    if (!graph || !graph.nodes) {
        return Object.freeze({ covered: 0, total: 0, missing: Object.freeze([] as string[]), complete: false });
    }
    const positions = snapshot && snapshot.positions ? snapshot.positions : {};
    const missing: string[] = [];
    let covered = 0;
    for (const node of graph.nodes) {
        if (positions[node.id] !== undefined) {
            covered++;
        } else {
            missing.push(node.id);
        }
    }
    const total = graph.nodes.length;
    return Object.freeze({
        covered,
        total,
        missing: Object.freeze(missing),
        complete: missing.length === 0 && total > 0,
    });
}

/**
 * Interpolates positions between two snapshots using lerp at factor t (0..1).
 * Nodes only in A are kept at t=0 and absent at t=1.
 * Nodes only in B are absent at t=0 and present at t=1.
 */
export function interpolateLayouts(
    snapshotA: LayoutSnapshot | null | undefined,
    snapshotB: LayoutSnapshot | null | undefined,
    t: number,
): LayoutSnapshot {
    const tClamped = Math.max(0, Math.min(1, typeof t === 'number' ? t : 0));
    const posA = snapshotA && snapshotA.positions ? snapshotA.positions : {};
    const posB = snapshotB && snapshotB.positions ? snapshotB.positions : {};
    const keysA = new Set(Object.keys(posA));
    const keysB = new Set(Object.keys(posB));
    const result: Record<string, { x: number; y: number; z?: number }> = {};

    for (const id of keysA) {
        const a = posA[id];
        if (!a) continue;
        if (keysB.has(id)) {
            const b = posB[id];
            if (!b) continue;
            const interpolated: { x: number; y: number; z?: number } = {
                x: a.x + (b.x - a.x) * tClamped,
                y: a.y + (b.y - a.y) * tClamped,
            };
            if (a.z !== undefined || b.z !== undefined) {
                const az = a.z ?? 0;
                const bz = b.z ?? 0;
                interpolated.z = az + (bz - az) * tClamped;
            }
            result[id] = interpolated;
        } else {
            if (tClamped < 1) {
                const copy: { x: number; y: number; z?: number } = { x: a.x, y: a.y };
                if (a.z !== undefined) copy.z = a.z;
                result[id] = copy;
            }
        }
    }

    for (const id of keysB) {
        if (!keysA.has(id)) {
            const b = posB[id];
            if (b && tClamped > 0) {
                const copy: { x: number; y: number; z?: number } = { x: b.x, y: b.y };
                if (b.z !== undefined) copy.z = b.z;
                result[id] = copy;
            }
        }
    }

    const graphId = snapshotA && snapshotA.graphId
        ? snapshotA.graphId
        : snapshotB && snapshotB.graphId
            ? snapshotB.graphId
            : 'interpolated';
    return createLayoutSnapshot(graphId, result, 0);
}

export const graphLayoutPersistenceMeta = Object.freeze({
    module: 'graphLayoutPersistence',
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.60',
    exports: Object.freeze([
        'LAYOUT_PERSISTENCE_META',
        'LAYOUT_VERSION',
        'createLayoutSnapshot',
        'serializeLayout',
        'deserializeLayout',
        'applyLayoutToGraph',
        'extractPositions',
        'validateLayoutCoverage',
        'interpolateLayouts',
        'graphLayoutPersistenceMeta',
    ]),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
} as const);
