// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Data Parser Worker Protocol
 * Defines the message protocol and task types for the data parsing Web Worker.
 * Pure-logic module: zero DOM, zero browser APIs.
 * Both the main thread and the worker import this file to share the protocol schema.
 *
 * @module dataParserProtocol
 */

// ─── Task Types ──────────────────────────────────────────────────────────────

/**
 * Enumeration of supported parser task types.
 * Representa os tipos de tarefa suportados pelo Web Worker de parsing.
 */
export const PARSER_TASK = Object.freeze({
    /** Parse an ECBT A/B/C key string into a structured object */
    PARSE_ECBT_KEY: 'parse_ecbt_key',
    /** Parse CSV text into an array of row objects */
    PARSE_CSV: 'parse_csv',
    /** Parse a JSON string into a JavaScript object */
    PARSE_JSON: 'parse_json',
    /** Validate an ECBT model data structure */
    VALIDATE_MODEL: 'validate_model',
    /** JSON.stringify a model with a compression hint for transfer */
    COMPRESS_MODEL: 'compress_model',
});

// ─── Result Status ───────────────────────────────────────────────────────────

/**
 * Enumeration of result status codes returned by the worker.
 * Representa os códigos de status possíveis em respostas do worker.
 */
export const PARSER_RESULT_STATUS = Object.freeze({
    /** Task completed successfully */
    OK: 'ok',
    /** Task failed with an unrecoverable error */
    ERROR: 'error',
    /** Task completed partially — some rows failed (CSV multi-row parsing) */
    PARTIAL: 'partial',
});

// ─── Priority Levels ─────────────────────────────────────────────────────────

/** Valid priority levels for parse requests */
const VALID_PRIORITIES: ReadonlyArray<string> = Object.freeze(['high', 'normal', 'low']);

// ─── Auto-incrementing request ID counter ───────────────────────────────────

let _requestCounter = 0;

/**
 * Generate a unique request ID string.
 * Gera um identificador único para cada requisição ao worker.
 */
