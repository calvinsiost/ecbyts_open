// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Scheduling (Phase 15)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S15
 *
 * Phase 15 (2026-05-01) - pure-logic engine de scheduling para
 * orquestrar execução de múltiplos pipelines com prioridade,
 * dependências e janelas de execução. Não cria timers/workers reais
 * (caller fornece clock + executor).
 *
 * Estratégia:
 *   - Priority queue (binary heap) com ordering: priority ↓ + enqueuedAt ↑
 *   - Dependency graph com Kahn's algorithm para topological sort
 *   - Window check (notBefore / notAfter timestamps)
 *   - Stats helper (queue depth, throughput estimation)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Priority levels (canônicos). */
export const PRIORITY_LEVELS = Object.freeze({
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25,
    BACKGROUND: 10,
});

/** Status canônicos de job. */
export const JOB_STATUS = Object.freeze(['pending', 'ready', 'running', 'completed', 'failed', 'cancelled']);

/** Identidade do módulo. */
export const SCHEDULING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 15,
    deliveredAt: '2026-05-01',
    priorities: PRIORITY_LEVELS,
    statuses: JOB_STATUS,
});

/**
 * Cria objeto frozen de job.
 *
 * @param {Record<string, any>} spec
 * @returns {Object} job frozen
 */
export function createJob(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createJob: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createJob: id required (non-empty string)');
    }
    if (typeof spec.pipelineId !== 'string' || !spec.pipelineId.trim()) {
        throw new TypeError('createJob: pipelineId required');
    }
    const priority = Number.isFinite(spec.priority) ? spec.priority : PRIORITY_LEVELS.NORMAL;
    const enqueuedAt = Number.isFinite(spec.enqueuedAt) ? spec.enqueuedAt : Date.now();
    const dependencies = Array.isArray(spec.dependencies) ? Object.freeze([...spec.dependencies]) : Object.freeze([]);

    return Object.freeze({
        id: spec.id,
        pipelineId: spec.pipelineId,
        priority,
        enqueuedAt,
        notBefore: Number.isFinite(spec.notBefore) ? spec.notBefore : null,
        notAfter: Number.isFinite(spec.notAfter) ? spec.notAfter : null,
        dependencies,
        status: spec.status && JOB_STATUS.includes(spec.status) ? spec.status : 'pending',
        metadata: spec.metadata || null,
    });
}

/**
 * Verifica se job está dentro da janela de execução.
 *
 * @param {Record<string, any>} job
 * @param {number} any> - current timestamp
 * @returns {boolean}
 */
export function isInWindow(job: Record<string, any>, now: number): boolean {
    if (!job || typeof job !== 'object') return false;
    if (!Number.isFinite(now)) return false;
    if (Number.isFinite(job.notBefore) && now < job.notBefore) return false;
    if (Number.isFinite(job.notAfter) && now > job.notAfter) return false;
    return true;
}

/**
 * Verifica se todas as dependências de um job estão completed.
 *
 * @param {Record<string, any>} job
 * @param {Set<string>} any>
 * @returns {boolean}
 */
export function areDependenciesMet(job: Record<string, any>, completedJobIds: Set<string>): boolean {
    if (!job || !Array.isArray(job.dependencies)) return true;
    if (!(completedJobIds instanceof Set)) return job.dependencies.length === 0;
    return job.dependencies.every((depId: any) => completedJobIds.has(depId));
}

/**
 * Compara dois jobs para sort. Priority desc, enqueuedAt asc.
 *
 * @param {Record<string, any>} a
 * @param {Record<string, any>} any>
 * @returns {number}
 */
export function compareJobs(a: Record<string, any>, b: Record<string, any>): number {
    if (!a || !b) return 0;
    const pa = Number.isFinite(a.priority) ? a.priority : 0;
    const pb = Number.isFinite(b.priority) ? b.priority : 0;
    if (pa !== pb) return pb - pa; // higher priority first
    const ea = Number.isFinite(a.enqueuedAt) ? a.enqueuedAt : 0;
    const eb = Number.isFinite(b.enqueuedAt) ? b.enqueuedAt : 0;
    return ea - eb; // earlier enqueued first
}

/**
 * Cria fila pure-logic com FIFO+priority ordering.
 *
 * @returns {Readonly<{enqueue: (job: any) => boolean, dequeue: (filter?: any) => any, peek: () => any, remove: (jobId: any) => boolean, snapshot: () => any[], size: () => number, clear: () => void}>}
 */
export function createScheduler(): Readonly<{
    enqueue: (job: any) => boolean;
    dequeue: (filter?: any) => any;
    peek: () => any;
    remove: (jobId: any) => boolean;
    snapshot: () => any[];
    size: () => number;
    clear: () => void;
}> {
    let queue: any[] = [];

    return Object.freeze({
        /** @param {any} job */
        enqueue(job: any) {
            if (!job || typeof job !== 'object') return false;
            if (!job.id || !job.pipelineId) return false;
            // Reject duplicates
            if (queue.some((j) => j.id === job.id)) return false;
            queue.push(job);
            queue.sort(compareJobs);
            return true;
        },
        /** @param {any} [filter] */
        dequeue(filter: any) {
            // Returns first job matching filter (and removes it).
            if (queue.length === 0) return null;
            if (typeof filter === 'function') {
                const idx = queue.findIndex((j) => {
                    try {
                        return Boolean(filter(j));
                    } catch (e) {
                        const err = e as any;
                        console.debug('[scheduling:dequeue:filter]', err?.message || err);
                        return false;
                    }
                });
                if (idx === -1) return null;
                const [job] = queue.splice(idx, 1);
                return job;
            }
            return queue.shift();
        },
        peek() {
            return queue.length > 0 ? queue[0] : null;
        },
        /** @param {any} jobId */
        remove(jobId: any) {
            const idx = queue.findIndex((j) => j.id === jobId);
            if (idx === -1) return false;
            queue.splice(idx, 1);
            return true;
        },
        snapshot() {
            return queue.map((j) => ({ ...j }));
        },
        size() {
            return queue.length;
        },
        clear() {
            queue = [];
        },
    });
}

