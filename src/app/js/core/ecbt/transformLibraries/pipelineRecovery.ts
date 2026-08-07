// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Recovery (Phase 23)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S23
 *
 * Phase 23 (2026-05-01) - pure-logic checkpoint/resume engine para
 * pipelines longos. Permite serializar estado intermediário e retomar
 * execução do último step bem-sucedido após falha.
 *
 * Estratégia:
 *   - Checkpoint: { stepIndex, stepId, state, timestamp, hash }
 *   - CheckpointStore: append-only com find-latest API
 *   - Recovery plan: skip steps já completados, resume de stepIndex+1
 *   - Hash do state para detectar tampering
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Recovery strategies canônicas. */
export const RECOVERY_STRATEGIES = Object.freeze(['resume', 'restart', 'rollback', 'skip-failed']);

/** Checkpoint phases. */
export const CHECKPOINT_PHASES = Object.freeze(['pre-step', 'post-step', 'on-error', 'final']);

/** Identidade do módulo. */
export const RECOVERY_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 23,
    deliveredAt: '2026-05-01',
    strategies: RECOVERY_STRATEGIES,
    phases: CHECKPOINT_PHASES,
});

/**
 * Hash determinístico do state (FNV-1a 32-bit).
 */
import { fnv1aHashHex as _fnv1aHashHex } from '../../../utils/helpers/hashFnv1a.js';
import { deepClone } from '../../../utils/helpers/deepClone.js';
export function hashState( state: any) {
    const json = state == null ? '' : JSON.stringify(state);
    return _fnv1aHashHex(json, 8);
}

/**
 * Cria checkpoint frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createCheckpoint(spec: Record<string, any>): Object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createCheckpoint: spec required');
    }
    if (typeof spec.pipelineId !== 'string' || !spec.pipelineId.trim()) {
        throw new TypeError('createCheckpoint: pipelineId required');
    }
    if (!Number.isInteger(spec.stepIndex) || spec.stepIndex < 0) {
        throw new TypeError('createCheckpoint: stepIndex must be non-negative integer');
    }
    if (!CHECKPOINT_PHASES.includes(spec.phase)) {
        throw new TypeError(`createCheckpoint: phase must be one of ${CHECKPOINT_PHASES.join(',')}`);
    }
    const stateHash = hashState(spec.state);
    return Object.freeze({
        id: spec.id || `${spec.pipelineId}:${spec.stepIndex}:${stateHash}`,
        pipelineId: spec.pipelineId,
        stepIndex: spec.stepIndex,
        stepId: spec.stepId || null,
        phase: spec.phase,
        state: spec.state == null ? null : deepClone(spec.state),
        stateHash,
        timestamp: Number.isFinite(spec.timestamp) ? spec.timestamp : Date.now(),
        runId: spec.runId || null,
    });
}

/**
 * Cria checkpoint store (append-only com FIFO eviction).
 *
 * @param {Object} [options]
 * @param {number} [options.capacity=200]
 * @returns {Readonly<{add: (cp: any) => boolean, getLatest: (pipelineId: any, runId?: any) => any, getByPipeline: (pipelineId: any) => any[], getByRun: (runId: any) => any[], snapshot: () => any[], count: () => number, clear: () => void, capacity: number}>}
 */
export function createCheckpointStore(options: { capacity?: number } = {}): Readonly<{add: (cp: any) => boolean, getLatest: (pipelineId: any, runId?: any) => any, getByPipeline: (pipelineId: any) => any[], getByRun: (runId: any) => any[], snapshot: () => any[], count: () => number, clear: () => void, capacity: number}> {
    const capacity = Number.isInteger(options.capacity) && (options.capacity as number) > 0 ? (options.capacity as number) : 200;
        let checkpoints: any[]= [];

    return Object.freeze({
        add( checkpoint: any) {
            if (!checkpoint || typeof checkpoint !== 'object') return false;
            if (!checkpoint.pipelineId || !Number.isInteger(checkpoint.stepIndex)) return false;
            checkpoints.push(checkpoint);
            if (checkpoints.length > capacity) {
                checkpoints = checkpoints.slice(-capacity);
            }
            return true;
        },
        getLatest( pipelineId: any, runId: any) {
            const filtered = checkpoints
                .filter((c) => c && c.pipelineId === pipelineId && (!runId || c.runId === runId))
                .sort((a, b) => b.stepIndex - a.stepIndex || (b.timestamp || 0) - (a.timestamp || 0));
            return filtered.length > 0 ? filtered[0] : null;
        },
        getByPipeline( pipelineId: any) {
            return checkpoints.filter((c) => c && c.pipelineId === pipelineId);
        },
        getByRun( runId: any) {
            if (!runId) return [];
            return checkpoints.filter((c) => c && c.runId === runId);
        },
        snapshot() {
            return [...checkpoints];
        },
        count() {
            return checkpoints.length;
        },
        clear() {
            checkpoints = [];
        },
        capacity,
    });
}

