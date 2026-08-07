// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Correction Batch Engine — Pure-Logic Slice P1-4
   Motor de correção em lote para o EIS Correction Workbench.

   Aplica atualizações de campo a observações filtradas por grupo,
   produz trilha de auditoria imutável e suporta modo dry-run.

   Spec: docs/specs/features/SPEC_EIS_CORRECTION_WORKBENCH.md
   ================================================================ */

// ================================================================
// CONSTANTES PÚBLICAS
// ================================================================

/**
 * Campos de observação que podem ser corrigidos via batch.
 *
 * @type {ReadonlyArray<string>}
 */
export const VALID_CORRECTION_FIELDS = Object.freeze([
    'sample_type',
    'qa_pair_id',
    'event_type',
    'event_severity',
    'exception_justification',
    'uncertainty',
]);

/**
 * Campos de agrupamento aceitos para filtro de correspondência.
 *
 * @type {ReadonlyArray<string>}
 */
export const VALID_GROUP_BY_FIELDS = Object.freeze(['element', 'family', 'parameter', 'sample_type', 'event_type']);

/**
 * Conjunto de tipos de issue aceitos.
 *
 * @type {ReadonlySet<string>}
 */
const VALID_ISSUES = Object.freeze(new Set(['validity', 'uniqueness', 'uncertainty', 'exception']));

// ================================================================
// VALIDAÇÃO DE REQUEST
// ================================================================

interface CorrectionRequest {
    issue: string;
    groupBy: string;
    groupValue: string;
    field: string;
    value: string | number;
}

interface RequestValidation {
    valid: boolean;
    errors: ReadonlyArray<string>;
}

/**
 * @typedef {{
 *   issue: string,
 *   groupBy: string,
 *   groupValue: string,
 *   field: string,
 *   value: string | number
 * }} CorrectionRequest
 */

/**
 * @typedef {{ valid: boolean, errors: ReadonlyArray<string> }} RequestValidation
 */

/**
 * Valida um CorrectionRequest.
 *
 * @param {unknown} request
 * @returns {RequestValidation}
 */
