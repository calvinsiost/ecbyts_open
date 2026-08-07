// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty — observation-level schema (UNC-STRUCTURAL-001 Fase 1a)

   Makes uncertainty a first-class attribute of every observation.

   Design grounded in:
   - ISO 19156:2023 §7.3 resultQuality: DQ_Element (optional in ISO,
     elevated to mandatory here per ORION "first-class citizen" pattern).
   - EPA IRIS / CREM 2009: "defaults must be declared, not embedded".
   - JCGM GUM-1:2023 §5.2: combined uncertainty via quadrature sum.
   - ACS E&ST 2023, MDPI Metrology 2025: sampling × analytical components.
   - ISO 33406:2024: nominal/qualitative properties treatment.

   Schema:
     uncertainty: {
       class: Q2Q,                                 // 5 levels
       value: number | null,                       // u_rel combined
       sources: ('sampling'|'analytical'|'qualitative'|'inherited')[],
       components: { sampling?, analytical?, qualitative? },
       note: string,
       provenance: { set_at, set_by, method }
     }
   ================================================================ */

/** Q2Q qualitative levels (JCGM 101 aligned). */
export const Q2Q_LEVELS = Object.freeze(['very_low', 'low', 'medium', 'high', 'very_high']);

/**
 * Layman-friendly labels in Portuguese (pt-BR).
 * Kept outside i18n/ because this is a core invariant - the schema is
 * authoritative and labels must travel with it.
 */
export const Q2Q_LAYMAN_LABELS_PT = Object.freeze({
    very_low: 'Muito baixa',
    low: 'Baixa',
    medium: 'Moderada',
    high: 'Alta',
    very_high: 'Muito alta',
});

export const Q2Q_LAYMAN_LABELS_EN = Object.freeze({
    very_low: 'Very low',
    low: 'Low',
    medium: 'Moderate',
    high: 'High',
    very_high: 'Very high',
});

/**
 * Allowed uncertainty source tags - 6-category taxonomy following
 * Eurachem/CITAC Guide 2nd Edition (2019) "holistic measurement process".
 * Annex A (Wizard Q2Q) documents how each wizard screen maps to these.
 */
export const UNCERTAINTY_SOURCES = Object.freeze([
    'installation', // well construction, piezometer placement, anular seal
    'sampling', // collection/field handling, aliquot representativeness
    'analytical', // lab/instrumental
    'qualitative', // Q2Q mapping
    'modeled', // interpolation / kriging / fate-and-transport
    'inherited', // legacy data without declared U
]);

/** Domains supported in UNC-STRUCTURAL-001 Phase 1 (Annex A). */
export const DOMAINS = Object.freeze(['environmental', 'occupational']);

/**
 * QC flags - extensible enum (Annex A Tela 0 gate).
 * Live on the observation itself, not inside uncertainty - because
 * `compromised_sample` rejects the observation entirely.
 */
export const QC_FLAGS = Object.freeze(['invalid_holding_time', 'compromised_sample']);

/**
 * Censored limit types (Annex A Tela 0.5).
 * LD = Limite de Detecção; LQ = Limite de Quantificação.
 */
export const CENSORED_LIMIT_TYPES = Object.freeze(['LD', 'LQ']);

/** Allowed provenance.method enum. */
export const PROVENANCE_METHODS = Object.freeze([
    'manual',
    'auto_inherited',
    'derived_from_replicates',
    'q2q_default',
    'imported',
    'environmental_wizard',
    'occupational_wizard',
    'sensor_wizard',
]);

interface UncertaintyComponents {
    installation?: number | null;
    sampling?: number | null;
    analytical?: number | null;
    qualitative?: number | null;
    modeled?: number | null;
}
interface UncertaintyProvenance {
    set_at?: string | null;
    set_by?: string | null;
    method: string;
}
interface UncertaintyRecord {
    class: string;
    value: number | null;
    sources: string[];
    components: {
        installation: number | null;
        sampling: number | null;
        analytical: number | null;
        qualitative: number | null;
        modeled: number | null;
    };
    note: string;
    provenance: { set_at: string; set_by: string | null; method: string };
}

/**
 * Construct a canonical uncertainty record.
 * Throws on invalid input - internal API, callers should validate first.
 *
 * @param {{
 *   class: string,
 *   value?: number|null,
 *   sources: string[],
 *   components?: UncertaintyComponents,
 *   note?: string,
 *   provenance?: UncertaintyProvenance|null,
 * }} params
 * @returns {UncertaintyRecord}
 */
