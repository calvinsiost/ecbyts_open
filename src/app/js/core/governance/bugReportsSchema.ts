// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Bug Reports + Telemetry Schema - pure module
 *
 * Single source of truth for enums, state machine, validators and
 * dedup key computation shared between:
 *   - reporter.js (client buffer + submission)
 *   - reportBugModal.js (user-facing form)
 *   - bugReportsAdminPanel.js (admin workflow)
 *   - edge function error-ingest (server-side routing)
 *   - Node cheap tests (no browser deps)
 *
 * Reference spec: docs/specs/_archived/SPEC_BUG_REPORTS_SEPARATION.md
 *
 * Extracted 2026-04-10 during T2-#5 Phase 1 execution.
 */

// ============================================================================
// Telemetry error types (auto-captured via window.onerror / console.warn)
// ============================================================================

export const TELEMETRY_ERROR_TYPES = Object.freeze(['crash', 'warning']);

// ============================================================================
// Bug report enums - severity + affected area
// ============================================================================

export const BUG_REPORT_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

export const BUG_REPORT_AFFECTED_AREAS = Object.freeze([
    '3d-view',
    'data-studio',
    'import',
    'export',
    'governance',
    'eis',
    'reports',
    'analytics',
    'mobile',
    'auth',
    'other',
]);

// ============================================================================
// Bug report workflow state machine
// ============================================================================

export const BUG_REPORT_STATUSES = Object.freeze(['new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate']);

/**
 * Allowed forward transitions in the bug report workflow.
 * Terminal states (resolved / wontfix / duplicate) can be re-opened only
 * by an admin via explicit reopen (modeled as new → triaged, not here).
 */
export const BUG_REPORT_TRANSITIONS = Object.freeze({
    new: Object.freeze(['triaged', 'duplicate', 'wontfix']),
    triaged: Object.freeze(['in_progress', 'resolved', 'wontfix', 'duplicate']),
    in_progress: Object.freeze(['resolved', 'wontfix', 'duplicate', 'triaged']),
    resolved: Object.freeze([]), // terminal
    wontfix: Object.freeze([]), // terminal
    duplicate: Object.freeze([]), // terminal
});

/**
 * Check if a status transition is allowed by the workflow state machine.
 */
export function canTransitionStatus(fromStatus: string, toStatus: string): boolean {
    if (fromStatus === toStatus) return true; // no-op update is always valid
    const allowed = (BUG_REPORT_TRANSITIONS as Record<string, readonly string[]>)[fromStatus];
    if (!allowed) return false;
    return allowed.includes(toStatus);
}

/**
 * Check if a status is terminal (no forward transitions allowed).
 */
export function isTerminalStatus(status: string): boolean {
    const transitions = (BUG_REPORT_TRANSITIONS as Record<string, readonly string[]>)[status];
    return Array.isArray(transitions) && transitions.length === 0;
}

// ============================================================================
// Bug report input validation (client-side before submission)
// ============================================================================

const TITLE_MIN = 3;
const TITLE_MAX = 200;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 10000;

/**
 * Validate a bug report submission payload against the schema constraints.
 * Mirrors the SQL CHECK constraints in public.bug_reports to fail-fast
 * before a network round-trip.
 */
export function validateBugReportInput(
    payload: any,
): { ok: true } | { ok: false; field: string | null; reason: string } {
    if (!payload || typeof payload !== 'object') {
        return { ok: false, field: null, reason: 'payload_not_object' };
    }

    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (title.length < TITLE_MIN) {
        return { ok: false, field: 'title', reason: 'too_short' };
    }
    if (title.length > TITLE_MAX) {
        return { ok: false, field: 'title', reason: 'too_long' };
    }

    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    if (description.length < DESCRIPTION_MIN) {
        return { ok: false, field: 'description', reason: 'too_short' };
    }
    if (description.length > DESCRIPTION_MAX) {
        return { ok: false, field: 'description', reason: 'too_long' };
    }

    const severity = payload.severity || 'medium';
    if (!BUG_REPORT_SEVERITIES.includes(severity)) {
        return { ok: false, field: 'severity', reason: 'not_in_enum' };
    }

    if (payload.affected_area != null && !BUG_REPORT_AFFECTED_AREAS.includes(payload.affected_area)) {
        return { ok: false, field: 'affected_area', reason: 'not_in_enum' };
    }

    // Status: if provided, must be 'new' for user submissions (RLS WITH CHECK)
    if (payload.status != null && payload.status !== 'new') {
        return { ok: false, field: 'status', reason: 'must_be_new_on_insert' };
    }

    return { ok: true };
}

