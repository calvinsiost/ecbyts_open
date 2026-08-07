// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/random/phaseOrchestrator.js
// P1-149 - Pure-logic phase orchestration for random model generation.
// Phases run in topological order based on declared dependencies.

export const PHASE_NAMES = Object.freeze([
    'CONTEXT',
    'BOUNDARY',
    'BUILDINGS_PLUMES',
    'WELLS',
    'OTHER_ELEMENTS',
    'FINANCIALS',
    'VISUALIZATION',
]);

export const PHASE_STATUS = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
});

interface PhaseDefinition {
    name: string;
    dependencies: ReadonlyArray<string>;
    expectedDurationMs: number;
    optional: boolean;
}

interface PhaseTiming {
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
}

interface OrchestrationContext {
    phases: ReadonlyArray<Readonly<PhaseDefinition>>;
    statuses: Readonly<{ [name: string]: string }>;
    results: Readonly<{ [name: string]: unknown }>;
    errors: ReadonlyArray<{ phase: string; error: string }>;
    startedAt: number | null;
    completedAt: number | null;
    timings: Readonly<{ [name: string]: PhaseTiming }>;
}

interface PhaseGraphValidation {
    valid: boolean;
    cycles: string[][];
    missingDeps: Array<{ phase: string; missing: string }>;
}

interface OrchestrationSummary {
    totalPhases: number;
    completed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    criticalPath: string[];
}

type PhaseHandlers = { [name: string]: (ctx: OrchestrationContext) => unknown };

/**
 * Create a frozen phase definition.
 */
export function createPhaseDefinition(
    name: string,
    dependencies: string[] = [],
    options: { expectedDurationMs?: number; optional?: boolean } = {},
): Readonly<PhaseDefinition> {
    if (!name || typeof name !== 'string') throw new Error('phase name required');
    if (!Array.isArray(dependencies)) throw new Error('dependencies must be array');
    return Object.freeze({
        name,
        dependencies: Object.freeze([...dependencies]),
        expectedDurationMs: options.expectedDurationMs || 0,
        optional: options.optional || false,
    });
}

/**
 * Validate phase graph: detects missing deps and cycles via DFS.
 */
export function validatePhaseGraph(
    phases: ReadonlyArray<Readonly<PhaseDefinition>>,
): PhaseGraphValidation {
    const names = new Set(phases.map((p) => p.name));
    const missingDeps: Array<{ phase: string; missing: string }> = [];
    for (const p of phases) {
        for (const dep of p.dependencies) {
            if (!names.has(dep)) missingDeps.push({ phase: p.name, missing: dep });
        }
    }
    const cycles: string[][] = [];
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color: Map<string, number> = new Map(phases.map((p) => [p.name, WHITE]));
    const map: Map<string, Readonly<PhaseDefinition>> = new Map(phases.map((p) => [p.name, p]));
    const stack: string[] = [];
    function dfs(name: string): void {
        color.set(name, GRAY);
        stack.push(name);
        const phase = map.get(name);
        if (phase) {
            for (const dep of phase.dependencies) {
                if (!map.has(dep)) continue;
                const c = color.get(dep);
                if (c === GRAY) {
                    const idx = stack.indexOf(dep);
                    cycles.push(stack.slice(idx).concat(dep));
                } else if (c === WHITE) {
                    dfs(dep);
                }
            }
        }
        stack.pop();
        color.set(name, BLACK);
    }
    for (const p of phases) {
        if (color.get(p.name) === WHITE) dfs(p.name);
    }
    return { valid: cycles.length === 0 && missingDeps.length === 0, cycles, missingDeps };
}

/**
 * Topologically sort phases by dependencies (Kahn's algorithm).
 * @returns phase names in execution order
 */
export function topologicallySortPhases(
    phases: ReadonlyArray<Readonly<PhaseDefinition>>,
): string[] {
    const validation = validatePhaseGraph(phases);
    if (validation.cycles.length > 0) {
        const firstCycle = validation.cycles[0] || [];
        throw new Error(`cycle detected: ${firstCycle.join(' -> ')}`);
    }
    const map: Map<string, Readonly<PhaseDefinition>> = new Map(phases.map((p) => [p.name, p]));
    const inDegree: Map<string, number> = new Map(phases.map((p) => [p.name, 0]));
    const dependents: Map<string, string[]> = new Map(phases.map((p) => [p.name, [] as string[]]));
    for (const p of phases) {
        for (const dep of p.dependencies) {
            if (!map.has(dep)) continue;
            inDegree.set(p.name, (inDegree.get(p.name) || 0) + 1);
            const list = dependents.get(dep);
            if (list) list.push(p.name);
        }
    }
    const queue: string[] = [];
    for (const [name, deg] of inDegree) {
        if (deg === 0) queue.push(name);
    }
    const result: string[] = [];
    while (queue.length) {
        const n = queue.shift() as string;
        result.push(n);
        const deps = dependents.get(n) || [];
        for (const d of deps) {
            const nd = (inDegree.get(d) || 0) - 1;
            inDegree.set(d, nd);
            if (nd === 0) queue.push(d);
        }
    }
    if (result.length !== phases.length) {
        throw new Error('cycle detected during topological sort');
    }
    return result;
}

