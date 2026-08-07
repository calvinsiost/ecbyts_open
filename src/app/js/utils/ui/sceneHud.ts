// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENE HUD — drag, minimize, resize for #scene-hud
   Follows the same pattern as geoHud.js.
   ================================================================ */

import { addFloatingResizeHandles } from './resizeHandles.js';
import { safeSetItem } from '../storage/storageMonitor.js';

const STORAGE_KEY = 'ecbyts-scene-hud-layout';

let _hud: HTMLElement | null = null;
let _minimized: boolean = false;
let _hidden: boolean = false;
let _resizeCleanup: (() => void) | null = null;
let _initialized: boolean = false;

interface SceneHudState {
    minimized?: boolean;
    hidden?: boolean;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
}

/**
 * Initialize scene HUD interactions: drag, minimize, close, resize.
 * Call after DOM ready (inside onSceneReady or main init).
 */
export function initSceneHud(): void {
    _hud = document.getElementById('scene-hud');
    if (!_hud) return;
    // Guard: previne double-init que duplicaria handles e listeners
    // (regression fix 2026-04-13 - handles empilhados bloqueavam cliques)
    if (_initialized && _resizeCleanup) {
        _resizeCleanup();
    }
    _initialized = true;
    const saved = _loadState();
    _minimized = saved.minimized || false;
    _hidden = saved.hidden || false;
    _applySavedLayout(saved);
    _bindHeaderControls();
    _bindMinimizeButton();
    _bindCloseButton();
    _attachResize();
    window.removeEventListener('resize', _clampToViewport);
    window.addEventListener('resize', _clampToViewport);
}

/** Show scene HUD (from ribbon toggle or LLM command). */
export function showSceneHud(): void {
    if (!_hud) return;
    _hidden = false;
    _hud.style.display = '';
    _saveState();
}

/** Hide scene HUD. */
export function hideSceneHud(): void {
    if (!_hud) return;
    _hidden = true;
    _hud.style.display = 'none';
    _saveState();
}

/** Toggle minimize. */
export function toggleSceneHudMinimize(): void {
    _toggleMinimize();
}

// ── Internal ──────────────────────────────────────────────────────

function _stopProp(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
}

function _applySavedLayout(saved: SceneHudState): void {
    if (!_hud) return;
    if (saved.left != null && saved.top != null) {
        _hud.style.left = `${saved.left}px`;
        _hud.style.bottom = 'auto';
        _hud.style.top = `${saved.top}px`;
    }
    // Persist width/height across sessions (regression fix 2026-04-13)
    if (Number.isFinite(saved.width) && (saved.width as number) > 0) {
        _hud.style.width = `${saved.width}px`;
    }
    if (Number.isFinite(saved.height) && (saved.height as number) > 0) {
        _hud.style.height = `${saved.height}px`;
    }
    if (_minimized) _hud.classList.add('scene-hud-minimized');
    if (_hidden) _hud.style.display = 'none';
}

function _bindHeaderControls(): void {
    const header = document.getElementById('scene-hud-header');
    if (header && !header.dataset.bound) {
        _attachDrag(header);
        header.addEventListener('dblclick', _resetPosition);
        header.dataset.bound = '1';
    }
}

function _bindMinimizeButton(): void {
    const btnMin = document.getElementById('scene-hud-minimize');
    if (btnMin && !btnMin.dataset.bound) {
        btnMin.addEventListener('mousedown', _stopProp);
        btnMin.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            _toggleMinimize();
        });
        btnMin.dataset.bound = '1';
    }
}

function _bindCloseButton(): void {
    const btnClose = document.getElementById('scene-hud-close');
    if (btnClose && !btnClose.dataset.bound) {
        btnClose.addEventListener('mousedown', _stopProp);
        btnClose.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            _hide();
        });
        btnClose.dataset.bound = '1';
    }
}

