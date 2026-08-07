// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * WorkerPool - P1-2 PERF-MASTER-001 S4
 * Pure-logic Web Worker pool manager with main-thread fallback.
 * Manages a bounded pool of workers, task queue, and message protocol.
 * Zero DOM. All worker construction is injected via factory.
 */

export const WORKER_STATUS = Object.freeze({
    IDLE: 'idle',
    BUSY: 'busy',
    TERMINATED: 'terminated',
});

export const TASK_STATUS = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

export const POOL_ERROR = Object.freeze({
    POOL_FULL: 'pool_full',
    WORKER_FAILED: 'worker_failed',
    TASK_TIMEOUT: 'task_timeout',
    TASK_CANCELLED: 'task_cancelled',
    NOT_SUPPORTED: 'not_supported',
});

export class WorkerPoolError extends Error {
    code: any;
    constructor(code: any, message: any) {
        super(message);
        this.name = 'WorkerPoolError';
        this.code = code;
    }
}

/**
 * Creates a task descriptor.
 * @param p.type - task type identifier
 * @param p.payload - task payload
 * @param p.timeoutMs - timeout in ms (default 30000)
 * @param p.taskId - optional id
 * @returns frozen task descriptor
 */
export function createTask({
    type,
    payload,
    timeoutMs = 30_000,
    taskId = null as any,
}: {
    type: string;
    payload: any;
    timeoutMs?: number;
    taskId?: string;
}): object {
    if (!type || typeof type !== 'string') throw new TypeError('type must be a non-empty string');
    return Object.freeze({
        taskId: taskId ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        payload,
        timeoutMs: Math.max(1, Number(timeoutMs) || 30_000),
        status: TASK_STATUS.PENDING,
        createdAt: Date.now(),
    });
}

/**
 * Creates a pool configuration.
 * @param p.maxWorkers - max concurrent workers (default 4)
 * @param p.maxQueueSize - max pending tasks in queue (default 100)
 * @param p.idleTimeoutMs - terminate idle worker after N ms (default 60000)
 * @param p.fallbackToMainThread - if Workers not supported (default true)
 * @returns frozen config
 */
export function createPoolConfig({
    maxWorkers = 4,
    maxQueueSize = 100,
    idleTimeoutMs = 60_000,
    fallbackToMainThread = true,
}: {
    maxWorkers?: number;
    maxQueueSize?: number;
    idleTimeoutMs?: number;
    fallbackToMainThread?: boolean;
} = {}): object {
    return Object.freeze({
        maxWorkers: Math.max(1, Math.min(16, Number.isFinite(+maxWorkers) ? +maxWorkers : 4)),
        maxQueueSize: Math.max(1, Number.isFinite(+maxQueueSize) ? +maxQueueSize : 100),
        idleTimeoutMs: Math.max(0, Number.isFinite(+idleTimeoutMs) ? +idleTimeoutMs : 60_000),
        fallbackToMainThread: Boolean(fallbackToMainThread),
    });
}

/**
 * Creates a worker slot descriptor.
 * @returns mutable slot (not frozen - status changes)
 */
export function createWorkerSlot(workerId: string): object {
    return {
        workerId,
        status: WORKER_STATUS.IDLE,
        currentTaskId: null,
        startedAt: null,
        completedCount: 0,
        errorCount: 0,
    };
}

/**
 * Determines if a worker slot is available.
 */
export function isSlotAvailable(slot: any): boolean {
    return slot.status === WORKER_STATUS.IDLE;
}

/**
 * Assigns a task to a slot (pure state update - returns new slot, does not mutate).
 */
export function assignTaskToSlot(slot: any, task: any): object {
    return {
        ...slot,
        status: WORKER_STATUS.BUSY,
        currentTaskId: task.taskId,
        startedAt: Date.now(),
    };
}

/**
 * Marks a slot as completed (returns new slot).
 */
export function completeSlot(slot: any, success = true): object {
    return {
        ...slot,
        status: WORKER_STATUS.IDLE,
        currentTaskId: null,
        startedAt: null,
        completedCount: slot.completedCount + (success ? 1 : 0),
        errorCount: slot.errorCount + (success ? 0 : 1),
    };
}

/**
 * Builds a pool state snapshot (pure function over slots + queue).
 */
export function getPoolSnapshot(slots: any[], queue: any[]): object {
    const idle = slots.filter((s) => s.status === WORKER_STATUS.IDLE).length;
    const busy = slots.filter((s) => s.status === WORKER_STATUS.BUSY).length;
    const terminated = slots.filter((s) => s.status === WORKER_STATUS.TERMINATED).length;
    return Object.freeze({
        totalSlots: slots.length,
        idle,
        busy,
        terminated,
        queueLength: queue.length,
        pendingTasks: queue.filter((t) => t.status === TASK_STATUS.PENDING).length,
        utilization: slots.length > 0 ? Math.round((busy / slots.length) * 100) : 0,
    });
}

/**
 * Determines if a task has timed out.
 * @param slot - worker slot with startedAt
 * @param task - task with timeoutMs
 * @param now - current timestamp (injectable for tests)
 */
export function isTaskTimedOut(slot: any, task: any, now = Date.now()): boolean {
    if (!slot.startedAt || slot.status !== WORKER_STATUS.BUSY) return false;
    return now - slot.startedAt > task.timeoutMs;
}

/**
 * Selects the next idle slot from the pool.
 */
export function selectIdleSlot(slots: any[]): object | null {
    return slots.find(isSlotAvailable) ?? null;
}

/**
 * Drains completed/failed tasks from a queue (returns [remaining, drained]).
 */
export function drainFinishedTasks(queue: any[]): [any[], any[]] {
    const remaining: any[] = [];
    const drained: any[] = [];
    for (const t of queue) {
        if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.FAILED || t.status === TASK_STATUS.CANCELLED) {
            drained.push(t);
        } else {
            remaining.push(t);
        }
    }
    return [remaining, drained];
}

/**
 * Builds the message envelope sent to/from a worker.
 * @param type - 'run'|'result'|'error'|'cancel'|'ping'|'pong'
 */
export function buildWorkerMessage(type: string, taskId: string, data: any = null): object {
    const VALID = new Set(['run', 'result', 'error', 'cancel', 'ping', 'pong']);
    if (!VALID.has(type)) throw new TypeError(`Unknown message type: ${type}`);
    return Object.freeze({ type, taskId, data, ts: Date.now() });
}
