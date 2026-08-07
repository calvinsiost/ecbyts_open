// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EIS Batch Correction Validator - pure module, no browser deps
 *
 * Fail-closed validation for batch corrections applied from the EIS
 * Correction Workbench. Keeps enum domains as the single source of
 * truth shared between the handler and Node cheap tests.
 *
 * Extracted from utils/handlers/eis.js in 2026-04-10 to enable cheap
 * testing (browser-free) and eliminate duplication.
 */

/** @type {Readonly<Record<string, ReadonlyArray<string>>>} */
export const CORRECTION_FIELD_ENUMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    sample_type: Object.freeze(['primary', 'duplicate', 'triplicate', 'split', 'blank', 'spike', 'control']),
    event_type: Object.freeze(['routine', 'incident', 'catastrophic', 'maintenance']),
});

/** @type {ReadonlySet<string>} */
export const CORRECTION_FIELD_NUMERIC = Object.freeze(new Set(['event_severity', 'uncertainty']));

/** @type {ReadonlySet<string>} */
export const CORRECTION_FIELD_FREE_TEXT = Object.freeze(new Set(['qa_pair_id', 'exception_justification']));

interface ValidationOk {
    ok: true;
    value: string | number;
}

interface ValidationFail {
    ok: false;
    reason: string;
    allowed?: string[];
}

/**
 * @typedef {{ ok: true, value: string | number }} ValidationOk
 */

/**
 * @typedef {{ ok: false, reason: string, allowed?: string[] }} ValidationFail
 */

/**
 * Validate a raw user-provided value for a given field.
 *
 * @param {string} field
 * @param {unknown} rawValue
 * @returns {ValidationOk | ValidationFail}
 */
export function validateCorrectionValue(field: string, rawValue: unknown): ValidationOk | ValidationFail {
    if (CORRECTION_FIELD_NUMERIC.has(field)) {
        const num = Number(rawValue);
        if (!Number.isFinite(num)) return { ok: false, reason: 'not_numeric' };
        if (field === 'event_severity' && (num < 0 || num > 5)) {
            return { ok: false, reason: 'severity_out_of_range' };
        }
        if (field === 'uncertainty' && num < 0) {
            return { ok: false, reason: 'uncertainty_negative' };
        }
        return { ok: true, value: num };
    }
    if (CORRECTION_FIELD_ENUMS[field]) {
        const allowed = CORRECTION_FIELD_ENUMS[field]!;
        const normalized = String(rawValue || '')
            .trim()
            .toLowerCase();
        if (!allowed.includes(normalized)) {
            return { ok: false, reason: 'not_in_enum', allowed: Array.from(allowed) };
        }
        return { ok: true, value: normalized };
    }
    if (CORRECTION_FIELD_FREE_TEXT.has(field)) {
        const str = String(rawValue || '').trim();
        if (!str) return { ok: false, reason: 'empty' };
        if (str.length > 500) return { ok: false, reason: 'too_long' };
        return { ok: true, value: str };
    }
    return { ok: false, reason: 'unknown_field' };
}
