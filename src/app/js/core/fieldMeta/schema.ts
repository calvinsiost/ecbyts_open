// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FIELD-META-001 Fase 1a — schema + constructors

   Field-with-Metadata wrapper schema. Transforms any input marked with
   data-field-meta="true" into a field carrying 13 metadata attributes
   (see SPEC_FIELD_META_001.md §"13 metadados").

   Fundamentação:
   - W3C PROV-O (https://www.w3.org/TR/prov-o/) — agent/activity alignment
   - FDA 21 CFR Part 11.10(e) — append-only audit trail
   - ALCOA++ — attributable, enduring, accountable
   - ScienceDirect 2017 — PROV at attribute level (valida scope)

   Storage is *parallel* to the canonical model — does NOT inflate each
   entity. Lookup by field_key in IDB namespace `field_meta:<modelId>:...`.
   ================================================================ */

export const FIELD_META_SCHEMA_VERSION = 'v1';

/** PROV-O activity enum (minimal viable subset). */
export const PROV_ACTIVITIES = Object.freeze([
    'manual_entry',
    'import',
    'derived',
    'wizard',
    'bulk_edit',
    'ai_suggestion',
]);

/** PROV-O agent type. */
export const PROV_AGENT_TYPES = Object.freeze(['person', 'software']);

/** Validation state enum (ALCOA++ Accurate + Traceability). */
export const VALIDATION_STATES = Object.freeze(['pending_qc', 'approved', 'rejected', 'disputed']);

/** Flag enum — extensible, rejects unknown values. */
export const FIELD_FLAGS = Object.freeze(['locked', 'disputed', 'pending_qc', 'needs_review', 'outlier', 'estimated']);

/** Source type enum — evidence category. */
export const SOURCE_TYPES = Object.freeze(['doc', 'photo', 'url', 'lab_report', 'field_note', 'other']);

/** Epistemic confidence — separate from numerical uncertainty. */
export const CONFIDENCE_LEVELS = Object.freeze(['certain', 'high', 'moderate', 'low', 'guess']);

/** LGPD / privacy sensitivity tiers. */
export const PRIVACY_SENSITIVITY = Object.freeze(['public', 'internal', 'confidential', 'restricted']);

// ----------------------------------------------------------------
// LIBRARY EXTENSIBILITY — CONSIST-OBS-001 S4 (modelo B1: declarativo)
// ----------------------------------------------------------------

/**
 * Extensões de enum registradas por libraries (declarativo — apenas strings
 * adicionais para os enums extensíveis; os built-ins permanecem frozen).
 * Map<libraryId, { flags: string[], sourceTypes: string[] }>
 */
const _libraryEnumExtensions = new Map<string, { flags: string[]; sourceTypes: string[] }>();

/**
 * Register field-meta enum extensions from a library manifest (data-only).
 * Registra extensões declarativas dos enums extensíveis (flags / sourceTypes)
 * vindas de manifesto de library — B1: declarativo > executável.
 *
 * @param {{ flags?: string[], sourceTypes?: string[] }} ext
 * @param {string} ext
 * @returns {{ flags: string[], sourceTypes: string[] }|null} registrado ou null
 */
export function registerFieldMetaExtension(ext: any, libraryId: any) {
    if (!ext || typeof ext !== 'object' || !libraryId) return null;
    const clean = (arr: any) =>
        Array.isArray(arr)
            ? arr.filter((v) => typeof v === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(v))
            : [];
    const entry = { flags: clean(ext.flags), sourceTypes: clean(ext.sourceTypes) };
    if (entry.flags.length === 0 && entry.sourceTypes.length === 0) return null;
    _libraryEnumExtensions.set(String(libraryId), entry);
    return entry;
}

/** Remove as extensões de uma library. */
export function unregisterFieldMetaExtension(libraryId: any) {
    return _libraryEnumExtensions.delete(String(libraryId));
}

/** Flags efetivos = built-in (frozen) + extensões de libraries ativas. */
export function getEffectiveFieldFlags(): string[] {
    const out = [...FIELD_FLAGS];
    for (const e of _libraryEnumExtensions.values()) out.push(...e.flags);
    return out;
}

/** Source types efetivos = built-in + extensões de libraries ativas. */
export function getEffectiveSourceTypes(): string[] {
    const out = [...SOURCE_TYPES];
    for (const e of _libraryEnumExtensions.values()) out.push(...e.sourceTypes);
    return out;
}

/**
 * filled_by - who/what produced the current value (ADR A11, 2026-04-12).
 * Distinct from provenance (PROV-O structured) and confidence (epistemic).
 * Single tag drives badge color so a glance tells human vs AI vs sensor.
 */
export const FILLED_BY_VALUES = Object.freeze([
    'human', // person typed / selected
    'ai', // LLM / assistant / ML model suggestion accepted
    'imported', // bulk from CSV / XLSX / ECBT key
    'computed', // derived from formula / pipeline
    'sensor', // automatic from IoT device
    'unknown', // default; legacy data without attribution
]);

/** Visual palette for filled_by badge (consumed by fieldMetaWrapper CSS). */
export const FILLED_BY_BADGE = Object.freeze({
    human: { color: '#22c55e', label: 'humano', glyph: 'H' },
    ai: { color: '#8b5cf6', label: 'IA', glyph: 'AI' },
    imported: { color: '#60a5fa', label: 'importado', glyph: 'I' },
    computed: { color: '#f59e0b', label: 'calculado', glyph: 'ƒ' },
    sensor: { color: '#06b6d4', label: 'sensor', glyph: 'S' },
    unknown: { color: '#6b7280', label: 'desconhecido', glyph: '?' },
});

/**
 * Create a default (empty) FieldMeta record for a given field_key and value.
 */
export function createFieldMeta({
    field_key,
    value = null,
    set_by = null,
    agent_label = '',
    filled_by = 'unknown',
}: {
    field_key?: string;
    value?: any;
    set_by?: string | null;
    agent_label?: string;
    filled_by?: string;
} = {}): Record<string, any> {
    if (!field_key || typeof field_key !== 'string') {
        throw new Error('createFieldMeta: field_key (string) is required');
    }
    if (!FILLED_BY_VALUES.includes(filled_by)) {
        throw new Error(`createFieldMeta: filled_by must be one of ${FILLED_BY_VALUES.join('|')}`);
    }
    const now = new Date().toISOString();
    return {
        schema_version: FIELD_META_SCHEMA_VERSION,
        field_key,
        value,
        filled_by,
        uncertainty: null,
        provenance: createProvenance({ activity: 'manual_entry', set_by, set_at: now, agent_label }),
        revisions: [],
        flags: [],
        validation_state: 'pending_qc',
        sources: [],
        regulatory_refs: [],
        confidence: null,
        computed: { is_computed: false, formula: null, inputs: [] },
        dependents: [],
        temporal_validity: { valid_from: null, valid_until: null },
        privacy: { is_pii: false, sensitivity: 'internal' },
        notes: '',
        locked_by: null,
        ai_suggested: false,
        // FIELD-META-EXT-001 — extended sections (null by default, backward compat).
        // Populated via UI tabs in fieldMetaPopover (Calibração / Grupo / Adicional).
        // Schemas live in core/fieldMeta/extendedMetadata.js (builders + CRUD).
        calibration: null,
        dataGroup: null,
        additionalData: null,
    };
}

/**
 * Mutate filled_by + log a revision (if value changed). Idempotent on same
 * filled_by without value change.
 */
export function setFilledBy(
    meta: Record<string, any>,
    {
        filled_by,
        new_value = undefined,
        by = null,
        reason = 'filled_by change',
    }: { filled_by: string; new_value?: any; by?: string | null; reason?: string },
): Record<string, any> {
    if (!FILLED_BY_VALUES.includes(filled_by)) {
        throw new Error(`setFilledBy: filled_by must be one of ${FILLED_BY_VALUES.join('|')}`);
    }
    const changed = new_value !== undefined && new_value !== meta.value;
    if (!changed && meta.filled_by === filled_by) return meta;
    const next: Record<string, any> = { ...meta, filled_by };
    if (changed) {
        next.value = new_value;
        next.revisions = [
            ...(meta.revisions || []),
            {
                revision_id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                at: new Date().toISOString(),
                by,
                prev_value: meta.value,
                new_value,
                reason: String(reason).trim(),
            },
        ];
    }
    return next;
}

/**
 * Build a PROV-O compliant provenance object (minimal viable).
 */
export function createProvenance({
    activity = 'manual_entry',
    set_by = null,
    set_at = null,
    agent_label = '',
    agent_type = 'person',
}: {
    activity?: string;
    set_by?: string | null;
    set_at?: string | null;
    agent_label?: string;
    agent_type?: string;
} = {}): {
    set_by: string | null;
    set_at: string;
    activity: string;
    agent: { type: string; id: string | null; label: string };
} {
    if (!PROV_ACTIVITIES.includes(activity)) {
        throw new Error(`createProvenance: activity must be one of ${PROV_ACTIVITIES.join('|')}`);
    }
    if (!PROV_AGENT_TYPES.includes(agent_type)) {
        throw new Error(`createProvenance: agent_type must be one of ${PROV_AGENT_TYPES.join('|')}`);
    }
    return {
        set_by,
        set_at: set_at || new Date().toISOString(),
        activity,
        agent: {
            type: agent_type,
            id: set_by,
            label: String(agent_label || ''),
        },
    };
}

/**
 * Append a revision entry (21 CFR Part 11.10(e) append-only).
 * Does NOT mutate meta - returns a new FieldMeta with revision appended.
 * `reason` is mandatory to enforce ALCOA++ attributable change.
 */
export function appendRevision(
    meta: Record<string, any>,
    {
        prev_value,
        new_value,
        by = null,
        reason,
    }: { prev_value: any; new_value: any; by?: string | null; reason: string },
): Record<string, any> {
    if (!meta || typeof meta !== 'object') throw new Error('appendRevision: meta required');
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
        throw new Error('appendRevision: reason is mandatory (ALCOA++ attributable)');
    }
    const rev = {
        revision_id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        by,
        prev_value,
        new_value,
        reason: String(reason).trim(),
    };
    return {
        ...meta,
        value: new_value,
        revisions: [...(meta.revisions || []), rev],
    };
}

