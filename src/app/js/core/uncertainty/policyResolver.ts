// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * policyResolver.ts — Phase 2 TS source for uncertainty policy resolution.
 *
 * @typedef structures from policyResolver.js promoted to exported types.
 * No behavior change — drop-in replacement when build:app:ts copies to app/js/.
 */

export interface UncertaintyPolicyScope {
    workspace_id?: string | null;
    matrix?: string | null;
    project_id?: string | null;
}

export interface UncertaintyPolicy {
    policy_id?: string;
    scope?: UncertaintyPolicyScope;
    created_at?: string;
    coverage?: number;
    k_default?: number;
    monte_carlo_samples?: number;
    [k: string]: unknown;
}

export interface UncertaintyResolveContext {
    workspace_id?: string | null;
    matrix?: string | null;
    project_id?: string | null;
}

export interface UncertaintyResolveResult {
    policy: UncertaintyPolicy;
    source: string;
    telemetryEvent: string;
}

const DEFAULT_POLICY: Readonly<UncertaintyPolicy> = Object.freeze({
    policy_id: 'default',
    scope: { workspace_id: null, matrix: null, project_id: null },
    coverage: 0.95,
    k_default: 2,
    monte_carlo_samples: 2000,
});

function normalizeDateMs(value: unknown): number {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
}

function rankScope(scope: UncertaintyPolicyScope | null | undefined): number {
    if (scope?.project_id) return 3;
    if (scope?.matrix) return 2;
    return 1;
}

export function resolveUncertaintyPolicy(
    policies: UncertaintyPolicy[] = [],
    ctx: UncertaintyResolveContext = {},
): UncertaintyResolveResult {
    const workspaceId = ctx?.workspace_id ?? null;
    const matrix = ctx?.matrix ?? null;
    const projectId = ctx?.project_id ?? null;

    const filtered = (policies || []).filter((p) => {
        if (!p || typeof p !== 'object') return false;
        const s = p.scope || {};
        if (s.workspace_id && workspaceId && s.workspace_id !== workspaceId) return false;
        if (s.workspace_id && !workspaceId) return false;
        if (s.matrix && s.matrix !== matrix) return false;
        if (s.project_id && s.project_id !== projectId) return false;
        return true;
    });

    if (!filtered.length) {
        return {
            policy: { ...DEFAULT_POLICY },
            source: 'fallback_default',
            telemetryEvent: 'policy_fallback_used',
        };
    }

    const [winner] = filtered.sort((a, b) => {
        const rankDiff = rankScope(b.scope) - rankScope(a.scope);
        if (rankDiff !== 0) return rankDiff;
        const dateDiff = normalizeDateMs(b.created_at) - normalizeDateMs(a.created_at);
        if (dateDiff !== 0) return dateDiff;
        return String(a.policy_id || '').localeCompare(String(b.policy_id || ''));
    });

    if (!winner) {
        return {
            policy: { ...DEFAULT_POLICY },
            source: 'fallback_default',
            telemetryEvent: 'policy_fallback_used',
        };
    }

    const source = winner.scope?.project_id
        ? 'project_override'
        : winner.scope?.matrix
          ? 'matrix'
          : 'workspace_default';

    return {
        policy: winner,
        source,
        telemetryEvent: 'policy_applied',
    };
}
