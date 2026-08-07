// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Schema Check - Phase 57 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S57
 *
 * Phase 57 (2026-05-02) - pure-logic schema validation lightweight,
 * sem dependência de Ajv. Suporta tipos primitivos + nested + arrays.
 *
 * NÃO depende de browser. Sem fetch/JSON Schema externo.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Tipos canônicos. */
export const SCHEMA_TYPES = Object.freeze(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null', 'any']);

/** Identidade do módulo. */
export const SCHEMA_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 57,
    deliveredAt: '2026-05-02',
});

/**
 * Verifica tipo canônico.
 */
export function isValidType(t: any) {
    return typeof t === 'string' && SCHEMA_TYPES.includes(t);
}

/**
 * Detecta tipo de value.
 */
export function detectType(v: any) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (Number.isInteger(v)) return 'integer';
    if (typeof v === 'number') return 'number';
    return typeof v;
}

/**
 * Verifica se value matches type spec.
 */
export function matchesType(value: any, type: any) {
    if (!isValidType(type)) return false;
    if (type === 'any') return true;
    const actual = detectType(value);
    if (type === 'number') return actual === 'number' || actual === 'integer';
    return actual === type;
}

/**
 * Valida value contra schema. Retorna {valid, errors[]}.
 *
 * Schema format:
 *   { type: 'string'|'number'|...,
 *     required?: boolean,
 *     min?, max?, // numbers
 *     minLength?, maxLength?, // strings/arrays
 *     pattern?: regex string,
 *     enum?: [values],
 *     items?: schema, // for arrays
 *     properties?: { field: schema }, // for objects
 *     required_fields?: string[] // for objects
 *   }
 *
 * @returns {{ valid: boolean, errors: ReadonlyArray<{ path: string, error: string }> }}
 */
export function validate(value: any, schema: any, path = '$'): { valid: boolean; errors: ReadonlyArray<{ path: string; error: string }> } {
    if (!schema || typeof schema !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze([{ path, error: 'invalid schema' }]) });
    }
    const errors = [];
    if (value === undefined || value === null) {
        if (schema.required) {
            errors.push({ path, error: 'required' });
            return Object.freeze({ valid: false, errors: Object.freeze(errors) });
        }
        if (value === null && schema.type !== 'null' && schema.type !== 'any') {
            errors.push({ path, error: `expected ${schema.type}, got null` });
        }
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }
    if (schema.type && !matchesType(value, schema.type)) {
        errors.push({ path, error: `expected ${schema.type}, got ${detectType(value)}` });
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        errors.push({ path, error: `not in enum [${schema.enum.join(',')}]` });
    }
    if (typeof value === 'number') {
        if (Number.isFinite(schema.min) && value < schema.min) {
            errors.push({ path, error: `< min ${schema.min}` });
        }
        if (Number.isFinite(schema.max) && value > schema.max) {
            errors.push({ path, error: `> max ${schema.max}` });
        }
    }
    if (typeof value === 'string') {
        if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
            errors.push({ path, error: `length < ${schema.minLength}` });
        }
        if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
            errors.push({ path, error: `length > ${schema.maxLength}` });
        }
        if (typeof schema.pattern === 'string') {
            try {
                if (!new RegExp(schema.pattern).test(value)) {
                    errors.push({ path, error: `pattern mismatch` });
                }
            } catch {
                errors.push({ path, error: 'invalid pattern' });
            }
        }
    }
    if (Array.isArray(value)) {
        if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
            errors.push({ path, error: `array length < ${schema.minLength}` });
        }
        if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
            errors.push({ path, error: `array length > ${schema.maxLength}` });
        }
        if (schema.items) {
            value.forEach((it, i) => {
                const sub = validate(it, schema.items, `${path}[${i}]`);
                errors.push(...sub.errors);
            });
        }
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
        if (Array.isArray(schema.required_fields)) {
            for (const f of schema.required_fields) {
                if (!(f in value)) {
                    errors.push({ path: `${path}.${f}`, error: 'required' });
                }
            }
        }
        for (const [k, sub] of Object.entries(schema.properties)) {
            const r = validate(value[k], sub, `${path}.${k}`);
            errors.push(...r.errors);
        }
    }
    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors.map((e) => Object.freeze(e))),
    });
}

/**
 * Valida lote de items contra mesmo schema.
 */
export function validateBatch(items: any, schema: any) {
    if (!Array.isArray(items)) return Object.freeze({ valid: false, results: Object.freeze([]) });
    const results = items.map((it, i) => Object.freeze({ index: i, ...validate(it, schema, `[${i}]`) }));
    return Object.freeze({
        valid: results.every((r) => r.valid),
        results: Object.freeze(results),
    });
}

/**
 * Sumariza validação batch.
 */
export function summarizeValidation(batchResult: any) {
    const empty = { total: 0, valid: 0, invalid: 0, errors: 0 };
    if (!batchResult || !Array.isArray(batchResult.results)) return empty;
    let valid = 0,
        errs = 0;
    for (const r of batchResult.results) {
        if (r.valid) valid++;
        errs += (r.errors || []).length;
    }
    return Object.freeze({
        total: batchResult.results.length,
        valid,
        invalid: batchResult.results.length - valid,
        errors: errs,
    });
}

/**
 * Module identity export.
 */
export const pipelineSchemaCheckMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 57,
    deliveredAt: '2026-05-02',
    exports: [
        'SCHEMA_TYPES',
        'SCHEMA_META',
        'isValidType',
        'detectType',
        'matchesType',
        'validate',
        'validateBatch',
        'summarizeValidation',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
