// @ts-check
// Generated from src/app/js/utils/ui/abntPanel.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   ABNT PANEL — UI layer for ABNT/CONAMA/CETESB/NR reference checker
   Painel lateral de resultados do verificador de referencias normativas

   Fluxo:
   1. User clica botao "ABNT" no report toolbar (editor.js:515)
   2. handler chama checkABNTReferences() do core
   3. handler chama openAbntPanel(findings) deste modulo
   4. Panel renderiza lista agrupada por severity + type
   5. Click em finding → scroll report editor para o match
   6. Click "Apply suggestion" → substitui original por normalized

   Gap fechado: SPEC_REPORT_SCRIPTS_LIBRARY C5c — panel UI que estava
   faltando (core + handler ja existiam desde antes, so mostravam toast).

   Referencia: docs/specs/features/SPEC_REPORT_SCRIPTS_LIBRARY.md
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { asyncConfirm } from './asyncDialogs.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('AbntPanel');
// ── State ────────────────────────────────────────────────────────────────────
/** @type {any[]} Current findings (set by openAbntPanel) */
let _findings: any[] = [];
let _activeFilter = 'all'; // 'all' | 'error' | 'warning' | 'info'
let _panelEl: any = null;
// ── Severity mapping (from finding status) ───────────────────────────────────
const STATUS_TO_SEVERITY = Object.freeze({
    revoked: 'error',
    malformed: 'error',
    unknown: 'warning',
    valid: 'info',
});
const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });
const SEVERITY_COLORS = Object.freeze({
    error: '#f93e3e',
    warning: '#f59e0b',
    info: '#49cc90',
});
const TYPE_LABELS = Object.freeze({
    nbr: 'ABNT NBR',
    conama: 'CONAMA',
    cetesb: 'CETESB',
    nr: 'NR (MTE)',
    glossary: 'Glossário',
});
// ── Pure helpers (exported for testing) ──────────────────────────────────────
/**
 * Map a finding's status to a UI severity level.
 * @param {string} status - 'valid'|'revoked'|'unknown'|'malformed'
 * @returns {'error'|'warning'|'info'}
 */
export function statusToSeverity( status: any) {
    return (STATUS_TO_SEVERITY as any)[status] || 'info';
}
/**
 * Sort findings by severity (error first), then by line, then by col.
 * Pure function - does not mutate input.
 * @param {any[]} findings
 * @returns {any[]}
 */
export function sortFindingsBySeverity( findings: any) {
    return [...findings].sort((a: any, b: any) => {
        const sa = (SEVERITY_ORDER as any)[statusToSeverity(a.status)];
        const sb = (SEVERITY_ORDER as any)[statusToSeverity(b.status)];
        if (sa !== sb) return sa - sb;
        if (a.line !== b.line) return a.line - b.line;
        return a.col - b.col;
    });
}
/**
 * Group findings by reference type (nbr, conama, etc).
 * @param {any[]} findings
 * @returns {any}
 */
export function groupFindingsByType( findings: any) {
    const groups: any = {};
    for (const f of findings) {
        const type = f.type || 'unknown';
        if (!groups[type]) groups[type] = [];
        groups[type].push(f);
    }
    return groups;
}
/**
 * Compute severity counts for summary header.
 * @param {any[]} findings
 * @returns {{total: number, error: number, warning: number, info: number}}
 */
export function computeSeveritySummary( findings: any) {
    const summary = { total: findings.length, error: 0, warning: 0, info: 0 };
    for (const f of findings) {
        const sev = statusToSeverity(f.status);
        (summary as any)[sev]++;
    }
    return summary;
}
// ── Panel lifecycle ──────────────────────────────────────────────────────────
/**
 * Open the ABNT findings panel with the given results.
 * Injects a dockable side panel next to the report editor.
 *
 * @param {any[]} findings - From checkABNTReferences()
 * @returns {HTMLElement} The panel element
 */
export function openAbntPanel( findings: any) {
    _findings = Array.isArray(findings) ? findings : [];
    _activeFilter = 'all';
    // Remove any existing panel
    closeAbntPanel();
    _panelEl = document.createElement('div');
    _panelEl.id = 'abnt-panel';
    _panelEl.className = 'abnt-panel';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', t('abntChecker.title') || 'ABNT Reference Check');
    _panelEl.innerHTML = _renderPanelShell();
    document.body.appendChild(_panelEl);
    _attachEventListeners();
    _renderFindings();
    log.info('ABNT panel opened with %d findings', _findings.length);
    return _panelEl;
}
/**
 * Close and remove the panel.
 */
