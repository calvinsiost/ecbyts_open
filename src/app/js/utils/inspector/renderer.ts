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
   JSON INSPECTOR — Panel Renderer
   Renderizador do painel inspetor JSON.

   Cria o DOM do painel, gerencia visibilidade, resize,
   busca e chama o treeBuilder para montar a arvore.
   ================================================================ */
import { getIcon, hydrateIcons } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { CONFIG } from '../../config.js';
import { getInspectorConfig, setInspectorHeight, setInspectorCollapsed, setSearchQuery, setInspectorTab, expandPathTo, } from './manager.js';
import { buildInspectorTree } from './treeBuilder.js';
import { buildModel } from '../../core/io/export.js';
import { getSelectedElement, getAllElements } from '../../core/elements/manager.js';
import { getDiff, getElementProvenanceFromHistory, getHistory as getVizInspectorHistory, revertCommit, } from '../../core/vizInspector/index.js';
import { renderCommitTimeline } from '../ui/vizInspector/commitTimeline.js';
import { renderDiffViewer } from '../ui/vizInspector/diffViewer.js';
/** @type {any} */
let panel: any = null;
/** @type {any} */
let _searchTimeout: any = null;
let _historyRenderSeq = 0;
installInspectorFallbackBridge();
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Create the inspector panel DOM and append to #left-panel-content (bottom-docked).
 * Cria o painel do inspetor e adiciona ao fundo do painel esquerdo.
 */
export function initInspectorPanel() {
    // INSPECTOR-CONSTELLATION-TAB (2026-06-02, Calvin pedido 2):
    // Inspector vira ABA dentro do constellation hub, ao lado de Storyboard,
    // em vez de painel flutuante (revisão do pedido anterior). Container
    // canônico = #constellation-view-inspector (declarado em index.html).
    const container =
        document.getElementById('constellation-view-inspector') ||
        document.getElementById('left-panel-content'); // fallback compat
    if (panel) {
        if (container && panel.parentElement !== container) {
            container.appendChild(panel);
            // Remove classe floating residual de versões anteriores
            panel.classList.remove('inspector-panel--floating');
            panel.classList.add('inspector-panel--constellation');
        }
        return;
    }
    if (!container) return;
    panel = document.createElement('div');
    panel.id = 'inspector-panel';
    panel.className = 'inspector-panel inspector-panel--constellation';
    panel.innerHTML = buildPanelHTML();
    container.appendChild(panel);
    setupResizeHandle();
    setupSearchInput();
    setupDelegatedEvents();
    setupHeaderCollapse();
    // Apply initial state
    const config = getInspectorConfig();
    panel.style.height = config.height + 'px';
    if (config.collapsed) {
        panel.classList.add('collapsed');
    }
}
function installInspectorFallbackBridge() {
    if (typeof window === 'undefined')
        return;
    if (typeof window.handleToggleInspector === 'function')
        return;
    window.handleToggleInspector = function handleToggleInspectorFallback() {
        const config = getInspectorConfig();
        setInspectorCollapsed(!config.collapsed);
        initInspectorPanel();
        renderInspector();
        window.dispatchEvent(new CustomEvent('inspectorChanged'));
    };
}
/**
 * Build the panel's static HTML structure.
 * Monta estrutura HTML estatica do painel.
 */
