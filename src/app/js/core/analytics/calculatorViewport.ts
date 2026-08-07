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
   CALCULATOR VIEWPORT — Analytics viewport with metric cards
   Viewport de analytics mostrando cards com resultados do calculator

   Cada card mostra: tipo (metric/rule/ratio), label, valor calculado,
   cor, detalhes (count, pass/fail, ratio).
   ================================================================ */
import { getCalculatorItems, computeAllCalculator } from '../calculator/manager.js';
import { escapeHtml } from '../../utils/helpers/html.js';
import { t } from '../../utils/i18n/translations.js';
/**
 * @typedef {Object} CalculatorResult
 * @property {string} [id]
 * @property {string} [text]
 * @property {boolean} [error]
 * @property {number} [count]
 * @property {string} [postProcessingNote]
 * @property {{ passing?: number, failing?: number, total?: number, pass?: boolean }} [details]
 */
// ----------------------------------------------------------------
// CALCULATOR VIEWPORT CLASS
// ----------------------------------------------------------------
export class CalculatorViewport {
    container: any;
    tensor: any;
    /** @param {any} container */
    constructor(container: any) {
        this.container = container;
        /** @type {any} */
        this.tensor = null;
        this._render();
    }
    /**
     * Receive data tensor (for consistency with other viewports).
     * O calculator nao usa tensor diretamente - recomputa do model.
     * @param {any} tensor
     */
    setTensor(tensor: any) {
        this.tensor = tensor;
        this._render();
    }
    /**
     * Renderiza estado vazio do viewport.
     */
    _renderEmptyState(el: HTMLElement): void {
        el.innerHTML = `<div class="calculator-viewport-empty" style="text-align:center;padding:20px;color:var(--primary-text-muted,#888);font-size:13px;">
            ${t('calculatorEmpty') || 'No calculator metrics. Open Calculator to add.'}
        </div>`;
    }

    /**
     * Render calculator cards.
     */
    _render() {
        const el = this.container;
        if (!el)
            return;
        const items = getCalculatorItems();
        const results: any[] = computeAllCalculator() as any[];
        if (items.length === 0) {
            this._renderEmptyState(el);
            return;
        }
        el.innerHTML = this._renderCardsHtml(items, results);
    }

    /**
     * Gera o HTML dos cards a partir dos itens e resultados.
     */
    _renderCardsHtml(items: any[], results: any[]): string {
        const cards = items
            .filter((i: any) => i.enabled)
            .map((item: any) => {
                const result = results.find((r: any) => r.id === item.id);
                if (!result) return '';
                return this._renderCardHtml(item, result);
            })
            .join('');
        return `<div class="calculator-viewport-cards">${cards}</div>`;
    }

    /**
     * Resolve o rótulo de tipo (METRIC / RULE / RATIO).
     */
    _typeLabelFromType(type: string): string {
        if (type === 'rule') return 'RULE';
        if (type === 'ratio') return 'RATIO';
        return 'METRIC';
    }

    /**
     * Gera o HTML de detalhes de um card conforme tipo.
     */
    _cardDetailsHtml(item: any, result: any): string {
        if (!result.details) return '';
        if (item.type === 'rule') {
            const d = result.details;
            return `<div class="calculator-viewport-card-details">
                <span style="color:#22c55e">${d.passing} pass</span> /
                <span style="color:#dc2626">${d.failing} fail</span>
                (${d.total} total)
            </div>`;
        }
        if (item.type === 'ratio' && result.details.pass != null) {
            return `<div class="calculator-viewport-card-details">
                ${result.details.pass ? '<span style="color:#22c55e">PASS</span>' : '<span style="color:#dc2626">FAIL</span>'}
            </div>`;
        }
        if (item.type === 'metric' && result.count != null) {
            return `<div class="calculator-viewport-card-details">${result.count} observations</div>`;
        }
        return '';
    }

    /**
     * Gera o HTML de um único card.
     */
    _renderCardHtml(item: any, result: any): string {
        const typeLabel = this._typeLabelFromType(item.type);
        const typeClass = `calculator-type-${item.type}`;
        const value = result.error
            ? `<span style="color:#dc2626">Error</span>`
            : escapeHtml(result.text || '—');
        const detailsHtml = this._cardDetailsHtml(item, result);
        const ppBadge = result.postProcessingNote
            ? `<div class="calculator-viewport-card-pp" title="${t('postProcessing') || 'Post-processing'}">
                   ${escapeHtml(result.postProcessingNote)}
               </div>`
            : '';
        return `<div class="calculator-viewport-card">
                <div class="calculator-viewport-card-type ${typeClass}">${typeLabel}</div>
                <div class="calculator-viewport-card-label">${escapeHtml(item.label || '')}</div>
                <div class="calculator-viewport-card-value" style="color:${item.color || 'var(--primary-text)'}">${value}</div>
                ${ppBadge}
                ${detailsHtml}
            </div>`;
    }
    destroy() {
        if (this.container)
            this.container.innerHTML = '';
    }
}
//# sourceMappingURL=calculatorViewport.js.map
