// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ERROR REPORT CLASSIFIER — SPEC_BUG_REPORTS_SEPARATION

   Pure helpers para rotear reports entre 2 tabelas:
   - telemetry_errors: crash + warning (auto-capture, low-value, high-volume)
   - bug_reports: report consciente do user (high-value, workflow)

   Inclui workflow transitions de bug_reports:
     new → triaged → in_progress → resolved | wontfix
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────

export const ERROR_TYPES = Object.freeze(['crash', 'warning', 'bug_report']);

export const TELEMETRY_TYPES = Object.freeze(['crash', 'warning']);
export const BUG_REPORT_TYPES = Object.freeze(['bug_report']);

export const TARGET_TABLES = Object.freeze({
    TELEMETRY: 'telemetry_errors',
    BUG_REPORTS: 'bug_reports',
});

export const BUG_REPORT_STATUSES = Object.freeze(['new', 'triaged', 'in_progress', 'resolved', 'wontfix']);

export const BUG_REPORT_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

// Workflow transitions canônicas
const VALID_TRANSITIONS = Object.freeze({
    new: ['triaged', 'wontfix'],
    triaged: ['in_progress', 'wontfix'],
    in_progress: ['resolved', 'triaged'], // permite voltar para triaged se desbloqueio necessário
    resolved: [], // terminal
    wontfix: [], // terminal
});

// ──────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna target table para um error_type.
 * @param errorType
 * @returns
 */
export function getTargetTable(errorType: string): string | null {
    if (TELEMETRY_TYPES.includes(errorType)) return TARGET_TABLES.TELEMETRY;
    if (BUG_REPORT_TYPES.includes(errorType)) return TARGET_TABLES.BUG_REPORTS;
    return null;
}

/**
 * @param errorType
 * @returns
 */
export function isTelemetryType(errorType: string): boolean {
    return TELEMETRY_TYPES.includes(errorType);
}

/**
 * @param errorType
 * @returns
 */
export function isBugReportType(errorType: string): boolean {
    return BUG_REPORT_TYPES.includes(errorType);
}

// ──────────────────────────────────────────────────────────────────────
// Payload validators
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida payload para telemetry_errors (crash/warning).
 * Shape mínimo (captura automática).
 */
export function validateTelemetryPayload(payload: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') return { valid: false, errors: ['payload not object'] };
    if (!TELEMETRY_TYPES.includes(payload.error_type))
        errors.push(`error_type must be one of: ${TELEMETRY_TYPES.join(', ')}`);
    if (!payload.message || typeof payload.message !== 'string') errors.push('message required');
    // stack_trace / url opcionais
    return { valid: errors.length === 0, errors };
}

/**
 * Valida payload para bug_reports (user-submitted).
 * Requer campos estruturados (§1 Solução).
 */
export function validateBugReportPayload(payload: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') return { valid: false, errors: ['payload not object'] };
    if (payload.error_type !== 'bug_report') errors.push('error_type must be bug_report');
    if (!payload.title || typeof payload.title !== 'string') errors.push('title required');
    else if (payload.title.length > 200) errors.push('title too long (>200)');
    if (!payload.description || typeof payload.description !== 'string') errors.push('description required');
    if (payload.severity && !BUG_REPORT_SEVERITIES.includes(payload.severity)) {
        errors.push(`severity must be one of: ${BUG_REPORT_SEVERITIES.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Dispatcher: classifica + valida payload.
 * @param payload
 * @returns
 */
export function classifyAndValidate(payload: Record<string, any>): {
    table: string | null;
    valid: boolean;
    errors: Array<string>;
} {
    if (!payload || typeof payload !== 'object') {
        return { table: null, valid: false, errors: ['payload not object'] };
    }
    const table = getTargetTable(payload.error_type);
    if (!table) return { table: null, valid: false, errors: [`unknown error_type: ${payload.error_type}`] };
    const validation =
        table === TARGET_TABLES.TELEMETRY ? validateTelemetryPayload(payload) : validateBugReportPayload(payload);
    return { table, valid: validation.valid, errors: validation.errors };
}

// ──────────────────────────────────────────────────────────────────────
// Bug report workflow
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida transição de status em bug report.
 *
 * @param fromStatus
 * @param toStatus
 * @returns
 */
export function canTransitionStatus(
    fromStatus: string,
    toStatus: string,
): { allowed: boolean; reason: string } {
    if (!BUG_REPORT_STATUSES.includes(fromStatus)) {
        return { allowed: false, reason: `invalid from status: ${fromStatus}` };
    }
    if (!BUG_REPORT_STATUSES.includes(toStatus)) {
        return { allowed: false, reason: `invalid to status: ${toStatus}` };
    }
    if (fromStatus === toStatus) {
        return { allowed: false, reason: 'no_op' };
    }
    const allowed = (VALID_TRANSITIONS as Record<string, ReadonlyArray<string>>)[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
        return { allowed: false, reason: `transition not allowed: ${fromStatus} → ${toStatus}` };
    }
    return { allowed: true, reason: 'ok' };
}

/**
 * Retorna transições válidas a partir de um status.
 * @param fromStatus
 * @returns
 */
export function getValidTransitions(fromStatus: string): ReadonlyArray<string> {
    return (VALID_TRANSITIONS as Record<string, ReadonlyArray<string>>)[fromStatus] || [];
}

/**
 * Status terminal (não permite mais transições).
 * @param status
 * @returns
 */
export function isTerminalStatus(status: string): boolean {
    return getValidTransitions(status).length === 0;
}

// ──────────────────────────────────────────────────────────────────────
// Retention (§Solução - 30d telemetry vs indefinido bug_reports)
// ──────────────────────────────────────────────────────────────────────

export const RETENTION_DAYS = Object.freeze({
    [TARGET_TABLES.TELEMETRY]: 30,
    [TARGET_TABLES.BUG_REPORTS]: null, // indefinido — até resolved/wontfix
});

/**
 * Determina se registro deve ser deletado por retention.
 *
 * @param record
 * @param any>
 * @param tableName
 * @returns
 */
export function shouldRetainDelete(
    record: Record<string, any>,
    tableName: string,
    now: number = Date.now(),
): boolean {
    if (!record || typeof record !== 'object') return false;
    const days = (RETENTION_DAYS as Record<string, number | null>)[tableName];
    if (days == null) return false; // bug_reports: não deleta por retention
    const createdAtMs = Number(new Date(record.created_at).getTime());
    if (!Number.isFinite(createdAtMs)) return false;
    const ageDays = (now - createdAtMs) / (24 * 60 * 60 * 1000);
    return ageDays > days;
}
