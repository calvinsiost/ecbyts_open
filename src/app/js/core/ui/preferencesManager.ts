// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-48 - User Preferences Manager (pure-logic)
 *
 * Pure user-preferences manager with schema validation.
 * No DOM, no localStorage. Immutable state (frozen): every mutation returns
 * a new state. Schemas declare type/range/enum/restartRequired.
 */

const VALID_TYPES = new Set(['boolean', 'number', 'string', 'enum'] as const);

export type PreferenceType = (typeof VALID_TYPES extends Set<infer T> ? T : never);

export interface PreferenceSchema {
    key: string;
    type: PreferenceType;
    default: unknown;
    enumValues?: unknown[];
    min?: number;
    max?: number;
    category: string;
    description?: string;
    labelKey?: string;
    restartRequired?: boolean;
}

export interface PreferencesState {
    schema: Map<string, Readonly<PreferenceSchema>>;
    values: Map<string, unknown>;
    dirtyKeys: Set<string>;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export interface CategoryPreference {
    schema: Readonly<PreferenceSchema>;
    value: unknown;
}

export interface PreferencesSummary {
    totalKeys: number;
    dirtyCount: number;
    byCategory: Record<string, number>;
    restartNeeded: boolean;
}

export interface ImportPreferencesResult {
    state: Readonly<PreferencesState>;
    warnings: string[];
}

function freezeState(s: PreferencesState): Readonly<PreferencesState> {
    return Object.freeze({
        schema: s.schema,
        values: s.values,
        dirtyKeys: s.dirtyKeys,
    });
}

function assertSchemaShape(sch: unknown): asserts sch is PreferenceSchema {
    if (!sch || typeof sch !== 'object') throw new Error('PreferenceSchema must be object');
    const candidate = sch as Partial<PreferenceSchema>;
    if (typeof candidate.key !== 'string' || !candidate.key) throw new Error('PreferenceSchema.key required');
    if (!VALID_TYPES.has(candidate.type as PreferenceType)) {
        throw new Error(`PreferenceSchema.type invalid: ${candidate.type}`);
    }
    if (typeof candidate.category !== 'string' || !candidate.category) {
        throw new Error(`PreferenceSchema.category required for "${candidate.key}"`);
    }
    if (
        candidate.type === 'enum' &&
        (!Array.isArray(candidate.enumValues) || candidate.enumValues.length === 0)
    ) {
        throw new Error(`PreferenceSchema.enumValues required for enum "${candidate.key}"`);
    }
}

/**
 * Validates a value against a schema.
 */
export function validateValue(schema: PreferenceSchema | null | undefined, value: unknown): ValidationResult {
    if (!schema) return { valid: false, error: 'no-schema' };
    switch (schema.type) {
        case 'boolean':
            return typeof value === 'boolean'
                ? { valid: true }
                : { valid: false, error: `expected boolean, got ${typeof value}` };
        case 'number':
            if (typeof value !== 'number' || Number.isNaN(value)) {
                return { valid: false, error: `expected number, got ${typeof value}` };
            }
            if (typeof schema.min === 'number' && value < schema.min) {
                return { valid: false, error: `value ${value} below min ${schema.min}` };
            }
            if (typeof schema.max === 'number' && value > schema.max) {
                return { valid: false, error: `value ${value} above max ${schema.max}` };
            }
            return { valid: true };
        case 'string':
            return typeof value === 'string'
                ? { valid: true }
                : { valid: false, error: `expected string, got ${typeof value}` };
        case 'enum':
            if (!(schema as PreferenceSchema & { enumValues: unknown[] }).enumValues.includes(value)) {
                return {
                    valid: false,
                    error: `value "${value}" not in enum [${(schema as PreferenceSchema & { enumValues: unknown[] }).enumValues.join(',')}]`,
                };
            }
            return { valid: true };
        default:
            return { valid: false, error: `unknown type ${schema.type}` };
    }
}

/**
 * Creates initial state with defaults applied.
 */
export function createPreferencesState(schemaList: unknown): Readonly<PreferencesState> {
    if (!Array.isArray(schemaList)) throw new Error('schemaList must be array');
    const schema = new Map<string, Readonly<PreferenceSchema>>();
    const values = new Map<string, unknown>();
    for (const sch of schemaList) {
        assertSchemaShape(sch);
        if (schema.has(sch.key)) throw new Error(`duplicate preference key: ${sch.key}`);
        const v = validateValue(sch, sch.default);
        if (!v.valid) throw new Error(`default for "${sch.key}" invalid: ${v.error}`);
        schema.set(sch.key, Object.freeze({ ...sch }));
        values.set(sch.key, sch.default);
    }
    return freezeState({ schema, values, dirtyKeys: new Set() });
}

function requireKey(state: Readonly<PreferencesState>, key: string): Readonly<PreferenceSchema> {
    if (!state.schema.has(key)) throw new Error(`unknown preference key: ${key}`);
    return state.schema.get(key)!;
}

/**
 * Sets a preference. Throws on unknown keys or invalid values.
 * Returns a new state.
 */
export function setPreference(
    state: Readonly<PreferencesState>,
    key: string,
    value: unknown,
): Readonly<PreferencesState> {
    const sch = requireKey(state, key);
    const v = validateValue(sch, value);
    if (!v.valid) throw new Error(`invalid value for "${key}": ${v.error}`);
    const values = new Map(state.values);
    values.set(key, value);
    const dirtyKeys = new Set(state.dirtyKeys);
    if (value !== sch.default || state.dirtyKeys.has(key)) dirtyKeys.add(key);
    return freezeState({ schema: state.schema, values, dirtyKeys });
}

export function getPreference(state: Readonly<PreferencesState>, key: string): unknown {
    requireKey(state, key);
    return state.values.get(key);
}

export function getAll(state: Readonly<PreferencesState>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of state.values) out[k] = v;
    return out;
}