function _validateQ2qClass(q2qClass: string): void {
    if (!Q2Q_LEVELS.includes(q2qClass)) {
        throw new Error(`createUncertainty: class must be one of ${Q2Q_LEVELS.join('|')} (got ${q2qClass})`);
    }
}

function _validateSources(sources: string[]): void {
    if (!Array.isArray(sources) || sources.length === 0) {
        throw new Error('createUncertainty: sources must be a non-empty array');
    }
    for (const s of sources) {
        if (!UNCERTAINTY_SOURCES.includes(s)) {
            throw new Error(`createUncertainty: unknown source "${s}"`);
        }
    }
}

function _validateUncertaintyValue(value: number | null): void {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`createUncertainty: value must be finite >=0 or null (got ${value})`);
    }
}

function _resolveProvenance(
    provenance: UncertaintyProvenance | null,
): { set_at: string; set_by: string | null; method: string } {
    const prov = provenance || {
        set_at: new Date().toISOString(),
        set_by: null,
        method: 'manual',
    };
    if (!PROVENANCE_METHODS.includes(prov.method)) {
        throw new Error(`createUncertainty: provenance.method invalid "${prov.method}"`);
    }
    return {
        set_at: prov.set_at || new Date().toISOString(),
        set_by: prov.set_by ?? null,
        method: prov.method,
    };
}

function _buildUncertaintyComponents(components: UncertaintyComponents): UncertaintyRecord['components'] {
    return {
        installation: _normalizeComponent(components.installation),
        sampling: _normalizeComponent(components.sampling),
        analytical: _normalizeComponent(components.analytical),
        qualitative: _normalizeComponent(components.qualitative),
        modeled: _normalizeComponent(components.modeled),
    };
}

interface CreateUncertaintyParams {
    class: string;
    value?: number | null;
    sources: string[];
    components?: UncertaintyComponents;
    note?: string;
    provenance?: UncertaintyProvenance | null;
}

