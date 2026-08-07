// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Replay (Phase 19)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S19
 *
 * Phase 19 (2026-05-01) - pure-logic engine de replay de pipelines.
 * Reproduz execução determinística a partir de snapshot + event log,
 * suporta dry-run, step-by-step debugging, breakpoint matching.
 *
 * Estratégia:
 *   - Event log: lista frozen de eventos (step.start/end/error/output)
 *   - ReplayEngine: itera eventos com hooks (onStep, onError, onComplete)
 *   - Determinismo: mesmo log + mesmo input = mesmo output (caller ensure)
 *   - Breakpoint match: pause em step específico
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface ReplayEvent {
    type: string;
    stepId: string | null;
    stepIndex: number | null;
    timestamp: number;
    payload: any;
    errorMessage: string | null;
}

interface StepDuration {
    stepId: string;
    durationMs: number;
}

interface ReplayEngineOptions {
    onEvent?: (event: any, state: any) => void;
    breakpoint?: string;
}

interface ReplayEngine {
    step: () => any | null;
    runAll: () => any[];
    isComplete: () => boolean;
    status: () => string;
    currentIndex: () => number;
    reset: () => void;
}

interface EventLogSummary {
    total: number;
    byType: Record<string, number>;
    stepCount: number;
    totalDuration: number;
    hasErrors: boolean;
}

interface ReplayStateSnapshot {
    errorMessage: string | null;
    index: number;
}

/** Event types canônicos. */
export const EVENT_TYPES = Object.freeze([
    'step.start',
    'step.end',
    'step.error',
    'step.output',
    'pipeline.start',
    'pipeline.end',
    'pipeline.cancel',
]);

/** Replay status canônicos. */
export const REPLAY_STATUS = Object.freeze(['idle', 'running', 'paused', 'completed', 'failed', 'cancelled']);

/** Identidade do módulo. */
export const REPLAY_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 19,
    deliveredAt: '2026-05-01',
    eventTypes: EVENT_TYPES,
    statuses: REPLAY_STATUS,
});

/** Status finais que impedem novos passos. */
function isTerminalStatus(status: string): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/**
 * Cria evento frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {ReplayEvent}
 */
export function createEvent(spec: Record<string, any>): ReplayEvent {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createEvent: spec required');
    }
    if (!(EVENT_TYPES as readonly string[]).includes(spec.type)) {
        throw new TypeError(`createEvent: type must be one of ${EVENT_TYPES.join(',')}`);
    }
    return Object.freeze({
        type: spec.type,
        stepId: spec.stepId || null,
        stepIndex: Number.isInteger(spec.stepIndex) ? spec.stepIndex : null,
        timestamp: Number.isFinite(spec.timestamp) ? spec.timestamp : Date.now(),
        payload: spec.payload != null ? spec.payload : null,
        errorMessage: spec.errorMessage || null,
    });
}

/**
 * Valida sequência de eventos: pipeline.start no início, pipeline.end ou cancel no fim.
 *
 * @param {Array<any>} events
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateEventLog(events: any[]): Readonly<{ valid: boolean; reason?: string }> {
    if (!Array.isArray(events)) {
        return Object.freeze({ valid: false, reason: 'not_array' });
    }
    if (events.length === 0) {
        return Object.freeze({ valid: false, reason: 'empty_log' });
    }
    const first = events[0];
    if (!first || first.type !== 'pipeline.start') {
        return Object.freeze({ valid: false, reason: 'missing_pipeline_start' });
    }
    const last = events[events.length - 1];
    if (!last || (last.type !== 'pipeline.end' && last.type !== 'pipeline.cancel' && last.type !== 'step.error')) {
        return Object.freeze({ valid: false, reason: 'incomplete_log' });
    }
    return Object.freeze({ valid: true });
}

/**
 * Filtra eventos por tipo.
 *
 * @param {Array<any>} events
 * @param {string} type
 * @returns {Array<any>}
 */
export function eventsByType(events: any[], type: string): any[] {
    if (!Array.isArray(events) || !(EVENT_TYPES as readonly string[]).includes(type)) return [];
    return events.filter((e: any) => e && e.type === type);
}

/**
 * Filtra eventos por stepId.
 *
 * @param {Array<any>} events
 * @param {string} stepId
 * @returns {Array<any>}
 */
export function eventsByStep(events: any[], stepId: string): any[] {
    if (!Array.isArray(events) || typeof stepId !== 'string') return [];
    return events.filter((e: any) => e && e.stepId === stepId);
}

/**
 * Computa duração total do replay.
 *
 * @param {Array<any>} events
 * @returns {number} ms
 */
export function totalDurationMs(events: any[]): number {
    if (!Array.isArray(events) || events.length < 2) return 0;
    const start = events.find((e: any) => e && e.type === 'pipeline.start');
    const end = events.find((e: any) => e && (e.type === 'pipeline.end' || e.type === 'pipeline.cancel'));
    if (!start || !end) return 0;
    if (!Number.isFinite(start.timestamp) || !Number.isFinite(end.timestamp)) return 0;
    return Math.max(0, end.timestamp - start.timestamp);
}

