// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Sparkline - Phase 1.24 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S24
 *
 * Phase 1.24 (2026-05-01) - pure-logic sparkline (micro-chart) generator
 * para inline trend visualization adjacente a nodes da constelação.
 *
 * Estratégia:
 *   - Series: array de números (timeseries)
 *   - Path generators: line / area / bar
 *   - Stats: min/max/last/delta/trend
 *   - SVG path string output (caller renderiza)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */
// --- scout: typedef -> TS declarations (runtime-noop) ---
type SparklineType = 'line' | 'area' | 'bar';
type TrendDirection = 'up' | 'down' | 'flat';
interface SparklineStats {
    count: number;
    min: number;
    max: number;
    mean: number;
    last: number;
    first: number;
    delta: number;
    range: number;
    trend: TrendDirection;
}
// --- end scout declarations ---


/**
 * @typedef {'line' | 'area' | 'bar'} SparklineType
 * @typedef {'up' | 'down' | 'flat'} TrendDirection
 */

/** Sparkline types. */
/** @type {ReadonlyArray<SparklineType>} */
export const SPARKLINE_TYPES = Object.freeze(['line', 'area', 'bar']);

/** Trend directions canônicas. */
/** @type {ReadonlyArray<TrendDirection>} */
export const TREND_DIRECTIONS = Object.freeze(['up', 'down', 'flat']);

/** Identidade do módulo. */
export const SPARKLINE_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.24',
    deliveredAt: '2026-05-01',
    types: SPARKLINE_TYPES,
});

/**
 * Verifica se type é canônico.
 *
 * @param {unknown} type
 * @returns {boolean}
 */
export function isValidType(type: unknown): boolean {
    return typeof type === 'string' && SPARKLINE_TYPES.includes((type as SparklineType));
}

/**
 * @typedef {Object} SparklineStats
 * @property {number} count
 * @property {number} min
 * @property {number} max
 * @property {number} mean
 * @property {number} last
 * @property {number} first
 * @property {number} delta
 * @property {number} range
 * @property {TrendDirection} trend
 */

/**
 * Computa stats de série.
 *
 * @param {ReadonlyArray<number>} series
 * @returns {SparklineStats}
 */
export function computeStats(series: ReadonlyArray<number>): SparklineStats {
        const empty: SparklineStats= {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        last: 0,
        first: 0,
        delta: 0,
        range: 0,
        trend: 'flat',
    };
    if (!Array.isArray(series) || series.length === 0) return empty;
    const valid = (series.filter( /** @param {number} v */ (v) => Number.isFinite(v), ) as number[]);
    if (valid.length === 0) return empty;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const sum = valid.reduce(
        /**
         * @param {number} a
         * @param {number} b
         */
        (a, b) => a + b,
        0,
    );
    const mean = sum / valid.length;
    const first = valid[0]!;
    const last = valid[valid.length - 1]!;
    const delta = last - first;
    const range = max - min;
        let trend: TrendDirection= 'flat';
    if (range > 0) {
        const threshold = range * 0.05;
        if (delta > threshold) trend = 'up';
        else if (delta < -threshold) trend = 'down';
    }
    return Object.freeze({
        count: valid.length,
        min,
        max,
        mean,
        last,
        first,
        delta,
        range,
        trend,
    });
}

/**
 * Mapeia série para coordenadas (x, y) de viewport WxH.
 *
 * @param {ReadonlyArray<number>} series
 * @param {{width: number, height: number}} viewport
 * @returns {ReadonlyArray<Readonly<{x: number, y: number}>>}
 */
export function mapToViewport(series: ReadonlyArray<number>, viewport: {width: number, height: number}): ReadonlyArray<Readonly<{x: number, y: number}>> {
    if (!Array.isArray(series) || !viewport) return [];
    const w = Number.isFinite(viewport.width) ? viewport.width : 100;
    const h = Number.isFinite(viewport.height) ? viewport.height : 30;
    const valid = (series.filter( /** @param {number} v */ (v) => Number.isFinite(v), ) as number[]);
    if (valid.length === 0) return [];
    if (valid.length === 1) {
        return [Object.freeze({ x: w / 2, y: h / 2 })];
    }
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    return Object.freeze(
        valid.map(
            /**
             * @param {number} v
             * @param {number} i
             */
            (v, i) => {
                const x = (i / (valid.length - 1)) * w;
                const y = h - ((v - min) / range) * h;
                return Object.freeze({ x, y });
            },
        ),
    );
}

