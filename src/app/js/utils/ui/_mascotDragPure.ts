// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// MASCOT-DRAG-POSITION-001 :: pure-logic do arrastar do avatar EC (ecby).
// Sem DOM/storage/timer — apenas matemática de posição + clamp + decisão
// drag-vs-click. Testável sem browser.

export interface MascotPosition {
    /** Distância (px) do top-left do FAB ao top-left do viewport — origem CSS. */
    x: number;
    y: number;
}

export interface DragState {
    /** Posição do FAB quando pointerdown disparou (origem do delta). */
    startFabX: number;
    startFabY: number;
    /** Posição do pointer quando pointerdown disparou. */
    startPointerX: number;
    startPointerY: number;
    /** Distância máxima (px) já percorrida pelo pointer desde startPointer*. */
    maxTravelPx: number;
}

export interface ViewportClampInput {
    viewportW: number;
    viewportH: number;
    fabSize: number;
    margin: number;
}

/** Threshold em px para distinguir drag de click puro (Material default ≈4–8). */
export const DRAG_THRESHOLD_PX = 5;

/** Margem mínima do FAB às bordas do viewport (defense anti-corte). */
export const DEFAULT_MARGIN_PX = 4;

/** localStorage key estável p/ posição persistida. */
export const MASCOT_POSITION_KEY = 'ecbyts-mascot-position';

/**
 * Clampa uma posição candidata aos limites do viewport.
 * Garante que o FAB inteiro fica visível (não sai pelo right/bottom)
 * e respeita margem mínima.
 */
export function clampToViewport(pos: MascotPosition, vp: ViewportClampInput): MascotPosition {
    const { viewportW, viewportH, fabSize, margin } = vp;
    const maxX = Math.max(margin, viewportW - fabSize - margin);
    const maxY = Math.max(margin, viewportH - fabSize - margin);
    const x = Math.min(Math.max(margin, pos.x), maxX);
    const y = Math.min(Math.max(margin, pos.y), maxY);
    return { x, y };
}

/**
 * Cria estado inicial de drag a partir do pointerdown.
 * `fabX/fabY` é a posição CSS atual do FAB; `pointerX/Y` é clientX/clientY do evento.
 */
export function createDragState(
    fabX: number,
    fabY: number,
    pointerX: number,
    pointerY: number,
): DragState {
    return {
        startFabX: fabX,
        startFabY: fabY,
        startPointerX: pointerX,
        startPointerY: pointerY,
        maxTravelPx: 0,
    };
}

/**
 * Avança o drag — retorna nova posição candidata (não clampada ainda)
 * e atualiza maxTravelPx in-place.
 */
export function advanceDrag(
    state: DragState,
    currentPointerX: number,
    currentPointerY: number,
): MascotPosition {
    const dx = currentPointerX - state.startPointerX;
    const dy = currentPointerY - state.startPointerY;
    const travel = Math.hypot(dx, dy);
    if (travel > state.maxTravelPx) state.maxTravelPx = travel;
    return {
        x: state.startFabX + dx,
        y: state.startFabY + dy,
    };
}

/**
 * True se o pointer percorreu o suficiente para ser considerado drag
 * (e portanto suprimir o click subsequente).
 */
export function wasActualDrag(state: DragState, threshold: number = DRAG_THRESHOLD_PX): boolean {
    return state.maxTravelPx >= threshold;
}

/**
 * Posição default quando não há nada persistido:
 * canto bottom-right respeitando margens.
 */
export function defaultPosition(vp: ViewportClampInput): MascotPosition {
    const { viewportW, viewportH, fabSize, margin } = vp;
    return {
        x: Math.max(margin, viewportW - fabSize - margin),
        y: Math.max(margin, viewportH - fabSize - margin),
    };
}

/**
 * Tenta parsear posição persistida (string JSON) e clampa ao viewport.
 * Retorna null se input malformado — caller deve usar defaultPosition.
 */
export function parsePersistedPosition(
    raw: string | null,
    vp: ViewportClampInput,
): MascotPosition | null {
    if (!raw || typeof raw !== 'string') return null;
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return clampToViewport({ x, y }, vp);
}

/**
 * Serializa posição para localStorage (JSON inteiro arredondado p/ economia).
 */
export function serializePosition(pos: MascotPosition): string {
    return JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) });
}
