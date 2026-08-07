// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Worker Task Protocol — pure logic for WS-4 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Canonical request/response envelope for the unified worker offload
 * pattern. Pure: builders + validators only — `workerTaskRunner.ts`
 * plugs the actual Worker spawn / postMessage.
 *
 * Wire shape (cross-thread JSON):
 *   Request:  { taskId, kind, payload, transferables, timeoutMs }
 *   Response: { taskId, ok: true,  result } OR
 *             { taskId, ok: false, error: { code, message } }
 *   Progress: { taskId, progress: 0..1, message? }
 *
 * Anti-N:
 *   - taskId opaque string; protocol does NOT trust raw client-supplied
 *     timeouts > MAX_TIMEOUT (3min) — caps to prevent runaway workers.
 *   - timeoutMs invalid → default 30s
 *   - kind enumerated; unknown → rejected at validation
 *
 * Tests live in `tests/worker-task-protocol-pure.test.mjs`.
 */

export type WorkerTaskKind =
    | 'parse_document'
    | 'mesh_build'
    | 'analytics_search'
    | 'interpolation'
    | 'simulation'
    | 'recognition_vectorize';

export interface WorkerTaskRequest {
    readonly taskId: string;
    readonly kind: WorkerTaskKind;
    readonly payload: unknown;
    readonly timeoutMs: number;
    readonly transferableHints: ReadonlyArray<string>;
}

export interface WorkerTaskResponseOk {
    readonly taskId: string;
    readonly ok: true;
    readonly result: unknown;
}

export interface WorkerTaskResponseError {
    readonly taskId: string;
    readonly ok: false;
    readonly error: Readonly<{ code: string; message: string }>;
}

export type WorkerTaskResponse = WorkerTaskResponseOk | WorkerTaskResponseError;

export interface WorkerTaskProgress {
    readonly taskId: string;
    readonly progress: number; // 0..1
    readonly message?: string;
}

const ALLOWED_KINDS: ReadonlyArray<WorkerTaskKind> = Object.freeze([
    'parse_document',
    'mesh_build',
    'analytics_search',
    'interpolation',
    'simulation',
    'recognition_vectorize',
]);

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 180_000; // 3 min

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isAllowedKind(v: unknown): v is WorkerTaskKind {
    return typeof v === 'string' && (ALLOWED_KINDS as ReadonlyArray<string>).includes(v);
}

/**
 * Build a frozen worker task request. Pure: caller-supplied timeoutMs is
 * clamped to [1, MAX_TIMEOUT_MS]; invalid → default.
 */
export function buildTaskRequest(input: {
    readonly taskId: string;
    readonly kind: WorkerTaskKind;
    readonly payload?: unknown;
    readonly timeoutMs?: number;
    readonly transferableHints?: ReadonlyArray<string>;
}): WorkerTaskRequest | null {
    if (!input || typeof input !== 'object') return null;
    if (!isNonEmptyString(input.taskId)) return null;
    if (!isAllowedKind(input.kind)) return null;
    let ms = DEFAULT_TIMEOUT_MS;
    if (typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0) {
        ms = Math.min(MAX_TIMEOUT_MS, Math.floor(input.timeoutMs));
    }
    const hints: ReadonlyArray<string> = Array.isArray(input.transferableHints)
        ? Object.freeze(input.transferableHints.filter((h): h is string => typeof h === 'string'))
        : Object.freeze([]);
    return Object.freeze({
        taskId: input.taskId,
        kind: input.kind,
        payload: input.payload === undefined ? null : input.payload,
        timeoutMs: ms,
        transferableHints: hints,
    });
}

/**
 * Validate a wire-received request (worker-side). Returns frozen
 * { valid, errors }. Pure.
 */
export interface RequestValidation {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

export function validateTaskRequest(raw: unknown): RequestValidation {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['not_object']) });
    }
    const r = raw as Partial<WorkerTaskRequest>;
    if (!isNonEmptyString(r.taskId)) errors.push('taskId_missing');
    if (!isAllowedKind(r.kind)) errors.push('kind_invalid');
    if (typeof r.timeoutMs !== 'number' || !Number.isFinite(r.timeoutMs) || r.timeoutMs <= 0) {
        errors.push('timeoutMs_invalid');
    } else if (r.timeoutMs > MAX_TIMEOUT_MS) {
        errors.push('timeoutMs_exceeds_max');
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Build success response. Pure.
 */
export function buildResponseOk(taskId: string, result: unknown): WorkerTaskResponseOk | null {
    if (!isNonEmptyString(taskId)) return null;
    return Object.freeze({ taskId, ok: true as const, result: result === undefined ? null : result });
}

/**
 * Build error response. Pure.
 */
export function buildResponseError(
    taskId: string,
    code: string,
    message: string,
): WorkerTaskResponseError | null {
    if (!isNonEmptyString(taskId)) return null;
    return Object.freeze({
        taskId,
        ok: false as const,
        error: Object.freeze({
            code: isNonEmptyString(code) ? code : 'unknown',
            message: isNonEmptyString(message) ? message : '',
        }),
    });
}

/**
 * Build progress event. Pure. Clamps progress to [0, 1].
 */
export function buildProgress(taskId: string, progress: number, message?: string): WorkerTaskProgress | null {
    if (!isNonEmptyString(taskId)) return null;
    const p = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const out: WorkerTaskProgress = isNonEmptyString(message)
        ? { taskId, progress: p, message }
        : { taskId, progress: p };
    return Object.freeze(out);
}

/**
 * Decide whether a payload size warrants offloading to a Worker per
 * WS-4 thresholds. Pure decision; caller does the actual spawn.
 *
 * Thresholds (from spec §WS-4):
 *   parse_document       payloadBytes > 1_048_576 (1 MB)
 *   mesh_build           elementCount > 500
 *   analytics_search     itemCount    > 1_000
 *   interpolation        estimatedMs  > 50
 *   simulation           estimatedMs  > 50
 *   recognition_vectorize always (when worker available)
 */
export function shouldOffload(
    kind: WorkerTaskKind,
    metrics: Readonly<{ payloadBytes?: number; elementCount?: number; itemCount?: number; estimatedMs?: number }>,
    workerAvailable: boolean,
): boolean {
    if (!workerAvailable) return false;
    if (!metrics || typeof metrics !== 'object') return false;
    const bytes = typeof metrics.payloadBytes === 'number' ? metrics.payloadBytes : 0;
    const elements = typeof metrics.elementCount === 'number' ? metrics.elementCount : 0;
    const items = typeof metrics.itemCount === 'number' ? metrics.itemCount : 0;
    const ms = typeof metrics.estimatedMs === 'number' ? metrics.estimatedMs : 0;
    switch (kind) {
        case 'parse_document':
            return bytes > 1_048_576;
        case 'mesh_build':
            return elements > 500;
        case 'analytics_search':
            return items > 1_000;
        case 'interpolation':
        case 'simulation':
            return ms > 50;
        case 'recognition_vectorize':
            return true;
        default:
            return false;
    }
}

export const ALLOWED_TASK_KINDS = ALLOWED_KINDS;
export const PROTOCOL_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const PROTOCOL_MAX_TIMEOUT_MS = MAX_TIMEOUT_MS;
