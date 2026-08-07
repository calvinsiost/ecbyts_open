// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HUB DASHBOARD AGGREGATOR — SPEC_UNCERTAINTY_HUB_CONSOLIDATION

   Pure helpers para Uncertainty Hub dashboard:
   - Uncertainty state summary (classes/sources breakdown)
   - Propagation trace grouping (driver identification)
   - Runtime/SQL drift detection §How Not Fail Again
   - Scope serializer (workspace/matrix/project)
   - Policy precedence string builder §Deterministic Policy Resolution
   - Before/after diff calculator §Journey 4

   Execução real (Supabase, UI) fica em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Scope + Precedence
// ──────────────────────────────────────────────────────────────────────

export const HUB_TABS = Object.freeze(['overview', 'propagation', 'policies', 'sensitivity', 'io', 'references']);

export const UNCERTAINTY_CLASSES = Object.freeze(['very_low', 'low', 'medium', 'high', 'very_high']);

export const POLICY_PRECEDENCE_ORDER = Object.freeze(['project_override', 'matrix', 'workspace_default']);

// Drift thresholds §Blind Spots
export const DRIFT_THRESHOLDS = Object.freeze({
    WARN: 0.1, // 10%
    BLOCK: 0.2, // 20%
});

export const POLICY_EDIT_ROLES = Object.freeze(['admin', 'professional']);

// ──────────────────────────────────────────────────────────────────────
// Uncertainty state summary
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrega observações em summary de classes Q2Q + sources.
 *
 * @param {Array<{uncertainty?: any}>} observations
 * @returns {{ byClass: Record<string, number>, bySources: Record<string, number>, total: number, declared: number }}
 */
export function summarizeUncertaintyState(observations: any) {
    /** @type {Record<string, number>} */
    const byClass: any = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
    /** @type {Record<string, number>} */
    const bySources: any = {};
    let total = 0;
    let declared = 0;

    if (!Array.isArray(observations)) return { byClass, bySources, total, declared };

    for (const obs of observations) {
        if (!obs) continue;
        total++;
        const u = obs.uncertainty;
        if (!u || typeof u !== 'object') continue;
        if (UNCERTAINTY_CLASSES.includes(u.class)) byClass[u.class]++;

        const sources = Array.isArray(u.sources) ? u.sources : [];
        if (!sources.includes('inherited')) declared++;
        for (const s of sources) {
            bySources[s] = (bySources[s] || 0) + 1;
        }
    }

    return { byClass, bySources, total, declared };
}

/**
 * @param {{total?: number, declared?: number}} summary
 * @returns {number} 0..1 (fração declarada)
 */
export function computeDeclaredRatio(summary: any) {
    if (!summary || !Number.isFinite(summary.total) || summary.total === 0) return 0;
    return (summary.declared || 0) / /** @type {number} */ (summary.total);
}

// ──────────────────────────────────────────────────────────────────────
// Propagation trace - driver identification
// ──────────────────────────────────────────────────────────────────────

/**
 * Identifica drivers dominantes da incerteza (top-N por contribution).
 *
 * @param {Array<{variable?: any, contribution?: number}>} components
 * @param {number} [components]
 * @returns {Array<any>}
 */
export function identifyDominantDrivers(components: any, topN = 5) {
    if (!Array.isArray(components)) return [];
    return components
        .filter((c) => c && Number.isFinite(c.contribution))
        .sort(
            (a, b) =>
                Math.abs(/** @type {number} */ (b.contribution)) - Math.abs(/** @type {number} */ (a.contribution)),
        )
        .slice(0, Math.max(1, topN));
}

/**
 * Agrupa propagation trace por source category.
 *
 * @param {Array<{source?: string, contribution?: number}>} trace
 * @returns {Record<string, { total: number, count: number }>}
 */