/**
 * Create initial orchestration context (frozen at top level).
 */
export function createOrchestrationContext(
    phases: ReadonlyArray<Readonly<PhaseDefinition>>,
): Readonly<OrchestrationContext> {
    const statuses: { [name: string]: string } = {};
    for (const p of phases) statuses[p.name] = PHASE_STATUS.PENDING;
    return Object.freeze({
        phases,
        statuses: Object.freeze(statuses),
        results: Object.freeze({}),
        errors: Object.freeze([]),
        startedAt: null,
        completedAt: null,
        timings: Object.freeze({}),
    });
}

function withStatus(
    ctx: Readonly<OrchestrationContext>,
    name: string,
    status: string,
    extras: {
        results?: { [key: string]: unknown };
        errors?: ReadonlyArray<{ phase: string; error: string }>;
        startedAt?: number | null;
        completedAt?: number | null;
        timings?: { [key: string]: PhaseTiming };
    } = {},
): Readonly<OrchestrationContext> {
    const statuses = { ...ctx.statuses, [name]: status };
    return Object.freeze({
        ...ctx,
        statuses: Object.freeze(statuses),
        results: extras.results ? Object.freeze(extras.results) : ctx.results,
        errors: extras.errors ? Object.freeze(extras.errors) : ctx.errors,
        startedAt: extras.startedAt !== undefined ? extras.startedAt : ctx.startedAt,
        completedAt: extras.completedAt !== undefined ? extras.completedAt : ctx.completedAt,
        timings: extras.timings ? Object.freeze(extras.timings) : ctx.timings,
    });
}

export function markPhaseStarted(
    ctx: Readonly<OrchestrationContext>,
    name: string,
): Readonly<OrchestrationContext> {
    const startedAt = ctx.startedAt ?? Date.now();
    const timings = { ...ctx.timings, [name]: { startedAt: Date.now() } };
    return withStatus(ctx, name, PHASE_STATUS.RUNNING, { startedAt, timings });
}

export function markPhaseCompleted(
    ctx: Readonly<OrchestrationContext>,
    name: string,
    result: unknown,
): Readonly<OrchestrationContext> {
    const results = { ...ctx.results, [name]: result };
    const prev = ctx.timings[name] || {};
    const completedAt = Date.now();
    const timings = {
        ...ctx.timings,
        [name]: { ...prev, completedAt, durationMs: completedAt - (prev.startedAt || completedAt) },
    };
    return withStatus(ctx, name, PHASE_STATUS.COMPLETED, { results, timings });
}

export function markPhaseFailed(
    ctx: Readonly<OrchestrationContext>,
    name: string,
    error: Error | unknown,
): Readonly<OrchestrationContext> {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errors = [...ctx.errors, { phase: name, error: errMsg }];
    const prev = ctx.timings[name] || {};
    const completedAt = Date.now();
    const timings = {
        ...ctx.timings,
        [name]: { ...prev, completedAt, durationMs: completedAt - (prev.startedAt || completedAt) },
    };
    return withStatus(ctx, name, PHASE_STATUS.FAILED, { errors, timings });
}

export function markPhaseSkipped(
    ctx: Readonly<OrchestrationContext>,
    name: string,
): Readonly<OrchestrationContext> {
    return withStatus(ctx, name, PHASE_STATUS.SKIPPED);
}

/**
 * Phases whose dependencies are all COMPLETED and which are still PENDING.
 */
export function getRunnablePhases(
    ctx: Readonly<OrchestrationContext>,
): ReadonlyArray<Readonly<PhaseDefinition>> {
    return ctx.phases.filter((p) => {
        if (ctx.statuses[p.name] !== PHASE_STATUS.PENDING) return false;
        return p.dependencies.every((d) => ctx.statuses[d] === PHASE_STATUS.COMPLETED);
    });
}

/**
 * Sequential orchestration runner.
 */
export function runOrchestration(
    phases: ReadonlyArray<Readonly<PhaseDefinition>>,
    handlers: PhaseHandlers = {},
    options: { stopOnFailure?: boolean } = {},
): Readonly<OrchestrationContext> {
    const stopOnFailure = options.stopOnFailure !== false;
    const order = topologicallySortPhases(phases);
    let ctx = createOrchestrationContext(phases);
    const map: Map<string, Readonly<PhaseDefinition>> = new Map(phases.map((p) => [p.name, p]));
    for (const name of order) {
        const phase = map.get(name);
        if (!phase) continue;
        const blocked = phase.dependencies.some(
            (d) => ctx.statuses[d] === PHASE_STATUS.FAILED || ctx.statuses[d] === PHASE_STATUS.SKIPPED,
        );
        if (blocked) {
            ctx = markPhaseSkipped(ctx, name);
            continue;
        }
        const handler = handlers[name];
        if (!handler) {
            if (phase.optional) {
                ctx = markPhaseSkipped(ctx, name);
                continue;
            }
            ctx = markPhaseFailed(ctx, name, new Error(`no handler for phase ${name}`));
            if (stopOnFailure) continue;
        }
        ctx = markPhaseStarted(ctx, name);
        try {
            const result = handler ? handler(ctx) : undefined;
            ctx = markPhaseCompleted(ctx, name, result);
        } catch (err) {
            ctx = markPhaseFailed(ctx, name, err);
        }
    }
    return Object.freeze({ ...ctx, completedAt: Date.now() });
}

