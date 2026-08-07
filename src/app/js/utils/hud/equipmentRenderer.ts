// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EQUIPMENT HUD RENDERER - panel and HTML rendering

   Features:
   - Draggable header to reposition the panel
   - Resizable via 8 floating handles (N, S, E, W, NE, NW, SE, SW)
   - Position and size persisted to localStorage
   - Reset button to restore default position/size
   ================================================================ */

import { escapeHtml, escapeAttr, escapeJsAttr } from '../helpers/html.js';
import { getIcon } from '../ui/icons.js';
import { addFloatingResizeHandles } from '../ui/resizeHandles.js';
import {
    getEquipmentHudState,
    getEquipmentFamilies,
    getCurrentFamilyId,
    getElementsForCurrentFamily,
    getActiveElementForCurrentFamily,
    syncFamilyFromSelectedElement,
    getBatchSelection,
} from './equipmentManager.js';
import { getEquipmentThumbUrl, requestEquipmentThumb } from './equipmentThumbs.js';
import { getVariantsFor, MODEL_HOSTING } from '../../config/model-library.js';

let panel: any = null;
let _bound = false;
let _resizeAttached = false;

const STORAGE_KEY = 'ecbyts-equipment-hud-geometry';
const DEFAULT_GEOMETRY = { left: 16, top: 16, width: 260, height: null as number | null };

// Min/max constraints
const CONSTRAINTS = {
    minWidth: 200,
    maxWidth: 400,
    minHeight: 200,
    maxHeight: () => window.innerHeight * 0.8,
};

// ----------------------------------------------------------------
// PERSISTENCE - Load/save position and size
// ----------------------------------------------------------------

function _loadGeometry(): any {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_GEOMETRY, ...parsed };
        }
    } catch (e: any) {
        console.debug('[equipment-renderer] geometry parse:', e?.message || e);
    }
    return { ...DEFAULT_GEOMETRY };
}

function _saveGeometry(geometry: any): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(geometry));
    } catch (e: any) {
        console.debug('[equipment-renderer] geometry save:', e?.message || e);
    }
}

function _clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function _clampPosition(left: number, top: number, width: number, height: number): { left: number; top: number } {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = width || 260;
    const panelHeight = height || 400;
    return {
        left: _clampValue(left, 0, Math.max(0, viewportWidth - panelWidth)),
        top: _clampValue(top, 0, Math.max(0, viewportHeight - panelHeight)),
    };
}

