// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FILTER AGGREGATIONS — funções puras de agregação estatística
   FEAT-FILTER-RADAR-001 §Q3 (defaults) + §Q7 (P95 suficiente)

   Usado pelo radar HUD e pelo painel drill-down para computar
   distribuição de indicadores ambientais por grupo.

   Convenções:
   - Todas funções são pure (sem side effects)
   - Ignoram valores não-numéricos (NaN, null, undefined, strings)
   - Retornam null quando input vazio (não 0) para distinguir "sem dados"
     de "agregado zero legítimo"
   - P95/percentis usam interpolação linear (método ANSI/EPA)
   ================================================================ */

interface AggregationEntry {
    id: string;
    fn: (values: number[]) => number | null;
    labelKey: string;
    default?: boolean;
}

/**
 * Filtra entradas numéricas válidas de um array.
 */
export function sanitizeNumbers(values: ReadonlyArray<unknown>): number[] {
    if (!Array.isArray(values)) return [];
    return values
        .filter(
            (v): v is number | string =>
                typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))),
        )
        .map((v) => Number(v))
        .filter((v: number) => Number.isFinite(v));
}

/**
 * Média aritmética. Default do radar (§Q3).
 */
export function mean(values: number[]): number | null {
    const s = sanitizeNumbers(values);
    if (s.length === 0) return null;
    return s.reduce((a, b) => a + b, 0) / s.length;
}

/**
 * Mediana (50º percentil). Robusto a outliers.
 */
export function median(values: number[]): number | null {
    const s = sanitizeNumbers(values)
        .slice()
        .sort((a, b) => a - b);
    if (s.length === 0) return null;
    const mid = Math.floor(s.length / 2);
    if (s.length % 2 === 0) {
        const lo = s[mid - 1];
        const hi = s[mid];
        if (lo === undefined || hi === undefined) return null;
        return (lo + hi) / 2;
    }
    return s[mid] ?? null;
}

/**
 * Máximo. Exigido em laudos CERCLA/RCRA + CETESB Portaria 285.
 */
export function max(values: number[]): number | null {
    const s = sanitizeNumbers(values);
    if (s.length === 0) return null;
    return Math.max(...s);
}

/**
 * Mínimo.
 */
export function min(values: number[]): number | null {
    const s = sanitizeNumbers(values);
    if (s.length === 0) return null;
    return Math.min(...s);
}

/**
 * Percentil com interpolação linear (método ANSI/EPA / Excel PERCENTILE.INC).
 *
 * @param p - Percentil em [0, 1], ex: 0.95 para P95
 */
export function percentile(values: number[], p: number): number | null {
    const s = sanitizeNumbers(values)
        .slice()
        .sort((a, b) => a - b);
    if (s.length === 0) return null;
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    if (s.length === 1) return s[0] ?? null;
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return s[lo] ?? null;
    const weight = idx - lo;
    const sLo = s[lo];
    const sHi = s[hi];
    if (sLo === undefined || sHi === undefined) return null;
    return sLo * (1 - weight) + sHi * weight;
}

/**
 * P95 (percentil 95). Default para laudos de remediação.
 */
export function p95(values: number[]): number | null {
    return percentile(values, 0.95);
}

/**
 * Desvio padrão amostral (Bessel-corrected, denominador n-1).
 */
export function stdev(values: number[]): number | null {
    const s = sanitizeNumbers(values);
    if (s.length < 2) return null;
    const mu = s.reduce((a, b) => a + b, 0) / s.length;
    const variance = s.reduce((acc, v) => acc + (v - mu) ** 2, 0) / (s.length - 1);
    return Math.sqrt(variance);
}

/**
 * Enum canônico de funções de agregação suportadas pelo radar.
 */
export const AGGREGATION_FUNCTIONS = Object.freeze({
    mean: { id: 'mean', fn: mean, labelKey: 'filter.agg.mean', default: true },
    median: { id: 'median', fn: median, labelKey: 'filter.agg.median' },
    max: { id: 'max', fn: max, labelKey: 'filter.agg.max' },
    min: { id: 'min', fn: min, labelKey: 'filter.agg.min' },
    p95: { id: 'p95', fn: p95, labelKey: 'filter.agg.p95' },
    stdev: { id: 'stdev', fn: stdev, labelKey: 'filter.agg.stdev' },
});

/**
 * Aplica agregação por ID. Fallback para 'mean' se ID inválido.
 */
export function aggregate(values: number[], aggregationId: string = 'mean'): number | null {
    const table = AGGREGATION_FUNCTIONS as unknown as Record<string, AggregationEntry>;
    const entry = table[aggregationId] || table.mean;
    if (!entry) return null;
    return entry.fn(values);
}
