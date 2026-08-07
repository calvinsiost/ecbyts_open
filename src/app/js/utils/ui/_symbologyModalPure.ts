// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — symbologyModal.ts #ranked
// Pure-logic extraction from src/app/js/utils/ui/symbologyModal.ts (canonical .ts).
// Densidade seam 9.5/100L per MONOLITH_IMPACT_ANALYSIS_2026_05_27.
//
// Read from canonical .ts (not derived .js) per
// memory/feedback_read_ts_canonical_not_js_derived.md.
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller monta inputs/rows)
// - NÃO ler i18n (caller resolve placeholder/labels)
// - NÃO emoji
// - NÃO chamar updateDraft / store side-effects (caller wireia)
//
// Extracted helpers:
//   - DEFAULT_BAND_COLOR / CONTOUR_DENSITIES   (frozen constants)
//   - ensureLabelCat(draft, cat)               (deep-shape + return slot)
//   - ensurePerElementLabel(draft, elementId)  (deep-shape + return slot)
//   - ensureSurface(draft, layerId)            (deep-shape + return slot)
//   - createDefaultValueBand(overrides?)       (canonical band factory)
//   - parseBandMax(input)                      (string → number | null catch-all)
//   - isValidContourDensity(value)             (type-guard)
//   - normalizeContourDensity(value, fallback?) (clamp to enum)

export type ContourDensity = 'low' | 'medium' | 'high';

export interface SymbologyValueBand {
    max: number | null;
    color: string;
    label: string;
}

export interface SymbologyDraft {
    labels?: {
        categories?: Record<string, Record<string, unknown>>;
        perElement?: Record<string, Record<string, unknown>>;
    };
    surfaces?: {
        byLayer?: Record<string, Record<string, unknown>>;
    };
}

/** Default brand-aligned band color (matches inline literal '#4488ff' in caller). */
export const DEFAULT_BAND_COLOR = '#4488ff';

/** Frozen contour density enum in canonical order. */
export const CONTOUR_DENSITIES: ReadonlyArray<ContourDensity> = Object.freeze(['low', 'medium', 'high'] as const);

/**
 * Ensure `draft.labels.categories[cat]` exists and return the slot.
 * Mutates the draft in place (caller already owns mutable reference).
 * Idempotent: safe to call multiple times.
 */
export function ensureLabelCat(draft: SymbologyDraft, cat: string): Record<string, unknown> {
    if (!draft.labels) draft.labels = { categories: {}, perElement: {} };
    if (!draft.labels.categories) draft.labels.categories = {};
    if (!draft.labels.categories[cat]) draft.labels.categories[cat] = {};
    return draft.labels.categories[cat]!;
}

/**
 * Ensure `draft.labels.perElement[elementId]` exists and return the slot.
 * Mutates the draft in place. Idempotent.
 */
export function ensurePerElementLabel(draft: SymbologyDraft, elementId: string): Record<string, unknown> {
    if (!draft.labels) draft.labels = { categories: {}, perElement: {} };
    if (!draft.labels.perElement) draft.labels.perElement = {};
    if (!draft.labels.perElement[elementId]) draft.labels.perElement[elementId] = {};
    return draft.labels.perElement[elementId]!;
}

/**
 * Ensure `draft.surfaces.byLayer[layerId]` exists and return the slot.
 * Mutates the draft in place. Idempotent.
 */
export function ensureSurface(draft: SymbologyDraft, layerId: string): Record<string, unknown> {
    if (!draft.surfaces) draft.surfaces = { byLayer: {} };
    if (!draft.surfaces.byLayer) draft.surfaces.byLayer = {};
    if (!draft.surfaces.byLayer[layerId]) draft.surfaces.byLayer[layerId] = {};
    return draft.surfaces.byLayer[layerId]!;
}

/**
 * Create a fresh value-band entry with canonical defaults.
 *   { max: null, color: DEFAULT_BAND_COLOR, label: '' }
 * `overrides` merge shallow on top of defaults.
 */
export function createDefaultValueBand(overrides?: Partial<SymbologyValueBand>): SymbologyValueBand {
    return {
        max: overrides?.max ?? null,
        color: typeof overrides?.color === 'string' && overrides.color ? overrides.color : DEFAULT_BAND_COLOR,
        label: typeof overrides?.label === 'string' ? overrides.label : '',
    };
}

/**
 * Parse a band-max input string to a number or null (catch-all sentinel).
 * Matches caller semantic: `parseFloat(v); isNaN(v) ? null : v`.
 * Empty string / whitespace → null. Non-numeric → null.
 */
export function parseBandMax(input: unknown): number | null {
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (trimmed === '') return null;
    const v = parseFloat(trimmed);
    return Number.isFinite(v) ? v : null;
}

/** Type-guard for ContourDensity union. */
export function isValidContourDensity(value: unknown): value is ContourDensity {
    return value === 'low' || value === 'medium' || value === 'high';
}

/**
 * Clamp an unknown value to a valid ContourDensity, with fallback (default 'medium').
 * Used when reading style.contourDensity from persisted state.
 */
export function normalizeContourDensity(value: unknown, fallback: ContourDensity = 'medium'): ContourDensity {
    return isValidContourDensity(value) ? value : fallback;
}