export function createUncertainty(
    {
        class: q2qClass,
        value = null,
        sources,
        components = {},
        note = '',
        provenance = null,
    }: CreateUncertaintyParams = {} as CreateUncertaintyParams,
): UncertaintyRecord {
    _validateQ2qClass(q2qClass);
    _validateSources(sources);
    _validateUncertaintyValue(value);
    const prov = _resolveProvenance(provenance);
    return {
        class: q2qClass,
        value,
        sources: [...sources],
        components: _buildUncertaintyComponents(components),
        note: String(note || ''),
        provenance: prov,
    };
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function _normalizeComponent(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * True if the observation has a measured/declared uncertainty.
 * False if source includes 'inherited' and value is null/missing.
 * @param {{ uncertainty?: { sources?: unknown, value?: unknown } } | null | undefined} obs
 * @returns {boolean}
 */
export function isUncertaintyDeclared(
    obs: { uncertainty?: { sources?: unknown; value?: unknown } } | null | undefined,
): boolean {
    const u = obs?.uncertainty;
    if (!u || !Array.isArray(u.sources)) return false;
    const onlyInherited = u.sources.length === 1 && u.sources[0] === 'inherited';
    if (onlyInherited && (u.value === null || u.value === undefined)) return false;
    return true;
}

/**
 * Combine component uncertainties via quadrature sum (GUM §5.2).
 * Returns null if all components are null/zero.
 *
 * @param {UncertaintyComponents} [components]
 * @returns {number|null}
 */
export function combineComponents(components: UncertaintyComponents = {}): number | null {
    let sumSq = 0;
    let seen = false;
    const keys: Array<keyof UncertaintyComponents> = [
        'installation',
        'sampling',
        'analytical',
        'qualitative',
        'modeled',
    ];
    for (const key of keys) {
        const v = components?.[key];
        if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
            const n = Number(v);
            if (n > 0) {
                sumSq += n * n;
                seen = true;
            }
        }
    }
    if (!seen) return null;
    return Math.sqrt(sumSq);
}

/**
 * Badge color for observation uncertainty.
 * - 'yellow': inherited + value null (needs action)
 * - 'blue':   source is q2q_default method (using default Q2Q)
 * - 'green':  declared (measured / derived / imported)
 * - 'gray':   no uncertainty field at all (should not happen post-migration)
 * @param {{ sources?: unknown, value?: unknown, provenance?: { method?: string } } | null | undefined} uncertainty
 * @returns {'yellow'|'blue'|'green'|'gray'}
 */
export function uncertaintyBadge(
    uncertainty: { sources?: unknown; value?: unknown; provenance?: { method?: string } } | null | undefined,
): 'yellow' | 'blue' | 'green' | 'gray' {
    if (!uncertainty || !Array.isArray(uncertainty.sources)) return 'gray';
    const sources = uncertainty.sources;
    if (sources.includes('inherited') && (uncertainty.value === null || uncertainty.value === undefined)) {
        return 'yellow';
    }
    if (uncertainty.provenance?.method === 'q2q_default') return 'blue';
    return 'green';
}

/**
 * Migrate a legacy observation to the new schema.
 * Idempotent: if already has uncertainty field, returns as-is.
 *
 * Legacy observations can have:
 * - obs.uncertainty (pre-existing numeric) → tag as analytical measured
 * - obs.rpd / obs.rsd (relative precision) → aggregate as analytical
 * - nothing → 'inherited' with value=null (yellow badge)
 *
 * @param {Record<string, unknown> | null | undefined} existingU
 * @param {{ userId?: string|null }} [opts]
 * @returns {Record<string, unknown> | null | undefined} new observation (shallow-cloned) with uncertainty set
 */
function _isMigratedUncertainty(existingU: unknown): boolean {
    return Boolean(
        existingU &&
            typeof existingU === 'object' &&
            Array.isArray((existingU as { sources?: unknown }).sources),
    );
}

function _extractLegacyUncertainty(obsRec: Record<string, unknown>): {
    legacyValue: number | null;
    legacyMethod: string;
    sources: string[];
} {
    let legacyValue: number | null = null;
    let legacyMethod = 'auto_inherited';
    let sources: string[] = ['inherited'];
    const uVal = obsRec.uncertainty;
    if (typeof uVal === 'number' && Number.isFinite(uVal) && uVal >= 0) {
        legacyValue = uVal;
        sources = ['analytical'];
        legacyMethod = 'imported';
    } else if (Number.isFinite(Number(obsRec.rpd)) || Number.isFinite(Number(obsRec.rsd))) {
        const r = Number(obsRec.rsd ?? obsRec.rpd);
        if (r > 0 && r <= 1) {
            legacyValue = r;
            sources = ['analytical'];
            legacyMethod = 'derived_from_replicates';
        }
    }
    return { legacyValue, legacyMethod, sources };
}

export function migrateLegacyObservation(
    obs: Record<string, unknown> | null | undefined,
    { userId = null }: { userId?: string | null } = {},
): Record<string, unknown> | null | undefined {
    if (!obs || typeof obs !== 'object') return obs;
    const obsRec = obs as Record<string, unknown>;
    if (_isMigratedUncertainty(obsRec.uncertainty)) {
        // Already migrated or native
        return obs;
    }
    const out = { ...obsRec };
    const { legacyValue, legacyMethod, sources } = _extractLegacyUncertainty(obsRec);
    out.uncertainty = createUncertainty({
        class: 'medium',
        value: legacyValue,
        sources,
        components: legacyValue !== null ? { analytical: legacyValue } : {},
        note: legacyMethod === 'auto_inherited' ? 'Migrated from legacy data without declared uncertainty' : '',
        provenance: {
            set_at: new Date().toISOString(),
            set_by: userId,
            method: legacyMethod,
        },
    });
    return out;
}

/**
 * Build a censored-record attribute for observation (Annex A Tela 0.5).
 * Throws if is_censored=true without valid limit_type.
 * @param {{ is_censored?: boolean, limit_type?: string|null, limit_value?: number|null }} [params]
 * @returns {{ is_censored: boolean, limit_type: string|null, limit_value: number|null }}
 */
export function createCensoredRecord({
    is_censored = false,
    limit_type = null,
    limit_value = null,
}: { is_censored?: boolean; limit_type?: string | null; limit_value?: number | null } = {}): {
    is_censored: boolean;
    limit_type: string | null;
    limit_value: number | null;
} {
    if (is_censored) {
        if (!limit_type || !CENSORED_LIMIT_TYPES.includes(limit_type)) {
            throw new Error(`createCensoredRecord: limit_type must be ${CENSORED_LIMIT_TYPES.join('|')} when censored`);
        }
        const v = Number(limit_value);
        if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`createCensoredRecord: limit_value must be positive finite when censored`);
        }
    }
    return {
        is_censored: !!is_censored,
        limit_type: is_censored ? limit_type : null,
        limit_value: is_censored ? Number(limit_value) : null,
    };
}

/**
 * Type guard for DOMAINS enum.
 * @param {string} d
 * @returns {boolean}
 */
export function isValidDomain(d: string): boolean {
    return DOMAINS.includes(d);
}

/**
 * Type guard for QC_FLAGS enum.
 * @param {string} f
 * @returns {boolean}
 */
export function isValidQcFlag(f: string): boolean {
    return QC_FLAGS.includes(f);
}
