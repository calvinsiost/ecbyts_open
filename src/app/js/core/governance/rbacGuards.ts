// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   RBAC GUARDS — G7: Role-Based Access Control (client-side guards)

   Camada cliente que espelha as políticas RLS do Supabase.
   O servidor (Supabase) é a fonte de verdade via Row Level Security;
   este módulo apenas evita operações proibidas antes de chegar à
   rede (melhor UX) e controla visibilidade de botões/ações no DOM.

   Roles (6 níveis, do mais amplo ao mais restrito):
   - owner       — criador do modelo; full access
   - editor      — colaborador; CRUD em recursos, sem admin
   - auditor     — read-only + pode inserir no audit_trail/decision_log
   - regulator   — read-only (CETESB/IBAMA/agente externo)
   - viewer      — read-only (stakeholder genérico)
   - anonymous   — sem acesso (pre-auth ou share code inválido)

   Actions suportadas (granular):
   - 'model.read', 'model.update', 'model.delete'
   - 'observation.create', 'observation.update', 'observation.correct'
   - 'export.csv', 'export.esg', 'export.docx'
   - 'audit.read', 'audit.write'
   - 'decision.read', 'decision.write'
   - 'share.create', 'share.revoke'
   - 'retention.configure'

   API pura: can(role, action) → boolean.
   Decorators de DOM: guardButton(el, action, role).

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G7)
   ================================================================ */

export const ROLES: ReadonlyArray<string> = Object.freeze([
    'owner',
    'editor',
    'auditor',
    'regulator',
    'viewer',
    'anonymous',
]);

/**
 * Permission matrix: role → Set of allowed actions.
 * Higher roles inherit from lower ones explicitly (no implicit chaining
 * to keep the matrix auditable line by line).
 */
export const PERMISSIONS: Record<string, ReadonlyArray<string>> = Object.freeze({
    owner: Object.freeze([
        'model.read',
        'model.update',
        'model.delete',
        'observation.create',
        'observation.update',
        'observation.correct',
        'export.csv',
        'export.esg',
        'export.docx',
        'audit.read',
        'audit.write',
        'decision.read',
        'decision.write',
        'share.create',
        'share.revoke',
        'retention.configure',
    ]),
    editor: Object.freeze([
        'model.read',
        'model.update',
        'observation.create',
        'observation.update',
        'observation.correct',
        'export.csv',
        'export.esg',
        'export.docx',
        'audit.read',
        'audit.write',
        'decision.read',
        'decision.write',
    ]),
    auditor: Object.freeze([
        'model.read',
        'export.csv',
        'export.esg',
        'export.docx',
        'audit.read',
        'audit.write',
        'decision.read',
        'decision.write',
    ]),
    regulator: Object.freeze(['model.read', 'export.csv', 'export.esg', 'audit.read', 'decision.read']),
    viewer: Object.freeze(['model.read', 'export.csv', 'audit.read', 'decision.read']),
    anonymous: Object.freeze([]),
});

/**
 * Canonical permission check. Pure function, no side effects.
 *
 * @param role - One of ROLES
 * @param action - Granular action identifier
 */
export function can(role: string, action: string): boolean {
    if (!role || typeof role !== 'string') return false;
    if (!action || typeof action !== 'string') return false;
    const allowed = PERMISSIONS[role];
    if (!allowed) return false;
    return allowed.includes(action);
}

/**
 * Assert that a role has permission, throw a readable error otherwise.
 * Use at the top of handlers that perform side effects.
 *
 * @throws {Error} if permission denied
 */
export function requirePermission(role: string, action: string): void {
    if (!can(role, action)) {
        throw new Error(`Permission denied: role "${role}" cannot perform "${action}"`);
    }
}

/**
 * Check if a role is read-only (cannot mutate any resource).
 */
export function isReadOnlyRole(role: string): boolean {
    return role === 'regulator' || role === 'viewer';
}

/**
 * Check if a role can write to audit/decision logs (auditor-or-above).
 */
export function canWriteAudit(role: string): boolean {
    return can(role, 'audit.write');
}

/**
 * Compute the effective role for the current context.
 * Resolution order:
 *   1. If session has an owner claim for the model → 'owner'
 *   2. If a share code was consumed → share's assigned role
 *   3. If an authenticated user with no explicit role → 'viewer'
 *   4. Otherwise → 'anonymous'
 */
export function resolveEffectiveRole(
    context: {
        session?: { user?: { id?: string }; isOwner?: boolean } | null;
        share?: { role?: string } | null;
    } = {},
): string {
    const { session, share } = context;
    if (session && session.isOwner === true) return 'owner';
    if (share && typeof share.role === 'string' && ROLES.includes(share.role)) {
        return share.role;
    }
    if (session && session.user && session.user.id) return 'viewer';
    return 'anonymous';
}

/**
 * Disable a DOM button when the current role lacks permission for the action.
 * Adds a tooltip explaining why. Idempotent - safe to call on every render.
 *
 * @param element - Target button
 * @param role - Current role
 * @param action - Required action
 * @param reasonLabel - Fallback tooltip text
 */
export function guardButton(
    element: HTMLElement | null,
    role: string,
    action: string,
    reasonLabel: string = 'Permission denied',
): void {
    if (!element || typeof element.setAttribute !== 'function') return;
    if (can(role, action)) {
        element.removeAttribute('disabled');
        element.removeAttribute('data-rbac-denied');
        // Remove any rbac-added tooltip only if we added it
        if (element.getAttribute('data-rbac-tooltip') === 'true') {
            element.removeAttribute('title');
            element.removeAttribute('data-rbac-tooltip');
        }
    } else {
        element.setAttribute('disabled', 'disabled');
        element.setAttribute('data-rbac-denied', action);
        element.setAttribute('title', `${reasonLabel}: ${action}`);
        element.setAttribute('data-rbac-tooltip', 'true');
    }
}
