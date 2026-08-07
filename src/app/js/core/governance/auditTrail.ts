// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   AUDIT TRAIL — Append-only audit log for governance traceability
   Log imutavel de acoes para rastreabilidade de governanca

   Registra automaticamente quem fez o que, quando, em qual recurso.
   Append-only: nenhuma operacao de update ou delete e permitida.
   Persistencia via IndexedDB (idbStore.js).

   Referencia: ALCOA++ "Attributable" + "Contemporaneous"
   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G1)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import {
    applyAuditFilters as _applyAuditFilters,
    computeAuditStats as _computeAuditStats,
} from './_auditTrailPure.js';

const log = createLogger('AuditTrail');

/** @type {string} IDB key for the audit log array */
const IDB_KEY = 'ecbyts-audit-trail';

/** @type {number} Maximum entries kept in memory/IDB to prevent unbounded growth */
const MAX_ENTRIES = 10000;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditEntry
 * @property {string} id - Unique entry ID (timestamp + random suffix)
 * @property {string} userId - Who performed the action
 * @property {string} action - Action type (e.g. 'observation.add', 'element.delete')
 * @property {string} resourceId - Affected resource ID
 * @property {Object} [data] - Additional context (old/new values, reason, etc.)
 * @property {string} timestamp - ISO 8601 timestamp
 */

// ── In-memory cache ──────────────────────────────────────────────────────────

/** @type {AuditEntry[]} */
let _entries: any = [];
let _loaded = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a unique entry ID from timestamp + random suffix.
 * Formato: "at-{epochMs}-{random4hex}" para ordenacao natural.
 * @returns {string}
 */
function _generateId() {
    const ts = Date.now();
    const rnd = Math.random().toString(16).slice(2, 6);
    return `at-${ts}-${rnd}`;
}

/**
 * Persist current entries to IDB. Fire-and-forget, never throws.
 * @returns {Promise<void>}
 */
async function _persist() {
    try {
        await idbSet(IDB_KEY, _entries);
    } catch (err) {
        log.error('Failed to persist audit trail', err);
    }
}

/**
 * Load entries from IDB into memory (once).
 * @returns {Promise<void>}
 */
async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored)) {
            _entries = stored;
        }
    } catch (err) {
        log.warn('Failed to load audit trail from IDB', err);
    }
    _loaded = true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record an action in the audit trail. Append-only - no way to modify or
 * remove entries after creation. This is the core governance primitive.
 *
 * @param {string} userId - Who performed the action (email, session ID, or 'anonymous')
 * @param {string} action - Action type (dot-separated, e.g. 'observation.add')
 * @param {string} resourceId - Affected resource identifier
 * @param {Object} [data={}] - Additional context (values, reason, metadata)
 * @returns {Promise<AuditEntry>} The created entry
 */
export async function logAction(userId: any, action: any, resourceId: any, data = {}) {
    await _ensureLoaded();

    const entry = {
        id: _generateId(),
        userId: userId || 'anonymous',
        action: String(action || ''),
        resourceId: String(resourceId || ''),
        data: data && typeof data === 'object' ? { ...data } : {},
        timestamp: new Date().toISOString(),
    };

    _entries.push(entry);

    // Trim oldest entries if exceeding cap
    if (_entries.length > MAX_ENTRIES) {
        _entries = _entries.slice(_entries.length - MAX_ENTRIES);
    }

    await _persist();
    log.debug('Logged action', entry.action, entry.resourceId);
    return entry;
}

/**
 * Query the audit log with optional filters. Returns matching entries
 * in chronological order (oldest first).
 *
 * @param {Object} [filters={}]
 * @param {string} [filters.userId] - Filter by user
 * @param {string} [filters.action] - Filter by action type (exact or prefix match with '.')
 * @param {string} [filters.resourceId] - Filter by resource
 * @param {string} [filters.fromDate] - ISO date string (inclusive)
 * @param {string} [filters.toDate] - ISO date string (inclusive)
 * @param {number} [filters.limit] - Max entries to return
 * @returns {Promise<AuditEntry[]>}
 */
export async function getAuditLog(
    filters: {
        userId?: string;
        action?: string;
        resourceId?: string;
        fromDate?: string;
        toDate?: string;
        limit?: number;
    } = {}
) {
    await _ensureLoaded();
    return _applyAuditFilters(_entries, filters);
}

/**
 * Get aggregate statistics of the audit log.
 * Contagem por tipo de acao, total de entradas, periodo coberto.
 *
 * @returns {Promise<{total: number, byAction: Object<string, number>, firstEntry: string|null, lastEntry: string|null}>}
 */
export async function getAuditStats() {
    await _ensureLoaded();
    return _computeAuditStats(_entries);
}

/**
 * Get the full raw entries array (read-only copy).
 * Usado para export e diagnostico.
 * @returns {Promise<AuditEntry[]>}
 */
export async function getAllEntries() {
    await _ensureLoaded();
    return [..._entries];
}

/**
 * Reset in-memory state. For testing only - does NOT delete IDB data.
 * @param {boolean} [clearIdb=false] - Also clear IDB (test cleanup)
 * @returns {Promise<void>}
 */
export async function _resetForTesting(clearIdb = false) {
    _entries = [];
    _loaded = false;
    if (clearIdb) {
        await idbSet(IDB_KEY, []);
    }
}
