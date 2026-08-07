// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SQL parity helpers for EIS weighted aggregation.
 *
 * Goal: provide a deterministic "SQL-emulated" aggregate score using the same
 * weighted geometric formula expected from SQL/materialized implementations, so
 * runtime outputs can be continuously checked for drift.
 */

import { EIS_FORMULA_AXIS_KEYS } from './formulaRegistry.js';

const DEFAULT_TOLERANCE = 0.005;

/**
 * @param {any} v
 * @param {number} [fallback]
 * @returns {number}
 */
function _toNum(v: any, fallback: number = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {any} v
 * @returns {number}
 */
function _round2(v: any): number {
    return Math.round(_toNum(v, 0) * 100) / 100;
}

interface AdjustedScores {
    [key: string]: number;
}

interface Weights {
    [key: string]: number;
}

/**
 * Compute weighted geometric aggregate emulating SQL expression:
 * exp(sum((w_i / sum_w) * ln(score_i)))
 *
 * @param {Object.<string, number>} adjustedScores
 * @param {Object.<string, number>} weights
 * @returns {number} score rounded to 2 decimals
 */
export function computeSqlEmulatedAggregate(adjustedScores: AdjustedScores | undefined | null, weights: Weights | undefined | null): number {
    const scores = adjustedScores || {};
    const ws = weights || {};
    const totalWeight =
        EIS_FORMULA_AXIS_KEYS.reduce(
            (acc: number, axis: string) => acc + Math.max(0, _toNum(ws[axis], 0)),
            0,
        ) || 1;

    let sum = 0;
    for (const axis of EIS_FORMULA_AXIS_KEYS) {
        const weight = Math.max(0, _toNum(ws[axis], 0));
        const note = Math.max(1e-9, _toNum(scores[axis], 0));
        sum += (weight / totalWeight) * Math.log(note);
    }
    return _round2(Math.exp(sum));
}

interface EvaluateOpts {
    tolerance?: number;
}

interface EvaluateResult {
    available: boolean;
    formula: string;
    tolerance: number;
    runtime: number;
    sqlEmulated: number;
    delta: number;
    matched: boolean;
}

/**
 * Compare canonical runtime score against SQL-emulated aggregate.
 *
 * @param {Record<string, any>} canonicalResult
 * @param {{ tolerance?: number }} [opts]
 * @returns {{available:boolean, formula:string, tolerance:number, runtime:number, sqlEmulated:number, delta:number, matched:boolean}}
 */
export function evaluateEisSqlParity(canonicalResult: Record<string, any>, opts: EvaluateOpts = {}): EvaluateResult {
    const tolerance = _toNum(opts.tolerance, DEFAULT_TOLERANCE);
    if (!canonicalResult || typeof canonicalResult !== 'object') {
        return {
            available: false,
            formula: 'sql-emulated-geometric-v1',
            tolerance,
            runtime: 0,
            sqlEmulated: 0,
            delta: 0,
            matched: false,
        };
    }

    const runtime = _round2(canonicalResult.eis);
    const sqlEmulated = computeSqlEmulatedAggregate(canonicalResult.adjustedScores, canonicalResult.weights);
    const delta = _round2(Math.abs(runtime - sqlEmulated));
    return {
        available: true,
        formula: 'sql-emulated-geometric-v1',
        tolerance,
        runtime,
        sqlEmulated,
        delta,
        matched: delta <= tolerance,
    };
}
