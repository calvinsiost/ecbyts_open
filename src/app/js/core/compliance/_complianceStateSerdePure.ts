// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance State — Serde (Serialize/Deserialize) pure-logic.
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET F4 + RF22 (persistência).
 * claude - novaspec, 2026-06-05.
 *
 * Responsável por persistir/restaurar `ModelComplianceState` em formato
 * portável (JSON-safe) consumível por encoder.ts (Type A/B/C ECBT keys) e
 * decoder.ts. Wire em encoder/decoder será slice separada — esta slice é
 * apenas o contrato pure-logic com versionamento de schema (RF22 migração).
 *
 * Schema versions:
 *   v1 — sem ModelComplianceState (legacy pré-2026-06)
 *   v2 — bindings[] + locked? (atual)
 *
 * Out of scope:
 *   - Wire em encoder.ts/decoder.ts (slice próxima)
 *   - Network/persistence layer (Supabase Storage)
 *   - Compression (delegado a encoder Type C)
 *
 * Tests: tests/compliance-state-serde-pure.test.mjs
 */

import type { ModelComplianceState, ModelPresetBinding, PresetScope } from './_modelBindingsPure.js';

// ----------------------------------------------------------------
// SCHEMA VERSION
// ----------------------------------------------------------------

export const COMPLIANCE_STATE_SCHEMA_VERSION = 2 as const;
export type ComplianceStateSchemaVersion = 1 | 2;

// ----------------------------------------------------------------
// SERIALIZED FORMS
// ----------------------------------------------------------------

export interface SerializedComplianceStateV2 {
    readonly schemaVersion: 2;
    readonly bindings: ReadonlyArray<SerializedBindingV2>;
    readonly locked?: boolean;
    readonly lockedAt?: string;
    readonly lockedBy?: string;
}

export interface SerializedBindingV2 {
    readonly presetId: string;
    readonly scope: PresetScope;
    readonly contentHashSnapshot: string;
    readonly activatedAt: string;
    readonly activatedBy: string;
}

// V1 legacy (sem schema explícito) — sempre vazio (pré-feature)
export interface SerializedComplianceStateV1Legacy {
    readonly schemaVersion?: 1 | undefined;
}

export type SerializedComplianceState = SerializedComplianceStateV1Legacy | SerializedComplianceStateV2;

// ----------------------------------------------------------------
// RESULT TYPES
// ----------------------------------------------------------------

export type DeserializeReason =
    | 'ok'
    | 'absent'
    | 'invalid_root_type'
    | 'unknown_schema_version'
    | 'invalid_bindings_array'
    | 'invalid_binding_field'
    | 'migrated_from_v1';

