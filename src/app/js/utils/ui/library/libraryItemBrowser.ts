// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   LIBRARY ITEM BROWSER — SPEC_LIBRARY_HUB_V2 MVP (per-item drill-in)

   V1 Library Hub listed only categories. This module closes the
   Must-Have gap: a per-category drill-in that lists the individual
   marketplace items (cards), each showing the verified-publisher
   badge, install count, average rating and a composite trust score.
   Sort: Recommended / Installs / Rating / Name.

   Consome o catálogo existente em utils/libraries/marketplace.js —
   NÃO reconstrói catálogo. Funções puras (computeTrustScore,
   sortItems) ficam exportadas para testes cheap em Node.
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { showToast } from '../toast.js';
import { createLogger } from '../../helpers/logger.js';
import { getMarketplaceCatalog } from '../../libraries/marketplace.js';
import { computeTrustScore, isVerifiedPublisher, sortItems } from './libraryTrust.js';
const log = createLogger('library-item-browser');
const MODAL_ID = 'library-item-browser-modal';
/** @typedef {import('./libraryTrust.js').CatalogItem & { description?:string,
 *   version?:string, _creatorName?:string, _isRemote?:boolean,
 *   _installed?:boolean, is_paid?:boolean }} CatalogItem */
/** @type {'recommended'|'installs'|'rating'|'name'} */
let _sort = 'recommended';
export { computeTrustScore, isVerifiedPublisher, sortItems };
/**
 * Trust badge tier label + class from a 0..1 score (green/amber/red).
 * @param {number} score
 * @returns {{ cls:string, label:string }}
 */
function trustTier(score: number) {
    if (score >= 0.7)
        return { cls: 'libitem-trust--high', label: t('libitem.trust.high') || 'High trust' };
    if (score >= 0.4)
        return { cls: 'libitem-trust--mid', label: t('libitem.trust.mid') || 'Moderate trust' };
    return { cls: 'libitem-trust--low', label: t('libitem.trust.low') || 'Low trust' };
}
/**
 * Render the cards grid for the given items + sort.
 * @param {CatalogItem[]} items
 * @returns {string}
 */
function renderCards(items: any[]) {
    const sorted = sortItems(items, _sort as any) as any[];
    if (sorted.length === 0) {
        return `<div class="libitem-empty">${escapeHtml(t('libitem.empty') || 'No items found in this category.')}</div>`;
    }
    const maxInstalls = sorted.reduce((m, i) => Math.max(m, Number(i.install_count) || 0), 0);
    return sorted
        .map((item: any) => {
        const name = escapeHtml(item.name || item.library_id || 'item');
        const desc = escapeHtml((item.description || '').slice(0, 160));
        const publisher = escapeHtml(item._creatorName || 'ecbyts');
        const installs = Number(item.install_count) || 0;
        const rating = (Number(item.avg_rating) || 0).toFixed(1);
        const ratings = Number(item.total_ratings) || 0;
        const score = computeTrustScore(item, maxInstalls);
        const tier = trustTier(score);
        const verifiedBadge = isVerifiedPublisher(item)
            ? `<span class="libitem-badge libitem-badge--verified" title="${escapeHtml(t('libitem.verified') || 'Verified publisher')}">&#10003; ${escapeHtml(t('libitem.verified') || 'Verified')}</span>`
            : '';
        const installedBadge = item._installed
            ? `<span class="libitem-badge libitem-badge--installed">${escapeHtml(t('libitem.installed') || 'Installed')}</span>`
            : '';
        const paidBadge = item.is_paid ? `<span class="libitem-badge libitem-badge--paid">$</span>` : '';
        return (`<article class="libitem-card" role="listitem" tabindex="0" aria-label="${name}">` +
            `<div class="libitem-card-head"><strong class="libitem-name">${name}</strong>${verifiedBadge}${installedBadge}${paidBadge}</div>` +
            `<p class="libitem-desc">${desc}</p>` +
            `<div class="libitem-meta">` +
            `<span class="libitem-publisher">${escapeHtml(t('libitem.by') || 'by')} ${publisher}</span>` +
            `<span class="libitem-stat" title="${escapeHtml(t('libitem.installs') || 'Installs')}">&#8595; ${installs.toLocaleString()}</span>` +
            `<span class="libitem-stat" title="${ratings} ${escapeHtml(t('libitem.ratings') || 'ratings')}">&#9733; ${rating}</span>` +
            `<span class="libitem-trust ${tier.cls}" title="${escapeHtml(tier.label)}">${escapeHtml(t('libitem.trustScore') || 'Trust')} ${Math.round(score * 100)}%</span>` +
            `</div></article>`);
    })
        .join('');
}
/** @param {HTMLElement} modal @param {CatalogItem[]} items */
function refresh(modal: HTMLElement & { _isOffline?: boolean }, items: any[]) {
    const grid = modal.querySelector('.libitem-grid');
    if (grid)
        grid.innerHTML = renderCards(items);
    const offline = modal.querySelector('.libitem-offline');
    if (offline)
        offline.toggleAttribute('hidden', !modal._isOffline);
}
/** @param {HTMLElement} modal @param {CatalogItem[]} items */
function attachHandlers(modal: HTMLElement & { _isOffline?: boolean }, items: any[]) {
    modal.querySelectorAll('.libitem-sort-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', () => {
            _sort = (button.getAttribute('data-sort') as any) || 'recommended';
            modal.querySelectorAll('.libitem-sort-btn').forEach((b) => (b as HTMLElement).classList.toggle('active', b === btn));
            refresh(modal, items);
        });
    });
    const closeBtn = modal.querySelector('.libitem-close');
    if (closeBtn)
        closeBtn.addEventListener('click', closeLibraryItemBrowser);
}
/**
 * Open the per-item drill-in browser for a category.
 * @param {{ category?:string }} [opts]
 */
