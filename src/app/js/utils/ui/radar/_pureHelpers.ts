// NEEDS-MANUAL: cross-file — consumer sliceCreatorWizard.ts importa WizardFormData não-exportado (TS2459). Preservar export.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR PHASE 5 — PURE HELPERS shared by the 3 UI modules.

   No DOM, no network, no Supabase — safe to import in Node tests
   without any global stubs. The UI modules re-export these so they
   appear on the public surface (validateWizardData, formatTokens, etc.)
   while keeping a single source of truth.
   ================================================================ */

const TOTAL_STEPS = 4;

interface WizardFormData {
    profileId?: string | null;
    includePaths?: string;
    excludePaths?: string;
    temporalFrom?: string;
    temporalTo?: string;
    temporalAggregation?: string;
    bboxLonMin?: string;
    bboxLatMin?: string;
    bboxLonMax?: string;
    bboxLatMax?: string;
    billingRequired?: boolean;
    billingContractedTotal?: string;
    billingRatePerSecond?: string;
    billingMaxPerRequest?: string;
    billingCurrency?: string;
    sliceName?: string;
}

/**
 * Validate the wizard formData for a given step.
 *
 * @param step  1..4
 * @param formData
 */
export function validateWizardData(
    step: number,
    formData: WizardFormData,
): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
        errors.push('invalid_step');
        return { ok: false, errors };
    }
    if (!formData || typeof formData !== 'object') {
        errors.push('invalid_form_data');
        return { ok: false, errors };
    }

    if (step === 1) {
        if (!formData.profileId) errors.push('profile_required');
    } else if (step === 2) {
        const inc = (formData.includePaths || '').trim();
        if (!inc) errors.push('include_paths_required');
        const aggr = formData.temporalAggregation || '';
        if (aggr && !['daily_mean', 'weekly_mean', 'monthly_mean'].includes(aggr)) {
            errors.push('invalid_aggregation');
        }
        const bboxFields = [
            formData.bboxLonMin,
            formData.bboxLatMin,
            formData.bboxLonMax,
            formData.bboxLatMax,
        ];
        const presence = bboxFields.map((v) => v != null && String(v).trim() !== '');
        const anyBbox = presence.some(Boolean);
        const allBbox = presence.every(Boolean);
        if (anyBbox) {
            if (!allBbox) {
                errors.push('bbox_incomplete');
            } else {
                const lonMin = Number(formData.bboxLonMin);
                const latMin = Number(formData.bboxLatMin);
                const lonMax = Number(formData.bboxLonMax);
                const latMax = Number(formData.bboxLatMax);
                if ([lonMin, latMin, lonMax, latMax].some((n) => !Number.isFinite(n))) {
                    errors.push('bbox_incomplete');
                } else if (lonMin >= lonMax) errors.push('bbox_lon_order');
                else if (latMin >= latMax) errors.push('bbox_lat_order');
            }
        }
        if (formData.temporalFrom && formData.temporalTo) {
            if (formData.temporalTo < formData.temporalFrom) errors.push('temporal_range_invalid');
        }
    } else if (step === 3) {
        if (formData.billingRequired) {
            const total = Number(formData.billingContractedTotal);
            const rate = Number(formData.billingRatePerSecond);
            const max = Number(formData.billingMaxPerRequest);
            if (!Number.isFinite(total) || total <= 0) errors.push('contracted_total_invalid');
            if (!Number.isFinite(rate) || rate <= 0) errors.push('rate_per_second_invalid');
            if (!Number.isFinite(max) || max <= 0) errors.push('max_per_request_invalid');
            const currency = formData.billingCurrency || '';
            if (!['BRL', 'ECBT', '$ECBT'].includes(currency)) errors.push('currency_invalid');
        }
    } else if (step === 4) {
        if (!formData.sliceName || !formData.sliceName.trim()) errors.push('slice_name_required');
    }

    return { ok: errors.length === 0, errors };
}

/**
 * Format a token amount as locale string ("1,234,567"). Non-finite -> "0".
 *
 * @param n
 */
export function formatTokens(n: unknown): string {
    const num = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(num)) return '0';
    try {
        return num.toLocaleString('en-US');
    } catch (_err) {
        return String(Math.trunc(num));
    }
}

