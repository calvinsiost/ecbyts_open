// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Lab Result Reconciliation handler — Day-2 Journey UI entry point.
 * Closes the named F10 gap of SPEC_LAB_DATA_INGESTION_JOURNEY: a
 * dedicated reconciliation view over the existing wizard + labApiMatcher.
 *
 * The user pastes a fresh lab-result batch; this builds an `.ecbt-*`
 * modal showing each row reconciled against existing campaigns/elements
 * (matched / ambiguous / unmatched / duplicate) with confidence.
 */
import { createLogger } from '../helpers/logger.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { parseLabText, reconcileBatch } from '../../core/etl/labReconciliation.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { getAllElements } from '../../core/elements/manager.js';
const log = createLogger('LabReconcile');
const MODAL_ID = 'lab-reconcile-modal';
/** Translate with fallback so the panel never shows a raw key. */
function tr(key: any, fallback: any, vars?: any) {
    const v = t(key, vars);
    return !v || v === key ? fallback : v;
}
/** Status → token color class (mapped, not inline magic). */
const STATUS_CLASS = Object.freeze({
    matched: 'lr-ok',
    ambiguous: 'lr-warn',
    unmatched: 'lr-bad',
    duplicate: 'lr-dup',
});
/**
 * Build (once) and open the reconciliation modal.
 * Reachable via the toolbar/ingestion menu ((window as any).handleOpenLabReconciliation).
 */
export function handleOpenLabReconciliation() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
    }
    (modal).style.display = 'flex';
    const ta = (document.getElementById('lr-input'));
    if (ta)
        ta.focus();
}
/** Close the modal (state is ephemeral — nothing persisted). */
export function handleCloseLabReconciliation() {
    const modal = document.getElementById(MODAL_ID);
    if (modal)
        (modal).style.display = 'none';
}
/**
 * Parse the pasted text, reconcile against the loaded model and render
 * the result table. Never throws — surfaces errors as guidance text.
 */
export function handleRunLabReconciliation() {
    const ta = (document.getElementById('lr-input'));
    const out = document.getElementById('lr-output');
    if (!ta || !out)
        return;
    try {
        const { rows, errors } = parseLabText(String((ta as any).value || ''));
        if (rows.length === 0) {
            out.innerHTML = `<p class="lr-hint">${escapeHtml(tr('labReconcile.noRows', 'No data rows detected. Paste a header line plus at least one result row.'))}</p>`;
            return;
        }
        const ctx = {
            campaigns: getAllCampaigns() || [],
            elements: getAllElements() || [],
        };
        const { results, summary } = reconcileBatch(rows, ctx);
        out.innerHTML = _renderSummary(summary) + _renderTable(results) + _renderErrors(errors);
    }
    catch (e: any) {
        log.warn('reconcile failed', e);
        out.innerHTML = `<p class="lr-hint">${escapeHtml(tr('labReconcile.failed', 'Reconciliation failed. Check the pasted format and try again.'))}</p>`;
    }
}
function _renderSummary(s: any) {
    const cell = (k: any, label: any, cls: any) => `<span class="lr-stat ${cls}"><strong>${s[k]}</strong> ${escapeHtml(label)}</span>`;
    return `<div class="lr-summary" role="status" aria-live="polite">
        ${cell('matched', tr('labReconcile.matched', 'matched'), 'lr-ok')}
        ${cell('ambiguous', tr('labReconcile.ambiguous', 'ambiguous'), 'lr-warn')}
        ${cell('unmatched', tr('labReconcile.unmatched', 'unmatched'), 'lr-bad')}
        ${cell('duplicate', tr('labReconcile.duplicate', 'duplicate'), 'lr-dup')}
        <span class="lr-stat"><strong>${s.total}</strong> ${escapeHtml(tr('labReconcile.total', 'total'))}</span>
    </div>`;
}
function _renderTable(results: any) {
    const head = `<tr>
        <th>#</th><th>${escapeHtml(tr('labReconcile.parameter', 'Parameter'))}</th>
        <th>${escapeHtml(tr('labReconcile.status', 'Status'))}</th>
        <th>${escapeHtml(tr('labReconcile.element', 'Element'))}</th>
        <th>${escapeHtml(tr('labReconcile.confidence', 'Confidence'))}</th>
    </tr>`;
    const body = results
        .map((r: any) => {
        const cls = (STATUS_CLASS as Record<string, any>)[r.status] || '';
        const elem = r.element?.name || r.element?.id || '—';
        return `<tr>
                <td>${r.line}</td>
                <td>${escapeHtml(String(r.parameter || '—'))}</td>
                <td class="${cls}">${escapeHtml(tr('labReconcile.' + r.status, r.status))}</td>
                <td>${escapeHtml(String(elem))}</td>
                <td>${escapeHtml(String(r.confidence))}</td>
            </tr>`;
    })
        .join('');
    return `<table class="lr-table">${head}${body}</table>`;
}
function _renderErrors(errors: any) {
    if (!errors || errors.length === 0)
        return '';
    return `<p class="lr-hint" role="alert">${escapeHtml(tr('labReconcile.warnings', 'Warnings') + ': ' + errors.join(', '))}</p>`;
}
function _buildModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('labReconcile.title', 'Lab Result Reconciliation'));
    (modal).style.display = 'none';
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg lr-dialog">
            <header class="lr-head">
                <h2 class="lr-title">${escapeHtml(tr('labReconcile.title', 'Lab Result Reconciliation'))}</h2>
                <button type="button" class="lr-close" aria-label="${escapeHtml(tr('labReconcile.close', 'Close'))}">&#x2715;</button>
            </header>
            <p class="lr-hint">${escapeHtml(tr('labReconcile.help', 'Day-2 flow: paste a new lab-result batch (CSV/TSV with a header row). Each row is reconciled against the campaigns and monitoring elements already in this model.'))}</p>
            <textarea id="lr-input" class="lr-input" rows="6"
                aria-label="${escapeHtml(tr('labReconcile.inputLabel', 'Lab result rows'))}"
                placeholder="parameter,value,unit,date,location&#10;Lead,0.045,mg/L,2026-04-15,PM-03"></textarea>
            <div class="lr-actions">
                <button type="button" class="ecbt-btn lr-run">${escapeHtml(tr('labReconcile.run', 'Reconcile'))}</button>
            </div>
            <div id="lr-output" class="lr-output"></div>
        </div>`;
    modal.querySelector('.lr-close')?.addEventListener('click', handleCloseLabReconciliation);
    modal.querySelector('.lr-run')?.addEventListener('click', handleRunLabReconciliation);
    modal.addEventListener('click', (ev) => {
        if (ev.target === modal)
            handleCloseLabReconciliation();
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && (modal).style.display === 'flex') {
            handleCloseLabReconciliation();
        }
    });
    return modal;
}
export const labReconciliationHandlers = {
    handleOpenLabReconciliation,
    handleCloseLabReconciliation,
    handleRunLabReconciliation,
};
