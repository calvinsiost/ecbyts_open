// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave EEEE1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free statistical analysis from handlers/scenarioSimulation.js
// (2083 LOC). Pure: zero document/window/state refs. Deterministic given inputs.

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

/**
 * Determine if scenario is GHG (greenhouse gas emissions) mode.
 * Caller provides scenario profile object (pre-resolved).
 *
 * @param {{tags?:string[], params?:{emissionFactorUncertainty?:number}}|null|undefined} scenario
 * @returns {boolean}
 */
export function isGhgScenarioProfile( scenario: any) {
    if (!scenario || typeof scenario !== 'object') return false;
    if (Array.isArray(scenario.tags) && scenario.tags.includes('ghg')) return true;
    const eu = scenario.params?.emissionFactorUncertainty;
    return Number.isFinite(eu) && eu > 0;
}

/**
 * Returns labels map adapted to mode (contamination vs GHG).
 * Pure: static map dispatched by boolean.
 *
 * @param {boolean} isGhg
 * @returns {{concentration:string, concentrationUnit:string, health:string, healthShort:string, compliance:string, nonCompliance:string, failureRisk:string, complianceReached:string, complianceNotReached:string}}
 */
export function getScenarioLabels( isGhg: any) {
    return {
        concentration: isGhg ? 'Emissões' : 'Concentração',
        concentrationUnit: isGhg ? 'tCO2e/yr' : 'µg/L',
        health: isGhg ? 'Score ESG' : 'Saúde Ambiental',
        healthShort: isGhg ? 'Score ESG' : 'Saúde Amb.',
        compliance: isGhg ? 'Meta atingida' : 'Conformidade',
        nonCompliance: isGhg ? 'Meta não atingida' : 'Não-conformidade',
        failureRisk: isGhg ? 'Risco Regulatório' : 'Risco de Falha',
        complianceReached: isGhg ? 'Meta de emissão atingida' : 'Conformidade atingida',
        complianceNotReached: isGhg ? 'Meta de emissão não atingida' : 'Conformidade não atingida',
    };
}

// ----------------------------------------------------------------
// Stability metrics helpers — pure numeric computations
// ----------------------------------------------------------------

function _emptyStabilityMetrics() {
    return {
        stability: 'insufficient_data',
        convergence: null,
        metrics: {
            relativeError: null,
            confidenceInterval: null,
            convergenceRate: null,
            autocorrelation: null,
            effectiveSampleSize: null,
        },
    };
}

function _extractSeries(timeline: any[], field: string): number[] {
    return timeline.map((m) => {
        const d = (m && m[field]) || {};
        return toFiniteNumber(d.p50, 0);
    });
}

function _windowMean(series: number[], start: number, end: number): number {
    const slice = series.slice(start, end);
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function _relativeError(series: number[]): number {
    const n = series.length;
    const windowSize = Math.max(1, Math.floor(n * 0.2));
    const earlyMean = _windowMean(series, 0, windowSize);
    const lateMean = _windowMean(series, n - windowSize, n);
    return Math.abs(lateMean - earlyMean) / (Math.abs(earlyMean) || 1);
}

interface ConfidenceResult {
    mean: number;
    interval: [number, number];
    margin: number;
}

function _confidenceInterval(series: number[]): ConfidenceResult {
    const n = series.length;
    const windowSize = Math.max(1, Math.floor(n * 0.3));
    const slice = series.slice(-windowSize);
    const mean = slice.reduce((a, b) => a + b, 0) / windowSize;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize;
    const stdDev = Math.sqrt(variance);
    const margin = (1.96 * stdDev) / Math.sqrt(windowSize);
    return { mean, interval: [mean - margin, mean + margin], margin };
}

function _segmentVariance(segment: number[]): number {
    if (segment.length === 0) return 0;
    const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
    return segment.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / segment.length;
}

function _segmentVariances(series: number[], segments: number): number[] {
    const segmentSize = Math.max(1, Math.floor(series.length / segments));
    const variances: number[] = [];
    for (let i = 0; i < segments; i++) {
        const start = i * segmentSize;
        const end = start + segmentSize;
        variances.push(_segmentVariance(series.slice(start, end)));
    }
    return variances;
}

function _linearRegressionSlope(y: number[]): number {
    const n = y.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += y[i]!;
        sumXY += i * y[i]!;
        sumX2 += i * i;
    }
    const denominator = n * sumX2 - sumX * sumX;
    return denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
}

function _convergenceRate(series: number[]): number {
    const segments = 5;
    const variances = _segmentVariances(series, segments);
    const slope = _linearRegressionSlope(variances);
    return -slope / (variances[0] || 1);
}

function _lag1Autocorrelation(series: number[]): number {
    const n = series.length;
    if (n <= 1) return 0;
    const mean = series.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 1; i < n; i++) {
        num += (series[i]! - mean) * (series[i - 1]! - mean);
        den += Math.pow(series[i]! - mean, 2);
    }
    return den !== 0 ? num / den : 0;
}

function _effectiveSampleSize(n: number, autocorr: number): number {
    return n / (1 + 2 * Math.abs(autocorr));
}

function _determineStability(relativeError: number, margin: number, confMean: number, convergenceRate: number): string {
    if (relativeError < 0.01 && margin / (Math.abs(confMean) || 1) < 0.05) return 'stable';
    if (relativeError < 0.05 && convergenceRate > 0.1) return 'converging';
    return 'unstable';
}

/**
 * Calculate Monte Carlo stability metrics from time series.
 * Pure statistical analysis: mean/variance/confidence interval/autocorrelation.
 *
 * Insufficient data (<10 points) → returns null metrics with 'insufficient_data' state.
 *
 * @param {Array<Record<string, any>>} timeline - Series of measurement frames
 * @param {string} field - Field to analyze (e.g. 'concentration', 'health')
 * @returns {{stability:string, convergence:any, metrics:any}}
 */
export function calculateStabilityMetrics( timeline: any, field: any) {
    if (!Array.isArray(timeline) || timeline.length < 10) {
        return _emptyStabilityMetrics();
    }
    const series = _extractSeries(timeline, field);
    const n = series.length;

    const relativeError = _relativeError(series);
    const { mean: confMean, interval: confidenceInterval, margin: marginOfError } = _confidenceInterval(series);
    const convergenceRate = _convergenceRate(series);
    const autocorr = _lag1Autocorrelation(series);
    const effectiveSampleSize = _effectiveSampleSize(n, autocorr);
    const stability = _determineStability(relativeError, marginOfError, confMean, convergenceRate);

    return {
        stability,
        convergence: {
            finalValue: confMean,
            confidenceInterval,
            relativeError,
            convergenceRate,
        },
        metrics: {
            relativeError,
            confidenceInterval,
            convergenceRate,
            autocorrelation: autocorr,
            effectiveSampleSize,
        },
    };
}
