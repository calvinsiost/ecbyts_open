// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { addFloatingResizeHandles } from './resizeHandles.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { openTabInPanel } from './panelManager.js';
const STORAGE_KEY = 'ecbyts-geo-hud-layout';
const COMPASS_MODULE_PATH = '../scene/compass.js';
const DEFAULT_TOP = 16;
const DEFAULT_RIGHT = 44;
// Calvin 2026-06-07: regra UI canônica — proporções na tela > hard numbers.
// MIN/MAX são bounds a11y (legibilidade do texto dentro do canvas); DEFAULT é
// FALLBACK SS estático. O size real vivo é calculado por _getDefaultCanvasSize()
// (proporcional a vmin) e clampado por _fitCanvasSizeToViewport().
const DEFAULT_CANVAS_SIZE = 120; // fallback estático apenas (window indisponível)
const MIN_CANVAS_SIZE = 80; // mínimo p/ textos "PASSIVO/ATIVO" + "MODEL EIS (3CTA+)" não cortarem
const MAX_CANVAS_SIZE = 250;
// Calvin 2026-06-07: ~12% do menor lado do viewport — equivalente a 120px em
// laptop 1280×800 (Bento Grid base unit 2026 Datadog/Notion pattern: ~100-120px).
const DEFAULT_VMIN_FRACTION = 0.12;
/** Computes default canvas size as a proportion of viewport (vmin). */
function _getDefaultCanvasSize(): number {
    if (typeof window === 'undefined') return DEFAULT_CANVAS_SIZE;
    const vmin = Math.min(window.innerWidth || 1280, window.innerHeight || 800);
    const proportional = Math.round(vmin * DEFAULT_VMIN_FRACTION);
    return Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, proportional));
}
// AR-3 (HUD-UX-PAIN-DRAIN-001 §10.4, 2026-06-11): FONTE ÚNICA dos card IDs.
// O bug "COMPLIANCE 2× mais largo" nasceu de listas duplicadas em 4 lugares
// (resize/stretch/pressed/CSS minimized) — adicionar card aqui propaga para
// stretch+pressed+count automaticamente; _resizeAllCanvases e o CSS minimized
// são travados pelo gate G13 (tests/hud-paint-contracts.test.mjs).
export const GEO_HUD_CARD_IDS = Object.freeze([
    'compass-canvas',
    'globe-canvas',
    'eis-hud-canvas',
    'cost-hud-canvas',
    'ecbt-hud-canvas',
    'violations-hud-canvas',
] as const);
// Calvin 2026-06-07: cardCount 4→5 — ecbt-hud-canvas é o 5º card que estava
// fora do gerenciamento; 2026-06-11: 5→6 (violations) e agora derivado da
// fonte única (nunca mais dessincroniza da lista).
const HUD_CARD_COUNT = GEO_HUD_CARD_IDS.length;
const DEFAULT_LAYOUT = Object.freeze({
    top: DEFAULT_TOP,
    right: DEFAULT_RIGHT,
    left: null,
    canvasSize: DEFAULT_CANVAS_SIZE,
    visibility: 'expanded',
});
/**
 * @typedef {'expanded'|'minimized'|'hidden'} GeoHudVisibility
 * @typedef {{ top: number, right: number|null, left: number|null, canvasSize: number, visibility: GeoHudVisibility, version?: number }} GeoHudLayout
 */
