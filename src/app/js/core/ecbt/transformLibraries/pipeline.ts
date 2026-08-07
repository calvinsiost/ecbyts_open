// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline + Serializer (Phase 3)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S3
 *
 * Phase 3 (2026-04-30) - Pipeline composição + serialize/deserialize.
 * Construído sobre engine.js (Phase 1) + registry.js (Phase 2).
 *
 * Diferente de `composeTransforms` (engine.js), `Pipeline` é objeto
 * stateful com:
 *   - Lista ordenada de stepConfigs `{libraryId, config}`
 *   - Telemetria por step (durações, hits)
 *   - AbortController para cancelamento mid-flight
 *   - Progress callback `(libraryId, index, total) => void`
 *   - Serialização para snapshot persistível
 *
 * Phase 4 (separada): UI panel + CLI batch + diff viewer.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { applyTransform } from './engine.js';
import { getLibrary } from './registry.js';
import { TransformErrorCodes, TransformOutcomes } from './types.js';

const SERIALIZER_VERSION = 1;

/**
 * @typedef {{ libraryId: string, config?: Record<string, any> }} PipelineStepConfig
 * @typedef {{ onProgress?: (libraryId: string, index: number, total: number) => void, signal?: AbortSignal | null }} PipelineOptions
 * @typedef {{ audits: Array<any>, errors: Array<any>, durationMs: number, completedAt: number }} PipelineLastRun
 */

/**
 * Cria pipeline a partir de lista de step configs.
 *
 * @param {Array<PipelineStepConfig>} stepConfigs
 * @param {PipelineOptions} [options]
 * @returns {Pipeline}
 */
export function createPipeline(stepConfigs: any[] = [], options: any = {}) {
    if (!Array.isArray(stepConfigs)) {
        throw new TypeError('stepConfigs must be an array');
    }
    return new Pipeline(stepConfigs, options);
}

/**
 * Pipeline class - stateful container para composição de transforms.
 */
export class Pipeline {
    lastRun: any;
    onProgress: any;
    signal: any;
    stepConfigs: any;
    /**
     * @param {Array<PipelineStepConfig>} stepConfigs
     * @param {PipelineOptions} [options]
     */
    constructor(stepConfigs: any[] = [], options: any = {}) {
        /** @type {Array<PipelineStepConfig>} */
        this.stepConfigs = stepConfigs.map((step) => ({
            libraryId: String(step.libraryId || ''),
            config: step.config ? { ...step.config } : {},
        }));
        /** @type {PipelineOptions['onProgress'] | null} */
        this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        /** @type {AbortSignal | null} */
        this.signal = options.signal || null;
        /** @type {PipelineLastRun | null} */
        this.lastRun = null; // { audits, errors, durationMs, completedAt }
    }

    /**
     * Executa pipeline contra modelo. Resolve com `{ model, audits, errors }`.
     * Para pipelines async (mistura de pure/async), retorna Promise sempre.
     *
     * @param {Record<string, any>} model
     * @returns {Promise<{model: Record<string, any>, audits: Array<any>, errors: Array<any>, telemetry: Record<string, any>}>}
     */
    async run(model: any) {
        const startedAt = Date.now();
        const audits = [];
        const errors = [];
        let currentModel = model;
        const total = this.stepConfigs.length;

        for (let i = 0; i < total; i++) {
            // Check abort
            if (this.signal?.aborted) {
                errors.push({
                    code: 'ABORTED',
                    message: 'pipeline aborted by signal',
                    details: { stoppedAt: i },
                });
                break;
            }

            const step = this.stepConfigs[i];
            const library = getLibrary(step.libraryId);

            // Progress callback (notifica antes de executar - mostra próximo step)
            if (this.onProgress) {
                try {
                    this.onProgress(step.libraryId, i, total);
                } catch (e) {
                    const message = e instanceof Error ? e.message : e;
                    console.debug('[pipeline] onProgress:', message);
                    // Don't let progress callback break pipeline
                }
            }

            if (!library) {
                // Library missing → registra erro como warning, skipa, continua
                audits.push({
                    libraryId: step.libraryId,
                    libraryVersion: '0.0.0',
                    startedAt: Date.now(),
                    finishedAt: Date.now(),
                    durationMs: 0,
                    outcome: TransformOutcomes.SKIPPED,
                    diff: null,
                    config: step.config,
                });
                errors.push({
                    code: TransformErrorCodes.UNKNOWN_LIBRARY,
                    message: `library not registered: ${step.libraryId}`,
                    details: { stepIndex: i },
                });
                continue;
            }

            // Execute via engine
            const result = await Promise.resolve(applyTransform(currentModel, library, step.config));
            audits.push(result.audit);
            if (result.errors.length > 0) {
                errors.push(...result.errors);
                // Phase 3 default: stop on first error (consistente com engine.composeTransforms).
                // Phase 4: política configurável.
                break;
            }
            currentModel = result.model;
        }

        const completedAt = Date.now();
        const durationMs = completedAt - startedAt;
        const telemetry = {
            startedAt,
            completedAt,
            durationMs,
            stepsTotal: total,
            stepsExecuted: audits.length,
            successCount: audits.filter((a) => a.outcome === TransformOutcomes.SUCCESS).length,
            failedCount: audits.filter((a) => a.outcome === TransformOutcomes.FAILED).length,
            skippedCount: audits.filter((a) => a.outcome === TransformOutcomes.SKIPPED).length,
        };

        this.lastRun = { audits, errors, durationMs, completedAt };
        return { model: currentModel, audits, errors, telemetry };
    }

