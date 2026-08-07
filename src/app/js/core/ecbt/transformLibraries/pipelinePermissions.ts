// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Permissions (Phase 16)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S16
 *
 * Phase 16 (2026-05-01) - pure-logic engine RBAC para pipelines.
 * Define quem pode VIEW / RUN / EDIT / SHARE / DELETE / ADMIN cada
 * pipeline. Escopo: per-pipeline ACL + per-org role mapping.
 *
 * Estratégia:
 *   - Roles canônicos com hierarchical inheritance
 *   - 6 ações: VIEW / RUN / EDIT / SHARE / DELETE / ADMIN
 *   - ACL: { ownerId, orgId, sharedWith[], publicAccess }
 *   - Engine puro: input(actor, pipeline, action) → boolean + reason
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Ações canônicas (ordenadas por nível de privilégio). */
export const PIPELINE_ACTIONS = Object.freeze(['VIEW', 'RUN', 'EDIT', 'SHARE', 'DELETE', 'ADMIN']);

/** Roles canônicos. */
export const PIPELINE_ROLES = Object.freeze(['viewer', 'runner', 'editor', 'maintainer', 'admin']);

/** Matriz de permissões por role (frozen). */
export const ROLE_PERMISSIONS = Object.freeze({
    viewer: Object.freeze(new Set(['VIEW'])),
    runner: Object.freeze(new Set(['VIEW', 'RUN'])),
    editor: Object.freeze(new Set(['VIEW', 'RUN', 'EDIT'])),
    maintainer: Object.freeze(new Set(['VIEW', 'RUN', 'EDIT', 'SHARE'])),
    admin: Object.freeze(new Set(['VIEW', 'RUN', 'EDIT', 'SHARE', 'DELETE', 'ADMIN'])),
});

/** Public access tiers (apenas read-only). */
export const PUBLIC_ACCESS_TIERS = Object.freeze(['none', 'view', 'run']);

/** Identidade do módulo. */
export const PIPELINE_PERMISSIONS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 16,
    deliveredAt: '2026-05-01',
    actions: PIPELINE_ACTIONS,
    roles: PIPELINE_ROLES,
    publicTiers: PUBLIC_ACCESS_TIERS,
});

/**
 * Verifica se action é canônica.
 */
export function isValidAction(action: any) {
    return typeof action === 'string' && PIPELINE_ACTIONS.includes(action);
}

/**
 * Verifica se role é canônica.
 */
export function isValidRole(role: any) {
    return typeof role === 'string' && PIPELINE_ROLES.includes(role);
}

/**
 * Cria objeto frozen de ACL.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createAcl(spec: Record<string, any>): Object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createAcl: spec required');
    }
    if (typeof spec.ownerId !== 'string' || !spec.ownerId.trim()) {
        throw new TypeError('createAcl: ownerId required');
    }
    const sharedWith = Array.isArray(spec.sharedWith)
        ? spec.sharedWith
              .filter(
                  (s: any) =>
                      s && typeof s === 'object' && s.userId && isValidRole((s as any).role),
              )
              .map((s: any) => Object.freeze({ userId: s.userId, role: s.role }))
        : [];

    const publicAccess = PUBLIC_ACCESS_TIERS.includes(spec.publicAccess) ? spec.publicAccess : 'none';

    return Object.freeze({
        ownerId: spec.ownerId,
        orgId: spec.orgId || null,
        sharedWith: Object.freeze(sharedWith),
        publicAccess,
    });
}

/**
 * Verifica se actor (com role) tem permissão para action.
 *
 * @param {string} role
 * @param {string} action
 * @returns {boolean}
 */
export function roleAllows(role: string, action: string): boolean {
    if (!isValidRole(role) || !isValidAction(action)) return false;
    const perms = (ROLE_PERMISSIONS as Record<string, any>)[role];
    return perms instanceof Set && perms.has(action);
}

/**
 * Resolve role do actor sobre uma ACL.
 *
 * Precedence:
 *   1. owner (sempre admin)
 *   2. sharedWith match
 *   3. publicAccess (view/run)
 *   4. null (sem acesso)
 *
 * @param {Record<string, any>} acl
 * @param {Record<string, any>} any> - { userId, orgId? }
 * @returns {string|null}
 */
export function resolveRole(acl: Record<string, any>, actor: Record<string, any>): string|null {
    if (!acl || typeof acl !== 'object') return null;
    if (!actor || typeof actor !== 'object' || !actor.userId) {
        // Anonymous - só publicAccess
        if (acl.publicAccess === 'view') return 'viewer';
        if (acl.publicAccess === 'run') return 'runner';
        return null;
    }
    if (acl.ownerId === actor.userId) return 'admin';
    if (Array.isArray(acl.sharedWith)) {
        const entry = acl.sharedWith.find((e: any) => e && e.userId === actor.userId);
        if (entry && isValidRole(entry.role)) return entry.role;
    }
    if (acl.publicAccess === 'view') return 'viewer';
    if (acl.publicAccess === 'run') return 'runner';
    return null;
}