type GeoHudVisibility = 'expanded' | 'minimized' | 'hidden';
type GeoHudLayout = { top: number; right: number | null; left: number | null; canvasSize: number; visibility: GeoHudVisibility; version?: number };
/** @type {HTMLElement|null} */
let _geoHud: HTMLElement | null = null;
/** @type {Function|null} */
let _resizeCleanup: null | Function = null;
/** @type {GeoHudVisibility} */
let _visibility: GeoHudVisibility = DEFAULT_LAYOUT.visibility as GeoHudVisibility;
let _costHudClickBound = false;
/** HUD-RESIZE-LATERAL-001 (Calvin 2026-06-09): tracking de dimensão primária do drag. */
let _resizeStartFrame: { width: number; height: number } | null = null;
/** @type {Promise<any>|null} */
let _compassApiPromise: Promise<any> | null = null;
export function initGeoHud() {
    _geoHud = document.getElementById('geo-hud');
    if (!_geoHud) return;
    _cleanupResizeHandles();
    const saved = _loadState();
    _visibility = saved.visibility;
    _applyCanvasSize(saved.canvasSize);
    _applySavedPosition(saved);
    _setVisibility(saved.visibility);
    // Clamp só se usando left-based (right-based posiciona corretamente via CSS)
    if (saved.visibility === 'expanded' && typeof saved.left === 'number') {
        requestAnimationFrame(_clampToViewport);
    }
    const header = document.getElementById('geo-hud-header');
    if (header && !header.dataset.geoHudBound) {
        _attachDrag(header);
        header.addEventListener('dblclick', _resetToDefault);
        header.dataset.geoHudBound = '1';
    }
    _bindControlButtons();
    _bindCostHudClickFallback();
    _bindPressedFeedback();
    // HUD-UX-PAIN-DRAIN-001 W2 (F5): tooltips dos 6 cards — lazy p/ não pesar
    // o boot; idempotente; flag CONFIG.FEATURES.HUD_TOOLTIPS é o rollback.
    setTimeout(() => {
        void import('./hudCardTooltipsRuntime.js')
            .then((m) => m.initHudCardTooltips())
            .catch((e: any) => console.debug('[geoHud:tooltips-init]', e?.message || e));
    }, 0);
    if (!_isMobile()) {
        _resizeCleanup = addFloatingResizeHandles(_geoHud, {
            minWidth: MIN_CANVAS_SIZE, // container width ≈ canvas size
            maxWidth: MAX_CANVAS_SIZE,
            minHeight: _calcHudHeight(MIN_CANVAS_SIZE),
            maxHeight: _calcHudHeight(MAX_CANVAS_SIZE),
            /** @param {{ width: number, height: number }} resize */
            onResize: (resize: { width: number; height: number }) => {
                // HUD-RESIZE-LATERAL-001: capturar frame inicial no 1º onResize
                // p/ detectar eixo primário do drag em onEnd.
                if (!_resizeStartFrame && _geoHud) {
                    const r = _geoHud.getBoundingClientRect();
                    _resizeStartFrame = { width: r.width, height: r.height };
                }
                const { width, height } = resize;
                const liveSize = _sizeFromFrame(width, height, _resizeStartFrame);
                _stretchCanvases(liveSize);
            },
            onEnd: () => {
                if (!_geoHud || _visibility === 'hidden') {
                    _resizeStartFrame = null;
                    return;
                }
                const rect = _geoHud.getBoundingClientRect();
                const nextSize = _sizeFromFrame(rect.width, rect.height, _resizeStartFrame);
                _resizeStartFrame = null;
                _applyCanvasSize(nextSize);
                _clampToViewport();
                _saveState();
            },
        } as any);
    }
    window.removeEventListener('resize', _onWindowResize);
    window.addEventListener('resize', _onWindowResize);
}
function _bindCostHudClickFallback() {
    if (!_geoHud || _costHudClickBound) return;
    _geoHud.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.id !== 'cost-hud-canvas') return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.handleOpenCostAnalysis === 'function') {
            window.handleOpenCostAnalysis();
            return;
        }
        openTabInPanel('right-panel', 'cost-analysis');
    });
    _costHudClickBound = true;
}
function _bindControlButtons() {
    const btnMin = document.getElementById('geo-hud-minimize');
    if (btnMin && !btnMin.dataset.geoHudBound) {
        /** @param {Event} header */
        const stopDown = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        btnMin.addEventListener('mousedown', stopDown);
        btnMin.addEventListener('touchstart', stopDown, { passive: false });
        btnMin.addEventListener('click', (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMinimize();
        });
        btnMin.dataset.geoHudBound = '1';
    }
    const btnSize = document.getElementById('geo-hud-size');
    if (btnSize && !btnSize.dataset.geoHudBound) {
        /** @param {Event} header */
        const stopDown = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        btnSize.addEventListener('mousedown', stopDown);
        btnSize.addEventListener('touchstart', stopDown, { passive: false });
        btnSize.addEventListener('click', (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            expandGeoHudSize();
        });
        btnSize.dataset.geoHudBound = '1';
    }
    // Calvin 2026-06-07 (BDM customization): botão "−" diminui o tamanho dos cards.
    const btnShrink = document.getElementById('geo-hud-shrink');
    if (btnShrink && !btnShrink.dataset.geoHudBound) {
        const stopDown = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        btnShrink.addEventListener('mousedown', stopDown);
        btnShrink.addEventListener('touchstart', stopDown, { passive: false });
        btnShrink.addEventListener('click', (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            shrinkGeoHudSize();
        });
        btnShrink.dataset.geoHudBound = '1';
    }
    const btnHide = document.getElementById('geo-hud-hide');
    if (btnHide && !btnHide.dataset.geoHudBound) {
        /** @param {Event} header */
        const stopDown = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        btnHide.addEventListener('mousedown', stopDown);
        btnHide.addEventListener('touchstart', stopDown, { passive: false });
        btnHide.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideGeoHud();
        });
        btnHide.dataset.geoHudBound = '1';
    }
}
function _loadCompassApi(): Promise<any> {
    if (!_compassApiPromise) {
        _compassApiPromise = import(COMPASS_MODULE_PATH);
    }
    return _compassApiPromise;
}
/**
 * @param {HTMLElement} header
 */
