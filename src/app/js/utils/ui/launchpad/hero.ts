// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/ui/launchpad/hero.js
// V3 Phase 1: renderer do HERO do Launchpad.
// Consumer burro - só pede getLaunchpadItems() do Calculator e renderiza.
// Zero fórmula local. Async por causa de custom-* handlers.

import { CONFIG } from '../../../config.js';
import { getLaunchpadItems } from '../../../core/calculator/manager.js';
import { computeCalculatorItem } from '../../../core/calculator/engine.js';
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';

/** @type {HTMLElement|null} */
let _heroEl: any = null;
let _rendering = false;
let _lastRenderAt = 0;

/**
 * Ensure the hero container exists inside the provided parent.
 * Idempotent - se já existe, reusa.
 *
 * @param {HTMLElement} parent
 * @returns {HTMLElement|null}
 */
export function ensureHeroContainer(parent: any) {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) return null;
    if (!parent) return null;
    let el = /** @type {HTMLElement|null} */ (parent.querySelector('#launchpad-hero'));
    if (!el) {
        el = document.createElement('div');
        el.id = 'launchpad-hero';
        el.className = 'launchpad-hero';
        el.setAttribute('data-testid', 'launchpad-hero');
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', t('launchpad.hero.aria') || 'Key metrics');
        parent.insertBefore(el, parent.firstChild);
    }
    _heroEl = el;
    return el;
}

/**
 * Render hero KPIs from Calculator's getLaunchpadItems().
 * Idempotent + coalescente (várias chamadas em sequência resultam em
 * 1 render).
 */
export async function renderHero() {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) return;
    if (!_heroEl) return;
    if (_rendering) return;
    _rendering = true;
    try {
        const items = getLaunchpadItems();
        if (!items || items.length === 0) {
            _heroEl.innerHTML = `
                <div class="launchpad-hero-empty">${escapeHtml(
                    t('launchpad.hero.empty') || 'Nenhum KPI pinado — abra o Calculator para configurar',
                )}</div>
            `;
            return;
        }
        const results = await Promise.all(items.map((it: any) => _safeCompute(it)));
        _heroEl.innerHTML = results.map(_renderCard).join('');
        _attachClickHandlers();
        _lastRenderAt = Date.now();
    } catch (e: any) {
        console.warn('[launchpad:hero] render failed:', (e as any)?.message || e);
    } finally {
        _rendering = false;
    }
}

async function _safeCompute(item: any) {
    try {
        const r = await computeCalculatorItem(item);
        return { item, result: r };
    } catch (_err: any) {
        return { item, result: { value: null, severity: 'warn', text: '[error]' } };
    }
}

function _renderCard({ item, result }: any) {
    const value = result?.value;
    const severity = result?.severity || 'ok';
    const display = _formatValue(value, item);
    const label = escapeHtml(t(item.labelKey) || item.label || item.id);
    const handler = item.drillDownHandler ? escapeHtml(item.drillDownHandler) : '';
    const ariaLabel = `${label}: ${display} (${severity})`;
    return `
        <button type="button"
                class="launchpad-hero-kpi launchpad-hero-${severity}"
                data-testid="launchpad-hero-kpi"
                data-kpi-id="${escapeHtml(item.id)}"
                data-handler="${handler}"
                aria-label="${escapeHtml(ariaLabel)}">
            <span class="launchpad-hero-kpi-label">${label}</span>
            <span class="launchpad-hero-kpi-value">${escapeHtml(display)}</span>
            <span class="launchpad-hero-kpi-dot" aria-hidden="true"></span>
        </button>
    `;
}

function _formatValue(value: any, item: any) {
    if (value == null) return '—';
    if (typeof value !== 'number' || !isFinite(value)) return String(value);
    const precision = typeof item.precision === 'number' ? item.precision : 2;
    // Compact format para números grandes (> 10k)
    if (Math.abs(value) >= 10_000) {
        const formatter = new Intl.NumberFormat(undefined, {
            notation: 'compact',
            maximumFractionDigits: 1,
        });
        return formatter.format(value) + (item.suffix || '');
    }
    return value.toFixed(precision) + (item.suffix || '');
}

function _attachClickHandlers() {
    if (!_heroEl) return;
    const cards = _heroEl.querySelectorAll('[data-kpi-id]');
    for (const card of cards) {
        card.addEventListener('click', _onKpiClick);
    }
}

function _onKpiClick(ev: any) {
    const btn = ev.currentTarget;
    const handlerName = btn?.getAttribute('data-handler');
    if (!handlerName) return;
    const fn: any = (window as any)[handlerName];
    if (typeof fn === 'function') {
        try {
            fn();
        } catch (e: any) {
            console.warn('[launchpad:hero] drill-down handler error:', handlerName, (e as any)?.message);
        }
    } else if (typeof (/** @type {any} */ (window).showToast) === 'function') {
        /** @type {any} */ (window).showToast(
            t('launchpad.hero.drillDown.unavailable') || 'Detalhe indisponível',
            'info',
        );
    }
}

/**
 * Disposes event listeners + detaches DOM. Used on view change.
 */
export function disposeHero() {
    if (_heroEl) {
        _heroEl.innerHTML = '';
        _heroEl.remove();
        _heroEl = null;
    }
}

/**
 * Test-only introspection helper.
 */
export function _getHeroState() {
    return { rendering: _rendering, lastRenderAt: _lastRenderAt, el: _heroEl };
}
