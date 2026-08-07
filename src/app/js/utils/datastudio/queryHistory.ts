// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO QUERY HISTORY — localStorage persistence
   Historico de queries SQL em localStorage
   ================================================================ */
const LS_KEY = 'ecbyts-ds-query-history';
const MAX_ENTRIES = 50;
/**
 * Add a query to history.
 * @param {string} sql
 */
export async function addQueryToHistory(sql: any) {
    if (!sql || !sql.trim())
        return;
    const trimmed = sql.trim();
    const history = getQueryHistory();
    // Avoid duplicates at the top
    if (history.length && history[0].sql === trimmed)
        return;
    history.unshift({
        sql: trimmed,
        ts: Date.now(),
    });
    // Cap
    if (history.length > MAX_ENTRIES)
        history.length = MAX_ENTRIES;
    try {
        const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
        safeSetItem(LS_KEY, JSON.stringify(history));
    }
    catch (e: any) {
        console.debug('[queryHistory] save-quota-or-import:', e?.message || e); /* original: quota exceeded or import failure */
    }
}
/**
 * Get query history.
 * @returns {Array<{sql: string, ts: number}>}
 */
export function getQueryHistory() {
    try {
        const raw = localStorage.getItem(LS_KEY) || '';
        if (raw)
            return JSON.parse(raw);
    }
    catch (e: any) {
        console.debug('[queryHistory] read-parse:', e?.message || e); /* original silent */
    }
    return [];
}
/**
 * Clear query history.
 */
export function clearQueryHistory() {
    try {
        localStorage.removeItem(LS_KEY);
    }
    catch (e: any) {
        console.debug('[queryHistory] clear-remove:', e?.message || e); /* original silent */
    }
}
