// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   LIBRARY HUB MODAL — unified dashboard of all shareable/versionable
   categories in ECBT. Each row = category. Toggle activate/deactivate
   persists in localStorage. "Browse" opens marketplace_v2 (Supabase) for
   that category. "Publish" lets user upload their own version.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { LIBRARY_CATEGORIES, setActivationState, isCategoryActive } from '../../config/libraryCategories.js';
import { openLibraryItemBrowser } from './library/libraryItemBrowser.js';
import { exportCsv, csvDateSuffix } from '../helpers/csvExport.js';
const MODAL_ID = 'library-hub-modal';
let _filter = '';
let _statusFilter = 'all'; // all | active | inactive
const sourceMenuOutsideWired = new WeakSet();
const reputationButtonWired = new WeakSet();
/**
 * @typedef {Window & {
 *   handleOpenLibrary?: (payload: { category: string | null }) => void,
 *   handleOpenMarketplace?: (payload: { category: string | null }) => void,
 *   handlePublishToLibrary?: (payload: { category: string | null }) => void,
 *   handleOpenReputationModal?: () => void
 * }} LibraryHubWindow
 */
/** @param {import('../../config/libraryCategories.js').LibraryCategory} cat */
function categoryMatchesFilter(cat: any) {
    if (_filter) {
        const q = _filter.toLowerCase();
        const labelText = (t(cat.labelKey) || cat.labelKey).toLowerCase();
        if (!cat.id.includes(q) && !labelText.includes(q) && !cat.description.toLowerCase().includes(q)) {
            return false;
        }
    }
    if (_statusFilter === 'active' && !isCategoryActive(cat.id)) return false;
    if (_statusFilter === 'inactive' && isCategoryActive(cat.id)) return false;
    return true;
}
// AGPL §13: when the software is operated as a network service, source
// code must be made conspicuously available to remote users. Each library
// category card therefore carries an inline "Source" affordance that opens
// the canonical repository path for that category — viewing, downloading
// the file directly, or copying the import URL. Pattern from VS Code's
// Extension Marketplace primary-action card + openDAW AGPL transparency.
const REPO_BASE = 'https://github.com/calvinsiost/ecbyts/tree/main/app/js/';
// eslint-disable-next-line
const RAW_BASE = 'https://raw.githubusercontent.com/calvinsiost/ecbyts/main/app/js/';
/** @param {import('../../config/libraryCategories.js').LibraryCategory} cat */
function repoUrlFor(cat: any) {
    return cat.discoveryPath ? REPO_BASE + cat.discoveryPath : REPO_BASE;
}
function renderTable() {
    const cats = LIBRARY_CATEGORIES.filter(categoryMatchesFilter);
    if (cats.length === 0) {
        return `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-tertiary,#888)">${escapeHtml(t('library.empty') || 'Nenhuma categoria')}</td></tr>`;
    }
    return cats
        .map((cat: any) => {
            const active = isCategoryActive(cat.id);
            const label = escapeHtml(t(cat.labelKey) || cat.labelKey);
            const id = escapeHtml(cat.id);
            const desc = escapeHtml(cat.description);
            const statusLabel = active
                ? escapeHtml(t('library.status.active') || 'Ativo')
                : escapeHtml(t('library.status.inactive') || 'Inativo');
            const statusClass = active ? 'libhub-status--active' : 'libhub-status--inactive';
            const premiumBadge = cat.premium ? '<span class="libhub-badge libhub-badge--premium">$</span>' : '';
            const versionBadge = cat.versioned
                ? '<span class="libhub-badge libhub-badge--versioned" title="Versioned">v</span>'
                : '';
            const shareBadge = cat.shareable
                ? '<span class="libhub-badge libhub-badge--shareable" title="Shareable">↗</span>'
                : '';
            const agplBadge = `<a class="libhub-badge libhub-badge--agpl" href="${escapeHtml(repoUrlFor(cat))}" target="_blank" rel="noopener" title="AGPL-3.0 source">AGPL</a>`;
            const browseBtnLabel = escapeHtml(t('library.browse') || 'Browse');
            const publishBtnLabel = escapeHtml(t('library.publish') || 'Publish');
            const addBtnLabel = escapeHtml(
                active ? t('library.remove') || 'Remove' : t('library.add') || 'Add to ECBT',
            );
            const addBtnClass = active ? 'libhub-add-btn--remove' : 'libhub-add-btn--add';
            const sourceBtnLabel = escapeHtml(t('library.source') || 'Source');
            const togglableAttr = cat.togglable ? '' : 'disabled title="Always-on category"';
            const addBtnHtml = `<button class="libhub-add-btn ecbt-btn ${addBtnClass}" data-cat="${id}" data-active="${active ? '1' : '0'}" ${togglableAttr}>${addBtnLabel}</button>`;
            const sourceMenuHtml =
                `<div class="libhub-source-wrap">` +
                `<button class="libhub-source-btn ecbt-btn ecbt-btn--ghost" data-cat="${id}" aria-haspopup="menu" aria-expanded="false" title="${escapeHtml(t('library.source.tooltip') || 'View open-source files (.js/.ts/.css/.html)')}">&lt;/&gt; ${sourceBtnLabel}</button>` +
                `<div class="libhub-source-menu" role="menu" hidden>` +
                `<a role="menuitem" href="${escapeHtml(repoUrlFor(cat))}" target="_blank" rel="noopener">${escapeHtml(t('library.source.viewGithub') || 'View on GitHub')}</a>` +
                `<button role="menuitem" class="libhub-source-download" data-cat="${id}" data-path="${escapeHtml(cat.discoveryPath || '')}">${escapeHtml(t('library.source.downloadZip') || 'Download .zip (source)')}</button>` +
                `<button role="menuitem" class="libhub-source-copy" data-path="${escapeHtml(cat.discoveryPath || '')}">${escapeHtml(t('library.source.copyImportPath') || 'Copy import path')}</button>` +
                `<a role="menuitem" href="${escapeHtml(REPO_BASE.replace('/app/js/', '/LICENSE'))}" target="_blank" rel="noopener">${escapeHtml(t('library.source.viewLicense') || 'View AGPL-3.0 license')}</a>` +
                `</div></div>`;
            return (
                `<tr class="${active ? 'libhub-row--installed' : 'libhub-row--available'}">` +
                `<td><span class="libhub-icon" data-icon="${escapeHtml(cat.icon)}"></span><strong class="libhub-cat-label">${label}</strong><br><small class="libhub-cat-desc">${desc}</small></td>` +
                `<td><code style="font-size:11px">${id}</code></td>` +
                `<td>${agplBadge}${shareBadge}${versionBadge}${premiumBadge}</td>` +
                `<td><span class="libhub-status ${statusClass}">${statusLabel}</span></td>` +
                `<td>${addBtnHtml}</td>` +
                `<td class="libhub-actions">${sourceMenuHtml} <button class="libhub-browse-btn ecbt-btn ecbt-btn--ghost" data-cat="${id}">${browseBtnLabel}</button> <button class="libhub-publish-btn ecbt-btn ecbt-btn--ghost" data-cat="${id}">${publishBtnLabel}</button></td>` +
                '</tr>'
            );
        })
        .join('');
}
function renderStats() {
    const total = LIBRARY_CATEGORIES.length;
    const active = LIBRARY_CATEGORIES.filter((c) => isCategoryActive(c.id)).length;
    const inactive = total - active;
    const shareable = LIBRARY_CATEGORIES.filter((c) => c.shareable).length;
    const premium = LIBRARY_CATEGORIES.filter((c) => c.premium).length;
    return `<div class="libhub-stat">${active}/${total} ${escapeHtml(t('library.status.active') || 'ativos')}</div>
            <div class="libhub-stat">${inactive} ${escapeHtml(t('library.status.inactive') || 'inativos')}</div>
            <div class="libhub-stat">${shareable} ${escapeHtml(t('library.shareable') || 'shareable')}</div>
            <div class="libhub-stat">${premium} ${escapeHtml(t('library.premium') || 'premium')}</div>`;
}
/** @param {HTMLElement} modal */
function attachEventHandlers(modal: HTMLElement) {
    // Add/Remove button (replaces standalone checkbox toggle — clearer UX per VS Code marketplace pattern)
    modal.querySelectorAll('.libhub-add-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', () => {
            const id = button.getAttribute('data-cat');
            const wasActive = button.getAttribute('data-active') === '1';
            if (!id) return;
            setActivationState(id, !wasActive);
            showToast(
                !wasActive
                    ? `${id} ${t('library.activatedToast') || 'adicionado ao ECBT'}`
                    : `${id} ${t('library.deactivatedToast') || 'removido do ECBT'}`,
                'success',
            );
            refresh(modal);
        });
    });
    // Source menu toggle (transparency = AGPL §13 — code visible at runtime)
    modal.querySelectorAll('.libhub-source-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            const wrap = button.closest('.libhub-source-wrap');
            const menu = wrap?.querySelector('.libhub-source-menu');
            if (!menu) return;
            const isOpen = !menu.hasAttribute('hidden');
            // Close all open menus first
            modal.querySelectorAll('.libhub-source-menu').forEach((m) => (m as HTMLElement).setAttribute('hidden', ''));
            modal.querySelectorAll('.libhub-source-btn').forEach((b) => (b as HTMLElement).setAttribute('aria-expanded', 'false'));
            if (!isOpen) {
                menu.removeAttribute('hidden');
                button.setAttribute('aria-expanded', 'true');
            }
        });
    });
    // Source: download zip — fetches raw files from GitHub
    modal.querySelectorAll('.libhub-source-download').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', async () => {
            const path = button.getAttribute('data-path');
            const id = button.getAttribute('data-cat');
            if (!path) {
                showToast(t('library.source.noPath') || 'Esta categoria não tem path discoverable', 'warning');
                return;
            }
            // Open GitHub's "Download as ZIP" via the API tarball endpoint
            const url = `https://github.com/calvinsiost/ecbyts/archive/refs/heads/main.zip`;
            window.open(url, '_blank');
            showToast(`${t('library.source.downloadStarted') || 'Download iniciado'} (${id}: app/js/${path})`, 'info');
        });
    });
    // Source: copy import path
    modal.querySelectorAll('.libhub-source-copy').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', async () => {
            const path = button.getAttribute('data-path');
            if (!path) return;
            const importPath = `import '/js/${path}';`;
            try {
                await navigator.clipboard.writeText(importPath);
                showToast(`${t('library.source.copiedToast') || 'Copiado'}: ${importPath}`, 'success');
            } catch {
                showToast(t('library.source.copyFailed') || 'Falha ao copiar — clipboard indisponível', 'error');
            }
        });
    });
    // Close source menus when clicking outside
    if (!sourceMenuOutsideWired.has(modal)) {
        /** @param {MouseEvent} modal */
        const outsideHandler = (e: MouseEvent) => {
            if (!(e.target instanceof Element) || !e.target.closest('.libhub-source-wrap')) {
                modal.querySelectorAll('.libhub-source-menu').forEach((m) => (m as HTMLElement).setAttribute('hidden', ''));
                modal.querySelectorAll('.libhub-source-btn').forEach((b) => (b as HTMLElement).setAttribute('aria-expanded', 'false'));
            }
        };
        modal.addEventListener('click', outsideHandler);
        sourceMenuOutsideWired.add(modal);
    }
    // Browse marketplace
    modal.querySelectorAll('.libhub-browse-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', () => {
            const id = button.getAttribute('data-cat');
            // Try to open library marketplace if handler exists
            const handler = window.handleOpenLibrary || window.handleOpenMarketplace;
            if (typeof handler === 'function') {
                handler({ category: id });
            } else {
                // V2 MVP: per-item drill-in view (was a dead-end toast in V1)
                openLibraryItemBrowser(id ? { category: id } : {});
            }
        });
    });
    // Publish
    modal.querySelectorAll('.libhub-publish-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', () => {
            const id = button.getAttribute('data-cat');
            const handler = window.handlePublishToLibrary;
            if (typeof handler === 'function') {
                handler({ category: id });
            } else {
                showToast(`${t('library.publishHint') || 'Publish'}: ${id} (marketplace v2 wire-up pending)`, 'info');
            }
        });
    });
    // Search filter
    const search = modal.querySelector('.libhub-search');
    if (search) {
        search.addEventListener('input', (e: Event) => {
            _filter = (e.target as HTMLInputElement).value;
            refresh(modal);
        });
    }
    // Status filter
    modal.querySelectorAll('.libhub-status-filter').forEach((btn) => {
        const button = btn as HTMLElement;
        btn.addEventListener('click', () => {
            _statusFilter = button.getAttribute('data-status') || 'all';
            modal.querySelectorAll('.libhub-status-filter').forEach((b) => (b as HTMLElement).classList.toggle('active', b === btn));
            refresh(modal);
        });
    });
    // Bulk actions
    const bulkOn = modal.querySelector('.libhub-bulk-on');
    const bulkOff = modal.querySelector('.libhub-bulk-off');
    if (bulkOn) {
        bulkOn.addEventListener('click', () => {
            LIBRARY_CATEGORIES.forEach((c) => c.togglable && setActivationState(c.id, true));
            showToast(t('library.bulkOnToast') || 'Todas as categorias ativadas', 'success');
            refresh(modal);
        });
    }
    if (bulkOff) {
        bulkOff.addEventListener('click', () => {
            LIBRARY_CATEGORIES.forEach((c) => c.togglable && setActivationState(c.id, false));
            showToast(t('library.bulkOffToast') || 'Todas as categorias desativadas', 'warning');
            refresh(modal);
        });
    }
    // Export CSV — exports filtered categories (respects search + status filter)
    const exportBtn = modal.querySelector('.libhub-export-csv') as HTMLButtonElement | null;
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            try {
                const filtered = LIBRARY_CATEGORIES.filter(categoryMatchesFilter);
                const headers = [
                    'id',
                    'label',
                    'description',
                    'active',
                    'premium',
                    'versioned',
                    'shareable',
                    'togglable',
                    'discoveryPath',
                ];
                const rows = filtered.map((cat: any) => [
                    cat.id,
                    t(cat.labelKey) || cat.labelKey,
                    cat.description || '',
                    isCategoryActive(cat.id) ? 'true' : 'false',
                    cat.premium ? 'true' : 'false',
                    cat.versioned ? 'true' : 'false',
                    cat.shareable ? 'true' : 'false',
                    cat.togglable ? 'true' : 'false',
                    cat.discoveryPath || '',
                ]);
                exportCsv(headers, rows, `ecbyts-library-categories-${csvDateSuffix()}`);
                showToast(`${t('library.exported') || 'CSV exportado'} (${filtered.length} categorias)`, 'success');
            } catch (e: any) {
                const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
                showToast(`Export CSV: ${msg}`, 'error');
            }
        });
    }
    // Reputation & Royalty Cascade dashboard (SPEC_REPUTATION_ROYALTY_CASCADE_BUILD)
    const repBtn = modal.querySelector('.libhub-reputation');
    if (repBtn && !reputationButtonWired.has(repBtn)) {
        reputationButtonWired.add(repBtn);
        repBtn.addEventListener('click', () => {
            const handler = window.handleOpenReputationModal;
            if (typeof handler === 'function') handler();
            else showToast(t('reputation.title') || 'Reputation & Royalties', 'info');
        });
    }
}
/** @param {HTMLElement} modal */
function refresh(modal: HTMLElement) {
    const tbody = modal.querySelector('.libhub-tbody');
    if (tbody) tbody.innerHTML = renderTable();
    const stats = modal.querySelector('.libhub-stats');
    if (stats) stats.innerHTML = renderStats();
    attachEventHandlers(modal);
}
export function openLibraryHubModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = escapeHtml(t('library.hub.title') || 'Library Hub');
        const desc = escapeHtml(
            t('library.hub.description') ||
                'Categorias de elementos compartilháveis e versionáveis no ECBT. Ative/desative o que está disponível na sua UI. Browse para descobrir novos itens na marketplace ou Publish para compartilhar os seus.',
        );
        const search = escapeHtml(t('library.search') || 'Filtrar categorias...');
        const colCat = escapeHtml(t('library.col.category') || 'Categoria');
        const colId = escapeHtml(t('library.col.id') || 'ID');
        const colFlags = escapeHtml(t('library.col.flags') || 'Flags');
        const colStatus = escapeHtml(t('library.col.status') || 'Status');
        const colToggle = escapeHtml(t('library.col.addRemove') || t('library.col.toggle') || 'Add/Remove');
        const colActions = escapeHtml(t('library.col.actions') || 'Ações');
        const agplNotice = escapeHtml(
            t('library.agplNotice') ||
                'Todo código exibido aqui é open-source AGPL-3.0. Clique em "Source" em qualquer linha para ver/baixar os arquivos .js/.ts/.css/.html que implementam essa categoria.',
        );
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl" style="max-width:1100px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            `<h2 class="libhub-title">${title}</h2>` +
            '<button class="libhub-close ecbt-btn" style="padding:4px 10px">&times;</button>' +
            '</div>' +
            `<p style="color:var(--text-tertiary,#888);font-size:12px;margin:0 0 8px">${desc}</p>` +
            `<div class="libhub-stats" style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;color:var(--text-tertiary,#888)"></div>` +
            '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
            `<input type="search" class="libhub-search" placeholder="${search}" style="flex:1;min-width:200px;padding:6px 8px;border-radius:4px;border:1px solid var(--border-color,#444);background:var(--bg-primary,#121220);color:var(--text-primary,#fff);font-size:12px">` +
            `<button class="libhub-status-filter active" data-status="all" style="padding:6px 10px;font-size:11px">${escapeHtml(t('library.filter.all') || 'Todos')}</button>` +
            `<button class="libhub-status-filter" data-status="active" style="padding:6px 10px;font-size:11px">${escapeHtml(t('library.filter.active') || 'Ativos')}</button>` +
            `<button class="libhub-status-filter" data-status="inactive" style="padding:6px 10px;font-size:11px">${escapeHtml(t('library.filter.inactive') || 'Inativos')}</button>` +
            `<button class="libhub-bulk-on ecbt-btn ecbt-btn--ghost" style="padding:6px 10px;font-size:11px">${escapeHtml(t('library.bulkOn') || 'Ativar tudo')}</button>` +
            `<button class="libhub-bulk-off ecbt-btn ecbt-btn--ghost" style="padding:6px 10px;font-size:11px">${escapeHtml(t('library.bulkOff') || 'Desativar tudo')}</button>` +
            `<button class="libhub-export-csv ecbt-btn ecbt-btn--ghost" style="padding:6px 10px;font-size:11px" title="${escapeHtml(t('library.exportCsvTitle') || 'Exporta a lista filtrada como CSV')}">${escapeHtml(t('library.exportCsv') || 'Export CSV')}</button>` +
            `<button class="libhub-reputation ecbt-btn ecbt-btn--ghost" style="padding:6px 10px;font-size:11px" aria-label="${escapeHtml(t('reputation.title') || 'Reputation & Royalties')}">${escapeHtml(t('reputation.title') || 'Reputation & Royalties')}</button>` +
            '</div>' +
            `<div class="libhub-agpl-notice" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:4px;padding:6px 10px;margin-bottom:10px;font-size:11px;color:var(--text-secondary,#aaa);display:flex;gap:8px;align-items:flex-start"><span style="color:#22c55e;font-weight:600;font-family:monospace">AGPL-3.0</span><span>${agplNotice}</span></div>` +
            '<div style="max-height:60vh;overflow-y:auto;border:1px solid var(--border-color,#333);border-radius:6px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
            '<thead style="position:sticky;top:0;background:var(--bg-secondary,#1a1a2a);z-index:1">' +
            `<tr class="libhub-thead-row"><th>${colCat}</th><th>${colId}</th><th style="width:80px">${colFlags}</th><th style="width:80px">${colStatus}</th><th style="width:110px">${colToggle}</th><th style="width:280px">${colActions}</th></tr>` +
            '</thead><tbody class="libhub-tbody"></tbody></table></div>' +
            '<style>' +
            // Force light text on dark dialog backdrop (overrides body light theme leak)
            '#library-hub-modal .ecbt-dialog { color:#e0e0e0; }' +
            '#library-hub-modal .libhub-title { margin:0; color:#e0e0e0; font-size:18px; font-weight:600; }' +
            '#library-hub-modal .libhub-cat-label { color:#e0e0e0; font-size:13px; }' +
            '#library-hub-modal .libhub-cat-desc { color:#999; font-size:11px; }' +
            '#library-hub-modal .libhub-thead-row th { color:#aaa; text-align:left; padding:8px; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }' +
            '#library-hub-modal table { color:#e0e0e0; }' +
            '#library-hub-modal table code { color:#9ca3af; background:rgba(255,255,255,0.05); padding:1px 4px; border-radius:3px; }' +
            '#library-hub-modal .libhub-search { color:#e0e0e0 !important; }' +
            '#library-hub-modal .libhub-status-filter { color:#aaa; }' +
            '#library-hub-modal .libhub-stats { color:#888; }' +
            '#library-hub-modal .libhub-stat { color:#aaa; }' +
            '.libhub-status { display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:600; }' +
            '.libhub-status--active { background:rgba(34,197,94,0.2); color:#22c55e; }' +
            '.libhub-status--inactive { background:rgba(156,163,175,0.2); color:#9ca3af; }' +
            '.libhub-badge { display:inline-block; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:600; margin-right:3px; }' +
            '.libhub-badge--premium { background:rgba(251,191,36,0.2); color:#fbbf24; }' +
            '.libhub-badge--versioned { background:rgba(96,165,250,0.2); color:#60a5fa; }' +
            '.libhub-badge--shareable { background:rgba(168,85,247,0.2); color:#a855f7; }' +
            '.libhub-toggle { position:relative; display:inline-block; width:36px; height:20px; }' +
            '.libhub-toggle input { opacity:0; width:0; height:0; }' +
            '.libhub-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#444; transition:.2s; border-radius:20px; }' +
            '.libhub-slider:before { position:absolute; content:""; height:14px; width:14px; left:3px; bottom:3px; background:white; transition:.2s; border-radius:50%; }' +
            '.libhub-toggle input:checked + .libhub-slider { background:#22c55e; }' +
            '.libhub-toggle input:checked + .libhub-slider:before { transform:translateX(16px); }' +
            '.libhub-status-filter { padding:4px 10px; background:transparent; border:1px solid var(--border-color,#444); color:var(--text-secondary,#aaa); border-radius:4px; cursor:pointer; }' +
            '.libhub-status-filter.active { background:var(--accent,#60a5fa); color:#fff; border-color:transparent; }' +
            '.libhub-stat { padding:4px 10px; background:rgba(255,255,255,0.05); border-radius:4px; }' +
            '.libhub-icon { display:inline-block; width:16px; height:16px; vertical-align:text-bottom; margin-right:6px; }' +
            '.libhub-pin { font-size:14px; opacity:0.6; }' +
            // Add/Remove primary action (VS Code-style)
            '.libhub-add-btn { padding:5px 12px; font-size:11px; font-weight:600; border-radius:4px; cursor:pointer; border:1px solid transparent; min-width:90px; }' +
            '.libhub-add-btn--add { background:var(--accent,#60a5fa); color:#fff; border-color:var(--accent,#60a5fa); }' +
            '.libhub-add-btn--add:hover { filter:brightness(1.1); }' +
            '.libhub-add-btn--remove { background:transparent; color:#ef4444; border-color:#ef4444; }' +
            '.libhub-add-btn--remove:hover { background:rgba(239,68,68,0.1); }' +
            '.libhub-add-btn:disabled { opacity:0.5; cursor:not-allowed; }' +
            // Source dropdown
            '.libhub-source-wrap { position:relative; display:inline-block; }' +
            '.libhub-source-menu { position:absolute; top:100%; left:0; margin-top:2px; background:#1a1a2a; border:1px solid #444; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.6); min-width:220px; z-index:100; padding:4px 0; }' +
            '.libhub-source-menu[hidden] { display:none; }' +
            '.libhub-source-menu > * { display:block; padding:8px 14px; font-size:12px; color:#e0e0e0; background:transparent; border:0; width:100%; text-align:left; cursor:pointer; text-decoration:none; font-family:inherit; }' +
            '.libhub-source-menu > *:hover { background:rgba(96,165,250,0.12); color:#60a5fa; }' +
            // AGPL badge linkable
            '.libhub-badge--agpl { background:rgba(34,197,94,0.15); color:#22c55e; text-decoration:none; font-family:monospace; padding:1px 6px; }' +
            '.libhub-badge--agpl:hover { background:rgba(34,197,94,0.25); }' +
            // Row state indicators
            '.libhub-row--installed { background:rgba(34,197,94,0.04); }' +
            '.libhub-row--installed td:first-child { border-left:3px solid #22c55e; }' +
            '.libhub-row--available td:first-child { border-left:3px solid transparent; }' +
            '.libhub-actions { white-space:nowrap; }' +
            'table tbody tr:hover { background:rgba(255,255,255,0.03); }' +
            'table td { padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:top; }' +
            '</style>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeLibraryHubModal();
        });
        const closeBtn = modal.querySelector('.libhub-close');
        if (closeBtn) closeBtn.addEventListener('click', closeLibraryHubModal);
    }
    modal.style.display = 'flex';
    refresh(modal);
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('libraries');
}
export function closeLibraryHubModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        modal.style.display = 'none';
        clearDeepLinkUrl();
    }
}
//# sourceMappingURL=libraryHubModal.js.map