function _attachDrag(header: HTMLElement) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    /** @param {MouseEvent|TouchEvent} e */
    const onMove = (e: MouseEvent | TouchEvent) => {
        if (!dragging || !_geoHud) return;
        e.preventDefault();
        const point = _eventPoint(e);
        const dx = point.x - startX;
        const dy = point.y - startY;
        const metrics = _getParentMetrics();
        const maxLeft = Math.max(0, metrics.width - _geoHud.offsetWidth);
        const maxTop = Math.max(0, metrics.height - _geoHud.offsetHeight);
        const nextLeft = _clamp(startLeft + dx, 0, maxLeft);
        const nextTop = _clamp(startTop + dy, 0, maxTop);
        _geoHud.style.left = `${Math.round(nextLeft)}px`;
        _geoHud.style.top = `${Math.round(nextTop)}px`;
        _geoHud.style.right = 'auto';
        _geoHud.style.bottom = 'auto';
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
    /** @param {MouseEvent|TouchEvent} e */
    const onDown = (e: MouseEvent | TouchEvent) => {
        if (_visibility !== 'expanded') return;
        if (!_geoHud) return;
        if ('button' in e && e.button != null && e.button !== 0) return;
        if (e.target instanceof Element && e.target.closest('.geo-hud-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        const point = _eventPoint(e);
        dragging = true;
        startX = point.x;
        startY = point.y;
        startLeft = _geoHud.offsetLeft;
        startTop = _geoHud.offsetTop;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    };
    header.addEventListener('mousedown', onDown);
    header.addEventListener('touchstart', onDown, { passive: false });
}
/**
 * @param {MouseEvent|TouchEvent} e
 * @returns {{ x: number, y: number }}
 */
function _eventPoint(e: MouseEvent | TouchEvent) {
    if ('touches' in e && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    const mouse = e as MouseEvent;
    return { x: mouse.clientX, y: mouse.clientY };
}
/**
 * @param {number} cssSize
 */
function _resizeAllCanvases(cssSize: number) {
    const size = _clampCanvasSize(cssSize);
    const compass = document.getElementById('compass-canvas') as HTMLCanvasElement | null;
    if (compass) {
        compass.width = size;
        compass.height = size;
        compass.style.width = `${size}px`;
        compass.style.height = `${size}px`;
        _loadCompassApi()
            .then((mod: any) => mod.redrawCompass?.())
            .catch((_e: any) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    }
    _loadCompassApi()
        .then((mod: any) => mod.setGlobeCSSSize?.(size))
        .catch((_e: any) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    const eis = document.getElementById('eis-hud-canvas') as HTMLCanvasElement | null;
    if (eis) {
        eis.dataset.scaled = '';
        eis.width = size;
        eis.height = size;
        eis.style.width = `${size}px`;
        eis.style.height = `${size}px`;
        const eisModulePath = '../handlers/eis.js';
        import(eisModulePath)
            .then((mod) => {
                if (mod.eisHandlers && mod.eisHandlers.updateEisStatusBadge) {
                    mod.eisHandlers.updateEisStatusBadge();
                }
            })
            .catch((_e) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    }
    const cost = document.getElementById('cost-hud-canvas') as HTMLCanvasElement | null;
    if (cost) {
        cost.dataset.scaled = '';
        cost.width = size;
        cost.height = size;
        cost.style.width = `${size}px`;
        cost.style.height = `${size}px`;
        import('./costHud.js')
            .then((mod) => {
                if (typeof mod.updateCostHudBadge === 'function') {
                    mod.updateCostHudBadge();
                }
            })
            .catch((_e) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    }
    // Calvin 2026-06-07: ecbt-hud-canvas estava fora do resize — agora padronizado com os outros 4.
    const ecbt = document.getElementById('ecbt-hud-canvas') as HTMLCanvasElement | null;
    if (ecbt) {
        ecbt.dataset.scaled = '';
        ecbt.width = size;
        ecbt.height = size;
        ecbt.style.width = `${size}px`;
        ecbt.style.height = `${size}px`;
        import('./ecbtScoreHud.js')
            .then((mod: any) => {
                if (typeof mod.updateEcbtHudBadge === 'function') mod.updateEcbtHudBadge();
            })
            .catch((_e: any) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    }
    // HUD-UX 2026-06-11 (Calvin screenshot): violations-hud-canvas estava fora
    // do resize — ficava com os 200px do HTML, ~2× mais largo que os irmãos.
    const violations = document.getElementById('violations-hud-canvas') as HTMLCanvasElement | null;
    if (violations) {
        violations.dataset.scaled = '';
        violations.width = size;
        violations.height = size;
        violations.style.width = `${size}px`;
        violations.style.height = `${size}px`;
        import('./violationsHud.js')
            .then((mod: any) => {
                if (typeof mod.updateViolationsHud === 'function') mod.updateViolationsHud();
            })
            .catch((_e: any) => console.debug('[utils/ui/geoHud:silent-catch]', _e?.message || _e));
    }
}
/** Estica canvases visualmente via CSS durante drag (sem alterar buffer interno) */
/**
 * @param {number} cssSize
 */
function _stretchCanvases(cssSize: number) {
    const size = _clampCanvasSize(cssSize);
    const px = `${size}px`;
    // AR-3: consome a fonte única GEO_HUD_CARD_IDS (antes lista duplicada).
    for (const id of GEO_HUD_CARD_IDS) {
        const c = document.getElementById(id);
        if (c) {
            c.style.width = px;
            c.style.height = px;
        }
    }
}
/**
 * @param {number} cssSize
 * @returns {number}
 */
function _applyCanvasSize(cssSize: number) {
    const size = _fitCanvasSizeToViewport(cssSize);
    _resizeAllCanvases(size);
    _syncContainerFrame(size);
    return size;
}
/**
 * @param {number} canvasSize
 */
function _syncContainerFrame(canvasSize: number) {
    if (!_geoHud) return;
    const size = _clampCanvasSize(canvasSize);
    _geoHud.style.width = `${size}px`;
    _geoHud.style.height = `${_calcHudHeight(size)}px`;
}
/**
 * @returns {GeoHudLayout}
 */
function _loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (!raw) return { ...DEFAULT_LAYOUT, canvasSize: _getDefaultCanvasSize() };
        const parsed = JSON.parse(raw);
        const top = typeof parsed.top === 'number' ? parsed.top : DEFAULT_TOP;
        const right = typeof parsed.right === 'number' ? parsed.right : DEFAULT_RIGHT;
        const left = typeof parsed.left === 'number' ? parsed.left : null;
        const canvasSize = _clampCanvasSize(parsed.canvasSize);
        const visibility = ['expanded', 'minimized'].includes(parsed.visibility) ? parsed.visibility : 'minimized'; // 'hidden' e valores inválidos migram para 'minimized'
        return {
            top,
            right,
            left,
            canvasSize,
            visibility,
        };
    } catch (_) {
        return { ...DEFAULT_LAYOUT, canvasSize: _getDefaultCanvasSize() };
    }
}
/**
 * @param {GeoHudVisibility} [visibilityOverride]
 */
function _saveState(visibilityOverride: GeoHudVisibility = _visibility) {
    // garantir que nunca salvamos 'hidden'
    if (!['expanded', 'minimized'].includes(visibilityOverride)) visibilityOverride = 'minimized';
    if (!_geoHud) return;
    const metrics = _getParentMetrics();
    const rect = _geoHud.getBoundingClientRect();
    const left = Math.round(rect.left - metrics.rect.left);
    const top = Math.round(rect.top - metrics.rect.top);
    const right = Math.round(metrics.width - (left + rect.width));
    const isRightSide = left + rect.width / 2 > metrics.width / 2;
    const state: GeoHudLayout = {
        top: _clamp(top, 0, Math.max(0, metrics.height - rect.height)),
        canvasSize: _getCurrentCanvasSize(),
        visibility: visibilityOverride,
        version: 1,
        left: null,
        right: null,
    };
    if (isRightSide) {
        state.right = _clamp(right, 0, Math.max(0, metrics.width - rect.width));
    } else {
        state.left = _clamp(left, 0, Math.max(0, metrics.width - rect.width));
    }
    safeSetItem(STORAGE_KEY, JSON.stringify(state));
}
/**
 * @param {GeoHudLayout} layout
 */
function _applySavedPosition(layout: GeoHudLayout) {
    if (!_geoHud) return;
    _geoHud.style.bottom = 'auto';
    _geoHud.style.top = `${layout.top}px`;
    if (typeof layout.left === 'number') {
        _geoHud.style.left = `${layout.left}px`;
        _geoHud.style.right = 'auto';
        return;
    }
    _geoHud.style.left = 'auto';
    _geoHud.style.right = `${layout.right}px`;
}
function _clampToViewport() {
    if (!_geoHud || _visibility !== 'expanded') return;
    const metrics = _getParentMetrics();
    const rect = _geoHud.getBoundingClientRect();
    const left = rect.left - metrics.rect.left;
    const top = rect.top - metrics.rect.top;
    const maxLeft = Math.max(0, metrics.width - rect.width);
    const maxTop = Math.max(0, metrics.height - rect.height);
    _geoHud.style.left = `${Math.round(_clamp(left, 0, maxLeft))}px`;
    _geoHud.style.top = `${Math.round(_clamp(top, 0, maxTop))}px`;
    _geoHud.style.right = 'auto';
    _geoHud.style.bottom = 'auto';
}
function _getParentMetrics() {
    if (!_geoHud) {
        return {
            rect: { left: 0, top: 0 },
            width: window.innerWidth,
            height: window.innerHeight,
        };
    }
    const parent = _geoHud.offsetParent || document.documentElement;
    const rect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    return {
        rect,
        width: parent.clientWidth || window.innerWidth,
        height: parent.clientHeight || window.innerHeight,
    };
}
function _getCurrentCanvasSize() {
    const compass = document.getElementById('compass-canvas');
    if (!compass) return DEFAULT_CANVAS_SIZE;
    const cssWidth = parseInt(window.getComputedStyle(compass).width, 10);
    if (Number.isFinite(cssWidth) && cssWidth > 0) {
        return _clampCanvasSize(cssWidth);
    }
    return DEFAULT_CANVAS_SIZE;
}
function _getViewportCanvasSizeRange() {
    const metrics = _getParentMetrics();
    const maxByWidth = Math.floor(metrics.width || window.innerWidth || MAX_CANVAS_SIZE);
    // HUD-RESIZE-LATERAL-001 (Calvin 2026-06-09): NÃO clampar por altura
    // (maxByHeight removido). #geo-hud já tem overflow-y:auto + max-height
    // CSS, então cards maiores que viewport apenas geram scroll interno —
    // usuário não fica preso a tamanho artificialmente pequeno.
    const fitMax = Math.min(MAX_CANVAS_SIZE, maxByWidth);
    const max = Math.max(MIN_CANVAS_SIZE, Number.isFinite(fitMax) && fitMax > 0 ? fitMax : DEFAULT_CANVAS_SIZE);
    return {
        min: MIN_CANVAS_SIZE,
        max,
    };
}
/**
 * @param {number} cssSize
 * @returns {number}
 */
function _fitCanvasSizeToViewport(cssSize: number) {
    const requestedSize = _clampCanvasSize(cssSize);
    const { min, max } = _getViewportCanvasSizeRange();
    return _clamp(requestedSize, min, max);
}
/**
 * @param {number} currentSize
 * @returns {number}
 */
function _getNextProceduralCanvasSize(currentSize: number) {
    const fittedCurrentSize = _fitCanvasSizeToViewport(currentSize);
    const { max } = _getViewportCanvasSizeRange();
    if (fittedCurrentSize >= max) return max;
    return _fitCanvasSizeToViewport(fittedCurrentSize + Math.ceil((max - fittedCurrentSize) / 2));
}
/**
 * Calvin 2026-06-07 (BDM customization): tamanho anterior por bisseção até MIN.
 * Espelha _getNextProceduralCanvasSize na direção oposta.
 * @param {number} currentSize
 * @returns {number}
 */
function _getPrevProceduralCanvasSize(currentSize: number) {
    const fittedCurrentSize = _fitCanvasSizeToViewport(currentSize);
    const { min } = _getViewportCanvasSizeRange();
    if (fittedCurrentSize <= min) return min;
    return _fitCanvasSizeToViewport(fittedCurrentSize - Math.ceil((fittedCurrentSize - min) / 2));
}
function _ensureCanvasFitsViewport() {
    const currentSize = _getCurrentCanvasSize();
    const fittedSize = _fitCanvasSizeToViewport(currentSize);
    if (fittedSize !== currentSize) {
        _applyCanvasSize(fittedSize);
    }
    return fittedSize;
}
/**
 * @param {number} canvasSize
 * @returns {number}
 */
function _calcHudHeight(canvasSize: number) {
    const size = _clampCanvasSize(canvasSize);
    const header = _getHeaderHeight();
    const gap = _getGapPx();
    const cardCount = HUD_CARD_COUNT;
    const gapCount = cardCount;
    return Math.round(header + size * cardCount + gap * gapCount);
}
/**
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
function _sizeFromFrame(
    width: number,
    height: number,
    startFrame: { width: number; height: number } | null = null,
) {
    const gap = _getGapPx();
    const header = _getHeaderHeight();
    const fromWidth = width;
    const cardCount = HUD_CARD_COUNT;
    const fromHeight = (height - header - gap * cardCount) / cardCount;
    // HUD-RESIZE-LATERAL-001 (Calvin 2026-06-09): se temos startFrame,
    // escolher dimensão baseado em qual mudou MAIS (eixo primário do drag).
    // Antes: Math.min(fromWidth, fromHeight) ignorava aumento de width puro.
    let candidate: number;
    if (startFrame) {
        const dW = Math.abs(width - startFrame.width);
        const dH = Math.abs(height - startFrame.height);
        if (dW > dH) candidate = fromWidth;
        else if (dH > dW) candidate = fromHeight;
        else candidate = Math.min(fromWidth, fromHeight);
    } else {
        candidate = Math.min(fromWidth, fromHeight);
    }
    if (!Number.isFinite(candidate) || candidate <= 0) {
        return _getCurrentCanvasSize();
    }
    return _clampCanvasSize(Math.round(candidate));
}
function _getHeaderHeight() {
    const header = document.getElementById('geo-hud-header');
    return header ? header.offsetHeight || 18 : 18;
}
function _getGapPx() {
    if (!_geoHud) return 8;
    const gap = parseFloat(window.getComputedStyle(_geoHud).gap);
    return Number.isFinite(gap) ? gap : 8;
}
/**
 * @param {GeoHudVisibility} state
 */
function _setVisibility(state: GeoHudVisibility) {
    if (!_geoHud) return;
    if (!['expanded', 'minimized'].includes(state)) {
        state = 'minimized';
    }
    _visibility = state;
    _geoHud.classList.toggle('geo-hud-minimized', state === 'minimized');
    _geoHud.classList.toggle('geo-hud-docked', state === 'minimized');
    _geoHud.classList.remove('geo-hud-hidden'); // nunca oculto
    const btnMin = document.getElementById('geo-hud-minimize');
    if (btnMin) {
        if (state === 'minimized') {
            btnMin.innerHTML = '&#9654;';
            btnMin.title = 'Expand';
        } else {
            btnMin.innerHTML = '&#9472;';
            btnMin.title = 'Minimize';
        }
    }
    if (state === 'minimized') {
        _dockBesideCoordDisplay();
    }
}
function _restoreExpandedState() {
    _setVisibility('expanded');
    _applySavedPosition(_loadState());
}
function _resetToDefault() {
    if (!_geoHud) return;
    _restoreExpandedState();
    _applyCanvasSize(DEFAULT_CANVAS_SIZE);
    _applySavedPosition(DEFAULT_LAYOUT);
    _clampToViewport();
    _saveState('expanded');
}
function _dockBesideCoordDisplay() {
    if (!_geoHud) return;
    const coord = document.getElementById('coord-display');
    if (!coord) {
        // fallback: bottom-right genérico
        _geoHud.style.bottom = '16px';
        _geoHud.style.right = '84px';
        _geoHud.style.top = 'auto';
        _geoHud.style.left = 'auto';
        return;
    }
    const coordRect = coord.getBoundingClientRect();
    const parent = _geoHud.offsetParent || document.documentElement;
    const parentRect = parent.getBoundingClientRect
        ? parent.getBoundingClientRect()
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const gap = 4;
    // alinha o bottom do geo-hud com o bottom do coord-display
    const bottom = (parentRect.bottom || window.innerHeight) - coordRect.bottom;
    // posiciona à esquerda do coord-display
    const right = (parentRect.right || window.innerWidth) - coordRect.left + gap;
    _geoHud.style.bottom = `${Math.round(bottom)}px`;
    _geoHud.style.right = `${Math.round(right)}px`;
    _geoHud.style.top = 'auto';
    _geoHud.style.left = 'auto';
}
function _onWindowResize() {
    if (!_geoHud) return;
    if (_visibility === 'minimized') {
        _dockBesideCoordDisplay();
    } else {
        _ensureCanvasFitsViewport();
        _clampToViewport();
        _saveState();
    }
}
function _cleanupResizeHandles() {
    if (_resizeCleanup) {
        _resizeCleanup();
        _resizeCleanup = null;
    }
}
function _isMobile() {
    return document.body.classList.contains('mobile');
}
/**
 * @param {number} size
 * @returns {number}
 */
function _clampCanvasSize(size: number) {
    return _clamp(Number(size) || DEFAULT_CANVAS_SIZE, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
}
/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function _clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}
/**
 * HUD-UX-PAIN-DRAIN-001 W3.5 (D29): feedback visual de "pressed" no
 * mousedown de cada card (classe CSS em constellation.css, namespace
 * geo-hud-card-*; reduced-motion respeitado no CSS).
 */
function _bindPressedFeedback() {
    // AR-3: consome a fonte única GEO_HUD_CARD_IDS (antes lista duplicada).
    for (const id of GEO_HUD_CARD_IDS) {
        const el = document.getElementById(id);
        if (!el || el.dataset.pressedBound === '1') continue;
        el.dataset.pressedBound = '1';
        const clear = () => el.classList.remove('geo-hud-card-pressed');
        el.addEventListener('mousedown', () => el.classList.add('geo-hud-card-pressed'));
        el.addEventListener('mouseup', clear);
        el.addEventListener('mouseleave', clear);
        el.addEventListener('touchstart', () => el.classList.add('geo-hud-card-pressed'), { passive: true });
        el.addEventListener('touchend', clear);
    }
}

export function expandGeoHudSize() {
    if (!_geoHud) return;
    if (_visibility === 'minimized') {
        _restoreExpandedState();
    }
    const nextSize = _getNextProceduralCanvasSize(_getCurrentCanvasSize());
    _applyCanvasSize(nextSize);
    _clampToViewport();
    _saveState('expanded');
}
/**
 * Calvin 2026-06-07 (BDM customization): companion ao expandGeoHudSize,
 * permite o usuário diminuir o tamanho dos cards via botão "−".
 * Persistência via mesmo STORAGE_KEY (transparent).
 */
export function shrinkGeoHudSize() {
    if (!_geoHud) return;
    if (_visibility === 'minimized') {
        _restoreExpandedState();
    }
    const prevSize = _getPrevProceduralCanvasSize(_getCurrentCanvasSize());
    _applyCanvasSize(prevSize);
    _clampToViewport();
    _saveState('expanded');
}
export function toggleMinimize() {
    if (!_geoHud) return;
    if (_visibility === 'minimized') {
        _restoreExpandedState();
        _ensureCanvasFitsViewport();
        _clampToViewport();
    } else {
        _setVisibility('minimized'); // chama _dockBesideCoordDisplay() internamente
    }
    _saveState();
}
export function hideGeoHud() {
    if (!_geoHud) return;
    _setVisibility('minimized');
    _saveState();
}
export function showGeoHud() {
    if (!_geoHud) return;
    _restoreExpandedState();
    _ensureCanvasFitsViewport();
    _clampToViewport();
    _saveState();
}
export function getGeoHudVisibility() {
    return _visibility;
}
//# sourceMappingURL=geoHud.js.map
