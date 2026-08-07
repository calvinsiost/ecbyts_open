// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_RADAR_INVERTED_OPENNESS_MONETIZATION — Fase 1 (claude - executor)
// Pure-logic classifier + transparency weight helper. Zero DOM, zero Supabase.
//
// Verbatim Calvin (2026-06-01): "100% de gratuidade para liberação de 100%
// e pago apenas se limitar o recorte de publicação."
//
// RF1: isOpenPublication(profile, slice) — pure boolean classifier.
// RF3: computeTransparencyWeight(isOpen, options) — peso EIS-T diferencial.
//
// NOT (anti-requisitos):
// - NÃO lê Supabase / RPC (caller resolve)
// - NÃO lê DOM (pure)
// - NÃO altera schema (deriva de campos existentes)

/** Profile shape (subset relevante para classificação). */
export interface RadarProfileLike {
    /** Famílias inclusas; '*' significa todas. */
    families?: ReadonlyArray<string> | '*' | null;
    /** Seções inclusas; '*' significa todas. */
    sections?: ReadonlyArray<string> | '*' | null;
    /** Preset name ('complete'/'compliance'/etc) ou kind alternativo. */
    kind?: string | null;
    name?: string | null;
}

/** Slice shape (subset relevante). */
export interface RadarSliceLike {
    includePaths?: ReadonlyArray<string> | null;
    excludePaths?: ReadonlyArray<string> | null;
    temporalFilter?: { from?: string | null; to?: string | null; aggregation?: string | null } | null;
    spatialFilter?: { bbox?: ReadonlyArray<number> | null } | null;
    redaction?: { pii?: 'none' | 'mask' | 'remove' | string | null; precision?: number | null } | null;
    rateLimit?: { requests_per_hour?: number | null; max_records_per_request?: number | null } | null;
    billing?: { required?: boolean | null; amount_brl?: number | null } | null;
}

/** Peso de transparência (EIS-T) por modo. */
export interface TransparencyWeightOptions {
    /** Peso atenuado para recorte. Default 0.5; clamped [0, 1]. */
    restrictedWeight?: number;
    /** Peso pleno para publicação aberta. Default 1.0; clamped [0, 1]. */
    openWeight?: number;
}

const DEFAULT_RESTRICTED_WEIGHT = 0.5;
const DEFAULT_OPEN_WEIGHT = 1.0;

/**
 * Retorna `true` apenas para publicação 100% aberta:
 * - perfil "complete" (families '*' E sections '*'); E
 * - slice sem includePaths/excludePaths; E
 * - redaction.pii em 'none' (ou ausente); E
 * - sem temporalFilter (com from/to/aggregation set); E
 * - sem spatialFilter (com bbox set); E
 * - billing.required !== true.
 *
 * Qualquer restrição = false (recorte pago).
 *
 * @param profile  perfil de broadcast (pode ser null para slice puro sobre preset complete)
 * @param slice    slice de publicação (pode ser null/undefined = sem restrição via slice)
 */
export function isOpenPublication(
    profile: RadarProfileLike | null | undefined,
    slice: RadarSliceLike | null | undefined,
): boolean {
    if (!_isCompleteProfile(profile)) return false;
    if (slice == null) return true;
    if (typeof slice !== 'object') return false;
    if (_hasIncludeExclude(slice)) return false;
    if (_hasRedaction(slice)) return false;
    if (_hasTemporalFilter(slice)) return false;
    if (_hasSpatialFilter(slice)) return false;
    if (_hasPaidBilling(slice)) return false;
    return true;
}

/**
 * Peso EIS-T diferencial.
 *   open      → openWeight (default 1.0)
 *   restrito  → restrictedWeight (default 0.5)
 * Ambos clamped em [0, 1] e fallback determinístico se NaN.
 */
export function computeTransparencyWeight(
    isOpen: boolean,
    options: TransparencyWeightOptions = {},
): number {
    const openWeight = _clamp01(options.openWeight, DEFAULT_OPEN_WEIGHT);
    const restrictedWeight = _clamp01(options.restrictedWeight, DEFAULT_RESTRICTED_WEIGHT);
    return isOpen ? openWeight : restrictedWeight;
}

/**
 * Classifica o motivo da restrição (útil para UI badge + telemetria).
 * Retorna `null` quando publicação é aberta.
 * Quando restrita, retorna a PRIMEIRA causa encontrada na ordem:
 * profile-not-complete → include/exclude → redaction → temporal → spatial → billing.
 */
