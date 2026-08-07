// Generated from src/app/js/core/governance/stakeholderShare.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

// @ts-check

/* ================================================================
   STAKEHOLDER SHARE — G8: Read-only share links for regulators

   Gera share codes para acesso leitura a modelos, com role atribuída
   (viewer, regulator, auditor). Cada code tem TTL (expiresAt) e pode
   ser revogado. Suporta uso offline via IndexedDB (cache local) e
   deve ser sincronizado para Supabase via syncQueue quando online
   (wire-up feito no handler).

   Formato do share code:
   "ss-{12 hex chars}" — suficiente (2^48 ≈ 281T combinações)
   para impedir brute force sem ser longo demais para URLs.

   URL resultante: https://ecbyts.com/broadcast.html?share=ss-{code}
   (página broadcast.html já existe para Model Radar — reutilizamos)

   IMPORTANTE: este módulo APENAS gera e valida codes localmente. A
   validação server-side via RLS (G7) é a fonte de verdade de segurança.
   Client-side validation impede UI flicker mas não pode ser a única
   camada.

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G8)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { ROLES } from './rbacGuards.js';

const log = createLogger('StakeholderShare');

/** @type {string} IDB key for the share codes array */
const IDB_KEY = 'ecbyts-stakeholder-shares';

/** @type {number} Max active shares per model (prevent accidental link spam) */
const MAX_ACTIVE_PER_MODEL = 50;

/** @type {number} Default TTL in days if caller omits expiresAt */
const DEFAULT_TTL_DAYS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ShareRecord
 * @property {string} id - Unique share code ("ss-{12hex}")
 * @property {string} modelId - Model being shared
 * @property {string} role - Assigned role from rbacGuards.ROLES
 * @property {string} createdBy - Email/userId of the creator
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} expiresAt - ISO 8601 timestamp
 * @property {string} [label] - Human-readable label (e.g., "CETESB - Fiscal Carlos")
 * @property {boolean} revoked - True after revocation
 * @property {string} [revokedAt] - ISO 8601 when revoked
 */

// ── State ────────────────────────────────────────────────────────────────────

/** @type {ShareRecord[]} */
let _shares: any[] = [];
let _loaded = false;

// ── Persistence ──────────────────────────────────────────────────────────────

async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored)) {
            _shares = stored;
            log.debug('Loaded %d share records from IDB', stored.length);
        }
    } catch (err: any) {
        log.warn('Failed to load shares from IDB:', /** @type {any} */ (err)?.message);
    }
    _loaded = true;
}

