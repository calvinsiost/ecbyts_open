// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Model Compliance Bindings — pure logic (RF10 / B4 / B5 / ADR A9 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Implements the multi-jurisdiction case: one model may carry N preset
 * bindings simultaneously, each with a declared `PresetScope`. The schema
 * is the one declared in spec §4.1 (D7 pendente Calvin homologation —
 * implementação aceita o refator anti-regressivo: caller pode usar 1
 * binding como single-preset equivalent).
 *
 * Pure: caller passes the (frozen) state + an action; module returns a
 * NEW frozen state. Append-only style; never mutates the input.
 *
 * Anti-requirements:
 *   - Duplicate (presetId, scope) → addBinding rejected with explicit error
 *   - Removing a non-existent binding → no-op, never throws
 *   - Multiple bindings on the same scope → flagged as conflict (B5)
 *
 * Tests live in `tests/compliance-model-bindings-pure.test.mjs`.
 */

export type PresetScope =
    | 'soil'
    | 'groundwater'
    | 'surface-water'
    | 'air'
    | 'ghg'
    | 'border-tax'
    | 'risk-assessment'
    | 'monetary'
    | 'all';

export interface ModelPresetBinding {
    readonly presetId: string;
    readonly scope: PresetScope;
    readonly contentHashSnapshot: string;
    readonly activatedAt: string;
    readonly activatedBy: string;
}

export interface ModelComplianceState {
    readonly bindings: ReadonlyArray<ModelPresetBinding>;
    // `| undefined` explícito: freezeState repassa campos opcionais do state de
    // entrada (exactOptionalPropertyTypes exige a união na prop opcional).
    readonly locked?: boolean | undefined;
    readonly lockedAt?: string | undefined;
    readonly lockedBy?: string | undefined;
}

export interface BindingMutationResult {
    readonly state: ModelComplianceState;
    readonly changed: boolean;
    readonly error?: string;
}

export interface ScopeCoverageReport {
    readonly required: ReadonlyArray<PresetScope>;
    readonly covered: ReadonlyArray<PresetScope>;
    readonly missing: ReadonlyArray<PresetScope>;
    readonly conflicts: ReadonlyArray<PresetScope>;
    readonly complete: boolean;
}

const ALLOWED_SCOPES: ReadonlyArray<PresetScope> = Object.freeze([
    'soil',
    'groundwater',
    'surface-water',
    'air',
    'ghg',
    'border-tax',
    'risk-assessment',
    'monetary',
    'all',
]);

function isAllowedScope(s: unknown): s is PresetScope {
    return typeof s === 'string' && ALLOWED_SCOPES.includes(s as PresetScope);
}

function freezeBinding(b: ModelPresetBinding): ModelPresetBinding {
    return Object.freeze({ ...b });
}

function freezeState(s: ModelComplianceState): ModelComplianceState {
    return Object.freeze({
        bindings: Object.freeze(s.bindings.map(freezeBinding)),
        locked: s.locked,
        lockedAt: s.lockedAt,
        lockedBy: s.lockedBy,
    });
}

/**
 * Initial empty state — no preset bindings, model not locked.
 */
export function emptyBindingState(): ModelComplianceState {
    return freezeState({ bindings: [] });
}

/**
 * Add a binding to the state. Returns frozen new state + change flag.
 *
 * Rules:
 *   - Duplicate (presetId, scope) → returns input state + error
 *   - Missing required fields → returns input state + error
 *   - Invalid scope → returns input state + error
 */