/**
 * Computa step-by-step durations.
 *
 * @param {Array<any>} events
 * @returns {ReadonlyArray<StepDuration>}
 */
export function stepDurations(events: any[]): ReadonlyArray<StepDuration> {
    if (!Array.isArray(events)) return Object.freeze([]);
    const stepStarts = new Map<string, number>();
    const durations: StepDuration[] = [];

    for (const e of events) {
        if (!e || !e.stepId) continue;
        if (e.type === 'step.start') {
            stepStarts.set(e.stepId, e.timestamp);
        } else if (e.type === 'step.end' || e.type === 'step.error') {
            if (stepStarts.has(e.stepId) && Number.isFinite(e.timestamp)) {
                const startTime = stepStarts.get(e.stepId) as number;
                durations.push(
                    Object.freeze({
                        stepId: e.stepId,
                        durationMs: Math.max(0, e.timestamp - startTime),
                    }),
                );
                stepStarts.delete(e.stepId);
            }
        }
    }
    return Object.freeze(durations);
}

/** Notifica o hook onEvent, isolando o try/catch da lógica principal. */
function notifyEvent(
    onEvent: (event: any, state: any) => void,
    event: any,
    state: ReplayStateSnapshot,
): void {
    try {
        onEvent(event, { ...state });
    } catch (e) {
        console.debug('[replay:onEvent]', (e as any)?.message || e);
    }
}

/** Determina o próximo status com base no evento e no breakpoint. */
function resolveNextStatus(event: any, breakpoint: string | null, currentStatus: string): string {
    if (!event) return currentStatus;
    if (event.type === 'step.error') return 'failed';
    if (event.type === 'pipeline.cancel') return 'cancelled';
    if (event.type === 'pipeline.end') return 'completed';
    if (breakpoint && event.stepId === breakpoint && event.type === 'step.start') return 'paused';
    return currentStatus;
}

/**
 * Cria replay engine pure-logic.
 *
 * @param {Array<any>} events
 * @param {ReplayEngineOptions} [options]
 * @returns {ReplayEngine}
 */
export function createReplayEngine(events: any[], options: ReplayEngineOptions = {}): ReplayEngine {
    const log = Array.isArray(events) ? [...events] : [];
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    const breakpoint = typeof options.breakpoint === 'string' ? options.breakpoint : null;
    let index = 0;
    let status = 'idle';

    const state: { errorMessage: string | null } = { errorMessage: null };

    const engine: ReplayEngine = Object.freeze({
        step() {
            if (isTerminalStatus(status)) {
                return null;
            }
            if (index >= log.length) {
                status = 'completed';
                return null;
            }
            const event = log[index++];
            status = 'running';

            notifyEvent(onEvent, event, { errorMessage: state.errorMessage, index });

            const nextStatus = resolveNextStatus(event, breakpoint, status);
            status = nextStatus;
            if (nextStatus === 'failed' && event) {
                state.errorMessage = event.errorMessage || 'unknown';
            }
            return event;
        },
        runAll() {
            const result: any[] = [];
            while (!isTerminalStatus(status) && status !== 'paused') {
                const ev = engine.step();
                if (ev === null) break;
                result.push(ev);
                if (status === 'paused') break;
            }
            return result;
        },
        isComplete() {
            return isTerminalStatus(status);
        },
        status() {
            return status;
        },
        currentIndex() {
            return index;
        },
        reset() {
            index = 0;
            status = 'idle';
            state.errorMessage = null;
        },
    });
    return engine;
}

/**
 * Sumariza event log.
 *
 * @param {Array<any>} events
 * @returns {EventLogSummary}
 */
export function summarizeEventLog(events: any[]): EventLogSummary {
    const empty: EventLogSummary = {
        total: 0,
        byType: {},
        stepCount: 0,
        totalDuration: 0,
        hasErrors: false,
    };
    if (!Array.isArray(events) || events.length === 0) return empty;

    const byType: Record<string, number> = {};
    const stepIds = new Set<string>();
    let hasErrors = false;
    for (const e of events) {
        if (!e) continue;
        if (e.type) byType[e.type] = (byType[e.type] || 0) + 1;
        if (e.stepId) stepIds.add(e.stepId);
        if (e.type === 'step.error') hasErrors = true;
    }
    return {
        total: events.length,
        byType,
        stepCount: stepIds.size,
        totalDuration: totalDurationMs(events),
        hasErrors,
    };
}

/**
 * Module identity export.
 */
export const pipelineReplayMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 19,
    deliveredAt: '2026-05-01',
    eventTypes: EVENT_TYPES,
    exports: [
        'EVENT_TYPES',
        'REPLAY_STATUS',
        'REPLAY_META',
        'createEvent',
        'validateEventLog',
        'eventsByType',
        'eventsByStep',
        'totalDurationMs',
        'stepDurations',
        'createReplayEngine',
        'summarizeEventLog',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
