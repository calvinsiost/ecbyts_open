// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EIS Drift Engine — data-integrity monitoring for weighted EIS aggregations.
 *
 * Compara o estado de agregação calculado em runtime (cliente/edge) contra o
 * "Single Source of Truth" persistido no SQL/baseline. Quando o delta excede
 * um limiar configurável, classifica a severidade do desvio (drift) para o
 * painel administrativo.
 *
 * IMPORTANTE: este módulo NÃO recalcula o EIS. Ele compara dois agregados já
 * computados — reutilizando `computeSqlEmulatedAggregate` de sqlParity.js como
 * referência determinística da fórmula geométrica ponderada (ADR-020 §4.2).
 * Detecta divergência; não altera o algoritmo de peso (ver SPEC NOT §14).
 *
 * Academic note: o threshold relativo de 5% deriva do critério de sucesso da
 * spec (detecção de desvio >5% em agregações críticas). A classificação de
 * severidade segue uma escala log-monotônica simples, alinhada à filosofia
 * não-compensatória do EIS (ADR-020): qualquer eixo divergente é material.
 */

import { computeSqlEmulatedAggregate } from './sqlParity.js';

/** Limiar relativo default (fração) acima do qual há drift. Spec §1.3 (>5%). */
export const DRIFT_DEFAULT_THRESHOLD = 0.05;

/**
 * Faixas de severidade por delta relativo (fração).
 * Não-compensatório: bandas estreitas escalam rápido para "critical".
 */
export const DRIFT_SEVERITY_BANDS = Object.freeze({
    low: 0.05, // >= threshold .. < 0.10
    med: 0.1, //  >= 0.10 .. < 0.20
    high: 0.2, //  >= 0.20 .. < 0.40
    critical: 0.4, // >= 0.40
});

/**
 * @param {*} v
 * @param {number} [fallback]
 * @returns {number}
 */
function _num(v: any, fallback = NaN) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Classify a relative delta into a severity bucket.
 * Classifica o delta relativo (fração) numa faixa de severidade.
 *
 * @param {number} relDelta - absolute relative delta (fraction, >= 0)
 * @param {number} [threshold] - drift trigger threshold (fraction)
 * @returns {'none'|'low'|'med'|'high'|'critical'}
 */
export function classifyDriftSeverity(relDelta: any, threshold = DRIFT_DEFAULT_THRESHOLD) {
    const d = _num(relDelta, 0);
    const t = _num(threshold, DRIFT_DEFAULT_THRESHOLD);
    if (!(d >= t)) return 'none';
    if (d >= DRIFT_SEVERITY_BANDS.critical) return 'critical';
    if (d >= DRIFT_SEVERITY_BANDS.high) return 'high';
    if (d >= DRIFT_SEVERITY_BANDS.med) return 'med';
    return 'low';
}

/**
 * Compute per-axis weight divergence between runtime and SQL states.
 * Compara pesos por eixo (ex: "T peso mudou de 0.5 para 0.8").
 *
 * @param {Object.<string,number>} runtimeWeights
 * @param {Object.<string,number>} sqlWeights
 * @returns {Array<{axis:string, runtime:number, sql:number, delta:number}>}
 */
export function diffWeights(runtimeWeights: any, sqlWeights: any) {
    const rw = runtimeWeights || {};
    const sw = sqlWeights || {};
    const axes = new Set([...Object.keys(rw), ...Object.keys(sw)]);
    const out = [];
    for (const axis of axes) {
        const r = _num(rw[axis], 0);
        const s = _num(sw[axis], 0);
        const delta = Math.round(Math.abs(r - s) * 1e6) / 1e6;
        if (delta > 0) out.push({ axis, runtime: r, sql: s, delta });
    }
    return out.sort((a, b) => b.delta - a.delta);
}

