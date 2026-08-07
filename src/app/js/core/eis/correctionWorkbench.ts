// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EIS CORRECTION WORKBENCH — SPEC_EIS_CORRECTION_WORKBENCH

   Pure batch correction engine. Validation fail-closed + grouping +
   apply + audit record. UI layer (workbench modal) em handlers.

   Whitelists restritivas (§Q3):
   - 4 issues (validity, uniqueness, uncertainty, exception)
   - 5 groupBy dimensions
   - 6 fields editáveis
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Whitelists (§6 Contracts)
// ──────────────────────────────────────────────────────────────────────

/** @type {ReadonlyArray<string>} */
export const ALLOWED_ISSUES = Object.freeze(['validity', 'uniqueness', 'uncertainty', 'exception']);
/** @type {ReadonlyArray<string>} */
export const ALLOWED_GROUPINGS = Object.freeze(['element', 'family', 'parameter', 'sample_type', 'event_type']);
/** @type {ReadonlyArray<string>} */
export const ALLOWED_FIELDS = Object.freeze([
    'sample_type',
    'qa_pair_id',
    'event_type',
    'event_severity',
    'exception_justification',
    'uncertainty',
]);

// ──────────────────────────────────────────────────────────────────────
// Request validation (fail-closed §8.1)
// ──────────────────────────────────────────────────────────────────────

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * @typedef {{ valid: boolean, errors: string[] }} ValidationResult
 */

/**
 * Valida CorrectionBatchRequest. Fail-closed = rejeita por default.
 *
 * @param {unknown} req
 * @returns {ValidationResult}
 */
export function validateCorrectionRequest(req: unknown): ValidationResult {
    const errors: string[] = [];
    if (!req || typeof req !== 'object') {
        return { valid: false, errors: ['request not object'] };
    }
    const r = /** @type {Record<string, unknown>} */ (req) as Record<string, unknown>;
    const issue = String(r.issue);
    const groupBy = String(r.groupBy);
    const field = String(r.field);
    if (!ALLOWED_ISSUES.includes(issue)) errors.push(`issue not allowed: ${r.issue}`);
    if (!ALLOWED_GROUPINGS.includes(groupBy)) errors.push(`groupBy not allowed: ${r.groupBy}`);
    if (!ALLOWED_FIELDS.includes(field)) errors.push(`field not allowed: ${r.field}`);
    if (r.groupValue == null || r.groupValue === '') errors.push('groupValue required');
    if (r.value === undefined) errors.push('value required');

    // Domain checks por field (§7 blind spots - severidade com valor inválido)
    if (field === 'event_severity') {
        const valid = ['low', 'medium', 'high', 'critical'];
        if (!valid.includes(String(r.value).toLowerCase())) {
            errors.push(`event_severity must be one of: ${valid.join(', ')}`);
        }
    }
    if (field === 'uncertainty') {
        const n = Number(r.value);
        if (!Number.isFinite(n) || n < 0) errors.push('uncertainty must be a finite number ≥0');
    }

    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Grouping (§5 Group by + list values)
// ──────────────────────────────────────────────────────────────────────

interface GroupBucket {
    count: number;
    observations: unknown[];
}

/**
 * @typedef {{ count: number, observations: unknown[] }} GroupBucket
 */

/**
 * Agrupa observações por dimensão (§Q2: 5 dimensões canônicas).
 *
 * @param {unknown[]} observations
 * @param {string} groupBy
 * @returns {Map<string, GroupBucket>}
 */
export function groupObservations(observations: unknown[], groupBy: string): Map<string, GroupBucket> {
    const out = new Map<string, GroupBucket>();
    if (!Array.isArray(observations)) return out;
    if (!ALLOWED_GROUPINGS.includes(groupBy)) return out;

    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const row = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
        const key = row[groupBy];
        if (key == null) continue;
        const keyStr = String(key);
        if (!out.has(keyStr)) out.set(keyStr, { count: 0, observations: [] });
        const bucket = out.get(keyStr)!;
        bucket.count++;
        bucket.observations.push(obs);
    }
    return out;
}

interface GroupValue {
    value: string;
    count: number;
}

/**
 * @typedef {{ value: string, count: number }} GroupValue
 */

