// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Coordination (Phase 26)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S26
 *
 * Phase 26 (2026-05-01) - pure-logic distributed pipeline coordination
 * primitives: leader election, work distribution, heartbeat tracking.
 *
 * Estratégia:
 *   - WorkerRegistry: tracking de workers ativos com heartbeats
 *   - Leader election: lowest-id alive (deterministic)
 *   - Work distribution: shard pipeline entre N workers
 *   - Heartbeat timeout: marca worker como dead se sem heartbeat por X ms
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Worker statuses canônicos. */
export const WORKER_STATUSES = Object.freeze(['alive', 'idle', 'busy', 'dead']);

/** Default heartbeat timeout (30s). */
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30000;

/** Identidade do módulo. */
export const COORDINATION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 26,
    deliveredAt: '2026-05-01',
    statuses: WORKER_STATUSES,
    defaultTimeoutMs: DEFAULT_HEARTBEAT_TIMEOUT_MS,
});

/**
 * Cria worker frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createWorker(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createWorker: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createWorker: id required');
    }
    return Object.freeze({
        id: spec.id,
        status: WORKER_STATUSES.includes(spec.status) ? spec.status : 'alive',
        lastHeartbeat: Number.isFinite(spec.lastHeartbeat) ? spec.lastHeartbeat : Date.now(),
        capabilities: Array.isArray(spec.capabilities) ? Object.freeze([...spec.capabilities]) : Object.freeze([]),
        metadata: spec.metadata ? Object.freeze({ ...spec.metadata }) : null,
    });
}

/**
 * Cria worker registry.
 *
 * @param {Object} [options]
 * @param {number} [options.heartbeatTimeoutMs=30000]
 * @returns {{register: any, heartbeat: any, markStatus: any, getAlive: any, getDead: any, getLeader: any, all: any, remove: any, clear: any, count: any}}
 */
export function createWorkerRegistry(options: { heartbeatTimeoutMs?: number } = {}): {register: any, heartbeat: any, markStatus: any, getAlive: any, getDead: any, getLeader: any, all: any, remove: any, clear: any, count: any} {
    const timeoutMs: number = Number.isFinite(options.heartbeatTimeoutMs)
        ? (options.heartbeatTimeoutMs as number)
        : DEFAULT_HEARTBEAT_TIMEOUT_MS;
    const workers = new Map();

    return Object.freeze({
        register( worker: any) {
            if (!worker || !worker.id) return false;
            workers.set(worker.id, worker);
            return true;
        },
        heartbeat( workerId: any,  now: any) {
            const w = workers.get(workerId);
            if (!w) return false;
            const _now = Number.isFinite(now) ? now : Date.now();
            workers.set(workerId, Object.freeze({ ...w, lastHeartbeat: _now }));
            return true;
        },
        markStatus( workerId: any,  status: any) {
            if (!WORKER_STATUSES.includes(status)) return false;
            const w = workers.get(workerId);
            if (!w) return false;
            workers.set(workerId, Object.freeze({ ...w, status }));
            return true;
        },
        getAlive( now: any) {
            const _now = Number.isFinite(now) ? now : Date.now();
            return [...workers.values()].filter(
                (w) =>
                    w && w.status !== 'dead' && Number.isFinite(w.lastHeartbeat) && _now - w.lastHeartbeat < timeoutMs,
            );
        },
        getDead( now: any) {
            const _now = Number.isFinite(now) ? now : Date.now();
            return [...workers.values()].filter(
                (w) =>
                    w &&
                    (w.status === 'dead' || !Number.isFinite(w.lastHeartbeat) || _now - w.lastHeartbeat >= timeoutMs),
            );
        },
        getLeader( now: any) {
            const alive = this.getAlive(now);
            if (alive.length === 0) return null;
            // Sort by id (deterministic), pick first
            return alive.sort((a, b) => a.id.localeCompare(b.id))[0];
        },
        all() {
            return [...workers.values()];
        },
        remove( workerId: any) {
            return workers.delete(workerId);
        },
        clear() {
            workers.clear();
        },
        count() {
            return workers.size;
        },
        timeoutMs,
    });
}

/**
 * Distribui pipeline steps entre N workers (round-robin).
 *
 * @param {any[]} pipeline
 * @param {any[]} workers
 * @returns {any}
 */
export function distributeWork(pipeline: any[], workers: any[]): any {
    const empty: Record<string, any> = {};
    if (!Array.isArray(pipeline) || !Array.isArray(workers) || workers.length === 0) {
        return Object.freeze(empty);
    }
    const out: Record<string, any[]> = {};
    for (const w of workers) {
        if (w && w.id) out[w.id] = [];
    }
    const ids = Object.keys(out);
    if (ids.length === 0) return Object.freeze(empty);

    pipeline.forEach((step, i) => {
        const wid = ids[i % ids.length] as string;
        (out[wid] as any[]).push(step);
    });
    return Object.freeze(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.freeze(v)])));
}

/**
 * Computa load balance score (0-1; 1 = perfectly balanced).
 *
 * @param {Record<string, any[]>} distribution
 * @returns {number}
 */
export function computeBalance(distribution: Record<string, any[]>): number {
    if (!distribution || typeof distribution !== 'object') return 0;
    const counts = Object.values(distribution).map(( arr: any) => (Array.isArray(arr) ? arr.length : 0));
    if (counts.length === 0) return 0;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === 0) return 1;
    return min / max;
}

/**
 * Verifica se há quorum de workers alive (≥ N/2 + 1).
 *
 * @param {any[]} aliveWorkers
 * @param {number} totalWorkers
 * @returns {boolean}
 */
export function hasQuorum(aliveWorkers: any[], totalWorkers: number): boolean {
    if (!Array.isArray(aliveWorkers)) return false;
    if (!Number.isInteger(totalWorkers) || totalWorkers <= 0) return false;
    const required = Math.floor(totalWorkers / 2) + 1;
    return aliveWorkers.length >= required;
}

/**
 * Sumariza registry state.
 */
export function summarizeRegistry( registry: any,  now: any) {
    const empty: { total: number, alive: number, dead: number, leader: any, byStatus: Record<string, number> } = {
        total: 0,
        alive: 0,
        dead: 0,
        leader: null,
        byStatus: {},
    };
    if (!registry || typeof registry.all !== 'function') return empty;
    const all = registry.all();
    const _now = Number.isFinite(now) ? now : Date.now();
    const alive = registry.getAlive(_now);
    const dead = registry.getDead(_now);
    const leader = registry.getLeader(_now);
    const byStatus: Record<string, number> = {};
    for (const w of all) {
        if (!w || !w.status) continue;
        byStatus[w.status] = (byStatus[w.status] || 0) + 1;
    }
    return Object.freeze({
        total: all.length,
        alive: alive.length,
        dead: dead.length,
        leader: leader ? leader.id : null,
        byStatus,
    });
}

/**
 * Module identity export.
 */
export const pipelineCoordinationMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 26,
    deliveredAt: '2026-05-01',
    statuses: WORKER_STATUSES,
    exports: [
        'WORKER_STATUSES',
        'COORDINATION_META',
        'createWorker',
        'createWorkerRegistry',
        'distributeWork',
        'computeBalance',
        'hasQuorum',
        'summarizeRegistry',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
