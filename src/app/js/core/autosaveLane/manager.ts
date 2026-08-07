// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   AUTOSAVE LANE MANAGER
   Roadmap §4.9 Backlog — desbloqueia Boundary Draw Save (9.25) +
   integra com metering quota.js (user_autosave_lanes).

   Conceito de "raia" (lane): snapshot nomeado do modelo de trabalho
   do usuário, como um branch leve. Usuário pode alternar entre raias,
   preservando estado intermediário sem perder dados quando tenta
   variações (ex: desenhar novo boundary sem sobrescrever o atual).

   Quota por tier:
     - Free: 3 raias por usuário
     - Paid: unlimited

   Persistence: IDB `ecbyts-autosave-lanes` (array).
   Cloud sync: via syncQueue (futuro, não neste MVP).
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../../utils/performance/deferredIdlePersistence.js';

const log = createLogger('AutosaveLane');

const IDB_KEY = 'ecbyts-autosave-lanes';
const AUTOSAVE_LANES_PERSIST_DEBOUNCE_MS = 750;
const AUTOSAVE_LANES_AFTER_BOOT_DELAY_MS = 30000;
const AUTOSAVE_LANES_IDLE_TIMEOUT_MS = 3000;

// Quota defaults - override via opts.quotaByTier em cada função
const DEFAULT_QUOTA = Object.freeze({
    free: 3,
    premium: 50,
    enterprise: Infinity,
});

/** @type {any[]} */
let _lanes: any = [];
let _loaded = false;
let _persistScheduler: DeferredIdlePersistenceController | null = null;
let _pendingPersistPromise: Promise<boolean> | null = null;
let _resolvePendingPersist: ((ok: boolean) => void) | null = null;
let _lastPersistSignature = '';

// ──────────────────────────────────────────────────────────────────────
// Persistence helpers
// ──────────────────────────────────────────────────────────────────────

async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored)) {
            _lanes = stored;
        }
    } catch (/** @type {any} */ err) {
        log.warn("Failed to load lanes from IDB:", (err as any).message);
    }
    _lastPersistSignature = _getLanesSignature();
    _loaded = true;
}

function _cloneLanesForStorage() {
    return _lanes.map((lane: any) => JSON.parse(JSON.stringify(lane)));
}

function _getLanesSignature() {
    try {
        return JSON.stringify(_cloneLanesForStorage());
    } catch {
        return `lanes:${_lanes.length}`;
    }
}

function _resolvePersist(ok: boolean) {
    if (_resolvePendingPersist) _resolvePendingPersist(ok);
    _pendingPersistPromise = null;
    _resolvePendingPersist = null;
}

async function _flushPersist() {
    _persistScheduler?.clear();
    try {
        const signature = _getLanesSignature();
        if (signature === _lastPersistSignature) {
            _resolvePersist(true);
            return true;
        }
        await idbSet(IDB_KEY, _cloneLanesForStorage());
        _lastPersistSignature = signature;
        _resolvePersist(true);
        return true;
    } catch (/** @type {any} */ err) {
        log.error('Failed to persist lanes', err);
        _resolvePersist(false);
        return false;
    }
}

function _getPersistScheduler() {
    if (!_persistScheduler) {
        _persistScheduler = createDeferredIdlePersistence({
            debounceMs: AUTOSAVE_LANES_PERSIST_DEBOUNCE_MS,
            bootDelayMs: AUTOSAVE_LANES_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: AUTOSAVE_LANES_IDLE_TIMEOUT_MS,
            flush: _flushPersist,
            onError: (error) => {
                log.warn('Deferred lane persistence failed:', (error as any)?.message || error);
                _resolvePersist(false);
            },
        });
    }
    return _persistScheduler;
}

function _persist() {
    if (!_pendingPersistPromise) {
        _pendingPersistPromise = new Promise((resolve) => {
            _resolvePendingPersist = resolve;
        });
    }
    _getPersistScheduler().schedule();
    return _pendingPersistPromise;
}

