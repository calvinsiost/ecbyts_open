// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Persistence (Phase 25)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S25
 *
 * Phase 25 (2026-05-01) - pure-logic serialize/deserialize pipelines
 * para JSON-compatible format com schema versioning. Permite export/
 * import seguro de pipelines entre sistemas.
 *
 * Estratégia:
 *   - Schema version 1 (PSV1): { version, pipeline, metadata, checksum }
 *   - Validate on deserialize: reject malformed JSON, mismatched checksum
 *   - Migrate: future-proof migrations entre versions
 *   - Compress (opcional): minify JSON sem espaços
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Schema version atual. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Identidade do módulo. */
export const PERSISTENCE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 25,
    deliveredAt: '2026-05-01',
    schemaVersion: CURRENT_SCHEMA_VERSION,
});

/**
 * FNV-1a 32-bit checksum.
 */
import { fnv1aHashHex as _fnv1aHashHex } from '../../../utils/helpers/hashFnv1a.js';
export function computeChecksum(json: any): string {
    if (typeof json !== 'string') return '00000000';
    return _fnv1aHashHex(json, 8);
}

/**
 * Serializa pipeline para JSON string com schema header.
 *
 * @param {Object} pipeline
 * @param {Object} [options]
 * @param {Object} [options.metadata] - extra metadata
 * @param {boolean} [options.compress=false] - minify
 * @returns {string} JSON
 */
export function serialize(
    pipeline: object,
    options: { metadata?: object; compress?: boolean } = {},
): string {
    if (!pipeline || typeof pipeline !== 'object') {
        return JSON.stringify({
            version: CURRENT_SCHEMA_VERSION,
            pipeline: null,
            metadata: null,
            checksum: '00000000',
        });
    }
    const pipelineJson = JSON.stringify(pipeline);
    const checksum = computeChecksum(pipelineJson);
    const envelope = {
        version: CURRENT_SCHEMA_VERSION,
        pipeline,
        metadata: options.metadata || null,
        checksum,
        serializedAt: new Date().toISOString(),
    };
    return options.compress ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2);
}

/**
 * Deserializa JSON string e valida.
 *
 * @param {string} jsonStr
 * @param {Object} [options]
 * @param {boolean} [options.verifyChecksum=true]
 * @returns {Readonly<{ok: boolean, pipeline?: any, metadata?: any, version?: number, serializedAt?: string|null, error?: string, detail?: string}>}
 */
export function deserialize(
    jsonStr: string,
    options: { verifyChecksum?: boolean } = {},
): Readonly<{
    ok: boolean;
    pipeline?: any;
    metadata?: any;
    version?: number;
    serializedAt?: string | null;
    error?: string;
    detail?: string;
}> {
    if (typeof jsonStr !== 'string') {
        return Object.freeze({
            ok: false,
            error: 'not_string',
        });
    }
    let envelope;
    try {
        envelope = JSON.parse(jsonStr);
    } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return Object.freeze({ ok: false, error: 'parse_error', detail });
    }
    if (!envelope || typeof envelope !== 'object') {
        return Object.freeze({ ok: false, error: 'not_object' });
    }
    if (!Number.isInteger(envelope.version)) {
        return Object.freeze({ ok: false, error: 'missing_version' });
    }
    if (envelope.version > CURRENT_SCHEMA_VERSION) {
        return Object.freeze({
            ok: false,
            error: 'unsupported_version',
            detail: `version ${envelope.version} > current ${CURRENT_SCHEMA_VERSION}`,
        });
    }
    const verify = options.verifyChecksum !== false;
    if (verify && envelope.pipeline) {
        const expected = envelope.checksum || '';
        const actual = computeChecksum(JSON.stringify(envelope.pipeline));
        if (expected !== actual) {
            return Object.freeze({
                ok: false,
                error: 'checksum_mismatch',
                detail: `expected ${expected}, got ${actual}`,
            });
        }
    }
    return Object.freeze({
        ok: true,
        pipeline: envelope.pipeline || null,
        metadata: envelope.metadata || null,
        version: envelope.version,
        serializedAt: envelope.serializedAt || null,
    });
}

/**
 * Migra envelope de versão antiga para CURRENT_SCHEMA_VERSION.
 *
 * @param {Record<string, any>} envelope
 * @returns {Object}
 */
export function migrate(envelope: Record<string, any>): object {
    if (!envelope || typeof envelope !== 'object') {
        return Object.freeze({ ok: false, error: 'invalid_envelope' });
    }
    if (envelope.version === CURRENT_SCHEMA_VERSION) {
        return Object.freeze({ ok: true, envelope, migrated: false });
    }
    if (envelope.version > CURRENT_SCHEMA_VERSION) {
        return Object.freeze({ ok: false, error: 'cannot_downgrade' });
    }
    // Future: chain v0 → v1 → v2 migrations
    return Object.freeze({
        ok: true,
        envelope: Object.freeze({ ...envelope, version: CURRENT_SCHEMA_VERSION }),
        migrated: true,
    });
}

/**
 * Round-trip: serialize → deserialize → comparison.
 *
 * @param {Object} pipeline
 * @returns {Readonly<{ok: boolean, restored?: any, equal?: boolean, error?: string}>}
 */
export function roundTrip(
    pipeline: object,
): Readonly<{ ok: boolean; restored?: any; equal?: boolean; error?: string | undefined }> {
    if (!pipeline) return Object.freeze({ ok: false });
    const json = serialize(pipeline);
    const result = deserialize(json);
    if (!result.ok) return Object.freeze({ ok: false, error: result.error });
    const equal = JSON.stringify(pipeline) === JSON.stringify(result.pipeline);
    return Object.freeze({
        ok: true,
        restored: result.pipeline,
        equal,
    });
}

/**
 * Sumariza envelope.
 */
export function summarizeEnvelope(jsonStr: any): Readonly<{
    valid: boolean;
    sizeBytes: number;
    version: number | null;
    hasMetadata: boolean;
    checksumValid: boolean;
    error?: string | null;
}> {
    const empty = {
        valid: false,
        sizeBytes: 0,
        version: null,
        hasMetadata: false,
        checksumValid: false,
    };
    if (typeof jsonStr !== 'string') return empty;
    const sizeBytes = jsonStr.length;
    const result = deserialize(jsonStr);
    return Object.freeze({
        valid: result.ok,
        sizeBytes,
        version: result.version || null,
        hasMetadata: Boolean(result.metadata),
        checksumValid: result.ok,
        error: result.error || null,
    });
}

/**
 * Module identity export.
 */
export const pipelinePersistenceMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 25,
    deliveredAt: '2026-05-01',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exports: [
        'CURRENT_SCHEMA_VERSION',
        'PERSISTENCE_META',
        'computeChecksum',
        'serialize',
        'deserialize',
        'migrate',
        'roundTrip',
        'summarizeEnvelope',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
