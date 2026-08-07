// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Lint (Phase 13)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S13
 *
 * Phase 13 (2026-05-01) - pure-logic linter de qualidade para pipelines.
 * Detecta anti-patterns, redundâncias, e desvios de best practices ANTES
 * de o pipeline ser executado.
 *
 * Regras canônicas:
 *   - dup-step: passos consecutivos com mesmo libraryId+config (idempotente?)
 *   - empty-pipeline: pipeline sem steps
 *   - duplicate-libraryId: mesmo libraryId em posições não-adjacentes (suspeito)
 *   - unknown-library: libraryId que não está no registry conhecido
 *   - missing-config: step requer config mas não tem
 *   - oversized: pipeline muito longo (>50 steps default)
 *
 * Severities: error | warning | info
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Severities canônicas. */
export const LINT_SEVERITIES = Object.freeze(['error', 'warning', 'info']);

/** Default limits. */
const DEFAULT_MAX_STEPS = 50;
// eslint-disable-next-line
const DEFAULT_MAX_CONSECUTIVE_DUPLICATES = 1;

/** Identidade do módulo. */
export const PIPELINE_LINT_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 13,
    deliveredAt: '2026-05-01',
    severities: LINT_SEVERITIES,
    rules: [
        'empty-pipeline',
        'oversized-pipeline',
        'consecutive-duplicates',
        'duplicate-libraryId-non-adjacent',
        'unknown-library',
        'missing-required-config',
        'invalid-step-shape',
    ],
});

/**
 * Compara configs profundamente.
 */
function _configsEqual(a: any, b: any) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(_canonicalize(a)) === JSON.stringify(_canonicalize(b));
}

/**
 * @param {any} value
 * @returns {any}
 */
function _canonicalize(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(_canonicalize);
    if (typeof value === 'object') {
                const sorted: Record<string, any>= {};
        for (const k of Object.keys(value).sort()) {
            sorted[k] = _canonicalize(value[k]);
        }
        return sorted;
    }
    return value;
}

/**
 * Cria objeto de finding.
 * @param {string} rule
 * @param {string} severity
 * @param {string} message
 * @param {number | null} [stepIndex]
 * @returns {{rule: string, severity: string, message: string, stepIndex: number | null}}
 */
function _finding(rule: string, severity: string, message: string, stepIndex: number | null = null): {rule: string, severity: string, message: string, stepIndex: number | null} {
    return Object.freeze({ rule, severity, message, stepIndex });
}

/**
 * Roda todas as regras de lint sobre um pipeline.
 *
 * @param {Array<{libraryId: string, config?: Record<string, any>}>} pipeline
 * @param {{knownLibraries?: Set<string>, requiredConfigs?: Map<string, Set<string>>, maxSteps?: number}} [options]
 * @returns {Array<{rule: string, severity: string, message: string, stepIndex: number | null}>}
 */
