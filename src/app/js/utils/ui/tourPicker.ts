// @ts-check
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
   GUIDED TOUR PICKER — 2-level category/tour selection UI
   Interface de selecao de tours guiados com categorias e busca

   Nivel 1: grade de 10 categorias com progresso
   Nivel 2: lista de tours dentro de cada categoria
   Busca global por nome/descricao

   Acessibilidade: role=dialog, aria-modal, aria-live,
   focus management, Escape handler, 44px touch targets
   ================================================================ */
import { getIcon } from './icons.js';
import { t } from '../i18n/translations.js';
import { TOUR_CATEGORIES, getCategoriesWithStats, getToursByCategory, searchTours, getTourCount, } from '../tour/categories.js';
import { getGuidedTourState } from '../tour/engine.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const VIEW = { CATEGORIES: 'categories', TOURS: 'tours', SEARCH: 'search' };
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _currentView = VIEW.CATEGORIES;
let _currentCategoryId: string | null = null;
let _escHandler: ((e: KeyboardEvent) => void) | null = null;
let _triggerElement: HTMLElement | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Show the guided tour picker modal.
 * Exibe o seletor de tours com foco no campo de busca.
 */
export function showGuidedTourPicker() {
    _triggerElement = document.activeElement as HTMLElement | null;
    let panel = document.getElementById('guided-tour-picker');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'guided-tour-picker';
        panel.className = 'guided-tour-picker';
        document.body.appendChild(panel);
    }
    _currentView = VIEW.CATEGORIES;
    _currentCategoryId = null;
    _render(panel);
    panel.style.display = 'flex';
    // Focus search input for keyboard users
    requestAnimationFrame(() => {
        (panel.querySelector('.gtp-search-input') as HTMLInputElement | null)?.focus();
    });
    // Escape key closes picker
    _escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape')
            hideGuidedTourPicker();
    };
    document.addEventListener('keydown', _escHandler);
    // Hide onboarding chapter picker if visible
    const chapterPanel = document.getElementById('tour-chapters');
    if (chapterPanel)
        chapterPanel.style.display = 'none';
}
/**
 * Hide the guided tour picker.
 * Restaura foco ao elemento que abriu o picker.
 */
export function hideGuidedTourPicker() {
    const panel = document.getElementById('guided-tour-picker');
    if (panel)
        panel.style.display = 'none';
    // Cleanup Escape listener
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
    // Return focus to trigger element
    if (_triggerElement && typeof _triggerElement.focus === 'function') {
        _triggerElement.focus();
        _triggerElement = null;
    }
}
/**
 * Navigate to tours within a category.
 * @param {string} categoryId
 */
export function selectCategory(categoryId: string) {
    _currentView = VIEW.TOURS;
    _currentCategoryId = categoryId;
    const panel = document.getElementById('guided-tour-picker');
    if (panel)
        _render(panel);
}
/**
 * Go back to category view.
 */
export function backToCategories() {
    _currentView = VIEW.CATEGORIES;
    _currentCategoryId = null;
    const panel = document.getElementById('guided-tour-picker');
    if (panel)
        _render(panel);
}
/**
 * Filter tours by search query (debounced).
 * @param {string} query
 */
export function filterTours(query: string) {
    if (_debounceTimer)
        clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        _currentView = query.length >= 2 ? VIEW.SEARCH : VIEW.CATEGORIES;
        const panel = document.getElementById('guided-tour-picker');
        if (panel) {
            // Preserve search input value and cursor
            const input = panel.querySelector('.gtp-search-input') as HTMLInputElement | null;
            const cursorPos = input?.selectionStart;
            _render(panel, query);
            const newInput = panel.querySelector('.gtp-search-input') as HTMLInputElement | null;
            if (newInput && cursorPos != null) {
                newInput.focus();
                newInput.setSelectionRange(cursorPos, cursorPos);
            }
        }
    }, 150);
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * @param {any} panel
 * @param {string} [searchValue]
 */
