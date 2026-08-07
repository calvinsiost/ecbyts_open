// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// @ts-check
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   EIS TERRAIN PROBE — Valor EIS sobre a posicao apontada no terreno
   ================================================================

   Indicador passivo no scene-hud (ao lado de geologia) que mostra um
   badge flutuante sobre o ponto do terreno apenas em hover real.

   Regra de valor:
   - Se o cursor estiver dentro de uma area (boundary/site_area), usa
     o EIS scoped dessa area (areaEIS quando disponivel).
   - Caso contrario, usa EIS global simplificado do modelo.

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getCamera, getRenderer } from '../scene/setup.js';
import { getCursorWorldPosition } from '../scene/cursorProjector.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { computeScopedEIS, computeSimplifiedEIS } from '../../core/purpose/snapshotEngine.js';
import { enumerateAreaScopes, pointInPolygonXZ, polygonAreaXZ } from '../../core/eis/eisScopeResolver.js';
import { getModelIdSync } from '../../core/io/modelLink.js';
import { toFiniteNumber } from '../helpers/toFiniteNumber.js';
type ResolvedEisScope = { type: 'model' | 'area'; elementId: string | null };
/**
 * @typedef {{ type: 'model' | 'area', elementId: string | null }} ResolvedEisScope
 * @typedef {{ elementId: string, name: string, area: number }} AreaProbeCandidate
 * @typedef {{ text: string, score: number }} TerrainProbeValue
 */
const VALUE_REFRESH_MS = 140;
const PROBE_ENABLED_KEY = 'ecbyts-eis-terrain-probe-enabled';
const THREE_RUNTIME: any = THREE;
let _initialized = false;
let _overlayEl: HTMLElement | null = null;
let _rafId = 0;
let _nextValueAt = 0;
let _cachedText = '';
let _cachedScore = 0;
let _lastMouseClientX: number | null = null;
let _lastMouseClientY: number | null = null;
let _lastResolvedScope: ResolvedEisScope = { type: 'model', elementId: null };
let _hoveringCanvas = false;
let _pointerButtons = 0;
let _probeEnabled = false;
let _tmpVector: any = null;
let _raycaster: any = null;
let _mouseNdc: any = null;
let _groundPlane: any = null;
function _getTmpVector() { if (!_tmpVector) _tmpVector = new THREE_RUNTIME.Vector3(); return _tmpVector; }
function _getRaycaster() { if (!_raycaster) _raycaster = new THREE_RUNTIME.Raycaster(); return _raycaster; }
function _getMouseNdc() { if (!_mouseNdc) _mouseNdc = new THREE_RUNTIME.Vector2(); return _mouseNdc; }
function _getGroundPlane() { if (!_groundPlane) _groundPlane = new THREE_RUNTIME.Plane(new THREE_RUNTIME.Vector3(0, 1, 0), 0); return _groundPlane; }
/**
 * Inicializa o probe passivo de hover.
 */
export function initEisTerrainProbe() {
    if (_initialized)
        return;
    _initialized = true;
    _overlayEl = document.getElementById('eis-terrain-probe-value');
    if (!_overlayEl)
        return;
    _probeEnabled = _loadProbeEnabled();
    _syncToggleButton();
    _bindMouseTracking();
}
/**
 * Toggle do HUD: habilita/desabilita o probe passivo de hover.
 * @param {MouseEvent | undefined} event?
 */
export function handleToggleEisTerrainProbe(event?: MouseEvent) {
    if (!_initialized)
        initEisTerrainProbe();
    const clientX = event?.clientX;
    const clientY = event?.clientY;
    if (typeof clientX === 'number' && Number.isFinite(clientX) && typeof clientY === 'number' && Number.isFinite(clientY)) {
        _lastMouseClientX = clientX;
        _lastMouseClientY = clientY;
    }
    _probeEnabled = !_probeEnabled;
    _persistProbeEnabled(_probeEnabled);
    _syncToggleButton();
    if (_probeEnabled && _hoveringCanvas && _pointerButtons === 0) {
        _nextValueAt = 0;
        _startLoop();
        return;
    }
    _stopLoop();
    _hideOverlay();
}
/**
 * Mantido por compatibilidade. O probe nao usa mais fluxo por clique direito.
 * @param {Event | undefined} event?
 */