export function lintPipeline(pipeline: Array<{libraryId: string, config?: Record<string, any>}>, options: {knownLibraries?: Set<string>, requiredConfigs?: Map<string, Set<string>>, maxSteps?: number} = {}): Array<{rule: string, severity: string, message: string, stepIndex: number | null}> {
        const findings: Array<{rule: string, severity: string, message: string, stepIndex: number | null}>= [];

    if (!Array.isArray(pipeline)) {
        findings.push(_finding('invalid-step-shape', 'error', 'pipeline must be array'));
        return findings;
    }

    const maxSteps =
        Number.isInteger(options.maxSteps) && (options.maxSteps as number) > 0
            ? (options.maxSteps as number)
            : DEFAULT_MAX_STEPS;
    const knownLibraries = options.knownLibraries instanceof Set ? options.knownLibraries : null;
    const requiredConfigs = options.requiredConfigs instanceof Map ? options.requiredConfigs : null;

    // Rule: empty-pipeline
    if (pipeline.length === 0) {
        findings.push(_finding('empty-pipeline', 'warning', 'Pipeline has zero steps'));
    }

    // Rule: oversized
    if (pipeline.length > maxSteps) {
        findings.push(
            _finding(
                'oversized-pipeline',
                'warning',
                `Pipeline has ${pipeline.length} steps (max recommended: ${maxSteps})`,
            ),
        );
    }

    // Rastreia visitados para detectar non-adjacent duplicates
    const seenLibraries = new Map(); // libraryId → first index seen

    for (let i = 0; i < pipeline.length; i++) {
        const step = pipeline[i];

        // Rule: invalid-step-shape
        if (!step || typeof step !== 'object') {
            findings.push(_finding('invalid-step-shape', 'error', `Step ${i} is not an object`, i));
            continue;
        }

        const libId = String(step.libraryId || '').trim();
        if (!libId) {
            findings.push(_finding('invalid-step-shape', 'error', `Step ${i} has empty libraryId`, i));
            continue;
        }

        // Rule: unknown-library
        if (knownLibraries && !knownLibraries.has(libId)) {
            findings.push(_finding('unknown-library', 'error', `Step ${i}: unknown library "${libId}"`, i));
        }

        // Rule: missing-required-config
        if (requiredConfigs && requiredConfigs.has(libId)) {
            const required = (requiredConfigs.get(libId) as Set<string>);
            const config = step.config || {};
            for (const key of required) {
                if (!(key in config)) {
                    findings.push(
                        _finding(
                            'missing-required-config',
                            'error',
                            `Step ${i} (${libId}): missing required config key "${key}"`,
                            i,
                        ),
                    );
                }
            }
        }

        // Rule: consecutive-duplicates
        if (i > 0) {
            const prev = pipeline[i - 1];
            if (prev && prev.libraryId === libId && _configsEqual(prev.config || {}, step.config || {})) {
                findings.push(
                    _finding(
                        'consecutive-duplicates',
                        'warning',
                        `Step ${i} duplicates previous step (${libId}); idempotent?`,
                        i,
                    ),
                );
            }
        }

        // Rule: duplicate-libraryId-non-adjacent
        if (seenLibraries.has(libId)) {
            const firstIdx = seenLibraries.get(libId);
            if (i - firstIdx > 1) {
                findings.push(
                    _finding(
                        'duplicate-libraryId-non-adjacent',
                        'info',
                        `Step ${i} reuses libraryId "${libId}" (first seen at ${firstIdx})`,
                        i,
                    ),
                );
            }
        } else {
            seenLibraries.set(libId, i);
        }
    }

    return findings;
}

/**
 * Sumário de findings.
 *
 * @param {Array<any>} findings
 * @returns {{total: number, errors: number, warnings: number, infos: number, rules: Record<string, number>}}
 */
export function summarizeLintFindings(findings: Array<any>): {total: number, errors: number, warnings: number, infos: number, rules: Record<string, number>} {
    if (!Array.isArray(findings)) {
        return { total: 0, errors: 0, warnings: 0, infos: 0, rules: {} };
    }
        const rules: Record<string, number>= {};
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const f of findings) {
        if (!f) continue;
        if (f.severity === 'error') errors++;
        else if (f.severity === 'warning') warnings++;
        else if (f.severity === 'info') infos++;
        if (f.rule) rules[f.rule] = (rules[f.rule] || 0) + 1;
    }
    return {
        total: errors + warnings + infos,
        errors,
        warnings,
        infos,
        rules,
    };
}

/**
 * Filtra findings por severity.
 *
 * @param {Array<any>} findings
 * @param {string} severity - error/warning/info
 * @returns {Array<any>}
 */
export function filterFindingsBySeverity(findings: Array<any>, severity: string): Array<any> {
    if (!Array.isArray(findings)) return [];
    if (!LINT_SEVERITIES.includes(severity)) return [];
    return findings.filter((f) => f && f.severity === severity);
}

/**
 * Determina se pipeline passa nos critérios de aceitação:
 * Default: zero errors. Warnings/infos não bloqueiam.
 *
 * @param {Array<any>} findings
 * @param {{allowWarnings?: boolean}} [options]
 * @returns {{passed: boolean, blockers: Array<any>}}
 */
export function evaluateLintGate(findings: Array<any>, options: {allowWarnings?: boolean} = {}): {passed: boolean, blockers: Array<any>} {
    if (!Array.isArray(findings)) return { passed: true, blockers: [] };
    const allowWarnings = options.allowWarnings !== false;
    const blockers = findings.filter((f) => {
        if (!f) return false;
        if (f.severity === 'error') return true;
        if (!allowWarnings && f.severity === 'warning') return true;
        return false;
    });
    return { passed: blockers.length === 0, blockers };
}

/**
 * Module identity export.
 */
export const pipelineLintMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 13,
    deliveredAt: '2026-05-01',
    severities: LINT_SEVERITIES,
    exports: [
        'LINT_SEVERITIES',
        'PIPELINE_LINT_META',
        'lintPipeline',
        'summarizeLintFindings',
        'filterFindingsBySeverity',
        'evaluateLintGate',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
