// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// Q2Q-001 - Qualitative Scale to Quantitative Distribution Mapper
// Maps named qualitative levels (Likert, confidence, severity) to normal distribution
// parameters suitable for Monte Carlo simulation and GUM-compatible uncertainty propagation.
//
// Academic references:
//   - BIPM/JCGM 100:2008 GUM §4.3 - Type B evaluation from expert judgement
//   - ISO 31010:2019 §B.15 - Expert elicitation and qualitative-to-quantitative mapping
//   - Vose (2008) "Risk Analysis" Ch.6 - Encoding expert uncertainty as distributions
//
// Design: each qualitative level maps to a Normal(mean, stdDev) where
//   mean  = (value / maxValue) * 100          [percentage scale 0–100]
//   stdDev decreases as value increases        [higher levels → more certain about high value]
// min/max clamp the sampling domain to prevent unrealistic tails.

interface Distribution {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    distribution: 'normal';
}

interface ScaleLevel {
    label: string;
    value: number;
}

interface SampleSummary {
    mean: number;
    stdDev: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    min: number;
    max: number;
}

/**
 * Canonical scale identifiers.
 */
export const QUALITATIVE_SCALES: Readonly<{ LIKERT_5: string; LIKERT_7: string; CONFIDENCE: string; SEVERITY: string }> = Object.freeze({
    LIKERT_5: 'likert5',
    LIKERT_7: 'likert7',
    CONFIDENCE: 'confidence',
    SEVERITY: 'severity',
});

// ---------------------------------------------------------------------------
// Scale definitions - frozen at module load
// ---------------------------------------------------------------------------

/**
 * Level descriptor shape:
 *   {label: string, value: number}
 *
 * Distribution parameters are derived lazily by mapToDistribution().
 * Storing only label+value keeps SCALE_DEFINITIONS minimal and auditable.
 */
