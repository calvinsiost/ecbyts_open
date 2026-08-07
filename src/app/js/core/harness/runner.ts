// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/harness/runner.js
// UI Exploration Harness - pure-logic runner skeleton
//
// Sequencia os steps de uma journey em ordem topológica, delegando a
// execução real a um `executor` injetado (dependency inversion). O runner
// NÃO acessa window/DOM - isso é responsabilidade do executor browser-side
// a ser implementado na Fase 2 (delegado a Codex).
//
// O clock também é injetável (default: Date.now) para testes determinísticos.

import { topoSortSteps, validateJourney } from './journeyModel.js';

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface StepRecord {
    id: string;
    action: string;
    status: StepStatus;
    startedAt: number | null;
    completedAt: number | null;
    result?: any;
    error: string | null;
}

export interface RunResult {
    journeyId: string;
    steps: Readonly<{ [key: string]: Readonly<StepRecord> }>;
    status: 'passed' | 'failed';
    durationMs: number;
    startedAt: number;
    completedAt: number;
}

/**
 * Cria um runner para uma journey específica.
 *
 * @param opts
 */
export function createHarnessRun(
    { journey, clock = Date.now }: any = {} as any,
): {
    run: (
        executor: (stepId: string, action: string, params: object) => Promise<any> | any,
    ) => Promise<Readonly<RunResult>>;
} {
    if (!journey || typeof journey !== 'object') {
        throw new TypeError('createHarnessRun: journey is required');
    }
    if (typeof clock !== 'function') {
        throw new TypeError('createHarnessRun: clock must be a function');
    }
    // Revalida defensivamente (também detecta ciclos)
    validateJourney(journey);
    const orderedSteps = topoSortSteps(journey);

    return {
        /**
         * Executa a journey sequencialmente na ordem topológica.
         * Para no primeiro failure: steps remanescentes ficam com status 'skipped'.
         *
         * @param executor
         */
        async run(executor: (stepId: string, action: string, params: object) => Promise<any> | any) {
            if (typeof executor !== 'function') {
                throw new TypeError('runner.run: executor must be a function');
            }
            const stepRecords: Record<string, any> = {};
            for (const step of orderedSteps) {
                stepRecords[step.id] = {
                    id: step.id,
                    action: step.action,
                    status: 'pending',
                    startedAt: null,
                    completedAt: null,
                    error: null,
                };
            }
            const runStartedAt = clock();
            let runStatus = 'passed';
            let stopRemaining = false;

            for (const step of orderedSteps) {
                if (stopRemaining) {
                    stepRecords[step.id].status = 'skipped';
                    continue;
                }
                const rec = stepRecords[step.id];
                rec.status = 'running';
                rec.startedAt = clock();
                try {
                    const result = await executor(step.id, step.action, step.params as any);
                    rec.completedAt = clock();
                    rec.status = 'passed';
                    rec.result = result;
                } catch (err) {
                    rec.completedAt = clock();
                    rec.status = 'failed';
                    rec.error = err instanceof Error ? err.message : String(err);
                    runStatus = 'failed';
                    stopRemaining = true;
                }
            }
            const runCompletedAt = clock();

            // Freeze individual records then map
            const frozenSteps: Record<string, any> = {};
            for (const id of Object.keys(stepRecords)) {
                frozenSteps[id] = Object.freeze(stepRecords[id]);
            }
            return Object.freeze({
                journeyId: journey.id,
                steps: Object.freeze(frozenSteps),
                status: runStatus,
                durationMs: runCompletedAt - runStartedAt,
                startedAt: runStartedAt,
                completedAt: runCompletedAt,
            }) as any;
        },
    };
}
