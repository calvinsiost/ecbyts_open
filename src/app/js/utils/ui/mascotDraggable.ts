// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// MASCOT-DRAG-POSITION-001 :: wire runtime do drag-to-move do FAB ecby.
// Lê posição persistida no boot, captura pointer, atualiza CSS, persiste no up.
// Suprime click subsequente se ocorreu drag (anti-conflict com toggleAIWidget).

import {
    advanceDrag,
    clampToViewport,
    createDragState,
    defaultPosition,
    DRAG_THRESHOLD_PX,
    DEFAULT_MARGIN_PX,
    MASCOT_POSITION_KEY,
    parsePersistedPosition,
    serializePosition,
    wasActualDrag,
    type DragState,
    type MascotPosition,
    type ViewportClampInput,
} from './_mascotDragPure.js';
import { safeSetItem } from '../storage/storageMonitor.js';

let _fab: HTMLElement | null = null;
let _dragState: DragState | null = null;
let _suppressNextClick = false;
let _initialized = false;
let _resizeListener: (() => void) | null = null;

/**
 * Lê tamanho efetivo do FAB do CSS computado (geralmente 56px desktop / 48px mobile).
 */
function _measureFabSize(fab: HTMLElement): number {
    const rect = fab.getBoundingClientRect();
    return Math.max(rect.width, rect.height, 1);
}

function _currentViewport(fabSize: number): ViewportClampInput {
    return {
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        fabSize,
        margin: DEFAULT_MARGIN_PX,
    };
}

/**
 * Aplica posição no estilo inline — sobrescreve bottom/right do CSS base.
 */
function _applyPosition(pos: MascotPosition): void {
    if (!_fab) return;
    _fab.style.left = `${Math.round(pos.x)}px`;
    _fab.style.top = `${Math.round(pos.y)}px`;
    _fab.style.right = 'auto';
    _fab.style.bottom = 'auto';
}

function _readCurrentPosition(): MascotPosition {
    if (!_fab) return { x: 0, y: 0 };
    // IMPORTANT: ler do inline style, NAO de getBoundingClientRect.
    // O FAB tem .ai-widget-fab:hover { transform: scale(1.1) } que faz
    // getBoundingClientRect retornar coords com offset -2.8px de cada lado
    // (rect cresce de 56 para 61.6). Isso causava drift na persistencia
    // (e.g. salvar x=1 em vez de x=4 apos clamp). style.left/top sao o
    // ground truth do CSS positioning.
    const sx = _fab.style.left;
    const sy = _fab.style.top;
    if (sx && sy) {
        const x = parseFloat(sx);
        const y = parseFloat(sy);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
    const rect = _fab.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
}

function _loadOrDefault(): MascotPosition {
    if (!_fab) return { x: 0, y: 0 };
    const fabSize = _measureFabSize(_fab);
    const vp = _currentViewport(fabSize);
    let raw: string | null;
    try {
        raw = window.localStorage.getItem(MASCOT_POSITION_KEY);
    } catch {
        raw = null;
    }
    return parsePersistedPosition(raw, vp) || defaultPosition(vp);
}

function _persist(pos: MascotPosition): void {
    try {
        safeSetItem(MASCOT_POSITION_KEY, serializePosition(pos));
    } catch (e) {
        // localStorage cheio ou bloqueado — drag funciona mesmo sem persistência.
        console.debug('[mascotDraggable:persist]', (e as any)?.message || e);
    }
}

function _onPointerDown(ev: PointerEvent): void {
    if (!_fab) return;
    // Botão direito → não capturar (context menu de IA depende dele)
    if (ev.button !== 0) return;
    const current = _readCurrentPosition();
    _dragState = createDragState(current.x, current.y, ev.clientX, ev.clientY);
    _suppressNextClick = false;
    try {
        _fab.setPointerCapture(ev.pointerId);
    } catch (e) {
        // pointer capture pode falhar em alguns navegadores — drag continua via document listener
        console.debug('[mascotDraggable:setPointerCapture]', (e as any)?.message || e);
    }
    _fab.style.cursor = 'grabbing';
    _fab.style.transition = 'none';
}

function _onPointerMove(ev: PointerEvent): void {
    if (!_fab || !_dragState) return;
    const raw = advanceDrag(_dragState, ev.clientX, ev.clientY);
    const fabSize = _measureFabSize(_fab);
    const vp = _currentViewport(fabSize);
    const clamped = clampToViewport(raw, vp);
    _applyPosition(clamped);
}

function _onPointerUp(ev: PointerEvent): void {
    if (!_fab || !_dragState) return;
    const wasDrag = wasActualDrag(_dragState, DRAG_THRESHOLD_PX);
    if (wasDrag) {
        _suppressNextClick = true;
        const final = _readCurrentPosition();
        _persist(final);
    }
    try {
        _fab.releasePointerCapture(ev.pointerId);
    } catch (e) {
        // already released
        console.debug('[mascotDraggable:releasePointerCapture]', (e as any)?.message || e);
    }
    _fab.style.cursor = 'grab';
    _fab.style.transition = '';
    _dragState = null;
}

function _onPointerCancel(): void {
    if (!_fab) return;
    _fab.style.cursor = 'grab';
    _fab.style.transition = '';
    _dragState = null;
    _suppressNextClick = false;
}

function _onClick(ev: MouseEvent): void {
    if (_suppressNextClick) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        _suppressNextClick = false;
    }
}

