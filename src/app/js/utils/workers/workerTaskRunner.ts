// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Worker Task Runner - WS-4 runtime bridge.
 *
 * Small injectable runner for the worker task protocol. The real Worker
 * constructor is injected so tests and browser integrations can share timeout,
 * abort, progress and fallback behavior without depending on global state.
 */

import {
    buildTaskRequest,
    shouldOffload,
    type WorkerTaskKind,
    type WorkerTaskProgress,
    type WorkerTaskRequest,
    type WorkerTaskResponse,
} from './_workerTaskProtocolPure.js';
import { createParseRequest, estimatePayloadBytes, shouldOffloadToWorker } from './dataParserProtocol.js';
import { createGeoRequest, estimateTriangleCount } from './geometryBuilderProtocol.js';

export const WORKER_TASK_RUNNER_ERROR = Object.freeze({
    ABORTED: 'aborted',
    INVALID_REQUEST: 'invalid_request',
    NOT_SUPPORTED: 'not_supported',
    TASK_ERROR: 'task_error',
    TASK_TIMEOUT: 'task_timeout',
    WORKER_ERROR: 'worker_error',
});

type WorkerMessageHandler = (event: { readonly data: unknown }) => void;
type WorkerErrorHandler = (event: unknown) => void;

export interface WorkerLike {
    readonly postMessage: (message: unknown, transferables?: ReadonlyArray<unknown>) => void;
    readonly terminate?: () => void;
    readonly addEventListener?: (type: 'message' | 'error', handler: WorkerMessageHandler | WorkerErrorHandler) => void;
    readonly removeEventListener?: (
        type: 'message' | 'error',
        handler: WorkerMessageHandler | WorkerErrorHandler,
    ) => void;
    readonly onmessage?: WorkerMessageHandler | null;
    readonly onerror?: WorkerErrorHandler | null;
}

export type WorkerFactory = (request: WorkerTaskRequest) => WorkerLike;
export type WorkerFallbackHandler = (
    request: WorkerTaskRequest,
    context: { readonly signal?: AbortSignal; readonly onProgress?: (progress: WorkerTaskProgress) => void },
) => Promise<unknown> | unknown;

export interface WorkerTaskRunnerOptions {
    readonly createWorker?: WorkerFactory;
    readonly fallbackHandlers?: Partial<Record<WorkerTaskKind, WorkerFallbackHandler>>;
}

export interface WorkerTaskRunOptions {
    readonly onProgress?: (progress: WorkerTaskProgress) => void;
    readonly signal?: AbortSignal;
    readonly transferables?: ReadonlyArray<unknown>;
}

export interface WorkerFlowTask {
    readonly flow: WorkerTaskKind;
    readonly request: WorkerTaskRequest;
    readonly shouldOffload: boolean;
    readonly transferables: ReadonlyArray<unknown>;
}

export interface ParseDocumentFlowInput {
    readonly payload: unknown;
    readonly taskType: string;
    readonly priority?: 'high' | 'normal' | 'low';
    readonly requestId?: string;
    readonly timeoutMs?: number;
    readonly workerAvailable?: boolean;
}

export interface MeshBuildFlowInput {
    readonly params: object;
    readonly taskType: string;
    readonly elementCount?: number;
    readonly elementId?: string | null;
    readonly lod?: 'high' | 'medium' | 'low';
    readonly priority?: 'high' | 'normal' | 'low';
    readonly requestId?: string;
    readonly timeoutMs?: number;
    readonly transferables?: ReadonlyArray<unknown>;
    readonly workerAvailable?: boolean;
}

export interface AnalyticsSearchFlowInput {
    readonly query: string;
    readonly filters?: unknown;
    readonly itemCount: number;
    readonly requestId?: string;
    readonly timeoutMs?: number;
    readonly workerAvailable?: boolean;
}

interface PendingTask {
    readonly reject: (error: WorkerTaskRunnerError) => void;
    readonly worker?: WorkerLike;
}

export class WorkerTaskRunnerError extends Error {
    readonly code: string;
    readonly taskId: string | null;

    constructor(code: string, message: string, taskId: string | null = null) {
        super(message);
        this.name = 'WorkerTaskRunnerError';
        this.code = code;
        this.taskId = taskId;
    }
}

export function createWorkerTaskRunner(options: WorkerTaskRunnerOptions = {}) {
    const pending = new Map<string, PendingTask>();
    return Object.freeze({
        cancelTask: (taskId: string) => cancelPendingTask(pending, taskId),
        getPendingTaskIds: () => Object.freeze([...pending.keys()]),
        runTask: (input: Parameters<typeof buildTaskRequest>[0], runOptions: WorkerTaskRunOptions = {}) =>
            runTaskInternal(input, options, runOptions, pending),
    });
}

