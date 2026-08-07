// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Surya Edge Request Builder — pure logic (companion to RF4 of
 * SPEC_INGESTION_SURYA_OCR_INTEGRATION).
 *
 * Builds the request payload + headers for the `surya-ocr-proxy` Supabase
 * Edge Function and validates the response envelope. Pure: caller plugs
 * fetch + auth header; this module just shapes the cross-network contract.
 *
 * Anti-N (security/privacy):
 *   - File content NEVER sent — only the SHA-256 hash + storage URL.
 *   - Auth token referenced by NAME only (not echoed in builder output).
 *   - Timeout decided by file size (larger files get more budget but cap).
 *
 * Tests live in `tests/surya-edge-request-builder-pure.test.mjs`.
 */

export interface EdgeRequestInput {
    readonly fileHash: string; // SHA-256 hex
    readonly fileSizeBytes: number;
    readonly mimeType: string;
    readonly storageBucket: string;
    readonly storagePath: string;
    readonly modelHint?: 'small' | 'base' | 'large';
    readonly languageHint?: ReadonlyArray<string>;
    readonly idempotencyKey: string;
}

export interface EdgeRequestPayload {
    readonly fileHash: string;
    readonly fileSizeBytes: number;
    readonly mimeType: string;
    readonly storageBucket: string;
    readonly storagePath: string;
    readonly modelHint: 'small' | 'base' | 'large';
    readonly languageHint: ReadonlyArray<string>;
    readonly idempotencyKey: string;
    readonly timeoutMs: number;
    readonly clientVersion: string;
}

export interface EdgeRequestResult {
    readonly payload: EdgeRequestPayload | null;
    readonly errors: ReadonlyArray<string>;
}

export interface EdgeResponseEnvelope {
    readonly ok: boolean;
    readonly taskId?: string;
    readonly status?: 'queued' | 'processing' | 'done' | 'error';
    readonly resultUrl?: string;
    readonly error?: { code: string; message: string };
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/tiff',
    'image/webp',
]);
const ALLOWED_MODELS: ReadonlyArray<'small' | 'base' | 'large'> = Object.freeze(['small', 'base', 'large']);
const CLIENT_VERSION = 'surya-client/1.0';

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isFinitePos(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Decide timeout based on file size. Larger files get more budget,
 * capped at 5 minutes. Pure heuristic — calibrated for Surya OCR
 * throughput (~200KB/s on small models).
 */
export function decideTimeoutMs(fileSizeBytes: number): number {
    if (!isFinitePos(fileSizeBytes)) return 30_000;
    // Base 30s + 1s per 50KB, capped at 5min
    const dynamic = 30_000 + Math.floor(fileSizeBytes / 50_000) * 1000;
    return Math.min(300_000, dynamic);
}

/**
 * Build the request payload. Pure: returns frozen { payload, errors }.
 * `payload` null when validation fails.
 */
export function buildEdgeRequest(input: EdgeRequestInput | null | undefined): EdgeRequestResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') {
        return Object.freeze({ payload: null, errors: Object.freeze(['input_invalid']) });
    }
    if (!isNonEmptyString(input.fileHash) || !SHA256_HEX_RE.test(input.fileHash)) {
        errors.push('fileHash_invalid_sha256_hex');
    }
    if (!isFinitePos(input.fileSizeBytes)) {
        errors.push('fileSizeBytes_invalid');
    }
    if (!isNonEmptyString(input.mimeType) || !ALLOWED_MIME.has(input.mimeType)) {
        errors.push('mimeType_not_allowed');
    }
    if (!isNonEmptyString(input.storageBucket)) errors.push('storageBucket_missing');
    if (!isNonEmptyString(input.storagePath)) errors.push('storagePath_missing');
    if (!isNonEmptyString(input.idempotencyKey)) errors.push('idempotencyKey_missing');

    if (errors.length > 0) {
        return Object.freeze({ payload: null, errors: Object.freeze(errors) });
    }

    const modelHint: 'small' | 'base' | 'large' =
        input.modelHint && ALLOWED_MODELS.includes(input.modelHint) ? input.modelHint : 'base';
    const languageHint: ReadonlyArray<string> = Array.isArray(input.languageHint)
        ? Object.freeze(input.languageHint.filter(isNonEmptyString))
        : Object.freeze([]);

    const payload: EdgeRequestPayload = Object.freeze({
        fileHash: input.fileHash.toLowerCase(),
        fileSizeBytes: Math.trunc(input.fileSizeBytes),
        mimeType: input.mimeType,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        modelHint,
        languageHint,
        idempotencyKey: input.idempotencyKey,
        timeoutMs: decideTimeoutMs(input.fileSizeBytes),
        clientVersion: CLIENT_VERSION,
    });
    return Object.freeze({ payload, errors: Object.freeze([]) });
}

/**
 * Validate an EdgeResponseEnvelope received from the edge function.
 * Pure: returns frozen { valid, errors }.
 */
export function validateEdgeResponse(raw: unknown): ValidationResult {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['response_not_object']) });
    }
    const r = raw as Partial<EdgeResponseEnvelope>;
    if (typeof r.ok !== 'boolean') errors.push('ok_missing_or_invalid');
    if (r.ok === true) {
        if (!isNonEmptyString(r.taskId)) errors.push('taskId_missing');
        if (r.status !== undefined && !['queued', 'processing', 'done', 'error'].includes(r.status as string)) {
            errors.push('status_invalid');
        }
        if (r.status === 'done' && !isNonEmptyString(r.resultUrl)) {
            errors.push('resultUrl_missing_on_done');
        }
    } else {
        if (!r.error || typeof r.error !== 'object') {
            errors.push('error_missing_on_ok_false');
        } else {
            if (!isNonEmptyString(r.error.code)) errors.push('error_code_missing');
            if (!isNonEmptyString(r.error.message)) errors.push('error_message_missing');
        }
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export const SURYA_EDGE_CLIENT_VERSION = CLIENT_VERSION;
export const SURYA_ALLOWED_MIME = Object.freeze([...ALLOWED_MIME]);