export function classifyRestriction(
    profile: RadarProfileLike | null | undefined,
    slice: RadarSliceLike | null | undefined,
): null | 'profile-not-complete' | 'include-exclude' | 'redaction' | 'temporal-filter' | 'spatial-filter' | 'paid-billing' {
    if (!_isCompleteProfile(profile)) return 'profile-not-complete';
    if (slice == null) return null;
    if (typeof slice !== 'object') return 'profile-not-complete';
    if (_hasIncludeExclude(slice)) return 'include-exclude';
    if (_hasRedaction(slice)) return 'redaction';
    if (_hasTemporalFilter(slice)) return 'temporal-filter';
    if (_hasSpatialFilter(slice)) return 'spatial-filter';
    if (_hasPaidBilling(slice)) return 'paid-billing';
    return null;
}

// ------------------------------------------------------------------
// Internal helpers (pure)
// ------------------------------------------------------------------

function _isCompleteProfile(profile: RadarProfileLike | null | undefined): boolean {
    if (profile == null || typeof profile !== 'object') return false;
    return _matchesWildcard(profile.families) && _matchesWildcard(profile.sections);
}

function _matchesWildcard(value: unknown): boolean {
    return value === '*';
}

function _hasIncludeExclude(slice: RadarSliceLike): boolean {
    const inc = slice.includePaths;
    const exc = slice.excludePaths;
    if (Array.isArray(inc) && inc.length > 0) return true;
    if (Array.isArray(exc) && exc.length > 0) return true;
    return false;
}

function _hasRedaction(slice: RadarSliceLike): boolean {
    const r = slice.redaction;
    if (r == null || typeof r !== 'object') return false;
    if (r.pii != null && r.pii !== 'none') return true;
    if (typeof r.precision === 'number' && Number.isFinite(r.precision)) return true;
    return false;
}

function _hasTemporalFilter(slice: RadarSliceLike): boolean {
    const t = slice.temporalFilter;
    if (t == null || typeof t !== 'object') return false;
    if (typeof t.from === 'string' && t.from.length > 0) return true;
    if (typeof t.to === 'string' && t.to.length > 0) return true;
    if (typeof t.aggregation === 'string' && t.aggregation.length > 0) return true;
    return false;
}

function _hasSpatialFilter(slice: RadarSliceLike): boolean {
    const s = slice.spatialFilter;
    if (s == null || typeof s !== 'object') return false;
    if (Array.isArray(s.bbox) && s.bbox.length > 0) return true;
    return false;
}

function _hasPaidBilling(slice: RadarSliceLike): boolean {
    const b = slice.billing;
    if (b == null || typeof b !== 'object') return false;
    if (b.required === true) return true;
    if (typeof b.amount_brl === 'number' && b.amount_brl > 0) return true;
    return false;
}

/**
 * Decide se uma ativação de broadcast deve consumir radar_slot (quota).
 *
 * Regra (F2b): consumir SE feature flag OFF OU publicação NÃO-aberta.
 *
 * @param profile     perfil DB ou ProfileLike
 * @param slice       slice opcional (null/undefined = sem recorte)
 * @param flagEnabled estado da feature flag RADAR_INVERTED_MONETIZATION
 * @returns true → consumir quota; false → bypass gratuito
 */
export function shouldConsumeRadarSlot(
    profile: RadarProfileLike | null | undefined,
    slice: RadarSliceLike | null | undefined,
    flagEnabled: boolean,
): boolean {
    if (!flagEnabled) return true;
    return !isOpenPublication(profile, slice);
}

/**
 * Adapta uma linha de DB `radar_broadcast_profiles` para ProfileLike usado
 * pelo classificador. Campos DB:
 *   - visible_families: '*' | string[] | null
 *   - visible_sections: '*' | string[] | null
 *   - name: string
 *
 * Tolerância: arrays cheios em vez de '*' tratados como NÃO-complete
 * (preserva semantic exato — só wildcard '*' qualifica como completo).
 */
export function profileFromDbRow(row: unknown): RadarProfileLike | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as any;
    return {
        families: r.visible_families ?? null,
        sections: r.visible_sections ?? null,
        name: typeof r.name === 'string' ? r.name : null,
        kind: r.kind || null,
    };
}

function _clamp01(value: number | undefined | null, fallback: number): number {
    const n = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
