// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Snapshots (Phase 18)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S18
 *
 * Phase 18 (2026-05-01) - pure-logic engine de snapshots de pipeline.
 * Captura state point-in-time, computa diff entre snapshots, restaura
 * versões anteriores, mantém ring buffer de N versões com sentinela.
 *
 * Estratégia:
 *   - Snapshot frozen com {version, timestamp, pipeline, metadata, hash}
 *   - Ring buffer: capacity N, FIFO eviction
 *   - Diff: compara dois snapshots (added/removed/changed steps)
 *   - Restore: retorna snapshot pelo version (ou latest)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface SnapshotStore {
    add: (snap: any) => boolean;
    get: (version: any) => any;
    getLatest: () => any;
    getAll: () => any[];
    count: () => number;
    clear: () => void;
    capacity: number;
    sortedVersions: () => any[];
}

/** Identidade do módulo. */
export const SNAPSHOTS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 18,
    deliveredAt: '2026-05-01',
});

/** Default capacity para ring buffer. */
const DEFAULT_CAPACITY = 50;

/**
 * Hash determinístico simplificado de pipeline (FNV-1a 32-bit).
 *
 * @param {Object} any>
 * @returns {string} hex
 */
import { fnv1aHashHex as _fnv1aHashHex } from '../../../utils/helpers/hashFnv1a.js';
import { deepClone } from '../../../utils/helpers/deepClone.js';
export function hashPipeline(pipeline: object): string {
    const json = pipeline ? JSON.stringify(pipeline) : '';
    return _fnv1aHashHex(json, 8);
}

/**
 * Cria snapshot frozen.
 *
 * @param {Record<string, any>} any>
 * @returns {Object}
 */
export function createSnapshot(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createSnapshot: spec required');
    }
    if (typeof spec.pipelineId !== 'string' || !spec.pipelineId.trim()) {
        throw new TypeError('createSnapshot: pipelineId required');
    }
    const pipeline = spec.pipeline || null;
    const hash = spec.hash || hashPipeline(pipeline);
    return Object.freeze({
        id: spec.id || `${spec.pipelineId}:v${spec.version || 1}:${hash}`,
        pipelineId: spec.pipelineId,
        version: Number.isInteger(spec.version) && spec.version > 0 ? spec.version : 1,
        timestamp: Number.isFinite(spec.timestamp) ? spec.timestamp : Date.now(),
        pipeline: pipeline ? Object.freeze(deepClone(pipeline)) : null,
        hash,
        actorId: spec.actorId || null,
        message: spec.message || '',
        metadata: spec.metadata ? Object.freeze({ ...spec.metadata }) : null,
    });
}

/**
 * Cria snapshot store (ring buffer).
 *
 * @param {{ capacity?: number }} [options]
 * @returns {any}
 */
export function createSnapshotStore(options: { capacity?: number } = {}): SnapshotStore {
    const rawCap = (options as any).capacity;
    const capacity = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : DEFAULT_CAPACITY;
    let snapshots: any[] = [];

    return Object.freeze({
        add(snap: any) {
            if (!snap || typeof snap !== 'object') return false;
            if (!snap.pipelineId || !Number.isInteger(snap.version)) return false;
            // Reject duplicates by version
            if (snapshots.some((s) => s.version === snap.version)) return false;
            snapshots.push(snap);
            // Sort ascending by version
            snapshots.sort((a, b) => a.version - b.version);
            // Evict oldest (lowest version) if over capacity
            if (snapshots.length > capacity) {
                snapshots = snapshots.slice(-capacity);
            }
            return true;
        },
        get(version: any) {
            return snapshots.find((s) => s.version === version) || null;
        },
        getLatest() {
            return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
        },
        getAll() {
            return [...snapshots];
        },
        count() {
            return snapshots.length;
        },
        clear() {
            snapshots = [];
        },
        capacity,
        sortedVersions() {
            return snapshots.map((s) => s.version);
        },
    });
}

/**
 * Indexa steps de pipeline por id (ou índice se sem id).
 *
 * @param {Record<string, any> | null | undefined} pipeline
 * @returns {Map<string, { step: any, index: number }>}
 */
function indexSteps(
    pipeline: Record<string, any> | null | undefined,
): Map<string, { step: any; index: number }> {
    const map = new Map<string, { step: any; index: number }>();
    if (!pipeline || !Array.isArray(pipeline.steps)) return map;
    for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        if (!step) continue;
        const key = step.id || `__idx_${i}`;
        map.set(key, { step, index: i });
    }
    return map;
}