function buildPanelHTML() {
    return `
        <div class="inspector-resize-handle"></div>
        <div class="inspector-header">
            <div class="inspector-title">
                <span class="inspector-title-icon">${getIcon('braces', { size: '14px' })}</span>
                <span data-i18n="inspector">Inspector</span>
            </div>
            <div class="inspector-header-actions">
                <input type="text"
                       class="inspector-search"
                       id="inspector-search"
                       name="inspector-search"
                       aria-label="${t('searchInspector') || 'Search...'}"
                       placeholder="${t('searchInspector') || 'Search...'}"
                       spellcheck="false">
                <button class="inspector-hdr-btn" data-action="expand-all" title="${t('expandAll') || 'Expand All'}">
                    ${getIcon('chevrons-down', { size: '14px' })}
                </button>
                <button class="inspector-hdr-btn" data-action="collapse-all" title="${t('collapseAll') || 'Collapse All'}">
                    ${getIcon('chevrons-up', { size: '14px' })}
                </button>
                ${CONFIG.FEATURES?.COMMUNITY_ENRICHMENT !== false
        ? `<button class="inspector-hdr-btn" data-action="suggest-enrichment" title="${t('suggestEnrichment') || 'Suggest Enrichment'}">${getIcon('sparkles', { size: '14px' })}</button>`
        : ''}
                <button class="inspector-hdr-btn" data-action="close" title="Close (Ctrl+J)">
                    ${getIcon('x', { size: '14px' })}
                </button>
            </div>
        </div>
        <div class="inspector-tabs" role="tablist" aria-label="Inspector views">
            <button type="button" class="inspector-tab" data-inspector-tab="json" role="tab">
                ${t('inspector') || 'Inspector'}
            </button>
            <button type="button" class="inspector-tab" data-inspector-tab="history" role="tab">
                ${t('vizInspector.historyTab') || 'History'}
            </button>
            <button type="button" class="inspector-tab" data-inspector-tab="provenance" role="tab">
                ${t('vizInspector.provenanceTab') || 'Provenance'}
            </button>
        </div>
        <div class="inspector-breadcrumb" id="inspector-breadcrumb"></div>
        <div class="inspector-body" id="inspector-body"></div>
    `;
}
// ----------------------------------------------------------------
// RENDERING
// ----------------------------------------------------------------
/**
 * Render the inspector tree based on current selection.
 * Renderiza a arvore do inspetor conforme elemento selecionado.
 */
