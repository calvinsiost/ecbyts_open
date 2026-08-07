// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (auth/permissions).
//
// Aplicação direta da recomendação #5 do scripts/refactor-opportunities.mjs:
// utils/auth/permissions.ts tem fan-in 19 no maior SCC (também é fonte de
// back-edge cross-dir com score 382 → app/js/core/elements/manager.js). Extrair
// pure-logic (constantes frozen + role/action math) reduz fan-in interno ao
// ciclo e libera carve-out para outros consumers (RBAC inspector, audit log,
// CLI eis-cli) sem depender de getUserEmail()/CONFIG/window state.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Mantém compatibilidade com ECO1 import legacy
// (sanitizeActionOverrides preserva contrato).
//
// Spec NOT:
// - NÃO ler module state (accessConfig — caller passa rules/observerMode)
// - NÃO chamar getUserEmail()/isLoggedIn() — caller injeta resultado
// - NÃO ler CONFIG.ENABLE_ACTION_RBAC — caller decide via flag boolean
// - NÃO emoji
//
// Extracted helpers:
//   - Role / Action / ObserverMode / ActionOverride (types canonical)
//   - AccessRule (canonical shape)
//   - VALID_ACTIONS_LIST                    (frozen array, 8 actions)
//   - ROLE_HIERARCHY_LIST                   (frozen array, 6 roles)
//   - ACTION_DEFAULTS_MAP                   (frozen Record action→minRole)
//   - OBSERVER_MODES_LIST                   (frozen array)
//   - roleAtLeast(role, minRole)            (pure hierarchy check)
//   - findHighestRoleForArea(rules, email, areaId)
//   - resolveObserverFallback(mode, isLoggedIn)
//   - evaluateActionOverrides(rules, email, action, areaId)
//   - sanitizeActionOverrides(overrides)    (ECO1 import boundary safe)
//   - flattenTree(nodes)                    (depth-first traversal)

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'observer' | 'none';

export type Action = 'view' | 'edit' | 'delete' | 'export' | 'admin' | 'import' | 'share' | 'report';

export type ObserverMode = 'disabled' | 'authenticated' | 'public';

export type ActionOverride = 'deny' | 'grant';

export interface AccessRule {
    email: string;
    role: Role | string;
    areas: ReadonlyArray<string>;
    actionOverrides?: Readonly<Record<string, ActionOverride>>;
}

export interface TreeNodeLike {
    id?: string;
    children?: ReadonlyArray<TreeNodeLike>;
}

/**
 * Frozen list of valid action names recognized by the RBAC engine.
 * Matches VALID_ACTIONS Set @ permissions.ts:43 (8 actions).
 */
export const VALID_ACTIONS_LIST: ReadonlyArray<Action> = Object.freeze([
    'view',
    'edit',
    'delete',
    'export',
    'admin',
    'import',
    'share',
    'report',
]);

/**
 * Frozen role hierarchy, most-privileged first.
 * Index 0 = most privileged. roleAtLeast usa este array.
 *
 * Matches ROLE_HIERARCHY @ permissions.ts:48.
 */
export const ROLE_HIERARCHY_LIST: ReadonlyArray<Role> = Object.freeze([
    'owner',
    'admin',
    'editor',
    'viewer',
    'observer',
    'none',
]);

/**
 * Minimum role required per action when no rule-level override applies.
 *
 * Matches ACTION_DEFAULTS @ permissions.ts:53.
 */
export const ACTION_DEFAULTS_MAP: Readonly<Record<Action, Role>> = Object.freeze({
    view: 'observer',
    edit: 'editor',
    delete: 'editor',
    export: 'viewer',
    admin: 'admin',
    import: 'editor',
    share: 'admin',
    report: 'viewer',
});

/**
 * Frozen list of valid observer modes (used by setObserverMode validation).
 */
export const OBSERVER_MODES_LIST: ReadonlyArray<ObserverMode> = Object.freeze([
    'disabled',
    'authenticated',
    'public',
]);

/**
 * Hierarchy check: returns true se role tem privilégio ≥ minRole.
 * Index menor em ROLE_HIERARCHY_LIST = mais privilegiado.
 *
 * Matches _roleAtLeast @ permissions.ts:206 (privado no original).
 */
export function roleAtLeast(role: Role | string | null | undefined, minRole: Role | string): boolean {
    if (!role || !minRole) return false;
    const i = ROLE_HIERARCHY_LIST.indexOf(role as Role);
    const j = ROLE_HIERARCHY_LIST.indexOf(minRole as Role);
    if (i === -1 || j === -1) return false;
    return i <= j;
}

/**
 * Find highest role for email scoped to areaId.
 * Caller passa rules + email + areaId (opcional).
 *   areaId vazio → busca rule global '*'
 *   wildcard '*' em rule.areas → match em qualquer área
 *
 * Matches getUserRole loop body @ permissions.ts:178-189.
 */
