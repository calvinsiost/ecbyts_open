// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MULTI-MODEL TABS - tab bar renderer + lifecycle
   (SPEC_MULTI_MODEL_TABS Phase 3 — registry UI layer)

   Renderiza barra de tabs (thumbnail + nome + close) abaixo do header.
   Ativa apenas quando CONFIG.FEATURES.MULTI_MODEL === true.

   Handlers públicos expostos em `utils/handlers/models.js`:
   - handleSwitchModel(id)
   - handleCloseModel(id)
   - handleCreateModel(source)
   ================================================================ */

import { CONFIG } from '../../config.js';
import { listModels, getActiveModel } from '../../core/models/registry.js';
import { escapeHtml, escapeAttr, escapeJsAttr } from '../helpers/html.js';
import { getIcon } from './icons.js';
import { t } from '../i18n/translations.js';

const TAB_BAR_ID = 'model-tab-bar';
const TAB_BAR_HEIGHT = 40;

/** @type {HTMLElement|null} */
let _mountPoint = null;
/** @type {{ count: number, activeId: string|null }|null} */
let _lastRender: any = null;

/**
 * Monta a barra de tabs no DOM (lazy, idempotente). Só age se feature flag on.
 * Se flag off → garante que barra não existe (cleanup).
 * @returns {HTMLElement|null} o elemento da barra ou null se flag off
 */
export function initModelTabBar() {
    const enabled = !!CONFIG?.FEATURES?.MULTI_MODEL;
    const existing = document.getElementById(TAB_BAR_ID);
    if (!enabled) {
        if (existing) existing.remove();
        return null;
    }
    if (existing) {
        _mountPoint = existing;
        return existing;
    }
    // Inserir logo após #menubar (fallback: após #title-bar)
    const anchor = document.getElementById('menubar') || document.getElementById('title-bar');
    const bar = document.createElement('div');
    bar.id = TAB_BAR_ID;
    bar.className = 'model-tab-bar';
    bar.setAttribute('role', 'tablist');
    bar.style.height = `${TAB_BAR_HEIGHT}px`;
    if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(bar, anchor.nextSibling);
    } else {
        document.body.insertBefore(bar, document.body.firstChild);
    }
    _mountPoint = bar;
    return bar;
}

/**
 * Renderiza o conteúdo da barra de tabs (chamado após mudanças no registry).
 * Idempotente - re-renderiza inteiro (payload leve, sem thumbnails base64).
 * @returns {Promise<void>}
 */
export async function renderModelTabs() {
    const bar = initModelTabBar();
    if (!bar) return; // flag off
    const [models, active] = await Promise.all([listModels(), getActiveModel()]);
    const activeId = /** @type {any} */ (active)?.id || null;

    // Empty state: só botão +
    if (!models.length) {
        bar.innerHTML = _renderNewButton();
        _lastRender = { count: 0, activeId: null };
        return;
    }

    const tabs = /** @type {any[]} */ (models)
        .map((/** @type {any} */ m: any) => {
            const isActive = m.id === activeId;
            return _renderTab(m, isActive);
        })
        .join('');
    bar.innerHTML = tabs + _renderNewButton();
    _lastRender = { count: models.length, activeId };
}

/**
 * @param {any} model
 * @param {boolean} isActive
 * @returns {string}
 */
function _renderTab(model: any, isActive: any) {
    const safeId = escapeJsAttr(model.id);
    const name = escapeHtml(model.name || 'Sem título');
    const activeCls = isActive ? ' is-active' : '';
    const aria = isActive ? 'aria-selected="true"' : 'aria-selected="false"';
    // Thumbnail não vem em listModels (payload leve); usa icon placeholder.
    const icon = getIcon('cube', { size: '12px' });
    return `
        <button type="button" class="model-tab${activeCls}" role="tab" ${aria}
            data-model-id="${escapeAttr(model.id)}"
            data-cc-call-click="handleSwitchModel|s:${encodeURIComponent(`${safeId}`)}"
            title="${escapeAttr(model.name || 'Sem título')}">
            <span class="model-tab-icon">${icon}</span>
            <span class="model-tab-name">${name}</span>
            <span class="model-tab-close" data-cc-call-click="handleCloseModel|s:${encodeURIComponent(`${safeId}`)}" data-cc-stop="1">
                &times;
            </span>
        </button>
    `;
}

function _renderNewButton() {
    const label = t ? t('models.tab.new') : 'Novo modelo';
    return `
        <button type="button" class="model-tab-new"
            data-cc-action="cc-6b293746"
            title="${escapeAttr(label)}">
            +
        </button>
    `;
}

/**
 * Getter para testes / debug do último render snapshot.
 */
export function getLastRenderSnapshot() {
    return _lastRender ? { ..._lastRender } : null;
}

/**
 * Remove a barra do DOM (usado em teardown / feature flag off runtime).
 */
export function destroyModelTabBar() {
    const existing = document.getElementById(TAB_BAR_ID);
    if (existing) existing.remove();
    _mountPoint = null;
    _lastRender = null;
}
