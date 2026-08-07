// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Figure subset validator — pure logic (SPEC_REPORT_FIGURE_CATALOG DoD #3 prep).
 *
 * Validates a (figureTypeId, subset) tuple against the canonical catalog
 * before the caller renders the figure. Returns a frozen result with
 * specific errors so the picker / report builder can surface actionable
 * messages.
 *
 * Validations:
 *   1. figureTypeId must exist in FIGURE_CATALOG
 *   2. Every requiredFilter of the entry must be present in the subset
 *      with a non-empty value
 *   3. Any subset key that is NOT in requiredFilters ∪ optionalFilters
 *      flags as 'unknown_filter' (warning, not blocker)
 *   4. Subset values must be primitive (string | number | undefined |
 *      array of strings/numbers for multi-value filters like `campanha`)
 *
 * Anti-requirements:
 *   - No fabrication: invalid subset → error report, NEVER silently
 *     coerce missing required field.
 *   - No DOM: pure-logic; the picker/builder handles UI feedback.
 *
 * Tests live in `tests/figure-subset-validator-pure.test.mjs`.
 */

import { getFigureType, type FigureFilterDim } from './_figureCatalogPure.js';

export type FilterValue = string | number | ReadonlyArray<string | number> | undefined;

export type FigureSubset = Readonly<Record<string, FilterValue>>;

export interface ValidationError {
    readonly code:
        | 'unknown_figure_type'
        | 'missing_required_filter'
        | 'invalid_filter_value'
        | 'unknown_filter';
    readonly field: string;
    readonly message: string;
}

export interface FigureSubsetValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<ValidationError>;
    readonly warnings: ReadonlyArray<ValidationError>;
}

function isNonEmptyPrimitive(value: FilterValue): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return false;
        for (const v of value) {
            if (typeof v !== 'string' && typeof v !== 'number') return false;
            if (typeof v === 'number' && !Number.isFinite(v)) return false;
            if (typeof v === 'string' && v.length === 0) return false;
        }
        return true;
    }
    return false;
}

function freezeError(e: ValidationError): ValidationError {
    return Object.freeze(e);
}

/**
 * Validate a figure tuple. Returns frozen `{valid, errors, warnings}`.
 *
 *   - `valid === false` iff at least one error in `errors`.
 *   - `warnings` are non-blocking (e.g. unknown_filter).
 */
export function validateFigureSubset(
    figureTypeId: string,
    subset: FigureSubset | null | undefined,
): FigureSubsetValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const entry = getFigureType(figureTypeId);
    if (!entry) {
        errors.push(
            freezeError({
                code: 'unknown_figure_type',
                field: typeof figureTypeId === 'string' ? figureTypeId : '<invalid>',
                message: `Figure type "${figureTypeId}" not found in canonical catalog.`,
            }),
        );
        return Object.freeze({
            valid: false,
            errors: Object.freeze(errors),
            warnings: Object.freeze(warnings),
        });
    }

    const safeSubset: FigureSubset = subset && typeof subset === 'object' ? subset : {};

    // Required filters
    for (const dim of entry.requiredFilters) {
        const value = safeSubset[dim];
        if (!isNonEmptyPrimitive(value)) {
            errors.push(
                freezeError({
                    code: 'missing_required_filter',
                    field: dim,
                    message: `Figure ${entry.id} requires filter "${dim}" to be set with a non-empty value.`,
                }),
            );
        }
    }

    // Optional filters — value type must still be valid when provided
    const allKnown = new Set<string>([
        ...entry.requiredFilters,
        ...entry.optionalFilters,
    ]);
    for (const key of Object.keys(safeSubset)) {
        const value = safeSubset[key];
        if (value === undefined) continue;
        if (!allKnown.has(key)) {
            warnings.push(
                freezeError({
                    code: 'unknown_filter',
                    field: key,
                    message: `Filter "${key}" is not recognised by figure ${entry.id}; will be ignored by renderer.`,
                }),
            );
            continue;
        }
        if (!isNonEmptyPrimitive(value)) {
            errors.push(
                freezeError({
                    code: 'invalid_filter_value',
                    field: key,
                    message: `Filter "${key}" has invalid type or empty value.`,
                }),
            );
        }
    }

    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
    });
}

/**
 * Expand a figure tuple into multiple concrete figures when the required
 * filter is multi-valued (e.g. `contaminante` array → N figures, one per
 * contaminant). Returns a list of frozen subset tuples ready to render.
 *
 * Returns `[]` when validation fails — caller should run validate first
 * and surface errors.
 */
export function expandFigureSubset(
    figureTypeId: string,
    subset: FigureSubset | null | undefined,
): ReadonlyArray<FigureSubset> {
    const validation = validateFigureSubset(figureTypeId, subset);
    if (!validation.valid) return Object.freeze([]);
    const entry = getFigureType(figureTypeId);
    if (!entry) return Object.freeze([]);
    const safeSubset: FigureSubset = subset && typeof subset === 'object' ? subset : {};

    // Find the first multi-value required filter and expand on it.
    for (const dim of entry.requiredFilters) {
        const value = safeSubset[dim];
        if (Array.isArray(value) && value.length > 1) {
            const expanded: FigureSubset[] = [];
            for (const v of value) {
                const variant: Record<string, FilterValue> = { ...safeSubset };
                variant[dim] = v;
                expanded.push(Object.freeze(variant));
            }
            return Object.freeze(expanded);
        }
    }
    return Object.freeze([Object.freeze({ ...safeSubset })]);
}
