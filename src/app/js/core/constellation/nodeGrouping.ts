// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Constellation Node Grouping - Phase 1.37 (P3)
// Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S37
//
// Phase 1.37 (2026-05-01) - pure-logic agrupamento manual de nodes em
// super-nodes (grupos colapsáveis). Diferente de clusterDetection.js (1.8)
// que computa clusters automaticamente: aqui usuário define grupos
// explicitamente via createGroup, mergeGroups, splitGroup.
//
// Modelo:
//   - Group: { id, label, nodeIds:Set<string>, meta:object }
//   - GroupRegistry: Map<groupId, Group>
//   - Node pode pertencer a no máximo 1 grupo (membership exclusiva)
//
// NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
//
// Owner: Claude (orquestrador apropriador)

export interface NodeGroup {
    id: string;
    label: string;
    nodeIds: Set<string>;
    meta: Record<string, unknown>;
}

export type GroupRegistry = Map<string, NodeGroup>;

export const NODE_GROUPING_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.37',
    deliveredAt: '2026-05-01',
} as const;

export type NodeGroupingMeta = (typeof NODE_GROUPING_META)[keyof typeof NODE_GROUPING_META];

function ensureRegistry(reg: unknown): GroupRegistry {
    if (!(reg instanceof Map)) throw new TypeError('registry must be a Map');
    return reg as GroupRegistry;
}

function normalizeIds(nodeIds: unknown): string[] {
    if (!nodeIds) return [];
    if (nodeIds instanceof Set) return Array.from(nodeIds) as string[];
    if (Array.isArray(nodeIds)) return nodeIds.slice() as string[];
    throw new TypeError('nodeIds must be Array or Set');
}

export function createRegistry(): GroupRegistry {
    return new Map();
}

export function findGroupOfNode(registry: unknown, nodeId: string): string | null {
    const reg = ensureRegistry(registry);
    for (const [gid, g] of reg) {
        if (g.nodeIds.has(nodeId)) return gid;
    }
    return null;
}

export function createGroup(
    registry: unknown,
    opts: { id: string; label?: string; nodeIds: unknown; meta?: Record<string, unknown> },
): NodeGroup {
    const reg = ensureRegistry(registry);
    if (!opts || typeof opts !== 'object') throw new TypeError('opts required');
    const { id, label = '', meta = {} } = opts;
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error('group id must be non-empty string');
    }
    if (reg.has(id)) {
        throw new Error(`group id already exists: ${id}`);
    }
    const ids = normalizeIds(opts.nodeIds);
    // remove nodes de grupos anteriores (membership exclusiva)
    for (const nid of ids) {
        const prev = findGroupOfNode(reg, nid);
        if (prev !== null) {
            const prevGroup = reg.get(prev);
            if (prevGroup) prevGroup.nodeIds.delete(nid);
        }
    }
    const group: NodeGroup = {
        id,
        label: typeof label === 'string' ? label : '',
        nodeIds: new Set(ids),
        meta: meta && typeof meta === 'object' ? { ...meta } : {},
    };
    reg.set(id, group);
    return group;
}

export function ungroup(registry: unknown, groupId: string): string[] {
    const reg = ensureRegistry(registry);
    const g = reg.get(groupId);
    if (!g) return [];
    const released = Array.from(g.nodeIds);
    reg.delete(groupId);
    return released;
}

export function mergeGroups(
    registry: unknown,
    groupIds: string[],
    opts: { id: string; label?: string; meta?: Record<string, unknown> },
): NodeGroup {
    const reg = ensureRegistry(registry);
    if (!Array.isArray(groupIds) || groupIds.length < 2) {
        throw new Error('mergeGroups requires at least 2 group ids');
    }
    if (!opts || typeof opts.id !== 'string' || opts.id.length === 0) {
        throw new Error('opts.id required');
    }
    const allNodes: string[] = [];
    for (const gid of groupIds) {
        const g = reg.get(gid);
        if (!g) throw new Error(`group not found: ${gid}`);
        for (const nid of g.nodeIds) allNodes.push(nid);
    }
    // remove antigos antes de criar (evita colisão se opts.id reutiliza um)
    for (const gid of groupIds) reg.delete(gid);
    return createGroup(reg, {
        id: opts.id,
        label: opts.label || '',
        nodeIds: allNodes,
        meta: opts.meta || {},
    });
}

export function splitGroup(
    registry: unknown,
    groupId: string,
    extractIds: unknown,
    opts: { id: string; label?: string; meta?: Record<string, unknown> },
): { original: NodeGroup | null; extracted: NodeGroup } {
    const reg = ensureRegistry(registry);
    const original = reg.get(groupId);
    if (!original) throw new Error(`group not found: ${groupId}`);
    if (!opts || typeof opts.id !== 'string' || opts.id.length === 0) {
        throw new Error('opts.id required');
    }
    const ids = normalizeIds(extractIds);
    const actuallyIn = ids.filter((id: string) => original.nodeIds.has(id));
    if (actuallyIn.length === 0) {
        throw new Error('no extractIds belong to the source group');
    }
    for (const nid of actuallyIn) original.nodeIds.delete(nid);
    const extracted = createGroup(reg, {
        id: opts.id,
        label: opts.label || '',
        nodeIds: actuallyIn,
        meta: opts.meta || {},
    });
    let originalRef: NodeGroup | null = original;
    if (original.nodeIds.size === 0) {
        reg.delete(groupId);
        originalRef = null;
    }
    return { original: originalRef, extracted };
}

export function summarizeGroups(registry: unknown): {
    count: number;
    totalGroupedNodes: number;
    avgSize: number;
    largest: { id: string; size: number } | null;
    smallest: { id: string; size: number } | null;
} {
    const reg = ensureRegistry(registry);
    const groups = Array.from(reg.values());
    const sizes = groups.map((g: NodeGroup) => g.nodeIds.size);
    const total = sizes.reduce((a: number, b: number) => a + b, 0);
    const count = groups.length;
    let largest: { id: string; size: number } | null = null;
    let smallest: { id: string; size: number } | null = null;
    if (count > 0 && groups[0]) {
        let lg: NodeGroup = groups[0];
        let sm: NodeGroup = groups[0];
        for (const g of groups) {
            if (g.nodeIds.size > lg.nodeIds.size) lg = g;
            if (g.nodeIds.size < sm.nodeIds.size) sm = g;
        }
        largest = { id: lg.id, size: lg.nodeIds.size };
        smallest = { id: sm.id, size: sm.nodeIds.size };
    }
    return {
        count,
        totalGroupedNodes: total,
        avgSize: count > 0 ? total / count : 0,
        largest,
        smallest,
    };
}