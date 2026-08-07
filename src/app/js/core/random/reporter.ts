// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// Reporter for Random Module Rebuild V2 (RANDOM-REBUILD-V2).
// Structured diagnostics event emitter for the random orchestrator.
// Back-compat: lifecycle events are still pushed to __ecbytsRandomLifecycle.
// Relógio: realNow() obrigatório — o Date global é congelado pelo runtime
// determinístico durante o run (toda duração sairia 0ms).

import { realNow } from './runtime.js';

export type ReporterRunId = string | number;

export interface ReporterEvent {
    ts: number;
    phase: string;
    event: string;
    payload: Record<string, unknown>;
    runId: ReporterRunId;
}

export interface ReporterSummary {
    events: ReporterEvent[];
    timings: Record<string, number | null>;
    warnings: string[];
    totalDurationMs: number;
}

export interface Reporter {
    phaseStart(phase: string, payload?: Record<string, unknown>): void;
    phaseEnd(phase: string, payload?: Record<string, unknown>): void;
    warn(phase: string, message: string, payload?: Record<string, unknown>): void;
    emit(phase: string, eventName: string, payload?: Record<string, unknown>): void;
    finalize(): ReporterSummary;
    _resetStart(): void;
}

interface PhaseTiming {
    startedAt: number;
    endedAt: number | null;
}

type LifecycleRoot = typeof globalThis & {
    __ecbytsRandomLifecycle?: ReporterEvent[];
    dispatchEvent?: (event: Event) => boolean;
};

declare global {
    interface Window {
        __ecbytsRandomLifecycle?: ReporterEvent[];
    }

    var __ecbytsRandomLifecycle: ReporterEvent[] | undefined;
}

function getLifecycleRoot(): LifecycleRoot {
    return (typeof window !== 'undefined' ? window : globalThis) as LifecycleRoot;
}

function describeDispatchError(error: unknown): unknown {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        return typeof message === 'string' ? message : error;
    }
    return error;
}

export function createReporter(runId: ReporterRunId): Reporter {
    const events: ReporterEvent[] = [];
    const phaseTimings: Record<string, PhaseTiming> = {};
    const warnings: string[] = [];
    let startedAt = realNow();

    const root = getLifecycleRoot();

    function ensureLifecycleArray(): ReporterEvent[] {
        if (!Array.isArray(root.__ecbytsRandomLifecycle)) {
            root.__ecbytsRandomLifecycle = [];
        }
        return root.__ecbytsRandomLifecycle;
    }

    function dispatch(entry: ReporterEvent): void {
        events.push(entry);
        ensureLifecycleArray().push(entry);
        if (typeof CustomEvent === 'function' && typeof root.dispatchEvent === 'function') {
            try {
                root.dispatchEvent(new CustomEvent('ecbyts:randomPhase', { detail: entry }));
            } catch (error) {
                console.debug('[randomReporter] dispatchEvent:', describeDispatchError(error));
            }
        }

        console.debug(`[randomReporter] ${entry.phase}:${entry.event}`, entry.payload || {});
    }

    return {
        phaseStart(phase: string, payload: Record<string, unknown> = {}): void {
            phaseTimings[phase] = { startedAt: realNow(), endedAt: null };
            dispatch({
                ts: realNow(),
                runId,
                phase,
                event: 'start',
                payload,
            });
        },

        phaseEnd(phase: string, payload: Record<string, unknown> = {}): void {
            const timing = phaseTimings[phase];
            let durationMs: number | null = null;
            if (timing) {
                const endedAt = realNow();
                timing.endedAt = endedAt;
                durationMs = endedAt - timing.startedAt;
            }
            dispatch({
                ts: realNow(),
                runId,
                phase,
                event: 'end',
                payload: {
                    ...payload,
                    durationMs,
                },
            });
        },

        warn(phase: string, message: string, payload: Record<string, unknown> = {}): void {
            warnings.push(`[${phase}] ${message}`);
            dispatch({
                ts: realNow(),
                runId,
                phase,
                event: 'warn',
                payload: { message, ...payload },
            });
        },

        emit(phase: string, eventName: string, payload: Record<string, unknown> = {}): void {
            dispatch({
                ts: realNow(),
                runId,
                phase,
                event: eventName,
                payload,
            });
        },

        finalize(): ReporterSummary {
            const timings: Record<string, number | null> = {};
            for (const [phase, timing] of Object.entries(phaseTimings)) {
                timings[phase] = timing.endedAt && timing.startedAt ? timing.endedAt - timing.startedAt : null;
            }
            return {
                events: [...events],
                timings,
                warnings: [...warnings],
                totalDurationMs: realNow() - startedAt,
            };
        },

        _resetStart(): void {
            startedAt = realNow();
        },
    };
}
