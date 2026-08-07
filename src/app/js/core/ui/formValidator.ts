// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-59 Form Validator — pure-logic, zero DOM
// Declarative validation engine with composable rules.
// Imutabilidade total; estado congelado via Object.freeze + Map/Set clonados.

const VALID_RULE_TYPES = new Set([
    'required',
    'minLength',
    'maxLength',
    'pattern',
    'min',
    'max',
    'email',
    'url',
    'custom',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export type FieldRuleType =
    | 'required'
    | 'minLength'
    | 'maxLength'
    | 'pattern'
    | 'min'
    | 'max'
    | 'email'
    | 'url'
    | 'custom';

export type FieldSeverity = 'error' | 'warning';
export type FieldValueType = 'string' | 'number' | 'email' | 'date' | 'select';

export interface FieldRuleParams {
    readonly value?: number;
    readonly regex?: string | RegExp;
    readonly validate?: (value: unknown) => unknown;
    readonly [key: string]: unknown;
}

export interface FieldRule {
    readonly ruleId: string;
    readonly type: FieldRuleType;
    readonly params?: FieldRuleParams;
    readonly errorMessage?: string;
    readonly severity?: FieldSeverity;
}

export interface FieldSchema {
    readonly fieldId: string;
    readonly label?: string;
    readonly type?: FieldValueType;
    readonly rules?: readonly FieldRule[];
    readonly optional?: boolean;
}

interface NormalizedFieldSchema {
    fieldId: string;
    label: string;
    type: FieldValueType;
    rules: FieldRule[];
    optional: boolean;
}

export interface FieldError {
    readonly ruleId: string;
    readonly type: FieldRuleType;
    readonly severity: FieldSeverity;
    readonly message: string;
    readonly fieldId: string;
}

export interface FormState {
    readonly schema: Map<string, NormalizedFieldSchema>;
    readonly values: Map<string, unknown>;
    readonly errors: Map<string, FieldError[]>;
    readonly touched: Set<string>;
}

export interface FormSummary {
    readonly totalFields: number;
    readonly validCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
    readonly touchedCount: number;
}

function freezeState(state: FormState): FormState {
    return Object.freeze({
        schema: state.schema,
        values: state.values,
        errors: state.errors,
        touched: state.touched,
    });
}

function cloneSchema(schema: Map<string, NormalizedFieldSchema>): Map<string, NormalizedFieldSchema> {
    const next = new Map();
    for (const [k, v] of schema) {
        next.set(k, {
            ...v,
            rules: Array.isArray(v.rules) ? v.rules.slice() : [],
        });
    }
    return next;
}

function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

function validateRule(rule: FieldRule, value: unknown): boolean {
    if (!rule || typeof rule !== 'object') {
        throw new Error('formValidator: rule must be an object');
    }
    if (!VALID_RULE_TYPES.has(rule.type)) {
        throw new Error(`formValidator: invalid rule type "${rule.type}"`);
    }
    const params = rule.params || {};
    switch (rule.type) {
        case 'required':
            return !isEmpty(value);
        case 'minLength':
            return typeof value === 'string' && value.length >= (params.value ?? 0);
        case 'maxLength':
            return typeof value === 'string' && value.length <= (params.value ?? Infinity);
        case 'min':
            return typeof value === 'number' && Number.isFinite(value) && value >= (params.value ?? -Infinity);
        case 'max':
            return typeof value === 'number' && Number.isFinite(value) && value <= (params.value ?? Infinity);
        case 'pattern': {
            const re = params.regex instanceof RegExp ? params.regex : new RegExp(params.regex as string);
            return typeof value === 'string' && re.test(value);
        }
        case 'email':
            return typeof value === 'string' && EMAIL_RE.test(value);
        case 'url':
            return typeof value === 'string' && URL_RE.test(value);
        case 'custom':
            if (typeof params.validate !== 'function') {
                throw new Error('formValidator: custom rule requires params.validate function');
            }
            return Boolean(params.validate(value));
        default:
            return true;
    }
}

function buildError(rule: FieldRule, schema: FieldSchema): FieldError {
    return Object.freeze({
        ruleId: rule.ruleId,
        type: rule.type,
        severity: rule.severity === 'warning' ? 'warning' : 'error',
        message: rule.errorMessage || `Validation failed: ${rule.type}`,
        fieldId: schema.fieldId,
    });
}

/**
 * Validate a single value against a schema's rules.
 */
export function validateField(schema: FieldSchema | null | undefined, value: unknown): FieldError[] {
    if (!schema) return [];
    const rules = schema.rules || [];
    // Optional + empty → skip all rules
    if (schema.optional && isEmpty(value)) return [];
    const errors = [];
    for (const rule of rules) {
        const passed = validateRule(rule, value);
        if (!passed) errors.push(buildError(rule, schema));
    }
    return errors;
}

/**
 * Create a frozen form state from a list of field schemas.
 */
export function createForm({ fields }: { fields: unknown }): FormState {
    if (!Array.isArray(fields)) {
        throw new Error('formValidator.createForm: fields must be an array');
    }
    const schema = new Map();
    for (const f of fields) {
        if (!f || typeof f !== 'object' || typeof (f as FieldSchema).fieldId !== 'string') {
            throw new Error('formValidator.createForm: each field requires fieldId');
        }
        const field = f as FieldSchema;
        schema.set(field.fieldId, {
            fieldId: field.fieldId,
            label: field.label || field.fieldId,
            type: field.type || 'string',
            rules: Array.isArray(field.rules) ? field.rules.slice() : [],
            optional: Boolean(field.optional),
        });
    }
    return freezeState({
        schema,
        values: new Map(),
        errors: new Map(),
        touched: new Set(),
    });
}

function ensureField(state: FormState, fieldId: string): void {
    if (!state.schema.has(fieldId)) {
        throw new Error(`formValidator: unknown fieldId "${fieldId}"`);
    }
}

export function setValue(state: FormState, fieldId: string, value: unknown): FormState {
    ensureField(state, fieldId);
    const values = new Map(state.values);
    values.set(fieldId, value);
    const touched = new Set(state.touched);
    touched.add(fieldId);
    const errors = new Map(state.errors);
    const fieldErrors = validateField(state.schema.get(fieldId), value);
    if (fieldErrors.length > 0) errors.set(fieldId, fieldErrors);
    else errors.delete(fieldId);
    return freezeState({ schema: state.schema, values, errors, touched });
}

export function setTouched(state: FormState, fieldId: string): FormState {
    ensureField(state, fieldId);
    const touched = new Set(state.touched);
    touched.add(fieldId);
    return freezeState({ schema: state.schema, values: state.values, errors: state.errors, touched });
}

export function validateAll(state: FormState): FormState {
    const errors = new Map();
    for (const [fieldId, fieldSchema] of state.schema) {
        const value = state.values.get(fieldId);
        const fieldErrors = validateField(fieldSchema, value);
        if (fieldErrors.length > 0) errors.set(fieldId, fieldErrors);
    }
    return freezeState({ schema: state.schema, values: state.values, errors, touched: state.touched });
}

export function isValid(state: FormState): boolean {
    for (const errs of state.errors.values()) {
        for (const e of errs) if (e.severity === 'error') return false;
    }
    return true;
}

export function getErrors(state: FormState, fieldId?: string): FieldError[] {
    if (fieldId !== undefined) {
        return (state.errors.get(fieldId) || []).slice();
    }
    const all: FieldError[] = [];
    for (const errs of state.errors.values()) all.push(...errs);
    return all;
}

export function getFirstError(state: FormState): FieldError | null {
    for (const fieldId of state.touched) {
        const errs = state.errors.get(fieldId);
        if (errs && errs.length > 0) return errs[0] ?? null;
    }
    return null;
}

export function clearErrors(state: FormState): FormState {
    return freezeState({
        schema: state.schema,
        values: state.values,
        errors: new Map<string, FieldError[]>(),
        touched: state.touched,
    });
}

export function resetForm(state: FormState): FormState {
    return freezeState({
        schema: state.schema,
        values: new Map<string, unknown>(),
        errors: new Map<string, FieldError[]>(),
        touched: new Set<string>(),
    });
}

export function addCustomRule(state: FormState, fieldId: string, rule: FieldRule): FormState {
    ensureField(state, fieldId);
    if (!rule || !VALID_RULE_TYPES.has(rule.type)) {
        throw new Error('formValidator.addCustomRule: invalid rule');
    }
    const schema = cloneSchema(state.schema);
    const f = schema.get(fieldId);
    if (!f) throw new Error(`formValidator: unknown fieldId "${fieldId}"`);
    f.rules = f.rules.concat([rule]);
    schema.set(fieldId, f);
    return freezeState({ schema, values: state.values, errors: state.errors, touched: state.touched });
}

export function summarizeForm(state: FormState): FormSummary {
    const totalFields = state.schema.size;
    let errorCount = 0;
    let warningCount = 0;
    let invalidFields = 0;
    for (const errs of state.errors.values()) {
        let hasErr = false;
        for (const e of errs) {
            if (e.severity === 'error') {
                errorCount++;
                hasErr = true;
            } else warningCount++;
        }
        if (hasErr) invalidFields++;
    }
    return Object.freeze({
        totalFields,
        validCount: totalFields - invalidFields,
        errorCount,
        warningCount,
        touchedCount: state.touched.size,
    });
}
