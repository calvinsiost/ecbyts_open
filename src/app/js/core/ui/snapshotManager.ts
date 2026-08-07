// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-79 - Snapshot / Version Manager (pure-logic, zero DOM).
 *
 * Versionamento de snapshots de modelo, similar a Git tags simples.
 * Cada snapshot referencia um parentId formando uma DAG (na verdade
 * arvore, ja que parent eh sempre o currentSnapshotId no momento do
 * create). Estados sao frozen - toda mutacao retorna novo state.
 */

const DEFAULT_MAX = 100;

export interface Snapshot {
    id: string;
    label: string;
    description: string;
    parentId: string | null;
    createdAt: number;
    authorId: string;
    authorName: string;
    modelHash: string;
    sizeBytes: number;
    tags: readonly string[];
}

export interface SnapshotInput {
    id?: unknown;
    label?: string;
    description?: string;
    modelHash?: unknown;
    authorId?: string;
    authorName?: string;
    sizeBytes?: unknown;
    tags?: unknown;
}

export interface SnapshotState {
    snapshots: Map<string, Readonly<Snapshot>>;
    currentSnapshotId: string | null;
    draftDirty: boolean;
    maxSnapshots: number;
}

export interface SnapshotStateOptions {
    maxSnapshots?: number;
}

export interface SnapshotSummary {
    total: number;
    current: string | null;
    dirty: boolean;
    tagBreakdown: Readonly<Record<string, number>>;
    oldestAt: number | null;
    newestAt: number | null;
}

interface SnapshotPatch {
    currentSnapshotId?: string | null;
    draftDirty?: boolean;
}

/**
 * Cria estado vazio do snapshot manager.
 */
export function createSnapshotState(opts: SnapshotStateOptions = {}): Readonly<SnapshotState> {
    const requestedMax = opts.maxSnapshots;
    const maxSnapshots =
        typeof requestedMax === 'number' && Number.isFinite(requestedMax) && requestedMax > 0
            ? requestedMax
            : DEFAULT_MAX;
    return Object.freeze({
        snapshots: new Map<string, Readonly<Snapshot>>(),
        currentSnapshotId: null,
        draftDirty: false,
        maxSnapshots,
    });
}

function freezeSnapshot(s: Snapshot): Readonly<Snapshot> {
    return Object.freeze({
        ...s,
        tags: Object.freeze([...s.tags]),
    });
}

function reframe(
    state: Readonly<SnapshotState>,
    mutator: (next: Map<string, Readonly<Snapshot>>) => SnapshotPatch | void,
): Readonly<SnapshotState> {
    const next = new Map(state.snapshots);
    const patch = mutator(next) || {};
    return Object.freeze({
        snapshots: next,
        currentSnapshotId: 'currentSnapshotId' in patch ? (patch.currentSnapshotId ?? null) : state.currentSnapshotId,
        draftDirty: 'draftDirty' in patch ? !!patch.draftDirty : state.draftDirty,
        maxSnapshots: state.maxSnapshots,
    });
}

/**
 * Cria novo snapshot. parentId = currentSnapshotId.
 * @throws se id duplicado, faltarem campos obrigatorios ou maxSnapshots atingido
 */
export function createSnapshot(
    state: Readonly<SnapshotState>,
    input: SnapshotInput,
    now: number = Date.now(),
): Readonly<SnapshotState> {
    if (!input || typeof input.id !== 'string' || !input.id) {
        throw new Error('snapshot id required');
    }
    if (state.snapshots.has(input.id)) {
        throw new Error(`snapshot id duplicate: ${input.id}`);
    }
    if (typeof input.modelHash !== 'string' || !input.modelHash) {
        throw new Error('modelHash required');
    }
    if (state.snapshots.size >= state.maxSnapshots) {
        throw new Error(`maxSnapshots reached: ${state.maxSnapshots}`);
    }
    const snap = freezeSnapshot({
        id: input.id,
        label: input.label || '',
        description: input.description || '',
        parentId: state.currentSnapshotId,
        createdAt: now,
        authorId: input.authorId || '',
        authorName: input.authorName || '',
        modelHash: input.modelHash,
        sizeBytes: Number.isFinite(input.sizeBytes) ? Number(input.sizeBytes) : 0,
        tags: Array.isArray(input.tags)
            ? [...new Set(input.tags.filter((tag): tag is string => typeof tag === 'string'))]
            : [],
    });
    return reframe(state, (next) => {
        next.set(snap.id, snap);
        return { currentSnapshotId: snap.id, draftDirty: false };
    });
}

/**
 * Define currentSnapshotId. Throw se inexistente.
 */
export function restoreSnapshot(state: Readonly<SnapshotState>, snapshotId: string): Readonly<SnapshotState> {
    if (!state.snapshots.has(snapshotId)) {
        throw new Error(`snapshot not found: ${snapshotId}`);
    }
    return reframe(state, () => ({ currentSnapshotId: snapshotId, draftDirty: false }));
}

/**
 * Adiciona tag ao snapshot (dedup).
 */
export function tagSnapshot(state: Readonly<SnapshotState>, snapshotId: string, tag: string): Readonly<SnapshotState> {
    const snap = state.snapshots.get(snapshotId);
    if (!snap) throw new Error(`snapshot not found: ${snapshotId}`);
    if (typeof tag !== 'string' || !tag) throw new Error('tag required');
    if (snap.tags.includes(tag)) return state;
    return reframe(state, (next) => {
        next.set(snapshotId, freezeSnapshot({ ...snap, tags: [...snap.tags, tag] }));
    });
}

/**
 * Remove tag.
 */