export interface DeserializeResult {
    readonly state: ModelComplianceState;
    readonly reason: DeserializeReason;
    readonly droppedBindings: ReadonlyArray<string>;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

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

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isValidScope(s: unknown): s is PresetScope {
    return typeof s === 'string' && ALLOWED_SCOPES.includes(s as PresetScope);
}

function isValidIsoDate(s: unknown): boolean {
    if (typeof s !== 'string' || s.length === 0) return false;
    const t = Date.parse(s);
    return !Number.isNaN(t);
}

function freezeState(s: ModelComplianceState): ModelComplianceState {
    return Object.freeze({
        ...s,
        bindings: Object.freeze(s.bindings.map((b) => Object.freeze({ ...b }))),
    }) as ModelComplianceState;
}

function emptyState(): ModelComplianceState {
    return freezeState({ bindings: Object.freeze([]) });
}

function isValidBinding(b: unknown): b is SerializedBindingV2 {
    if (!isPlainObject(b)) return false;
    if (!isNonEmptyString(b.presetId)) return false;
    if (!isValidScope(b.scope)) return false;
    if (!isNonEmptyString(b.contentHashSnapshot)) return false;
    if (!isValidIsoDate(b.activatedAt)) return false;
    if (!isNonEmptyString(b.activatedBy)) return false;
    return true;
}

// ----------------------------------------------------------------
// SERIALIZE
// ----------------------------------------------------------------

export function serializeComplianceState(state: ModelComplianceState | null | undefined): SerializedComplianceStateV2 {
    if (!state || !Array.isArray(state.bindings)) {
        return Object.freeze({
            schemaVersion: 2 as const,
            bindings: Object.freeze([]),
        });
    }
    const bindings = state.bindings.map((b) =>
        Object.freeze({
            presetId: b.presetId,
            scope: b.scope,
            contentHashSnapshot: b.contentHashSnapshot,
            activatedAt: b.activatedAt,
            activatedBy: b.activatedBy,
        }),
    );
    const out: Record<string, unknown> = {
        schemaVersion: 2 as const,
        bindings: Object.freeze(bindings),
    };
    if (state.locked === true) out.locked = true;
    if (isNonEmptyString(state.lockedAt)) out.lockedAt = state.lockedAt;
    if (isNonEmptyString(state.lockedBy)) out.lockedBy = state.lockedBy;
    return Object.freeze(out) as unknown as SerializedComplianceStateV2;
}

// ----------------------------------------------------------------
// DESERIALIZE
// ----------------------------------------------------------------

export function deserializeComplianceState(raw: unknown): DeserializeResult {
    if (raw === null || raw === undefined) {
        return Object.freeze({
            state: emptyState(),
            reason: 'absent' as const,
            droppedBindings: Object.freeze([]),
        });
    }

    if (!isPlainObject(raw)) {
        return Object.freeze({
            state: emptyState(),
            reason: 'invalid_root_type' as const,
            droppedBindings: Object.freeze([]),
        });
    }

    const version = (raw as Record<string, unknown>).schemaVersion;

    // v1 legacy: sem schemaVersion ou =1 → state vazio (migrated)
    if (version === undefined || version === 1) {
        return Object.freeze({
            state: emptyState(),
            reason: 'migrated_from_v1' as const,
            droppedBindings: Object.freeze([]),
        });
    }

    if (version !== 2) {
        return Object.freeze({
            state: emptyState(),
            reason: 'unknown_schema_version' as const,
            droppedBindings: Object.freeze([]),
        });
    }

    const rawBindings = (raw as Record<string, unknown>).bindings;
    if (!Array.isArray(rawBindings)) {
        return Object.freeze({
            state: emptyState(),
            reason: 'invalid_bindings_array' as const,
            droppedBindings: Object.freeze([]),
        });
    }

    const validBindings: ModelPresetBinding[] = [];
    const dropped: string[] = [];
    for (const b of rawBindings) {
        if (isValidBinding(b)) {
            validBindings.push({
                presetId: b.presetId,
                scope: b.scope,
                contentHashSnapshot: b.contentHashSnapshot,
                activatedAt: b.activatedAt,
                activatedBy: b.activatedBy,
            });
        } else {
            const id = isPlainObject(b) && isNonEmptyString(b.presetId) ? b.presetId : '<unknown>';
            dropped.push(id);
        }
    }

    const state: ModelComplianceState = {
        bindings: validBindings,
    };
    const lockedRaw = (raw as Record<string, unknown>).locked;
    if (lockedRaw === true) {
        Object.assign(state, { locked: true });
        const lockedAt = (raw as Record<string, unknown>).lockedAt;
        const lockedBy = (raw as Record<string, unknown>).lockedBy;
        if (isNonEmptyString(lockedAt)) Object.assign(state, { lockedAt });
        if (isNonEmptyString(lockedBy)) Object.assign(state, { lockedBy });
    }

    return Object.freeze({
        state: freezeState(state),
        reason: dropped.length > 0 ? ('invalid_binding_field' as const) : ('ok' as const),
        droppedBindings: Object.freeze(dropped),
    });
}

// ----------------------------------------------------------------
// ROUND-TRIP HELPER
// ----------------------------------------------------------------

export function roundTripComplianceState(state: ModelComplianceState | null | undefined): ModelComplianceState {
    return deserializeComplianceState(serializeComplianceState(state)).state;
}
