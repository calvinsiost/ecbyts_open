// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   AI PROGRESS OVERLAY — Generic loading+progress UI for AI operations

   Non-blocking dockable card (top-right) with:
   - Title (operation name)
   - Determinate bar with N/total + percentage (when total > 0)
   - Indeterminate animated bar (when total unknown / indeterminate work)
   - Status line (current phase: "Preparando", "Chamando LLM", etc)
   - Optional detail line (current chunk text preview)

   API:
     openAiProgress({ title, total, phase, detail }) → creates overlay
     updateAiProgress({ current, phase, detail }) → partial update
     setAiProgressError(msg) → show red error state (user dismisses)
     closeAiProgress() → removes overlay
     isAiProgressOpen() → boolean

   Usage pattern inside handlers:
     openAiProgress({ title: 'Traduzindo relatório', total: estimate.chunks });
     try {
       const result = await translateReport(req, llmFn, {
         onProgress: ({ current, total, phase, detail }) =>
           updateAiProgress({ current, total, phase, detail }),
       });
       closeAiProgress();
     } catch (err: any) {
       setAiProgressError(err.message); // overlay auto-closes after 4s
     }

   This is the SINGLE PATH of progress feedback for all LLM-backed operations.
   Translate, AI Report, future ABNT-via-LLM must all use it.

   Referencia: feedback do usuario 2026-04-10 — "translate não mostra se
   está rodando nem quantos %".
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('AiProgressOverlay');
/** @type {HTMLElement|null} */
let _overlayEl: any = null;
/** @type {{title: string, current: number, total: number, phase: string, detail: string, isError: boolean}} */
let _state = {
    title: '',
    current: 0,
    total: 0,
    phase: '',
    detail: '',
    isError: false,
};
/** Auto-close timer for error state (user dismisses or it fades after 4s)
 *  @type {any} */
let _errorTimer: any = null;
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Open the progress overlay. If already open, replaces it (useful for sequential ops).
 *
 * @param {Object} params
 * @param {string} params.title - Operation name (e.g. "Traduzindo relatório")
 * @param {number} [params.total=0] - Total units of work. 0 = indeterminate.
 * @param {string} [params.phase] - Initial phase label
 * @param {string} [params.detail] - Initial detail text
 * @returns {HTMLElement}
 */
export function openAiProgress(params: any) {
    const { title = 'Processando', total = 0, phase = '', detail = '' } = params || {};
    _clearErrorTimer();
    closeAiProgress();
    _state = {
        title,
        current: 0,
        total,
        phase,
        detail,
        isError: false,
    };
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'ai-progress-overlay';
    _overlayEl.className = 'ai-progress-overlay';
    _overlayEl.setAttribute('role', 'status');
    _overlayEl.setAttribute('aria-live', 'polite');
    _overlayEl.setAttribute('aria-atomic', 'true');
    _overlayEl.innerHTML = _render();
    document.body.appendChild(_overlayEl);
    log.info('Opened: %s (total=%d)', title, total);
    return _overlayEl;
}
/**
 * Update an existing overlay with new progress data.
 *
 * @param {Object} params
 * @param {number} [params.current] - Current progress count
 * @param {number} [params.total] - Override total (useful when total is discovered late)
 * @param {string} [params.phase] - New phase label
 * @param {string} [params.detail] - New detail text
 */
export function updateAiProgress(params: any) {
    if (!_overlayEl) return; // silently ignore if not open — handlers can call freely
    const { current, total, phase, detail } = params || {};
    if (typeof current === 'number') _state.current = current;
    if (typeof total === 'number') _state.total = total;
    if (typeof phase === 'string') _state.phase = phase;
    if (typeof detail === 'string') _state.detail = detail;
    _redraw();
}
/**
 * Close the overlay immediately.
 */
export function closeAiProgress() {
    _clearErrorTimer();
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
}
/**
 * Check if overlay is currently open.
 * @returns {boolean}
 */
export function isAiProgressOpen() {
    return _overlayEl !== null && document.body.contains(_overlayEl);
}
/**
 * Show an error state in the overlay. Auto-closes after 4 seconds unless
 * the user clicks the dismiss button.
 *
 * @param {string} message
 */
export function setAiProgressError(message: any) {
    if (!_overlayEl) return;
    _state.isError = true;
    _state.phase = message || t('aiProgress.error') || 'Erro ao processar';
    _redraw();
    _clearErrorTimer();
    _errorTimer = setTimeout(() => closeAiProgress(), 4000);
}
// ── Rendering ────────────────────────────────────────────────────────────────
function _render() {
    const { title, current, total, phase, detail, isError } = _state;
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
    const determinate = total > 0;
    const counter = determinate ? `${current}/${total}` : '';
    return `
        <div class="ai-progress-card ${isError ? 'ai-progress-error' : ''}">
            <div class="ai-progress-header">
                <span class="ai-progress-title">${escapeHtml(title)}</span>
                <button type="button" class="ai-progress-dismiss" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
            </div>
            <div class="ai-progress-bar-container">
                <div class="ai-progress-bar ${determinate ? 'determinate' : 'indeterminate'}"
                     style="width: ${determinate ? pct : 100}%"
                     role="progressbar"
                     aria-valuenow="${determinate ? pct : 0}"
                     aria-valuemin="0"
                     aria-valuemax="100"></div>
            </div>
            <div class="ai-progress-meta">
                <span class="ai-progress-phase">${escapeHtml(phase || t('aiProgress.processing') || 'Processando…')}</span>
                ${determinate ? `<span class="ai-progress-counter">${counter} · ${pct}%</span>` : `<span class="ai-progress-counter ai-progress-pulse">…</span>`}
            </div>
            ${detail ? `<div class="ai-progress-detail" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div>` : ''}
        </div>
    `;
}
function _redraw() {
    if (!_overlayEl) return;
    _overlayEl.innerHTML = _render();
    // Re-attach dismiss listener (innerHTML replace wipes event handlers)
    const dismissBtn = _overlayEl.querySelector('.ai-progress-dismiss');
    dismissBtn?.addEventListener('click', closeAiProgress);
}
function _clearErrorTimer() {
    if (_errorTimer) {
        clearTimeout(_errorTimer);
        _errorTimer = null;
    }
}
// Initial dismiss listener (in case user clicks X immediately)
// Attached once at module load.
if (typeof document !== 'undefined') {
    // Delegated click handler on body - works even if overlay is swapped
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target instanceof HTMLElement && target.classList.contains('ai-progress-dismiss')) {
            closeAiProgress();
        }
    });
}
