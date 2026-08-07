// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Wave (Tier B per MONOLITH_IMPACT_ANALYSIS_2026_05_27).
// Pure-logic extraction from utils/ui/customizeModal.js
// (densidade seam 14.8/100L — Tier B hidden gem #2).
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller mantém DOM-handling)
// - NÃO ler i18n (caller resolve labels para toasts)
// - NÃO ler/escrever localStorage (caller usa setHomeCards)
// - NÃO emoji
//
// Extracted helpers:
//   - reindexOrder        (in-place + return new array variant)
//   - swapCards           (immutable swap of two cards by index)
//   - applyVisibilityGuard (ensures ≥1 non-customize visible AND customize=true)
//   - normalizeCardConfig (project to { id, visible, order } shape)

export interface HomeCardConfigEntry {
    id: string;
    visible?: boolean;
    order?: number;
}

/**
 * Reindex card order to match array position (in-place mutation variant).
 * Used after swap/insert/remove to maintain canonical order = position.
 */
export function reindexOrderInPlace(config: HomeCardConfigEntry[]): HomeCardConfigEntry[] {
    if (!Array.isArray(config)) return [];
    for (let i = 0; i < config.length; i++) {
        const item = config[i];
        if (item) item.order = i;
    }
    return config;
}

/**
 * Immutable version — returns new array with reindexed `order`.
 * Caller decides between in-place and immutable variant.
 */
export function reindexOrder(config: ReadonlyArray<HomeCardConfigEntry>): HomeCardConfigEntry[] {
    if (!Array.isArray(config)) return [];
    return config.map((c, i) => ({ ...c, order: i }));
}

/**
 * Immutable swap of two cards by indices.
 * Returns new array; original untouched.
 * Out-of-bounds → returns input copy (no swap).
 */
export function swapCards(
    config: ReadonlyArray<HomeCardConfigEntry>,
    indexA: number,
    indexB: number,
): HomeCardConfigEntry[] {
    if (!Array.isArray(config)) return [];
    const out = [...config];
    if (
        !Number.isFinite(indexA) ||
        !Number.isFinite(indexB) ||
        indexA < 0 ||
        indexB < 0 ||
        indexA >= out.length ||
        indexB >= out.length ||
        indexA === indexB
    ) {
        return out;
    }
    const a = out[indexA];
    const b = out[indexB];
    if (!a || !b) return out;
    out[indexA] = b;
    out[indexB] = a;
    return out;
}

/**
 * Move a card up (direction=-1) or down (direction=+1) by one position.
 * Pure variant of UI's _moveCard helper — caller handles re-render after.
 */
export function moveCardByDirection(
    config: ReadonlyArray<HomeCardConfigEntry>,
    index: number,
    direction: -1 | 1,
): HomeCardConfigEntry[] {
    if (!Array.isArray(config)) return [];
    if (!Number.isFinite(index) || index < 0 || index >= config.length) return [...config];
    if (direction !== -1 && direction !== 1) return [...config];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= config.length) return [...config];
    const swapped = swapCards(config, index, newIndex);
    return reindexOrder(swapped);
}

/**
 * Visibility guard: ensures ≥1 non-customize card visible AND
 * customize card always visible. Immutable transformation.
 *
 * Rules:
 *   - If no non-customize visible: re-enable the first non-customize.
 *   - The 'customize' card is always forced visible.
 */
export function applyVisibilityGuard(
    config: ReadonlyArray<HomeCardConfigEntry>,
): HomeCardConfigEntry[] {
    if (!Array.isArray(config)) return [];
    const out = config.map((c) => ({ ...c }));
    // Guard: at least 1 non-customize visible
    const visibleNonCustomize = out.filter((c) => c.id !== 'customize' && c.visible);
    if (visibleNonCustomize.length === 0 && out.length > 1) {
        const first = out.find((c) => c.id !== 'customize');
        if (first) first.visible = true;
    }
    // Force customize visible
    const customizeCard = out.find((c) => c.id === 'customize');
    if (customizeCard) customizeCard.visible = true;
    return out;
}

/**
 * Project full card config to canonical persistence shape.
 * Strips extra keys, keeps only {id, visible, order}.
 */
export function normalizeCardConfig(
    config: ReadonlyArray<HomeCardConfigEntry>,
): Array<{ id: string; visible: boolean; order: number }> {
    if (!Array.isArray(config)) return [];
    return config.map((c) => ({
        id: c.id,
        visible: c.visible !== false,
        order: typeof c.order === 'number' ? c.order : 0,
    }));
}

/**
 * Compose guard + normalize for save path.
 * Caller invokes setHomeCards(prepareForSave(config)).
 */
export function prepareForSave(
    config: ReadonlyArray<HomeCardConfigEntry>,
): Array<{ id: string; visible: boolean; order: number }> {
    return normalizeCardConfig(applyVisibilityGuard(config));
}
