// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   NON-DETECT HANDLING — Barrel export
   SPEC_RECONCILIATION_002_NON_DETECT v0.5

   Pure-logic core module: zero DOM, zero network, zero browser deps.
   Reference: Helsel 2012, Statistics for Censored Environmental Data.
   ================================================================ */

export { kaplanMeierLeftCensored } from './kaplanMeier.js';
export { regressionOnOrderStatistics } from './regressionOnOrderStatistics.js';
export { mannKendallCensored, _censoredPairSign } from './mannKendallCensored.js';
export { maximumLikelihoodLogNormal } from './maximumLikelihoodLogNormal.js';
export { petoPetoTwoGroup } from './petoPetoTwoGroup.js';

// ── Momentos + seleção heurística ──

interface EstimateInput {
    mean: number;
    sd: number;
    p50: number;
    p75: number;
    p95: number;
}

interface EstimateOutput {
    readonly mean: number;
    readonly sd: number;
    readonly cv: number;
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
}

/**
 * Computa momentos estatísticos (incluindo CV) a partir de resultado KM ou ROS.
 * @param {EstimateInput} estimate
 * @returns {EstimateOutput}
 * @throws {TypeError} se estimate não tem campos mean/sd numéricos
 */
export function estimateMoments(estimate: EstimateInput): EstimateOutput {
    if (!estimate || typeof estimate.mean !== 'number' || typeof estimate.sd !== 'number') {
        throw new TypeError('estimateMoments: estimate must have numeric mean and sd fields');
    }
    const { mean, sd, p50, p75, p95 } = estimate;
    const cv = mean !== 0 ? sd / mean : NaN;
    return Object.freeze({ mean, sd, cv, p50, p75, p95 });
}

interface Observation {
    value: number;
    censored: boolean;
}

interface NDMethodResult {
    readonly method: string;
    readonly rationale: string;
    readonly detectRate: number;
}

/**
 * Seleção heurística de método ND (Helsel 2012 §3.3).
 * @param {Array<Observation>} observations
 * @param {string} [matrix='groundwater'] - reservado para extensões futuras
 * @returns {NDMethodResult}
 */
export function chooseNDMethod(observations: Array<Observation>, matrix: string = 'groundwater'): NDMethodResult {
    void matrix; // reservado — heurística v0.5 é independente de matriz
    if (!Array.isArray(observations) || observations.length < 5) {
        return Object.freeze({
            method: 'insufficient_data',
            rationale: 'n < 5 — too few observations for KM or ROS',
            detectRate: observations?.length ? observations.filter((o) => !o.censored).length / observations.length : 0,
        });
    }

    const n = observations.length;
    const nDetected = observations.filter((o) => o && !o.censored).length;
    const detectRate = nDetected / n;

    if (detectRate < 0.1) {
        return Object.freeze({
            method: 'insufficient_data',
            rationale: '<10% detects — report UCL only',
            detectRate,
        });
    }
    if (detectRate < 0.5) {
        return Object.freeze({
            method: 'kaplan_meier',
            rationale: '<50% detects — KM preferred over ROS',
            detectRate,
        });
    }
    if (detectRate < 0.8) {
        return Object.freeze({
            method: 'kaplan_meier',
            rationale: '50–80% detects — KM is robust',
            detectRate,
        });
    }
    return Object.freeze({
        method: 'ros',
        rationale: '>=80% detects — ROS OLS fit reliable',
        detectRate,
    });
}

// ── Constants + validation ──

export const ND_METHODS = Object.freeze([
    'half-dl',
    'half-dl-clamp-median',
    'half-dl-clamp-geomean',
    'kaplan-meier',
    'ros',
]);

export const DETECT_RATE_THRESHOLDS = Object.freeze({
    MIN_FOR_KM: 0.5,
    MIN_FOR_ROS: 0.5,
    MIN_N_FOR_KM: 10,
    MIN_N_FOR_ROS: 8,
    WARN_BELOW: 0.3,
});

/**
 * Valida se o conjunto de observações está bem formado.
 * @param {Array<Observation>} observations
 * @returns {boolean}
 */
export function isValidObservationSet(observations: Array<Observation>): boolean {
    if (!Array.isArray(observations) || observations.length === 0) return false;
    return observations.every((o) => {
        if (!o || typeof o !== 'object') return false;
        return Number.isFinite(o.value) && o.value > 0 && typeof o.censored === 'boolean';
    });
}

/**
 * Taxa de detecção (detectados / total).
 * @param {Array<Observation>} observations
 * @returns {number}
 */
export function computeDetectRate(observations: Array<Observation>): number {
    if (!Array.isArray(observations) || observations.length === 0) return 0;
    const detected = observations.filter((o) => o && o.censored === false).length;
    return detected / observations.length;
}