/**
 * Gera SVG path para sparkline line.
 *
 * @param {ReadonlyArray<{x: number, y: number}>} points
 * @returns {string}
 */
export function buildLinePath(points: ReadonlyArray<{x: number, y: number}>): string {
    if (!Array.isArray(points) || points.length === 0) return '';
    const parts = points
        .map(
            /**
             * @param {{x: number, y: number}} p
             * @param {number} i
             */
            (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`,
        )
        .join(' ');
    return parts;
}

/**
 * Gera SVG path para sparkline area (line + bottom edges).
 *
 * @param {ReadonlyArray<{x: number, y: number}>} points
 * @param {number} height - viewport height
 * @returns {string}
 */
export function buildAreaPath(points: ReadonlyArray<{x: number, y: number}>, height: number): string {
    if (!Array.isArray(points) || points.length === 0) return '';
    const linePath = buildLinePath(points);
    const last = points[points.length - 1];
    const first = points[0];
    return `${linePath} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`;
}

/**
 * Gera bars como rect specs.
 *
 * @param {ReadonlyArray<number>} series
 * @param {{width: number, height: number}} viewport
 * @returns {ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>>}
 */
export function buildBars(series: ReadonlyArray<number>, viewport: {width: number, height: number}): ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>> {
    if (!Array.isArray(series) || !viewport) return [];
    const valid = (series.filter( /** @param {number} v */ (v) => Number.isFinite(v), ) as number[]);
    if (valid.length === 0) return [];
    const w = Number.isFinite(viewport.width) ? viewport.width : 100;
    const h = Number.isFinite(viewport.height) ? viewport.height : 30;
    const min = Math.min(0, ...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const barWidth = w / valid.length;
    const barGap = barWidth * 0.1;
    const barW = Math.max(1, barWidth - barGap);

    return Object.freeze(
        valid.map(
            /**
             * @param {number} v
             * @param {number} i
             */
            (v, i) => {
                const barH = ((v - min) / range) * h;
                return Object.freeze({
                    x: i * barWidth,
                    y: h - barH,
                    width: barW,
                    height: barH,
                });
            },
        ),
    );
}

/**
 * Gera sparkline completo (path + stats + viewport).
 *
 * @param {ReadonlyArray<number>} series
 * @param {{type?: string, viewport?: {width: number, height: number}}} [options]
 * @returns {Readonly<{type: SparklineType, path: string, bars: ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>>, points: ReadonlyArray<Readonly<{x: number, y: number}>>, stats: SparklineStats, viewport: Readonly<{width: number, height: number}>}>}
 */
export function generateSparkline(series: ReadonlyArray<number>, options: {type?: string, viewport?: {width: number, height: number}} = {}): Readonly<{type: SparklineType, path: string, bars: ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>>, points: ReadonlyArray<Readonly<{x: number, y: number}>>, stats: SparklineStats, viewport: Readonly<{width: number, height: number}>}> {
    const empty = {
        type: ('line' as SparklineType),
        path: '',
        bars: ([] as ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>>),
        points: ([] as ReadonlyArray<Readonly<{x: number, y: number}>>),
        stats: computeStats([]),
        viewport: { width: 0, height: 0 },
    };
    if (!Array.isArray(series)) return Object.freeze(empty);
        const type: SparklineType= isValidType(options.type) ? (options.type as SparklineType) : 'line';
    const viewport = options.viewport || { width: 100, height: 30 };
    const w = Number.isFinite(viewport.width) ? viewport.width : 100;
    const h = Number.isFinite(viewport.height) ? viewport.height : 30;
    const stats = computeStats(series);
    const points = mapToViewport(series, { width: w, height: h });

    let path = '';
        let bars: ReadonlyArray<Readonly<{x: number, y: number, width: number, height: number}>>= [];
    if (type === 'line') {
        path = buildLinePath(points);
    } else if (type === 'area') {
        path = buildAreaPath(points, h);
    } else if (type === 'bar') {
        bars = buildBars(series, { width: w, height: h });
    }

    return Object.freeze({
        type,
        path,
        bars,
        points,
        stats,
        viewport: Object.freeze({ width: w, height: h }),
    });
}

/**
 * Module identity export.
 */
export const sparklineMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.24',
    deliveredAt: '2026-05-01',
    types: SPARKLINE_TYPES,
    exports: [
        'SPARKLINE_TYPES',
        'TREND_DIRECTIONS',
        'SPARKLINE_META',
        'isValidType',
        'computeStats',
        'mapToViewport',
        'buildLinePath',
        'buildAreaPath',
        'buildBars',
        'generateSparkline',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