/**
 * Summarize a finished (or partial) orchestration run.
 */
export function summarizeRun(ctx: Readonly<OrchestrationContext>): OrchestrationSummary {
    let completed = 0,
        failed = 0,
        skipped = 0;
    for (const name of Object.keys(ctx.statuses)) {
        const s = ctx.statuses[name];
        if (s === PHASE_STATUS.COMPLETED) completed++;
        else if (s === PHASE_STATUS.FAILED) failed++;
        else if (s === PHASE_STATUS.SKIPPED) skipped++;
    }
    const durationMs = ctx.startedAt && ctx.completedAt ? ctx.completedAt - ctx.startedAt : 0;
    const map: Map<string, Readonly<PhaseDefinition>> = new Map(ctx.phases.map((p) => [p.name, p]));
    const memo: Map<string, { length: number; path: string[] }> = new Map();
    function longest(name: string): { length: number; path: string[] } {
        const cached = memo.get(name);
        if (cached) return cached;
        const phase = map.get(name);
        if (!phase) return { length: 0, path: [name] };
        const timing = ctx.timings[name];
        const own = (timing && timing.durationMs) || phase.expectedDurationMs || 0;
        let best = { length: own, path: [name] };
        for (const dep of phase.dependencies) {
            if (!map.has(dep)) continue;
            const sub = longest(dep);
            if (sub.length + own > best.length) {
                best = { length: sub.length + own, path: [...sub.path, name] };
            }
        }
        memo.set(name, best);
        return best;
    }
    let criticalPath: string[] = [];
    let maxLen = -1;
    for (const p of ctx.phases) {
        const r = longest(p.name);
        if (r.length > maxLen) {
            maxLen = r.length;
            criticalPath = r.path;
        }
    }
    return {
        totalPhases: ctx.phases.length,
        completed,
        failed,
        skipped,
        durationMs,
        criticalPath,
    };
}

/**
 * Replay orchestration from a checkpoint.
 */
export function replayFromCheckpoint(
    savedCtx: Readonly<Partial<OrchestrationContext>>,
    phases: ReadonlyArray<Readonly<PhaseDefinition>>,
    handlers: PhaseHandlers = {},
    fromPhase?: string,
): Readonly<OrchestrationContext> {
    const order = topologicallySortPhases(phases);
    if (typeof fromPhase !== 'string') throw new Error('fromPhase required');
    const idx = order.indexOf(fromPhase);
    if (idx < 0) throw new Error(`unknown fromPhase: ${fromPhase}`);
    const map: Map<string, Readonly<PhaseDefinition>> = new Map(phases.map((p) => [p.name, p]));
    const statuses: { [name: string]: string } = {};
    const results: { [name: string]: unknown } = {};
    const timings: { [name: string]: PhaseTiming } = {};
    for (let i = 0; i < idx; i++) {
        const n = order[i];
        if (n === undefined) continue;
        statuses[n] = savedCtx.statuses?.[n] ?? PHASE_STATUS.PENDING;
        if (savedCtx.results && n in savedCtx.results) results[n] = savedCtx.results[n];
        if (savedCtx.timings && n in savedCtx.timings) {
            const t = savedCtx.timings[n];
            if (t) timings[n] = t;
        }
    }
    for (let i = idx; i < order.length; i++) {
        const n = order[i];
        if (n !== undefined) statuses[n] = PHASE_STATUS.PENDING;
    }
    let ctx: Readonly<OrchestrationContext> = Object.freeze({
        phases,
        statuses: Object.freeze(statuses),
        results: Object.freeze(results),
        errors: Object.freeze([] as Array<{ phase: string; error: string }>),
        startedAt: Date.now(),
        completedAt: null,
        timings: Object.freeze(timings),
    });
    for (let i = idx; i < order.length; i++) {
        const name = order[i];
        if (name === undefined) continue;
        const phase = map.get(name);
        if (!phase) continue;
        const blocked = phase.dependencies.some(
            (d) => ctx.statuses[d] === PHASE_STATUS.FAILED || ctx.statuses[d] === PHASE_STATUS.SKIPPED,
        );
        if (blocked) {
            ctx = markPhaseSkipped(ctx, name);
            continue;
        }
        const handler = handlers[name];
        if (!handler) {
            if (phase.optional) {
                ctx = markPhaseSkipped(ctx, name);
                continue;
            }
            ctx = markPhaseFailed(ctx, name, new Error(`no handler for phase ${name}`));
            continue;
        }
        ctx = markPhaseStarted(ctx, name);
        try {
            const result = handler(ctx);
            ctx = markPhaseCompleted(ctx, name, result);
        } catch (err) {
            ctx = markPhaseFailed(ctx, name, err);
        }
    }
    return Object.freeze({ ...ctx, completedAt: Date.now() });
}
