// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Toast Queue Manager - pure-logic, zero DOM
// SPEC: UX-65
// Gerencia fila de toasts com cap de visíveis, auto-dismiss, pause/resume.

const VALID_SEVERITIES = ['info', 'success', 'warning', 'error'];

/**
 * Cria estado inicial congelado da fila de toasts.
 * @param opts
 */
export function createToastQueue(
    { maxVisible = 3, defaultDurationMs = 4000 }: { maxVisible?: number; defaultDurationMs?: number } = {},
) {
    if (!Number.isFinite(maxVisible) || maxVisible <= 0) {
        throw new Error('maxVisible must be a positive finite number');
    }
    if (!Number.isFinite(defaultDurationMs) || defaultDurationMs <= 0) {
        throw new Error('defaultDurationMs must be a positive finite number');
    }
    return Object.freeze({
        visibleToasts: Object.freeze([]),
        queue: Object.freeze([]),
        maxVisible,
        defaultDurationMs,
    });
}

function freezeState(state: any) {
    return Object.freeze({
        visibleToasts: Object.freeze(state.visibleToasts.map((t: any) => Object.freeze({ ...t }))),
        queue: Object.freeze(state.queue.map((t: any) => Object.freeze({ ...t }))),
        maxVisible: state.maxVisible,
        defaultDurationMs: state.defaultDurationMs,
    });
}

function findToast(state: any, toastId: any) {
    const v = state.visibleToasts.find((t: any) => t.id === toastId);
    if (v) return { toast: v, location: 'visible' };
    const q = state.queue.find((t: any) => t.id === toastId);
    if (q) return { toast: q, location: 'queue' };
    return null;
}

function validateToast(toast: any, defaultDurationMs: any) {
    if (!toast || typeof toast !== 'object') throw new Error('toast must be an object');
    if (!toast.id || typeof toast.id !== 'string') throw new Error('toast.id required (string)');
    if (!VALID_SEVERITIES.includes(toast.severity)) {
        throw new Error(`invalid severity: ${toast.severity}`);
    }
    if (typeof toast.message !== 'string') throw new Error('toast.message must be string');
    const persistent = !!toast.persistent;
    const durationMs = toast.durationMs == null ? defaultDurationMs : toast.durationMs;
    if (!persistent) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            throw new Error('durationMs must be > 0 unless persistent');
        }
    }
    return { persistent, durationMs };
}

/**
 * Enfileira um toast. Se houver vaga em visibleToasts, vai direto.
 * Throw se id duplicado em qualquer lista.
 */
export function enqueueToast(state: any, toast: any, now: any) {
    const { persistent, durationMs } = validateToast(toast, state.defaultDurationMs);
    if (findToast(state, toast.id)) {
        throw new Error(`duplicate toast id: ${toast.id}`);
    }
    const normalized = {
        id: toast.id,
        severity: toast.severity,
        message: toast.message,
        durationMs,
        persistent,
        action: toast.action ? { ...toast.action } : null,
        queuedAt: now,
        shownAt: null,
        pausedAt: null,
    };

    if (state.visibleToasts.length < state.maxVisible) {
        return freezeState({
            ...state,
            visibleToasts: [...state.visibleToasts, { ...normalized, shownAt: now }],
            queue: [...state.queue],
        });
    }
    return freezeState({
        ...state,
        visibleToasts: [...state.visibleToasts],
        queue: [...state.queue, normalized],
    });
}

/**
 * Promove primeiro da queue para visible (se houver vaga e queue não vazia).
 */
function promoteFromQueue(state: any, now: any) {
    if (state.queue.length === 0 || state.visibleToasts.length >= state.maxVisible) {
        return state;
    }
    const [next, ...rest] = state.queue;
    return {
        ...state,
        visibleToasts: [...state.visibleToasts, { ...next, shownAt: now }],
        queue: rest,
    };
}

/**
 * Remove toast (de visible ou queue). Promove queue se removido de visible.
 */
