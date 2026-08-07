// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Wave (Tier B per MONOLITH_IMPACT_ANALYSIS_2026_05_27).
// Pure-logic extraction from utils/ui/filterPresetModal.js (densidade seam 17.2 — Tier B hidden gem).
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller passa input)
// - NÃO ler i18n diretamente (caller resolve labels)
// - NÃO ler CONFIG.* / window.* (caller injeta dados)
// - NÃO emoji
//
// Extracted helpers:
//   - DIMENSION_IDS         (4 frozen dimension keys)
//   - OPERATOR_IDS          (4 frozen operator keys + labels)
//   - PRESET_COLOR_PALETTE  (8 frozen hex palette)
//   - mapToIdLabel          (pure { id, label } mapper for any dimension list)
//   - nextPresetColor       (deterministic palette rotation by existing presets count)
//   - countPresets          (length + filter helpers)
//   - findPresetById        (O(n) lookup, pure)

export type DimensionId = 'family' | 'element' | 'parameter' | 'campaign';
export type OperatorId = 'is' | 'is_not' | 'in' | 'not_in';

export interface DimensionDescriptor {
    id: DimensionId;
}

export interface OperatorDescriptor {
    id: OperatorId;
    label: string;
}

export interface IdLabelPair {
    id: string;
    label: string;
}

export interface PresetItem {
    id: string;
    color?: string;
    name?: string;
    filters?: Array<unknown>;
}

/** Frozen list of dimensions in canonical order. */
export const DIMENSION_IDS: ReadonlyArray<DimensionDescriptor> = Object.freeze([
    { id: 'family' },
    { id: 'element' },
    { id: 'parameter' },
    { id: 'campaign' },
] as const);

/** Frozen list of operators with stable labels. */
export const OPERATOR_IDS: ReadonlyArray<OperatorDescriptor> = Object.freeze([
    { id: 'is', label: '=' },
    { id: 'is_not', label: '!=' },
    { id: 'in', label: 'IN' },
    { id: 'not_in', label: 'NOT IN' },
] as const);

/** Frozen 8-color palette used for new preset assignment. */
export const PRESET_COLOR_PALETTE: ReadonlyArray<string> = Object.freeze([
    '#4CAF50',
    '#2196F3',
    '#FF9800',
    '#E91E63',
    '#9C27B0',
    '#00BCD4',
    '#795548',
    '#607D8B',
] as const);

/**
 * Map raw input objects to { id, label } pairs.
 * Caller supplies items already filtered to the relevant dimension.
 * Falls back to id when label/name missing.
 */
export function mapToIdLabel(items: Array<{ id: string; label?: string; name?: string }> | null | undefined): IdLabelPair[] {
    if (!Array.isArray(items)) return [];
    const out: IdLabelPair[] = [];
    for (const item of items) {
        if (!item || typeof item.id !== 'string') continue;
        out.push({
            id: item.id,
            label: item.label || item.name || item.id,
        });
    }
    return out;
}

/**
 * Deterministic palette rotation: returns palette[count % palette.length].
 * Used when adding a new preset to assign a stable color.
 */
export function nextPresetColor(existingCount: number, palette: ReadonlyArray<string> = PRESET_COLOR_PALETTE): string {
    if (!Array.isArray(palette) || palette.length === 0) return '#888';
    const safe = Number.isFinite(existingCount) && existingCount >= 0 ? Math.floor(existingCount) : 0;
    return palette[safe % palette.length] || palette[0]!;
}

/** Count presets matching optional predicate. */
export function countPresets(
    presets: ReadonlyArray<PresetItem> | null | undefined,
    predicate?: (p: PresetItem) => boolean,
): number {
    if (!Array.isArray(presets)) return 0;
    if (!predicate) return presets.length;
    let n = 0;
    for (const p of presets) {
        if (p && predicate(p)) n++;
    }
    return n;
}

/** O(n) lookup by id. Returns undefined when not found. */
export function findPresetById(
    presets: ReadonlyArray<PresetItem> | null | undefined,
    id: string,
): PresetItem | undefined {
    if (!Array.isArray(presets) || typeof id !== 'string' || !id) return undefined;
    for (const p of presets) {
        if (p && p.id === id) return p;
    }
    return undefined;
}

/** Check whether a string is a valid DimensionId. */
export function isValidDimensionId(value: unknown): value is DimensionId {
    return value === 'family' || value === 'element' || value === 'parameter' || value === 'campaign';
}

/** Check whether a string is a valid OperatorId. */
export function isValidOperatorId(value: unknown): value is OperatorId {
    return value === 'is' || value === 'is_not' || value === 'in' || value === 'not_in';
}
