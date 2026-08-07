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
   REPORT FILE EXPORTER — Save reports as PDF/DOCX to the Files system
   Exporta relatorio como PDF/DOCX e salva no sistema de arquivos

   Ponte entre o sistema de relatorios e o gerenciador de arquivos.
   Gera blob via jsPDF ou docx, e registra no Files (IDB local ou
   Supabase Storage para usuarios autenticados).
   ================================================================ */
import { getReport, getReportById, getActiveReportId } from './manager.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('ReportFileExporter');
// ----------------------------------------------------------------
// PDF BLOB GENERATION
// Gera blob PDF a partir do relatorio sem disparar download
// ----------------------------------------------------------------
/**
 * Generate a PDF blob from a report.
 * Gera o blob PDF usando jsPDF sem fazer download automatico.
 *
 * @param {string} [reportId] - Report ID (active if omitted)
 * @param {Object} [options] - Export options (sections, etc.)
 * @returns {Promise<{blob: Blob | null, filename: string}>}
 */
export async function exportReportToPDF(reportId: any, options: any = {}) {
    const report = _resolveReport(reportId);
    if (!report) {
        throw new Error('REPORT_NOT_FOUND');
    }
    if (!report.content) {
        throw new Error('REPORT_EMPTY');
    }
    const { exportReportPDF } = await import('./pdfExport.js' as string);
    const { generateReportPDFBlob } = (await import('./pdfExport.js' as string));
    // Se existe funcao dedicada para blob, usar; senao fallback
    if (typeof generateReportPDFBlob === 'function') {
        return generateReportPDFBlob(reportId, options);
    }
    // Fallback: usar exportReportPDF que faz download + retornar info
    await exportReportPDF(options);
    log.info('PDF exported via download fallback');
    return { blob: null, filename: _buildFilename(report, 'pdf') };
}
// ----------------------------------------------------------------
// DOCX BLOB GENERATION
// Gera blob DOCX a partir do relatorio sem disparar download
// ----------------------------------------------------------------
/**
 * Generate a DOCX blob from a report.
 * Gera o blob DOCX usando docx lib sem fazer download automatico.
 *
 * @param {string} [reportId] - Report ID (active if omitted)
 * @param {Object} [options] - Export options (sections, etc.)
 * @returns {Promise<{blob: Blob | null, filename: string}>}
 */
export async function exportReportToDOCX(reportId: any, options: any = {}) {
    const report = _resolveReport(reportId);
    if (!report) {
        throw new Error('REPORT_NOT_FOUND');
    }
    if (!report.content) {
        throw new Error('REPORT_EMPTY');
    }
    const { generateReportDOCXBlob } = (await import('./docxExport.js' as string));
    if (typeof generateReportDOCXBlob === 'function') {
        return generateReportDOCXBlob(reportId, options);
    }
    // Fallback: usar exportReportDOCX que faz download
    const { exportReportDOCX } = await import('./docxExport.js' as string);
    const result = await exportReportDOCX(options);
    log.info('DOCX exported via download fallback');
    return { blob: null, filename: result?.filename || _buildFilename(report, 'docx') };
}
// ----------------------------------------------------------------
// SAVE TO FILES SYSTEM
// Salva blob gerado no sistema de arquivos (local IDB ou Supabase)
// ----------------------------------------------------------------
/**
 * Save a generated report file to the Files system.
 * Registra o arquivo no gerenciador de arquivos local ou remoto.
 *
 * @param {string|undefined} reportId - Source report ID
 * @param {'pdf'|'docx'} format - File format
 * @param {Blob} blob - File content as Blob
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function saveReportToFiles(reportId: any, format: any, blob: any) {
    if (!(blob instanceof Blob)) {
        return { ok: false, error: 'Invalid blob' };
    }
    const report = _resolveReport(reportId);
    const filename = _buildFilename(report, format);
    const mimeType = format === 'pdf' ? 'application/pdf' : _docxMime();
    const file = new File([blob], filename, { type: mimeType });
    // Tenta registrar no Supabase (usuarios autenticados)
    try {
        const fm = await import('../files/fileManager.js' as string);
        const result = await fm.register(file, {
            source: 'report_export',
            tags: ['report', format, report?.title || 'untitled'],
        });
        if (result.ok) {
            log.info('Report saved to Files (remote)', { id: result.data?.id });
            return result;
        }
    }
    catch (err: any) {
        log.warn('Remote file register unavailable, saving locally', err?.message);
    }
    // Fallback: salva localmente via IDB
    return _saveLocal(file, report, format);
}
// ----------------------------------------------------------------
// COMBINED EXPORT + SAVE
// Exporta e salva em uma unica operacao
// ----------------------------------------------------------------
/**
 * Export report to format and save to Files in one step.
 * Exporta o relatorio e salva no sistema de arquivos.
 *
 * @param {string|undefined} reportId - Report ID
 * @param {'pdf'|'docx'} format - Target format
 * @param {Object} [options] - Export options
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function exportAndSaveToFiles(reportId: any, format: any, options: any = {}) {
    const exportFn = format === 'docx' ? exportReportToDOCX : exportReportToPDF;
    const result = await exportFn(reportId, options);
    if (!result.blob) {
        log.warn('No blob returned, file saved via download only');
        return { ok: true, data: { filename: result.filename, downloadOnly: true } };
    }
    return saveReportToFiles(reportId, format, result.blob);
}
// ----------------------------------------------------------------
// FILE METADATA
// Estrutura de metadados do arquivo exportado
// ----------------------------------------------------------------
/**
 * Build file metadata structure for a report export.
 * Constroi metadados do arquivo para registro no Files.
 *
 * @param {string} reportId - Source report ID
 * @param {'pdf'|'docx'} format - File format
 * @param {number} sizeBytes - File size in bytes
 * @returns {Object} File metadata
 */
