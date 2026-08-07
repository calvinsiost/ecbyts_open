// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score — Monte Carlo band (Phase F6).
 *
 * Pure-logic Monte Carlo simulator that propagates per-entry uncertainty
 * through the V_net balance and returns percentile bands. Used when the
 * GUM tier 1 band (F3) under-represents uncertainty (skewed distributions,
 * correlated inputs, etc.). The two bands coexist:
 *
 *   - GUM (F3): cheap, deterministic, root-sum-square, ×κ-widener.
 *   - Monte Carlo (F6): probabilistic, percentile-based, distribution-agnostic.
 *
 * The MC band is intentionally a *separate* code path so consumers can pick.
 *
 * Refs:
 *  - SPEC_ECBT_SCORE_MONETARY_EIS §2 S2 + §10 A4 — "Monte Carlo (`scenarioSimulation`)
 *    para a banda quando há incerteza de input."
 *  - Saisana / Saltelli / Tarantola 2005 — uncertainty & sensitivity of composites.
 *  - Mulberry32 PRNG (deterministic seedable) + Box-Muller (Gaussian).
 *
 * Anti-requirements honoured:
 *  - N2: κ does NOT enter the sum; it stays an external band-widener.
 *  - N7/N8: denominator is caller-declared; we never fabricate one.
 *  - Seed is captured in the result so runs are reproducible.
 */

export interface FinancialEntryStochastic {
    readonly value: number;
    readonly uncertaintyFraction?: number;
    /** Optional distribution; defaults to 'normal'. */
    readonly distribution?: 'normal' | 'uniform' | 'triangular';
}

export type Mode = 'marketIntensity' | 'returnOnCost' | 'extension' | 'absolute';

export interface MonteCarloEcbtInput {
    readonly assets: ReadonlyArray<FinancialEntryStochastic>;
    readonly liabilities: ReadonlyArray<FinancialEntryStochastic>;
    readonly mode?: Mode | string;
    readonly denominator?: { kind?: string; value: number };
    /** Number of iterations; default 1000, clamped to [50, 100_000]. */
    readonly iterations?: number;
    /** Seed for the PRNG; default 42 (deterministic). */
    readonly seed?: number;
}

export interface MonteCarloBandVM {
    readonly iterations: number;
    readonly seed: number;
    readonly mode: Mode;
    /** Statistics on V_net (absolute, currency-agnostic) — always present. */
    readonly amount: {
        readonly mean: number;
        readonly std: number;
        readonly p05: number;
        readonly p50: number;
        readonly p95: number;
    };
    /** Statistics on pct = V_net / denominator × 100. `null` if mode='absolute'. */
    readonly pct:
        | null
        | {
              readonly mean: number;
              readonly std: number;
              readonly p05: number;
              readonly p50: number;
              readonly p95: number;
          };
    readonly denominatorKind: string | null;
    readonly denominator: number | null;
}

// ─── PRNG + distribution samplers ─────────────────────────────────────────────

/**
 * Mulberry32 PRNG — deterministic, seedable, fast. Same algorithm used
 * across `core/analytics/optimization/` and `core/random/`. Exposed so
 * tests can validate sample distributions in isolation.
 */