export function createParseDocumentFlowTask(input: ParseDocumentFlowInput): WorkerFlowTask {
    const parseRequest = createParseRequest(input);
    const payloadBytes = estimatePayloadBytes(input.payload);
    return freezeFlowTask({
        flow: 'parse_document',
        request: buildFlowTaskRequest({
            kind: 'parse_document',
            payload: Object.freeze({
                parserRecommendedOffload: shouldOffloadToWorker(payloadBytes),
                payloadBytes,
                protocol: 'dataParser',
                request: parseRequest,
            }),
            taskId: parseRequest.requestId,
            timeoutMs: input.timeoutMs,
        }),
        shouldOffload: shouldOffload('parse_document', { payloadBytes }, input.workerAvailable !== false),
        transferables: Object.freeze([]),
    });
}

export function createMeshBuildFlowTask(input: MeshBuildFlowInput): WorkerFlowTask {
    const lod = input.lod ?? 'medium';
    const geoRequest = createGeoRequest({ ...input, lod });
    const requestId = getRequestId(geoRequest);
    const transferables = Object.freeze([...(input.transferables ?? [])]);
    return freezeFlowTask({
        flow: 'mesh_build',
        request: buildFlowTaskRequest({
            kind: 'mesh_build',
            payload: Object.freeze({
                elementCount: safeCount(input.elementCount),
                protocol: 'geometryBuilder',
                request: geoRequest,
                triangleEstimate: estimateTriangleCount(input.taskType, lod),
            }),
            taskId: requestId,
            timeoutMs: input.timeoutMs,
            transferableHints: transferables.length > 0 ? ['ArrayBuffer'] : [],
        }),
        shouldOffload: shouldOffload(
            'mesh_build',
            { elementCount: safeCount(input.elementCount) },
            input.workerAvailable !== false,
        ),
        transferables,
    });
}

export function createAnalyticsSearchFlowTask(input: AnalyticsSearchFlowInput): WorkerFlowTask {
    const itemCount = safeCount(input.itemCount);
    return freezeFlowTask({
        flow: 'analytics_search',
        request: buildFlowTaskRequest({
            kind: 'analytics_search',
            payload: Object.freeze({
                filters: input.filters ?? null,
                itemCount,
                protocol: 'analyticsRegistrySearch',
                query: String(input.query ?? ''),
            }),
            taskId: input.requestId || `analytics_search_${Date.now()}`,
            timeoutMs: input.timeoutMs,
        }),
        shouldOffload: shouldOffload('analytics_search', { itemCount }, input.workerAvailable !== false),
        transferables: Object.freeze([]),
    });
}

export function runWorkerFlowTask(
    runner: ReturnType<typeof createWorkerTaskRunner>,
    flowTask: WorkerFlowTask,
    options: WorkerTaskRunOptions = {},
): Promise<unknown> {
    return runner.runTask(flowTask.request, {
        ...options,
        transferables: options.transferables ?? flowTask.transferables,
    });
}

async function runTaskInternal(
    input: Parameters<typeof buildTaskRequest>[0],
    options: WorkerTaskRunnerOptions,
    runOptions: WorkerTaskRunOptions,
    pending: Map<string, PendingTask>,
): Promise<unknown> {
    const request = buildTaskRequest(input);
    if (!request) throw new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.INVALID_REQUEST, 'Invalid worker task request.');
    if (runOptions.signal?.aborted) throw abortedError(request.taskId);
    if (!options.createWorker) return runFallbackTask(request, options, runOptions);
    return runWorkerTask(request, options.createWorker, runOptions, pending);
}

async function runFallbackTask(
    request: WorkerTaskRequest,
    options: WorkerTaskRunnerOptions,
    runOptions: WorkerTaskRunOptions,
): Promise<unknown> {
    const handler = options.fallbackHandlers?.[request.kind];
    if (!handler) throw unsupportedError(request.taskId);
    const context: { signal?: AbortSignal; onProgress?: (progress: WorkerTaskProgress) => void } = {};
    if (runOptions.signal) context.signal = runOptions.signal;
    if (runOptions.onProgress) context.onProgress = runOptions.onProgress;
    const result = await handler(request, context);
    if (runOptions.signal?.aborted) throw abortedError(request.taskId);
    return result;
}

function runWorkerTask(
    request: WorkerTaskRequest,
    createWorker: WorkerFactory,
    runOptions: WorkerTaskRunOptions,
    pending: Map<string, PendingTask>,
): Promise<unknown> {
    const worker = createWorker(request);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finishWithError(timeoutError(request.taskId)), request.timeoutMs);
        const onAbort = () => finishWithError(abortedError(request.taskId), true);
        const finishOk = (result: unknown) => finish(() => resolve(result));
        const finishWithError = (error: WorkerTaskRunnerError, sendCancel = false) =>
            finish(() => reject(error), sendCancel);
        const onMessage = (event: { readonly data: unknown }) => handleWorkerMessage(event.data, request, finishOk, finishWithError, runOptions);
        const onError = (event: unknown) => finishWithError(workerError(request.taskId, event));
        const finish = (done: () => void, sendCancel = false) => {
            clearTimeout(timeout);
            runOptions.signal?.removeEventListener('abort', onAbort);
            cleanupWorker(worker, onMessage, onError);
            if (sendCancel) postCancel(worker, request.taskId);
            worker.terminate?.();
            pending.delete(request.taskId);
            done();
        };

        pending.set(request.taskId, { reject: finishWithError, worker });
        attachWorker(worker, onMessage, onError);
        runOptions.signal?.addEventListener('abort', onAbort, { once: true });
        worker.postMessage(request, runOptions.transferables ?? []);
    });
}