// ──────────────────────────────────────────────────────────────────────
// Pure helpers - usáveis sem IDB
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna quota de raias para um tier dado.
 * @param {string} tier
 * @param {Object<string, number>} [quotaByTier]
 * @returns {number}
 */
export function getQuotaForTier(tier: any, quotaByTier = DEFAULT_QUOTA) {
    const key = String(tier || 'free').toLowerCase();
    return (quotaByTier as any)[key] ?? (quotaByTier as any).free ?? 0;
}

/**
 * Verifica se um usuário pode criar nova raia baseado em sua cota + raias atuais.
 * Pure - recebe lanes como input, não toca IDB.
 *
 * @param {string} userId
 * @param {string} tier
 * @param {Array<any>} currentLanes
 * @param {Object} [opts]
 * @returns {{ allowed: boolean, reason?: string, used: number, limit: number }}
 */
export function canCreateLane(userId: any, tier: any, currentLanes: any[] = [], opts: any = {}) {
    if (!userId || typeof userId !== 'string') {
        return { allowed: false, reason: 'invalid_user', used: 0, limit: 0 };
    }
    const quotaByTier = (opts as any).quotaByTier || DEFAULT_QUOTA;
    const limit = getQuotaForTier(tier, quotaByTier);
    const userLanes = Array.isArray(currentLanes) ? currentLanes.filter((l) => l?.userId === userId) : [];
    const used = userLanes.length;

    if (!Number.isFinite(limit) && limit !== Infinity) {
        return { allowed: false, reason: 'invalid_limit', used, limit: 0 };
    }

    if (limit === Infinity) {
        return { allowed: true, used, limit };
    }

    if (used >= limit) {
        return { allowed: false, reason: 'quota_exceeded', used, limit };
    }
    return { allowed: true, used, limit };
}

/**
 * Valida shape mínimo de uma raia.
 * @param {any} lane
 * @returns {boolean}
 */
export function isValidLane(lane: any) {
    return !!(
        lane &&
        typeof lane === 'object' &&
        typeof lane.id === 'string' &&
        lane.id.length > 0 &&
        typeof lane.userId === 'string' &&
        lane.userId.length > 0 &&
        typeof lane.name === 'string'
    );
}

/**
 * Gera ID determinístico curto (ISO timestamp + 6 hex chars).
 * @returns {string}
 */
function _generateId() {
    const ts = Date.now().toString(36);
    const rand = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0');
    return `ln-${ts}-${rand}`;
}

// ──────────────────────────────────────────────────────────────────────
// Public API - async (IDB-backed)
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria nova raia para o usuário. Enforce quota via tier.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.name
 * @param {Object} [params.snapshot] - Estado do modelo (opcional)
 * @param {string} [params.tier='free']
 * @returns {Promise<Object>} lane criada
 */
export async function createLane(params: any) {
    if (!params || typeof params !== 'object') {
        throw new Error('createLane: params required');
    }
    const { userId, name, snapshot, tier = 'free' } = params;
    if (!userId) throw new Error('createLane: userId required');
    if (!name || typeof name !== 'string' || !name.trim()) {
        throw new Error('createLane: name required');
    }

    await _ensureLoaded();

    const quotaCheck = canCreateLane(userId, tier, _lanes, params);
    if (!quotaCheck.allowed) {
        const err: any = (
            new Error(`Quota exceeded: ${quotaCheck.used}/${quotaCheck.limit} (tier=${tier})`)
        );
        err.code = quotaCheck.reason;
        err.used = quotaCheck.used;
        err.limit = quotaCheck.limit;
        throw err;
    }

    const now = new Date().toISOString();
    const lane = {
        id: _generateId(),
        userId,
        name: name.trim().slice(0, 120),
        snapshot: snapshot || null,
        createdAt: now,
        updatedAt: now,
        active: false,
    };

    _lanes.push(lane);
    _persist();
    log.info('Created lane %s for user %s', lane.id, userId);
    return lane;
}

/**
 * Lista raias de um usuário, ordenadas por updatedAt desc.
 * @param {string} userId
 * @returns {Promise<Array<any>>}
 */
