// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   QUICK ACTIONS — Lightbulb indicator for library suggestions
   Indicador de acoes rapidas no titlebar

   Mostra bibliotecas disponiveis para download/compra num popup
   acessivel pelo icone de lampada no canto superior esquerdo.
   Filtra imagery por sobreposicao geografica com o modelo atual.
   Limita popup a 5 items, priorizando relevancia.
   ================================================================ */
import { getMarketplaceCatalogOffline, getMarketplaceCatalog } from '../libraries/marketplace.js';
import { getInstalledLibraries } from '../libraries/manager.js';
import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('QuickActions');
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let _isOpen = false;
/** @type {any[]|null} */
let _cachedCatalog: any[] | null = null;
/** @type {HTMLElement|null} */
let _wrapperEl: HTMLElement | null = null;
/** @type {HTMLElement|null} */
let _btnEl: HTMLElement | null = null;
/** @type {HTMLElement|null} */
let _badgeEl: HTMLElement | null = null;
/** @type {HTMLElement|null} */
let _popupEl: HTMLElement | null = null;
// ----------------------------------------------------------------
// MAX ITEMS shown in the popup (aperitivo, nao catalogo inteiro)
// ----------------------------------------------------------------
const MAX_POPUP_ITEMS = 5;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize the Quick Actions lightbulb.
 * Configura listeners e carrega catalogo async.
 * Deve ser chamado apos initLibraries() em main.js.
 */
export function initQuickActions() {
    _wrapperEl = document.getElementById('quick-actions-wrapper');
    _btnEl = document.getElementById('quick-actions-btn');
    _badgeEl = document.getElementById('quick-actions-badge');
    _popupEl = document.getElementById('quick-actions-popup');
    if (!_wrapperEl || !_btnEl || !_popupEl)
        return;
    // Click-outside fecha o popup (singleton, nao leaka)
    document.addEventListener('click', (e) => {
        if (_isOpen && _wrapperEl && !_wrapperEl.contains(e.target as Node | null)) {
            _closePopup();
        }
    });
    // Escape fecha o popup
    document.addEventListener('keydown', (e) => {
        if (_isOpen && e.key === 'Escape') {
            _closePopup();
            if (_btnEl)
                _btnEl.focus();
        }
    });
    // Atualiza quando bibliotecas mudam
    window.addEventListener('librariesChanged', () => {
        updateQuickActionsBadge();
        if (_isOpen)
            _renderPopup();
    });
    // Badge inicial (sync, imediato)
    updateQuickActionsBadge();
    // Busca catalogo completo async (Supabase + builtins)
    _fetchAsyncCatalog();
}
// ----------------------------------------------------------------
// TOGGLE
// ----------------------------------------------------------------
/**
 * Toggle the Quick Actions popup (click handler).
 * Abre ou fecha o popup de acoes rapidas.
 */
function handleToggleQuickActions() {
    if (_isOpen) {
        _closePopup();
    }
    else {
        _openPopup();
    }
}
// ----------------------------------------------------------------
// BADGE
// ----------------------------------------------------------------
/**
 * Update the badge count and lightbulb active state.
 * Recalcula quantas bibliotecas estao disponiveis.
 */
