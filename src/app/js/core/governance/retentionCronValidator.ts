// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RETENTION CRON VALIDATOR — SPEC_TELEMETRY_RETENTION_CRON

   Pure helpers para validar e simular políticas de retention:
   - parseCronExpression (5-field validator)
   - nextCronFire estimator (simplificado)
   - evaluateRetentionImpact: simula deleção sobre dataset
   - validateRetentionPolicy (TTL ≥ -1; table name whitelist)
   - formatRetentionReport

   Execução real via pg_cron + Edge functions (infra, fora do core).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §2.2
// ──────────────────────────────────────────────────────────────────────

export const RETENTION_TABLES = Object.freeze([
    'audit_trail',
    'decision_log',
    'stakeholder_shares',
    'error_reports',
    'telemetry_errors',
    'bug_reports',
    'model_snapshots',
    'obligation_archive',
]);

export const DEFAULT_RETENTION_DAYS = Object.freeze({
    audit_trail: 1825, // 5 anos CETESB GAC + ISO 14001
    decision_log: -1, // indefinido (IP)
    stakeholder_shares: 30, // LGPD Art. 16
    error_reports: 90, // legado
    telemetry_errors: 30, // volume alto
    bug_reports: -1, // feedback consciente
    model_snapshots: -1, // IP
    obligation_archive: 1825, // compliance legal
});

export const INDEFINITE = -1;

// ──────────────────────────────────────────────────────────────────────
// Cron expression validation (5 fields: min hour dom month dow)
// ──────────────────────────────────────────────────────────────────────

const CRON_FIELD_RANGES = Object.freeze({
    0: { min: 0, max: 59 }, // minute
    1: { min: 0, max: 23 }, // hour
    2: { min: 1, max: 31 }, // day of month
    3: { min: 1, max: 12 }, // month
    4: { min: 0, max: 6 }, // day of week (0=Sunday)
});

/**
 * Valida cron expression de 5 fields.
 * Suporta: * | N | N-M | N,M | *\/N
 */
export function parseCronExpression(
    expr: string,
): { valid: boolean; reason?: string; fields?: string[] } {
    if (typeof expr !== 'string' || !expr.trim()) {
        return { valid: false, reason: 'empty' };
    }
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) {
        return { valid: false, reason: `expected 5 fields, got ${fields.length}` };
    }
    for (let i = 0; i < 5; i++) {
        const field = fields[i];
        if (field === undefined) return { valid: false, reason: `field ${i}: missing` };
        const r = _validateCronField(field, CRON_FIELD_RANGES[i as 0 | 1 | 2 | 3 | 4]);
        if (!r.valid) return { valid: false, reason: `field ${i}: ${r.reason}` };
    }
    return { valid: true, fields };
}

/**
 * Valida um único field do cron contra o range esperado.
 */
function _validateCronField(
    field: string,
    range: { min: number; max: number },
): { valid: boolean; reason?: string } {
    if (typeof field !== 'string') return { valid: false, reason: 'not string' };
    if (field === '*') return { valid: true };
    // */N step
    const stepMatch = field.match(/^\*\/(\d+)$/);
    if (stepMatch) {
        const step = Number(stepMatch[1]);
        if (step <= 0 || step > range.max) return { valid: false, reason: 'step out of range' };
        return { valid: true };
    }
    // list A,B,C
    if (field.includes(',')) {
        for (const part of field.split(',')) {
            const r = _validateCronField(part, range);
            if (!r.valid) return r;
        }
        return { valid: true };
    }
    // range A-B
    const rangeMatch = field.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
        const lo = Number(rangeMatch[1]);
        const hi = Number(rangeMatch[2]);
        if (lo < range.min || hi > range.max || lo > hi) {
            return { valid: false, reason: 'range invalid' };
        }
        return { valid: true };
    }
    // single number
    const n = Number(field);
    if (!Number.isInteger(n) || n < range.min || n > range.max) {
        return { valid: false, reason: `value ${field} out of ${range.min}..${range.max}` };
    }
    return { valid: true };
}