export function closeAbntPanel() {
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
    }
}
/**
 * Check if panel is currently open.
 * @returns {boolean}
 */
export function isAbntPanelOpen() {
    return _panelEl !== null && document.body.contains(_panelEl);
}
// ── Rendering ────────────────────────────────────────────────────────────────
function _renderPanelShell() {
    const summary = computeSeveritySummary(_findings);
    return `
        <div class="abnt-panel-header">
            <span class="abnt-panel-title">${escapeHtml(t('abntChecker.title') || 'ABNT Reference Check')}</span>
            <button class="abnt-panel-close" type="button" title="${escapeAttr(t('close') || 'Close')}" aria-label="${escapeAttr(t('close') || 'Close')}">&times;</button>
        </div>
        <div class="abnt-panel-summary">
            <button class="abnt-filter-btn" data-filter="all" title="${escapeAttr(t('abntChecker.filterAll') || 'Show all')}">
                <span class="abnt-filter-value">${summary.total}</span>
                <span class="abnt-filter-label">${escapeHtml(t('abntChecker.filterAll') || 'All')}</span>
            </button>
            <button class="abnt-filter-btn error" data-filter="error" title="${escapeAttr(t('abntChecker.filterError') || 'Errors')}">
                <span class="abnt-filter-value">${summary.error}</span>
                <span class="abnt-filter-label">${escapeHtml(t('abntChecker.filterError') || 'Error')}</span>
            </button>
            <button class="abnt-filter-btn warning" data-filter="warning" title="${escapeAttr(t('abntChecker.filterWarning') || 'Warnings')}">
                <span class="abnt-filter-value">${summary.warning}</span>
                <span class="abnt-filter-label">${escapeHtml(t('abntChecker.filterWarning') || 'Warning')}</span>
            </button>
            <button class="abnt-filter-btn info" data-filter="info" title="${escapeAttr(t('abntChecker.filterInfo') || 'Valid references')}">
                <span class="abnt-filter-value">${summary.info}</span>
                <span class="abnt-filter-label">${escapeHtml(t('abntChecker.filterInfo') || 'Valid')}</span>
            </button>
        </div>
        <div class="abnt-panel-body" id="abnt-panel-body"></div>
    `;
}
function _renderFindings() {
    const body = _panelEl?.querySelector('#abnt-panel-body');
    if (!body) return;
    const filtered =
        _activeFilter === 'all'
            ? _findings
            : _findings.filter((f: any) => statusToSeverity(f.status) === _activeFilter);
    if (filtered.length === 0) {
        const msg =
            _activeFilter === 'all'
                ? t('abntChecker.noReferences') || 'No normative references found.'
                : t('abntChecker.noneInFilter') || 'No items match the current filter.';
        body.innerHTML = `<div class="abnt-empty">${escapeHtml(msg)}</div>`;
        return;
    }
    const sorted = sortFindingsBySeverity(filtered);
    const groups = groupFindingsByType(sorted);
    let html = '';
    for (const [type, items] of Object.entries(groups) as [string, any[]][]) {
        const typeLabel = (TYPE_LABELS as any)[type] || type.toUpperCase();
        html += `<div class="abnt-group">
            <div class="abnt-group-header">${escapeHtml(typeLabel)} <span class="abnt-group-count">${items.length}</span></div>
            ${items.map((f: any) => _renderFinding(f)).join('')}
        </div>`;
    }
    body.innerHTML = html;
}
/**
 * @param {any} f
 */
