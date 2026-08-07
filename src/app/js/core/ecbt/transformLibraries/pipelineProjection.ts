// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Projection - Phase 55 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S55
 *
 * Phase 55 (2026-05-02) - pure-logic SQL-like projection para outputs de
 * pipeline. Suporta:
 *   - select (whitelist de fields)
 *   - rename (mapping oldName → newName)
 *   - omit (blacklist de fields)
 *   - addComputed (coluna computada via fn)
 *   - flatten (nested objects → dot-path keys)
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const PROJECTION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 55,
    deliveredAt: '2026-05-02',
});

import { isObjectLike as _isObjectLike } from '../../../utils/helpers/objectGuards.js';
function isPlainObject(v: any): boolean {
    return _isObjectLike(v);
}

/**
 * Reduz cada item ao subconjunto de fields informado.
 */
export function select(items: any, fields: any) {
    if (!Array.isArray(items) || !Array.isArray(fields)) return Object.freeze([]);
    const out = [];
    for (const it of items) {
        if (!isPlainObject(it)) continue;
        const row: Record<string, any> = {};
        for (const f of fields) {
            if (typeof f !== 'string') continue;
            if (Object.prototype.hasOwnProperty.call(it, f)) {
                row[f] = it[f];
            }
        }
        out.push(Object.freeze(row));
    }
    return Object.freeze(out);
}

/**
 * Renomeia fields conforme mapping {oldName: newName}.
 * Fields não mapeados são preservados.
 */
export function rename(items: any, mapping: any) {
    if (!Array.isArray(items) || !isPlainObject(mapping)) return Object.freeze([]);
    const out = [];
    for (const it of items) {
        if (!isPlainObject(it)) continue;
        const row: Record<string, any> = {};
        for (const k of Object.keys(it)) {
            const newKey = typeof mapping[k] === 'string' && mapping[k].length > 0 ? mapping[k] : k;
            row[newKey] = it[k];
        }
        out.push(Object.freeze(row));
    }
    return Object.freeze(out);
}

/**
 * Remove fields informados.
 */
export function omit(items: any, fields: any) {
    if (!Array.isArray(items) || !Array.isArray(fields)) return Object.freeze([]);
    const blacklist = new Set(fields.filter((f) => typeof f === 'string'));
    const out = [];
    for (const it of items) {
        if (!isPlainObject(it)) continue;
        const row: Record<string, any> = {};
        for (const k of Object.keys(it)) {
            if (!blacklist.has(k)) row[k] = it[k];
        }
        out.push(Object.freeze(row));
    }
    return Object.freeze(out);
}

/**
 * Adiciona coluna computada via fn(item, index) → value.
 * Se fn lança, valor da coluna é null (resilient).
 */
export function addComputed(items: any, name: any, fn: any) {
    if (!Array.isArray(items) || typeof name !== 'string' || name.length === 0 || typeof fn !== 'function') {
        return Object.freeze([]);
    }
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlainObject(it)) continue;
        let value: any;
        try {
            value = fn(it, i);
            if (value === undefined) value = null;
        } catch {
            value = null;
        }
        const row = { ...it, [name]: value };
        out.push(Object.freeze(row));
    }
    return Object.freeze(out);
}

function flattenInto(target: any, prefix: any, value: any, separator: any): void {
    if (isPlainObject(value)) {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            target[prefix] = value;
            return;
        }
        for (const k of keys) {
            const nextPrefix = prefix.length > 0 ? `${prefix}${separator}${k}` : k;
            flattenInto(target, nextPrefix, value[k], separator);
        }
    } else {
        target[prefix] = value;
    }
}

/**
 * Achata nested objects em dot-paths (ou separator custom).
 * Arrays são preservados como leaf values.
 */
export function flatten(items: any, separator = '.') {
    if (!Array.isArray(items)) return Object.freeze([]);
    const sep = typeof separator === 'string' && separator.length > 0 ? separator : '.';
    const out = [];
    for (const it of items) {
        if (!isPlainObject(it)) continue;
        const row = {};
        for (const k of Object.keys(it)) {
            flattenInto(row, k, it[k], sep);
        }
        out.push(Object.freeze(row));
    }
    return Object.freeze(out);
}

/**
 * Sumariza projection: campos mantidos, removidos, adicionados.
 */
export function summarizeProjection(input: any, output: any) {
    const empty = Object.freeze({
        input: 0,
        output: 0,
        fieldsKept: Object.freeze([]),
        fieldsRemoved: Object.freeze([]),
        fieldsAdded: Object.freeze([]),
    });
    if (!Array.isArray(input) || !Array.isArray(output)) return empty;
    const inFields = new Set();
    for (const it of input) {
        if (isPlainObject(it)) for (const k of Object.keys(it)) inFields.add(k);
    }
    const outFields = new Set();
    for (const it of output) {
        if (isPlainObject(it)) for (const k of Object.keys(it)) outFields.add(k);
    }
    const kept = [];
    const removed = [];
    const added = [];
    for (const f of inFields) {
        if (outFields.has(f)) kept.push(f);
        else removed.push(f);
    }
    for (const f of outFields) {
        if (!inFields.has(f)) added.push(f);
    }
    kept.sort();
    removed.sort();
    added.sort();
    return Object.freeze({
        input: input.length,
        output: output.length,
        fieldsKept: Object.freeze(kept),
        fieldsRemoved: Object.freeze(removed),
        fieldsAdded: Object.freeze(added),
    });
}

/**
 * Module identity export.
 */
export const pipelineProjectionMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 55,
    deliveredAt: '2026-05-02',
    exports: ['PROJECTION_META', 'select', 'rename', 'omit', 'addComputed', 'flatten', 'summarizeProjection'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
