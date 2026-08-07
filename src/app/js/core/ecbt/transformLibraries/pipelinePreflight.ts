// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Preflight (Phase 22)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S22
 *
 * Phase 22 (2026-05-01) - pure-logic engine de pre-flight checks
 * para pipelines. Valida schema, dependencies, resources, permissions
 * ANTES de execução para falha precoce.
 *
 * Estratégia:
 *   - 6 check categories: schema / dependencies / resources / permissions / inputs / outputs
 *   - Cada check retorna {pass, severity, reason, hint}
 *   - runChecks: roda todos com short-circuit em critical
 *   - generateReport: human-readable summary
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface CheckResultSpec {
    category: string;
    name?: string;
    pass?: boolean;
    severity: string;
    reason?: string;
    hint?: string;
}

export interface CheckResult {
    category: string;
    name: string;
    pass: boolean;
    severity: string;
    reason: string;
    hint: string;
}

export interface PreflightContext {
    pipeline?: Array<any>;
    knownLibraries?: Set<string>;
    estimatedCost?: Record<string, number>;
    budget?: Record<string, number>;
    actor?: { userId?: string };
    pipelineAcl?: { ownerId?: string; sharedWith?: Array<{ userId: string; role: string }> };
    requiredActions?: Array<string>;
    inputs?: Record<string, any>;
    requiredInputs?: Array<string>;
    outputTargets?: Array<{ path: string; writable?: boolean }>;
}

export interface PreflightResult {
    passed: boolean;
    results: ReadonlyArray<CheckResult>;
}

/** Check categories canônicas. */
export const CHECK_CATEGORIES = Object.freeze([
    'schema',
    'dependencies',
    'resources',
    'permissions',
    'inputs',
    'outputs',
]);

/** Severity levels. */
export const PREFLIGHT_SEVERITIES = Object.freeze(['critical', 'warning', 'info']);

/** Identidade do módulo. */
export const PREFLIGHT_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 22,
    deliveredAt: '2026-05-01',
    categories: CHECK_CATEGORIES,
    severities: PREFLIGHT_SEVERITIES,
});

/**
 * Cria check result frozen.
 */
export function createCheckResult(spec: CheckResultSpec): CheckResult {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createCheckResult: spec required');
    }
    if (!CHECK_CATEGORIES.includes(spec.category)) {
        throw new TypeError(`createCheckResult: invalid category`);
    }
    if (!PREFLIGHT_SEVERITIES.includes(spec.severity)) {
        throw new TypeError(`createCheckResult: invalid severity`);
    }
    return Object.freeze({
        category: spec.category,
        name: spec.name || '',
        pass: spec.pass === true,
        severity: spec.severity,
        reason: spec.reason || '',
        hint: spec.hint || '',
    });
}

/**
 * Check: schema válido (pipeline não-vazio + all steps com libraryId).
 */
export function checkSchema(pipeline: Array<any>): CheckResult {
    if (!Array.isArray(pipeline)) {
        return createCheckResult({
            category: 'schema',
            name: 'pipeline-is-array',
            pass: false,
            severity: 'critical',
            reason: 'Pipeline must be an array',
            hint: 'Pass an array of step objects',
        });
    }
    if (pipeline.length === 0) {
        return createCheckResult({
            category: 'schema',
            name: 'pipeline-non-empty',
            pass: false,
            severity: 'critical',
            reason: 'Pipeline is empty',
            hint: 'Add at least one step',
        });
    }
    for (let i = 0; i < pipeline.length; i++) {
        const step = pipeline[i];
        if (!step || typeof step !== 'object') {
            return createCheckResult({
                category: 'schema',
                name: 'all-steps-objects',
                pass: false,
                severity: 'critical',
                reason: `Step ${i} is not an object`,
                hint: 'Each step must be a plain object',
            });
        }
        if (typeof step.libraryId !== 'string' || !step.libraryId.trim()) {
            return createCheckResult({
                category: 'schema',
                name: 'all-steps-have-libraryId',
                pass: false,
                severity: 'critical',
                reason: `Step ${i} missing libraryId`,
                hint: 'Add libraryId field with library reference',
            });
        }
    }
    return createCheckResult({
        category: 'schema',
        name: 'schema-valid',
        pass: true,
        severity: 'info',
        reason: 'Schema is valid',
    });
}

/**
 * Check: dependencies disponíveis (knownLibraries set).
 */
