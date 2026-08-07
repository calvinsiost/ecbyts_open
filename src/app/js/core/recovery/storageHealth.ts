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

/**
 * storageHealth.js - pure storage corruption and quota contracts.
 *
 * Runtime code owns localStorage, IndexedDB, navigator.storage.estimate(), and
 * DOM events. This module only classifies those facts so boot recovery and
 * quota UX can be tested without browser globals.
 */

export const STORAGE_HEALTH_STATES = Object.freeze({
    OK: 'ok',
    MISSING: 'missing',
    CORRUPT: 'corrupt',
    WARNING: 'warning',
    CRITICAL: 'critical',
    FULL: 'full',
    UNAVAILABLE: 'unavailable',
});

const DEFAULT_WARNING_RATIO = 0.8;
const DEFAULT_CRITICAL_RATIO = 0.9;

function assertStorageKey(key: any): void {
    if (typeof key !== 'string' || key.trim() === '') {
        throw new Error('storage key must be a non-empty string');
    }
}

function finiteNonNegative(value: any, name: any): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative finite number`);
    }
    return value;
}

function freezeParseResult(result: any): any {
    const frozen = { ...result };
    if (Array.isArray(frozen.recoveryActions)) {
        frozen.recoveryActions = Object.freeze(frozen.recoveryActions.slice());
    }
    return Object.freeze(frozen);
}

function normalizeParsedEntry(entry: any): any {
    if (entry?.ok === false && entry?.status === STORAGE_HEALTH_STATES.CORRUPT) {
        return freezeParseResult(entry);
    }
    return parseStorageJson(entry?.key, entry?.raw, {
        required: entry?.required,
        fallback: entry?.fallback,
    });
}

/**
 * Safely parse a JSON localStorage entry and return a recovery contract.
 *
 * The raw value is intentionally not returned; the integration layer can read
 * it again if the user explicitly chooses "export raw".
 */
export function parseStorageJson(key: any, raw: any, opts: any = {}): any {
    assertStorageKey(key);
    const required = opts.required === true;

    if (raw == null || raw === '') {
        return freezeParseResult({
            key,
            ok: !required,
            status: STORAGE_HEALTH_STATES.MISSING,
            value: opts.fallback ?? null,
            rawLength: raw == null ? 0 : String(raw).length,
            needsUserDecision: false,
            reason: required ? 'missing_required_entry' : 'missing_optional_entry',
        });
    }

    const text = String(raw);
    try {
        return freezeParseResult({
            key,
            ok: true,
            status: STORAGE_HEALTH_STATES.OK,
            value: JSON.parse(text),
            rawLength: text.length,
            needsUserDecision: false,
            reason: 'valid_json',
        });
    } catch (error) {
        const err = error as any;
        return freezeParseResult({
            key,
            ok: false,
            status: STORAGE_HEALTH_STATES.CORRUPT,
            value: null,
            rawLength: text.length,
            needsUserDecision: true,
            reason: 'json_parse_failed',
            errorName: err?.name || 'SyntaxError',
            errorMessage: err?.message || 'Invalid JSON',
            recoveryActions: ['reset_workspace', 'export_raw', 'cancel'],
        });
    }
}

/**
 * Summarize a batch of JSON storage entries for boot-time recovery.
 */
export function buildStorageCorruptionReport(entries: any = []): any {
    if (!Array.isArray(entries)) {
        throw new Error('entries must be an array');
    }
    const parsed = entries.map(normalizeParsedEntry);
    const corruptEntries = parsed.filter((entry) => entry.status === STORAGE_HEALTH_STATES.CORRUPT);

    return Object.freeze({
        ok: corruptEntries.length === 0,
        status: corruptEntries.length > 0 ? STORAGE_HEALTH_STATES.CORRUPT : STORAGE_HEALTH_STATES.OK,
        checkedCount: parsed.length,
        corruptCount: corruptEntries.length,
        corruptKeys: Object.freeze(corruptEntries.map((entry) => entry.key)),
        rawBytes: corruptEntries.reduce((sum, entry) => sum + entry.rawLength, 0),
        needsUserDecision: corruptEntries.length > 0,
        entries: Object.freeze(parsed),
    });
}

/**
 * Classify navigator.storage.estimate() facts for quota warning UX.
 */
export function assessStoragePressure(input: any = {}): any {
    if (input == null || input.available === false || input.usage == null || input.quota == null) {
        return Object.freeze({
            status: STORAGE_HEALTH_STATES.UNAVAILABLE,
            usage: null,
            quota: null,
            usageRatio: null,
            usagePercent: null,
            shouldWarn: false,
            shouldBlockAutosave: false,
            toastKind: null,
            message: 'Storage estimate unavailable',
        });
    }

    const usage = finiteNonNegative(input.usage, 'usage');
    const quota = finiteNonNegative(input.quota, 'quota');
    if (quota <= 0) {
        return Object.freeze({
            status: STORAGE_HEALTH_STATES.UNAVAILABLE,
            usage,
            quota,
            usageRatio: null,
            usagePercent: null,
            shouldWarn: false,
            shouldBlockAutosave: false,
            toastKind: null,
            message: 'Storage quota unavailable',
        });
    }

    const warningRatio =
        input.warningRatio == null ? DEFAULT_WARNING_RATIO : finiteNonNegative(input.warningRatio, 'warningRatio');
    const criticalRatio =
        input.criticalRatio == null ? DEFAULT_CRITICAL_RATIO : finiteNonNegative(input.criticalRatio, 'criticalRatio');
    if (warningRatio <= 0 || warningRatio >= criticalRatio || criticalRatio > 1) {
        throw new Error('quota thresholds must satisfy 0 < warningRatio < criticalRatio <= 1');
    }

    const usageRatio = usage / quota;
    const usagePercent = Math.round(usageRatio * 1000) / 10;
    let status: any = STORAGE_HEALTH_STATES.OK;
    let toastKind: any = null;
    let message = 'Armazenamento local saudavel';
    let shouldBlockAutosave = false;

    if (usageRatio >= 1) {
        status = STORAGE_HEALTH_STATES.FULL;
        toastKind = 'error';
        shouldBlockAutosave = true;
        message = 'Armazenamento local cheio - limpe modelos antigos';
    } else if (usageRatio >= criticalRatio) {
        status = STORAGE_HEALTH_STATES.CRITICAL;
        toastKind = 'error';
        message = `Armazenamento local em ${usagePercent}% - exporte ou limpe modelos antigos`;
    } else if (usageRatio >= warningRatio) {
        status = STORAGE_HEALTH_STATES.WARNING;
        toastKind = 'warning';
        message = `Armazenamento local em ${usagePercent}% - considere exportar o modelo`;
    }

    return Object.freeze({
        status,
        usage,
        quota,
        usageRatio,
        usagePercent,
        shouldWarn: status !== STORAGE_HEALTH_STATES.OK,
        shouldBlockAutosave,
        toastKind,
        message,
    });
}

/**
 * Combine corruption and quota facts into the boot/storage health headline.
 */
export function summarizeStorageHealth(input: any = {}): any {
    const corruption = input.corruptionReport || buildStorageCorruptionReport(input.entries || []);
    const pressure = input.pressure || assessStoragePressure(input.estimate || { available: false });
    const status =
        corruption.needsUserDecision === true
            ? STORAGE_HEALTH_STATES.CORRUPT
            : pressure.status === STORAGE_HEALTH_STATES.FULL
              ? STORAGE_HEALTH_STATES.FULL
              : pressure.status === STORAGE_HEALTH_STATES.CRITICAL
                ? STORAGE_HEALTH_STATES.CRITICAL
                : pressure.status === STORAGE_HEALTH_STATES.WARNING
                  ? STORAGE_HEALTH_STATES.WARNING
                  : STORAGE_HEALTH_STATES.OK;

    return Object.freeze({
        status,
        needsUserDecision: corruption.needsUserDecision === true,
        shouldWarn: pressure.shouldWarn || corruption.needsUserDecision === true,
        shouldBlockAutosave: pressure.shouldBlockAutosave,
        corruptKeys: corruption.corruptKeys,
        usagePercent: pressure.usagePercent,
        corruption,
        pressure,
    });
}

export default {
    STORAGE_HEALTH_STATES,
    parseStorageJson,
    buildStorageCorruptionReport,
    assessStoragePressure,
    summarizeStorageHealth,
};
