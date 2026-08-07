// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LIBRARY SEEN INDICATOR — SPEC_LIBRARY_VISUAL_INDICATORS_9_69

   UI components + localStorage persistence for seen/unseen/updated
   tracking in the Library.

   States:
   - unseen  → blue solid dot
   - seen    → green solid dot
   - cleared → empty (no dot)
   - updated → blue dot + refresh icon (seen before but new version)
   ================================================================ */


import { t } from '../../i18n/translations.js';
// eslint-disable-next-line
import { escapeHtml } from '../../helpers/html.js';

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------

const STORAGE_PREFIX = 'ecbyts-library-seen';

/** @param {any} userId */
function _storageKey(userId: any) {
    return `${STORAGE_PREFIX}-${userId || 'anonymous'}`;
}

function _getUserId() {
    // MVP: try window currentUser or fallback to anonymous
    if (typeof window !== 'undefined' && (window as any).__ecbtUser?.id) {
        return (window as any).__ecbtUser.id;
    }
    return 'anonymous';
}

/** @param {any} userId */
function _loadState(userId: any) {
    try {
        const raw = localStorage.getItem(_storageKey(userId) || '');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.itemStates) {
                return parsed;
            }
        }
    } catch (err: any) {
        console.debug('[seenIndicator] loadState error', err?.message || err);
    }
    return { lastSeenAt: null, itemStates: {} };
}

/** @param {any} userId @param {any} state */
function _saveState(userId: any, state: any) {
    try {
        localStorage.setItem(_storageKey(userId), JSON.stringify(state));
    } catch (err: any) {
        console.debug('[seenIndicator] saveState error', err?.message || err);
    }
}

// ----------------------------------------------------------------
// DOM Components
// ----------------------------------------------------------------

/**
 * SeenIndicator - coloured dot with optional tooltip and pulse.
 *
 * @param {object} opts
 * @param {'unseen'|'seen'|'cleared'|'updated'} opts.state
 * @param {'sm'|'md'|'lg'} [opts.size='md']
 * @param {boolean} [opts.animate=false]
 * @param {string} [opts.tooltipText='']
 * @returns {HTMLElement|null}
 */
export function SeenIndicator({
    state,
    size = 'md',
    animate = false,
    tooltipText = ''
}: any): HTMLElement|null {
    if (state === 'cleared') return null;

    const sizes = { sm: 8, md: 12, lg: 16 };
    const px = (sizes as any)[size] || sizes.md;

    const wrapper = document.createElement('span');
    wrapper.className = 'seen-indicator';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.position = 'relative';
    wrapper.style.width = `${px}px`;
    wrapper.style.height = `${px}px`;
    wrapper.style.flexShrink = '0';

    const dot = document.createElement('span');
    dot.className = `seen-dot seen-dot--${state}`;
    if (animate) dot.classList.add('seen-dot--pulse');
    dot.style.width = `${px}px`;
    dot.style.height = `${px}px`;
    dot.style.borderRadius = '50%';
    dot.style.display = 'inline-block';

    if (state === 'updated') {
        dot.style.position = 'relative';
        const refresh = document.createElement('span');
        refresh.className = 'seen-dot-refresh';
        refresh.textContent = '\u21bb'; // clockwise open circle arrow (no emoji)
        refresh.style.position = 'absolute';
        refresh.style.top = '50%';
        refresh.style.left = '50%';
        refresh.style.transform = 'translate(-50%, -50%)';
        refresh.style.fontSize = `${Math.max(px - 2, 6)}px`;
        refresh.style.lineHeight = '1';
        refresh.style.color = '#fff';
        dot.appendChild(refresh);
    }

    wrapper.appendChild(dot);

    if (tooltipText) {
        wrapper.classList.add('seen-indicator--tooltip');
        wrapper.setAttribute('aria-label', tooltipText);
        wrapper.setAttribute('title', tooltipText);
    }

    return wrapper;
}

/**
 * CategoryBadge - numeric unread badge.
 *
 * @param {number} count
 * @returns {HTMLElement|null}
 */
export function CategoryBadge(count: any): HTMLElement|null {
    if (!count || count <= 0) return null;

    const badge = document.createElement('span');
    badge.className = 'library-category-badge';
    badge.textContent = String(count);
    badge.setAttribute('aria-label', t('library.badge.unseenCount', { count }));
    return badge;
}

// ----------------------------------------------------------------
// State API
// ----------------------------------------------------------------

/**
 * Mark a single item as seen.
 * @param {string} itemId
 * @param {string} [itemUpdatedAt] - ISO date for future update detection
 * @returns {{ status: 'seen', seenAt: string }}
 */
export function markAsSeen(itemId: any, itemUpdatedAt: any): { status: 'seen', seenAt: string } {
    const userId = _getUserId();
    const state = _loadState(userId);
    const now = new Date().toISOString();
    state.itemStates[itemId] = {
        status: 'seen',
        seenAt: now,
        itemUpdatedAt: itemUpdatedAt || null,
    };
    state.lastSeenAt = now;
    _saveState(userId, state);
    return state.itemStates[itemId];
}

/**
 * Mark all provided items as seen.
 * @param {Array<{id:string, updatedAt?:string}>} items
 * @returns {number} count marked
 */
