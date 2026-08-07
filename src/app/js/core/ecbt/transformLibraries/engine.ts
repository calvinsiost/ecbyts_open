// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Engine (Phase 1)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S1
 *
 * Phase 1 (2026-04-30) - motor base de aplicação de uma TransformLibrary.
 * Pure-logic, zero DOM, zero rede.
 *
 * API:
 *   applyTransform(model, library, config?)
 *     → { model, audit, errors }
 *
 *   composeTransforms([{library, config}, ...])
 *     → função (model) → Promise<{ model, audits, errors }>
 *
 * Pre/Post-conditions:
 *   - validateInputModel(): library.transform recebe um plain object
 *   - snapshot via JSON.stringify para isolar mutações in-place
 *   - audit registra duração + outcome + diff stub
 *   - throws da library viram outcome=FAILED + error code TRANSFORM_FAILED
 *   - library async é aguardada (Promise.resolve sempre)
 *
 * Owner: Claude (orquestrador)
 */

const TransformTypes = Object.freeze({
    PURE: 'pure',
    ASYNC: 'async',
});

const TransformOutcomes = Object.freeze({
    SUCCESS: 'success',
    FAILED: 'failed',
    SKIPPED: 'skipped',
});

const TransformErrorCodes = Object.freeze({
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_OUTPUT: 'INVALID_OUTPUT',
    INVALID_CONFIG: 'INVALID_CONFIG',
    INVALID_LIBRARY: 'INVALID_LIBRARY',
    UNKNOWN_LIBRARY: 'UNKNOWN_LIBRARY',
    TRANSFORM_FAILED: 'TRANSFORM_FAILED',
});

/**
 * Snapshot defensivo via JSON round-trip. Suficiente para modelos ECBT
 * que são plain JSON. Funções/Date/Map/Set não devem aparecer no model.
 */