export function addBinding(
    state: ModelComplianceState | null | undefined,
    binding: Partial<ModelPresetBinding> | null | undefined,
): BindingMutationResult {
    const current = state && Array.isArray(state.bindings) ? state : emptyBindingState();
    if (!binding || typeof binding !== 'object') {
        return Object.freeze({ state: current, changed: false, error: 'binding_invalid' });
    }
    const presetId = binding.presetId;
    const scope = binding.scope as PresetScope | undefined;
    const contentHashSnapshot = binding.contentHashSnapshot;
    const activatedAt = binding.activatedAt;
    const activatedBy = binding.activatedBy;
    if (typeof presetId !== 'string' || presetId.length === 0) {
        return Object.freeze({ state: current, changed: false, error: 'presetId_missing' });
    }
    if (!isAllowedScope(scope)) {
        return Object.freeze({ state: current, changed: false, error: 'scope_invalid' });
    }
    if (typeof contentHashSnapshot !== 'string' || contentHashSnapshot.length === 0) {
        return Object.freeze({ state: current, changed: false, error: 'contentHashSnapshot_missing' });
    }
    if (typeof activatedAt !== 'string' || !Number.isFinite(Date.parse(activatedAt))) {
        return Object.freeze({ state: current, changed: false, error: 'activatedAt_invalid_iso' });
    }
    if (typeof activatedBy !== 'string' || activatedBy.length === 0) {
        return Object.freeze({ state: current, changed: false, error: 'activatedBy_missing' });
    }
    // Duplicate check: same (presetId, scope) tuple already bound.
    const dup = current.bindings.find((b) => b.presetId === presetId && b.scope === scope);
    if (dup) {
        return Object.freeze({ state: current, changed: false, error: 'duplicate_binding' });
    }
    const next: ModelPresetBinding = {
        presetId,
        scope,
        contentHashSnapshot,
        activatedAt,
        activatedBy,
    };
    return Object.freeze({
        state: freezeState({ ...current, bindings: [...current.bindings, next] }),
        changed: true,
    });
}

/**
 * Remove a binding by (presetId, scope) tuple. No-op when not present.
 */
export function removeBinding(
    state: ModelComplianceState | null | undefined,
    presetId: string,
    scope: PresetScope,
): BindingMutationResult {
    const current = state && Array.isArray(state.bindings) ? state : emptyBindingState();
    const next = current.bindings.filter((b) => !(b.presetId === presetId && b.scope === scope));
    if (next.length === current.bindings.length) {
        return Object.freeze({ state: current, changed: false });
    }
    return Object.freeze({
        state: freezeState({ ...current, bindings: next }),
        changed: true,
    });
}

/**
 * List all bindings for a given scope (including 'all' which matches
 * universally — included as a hit when the requested scope is anything).
 */
export function getBindingsByScope(
    state: ModelComplianceState | null | undefined,
    scope: PresetScope | null | undefined,
): ReadonlyArray<ModelPresetBinding> {
    if (!state || !Array.isArray(state.bindings) || !isAllowedScope(scope)) {
        return Object.freeze([]);
    }
    const hits = state.bindings.filter((b) => b.scope === scope || b.scope === 'all');
    return Object.freeze(hits);
}

/**
 * Build a coverage report for a list of required scopes (e.g., the scopes
 * that the model's domain actually contains: soil + groundwater + air).
 *
 * Conflicts: when ≥2 bindings target the same NON-'all' scope (B5).
 */
export function evaluateScopeCoverage(
    state: ModelComplianceState | null | undefined,
    requiredScopes: ReadonlyArray<PresetScope> | null | undefined,
): ScopeCoverageReport {
    const required = Array.isArray(requiredScopes) ? Array.from(new Set(requiredScopes.filter(isAllowedScope))) : [];
    if (!state || !Array.isArray(state.bindings)) {
        return Object.freeze({
            required: Object.freeze(required),
            covered: Object.freeze([]),
            missing: Object.freeze(required),
            conflicts: Object.freeze([]),
            complete: required.length === 0,
        });
    }
    const hasAll = state.bindings.some((b) => b.scope === 'all');
    // Group bindings by scope to detect conflicts
    const scopeCounts: Record<string, number> = Object.create(null);
    for (const b of state.bindings) {
        if (b.scope === 'all') continue;
        scopeCounts[b.scope] = (scopeCounts[b.scope] || 0) + 1;
    }
    const conflicts = Object.keys(scopeCounts).filter((s) => (scopeCounts[s] ?? 0) > 1) as PresetScope[];
    const covered = required.filter((s) => hasAll || state.bindings.some((b) => b.scope === s));
    const missing = required.filter((s) => !covered.includes(s));
    return Object.freeze({
        required: Object.freeze(required),
        covered: Object.freeze(covered),
        missing: Object.freeze(missing),
        conflicts: Object.freeze(conflicts),
        complete: missing.length === 0 && conflicts.length === 0,
    });
}
