// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/groups/manager).
//
// Aplicação direta: utils/groups/manager.ts (733L) tem DEDUP entre addElementGroup
// (linhas 281-295) e addFamilyGroup (linhas 348-362) — shape idêntico de group +
// color cycling + maxOrder calc. Extração resolve dupe + libera view-mode validation.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos 8 Modules C anteriores.
//
// Spec NOT:
// - NÃO ler module state (groupState — caller passa group lists)
// - NÃO chamar generateId — caller injeta id (DI)
// - NÃO persistir/dispatchChange (side-effects — caller orquestra)
// - NÃO emoji
//
// Extracted helpers:
//   - GroupViewMode / GroupLike (canonical types)
//   - GROUP_VIEW_MODES_LIST            (frozen — SPEC_GROUP_VIEW_MODES §S1)
//   - DEFAULT_GROUP_VIEW_MODE_VALUE    (frozen = 'visual')
//   - GROUP_COLOR_PALETTE              (frozen 8 cores)
//   - nextGroupColor(groupList)        pure color cycling (DEDUP × 3 sites)
//   - nextGroupOrder(groupList)        pure maxOrder+1 (DEDUP × 2 sites)
//   - createGroupShape(id, partial, groupList)  pure factory (DEDUP element+family)
//   - resolveGroupViewMode(group)      pure view-mode resolution w/ fallback
//   - isValidGroupViewMode(mode)       allowlist guard
//   - removeGroupFromList(groups, id)  pure → new array
//   - clearMapEntriesForGroup(map, groupId)  pure map cleanup

export type GroupViewMode = 'visual' | 'form' | 'dashboard' | 'collection';

export interface GroupLike {
    id: string;
    name: string;
    color: string;
    collapsed: boolean;
    order: number;
    viewMode: GroupViewMode | string;
    [key: string]: unknown;
}

/**
 * Frozen list of valid group view modes.
 * Matches GROUP_VIEW_MODES @ groups/manager.ts:38 (SPEC_GROUP_VIEW_MODES §S1).
 */
export const GROUP_VIEW_MODES_LIST: ReadonlyArray<GroupViewMode> = Object.freeze([
    'visual',
    'form',
    'dashboard',
    'collection',
]);

/**
 * Frozen default view mode.
 * Matches DEFAULT_GROUP_VIEW_MODE @ groups/manager.ts:39.
 */
export const DEFAULT_GROUP_VIEW_MODE_VALUE: GroupViewMode = 'visual';

/**
 * Frozen color palette (8 cores Tailwind-derived).
 * Matches GROUP_COLORS @ groups/manager.ts:728.
 */
export const GROUP_COLOR_PALETTE: ReadonlyArray<string> = Object.freeze([
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
]);

/**
 * Pure color cycling: próxima cor não-usada, ou cicla por module length.
 * DEDUP: chamado por addElementGroup, addFamilyGroup, seedDefaultFamilyGroups.
 *
 * Matches _nextColor @ groups/manager.ts:730-733.
 */
export function nextGroupColor(groupList: ReadonlyArray<{ color?: string }>): string {
    const usedColors = groupList.map((g) => g.color);
    const cycled = GROUP_COLOR_PALETTE[groupList.length % GROUP_COLOR_PALETTE.length] ?? GROUP_COLOR_PALETTE[0];
    return GROUP_COLOR_PALETTE.find((c) => !usedColors.includes(c)) ?? cycled ?? '#3b82f6';
}

/**
 * Pure max order computation: maior order + 1, ou 0 se vazio.
 * DEDUP: addElementGroup + addFamilyGroup ambos fazem reduce maxOrder.
 *
 * Matches maxOrder reduce @ groups/manager.ts:282, 349.
 */
export function nextGroupOrder(groupList: ReadonlyArray<{ order?: number }>): number {
    const maxOrder = groupList.reduce((max, g) => {
        const order = Number(g.order);
        return Number.isFinite(order) ? Math.max(max, order) : max;
    }, -1);
    return maxOrder + 1;
}

/**
 * Pure factory para group shape (caller passa id + partial + groupList existente).
 * DEDUP de addElementGroup (281-290) e addFamilyGroup (348-357) — shape idêntico.
 *
 * color: usa partial.color OU nextGroupColor(groupList)
 * order: nextGroupOrder(groupList)
 */
export function createGroupShape(
    id: string,
    partial: Partial<GroupLike>,
    groupList: ReadonlyArray<GroupLike>,
): GroupLike {
    return {
        id,
        name: partial.name || 'New Group',
        color: partial.color || nextGroupColor(groupList),
        collapsed: true,
        order: nextGroupOrder(groupList),
        viewMode: DEFAULT_GROUP_VIEW_MODE_VALUE,
    };
}

/**
 * Pure view-mode resolution: valida viewMode contra allowlist, fallback default.
 *
 * Matches getGroupViewMode @ groups/manager.ts:165-168.
 */
export function resolveGroupViewMode(group: { viewMode?: string } | null | undefined): GroupViewMode {
    if (!group) return DEFAULT_GROUP_VIEW_MODE_VALUE;
    const mode = group.viewMode;
    return (GROUP_VIEW_MODES_LIST as ReadonlyArray<string>).includes(mode as string)
        ? (mode as GroupViewMode)
        : DEFAULT_GROUP_VIEW_MODE_VALUE;
}

/**
 * Validate group view mode string (allowlist).
 * Matches setGroupViewMode guard @ groups/manager.ts:178.
 */
export function isValidGroupViewMode(mode: unknown): mode is GroupViewMode {
    return typeof mode === 'string' && (GROUP_VIEW_MODES_LIST as ReadonlyArray<string>).includes(mode);
}

/**
 * Pure remove: returns new group array sem o id.
 * Matches removeElementGroup/removeFamilyGroup filter @ groups/manager.ts:313, 380.
 */
export function removeGroupFromList<T extends { id: string }>(
    groups: ReadonlyArray<T>,
    id: string,
): T[] {
    return groups.filter((g) => g.id !== id);
}

/**
 * Pure map cleanup: remove entries cujo value === groupId.
 * Returns NEW map object (não muta input).
 *
 * Matches removeElementGroup map cleanup @ groups/manager.ts:314-316.
 */
export function clearMapEntriesForGroup(
    map: Readonly<Record<string, string>>,
    groupId: string,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(map)) {
        if (val !== groupId) result[key] = val;
    }
    return result;
}

/**
 * Type-guard for GroupLike shape.
 */
export function isValidGroupShape(value: unknown): value is GroupLike {
    if (!value || typeof value !== 'object') return false;
    const g = value as GroupLike;
    if (typeof g.id !== 'string' || g.id.length === 0) return false;
    if (typeof g.name !== 'string') return false;
    return true;
}
