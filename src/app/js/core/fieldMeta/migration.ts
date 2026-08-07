// @ts-check
// Generated from src/app/js/core/fieldMeta/migration.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FIELD-META-001 Fase 2 — retroactive migration

   Scans every element + observation in the current model and creates a
   FieldMeta record for every field that could carry metadata but doesn't
   yet. Entries are tagged filled_by='unknown' + sources/provenance
   method='auto_inherited' (EPA IRIS audit-friendly — defaults are declared,
   not embedded).

   Idempotent: if a FieldMeta already exists for a field_key, it is skipped.

   Does NOT persist the observation itself — only the parallel FieldMeta.
   The canonical model is untouched.
   ================================================================ */
import { buildFieldKey, createFieldMeta, createProvenance } from './schema.js';
import { getFieldMetaBatch, setFieldMeta } from './store.js';
/** Fields on an `observation` that should carry FieldMeta once migrated. */
const OBSERVATION_FIELD_KEYS = Object.freeze(['reading', 'x', 'y', 'z', 'date', 'unit']);
/** Fields on an element top level. */
const ELEMENT_FIELD_KEYS = Object.freeze(['name', 'notes']);
/**
 * Detect whether a FieldMeta record is a "default" placeholder - i.e. no
 * user-declared metadata. Used by migration to skip already-migrated fields.
 */
/** @param {any} meta */
function _isFreshDefault( meta: any) {
    return !!meta && meta.filled_by === 'unknown' && (!Array.isArray(meta.revisions) || meta.revisions.length === 0);
}

function _legacyMetaCandidate(/** @type {string} */ field_key: string, /** @type {any} */ value: any) {
    return { field_key, value };
}

function _createLegacyMeta(/** @type {string} */ field_key: string, /** @type {any} */ value: any) {
    const meta = (createFieldMeta({ field_key, value, filled_by: 'unknown' })) as any;
    meta.provenance = createProvenance({
        activity: 'import',
        set_by: null,
        agent_label: 'legacy-migration',
    });
    return meta;
}

function _collectLegacyFieldMetaCandidates(/** @type {Array<any>} */ elements: any[]) {
    const candidates = [];
    for (const el of elements || []) {
        if (!el || !el.id) continue;
        for (const fieldName of ELEMENT_FIELD_KEYS) {
            if (el[fieldName] === undefined) continue;
            const field_key = buildFieldKey({ entity: 'element', id: el.id, field: fieldName });
            candidates.push(_legacyMetaCandidate(field_key, el[fieldName]));
        }
        const observations = Array.isArray(el.observations) ? el.observations : [];
        for (let i = 0; i < observations.length; i++) {
            const obs = observations[i];
            if (!obs) continue;
            for (const fieldName of OBSERVATION_FIELD_KEYS) {
                if (obs[fieldName] === undefined) continue;
                const field_key = buildFieldKey({
                    entity: 'element',
                    id: el.id,
                    sub_entity: 'observation',
                    sub_id: i,
                    field: fieldName,
                });
                candidates.push(_legacyMetaCandidate(field_key, obs[fieldName]));
            }
        }
    }
    return candidates;
}
/**
 * Migrate every element + observation in the provided collection.
 * Caller supplies `getAllElements` to avoid hard-coupling to a specific
 * manager module (keeps `core/fieldMeta/` independent).
 *
 * @param {() => Array<any>} getAllElements function returning current elements
 * @returns {Promise<{scanned:number, migrated:number}>}
 */
export async function migrateAllLegacyFieldMeta( getAllElements: any) {
    const elements = typeof getAllElements === 'function' ? getAllElements() : [];
    const candidates = _collectLegacyFieldMetaCandidates(elements);
    const existingByKey = await getFieldMetaBatch(candidates.map(({ field_key }) => field_key));
    const pending = [];
    for (const { field_key, value } of candidates) {
        const existing = existingByKey.get(field_key);
        if (!_isFreshDefault(existing) || existing.value === value) continue;
        pending.push({ field_key, meta: _createLegacyMeta(field_key, value) });
    }
    // Batch write - chunked Promise.all to avoid blocking IDB with 1000s of
    // concurrent writes. Chunk size 50 balances throughput vs backpressure.
    const CHUNK = 50;
    let migrated = 0;
    for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const results = await Promise.allSettled(chunk.map(({ field_key, meta }: any) => setFieldMeta(field_key, meta)));
        for (const r of results) {
            if (r.status === 'fulfilled') migrated++;
            else console.warn('[field-meta] migration chunk failed:', r.reason?.message);
        }
    }
    return { scanned: candidates.length, migrated };
}
/**
 * Boot helper - invoked lazily via main.js after handlers are registered.
 * Wraps migrateAllLegacyFieldMeta with safe dynamic import so core/fieldMeta
 * stays decoupled from utils/elements.
 */
export async function migrateLegacyFieldMetaFromBoot() {
    try {
        const { getAllElements } = await import('../elements/manager.js' as string);
        const result = await migrateAllLegacyFieldMeta(getAllElements);
        console.debug('[field-meta] legacy migration:', result);
        return result;
    } catch (err: any) {
        console.warn('[field-meta] legacy migration skipped:', err?.message || err);
        return { scanned: 0, migrated: 0 };
    }
}
