// @ts-check
// Generated from src/app/js/core/io/ecbtV3Uncertainty.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   UNC-STRUCTURAL-001 gap #4 — ECBT v3 uncertainty preservation

   Adds an optional `uncertainty_metadata` envelope to model exports so
   ECBT keys (v3 schema) round-trip observation.uncertainty fields plus
   FieldMeta store snapshot.

   Design:
   - v2 keys continue to encode model as-is (back-compat).
   - v3 opt-in: when CONFIG.FEATURES.UNC_STRUCTURAL_V3_EXPORT === true,
     exporter includes `uncertainty_metadata` subtree in the model
     payload BEFORE encoding. Decoder reads it back when present.
   - This module is the pure-JS helper; hook-up in encoder/decoder is
     Phase 4 (requires audit of crypto layer).

   Schema (attached to model.meta.uncertainty_metadata):
   {
     schema: 'unc-v3',
     exported_at: ISO,
     field_meta_snapshot: [
       { field_key, uncertainty, provenance, revisions, flags,
         validation_state, sources, regulatory_refs, censored, qc_flags }
     ],
     observation_uncertainty: {
       // keyed by 'element:<id>:observation:<idx>'
       'element:abc:observation:0': { class, value, sources, components, ... }
     }
   }
   ================================================================ */
export const ECBT_V3_UNCERTAINTY_SCHEMA = 'unc-v3';
/**
 * @typedef {Object} FieldMetaRecord
 * @property {string} field_key
 * @property {unknown} [uncertainty]
 * @property {unknown} [provenance]
 * @property {ReadonlyArray<unknown>} [revisions]
 * @property {ReadonlyArray<unknown>} [flags]
 * @property {string} [validation_state]
 * @property {ReadonlyArray<unknown>} [sources]
 * @property {ReadonlyArray<unknown>} [regulatory_refs]
 * @property {unknown} [censored]
 * @property {ReadonlyArray<unknown>} [qc_flags]
 * @property {string} [filled_by]
 * @property {unknown} [value]
 * @property {{ is_computed: boolean, formula: unknown, inputs: ReadonlyArray<unknown> }} [computed]
 * @property {ReadonlyArray<unknown>} [dependents]
 * @property {{ valid_from: unknown, valid_until: unknown }} [temporal_validity]
 * @property {{ is_pii: boolean, sensitivity: string }} [privacy]
 * @property {string} [notes]
 * @property {unknown} [locked_by]
 * @property {boolean} [ai_suggested]
 */
/**
 * @typedef {Object} UncertaintyEnvelope
 * @property {string} schema
 * @property {string} exported_at
 * @property {FieldMetaRecord[]} field_meta_snapshot
 * @property {Record<string, unknown>} observation_uncertainty
 */
/**
 * Build the uncertainty_metadata envelope from the current FieldMeta store.
 * Caller must supply getters to avoid hard-coupling.
 *
 * @param {{
 *   getAllFieldMetas?: () => Promise<ReadonlyArray<FieldMetaRecord>>,
 *   getAllElements?: () => ReadonlyArray<{ id?: string, observations?: ReadonlyArray<{ uncertainty?: unknown }> }>
 * }} [deps]
 * @returns {Promise<UncertaintyEnvelope|null>} envelope or null if nothing to export
 */