export function findHighestRoleForArea(
    rules: ReadonlyArray<AccessRule>,
    email: string | null | undefined,
    areaId?: string | null,
): Role | null {
    if (!email) return null;
    const userRules = rules.filter((r) => r.email === email);
    if (userRules.length === 0) return null;
    const orderedRoles: ReadonlyArray<Role> = ['admin', 'editor', 'viewer'];
    for (const role of orderedRoles) {
        for (const rule of userRules) {
            if (rule.role !== role) continue;
            const areas = rule.areas || [];
            if (!areaId || areas.includes('*') || areas.includes(areaId)) {
                return role;
            }
        }
    }
    return null;
}

/**
 * Resolve observer mode fallback when user has no explicit rules.
 *   'public'        → 'observer' sempre
 *   'authenticated' → 'observer' se isLoggedIn === true
 *   default         → 'none'
 *
 * Matches getUserRole fallback @ permissions.ts:191-196.
 */
export function resolveObserverFallback(mode: ObserverMode, isLoggedIn: boolean): Role {
    if (mode === 'public') return 'observer';
    if (mode === 'authenticated' && isLoggedIn) return 'observer';
    return 'none';
}

/**
 * Evaluate per-action override resolution.
 *   deny tem prioridade sobre grant
 *   ambos têm prioridade sobre role default (caller resolve default fora)
 * Returns { hasDeny, hasGrant } — caller decide:
 *   hasDeny  → bloqueia
 *   hasGrant → permite
 *   nenhum   → cai no default por role
 *
 * Matches canDo override loop @ permissions.ts:233-255.
 */
export function evaluateActionOverrides(
    rules: ReadonlyArray<AccessRule>,
    email: string | null | undefined,
    action: string,
    areaId?: string | null,
): { hasDeny: boolean; hasGrant: boolean } {
    if (!email) return { hasDeny: false, hasGrant: false };
    const matched = rules.filter((r) => {
        if (r.email !== email) return false;
        const areas = r.areas || [];
        if (!areaId || areas.length === 0 || areas.includes('*') || areas.includes(areaId)) return true;
        return false;
    });
    let hasDeny = false;
    let hasGrant = false;
    for (const rule of matched) {
        const override = rule.actionOverrides?.[action];
        if (override === 'deny') hasDeny = true;
        if (override === 'grant') hasGrant = true;
    }
    return { hasDeny, hasGrant };
}

/**
 * Sanitize actionOverrides object from ECO1/ECBT import.
 *   Remove entries com action inválido (fora de VALID_ACTIONS_LIST)
 *   Remove entries com value ≠ 'deny' | 'grant'
 *
 * Matches sanitizeActionOverrides @ permissions.ts:268.
 * Mantido aqui para que ECBT import boundary possa importar sem trazer
 * permissions.ts inteiro (e seus side-effects de session/CONFIG/elements).
 */
export function sanitizeActionOverrides(overrides: unknown): Record<string, ActionOverride> {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return {};
    }
    const validSet = new Set<string>(VALID_ACTIONS_LIST as ReadonlyArray<string>);
    const clean: Record<string, ActionOverride> = {};
    for (const [action, value] of Object.entries(overrides as Record<string, unknown>)) {
        if (validSet.has(action) && (value === 'deny' || value === 'grant')) {
            clean[action] = value;
        }
    }
    return clean;
}

/**
 * Type-guard for AccessRule shape (caller-side validation antes de push).
 * Aceita rules vindas de ECBT import / form / API — não exige actionOverrides.
 */
export function isValidAccessRule(value: unknown): value is AccessRule {
    if (!value || typeof value !== 'object') return false;
    const r = value as AccessRule;
    if (typeof r.email !== 'string' || r.email.length === 0) return false;
    if (typeof r.role !== 'string') return false;
    if (!Array.isArray(r.areas)) return false;
    return true;
}

/**
 * Depth-first flatten of a node tree (areasTreeData shape).
 * Preserva ordem topológica: pai antes dos filhos.
 *
 * Matches flattenTree @ permissions.ts:402 (privado no original).
 */
export function flattenTree<T extends TreeNodeLike>(nodes: ReadonlyArray<T>): T[] {
    const result: T[] = [];
    function walk(node: T): void {
        result.push(node);
        const children = node.children;
        if (Array.isArray(children)) {
            for (const child of children) {
                walk(child as T);
            }
        }
    }
    for (const node of nodes) walk(node);
    return result;
}

/**
 * Validate observer mode string from external sources (import, API, form).
 * Returns true se mode está em OBSERVER_MODES_LIST.
 */
export function isValidObserverMode(value: unknown): value is ObserverMode {
    return typeof value === 'string' && (OBSERVER_MODES_LIST as ReadonlyArray<string>).includes(value);
}