function _render(panel: HTMLElement, searchValue = '') {
    const guided = /** @type {any} */ (getGuidedTourState());
    const totalCount = getTourCount();
    // Cap completedCount to prevent "6/5 completed" if tours removed
    const completedCount = Math.min(guided.totalCompleted || 0, totalCount);
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const query = searchValue ?? '';
    const html = `
        <div class="gtp-overlay" data-action="close" aria-hidden="true"></div>
        <div class="gtp-modal" role="dialog" aria-modal="true" aria-labelledby="gtp-title">
            <div class="gtp-header">
                ${_currentView !== VIEW.CATEGORIES
        ? `
                    <button class="gtp-back" data-action="back" aria-label="Back to categories">
                        ${_icon('arrow-left')}
                    </button>
                `
        : ''}
                <div class="gtp-header-text">
                    <h3 id="gtp-title">${_t('guidedToursTitle', 'Guided Tours')}</h3>
                    <span class="gtp-progress-label">${completedCount}/${totalCount} ${_t('tourCompleted', 'completed')}</span>
                </div>
                <button class="gtp-close" data-action="close" aria-label="Close">
                    ${_icon('x')}
                </button>
            </div>

            <div class="gtp-progress-bar" role="progressbar"
                 aria-valuenow="${completedCount}" aria-valuemin="0" aria-valuemax="${totalCount}"
                 aria-label="Tour completion progress">
                <div class="gtp-progress-fill" style="width: ${pct}%"></div>
            </div>

            <div class="gtp-search">
                <span class="gtp-search-icon">${_icon('search')}</span>
                <input type="text"
                       class="gtp-search-input"
                       aria-label="Search guided tours"
                       placeholder="${_t('guidedToursSearch', 'Search tours...')}"
                       value="${_escapeAttr(query)}"
                       maxlength="100"
                       data-action="search" />
            </div>

            <div class="gtp-body" aria-live="polite">
                ${_renderBody(guided, query)}
            </div>
        </div>
    `;
    panel.innerHTML = html;
    _attachListeners(panel);
}
/**
 * Attach event delegation on picker panel.
 * Um unico listener para clicks e input - sem onclick inline.
 */
/** @param {any} panel */
function _attachListeners(panel: any) {
    panel.addEventListener('click', (e: any) => {
        const btn = e.target.closest('[data-action]');
        if (!btn)
            return;
        const action = btn.dataset.action || '';
        if (action === 'close')
            hideGuidedTourPicker();
        else if (action === 'back')
            backToCategories();
        else if (action === 'select-category')
            selectCategory(btn.dataset.catId);
        else if (action === 'start-tour') {
            hideGuidedTourPicker();
            /** @type {any} */ (window).handleStartGuidedTour?.(btn.dataset.tourId);
        }
    });
    const input = panel.querySelector('.gtp-search-input');
    if (input) {
        input.addEventListener('input', (e: any) => filterTours(e.target.value));
    }
}
/**
 * @param {any} guided
 * @param {string} query
 */
function _renderBody(guided: any, query: any) {
    if (_currentView === VIEW.SEARCH && query.length >= 2) {
        return _renderSearchResults(guided, query);
    }
    if (_currentView === VIEW.TOURS && _currentCategoryId) {
        return _renderTourList(guided);
    }
    return _renderCategories(guided);
}
/** @param {any} guided */
function _renderCategories(guided: any) {
    const cats = getCategoriesWithStats(guided) as any[];
    const visibleCats = cats.filter((c: any) => c.tourCount > 0);
    if (visibleCats.length === 0) {
        return `<div class="gtp-empty" role="status">${_t('guidedToursNoResults', 'No tours available')}</div>`;
    }
    let html = '<div class="gtp-categories">';
    for (const cat of visibleCats) {
        html += `
            <button class="gtp-category-card" data-action="select-category" data-cat-id="${_escapeAttr(cat.id)}">
                <span class="gtp-cat-icon" style="background: ${cat.color}15; color: ${cat.color}">
                    ${_icon(cat.icon)}
                </span>
                <span class="gtp-cat-info">
                    <span class="gtp-cat-name">${_t(cat.nameKey, cat.id)}</span>
                    <span class="gtp-cat-desc">${_t(cat.descKey, '')}</span>
                </span>
                <span class="gtp-cat-stats">
                    <span class="gtp-cat-count">${cat.completedCount}/${cat.tourCount}</span>
                    <span class="gtp-cat-bar">
                        <span class="gtp-cat-bar-fill" style="width: ${cat.progress}%; background: ${cat.color}"></span>
                    </span>
                </span>
            </button>
        `;
    }
    html += '</div>';
    return html;
}
/** @param {any} guided */
function _renderTourList(guided: any) {
    const cat = /** @type {any} */ (TOUR_CATEGORIES.find((c: any) => c.id === _currentCategoryId));
    const tours = getToursByCategory(_currentCategoryId || '');
    const completed = guided.toursCompleted || {};
    let html = `<div class="gtp-tour-list-header">
        <span class="gtp-tour-list-icon" style="color: ${cat?.color || '#666'}">${_icon(cat?.icon || 'list')}</span>
        <span>${_t(cat?.nameKey, _currentCategoryId || '')}</span>
    </div>`;
    html += '<div class="gtp-tour-list">';
    for (const tour of tours) {
        html += _renderTourItem(tour, completed, false);
    }
    html += '</div>';
    return html;
}
/**
 * @param {any} guided
 * @param {string} query
 */
