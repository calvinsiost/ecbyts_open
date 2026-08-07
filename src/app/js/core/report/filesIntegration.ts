// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   REPORTS ↔ FILES INTEGRATION — SPEC_REPORTS_FILES_INTEGRATION

   Pure helpers para ponte report export → files:
   - Filename generator (safe, temporal)
   - File metadata builder (tags auto, model_id link)
   - Format detector (PDF/DOCX) + MIME types
   - Snapshot vs live link mode §Q2
   - Report registry entry builder

   Export real (jsPDF, docx.js, fileManager) fica em handler.
   ================================================================ */

import { formatBytes as _formatBytesCanonical } from '../../utils/helpers/formatBytes.js';

// ──────────────────────────────────────────────────────────────────────
// Constants §Q1/Q2/Q3
// ──────────────────────────────────────────────────────────────────────

export const EXPORT_FORMATS = Object.freeze(['pdf', 'docx', 'html', 'md']);

export const FORMAT_MIME = Object.freeze({
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    html: 'text/html',
    md: 'text/markdown',
});

export const FORMAT_EXTENSIONS = Object.freeze({
    pdf: '.pdf',
    docx: '.docx',
    html: '.html',
    md: '.md',
});

export const SNAPSHOT_MODES = Object.freeze(['snapshot', 'live_link']);

// Tags automáticas por default §Integração Files
export const AUTO_TAGS = Object.freeze(['report', 'auto-generated']);

// Quality presets para PDF
export const PDF_QUALITY_PRESETS = Object.freeze(['low', 'medium', 'high']);

// ──────────────────────────────────────────────────────────────────────
// Filename sanitizer + generator
// ──────────────────────────────────────────────────────────────────────

/**
 * Remove caracteres inválidos em filename (Windows/Unix safe).
 * @param name
 * @returns
 */
export function sanitizeFilename(name: string): string {
    if (typeof name !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    const CONTROL_AND_INVALID = /[<>:"/\\|?*\x00-\x1f]/g;
    return (
        name.trim().replace(CONTROL_AND_INVALID, '').replace(/\s+/g, '_').replace(/^\.+/, '').slice(0, 200) ||
        'relatorio'
    );
}

/**
 * Gera filename default baseado em título + timestamp.
 * @param title
 * @param format
 * @param nowMs?
 * @returns
 */
export function generateReportFilename(title: string, format: string, nowMs?: Date | number): string {
    const base = sanitizeFilename(title || 'Relatorio');
    const ext = (FORMAT_EXTENSIONS as Record<string, string>)[format] || '';
    const d = nowMs ? new Date(nowMs) : new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${base}_${yyyy}-${mm}-${dd}${ext}`;
}

// ──────────────────────────────────────────────────────────────────────
// Format validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param format
 * @returns
 */
export function isValidExportFormat(format: string): boolean {
    return EXPORT_FORMATS.includes(format);
}

/**
 * @param filename
 * @returns formato inferido
 */
export function detectFormatFromFilename(filename: string): string | null {
    if (typeof filename !== 'string') return null;
    const lower = filename.toLowerCase();
    for (const [fmt, ext] of Object.entries(FORMAT_EXTENSIONS)) {
        if (lower.endsWith(ext)) return fmt;
    }
    return null;
}

/**
 * @param format
 * @returns MIME type
 */
export function getMimeType(format: string): string {
    return (FORMAT_MIME as Record<string, string>)[format] || 'application/octet-stream';
}

// ──────────────────────────────────────────────────────────────────────
// Report export options validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param options
 * @returns
 */
export function validateExportOptions(options: Record<string, any>): {
    valid: boolean;
    errors: string[];
    sanitized: any;
} {
    const errors: string[] = [];
    if (!options || typeof options !== 'object') {
        return { valid: false, errors: ['not object'], sanitized: null };
    }
    if (!isValidExportFormat(options.format)) {
        errors.push(`format must be one of: ${EXPORT_FORMATS.join(', ')}`);
    }
    if (options.snapshotMode && !SNAPSHOT_MODES.includes(options.snapshotMode)) {
        errors.push(`snapshotMode must be one of: ${SNAPSHOT_MODES.join(', ')}`);
    }
    if (options.format === 'pdf' && options.quality && !PDF_QUALITY_PRESETS.includes(options.quality)) {
        errors.push(`quality must be one of: ${PDF_QUALITY_PRESETS.join(', ')}`);
    }

    const sanitized =
        errors.length === 0
            ? {
                  format: options.format,
                  snapshotMode: options.snapshotMode || 'snapshot', // §Q2 default snapshot
                  includeScenes: Boolean(options.includeScenes),
                  includeHeader: options.includeHeader !== false, // default true
                  includeFooter: Boolean(options.includeFooter),
                  quality: options.quality || 'high',
                  customTitle: typeof options.customTitle === 'string' ? options.customTitle : null,
              }
            : null;

    return { valid: errors.length === 0, errors, sanitized };
}

// ──────────────────────────────────────────────────────────────────────
// File metadata builder
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói entrada de registry para arquivo de relatório exportado.
 *
 * @param input
 * @param nowMs
 * @returns
 */
export function buildReportFileEntry(
    input: {
        reportId: any;
        title: any;
        format: any;
        sizeBytes: any;
        modelId?: any;
        customTags?: any;
        snapshotMode?: any;
    },
    nowMs?: Date | number
): object | null {
    if (!input || typeof input !== 'object') return null;
    if (!input.reportId || !isValidExportFormat(input.format)) return null;

    const tags = [...AUTO_TAGS];
    if (Array.isArray(input.customTags)) {
        for (const t of input.customTags) {
            if (typeof t === 'string' && t && !tags.includes(t)) tags.push(t);
        }
    }

    const createdAt = nowMs ? new Date(nowMs).toISOString() : new Date().toISOString();

    return {
        filename: generateReportFilename(input.title || 'Relatorio', input.format, nowMs),
        reportId: input.reportId,
        modelId: input.modelId || null,
        format: input.format,
        mimeType: getMimeType(input.format),
        sizeBytes: Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0,
        tags,
        section: 'reports',
        createdAt,
        snapshotMode: input.snapshotMode || 'snapshot',
    };
}

// ──────────────────────────────────────────────────────────────────────
// Reverse lookup (reabrir em Report editor §Journey 3)
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado uma entry de arquivo, decide se pode reabrir no editor.
 *
 * @param fileEntry
 * @returns
 */
export function resolveReopenAction(fileEntry: Record<string, any>): { canOpen: boolean; action: string } {
    if (!fileEntry || typeof fileEntry !== 'object') {
        return { canOpen: false, action: 'none' };
    }
    // Live link ainda vinculado → abrir direto
    if (fileEntry.snapshotMode === 'live_link' && fileEntry.reportId) {
        return { canOpen: true, action: 'open_original' };
    }
    // Snapshot → re-importar conteúdo (novo relatório)
    if (fileEntry.format === 'md' || fileEntry.format === 'html') {
        return { canOpen: true, action: 'import_as_new' };
    }
    // PDF/DOCX → extract text (opt-in)
    return { canOpen: true, action: 'import_from_pdf_text' };
}

// ──────────────────────────────────────────────────────────────────────
// Size formatting helper
// ──────────────────────────────────────────────────────────────────────

/**
 * @param bytes
 * @returns
 */
export function formatFileSize(bytes: number): string {
    return _formatBytesCanonical(bytes, { unknownLabel: '—', maxUnit: 'GB', kbDecimals: 1 });
}