/**
 * Returns {schema, value} pairs grouped by category.
 */
export function getByCategory(state: Readonly<PreferencesState>, category: string): CategoryPreference[] {
    const out: CategoryPreference[] = [];
    for (const [k, sch] of state.schema) {
        if (sch.category === category) {
            out.push({ schema: sch, value: state.values.get(k) });
        }
    }
    return out;
}

export function resetToDefaults(state: Readonly<PreferencesState>): Readonly<PreferencesState> {
    const values = new Map<string, unknown>();
    for (const [k, sch] of state.schema) values.set(k, sch.default);
    return freezeState({ schema: state.schema, values, dirtyKeys: new Set() });
}

export function resetKey(state: Readonly<PreferencesState>, key: string): Readonly<PreferencesState> {
    const sch = requireKey(state, key);
    const values = new Map(state.values);
    values.set(key, sch.default);
    const dirtyKeys = new Set(state.dirtyKeys);
    dirtyKeys.delete(key);
    return freezeState({ schema: state.schema, values, dirtyKeys });
}

export function isDirty(state: Readonly<PreferencesState>, key: string): boolean {
    requireKey(state, key);
    return state.dirtyKeys.has(key);
}

export function clearDirty(state: Readonly<PreferencesState>): Readonly<PreferencesState> {
    return freezeState({ schema: state.schema, values: state.values, dirtyKeys: new Set() });
}

export function getDirtyKeys(state: Readonly<PreferencesState>): string[] {
    return Array.from(state.dirtyKeys);
}

/**
 * True when at least one dirty key requires restart.
 */
export function requiresRestart(state: Readonly<PreferencesState>): boolean {
    for (const k of state.dirtyKeys) {
        const sch = state.schema.get(k);
        if (sch && sch.restartRequired) return true;
    }
    return false;
}

export function summarizePreferences(state: Readonly<PreferencesState>): PreferencesSummary {
    const byCategory: Record<string, number> = {};
    for (const [, sch] of state.schema) {
        byCategory[sch.category] = (byCategory[sch.category] || 0) + 1;
    }
    return {
        totalKeys: state.schema.size,
        dirtyCount: state.dirtyKeys.size,
        byCategory,
        restartNeeded: requiresRestart(state),
    };
}

export function exportPreferences(state: Readonly<PreferencesState>): Record<string, unknown> {
    return getAll(state);
}

/**
 * Applies a plain object while respecting the schema.
 * Unknown keys: ignored with warning. Type mismatches: throw.
 */
export function importPreferences(state: Readonly<PreferencesState>, plainObj: unknown): ImportPreferencesResult {
    if (!plainObj || typeof plainObj !== 'object') throw new Error('importPreferences: object required');
    const warnings: string[] = [];
    let next = state;
    for (const [k, v] of Object.entries(plainObj)) {
        if (!next.schema.has(k)) {
            warnings.push(`unknown key ignored: ${k}`);
            continue;
        }
        next = setPreference(next, k, v);
    }
    return { state: next, warnings };
}