/**
 * Is this meta record at "default" state (no user-declared data)?
 * Used to hide the metadata-indicator dot when nothing is set.
 */
export function isDefaultMeta(meta: Record<string, any> | null | undefined): boolean {
    if (!meta || typeof meta !== 'object') return true;
    return (
        !meta.uncertainty &&
        (!Array.isArray(meta.revisions) || meta.revisions.length === 0) &&
        (!Array.isArray(meta.flags) || meta.flags.length === 0) &&
        (!Array.isArray(meta.sources) || meta.sources.length === 0) &&
        (!Array.isArray(meta.regulatory_refs) || meta.regulatory_refs.length === 0) &&
        !meta.confidence &&
        !meta.computed?.is_computed &&
        (!Array.isArray(meta.dependents) || meta.dependents.length === 0) &&
        !meta.temporal_validity?.valid_until &&
        !meta.privacy?.is_pii &&
        !meta.notes &&
        !meta.locked_by &&
        !meta.ai_suggested &&
        meta.validation_state === 'pending_qc'
    );
}

/**
 * Shallow validation: returns {ok: boolean, errors: string[]}.
 * Does not recurse into uncertainty (that's validated by UNC-STRUCTURAL-001).
 */
export function validateFieldMeta(meta: Record<string, any> | null | undefined): {
    ok: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    if (!meta || typeof meta !== 'object') {
        return { ok: false, errors: ['meta is required object'] };
    }
    if (meta.schema_version !== FIELD_META_SCHEMA_VERSION) {
        errors.push(`schema_version must be ${FIELD_META_SCHEMA_VERSION}`);
    }
    if (!meta.field_key || typeof meta.field_key !== 'string') {
        errors.push('field_key must be non-empty string');
    }
    if (meta.validation_state && !VALIDATION_STATES.includes(meta.validation_state)) {
        errors.push(`validation_state must be one of ${VALIDATION_STATES.join('|')}`);
    }
    if (meta.confidence !== null && meta.confidence !== undefined && !CONFIDENCE_LEVELS.includes(meta.confidence)) {
        errors.push(`confidence must be one of ${CONFIDENCE_LEVELS.join('|')} or null`);
    }
    // CONSIST-OBS-001 S4: valida contra enums EFETIVOS (built-in + extensões
    // declarativas de libraries) — built-ins permanecem frozen.
    const effFlags = getEffectiveFieldFlags();
    const effSourceTypes = getEffectiveSourceTypes();
    if (Array.isArray(meta.flags)) {
        for (const f of meta.flags) {
            if (!effFlags.includes(f)) errors.push(`unknown flag: ${f}`);
        }
    }
    if (Array.isArray(meta.sources)) {
        for (const s of meta.sources) {
            if (s && !effSourceTypes.includes(s.type)) {
                errors.push(`source.type must be one of ${effSourceTypes.join('|')}`);
            }
        }
    }
    if (meta.privacy?.sensitivity && !PRIVACY_SENSITIVITY.includes(meta.privacy.sensitivity)) {
        errors.push(`privacy.sensitivity must be one of ${PRIVACY_SENSITIVITY.join('|')}`);
    }
    if (meta.filled_by !== undefined && !FILLED_BY_VALUES.includes(meta.filled_by)) {
        errors.push(`filled_by must be one of ${FILLED_BY_VALUES.join('|')}`);
    }
    // FIELD-META-EXT-001 — extended sections: shape-only check. Deep
    // schema validation is the responsibility of extendedMetadata.js
    // builders at write time.
    if (meta.calibration !== undefined && meta.calibration !== null && typeof meta.calibration !== 'object') {
        errors.push('calibration must be object or null');
    }
    if (meta.dataGroup !== undefined && meta.dataGroup !== null && typeof meta.dataGroup !== 'object') {
        errors.push('dataGroup must be object or null');
    }
    if (meta.additionalData !== undefined && meta.additionalData !== null && !Array.isArray(meta.additionalData)) {
        errors.push('additionalData must be array or null');
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Canonical field_key builder. Example: element:abc123:observation:0:reading
 */
export function buildFieldKey({
    entity,
    id,
    sub_entity = null,
    sub_id = null,
    field,
}: {
    entity: string;
    id: string | number;
    sub_entity?: string | null;
    sub_id?: string | number | null;
    field: string;
}): string {
    if (!entity || !id || !field) {
        throw new Error('buildFieldKey: entity, id, field are required');
    }
    const parts: Array<string | number> = [entity, id];
    if (sub_entity !== null && sub_id !== null) parts.push(sub_entity, sub_id);
    parts.push(field);
    return parts.map((p) => String(p)).join(':');
}
