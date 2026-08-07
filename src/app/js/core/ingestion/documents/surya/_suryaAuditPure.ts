// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Surya audit log + feature-flag gate — pure logic (RF5 + RF6 of
 * SPEC_INGESTION_SURYA).
 *
 * Two responsibilities consolidated in a single file because both are tiny
 * and share the same "decision-point" shape (caller passes inputs, gets
 * frozen verdict):
 *
 *   - RF5 `shouldRunSurya(featureFlags)` — anti-regression gate. Returns
 *     `{ run: boolean, reason: string }`. Default is OFF; even if the flag
 *     is present, missing or non-true → no-run (defensive).
 *
 *   - RF6 `buildSuryaAuditEntry(input)` — validates the metadata that the
 *     ingestion pipeline wants to APPEND to `ingestion_surya_audit`. Pure
 *     shape validation; caller persists via Supabase/IDB.
 *
 * Anti-requirements (SPEC §2.3 won't):
 *   - N1: missing required field → entry rejected with explicit error,
 *     never silently coerced.
 *   - Default OFF: the feature flag MUST be present AND true.
 *
 * Tests live in `tests/surya-audit-pure.test.mjs`.
 */

export interface SuryaFeatureFlags {
    readonly INGESTION_SURYA_ENABLED?: unknown;
}

export interface SuryaGateDecision {
    readonly run: boolean;
    readonly reason: string;
}

export interface SuryaAuditInputRaw {
    readonly modelId?: unknown;
    readonly docHash?: unknown;
    readonly pages?: unknown;
    readonly durationMs?: unknown;
    readonly qualityScore?: unknown;
    readonly action?: unknown;
    readonly createdAt?: unknown;
}

export type SuryaAction = 'accept' | 'review' | 'reject';

export interface SuryaAuditEntry {
    readonly modelId: string;
    readonly docHash: string;
    readonly pages: number;
    readonly durationMs: number;
    readonly qualityScore: number;
    readonly action: SuryaAction;
    readonly createdAt: string;
}

export interface AuditBuildResult {
    readonly entry: SuryaAuditEntry | null;
    readonly errors: ReadonlyArray<string>;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isValidIsoTimestamp(v: unknown): v is string {
    if (typeof v !== 'string' || v.length === 0) return false;
    return Number.isFinite(Date.parse(v));
}

const ALLOWED_ACTIONS: ReadonlyArray<SuryaAction> = Object.freeze(['accept', 'review', 'reject']);

type FieldValidator = (input: SuryaAuditInputRaw) => string | null;

function validateModelId(input: SuryaAuditInputRaw): string | null {
    return isNonEmptyString(input.modelId) ? null : 'modelId_invalid';
}

function validateDocHash(input: SuryaAuditInputRaw): string | null {
    return isNonEmptyString(input.docHash) ? null : 'docHash_invalid';
}

function validatePages(input: SuryaAuditInputRaw): string | null {
    if (!isFiniteNumber(input.pages) || input.pages <= 0) return 'pages_invalid';
    return null;
}

function validateDurationMs(input: SuryaAuditInputRaw): string | null {
    if (!isFiniteNumber(input.durationMs) || input.durationMs < 0) return 'durationMs_invalid';
    return null;
}

function validateQualityScore(input: SuryaAuditInputRaw): string | null {
    if (!isFiniteNumber(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 1) {
        return 'qualityScore_out_of_range';
    }
    return null;
}

function validateAction(input: SuryaAuditInputRaw): string | null {
    if (typeof input.action !== 'string' || !ALLOWED_ACTIONS.includes(input.action as SuryaAction)) {
        return 'action_invalid';
    }
    return null;
}

function resolveCreatedAt(
    input: SuryaAuditInputRaw,
    nowIso: string | undefined,
): { createdAt: string; error: string | null } {
    if (input.createdAt !== undefined) {
        if (!isValidIsoTimestamp(input.createdAt)) {
            return { createdAt: '', error: 'createdAt_invalid' };
        }
        return { createdAt: input.createdAt as string, error: null };
    }
    if (isValidIsoTimestamp(nowIso)) {
        return { createdAt: nowIso as string, error: null };
    }
    return { createdAt: '', error: 'createdAt_missing' };
}

/**
 * RF5 anti-regression gate. Pure: caller passes the feature flag map (e.g.
 * from `core/session/featureFlags`); module returns a frozen decision.
 *
 * Default behaviour: OFF. The feature MUST be EXPLICITLY enabled.
 */
export function shouldRunSurya(featureFlags: SuryaFeatureFlags | null | undefined): SuryaGateDecision {
    if (!featureFlags || typeof featureFlags !== 'object') {
        return Object.freeze({ run: false, reason: 'feature_flags_missing' });
    }
    const v = (featureFlags as SuryaFeatureFlags).INGESTION_SURYA_ENABLED;
    if (v === true) {
        return Object.freeze({ run: true, reason: 'flag_enabled' });
    }
    if (v === false || v === undefined || v === null) {
        return Object.freeze({ run: false, reason: 'flag_disabled_or_missing' });
    }
    return Object.freeze({ run: false, reason: 'flag_not_strict_boolean_true' });
}

/**
 * RF6 audit-entry builder/validator. Pure: caller passes raw fields,
 * receives frozen `{entry, errors}` — entry is null when validation fails.
 *
 * Required fields: modelId, docHash, pages, durationMs, qualityScore, action.
 * createdAt defaults to caller's clock when missing (must be ISO when provided).
 */
export function buildSuryaAuditEntry(
    input: SuryaAuditInputRaw | null | undefined,
    nowIso?: string,
): AuditBuildResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            entry: null,
            errors: Object.freeze(['input_not_object']),
        });
    }

    const validators: FieldValidator[] = [
        validateModelId,
        validateDocHash,
        validatePages,
        validateDurationMs,
        validateQualityScore,
        validateAction,
    ];
    for (const validator of validators) {
        const error = validator(input);
        if (error) errors.push(error);
    }

    const { createdAt, error: createdAtError } = resolveCreatedAt(input, nowIso);
    if (createdAtError) errors.push(createdAtError);

    if (errors.length > 0) {
        return Object.freeze({ entry: null, errors: Object.freeze(errors) });
    }

    const entry: SuryaAuditEntry = {
        modelId: input.modelId as string,
        docHash: input.docHash as string,
        pages: Math.trunc(input.pages as number),
        durationMs: Math.max(0, Math.trunc(input.durationMs as number)),
        qualityScore: input.qualityScore as number,
        action: input.action as SuryaAction,
        createdAt,
    };
    return Object.freeze({ entry: Object.freeze(entry), errors: Object.freeze(errors) });
}

/**
 * Convenience — append-only contract. The caller passes the existing log
 * + the new entry; this function returns a NEW frozen array. Never mutates
 * the input log (anti-N1 storage hygiene).
 */
export function appendSuryaAudit(
    log: ReadonlyArray<SuryaAuditEntry> | null | undefined,
    entry: SuryaAuditEntry | null | undefined,
): ReadonlyArray<SuryaAuditEntry> {
    const base = Array.isArray(log) ? log : [];
    if (!entry || typeof entry !== 'object') return Object.freeze([...base]);
    return Object.freeze([...base, entry]);
}
