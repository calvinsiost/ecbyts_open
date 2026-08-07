// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PORTFOLIO PANEL — visão multi-site consolidada (P4-3)
   FRIEND-SCORE-001 (Calvin loop 2026-06-14). O gestor não tinha como
   comparar os sites do portfólio "1 número por site lado a lado". Este
   painel lista todos os modelos (registry) com EIS + nº elementos +
   campanhas + conformidade por site, ordenados pelo pior EIS (onde agir).
   Reusa _portfolioRowsPure (agregador testável). Modal canônico .ecbt-*.
   ================================================================ */

import { buildPortfolioView, type PortfolioRow } from '../../core/models/_portfolioRowsPure.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';

const PANEL_ID = 'portfolio-panel';
let _a11yCleanup: (() => void) | null = null;

interface PortfolioSummary {
    totalSites: number;
    totalElements: number;
    totalCampaigns: number;
    avgEis: number | null;
    sitesWithEis: number;
}

function _tr(key: string, fallback: string): string {
    const v = t(key);
    return v && v !== key ? v : fallback;
}

const EIS_BAND_CLASS: Record<string, string> = {
    high: 'pf-eis-high',
    medium: 'pf-eis-medium',
    low: 'pf-eis-low',
    na: 'pf-eis-na',
};
const COMPLIANCE_GLYPH: Record<string, string> = {
    ok: '&#9679;', // ●
    attention: '&#9650;', // ▲
    critical: '&#9632;', // ■
    na: '&#9675;', // ○
};

function _formatDate(ts: number | null): string {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleDateString();
    } catch {
        return '—';
    }
}

function _rowHtml(r: PortfolioRow): string {
    const eisTxt = r.eis != null ? r.eis.toFixed(2) : '—';
    const eisCls = EIS_BAND_CLASS[r.eisBand] || 'pf-eis-na';
    const ecbtTxt = r.ecbtAmount != null ? (r.ecbtAmount >= 0 ? '+' : '') + Math.round(r.ecbtAmount).toLocaleString() : '—';
    const compGlyph = COMPLIANCE_GLYPH[r.compliance] || COMPLIANCE_GLYPH.na;
    // Linha clicável/focável: aria-label descreve a ação (abrir o site) p/ leitores
    // de tela — o role="row" sozinho não comunica que ela é ativável (WCAG 4.1.2).
    const openLabel = _tr('portfolio.openSite', 'Open site');
    return `
        <tr class="pf-row${r.isActive ? ' pf-row--active' : ''}" data-model-id="${escapeHtml(r.id)}" tabindex="0" role="row" aria-label="${escapeHtml(openLabel)}: ${escapeHtml(r.name)}">
            <td class="pf-name" role="rowheader">${escapeHtml(r.name)}${r.isActive ? ` <span class="pf-active-badge">${escapeHtml(_tr('portfolio.active', 'active'))}</span>` : ''}</td>
            <td class="pf-eis ${eisCls}" role="cell" aria-label="EIS ${escapeHtml(eisTxt)}">${eisTxt}</td>
            <td class="pf-ecbt" role="cell">${escapeHtml(ecbtTxt)}</td>
            <td class="pf-compliance pf-compliance--${r.compliance}" role="cell" aria-label="${escapeHtml(_tr('portfolio.col.compliance', 'Compliance'))}: ${escapeHtml(r.compliance)}" title="${escapeHtml(r.compliance)}">${compGlyph}</td>
            <td class="pf-count" role="cell">${r.elementCount}</td>
            <td class="pf-count" role="cell">${r.campaignCount}</td>
            <td class="pf-date" role="cell">${_formatDate(r.updatedAt)}</td>
        </tr>`;
}

function _panelDialogHtml(rows: PortfolioRow[], summary: PortfolioSummary): string {
    const empty = rows.length === 0;
    return `
        <div class="ecbt-dialog ecbt-dialog--lg portfolio-dialog">
            <div class="ecbt-dialog__header">
                <h2 id="portfolio-title" class="ecbt-dialog__title">${escapeHtml(_tr('portfolio.title', 'Portfolio'))}</h2>
                <button type="button" class="ecbt-dialog__close" id="portfolio-close" aria-label="${escapeHtml(_tr('common.close', 'Close'))}">&times;</button>
            </div>
            <div class="ecbt-dialog__body">
                <div class="pf-summary">
                    <div class="pf-kpi"><span class="pf-kpi-value">${summary.totalSites}</span><span class="pf-kpi-label">${escapeHtml(_tr('portfolio.sites', 'sites'))}</span></div>
                    <div class="pf-kpi"><span class="pf-kpi-value">${summary.avgEis != null ? summary.avgEis.toFixed(2) : '—'}</span><span class="pf-kpi-label">${escapeHtml(_tr('portfolio.avgEis', 'avg EIS'))}</span></div>
                    <div class="pf-kpi"><span class="pf-kpi-value">${summary.totalElements}</span><span class="pf-kpi-label">${escapeHtml(_tr('portfolio.elements', 'elements'))}</span></div>
                </div>
                ${empty ? `<p class="pf-empty">${escapeHtml(_tr('portfolio.empty', 'No models in the portfolio yet.'))}</p>` : `
                <table class="pf-table" role="table" aria-label="${escapeHtml(_tr('portfolio.title', 'Portfolio'))}">
                    <thead><tr role="row">
                        <th scope="col" role="columnheader">${escapeHtml(_tr('portfolio.col.site', 'Site'))}</th>
                        <th scope="col" role="columnheader">EIS</th>
                        <th scope="col" role="columnheader">ECBT</th>
                        <th scope="col" role="columnheader" aria-label="${escapeHtml(_tr('portfolio.col.compliance', 'Compliance'))}" title="${escapeHtml(_tr('portfolio.col.compliance', 'Compliance'))}">&#9679;</th>
                        <th scope="col" role="columnheader">${escapeHtml(_tr('portfolio.col.elements', 'Elem.'))}</th>
                        <th scope="col" role="columnheader">${escapeHtml(_tr('portfolio.col.campaigns', 'Camp.'))}</th>
                        <th scope="col" role="columnheader">${escapeHtml(_tr('portfolio.col.updated', 'Updated'))}</th>
                    </tr></thead>
                    <tbody>${rows.map(_rowHtml).join('')}</tbody>
                </table>
                <p class="pf-note">${escapeHtml(_tr('portfolio.note', 'EIS shown for the active site; open a site to compute its number.'))}</p>`}
            </div>
        </div>`;
}

