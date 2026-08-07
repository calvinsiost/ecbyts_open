// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EDIT CAROUSEL — SPEC_EDIT_MODE_ENHANCEMENTS (Item 9.35)

   Pure helpers para "Quick Switch" entre elementos editáveis do mesmo
   tipo sem perder estado + "Opacity Preset Combo".

   UI layer em utils/editing/editManager.js consome essas funções.
   Aqui só:
   - seleção/navegação por family
   - wrap arithmetic
   - preservação de state (deep clone)
   - presets de opacidade canônicos
   ================================================================ */

export interface EditableElement {
    id?: string;
    family?: string;
    familyId?: string;
    [k: string]: unknown;
}

export interface EditState {
    [k: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────
// Opacity presets (§Q3 Recomendação D)
// ──────────────────────────────────────────────────────────────────────

export const OPACITY_PRESETS = {
    opaque: 1.0,
    semi: 0.6,
    transparent: 0.2,
    custom: null, // resolvido via resolveOpacityValue(customValue)
} as const;

export type OpacityPresetKey = (typeof OPACITY_PRESETS)[keyof typeof OPACITY_PRESETS] extends number | null ? keyof typeof OPACITY_PRESETS : never;

export const OPACITY_PRESET_KEYS = Object.keys(OPACITY_PRESETS) as Array<keyof typeof OPACITY_PRESETS>;

/**
 * Valida preset de opacidade.
 * @param preset
 * @returns boolean
 */
export function isValidOpacityPreset(preset: string): boolean {
    return typeof preset === 'string' && (OPACITY_PRESET_KEYS as readonly string[]).includes(preset);
}

/**
 * Resolve opacidade final. 'custom' + customValue válido → clamp [0, 1].
 *
 * @param preset - um de OPACITY_PRESET_KEYS
 * @param customValue? - usado só se preset='custom'
 * @returns 0..1 ou null se inválido
 */
export function resolveOpacityValue(preset: string, customValue?: number): number | null {
    if (!isValidOpacityPreset(preset)) return null;
    if (preset === 'custom') {
        const v = Number(customValue);
        if (!Number.isFinite(v)) return null;
        return Math.max(0, Math.min(1, v));
    }
    return OPACITY_PRESETS[preset as keyof typeof OPACITY_PRESETS] as number | null;
}

// ──────────────────────────────────────────────────────────────────────
// Editable elements selection
// ──────────────────────────────────────────────────────────────────────

/**
 * Filtra elementos editáveis por família (mesmo tipo = carousel scope).
 * Um elemento é editável se tiver `id` + `family` (ou familyId).
 *
 * @param elements
 * @param family
 * @returns Array<EditableElement>
 */
export function getEditableElementsByFamily(elements: EditableElement[], family: string): EditableElement[] {
    if (!Array.isArray(elements) || !family) return [];
    return elements.filter((el) => {
        if (!el || typeof el !== 'object') return false;
        if (!el.id) return false;
        const elFamily = el.family || el.familyId;
        return elFamily === family;
    });
}

// ──────────────────────────────────────────────────────────────────────
// Navigation arithmetic (§Q2 Opção B - wrap next/prev)
// ──────────────────────────────────────────────────────────────────────

/**
 * Calcula índice do próximo elemento editável (com wrap).
 *
 * @param currentIndex - índice atual ([0, total-1])
 * @param total - total de elementos
 * @param direction - +1 (next) ou -1 (prev)
 * @param wrap - se true, faz wrap último↔primeiro
 * @returns próximo índice, ou null se inválido
 */
export function computeNextEditableIndex(
    currentIndex: number,
    total: number,
    direction: number = 1,
    wrap: boolean = true,
): number | null {
    if (!Number.isFinite(currentIndex) || !Number.isFinite(total)) return null;
    if (total <= 0) return null;
    if (currentIndex < 0 || currentIndex >= total) return null;

    const step = direction >= 0 ? 1 : -1;
    const next = currentIndex + step;

    if (wrap) {
        // JS % pode retornar negativo → forçar positivo
        return ((next % total) + total) % total;
    }

    if (next < 0 || next >= total) return null;
    return next;
}

/**
 * Helper de alto nível: encontra próximo elemento editável do grupo.
 *
 * @param editableElements - lista ordenada
 * @param currentId
 * @param direction
 * @param wrap
 * @returns próximo elemento
 */
export function findNextEditableElement(
    editableElements: EditableElement[],
    currentId: string,
    direction: number = 1,
    wrap: boolean = true,
): EditableElement | null {
    if (!Array.isArray(editableElements) || editableElements.length === 0) return null;
    const currentIdx = editableElements.findIndex((el) => el?.id === currentId);
    if (currentIdx < 0) return null;
    if (editableElements.length === 1) return null;
    const nextIdx = computeNextEditableIndex(currentIdx, editableElements.length, direction, wrap);
    if (nextIdx == null) return null;
    return editableElements[nextIdx] ?? null;
}

// ──────────────────────────────────────────────────────────────────────
// State preservation (§2 "Preserva: mode, snap, settings")
// ──────────────────────────────────────────────────────────────────────

export const PRESERVED_STATE_KEYS = [
    'editMode', // 'edit' | 'draw' | 'gizmo'
    'snapEnabled', // boolean
    'gizmoMode', // 'translate' | 'rotate' | 'scale'
    'worldLocal', // 'world' | 'local'
    'opacity', // 0..1
    'opacityPreset', // keys do OPACITY_PRESETS
] as const;

/**
 * Extrai apenas as chaves preservadas do state atual.
 * Retorna cópia (não muta input).
 *
 * @param currentState
 * @returns EditState
 */
export function preserveEditState(currentState: EditState | null | undefined): EditState {
    if (!currentState || typeof currentState !== 'object') return {};
    const out: EditState = {};
    const src: EditState = currentState;
    for (const key of PRESERVED_STATE_KEYS) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    return out;
}

/**
 * Merge estado preservado no novo elemento, sem sobrescrever valores
 * setados explicitamente no `override`.
 *
 * @param preservedState
 * @param override
 * @returns EditState
 */
export function mergeEditState(preservedState: EditState | null | undefined, override: EditState = {}): EditState {
    return {
        ...preserveEditState(preservedState),
        ...override,
    };
}