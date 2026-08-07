// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Authorization - Phase 45
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S45
 *
 * Phase 45 - pure-logic actor/pipeline authorization layer built on top of
 * the role/permission catalog from Phase 16 (pipelinePermissions). Provides
 * a high-level API for checking whether an actor can execute or edit a
 * given pipeline (with its ACL) and a require-style guard that throws when
 * authorization fails.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import {
    PIPELINE_ACTIONS,
    PIPELINE_ROLES,
    ROLE_PERMISSIONS,
    isValidAction,
    isValidRole,
    resolveRole,
    roleAllows,
} from './pipelinePermissions.js';

/** Frozen meta. */
export const META = Object.freeze({
    phase: 45,
    name: 'pipelineAuthorization',
    actions: PIPELINE_ACTIONS,
    roles: PIPELINE_ROLES,
});

/**
 * Normalize an actor descriptor into `{ id, role|null }`.
 * Accepts string id, or `{ id, role }` object.
 *
 * @param actor
 */
function normalizeActor(actor: unknown): { id: string; role: string | null } | null {
    if (actor == null) return null;
    if (typeof actor === 'string') {
        const id = actor.trim();
        return id ? { id, role: null } : null;
    }
    if (typeof actor === 'object') {
        const a = actor as { id?: unknown; role?: unknown };
        const id = typeof a.id === 'string' ? a.id.trim() : '';
        if (!id) return null;
        const role = isValidRole(a.role) ? (a.role as string) : null;
        return { id, role };
    }
    return null;
}

/**
 * Normalize a pipeline descriptor into `{ id, ownerId, acl }`.
 *
 * @param pipeline
 */
function normalizePipeline(
    pipeline: unknown,
): { id: string; ownerId: string | null; acl: Record<string, unknown> | null } | null {
    if (!pipeline || typeof pipeline !== 'object') return null;
    const p = pipeline as { id?: unknown; ownerId?: unknown; acl?: unknown };
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id) return null;
    const ownerId = typeof p.ownerId === 'string' && p.ownerId.trim() ? p.ownerId.trim() : null;
    const acl = p.acl && typeof p.acl === 'object' ? (p.acl as Record<string, unknown>) : null;
    return { id, ownerId, acl };
}

/**
 * Resolve which role applies to actor on this pipeline.
 * Order: actor.role override > acl.shared[actor.id] > acl.publicRole > null.
 * If actor is the owner, returns 'admin'.
 *
 * @param actor
 * @param pipeline
 */
function resolveActorRole(
    actor: { id: string; role: string | null } | null,
    pipeline: { id: string; ownerId: string | null; acl: Record<string, unknown> | null } | null,
): string | null {
    if (!actor || !pipeline) return null;
    if (pipeline.ownerId && pipeline.ownerId === actor.id) return 'admin';
    if (actor.role) return actor.role;
    if (pipeline.acl) {
        try {
            const r = resolveRole(pipeline.acl, { userId: actor.id });
            if (isValidRole(r)) return r;
        } catch (error: any) {
            console.debug('[pipelineAuthorization] resolveRole:', error?.message || error);
            // resolveRole throws on invalid acl - fall through to null
        }
    }
    return null;
}

/**
 * Core check - returns `{ allowed, reason, role }`.
 *
 * @param actor
 * @param pipeline
 * @param action - one of PIPELINE_ACTIONS
 */
export function canExecute(
    actor: unknown,
    pipeline: unknown,
    action: string = 'RUN',
): { allowed: boolean; reason: string; role: string | null } {
    if (!isValidAction(action)) {
        return { allowed: false, reason: 'invalid_action', role: null };
    }
    const a = normalizeActor(actor);
    if (!a) return { allowed: false, reason: 'invalid_actor', role: null };
    const p = normalizePipeline(pipeline);
    if (!p) return { allowed: false, reason: 'invalid_pipeline', role: null };

    const role = resolveActorRole(a, p);
    if (!role) return { allowed: false, reason: 'no_role', role: null };
    if (!roleAllows(role, action)) {
        return { allowed: false, reason: 'role_lacks_action', role };
    }
    return { allowed: true, reason: 'ok', role };
}

/**
 * Convenience: actor can edit pipeline definition (action='EDIT').
 *
 * @param actor
 * @param pipeline
 */
export function canEdit(
    actor: unknown,
    pipeline: unknown,
): { allowed: boolean; reason: string; role: string | null } {
    return canExecute(actor, pipeline, 'EDIT');
}

/**
 * Throws an Error if not authorized. Used as a guard at API boundaries.
 * Error.code carries the failure reason for programmatic handling.
 *
 * @param actor
 * @param pipeline
 * @param action
 */
export function requirePermission(
    actor: unknown,
    pipeline: unknown,
    action: string,
): { allowed: boolean; reason: string; role: string | null } {
    const res = canExecute(actor, pipeline, action);
    if (!res.allowed) {
        const err = new Error(`pipeline authorization denied: ${res.reason}`) as Error & {
            code: string | null;
            role: string | null;
            action: string | undefined;
        };
        err.code = res.reason;
        err.role = res.role;
        err.action = action;
        throw err;
    }
    return res;
}

/**
 * Summarize all actions an actor may perform on a pipeline.
 * Returns `{ actorId, role, actions: string[], owner: boolean }`.
 *
 * @param actor
 * @param pipeline
 */
export function summarizeAuthz(
    actor: unknown,
    pipeline: unknown,
): { actorId: string | null; role: string | null; actions: string[]; owner: boolean } {
    const a = normalizeActor(actor);
    const p = normalizePipeline(pipeline);
    if (!a || !p) {
        return { actorId: a ? a.id : null, role: null, actions: [], owner: false };
    }
    const role = resolveActorRole(a, p);
    if (!role) {
        return { actorId: a.id, role: null, actions: [], owner: false };
    }
    const allowed = ROLE_PERMISSIONS[role as 'viewer' | 'runner' | 'editor' | 'maintainer' | 'admin'];
    const actions = PIPELINE_ACTIONS.filter((act: string) => allowed && allowed.has(act));
    return {
        actorId: a.id,
        role,
        actions,
        owner: !!(p.ownerId && p.ownerId === a.id),
    };
}
