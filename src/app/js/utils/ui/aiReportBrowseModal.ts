// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT BROWSE MODAL — F2.4 UI Community Templates tab

   Front-first stub: modal mostra grid de templates approved do marketplace.
   Filtros: pricing (all/free/paid) + license + query search + sortBy.
   onImport callback: caller decide se copia para IDB local (free) ou
   inicia checkout $ECBT (paid) — F2.5 wire real via market-v2.

   Modal pode usar:
   - Fixture local (handleAIReportBrowseDemo) — front-first
   - Real query Supabase (futuro: wire em aiReportPublishClient.listApprovedTemplates)
   ================================================================ */

import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
import { asyncConfirm } from './asyncDialogs.js';
import { escapeHtml } from '../helpers/html.js';
import {
    browseTemplates,
    buildDemoFixture,
    type MarketplaceTemplateRow,
    type BrowseFilters,
} from '../../core/report/_aiReportBrowsePure.js';
import {
    decideImportPath,
    buildLocalTemplateFromMarketplace,
    computeRoyaltySplit,
} from '../../core/report/_aiReportImportPure.js';

const LICENSE_LABELS: Record<string, string> = {
    'agpl-3.0': 'AGPL-3.0',
    'cc-by-4.0': 'CC BY 4.0',
    'proprietary': 'Proprietário',
};

function _renderCard(row: MarketplaceTemplateRow): string {
    const priceLabel = row.price_ecbt === 0
        ? '<span class="ai-browse-price-free">Grátis</span>'
        : `<span class="ai-browse-price-paid">${row.price_ecbt} $ECBT</span>`;
    const author = escapeHtml(row.author_name || row.author_id);
    const rating = row.rating_avg
        ? `★ ${row.rating_avg.toFixed(1)} (${row.install_count || 0} installs)`
        : `${row.install_count || 0} installs`;
    return `
        <div class="ai-browse-card" data-marketplace-id="${escapeHtml(row.id)}">
            <div class="ai-browse-card-header">
                <h4>${escapeHtml(row.title)}</h4>
                ${priceLabel}
            </div>
            <p class="ai-browse-card-desc">${escapeHtml(row.description)}</p>
            <div class="ai-browse-card-meta">
                <span>${author}</span>
                <span>${escapeHtml(LICENSE_LABELS[row.license] || row.license)}</span>
                <span>${escapeHtml(rating)}</span>
            </div>
            <div class="ai-browse-card-actions">
                <button type="button" class="btn-secondary ai-browse-preview-btn" data-mp-id="${escapeHtml(row.id)}">Preview</button>
                <button type="button" class="btn-primary ai-browse-import-btn" data-mp-id="${escapeHtml(row.id)}">
                    ${row.price_ecbt === 0 ? 'Importar Grátis' : `Comprar ${row.price_ecbt} $ECBT`}
                </button>
            </div>
        </div>
    `;
}

function _renderFilterBar(filters: BrowseFilters): string {
    return `
        <div class="ai-browse-filters">
            <input type="search" id="ai-browse-query" placeholder="Buscar por título ou descrição..."
                value="${escapeHtml(filters.query || '')}" />
            <select id="ai-browse-pricing" aria-label="Filtrar por preço">
                <option value="all" ${filters.pricing === 'all' || !filters.pricing ? 'selected' : ''}>Todos os preços</option>
                <option value="free" ${filters.pricing === 'free' ? 'selected' : ''}>Apenas grátis</option>
                <option value="paid" ${filters.pricing === 'paid' ? 'selected' : ''}>Apenas pagos</option>
            </select>
            <select id="ai-browse-license" aria-label="Filtrar por licença">
                <option value="all" ${filters.license === 'all' || !filters.license ? 'selected' : ''}>Todas licenças</option>
                <option value="agpl-3.0" ${filters.license === 'agpl-3.0' ? 'selected' : ''}>AGPL-3.0</option>
                <option value="cc-by-4.0" ${filters.license === 'cc-by-4.0' ? 'selected' : ''}>CC BY 4.0</option>
                <option value="proprietary" ${filters.license === 'proprietary' ? 'selected' : ''}>Proprietário</option>
            </select>
            <select id="ai-browse-sort" aria-label="Ordenar">
                <option value="newest" ${filters.sortBy === 'newest' || !filters.sortBy ? 'selected' : ''}>Mais recentes</option>
                <option value="oldest" ${filters.sortBy === 'oldest' ? 'selected' : ''}>Mais antigos</option>
                <option value="price_asc" ${filters.sortBy === 'price_asc' ? 'selected' : ''}>Preço ↑</option>
                <option value="price_desc" ${filters.sortBy === 'price_desc' ? 'selected' : ''}>Preço ↓</option>
                <option value="title_asc" ${filters.sortBy === 'title_asc' ? 'selected' : ''}>Título A-Z</option>
            </select>
        </div>
    `;
}

export interface BrowseModalOptions {
    /** Fetch all approved rows. Stub returns fixture; real impl queries Supabase. */
    fetchRows: () => Promise<MarketplaceTemplateRow[]>;
    /** Called when user clicks Import on a row. */
    onImport: (row: MarketplaceTemplateRow) => void | Promise<void>;
    /** Optional: called on Preview click. */
    onPreview?: (row: MarketplaceTemplateRow) => void;
}