function _renderSearchResults(guided: any, query: any) {
    const results = searchTours(query, t);
    const completed = guided.toursCompleted || {};
    if (results.length === 0) {
        return `<div class="gtp-empty" role="status">
            <span>${_t('guidedToursNoResults', 'No tours found')}</span>
            <span class="gtp-empty-hint">${_t('guidedToursSearchHint', 'Try a shorter search term')}</span>
        </div>`;
    }
    let html = `<div class="gtp-search-count">${results.length} ${_t('guidedToursResults', 'results')}</div>`;
    html += '<div class="gtp-tour-list">';
    for (const tour of results) {
        html += _renderTourItem(tour, completed, true);
    }
    html += '</div>';
    return html;
}
/**
 * Render a single tour item button.
 * Reutilizado por tour list e search results.
 */
/**
 * @param {any} tour
 * @param {any} completed
 * @param {boolean} showCatTag
 */
function _renderTourItem(tour: any, completed: any, showCatTag: any) {
    const isDone = !!completed[tour.id];
    const diffClass = `gtp-diff-${tour.difficulty}`;
    const diffLabel = _t(`guidedTourDiff${_capitalize(tour.difficulty)}`, tour.difficulty);
    const cat = /** @type {any} */ (showCatTag ? TOUR_CATEGORIES.find((c: any) => c.id === tour.categoryId) : null);
    return `
        <button class="gtp-tour-item ${isDone ? 'gtp-tour-done' : ''}"
                data-action="start-tour" data-tour-id="${_escapeAttr(tour.id)}">
            <span class="gtp-tour-check">${isDone ? _icon('check-circle') : _icon('circle')}</span>
            <span class="gtp-tour-info">
                <span class="gtp-tour-name">${_t(tour.nameKey, tour.id)}</span>
                ${showCatTag && cat
        ? `<span class="gtp-tour-cat-tag" style="color: ${cat.color || '#666'}">${_t(cat.nameKey, '')}</span>`
        : `<span class="gtp-tour-desc">${_t(tour.descKey, '')}</span>`}
            </span>
            <span class="gtp-tour-meta">
                <span class="gtp-tour-badge ${diffClass}">${diffLabel}</span>
                <span class="gtp-tour-time">${tour.estimatedMinutes} min</span>
                <span class="gtp-tour-steps">${tour.steps.length} ${_t('tourSteps', 'steps')}</span>
            </span>
        </button>
    `;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/** @param {string} name */
function _icon(name: any) {
    try {
        return getIcon(name, { size: '16px' });
    }
    catch {
        return '&#9679;';
    } // fallback: bullet character
}
/**
 * @param {string} key
 * @param {string} fallback
 */
function _t(key: any, fallback: any) {
    try {
        const val = t(key);
        return val && val !== key ? val : fallback;
    }
    catch {
        return fallback;
    }
}
/** @param {string} s */
function _escapeAttr(s: any) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
/** @param {string} s */
function _capitalize(s: any) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
//# sourceMappingURL=tourPicker.js.map
