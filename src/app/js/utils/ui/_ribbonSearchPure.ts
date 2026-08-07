// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — ribbon.ts (top toolbar, 740L).
// Pure-logic extraction from src/app/js/utils/ui/ribbon.ts (canonical .ts).
//
// Read from canonical TS source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Primeira extração para ribbon.ts (toolbar superior).
//
// Spec NOT:
// - NÃO ler DOM (caller monta search bar + filtros)
// - NÃO ler localStorage direto (caller persiste com builder)
// - NÃO emoji
//
// Extracted helpers:
//   - DD_SEARCH_MIN_ITEMS                (frozen 5)
//   - RIBBON_SECTION_STORAGE_PREFIX      (frozen 'ecbyts-dd-more-')
//   - normalizeRibbonSearch              (lowercase + NFD diacritic strip)
//   - buildRibbonSectionStorageKey       (sectionId → storage key)
//   - matchesRibbonQuery                 (haystack contains normalized needle)
//   - shouldEnableRibbonSearch           (item count ≥ threshold)

/** Minimum number of items before a dropdown gets an inline search bar. */
export const DD_SEARCH_MIN_ITEMS = 5;

/** Prefix for localStorage keys persisting dropdown section collapse state. */
export const RIBBON_SECTION_STORAGE_PREFIX = 'ecbyts-dd-more-';

/**
 * Normalize a search query string for diacritic-insensitive matching.
 *   - Lowercase
 *   - NFD decompose
 *   - Strip combining diacritical marks (U+0300..U+036F)
 *
 * Caller uses this on BOTH the query AND the haystack before substring match,
 * so 'açao' matches 'AÇÃO' and vice-versa.
 *
 * Matches _normalizeSearch @ ribbon.ts:155.
 */
export function normalizeRibbonSearch(s: string | null | undefined): string {
    if (typeof s !== 'string') return '';
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/**
 * Build a localStorage key for persisting a ribbon dropdown section's collapse state.
 *   sectionId='campaigns' → 'ecbyts-dd-more-campaigns'
 *
 * Empty / non-string sectionId → falls back to prefix-only (callers should guard).
 */
export function buildRibbonSectionStorageKey(sectionId: unknown): string {
    if (typeof sectionId !== 'string') return RIBBON_SECTION_STORAGE_PREFIX;
    return `${RIBBON_SECTION_STORAGE_PREFIX}${sectionId}`;
}

/**
 * Check whether a haystack string contains a (pre-normalized) query.
 *   - Empty/undefined query → true (passthrough — caller toggled filter off)
 *   - Empty/undefined haystack → false
 *
 * IMPORTANT: caller must pre-normalize BOTH inputs via normalizeRibbonSearch.
 * Returning a boolean keeps this synchronous, allocation-free, and unit-testable.
 */
export function matchesRibbonQuery(
    normalizedHaystack: string | null | undefined,
    normalizedQuery: string | null | undefined,
): boolean {
    if (typeof normalizedQuery !== 'string' || !normalizedQuery) return true;
    if (typeof normalizedHaystack !== 'string' || !normalizedHaystack) return false;
    return normalizedHaystack.includes(normalizedQuery);
}

/**
 * Decide whether a dropdown should render its inline search bar.
 *   itemCount ≥ DD_SEARCH_MIN_ITEMS → true
 *   Below threshold or invalid count → false
 *
 * Matches inline check at ribbon.ts:176 (`if (itemCount < DD_SEARCH_MIN_ITEMS) return null;`).
 */
export function shouldEnableRibbonSearch(itemCount: unknown): boolean {
    return Number.isFinite(itemCount) && (itemCount as number) >= DD_SEARCH_MIN_ITEMS;
}

/**
 * Decide whether a section should be visually expanded based on persisted state.
 *   stored === '1'   → true (expanded)
 *   anything else    → false (collapsed, default)
 *
 * Matches the policy at ribbon.ts:334 (`expanded = (localStorage.getItem(key) || '') === '1';`).
 * Persisted as opt-in expansion: default UX is collapsed.
 */
export function isRibbonSectionExpanded(storedValue: string | null | undefined): boolean {
    return storedValue === '1';
}