export function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return function () {
        let t = (s += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Box-Muller transform → N(mean, sigma). */
export function sampleNormal(
    rng: () => number,
    mean: number,
    sigma: number,
): number {
    if (!Number.isFinite(sigma) || sigma <= 0) return mean;
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
}

/** Symmetric triangular distribution centred at `mean`, full-width 2·spread. */
function sampleTriangular(
    rng: () => number,
    mean: number,
    spread: number,
): number {
    if (!Number.isFinite(spread) || spread <= 0) return mean;
    const u = rng() + rng();
    // u ∈ [0,2]; centre at 1 → shift to [-1, +1]
    return mean + (u - 1) * spread;
}

/** Uniform on [mean − spread, mean + spread]. */
function sampleUniform(
    rng: () => number,
    mean: number,
    spread: number,
): number {
    if (!Number.isFinite(spread) || spread <= 0) return mean;
    return mean + (rng() * 2 - 1) * spread;
}

function sampleEntry(
    rng: () => number,
    entry: FinancialEntryStochastic,
): number {
    const v = Number(entry?.value);
    if (!Number.isFinite(v)) return 0;
    const uf = Number(entry?.uncertaintyFraction);
    if (!Number.isFinite(uf) || uf <= 0) return v;
    const sigma = Math.abs(v) * Math.min(uf, 1);
    switch (entry?.distribution) {
        case 'triangular':
            return sampleTriangular(rng, v, sigma);
        case 'uniform':
            return sampleUniform(rng, v, sigma);
        case 'normal':
        default:
            return sampleNormal(rng, v, sigma);
    }
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function clampInt(value: number, lo: number, hi: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const truncated = Math.trunc(n);
    if (truncated < lo) return lo;
    if (truncated > hi) return hi;
    return truncated;
}

function meanOf(values: number[]): number {
    if (values.length === 0) return 0;
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
}

function stdOf(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    let s = 0;
    for (const v of values) {
        const d = v - mean;
        s += d * d;
    }
    return Math.sqrt(s / (values.length - 1));
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(sorted.length * p)),
    );
    return sorted[idx] as number;
}

function statsOf(values: number[]) {
    if (values.length === 0) {
        return { mean: 0, std: 0, p05: 0, p50: 0, p95: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const m = meanOf(values);
    return {
        mean: m,
        std: stdOf(values, m),
        p05: percentile(sorted, 0.05),
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const VALID_MODES: Mode[] = ['marketIntensity', 'returnOnCost', 'extension', 'absolute'];

interface ParsedMonteCarloInput {
    readonly assets: ReadonlyArray<FinancialEntryStochastic>;
    readonly liabilities: ReadonlyArray<FinancialEntryStochastic>;
    readonly iterations: number;
    readonly seed: number;
    readonly mode: Mode;
    readonly denominator: { kind?: string; value: number } | undefined;
    readonly denomValue: number | null;
    readonly wantPct: boolean;
}

function parseMonteCarloInput(input: MonteCarloEcbtInput): ParsedMonteCarloInput {
    const assets = Array.isArray(input.assets) ? input.assets : [];
    const liabilities = Array.isArray(input.liabilities) ? input.liabilities : [];
    const iterations = clampInt(input.iterations ?? 1000, 50, 100_000, 1000);
    const seedRaw = Number(input.seed);
    const seed = Number.isFinite(seedRaw) ? Math.trunc(seedRaw) : 42;
    const mode: Mode = VALID_MODES.includes(input.mode as Mode)
        ? (input.mode as Mode)
        : 'absolute';
    const denominator = input.denominator;
    const denomValue =
        denominator && Number.isFinite(denominator.value) && denominator.value !== 0
            ? denominator.value
            : null;
    const wantPct = mode !== 'absolute' && denomValue !== null;
    return {
        assets,
        liabilities,
        iterations,
        seed,
        mode,
        denominator,
        denomValue,
        wantPct,
    };
}

function sumSampledEntries(
    rng: () => number,
    entries: ReadonlyArray<FinancialEntryStochastic>,
): number {
    let sum = 0;
    for (const e of entries) sum += sampleEntry(rng, e);
    return sum;
}

interface SimulationSamples {
    readonly amountSamples: number[];
    readonly pctSamples: number[];
}

function runMonteCarloSimulation(
    rng: () => number,
    assets: ReadonlyArray<FinancialEntryStochastic>,
    liabilities: ReadonlyArray<FinancialEntryStochastic>,
    iterations: number,
    denomValue: number | null,
    wantPct: boolean,
): SimulationSamples {
    const amountSamples: number[] = new Array(iterations);
    const pctSamples: number[] = wantPct ? new Array(iterations) : [];
    for (let i = 0; i < iterations; i++) {
        const vNet = sumSampledEntries(rng, assets) - sumSampledEntries(rng, liabilities);
        amountSamples[i] = vNet;
        if (wantPct && denomValue !== null) {
            pctSamples[i] = (vNet / denomValue) * 100;
        }
    }
    return { amountSamples, pctSamples };
}

function buildMonteCarloVM(
    parsed: ParsedMonteCarloInput,
    samples: SimulationSamples,
): MonteCarloBandVM {
    return Object.freeze({
        iterations: parsed.iterations,
        seed: parsed.seed,
        mode: parsed.mode,
        amount: Object.freeze(statsOf(samples.amountSamples)),
        pct: parsed.wantPct ? Object.freeze(statsOf(samples.pctSamples)) : null,
        denominatorKind: parsed.denominator?.kind ?? null,
        denominator: parsed.denomValue,
    });
}

/**
 * Run Monte Carlo on V_net and pct and return percentile band statistics.
 * Deterministic for a given seed. Returns a frozen VM.
 */
export function monteCarloEcbtScore(input: MonteCarloEcbtInput): MonteCarloBandVM {
    if (!input || typeof input !== 'object') {
        throw new TypeError('monteCarloEcbtScore: input is required');
    }
    const parsed = parseMonteCarloInput(input);
    const rng = mulberry32(parsed.seed);
    const samples = runMonteCarloSimulation(
        rng,
        parsed.assets,
        parsed.liabilities,
        parsed.iterations,
        parsed.denomValue,
        parsed.wantPct,
    );
    return buildMonteCarloVM(parsed, samples);
}
