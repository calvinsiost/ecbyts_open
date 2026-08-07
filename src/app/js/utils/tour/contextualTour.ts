// @ts-check
// Generated from src/app/js/utils/tour/contextualTour.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CONTEXTUAL TOUR — Right-click module-aware tour suggestions
   Tour contextual: detecta modulo ativo e sugere tours relevantes

   Detecta qual modulo esta ativo (elementos, campanhas, interpolacao,
   etc.) e mapeia para os tours existentes da categoria correspondente.
   Integra com o globalContextMenu para oferecer "Tours para este modulo"
   no menu de botao direito.
   ================================================================ */
import { getToursByCategory } from './categories.js';
import { t } from '../i18n/translations.js';
// ----------------------------------------------------------------
// MODULE-TO-CATEGORY MAPPING
// Mapeia chaves de modulo para categoryIds do registro de tours
// ----------------------------------------------------------------
const MODULE_CATEGORY_MAP = {
    elements: 'element-management',
    campaigns: 'campaign-management',
    interpolation: 'spatial-interpolation',
    scene: 'scene-camera',
    import: 'import-export',
    report: 'analysis-modeling',
    analytics: 'analysis-modeling',
    fielddata: 'field-data',
    workflows: 'environmental-workflows',
    ai: 'ai-neural',
    home: 'advanced-features',
    settings: 'advanced-features',
};
/** All valid module keys for external validation */
export const VALID_MODULE_KEYS = Object.keys(MODULE_CATEGORY_MAP);
// ----------------------------------------------------------------
// MODULE DETECTION
// ----------------------------------------------------------------
/**
 * Detect which module is currently active based on UI state.
 * Examina paineis abertos, view mode, modais visiveis, e aba ativa
 * para determinar o contexto do usuario.
 * @returns {string} Module key (e.g. 'elements', 'campaigns', 'home')
 */
export function detectActiveModule() {
    // 1. Check for open modals - most specific context
    const modal = _detectActiveModal();
    if (modal) return modal;
    // 2. Check active right-panel tab
    const tab = _detectActiveTab();
    if (tab) return tab;
    // 3. Check view mode
    const view = _detectViewMode();
    if (view) return view;
    return 'home';
}
/**
 * Get relevant tours for a given module key.
 * Busca tours registrados na categoria mapeada para o modulo.
 * @param {string} moduleKey - One of VALID_MODULE_KEYS
 * @returns {Array<Object>} Tour definition objects (may be empty)
 */
export function getToursForModule( moduleKey: any) {
    const categoryId = (MODULE_CATEGORY_MAP as any)[moduleKey];
    if (!categoryId) return [];
    return getToursByCategory(categoryId) as any[];
}
/**
 * Show contextual tour popup at the given coordinates.
 * Exibe mini-menu com tours disponiveis para o modulo detectado.
 * @param {number} x - clientX position
 * @param {number} y - clientY position
 * @param {string} moduleKey - Detected module key
 * @returns {HTMLElement|null} The popup element, or null if no tours
 */
export function showContextualTourMenu( x: any, y: any, moduleKey: any) {
    _closeContextualMenu();
    const tours = getToursForModule(moduleKey);
    if (!tours.length) {
        window.showToast?.(t('contextualTour.noTours') || 'No tours available for this module', 'info');
        return null;
    }
    const popup = _buildPopup(tours, moduleKey);
    document.body.appendChild(popup);
    // Clamp to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = popup.offsetWidth || 220;
    const h = popup.offsetHeight || 100;
    popup.style.left = `${Math.max(4, Math.min(x, vw - w - 4))}px`;
    popup.style.top = `${Math.max(4, Math.min(y, vh - h - 4))}px`;
    // Close on outside click
    document.addEventListener('mousedown', _onOutsideClick, { once: true });
    return popup;
}
// ----------------------------------------------------------------
// INTERNAL - Modal detection
// ----------------------------------------------------------------
/** @type {HTMLElement|null} */
let _popupEl: any = null;
/**
 * Detect module from currently visible modal.
 * @returns {string|null}
 */
function _detectActiveModal() {
    if (typeof document === 'undefined') return null;
    const modalMap = [
        ['#interpolation-modal', 'interpolation'],
        ['#report-modal', 'report'],
        ['#import-modal', 'import'],
        ['#export-modal', 'import'],
        ['#analytics-modal', 'analytics'],
        ['#nn-side-panel', 'ai'],
        ['#settings-modal', 'settings'],
        ['#simulation-lab-modal', 'workflows'],
    ];
    for (const [sel, key] of modalMap) {
        const el = document.querySelector(sel as any) as HTMLElement|null;
        if (el && !el.hidden && el.offsetParent !== null) return key;
    }
    return null;
}
/**
 * Detect module from active right-panel tab.
 * @returns {string|null}
 */
function _detectActiveTab() {
    if (typeof document === 'undefined') return null;
    const activeTab = (document.querySelector('#right-tabs .tab.active')) as HTMLElement|null;
    if (!activeTab) return null;
    const tabId = activeTab.dataset.tab || '';
    const tabMap: any = {
        elements: 'elements',
        sensors: 'fielddata',
        project: 'campaigns',
        areas: 'campaigns',
        scenes: 'scene',
    };
    return tabMap[tabId] || null;
}
/**
 * Detect module from current view mode.
 * @returns {string|null}
 */
function _detectViewMode() {
    if (typeof localStorage === 'undefined') return null;
    const view = localStorage.getItem('ecbyts-default-view') || '';
    if (view === 'actions' || view === 'home') return 'home';
    if (view === '3d' || view === '2d') return 'scene';
    return null;
}
// ----------------------------------------------------------------
// INTERNAL - Popup build & lifecycle
// ----------------------------------------------------------------
/**
 * Build the contextual tour popup element.
 * @param {Array<Object>} tours
 * @param {string} _moduleKey
 * @returns {HTMLElement}
 */
function _buildPopup( tours: any, _moduleKey: any) {
    const container = document.createElement('div');
    container.id = 'contextual-tour-popup';
    container.className = 'panel-context-menu visible';
    container.style.minWidth = '200px';
    // Title
    const title = document.createElement('div');
    title.className = 'panel-context-menu-item';
    title.style.fontWeight = '600';
    title.style.cursor = 'default';
    title.style.opacity = '0.7';
    title.style.fontSize = '11px';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '0.05em';
    title.textContent = t('contextualTour.helpTitle') || 'Tours for this module';
    container.appendChild(title);
    // Tour items (max 8 to avoid oversized menu)
    const maxItems = Math.min(tours.length, 8);
    for (let i = 0; i < maxItems; i++) {
        const tour = (tours[i]) as any;
        const btn = document.createElement('button');
        btn.className = 'panel-context-menu-item';
        btn.dataset.tourId = tour.id;
        btn.textContent = t(tour.nameKey) || tour.id;
        btn.addEventListener('click', () => {
            _closeContextualMenu();
            window.handleStartGuidedTour?.(tour.id);
        });
        container.appendChild(btn);
    }
    _popupEl = container;
    return container;
}
/**
 * Close and remove the contextual tour popup if open.
 */
function _closeContextualMenu() {
    if (_popupEl) {
        _popupEl.remove();
        _popupEl = null;
    }
}
/**
 * Handle click outside the popup to close it.
 * @param {MouseEvent} e
 */
function _onOutsideClick( e: any) {
    if (!_popupEl?.contains(/** @type {Node} */ (e.target))) {
        _closeContextualMenu();
    }
}