function _onWindowResize(): void {
    if (!_fab) return;
    const fabSize = _measureFabSize(_fab);
    const vp = _currentViewport(fabSize);
    const current = _readCurrentPosition();
    const clamped = clampToViewport(current, vp);
    if (clamped.x !== current.x || clamped.y !== current.y) {
        _applyPosition(clamped);
        _persist(clamped);
    }
}

/**
 * Liga drag-to-move no FAB ecby. Idempotente.
 * Deve ser chamado uma vez após o boot do app, quando #ai-widget-fab existir.
 */
export function initMascotDraggable(fab: HTMLElement): void {
    if (_initialized) return;
    _fab = fab;
    fab.style.cursor = 'grab';
    fab.style.touchAction = 'none';
    fab.title = (fab.title || 'EC — Assistente') + ' (arraste para mover)';

    const initialPos = _loadOrDefault();
    _applyPosition(initialPos);

    // Pointer events — handle both mouse and touch via Pointer API
    fab.addEventListener('pointerdown', _onPointerDown);
    fab.addEventListener('pointermove', _onPointerMove);
    fab.addEventListener('pointerup', _onPointerUp);
    fab.addEventListener('pointercancel', _onPointerCancel);
    fab.addEventListener('click', _onClick, true); // capture phase — interceptar antes do onclick inline

    _resizeListener = _onWindowResize;
    window.addEventListener('resize', _resizeListener);

    _initialized = true;
}

/** Reset para posição default (bottom-right). Persiste. */
export function resetMascotPosition(): void {
    if (!_fab) return;
    const fabSize = _measureFabSize(_fab);
    const vp = _currentViewport(fabSize);
    const pos = defaultPosition(vp);
    _applyPosition(pos);
    _persist(pos);
}

/** Cleanup — útil para testes / hot reload. */
export function destroyMascotDraggable(): void {
    if (!_fab) return;
    _fab.removeEventListener('pointerdown', _onPointerDown);
    _fab.removeEventListener('pointermove', _onPointerMove);
    _fab.removeEventListener('pointerup', _onPointerUp);
    _fab.removeEventListener('pointercancel', _onPointerCancel);
    _fab.removeEventListener('click', _onClick, true);
    if (_resizeListener) window.removeEventListener('resize', _resizeListener);
    _resizeListener = null;
    _fab.style.cursor = '';
    _fab.style.touchAction = '';
    _fab = null;
    _dragState = null;
    _suppressNextClick = false;
    _initialized = false;
}

export { MASCOT_POSITION_KEY } from './_mascotDragPure.js';