function _nextRequestId(): string {
    _requestCounter = (_requestCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `req_${Date.now()}_${_requestCounter}`;
}

// ─── Request Factory ─────────────────────────────────────────────────────────

/**
 * Create a frozen parse request message to send to the worker.
 * Cria uma mensagem de requisição imutável para o worker de parsing.
 *
 * @param options
 * @throws {TypeError} If taskType is not a recognized PARSER_TASK value
 */
export function createParseRequest({
    taskType,
    payload,
    requestId,
    priority = 'normal',
}: {
    taskType: string;
    payload: any;
    requestId?: string;
    priority?: 'high' | 'normal' | 'low';
}): Readonly<{ taskType: string; payload: any; requestId: string; priority: string }> {
    const validTasks = Object.values(PARSER_TASK) as string[];
    if (!validTasks.includes(taskType)) {
        throw new TypeError(
            `createParseRequest: unknown taskType "${taskType}". ` + `Valid values: ${validTasks.join(', ')}`,
        );
    }

    if (!VALID_PRIORITIES.includes(priority)) {
        throw new TypeError(
            `createParseRequest: invalid priority "${priority}". ` + `Valid values: ${VALID_PRIORITIES.join(', ')}`,
        );
    }

    return Object.freeze({
        taskType,
        payload,
        requestId: typeof requestId === 'string' && requestId.length > 0 ? requestId : _nextRequestId(),
        priority,
    });
}

// ─── Result Factory ──────────────────────────────────────────────────────────

/**
 * Create a frozen parse result message to send back from the worker.
 * Cria uma mensagem de resultado imutável retornada pelo worker.
 *
 * @param options
 * @throws {TypeError} If status is not a recognized PARSER_RESULT_STATUS value
 */
export function createParseResult({
    requestId,
    taskType,
    status,
    data,
    error = null,
    rowsProcessed = null,
    rowsFailed = null,
}: {
    requestId: string;
    taskType: string;
    status: string;
    data: any;
    error?: string | null;
    rowsProcessed?: number | null;
    rowsFailed?: number | null;
}): Readonly<object> {
    const validStatuses = Object.values(PARSER_RESULT_STATUS) as string[];
    if (!validStatuses.includes(status)) {
        throw new TypeError(
            `createParseResult: unknown status "${status}". ` + `Valid values: ${validStatuses.join(', ')}`,
        );
    }

    return Object.freeze({
        requestId,
        taskType,
        status,
        data: data ?? null,
        error,
        rowsProcessed,
        rowsFailed,
    });
}

// ─── Request Validator ───────────────────────────────────────────────────────

/**
 * Validate a parse request object and return a structured validation result.
 * Valida um objeto de requisição e retorna erros encontrados.
 *
 * @param req - The request object to validate
 */
export function validateParseRequest(req: any): { valid: boolean; errors: string[] } {
    const errors = [];

    if (req === null || typeof req !== 'object') {
        return { valid: false, errors: ['Request must be a non-null object'] };
    }

    const validTasks = Object.values(PARSER_TASK);
    if (typeof req.taskType !== 'string' || !validTasks.includes(req.taskType)) {
        errors.push(`taskType "${req.taskType}" is not valid. Accepted: ${validTasks.join(', ')}`);
    }

    if (typeof req.requestId !== 'string' || req.requestId.trim().length === 0) {
        errors.push('requestId must be a non-empty string');
    }

    if (!VALID_PRIORITIES.includes(req.priority)) {
        errors.push(`priority "${req.priority}" is not valid. Accepted: ${VALID_PRIORITIES.join(', ')}`);
    }

    if (!Object.prototype.hasOwnProperty.call(req, 'payload')) {
        errors.push('payload field is required (may be null)');
    }

    return { valid: errors.length === 0, errors };
}

// ─── Payload Size Estimation ─────────────────────────────────────────────────

/**
 * Estimate the serialized byte size of a payload.
 * Estima o tamanho em bytes de um payload via JSON.stringify.
 * Returns 0 for null/undefined payloads.
 *
 * @param payload
 * @returns Estimated byte count
 */
export function estimatePayloadBytes(payload: any): number {
    if (payload === null || payload === undefined) {
        return 0;
    }
    try {
        return JSON.stringify(payload).length;
    } catch {
        // Circular reference or non-serializable value - return 0 safely
        return 0;
    }
}

// ─── Offload Decision ────────────────────────────────────────────────────────

/** Default threshold in bytes above which offloading to worker is recommended */
const DEFAULT_OFFLOAD_THRESHOLD_BYTES = 50 * 1024; // 50 KB

/**
 * Determine whether a payload is large enough to justify offloading to a Web Worker.
 * Decide se o payload é grande o suficiente para justificar o uso do Web Worker.
 *
 * @param payloadBytes - Estimated payload size in bytes
 * @param threshold - Byte threshold (default 50 KB)
 */
export function shouldOffloadToWorker(
    payloadBytes: number,
    threshold: number = DEFAULT_OFFLOAD_THRESHOLD_BYTES,
): boolean {
    return typeof payloadBytes === 'number' && payloadBytes > threshold;
}

// ─── Worker Handshake ────────────────────────────────────────────────────────

/**
 * Build the worker handshake message sent during worker initialization.
 * Constrói a mensagem de handshake enviada na inicialização do worker.
 */
export function buildWorkerHandshake(): Readonly<{
    type: 'handshake';
    version: string;
    supportedTasks: string[];
}> {
    return Object.freeze({
        type: 'handshake' as 'handshake',
        version: '1' as string,
        supportedTasks: Object.freeze([...Object.values(PARSER_TASK)]) as string[],
    });
}

// ─── Raw Message Parser ──────────────────────────────────────────────────────

/**
 * Parse and validate a raw message received from/to the worker.
 * Analisa e valida uma mensagem bruta recebida do worker (ou enviada a ele).
 *
 * Accepts either:
 *   - a handshake message ({ type: 'handshake', ... })
 *   - a parse request ({ taskType, requestId, payload, priority })
 *   - a parse result ({ requestId, taskType, status, data, ... })
 *
 * @param raw - The raw message to parse
 * @returns Validated, typed message object
 * @throws {TypeError} If the message is structurally invalid
 */
export function parseWorkerMessage(raw: any): Readonly<object> {
    if (raw === null || typeof raw !== 'object') {
        throw new TypeError('parseWorkerMessage: message must be a non-null object');
    }

    // Handshake message
    if (raw.type === 'handshake') {
        if (typeof raw.version !== 'string') {
            throw new TypeError('parseWorkerMessage: handshake.version must be a string');
        }
        if (!Array.isArray(raw.supportedTasks)) {
            throw new TypeError('parseWorkerMessage: handshake.supportedTasks must be an array');
        }
        return Object.freeze({ ...raw });
    }

    // Parse result (has 'status' field)
    if (Object.prototype.hasOwnProperty.call(raw, 'status')) {
        const validStatuses = Object.values(PARSER_RESULT_STATUS);
        if (!validStatuses.includes(raw.status)) {
            throw new TypeError(`parseWorkerMessage: unknown result status "${raw.status}"`);
        }
        if (typeof raw.requestId !== 'string') {
            throw new TypeError('parseWorkerMessage: result.requestId must be a string');
        }
        return Object.freeze({ ...raw });
    }

    // Parse request (has 'taskType' field)
    if (Object.prototype.hasOwnProperty.call(raw, 'taskType')) {
        const { valid, errors } = validateParseRequest(raw);
        if (!valid) {
            throw new TypeError(`parseWorkerMessage: invalid parse request — ${errors.join('; ')}`);
        }
        return Object.freeze({ ...raw });
    }

    throw new TypeError(
        'parseWorkerMessage: message does not match any known type ' + '(handshake, parse request, or parse result)',
    );
}
