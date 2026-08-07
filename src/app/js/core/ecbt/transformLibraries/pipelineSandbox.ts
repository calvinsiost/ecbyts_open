// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Sandbox / Dry-Run - Phase 31 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S31
 *
 * Phase 31 (2026-05-01) - pure-logic sandbox para dry-run de pipelines
 * sem executar side effects. Simula a execução prevendo:
 *   - Output schemas por step (sem chamar libraries)
 *   - Ordem real de execução (incluindo retry/conditional)
 *   - Recursos consumidos estimados (delegado a pipelineCost)
 *   - Erros de schema mismatch antes de runtime
 *
 * Estratégia:
 *   - dryRunPipeline: walk steps + simulate output em cada
 *   - validateSchemaCompat: input/output mismatch entre steps
 *   - predictOutput: schema-only prediction
 *   - simulateExecutionPlan: ordem expandida (retry, conditional)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Sandbox modes canônicos. */
export const SANDBOX_MODES = Object.freeze(['dry_run', 'schema_check', 'plan_only', 'cost_estimate']);

/** Identidade do módulo. */
export const SANDBOX_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 31,
    deliveredAt: '2026-05-01',
    modes: SANDBOX_MODES,
});

/**
 * Verifica se mode é canônico.
 */
export function isValidMode( m: any) {
    return typeof m === 'string' && SANDBOX_MODES.includes(m);
}

/**
 * Cria sandbox context frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createSandbox(spec: Record<string, any> = {}): object {
    return Object.freeze({
        mode: isValidMode(spec.mode) ? spec.mode : 'dry_run',
        librarySchemas: spec.librarySchemas ? Object.freeze({ ...spec.librarySchemas }) : Object.freeze({}),
        startedAt: spec.startedAt || new Date().toISOString(),
        traceLog: [],
    });
}

/**
 * Lookup schema esperado de library.
 *
 * @param {Record<string, any>} sandbox
 * @param {string} any>
 * @returns {Record<string, any> | null}
 */
export function getLibrarySchema(sandbox: Record<string, any>, libraryId: string): Record<string, any> | null {
    if (!sandbox || typeof libraryId !== 'string') return null;
    return sandbox.librarySchemas[libraryId] || null;
}

/**
 * Verifica compat de schemas entre output do step N e input do step N+1.
 *
 * @param {Record<string, any> | null | undefined} outputSchema
 * @param {Record<string, any> | null | undefined} any>
 * @returns {{ compatible: boolean, missing: ReadonlyArray<string>, extra: ReadonlyArray<string> }}
 */
export function validateSchemaCompat(outputSchema: Record<string, any> | null | undefined, inputSchema: Record<string, any> | null | undefined): { compatible: boolean, missing: ReadonlyArray<string>, extra: ReadonlyArray<string> } {
    if (!outputSchema || !inputSchema) {
        return Object.freeze({ compatible: true, missing: [], extra: [] });
    }
    const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
    const outputFields = outputSchema.fields ? Object.keys(outputSchema.fields) : [];
    const missing = required.filter(( r: any) => !outputFields.includes( (r as any)));
    const expected = inputSchema.fields ? Object.keys(inputSchema.fields) : [];
    const extra = outputFields.filter((f) => expected.length > 0 && !expected.includes(f));
    return Object.freeze({
        compatible: missing.length === 0,
        missing: Object.freeze(missing),
        extra: Object.freeze(extra),
    });
}

/**
 * Prediz schema de output baseado em library schema + input.
 *
 * @param {Record<string, any>} sandbox
 * @param {Record<string, any>} any>
 * @param {Record<string, any> | null | undefined} step
 * @returns {Record<string, any> | null}
 */
export function predictOutput(sandbox: Record<string, any>, step: Record<string, any>, inputSchema: Record<string, any> | null | undefined): Record<string, any> | null {
    if (!step || !sandbox) return null;
    const libSchema = getLibrarySchema(sandbox, step.libraryId);
    if (!libSchema) {
        // Unknown library: passthrough input as best guess
        return inputSchema || null;
    }
    if (libSchema.outputSchema) return libSchema.outputSchema;
    // Heuristic: pure transform → output = input com transform marker
    return Object.freeze({
        fields: inputSchema?.fields ? Object.freeze({ ...inputSchema.fields }) : Object.freeze({}),
        transformedBy: step.libraryId,
    });
}

/**
 * Expande plan de execução considerando retry/conditional/composed.
 *
 * @param {ReadonlyArray<Record<string, any>>} steps
 * @returns {ReadonlyArray<Record<string, any>>} steps planejados (com retry expandido como N entries)
 */