export async function buildUncertaintyEnvelope({ getAllFieldMetas, getAllElements }: any = {}) {
    if (typeof getAllFieldMetas !== 'function' && typeof getAllElements !== 'function') {
        return null;
    }
    /** @type {UncertaintyEnvelope} */
    const envelope = {
        schema: ECBT_V3_UNCERTAINTY_SCHEMA,
        exported_at: new Date().toISOString(),
        field_meta_snapshot: [],
        observation_uncertainty: {} as Record<string, any>,
    };
    try {
        if (typeof getAllFieldMetas === 'function') {
            const fms = (await getAllFieldMetas()) || [];
            envelope.field_meta_snapshot = fms.map((m: any) => ({
                field_key: m.field_key,
                uncertainty: m.uncertainty || null,
                provenance: m.provenance || null,
                revisions: m.revisions || [],
                flags: m.flags || [],
                validation_state: m.validation_state || 'pending_qc',
                sources: m.sources || [],
                regulatory_refs: m.regulatory_refs || [],
                censored: m.censored || null,
                qc_flags: m.qc_flags || [],
                filled_by: m.filled_by || 'unknown',
            }));
        }
    } catch (err: any) {
        console.warn('[ecbtV3] FieldMeta snapshot skipped:', /** @type {Error} */ (err)?.message);
    }
    if (typeof getAllElements === 'function') {
        try {
            const elements = getAllElements() || [];
            for (const el of elements) {
                const obs = Array.isArray(el?.observations) ? el.observations : [];
                for (let i = 0; i < obs.length; i++) {
                    const o = obs[i];
                    if (o?.uncertainty && typeof o.uncertainty === 'object') {
                        const key = `element:${el.id}:observation:${i}`;
                        envelope.observation_uncertainty[key] = o.uncertainty;
                    }
                }
            }
        } catch (err: any) {
            console.warn('[ecbtV3] observation scan skipped:', /** @type {Error} */ (err)?.message);
        }
    }
    const isEmpty =
        envelope.field_meta_snapshot.length === 0 && Object.keys(envelope.observation_uncertainty).length === 0;
    return isEmpty ? null : envelope;
}
/**
 * Decode - restore FieldMeta records from an envelope into the store.
 * @param {UncertaintyEnvelope|null|undefined} envelope
 * @param {{ setFieldMeta?: (field_key: string, meta: Record<string, unknown>) => Promise<void> }} [deps]
 * @returns {Promise<{restored: number, observation_keys: number}>}
 */
export async function restoreUncertaintyEnvelope(envelope: any, { setFieldMeta }: any = {}) {
    if (!envelope || envelope.schema !== ECBT_V3_UNCERTAINTY_SCHEMA) {
        throw new Error(`restoreUncertaintyEnvelope: unknown schema ${envelope?.schema}`);
    }
    if (typeof setFieldMeta !== 'function') {
        throw new Error('restoreUncertaintyEnvelope: setFieldMeta is required');
    }
    let restored = 0;
    for (const rec of envelope.field_meta_snapshot || []) {
        if (!rec?.field_key) continue;
        try {
            await setFieldMeta(rec.field_key, {
                schema_version: 'v1',
                ...rec,
                value: rec.value ?? null,
                computed: rec.computed || { is_computed: false, formula: null, inputs: [] },
                dependents: rec.dependents || [],
                temporal_validity: rec.temporal_validity || { valid_from: null, valid_until: null },
                privacy: rec.privacy || { is_pii: false, sensitivity: 'internal' },
                notes: rec.notes || '',
                locked_by: rec.locked_by || null,
                ai_suggested: rec.ai_suggested || false,
            });
            restored++;
        } catch (err: any) {
            console.warn(`[ecbtV3] restore ${rec.field_key} failed:`, /** @type {Error} */ (err)?.message);
        }
    }
    return {
        restored,
        observation_keys: Object.keys(envelope.observation_uncertainty || {}).length,
    };
}
/**
 * Feature flag read helper - returns true when v3 export is enabled.
 * Gate duplo: (a) flag global CONFIG.FEATURES.UNC_STRUCTURAL_V3_EXPORT
 * OU (b) usuário é PLATFORM_ADMIN (validação em produção antes do rollout).
 * CONFIG importado lazy para evitar cycles.
 * @returns {Promise<boolean>}
 */
export async function isV3ExportEnabled() {
    try {
        // Lazy dynamic import avoids a static config cycle.
        const cfgMod = /** @type {{ CONFIG: any }} */ (await import('../../config.js'));
        const CONFIG = cfgMod.CONFIG;
        if (CONFIG?.FEATURES?.UNC_STRUCTURAL_V3_EXPORT) return true;
        // Admin gate - permite teste em prod sem ativar globalmente.
        const admins: string[] = Array.isArray(CONFIG?.PLATFORM_ADMINS) ? CONFIG.PLATFORM_ADMINS : [];
        if (admins.length === 0) return false;
        // Lazy dynamic import avoids a static session dependency.
        const sessionMod = /** @type {{ getCurrentSession?: () => any }} */ (
            await import('../../utils/auth/session.js')
        );
        const getCurrentSession = sessionMod.getCurrentSession;
        const session = /** @type {{ user?: { email?: string }, email?: string } | null} */ (
            typeof getCurrentSession === 'function' ? getCurrentSession() : null
        );
        const email = session?.user?.email || session?.email || null;
        return !!email && admins.includes(email);
    } catch {
        return false;
    }
}
//# sourceMappingURL=ecbtV3Uncertainty.js.map
