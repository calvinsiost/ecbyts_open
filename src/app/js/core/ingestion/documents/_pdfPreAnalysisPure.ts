// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// IMPORT-UX-001 RF-7 — pure-logic da pré-análise de PDF ao selecionar o arquivo:
// contagem de páginas + estimativa de tempo + decisão de avisar/oferecer intervalo
// quando o documento é grande. Sem I/O (contagem de páginas via pdf.js é do caller).

// ===========================================================================
// Constantes calibradas
// ===========================================================================

/** Acima deste nº de páginas, a pré-análise avisa e oferece intervalo (spec RF-7). */
export const LARGE_DOCUMENT_PAGE_THRESHOLD = 100;

/** Segundos estimados de processamento por página (mesma ordem de grandeza do
 *  comentário de campo em _pdfPageSelectionPure.ts: "~10s/página" para PDFs
 *  técnicos com mapas/plantas). */
export const ESTIMATED_SECONDS_PER_PAGE = 10;

// ===========================================================================
// Tipos
// ===========================================================================

export interface PdfPreAnalysis {
    readonly pageCount: number;
    readonly fileSizeBytes: number;
    readonly estimatedSeconds: number;
    readonly isLarge: boolean;
}

export interface PageRangeSelection {
    readonly start: number;
    readonly end: number;
}

// ===========================================================================
// API pública
// ===========================================================================

/** Monta a pré-análise a partir de dados já coletados (pageCount via pdf.js,
 *  fileSizeBytes via File.size). Nunca lança — entradas inválidas viram 0/false. */
export function buildPdfPreAnalysis(pageCount: number, fileSizeBytes: number): PdfPreAnalysis {
    const safePages = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 0;
    const safeSize = Number.isFinite(fileSizeBytes) && fileSizeBytes > 0 ? fileSizeBytes : 0;
    return Object.freeze({
        pageCount: safePages,
        fileSizeBytes: safeSize,
        estimatedSeconds: safePages * ESTIMATED_SECONDS_PER_PAGE,
        isLarge: safePages > LARGE_DOCUMENT_PAGE_THRESHOLD,
    });
}

/** Formata a estimativa de tempo em texto curto pt-BR ("~5s", "~2min", "~1h10min"). */
export function formatEstimatedTime(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
    if (safe < 60) return `~${safe}s`;
    const totalMinutes = Math.round(safe / 60);
    if (totalMinutes < 60) return `~${totalMinutes}min`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `~${hours}h${minutes}min` : `~${hours}h`;
}

/** Formata bytes em texto curto ("340 KB", "2.1 MB"). */
export function formatFileSize(bytes: number): string {
    const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    if (safe < 1024) return `${safe} B`;
    if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(0)} KB`;
    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
}

/** Valida um intervalo de páginas escolhido pelo usuário contra o total real
 *  do documento. Retorna o intervalo clampeado e válido (start<=end, dentro
 *  de [1, pageCount]), ou null se o documento não tem páginas (pageCount<=0). */
export function clampPageRange(
    range: PageRangeSelection,
    pageCount: number,
): PageRangeSelection | null {
    if (!Number.isInteger(pageCount) || pageCount <= 0) return null;
    const start = Math.max(1, Math.min(Math.trunc(range.start) || 1, pageCount));
    const end = Math.max(start, Math.min(Math.trunc(range.end) || pageCount, pageCount));
    return Object.freeze({ start, end });
}

/** Metadata pública. */
export const PDF_PRE_ANALYSIS_META = Object.freeze({
    largeDocumentPageThreshold: LARGE_DOCUMENT_PAGE_THRESHOLD,
    estimatedSecondsPerPage: ESTIMATED_SECONDS_PER_PAGE,
});