export const SCALE_DEFINITIONS: Record<string, ReadonlyArray<Readonly<ScaleLevel>>> = Object.freeze({
    [QUALITATIVE_SCALES.LIKERT_5]: Object.freeze([
        Object.freeze({ label: 'strongly_disagree', value: 1 }),
        Object.freeze({ label: 'disagree', value: 2 }),
        Object.freeze({ label: 'neutral', value: 3 }),
        Object.freeze({ label: 'agree', value: 4 }),
        Object.freeze({ label: 'strongly_agree', value: 5 }),
    ]),
    [QUALITATIVE_SCALES.LIKERT_7]: Object.freeze([
        Object.freeze({ label: 'strongly_disagree', value: 1 }),
        Object.freeze({ label: 'disagree', value: 2 }),
        Object.freeze({ label: 'somewhat_disagree', value: 3 }),
        Object.freeze({ label: 'neutral', value: 4 }),
        Object.freeze({ label: 'somewhat_agree', value: 5 }),
        Object.freeze({ label: 'agree', value: 6 }),
        Object.freeze({ label: 'strongly_agree', value: 7 }),
    ]),
    [QUALITATIVE_SCALES.CONFIDENCE]: Object.freeze([
        Object.freeze({ label: 'very_low', value: 1 }),
        Object.freeze({ label: 'low', value: 2 }),
        Object.freeze({ label: 'medium', value: 3 }),
        Object.freeze({ label: 'high', value: 4 }),
        Object.freeze({ label: 'very_high', value: 5 }),
    ]),
    [QUALITATIVE_SCALES.SEVERITY]: Object.freeze([
        Object.freeze({ label: 'negligible', value: 1 }),
        Object.freeze({ label: 'minor', value: 2 }),
        Object.freeze({ label: 'moderate', value: 3 }),
        Object.freeze({ label: 'major', value: 4 }),
        Object.freeze({ label: 'catastrophic', value: 5 }),
    ]),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the level entry for a given scale + label.
 * Returns null if scale or label is unknown.
 */
function _resolveLevel(scale: string, levelLabel: string): { label: string; value: number } | null {
    const levels = SCALE_DEFINITIONS[scale];
    if (!levels) return null;
    const norm = String(levelLabel || '')
        .trim()
        .toLowerCase();
    return levels.find((l) => l.label === norm) || null;
}

/**
 * Compute stdDev for a given value position on a scale.
 * Rationale: stdDev should reflect residual ambiguity - extreme ends
 * (value=1 or value=maxValue) are chosen with more intent than middle levels.
 *
 * Formula: stdDev = BASE_SD * (1 - abs(2*(v/max) - 1) * 0.4)
 *   → middle level (v/max=0.5) → BASE_SD (maximum uncertainty)
 *   → extreme levels (v/max→0 or 1) → BASE_SD * 0.6 (minimum uncertainty)
 *
 * BASE_SD is 15 percentage-points, chosen so that 95% CI (±2σ) spans ±30pp
 * which aligns with the IPCC "likely" range convention (66–100%).
 *
 * @param value     1-based level value.
 * @param maxValue  Maximum value on the scale.
 * @returns stdDev in percentage-point units.
 */
function _computeStdDev(value: number, maxValue: number): number {
    const BASE_SD = 15;
    const normalized = value / maxValue; // 0..1
    const centrality = Math.abs(2 * normalized - 1); // 0 at middle, 1 at extremes
    return BASE_SD * (1 - centrality * 0.4);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map a qualitative level to normal distribution parameters.
 *
 * Returns a distribution object on a 0–100 percentage scale so that
 * callers can interpret it independently of the source scale's range.
 *
 * @param scale       One of QUALITATIVE_SCALES values.
 * @param levelLabel  Exact label string from SCALE_DEFINITIONS.
 * @throws {RangeError} If scale or levelLabel is not recognised.
 */
export function mapToDistribution(scale: string, levelLabel: string): Distribution {
    const level = _resolveLevel(scale, levelLabel);
    if (!level) {
        throw new RangeError(`mapToDistribution: unknown scale "${scale}" or level "${levelLabel}"`);
    }
    const levels = SCALE_DEFINITIONS[scale] as ReadonlyArray<Readonly<ScaleLevel>>;
    const maxValue = (levels[levels.length - 1] as Readonly<ScaleLevel>).value;
    const mean = (level.value / maxValue) * 100;
    const stdDev = _computeStdDev(level.value, maxValue);
    // Clamp domain: 2 stdDev below/above mean, bounded to [0, 100].
    const min = Math.max(0, mean - 2 * stdDev);
    const max = Math.min(100, mean + 2 * stdDev);

    return { mean, stdDev, min, max, distribution: 'normal' };
}

/**
 * Sample n values from Normal(mean, stdDev) using the Box-Muller transform,
 * clamped to [min, max].
 *
 * Box-Muller reference: Box & Muller (1958) "A Note on the Generation of
 * Random Normal Deviates", The Annals of Mathematical Statistics, 29(2).
 *
 * @param distribution
 * @param n=1000   Number of samples.
 * @returns Clamped samples.
 */
export function monteCarloSample(distribution: { mean: number; stdDev: number; min: number; max: number }, n = 1000): Float64Array {
    const { mean, stdDev, min, max } = distribution;
    const samples = new Float64Array(n);
    const TWO_PI = 2 * Math.PI;

    let i = 0;
    while (i < n) {
        // Box-Muller: generate 2 independent standard normals per iteration.
        let u1;
        // Avoid u1 === 0 (log(0) = -Infinity).
        do {
            u1 = Math.random();
        } while (u1 === 0);
        const u2 = Math.random();

        const mag = stdDev * Math.sqrt(-2 * Math.log(u1));
        const z0 = mag * Math.cos(TWO_PI * u2) + mean;
        const z1 = mag * Math.sin(TWO_PI * u2) + mean;

        samples[i] = Math.max(min, Math.min(max, z0));
        i++;
        if (i < n) {
            samples[i] = Math.max(min, Math.min(max, z1));
            i++;
        }
    }
    return samples;
}

/**
 * Element-wise aggregate two Float64Array sample sets.
 *
 * @throws {RangeError} If arrays differ in length or operation is unknown.
 */
export function aggregateQ2QSamples(samples1: Float64Array, samples2: Float64Array, operation: 'add' | 'multiply' | 'max' | 'min'): Float64Array {
    if (samples1.length !== samples2.length) {
        throw new RangeError(`aggregateQ2QSamples: length mismatch (${samples1.length} vs ${samples2.length})`);
    }
    const n = samples1.length;
    const result = new Float64Array(n);

    switch (operation) {
        case 'add':
            for (let i = 0; i < n; i++) result[i] = samples1[i]! + samples2[i]!;
            break;
        case 'multiply':
            for (let i = 0; i < n; i++) result[i] = samples1[i]! * samples2[i]!;
            break;
        case 'max':
            for (let i = 0; i < n; i++) result[i] = Math.max(samples1[i]!, samples2[i]!);
            break;
        case 'min':
            for (let i = 0; i < n; i++) result[i] = Math.min(samples1[i]!, samples2[i]!);
            break;
        default:
            throw new RangeError(
                `aggregateQ2QSamples: unknown operation "${operation}". ` + `Valid: add | multiply | max | min`,
            );
    }
    return result;
}

/**
 * Compute descriptive statistics and percentiles from a sample array.
 *
 * Percentiles via sort + index: p_k = sorted[floor(k/100 * (n-1))]
 * (nearest-rank method, consistent with NIST Engineering Statistics Handbook).
 */
export function summarizeSamples(samples: Float64Array | number[]): SampleSummary {
    const n = samples.length;
    if (n === 0) {
        throw new RangeError('summarizeSamples: empty sample array');
    }

    // Sorted copy for percentile computation.
    const sorted = Float64Array.from(samples).sort();

    // Mean and stdDev.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[i]!;
    const mean = sum / n;

    let variance = 0;
    for (let i = 0; i < n; i++) {
        const d = samples[i]! - mean;
        variance += d * d;
    }
    const stdDev = Math.sqrt(variance / n); // population stdDev (consistent with MC output)

    /**
     * Nearest-rank percentile helper.
     * @param p  Percentile 0–100.
     */
    function pctile(p: number): number {
        const idx = Math.floor((p / 100) * (n - 1));
        return sorted[Math.max(0, Math.min(n - 1, idx))]!;
    }

    return {
        mean,
        stdDev,
        p5: pctile(5),
        p25: pctile(25),
        p50: pctile(50),
        p75: pctile(75),
        p95: pctile(95),
        min: sorted[0]!,
        max: sorted[n - 1]!,
    };
}

/**
 * Score an array of qualitative responses: for each response, map to distribution,
 * run Monte Carlo (n=200), and summarise.
 *
 * @throws {RangeError} If any response contains an invalid scale/level.
 */
export function scoreQ2QUncertainty(qualResponses: Array<{ scale: string; level: string }>): Array<{ scale: string; level: string; distribution: Distribution; samples: Float64Array; summary: SampleSummary }> {
    if (!Array.isArray(qualResponses)) {
        throw new TypeError('scoreQ2QUncertainty: qualResponses must be an array');
    }
    return qualResponses.map((resp, idx) => {
        const { scale, level } = resp;
        let distribution;
        try {
            distribution = mapToDistribution(scale, level);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new RangeError(`scoreQ2QUncertainty[${idx}]: ${msg}`, { cause: err });
        }
        const samples = monteCarloSample(distribution, 200);
        const summary = summarizeSamples(samples);
        return { scale, level, distribution, samples, summary };
    });
}