export async function openLibraryItemBrowser(opts: { category?: string } = {}) {
    const category = opts.category || '';
    let modal = document.getElementById(MODAL_ID) as (HTMLElement & { _isOffline?: boolean }) | null;
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = escapeHtml(t('libitem.title') || 'Browse marketplace items');
        const sortLabel = escapeHtml(t('libitem.sortBy') || 'Sort by');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl libitem-dialog" style="max-width:1000px">' +
                '<div class="libitem-header">' +
                `<h2 class="libitem-title">${title}${category ? ` <small>(${escapeHtml(category)})</small>` : ''}</h2>` +
                '<button class="libitem-close ecbt-btn" aria-label="Close" style="padding:4px 10px">&times;</button>' +
                '</div>' +
                `<div class="libitem-offline" hidden role="status">${escapeHtml(t('libitem.offline') || 'Offline catalog — showing built-in items only.')}</div>` +
                '<div class="libitem-toolbar" role="group" aria-label="' +
                sortLabel +
                '">' +
                `<span class="libitem-sortlabel">${sortLabel}:</span>` +
                `<button class="libitem-sort-btn active" data-sort="recommended">${escapeHtml(t('libitem.sort.recommended') || 'Recommended')}</button>` +
                `<button class="libitem-sort-btn" data-sort="installs">${escapeHtml(t('libitem.sort.installs') || 'Installs')}</button>` +
                `<button class="libitem-sort-btn" data-sort="rating">${escapeHtml(t('libitem.sort.rating') || 'Rating')}</button>` +
                `<button class="libitem-sort-btn" data-sort="name">${escapeHtml(t('libitem.sort.name') || 'Name')}</button>` +
                '</div>' +
                '<div class="libitem-grid" role="list" aria-live="polite"><div class="libitem-empty">' +
                escapeHtml(t('libitem.loading') || 'Loading...') +
                '</div></div>' +
                '<style>' +
                '#library-item-browser-modal .libitem-dialog{color:#e0e0e0}' +
                '#library-item-browser-modal .libitem-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}' +
                '#library-item-browser-modal .libitem-title{margin:0;font-size:18px;font-weight:600;color:#e0e0e0}' +
                '#library-item-browser-modal .libitem-title small{color:#888;font-size:13px}' +
                '#library-item-browser-modal .libitem-offline{background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:6px 10px;border-radius:4px;font-size:12px;margin-bottom:8px}' +
                '#library-item-browser-modal .libitem-toolbar{display:flex;gap:6px;align-items:center;margin-bottom:12px;flex-wrap:wrap}' +
                '#library-item-browser-modal .libitem-sortlabel{color:#999;font-size:12px}' +
                '#library-item-browser-modal .libitem-sort-btn{padding:5px 12px;font-size:11px;background:transparent;border:1px solid var(--border-color,#444);color:#aaa;border-radius:4px;cursor:pointer}' +
                '#library-item-browser-modal .libitem-sort-btn.active{background:var(--accent,#60a5fa);color:#fff;border-color:transparent}' +
                '#library-item-browser-modal .libitem-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;max-height:62vh;overflow-y:auto;padding:2px}' +
                '@media (max-width:768px){#library-item-browser-modal .libitem-grid{grid-template-columns:1fr}}' +
                '#library-item-browser-modal .libitem-card{border:1px solid var(--border-color,#333);border-radius:6px;padding:12px;background:rgba(255,255,255,0.02)}' +
                '#library-item-browser-modal .libitem-card:hover,#library-item-browser-modal .libitem-card:focus{border-color:var(--accent,#60a5fa);outline:none}' +
                '#library-item-browser-modal .libitem-card-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}' +
                '#library-item-browser-modal .libitem-name{font-size:14px;color:#e0e0e0}' +
                '#library-item-browser-modal .libitem-desc{font-size:12px;color:#999;margin:0 0 8px;line-height:1.4}' +
                '#library-item-browser-modal .libitem-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:#aaa;align-items:center}' +
                '#library-item-browser-modal .libitem-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600}' +
                '#library-item-browser-modal .libitem-badge--verified{background:rgba(34,197,94,0.18);color:#22c55e}' +
                '#library-item-browser-modal .libitem-badge--installed{background:rgba(96,165,250,0.18);color:#60a5fa}' +
                '#library-item-browser-modal .libitem-badge--paid{background:rgba(251,191,36,0.2);color:#fbbf24}' +
                '#library-item-browser-modal .libitem-trust{padding:1px 6px;border-radius:3px;font-weight:600}' +
                '#library-item-browser-modal .libitem-trust--high{background:rgba(34,197,94,0.18);color:#22c55e}' +
                '#library-item-browser-modal .libitem-trust--mid{background:rgba(251,191,36,0.18);color:#fbbf24}' +
                '#library-item-browser-modal .libitem-trust--low{background:rgba(239,68,68,0.18);color:#ef4444}' +
                '#library-item-browser-modal .libitem-empty{grid-column:1/-1;text-align:center;padding:30px;color:#888;font-size:13px}' +
                '</style>' +
                '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                closeLibraryItemBrowser();
        });
    }
    modal.style.display = 'flex';
    let items = [];
    try {
        const filters = category ? { tags: [category] } : {};
        const res = await getMarketplaceCatalog('', filters);
        items = (res && res.items) || [];
        // No tag match in builtin catalog? fall back to full listing so the
        // drill-in is never an empty dead-end.
        if (items.length === 0 && category) {
            const all = await getMarketplaceCatalog('', {});
            items = (all && all.items) || [];
        }
        modal._isOffline = !!(res && res.isOffline);
    }
    catch (e: any) {
        log.warn('catalog fetch failed', e?.message || e);
        modal._isOffline = true;
        showToast(t('libitem.fetchError') || 'Could not load marketplace catalog', 'warning');
    }
    attachHandlers(modal, items);
    refresh(modal, items);
}
export function closeLibraryItemBrowser() {
    const modal = document.getElementById(MODAL_ID);
    if (modal)
        modal.style.display = 'none';
}
//# sourceMappingURL=libraryItemBrowser.js.map
//# sourceMappingURL=libraryItemBrowser.js.map