export function markAllAsSeen(items: any): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    const userId = _getUserId();
    const state = _loadState(userId);
    const now = new Date().toISOString();
    let count = 0;
    for (const item of items) {
        if (!item || !item.id) continue;
        state.itemStates[item.id] = {
            status: 'seen',
            seenAt: now,
            itemUpdatedAt: item.updatedAt || null,
        };
        count++;
    }
    state.lastSeenAt = now;
    _saveState(userId, state);
    return count;
}

/**
 * Clear all visual markings (unseen/seen → cleared).
 * Historical timestamps are preserved inside entries.
 * @returns {number} count cleared
 */
export function clearAllMarks(): number {
    const userId = _getUserId();
    const state = _loadState(userId);
    const clearedAt = new Date().toISOString();
    let count = 0;
    for (const itemId of Object.keys(state.itemStates)) {
        const e = state.itemStates[itemId];
        if (e.status !== 'cleared') {
            state.itemStates[itemId] = { ...e, status: 'cleared', clearedAt };
            count++;
        }
    }
    _saveState(userId, state);
    return count;
}

/**
 * Get the seen state for a single item.
 * @param {string} itemId
 * @returns {'unseen'|'seen'|'cleared'|'updated'}
 */
export function getSeenState(itemId: any): 'unseen'|'seen'|'cleared'|'updated' {
    const userId = _getUserId();
    const state = _loadState(userId);
    const entry = state.itemStates[itemId];
    if (!entry) return 'unseen';
    if (entry.status === 'cleared') return 'cleared';
    return entry.status || 'unseen';
}

/**
 * Set seen state for a single item explicitly.
 * @param {string} itemId
 * @param {'unseen'|'seen'|'cleared'|'updated'} status
 */
export function setSeenState(itemId: any, status: any) {
    const userId = _getUserId();
    const state = _loadState(userId);
    const now = new Date().toISOString();
    if (status === 'unseen') {
        delete state.itemStates[itemId];
    } else {
        state.itemStates[itemId] = {
            status,
            seenAt: now,
            itemUpdatedAt: null,
        };
    }
    _saveState(userId, state);
}

// ----------------------------------------------------------------
// Filtering & Sorting
// ----------------------------------------------------------------

/**
 * Compute effective status considering item.updatedAt vs entry.seenAt.
 * @param {any} item - must have `id`, optional `updatedAt`
 * @param {any} userState - from _loadState
 * @returns {'unseen'|'seen'|'cleared'|'updated'}
 */
function _effectiveStatus(item: any, userState: any): 'unseen'|'seen'|'cleared'|'updated' {
    if (!item || !item.id) return 'unseen';
    const entry = userState?.itemStates?.[item.id];
    if (!entry) return 'unseen';
    if (entry.status === 'cleared') return 'cleared';
    if (entry.status === 'seen' && item.updatedAt && entry.seenAt) {
        const itemTs = new Date(item.updatedAt).getTime();
        const seenTs = new Date(entry.seenAt).getTime();
        if (Number.isFinite(itemTs) && Number.isFinite(seenTs) && itemTs > seenTs) {
            return 'updated';
        }
    }
    return entry.status || 'unseen';
}

/**
 * Filter items by seen status.
 *
 * @param {Array<any>} items
 * @param {'all'|'unseen'|'seen'|'updated'} filterType
 * @returns {Array<any>}
 */
export function filterItems(items: any, filterType: any): Array<any> {
    if (!Array.isArray(items)) return [];
    if (filterType === 'all' || !filterType) return [...items];

    const userId = _getUserId();
    const userState = _loadState(userId);

    return items.filter((item) => {
        if (!item || !item.id) return false;
        const status = _effectiveStatus(item, userState);
        if (filterType === 'unseen') return status === 'unseen' || status === 'updated';
        if (filterType === 'seen') return status === 'seen' || status === 'cleared';
        if (filterType === 'updated') return status === 'updated';
        return true;
    });
}

/**
 * Sort items: unseen first, then by date (newest first).
 *
 * @param {Array<any>} items - each with `id`, optional `createdAt`, `updatedAt`
 * @returns {Array<any>}
 */
export function sortItems(items: any): Array<any> {
    if (!Array.isArray(items)) return [];
    const userId = _getUserId();
    const userState = _loadState(userId);

    return [...items].sort((a, b) => {
        const statusA = _effectiveStatus(a, userState);
        const statusB = _effectiveStatus(b, userState);

        const score = (/** @type {string} */ s: any) => {
            if (s === 'unseen' || s === 'updated') return 2;
            if (s === 'seen') return 1;
            return 0;
        };

        if (score(statusA) !== score(statusB)) {
            return score(statusB) - score(statusA);
        }

        const tsA = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const tsB = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        if (Number.isFinite(tsA) && Number.isFinite(tsB)) {
            return tsB - tsA;
        }
        return 0;
    });
}

// ----------------------------------------------------------------
// Internal reset helper for tests
// ----------------------------------------------------------------

/** @param {any} userId */
export function _resetStateForTests(userId: any) {
    try {
        localStorage.removeItem(_storageKey(userId || _getUserId()));
    } catch (err: any) {
        console.debug('[seenIndicator] resetState error', err?.message || err);
    }
}
