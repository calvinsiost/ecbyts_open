// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   REGULATORY REPORT ENGINE — orchestrator (one-click)
   Orquestra: estado do modelo → core/validation → metadados +
   provenance → report manager → exportador DOCX/PDF existente.

   NÃO reimplementa exportadores nem análise de conformidade
   (ver SPEC_REGULATORY_REPORT_GENERATOR §14).
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { resolveTemplate, extractComplianceSummary, buildReportMetadata, renderReportHtml, } from '../../core/validation/regulatoryReport.js';
import { addReport, setActiveReport, setReportContent, setReportTitle, getRootFolders } from './manager.js';
const log = createLogger('RegulatoryReportEngine');
/**
 * Generate a regulatory report end-to-end and trigger DOCX download.
 * @param {string} templateId - 'CETESB_GAC' | 'CONAMA_STD'
 * @returns {Promise<{ ok: boolean, meta?: Object }>}
 */
export async function generateRegulatoryReport(templateId: any) {
    const tpl = resolveTemplate(templateId);
    const elements = await _gatherElements();
    const summary = extractComplianceSummary(elements, tpl!.matrix);
    if (summary.total === 0) {
        showToast(t('REPORT_ERR_DATA') || 'Incomplete data for report', 'warning');
        return { ok: false };
    }
    const meta = await buildReportMetadata({
        templateId: tpl!.id,
        summary,
        userId: await _resolveUserId(),
        modelVersion: await _resolveModelVersion(),
    });
    const html = renderReportHtml(meta, summary, escapeHtml);
    const created = _createReport(meta.templateLabel, html);
    if (!created) {
        showToast(t('reportMaxReached') || 'Max reports reached (20)', 'warning');
        return { ok: false };
    }
    await _exportDocx();
    showToast((t('REPORT_GEN_DONE') || 'Regulatory report generated') +
        ` — ${summary.violations.length} ${t('REPORT_GEN_VIOLATIONS') || 'violation(s)'}`, 'success', 5000);
    log.info(`Regulatory report ${tpl!.id}: ${summary.violations.length} violations, hash ${meta.provenance.modelHash}`);
    return { ok: true, meta };
}
/**
 * Create the report in the multi-report manager and activate it.
 * @param {string} title
 * @param {string} html
 * @returns {boolean}
 */
function _createReport(title: any, html: any) {
    const folderId = getRootFolders()[0]?.id;
    if (!folderId)
        return false;
    const report = addReport(folderId, { title, content: html });
    if (!report)
        return false;
    setActiveReport(report.id);
    setReportTitle(title);
    setReportContent(html);
    return true;
}
/** Lazy-load model elements (avoids core import in pure modal). */
async function _gatherElements() {
    try {
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        return getAllElements() || [];
    }
    catch (_e: any) {
        const e = _e;
        console.debug('[regulatoryReport:gatherElements]', e?.message || e);
        return [];
    }
}
/** Resolve current user id for the provenance trail (best-effort). */
async function _resolveUserId() {
    try {
        const { getCurrentUser } = await import('../auth/session.js' as string);
        return getCurrentUser()?.id || 'anonymous';
    }
    catch (_e: any) {
        const e = _e;
        console.debug('[regulatoryReport:resolveUserId]', e?.message || e);
        return 'anonymous';
    }
}
/** Resolve app version for the provenance trail. */
async function _resolveModelVersion() {
    try {
        const { APP_VERSION } = await import('../../config.js' as string);
        return APP_VERSION || 'unknown';
    }
    catch (_e: any) {
        const e = _e;
        console.debug('[regulatoryReport:resolveModelVersion]', e?.message || e);
        return 'unknown';
    }
}
/** Reuse the existing DOCX exporter — never reimplemented here. */
async function _exportDocx() {
    try {
        const { exportReportDOCX } = await import('./docxExport.js' as string);
        await exportReportDOCX();
    }
    catch (_err: any) {
        const err = _err;
        log.warn('DOCX export deferred', err?.message);
        showToast(t('ERR_EXPORT_FAILED') || 'Failed to process file. Try again.', 'warning');
    }
}