export function handleEisTerrainProbeContextMenu(event?: Event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return false;
}
function _openProbeSettings({ detailMode = false }: { detailMode?: boolean } = {}) {
    if (typeof window.handleOpenEisDashboard === 'function') {
        window.handleOpenEisDashboard();
    }
    setTimeout(() => {
        try {
            const useArea = detailMode && _lastResolvedScope?.type === 'area' && _lastResolvedScope.elementId;
            if (useArea) {
                if (typeof window.handleEisScopeChange === 'function') {
                    window.handleEisScopeChange('area');
                }
                if (typeof window.handleEisScopeItemSelect === 'function') {
                    window.handleEisScopeItemSelect('area', _lastResolvedScope.elementId);
                }
            }
            else if (typeof window.handleEisScopeChange === 'function') {
                window.handleEisScopeChange('model');
            }
        }
        catch (e: any) {
            console.debug('[eisTerrainProbe] scope-change-dispatch:', e?.message || e);
            // no-op: best effort
        }
    }, 100);
}
function _startLoop() {
    if (_rafId)
        return;
    if (!_probeEnabled) {
        _hideOverlay();
        return;
    }
    const tick = () => {
        if (!_probeEnabled || !_hoveringCanvas || _pointerButtons !== 0) {
            _hideOverlay();
            _rafId = 0;
            return;
        }
        _updateProbe();
        _rafId = requestAnimationFrame(tick);
    };
    _rafId = requestAnimationFrame(tick);
}
function _stopLoop() {
    if (_rafId) {
        cancelAnimationFrame(_rafId);
        _rafId = 0;
    }
}
function _syncToggleButton() {
    const btn = document.getElementById('eis-terrain-probe-toggle-btn');
    if (!btn)
        return;
    btn.classList.toggle('active', _probeEnabled);
    btn.setAttribute('aria-pressed', _probeEnabled ? 'true' : 'false');
    btn.setAttribute('aria-label', _probeEnabled ? 'Disable EIS value on hover' : 'Enable EIS value on hover');
    btn.title = _probeEnabled ? 'Disable EIS value on hover' : 'Enable EIS value on hover';
}
function _hideOverlay() {
    if (!_overlayEl)
        return;
    _overlayEl.classList.remove('active');
}
function _updateProbe() {
    if (!_overlayEl)
        return;
    if (!_probeEnabled || !_hoveringCanvas || _pointerButtons !== 0) {
        _hideOverlay();
        return;
    }
    const world = _resolveCursorWorldPosition();
    const camera = getCamera();
    const renderer = getRenderer();
    if (!world || !camera || !renderer) {
        _hideOverlay();
        return;
    }
    const now = Date.now();
    if (now >= _nextValueAt) {
        const valueInfo = _resolveValueAtCursor(world);
        _cachedText = valueInfo.text;
        _cachedScore = valueInfo.score;
        _nextValueAt = now + VALUE_REFRESH_MS;
    }
    _getTmpVector().set(world.x, world.y + 0.12, world.z);
    _getTmpVector().project(camera);
    if (_getTmpVector().z < -1 || _getTmpVector().z > 1) {
        _hideOverlay();
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((_getTmpVector().x + 1) / 2) * rect.width;
    const y = ((-_getTmpVector().y + 1) / 2) * rect.height;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        _hideOverlay();
        return;
    }
    _overlayEl.textContent = `${_cachedText}: ${_cachedScore.toFixed(2)}`;
    _overlayEl.style.left = `${x}px`;
    _overlayEl.style.top = `${y}px`;
    _overlayEl.classList.add('active');
}
function _bindMouseTracking() {
    const container = document.getElementById('canvas-container');
    if (!container)
        return;
    if (container.dataset.eisProbeMouseBound === '1')
        return;
    container.dataset.eisProbeMouseBound = '1';
    /** @param {MouseEvent} value */
    const syncPointerState = (event: MouseEvent) => {
        _pointerButtons = toFiniteNumber(event?.buttons, 0);
        if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
            _lastMouseClientX = event.clientX;
            _lastMouseClientY = event.clientY;
        }
    };
    container.addEventListener('mouseenter', (event) => {
        _hoveringCanvas = true;
        syncPointerState(event);
        if (_probeEnabled && _pointerButtons === 0) {
            _nextValueAt = 0;
            _startLoop();
        }
    });
    container.addEventListener('mousemove', (event) => {
        _hoveringCanvas = true;
        syncPointerState(event);
        if (_probeEnabled && _pointerButtons === 0) {
            _startLoop();
        }
        else {
            _stopLoop();
            _hideOverlay();
        }
    });
    container.addEventListener('mousedown', (event) => {
        syncPointerState(event);
        _stopLoop();
        _hideOverlay();
    });
    container.addEventListener('mouseup', (event) => {
        syncPointerState(event);
        if (_probeEnabled && _hoveringCanvas && _pointerButtons === 0) {
            _nextValueAt = 0;
            _startLoop();
        }
    });
    container.addEventListener('mouseleave', () => {
        _hoveringCanvas = false;
        _pointerButtons = 0;
        _stopLoop();
        _hideOverlay();
    });
    window.addEventListener('blur', () => {
        _hoveringCanvas = false;
        _pointerButtons = 0;
        _stopLoop();
        _hideOverlay();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden)
            return;
        _hoveringCanvas = false;
        _pointerButtons = 0;
        _stopLoop();
        _hideOverlay();
    });
}
function _loadProbeEnabled() {
    try {
        return localStorage.getItem(PROBE_ENABLED_KEY) === '1';
    }
    catch (e: any) {
        console.debug('[eisTerrainProbe] loadEnabled:', e?.message || e);
        return false;
    }
}
/** @param {boolean} value */
function _persistProbeEnabled(value: boolean) {
    try {
        localStorage.setItem(PROBE_ENABLED_KEY, value ? '1' : '0');
    }
    catch (e: any) {
        console.debug('[eisTerrainProbe] persistEnabled:', e?.message || e);
        // no-op
    }
}
function _refreshResolvedScopeFromCursor() {
    const world = _resolveCursorWorldPosition();
    if (!world)
        return;
    _resolveValueAtCursor(world);
}
/** @returns {any} */
function _resolveCursorWorldPosition() {
    const projected = getCursorWorldPosition();
    if (projected)
        return projected;
    const camera = getCamera();
    const renderer = getRenderer();
    if (!camera || !renderer)
        return null;
    if (_lastMouseClientX == null || _lastMouseClientY == null)
        return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0)
        return null;
    _getMouseNdc().x = ((_lastMouseClientX - rect.left) / rect.width) * 2 - 1;
    _getMouseNdc().y = -((_lastMouseClientY - rect.top) / rect.height) * 2 + 1;
    _getRaycaster().setFromCamera(_getMouseNdc(), camera);
    const hit = _getRaycaster().ray.intersectPlane(_getGroundPlane(), _getTmpVector());
    if (!hit)
        return null;
    return _getTmpVector().clone();
}
/**
 * @param {{ x: number, y: number, z: number }} world
 * @returns {TerrainProbeValue}
 */