export function renderInspector() {
    if (!panel)
        return;
    const config = getInspectorConfig();
    // Apply collapsed state
    panel.classList.toggle('collapsed', !!config.collapsed);
    if (!config.collapsed) {
        panel.style.height = config.height + 'px';
    }
    // Update toolbar button state
    const btn = document.getElementById('toggle-inspector-btn');
    if (btn)
        btn.classList.toggle('active', !config.collapsed);
    if (config.collapsed)
        return; // Don't rebuild tree while collapsed
    const body = panel.querySelector('#inspector-body');
    if (!body)
        return;
    updateTabState(config.activeTab);
    // Resolve selected element index for highlighting
    const selected = getSelectedElement();
    const allEls = getAllElements();
    let selectedPath: any = null;
    let selectedIdx = -1;
    if (selected) {
        selectedIdx = allEls.indexOf(selected);
        if (selectedIdx >= 0) {
            selectedPath = `model.elements.${selectedIdx}`;
            // Auto-expand ancestors so the selected element node is visible
            expandPathTo(selectedPath);
        }
    }
    if (config.activeTab === 'history') {
        updateBreadcrumb(t('vizInspector.historyTab') || 'History');
        renderHistoryTab(body);
        return;
    }
    if (config.activeTab === 'provenance') {
        updateBreadcrumb(selected
            ? `${t('vizInspector.provenanceTab') || 'Provenance'} - ${selected.name || selected.id}`
            : t('vizInspector.provenanceTab') || 'Provenance');
        renderProvenanceTab(body, selected);
        return;
    }
    // Always show the full model export JSON
    const model = /** @type {{ project?: { name?: string } }} */ (buildModel());
    const elementIds = allEls.map((/** @type {any} */ e) => e.id);
    const html = buildInspectorTree(model, 'model', selectedPath, elementIds);
    updateBreadcrumb(selected
        ? `model.elements.${selectedIdx} — ${selected.name || selected.id}`
        : 'model — ' + (model.project?.name || 'ecbyts'));
    body.innerHTML = html;
    hydrateIcons(body);
    // Scroll to the selected element node
    if (selectedPath) {
        const selectedNode = body.querySelector('.inspector-node-selected');
        if (selectedNode) {
            selectedNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}
/**
 * Update breadcrumb bar text.
 * Atualiza texto da barra de navegacao (breadcrumb).
 */
function updateBreadcrumb(text: any) {
    const bc = panel?.querySelector('#inspector-breadcrumb');
    if (bc)
        bc.textContent = text;
}
function updateTabState(activeTab: any) {
    const tabs = panel?.querySelectorAll('[data-inspector-tab]') || [];
    for (const tab of tabs) {
        const active = tab.dataset.inspectorTab === activeTab;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
}
function renderHistoryTab(body: any) {
    const seq = ++_historyRenderSeq;
    body.innerHTML = `<div class="inspector-empty">${t('loading') || 'Loading...'}</div>`;
    getVizInspectorHistory({ limit: 100 })
        .then((/** @type {any} */ commits) => {
        if (seq !== _historyRenderSeq)
            return;
        body.innerHTML = '';
        const host = document.createElement('div');
        host.className = 'inspector-history-host';
        body.appendChild(host);
        renderCommitTimeline(host, commits, {
            onSelect: (commit: any) => renderCommitDiffPreview(host, commit),
            onRevert: (commit: any) => renderCommitRevertPreview(host, commit),
        });
    })
        .catch((/** @type {any} */ error) => {
        if (seq !== _historyRenderSeq)
            return;
        body.innerHTML = `<div class="inspector-empty">${escapeHtml(error?.message || 'History unavailable')}</div>`;
    });
}
function renderCommitDiffPreview(host: any, commit: any) {
    const details = ensureHistoryDetails(host);
    details.innerHTML = `<div class="inspector-history-details-title">${escapeHtml(commit.message || commit.id || '')}</div>`;
    getDiff(commit)
        .then(() => {
        const before = commit.changes?.map((change: any) => change.before).filter(Boolean) || [];
        const after = commit.changes?.map((change: any) => change.after).filter(Boolean) || [];
        renderDiffViewer(details, before, after, { mode: 'unified' });
    })
        .catch((/** @type {any} */ error) => {
        details.innerHTML += `<div class="inspector-empty">${escapeHtml(error?.message || 'Diff unavailable')}</div>`;
    });
}
function renderCommitRevertPreview(host: any, commit: any) {
    const details = ensureHistoryDetails(host);
    details.innerHTML = `<div class="inspector-history-details-title">${escapeHtml(commit.message || commit.id || '')}</div>`;
    revertCommit(commit, { markReverted: false })
        .then((/** @type {any} */ { preview, revertOps }) => {
        const affected = revertOps
            .map((/** @type {any} */ op) => op.elementId)
            .filter(Boolean)
            .join(', ');
        details.innerHTML += `
                <div class="inspector-revert-preview">
                    <span>${escapeHtml(t('commitTimeline.action.revert') || 'Revert')}</span>
                    <span>+${preview.added || 0}</span>
                    <span>~${preview.modified || 0}</span>
                    <span>-${preview.deleted || 0}</span>
                    <span>${escapeHtml(affected || '0')}</span>
                </div>
            `;
    })
        .catch((/** @type {any} */ error) => {
        details.innerHTML += `<div class="inspector-empty">${escapeHtml(error?.message || 'Revert unavailable')}</div>`;
    });
}
function ensureHistoryDetails(host: any) {
    let details = host.querySelector('.inspector-history-details');
    if (!details) {
        details = document.createElement('div');
        details.className = 'inspector-history-details';
        host.appendChild(details);
    }
    details.innerHTML = '';
    return details;
}
function renderProvenanceTab(body: any, selected: any) {
    if (!selected?.id) {
        body.innerHTML = `<div class="inspector-empty">${t('selectElementFirst') || 'Select an element first'}</div>`;
        return;
    }
    body.innerHTML = `<div class="inspector-empty">${t('loading') || 'Loading...'}</div>`;
    getElementProvenanceFromHistory(selected.id)
        .then((/** @type {any} */ provenance) => {
        const created = provenance.createdInCommit;
        const last = provenance.lastChangedInCommit;
        const changes = provenance.changes || [];
        const bindingsSummary = buildBindingsSummaryRow(selected.id);
        body.innerHTML = `
                <div class="inspector-provenance">
                    <div class="inspector-provenance-row"><span>ID</span><strong>${escapeHtml(selected.id)}</strong></div>
                    <div class="inspector-provenance-row"><span>Created</span><strong>${escapeHtml(created?.message || '-')}</strong></div>
                    <div class="inspector-provenance-row"><span>Last change</span><strong>${escapeHtml(last?.message || '-')}</strong></div>
                    ${bindingsSummary}
                    <ol class="inspector-provenance-list">
                        ${changes
            .map((/** @type {any} */ entry) => `
                                    <li>
                                        <span>${escapeHtml(entry.author?.label || entry.commit.authorId || '')}</span>
                                        <strong>${escapeHtml(entry.change.changeType || '')}</strong>
                                        <em>${escapeHtml(entry.commit.message || entry.commit.id || '')}</em>
                                    </li>
                                `)
            .join('')}
                    </ol>
                </div>
            `;
    })
        .catch((/** @type {any} */ error) => {
        body.innerHTML = `<div class="inspector-empty">${escapeHtml(error?.message || 'Provenance unavailable')}</div>`;
    });
}
/**
 * Build a read-only "Bindings" summary row for the provenance tab.
 * Resumo somente-leitura dos bindings da entidade selecionada
 * (SPEC TIER3-FEATURES-001 / B7). Aditivo e tolerante a falha.
 *
 * @param {string} entityId - ID da entidade selecionada
 * @returns {string} HTML de uma linha de provenance (vazio se indisponivel)
 */
function buildBindingsSummaryRow(entityId: any) {
    try {
        const fn = window.handleEntityBindingsSummary;
        if (typeof fn !== 'function')
            return '';
        const s = fn(entityId) || {};
        const count = Number(s.bindingCount) || 0;
        const label = t('bindingsSummary') || 'Bindings';
        const value = count > 0
            ? `${count}${s.types?.length ? ` (${escapeHtml(s.types.join(', '))})` : ''}`
            : t('bindingsNone') || 'None';
        return `<div class="inspector-provenance-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    } catch (e: any) {
        console.debug('[inspector:bindingsSummary]', e?.message || e);
        return '';
    }
}
import { escapeHtmlFull as _escapeHtmlFull } from '../helpers/html.js';
function escapeHtml(value: any) {
    return _escapeHtmlFull(value);
}
// ----------------------------------------------------------------
// VISIBILITY
// ----------------------------------------------------------------
/**
 * Set panel visibility with animation.
 * Define visibilidade do painel com animacao.
 */
export function setInspectorPanelVisible(_visible: any) {
    // Panel is always docked; use renderInspector to update collapsed state
    renderInspector();
}
// ----------------------------------------------------------------
// RESIZE HANDLE
// ----------------------------------------------------------------
function setupResizeHandle() {
    const handle = panel.querySelector('.inspector-resize-handle');
    if (!handle)
        return;
    let startY = 0;
    let startHeight = 0;
    function onMouseDown(e: MouseEvent) {
        e.preventDefault();
        startY = e.clientY;
        startHeight = panel.offsetHeight;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }
    function onMouseMove(e: MouseEvent) {
        // Dragging top edge upward increases height
        const delta = startY - e.clientY;
        const newHeight = Math.max(120, Math.min(500, startHeight + delta));
        panel.style.height = newHeight + 'px';
    }
    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setInspectorHeight(panel.offsetHeight);
    }
    handle.addEventListener('mousedown', onMouseDown);
}
function setupHeaderCollapse() {
    const header = panel.querySelector('.inspector-header');
    if (!header)
        return;
    header.style.cursor = 'pointer';
    header.addEventListener('click', (e: any) => {
        // Don't collapse when clicking action buttons or search input
        if (e.target.closest('.inspector-hdr-btn') || e.target.closest('.inspector-search'))
            return;
        const config = getInspectorConfig();
        setInspectorCollapsed(!config.collapsed);
        renderInspector();
    });
}
// ----------------------------------------------------------------
// SEARCH INPUT
// ----------------------------------------------------------------
function setupSearchInput() {
    /** @type {any} */
    const input = panel.querySelector('.inspector-search');
    if (!input)
        return;
    input.addEventListener('input', () => {
        clearTimeout(_searchTimeout);
        _searchTimeout = setTimeout(() => {
            setSearchQuery(input.value);
            renderInspector();
            // Restore focus and cursor position
            input.focus();
        }, 250);
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            input.value = '';
            setSearchQuery('');
            renderInspector();
            input.focus();
        }
        e.stopPropagation(); // Prevent global shortcuts while typing
    });
}
// ----------------------------------------------------------------
// DELEGATED EVENTS
// ----------------------------------------------------------------
function setupDelegatedEvents() {
    // Click delegation on the body for toggle, edit, copy, etc.
    panel.addEventListener('click', (e: any) => {
        const tab = e.target.closest('[data-inspector-tab]');
        if (tab) {
            setInspectorTab(tab.dataset.inspectorTab);
            renderInspector();
            return;
        }
        // Toggle node expand/collapse
        const toggle = e.target.closest('.inspector-toggle');
        if (toggle) {
            const path = toggle.dataset.path || '';
            if (path)
                window.handleToggleNode?.(path);
            return;
        }
        // Header action buttons
        const hdrBtn = e.target.closest('.inspector-hdr-btn');
        if (hdrBtn) {
            const action = hdrBtn.dataset.action || '';
            if (action === 'expand-all')
                window.handleExpandAllNodes?.();
            else if (action === 'collapse-all')
                window.handleCollapseAllNodes?.();
            else if (action === 'suggest-enrichment') {
                const sel = getSelectedElement();
                window.handleSuggestEnrichment?.(sel?.id || '');
            }
            else if (action === 'close')
                window.handleToggleInspector?.();
            return;
        }
        // Don't trigger selection while editing an inline input
        if (e.target.tagName === 'INPUT')
            return;
        // Click on element node → select in 3D viewport
        const node = e.target.closest('.inspector-node[data-element-id]');
        if (node) {
            const elementId = node.dataset.elementId || '';
            if (elementId) {
                window.handleSelectElement?.(elementId);
            }
        }
    });
    // Double-click to start editing
    panel.addEventListener('dblclick', (e: any) => {
        const valueSpan = e.target.closest('.inspector-value[data-editable="true"]');
        if (valueSpan) {
            const path = valueSpan.dataset.path || '';
            if (path)
                window.handleStartEdit?.(path);
        }
    });
    // Right-click context menu for add/delete
    panel.addEventListener('contextmenu', (e: any) => {
        const node = e.target.closest('.inspector-node');
        if (node) {
            e.preventDefault();
            const path = node.dataset.path || '';
            const type = node.dataset.type || '';
            if (path)
                window.handleInspectorContextMenu?.(e, path, type);
        }
    });
    // Breadcrumb click to copy path
    const bc = panel.querySelector('#inspector-breadcrumb');
    if (bc) {
        bc.addEventListener('click', () => {
            window.handleCopyPath?.('model');
        });
    }
    // Prevent global keyboard shortcuts when editing inside inspector
    panel.addEventListener('keydown', (e: any) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.stopPropagation();
        }
    });
}
//# sourceMappingURL=renderer.js.map
//# sourceMappingURL=renderer.js.map
