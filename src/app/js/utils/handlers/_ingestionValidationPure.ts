// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier C — ingestion.ts (3270L, score 1050 per
// MONOLITH_IMPACT_ANALYSIS_2026_05_27 #10 IMPACTO+PERF).
//
// Pure-logic extraction from src/app/js/utils/handlers/ingestion.ts (canonical .ts).
// Read from canonical source per memory/feedback_read_ts_canonical_not_js_derived.md.
//
// Hand-authored R1-safe. Complementa _ingestionPure.ts existente (5 exports
// já cobrem hasValidSourceBbox, extractPageText, computeBboxArea, bboxesOverlap,
// normalizeDocFieldName). Este arquivo cobre validation table + doc extraction
// novos — separado para evitar contenção multi-LLM com Codex/claude-executor.
//
// Spec NOT:
// - NÃO ler DOM (caller monta <table>/<tr>/<td>)
// - NÃO ler escapeHtml (caller aplica em outputs)
// - NÃO ler i18n (caller resolve labels)
// - NÃO emoji
//
// Extracted helpers:
//   - OBSERVATIONS_TOLERANCE_PCT          (frozen 0.02)
//   - computeValidationMatch              (expected/imported/entity → boolean)
//   - pickValidationIcon                  (match → HTML entity check/cross)
//   - pickValidationColor                 (match → CSS var token)
//   - computeOverallValidationStatus      (allMatch → { color, text })
//   - errorToShortMessage                 (any → string, compatible com _errorMessage)
//   - extractPageTextByMarker             (rawText + page → bounded substring)

export type ValidationEntity = 'Observations' | 'Elements' | 'Campaigns' | 'Wells' | string;

export interface ValidationRow {
    entity: ValidationEntity;
    expected: number | string;
    imported: number | string;
    sheet?: string;
}

export interface OverallValidationStatus {
    allMatch: boolean;
    color: string;
    text: string;
}

/** Frozen tolerance pct for Observations match (matches inline 0.02 at ingestion.ts:1494). */
export const OBSERVATIONS_TOLERANCE_PCT = 0.02;

/**
 * Compute whether expected vs imported counts match for a validation row.
 *
 * Rules (preserved from caller _renderIngestionValidationTable):
 *   - expected === '?'   → match (unknown expected count = OK)
 *   - 0 === 0            → match (empty entity correctly imported)
 *   - both numeric       → |imp - exp| <= max(1, ceil(exp * tolerance))
 *                          tolerance = 2% for Observations entity, else 0%
 *   - otherwise          → strict string equality
 */
export function computeValidationMatch(
    expected: number | string,
    imported: number | string,
    entity: ValidationEntity = '',
): boolean {
    if (expected === '?') return true;
    if (expected === 0 && imported === 0) return true;
    if (typeof expected === 'number' && typeof imported === 'number') {
        const tol = entity === 'Observations' ? OBSERVATIONS_TOLERANCE_PCT : 0;
        const allowedDelta = Math.max(1, Math.ceil(expected * tol));
        return Math.abs(imported - expected) <= allowedDelta;
    }
    return String(imported) === String(expected);
}

/** HTML entity for match icon: check (✓) on match, cross (✗) on mismatch. */
export function pickValidationIcon(match: boolean): string {
    return match ? '&#10003;' : '&#10007;';
}

/** CSS variable token for match color. */
export function pickValidationColor(match: boolean): string {
    return match ? 'var(--success)' : 'var(--error)';
}

/**
 * Compute overall validation status from rows.
 *   - allMatch=true  → success color + "OK — todos os registros importados"
 *   - allMatch=false → error color + "Divergencia detectada — verifique os dados"
 *
 * Caller can override labels via the `labels` parameter (i18n).
 */
export function computeOverallValidationStatus(
    rows: ReadonlyArray<ValidationRow> | null | undefined,
    labels: { okText?: string; mismatchText?: string } = {},
): OverallValidationStatus {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            allMatch: true,
            color: 'var(--success)',
            text: labels.okText ?? 'OK — todos os registros importados',
        };
    }
    let allMatch = true;
    for (const row of rows) {
        if (!row) continue;
        const match = computeValidationMatch(row.expected, row.imported, row.entity);
        // skip the same "OK by definition" cases when checking allMatch
        if (!match && row.expected !== '?' && !(row.expected === 0 && row.imported === 0)) {
            allMatch = false;
            break;
        }
    }
    return {
        allMatch,
        color: allMatch ? 'var(--success)' : 'var(--error)',
        text: allMatch
            ? labels.okText ?? 'OK — todos os registros importados'
            : labels.mismatchText ?? 'Divergencia detectada — verifique os dados',
    };
}

/**
 * Normalize an error-like value to a short message string.
 *   Error instance → .message
 *   object with .message → String(message)
 *   else → String(error)
 *
 * Matches caller _errorMessage @ ingestion.ts:53. Aligned with
 * _llmChatVoicePure.errorToMessage (same semantic, different scope).
 */
export function errorToShortMessage(err: unknown): string {
    if (err == null) return '';
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && 'message' in (err as Record<string, unknown>)) {
        return String((err as { message: unknown }).message);
    }
    return String(err);
}

/**
 * Extract per-page text from a raw multi-page document string.
 * Matches caller _extractPageText @ ingestion.ts:2992.
 *
 *   - Looks for marker `Página <N>` and bounds to next page marker or +2000 chars
 *   - Empty rawText / missing marker → ''
 *   - Locale-specific marker is parameterizable for i18n flexibility
 */
export function extractPageTextByMarker(
    rawText: string | null | undefined,
    pageNum: number,
    options: { markerPrefix?: string; maxLength?: number } = {},
): string {
    if (typeof rawText !== 'string' || !rawText) return '';
    if (!Number.isFinite(pageNum) || pageNum < 1) return '';
    const prefix = typeof options.markerPrefix === 'string' && options.markerPrefix ? options.markerPrefix : 'Página';
    const maxLength = Number.isFinite(options.maxLength) && (options.maxLength as number) > 0
        ? Math.floor(options.maxLength as number)
        : 2000;
    const marker = `${prefix} ${pageNum}`;
    const nextMarker = `${prefix} ${pageNum + 1}`;
    const start = rawText.indexOf(marker);
    if (start === -1) return '';
    const end = rawText.indexOf(nextMarker, start);
    return rawText.substring(start, end === -1 ? start + maxLength : end);
}
