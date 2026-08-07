// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Extracted from app/js/utils/handlers/ingestion.js in ARCH-MONO-001 Phase 6b.
//
// _internal.js - Pure constants and helpers for ingestion handlers.
// No module state, no window access, no external imports.
// ----------------------------------------------------------------

// CSS reused in wizard cards and document review modals.
// Uses CSS custom properties for light/dark theme compatibility.
export const S_CARD = 'background:var(--neutral-100);padding:10px;border-radius:6px;margin-bottom:8px;color:var(--neutral-800);';
export const S_LABEL = 'display:block;margin:3px 0;cursor:pointer;color:var(--neutral-800);';
export const S_TITLE = 'margin:0 0 6px;font-weight:600;color:var(--neutral-800);';
export const S_MUTED = 'color:var(--neutral-500);';
export const S_TABLE_HEADER = 'font-size:10px;color:var(--neutral-500);border-bottom:1px solid var(--neutral-200);';
export const S_TABLE_ROW = 'border-bottom:1px solid var(--neutral-100);';
export const S_SAMPLE = 'font-family:monospace;font-size:10px;color:var(--neutral-500);background:var(--neutral-50);padding:2px 6px;border-radius:3px;';

// Confidence color scheme for document readings.
// Each entry maps a confidence level to bg/border/dot CSS + display label.
export const CONF_COLORS = {
    green: { bg: 'var(--success-50,#ecfdf5)', border: 'var(--success-300,#86efac)', dot: '#22c55e', label: 'Auto' },
    yellow: { bg: 'var(--warning-50,#fffbeb)', border: 'var(--warning-300,#fcd34d)', dot: '#eab308', label: 'Revisar' },
    red: { bg: 'var(--error-50,#fef2f2)', border: 'var(--error-300,#fca5a5)', dot: '#ef4444', label: 'Quarentena' },
} as const;

export type ConfColorKey = keyof typeof CONF_COLORS;

// Ordered document processing phases for the progress bar in doc ingestion.
export const DOC_PROCESS_PHASES = [
    { key: 'prepare', label: 'Preparar arquivo' },
    { key: 'extract', label: 'Extrair tabelas' },
    { key: 'enrich', label: 'Enriquecer dados' },
    { key: 'finalize', label: 'Finalizar revisao' },
] as const;

export type DocProcessPhaseKey = (typeof DOC_PROCESS_PHASES)[number]['key'];

// PDF rendering scale factor used by pdf.js.
export const PDF_SCALE = 1.2;

// Valid decision field names for spreadsheet ingestion wizard.
// Used as validation gate in _ingestionDecision().
export const VALID_DECISIONS = new Set<string>([
    // Environmental
    'nonDetectStrategy',
    'campaignStrategy',
    'campaignNames',
    'multilevelStrategy',
    'coordinateOrigin',
    'importActionLevels',
    'importThresholds',
    'clearStrategy',
    'exportBeforeClear',
    'applyOrigin',
    'suggestedOrigin',
    'duplicateStrategy',
    'defaultWellDepth',
    'defaultWellDiameter',
    'missingCoordsStrategy',
    'generateBoundary',
    'generateTerrain',
    'generateAerial',
    'defaultElevation',
    'elevationStrategy',
    'geoOffsetX',
    'geoOffsetY',
    'geoRotationDeg',
    // OHS
    'gheStrategy',
    'sampleTypeStrategy',
    'lgpdStrategy',
    'oelSource',
    'importAptitude',
    // Shared
    'formatConfirmed',
    'columnOverrides',
    'ambiguityResolutions',
    'domain',
]);

// --- Pure helper functions ---

/**
 * Maps progress percentage + message to a processing phase key.
 * Used by _renderDocProgress() to highlight the active phase in the progress bar.
 * @param {number} pct - Progress percentage (0-100)
 * @param {string} [msg?] - Processing status message
 * @returns {string} Phase key from DOC_PROCESS_PHASES
 */
export function _detectDocProcessPhase(pct: number, msg?: string): string {
    const text = String(msg || '').toLowerCase();
    if (text.includes('ocr') || text.includes('analisando') || text.includes('georefer')) return 'enrich';
    if (text.includes('classifying') || text.includes('classific') || pct >= 95) return 'finalize';
    if (text.includes('extract') || text.includes('table') || text.includes('pdfplumber') || pct >= 15)
        return 'extract';
    return 'prepare';
}

/**
 * Formats elapsed milliseconds into a human-readable short string.
 * @param {number} ms - Elapsed time in milliseconds
 * @returns {string} e.g. "0ms", "3s", "2m 15s"
 */
export function _formatDocElapsed(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '0s';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export {
    _detectDocProcessPhase as detectDocProcessPhase,
    _formatDocElapsed as formatDocElapsed,
};