export async function openAIReportBrowseModal(opts: BrowseModalOptions): Promise<void> {
    const shell = buildModalShell({
        title: 'Community Templates — Marketplace',
        width: '760px',
        id: 'ai-report-browse-modal',
    });

    let allRows: MarketplaceTemplateRow[] = [];
    let filters: BrowseFilters = { pricing: 'all', license: 'all', sortBy: 'newest' };

    function rerender() {
        const page = browseTemplates(allRows, filters, 0, 20);
        const cardsHtml = page.rows.length === 0
            ? '<div class="ai-browse-empty">Nenhum template encontrado com os filtros atuais.</div>'
            : page.rows.map(_renderCard).join('');
        shell.body.innerHTML = `
            ${_renderFilterBar(filters)}
            <div class="ai-browse-count">${page.totalMatching} de ${page.totalRows} templates</div>
            <div class="ai-browse-grid">${cardsHtml}</div>
        `;
        _wireEvents();
    }

    function _wireEvents() {
        const queryEl = shell.body.querySelector('#ai-browse-query') as HTMLInputElement | null;
        const pricingEl = shell.body.querySelector('#ai-browse-pricing') as HTMLSelectElement | null;
        const licenseEl = shell.body.querySelector('#ai-browse-license') as HTMLSelectElement | null;
        const sortEl = shell.body.querySelector('#ai-browse-sort') as HTMLSelectElement | null;

        queryEl?.addEventListener('input', () => { filters = { ...filters, query: queryEl.value }; rerender(); });
        pricingEl?.addEventListener('change', () => { filters = { ...filters, pricing: pricingEl.value as any }; rerender(); });
        licenseEl?.addEventListener('change', () => { filters = { ...filters, license: licenseEl.value as any }; rerender(); });
        sortEl?.addEventListener('change', () => { filters = { ...filters, sortBy: sortEl.value as any }; rerender(); });

        shell.body.querySelectorAll('.ai-browse-import-btn').forEach((btn: Element) => {
            btn.addEventListener('click', async () => {
                const mpId = (btn as HTMLElement).dataset.mpId;
                const row = allRows.find((r) => r.id === mpId);
                if (!row) return;
                try {
                    await opts.onImport(row);
                    showToast(`Template "${row.title}" importado`, 'success');
                } catch (err: any) {
                    showToast(`Falha ao importar: ${err?.message || err}`, 'error');
                }
            });
        });

        if (opts.onPreview) {
            shell.body.querySelectorAll('.ai-browse-preview-btn').forEach((btn: Element) => {
                btn.addEventListener('click', () => {
                    const mpId = (btn as HTMLElement).dataset.mpId;
                    const row = allRows.find((r) => r.id === mpId);
                    if (row) opts.onPreview?.(row);
                });
            });
        }
    }

    // Show loading state
    shell.body.innerHTML = '<div class="ai-browse-loading">Carregando templates do marketplace…</div>';
    document.body.appendChild(shell.overlay);

    try {
        allRows = await opts.fetchRows();
        rerender();
    } catch (err: any) {
        shell.body.innerHTML = `<div class="ai-browse-error">Falha ao carregar: ${escapeHtml(err?.message || String(err))}</div>`;
    }
}

/**
 * Demo entry — abre modal com fixture local (F2.4 front-first).
 * Wire em `window.handleAIReportBrowseDemo`.
 */
export function handleAIReportBrowseDemo(): void {
    openAIReportBrowseModal({
        fetchRows: async () => {
            await new Promise((r) => setTimeout(r, 200));
            return buildDemoFixture();
        },
        onImport: async (row) => {
            // F2.5 wire: decide free vs paid path via pure logic
            const decision = decideImportPath(row, true /* assume authenticated in demo */);
            if (decision.path === 'invalid') {
                throw new Error(decision.reason || 'Import inválido');
            }
            if (decision.path === 'paid_checkout_required') {
                const checkout = decision.requiresCheckout;
                if (!checkout) throw new Error('Checkout requerido sem dados de preço');
                const split = computeRoyaltySplit(checkout.priceEcbt, checkout.royaltyPct);
                const confirmMsg =
                    `Comprar "${row.title}" por ${checkout.priceEcbt} $ECBT?\n\n` +
                    `Autor receberá ${split.authorEcbt} $ECBT (${checkout.royaltyPct}%).\n` +
                    `Plataforma recebe ${split.platformEcbt} $ECBT.\n` +
                    `Licença: ${checkout.license}\n\n` +
                    `[STUB F2.5 demo — checkout real via market-v2 royalty engine pendente]`;
                const confirmed = await asyncConfirm(confirmMsg, {
                    confirmLabel: 'Comprar',
                    cancelLabel: 'Cancelar',
                });
                if (!confirmed) {
                    throw new Error('Checkout cancelado pelo usuário');
                }
                // Stub: simula latência market-v2 checkout
                await new Promise((r) => setTimeout(r, 500));
                console.log('[ai-report-browse-demo] STUB market-v2 checkout completed:', split);
            }
            // Free OR paid post-checkout: copy to IDB via saveCustomTemplate (lazy import)
            const local = buildLocalTemplateFromMarketplace(row, new Date().toISOString());
            console.log('[ai-report-browse-demo] STUB IDB import — substituir por saveCustomTemplate:', {
                local_id: local.id,
                name: local.name,
                imported_from: local.importedFrom,
            });
            await new Promise((r) => setTimeout(r, 200));
        },
        onPreview: (row) => {
            console.log('[ai-report-browse-demo] Preview template:', row.title, row.body_json);
        },
    });
}