/**
 * Verifica permissão para action no contexto de ACL+actor.
 *
 * @param {Object} acl
 * @param {Object} actor
 * @param {string} action
 * @returns {{allowed: boolean, role: string|null, reason: string}}
 */
export function checkPermission(acl: Object, actor: Object, action: string): {allowed: boolean, role: string|null, reason: string} {
    if (!acl || typeof acl !== 'object') {
        return Object.freeze({ allowed: false, role: null, reason: 'acl_missing' });
    }
    if (!isValidAction(action)) {
        return Object.freeze({ allowed: false, role: null, reason: 'action_invalid' });
    }
    const role = resolveRole(acl, actor);
    if (!role) {
        return Object.freeze({ allowed: false, role: null, reason: 'no_role' });
    }
    if (!roleAllows(role, action)) {
        return Object.freeze({
            allowed: false,
            role,
            reason: `role_${role}_insufficient_for_${action}`,
        });
    }
    return Object.freeze({ allowed: true, role, reason: 'granted' });
}

/**
 * Adiciona usuário ao sharedWith (retorna novo ACL frozen).
 *
 * @param {Record<string, any>} acl
 * @param {string} any>
 * @param {string} userId
 * @returns {Object}
 */
export function shareWith(acl: Record<string, any>, userId: string, role: string): Object {
    if (!acl || typeof acl !== 'object') throw new TypeError('shareWith: acl required');
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new TypeError('shareWith: userId required');
    }
    if (!isValidRole(role)) {
        throw new TypeError('shareWith: invalid role');
    }
    if (acl.ownerId === userId) {
        // Owner já tem admin - no-op
        return acl;
    }
    const filtered = (acl.sharedWith || []).filter((e: any) => e && e.userId !== userId);
    return Object.freeze({
        ...acl,
        sharedWith: Object.freeze([...filtered, Object.freeze({ userId, role })]),
    });
}

/**
 * Remove usuário do sharedWith.
 */
export function revokeAccess(acl: any, userId: any) {
    if (!acl || typeof acl !== 'object') throw new TypeError('revokeAccess: acl required');
    if (typeof userId !== 'string') return acl;
    const filtered = (acl.sharedWith || []).filter((e: any) => e && e.userId !== userId);
    return Object.freeze({
        ...acl,
        sharedWith: Object.freeze(filtered),
    });
}

/**
 * Lista actions permitidas para actor.
 *
 * @param {Object} acl
 * @param {Object} actor
 * @returns {Array<string>}
 */
export function getAllowedActions(acl: Object, actor: Object): Array<string> {
    const role = resolveRole(acl, actor);
    if (!role) return [];
    const perms = (ROLE_PERMISSIONS as Record<string, any>)[role];
    return perms instanceof Set ? [...perms].sort() : [];
}

/**
 * Sumariza ACL.
 */
export function summarizeAcl(acl: any) {
    const empty = {
        owner: null,
        sharedCount: 0,
        roleCounts: { viewer: 0, runner: 0, editor: 0, maintainer: 0, admin: 0 },
        publicAccess: 'none',
        isPublic: false,
    };
    if (!acl || typeof acl !== 'object') return empty;
        const roleCounts: Record<string, number>= { viewer: 0, runner: 0, editor: 0, maintainer: 0, admin: 0 };
    if (Array.isArray(acl.sharedWith)) {
        for (const e of acl.sharedWith) {
            if (e && isValidRole(e.role)) roleCounts[e.role] = (roleCounts[e.role] ?? 0) + 1;
        }
    }
    return {
        owner: acl.ownerId || null,
        sharedCount: Array.isArray(acl.sharedWith) ? acl.sharedWith.length : 0,
        roleCounts,
        publicAccess: acl.publicAccess || 'none',
        isPublic: acl.publicAccess && acl.publicAccess !== 'none',
    };
}

/**
 * Module identity export.
 */
export const pipelinePermissionsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 16,
    deliveredAt: '2026-05-01',
    actions: PIPELINE_ACTIONS,
    roles: PIPELINE_ROLES,
    exports: [
        'PIPELINE_ACTIONS',
        'PIPELINE_ROLES',
        'ROLE_PERMISSIONS',
        'PUBLIC_ACCESS_TIERS',
        'PIPELINE_PERMISSIONS_META',
        'isValidAction',
        'isValidRole',
        'createAcl',
        'roleAllows',
        'resolveRole',
        'checkPermission',
        'shareWith',
        'revokeAccess',
        'getAllowedActions',
        'summarizeAcl',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
