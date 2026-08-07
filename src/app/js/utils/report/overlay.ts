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
   REPORT OVERLAY — Full-screen document editor
   Editor de relatorio em tela cheia com TOC, split-screen, read mode

   Cria overlay absoluto sobre o #main-area. Reparenta o editor
   contenteditable entre o HUD Constellation e o overlay.
   Lazy-loaded na primeira abertura via dynamic import.
   ================================================================ */
import { getReport, setReportTitle } from './manager.js';
import { getEditorElement, reparentEditor, isReadOnly, initReportEditor } from './editor.js';
import { handleResize } from '../scene/setup.js';
import { getIcon } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { buildProvenanceSummaryBadge } from './provenanceMaskModel.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let overlayEl: HTMLElement | null = null;
let titleInput: HTMLInputElement | null = null;
let bodyEl: HTMLElement | null = null;
let documentEl: HTMLElement | null = null;
let tocContainer: HTMLElement | null = null;
let progressBar: HTMLElement | null = null;
let dividerEl: HTMLElement | null = null;
let isVisible = false;
let isSplitMode = false;
let tocModule: any = null; // lazy-loaded
let hudInlineDisplayBeforeOverlay: string | null = null;
let provenanceBadgeEl: HTMLElement | null = null; // SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK
// ----------------------------------------------------------------
// INITIALIZATION
// Cria DOM do overlay uma unica vez (padrao inspector/renderer.js)
// ----------------------------------------------------------------
/**
 * Initialize the report overlay DOM.
 * Cria estrutura do overlay e appenda no #main-area.
 */
function _ensureOverlayDOM() {
    if (overlayEl) return;
    const mainArea = document.getElementById('main-area');
    if (!mainArea) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'report-overlay';
    overlayEl.className = 'report-overlay';
    // ---- Header bar ----
    const header = document.createElement('div');
    header.className = 'report-overlay-header';
    // Back button
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'report-overlay-back';
    backBtn.innerHTML = `${getIcon('arrow-left', { size: '14px' })} ${t('reportClose') || 'Voltar'}`;
    backBtn.addEventListener('click', () => hideOverlay());
    header.appendChild(backBtn);
    // Title input
    titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'report-overlay-title';
    titleInput.placeholder = t('reportTitlePlaceholder') || 'Titulo do Relatorio';
    titleInput.addEventListener('input', () => setReportTitle(titleInput?.value || ''));
    header.appendChild(titleInput);
    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'report-overlay-actions';
    // TOC toggle
    const tocBtn = _createBtn('report-toc-btn', t('reportTOC') || 'TOC', getIcon('list', { size: '13px' }), () =>
        _toggleToc(),
    );
    // Read/Edit toggle
    const readBtn = _createBtn('report-read-btn', t('reportReadMode') || 'Ler', getIcon('eye', { size: '13px' }), () =>
        window.handleToggleReportReadMode?.(),
    );
    // Split toggle
    const splitBtn = _createBtn(
        'report-split-btn',
        t('reportSplitScreen') || 'Split',
        getIcon('columns', { size: '13px' }),
        () => window.handleToggleReportSplit?.(),
    );
    // Export (PDF/DOCX picker)
    const pdfBtn = _createBtn(
        'report-pdf-btn',
        t('exportReport') || 'Export',
        getIcon('download', { size: '13px' }),
        () => window.handleExportReport?.(),
    );
    // Close
    const closeBtn = _createBtn('report-close-btn', '', getIcon('x', { size: '14px' }), () => hideOverlay());
    closeBtn.title = t('reportClose') || 'Fechar';
    // SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK — authorship badge (non-color-only)
    provenanceBadgeEl = document.createElement('span');
    provenanceBadgeEl.id = 'report-provenance-badge';
    provenanceBadgeEl.className = 'report-overlay-provenance-badge';
    provenanceBadgeEl.setAttribute('role', 'status');
    provenanceBadgeEl.setAttribute('aria-live', 'polite');
    provenanceBadgeEl.title = t('report.provenance.tooltip') || 'Atribuição de autoria (Humano/IA/Misto)';
    actions.append(tocBtn, readBtn, splitBtn, pdfBtn, provenanceBadgeEl, closeBtn);
    header.appendChild(actions);
    // ---- Body (TOC + document) ----
    bodyEl = document.createElement('div');
    bodyEl.className = 'report-overlay-body';
    // TOC sidebar (populado pelo toc.js)
    tocContainer = document.createElement('div');
    tocContainer.className = 'report-toc collapsed';
    tocContainer.id = 'report-toc';
    // Document wrapper
    documentEl = document.createElement('div');
    documentEl.className = 'report-document';
    bodyEl.appendChild(tocContainer);
    bodyEl.appendChild(documentEl);
    // ---- Split divider ----
    dividerEl = document.createElement('div');
    dividerEl.className = 'report-split-divider';
    _setupDividerDrag(dividerEl);
    // ---- Progress bar ----
    const progressWrap = document.createElement('div');
    progressWrap.className = 'report-progress';
    progressBar = document.createElement('div');
    progressBar.className = 'report-progress-bar';
    progressWrap.appendChild(progressBar);
    // ---- Assemble ----
    overlayEl.appendChild(header);
    overlayEl.appendChild(bodyEl);
    overlayEl.appendChild(dividerEl);
    overlayEl.appendChild(progressWrap);
    mainArea.appendChild(overlayEl);
    // ---- Keyboard shortcuts ----
    overlayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            hideOverlay();
        }
    });
}
function _createBtn(id: string, text: string, icon: string, onClick: (event: MouseEvent) => void) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'report-overlay-btn';
    if (text) btn.textContent = text;
    btn.innerHTML = icon + (text ? ` ${text}` : '');
    btn.addEventListener('click', onClick);
    return btn;
}
// ----------------------------------------------------------------
// SHOW / HIDE
// Abre/fecha overlay reparentando o editor contenteditable
// ----------------------------------------------------------------
/**
 * Show the report overlay in full-screen mode.
 * Reparenta editor para overlay, atualiza titulo, inicia TOC.
 */