function _renderFinding( f: any) {
    const severity = statusToSeverity(f.status);
    const color = (SEVERITY_COLORS as any)[severity];
    const statusLabel = t(`abntChecker.status.${f.status}`) || f.status;
    const suggestionHtml = f.suggestion
        ? `<button class="abnt-finding-apply" type="button" data-original="${escapeAttr(f.original)}" data-suggestion="${escapeAttr(f.suggestion)}" title="${escapeAttr(t('abntChecker.applySuggestion') || 'Apply suggestion')}">
              ${escapeHtml(t('abntChecker.suggestionLabel') || 'Suggest')}: <code>${escapeHtml(f.suggestion)}</code>
           </button>`
        : '';
    return `
        <div class="abnt-finding" data-severity="${severity}" data-line="${f.line}" data-col="${f.col}" style="border-left-color: ${color}">
            <div class="abnt-finding-main">
                <span class="abnt-finding-original">${escapeHtml(f.original)}</span>
                <span class="abnt-finding-status abnt-finding-status-${escapeAttr(severity)}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="abnt-finding-meta">
                <span class="abnt-finding-location">${t('line') || 'Line'} ${f.line}:${f.col}</span>
                ${f.normalized && f.normalized !== f.original ? `<span class="abnt-finding-normalized">→ ${escapeHtml(f.normalized)}</span>` : ''}
            </div>
            ${suggestionHtml}
        </div>
    `;
}
// ── Event handlers ───────────────────────────────────────────────────────────
function _attachEventListeners() {
    if (!_panelEl) return;
    // Close button
    const closeBtn = (_panelEl.querySelector('.abnt-panel-close')) as any;
    closeBtn?.addEventListener('click', closeAbntPanel);
    // Filter buttons
    /** @type {any} */ (_panelEl.querySelectorAll('.abnt-filter-btn')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            _activeFilter = btn.getAttribute('data-filter') || 'all';
            _panelEl
                ?.querySelectorAll('.abnt-filter-btn')
                .forEach((b: any) => b.classList.remove('active'));
            btn.classList.add('active');
            _renderFindings();
        });
    });
    // Delegated click on findings (jump + apply)
    const body = (_panelEl.querySelector('#abnt-panel-body')) as any;
    body?.addEventListener('click', _onBodyClick);
}
/**
 * @param {any} e
 */
async function _onBodyClick( e: any) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    // Apply suggestion button
    const applyBtn = (target.closest('.abnt-finding-apply')) as any;
    if (applyBtn) {
        e.stopPropagation();
        const original = applyBtn.getAttribute('data-original');
        const suggestion = applyBtn.getAttribute('data-suggestion');
        if (!original || !suggestion) return;
        const ok = await asyncConfirm(
            (t('abntChecker.confirmApply') || 'Replace "{original}" with "{suggestion}"?')
                .replace('{original}', original)
                .replace('{suggestion}', suggestion),
            {
                confirmLabel: t('abntChecker.applySuggestion') || 'Apply',
                cancelLabel: t('cancel') || 'Cancel',
            },
        );
        if (!ok) return;
        _applySuggestionToEditor(original, suggestion);
        return;
    }
    // Click on finding row → jump to line
    const finding = (target.closest('.abnt-finding')) as any;
    if (finding) {
        const line = parseInt(finding.getAttribute('data-line') || '0', 10);
        _jumpToLine(line);
    }
}
/**
 * Scroll the report editor to approximately the given line number.
 * Uses a simple heuristic since contenteditable doesn't have native line refs.
 *
 * @param {number} line - 1-indexed line number from the finding
 */
function _jumpToLine( line: any) {
    const editor = (document.querySelector('.report-editor-content, [contenteditable="true"]')) as any;
    if (!editor) {
        showToast(t('abntChecker.editorNotFound') || 'Report editor not found', 'warning');
        return;
    }
    // Approximate: scroll to (line / totalLines) * scrollHeight
    const text = editor.textContent || '';
    const totalLines = Math.max(1, text.split('\n').length);
    const ratio = Math.min(1, Math.max(0, line / totalLines));
    editor.scrollTop = ratio * editor.scrollHeight;
    editor.classList.add('abnt-editor-flash');
    setTimeout(() => editor.classList.remove('abnt-editor-flash'), 600);
}
/**
 * Replace the first occurrence of `original` with `suggestion` in the editor.
 * Safe simple text replace - not a full regex. Refreshes the panel after.
 *
 * @param {string} original
 * @param {string} suggestion
 */
function _applySuggestionToEditor( original: any, suggestion: any) {
    const editor = (document.querySelector('.report-editor-content, [contenteditable="true"]')) as any;
    if (!editor) {
        showToast(t('abntChecker.editorNotFound') || 'Report editor not found', 'warning');
        return;
    }
    const html = editor.innerHTML;
    // Replace only first occurrence to preserve later matches for manual review
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newHtml = html.replace(new RegExp(escaped), suggestion);
    if (newHtml === html) {
        showToast(t('abntChecker.replaceNotFound') || 'Original text not found in editor', 'warning');
        return;
    }
    editor.innerHTML = newHtml;
    // Fire input event so autosave + model picks up the change
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(t('abntChecker.suggestionApplied') || 'Suggestion applied', 'success');
    // Remove this finding from the list and re-render
    _findings = _findings.filter((f: any) => f.original !== original || f.suggestion !== suggestion);
    // Update summary header too
    if (_panelEl) _panelEl.innerHTML = _renderPanelShell();
    _attachEventListeners();
    _renderFindings();
}