function snapshot(value: any): any {
    if (value === null || value === undefined) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

/**
 * Valida que o input model tem shape mínimo de plain object.
 * @returns mensagem de erro ou null se ok
 */
function validateInputModel(model: any): string | null {
    if (model === null || model === undefined) return 'model is null/undefined';
    if (typeof model !== 'object') return 'model is not an object';
    if (Array.isArray(model)) return 'model is an array (expected object)';
    return null;
}

/**
 * Valida shape mínimo da library passada para applyTransform.
 */
function validateLibrary(library: any): string | null {
    if (!library || typeof library !== 'object') return 'library must be an object';
    if (typeof library.id !== 'string' || !library.id) return 'library.id missing';
    if (typeof library.transform !== 'function') return 'library.transform missing';
    return null;
}

/**
 * Build canônico do audit object.
 */
function buildAuditFrame(
    library: Record<string, any>,
    startedAt: number,
    outcome: string,
    config?: Record<string, any>,
): object {
    const finishedAt = Date.now();
    return {
        libraryId: library.id,
        libraryVersion: typeof library.version === 'string' ? library.version : '0.0.0',
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        outcome,
        diff: null,
        config: config ? { ...config } : {},
    };
}

/**
 * Aplica uma única library a um model. Retorna Promise OU valor sync -
 * se library.type === ASYNC ou retorno é thenable, encadeia await.
 *
 * Resultados:
 *   - Sucesso: { model: novoModel, audit: {outcome: SUCCESS, ...}, errors: [] }
 *   - Library inválida: { model: model, audit: {outcome: FAILED, ...}, errors: [{code: INVALID_LIBRARY,...}] }
 *   - Input inválido: { model: model, audit: {outcome: FAILED, ...}, errors: [{code: INVALID_INPUT,...}] }
 *   - Throw da library: { model: model, audit: {outcome: FAILED, ...}, errors: [{code: TRANSFORM_FAILED,...}] }
 */
export function applyTransform(
    model: any,
    library: any,
    config: any = {},
): { model: any; audit: any; errors: any[] } | Promise<{ model: any; audit: any; errors: any[] }> {
    const startedAt = Date.now();
    const errors = [];

    const libErr = validateLibrary(library);
    if (libErr) {
        errors.push({ code: TransformErrorCodes.INVALID_LIBRARY, message: libErr, details: {} });
        return {
            model,
            audit: buildAuditFrame(library || { id: '(invalid)' }, startedAt, TransformOutcomes.FAILED, config),
            errors,
        };
    }

    const inputErr = validateInputModel(model);
    if (inputErr) {
        errors.push({ code: TransformErrorCodes.INVALID_INPUT, message: inputErr, details: {} });
        return {
            model,
            audit: buildAuditFrame(library, startedAt, TransformOutcomes.FAILED, config),
            errors,
        };
    }

    // Snapshot para isolar mutação acidental do input
    const safeInput = snapshot(model);
    let result;
    try {
        result = library.transform(safeInput, config || {});
    } catch (e) {
        errors.push({
            code: TransformErrorCodes.TRANSFORM_FAILED,
            message: e instanceof Error ? e.message : String(e),
            details: { stack: e instanceof Error ? e.stack : undefined },
        });
        return {
            model,
            audit: buildAuditFrame(library, startedAt, TransformOutcomes.FAILED, config),
            errors,
        };
    }

    // Async library: aguarda Promise
    if (library.type === TransformTypes.ASYNC || (result && typeof result.then === 'function')) {
        return Promise.resolve(result)
            .then((resolved) => {
                const outErr = validateInputModel(resolved);
                if (outErr) {
                    return {
                        model,
                        audit: buildAuditFrame(library, startedAt, TransformOutcomes.FAILED, config),
                        errors: [
                            {
                                code: TransformErrorCodes.INVALID_OUTPUT,
                                message: outErr,
                                details: {},
                            },
                        ],
                    };
                }
                return {
                    model: resolved,
                    audit: buildAuditFrame(library, startedAt, TransformOutcomes.SUCCESS, config),
                    errors: [],
                };
            })
            .catch((e) => ({
                model,
                audit: buildAuditFrame(library, startedAt, TransformOutcomes.FAILED, config),
                errors: [
                    {
                        code: TransformErrorCodes.TRANSFORM_FAILED,
                        message: e instanceof Error ? e.message : String(e),
                        details: { stack: e instanceof Error ? e.stack : undefined },
                    },
                ],
            }));
    }

    // Sync result
    const outErr = validateInputModel(result);
    if (outErr) {
        errors.push({ code: TransformErrorCodes.INVALID_OUTPUT, message: outErr, details: {} });
        return {
            model,
            audit: buildAuditFrame(library, startedAt, TransformOutcomes.FAILED, config),
            errors,
        };
    }

    return {
        model: result,
        audit: buildAuditFrame(library, startedAt, TransformOutcomes.SUCCESS, config),
        errors: [],
    };
}

/**
 * Compõe múltiplas libraries em sequência. Sempre retorna Promise.
 * Para na primeira falha (consistente com Pipeline.run).
 */
export function composeTransforms(
    steps: Array<{ library: any; config?: any }> = [],
): (model: any) => Promise<{ model: any; audits: any[]; errors: any[] }> {
    if (!Array.isArray(steps)) {
        throw new TypeError('steps must be an array');
    }
    return async function runComposed(model) {
        let current = model;
        const audits = [];
        const errors = [];
        for (const step of steps) {
            const result = await Promise.resolve(applyTransform(current, step.library, step.config));
            audits.push(result.audit);
            if (result.errors.length > 0) {
                errors.push(...result.errors);
                break;
            }
            current = result.model;
        }
        return { model: current, audits, errors };
    };
}

/**
 * Module identity export.
 */
export const ecbtTransformEngineMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: 1,
    deliveredAt: '2026-04-30',
    exports: ['applyTransform', 'composeTransforms'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