export function buildFileMetadata(reportId: any, format: any, sizeBytes: any) {
    const report = _resolveReport(reportId);
    return {
        filename: _buildFilename(report, format),
        extension: format,
        mime_type: format === 'pdf' ? 'application/pdf' : _docxMime(),
        size_bytes: sizeBytes,
        source: 'report_export',
        scope_type: 'workspace',
        tags: ['report', format, report?.title || 'untitled'],
        report_id: reportId || null,
        created_at: new Date().toISOString(),
    };
}
// ----------------------------------------------------------------
// PRIVATE HELPERS
// ----------------------------------------------------------------
/**
 * @private Resolve report by ID or active
 * @param {string} [reportId]
 */
function _resolveReport(reportId: any) {
    if (reportId) {
        return getReportById(reportId) || null;
    }
    const activeId = getActiveReportId();
    if (activeId) {
        return getReportById(activeId) || getReport();
    }
    return getReport();
}
/**
 * @private Build sanitized filename
 * @param {any} report
 * @param {string} format
 */
function _buildFilename(report: any, format: any) {
    const title = String(report?.title || 'report')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
    const date = new Date().toISOString().slice(0, 10);
    return `${title}-${date}.${format}`;
}
/** @private DOCX MIME type */
function _docxMime() {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}
/**
 * @private Save file locally via IDB (offline fallback)
 * @param {File} file
 * @param {any} report
 * @param {string} format
 */
async function _saveLocal(file: any, report: any, format: any) {
    try {
        const { idbSet, idbGet } = await import('../storage/idbStore.js' as string);
        const STORE_KEY = 'ecbyts-local-report-files';
        const rows = (await idbGet(STORE_KEY)) || [];
        const now = new Date().toISOString();
        const row = {
            id: `local-report:${crypto.randomUUID?.() || Date.now()}`,
            filename: file.name,
            extension: format,
            mime_type: file.type,
            size_bytes: file.size,
            source: 'report_export',
            scope_type: 'workspace',
            tags: ['report', format],
            status: 'active',
            created_at: now,
            updated_at: now,
            local_only: true,
            blob: file,
        };
        rows.unshift(row);
        const persisted = await idbSet(STORE_KEY, rows);
        if (!persisted) {
            return { ok: false, error: 'Failed to save locally' };
        }
        log.info('Report saved to Files (local IDB)', { id: row.id });
        const { blob: _b, ...meta } = row;
        return { ok: true, data: meta };
    }
    catch (err: any) {
        const msg = err?.message || String(err);
        log.error('Local save failed', msg);
        return { ok: false, error: msg };
    }
}