/**
 * Verifica integridade do checkpoint via hash recompute.
 *
 * @param {Record<string, any>} checkpoint
 * @returns {boolean}
 */
export function verifyCheckpoint(checkpoint: Record<string, any>): boolean {
    if (!checkpoint || typeof checkpoint !== 'object') return false;
    const expected = checkpoint.stateHash;
    if (typeof expected !== 'string') return false;
    const actual = hashState(checkpoint.state);
    return expected === actual;
}

/**
 * Constrói plano de recovery a partir de pipeline + último checkpoint.
 *
 * @param {Array<Object>} pipeline - original steps
 * @param {Record<string, any>|null} latestCheckpoint
 * @param {string} [strategy='resume']
 * @returns {Readonly<{strategy: string, skipCount: number, remainingSteps: ReadonlyArray<any>, resumeFrom: number}>}
 */
export function buildRecoveryPlan(pipeline: Array<Object>, latestCheckpoint: Record<string, any>|null, strategy: string = 'resume'): Readonly<{strategy: string, skipCount: number, remainingSteps: ReadonlyArray<any>, resumeFrom: number}> {
    if (!Array.isArray(pipeline)) {
        return Object.freeze({
            strategy: 'restart',
            skipCount: 0,
            remainingSteps: [],
            resumeFrom: 0,
        });
    }
    if (!RECOVERY_STRATEGIES.includes(strategy)) strategy = 'resume';

    if (strategy === 'restart' || !latestCheckpoint) {
        return Object.freeze({
            strategy: 'restart',
            skipCount: 0,
            remainingSteps: Object.freeze([...pipeline]),
            resumeFrom: 0,
        });
    }

    if (strategy === 'rollback') {
        // Rollback to step before checkpoint
        const resumeIdx = Math.max(0, latestCheckpoint.stepIndex);
        return Object.freeze({
            strategy: 'rollback',
            skipCount: resumeIdx,
            remainingSteps: Object.freeze([...pipeline.slice(resumeIdx)]),
            resumeFrom: resumeIdx,
        });
    }

    // resume / skip-failed: skip steps until checkpoint+1
    const resumeIdx = Math.min(pipeline.length, latestCheckpoint.stepIndex + 1);
    return Object.freeze({
        strategy,
        skipCount: resumeIdx,
        remainingSteps: Object.freeze([...pipeline.slice(resumeIdx)]),
        resumeFrom: resumeIdx,
    });
}

/**
 * Sumariza checkpoint store.
 */
export function summarizeStore( store: any) {
    if (!store || typeof store.snapshot !== 'function') {
        return { total: 0, byPipeline: {}, byPhase: {} };
    }
    const all = store.snapshot();
        const byPipeline: Record<string, number>= {};
        const byPhase: Record<string, number>= {};
    for (const c of all) {
        if (!c) continue;
        if (c.pipelineId) byPipeline[c.pipelineId] = (byPipeline[c.pipelineId] || 0) + 1;
        if (c.phase) byPhase[c.phase] = (byPhase[c.phase] || 0) + 1;
    }
    return Object.freeze({ total: all.length, byPipeline, byPhase });
}

/**
 * Module identity export.
 */
export const pipelineRecoveryMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 23,
    deliveredAt: '2026-05-01',
    strategies: RECOVERY_STRATEGIES,
    phases: CHECKPOINT_PHASES,
    exports: [
        'RECOVERY_STRATEGIES',
        'CHECKPOINT_PHASES',
        'RECOVERY_META',
        'hashState',
        'createCheckpoint',
        'createCheckpointStore',
        'verifyCheckpoint',
        'buildRecoveryPlan',
        'summarizeStore',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