function _applyGeometry(panelEl: any, geometry: any): void {
    if (!panelEl) return;
    const { left, top, width, height } = geometry;
    const { left: clampedLeft, top: clampedTop } = _clampPosition(left, top, width, height);
    panelEl.style.left = `${clampedLeft}px`;
    panelEl.style.top = `${clampedTop}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    if (width) {
        panelEl.style.width = `${_clampValue(width, CONSTRAINTS.minWidth, CONSTRAINTS.maxWidth)}px`;
    }
    if (height) {
        const maxH =
            typeof CONSTRAINTS.maxHeight === 'function' ? CONSTRAINTS.maxHeight() : (CONSTRAINTS.maxHeight as number);
        panelEl.style.height = `${_clampValue(height, CONSTRAINTS.minHeight, maxH)}px`;
    }
}

// ----------------------------------------------------------------
// DRAG - Attach drag behavior to header
// ----------------------------------------------------------------

function _attachEquipmentDrag(headerEl: any, panelEl: any): void {
    if (!headerEl || !panelEl || headerEl._dragAttached) return;
    headerEl._dragAttached = true;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onMove = (e: any) => {
        if (!dragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        const rect = panelEl.getBoundingClientRect();
        const { left: clampedLeft, top: clampedTop } = _clampPosition(newLeft, newTop, rect.width, rect.height);
        panelEl.style.left = `${clampedLeft}px`;
        panelEl.style.top = `${clampedTop}px`;
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        panelEl.classList.remove('equipment-hud-dragging');
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onUp);
        // Save geometry
        const rect = panelEl.getBoundingClientRect();
        _saveGeometry({
            left: parseInt(panelEl.style.left, 10) || rect.left,
            top: parseInt(panelEl.style.top, 10) || rect.top,
            width: rect.width,
            height: rect.height,
        });
    };
    const onTouchMove = (e: any) => {
        if (!dragging || e.touches.length !== 1) return;
        const touch = e.touches[0];
        onMove({ ...e, clientX: touch.clientX, clientY: touch.clientY });
    };
    const onDown = (e: any) => {
        // Only left mouse button or touch
        if (e.button != null && e.button !== 0) return;
        // Don't drag if clicking on buttons
        if (e.target.closest('.equipment-hud-btn')) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panelEl.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        panelEl.classList.add('equipment-hud-dragging');
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onUp);
    };
    headerEl.addEventListener('mousedown', onDown);
    headerEl.addEventListener('touchstart', onDown, { passive: false });
}

// Global handler for reset position
(window as any).handleResetEquipmentHudPosition = function () {
    if (!panel) return;
    _applyGeometry(panel, DEFAULT_GEOMETRY);
    _saveGeometry(DEFAULT_GEOMETRY);
};

function _resolveThumbUrl(element: any): string {
    if (!element?.data) return '';
    const candidates = [
        element.data?.custom3DAsset?.thumbnailUrl,
        element.data?.custom3DAsset?.previewUrl,
        element.data?.preview3D,
        element.data?.thumb3D,
        element.data?.overlayUrl,
    ];
    for (const url of candidates) {
        if (typeof url === 'string' && url.trim()) return url.trim();
    }
    const generated = getEquipmentThumbUrl(element.id);
    if (generated) return generated;
    requestEquipmentThumb(element, () => renderEquipmentHud());
    return '';
}

function _renderThumbButton(element: any, activeId: any): string {
    const thumbUrl = _resolveThumbUrl(element);
    const activeCls = element.id === activeId ? ' is-active' : '';
    const rawName = String(element.name || element.id || 'Element');
    const safeId = escapeJsAttr(element.id);
    if (thumbUrl) {
        return `<button type="button" class="equipment-thumb${activeCls}"
                    title="${escapeAttr(rawName)}"
                    data-cc-call-click="handleEquipmentOpenElementById|s:${encodeURIComponent(`${safeId}`)}">
                <img src="${escapeAttr(thumbUrl)}" alt="${escapeAttr(rawName)}">
            </button>`;
    }
    return `<button type="button" class="equipment-thumb equipment-thumb-fallback${activeCls}"
                title="${escapeAttr(rawName)}"
                data-cc-call-click="handleEquipmentOpenElementById|s:${encodeURIComponent(`${safeId}`)}">
            <span>3D</span>
        </button>`;
}

/**
 * Renderiza seção "Biblioteca ecbyts" do Equipment HUD - lista variants de
 * modelos 3D curados (app/js/config/model-library.js) filtrados pela família
 * ativa. Suporta toggle HQ (mostra/oculta variants isHq opt-in) e grava
 * element.data.modelVariantId na seleção.
 */
function _renderModelLibrarySection(familyId: any, active: any): string {
    if (!familyId) return '';
    const variants = getVariantsFor(familyId);
    if (!variants.length) return '';
    let hqEnabled = false;
    try {
        hqEnabled = localStorage.getItem('ecbyts-equipment-hq-enabled') === '1';
    } catch (e: any) {
        console.debug('[equipment-renderer] hq flag read:', e?.message || e);
    }
    const visible = hqEnabled ? variants : variants.filter((v: any) => !v.isHq);
    const selected = active?.data?.modelVariantId || '';
    // Biblioteca funciona sempre que a família tem variants, mesmo sem elemento ativo
    // (click aplica ao primeiro da família via fallback no handler).
    const disabled = '';
    const hasHq = variants.some((v: any) => v.isHq);
    return `
        <div class="equipment-library">
            <div class="equipment-library-header">
                <span class="equipment-library-title">Biblioteca ecbyts</span>
                ${
                    hasHq
                        ? `<label class="equipment-check equipment-library-hq" title="Mostrar variantes HQ (texturas 2K, lazy load Supabase)">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:equipmentRenderer:input:L271" type="checkbox" ${hqEnabled ? 'checked' : ''} ${disabled}
                                   data-cc-change="cc-8c86efe0">
                            HQ
                        </label>`
                        : ''
                }
            </div>
            <div class="equipment-library-strip">
                ${visible
                    .map((v: any) => {
                        const isSel = v.slug === selected ? ' is-active' : '';
                        const hqBadge = v.isHq ? '<span class="equipment-library-hq-badge">HQ</span>' : '';
                        const thumb = `${MODEL_HOSTING.thumbsBase}/${v.slug}.png`;
                        // Label humana: variantes HQ recebem "Texturizado";
                        // não-HQ com sufixo 'default' ou vazio recebem "Padrão";
                        // outros recebem o sufixo capitalizado.
                        const suffix = v.slug.replace(/^[a-z]+_/, '').replace(/_/g, ' ');
                        let label;
                        if (v.isHq) label = 'Texturizado';
                        else if (suffix === 'default' || !suffix) label = 'Padrão';
                        else label = suffix.charAt(0).toUpperCase() + suffix.slice(1);
                        return `<button type="button" class="equipment-thumb equipment-library-thumb${isSel}"
                                    title="${escapeAttr(v.labelKey)} · ${escapeAttr(v.license)}"
                                    data-cc-call-click="handleEquipmentSetModelVariant|s:${encodeURIComponent(`${escapeJsAttr(v.slug)}`)}" ${disabled}>
                                <img src="${escapeAttr(thumb)}" alt="${escapeAttr(v.labelKey)}"
                                     data-cc-call-error="__ccHide|t">
                                <span class="equipment-library-label">${escapeHtml(label)}</span>
                                ${hqBadge}
                            </button>`;
                    })
                    .join('')}
            </div>
            <div class="equipment-library-meta">
                ${
                    selected
                        ? `&#10003; aplicado: ${escapeHtml(selected)}`
                        : `Click aplica a toda família · ${visible.length} variantes · CC BY 4.0`
                }
            </div>
        </div>
    `;
}

export function initEquipmentHudPanel(): void {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'equipment-hud-panel';
    panel.className = 'equipment-hud-panel';
    const container = document.getElementById('canvas-container') || document.getElementById('main-area');
    if (container) container.appendChild(panel);
    // Apply saved geometry (position and size)
    const geometry = _loadGeometry();
    _applyGeometry(panel, geometry);
    if (!_bound) {
        window.addEventListener('ecbt:elementSelected', () => {
            syncFamilyFromSelectedElement();
            renderEquipmentHud();
        });
        _bound = true;
    }
}

export function renderEquipmentHud(): void {
    if (!panel) return;
    const cfg: any = getEquipmentHudState();
    panel.style.display = cfg.visible ? '' : 'none';
    const sceneBtn = document.getElementById('equipment-toggle-btn');
    if (sceneBtn) sceneBtn.classList.toggle('active', cfg.visible);
    if (!cfg.visible) return;
    const families: any[] = getEquipmentFamilies();
    const familyId = getCurrentFamilyId();
    const family = families.find((f: any) => f.id === familyId) || null;
    const familyElements: any[] = getElementsForCurrentFamily();
    const active: any = getActiveElementForCurrentFamily();
    const selectedSet = new Set(getBatchSelection());
    const activeSelected = active ? selectedSet.has(active.id) : false;
    const activeScale = Number(active?.data?.scale?.x || 1);
    panel.innerHTML = `
        <div class="equipment-hud-header" title="Drag to move">
            <span class="equipment-hud-title">${getIcon('layers', { size: '13px' })} Equipment</span>
            <div class="equipment-hud-header-actions">
                <button type="button" class="equipment-hud-btn" data-cc-action="cc-ad819cdf" title="Reset position">
                    ${getIcon('rotate-ccw', { size: '12px' })}
                </button>
                <button type="button" class="equipment-hud-btn" data-cc-action="cc-26956925" title="Close">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>
        </div>
        <div class="equipment-hud-body">
            ${
                !families.length
                    ? `<div class="equipment-hud-empty">No elements available.</div>`
                    : `
                    <div class="equipment-row">
                        <button type="button" class="equipment-hud-btn" data-cc-action="cc-73d52aac" title="Prev Family">&#9664;</button>
                        <span class="equipment-pill">${escapeHtml(family?.label || familyId || 'Family')} (${family?.count || 0})</span>
                        <button type="button" class="equipment-hud-btn" data-cc-action="cc-5e04e941" title="Next Family">&#9654;</button>
                    </div>
                    <div class="equipment-row">
                        <button type="button" class="equipment-hud-btn" data-cc-action="cc-ec2a2b0a" title="Prev Element">&#9664;</button>
                        <span class="equipment-active-name">${escapeHtml(active?.name || 'No active element')}</span>
                        <button type="button" class="equipment-hud-btn" data-cc-action="cc-5d402193" title="Next Element">&#9654;</button>
                    </div>
                    <div class="equipment-preview-wrap">
                        ${
                            active
                                ? _renderThumbButton(active, active.id).replace(
                                      'class="equipment-thumb',
                                      'class="equipment-thumb equipment-thumb-main',
                                  )
                                : `<button type="button" class="equipment-thumb equipment-thumb-main equipment-thumb-fallback" disabled><span>3D</span></button>`
                        }
                        <button type="button" class="equipment-open-btn" data-cc-action="cc-9b5d94fa" ${active ? '' : 'disabled'}>
                            Open in Elements + Zoom
                        </button>
                    </div>
                    <div class="equipment-thumb-strip">
                        ${familyElements.map((el: any) => _renderThumbButton(el, active?.id || '')).join('')}
                    </div>
                    <div class="equipment-active-meta">
                        ${escapeHtml(active?.id || '—')} · ${familyElements.length} in family
                    </div>
                    ${_renderModelLibrarySection(familyId, active)}
                    <div class="equipment-actions">
                        <button type="button" class="equipment-action" data-cc-action="cc-a93bdf74" ${active ? '' : 'disabled'}>Select</button>
                        <button type="button" class="equipment-action ${activeSelected ? 'active' : ''}" data-cc-action="cc-f36a3072" ${active ? '' : 'disabled'}>
                            ${activeSelected ? 'Unmark' : 'Mark'}
                        </button>
                        <button type="button" class="equipment-action" data-cc-action="cc-b9091082" ${familyId ? '' : 'disabled'}>Filter Table</button>
                    </div>
                    <div class="equipment-stats">
                        Multi-selected: ${selectedSet.size}
                    </div>
                    <div class="equipment-visual">
                        <label class="equipment-label" for="equipment-color-input">Color</label>
                        <input id="equipment-color-input" type="color" value="${escapeHtml(active?.color || '#3b6bff')}"
                               data-cc-change="cc-beb61428" ${active ? '' : 'disabled'}>
                        <label class="equipment-label" for="equipment-scale-input">Scale</label>
                        <input data-field-meta="true" data-field-meta-key="auto:equipment-scale-input" id="equipment-scale-input" type="range" min="0.4" max="2.5" step="0.1" value="${Number.isFinite(activeScale) ? activeScale : 1}"
                               data-cc-input="cc-bbac7c0b" ${active ? '' : 'disabled'}>
                        <label class="equipment-check">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:equipmentRenderer:input:L345" type="checkbox" data-cc-change="cc-2487c8e5" ${active?.data?._equipmentWireframe ? 'checked' : ''} ${active ? '' : 'disabled'}>
                            wireframe
                        </label>
                    </div>
                    <div class="equipment-upload">
                        <label class="equipment-upload-label">
                            Attach OBJ/GLB (custom)
                            <input type="file" id="equipment-asset-input" accept=".obj,.glb,.gltf,.zip" data-cc-change="cc-8af5696b" ${active ? '' : 'disabled'}>
                        </label>
                        <div class="equipment-upload-note">${escapeHtml(active?.data?.custom3DAsset?.name || 'No custom asset')}</div>
                    </div>
                `
            }
        </div>
    `;
    // Setup drag and resize after rendering
    _setupDragAndResize();
    _guardPanelEvents();
}

/**
 * Impede que clicks/mousedown dentro do Equipment HUD vazem para o canvas 3D
 * (OrbitControls, picker raycaster, boundary select). Sem isso, clicar num
 * thumb/botão do HUD é interpretado como clicar em um elemento da cena.
 */
function _guardPanelEvents(): void {
    if (!panel || panel._eventsGuarded) return;
    panel._eventsGuarded = true;
    const stop = (e: Event) => e.stopPropagation();
    for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'wheel']) {
        panel.addEventListener(ev, stop);
    }
}

function _setupDragAndResize(): void {
    if (!panel) return;
    // Attach drag to header
    const header = panel.querySelector('.equipment-hud-header');
    if (header) {
        _attachEquipmentDrag(header, panel);
    }
    // Attach resize handles (only once)
    if (!_resizeAttached) {
        addFloatingResizeHandles(
            panel,
            {
                minWidth: CONSTRAINTS.minWidth,
                maxWidth: CONSTRAINTS.maxWidth,
                minHeight: CONSTRAINTS.minHeight,
                maxHeight: CONSTRAINTS.maxHeight(),
                onResize: () => {
                    // Update max-height to allow scrolling if needed
                    panel.style.maxHeight = 'none';
                },
                onEnd: (size: any) => {
                    const { width, height } = size;
                    // Save new size
                    const rect = panel.getBoundingClientRect();
                    const geometry = {
                        left: parseInt(panel.style.left, 10) || rect.left,
                        top: parseInt(panel.style.top, 10) || rect.top,
                        width,
                        height,
                    };
                    _saveGeometry(geometry);
                },
            } as any,
        );
        _resizeAttached = true;
    }
}
