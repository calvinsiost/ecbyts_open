// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   WHAT'S NEW — Manager de entradas de versao
   Gerencia entries de "novidades" por versao, com tracking de leitura.
   ================================================================ */

import { createLogger } from '../helpers/logger.js';

const log = createLogger('WhatsNew');
const STORAGE_KEY = 'ecbyts-whats-new-seen';

export interface WhatsNewEntry {
    version: string;
    title: string;
    items: string[];
    date?: string;
}

const _entries: WhatsNewEntry[] = [];

// Fallback safeSetItem - importado dinamicamente se disponivel
type SafeSetItem = (k: string, v: string) => boolean;
let _safeSetItem: SafeSetItem | null = null;

async function getSafeSetItem(): Promise<SafeSetItem> {
    if (_safeSetItem) return _safeSetItem;
    try {
        const mod: any = await import('../storage/storageMonitor.js');
        _safeSetItem = mod.safeSetItem;
    } catch {
        _safeSetItem = (k: string, v: string): boolean => {
            try {
                localStorage.setItem(k, v);
                return true;
            } catch {
                return false;
            }
        };
    }
    return _safeSetItem as SafeSetItem;
}

/**
 * Returns all what's new entries sorted by version (newest first).
 */
export function getWhatsNewEntries(): WhatsNewEntry[] {
    return [..._entries].sort((a, b) => _compareVersions(b.version, a.version));
}

/**
 * Adds a new entry for a specific version.
 * Adiciona entrada de novidade para uma versao.
 */
export function addEntry(version: string, title: string, items: string[]): boolean {
    if (!version || typeof version !== 'string') {
        log.error('addEntry requires a version string');
        return false;
    }
    if (!title || typeof title !== 'string') {
        log.error('addEntry requires a title string');
        return false;
    }
    if (!Array.isArray(items) || items.length === 0) {
        log.error('addEntry requires a non-empty items array');
        return false;
    }
    // Replace existing entry for same version
    const idx = _entries.findIndex((e) => e.version === version);
    const entry: WhatsNewEntry = { version, title, items: [...items], date: new Date().toISOString() };
    if (idx >= 0) {
        _entries[idx] = entry;
    } else {
        _entries.push(entry);
    }
    log.debug('Entry added for version', version);
    return true;
}

/**
 * Marks a version as seen by the user.
 * Marca versao como visualizada no localStorage.
 */
export async function markSeen(version: string): Promise<void> {
    if (!version) return;
    const seen = _getSeenVersions();
    if (!seen.includes(version)) {
        seen.push(version);
        const setItem = await getSafeSetItem();
        if (setItem) setItem(STORAGE_KEY, JSON.stringify(seen));
        log.debug('Marked as seen:', version);
    }
}

/**
 * Checks if there are unseen versions.
 */
export function hasUnseen(): boolean {
    const seen = _getSeenVersions();
    return _entries.some((e) => !seen.includes(e.version));
}

/**
 * Returns entries not yet seen by the user (newest first).
 */
export function getLatestUnseen(): WhatsNewEntry[] {
    const seen = _getSeenVersions();
    return _entries.filter((e) => !seen.includes(e.version)).sort((a, b) => _compareVersions(b.version, a.version));
}

/**
 * Returns the number of registered entries (for testing).
 */
export function getEntryCount(): number {
    return _entries.length;
}

/**
 * Clears all entries (for testing only).
 */
export function _clearEntries(): void {
    _entries.length = 0;
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _getSeenVersions(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) return JSON.parse(raw);
    } catch (err: any) {
        log.warn('Failed to read seen versions:', err?.message || err);
    }
    return [];
}

/**
 * Compares two semver strings. Returns positive if a > b.
 */
function _compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}