/**
 * Retorna lista ordenada de grupos com count para UI dropdown.
 *
 * @param {unknown[]} observations
 * @param {string} groupBy
 * @returns {GroupValue[]}
 */
export function listGroupValues(observations: unknown[], groupBy: string): GroupValue[] {
    const grouped = groupObservations(observations, groupBy);
    return Array.from(grouped.entries())
        .map(([value, { count }]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
}

// ──────────────────────────────────────────────────────────────────────
// Batch apply (§8.2 toast com count alterados)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} field
 * @param {unknown} value
 * @returns {unknown}
 */
function _normalizeValue(field: string, value: unknown): unknown {
    if (field === 'uncertainty') return Number(value);
    if (field === 'event_severity') return String(value).toLowerCase();
    return value;
}

interface BatchResult {
    updatedObservations: unknown[];
    changedCount: number;
    skippedCount: number;
    auditEntry: unknown;
    errors: string[];
}

/**
 * @typedef {{
 *   updatedObservations: unknown[],
 *   changedCount: number,
 *   skippedCount: number,
 *   auditEntry: unknown,
 *   errors: string[]
 * }} BatchResult
 */

/**
 * Aplica correção batch. Puro - não muta observations entrada.
 *
 * @param {unknown[]} observations
 * @param {unknown} req
 * @returns {BatchResult}
 */
export function applyBatchCorrection(observations: unknown[], req: unknown): BatchResult {
    const validation = validateCorrectionRequest(req);
    if (!validation.valid) {
        return {
            updatedObservations: observations || [],
            changedCount: 0,
            skippedCount: 0,
            auditEntry: null,
            errors: validation.errors,
        };
    }

    const request = /** @type {Record<string, unknown>} */ (req) as Record<string, unknown>;
    const field = String(request.field);
    const groupBy = String(request.groupBy);
    const groupValue = request.groupValue;
    const normalizedValue = _normalizeValue(field, request.value);
    const updated: unknown[] = [];
    let changedCount = 0;
    let skippedCount = 0;

    for (const obs of Array.isArray(observations) ? observations : []) {
        if (!obs || typeof obs !== 'object') {
            skippedCount++;
            continue;
        }
        const o = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
        const groupKey = o[groupBy];
        if (groupKey == null || String(groupKey) !== String(groupValue)) {
            updated.push(obs);
            continue;
        }
        // In-group → aplicar correção (cópia nova)
        if (o[field] === normalizedValue) {
            // já igual, não conta como changed
            updated.push(obs);
            continue;
        }
        updated.push({ ...o, [field]: normalizedValue });
        changedCount++;
    }

    const auditEntry = Object.freeze({
        timestamp: new Date().toISOString(),
        issue: request.issue,
        groupBy,
        groupValue: String(groupValue),
        field,
        value: normalizedValue,
        changedCount,
        skippedCount,
    });

    return {
        updatedObservations: updated,
        changedCount,
        skippedCount,
        auditEntry,
        errors: [],
    };
}

// ──────────────────────────────────────────────────────────────────────
// Preview / Simulation (gap audit 2026-04-23 - projects EIS delta before apply)
// ──────────────────────────────────────────────────────────────────────

/**
 * Mapa campo → eixo EIS primário impactado. Derivado de ADR EIS §3CTA+.
 *
 * @type {Readonly<Record<string, string | null>>}
 */
export const FIELD_TO_AXIS: Readonly<Record<string, string | null>> = Object.freeze({
    sample_type: null, // QA/QC metadata — indirect (Cm via taxonomia)
    qa_pair_id: null, // pairing only — indirect
    event_type: null, // classification — indirect
    event_severity: null, // severity tag — indirect
    exception_justification: 'T', // traceability/transparency evidence
    uncertainty: 'A', // accuracy envelope
});

/** @type {ReadonlyArray<string>} */
const EIS_AXES_LOCAL = Object.freeze(['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm']);
/** @type {Readonly<Record<string, number>>} */
const DEFAULT_WEIGHTS_LOCAL = Object.freeze({ T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 });

/**
 * @param {unknown} breakdown
 * @returns {boolean}
 */
function _validateBreakdown(breakdown: unknown): boolean {
    if (!breakdown || typeof breakdown !== 'object') return false;
    const b = /** @type {Record<string, unknown>} */ (breakdown) as Record<string, unknown>;
    for (const axis of EIS_AXES_LOCAL) {
        const v = b[axis];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 5) return false;
    }
    return true;
}

/**
 * @param {Record<string, number>} scores
 * @param {Record<string, number>} number>
 * @returns {number}
 */
function _geomEis(scores: Record<string, number>, weights: Record<string, number>): number {
    const totalW = EIS_AXES_LOCAL.reduce((acc, a) => acc + (weights[a] || 0), 0) || 1;
    let raw = 1;
    for (const axis of EIS_AXES_LOCAL) {
        const s = Math.max(1, Math.min(5, scores[axis]!));
        raw *= Math.pow(s, (weights[axis] || 0) / totalW);
    }
    return parseFloat(raw.toFixed(2));
}

/**
 * @param {string} axis
 * @param {unknown[]} updatedObservations
 * @param {number} currentScore
 * @returns {number}
 */
function _projectAxis(axis: string, updatedObservations: unknown[], currentScore: number): number {
    if (axis === 'A') {
        let checked = 0;
        let lowPrecision = 0;
        for (const obs of updatedObservations) {
            if (obs == null || typeof obs !== 'object') continue;
            const o = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
            if (o.uncertainty == null) continue;
            checked++;
            const u = Number(o.uncertainty);
            const v = Number(o.value ?? 0);
            if (!Number.isFinite(u) || u < 0) continue;
            const rel = o.uncertaintyType === 'relative' ? u : v !== 0 ? Math.abs(u / v) * 100 : u;
            if (rel > 50) lowPrecision++;
        }
        if (checked === 0) return currentScore;
        const ratio = 1 - lowPrecision / checked;
        if (ratio >= 0.95) return 5;
        if (ratio >= 0.8) return 4;
        if (ratio >= 0.6) return 3;
        if (ratio >= 0.4) return 2;
        return 1;
    }
    if (axis === 'T') {
        let total = 0;
        let justified = 0;
        for (const obs of updatedObservations) {
            if (obs == null || typeof obs !== 'object') continue;
            const o = /** @type {Record<string, unknown>} */ (obs) as Record<string, unknown>;
            total++;
            const jv = o.exception_justification;
            if (jv != null && String(jv).trim() !== '') justified++;
        }
        if (total === 0) return currentScore;
        const ratio = justified / total;
        // Blend suave: mantém score base e adiciona bônus até +1.5 por cobertura
        const blended = currentScore + ratio * 1.5;
        return Math.max(1, Math.min(5, parseFloat(blended.toFixed(2))));
    }
    return currentScore;
}

interface PreviewOptions {
    workbenchState?: { observations?: unknown[] };
    batchRequest?: unknown;
    currentEisBreakdown?: Record<string, number>;
    weights?: Record<string, number>;
}

interface PreviewResult {
    predictedEisAfter: number;
    currentEis: number;
    eisDelta: number;
    deltaByAxis: Readonly<Record<string, number>>;
    projectedBreakdown: Readonly<Record<string, number>>;
    affectedRecordCount: number;
    warnings: ReadonlyArray<string>;
    errors: ReadonlyArray<string>;
    valid: boolean;
}

/**
 * @typedef {{
 *   workbenchState?: { observations?: unknown[] },
 *   batchRequest?: unknown,
 *   currentEisBreakdown?: Record<string, number>,
 *   weights?: Record<string, number>
 * }} PreviewOptions
 */

/**
 * @typedef {{
 *   predictedEisAfter: number,
 *   currentEis: number,
 *   eisDelta: number,
 *   deltaByAxis: Readonly<Record<string, number>>,
 *   projectedBreakdown: Readonly<Record<string, number>>,
 *   affectedRecordCount: number,
 *   warnings: ReadonlyArray<string>,
 *   errors: ReadonlyArray<string>,
 *   valid: boolean
 * }} PreviewResult
 */

/**
 * Preview pure-math de uma correção batch: projeta EIS antes de aplicar.
 *
 * @param {unknown} opts
 * @returns {PreviewResult}
 */
export function previewBatchCorrection(opts: unknown): PreviewResult {
    /** @type {string[]} */
    const warnings: string[] = [];
    /** @type {string[]} */
    const errors: string[] = [];

    if (!opts || typeof opts !== 'object') {
        return Object.freeze({
            predictedEisAfter: 0,
            currentEis: 0,
            eisDelta: 0,
            deltaByAxis: Object.freeze({}),
            projectedBreakdown: Object.freeze({}),
            affectedRecordCount: 0,
            warnings: Object.freeze([]),
            errors: Object.freeze(['opts required']),
            valid: false,
        });
    }

    /** @type {PreviewOptions} */
    const options = opts as PreviewOptions;
    const { workbenchState, batchRequest, currentEisBreakdown } = options;
    /** @type {Record<string, number>} */
    const weights =
        options.weights && typeof options.weights === 'object' ? { ...options.weights } : { ...DEFAULT_WEIGHTS_LOCAL };

    // 1) validar request
    const validation = validateCorrectionRequest(batchRequest);
    if (!validation.valid) {
        return Object.freeze({
            predictedEisAfter: 0,
            currentEis: 0,
            eisDelta: 0,
            deltaByAxis: Object.freeze({}),
            projectedBreakdown: Object.freeze({}),
            affectedRecordCount: 0,
            warnings: Object.freeze([]),
            errors: Object.freeze(validation.errors.slice()),
            valid: false,
        });
    }

    // 2) validar breakdown
    if (!_validateBreakdown(currentEisBreakdown)) {
        errors.push('currentEisBreakdown must contain all 6 axes with scores 1..5');
        return Object.freeze({
            predictedEisAfter: 0,
            currentEis: 0,
            eisDelta: 0,
            deltaByAxis: Object.freeze({}),
            projectedBreakdown: Object.freeze({}),
            affectedRecordCount: 0,
            warnings: Object.freeze([]),
            errors: Object.freeze(errors),
            valid: false,
        });
    }

    const requestRecord = /** @type {Record<string, unknown>} */ (batchRequest) as Record<string, unknown>;
    const requestGroupBy = String(requestRecord.groupBy);
    const requestGroupValue = String(requestRecord.groupValue);
    const requestField = String(requestRecord.field);
    const currentBreakdown = /** @type {Record<string, number>} */ (
        currentEisBreakdown
    ) as Record<string, number>;

    const observations = Array.isArray(workbenchState?.observations) ? workbenchState.observations : [];
    if (observations.length === 0) {
        warnings.push('empty observation set — preview returns breakdown as-is');
    }

    // 3) simular aplicação (pure)
    const simulated = applyBatchCorrection(observations, batchRequest);
    const affectedRecordCount = simulated.changedCount;

    if (affectedRecordCount === 0) {
        warnings.push(`no observations matched groupBy=${requestGroupBy} groupValue=${requestGroupValue}`);
    }

    // 4) mapear campo → eixo
    const targetAxis = FIELD_TO_AXIS[requestField] ?? null;
    if (targetAxis == null) {
        warnings.push(`field '${requestField}' has no direct EIS axis impact — predicted delta = 0`);
    }

    // 5) projetar axis scores
    /** @type {Record<string, number>} */
    const projectedBreakdown = { ...currentBreakdown };
    if (targetAxis != null && affectedRecordCount > 0) {
        projectedBreakdown[targetAxis] = _projectAxis(
            targetAxis,
            simulated.updatedObservations,
            currentBreakdown[targetAxis]!,
        );
    }

    // 6) recomputar EIS
    const currentEis = _geomEis(currentBreakdown, weights);
    const predictedEisAfter = _geomEis(projectedBreakdown, weights);
    const eisDelta = parseFloat((predictedEisAfter - currentEis).toFixed(2));

    // 7) deltas por eixo
    /** @type {Record<string, number>} */
    const deltaByAxis: Record<string, number> = {};
    for (const axis of EIS_AXES_LOCAL) {
        deltaByAxis[axis] = parseFloat((projectedBreakdown[axis]! - currentBreakdown[axis]!).toFixed(2));
    }

    return Object.freeze({
        predictedEisAfter,
        currentEis,
        eisDelta,
        deltaByAxis: Object.freeze(deltaByAxis),
        projectedBreakdown: Object.freeze(projectedBreakdown),
        affectedRecordCount,
        warnings: Object.freeze(warnings),
        errors: Object.freeze(errors),
        valid: true,
    });
}
