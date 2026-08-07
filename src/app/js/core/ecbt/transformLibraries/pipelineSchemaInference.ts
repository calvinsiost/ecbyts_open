// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * pipelineSchemaInference.js
 * ECBT TRANSFORMATION_LIBRARIES Phase 66 - Pipeline Schema Inference
 *
 * Pure functions for inferring, validating, and comparing schemas from records.
 * No browser/DOM/Promise/setTimeout dependencies.
 *
 * Provenance: original implementation, no external academic reference required.
 */

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const SCHEMA_INFERENCE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 66,
    deliveredAt: '2026-05-02',
});

export const INFERRED_TYPES = Object.freeze([
    'string',
    'number',
    'boolean',
    'null',
    'date',
    'array',
    'object',
    'mixed',
]);

// ISO 8601 date pattern (YYYY-MM-DD or YYYY-MM-DDTHH:mm...)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the primitive type label for a single value.
 * @param {*} v
 * @returns {'string'|'number'|'boolean'|'null'|'date'|'array'|'object'}
 */
function typeOf(v: any): 'string'|'number'|'boolean'|'null'|'date'|'array'|'object' {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    if (typeof v === 'string') {
        if (ISO_DATE_RE.test(v)) return 'date';
        return 'string';
    }
    return 'string';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspects an array of sample values and returns the inferred INFERRED_TYPE.
 * Returns 'mixed' when multiple non-null types disagree.
 * Returns 'date' when >80% of non-null string values match ISO format.
 *
 * @param {Array<*>} values
 * @returns {string} one of INFERRED_TYPES
 */
export function inferFieldType(values: any[]): string {
    if (!Array.isArray(values) || values.length === 0) return 'null';

    const nonNull = values.filter((v) => v !== null && v !== undefined);
    if (nonNull.length === 0) return 'null';

    // Separate string values for date detection
    const strings = nonNull.filter((v) => typeof v === 'string');
    if (strings.length > 0 && strings.length === nonNull.length) {
        const dateCount = strings.filter((s) => ISO_DATE_RE.test(s)).length;
        if (dateCount / strings.length > 0.8) return 'date';
    }

    const types = new Set(
        nonNull.map((v) => {
            if (typeof v === 'string') return 'string'; // already handled date above for pure string arrays
            return typeOf(v);
        }),
    );

    // For mixed string arrays that didn't pass date threshold, keep as string
    if (types.size === 1) return (types.values().next().value as string);
    return 'mixed';
}

/**
 * Infers a schema from an array of records.
 *
 * @param {Array<any>} records
 * @returns {any}
 */
export function inferSchema(records: Array<any>): any {
    if (!Array.isArray(records) || records.length === 0) {
        return Object.freeze({ fields: Object.freeze({}) });
    }

    // Collect all field names
        const fieldNames: Set<string>= new Set();
    for (const r of records) {
        if (r && typeof r === 'object' && !Array.isArray(r)) {
            for (const k of Object.keys(r)) fieldNames.add(k);
        }
    }

        const fields: Record<string, any>= {};
    for (const field of fieldNames) {
        const values = records.map((r: any) =>
            r && Object.prototype.hasOwnProperty.call(r, field) ? r[field] : null,
        );
        const nonNull = values.filter((v: any) => v !== null && v !== undefined);
        const uniqueVals = new Set(values.map((v: any) => JSON.stringify(v)));

        fields[field] = Object.freeze({
            type: inferFieldType(values),
            nullable: nonNull.length < values.length,
            count: values.length,
            unique: uniqueVals.size,
        });
    }

    return Object.freeze({ fields: Object.freeze(fields) });
}

/**
 * Validates a single record against a schema.
 *
 * @param {any} record
 * @param {{fields: any} | null | undefined} schema
 * @returns {any}
 */
export function validateAgainstSchema(record: any, schema: {fields: any} | null | undefined): any {
        const errors: any[]= [];
    if (!record || typeof record !== 'object') {
        return Object.freeze({
            valid: false,
            errors: Object.freeze([Object.freeze({ field: '*', expected: 'object', got: typeof record })]),
        });
    }

    const fields = schema && schema.fields ? schema.fields : {};
    for (const [field, meta] of Object.entries((fields as Record<string, any>))) {
        const val = Object.prototype.hasOwnProperty.call(record, field) ? (record as any)[field] : null;
        const isNull = val === null || val === undefined;

        if (isNull && !meta.nullable) {
            errors.push(Object.freeze({ field, expected: `non-nullable ${meta.type}`, got: 'null' }));
            continue;
        }
        if (!isNull) {
            const actual = typeOf(val);
            // Accept 'date' values as 'string' when schema says string
            const compatible =
                actual === meta.type || (meta.type === 'string' && actual === 'date') || meta.type === 'mixed';
            if (!compatible) {
                errors.push(Object.freeze({ field, expected: meta.type, got: actual }));
            }
        }
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Detects fields present in schema that are missing from one or more records.
 *
 * @param {Array<any>} records
 * @param {{fields: any} | null | undefined} schema
 * @returns {any} missingCount per field
 */
export function detectMissingFields(records: Array<any>, schema: {fields: any} | null | undefined): any {
        const result: Record<string, number>= {};
    const fields = schema && schema.fields ? Object.keys(schema.fields) : [];
    for (const field of fields) {
        let missing = 0;
        for (const r of records) {
            if (!r || !Object.prototype.hasOwnProperty.call(r, field)) missing++;
        }
        result[field] = missing;
    }
    return Object.freeze(result);
}

/**
 * Computes field statistics for a given field across records.
 * For numeric fields: {min, max, mean, stddev, nullCount}.
 * For string fields: {minLen, maxLen, nullCount, uniqueCount}.
 *
 * @param {Array<any>} records
 * @param {string} field
 * @returns {any}
 */
export function computeFieldStats(records: Array<any>, field: string): any {
    const values = records.map((r: any) =>
        r && Object.prototype.hasOwnProperty.call(r, field) ? r[field] : null,
    );
    const nullCount = values.filter((v: any) => v === null || v === undefined).length;
    const nonNull = values.filter((v: any) => v !== null && v !== undefined);

    // Determine dominant type
    const nums = (nonNull.filter((v: any) => typeof v === 'number' && !Number.isNaN(v)) as number[]);
    const strs = nonNull.filter((v: any) => typeof v === 'string');

    if (nums.length > 0 && nums.length >= strs.length) {
        // Numeric stats
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        const mean = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
        const variance =
            nums.reduce((acc: number, v: number) => acc + (v - mean) ** 2, 0) / nums.length;
        const stddev = Math.sqrt(variance);
        return Object.freeze({ min, max, mean, stddev, nullCount });
    }

    // String stats
    const lengths = nonNull.map((v: any) => String(v).length);
    const minLen = lengths.length ? Math.min(...lengths) : 0;
    const maxLen = lengths.length ? Math.max(...lengths) : 0;
    const uniqueCount = new Set(nonNull.map((v: any) => String(v))).size;
    return Object.freeze({ minLen, maxLen, nullCount, uniqueCount });
}

/**
 * Attempts type coercion of a record per schema field types.
 *
 * @param {any} record
 * @param {{fields: any} | null | undefined} schema
 * @returns {any}
 */
export function coerceRecord(record: any, schema: {fields: any} | null | undefined): any {
        const errors: any[]= [];
        const out: Record<string, any>= {};
    const fields = schema && schema.fields ? schema.fields : {};

        const src: Record<string, any>= record && typeof record === 'object' ? record : {};
    // Copy all keys from record first
    for (const k of Object.keys(src)) out[k] = src[k];

    for (const [field, meta] of Object.entries((fields as Record<string, any>))) {
        const val = Object.prototype.hasOwnProperty.call(src, field) ? src[field] : null;
        if (val === null || val === undefined) {
            out[field] = null;
            continue;
        }

        if (meta.type === 'number') {
            const coerced = typeof val === 'number' ? val : parseFloat(val);
            if (Number.isNaN(coerced)) {
                errors.push(Object.freeze({ field, message: `cannot coerce "${val}" to number` }));
                out[field] = val;
            } else {
                out[field] = coerced;
            }
        } else if (meta.type === 'boolean') {
            if (typeof val === 'boolean') {
                out[field] = val;
            } else if (val === 'true' || val === '1' || val === 1) {
                out[field] = true;
            } else if (val === 'false' || val === '0' || val === 0) {
                out[field] = false;
            } else {
                errors.push(Object.freeze({ field, message: `cannot coerce "${val}" to boolean` }));
                out[field] = val;
            }
        } else if (meta.type === 'string') {
            out[field] = typeof val === 'string' ? val : String(val);
        } else {
            out[field] = val;
        }
    }

    return Object.freeze({ record: Object.freeze(out), errors: Object.freeze(errors) });
}

/**
 * Computes the diff between two schemas.
 *
 * @param {{fields: any} | null | undefined} schemaA
 * @param {{fields: any} | null | undefined} schemaB
 * @returns {any}
 */
export function diffSchemas(schemaA: {fields: any} | null | undefined, schemaB: {fields: any} | null | undefined): any {
        const aFields: Record<string, any>= schemaA && schemaA.fields ? schemaA.fields : {};
        const bFields: Record<string, any>= schemaB && schemaB.fields ? schemaB.fields : {};
    const aKeys = new Set(Object.keys(aFields));
    const bKeys = new Set(Object.keys(bFields));

    const added = [...bKeys].filter((k) => !aKeys.has(k));
    const removed = [...aKeys].filter((k) => !bKeys.has(k));
        const typeChanged: any[]= [];
    for (const k of aKeys) {
        if (bKeys.has(k) && aFields[k].type !== bFields[k].type) {
            typeChanged.push(Object.freeze({ field: k, from: aFields[k].type, to: bFields[k].type }));
        }
    }

    return Object.freeze({
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        typeChanged: Object.freeze(typeChanged),
    });
}

/**
 * Summarizes a schema into high-level statistics.
 *
 * @param {{fields: any} | null | undefined} schema
 * @returns {any}
 */
export function summarizeSchema(schema: {fields: any} | null | undefined): any {
    const fields = schema && schema.fields ? schema.fields : {};
        const entries: any[]= Object.values(fields);
    const fieldCount = entries.length;
    const nullableCount = entries.filter((f: any) => f.nullable).length;
        const typeBreakdown: Record<string, number>= {};
    for (const f of entries) {
        typeBreakdown[f.type] = (typeBreakdown[f.type] || 0) + 1;
    }
    return Object.freeze({
        fieldCount,
        nullableCount,
        typeBreakdown: Object.freeze(typeBreakdown),
    });
}

// ---------------------------------------------------------------------------
// Module meta export
// ---------------------------------------------------------------------------

export const pipelineSchemaInferenceMeta = Object.freeze({
    exports: Object.freeze([
        'SCHEMA_INFERENCE_META',
        'INFERRED_TYPES',
        'inferFieldType',
        'inferSchema',
        'validateAgainstSchema',
        'detectMissingFields',
        'computeFieldStats',
        'coerceRecord',
        'diffSchemas',
        'summarizeSchema',
    ]),
    provenance: 'original — ECBT TRANSFORMATION_LIBRARIES Phase 66, 2026-05-02',
});
