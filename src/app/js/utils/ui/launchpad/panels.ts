// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/ui/launchpad/panels.js
// V3 Phase 2: painéis "Ferramentas Ativas" + "Comunidade & Marketplace"
// do Launchpad. Consomem telemetry/toolUsage + libraries/supabaseMarketplace.
// Ambos feature-flagged via LAUNCHPAD_V3_PANELS.

import { CONFIG } from '../../../config.js';
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { getToolUsage } from '../../telemetry/toolUsage.js';

/** @type {HTMLElement | null} */
let _panelsEl: any = null;
let _rendering = false;

/**
 * Ensure panels container - renders two side-by-side cards:
 * Tools | Community.
 * @param {HTMLElement | null} parent
 * @returns {HTMLElement | null}
 */
export function ensurePanelsContainer(parent: any) {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_PANELS) return null;
    if (!parent) return null;
    let el = /** @type {HTMLElement | null} */ (parent.querySelector('#launchpad-panels'));
    if (!el) {
        el = document.createElement('section');
        el.id = 'launchpad-panels';
        el.className = 'launchpad-panels';
        el.setAttribute('data-testid', 'launchpad-panels');
        parent.appendChild(el);
    }
    _panelsEl = el;
    return el;
}

/**
 * Render both panels.
 */
export async function renderPanels() {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_PANELS) return;
    if (!_panelsEl || _rendering) return;
    _rendering = true;
    try {
        const [toolsHtml, communityHtml] = await Promise.all([_renderTools(), _renderCommunity()]);
        _panelsEl.innerHTML = `
            <div class="launchpad-panel launchpad-panel-tools" data-testid="launchpad-panel-tools">
                ${toolsHtml}
            </div>
            <div class="launchpad-panel launchpad-panel-community" data-testid="launchpad-panel-community">
                ${communityHtml}
            </div>
        `;
    } catch (e: any) {
        console.debug('[launchpad:panels] render failed:', /** @type {any} */ (e)?.message);
    } finally {
        _rendering = false;
    }
}

async function _renderTools() {
    const title = escapeHtml(t('launchpad.panel.tools.title') || 'Ferramentas ativas');
    const usage = getToolUsage(5);
    if (usage.length === 0) {
        return `
            <h3 class="launchpad-panel-title">${title}</h3>
            <p class="launchpad-panel-empty">${escapeHtml(
                t('launchpad.panel.tools.empty') || 'Nenhuma ferramenta usada ainda neste modelo.',
            )}</p>
            <button type="button" class="launchpad-panel-cta" data-testid="launchpad-tools-publish">
                ${escapeHtml(t('launchpad.panel.tools.publishCta') || 'Publicar ferramenta sua')}
            </button>
        `;
    }
    return `
        <h3 class="launchpad-panel-title">${title}</h3>
        <ul class="launchpad-panel-list">
            ${usage
                .map((u: any) => `
                <li class="launchpad-panel-item" data-testid="launchpad-tool-entry">
                    <span class="launchpad-panel-item-name">${escapeHtml(u.toolId)}</span>
                    <span class="launchpad-panel-item-count">${escapeHtml(String(u.uses))}×</span>
                </li>
            `,
                )
                .join('')}
        </ul>
        <button type="button" class="launchpad-panel-cta" data-testid="launchpad-tools-publish">
            ${escapeHtml(t('launchpad.panel.tools.publishCta') || 'Publicar ferramenta sua')}
        </button>
    `;
}

async function _renderCommunity() {
    const title = escapeHtml(t('launchpad.panel.community.title') || 'Comunidade & Marketplace');
    const myContribs = null;
    const eicBalance = null;
    let impact = null;
    try {
        const mod = await import('../../libraries/supabaseMarketplace.js' as string);
        if (mod?.fetchCommunityImpact) {
            impact = await mod.fetchCommunityImpact();
        }
    } catch (e: any) {
        console.debug('[launchpad/panels] fetchImpact:', /** @type {any} */ (e)?.message || e);
        /* noop */
    }
    // EIC só aparece se feature flag on (EIC é spec-only hoje)
    const eicEnabled = (CONFIG.FEATURES as any)?.EIC_ENABLED === true;
    const users = impact?.users ?? 0;
    const models = impact?.models ?? 0;

    const userLine =
        myContribs != null
            ? `<li><span>${escapeHtml(t('launchpad.panel.community.myContributions') || 'Suas contribuições')}</span><strong>${myContribs}</strong></li>`
            : '';
    const eicLine = eicEnabled && eicBalance != null ? `<li><span>EIC</span><strong>${eicBalance}</strong></li>` : '';

    if (users === 0 && models === 0 && !userLine) {
        return `
            <h3 class="launchpad-panel-title">${title}</h3>
            <p class="launchpad-panel-empty">${escapeHtml(
                t('launchpad.panel.community.empty') || 'Comunidade em formação. Seja um dos primeiros a contribuir.',
            )}</p>
            <button type="button" class="launchpad-panel-cta" data-testid="launchpad-community-publish">
                ${escapeHtml(t('launchpad.panel.community.publishCta') || 'Publicar modelo')}
            </button>
        `;
    }
    return `
        <h3 class="launchpad-panel-title">${title}</h3>
        <ul class="launchpad-panel-list">
            <li><span>${escapeHtml(t('launchpad.panel.community.pros') || 'Profissionais')}</span><strong>${users}</strong></li>
            <li><span>${escapeHtml(t('launchpad.panel.community.models') || 'Modelos publicados')}</span><strong>${models}</strong></li>
            ${userLine}
            ${eicLine}
        </ul>
    `;
}

export function disposePanels() {
    if (_panelsEl) {
        _panelsEl.innerHTML = '';
        _panelsEl.remove() as any;
        _panelsEl = null;
    }
}
