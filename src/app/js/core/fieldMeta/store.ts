// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FIELD-META-001 Fase 1b — IDB persistence

   Stores FieldMeta records in the ecbyts IndexedDB under namespace
   `field_meta:<field_key>`. Parallel to the canonical model (ADR A4) —
   each field's metadata lives beside the value, not inside it.

   Read-through cache via Map for the current session; write-through to IDB.
   ================================================================ */


import { createFieldMeta, validateFieldMeta } from './schema.js';

const NS = 'field_meta:';
const _cache = new Map();
const FIELD_META_BATCH_READ_CHUNK = 50;

// BUG-5 fix (2026-06-02): import() direto. Versão anterior usava
// `Function('url', 'return import(url)')` para bypassar análise estática
// de bundlers, mas violava CSP `script-src 'self'` estrita (unsafe-eval
// proibido). Como ecbyts NÃO usa bundler (CONFIG carregado via ES modules
// nativos), import() direto funciona e respeita CSP.
async function _idbStore(): Promise<{
    idbGet: (key: string) => Promise<any>;
    idbSet: (key: string, value: any) => Promise<any>;
    idbDelete: (key: string) => Promise<any>;
}> {
    return await import('../../utils/storage/idbStore.js');
}

function _key(/** @type {any} */ field_key: any) {
    if (!field_key || typeof field_key !== 'string') {
        throw new Error('FieldMeta store: field_key required');
    }
    return NS + field_key;
}

function _uniqueFieldKeys(/** @type {any} */ fieldKeys: any) {
    const keys = Array.isArray(fieldKeys) ? fieldKeys : [];
    return [...new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))];
}

function _cacheFreshMeta(/** @type {string} */ field_key: string, /** @type {string} */ storageKey: string) {
    const fresh = createFieldMeta({ field_key });
    _cache.set(storageKey, fresh);
    return fresh;
}

/** Track known keys in one umbrella entry for listing without IDB scan. */
const INDEX_KEY = NS + '__index__';
async function _loadIndex() {
    let idx = _cache.get(INDEX_KEY);
    if (!idx) {
        const { idbGet } = await _idbStore();
        idx = (await idbGet(INDEX_KEY)) || {};
        _cache.set(INDEX_KEY, idx);
    }
    return idx;
}
async function _saveIndex(/** @type {any} */ idx: any) {
    const { idbSet } = await _idbStore();
    _cache.set(INDEX_KEY, idx);
    await idbSet(INDEX_KEY, idx);
}

/**
 * Read FieldMeta for a field_key. Returns default record if nothing stored.
 */
export async function getFieldMeta(/** @type {any} */ field_key: any) {
    const k = _key(field_key);
    if (_cache.has(k)) return _cache.get(k);
    const { idbGet } = await _idbStore();
    const stored = await idbGet(k);
    if (stored && typeof stored === 'object') {
        _cache.set(k, stored);
        return stored;
    }
    const fresh = createFieldMeta({ field_key });
    _cache.set(k, fresh);
    return fresh;
}

/**
 * Batch-read FieldMeta records with the same read-through cache semantics.
 */
export async function getFieldMetaBatch(/** @type {any} */ fieldKeys: any) {
    const out = new Map();
    const missing = [];
    for (const field_key of _uniqueFieldKeys(fieldKeys)) {
        const k = _key(field_key);
        if (_cache.has(k)) out.set(field_key, _cache.get(k));
        else missing.push({ field_key, k });
    }
    if (missing.length === 0) return out;
    const { idbGet } = await _idbStore();
    for (let i = 0; i < missing.length; i += FIELD_META_BATCH_READ_CHUNK) {
        const chunk = missing.slice(i, i + FIELD_META_BATCH_READ_CHUNK);
        const reads = await Promise.allSettled(chunk.map(({ k }) => idbGet(k)));
        for (let j = 0; j < chunk.length; j++) {
            const item = chunk[j];
            const read = reads[j];
            if (!item || !read) continue;
            const stored = read.status === 'fulfilled' ? read.value : null;
            const meta = stored && typeof stored === 'object'
                ? stored
                : _cacheFreshMeta(item.field_key, item.k);
            _cache.set(item.k, meta);
            out.set(item.field_key, meta);
        }
    }
    return out;
}

/**
 * Persist FieldMeta. Validates schema before write; throws on invalid.
 * Returns the persisted record.
 */
export async function setFieldMeta(/** @type {any} */ field_key: any, /** @type {any} */ meta: any) {
    if (!meta || meta.field_key !== field_key) {
        throw new Error(`setFieldMeta: meta.field_key (${meta?.field_key}) must match argument (${field_key})`);
    }
    const v = validateFieldMeta(meta);
    if (!v.ok) throw new Error(`setFieldMeta: invalid schema — ${v.errors.join('; ')}`);
    const k = _key(field_key);
    _cache.set(k, meta);
    const { idbSet } = await _idbStore();
    await idbSet(k, meta);
    const idx = await _loadIndex();
    if (!idx[field_key]) {
        idx[field_key] = { created_at: new Date().toISOString() };
        await _saveIndex(idx);
    } else {
        idx[field_key].updated_at = new Date().toISOString();
        await _saveIndex(idx);
    }
    return meta;
}

/**
 * Delete a single FieldMeta entry.
 */
export async function deleteFieldMeta(/** @type {any} */ field_key: any) {
    const k = _key(field_key);
    _cache.delete(k);
    const { idbDelete } = await _idbStore();
    await idbDelete(k);
    const idx = await _loadIndex();
    if (idx[field_key]) {
        delete idx[field_key];
        await _saveIndex(idx);
    }
}

/**
 * List field_keys whose prefix matches the given scope.
 * Example: listFieldMetaByScope('element:abc123') → all meta entries
 * for that element and its observations.
 */
export async function listFieldMetaByScope(prefix = '') {
    const idx = await _loadIndex();
    const keys = Object.keys(idx).filter((k) => !prefix || k.startsWith(prefix));
    return [...(await getFieldMetaBatch(keys)).values()].filter(Boolean);
}

/**
 * Wipe every FieldMeta record. Development / model-reset helper.
 * Does NOT clear the broader ecbyts IDB - only the field_meta:* namespace.
 */
export async function clearAllFieldMeta() {
    const idx = await _loadIndex();
    const { idbDelete } = await _idbStore();
    for (const fk of Object.keys(idx)) {
        await idbDelete(_key(fk));
        _cache.delete(_key(fk));
    }
    _cache.delete(INDEX_KEY);
    await idbDelete(INDEX_KEY);
}
