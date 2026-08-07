// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-60 - Progress Tracker (pure logic).
 * Multi-task progress tracker with ETA and cancellation.
 *
 * Immutable model: every mutation returns a new frozen state.
 */

export type ProgressStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface ProgressTask {
    id: string;
    label: string;
    status: ProgressStatus;
    currentStep: number;
    totalSteps: number;
    percent: number;
    startedAt: number;
    completedAt: number | null;
    error: string | null;
    cancellable: boolean;
    parentId: string | null;
}

export interface ProgressState {
    tasks: Map<string, Readonly<ProgressTask>>;
}

export interface StartTaskOptions {
    id?: unknown;
    label?: unknown;
    totalSteps?: unknown;
    cancellable?: unknown;
    parentId?: unknown;
}

export interface ProgressSummary {
    total: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    byStatus: Record<ProgressStatus, number>;
}

const VALID_STATUS = new Set<ProgressStatus>(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']);

export function createProgressTracker(): Readonly<ProgressState> {
    return Object.freeze({ tasks: new Map<string, Readonly<ProgressTask>>() });
}

function clone(state: Readonly<ProgressState>): Readonly<ProgressState> {
    const next = new Map<string, Readonly<ProgressTask>>();
    for (const [k, v] of state.tasks) next.set(k, v);
    return Object.freeze({ tasks: next });
}

function freezeTask(t: ProgressTask): Readonly<ProgressTask> {
    return Object.freeze({ ...t });
}

function validateRequiredStartFields(
    id: unknown,
    label: unknown,
    totalSteps: unknown,
    now: unknown,
): { id: string; label: string; totalSteps: number; now: number } {
    if (!id || typeof id !== 'string') throw new Error('startTask: id obrigat\u00f3rio');
    if (!label || typeof label !== 'string') throw new Error('startTask: label obrigat\u00f3rio');
    if (!Number.isFinite(totalSteps) || Number(totalSteps) <= 0) {
        throw new Error('startTask: totalSteps inv\u00e1lido');
    }
    if (typeof now !== 'number') throw new Error('startTask: now obrigat\u00f3rio');
    return { id, label, totalSteps: Number(totalSteps), now };
}

function validateTaskRelationships(
    state: Readonly<ProgressState>,
    id: string,
    parentId: unknown,
): string | null {
    if (state.tasks.has(id)) throw new Error(`startTask: id duplicado "${id}"`);
    if (parentId && (typeof parentId !== 'string' || !state.tasks.has(parentId))) {
        throw new Error(`startTask: parentId inexistente "${String(parentId)}"`);
    }
    return typeof parentId === 'string' && parentId ? parentId : null;
}

export function startTask(
    state: Readonly<ProgressState>,
    opts: StartTaskOptions | null | undefined,
    now: unknown,
): Readonly<ProgressState> {
    const { id, label, totalSteps, cancellable = false, parentId = null } = opts || {};
    const validated = validateRequiredStartFields(id, label, totalSteps, now);
    const validatedParentId = validateTaskRelationships(state, validated.id, parentId);

    const next = clone(state);
    next.tasks.set(
        validated.id,
        freezeTask({
            id: validated.id,
            label: validated.label,
            status: 'running',
            currentStep: 0,
            totalSteps: validated.totalSteps,
            percent: 0,
            startedAt: validated.now,
            completedAt: null,
            error: null,
            cancellable: !!cancellable,
            parentId: validatedParentId,
        }),
    );
    return next;
}

function getOrThrow(state: Readonly<ProgressState>, taskId: string): Readonly<ProgressTask> {
    const task = state.tasks.get(taskId);
    if (!task) throw new Error(`task n\u00e3o encontrada "${taskId}"`);
    return task;
}

export function updateProgress(
    state: Readonly<ProgressState>,
    taskId: string,
    currentStep: unknown,
    now: unknown,
): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (task.status !== 'running') {
        throw new Error(`updateProgress: task "${taskId}" n\u00e3o est\u00e1 running (${task.status})`);
    }
    if (!Number.isFinite(currentStep) || Number(currentStep) < 0) {
        throw new Error('updateProgress: currentStep inv\u00e1lido');
    }
    const normalizedCurrentStep = Number(currentStep);
    if (normalizedCurrentStep > task.totalSteps) {
        throw new Error(`updateProgress: currentStep ${normalizedCurrentStep} > totalSteps ${task.totalSteps}`);
    }
    if (typeof now !== 'number') throw new Error('updateProgress: now obrigat\u00f3rio');

    const next = clone(state);
    next.tasks.set(
        taskId,
        freezeTask({
            ...task,
            currentStep: normalizedCurrentStep,
            percent: (normalizedCurrentStep / task.totalSteps) * 100,
        }),
    );
    return next;
}

export function pauseTask(state: Readonly<ProgressState>, taskId: string): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (!task.cancellable) throw new Error(`pauseTask: task "${taskId}" n\u00e3o \u00e9 cancellable`);
    if (task.status !== 'running') throw new Error(`pauseTask: task "${taskId}" n\u00e3o est\u00e1 running`);
    const next = clone(state);
    next.tasks.set(taskId, freezeTask({ ...task, status: 'paused' }));
    return next;
}

