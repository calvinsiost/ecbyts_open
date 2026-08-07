// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RADAR ACCESS GROUPS — SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66 §4

   Grupos nomeados que vinculam (members[], catalogBindings[]) para
   controlar quem acessa quais catálogos via share link.

   Pure helpers + async CRUD IDB. UI layer em utils/ui/radarGroups.

   Access control (triple-check do §Q3):
   1. canAccessCatalog(user, group, catalog) — gate pura
   2. RLS policy via Supabase (não coberto aqui)
   3. UI redirect se !canAccess (handler-layer)

   Este módulo implementa #1 e persiste as entidades localmente.
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('RadarAccessGroups');

const IDB_KEY = 'ecbyts-radar-access-groups';

// Quota por tier (§Q5)
const DEFAULT_QUOTA = Object.freeze({
    free: 3,
    premium: Infinity,
    enterprise: Infinity,
});

/** @type {any[]} */
let _groups: any[] = [];
let _loaded = false;

// ──────────────────────────────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────────────────────────────

async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (Array.isArray(stored)) _groups = stored;
    } catch (err: any) {
        log.warn('Failed to load groups from IDB:', /** @type {any} */ (err)?.message);
    }
    _loaded = true;
}

async function _persist() {
    try {
        await idbSet(IDB_KEY, _groups);
    } catch (err: any) {
        log.error('Failed to persist groups', err);
    }
}

