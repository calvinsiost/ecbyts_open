// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Checkpoint - Phase 46 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S46
 *
 * Phase 46 (2026-05-02) - pure-logic checkpoint store para pipeline
 * resumability. Suporta save/restore por (pipelineId, stepId), com
 * auto-evict por capacity e idade.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase/IndexedDB.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    capacity: 50,
    maxAgeMs: 24 * 60 * 60 * 1000, // 24h
});

/** Identidade do módulo. */
export const CHECKPOINT_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 46,
    deliveredAt: '2026-05-02',
});

/**
 * Cria store frozen.
 */
export function createStore(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return Object.freeze({
        capacity: Number.isInteger(cfg.capacity) && cfg.capacity > 0 ? cfg.capacity : DEFAULT_CONFIG.capacity,
        maxAgeMs: Number.isFinite(cfg.maxAgeMs) && cfg.maxAgeMs >= 0 ? cfg.maxAgeMs : DEFAULT_CONFIG.maxAgeMs,
        entries: Object.freeze([]), // [{key, pipelineId, stepId, snapshot, savedAt}]
        stats: Object.freeze({ saves: 0, restores: 0, evictions: 0 }),
    });
}

function buildKey(pipelineId: any, stepId: any) {
    return `${pipelineId}::${stepId}`;
}

/**
 * Salva checkpoint. Sobrescreve por (pipelineId, stepId).
 */
export function saveCheckpoint(store: any, spec: any, now: any) {
    if (!store || !spec || typeof spec !== 'object') return store;
    if (typeof spec.pipelineId !== 'string' || !spec.pipelineId.trim()) return store;
    if (typeof spec.stepId !== 'string' || !spec.stepId.trim()) return store;
    if (!Number.isFinite(now)) now = Date.now();
    const key = buildKey(spec.pipelineId, spec.stepId);
    let entries = store.entries.filter((e: any) => e.key !== key);
    let evictions = store.stats.evictions;
    while (entries.length >= store.capacity) {
        // Evict oldest savedAt
        let oldestIdx = 0;
        for (let i = 1; i < entries.length; i++) {
            if (entries[i].savedAt < entries[oldestIdx].savedAt) oldestIdx = i;
        }
        entries = entries.filter((_: any, i: any) => i !== oldestIdx);
        evictions++;
    }
    entries.push(
        Object.freeze({
            key,
            pipelineId: spec.pipelineId,
            stepId: spec.stepId,
            snapshot: spec.snapshot,
            savedAt: now,
        }),
    );
    return Object.freeze({
        ...store,
        entries: Object.freeze(entries),
        stats: Object.freeze({
            ...store.stats,
            saves: store.stats.saves + 1,
            evictions,
        }),
    });
}

/**
 * Restaura checkpoint por (pipelineId, stepId).
 * @returns {{store: any, snapshot: any, hit: boolean}}
 */
export function restoreCheckpoint(
    store: any,
    pipelineId: any,
    stepId: any,
    now: any,
) {
    if (!store || typeof pipelineId !== 'string' || typeof stepId !== 'string') {
        return { store, snapshot: null, hit: false };
    }
    if (!Number.isFinite(now)) now = Date.now();
    const key = buildKey(pipelineId, stepId);
    const entry = store.entries.find((e: any) => e.key === key);
    if (!entry) {
        return Object.freeze({ store, snapshot: null, hit: false });
    }
    if (store.maxAgeMs > 0 && now - entry.savedAt > store.maxAgeMs) {
        // Expired: drop and miss
        return Object.freeze({
            store: Object.freeze({
                ...store,
                entries: Object.freeze(store.entries.filter((e: any) => e.key !== key)),
            }),
            snapshot: null,
            hit: false,
        });
    }
    return Object.freeze({
        store: Object.freeze({
            ...store,
            stats: Object.freeze({ ...store.stats, restores: store.stats.restores + 1 }),
        }),
        snapshot: entry.snapshot,
        hit: true,
    });
}

/**
 * Lista checkpoints de um pipeline.
 */
export function listCheckpoints(store: any, pipelineId: any) {
    if (!store || typeof pipelineId !== 'string') return Object.freeze([]);
    return Object.freeze(store.entries.filter((e: any) => e.pipelineId === pipelineId));
}

/**
 * Remove checkpoints de um pipeline.
 */
export function clearPipeline(store: any, pipelineId: any) {
    if (!store || typeof pipelineId !== 'string') return store;
    return Object.freeze({
        ...store,
        entries: Object.freeze(store.entries.filter((e: any) => e.pipelineId !== pipelineId)),
    });
}

/**
 * Remove entries expiradas.
 */
export function pruneExpired(store: any, now: any) {
    if (!store) return store;
    if (!Number.isFinite(now)) now = Date.now();
    if (store.maxAgeMs <= 0) return store;
    const valid = store.entries.filter((e: any) => now - e.savedAt <= store.maxAgeMs);
    if (valid.length === store.entries.length) return store;
    return Object.freeze({
        ...store,
        entries: Object.freeze(valid),
    });
}

/**
 * Sumariza state.
 */
export function summarizeStore(store: any) {
    const empty = { size: 0, capacity: 0, saves: 0, restores: 0, evictions: 0 };
    if (!store) return empty;
    return Object.freeze({
        size: store.entries.length,
        capacity: store.capacity,
        saves: store.stats?.saves || 0,
        restores: store.stats?.restores || 0,
        evictions: store.stats?.evictions || 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineCheckpointMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 46,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'CHECKPOINT_META',
        'createStore',
        'saveCheckpoint',
        'restoreCheckpoint',
        'listCheckpoints',
        'clearPipeline',
        'pruneExpired',
        'summarizeStore',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