function _attachResize(): void {
    if (!_hud) return;
    if (_resizeCleanup) _resizeCleanup();
    // addFloatingResizeHandles returns a generic Function; wrap it so the
    // module-level cleanup slot keeps its `() => void` type.
    const cleanup = addFloatingResizeHandles(_hud, {
        minWidth: 120,
        maxWidth: 400,
        minHeight: 40,
        maxHeight: 200,
        onEnd: () => _saveState(),
    });
    _resizeCleanup = () => {
        cleanup();
    };
}

function _toggleMinimize(): void {
    if (!_hud) return;
    _minimized = !_minimized;
    _hud.classList.toggle('scene-hud-minimized', _minimized);
    const btnMin = document.getElementById('scene-hud-minimize');
    if (btnMin) btnMin.innerHTML = _minimized ? '&#9723;' : '&#9472;'; // □ or ─
    _saveState();
}

function _hide(): void {
    hideSceneHud();
}

function _resetPosition(): void {
    if (!_hud) return;
    _hud.style.left = '';
    _hud.style.top = '';
    _hud.style.bottom = '';
    _hud.style.right = '';
    _hud.style.width = '';
    _hud.style.height = '';
    _saveState();
}

function _attachDrag(header: HTMLElement): void {
    let dragging = false;
    let startX = 0,
        startY = 0,
        startLeft = 0,
        startTop = 0;
    const onMove = (e: MouseEvent | TouchEvent) => {
        if (!dragging || !_hud) return;
        e.preventDefault();
        const pt = 'touches' in e ? e.touches[0] : e;
        if (!pt) return;
        const parent = _hud.offsetParent || document.body;
        const maxL = Math.max(0, parent.clientWidth - _hud.offsetWidth);
        const maxT = Math.max(0, parent.clientHeight - _hud.offsetHeight);
        _hud.style.left = `${Math.round(Math.min(maxL, Math.max(0, startLeft + pt.clientX - startX)))}px`;
        _hud.style.top = `${Math.round(Math.min(maxT, Math.max(0, startTop + pt.clientY - startY)))}px`;
        _hud.style.bottom = 'auto';
        _hud.style.right = 'auto';
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        _saveState();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
        if (!_hud) return;
        const ev = e as MouseEvent & TouchEvent;
        if (ev.button != null && ev.button !== 0) return;
        const target = ev.target as HTMLElement | null;
        if (target && target.closest('.scene-hud-ctrl')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const pt = 'touches' in ev ? ev.touches[0] : ev;
        if (!pt) return;
        dragging = true;
        startX = pt.clientX;
        startY = pt.clientY;
        startLeft = _hud.offsetLeft;
        startTop = _hud.offsetTop;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    };
    header.addEventListener('mousedown', onDown);
    header.addEventListener('touchstart', onDown, { passive: false });
}

function _clampToViewport(): void {
    if (!_hud || _hidden) return;
    const parent = _hud.offsetParent || document.body;
    const maxL = Math.max(0, parent.clientWidth - _hud.offsetWidth);
    const maxT = Math.max(0, parent.clientHeight - _hud.offsetHeight);
    if (_hud.offsetLeft > maxL) _hud.style.left = `${maxL}px`;
    if (_hud.offsetTop > maxT) _hud.style.top = `${maxT}px`;
}

function _saveState(): void {
    if (!_hud) return;
    try {
        const data: SceneHudState = { minimized: _minimized, hidden: _hidden };
        if (_hud.style.left) data.left = _hud.offsetLeft;
        if (_hud.style.top) data.top = _hud.offsetTop;
        // Persist width/height when user resizes (regression fix 2026-04-13)
        if (_hud.style.width) data.width = _hud.offsetWidth;
        if (_hud.style.height) data.height = _hud.offsetHeight;
        safeSetItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e: unknown) {
        const err = e as Error | undefined;
        console.debug('[sceneHud] saveState:', err?.message || e);
        /* */
    }
}

function _loadState(): SceneHudState {
    try {
        const s = localStorage.getItem(STORAGE_KEY) || '';
        return s ? JSON.parse(s) : {};
    } catch (e: unknown) {
        const err = e as Error | undefined;
        console.debug('[sceneHud] loadState:', err?.message || e);
        return {};
    }
}
