// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   STATS TEMPLATES — SPEC_TIER3_FEATURES §A1

   5 templates estatísticos read-only para calculator §Q1:
   - moving-average: Análise temporal de concentrações
   - linear-regression: Tendências de contaminação
   - std-deviation: Variabilidade de dados
   - percentile-95: Compliance CONAMA (VR/VP/VI)
   - degradation-rate: Cinética contaminantes

   Implementação pura sem dep externa §Q4.
   ================================================================ */

export interface StatsTemplate {
    id: string;
    name: string;
    formula: string;
    category: string;
}

// ──────────────────────────────────────────────────────────────────────
// Templates registry
// ──────────────────────────────────────────────────────────────────────

export const STATS_TEMPLATES: ReadonlyArray<Readonly<StatsTemplate>> = Object.freeze([
    Object.freeze({
        id: 'moving-average',
        name: 'Média Móvel',
        formula: 'MA(n) = Σ(x[i-n:i]) / n',
        category: 'temporal',
    }),
    Object.freeze({
        id: 'linear-regression',
        name: 'Regressão Linear',
        formula: 'y = ax + b (OLS)',
        category: 'trend',
    }),
    Object.freeze({
        id: 'std-deviation',
        name: 'Desvio Padrão',
        formula: 'σ = √(Σ(x - x̄)² / (n-1))',
        category: 'variability',
    }),
    Object.freeze({
        id: 'percentile-95',
        name: 'Percentil 95',
        formula: 'P95 = valor ≥ 95% das amostras',
        category: 'compliance',
    }),
    Object.freeze({
        id: 'degradation-rate',
        name: 'Taxa de Degradação',
        formula: 'k = -ln(C/C0) / t (1ª ordem)',
        category: 'kinetics',
    }),
]);

export const TEMPLATE_CATEGORIES: ReadonlyArray<string> = Object.freeze([
    'temporal',
    'trend',
    'variability',
    'compliance',
    'kinetics',
]);

// ──────────────────────────────────────────────────────────────────────
// Template lookup
// ──────────────────────────────────────────────────────────────────────

export function getTemplate(id: string): Readonly<StatsTemplate> | null {
    return STATS_TEMPLATES.find((t) => t.id === id) || null;
}

export function listTemplatesByCategory(category: string): Array<Readonly<StatsTemplate>> {
    if (!TEMPLATE_CATEGORIES.includes(category)) return [];
    return STATS_TEMPLATES.filter((t) => t.category === category);
}

// ──────────────────────────────────────────────────────────────────────
// Moving Average
// ──────────────────────────────────────────────────────────────────────

/**
 * Média móvel simples. Janela flutuante de N pontos.
 * @param values
 * @param windowSize
 * @returns mesmo tamanho; primeiros N-1 são null
 */
export function movingAverage(values: number[], windowSize = 3): Array<number | null> {
    if (!Array.isArray(values) || values.length === 0) return [];
    const n = Math.max(1, Math.floor(Number(windowSize) || 3));
    const out: Array<number | null> = new Array(values.length).fill(null);
    for (let i = n - 1; i < values.length; i++) {
        let sum = 0;
        let valid = true;
        for (let j = i - n + 1; j <= i; j++) {
            const v = Number(values[j]);
            if (!Number.isFinite(v)) {
                valid = false;
                break;
            }
            sum += v;
        }
        out[i] = valid ? sum / n : null;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Linear Regression (OLS)
// ──────────────────────────────────────────────────────────────────────

/**
 * OLS linear regression.
 */
export function linearRegression(
    x: number[],
    y: number[],
): { slope: number; intercept: number; r2: number; n: number } {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
        return { slope: 0, intercept: 0, r2: 0, n: 0 };
    }
    const n = x.length;
    let sx = 0,
        sy = 0;
    for (let i = 0; i < n; i++) {
        sx += Number(x[i]) || 0;
        sy += Number(y[i]) || 0;
    }
    const mx = sx / n;
    const my = sy / n;
    let num = 0,
        den = 0,
        tot = 0;
    for (let i = 0; i < n; i++) {
        const dx = (Number(x[i]) || 0) - mx;
        const dy = (Number(y[i]) || 0) - my;
        num += dx * dy;
        den += dx * dx;
        tot += dy * dy;
    }
    if (den === 0) return { slope: 0, intercept: my, r2: 0, n };
    const slope = num / den;
    const intercept = my - slope * mx;
    const r2 = tot === 0 ? 1 : (num * num) / (den * tot);
    return { slope, intercept, r2, n };
}

// ──────────────────────────────────────────────────────────────────────
// Standard Deviation
// ──────────────────────────────────────────────────────────────────────

/**
 * Sample standard deviation (n-1 denominator).
 */
export function stdDeviation(values: number[]): { mean: number; sd: number; n: number } {
    if (!Array.isArray(values) || values.length < 2) {
        return { mean: 0, sd: 0, n: values?.length || 0 };
    }
    const nums = values.map(Number).filter(Number.isFinite);
    const n = nums.length;
    if (n < 2) return { mean: nums[0] || 0, sd: 0, n };
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    let sq = 0;
    for (const v of nums) {
        sq += (v - mean) ** 2;
    }
    return { mean, sd: Math.sqrt(sq / (n - 1)), n };
}

// ──────────────────────────────────────────────────────────────────────
// Percentile 95 §Q1 (CONAMA VR/VP/VI compliance)
// ──────────────────────────────────────────────────────────────────────

/**
 * Percentil via interpolação linear (método 7 R / numpy default).
 * @param values
 * @param p - 0..100
 */
export function percentile(values: number[], p = 95): number {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = values
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const pct = Math.max(0, Math.min(100, Number(p) || 0));
    if (sorted.length === 1) return sorted[0] ?? 0;
    const idx = (pct / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const loVal = sorted[lo] ?? 0;
    const hiVal = sorted[hi] ?? 0;
    if (lo === hi) return loVal;
    return loVal + (hiVal - loVal) * (idx - lo);
}

export function percentile95(values: number[]): number {
    return percentile(values, 95);
}

// ──────────────────────────────────────────────────────────────────────
// Degradation Rate (1st order kinetics)
// ──────────────────────────────────────────────────────────────────────

/**
 * k = -ln(C/C0) / t (primeira ordem)
 * @param c0 - concentração inicial
 * @param c - concentração em t
 * @param t - tempo decorrido
 */
export function degradationRate(
    c0: number,
    c: number,
    t: number,
): { rate: number; halfLife: number; ok: boolean } {
    const C0 = Number(c0);
    const C = Number(c);
    const T = Number(t);
    if (!Number.isFinite(C0) || !Number.isFinite(C) || !Number.isFinite(T)) {
        return { rate: 0, halfLife: Infinity, ok: false };
    }
    if (C0 <= 0 || C < 0 || T <= 0) {
        return { rate: 0, halfLife: Infinity, ok: false };
    }
    if (C >= C0) {
        return { rate: 0, halfLife: Infinity, ok: false };
    }
    const rate = -Math.log(C / C0) / T;
    const halfLife = Math.log(2) / rate;
    return { rate, halfLife, ok: true };
}