async function _loadActiveEis(): Promise<number | null> {
    try {
        const purpose = await import('../../core/purpose/index.js');
        const { getAllElements } = await import('../../core/elements/manager.js');
        const { getAllCampaigns } = await import('../../core/campaigns/manager.js');
        const raw = purpose.computeSimplifiedEIS?.(getAllElements(), getAllCampaigns());
        if (raw && Number.isFinite(raw.eis)) return raw.eis;
    } catch (e: unknown) {
        const err = e as Error | undefined;
        console.debug('[portfolio:active-eis]', err?.message || e);
    }
    return null;
}

async function _loadPortfolioRows(): Promise<{ rows: PortfolioRow[]; summary: PortfolioSummary }> {
    const emptySummary: PortfolioSummary = {
        totalSites: 0,
        totalElements: 0,
        totalCampaigns: 0,
        avgEis: null,
        sitesWithEis: 0,
    };
    try {
        const registry = await import('../../core/models/registry.js');
        const models = (await registry.listModels?.()) || [];
        const activeId = (await registry.getActiveModel?.())?.id || null;
        const activeEis = await _loadActiveEis();
        const enriched = models.map((m: PortfolioRow) =>
            m.id === activeId ? { ...m, eis: activeEis } : m,
        );
        const view = buildPortfolioView(enriched, activeId);
        return {
            rows: view.rows as PortfolioRow[],
            summary: (view.summary as PortfolioSummary) || emptySummary,
        };
    } catch (e: unknown) {
        const err = e as Error | undefined;
        console.debug('[portfolio:load]', err?.message || e);
        return { rows: [], summary: emptySummary };
    }
}

function _activateRow(row: Element, close: () => void): void {
    const id = row.getAttribute('data-model-id');
    const w = window as unknown as { handleSwitchModel?: (id: string) => void };
    if (id && typeof w.handleSwitchModel === 'function') {
        w.handleSwitchModel(id);
        close();
    }
}

function _attachPortfolioListeners(overlay: HTMLElement, close: () => void): void {
    document.getElementById('portfolio-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    // Clique OU Enter/Espaço numa linha → abre aquele site (switch model).
    // A linha tem tabindex="0"; teclado é requisito WCAG 2.1.1 (não só mouse).
    overlay.querySelectorAll('.pf-row').forEach((row: Element) => {
        row.addEventListener('click', () => _activateRow(row, close));
        row.addEventListener('keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter' || ke.key === ' ' || ke.key === 'Spacebar') {
                ke.preventDefault();
                _activateRow(row, close);
            }
        });
    });
}

/**
 * Abre o painel de portfólio. Carrega os modelos do registry e o EIS do site
 * ativo (os demais aparecem com EIS "—" até serem abertos — o número fica
 * disponível conforme o gestor navega; sem inventar dados não computados).
 */
export async function openPortfolioPanel(): Promise<void> {
    if (document.getElementById(PANEL_ID)) return;

    const { rows, summary } = await _loadPortfolioRows();

    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'portfolio-title');
    overlay.innerHTML = _panelDialogHtml(rows, summary);

    document.body.appendChild(overlay);

    const close = () => {
        if (typeof _a11yCleanup === 'function') {
            _a11yCleanup();
            _a11yCleanup = null;
        }
        overlay.remove();
    };

    _attachPortfolioListeners(overlay, close);
    _a11yCleanup = attachModalA11y(overlay, close, {
        initialFocus: document.getElementById('portfolio-close'),
    });
}

export function handleOpenPortfolio(): void {
    void openPortfolioPanel();
}

if (typeof window !== 'undefined' && typeof (window as unknown as { handleOpenPortfolio?: unknown }).handleOpenPortfolio !== 'function') {
    (window as unknown as { handleOpenPortfolio: () => void }).handleOpenPortfolio = handleOpenPortfolio;
}