export function validateCorrectionRequest(request: unknown): RequestValidation {
    const errors: string[] = [];

    if (!request || typeof request !== 'object') {
        return Object.freeze({ valid: false, errors: ['request must be a non-null object'] });
    }

    const req = /** @type {CorrectionRequest} */ (request) as CorrectionRequest;

    // Validar issue
    if (!VALID_ISSUES.has(req.issue)) {
        errors.push(`invalid issue "${req.issue}"; must be one of: ${[...VALID_ISSUES].join(', ')}`);
    }

    // Validar groupBy
    if (!VALID_GROUP_BY_FIELDS.includes(req.groupBy)) {
        errors.push(`invalid groupBy "${req.groupBy}"; must be one of: ${VALID_GROUP_BY_FIELDS.join(', ')}`);
    }

    // Validar groupValue
    if (typeof req.groupValue !== 'string' || req.groupValue.trim() === '') {
        errors.push('groupValue must be a non-empty string');
    }

    // Validar field
    if (!VALID_CORRECTION_FIELDS.includes(req.field)) {
        errors.push(`invalid field "${req.field}"; must be one of: ${VALID_CORRECTION_FIELDS.join(', ')}`);
    }

    // Validar value
    if (req.value === null || req.value === undefined) {
        errors.push('value must be present (non-null, non-undefined)');
    }

    // Validação especial: uncertainty deve ser número em [0, 1]
    if (req.field === 'uncertainty' && errors.length === 0) {
        const u = req.value;
        if (typeof u !== 'number' || u < 0 || u > 1) {
            errors.push(`uncertainty value must be a number in [0, 1], got "${u}"`);
        }
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

// ================================================================
// CORRESPONDÊNCIA DE OBSERVAÇÕES
// ================================================================

interface MatchResult {
    matched: ReadonlyArray<unknown>;
    unmatched: ReadonlyArray<unknown>;
    matchCount: number;
    unmatchedCount: number;
}

/**
 * @typedef {{
 *   matched: ReadonlyArray<unknown>,
 *   unmatched: ReadonlyArray<unknown>,
 *   matchCount: number,
 *   unmatchedCount: number
 * }} MatchResult
 */

/**
 * Separa observações em matched/unmatched de acordo com o groupBy/groupValue da request.
 *
 * @param {Array<unknown>} observations
 * @param {unknown} request
 * @returns {MatchResult}
 */
export function matchObservations(observations: Array<unknown>, request: unknown): MatchResult {
    if (!Array.isArray(observations)) {
        throw new TypeError('observations must be an array');
    }

    const req = /** @type {CorrectionRequest} */ (request) as CorrectionRequest;
    const { groupBy, groupValue } = req;
    const matched: unknown[] = [];
    const unmatched: unknown[] = [];

    for (const obs of observations) {
        const row = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
        if (row[groupBy] === groupValue) {
            matched.push(obs);
        } else {
            unmatched.push(obs);
        }
    }

    return Object.freeze({
        matched: Object.freeze(matched),
        unmatched: Object.freeze(unmatched),
        matchCount: matched.length,
        unmatchedCount: unmatched.length,
    });
}

// ================================================================
// CRIAÇÃO DE ENTRADA DE AUDITORIA
// ================================================================

interface AuditParams {
    request: CorrectionRequest;
    matchCount: number;
    modifiedCount: number;
    skippedCount: number;
    appliedBy: string;
}

/**
 * @typedef {{
 *   request: CorrectionRequest,
 *   matchCount: number,
 *   modifiedCount: number,
 *   skippedCount: number,
 *   appliedBy: string
 * }} AuditParams
 */

/**
 * Cria um registro de auditoria imutável para uma operação de correção em lote.
 *
 * @param {AuditParams} params
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createCorrectionAuditEntry(
    { request, matchCount, modifiedCount, skippedCount, appliedBy }: AuditParams,
): Readonly<Record<string, unknown>> {
    const id = `correction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return Object.freeze({
        id,
        requestedAt: new Date().toISOString(),
        issue: request.issue,
        groupBy: request.groupBy,
        groupValue: request.groupValue,
        field: request.field,
        value: request.value,
        matchCount,
        modifiedCount,
        skippedCount,
        appliedBy: appliedBy ?? 'system',
    });
}

// ================================================================
// APLICAÇÃO EM LOTE
// ================================================================

interface BatchOptions {
    appliedBy?: string;
    dryRun?: boolean;
}

interface BatchResult {
    corrected: ReadonlyArray<unknown>;
    audit: Readonly<Record<string, unknown>>;
}

/**
 * @typedef {{ appliedBy?: string, dryRun?: boolean }} BatchOptions
 */

/**
 * @typedef {{ corrected: ReadonlyArray<unknown>, audit: Readonly<Record<string, unknown>> }} BatchResult
 */

/**
 * Aplica correções em lote às observações que atendem ao critério da request.
 * Nunca muta o array original - retorna sempre cópias.
 *
 * @param {Array<unknown>} observations
 * @param {unknown} request
 * @param {BatchOptions} [opts]
 * @returns {BatchResult}
 */
export function applyBatchCorrection(
    observations: Array<unknown>,
    request: unknown,
    opts: BatchOptions = {},
): BatchResult {
    // Validar request antes de qualquer operação
    const validation = validateCorrectionRequest(request);
    if (!validation.valid) {
        throw new TypeError(`Invalid CorrectionRequest: ${validation.errors.join('; ')}`);
    }

    if (!Array.isArray(observations)) {
        throw new TypeError('observations must be an array');
    }

    const { appliedBy = 'system', dryRun = false } = opts;
    const req = /** @type {CorrectionRequest} */ (request) as CorrectionRequest;
    const { field, value, groupBy, groupValue } = req;

    let matchCount = 0;
    let modifiedCount = 0;
    let skippedCount = 0;

    // Construir array corrigido sem mutar originais
    const corrected = observations.map((obs) => {
        const o = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
        if (o[groupBy] !== groupValue) {
            // Observação fora do grupo - retorna referência original (não muta)
            return obs;
        }

        matchCount++;

        if (o[field] === value) {
            // Valor idêntico - nenhuma alteração necessária
            skippedCount++;
            return obs;
        }

        modifiedCount++;
        // Criar novo objeto com o campo atualizado
        return Object.assign({}, obs, { [field]: value });
    });

    const audit = createCorrectionAuditEntry({
        request: req,
        matchCount,
        modifiedCount,
        skippedCount,
        appliedBy,
    });

    // Em dry-run, o resultado é o mesmo (já não mutamos) - apenas registramos semanticamente
    void dryRun; // utilizado para documentar a intenção; comportamento já é imutável

    return Object.freeze({
        corrected: Object.freeze(corrected),
        audit,
    });
}

// ================================================================
// DIFF DE OBSERVAÇÕES CORRIGIDAS
// ================================================================

interface DiffResult {
    changes: ReadonlyArray<Record<string, unknown>>;
    unchanged: number;
    totalChanged: number;
    totalUnchanged: number;
}

/**
 * @typedef {{
 *   changes: ReadonlyArray<Record<string, unknown>>,
 *   unchanged: number,
 *   totalChanged: number,
 *   totalUnchanged: number
 * }} DiffResult
 */

/**
 * Compara arrays original e corrigido, retornando mudanças campo a campo.
 *
 * @param {Array<unknown>} original
 * @param {Array<unknown>} corrected
 * @returns {DiffResult}
 */
export function diffCorrectedObservations(original: Array<unknown>, corrected: Array<unknown>): DiffResult {
    if (!Array.isArray(original) || !Array.isArray(corrected)) {
        throw new TypeError('original and corrected must be arrays');
    }
    if (original.length !== corrected.length) {
        throw new TypeError(`arrays must have equal length; got ${original.length} vs ${corrected.length}`);
    }

    // Construir mapa por id para diff eficiente
    const correctedById = new Map<unknown, unknown>();
    for (const obs of corrected) {
        const row = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
        correctedById.set(row.id, obs);
    }

    /** @type {Array<Record<string, unknown>>} */
    const changes: Array<Record<string, unknown>> = [];
    let totalUnchanged = 0;

    for (const orig of original) {
        const o = /** @type {Record<string, unknown>} */ (orig) as Record<string, unknown>;
        const corr = correctedById.get(o.id);
        if (!corr) {
            // id não encontrado no array corrigido - ignorar silenciosamente (não deveria ocorrer)
            totalUnchanged++;
            continue;
        }
        const c = /** @type {Record<string, unknown>} */ (corr) as Record<string, unknown>;

        // Encontrar campos que diferem (exceto id)
        let changed = false;
        const allKeys = new Set([...Object.keys(o), ...Object.keys(c)]);
        for (const key of allKeys) {
            if (key === 'id') continue;
            if (o[key] !== c[key]) {
                changes.push(
                    Object.freeze({
                        id: o.id,
                        field: key,
                        before: o[key],
                        after: c[key],
                    }),
                );
                changed = true;
            }
        }

        if (!changed) {
            totalUnchanged++;
        }
    }

    // Ordenar mudanças por id para resultado determinístico
    changes.sort((a, b) => String((a as Record<string, unknown>).id).localeCompare(String((b as Record<string, unknown>).id)));

    const totalChanged = original.length - totalUnchanged;

    return Object.freeze({
        changes: Object.freeze(changes),
        unchanged: totalUnchanged,
        totalChanged,
        totalUnchanged,
    });
}
