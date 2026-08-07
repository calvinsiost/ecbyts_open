// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-VAL-001 Phase 2 — HUD card renderer

   Renderiza card compacto com VPL total de projetos ambientais ativos.
   Consumer: `handleHydrateEnvValuationHud(projects)` em handlers/eis ou
   chamado após cálculo de valuation.

   Formato canônico do input:
     [{ name, category, vpl, vpla, periods, discountRate }, ...]
   (gerado via core/financial/projectValuation.js)
   ================================================================ */


import { aggregateProjectValuations } from '../../core/financial/projectValuation.js';
import { escapeHtml } from '../helpers/html.js';

const HUD_ID = 'env-valuation-hud-card';

/**
 * Renderiza card no container alvo. Se container não existir, é no-op.
 * @param {Array<{name:any, category:any, vpl:any}>} projects
 * @param {HTMLElement|string} [anchor]  elemento ou id do host
 */
export function renderEnvValuationHudCard(projects: any = [], anchor = 'env-valuation-hud-mount') {
    const host = typeof anchor === 'string' ? document.getElementById(anchor) : anchor;
    if (!host) return null;

    const agg = aggregateProjectValuations(projects);
    if (agg.count === 0) {
        host.innerHTML = '';
        return null;
    }

    const fmt = (n: any) => n.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });

    const categories = Object.entries(agg.byCategory).sort((a, b) => b[1] - a[1]);

    host.innerHTML = `
        <div id="${HUD_ID}" class="env-val-hud-card" role="complementary" aria-label="Valoração Ambiental">
            <div class="env-val-hud-head">
                <span class="env-val-hud-icon" aria-hidden="true">&#8364;</span>
                <span class="env-val-hud-title">Valoração Ambiental</span>
                <span class="env-val-hud-count">${agg.count} projeto${agg.count > 1 ? 's' : ''}</span>
            </div>
            <div class="env-val-hud-total">
                <span class="env-val-hud-label">VPL total</span>
                <span class="env-val-hud-value" data-sign="${agg.totalVpl >= 0 ? 'pos' : 'neg'}">
                    ${escapeHtml(fmt(agg.totalVpl))}
                </span>
            </div>
            <ul class="env-val-hud-breakdown">
                ${categories
                    .map(
                        ([cat, vpl]) => `
                    <li class="env-val-hud-row" data-category="${escapeHtml(cat)}">
                        <span class="env-val-hud-cat">${escapeHtml(cat)}</span>
                        <span class="env-val-hud-cat-vpl" data-sign="${vpl >= 0 ? 'pos' : 'neg'}">
                            ${escapeHtml(fmt(vpl))}
                        </span>
                    </li>
                `,
                    )
                    .join('')}
            </ul>
            <button type="button" class="env-val-hud-expand" aria-label="Abrir painel de Valoração">
                &#9650; Detalhes
            </button>
        </div>
    `;

    // Expansion callback stub - consumer registra em (window as any).handleOpenEnvValuationPanel
    const btn = host.querySelector('.env-val-hud-expand');
    btn?.addEventListener('click', () => {
        if (typeof (window as any).handleOpenEnvValuationPanel === 'function') {
            (window as any).handleOpenEnvValuationPanel();
        } else {
            console.debug('[env-val] handleOpenEnvValuationPanel não registrado');
        }
    });

    return host.querySelector(`#${HUD_ID}`);
}

/**
 * Clear card (hide).
 */
export function clearEnvValuationHudCard(anchor = 'env-valuation-hud-mount') {
    const host = typeof anchor === 'string' ? document.getElementById(anchor) : anchor;
    if (host) host.innerHTML = '';
}
