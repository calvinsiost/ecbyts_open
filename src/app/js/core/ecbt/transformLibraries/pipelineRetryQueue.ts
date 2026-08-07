// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Retry Queue - Phase 59 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S59
 *
 * Phase 59 (2026-05-02) - pure-logic fila de jobs com retry policy:
 * exponential backoff por attempt, dead-letter após maxAttempts.
 *
 * NÃO depende de browser. Sem Promise/setTimeout - tempo é injetado.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const RETRY_QUEUE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 59,
    deliveredAt: '2026-05-02',
});

const STATUS = Object.freeze({
    PENDING: 'pending',
    RETRYING: 'retrying',
    SUCCEEDED: 'succeeded',
    DEAD: 'dead',
});

/**
 * Cria fila frozen com policy.
 */
export function createQueue(opts: any): any {
    const maxAttempts = Number(opts?.maxAttempts) > 0 ? Math.floor(opts.maxAttempts) : 3;
    const baseDelayMs = Number(opts?.baseDelayMs) >= 0 ? Math.floor(opts.baseDelayMs) : 1000;
    return Object.freeze({
        maxAttempts,
        baseDelayMs,
        jobs: Object.freeze({}),
    });
}

/**
 * Enfileira novo job (status pending, attempts=0).
 */
export function enqueue(queue: any, jobId: any, payload: any, now: any): any {
    if (!queue || typeof jobId !== 'string' || !jobId.trim()) {
        return queue;
    }
    if (jobId in queue.jobs) return queue;
    const ts = Number.isFinite(now) ? now : 0;
    const job = Object.freeze({
        id: jobId,
        payload: payload === undefined ? null : payload,
        status: STATUS.PENDING,
        attempts: 0,
        nextRunAt: ts,
        lastError: null,
        enqueuedAt: ts,
        updatedAt: ts,
    });
    return Object.freeze({
        ...queue,
        jobs: Object.freeze({ ...queue.jobs, [jobId]: job }),
    });
}

/**
 * Marca job como falhou; agenda retry com backoff exponencial
 * ou move para dead-letter se atingiu maxAttempts.
 */
export function markFailed(queue: any, jobId: any, error: any, now: any): any {
    if (!queue || !(jobId in (queue.jobs || {}))) return queue;
    const job = queue.jobs[jobId];
    if (job.status === STATUS.SUCCEEDED || job.status === STATUS.DEAD) return queue;
    const ts = Number.isFinite(now) ? now : 0;
    const nextAttempts = job.attempts + 1;
    const errMsg = String(error?.message || error || 'unknown');
    let nextJob;
    if (nextAttempts >= queue.maxAttempts) {
        nextJob = Object.freeze({
            ...job,
            status: STATUS.DEAD,
            attempts: nextAttempts,
            lastError: errMsg,
            nextRunAt: ts,
            updatedAt: ts,
        });
    } else {
        const delay = queue.baseDelayMs * Math.pow(2, nextAttempts - 1);
        nextJob = Object.freeze({
            ...job,
            status: STATUS.RETRYING,
            attempts: nextAttempts,
            lastError: errMsg,
            nextRunAt: ts + delay,
            updatedAt: ts,
        });
    }
    return Object.freeze({
        ...queue,
        jobs: Object.freeze({ ...queue.jobs, [jobId]: nextJob }),
    });
}

/**
 * Marca job como sucesso.
 */
export function markSucceeded(queue: any, jobId: any, now: any): any {
    if (!queue || !(jobId in (queue.jobs || {}))) return queue;
    const job = queue.jobs[jobId];
    if (job.status === STATUS.DEAD) return queue;
    const ts = Number.isFinite(now) ? now : 0;
    const next = Object.freeze({
        ...job,
        status: STATUS.SUCCEEDED,
        nextRunAt: ts,
        updatedAt: ts,
    });
    return Object.freeze({
        ...queue,
        jobs: Object.freeze({ ...queue.jobs, [jobId]: next }),
    });
}

/**
 * Retorna ids de jobs prontos para execução em `now`.
 * (status pending/retrying e nextRunAt <= now)
 */
export function dueJobs(queue: any, now: any): any {
    if (!queue || !queue.jobs) return Object.freeze([]);
    const ts = Number.isFinite(now) ? now : 0;
    const ids = [];
    for (const id of Object.keys(queue.jobs)) {
        const j = queue.jobs[id];
        if ((j.status === STATUS.PENDING || j.status === STATUS.RETRYING) && j.nextRunAt <= ts) {
            ids.push(id);
        }
    }
    return Object.freeze(ids);
}

/**
 * Retorna jobs em dead-letter.
 */
export function deadLetter(queue: any): any {
    if (!queue || !queue.jobs) return Object.freeze([]);
    const out = [];
    for (const id of Object.keys(queue.jobs)) {
        if (queue.jobs[id].status === STATUS.DEAD) out.push(queue.jobs[id]);
    }
    return Object.freeze(out);
}

/**
 * Sumariza contagens por status.
 */
export function summarize(queue: any): any {
    const empty = { pending: 0, retrying: 0, dead: 0, succeeded: 0 };
    if (!queue || !queue.jobs) return Object.freeze(empty);
    const acc = { pending: 0, retrying: 0, dead: 0, succeeded: 0 };
    for (const id of Object.keys(queue.jobs)) {
        const s = queue.jobs[id].status;
        if (s === STATUS.PENDING) acc.pending += 1;
        else if (s === STATUS.RETRYING) acc.retrying += 1;
        else if (s === STATUS.DEAD) acc.dead += 1;
        else if (s === STATUS.SUCCEEDED) acc.succeeded += 1;
    }
    return Object.freeze(acc);
}

/** Constantes de status exportadas. */
export const RETRY_STATUS = STATUS;

/**
 * Module identity export.
 */
export const pipelineRetryQueueMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 59,
    deliveredAt: '2026-05-02',
    exports: [
        'RETRY_QUEUE_META',
        'RETRY_STATUS',
        'createQueue',
        'enqueue',
        'markFailed',
        'markSucceeded',
        'dueJobs',
        'deadLetter',
        'summarize',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