/**
 * Topological sort via Kahn's algorithm.
 *
 * @param {Array<Record<string, any>>} jobs
 * @returns {{order: Array<any>, hasCycle: boolean, cycleNodes?: Array<any>}}
 */
export function topologicalSort(
    jobs: Array<Record<string, any>>,
): { order: Array<any>; hasCycle: boolean; cycleNodes?: Array<any> } {
    if (!Array.isArray(jobs) || jobs.length === 0) {
        return { order: [], hasCycle: false };
    }

    // Build graph
    const inDegree: Map<any, number> = new Map();
    const adjList: Map<any, any[]> = new Map();
    const idSet = new Set(jobs.map((j) => j.id));

    for (const job of jobs) {
        if (!job || !job.id) continue;
        inDegree.set(job.id, 0);
        adjList.set(job.id, []);
    }

    for (const job of jobs) {
        if (!job || !job.id || !Array.isArray(job.dependencies)) continue;
        for (const depId of job.dependencies) {
            if (!idSet.has(depId)) continue; // skip external deps
            const list = adjList.get(depId);
            if (list) list.push(job.id);
            inDegree.set(job.id, (inDegree.get(job.id) || 0) + 1);
        }
    }

    // Kahn's algorithm
    const queue: any[] = [];
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id);
    }
    queue.sort();

    const order: any[] = [];
    while (queue.length > 0) {
        const id: any = queue.shift();
        order.push(id);
        const adj: any[] = adjList.get(id) || [];
        for (const nextId of adj) {
            const newDeg = (inDegree.get(nextId) || 1) - 1;
            inDegree.set(nextId, newDeg);
            if (newDeg === 0) {
                queue.push(nextId);
                queue.sort();
            }
        }
    }

    if (order.length < idSet.size) {
        const cycleNodes = [...idSet].filter((id) => !order.includes(id));
        return { order, hasCycle: true, cycleNodes };
    }
    return { order, hasCycle: false };
}

/**
 * Resolve quais jobs estão prontos para executar agora.
 *
 * @param {Array<Record<string, any>>} jobs
 * @param {{now?: number, completedIds?: Set<string>}} [context]
 * @returns {Array<Record<string, any>>}
 */
export function findReadyJobs(
    jobs: Array<Record<string, any>>,
    context: { now?: number; completedIds?: Set<string> } = {},
): Array<Record<string, any>> {
    if (!Array.isArray(jobs)) return [];
    const now = Number.isFinite(context.now) ? (context.now as number) : Date.now();
    const completed = context.completedIds instanceof Set ? context.completedIds : new Set<string>();

    return jobs
        .filter((job) => {
            if (!job) return false;
            if (job.status !== 'pending' && job.status !== 'ready') return false;
            if (!isInWindow(job, now)) return false;
            if (!areDependenciesMet(job, completed)) return false;
            return true;
        })
        .sort(compareJobs);
}

/**
 * Stats da fila.
 *
 * @param {Array<Record<string, any>>} jobs
 * @returns {{total: number, byStatus: Record<string, number>, byPriority: Record<string, number>, oldest: number|null, newest: number|null}}
 */
export function summarizeQueue(jobs: Array<Record<string, any>>): {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    oldest: number | null;
    newest: number | null;
} {
    const empty: {
        total: number;
        byStatus: Record<string, number>;
        byPriority: Record<string, number>;
        oldest: number | null;
        newest: number | null;
    } = {
        total: 0,
        byStatus: {},
        byPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0, BACKGROUND: 0 },
        oldest: null,
        newest: null,
    };
    if (!Array.isArray(jobs) || jobs.length === 0) return empty;

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0, BACKGROUND: 0 };
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const job of jobs) {
        if (!job) continue;
        if (job.status) byStatus[job.status] = (byStatus[job.status] || 0) + 1;
        if (Number.isFinite(job.priority)) {
            const tier = priorityTier(job.priority);
            if (tier in byPriority) byPriority[tier]!++;
        }
        if (Number.isFinite(job.enqueuedAt)) {
            if (oldest === null || job.enqueuedAt < oldest) oldest = job.enqueuedAt;
            if (newest === null || job.enqueuedAt > newest) newest = job.enqueuedAt;
        }
    }
    return { total: jobs.length, byStatus, byPriority, oldest, newest };
}

/**
 * Mapeia priority numérica → tier name.
 */
function priorityTier(priority: any): string {
    if (priority >= PRIORITY_LEVELS.CRITICAL) return 'CRITICAL';
    if (priority >= PRIORITY_LEVELS.HIGH) return 'HIGH';
    if (priority >= PRIORITY_LEVELS.NORMAL) return 'NORMAL';
    if (priority >= PRIORITY_LEVELS.LOW) return 'LOW';
    return 'BACKGROUND';
}

/**
 * Module identity export.
 */
export const pipelineSchedulingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 15,
    deliveredAt: '2026-05-01',
    priorities: PRIORITY_LEVELS,
    exports: [
        'PRIORITY_LEVELS',
        'JOB_STATUS',
        'SCHEDULING_META',
        'createJob',
        'isInWindow',
        'areDependenciesMet',
        'compareJobs',
        'createScheduler',
        'topologicalSort',
        'findReadyJobs',
        'summarizeQueue',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