/**
 * Próximo fire aproximado (só para cron diário fixo "M H * * *").
 */
export function nextDailyCronFire(expr: string, fromMs?: Date | number): Date | null {
    const parsed = parseCronExpression(expr);
    if (!parsed.valid || !parsed.fields) return null;
    const [min, hour, dom, month, dow] = parsed.fields;
    // Apenas diário: dom=*, month=*, dow=*
    if (dom !== '*' || month !== '*' || dow !== '*') return null;
    const m = Number(min);
    const h = Number(hour);
    if (!Number.isInteger(m) || !Number.isInteger(h)) return null;
    const now = fromMs ? new Date(fromMs) : new Date();
    const next = new Date(now);
    next.setUTCHours(h, m, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

// ──────────────────────────────────────────────────────────────────────
// Retention policy validation
// ──────────────────────────────────────────────────────────────────────

export function isRetentionEligibleTable(tableName: string): boolean {
    return RETENTION_TABLES.includes(tableName);
}

export function validateRetentionPolicy(policy: {
    table: string;
    retentionDays: number;
}): { valid: boolean; errors: string[] } {
    const errors = [];
    if (!policy || typeof policy !== 'object') return { valid: false, errors: ['not object'] };
    if (!isRetentionEligibleTable(policy.table)) {
        errors.push(`table must be one of: ${RETENTION_TABLES.join(', ')}`);
    }
    if (!Number.isInteger(policy.retentionDays) || (policy.retentionDays !== INDEFINITE && policy.retentionDays < 1)) {
        errors.push('retentionDays must be integer ≥1 or -1 (indefinite)');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Retention impact simulation §3.1
// ──────────────────────────────────────────────────────────────────────

/**
 * Simula cleanup: dado array de rows com createdAt, retorna partition
 * { toDelete, toKeep } baseado em retentionDays.
 */
export function evaluateRetentionImpact(
    rows: Array<{ createdAt: string | number | Date }>,
    retentionDays: number,
    nowMs?: Date | number,
): { toDelete: any[]; toKeep: any[]; cutoffDate: string | null } {
    if (retentionDays === INDEFINITE) {
        return {
            toDelete: [],
            toKeep: Array.isArray(rows) ? [...rows] : [],
            cutoffDate: null,
        };
    }
    if (!Array.isArray(rows) || !Number.isInteger(retentionDays) || retentionDays < 1) {
        return { toDelete: [], toKeep: [], cutoffDate: null };
    }
    const now = Number(nowMs) || Date.now();
    const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs).toISOString();
    const toDelete = [];
    const toKeep = [];
    for (const row of rows) {
        if (!row) continue;
        const createdMs = new Date(row.createdAt).getTime();
        if (Number.isFinite(createdMs) && createdMs < cutoffMs) {
            toDelete.push(row);
        } else {
            toKeep.push(row);
        }
    }
    return { toDelete, toKeep, cutoffDate };
}

// ──────────────────────────────────────────────────────────────────────
// Audit log entry builder
// ──────────────────────────────────────────────────────────────────────

export function buildAuditLogEntry(input: {
    table: string;
    deletedCount: number;
    cutoffDate: string | null;
    executedAt?: string;
}): Object | null {
    if (!input || typeof input !== 'object') return null;
    if (!isRetentionEligibleTable(input.table)) return null;
    return {
        table_name: input.table,
        deleted_count: Number(input.deletedCount) || 0,
        cutoff_date: input.cutoffDate || null,
        executed_at: input.executedAt || new Date().toISOString(),
    };
}

export function summarizeRetentionRun(
    entries: Array<{ table: string; deletedCount: number }>,
): { totalDeleted: number; byTable: Record<string, number> } {
    const byTable: Record<string, number> = {};
    let totalDeleted = 0;
    if (!Array.isArray(entries)) return { totalDeleted, byTable };
    for (const e of entries) {
        if (!e || !e.table) continue;
        const n = Number(e.deletedCount) || 0;
        byTable[e.table] = (byTable[e.table] || 0) + n;
        totalDeleted += n;
    }
    return { totalDeleted, byTable };
}
