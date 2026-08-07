// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (core/constants/manager).
//
// core/constants/manager.ts (533L) tem validateConstant + _sanitize + _sanitizeDate
// como lógica pura científica (validação de incerteza GUM + coverage factor k).
// Extração libera teste isolado + reuso por ingestion/import boundaries.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 10º Module C da campanha.
//
// Spec NOT:
// - NÃO ler module state (state.constants — caller passa existing symbols)
// - NÃO chamar Date.now direto (caller injeta nowIso para testabilidade)
// - NÃO chamar window.__ecbyts_calculator (dependents fica no manager)
// - NÃO emoji
//
// Extracted helpers:
//   - ConstantLike / ValidationResult / UncertaintyType (canonical types)
//   - CONSTANT_SYMBOL_REGEX            (frozen — identificador científico)
//   - UNCERTAINTY_TYPES               (frozen ['absolute','relative'])
//   - CONSTANT_FIELD_LIMITS           (frozen max lengths)
//   - validateConstantFields(partial, existingSymbols, existingId)  pure
//   - sanitizeConstantDate(val)       pure YYYY-MM-DD parser
//   - sanitizeConstant(c, nowIso)     pure normalizer (DI clock)
//   - isValidConstantSymbol(symbol)   pure regex check

export type UncertaintyType = 'absolute' | 'relative';

export interface ConstantLike {
    id: string;
    name: string;
    symbol: string;
    value: number;
    unitId: string;
    category: string;
    description: string;
    source: string;
    mutable: boolean;
    validFrom: string | null;
    validTo: string | null;
    uncertainty: number | null;
    uncertaintyType: UncertaintyType | null;
    coverageFactor: number | null;
    isDemo: boolean;
    createdAt: string;
    updatedAt: string;
    [key: string]: unknown;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Frozen regex para símbolo de constante científica.
 * Identificador estilo programação: letra/underscore inicial + alfanum.
 * Matches SYMBOL_REGEX @ constants/manager.ts:30.
 */
export const CONSTANT_SYMBOL_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Frozen valid uncertainty types (GUM Tier 1).
 */
export const UNCERTAINTY_TYPES: ReadonlyArray<UncertaintyType> = Object.freeze(['absolute', 'relative']);

/**
 * Frozen field length limits.
 * Matches slice() limits @ constants/manager.ts:_sanitize.
 */
export const CONSTANT_FIELD_LIMITS = Object.freeze({
    name: 120,
    symbol: 32,
    description: 500,
    source: 200,
    coverageFactorWarnThreshold: 3,
});

/**
 * Pure symbol validation (regex check).
 */
export function isValidConstantSymbol(symbol: unknown): boolean {
    return typeof symbol === 'string' && CONSTANT_SYMBOL_REGEX.test(symbol);
}

/**
 * Validate constant fields — returns error codes (i18n keys).
 * Caller passa existingSymbols (Set) para checagem de unicidade case-sensitive
 * (CO2 != co2 — símbolos científicos são case-sensitive).
 *
 * Matches validateConstant @ constants/manager.ts:85-136.
 */
export function validateConstantFields(
    partial: any,
    existingSymbols: ReadonlyMap<string, string> | ReadonlyArray<{ symbol: string; id: string }> = [],
    existingId: string | null = null,
): ValidationResult {
    const errors: string[] = [];
    const name = (partial?.name || '').trim();
    if (!name) errors.push('constantNameRequired');
    else if (name.length > CONSTANT_FIELD_LIMITS.name) errors.push('constantNameTooLong');

    const symbol = (partial?.symbol || '').trim();
    if (!symbol) {
        errors.push('constantSymbolRequired');
    } else if (!CONSTANT_SYMBOL_REGEX.test(symbol)) {
        errors.push('constantSymbolInvalid');
    } else if (symbol.length > CONSTANT_FIELD_LIMITS.symbol) {
        errors.push('constantSymbolTooLong');
    } else {
        // Unicidade case-sensitive
        let dupId: string | undefined;
        if (Array.isArray(existingSymbols)) {
            dupId = existingSymbols.find((c) => c.symbol === symbol && c.id !== existingId)?.id;
        } else {
            dupId = (existingSymbols as ReadonlyMap<string, string>).get(symbol);
        }
        if (dupId && dupId !== existingId) errors.push('constantSymbolDuplicate');
    }

    const val = partial?.value;
    if (val === undefined || val === null || val === '') {
        errors.push('constantValueRequired');
    } else if (!Number.isFinite(Number(val))) {
        errors.push('constantValueInvalid');
    }

    const unc = partial?.uncertainty;
    if (unc != null && unc !== '') {
        if (!Number.isFinite(Number(unc))) {
            errors.push('constantUncertaintyInvalid');
        } else if (Number(unc) < 0) {
            errors.push('constantUncertaintyNegative');
        }
        if (!partial.uncertaintyType || !UNCERTAINTY_TYPES.includes(partial.uncertaintyType)) {
            errors.push('constantUncertaintyTypeMissing');
        }
    }

    const cf = partial?.coverageFactor;
    if (cf != null && cf !== '') {
        if (!Number.isFinite(Number(cf)) || Number(cf) <= 0) {
            errors.push('constantCoverageFactorInvalid');
        }
        // k > 3 é incomum mas permitido (apenas warning no caller).
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Pure date sanitizer: aceita YYYY-MM-DD ou ISO, retorna apenas YYYY-MM-DD.
 * Matches _sanitizeDate @ constants/manager.ts:140-147.
 */
export function sanitizeConstantDate(val: unknown): string | null {
    if (!val) return null;
    const s = String(val).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? null;
}

/**
 * Pure constant sanitizer — trim strings, cast types, clamp lengths.
 * Caller injeta nowIso (DI clock para createdAt/updatedAt defaults).
 *
 * Matches _sanitize @ constants/manager.ts:153-183.
 */
export function sanitizeConstant(c: any, nowIso: string = new Date().toISOString()): ConstantLike {
    const L = CONSTANT_FIELD_LIMITS;
    return {
        id: String(c?.id || '').trim(),
        name: String(c?.name || '').trim().slice(0, L.name),
        symbol: String(c?.symbol || '').trim().slice(0, L.symbol),
        value: Number(c?.value),
        unitId: String(c?.unitId || '').trim(),
        category: String(c?.category || 'custom').trim(),
        description: String(c?.description || '').trim().slice(0, L.description),
        source: String(c?.source || '').trim().slice(0, L.source),
        mutable: c?.mutable !== false,
        validFrom: sanitizeConstantDate(c?.validFrom),
        validTo: sanitizeConstantDate(c?.validTo),
        uncertainty:
            c?.uncertainty != null && Number.isFinite(Number(c.uncertainty)) ? Number(c.uncertainty) : null,
        uncertaintyType: UNCERTAINTY_TYPES.includes(c?.uncertaintyType) ? c.uncertaintyType : null,
        coverageFactor:
            c?.coverageFactor != null && Number.isFinite(Number(c.coverageFactor)) && Number(c.coverageFactor) > 0
                ? Number(c.coverageFactor)
                : null,
        isDemo: Boolean(c?.isDemo),
        createdAt: c?.createdAt || nowIso,
        updatedAt: c?.updatedAt || nowIso,
    };
}

/**
 * Type-guard for ConstantLike shape.
 */
export function isValidConstantShape(value: unknown): value is ConstantLike {
    if (!value || typeof value !== 'object') return false;
    const c = value as ConstantLike;
    if (typeof c.id !== 'string') return false;
    if (typeof c.symbol !== 'string') return false;
    return true;
}