export async function getLanesForUser(userId: any) {
    if (!userId) return [];
    await _ensureLoaded();
    return _lanes
        .filter((l: any) => l.userId === userId)
        .slice()
        .sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/**
 * Retorna raia ativa do usuário (se houver).
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function getActiveLane(userId: any) {
    if (!userId) return null;
    await _ensureLoaded();
    return _lanes.find((l: any) => l.userId === userId && l.active === true) || null;
}

/**
 * Torna uma raia ativa para o usuário (desativa as outras do mesmo user).
 * Idempotente.
 *
 * @param {string} userId
 * @param {string} laneId
 * @returns {Promise<Object|null>}
 */
export async function switchLane(userId: any, laneId: any) {
    if (!userId || !laneId) return null;
    await _ensureLoaded();
    const lane = _lanes.find((l: any) => l.userId === userId && l.id === laneId);
    if (!lane) return null;
    for (const l of _lanes) {
        if (l.userId === userId) l.active = l.id === laneId;
    }
    lane.updatedAt = new Date().toISOString();
    _persist();
    return lane;
}

/**
 * Atualiza snapshot da raia (write-through).
 * @param {string} userId
 * @param {string} laneId
 * @param {Object} snapshot
 * @returns {Promise<Object|null>}
 */
export async function updateSnapshot(userId: any, laneId: any, snapshot: any) {
    if (!userId || !laneId) return null;
    await _ensureLoaded();
    const lane = _lanes.find((l: any) => l.userId === userId && l.id === laneId);
    if (!lane) return null;
    lane.snapshot = snapshot || null;
    lane.updatedAt = new Date().toISOString();
    _persist();
    return lane;
}

/**
 * Remove raia do usuário. Idempotente (retorna null se não encontrada).
 * @param {string} userId
 * @param {string} laneId
 * @returns {Promise<Object|null>}
 */
export async function deleteLane(userId: any, laneId: any) {
    if (!userId || !laneId) return null;
    await _ensureLoaded();
    const idx = _lanes.findIndex((l: any) => l.userId === userId && l.id === laneId);
    if (idx < 0) return null;
    const [removed] = _lanes.splice(idx, 1);
    _persist();
    return removed;
}

/**
 * Testing helper - reset estado em memória.
 * @param {boolean} [clearIdb=false]
 */
export async function _resetForTesting(clearIdb = false) {
    _persistScheduler?.clear();
    _persistScheduler = null;
    _pendingPersistPromise = null;
    _resolvePendingPersist = null;
    _lanes = [];
    _loaded = false;
    _lastPersistSignature = _getLanesSignature();
    if (clearIdb) {
        await idbSet(IDB_KEY, []);
        _lastPersistSignature = _getLanesSignature();
    }
}
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo para snapshot de tab.
 * Retorna lista de lanes (deep clone) + flag _loaded.
 *
 * IMPORTANTE: lanes são per-user (não per-tab nativamente). Quando wire ao
 * Manager Registry F2 + bridge F3, cada tab terá sua própria lane via
 * convenção `lane.tabId = tab.id`. Migration pendente em F5.
 */
export function exportState(): { lanes: any[]; loaded: boolean } {
    return {
        lanes: _lanes.map((l: any) => JSON.parse(JSON.stringify(l))),
        loaded: _loaded,
    };
}
/**
 * Restaura estado a partir de snapshot.
 * Tolerante a state null/malformed (degrada para resetState in-memory).
 * NÃO escreve no IDB — caller (bridge F3) decide se persiste.
 */
export function importState(state: { lanes?: any[]; loaded?: boolean } | null | undefined): void {
    if (!state || typeof state !== 'object') {
        _lanes = [];
        _loaded = false;
        return;
    }
    _lanes = Array.isArray(state.lanes) ? state.lanes.map((l: any) => JSON.parse(JSON.stringify(l))) : [];
    _loaded = !!state.loaded;
}
/**
 * Reset in-memory (NÃO toca IDB).
 * Para reset completo com IDB clear use _resetForTesting(true).
 */
export function resetState(): void {
    _lanes = [];
    _loaded = false;
}