export function resumeTask(state: Readonly<ProgressState>, taskId: string): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (!task.cancellable) throw new Error(`resumeTask: task "${taskId}" n\u00e3o \u00e9 cancellable`);
    if (task.status !== 'paused') throw new Error(`resumeTask: task "${taskId}" n\u00e3o est\u00e1 paused`);
    const next = clone(state);
    next.tasks.set(taskId, freezeTask({ ...task, status: 'running' }));
    return next;
}

export function completeTask(state: Readonly<ProgressState>, taskId: string, now: unknown): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (typeof now !== 'number') throw new Error('completeTask: now obrigat\u00f3rio');
    if (task.status === 'completed') return state;
    if (task.status !== 'running' && task.status !== 'paused') {
        throw new Error(`completeTask: task "${taskId}" n\u00e3o pode completar de ${task.status}`);
    }
    const next = clone(state);
    next.tasks.set(
        taskId,
        freezeTask({
            ...task,
            status: 'completed',
            percent: 100,
            currentStep: task.totalSteps,
            completedAt: now,
        }),
    );
    return next;
}

export function failTask(
    state: Readonly<ProgressState>,
    taskId: string,
    error: unknown,
    now: unknown,
): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (typeof now !== 'number') throw new Error('failTask: now obrigat\u00f3rio');
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
        throw new Error(`failTask: task "${taskId}" j\u00e1 em estado terminal (${task.status})`);
    }
    const next = clone(state);
    next.tasks.set(
        taskId,
        freezeTask({
            ...task,
            status: 'failed',
            error: error == null ? 'unknown' : String(error),
            completedAt: now,
        }),
    );
    return next;
}

export function cancelTask(state: Readonly<ProgressState>, taskId: string, now: unknown): Readonly<ProgressState> {
    const task = getOrThrow(state, taskId);
    if (!task.cancellable) throw new Error(`cancelTask: task "${taskId}" n\u00e3o \u00e9 cancellable`);
    if (typeof now !== 'number') throw new Error('cancelTask: now obrigat\u00f3rio');
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
        return state;
    }

    const next = clone(state);
    next.tasks.set(taskId, freezeTask({ ...task, status: 'cancelled', completedAt: now }));
    for (const child of state.tasks.values()) {
        if (
            child.parentId === taskId &&
            child.status !== 'completed' &&
            child.status !== 'cancelled' &&
            child.status !== 'failed' &&
            child.cancellable
        ) {
            next.tasks.set(child.id, freezeTask({ ...child, status: 'cancelled', completedAt: now }));
        }
    }
    return next;
}

export function getActiveTask(state: Readonly<ProgressState>): Readonly<ProgressTask> | null {
    let latest: Readonly<ProgressTask> | null = null;
    for (const task of state.tasks.values()) {
        if (task.status === 'running' && (!latest || task.startedAt > latest.startedAt)) {
            latest = task;
        }
    }
    return latest;
}

export function getRootTasks(state: Readonly<ProgressState>): Readonly<ProgressTask>[] {
    const out: Readonly<ProgressTask>[] = [];
    for (const task of state.tasks.values()) if (!task.parentId) out.push(task);
    return out;
}

export function getChildren(state: Readonly<ProgressState>, parentId: string): Readonly<ProgressTask>[] {
    const out: Readonly<ProgressTask>[] = [];
    for (const task of state.tasks.values()) if (task.parentId === parentId) out.push(task);
    return out;
}

export function getETA(state: Readonly<ProgressState>, taskId: string, now: number): number | null {
    const task = getOrThrow(state, taskId);
    if (task.status !== 'running') return null;
    if (task.percent < 5) return null;
    const elapsed = now - task.startedAt;
    if (elapsed <= 0) return null;
    const rate = task.currentStep / elapsed;
    if (rate <= 0) return null;
    const remaining = task.totalSteps - task.currentStep;
    return Math.round(remaining / rate);
}

export function getOverallProgress(state: Readonly<ProgressState>): number {
    const roots = getRootTasks(state).filter(
        (task) => task.status === 'running' || task.status === 'paused' || task.status === 'queued',
    );
    if (roots.length === 0) return 0;
    let totalWeight = 0;
    let weighted = 0;
    for (const task of roots) {
        totalWeight += task.totalSteps;
        weighted += task.percent * task.totalSteps;
    }
    if (totalWeight === 0) return 0;
    return weighted / totalWeight;
}

export function clearCompleted(state: Readonly<ProgressState>): Readonly<ProgressState> {
    const next = new Map<string, Readonly<ProgressTask>>();
    for (const [key, value] of state.tasks) {
        if (value.status !== 'completed') next.set(key, value);
    }
    return Object.freeze({ tasks: next });
}

export function summarizeProgress(state: Readonly<ProgressState>): ProgressSummary {
    const byStatus: Record<ProgressStatus, number> = {
        queued: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
    };
    for (const task of state.tasks.values()) {
        if (VALID_STATUS.has(task.status)) byStatus[task.status]++;
    }
    return {
        total: state.tasks.size,
        running: byStatus.running,
        completed: byStatus.completed,
        failed: byStatus.failed,
        cancelled: byStatus.cancelled,
        byStatus,
    };
}