export function updateQuickActionsBadge() {
    const available = _computeAvailable();
    const count = available.length;
    if (!_badgeEl || !_btnEl)
        return;
    if (count > 0) {
        _badgeEl.textContent = count > 9 ? '9+' : String(count);
        _badgeEl.style.display = '';
        _btnEl.classList.add('active');
    }
    else {
        _badgeEl.style.display = 'none';
        _btnEl.classList.remove('active');
    }
}
// ----------------------------------------------------------------
// POPUP OPEN / CLOSE
// ----------------------------------------------------------------
function _openPopup() {
    if (!_popupEl || !_btnEl)
        return;
    _renderPopup();
    _popupEl.classList.add('open');
    _btnEl.setAttribute('aria-expanded', 'true');
    _isOpen = true;
}
function _closePopup() {
    if (!_popupEl || !_btnEl)
        return;
    _popupEl.classList.remove('open');
    _btnEl.setAttribute('aria-expanded', 'false');
    _isOpen = false;
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * Render the popup content.
 * Lista flat de ate MAX_POPUP_ITEMS bibliotecas disponiveis,
 * priorizando imagery com overlap geografico.
 */
function _renderPopup() {
    if (!_popupEl)
        return;
    const available = _computeAvailable();
    const items = _prioritize(available).slice(0, MAX_POPUP_ITEMS);
    // Build HTML with static template; user data via textContent below
    let html = `<div class="quick-actions-header">${_escapeTag(t('quickActionsTitle') || 'Quick Actions')}</div>`;
    if (items.length === 0) {
        html += `<div class="quick-actions-empty">${_escapeTag(t('quickActionsAllInstalled') || 'All available installed')}</div>`;
    }
    else {
        html += '<div class="quick-actions-list">';
        items.forEach((lib: any, i: number) => {
            html += `<button class="quick-actions-item" data-lib-index="${i}" type="button">
                <span class="quick-actions-item-icon">${getIcon(lib.icon || 'package', { size: '18px' })}</span>
                <span class="quick-actions-item-text">
                    <span class="quick-actions-item-name"></span>
                    <span class="quick-actions-item-desc"></span>
                </span>
            </button>`;
        });
        html += '</div>';
    }
    html += '<div class="quick-actions-divider"></div>';
    html += `<div class="quick-actions-footer">
        <a data-cc-action="cc-7da41e35" role="button">${_escapeTag(t('quickActionsBrowseAll') || 'Browse all libraries')}</a>
    </div>`;
    _popupEl.innerHTML = html;
    // Set user-generated text via textContent (XSS-safe)
    const itemEls = _popupEl.querySelectorAll('.quick-actions-item');
    itemEls.forEach((el: Element, i: number) => {
        const lib = items[i];
        const nameEl = el.querySelector('.quick-actions-item-name');
        const descEl = el.querySelector('.quick-actions-item-desc');
        if (nameEl)
            nameEl.textContent = lib.name || lib.id;
        if (descEl)
            descEl.textContent = _truncate(lib.description || '', 65);
        el.addEventListener('click', () => {
            _closePopup();
            if (typeof window.handleOpenMarketplace === 'function') {
                window.handleOpenMarketplace();
            }
        });
    });
}
// ----------------------------------------------------------------
// COMPUTE AVAILABLE LIBRARIES
// ----------------------------------------------------------------
/**
 * Get libraries that are not yet installed.
 * Usa cached catalog se disponivel, senao offline (builtins).
 *
 * @returns {any[]} Bibliotecas nao instaladas
 */
function _computeAvailable() {
    const source = _cachedCatalog || getMarketplaceCatalogOffline();
    const installedIds = new Set(getInstalledLibraries().map((l: any) => l.manifest.id));
    return source.filter((lib: any) => {
        const id = lib.id || lib.library_id;
        return !installedIds.has(id);
    });
}
// ----------------------------------------------------------------
// PRIORITIZATION
// Imagery com overlap geografico primeiro, depois o resto
// ----------------------------------------------------------------
/**
 * Prioritize libraries: geo-relevant imagery first, then others.
 * @param {any[]} libs - Available libraries
 * @returns {any[]} Sorted copy
 */
function _prioritize(libs: any[]) {
    const modelBbox = _getModelBbox();
    return [...libs].sort((a: any, b: any) => {
        const aGeo = _hasGeoOverlap(a, modelBbox);
        const bGeo = _hasGeoOverlap(b, modelBbox);
        if (aGeo && !bGeo)
            return -1;
        if (!aGeo && bGeo)
            return 1;
        return 0;
    });
}
/**
 * Check if a library has imagery that overlaps with the model bbox.
 * @param {any} lib - Library manifest
 * @param {{south:number,west:number,north:number,east:number}|null} modelBbox
 * @returns {boolean}
 */
function _hasGeoOverlap(lib: any, modelBbox: { south: number; west: number; north: number; east: number } | null) {
    if (!modelBbox)
        return false;
    const imagery = lib.contents?.imagery;
    if (!Array.isArray(imagery))
        return false;
    return imagery.some((/** @type {any} */ img) => {
        if (!Array.isArray(img.bbox) || img.bbox.length !== 4)
            return false;
        const [south, west, north, east] = img.bbox;
        return _bboxOverlap(modelBbox, { south, west, north, east });
    });
}
/**
 * Simple 2D bounding box overlap check (WGS84).
 * @param {{south:number,west:number,north:number,east:number}} a
 * @param {{south:number,west:number,north:number,east:number}} b
 * @returns {boolean}
 */
function _bboxOverlap(
    a: { south: number; west: number; north: number; east: number },
    b: { south: number; west: number; north: number; east: number },
) {
    return a.south < b.north && a.north > b.south && a.west < b.east && a.east > b.west;
}
/**
 * Get the model's geographic bounding box from the UTM origin.
 * Uses coordinates module if available; returns null if not georeferenced.
 *
 * @returns {{ south: number, west: number, north: number, east: number }|null}
 */
function _getModelBbox() {
    try {
        // Dynamic import check - coordinates module may not be loaded
        const coordModule = window._ecbytsCoordModule;
        if (!coordModule || !coordModule.hasOrigin())
            return null;
        const origin = coordModule.getOrigin();
        const toWGS = coordModule.utmToWGS84;
        // Estimate model extent: +/- 2km from origin (reasonable default)
        const EXTENT = 2000; // meters
        const sw = toWGS({
            easting: origin.easting - EXTENT,
            northing: origin.northing - EXTENT,
            zone: origin.zone,
            hemisphere: origin.hemisphere,
        });
        const ne = toWGS({
            easting: origin.easting + EXTENT,
            northing: origin.northing + EXTENT,
            zone: origin.zone,
            hemisphere: origin.hemisphere,
        });
        return {
            south: sw.latitude,
            west: sw.longitude,
            north: ne.latitude,
            east: ne.longitude,
        };
    }
    catch (err: any) {
        log.debug('Model bounding box computation ignored', err?.message);
        return null;
    }
}
// ----------------------------------------------------------------
// ASYNC CATALOG FETCH
// ----------------------------------------------------------------
async function _fetchAsyncCatalog() {
    try {
        const result = await getMarketplaceCatalog();
        if (result && result.items) {
            _cachedCatalog = result.items;
            updateQuickActionsBadge();
        }
    }
    catch (err: any) {
        log.debug('Catalog fetch failed, using offline fallback', err?.message);
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Truncate string to maxLen, adding ellipsis if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function _truncate(str: string, maxLen: number) {
    if (str.length <= maxLen)
        return str;
    return str.slice(0, maxLen - 1) + '\u2026';
}
/**
 * Minimal HTML entity escape for static i18n strings.
 * @param {string} str
 * @returns {string}
 */
function _escapeTag(str: string) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const quickActionHandlers = {
    handleToggleQuickActions,
};
//# sourceMappingURL=quickActions.js.map