function _genId() {
    return `rg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ──────────────────────────────────────────────────────────────────────
// Share hash - deterministic FNV-1a 32-bit + salt
// ──────────────────────────────────────────────────────────────────────

import { fnv1aHash as _fnv1aHash } from '../../utils/helpers/hashFnv1a.js';
function _fnv1a(str: string) {
    return _fnv1aHash(str);
}

/**
 * Gera hash de share link estável para um grupo.
 * Determinístico (mesmo input → mesmo output). Salt inclui tempo
 * de criação do grupo para permitir invalidação (regenerate link).
 *
 * @param {string} groupId
 * @param {string} [salt]
 * @returns {string} - 12 chars alfanuméricos
 */
export function generateShareHash(groupId: any, salt: any = "") {
    const source = `${groupId}:${salt}`;
    const h1 = _fnv1a(source);
    const h2 = _fnv1a(source + ':v2');
    return (h1.toString(36) + h2.toString(36)).slice(0, 12).padEnd(12, '0');
}

// ──────────────────────────────────────────────────────────────────────
// Pure validators + quota
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de grupo.
 * @param {Record<string, any>} g
 * @returns {boolean}
 */
export function isValidAccessGroup(g: any) {
    return !!(
        g &&
        typeof g === 'object' &&
        typeof g.id === 'string' &&
        g.id.length > 0 &&
        typeof g.name === 'string' &&
        g.name.trim().length > 0 &&
        g.name.length <= 100 &&
        typeof g.ownerId === 'string' &&
        g.ownerId.length > 0 &&
        Array.isArray(g.memberIds) &&
        Array.isArray(g.catalogBindings)
    );
}

/**
 * Quota por tier.
 * @param {string} tier
 * @param {Object<string, number>} [quotaByTier]
 * @returns {number}
 */
export function getQuotaForTier(tier: any, quotaByTier: any = DEFAULT_QUOTA) {
    const key = String(tier || 'free').toLowerCase();
    return (quotaByTier as Record<string,any>)[key] ?? quotaByTier.free ?? 0;
}

/**
 * Pode criar novo grupo?
 * @param {string} ownerId
 * @param {string} tier
 * @param {Array<Record<string, any>>} currentGroups
 * @param {Record<string, any>} [opts]
 * @returns {{ allowed: boolean, used: number, limit: number, reason?: string }}
 */
export function canCreateGroup(ownerId: any, tier: any, currentGroups: any = [], opts: any = {}) {
    const limit = getQuotaForTier(tier, opts.quotaByTier);
    const used = currentGroups.filter((g: any) => g?.ownerId === ownerId).length;
    if (used >= limit) {
        return { allowed: false, used, limit, reason: 'quota_exceeded' };
    }
    return { allowed: true, used, limit };
}

// ──────────────────────────────────────────────────────────────────────
// Access control (core check)
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se user está no grupo.
 * @param {string} userId
 * @param {Record<string, any>} group
 * @returns {boolean}
 */
export function isUserInGroup(userId: any, group: any) {
    if (!userId || !group) return false;
    if (group.ownerId === userId) return true;
    return Array.isArray(group.memberIds) && group.memberIds.includes(userId);
}

/**
 * Verifica se user pode acessar catalog via group (triple-check step 1).
 * Owner sempre tem acesso. Membro precisa do catalogBinding explícito.
 * Grupo deve estar active.
 *
 * @param {string} userId
 * @param {Record<string, any>} group
 * @param {string} catalogId
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canAccessCatalog(userId: any, group: any, catalogId: any) {
    if (!userId) return { allowed: false, reason: 'no_user' };
    if (!group) return { allowed: false, reason: 'no_group' };
    if (!catalogId) return { allowed: false, reason: 'no_catalog' };
    if (group.archived || group.active === false) return { allowed: false, reason: 'group_inactive' };
    if (!isUserInGroup(userId, group)) return { allowed: false, reason: 'not_member' };
    const bindings = Array.isArray(group.catalogBindings) ? group.catalogBindings : [];
    if (!bindings.includes(catalogId)) return { allowed: false, reason: 'catalog_not_bound' };
    return { allowed: true, reason: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// Async CRUD
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria novo grupo. Retorna grupo + shareHash.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.ownerId
 * @param {string} [params.description]
 * @param {Array<string>} [params.memberIds]
 * @param {Array<string>} [params.catalogBindings]
 * @param {string} [params.tier='free']
 * @param {Record<string, number>} [params.quotaByTier]
 * @returns {Promise<Record<string, any>>}
 */
export async function createAccessGroup(params: any) {
    if (!params || typeof params !== 'object') throw new Error('createAccessGroup: params required');
    const { name, ownerId } = params;
    if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('createAccessGroup: name required');
    if (!ownerId || typeof ownerId !== 'string') throw new Error('createAccessGroup: ownerId required');

    await _ensureLoaded();

    const tier = params.tier || 'free';
    const ownerGroups = _groups.filter((g: any) => g.ownerId === ownerId && !g.archived);
    const quota = canCreateGroup(ownerId, tier, ownerGroups);
    if (!quota.allowed) {
        const err = (new Error(`Quota exceeded: ${quota.used}/${quota.limit} (tier=${tier})`)) as any;
        err.code = 'QUOTA_EXCEEDED';
        err.quota = quota;
        throw err;
    }

    const id = _genId();
    const createdAt = new Date().toISOString();
    const shareHash = generateShareHash(id, createdAt);

    const group = {
        id,
        name: name.trim().slice(0, 100),
        description: (params.description || '').slice(0, 500),
        ownerId,
        memberIds: Array.isArray(params.memberIds) ? [...new Set(params.memberIds)] : [],
        catalogBindings: Array.isArray(params.catalogBindings) ? [...new Set(params.catalogBindings)] : [],
        shareHash,
        active: true,
        archived: false,
        createdAt,
        updatedAt: createdAt,
    };

    _groups.push(group);
    await _persist();
    return group;
}

/**
 * Lista grupos visíveis para um user (owner OU membro), não archived.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
export async function getGroupsForUser(userId: any) {
    await _ensureLoaded();
    return _groups
        .filter((g: any) =>
                !g.archived && (g.ownerId === userId || (Array.isArray(g.memberIds) && g.memberIds.includes(userId))),
        )
        .slice()
        .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

/**
 * Atualiza grupo. Apenas owner pode.
 * @param {string} groupId
 * @param {string} actorId
 * @param {Record<string, any>} patch
 * @returns {Promise<Object|null>}
 */
export async function updateAccessGroup(groupId: any, actorId: any, patch: any) {
    await _ensureLoaded();
    const idx = _groups.findIndex((g: any) => g.id === groupId);
    if (idx < 0) return null;
    const existing = _groups[idx];
    if (existing.ownerId !== actorId) {
        const err = (new Error('Only owner can update group')) as any;
        err.code = 'NOT_OWNER';
        throw err;
    }

    /** @type {Record<string, any>} */
    const safePatch: any = {};
    if (typeof patch?.name === 'string' && patch.name.trim()) safePatch.name = patch.name.trim().slice(0, 100);
    if (typeof patch?.description === 'string') safePatch.description = patch.description.slice(0, 500);
    if (Array.isArray(patch?.memberIds)) safePatch.memberIds = [...new Set(patch.memberIds)];
    if (Array.isArray(patch?.catalogBindings)) safePatch.catalogBindings = [...new Set(patch.catalogBindings)];
    if (typeof patch?.active === 'boolean') safePatch.active = patch.active;

    const updated = { ...existing, ...safePatch, updatedAt: new Date().toISOString() };
    _groups[idx] = updated;
    await _persist();
    return updated;
}

/**
 * Regenera shareHash (invalida link anterior).
 * @param {string} groupId
 * @param {string} actorId
 * @returns {Promise<string|null>}
 */
export async function regenerateShareHash(groupId: any, actorId: any) {
    await _ensureLoaded();
    const idx = _groups.findIndex((g: any) => g.id === groupId);
    if (idx < 0) return null;
    if (_groups[idx].ownerId !== actorId) {
        const err = (new Error('Only owner can regenerate share hash')) as any;
        err.code = 'NOT_OWNER';
        throw err;
    }
    const newHash = generateShareHash(groupId, `${Date.now()}-${Math.random()}`);
    _groups[idx] = { ..._groups[idx], shareHash: newHash, updatedAt: new Date().toISOString() };
    await _persist();
    return newHash;
}

/**
 * Archive (soft-delete). Apenas owner.
 * @param {string} groupId
 * @param {string} actorId
 * @returns {Promise<boolean>}
 */
export async function archiveGroup(groupId: any, actorId: any) {
    await _ensureLoaded();
    const idx = _groups.findIndex((g: any) => g.id === groupId);
    if (idx < 0) return false;
    if (_groups[idx].ownerId !== actorId) {
        const err = (new Error('Only owner can archive group')) as any;
        err.code = 'NOT_OWNER';
        throw err;
    }
    _groups[idx] = { ..._groups[idx], archived: true, archivedAt: new Date().toISOString() };
    await _persist();
    return true;
}

/**
 * Busca grupo por shareHash (usado ao resolver /radar/shared/:hash).
 * @param {string} hash
 * @returns {Promise<Object|null>}
 */
export async function findByShareHash(hash: any) {
    if (!hash || typeof hash !== 'string') return null;
    await _ensureLoaded();
    return _groups.find((g: any) => g.shareHash === hash && !g.archived && g.active !== false) || null;
}

// ──────────────────────────────────────────────────────────────────────
// Test helper
// ──────────────────────────────────────────────────────────────────────

export async function _resetForTesting(clearIdb = false) {
    _groups = [];
    _loaded = !clearIdb;
    if (clearIdb) {
        try {
            await idbSet(IDB_KEY, []);
        } catch (e: any) {
            console.debug('[radar/accessGroups] clearIdb:', /** @type {any} */ (e)?.message || e);
        }
    }
}
