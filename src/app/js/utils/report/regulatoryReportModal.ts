// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   REGULATORY REPORT MODAL — one-click report configuration UI
   Modal de configuração do gerador de relatório regulatório.

   Reaproveita: design-tokens (.ecbt-*), escapeHtml, report manager
   (addReport/setReportContent), pdf/docx export e core/validation
   regulatoryReport. NÃO reimplementa exportadores nem análise.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { REPORT_TEMPLATES } from '../../core/validation/regulatoryReport.js';
const log = createLogger('RegulatoryReport');
/** @type {HTMLElement|null} */
let _modal: any = null;
/** @type {AbortController|null} */
let _ac: any = null;
/** @type {HTMLElement|null} */
let _trigger: any = null;
/**
 * Open the regulatory report configuration modal.
 * @param {HTMLElement} [trigger] - element to restore focus to on close
 */
export function openRegulatoryReportModal(trigger: any) {
    if (_modal)
        return;
    _trigger = trigger || document.activeElement;
    _ac = new AbortController();
    const sig = { signal: _ac.signal };
    const opts = REPORT_TEMPLATES.map((tpl: any) => `<option value="${escapeHtml(tpl.id)}">${escapeHtml(tpl.label)}</option>`).join('');
    _modal = document.createElement('div');
    _modal.className = 'ecbt-overlay';
    _modal.setAttribute('role', 'dialog');
    _modal.setAttribute('aria-modal', 'true');
    _modal.setAttribute('aria-label', t('REPORT_GEN_TITLE') || 'Regulatory Report Generator');
    _modal.innerHTML = `
      <div class="ecbt-dialog ecbt-dialog--sm" role="document">
        <header class="ecbt-dialog__header">
          <h2 class="ecbt-dialog__title">${escapeHtml(t('REPORT_GEN_TITLE') || 'Regulatory Report Generator')}</h2>
          <button type="button" class="ecbt-dialog__close" data-rr="close" aria-label="Close">&#10005;</button>
        </header>
        <div class="ecbt-dialog__body">
          <label for="rr-template">${escapeHtml(t('REPORT_GEN_TEMPLATE') || 'Template')}</label>
          <select id="rr-template" class="ecbt-input">${opts}</select>
          <label class="ecbt-checkbox" style="margin-top:10px;display:block;">
            <input type="checkbox" id="rr-uncertainty" /> ${escapeHtml(t('REPORT_GEN_UNC') || 'Include uncertainty table')}
          </label>
        </div>
        <footer class="ecbt-dialog__footer">
          <button type="button" class="btn-secondary" data-rr="cancel">${escapeHtml(t('cancel') || 'Cancel')}</button>
          <button type="button" class="btn-primary" data-rr="generate">${escapeHtml(t('REPORT_GEN_BTN') || 'Generate Report')}</button>
        </footer>
      </div>`;
    document.body.appendChild(_modal);
    _modal.querySelector('[data-rr="close"]')?.addEventListener('click', closeRegulatoryReportModal, sig);
    _modal.querySelector('[data-rr="cancel"]')?.addEventListener('click', closeRegulatoryReportModal, sig);
    _modal.querySelector('[data-rr="generate"]')?.addEventListener('click', _onGenerate, sig);
    _modal.addEventListener("click", (e: any) => {
        if (e.target === _modal)
            closeRegulatoryReportModal();
    }, sig);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            closeRegulatoryReportModal();
    }, sig);
    _modal.querySelector('#rr-template')?.focus();
}
/** Close the modal and restore focus to the trigger. */
export function closeRegulatoryReportModal() {
    if (_ac)
        _ac.abort();
    _ac = null;
    if (_modal?.parentNode)
        _modal.parentNode.removeChild(_modal);
    _modal = null;
    if (_trigger && typeof _trigger.focus === 'function')
        _trigger.focus();
    _trigger = null;
}
/** Handle "Generate Report" — collect config and delegate to the engine. */
async function _onGenerate() {
    const tplEl = _modal?.querySelector('#rr-template');
    const templateId = tplEl?.value || 'CONAMA_STD';
    closeRegulatoryReportModal();
    try {
        const { generateRegulatoryReport } = await import('./regulatoryReportEngine.js' as string);
        await generateRegulatoryReport(templateId);
    }
    catch (_err: any) {
        const err = _err;
        log.error('Regulatory report generation failed', err?.message);
        showToast(t('REPORT_ERR_DATA') || 'Incomplete data for report', 'error');
    }
}