export function dismissToast(state: any, toastId: any, now = Date.now()) {
    const found = findToast(state, toastId);
    if (!found) throw new Error(`toast not found: ${toastId}`);

    if (found.location === 'visible') {
        const visibleToasts = state.visibleToasts.filter((t: any) => t.id !== toastId);
        const intermediate = { ...state, visibleToasts, queue: [...state.queue] };
        return freezeState(promoteFromQueue(intermediate, now));
    }
    return freezeState({
        ...state,
        visibleToasts: [...state.visibleToasts],
        queue: state.queue.filter((t: any) => t.id !== toastId),
    });
}

/**
 * Auto-dismiss toasts cujo shownAt+durationMs < now (skip persistent e paused).
 * Promove queue para preencher slots liberados.
 */
export function tickAutoDismiss(state: any, now: any) {
    const survivors = state.visibleToasts.filter((t: any) => {
        if (t.persistent) return true;
        if (t.pausedAt != null) return true;
        if (t.shownAt == null) return true;
        return t.shownAt + t.durationMs > now;
    });

    let working = { ...state, visibleToasts: survivors, queue: [...state.queue] };
    while (working.visibleToasts.length < working.maxVisible && working.queue.length > 0) {
        working = promoteFromQueue(working, now);
    }
    return freezeState(working);
}

/**
 * Limpa visible e queue.
 */
export function clearAll(state: any) {
    return freezeState({ ...state, visibleToasts: [], queue: [] });
}

/**
 * Remove todos os toasts com severity informada.
 */
export function clearBySeverity(state: any, severity: any) {
    if (!VALID_SEVERITIES.includes(severity)) {
        throw new Error(`invalid severity: ${severity}`);
    }
    return freezeState({
        ...state,
        visibleToasts: state.visibleToasts.filter((t: any) => t.severity !== severity),
        queue: state.queue.filter((t: any) => t.severity !== severity),
    });
}

export function getVisibleToasts(state: any) {
    return state.visibleToasts.map((t: any) => ({ ...t }));
}

export function getQueuedCount(state: any) {
    return state.queue.length;
}

/**
 * Pausa auto-dismiss de um toast visível (hover). Salva pausedAt.
 */
export function pauseAutoDismiss(state: any, toastId: any, now = Date.now()) {
    const found = findToast(state, toastId);
    if (!found) throw new Error(`toast not found: ${toastId}`);
    if (found.location !== 'visible') {
        throw new Error(`cannot pause queued toast: ${toastId}`);
    }
    if (found.toast.pausedAt != null) return state; // já pausado
    const visibleToasts = state.visibleToasts.map((t: any) => (t.id === toastId ? { ...t, pausedAt: now } : t));
    return freezeState({ ...state, visibleToasts, queue: [...state.queue] });
}

/**
 * Resume auto-dismiss; ajusta shownAt para preservar tempo restante.
 */
export function resumeAutoDismiss(state: any, toastId: any, now = Date.now()) {
    const found = findToast(state, toastId);
    if (!found) throw new Error(`toast not found: ${toastId}`);
    if (found.location !== 'visible') {
        throw new Error(`cannot resume queued toast: ${toastId}`);
    }
    const t = found.toast;
    if (t.pausedAt == null) return state; // não pausado
    const elapsedDuringPause = now - t.pausedAt;
    const newShownAt = (t.shownAt ?? now) + elapsedDuringPause;
    const visibleToasts = state.visibleToasts.map((x: any) =>
        x.id === toastId ? { ...x, shownAt: newShownAt, pausedAt: null } : x,
    );
    return freezeState({ ...state, visibleToasts, queue: [...state.queue] });
}

/**
 * Resumo agregado: visibleCount, queuedCount, bySeverity (info/success/warning/error).
 */
export function summarizeToasts(state: any) {
    const bySeverity: Record<string, number> = { info: 0, success: 0, warning: 0, error: 0 };
    for (const t of state.visibleToasts) (bySeverity as any)[t.severity]++;
    for (const t of state.queue) (bySeverity as any)[t.severity]++;
    return {
        visibleCount: state.visibleToasts.length,
        queuedCount: state.queue.length,
        bySeverity,
    };
}
