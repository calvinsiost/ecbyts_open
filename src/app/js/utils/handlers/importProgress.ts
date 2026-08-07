// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// IMPORT-UX-001 RF-5 — Progresso honesto com heartbeat.
// Dor P5: progresso congela sem heartbeat/ETA; impossível distinguir travado
// de trabalhando. Este módulo gerencia estado de progresso por tarefa com
// garantia de monotonicidade (pct NUNCA diminui) e heartbeat que sinaliza
// "ainda vivo" sem inventar progresso falso.

export interface ProgressSnapshot {
    taskId: string;
    pct: number;
    stage: string;
    elapsedMs: number;
    stalledMs: number;
    stalled: boolean;
}

export interface HeartbeatController {
    taskId: string;
    stop: () => void;
}

interface TaskState {
    taskId: string;
    pct: number;
    stage: string;
    startedAt: number;
    lastUpdateAt: number;
    timerId: ReturnType<typeof setInterval> | null;
    onTick: ((snap: ProgressSnapshot) => void) | null;
}

export const STALL_THRESHOLD_MS = 30_000;

const _tasks = new Map<string, TaskState>();

export function buildSnapshot(st: TaskState, now: number): ProgressSnapshot {
    const stalledMs = now - st.lastUpdateAt;
    return {
        taskId: st.taskId,
        pct: st.pct,
        stage: st.stage,
        elapsedMs: now - st.startedAt,
        stalledMs,
        stalled: stalledMs >= STALL_THRESHOLD_MS,
    };
}

export function startHeartbeat(
    taskId: string,
    intervalMs: number,
    onTick?: (snap: ProgressSnapshot) => void,
): HeartbeatController {
    const existing = _tasks.get(taskId);
    if (existing?.timerId != null) {
        clearInterval(existing.timerId);
    }

    const now = Date.now();
    const st: TaskState = existing ?? {
        taskId,
        pct: 0,
        stage: '',
        startedAt: now,
        lastUpdateAt: now,
        timerId: null,
        onTick: null,
    };
    st.onTick = onTick ?? null;

    const safeInterval = Math.max(500, Math.round(intervalMs) || 5000);
    st.timerId = setInterval(() => {
        const snap = buildSnapshot(st, Date.now());
        st.onTick?.(snap);
    }, safeInterval);

    _tasks.set(taskId, st);

    return {
        taskId,
        stop: () => stopHeartbeat(taskId),
    };
}

export function updateProgress(taskId: string, pct: number, stage: string): void {
    const st = _tasks.get(taskId);
    if (!st) return;

    const raw = Number(pct);
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;

    // Monotonicidade: pct NUNCA diminui — progresso falso é proibido (RF-5).
    if (clamped < st.pct) return;

    st.pct = clamped;
    st.stage = typeof stage === 'string' ? stage : '';
    st.lastUpdateAt = Date.now();
}

export function stopHeartbeat(taskId: string): void {
    const st = _tasks.get(taskId);
    if (!st) return;
    if (st.timerId != null) {
        clearInterval(st.timerId);
        st.timerId = null;
    }
    st.onTick = null;
    _tasks.delete(taskId);
}

export function getSnapshot(taskId: string): ProgressSnapshot | null {
    const st = _tasks.get(taskId);
    if (!st) return null;
    return buildSnapshot(st, Date.now());
}

export function _resetForTest(): void {
    for (const st of _tasks.values()) {
        if (st.timerId != null) clearInterval(st.timerId);
    }
    _tasks.clear();
}