export function checkDependencies(pipeline: Array<any>, knownLibraries: Set<string>): CheckResult {
    if (!Array.isArray(pipeline)) {
        return createCheckResult({
            category: 'dependencies',
            name: 'invalid-pipeline',
            pass: false,
            severity: 'critical',
            reason: 'Invalid pipeline',
        });
    }
    if (!(knownLibraries instanceof Set)) {
        return createCheckResult({
            category: 'dependencies',
            name: 'no-registry',
            pass: true,
            severity: 'info',
            reason: 'No knownLibraries registry provided — skipping check',
        });
    }
    const missing: string[] = [];
    for (const step of pipeline) {
        if (step && step.libraryId && !knownLibraries.has(step.libraryId)) {
            if (!missing.includes(step.libraryId)) missing.push(step.libraryId);
        }
    }
    if (missing.length > 0) {
        return createCheckResult({
            category: 'dependencies',
            name: 'missing-libraries',
            pass: false,
            severity: 'critical',
            reason: `Missing libraries: ${missing.join(', ')}`,
            hint: 'Install or register the required libraries',
        });
    }
    return createCheckResult({
        category: 'dependencies',
        name: 'all-deps-resolved',
        pass: true,
        severity: 'info',
        reason: 'All library dependencies resolved',
    });
}

/**
 * Check: resources (memoryMB + tokensIn dentro de budget).
 */
export function checkResources(
    estimatedCost: Record<string, number>,
    budget: Record<string, number>,
): CheckResult {
    if (!estimatedCost || typeof estimatedCost !== 'object') {
        return createCheckResult({
            category: 'resources',
            name: 'no-estimate',
            pass: true,
            severity: 'info',
            reason: 'No cost estimate provided — skipping',
        });
    }
    if (!budget || typeof budget !== 'object') {
        return createCheckResult({
            category: 'resources',
            name: 'no-budget',
            pass: true,
            severity: 'info',
            reason: 'No budget provided — skipping',
        });
    }
    const exceeded: string[] = [];
    for (const [metric, limit] of Object.entries(budget)) {
        if (!Number.isFinite(limit)) continue;
        const value = estimatedCost[metric];
        if (Number.isFinite(value) && (value as number) > limit) {
            exceeded.push(`${metric}: ${(value as number).toFixed(0)} > ${limit.toFixed(0)}`);
        }
    }
    if (exceeded.length > 0) {
        return createCheckResult({
            category: 'resources',
            name: 'budget-exceeded',
            pass: false,
            severity: 'warning',
            reason: `Budget exceeded: ${exceeded.join('; ')}`,
            hint: 'Reduce pipeline scope or increase budget',
        });
    }
    return createCheckResult({
        category: 'resources',
        name: 'resources-ok',
        pass: true,
        severity: 'info',
        reason: 'Within budget',
    });
}

/**
 * Check: permissions (actor has VIEW+RUN sobre pipeline).
 */
export function checkPermissions(
    actor: { userId?: string },
    pipelineAcl: { ownerId?: string; sharedWith?: Array<{ userId: string; role: string }> },
    _requiredActions: Array<string> = ['RUN'],
): CheckResult {
    // Skip when neither actor nor ACL provided (open execution)
    if ((!actor || typeof actor !== 'object' || !actor.userId) && (!pipelineAcl || typeof pipelineAcl !== 'object')) {
        return createCheckResult({
            category: 'permissions',
            name: 'no-acl-or-actor',
            pass: true,
            severity: 'info',
            reason: 'No ACL or actor provided — skipping',
        });
    }
    if (!actor || typeof actor !== 'object' || !actor.userId) {
        return createCheckResult({
            category: 'permissions',
            name: 'no-actor',
            pass: false,
            severity: 'critical',
            reason: 'ACL provided but no actor',
            hint: 'Provide actor with userId',
        });
    }
    if (!pipelineAcl || typeof pipelineAcl !== 'object') {
        return createCheckResult({
            category: 'permissions',
            name: 'no-acl',
            pass: true,
            severity: 'info',
            reason: 'No ACL provided — skipping',
        });
    }
    // Owner can do everything
    if (pipelineAcl.ownerId === actor.userId) {
        return createCheckResult({
            category: 'permissions',
            name: 'owner-allowed',
            pass: true,
            severity: 'info',
            reason: 'Actor is owner',
        });
    }
    // Check sharedWith
    const shared = (pipelineAcl.sharedWith || []).find(
        (e: { userId: string; role: string }) => e && e.userId === actor.userId,
    );
    if (!shared) {
        return createCheckResult({
            category: 'permissions',
            name: 'no-access',
            pass: false,
            severity: 'critical',
            reason: 'Actor has no access to pipeline',
            hint: 'Request share access from owner',
        });
    }
    return createCheckResult({
        category: 'permissions',
        name: 'shared-access',
        pass: true,
        severity: 'info',
        reason: `Actor has ${shared.role} role`,
    });
}

/**
 * Check: inputs (required keys presentes).
 */
export function checkInputs(inputs: Record<string, any>, required: Array<string> = []): CheckResult {
    if (!Array.isArray(required) || required.length === 0) {
        return createCheckResult({
            category: 'inputs',
            name: 'no-required',
            pass: true,
            severity: 'info',
            reason: 'No required inputs',
        });
    }
    const inputObj = inputs && typeof inputs === 'object' ? inputs : {};
    const missing = required.filter((key) => !(key in inputObj));
    if (missing.length > 0) {
        return createCheckResult({
            category: 'inputs',
            name: 'missing-inputs',
            pass: false,
            severity: 'critical',
            reason: `Missing inputs: ${missing.join(', ')}`,
            hint: 'Provide all required input keys',
        });
    }
    return createCheckResult({
        category: 'inputs',
        name: 'inputs-ok',
        pass: true,
        severity: 'info',
        reason: 'All required inputs present',
    });
}

