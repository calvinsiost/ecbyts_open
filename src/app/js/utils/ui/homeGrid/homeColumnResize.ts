// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic column resize controller for SPEC_HOME_REDESIGN_3COL_V3 Should:
// "Drag para redimensionar colunas (snap a presets)".
// Hand-authored R1-safe. Sem DOM events (caller binda); apenas math.
//
// Spec NOT:
// - NÃO ler/escrever localStorage (caller persiste)
// - NÃO bind DOM events (caller responsável)
// - NÃO emoji em strings
// - NÃO depende Three.js/canvas

const MIN_LEFT = 160;
const MAX_LEFT = 400;
const MIN_RIGHT = 200;
const MAX_RIGHT = 480;
const SNAP_TOLERANCE = 12; // pixels

export type ResizeColumn = 'left' | 'right';

// Snap presets canônicos por column
const SNAP_PRESETS: Readonly<Record<ResizeColumn, ReadonlyArray<number>>> = Object.freeze({
    left: Object.freeze([160, 200, 240, 280, 320, 360, 400]) as ReadonlyArray<number>,
    right: Object.freeze([200, 240, 280, 320, 360, 400, 440, 480]) as ReadonlyArray<number>,
});

/**
 * Clamp width dentro de [min, max].
 */
export function clampColumnWidth(width: number, column: ResizeColumn): number {
    const safe = Number.isFinite(width) ? width : 0;
    if (column === 'left') return Math.max(MIN_LEFT, Math.min(MAX_LEFT, safe));
    if (column === 'right') return Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, safe));
    return safe;
}

/**
 * Aplica snap-to-preset se width está dentro de SNAP_TOLERANCE.
 */
export function snapToPreset(width: number, column: ResizeColumn): number {
    const presets = SNAP_PRESETS[column];
    if (!presets) return width;
    for (const preset of presets) {
        if (Math.abs(width - preset) <= SNAP_TOLERANCE) return preset;
    }
    return width;
}

/**
 * Combina clamp + snap.
 */
export function resolveColumnWidth(width: number, column: ResizeColumn): number {
    return snapToPreset(clampColumnWidth(width, column), column);
}

export interface DragWidthInput {
    startWidth: number;
    deltaX: number;
    column: ResizeColumn;
}

/**
 * Calcula nova width baseada em drag delta.
 * Caller passa startWidth + deltaX (positive = expand para right side).
 */
export function calcDragWidth(input: DragWidthInput): number {
    const { startWidth, deltaX, column } = input;
    const safeStart = Number.isFinite(startWidth) ? startWidth : 0;
    const safeDelta = Number.isFinite(deltaX) ? deltaX : 0;
    // left expande para direita; right contrai (deltaX positivo = right vira menor)
    const raw = column === 'left' ? safeStart + safeDelta : safeStart - safeDelta;
    return resolveColumnWidth(raw, column);
}

export interface ResizeHandleVM {
    column: string;
    width: number;
    atMin: boolean;
    atMax: boolean;
    presetActive: boolean;
}

/**
 * Builds VM para resize handle (data-attributes para CSS cursor).
 */
export function buildResizeHandleVM(column: ResizeColumn, currentWidth: number): Readonly<ResizeHandleVM> {
    const clamped = clampColumnWidth(currentWidth, column);
    const presets = SNAP_PRESETS[column] || [];
    const presetActive = presets.includes(clamped);
    const min = column === 'left' ? MIN_LEFT : MIN_RIGHT;
    const max = column === 'left' ? MAX_LEFT : MAX_RIGHT;
    return Object.freeze({
        column,
        width: clamped,
        atMin: clamped === min,
        atMax: clamped === max,
        presetActive,
    });
}

/**
 * Reset para preset default.
 */
export function resetColumnWidth(column: ResizeColumn): number {
    if (column === 'left') return 240;
    if (column === 'right') return 280;
    return 0;
}

export {
    MIN_LEFT,
    MAX_LEFT,
    MIN_RIGHT,
    MAX_RIGHT,
    SNAP_TOLERANCE,
    SNAP_PRESETS,
};