export function simulateExecutionPlan(steps: ReadonlyArray<Record<string, any>>): ReadonlyArray<Record<string, any>> {
    if (!Array.isArray(steps)) return [];
    const out: Array<Record<string, any>> = [];
    for (const step of steps) {
        if (!step) continue;
        // Retry: expandir para maxAttempts entries
        if (step.type === 'composed' && step.strategy === 'retry') {
            const max = step.config?.maxAttempts || 3;
            const child = step.children?.[0];
            if (child) {
                for (let i = 0; i < max; i++) {
                    out.push(Object.freeze({ ...child, attempt: i + 1, virtual: i > 0 }));
                }
            }
            continue;
        }
        // Conditional: prever só o then-branch (else é runtime)
        if (step.type === 'composed' && step.strategy === 'conditional') {
            const thenStep = step.children?.[0];
            if (thenStep) out.push(Object.freeze({ ...thenStep, conditional: true }));
            continue;
        }
        // Sequence/parallel: flatten one level
        if (step.type === 'composed' && (step.strategy === 'sequence' || step.strategy === 'parallel')) {
            for (const c of step.children || []) {
                if (c) out.push(Object.freeze({ ...c, parent: step.strategy }));
            }
            continue;
        }
        out.push(Object.freeze({ ...step }));
    }
    return Object.freeze(out);
}

/**
 * Executa dry-run de pipeline.
 *
 * @param {ReadonlyArray<Record<string, any>>} steps
 * @param {Record<string, any> | null | undefined} any>> (schema apenas)
 * @param {Record<string, any> | null | undefined} [initialInput]
 * @returns {Record<string, any>}
 */
export function dryRunPipeline(steps: ReadonlyArray<Record<string, any>>, initialInput: Record<string, any> | null | undefined, sandbox?: Record<string, any> | null | undefined): Record<string, any> {
    if (!Array.isArray(steps)) {
        return Object.freeze({
            ok: false,
            errors: Object.freeze(['steps must be array']),
            trace: Object.freeze([]),
        });
    }
    const sb = sandbox || createSandbox({ mode: 'dry_run' });
    const errors = [];
    const trace = [];
    let currentSchema = initialInput || null;
    const plan = simulateExecutionPlan(steps);
    for (let i = 0; i < plan.length; i++) {
        const step = plan[i] as Record<string, any>;
        const libSchema = getLibrarySchema(sb, step.libraryId);
        const inputCheck = validateSchemaCompat(currentSchema, libSchema?.inputSchema);
        const predicted = predictOutput(sb, step, currentSchema);
        if (!inputCheck.compatible) {
            errors.push(`step[${i}] ${step.libraryId}: missing required fields ${inputCheck.missing.join(',')}`);
        }
        trace.push(
            Object.freeze({
                stepIndex: i,
                libraryId: step.libraryId,
                inputCompat: inputCheck.compatible,
                missing: inputCheck.missing,
                predictedOutput: predicted,
                attempt: step.attempt || 1,
                virtual: step.virtual || false,
            }),
        );
        currentSchema = predicted;
    }
    return Object.freeze({
        ok: errors.length === 0,
        errors: Object.freeze(errors),
        trace: Object.freeze(trace),
        finalOutput: currentSchema,
        stepCount: plan.length,
    });
}

/**
 * Detecta dead steps (steps cujo output nunca é usado).
 *
 * @param {ReadonlyArray<Record<string, any>>} steps
 * @returns {ReadonlyArray<number>} indices de dead steps
 */
export function detectDeadSteps(steps: ReadonlyArray<Record<string, any>>): ReadonlyArray<number> {
    if (!Array.isArray(steps) || steps.length === 0) return [];
    const dead: Array<number> = [];
    // Heurística: tap steps são side-effect mas não dead;
    // qualquer step intermediário com output nunca lido fica como suspeito.
    // Sem grafo real, marcar apenas: dois steps consecutivos com mesmo libraryId é redundante.
    for (let i = 0; i < steps.length - 1; i++) {
        const curr = steps[i];
        const next = steps[i + 1];
        if (curr && next && curr.libraryId && curr.libraryId === next.libraryId) {
            dead.push(i);
        }
    }
    return Object.freeze(dead);
}

/**
 * Sumariza dry-run result.
 */
export function summarizeSandbox( result: any) {
    const empty = { ok: false, stepCount: 0, errorCount: 0, hasErrors: false };
    if (!result) return empty;
    return Object.freeze({
        ok: !!result.ok,
        stepCount: Number.isInteger(result.stepCount) ? result.stepCount : 0,
        errorCount: Array.isArray(result.errors) ? result.errors.length : 0,
        hasErrors: Array.isArray(result.errors) && result.errors.length > 0,
        traceLength: Array.isArray(result.trace) ? result.trace.length : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineSandboxMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 31,
    deliveredAt: '2026-05-01',
    modes: SANDBOX_MODES,
    exports: [
        'SANDBOX_MODES',
        'SANDBOX_META',
        'isValidMode',
        'createSandbox',
        'getLibrarySchema',
        'validateSchemaCompat',
        'predictOutput',
        'simulateExecutionPlan',
        'dryRunPipeline',
        'detectDeadSteps',
        'summarizeSandbox',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
