// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/report/manager).
//
// utils/report/manager.ts (745L) tem folder tree ops (depth, subtree collection,
// parent filter) como lógica de árvore pura. Extração libera teste isolado +
// reuso por report/tree.js (renderização de árvore).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 15º Module C da campanha.
//
// Spec NOT:
// - NÃO ler module state (folders/reports — caller passa arrays)
// - NÃO chamar _nextId/_persist (side-effects — caller orquestra)
// - NÃO emoji
//
// Extracted helpers:
//   - FolderLike (canonical type)
//   - DEFAULT_MAX_FOLDER_DEPTH        (frozen)
//   - computeFolderDepth(folders, parentId, maxDepth)  pure (0 = root)
//   - collectFolderSubtree(folders, rootId)            pure BFS (inclui root)
//   - getChildFolders(folders, parentId)               pure filter
//   - getRootFolders(folders)                          pure filter
//   - canAddAtDepth(folders, parentId, maxDepth)       pure depth guard

export interface FolderLike {
    id: string;
    name: string;
    parentId: string | null;
    [key: string]: unknown;
}

/** Frozen default profundidade máxima de aninhamento de pastas. */
export const DEFAULT_MAX_FOLDER_DEPTH = 5;

/**
 * Compute folder depth (0 = root). Sobe a cadeia de parentId.
 * Safety break em maxDepth+1 para evitar loop infinito em dados corrompidos.
 *
 * Matches _getFolderDepth @ report/manager.ts:349-360.
 */
export function computeFolderDepth(
    folders: ReadonlyArray<FolderLike>,
    parentId: string | null,
    maxDepth: number = DEFAULT_MAX_FOLDER_DEPTH,
): number {
    let depth = 0;
    let current = parentId;
    while (current !== null) {
        const parent = folders.find((f) => f.id === current);
        if (!parent) break;
        current = parent.parentId;
        depth++;
        if (depth > maxDepth + 1) break; // safety
    }
    return depth;
}

/**
 * Collect folder subtree IDs via BFS (inclui o root).
 * Retorna Set de IDs de rootId + todos descendentes.
 *
 * Matches removeFolder subtree collection @ report/manager.ts:392-398.
 */
export function collectFolderSubtree(folders: ReadonlyArray<FolderLike>, rootId: string): Set<string> {
    const collected = new Set<string>();
    const queue: string[] = [rootId];
    while (queue.length > 0) {
        const fId = queue.shift()!;
        collected.add(fId);
        for (const f of folders) {
            if (f.parentId === fId) queue.push(f.id);
        }
    }
    return collected;
}

/**
 * Get child folders of a parent (non-recursive).
 * Matches getChildFolders @ report/manager.ts:332-334.
 */
export function getChildFolders(folders: ReadonlyArray<FolderLike>, parentId: string | null): FolderLike[] {
    return folders.filter((f) => f.parentId === parentId);
}

/**
 * Get root folders (parentId === null).
 * Matches getRootFolders @ report/manager.ts:324-326.
 */
export function getRootFolders(folders: ReadonlyArray<FolderLike>): FolderLike[] {
    return folders.filter((f) => f.parentId === null);
}

/**
 * Check whether a new folder can be added under parentId without exceeding maxDepth.
 * Returns true se a nova pasta (depth+1) está dentro do limite.
 *
 * Matches addFolder depth guard @ report/manager.ts:373-374.
 */
export function canAddAtDepth(
    folders: ReadonlyArray<FolderLike>,
    parentId: string | null,
    maxDepth: number = DEFAULT_MAX_FOLDER_DEPTH,
): boolean {
    const depth = computeFolderDepth(folders, parentId, maxDepth) + 1;
    return depth <= maxDepth;
}

/**
 * Type-guard for FolderLike shape.
 */
export function isValidFolder(value: unknown): value is FolderLike {
    if (!value || typeof value !== 'object') return false;
    const f = value as FolderLike;
    if (typeof f.id !== 'string' || f.id.length === 0) return false;
    return 'parentId' in f;
}
