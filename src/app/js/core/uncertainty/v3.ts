// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   UNCERTAINTY V3 ENVELOPE — Pure-logic parser + apply helper (TRUST-008)
   Restaura `meta.uncertainty_metadata` no import — fecha gap TRUST-008.

   Producer: `core/io/ecbtV3Uncertainty.buildUncertaintyEnvelope` injeta
   envelope em `model.meta.uncertainty_metadata` no export quando flag V3.
   Consumer (até TRUST-008): nenhum — envelope era silenciosamente ignorado
   no `applyModel`. Este módulo fecha esse loop.

   Envelope shape (replicado de ecbtV3Uncertainty.ts):
   {
     schema: 'unc-v3',
     exported_at: ISO,
     field_meta_snapshot: [{ field_key, uncertainty, provenance, ... }],
     observation_uncertainty: { 'element:<id>:observation:<idx>': { ... } }
   }
   ================================================================ */

export const ECBT_V3_UNCERTAINTY_SCHEMA = 'unc-v3';

export interface FieldMetaRecord {
    field_key: string;
    [k: string]: unknown;
}

export interface UncertaintyEnvelope {
    schema: string;
    exported_at: string;
    field_meta_snapshot: FieldMetaRecord[];
    observation_uncertainty: Record<string, unknown>;
}

export interface ApplyEnvelopeDeps {
    setFieldMeta?: (key: string, meta: unknown) => Promise<void> | void;
    setObservationUncertainty?: (key: string, value: unknown) => Promise<void> | void;
}

export interface ApplyEnvelopeResult {
    applied: boolean;
    fieldMetaCount: number;
    observationCount: number;
    skipped: number;
    reason?: string;
}

/**
 * Verifica se um registro candidato é um FieldMetaRecord válido.
 */
function _isValidFieldMetaRecord(r: unknown): r is FieldMetaRecord {
    return !!r && typeof r === 'object' && typeof (r as any).field_key === 'string' && (r as any).field_key.length > 0;
}

/**
 * Extrai e filtra field_meta_snapshot do envelope raw.
 */
function _parseFieldMetaSnapshot(snap: unknown): FieldMetaRecord[] {
    const fieldMetaSnapshot: FieldMetaRecord[] = [];
    if (Array.isArray(snap)) {
        for (const r of snap) {
            if (_isValidFieldMetaRecord(r)) {
                fieldMetaSnapshot.push(r);
            }
        }
    }
    return fieldMetaSnapshot;
}

/**
 * Extrai e filtra observation_uncertainty do envelope raw.
 */
function _parseObservationUncertainty(raw: unknown): Record<string, unknown> {
    const observationUncertainty: Record<string, unknown> = {};
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof k === 'string' && k.length > 0 && v !== undefined) {
                observationUncertainty[k] = v;
            }
        }
    }
    return observationUncertainty;
}

/**
 * Parse + valida shape do envelope. Defensive: retorna null se inválido.
 * Não throw — caller decide o que fazer com null.
 */
export function parseUncertaintyEnvelope(raw: unknown): UncertaintyEnvelope | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (obj.schema !== ECBT_V3_UNCERTAINTY_SCHEMA) return null;

    return {
        schema: ECBT_V3_UNCERTAINTY_SCHEMA,
        exported_at: typeof obj.exported_at === 'string' ? obj.exported_at : '',
        field_meta_snapshot: _parseFieldMetaSnapshot(obj.field_meta_snapshot),
        observation_uncertainty: _parseObservationUncertainty(obj.observation_uncertainty),
    };
}

/**
 * Aplica envelope via deps injetadas. Caller fornece setFieldMeta/
 * setObservationUncertainty (geralmente wrappers async sobre IDB).
 * Se deps ausentes ou envelope inválido, retorna no-op {applied:false}.
 */
export async function applyUncertaintyEnvelope(
    rawEnvelope: unknown,
    deps?: ApplyEnvelopeDeps
): Promise<ApplyEnvelopeResult> {
    const env = parseUncertaintyEnvelope(rawEnvelope);
    if (!env) {
        return { applied: false, fieldMetaCount: 0, observationCount: 0, skipped: 0, reason: 'invalid-envelope' };
    }
    let fieldMetaCount = 0;
    let observationCount = 0;
    let skipped = 0;
    const setFm = deps?.setFieldMeta;
    if (typeof setFm === 'function') {
        for (const rec of env.field_meta_snapshot) {
            try {
                await setFm(rec.field_key, rec);
                fieldMetaCount++;
            } catch (e: any) {
                skipped++;
                console.debug('[uncertainty:v3:setFieldMeta]', rec.field_key, e?.message || e);
            }
        }
    } else {
        skipped += env.field_meta_snapshot.length;
    }
    const setOu = deps?.setObservationUncertainty;
    if (typeof setOu === 'function') {
        for (const [k, v] of Object.entries(env.observation_uncertainty)) {
            try {
                await setOu(k, v);
                observationCount++;
            } catch (e: any) {
                skipped++;
                console.debug('[uncertainty:v3:setObservationUncertainty]', k, e?.message || e);
            }
        }
    } else {
        skipped += Object.keys(env.observation_uncertainty).length;
    }
    return {
        applied: fieldMetaCount > 0 || observationCount > 0,
        fieldMetaCount,
        observationCount,
        skipped,
    };
}

/** Quick check para callers que só querem saber se o envelope é V3 válido. */
export function isV3Envelope(raw: unknown): boolean {
    return parseUncertaintyEnvelope(raw) !== null;
}