export function showOverlay() {
    _ensureOverlayDOM();
    if (isVisible) return;
    // Garante que editor foi inicializado
    const editorEl = getEditorElement();
    if (!editorEl) {
        // Precisa inicializar o editor primeiro
        const container = document.getElementById('report-editor-container');
        if (container && !container.dataset.initialized) {
            initReportEditor(container);
            container.dataset.initialized = 'true';
        }
    }
    // Sync titulo
    const report: any = getReport();
    if (titleInput) titleInput.value = report.title || '';
    if (!documentEl || !overlayEl) return;
    const currentOverlay = overlayEl;
    // Reparent editor + toolbar para overlay document area
    reparentEditor(documentEl);
    // Esconde constellation HUD para evitar sobreposicao no split
    const hud = document.getElementById('constellation-hud');
    if (hud) {
        hudInlineDisplayBeforeOverlay = hud.style.display;
        hud.style.display = 'none';
    }
    // Mostra overlay
    isVisible = true;
    currentOverlay.classList.add('visible');
    currentOverlay.tabIndex = -1;
    currentOverlay.focus();
    // Setup scroll progress
    _setupScrollProgress();
    // Lazy-load e atualiza TOC
    _updateToc();
    // Update read mode button state
    _syncReadModeBtn();
    // SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK — sync badge ao abrir
    syncProvenanceBadge();
}

/**
 * SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK F2-wiring: atualiza o badge de autoria.
 * Reusa buildProvenanceSummaryBadge (F2-helper) sem duplicar lógica.
 * Caller (manager.js / save handler) chama após edits para refresh.
 */
export function syncProvenanceBadge() {
    if (!provenanceBadgeEl) return;
    const report: any = getReport();
    const reportProv = report?.provenance;
    if (!reportProv || typeof reportProv !== 'object') {
        provenanceBadgeEl.textContent = '';
        provenanceBadgeEl.dataset.tone = '';
        provenanceBadgeEl.hidden = true;
        return;
    }
    let summary;
    try {
        summary = buildProvenanceSummaryBadge(reportProv);
    } catch (e: any) {
        console.debug('[report:provenance-badge]', e?.message || e);
        provenanceBadgeEl.hidden = true;
        return;
    }
    const dominantTone =
        summary.ai.pct >= summary.human.pct && summary.ai.pct >= summary.mixed.pct
            ? 'ai'
            : summary.mixed.pct > summary.human.pct
              ? 'mixed'
              : 'human';
    const tone = summary[dominantTone];
    provenanceBadgeEl.hidden = false;
    provenanceBadgeEl.dataset.tone = dominantTone;
    const labelText = t(tone.labelKey) || dominantTone;
    const pct = tone.pct.toFixed(1);
    provenanceBadgeEl.textContent = `${labelText} ${pct}%`.trim();
}
/**
 * Hide the report overlay and return editor to constellation.
 * Reparenta editor de volta para o container da constellation.
 */
export function hideOverlay() {
    if (!isVisible || !overlayEl) return;
    isVisible = false;
    overlayEl.classList.remove('visible');
    // Reparent editor de volta para constellation
    const container = document.getElementById('report-editor-container');
    if (container) {
        reparentEditor(container);
    }
    // Restaura constellation HUD
    const hud = document.getElementById('constellation-hud');
    if (hud) {
        hud.style.display = hudInlineDisplayBeforeOverlay ?? '';
    }
    hudInlineDisplayBeforeOverlay = null;
    // Sair do split mode se ativo
    if (isSplitMode) toggleSplit();
}
/**
 * Check if overlay is visible.
 * @returns {boolean}
 */