function _resolveValueAtCursor(world: { x: number; y: number; z: number }) {
    const elements = (getAllElements());
    const byId = new Map(elements.map((el) => [el.id, el]));
    const scopes = (enumerateAreaScopes(elements));
    const modelId = getModelIdSync();
    let best = null;
    for (const scope of scopes) {
        const el = byId.get(scope.elementId);
        const vertices = el?.data?.vertices;
        if (!Array.isArray(vertices) || vertices.length < 3)
            continue;
        if (!pointInPolygonXZ(world.x, world.z, vertices))
            continue;
        const area = polygonAreaXZ(vertices);
        if (!best || area < best.area) {
            best = {
                elementId: scope.elementId,
                name: scope.name || el?.data?.name || scope.elementId,
                area,
            };
        }
    }
    if (best) {
        _lastResolvedScope = { type: 'area', elementId: best.elementId };
        const scoped = (computeScopedEIS({ type: 'area', elementId: best.elementId, modelId }));
        const score = Number.isFinite(scoped.areaEIS) ? scoped.areaEIS : scoped.eis;
        return { text: `EIS Area (${best.name})`, score: toFiniteNumber(score, 0) };
    }
    _lastResolvedScope = { type: 'model', elementId: null };
    const global = (computeSimplifiedEIS(elements, getAllCampaigns()));
    return { text: 'EIS Global (simplified)', score: toFiniteNumber(global.eis, 0) };
}
//# sourceMappingURL=eisTerrainProbe.js.map
//# sourceMappingURL=eisTerrainProbe.js.map
//# sourceMappingURL=eisTerrainProbe.js.map