export function groupPropagationBySource(trace: any) {
    /** @type {Record<string, { total: number, count: number }>} */
    const out: any = {};
    if (!Array.isArray(trace)) return out;
    for (const t of trace) {
        if (!t || !t.source) continue;
        if (!out[t.source]) out[t.source] = { total: 0, count: 0 };
        out[t.source].total += Math.abs(Number(t.contribution) || 0);
        out[t.source].count++;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Runtime/SQL drift detection §How Not Fail Again
// ──────────────────────────────────────────────────────────────────────

/**
 * Compara resultados client-side vs SQL runtime.
 *
 * @param {number} clientValue
 * @param {number} sqlValue
 * @returns {{ delta: number, relativeDelta: number, severity: 'ok'|'warn'|'block' }}
 */
export function detectRuntimeDrift(clientValue: any, sqlValue: any) {
    const c = Number(clientValue);
    const s = Number(sqlValue);
    if (!Number.isFinite(c) || !Number.isFinite(s)) {
        return { delta: NaN, relativeDelta: NaN, severity: 'ok' };
    }
    const delta = Math.abs(c - s);
    const base = Math.max(Math.abs(c), Math.abs(s));
    const relativeDelta = base === 0 ? 0 : delta / base;
    /** @type {'ok'|'warn'|'block'} */
    let severity = 'ok';
    if (relativeDelta >= DRIFT_THRESHOLDS.BLOCK) severity = 'block';
    else if (relativeDelta >= DRIFT_THRESHOLDS.WARN) severity = 'warn';
    return { delta, relativeDelta, severity };
}

// ──────────────────────────────────────────────────────────────────────
// Policy precedence + scope §Deterministic Policy Resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Serializa scope em string canônica para telemetria.
 * @param {{workspace_id?: any, matrix?: any, project_id?: any}} scope
 * @returns {string}
 */
export function serializeScope(scope: any) {
    if (!scope || typeof scope !== 'object') return 'workspace:none/matrix:none/project:none';
    const ws = scope.workspace_id || 'none';
    const mx = scope.matrix || 'none';
    const pr = scope.project_id || 'none';
    return `workspace:${ws}/matrix:${mx}/project:${pr}`;
}

/**
 * Retorna string "project_override>matrix>workspace_default" canônica.
 * @returns {string}
 */
export function buildPrecedenceString() {
    return POLICY_PRECEDENCE_ORDER.join('>');
}

/**
 * @param {string} role
 * @returns {boolean}
 */
export function canEditPolicy(role: any) {
    return POLICY_EDIT_ROLES.includes(role);
}

// ──────────────────────────────────────────────────────────────────────
// Before/after diff §Journey 4
// ──────────────────────────────────────────────────────────────────────

/**
 * Calcula delta entre dois runs (antes/depois de policy change).
 *
 * @param {{ eis?: number, cost?: number, u_rel?: number }} before
 * @param {{ eis?: number, cost?: number, u_rel?: number }} after
 * @returns {{ eisDelta: number, costDelta: number, uRelDelta: number, severity: 'ok'|'warn'|'block' }}
 */
export function computePolicyDiff(before: any, after: any) {
    /** @type {{ eisDelta: number, costDelta: number, uRelDelta: number, severity: 'ok'|'warn'|'block' }} */
    const result = {
        eisDelta: 0,
        costDelta: 0,
        uRelDelta: 0,
        severity: 'ok',
    };
    if (!before || !after) return result;

    result.eisDelta = Number(after.eis || 0) - Number(before.eis || 0);
    result.costDelta = Number(after.cost || 0) - Number(before.cost || 0);
    result.uRelDelta = Number(after.u_rel || 0) - Number(before.u_rel || 0);

    // Severity baseado em EIS delta (mais crítico)
    const absEisDelta = Math.abs(result.eisDelta);
    if (absEisDelta >= 1.0) result.severity = 'block';
    else if (absEisDelta >= 0.5) result.severity = 'warn';
    else result.severity = 'ok';

    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Telemetry event builder
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{ policyId?: any, policyVersion?: any, scope?: any, module?: any, runtimeSqlDelta?: any }} input
 * @returns {Object|null}
 */
export function buildPolicyAppliedEvent(input: any) {
    if (!input || !input.policyId) return null;
    return {
        event: 'policy_applied',
        policy_id: input.policyId,
        policy_version: input.policyVersion || '1.0.0',
        scope: serializeScope(input.scope || {}),
        module: input.module || 'unknown',
        runtime_sql_delta: Number(input.runtimeSqlDelta) || 0,
        timestamp: new Date().toISOString(),
    };
}

/**
 * @param {{ reason?: any }} input
 * @returns {Object}
 */
export function buildPolicyFallbackEvent(input: any) {
    return {
        event: 'policy_fallback_used',
        reason: input?.reason || 'no_policy_found',
        timestamp: new Date().toISOString(),
    };
}