async function _persist() {
    try {
        await idbSet(IDB_KEY, _shares);
    } catch (err: any) {
        log.error('Failed to persist shares', err);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically-random share code.
 * Falls back to Math.random only if crypto.getRandomValues is unavailable
 * (should never happen in modern browsers or Node 18+).
 * @returns {string} "ss-{12 lowercase hex chars}"
 */
function _generateShareCode() {
    const bytes = new Uint8Array(6);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `ss-${hex}`;
}

/**
 * Compute expiresAt as ISO string from ttlDays.
 * @param {number} ttlDays
 * @returns {string}
 */
function _computeExpiresAt(ttlDays: any) {
    const ms = Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms).toISOString();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new share code for a model with a specific role.
 *
 * @param {Object} params
 * @param {string} params.modelId - Model UUID
 * @param {string} params.role - One of ROLES (usually viewer or regulator)
 * @param {string} params.createdBy - Email/userId of creator
 * @param {number} [params.ttlDays=30] - Time-to-live in days
 * @param {string} [params.label] - Human-readable label
 * @returns {Promise<ShareRecord>}
 */
export async function createShare(params: any) {
    if (!params || typeof params !== 'object') {
        throw new Error('createShare: params object required');
    }
    const { modelId, role, createdBy, ttlDays = DEFAULT_TTL_DAYS, label } = params;

    if (!modelId || typeof modelId !== 'string') {
        throw new Error('createShare: modelId required');
    }
    if (!role || !ROLES.includes(role)) {
        throw new Error(`createShare: role must be one of ${ROLES.join(', ')}`);
    }
    if (role === 'owner' || role === 'editor') {
        throw new Error(`createShare: role "${role}" cannot be granted via share link (write access requires auth)`);
    }
    if (!createdBy || typeof createdBy !== 'string') {
        throw new Error('createShare: createdBy required');
    }

    await _ensureLoaded();

    const activeForModel = _shares.filter((s: any) => s.modelId === modelId && !s.revoked).length;
    if (activeForModel >= MAX_ACTIVE_PER_MODEL) {
        throw new Error(`createShare: max ${MAX_ACTIVE_PER_MODEL} active shares per model reached`);
    }

    /** @type {ShareRecord} */
    const record = {
        id: _generateShareCode(),
        modelId,
        role,
        createdBy,
        createdAt: new Date().toISOString(),
        expiresAt: _computeExpiresAt(ttlDays),
        label: label ? String(label).trim().slice(0, 120) : '',
        revoked: false,
    };

    _shares.push(record);
    await _persist();
    log.info('Created share %s for model %s (role=%s, ttl=%dd)', record.id, modelId, role, ttlDays);
    return record;
}

/**
 * Validate a share code. Returns the record if valid and active,
 * or throws with a readable reason.
 *
 * @param {string} code - Share code (with or without 'ss-' prefix)
 * @returns {Promise<ShareRecord>}
 */
export async function validateShare(code: any) {
    if (!code || typeof code !== 'string') {
        throw new Error('validateShare: code required');
    }
    const normalized = code.startsWith('ss-') ? code : `ss-${code}`;

    await _ensureLoaded();

    const record = _shares.find((s: any) => s.id === normalized);
    if (!record) {
        throw new Error('Share code not found');
    }
    if (record.revoked) {
        throw new Error('Share code has been revoked');
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
        throw new Error('Share code has expired');
    }
    return record;
}

/**
 * Revoke a share code. Idempotent - calling on already-revoked is a no-op.
 *
 * @param {string} code - Share code
 * @returns {Promise<ShareRecord|null>}
 */
export async function revokeShare(code: any) {
    if (!code || typeof code !== 'string') return null;
    const normalized = code.startsWith('ss-') ? code : `ss-${code}`;

    await _ensureLoaded();

    const record = _shares.find((s: any) => s.id === normalized);
    if (!record) return null;
    if (record.revoked) return record;

    record.revoked = true;
    record.revokedAt = new Date().toISOString();
    await _persist();
    log.info('Revoked share %s', record.id);
    return record;
}

/**
 * List all shares for a given model.
 * @param {string} modelId
 * @param {Object} [filters]
 * @param {boolean} [filters.activeOnly=false] - Filter out revoked/expired
 * @returns {Promise<ShareRecord[]>}
 */
export async function listSharesForModel(modelId: any, filters: any = {}) {
    if (!modelId) return [];
    await _ensureLoaded();
    const now = Date.now();
    return _shares.filter((s: any) => {
        if (s.modelId !== modelId) return false;
        if (filters.activeOnly) {
            if (s.revoked) return false;
            if (new Date(s.expiresAt).getTime() < now) return false;
        }
        return true;
    });
}

/**
 * Build a shareable URL from a share code.
 * @param {string} code - Share code
 * @param {string} [baseUrl='https://ecbyts.com'] - Base URL
 * @returns {string}
 */
export function buildShareUrl(code: any, baseUrl = 'https://ecbyts.com') {
    if (!code) return '';
    const normalized = code.startsWith('ss-') ? code : `ss-${code}`;
    return `${baseUrl.replace(/\/$/, '')}/broadcast.html?share=${encodeURIComponent(normalized)}`;
}

/**
 * Reset in-memory state. For testing only.
 * @param {boolean} [clearIdb=false]
 */
export async function _resetForTesting(clearIdb = false) {
    _shares = [];
    _loaded = false;
    if (clearIdb) {
        await idbSet(IDB_KEY, []);
    }
}