interface TokenTx {
    id: string;
    type: string;
    amount: number;
    endpoint: string | null;
    balance_after: number | null;
    created_at: string;
}

/**
 * Serialize a list of transactions to CSV (RFC 4180-style).
 *
 * @param txs
 */
export function transactionsToCSV(txs: TokenTx[]): string {
    const header = 'id,type,amount,endpoint,balance_after,created_at';
    if (!Array.isArray(txs) || txs.length === 0) return header + '\n';
    const cell = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    };
    const rows = txs.map((tx) =>
        [tx.id, tx.type, tx.amount, tx.endpoint, tx.balance_after, tx.created_at].map(cell).join(','),
    );
    return [header, ...rows].join('\n') + '\n';
}

/**
 * Format an ISO timestamp as "YYYY-MM-DD HH:MM:SS" (UTC). Returns the input
 * unchanged when the string cannot be parsed; empty string for nullish.
 *
 * @param ts
 */
export function formatEventTimestamp(ts: unknown): string {
    if (typeof ts !== 'string' || !ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear() +
        '-' +
        pad(d.getUTCMonth() + 1) +
        '-' +
        pad(d.getUTCDate()) +
        ' ' +
        pad(d.getUTCHours()) +
        ':' +
        pad(d.getUTCMinutes()) +
        ':' +
        pad(d.getUTCSeconds())
    );
}

/**
 * Generate a compact (<=80 chars) summary for an audit log request_metadata.
 *
 * @param metadata
 */
export function summarizeRequestMeta(metadata: unknown): string {
    if (!metadata || typeof metadata !== 'object') return '';
    const obj = metadata as Record<string, unknown>;
    const parts = [];
    if ('method' in obj && obj.method) parts.push(String(obj.method));
    if ('ip' in obj && obj.ip) parts.push('ip=' + String(obj.ip));
    if ('user_agent' in obj && obj.user_agent) {
        const ua = String(obj.user_agent);
        parts.push('ua=' + (ua.length > 20 ? ua.slice(0, 20) + '…' : ua));
    }
    if ('tokens_used' in obj && obj.tokens_used !== undefined && obj.tokens_used !== null) {
        parts.push('tokens=' + String(obj.tokens_used));
    }
    if ('status' in obj && obj.status !== undefined) parts.push('status=' + String(obj.status));
    let summary = parts.join(' · ');
    if (!summary) {
        const keys = Object.keys(obj);
        summary = keys.length ? keys.slice(0, 4).join(',') : '';
    }
    return summary.length > 80 ? summary.slice(0, 77) + '...' : summary;
}

interface AuditEventLike {
    id?: string;
    event?: string;
    endpoint?: string;
    grantee_email?: string;
    profile_slug?: string;
    created_at?: string;
}

interface AuditFilters {
    grantee?: string;
    profile?: string;
    endpoint?: string;
    event?: string;
    dateFrom?: string;
    dateTo?: string;
}

/**
 * Filter an audit event array by all active filters.
 *
 * @param events
 * @param filters
 */
export function filterEvents(
    events: AuditEventLike[],
    filters: AuditFilters,
): AuditEventLike[] {
    if (!Array.isArray(events)) return [];
    const f = filters || {};
    const grantee = (f.grantee || '').toLowerCase().trim();
    const profile = (f.profile || '').toLowerCase().trim();
    const endpoint = (f.endpoint || '').toLowerCase().trim();
    const event = (f.event || '').toLowerCase().trim();
    const dateFrom = (f.dateFrom || '').trim();
    const dateTo = (f.dateTo || '').trim();

    return events.filter((e) => {
        if (!e || typeof e !== 'object') return false;
        if (grantee && !(e.grantee_email || '').toLowerCase().includes(grantee)) return false;
        if (profile && !(e.profile_slug || '').toLowerCase().includes(profile)) return false;
        if (endpoint && !(e.endpoint || '').toLowerCase().includes(endpoint)) return false;
        if (event && !(e.event || '').toLowerCase().includes(event)) return false;
        const ts = (e.created_at || '').slice(0, 10);
        if (dateFrom && ts && ts < dateFrom) return false;
        if (dateTo && ts && ts > dateTo) return false;
        return true;
    });
}