/**
 * Resolve a state's aggregate: explicit `aggregate` if finite, else derive
 * from scores+weights. If an explicit `aggregate` key is present but NOT
 * finite AND there are no scores to derive from, return NaN (unavailable).
 *
 * @param {{aggregate?:number,adjustedScores?:Object,weights?:Object}} state
 * @returns {number}
 */
function _resolveAggregate(state: any) {
    const hasExplicit = Object.prototype.hasOwnProperty.call(state, 'aggregate');
    const explicit = Number(state.aggregate);
    if (hasExplicit && Number.isFinite(explicit)) return Math.round(explicit * 100) / 100;
    const hasScores = state.adjustedScores && typeof state.adjustedScores === 'object';
    if (hasExplicit && !hasScores) return NaN;
    return computeSqlEmulatedAggregate(state.adjustedScores, state.weights);
}

/**
 * @typedef {Object} DriftResult
 * @property {boolean} available - whether comparison could run
 * @property {boolean} drifted - true if delta exceeds threshold
 * @property {'none'|'low'|'med'|'high'|'critical'} severity
 * @property {number} runtimeAggregate - runtime weighted aggregate (2dp)
 * @property {number} sqlAggregate - SQL/baseline weighted aggregate (2dp)
 * @property {number} delta - absolute aggregate delta (2dp)
 * @property {number} relativeDelta - delta / sqlAggregate (fraction, 4dp)
 * @property {number} threshold - trigger threshold used (fraction)
 * @property {Array<{axis:string,runtime:number,sql:number,delta:number}>} weightDrift
 * @property {string} formula
 */

/**
 * Compare a runtime aggregation state against the SQL/baseline state.
 *
 * Each state: `{ adjustedScores:{T,A,...}, weights:{T,A,...}, aggregate?:number }`.
 * If `aggregate` is omitted, it is derived via `computeSqlEmulatedAggregate`
 * (reuse of the canonical weighted geometric formula — no re-scoring).
 *
 * Resilient to NaN/null inputs per DoD §13: returns `available:false` instead
 * of throwing.
 *
 * @param {{adjustedScores?:Object,weights?:Object,aggregate?:number}} runtimeState
 * @param {{adjustedScores?:Object,weights?:Object,aggregate?:number}} sqlState
 * @param {{threshold?:number}} [opts]
 * @returns {DriftResult}
 */
export function calculateDrift(runtimeState: any, sqlState: any, opts: { threshold?: number } = {}) {
    const threshold = _num(opts.threshold, DRIFT_DEFAULT_THRESHOLD);
    const base = {
        available: false,
        drifted: false,
        severity: /** @type {'none'} */ ('none'),
        runtimeAggregate: 0,
        sqlAggregate: 0,
        delta: 0,
        relativeDelta: 0,
        threshold,
        weightDrift: /** @type {any[]} */ ([]),
        formula: 'sql-emulated-geometric-v1',
    };
    if (!runtimeState || typeof runtimeState !== 'object') return base;
    if (!sqlState || typeof sqlState !== 'object') return base;

    const rtAgg = _resolveAggregate(runtimeState);
    const sqlAgg = _resolveAggregate(sqlState);

    if (!Number.isFinite(rtAgg) || !Number.isFinite(sqlAgg)) return base;

    const delta = Math.round(Math.abs(rtAgg - sqlAgg) * 100) / 100;
    const relDelta = sqlAgg !== 0 ? Math.round((delta / Math.abs(sqlAgg)) * 1e4) / 1e4 : delta > 0 ? 1 : 0;
    const severity = classifyDriftSeverity(relDelta, threshold);

    return {
        available: true,
        drifted: severity !== 'none',
        severity,
        runtimeAggregate: rtAgg,
        sqlAggregate: sqlAgg,
        delta,
        relativeDelta: relDelta,
        threshold,
        weightDrift: diffWeights(runtimeState.weights, sqlState.weights),
        formula: 'sql-emulated-geometric-v1',
    };
}
