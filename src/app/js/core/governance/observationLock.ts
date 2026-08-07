// Generated from src/app/js/core/governance/observationLock.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   OBSERVATION LOCK — Corrigible observations with audit trail
   Observacoes travadas com historico de correcoes

   Uma observacao "locked" nao pode ser editada diretamente. Correcoes
   sao registradas como entradas adicionais que preservam o valor
   original — nunca modificam o dado existente.

   Principio ALCOA++: "Original" — dados originais sao preservados.
   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G2)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('ObservationLock');

/** @type {string} IDB key for lock registry */
const IDB_LOCKS_KEY = 'ecbyts-obs-locks';

/** @type {string} IDB key for corrections history */
const IDB_CORRECTIONS_KEY = 'ecbyts-obs-corrections';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LockRecord
 * @property {string} obsId - Observation ID
 * @property {string} reason - Why the observation was locked
 * @property {string} lockedBy - User who locked it
 * @property {string} lockedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} CorrectionRecord
 * @property {string} id - Unique correction ID
 * @property {string} obsId - Original observation ID
 * @property {*} newValue - Corrected value
 * @property {string} reason - Justification for correction
 * @property {string} userId - Who requested the correction
 * @property {string} timestamp - ISO 8601 timestamp
 */

// ── In-memory caches ─────────────────────────────────────────────────────────

/** @type {Map<string, LockRecord>} obsId -> lock record */
let _locks = new Map();

/** @type {Map<string, CorrectionRecord[]>} obsId -> corrections array */
let _corrections = new Map();

let _loaded = false;

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Persist locks to IDB.
 * @returns {Promise<void>}
 */
async function _persistLocks() {
    try {
        await idbSet(IDB_LOCKS_KEY, Object.fromEntries(_locks));
    } catch (err: any) {
        log.error('Failed to persist locks', err);
    }
}

/**
 * Persist corrections to IDB.
 * @returns {Promise<void>}
 */
async function _persistCorrections() {
    try {
        const obj: Record<string, any> = {};
        for (const [k, v] of _corrections) {
            obj[k] = v;
        }
        await idbSet(IDB_CORRECTIONS_KEY, obj);
    } catch (err: any) {
        log.error('Failed to persist corrections', err);
    }
}

/**
 * Load locks and corrections from IDB (once).
 * @returns {Promise<void>}
 */
async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const locks = await idbGet(IDB_LOCKS_KEY);
        if (locks && typeof locks === 'object') {
            _locks = new Map(Object.entries(locks));
        }
        const corrections = await idbGet(IDB_CORRECTIONS_KEY);
        if (corrections && typeof corrections === 'object') {
            for (const [k, v] of Object.entries(corrections)) {
                if (Array.isArray(v)) _corrections.set(k, v);
            }
        }
    } catch (err: any) {
        log.warn('Failed to load observation locks from IDB', err);
    }
    _loaded = true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Lock an observation after validation. Locked observations cannot be
 * directly edited - only corrected via requestCorrection().
 *
 * @param {string} obsId - Observation ID to lock
 * @param {string} reason - Why the observation is being locked (e.g. 'validated', 'approved')
 * @param {string} [lockedBy='system'] - User performing the lock
 * @returns {Promise<LockRecord>}
 */
export async function lockObservation(obsId: any, reason: any, lockedBy: any = "system") {
    await _ensureLoaded();

    if (!obsId) throw new Error('obsId is required');

    const record = {
        obsId: String(obsId),
        reason: String(reason || ''),
        lockedBy: String(lockedBy),
        lockedAt: new Date().toISOString(),
    };

    _locks.set(record.obsId, record);
    await _persistLocks();
    log.info('Observation locked', obsId, reason);
    return record;
}

/**
 * Check if an observation is locked.
 * @param {string} obsId - Observation ID
 * @returns {Promise<boolean>}
 */
export async function isLocked(obsId: any) {
    await _ensureLoaded();
    return _locks.has(String(obsId));
}

/**
 * Get the lock record for an observation, or null if not locked.
 * @param {string} obsId
 * @returns {Promise<LockRecord|null>}
 */
export async function getLockRecord(obsId: any) {
    await _ensureLoaded();
    return _locks.get(String(obsId)) || null;
}

/**
 * Request a correction for a locked observation. This does NOT modify
 * the original value - it creates a new correction record that preserves
 * full traceability. The original observation remains intact.
 *
 * @param {string} obsId - Original observation ID
 * @param {*} newValue - Corrected value
 * @param {string} reason - Justification for the correction
 * @param {string} userId - Who is requesting the correction
 * @returns {Promise<CorrectionRecord>}
 */
export async function requestCorrection(obsId: any, newValue: any, reason: any, userId: any) {
    await _ensureLoaded();

    if (!obsId) throw new Error('obsId is required');
    if (!reason) throw new Error('reason is required for corrections');

    const correction = {
        id: `cor-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        obsId: String(obsId),
        newValue,
        reason: String(reason),
        userId: String(userId || 'anonymous'),
        timestamp: new Date().toISOString(),
    };

    const key = String(obsId);
    if (!_corrections.has(key)) {
        _corrections.set(key, []);
    }
    /** @type {unknown[]} */ (_corrections.get(key)).push(correction);

    await _persistCorrections();
    log.info('Correction requested', obsId, reason);
    return correction;
}

/**
 * Get all correction records for an observation, ordered chronologically.
 * @param {string} obsId
 * @returns {Promise<CorrectionRecord[]>}
 */
export async function getCorrectionHistory(obsId: any) {
    await _ensureLoaded();
    return [...(_corrections.get(String(obsId)) || [])];
}

/**
 * Get all locked observation IDs.
 * @returns {Promise<string[]>}
 */
export async function getLockedObservationIds() {
    await _ensureLoaded();
    return [..._locks.keys()];
}

/**
 * Reset in-memory state. For testing only.
 * @param {boolean} [clearIdb=false]
 * @returns {Promise<void>}
 */
export async function _resetForTesting(clearIdb = false) {
    _locks = new Map();
    _corrections = new Map();
    _loaded = false;
    if (clearIdb) {
        await idbSet(IDB_LOCKS_KEY, {});
        await idbSet(IDB_CORRECTIONS_KEY, {});
    }
}