/**
 * Compara dois snapshots e retorna diff de steps.
 *
 * @param {Record<string, any> | null | undefined} oldSnap
 * @param {Record<string, any> | null | undefined} any>
 * @returns {any}
 */
export function diffSnapshots(
    oldSnap: Record<string, any> | null | undefined,
    newSnap: Record<string, any> | null | undefined,
): any {
    const empty = { added: [], removed: [], changed: [], unchanged: [] };
    if (!oldSnap || !newSnap) return Object.freeze(empty);

    const oldIdx = indexSteps(oldSnap.pipeline);
    const newIdx = indexSteps(newSnap.pipeline);

    const added: any[] = [];
    const removed: any[] = [];
    const changed: any[] = [];
    const unchanged: any[] = [];

    for (const [key, entry] of newIdx.entries()) {
        if (!oldIdx.has(key)) {
            added.push({ id: key, step: entry.step, index: entry.index });
        } else {
            const oldEntry = oldIdx.get(key) as { step: any; index: number };
            const oldJson = JSON.stringify(oldEntry.step);
            const newJson = JSON.stringify(entry.step);
            if (oldJson !== newJson) {
                changed.push({ id: key, oldStep: oldEntry.step, newStep: entry.step });
            } else {
                unchanged.push({ id: key, step: entry.step });
            }
        }
    }
    for (const [key, entry] of oldIdx.entries()) {
        if (!newIdx.has(key)) {
            removed.push({ id: key, step: entry.step, index: entry.index });
        }
    }

    return Object.freeze({
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        changed: Object.freeze(changed),
        unchanged: Object.freeze(unchanged),
    });
}

/**
 * Sumariza diff em counts.
 *
 * @param {Record<string, any> | null | undefined} diff
 * @returns {any}
 */
export function summarizeDiff(diff: Record<string, any> | null | undefined): any {
    if (!diff) return { addedCount: 0, removedCount: 0, changedCount: 0, unchangedCount: 0, total: 0 };
    const addedCount = Array.isArray(diff.added) ? diff.added.length : 0;
    const removedCount = Array.isArray(diff.removed) ? diff.removed.length : 0;
    const changedCount = Array.isArray(diff.changed) ? diff.changed.length : 0;
    const unchangedCount = Array.isArray(diff.unchanged) ? diff.unchanged.length : 0;
    return Object.freeze({
        addedCount,
        removedCount,
        changedCount,
        unchangedCount,
        total: addedCount + removedCount + changedCount + unchangedCount,
    });
}

/**
 * Verifica se dois snapshots são idênticos por hash.
 *
 * @param {Record<string, any>} a
 * @param {Record<string, any>} any>
 * @returns {boolean}
 */
export function areEqual(a: Record<string, any>, b: Record<string, any>): boolean {
    if (!a || !b) return false;
    if (a.hash && b.hash) return a.hash === b.hash;
    return hashPipeline(a.pipeline) === hashPipeline(b.pipeline);
}

/**
 * Filtra snapshots por janela temporal.
 *
 * @param {Array<any>} snapshots
 * @param {number} fromMs
 * @param {number} toMs
 * @returns {Array<any>}
 */
export function filterByTimeRange(snapshots: any[], fromMs: number, toMs: number): any[] {
    if (!Array.isArray(snapshots)) return [];
    const _from = Number.isFinite(fromMs) ? fromMs : -Infinity;
    const _to = Number.isFinite(toMs) ? toMs : Infinity;
    return snapshots.filter((s: any) => {
        if (!s || !Number.isFinite(s.timestamp)) return false;
        return s.timestamp >= _from && s.timestamp <= _to;
    });
}

/**
 * Constrói lista de mudanças entre N snapshots adjacentes.
 *
 * @param {Array<any>} snapshots - sorted ascending
 * @returns {any}
 */
export function buildChangeLog(snapshots: any[]): any {
    if (!Array.isArray(snapshots) || snapshots.length < 2) return [];
    const sorted = [...snapshots].sort((a: any, b: any) => a.version - b.version);
    const log: any[] = [];
    for (let i = 1; i < sorted.length; i++) {
        log.push(
            Object.freeze({
                from: sorted[i - 1].version,
                to: sorted[i].version,
                diff: diffSnapshots(sorted[i - 1], sorted[i]),
            }),
        );
    }
    return Object.freeze(log);
}

/**
 * Module identity export.
 */
export const pipelineSnapshotsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 18,
    deliveredAt: '2026-05-01',
    exports: [
        'SNAPSHOTS_META',
        'hashPipeline',
        'createSnapshot',
        'createSnapshotStore',
        'diffSnapshots',
        'summarizeDiff',
        'areEqual',
        'filterByTimeRange',
        'buildChangeLog',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