    /**
     * Adiciona step ao final do pipeline (mutável).
     */
    addStep(/** @type {any} */ libraryId: any, config = {}) {
        if (typeof libraryId !== 'string' || !libraryId) {
            throw new TypeError('libraryId must be a non-empty string');
        }
        this.stepConfigs.push({ libraryId, config: { ...config } });
        return this;
    }

    /**
     * Remove step pelo index.
     */
    removeStep(/** @type {any} */ index: any) {
        if (!Number.isInteger(index) || index < 0 || index >= this.stepConfigs.length) return false;
        this.stepConfigs.splice(index, 1);
        return true;
    }

    /**
     * Reorganiza steps via novo array de indices.
     * Ex: reorder([2, 0, 1]) move step #2 para frente.
     */
    reorder(/** @type {any} */ newOrder: any) {
        if (!Array.isArray(newOrder) || newOrder.length !== this.stepConfigs.length) {
            throw new TypeError('newOrder must be array same length as stepConfigs');
        }
        const seen = new Set();
        for (const idx of newOrder) {
            if (!Number.isInteger(idx) || idx < 0 || idx >= this.stepConfigs.length) {
                throw new RangeError(`invalid index ${idx}`);
            }
            if (seen.has(idx)) throw new RangeError(`duplicate index ${idx}`);
            seen.add(idx);
        }
        this.stepConfigs = newOrder.map((idx) => this.stepConfigs[idx]);
        return this;
    }

    /**
     * Retorna count de steps.
     */
    size() {
        return this.stepConfigs.length;
    }

    /**
     * Snapshot read-only dos steps atuais.
     */
    getSteps() {
        return this.stepConfigs.map((s: any) => ({
            libraryId: s.libraryId,
            config: { ...s.config }
        }));
    }
}

/**
 * Serializa pipeline para JSON persistível (snapshot ECBT).
 *
 * @param {Pipeline} pipeline
 * @param {Object} [meta] - metadata adicional (autor, descrição, etc)
 * @returns {Object} JSON-serializable
 */
export function serializePipeline(pipeline: any, meta = {}) {
    if (!(pipeline instanceof Pipeline)) {
        throw new TypeError('pipeline must be a Pipeline instance');
    }
    return {
        version: SERIALIZER_VERSION,
        kind: 'ecbt-transform-pipeline',
        steps: pipeline.getSteps(),
        meta: {
            createdAt: new Date().toISOString(),
            ...meta,
        },
    };
}

/**
 * Deserializa JSON em Pipeline.
 * Tolerante a missing libraries (marcadas como SKIPPED no run() futuro).
 *
 * @param {Record<string, any>} json
 * @param {PipelineOptions} [options] - passa para createPipeline
 * @returns {{ pipeline: Pipeline, warnings: Array<string> }}
 */
export function deserializePipeline(json: any, options = {}) {
    const warnings = [];

    if (!json || typeof json !== 'object') {
        throw new TypeError('json must be a plain object');
    }
    if (json.kind !== 'ecbt-transform-pipeline') {
        throw new Error(`unexpected kind: ${json.kind}`);
    }
    if (json.version !== SERIALIZER_VERSION) {
        warnings.push(`version mismatch: expected ${SERIALIZER_VERSION}, got ${json.version}`);
    }
    if (!Array.isArray(json.steps)) {
        throw new TypeError('json.steps must be an array');
    }

    const validSteps: any[] = [];
    for (const step of json.steps) {
        if (!step || typeof step !== 'object') {
            warnings.push('skipping non-object step');
            continue;
        }
        if (typeof step.libraryId !== 'string' || !step.libraryId) {
            warnings.push('skipping step without libraryId');
            continue;
        }
        // Phase 3 não falha se library não existe - registra warning + mantém step
        // (run() vai marcar como SKIPPED quando executar)
        if (!getLibrary(step.libraryId)) {
            warnings.push(`library not in registry (will be SKIPPED): ${step.libraryId}`);
        }
        validSteps.push({
            libraryId: step.libraryId,
            config: step.config && typeof step.config === 'object' ? step.config : {},
        });
    }

    const pipeline = createPipeline(validSteps, options);
    return { pipeline, warnings };
}

/**
 * Module identity export.
 */
export const ecbtPipelineMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: 3,
    deliveredAt: '2026-04-30',
    exports: ['createPipeline', 'Pipeline', 'serializePipeline', 'deserializePipeline'],
    serializerVersion: SERIALIZER_VERSION,
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
};
