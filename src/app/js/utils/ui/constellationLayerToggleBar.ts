// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Constellation Z3 Layer Toggle Bar (UI surface for layerFilters).
// Hand-authored R1-safe consumindo layerFilters (Wave M1 pure-logic).
// SPEC_CONSTELLATION_HUD_9_75 §missing "Z3 layer toggles" — UI surface + persistence.
//
// Spec NOT respeitados:
// - NÃO reimplementar layer state (delega 100% a layerFilters.js)
// - NÃO criar nova chave localStorage (reusa ecbyts-customize.constellationLayers)
// - NÃO emoji em strings (HTML entities + iconKey)
// - NÃO depende Three.js/canvas (UI puro)

import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    createLayerFilterState,
    toggleLayer,
    buildLayerToggleVM,
    serializeLayerFilters,
} from '../../core/constellation/layerFilters.js';

const PREFS_KEY = 'ecbyts-customize';
const PREFS_FIELD = 'constellationLayers';

/**
 * Lê layer state persisted de localStorage[ecbyts-customize].constellationLayers.
 * @returns {object}
 */
export function readPersistedLayerState() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && parsed[PREFS_FIELD]) || {};
    } catch (e: any) {
        console.debug('[layerToggleBar:read]', e?.message || e);
        return {};
    }
}

/**
 * Escreve layer state em localStorage.
 * @param {object} state
 */
export function writePersistedLayerState(state: any) {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[PREFS_FIELD] = serializeLayerFilters(state);
        localStorage.setItem(PREFS_KEY, JSON.stringify(parsed));
    } catch (e: any) {
        console.debug('[layerToggleBar:write]', e?.message || e);
    }
}

/**
 * Renderiza HTML do toggle bar para um state.
 * Cada botão é toggleável (aria-pressed). Stateless: caller re-renderiza.
 * @param {object} state
 * @returns {string} HTML
 */
function _renderToggles(state: any) {
    const vm = buildLayerToggleVM(state);
    return vm
        .map((item: any) => {
            const cls = item.active ? 'clt-toggle clt-toggle--active' : 'clt-toggle';
            const label = t(item.labelKey) || item.id;
            return `<button type="button" class="${cls}" data-layer-id="${escapeHtml(item.id)}" data-icon="${escapeHtml(item.iconKey)}" aria-pressed="${item.active}" title="${escapeHtml(label)}">
                <span class="clt-toggle-label">${escapeHtml(label)}</span>
            </button>`;
        })
        .join('');
}

/**
 * Monta toggle bar dentro do container fornecido.
 * Re-renderiza on toggle via closure state.
 *
 * @param {HTMLElement} container — elemento ancorador (caller decide where)
 * @param {object} [opts]
 * @param {(state:object)=>void} [opts.onChange] — caller reagir ao state change
 * @param {object} [opts.persistedState] — initial state (default: readPersisted)
 * @returns {{getState:Function, refresh:Function, destroy:Function}}
 */
export function mountLayerToggleBar(container: any, opts: any = {}) {
    if (!container || container.nodeType !== 1) {
        throw new TypeError('mountLayerToggleBar: container must be HTMLElement');
    }
    let state = createLayerFilterState(opts.persistedState || readPersistedLayerState());
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = controller?.signal;
    const root = document.createElement('div');
    root.className = 'clt-bar';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', t('constellation.layer.barLabel') || 'Camadas');
    const render = () => {
        root.innerHTML = _renderToggles(state);
    };
    render();
    container.appendChild(root);
    const onClick = (ev: any) => {
        const target = (ev.target) as any;
        const btn = target?.closest?.('[data-layer-id]');
        if (!btn) return;
        const layerId = btn.dataset?.layerId;
        if (!layerId) return;
        state = toggleLayer(state, layerId);
        writePersistedLayerState(state);
        render();
        opts.onChange?.(state);
    };
    root.addEventListener('click', onClick, signal ? { signal } : undefined);
    return {
        getState: () => state,
        refresh: render,
        destroy: () => {
            try {
                controller?.abort();
                root.remove();
            } catch (e: any) {
                console.debug('[layerToggleBar:destroy]', e?.message || e);
            }
        },
    };
}