export function isOverlayVisible() {
    return isVisible;
}
// ----------------------------------------------------------------
// SPLIT SCREEN
// Alterna entre full-screen e split com viewport 3D
// ----------------------------------------------------------------
/**
 * Toggle split-screen mode.
 * Em split, overlay cobre metade direita; viewport 3D fica na esquerda.
 */
export function toggleSplit() {
    if (!overlayEl) return;
    isSplitMode = !isSplitMode;
    overlayEl.classList.toggle('report-split-mode', isSplitMode);
    // Sync botao
    const splitBtn = overlayEl.querySelector('#report-split-btn');
    if (splitBtn) splitBtn.classList.toggle('active', isSplitMode);
    // Resize canvas 3D
    requestAnimationFrame(() => {
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) handleResize(canvasContainer);
    });
}

/**
 * Garante o modo split quando uma cena do scrollytelling dispara.
 * Sem isto, o overlay fullscreen cobre o canvas e o usuário não vê a câmera
 * 3D mexer ("o modelo some" — BUG-7). Idempotente: no-op se o report não está
 * aberto ou já está em split.
 */
export function ensureReportSplitMode() {
    if (!isVisible || isSplitMode) return;
    toggleSplit();
}
// ----------------------------------------------------------------
// TABLE OF CONTENTS
// Lazy-load do modulo toc.js e atualizacao do sidebar
// ----------------------------------------------------------------
/** @private */
async function _updateToc() {
    if (!tocModule) {
        try {
            tocModule = await import('./toc.js');
        } catch (e) {
            console.warn('[Report] TOC module not loaded:', e);
            return;
        }
    }
    const editorEl = getEditorElement();
    if (editorEl && tocContainer) {
        tocModule.updateToc(tocContainer, editorEl);
    }
}
/** @private */
function _toggleToc() {
    if (!tocContainer) return;
    const collapsed = tocContainer.classList.toggle('collapsed');
    const tocBtn = overlayEl?.querySelector('#report-toc-btn');
    if (tocBtn) tocBtn.classList.toggle('active', !collapsed);
}
// ----------------------------------------------------------------
// READ MODE SYNC
// ----------------------------------------------------------------
/** @private */
function _syncReadModeBtn() {
    const readBtn = overlayEl?.querySelector('#report-read-btn');
    if (readBtn) {
        const reading = isReadOnly();
        readBtn.classList.toggle('active', reading);
        readBtn.innerHTML = `${getIcon(reading ? 'edit' : 'eye', { size: '13px' })} ${reading ? t('reportEditMode') || 'Editar' : t('reportReadMode') || 'Ler'}`;
    }
    // Sync class on document wrapper
    if (documentEl) {
        documentEl.classList.toggle('report-read-mode', isReadOnly());
    }
}
/**
 * Sync overlay title input with the current active report.
 * Chamado pelo handler ao trocar de relatorio.
 */
export function syncOverlayTitle() {
    if (!titleInput) return;
    const report = getReport();
    titleInput.value = report.title || '';
    _updateToc();
}
/**
 * Sync read mode button from outside (called by handler).
 */
export function syncReadModeState() {
    _syncReadModeBtn();
    // Also refresh TOC (content might have changed)
    _updateToc();
}
// ----------------------------------------------------------------
// SCROLL PROGRESS BAR
// ----------------------------------------------------------------
/** @private */
function _setupScrollProgress() {
    const editorEl = getEditorElement();
    if (!editorEl || !progressBar) return;
    const currentProgressBar = progressBar;
    const handler = () => {
        const { scrollTop, scrollHeight, clientHeight } = editorEl;
        const maxScroll = scrollHeight - clientHeight;
        const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
        currentProgressBar.style.width = `${pct}%`;
    };
    editorEl.addEventListener('scroll', handler, { passive: true });
}
// ----------------------------------------------------------------
// SPLIT DIVIDER DRAG
// ----------------------------------------------------------------
/** @private @param {HTMLElement} handle */
function _setupDividerDrag(handle: HTMLElement) {
    handle.addEventListener('mousedown', (e: MouseEvent) => {
        if (!isSplitMode) return;
        if (!overlayEl) return;
        e.preventDefault();
        const mainArea = document.getElementById('main-area');
        if (!mainArea) return;
        const mainRect = mainArea.getBoundingClientRect();
        const currentOverlay = overlayEl;
        if (!currentOverlay) return;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (me: MouseEvent) => {
            const pct = ((me.clientX - mainRect.left) / mainRect.width) * 100;
            const clamped = Math.max(40, Math.min(85, pct));
            currentOverlay.style.left = `${clamped}%`;
            handle.style.left = '-3px';
            requestAnimationFrame(() => {
                const cc = document.getElementById('canvas-container');
                if (cc) handleResize(cc);
            });
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
//# sourceMappingURL=overlay.js.map
//# sourceMappingURL=overlay.js.map