export function untagSnapshot(
    state: Readonly<SnapshotState>,
    snapshotId: string,
    tag: string,
): Readonly<SnapshotState> {
    const snap = state.snapshots.get(snapshotId);
    if (!snap) throw new Error(`snapshot not found: ${snapshotId}`);
    if (!snap.tags.includes(tag)) return state;
    return reframe(state, (next) => {
        next.set(snapshotId, freezeSnapshot({ ...snap, tags: snap.tags.filter((t) => t !== tag) }));
    });
}

/**
 * Remove snapshot. Throw se ativo OU se tem children.
 */
export function deleteSnapshot(state: Readonly<SnapshotState>, snapshotId: string): Readonly<SnapshotState> {
    if (!state.snapshots.has(snapshotId)) {
        throw new Error(`snapshot not found: ${snapshotId}`);
    }
    if (state.currentSnapshotId === snapshotId) {
        throw new Error(`cannot delete active snapshot: ${snapshotId}`);
    }
    if (getChildren(state, snapshotId).length > 0) {
        throw new Error(`cannot delete snapshot with children: ${snapshotId}`);
    }
    return reframe(state, (next) => {
        next.delete(snapshotId);
    });
}

/**
 * Marca/desmarca draft sujo.
 */
export function markDraftDirty(state: Readonly<SnapshotState>, dirty: unknown): Readonly<SnapshotState> {
    const v = !!dirty;
    if (state.draftDirty === v) return state;
    return reframe(state, () => ({ draftDirty: v }));
}

export function getCurrentSnapshot(state: Readonly<SnapshotState>): Readonly<Snapshot> | null {
    if (!state.currentSnapshotId) return null;
    return state.snapshots.get(state.currentSnapshotId) || null;
}

export function getChildren(state: Readonly<SnapshotState>, parentId: string | null): Readonly<Snapshot>[] {
    const out: Readonly<Snapshot>[] = [];
    for (const s of state.snapshots.values()) {
        if (s.parentId === parentId) out.push(s);
    }
    return out;
}

/**
 * Ancestrais ordenados root -> parent (excludes self).
 */
export function getAncestors(state: Readonly<SnapshotState>, snapshotId: string): Readonly<Snapshot>[] {
    const snap = state.snapshots.get(snapshotId);
    if (!snap) return [];
    const chain: Readonly<Snapshot>[] = [];
    let cur = snap.parentId ? state.snapshots.get(snap.parentId) || null : null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.push(cur);
        cur = cur.parentId ? state.snapshots.get(cur.parentId) || null : null;
    }
    return chain.reverse();
}

/**
 * Descendentes recursivos (DFS pre-order).
 */
export function getDescendants(state: Readonly<SnapshotState>, snapshotId: string): Readonly<Snapshot>[] {
    const out: Readonly<Snapshot>[] = [];
    const visit = (id: string): void => {
        for (const child of getChildren(state, id)) {
            out.push(child);
            visit(child.id);
        }
    };
    visit(snapshotId);
    return out;
}

/**
 * Ancestral comum mais proximo entre A e B (LCA). null se nenhum.
 */
export function findCommonAncestor(state: Readonly<SnapshotState>, idA: string, idB: string): string | null {
    if (!state.snapshots.has(idA) || !state.snapshots.has(idB)) return null;
    const ancestorsA = new Set([idA, ...getAncestors(state, idA).map((s) => s.id)]);
    if (ancestorsA.has(idB)) return idB;
    let cur = state.snapshots.get(idB) || null;
    while (cur) {
        if (ancestorsA.has(cur.id)) return cur.id;
        cur = cur.parentId ? state.snapshots.get(cur.parentId) || null : null;
    }
    return null;
}

export function getSnapshotsByTag(state: Readonly<SnapshotState>, tag: string): Readonly<Snapshot>[] {
    const out: Readonly<Snapshot>[] = [];
    for (const s of state.snapshots.values()) {
        if (s.tags.includes(tag)) out.push(s);
    }
    return out;
}

/**
 * Remove snapshots > ageMs E !current E !tag 'pinned' E !tem children.
 */
export function pruneOlderThan(
    state: Readonly<SnapshotState>,
    ageMs: number,
    now: number = Date.now(),
): Readonly<SnapshotState> {
    const cutoff = now - ageMs;
    const toDelete: string[] = [];
    for (const s of state.snapshots.values()) {
        if (s.id === state.currentSnapshotId) continue;
        if (s.tags.includes('pinned')) continue;
        if (s.createdAt > cutoff) continue;
        if (getChildren(state, s.id).length > 0) continue;
        toDelete.push(s.id);
    }
    if (toDelete.length === 0) return state;
    return reframe(state, (next) => {
        for (const id of toDelete) next.delete(id);
    });
}

/**
 * Resumo agregado.
 */
export function summarizeSnapshots(state: Readonly<SnapshotState>): Readonly<SnapshotSummary> {
    const tagBreakdown: Record<string, number> = Object.create(null) as Record<string, number>;
    let oldestAt: number | null = null;
    let newestAt: number | null = null;
    for (const s of state.snapshots.values()) {
        for (const t of s.tags) {
            tagBreakdown[t] = (tagBreakdown[t] || 0) + 1;
        }
        if (oldestAt === null || s.createdAt < oldestAt) oldestAt = s.createdAt;
        if (newestAt === null || s.createdAt > newestAt) newestAt = s.createdAt;
    }
    return Object.freeze({
        total: state.snapshots.size,
        current: state.currentSnapshotId,
        dirty: state.draftDirty,
        tagBreakdown: Object.freeze(tagBreakdown),
        oldestAt,
        newestAt,
    });
}