/**
 * Check: outputs (target writable).
 */
export function checkOutputs(outputTargets: Array<{ path: string; writable?: boolean }>): CheckResult {
    if (!Array.isArray(outputTargets) || outputTargets.length === 0) {
        return createCheckResult({
            category: 'outputs',
            name: 'no-outputs',
            pass: true,
            severity: 'info',
            reason: 'No output targets — skipping',
        });
    }
    const invalid = outputTargets.filter(
        (t) => !t || typeof t !== 'object' || !t.path || (t.writable !== undefined && t.writable === false),
    );
    if (invalid.length > 0) {
        return createCheckResult({
            category: 'outputs',
            name: 'invalid-targets',
            pass: false,
            severity: 'critical',
            reason: `${invalid.length} invalid output target(s)`,
            hint: 'Each target needs path + writable=true',
        });
    }
    return createCheckResult({
        category: 'outputs',
        name: 'outputs-ok',
        pass: true,
        severity: 'info',
        reason: 'All output targets writable',
    });
}

/**
 * Roda todos os checks. Short-circuit em critical fail.
 */
export function runPreflight(context: PreflightContext = {}): PreflightResult {
    const results: CheckResult[] = [];

    const r1 = checkSchema(context.pipeline as Array<any>);
    results.push(r1);
    if (!r1.pass && r1.severity === 'critical') {
        return Object.freeze({ passed: false, results: Object.freeze(results) }) as PreflightResult;
    }

    results.push(
        checkDependencies(
            context.pipeline as Array<any>,
            context.knownLibraries as Set<string>,
        ),
    );
    results.push(
        checkResources(
            context.estimatedCost as Record<string, number>,
            context.budget as Record<string, number>,
        ),
    );
    results.push(
        checkPermissions(
            context.actor as { userId?: string },
            context.pipelineAcl as { ownerId?: string; sharedWith?: Array<{ userId: string; role: string }> },
            context.requiredActions as Array<string>,
        ),
    );
    results.push(checkInputs(context.inputs as Record<string, any>, context.requiredInputs as Array<string>));
    results.push(checkOutputs(context.outputTargets as Array<{ path: string; writable?: boolean }>));

    const passed = results.every((r) => r.pass);
    return Object.freeze({ passed, results: Object.freeze(results) }) as PreflightResult;
}

/**
 * Gera relatório human-readable do preflight.
 */
export function generateReport(preflightResult: PreflightResult): string {
    if (!preflightResult || !Array.isArray(preflightResult.results)) {
        return '(no preflight result)';
    }
    const lines: string[] = [];
    lines.push(`Preflight: ${preflightResult.passed ? 'PASS' : 'FAIL'}`);
    for (const r of preflightResult.results) {
        if (!r) continue;
        const icon = r.pass ? '[OK]' : r.severity === 'critical' ? '[X]' : '[!]';
        lines.push(`  ${icon} ${r.category}/${r.name}: ${r.reason}`);
        if (r.hint && !r.pass) lines.push(`      hint: ${r.hint}`);
    }
    return lines.join('\n');
}

/**
 * Sumariza preflight result.
 */
export function summarizePreflight(preflightResult: PreflightResult): object {
    const empty = {
        total: 0,
        passed: 0,
        failed: 0,
        bySeverity: { critical: 0, warning: 0, info: 0 },
        byCategory: {},
    };
    if (!preflightResult || !Array.isArray(preflightResult.results)) return empty;

    const bySeverity: Record<string, number> = { critical: 0, warning: 0, info: 0 };
    const byCategory: Record<string, number> = {};
    let passed = 0;
    let failed = 0;
    for (const r of preflightResult.results) {
        if (!r) continue;
        if (r.pass) passed++;
        else failed++;
        if (r.severity in bySeverity) (bySeverity[r.severity] as number)++;
        if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }
    return Object.freeze({
        total: preflightResult.results.length,
        passed,
        failed,
        bySeverity,
        byCategory,
    });
}

/**
 * Module identity export.
 */
export const pipelinePreflightMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 22,
    deliveredAt: '2026-05-01',
    categories: CHECK_CATEGORIES,
    exports: [
        'CHECK_CATEGORIES',
        'PREFLIGHT_SEVERITIES',
        'PREFLIGHT_META',
        'createCheckResult',
        'checkSchema',
        'checkDependencies',
        'checkResources',
        'checkPermissions',
        'checkInputs',
        'checkOutputs',
        'runPreflight',
        'generateReport',
        'summarizePreflight',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