// ============================================================================
// Telemetry dedup key computation
// ============================================================================

/**
 * Extract the first stack frame line from a stack trace string. Used as
 * part of the dedup key so errors from different call sites don't collide
 * while identical errors reloaded within the same hour do.
 *
 * @param stackTrace
 * @returns first non-empty line, or empty string
 */
export function firstStackFrame(stackTrace: string | null | undefined): string {
    if (!stackTrace || typeof stackTrace !== 'string') return '';
    const lines = stackTrace.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) return trimmed;
    }
    return '';
}

/**
 * Compute a deterministic dedup key for a telemetry error row.
 * Same (errorType, message, firstStackFrame) tuple always yields the
 * same key, so the UNIQUE(dedup_key, user, hour_bucket) index in
 * telemetry_errors dedups floods from reload loops.
 *
 * Uses the Web Crypto API subtle digest, which is available in both
 * modern browsers and Node.js 20+ (globalThis.crypto).
 *
 * @param errorType - 'crash' | 'warning'
 * @param message - error message
 * @param stackTrace - full stack trace (optional)
 * @returns SHA-256 hex digest (64 chars)
 */
export async function computeDedupKey(
    errorType: string,
    message: string,
    stackTrace: string | null,
): Promise<string> {
    const parts = [String(errorType || ''), String(message || ''), firstStackFrame(stackTrace)];
    const input = parts.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('crypto.subtle not available');
    }
    const hashBuffer = await subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Telemetry batch payload validation (client → edge function)
// ============================================================================

const MAX_ERRORS_PER_BATCH = 5;
const MAX_MESSAGE_LEN = 5000;
const MAX_STACK_LEN = 10000;

interface TelemetryErrorItem {
    error_type?: unknown;
    message?: unknown;
    stack_trace?: unknown;
    url?: unknown;
    session_id?: unknown;
    browser_info?: unknown;
    metadata?: unknown;
}

function validateBatchShape(
    errors: unknown[],
): { ok: false; reason: string } | null {
    if (!Array.isArray(errors)) {
        return { ok: false, reason: 'not_array' };
    }
    if (errors.length === 0) {
        return { ok: false, reason: 'empty' };
    }
    if (errors.length > MAX_ERRORS_PER_BATCH) {
        return { ok: false, reason: 'too_many' };
    }
    return null;
}

function cleanTelemetryItem(
    item: unknown,
): Record<string, unknown> | null {
    if (!item || typeof item !== 'object') return null;
    const it = item as TelemetryErrorItem;
    const errorType = String(it.error_type || '').trim();
    if (!TELEMETRY_ERROR_TYPES.includes(errorType)) return null;
    const message = String(it.message || '')
        .trim()
        .slice(0, MAX_MESSAGE_LEN);
    if (!message) return null;
    const stackTrace = it.stack_trace ? String(it.stack_trace).slice(0, MAX_STACK_LEN) : null;
    return {
        error_type: errorType,
        message,
        stack_trace: stackTrace,
        url: it.url ? String(it.url).slice(0, 2000) : null,
        session_id: it.session_id || null,
        browser_info: it.browser_info || null,
        metadata: it.metadata && typeof it.metadata === 'object' ? it.metadata : {},
    };
}

/**
 * Validate a telemetry batch payload before submission. Mirrors the
 * edge function's validation so client can fail-fast and skip useless
 * network calls on malformed input.
 */
export function validateTelemetryBatch(
    errors: unknown[],
): { ok: true; cleaned: Array<Record<string, unknown>> } | { ok: false; reason: string } {
    const shapeError = validateBatchShape(errors);
    if (shapeError) return shapeError;

    const cleaned: Array<Record<string, unknown>> = [];
    for (const item of errors) {
        const cleanedItem = cleanTelemetryItem(item);
        if (cleanedItem) cleaned.push(cleanedItem);
    }

    if (cleaned.length === 0) {
        return { ok: false, reason: 'all_items_invalid' };
    }

    return { ok: true, cleaned };
}

export const BUG_REPORT_LIMITS = Object.freeze({
    TITLE_MIN,
    TITLE_MAX,
    DESCRIPTION_MIN,
    DESCRIPTION_MAX,
    MAX_ERRORS_PER_BATCH,
    MAX_MESSAGE_LEN,
    MAX_STACK_LEN,
});