function handleWorkerMessage(
    data: unknown,
    request: WorkerTaskRequest,
    finishOk: (result: unknown) => void,
    finishWithError: (error: WorkerTaskRunnerError) => void,
    runOptions: WorkerTaskRunOptions,
) {
    if (!isTaskMessage(data, request.taskId)) return;
    if (typeof data.progress === 'number') {
        const progress = { taskId: request.taskId, progress: clampProgress(data.progress) };
        runOptions.onProgress?.(
            typeof data.message === 'string' ? { ...progress, message: data.message } : progress,
        );
        return;
    }
    const response = data as WorkerTaskResponse;
    if (response.ok === true) finishOk(response.result);
    else finishWithError(taskError(response));
}

function cancelPendingTask(pending: Map<string, PendingTask>, taskId: string): boolean {
    const task = pending.get(taskId);
    if (!task) return false;
    postCancel(task.worker, taskId);
    task.worker?.terminate?.();
    task.reject(abortedError(taskId));
    pending.delete(taskId);
    return true;
}

function attachWorker(worker: WorkerLike, onMessage: WorkerMessageHandler, onError: WorkerErrorHandler) {
    worker.addEventListener?.('message', onMessage);
    worker.addEventListener?.('error', onError);
    if (!worker.addEventListener) {
        (worker as { onmessage: WorkerMessageHandler | null }).onmessage = onMessage;
        (worker as { onerror: WorkerErrorHandler | null }).onerror = onError;
    }
}

function cleanupWorker(worker: WorkerLike, onMessage: WorkerMessageHandler, onError: WorkerErrorHandler) {
    worker.removeEventListener?.('message', onMessage);
    worker.removeEventListener?.('error', onError);
    if (!worker.removeEventListener) {
        (worker as { onmessage: WorkerMessageHandler | null }).onmessage = null;
        (worker as { onerror: WorkerErrorHandler | null }).onerror = null;
    }
}

function isTaskMessage(data: unknown, taskId: string): data is WorkerTaskResponse & { readonly progress?: number; readonly message?: string } {
    return Boolean(data && typeof data === 'object' && (data as { taskId?: unknown }).taskId === taskId);
}

function postCancel(worker: WorkerLike | undefined, taskId: string) {
    worker?.postMessage(Object.freeze({ taskId, type: 'cancel' }));
}

function clampProgress(progress: number) {
    return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

function buildRequiredTaskRequest(input: Parameters<typeof buildTaskRequest>[0]): WorkerTaskRequest {
    const request = buildTaskRequest(input);
    if (!request) throw new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.INVALID_REQUEST, 'Invalid flow task.');
    return request;
}

function buildFlowTaskRequest(input: {
    readonly kind: WorkerTaskKind;
    readonly payload: unknown;
    readonly taskId: string;
    readonly timeoutMs: number | undefined;
    readonly transferableHints?: ReadonlyArray<string>;
}): WorkerTaskRequest {
    const requestInput: {
        taskId: string;
        kind: WorkerTaskKind;
        payload: unknown;
        timeoutMs?: number;
        transferableHints?: ReadonlyArray<string>;
    } = {
        kind: input.kind,
        payload: input.payload,
        taskId: input.taskId,
    };
    if (typeof input.timeoutMs === 'number') requestInput.timeoutMs = input.timeoutMs;
    if (input.transferableHints) requestInput.transferableHints = input.transferableHints;
    return buildRequiredTaskRequest(requestInput);
}

function freezeFlowTask(input: WorkerFlowTask): WorkerFlowTask {
    return Object.freeze(input);
}

function getRequestId(request: Readonly<object>): string {
    const requestId = (request as { readonly requestId?: unknown }).requestId;
    return typeof requestId === 'string' && requestId.length > 0 ? requestId : `flow_${Date.now()}`;
}

function safeCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function abortedError(taskId: string) {
    return new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.ABORTED, 'Worker task aborted.', taskId);
}

function timeoutError(taskId: string) {
    return new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.TASK_TIMEOUT, 'Worker task timed out.', taskId);
}

function unsupportedError(taskId: string) {
    return new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.NOT_SUPPORTED, 'No worker or fallback handler available.', taskId);
}

function workerError(taskId: string, event: unknown) {
    const message = event instanceof Error ? event.message : 'Worker emitted an error.';
    return new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.WORKER_ERROR, message, taskId);
}

function taskError(response: WorkerTaskResponse) {
    if (response.ok) return new WorkerTaskRunnerError(WORKER_TASK_RUNNER_ERROR.TASK_ERROR, 'Unexpected task response.');
    return new WorkerTaskRunnerError(response.error.code, response.error.message, response.taskId);
}
