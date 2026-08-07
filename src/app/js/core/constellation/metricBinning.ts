// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Metric Binning - Phase 1.5 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.5 (2026-05-01) - pure-logic helpers para discretizar valores
 * contínuos de métricas em N bins categóricos. Útil para:
 *   - Legenda de gráfico (quantos nós em cada faixa)
 *   - Color ramp categórico (low/medium/high/critical)
 *   - Histograma compacto sem dependência de Chart.js
 *
 * Estratégias de binning suportadas:
 *   - 'equal-width': bins de largura uniforme entre min e max
 *   - 'equal-frequency' (quantis): cada bin contém ~mesmo nº de elementos
 *   - 'jenks': natural breaks (1D Jenks-Caspall, otimizado para clusters)
 *   - 'manual': bordas explícitas fornecidas pelo caller
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Estratégias canônicas. */
export const BINNING_STRATEGIES = Object.freeze({
    EQUAL_WIDTH: 'equal-width',
    EQUAL_FREQUENCY: 'equal-frequency',
    JENKS: 'jenks',
    MANUAL: 'manual',
});

/** Default bin count (5 bins → low / med-low / med / med-high / high). */
export const DEFAULT_BIN_COUNT = 5;

/** Color ramp default — 5-step viridis-like (CC0 / aproximação manual). */
export const DEFAULT_COLOR_RAMP = Object.freeze([
    '#440154', // dark purple — lowest
    '#3b528b',
    '#21918c',
    '#5ec962',
    '#fde725', // bright yellow — highest
]);

/**
 * Calcula bordas de bins igual-largura entre min e max.
 *
 * @param {number} min
 * @param {number} max
 * @param {number} count - nº de bins
 * @returns {Array<number>} bordas [b0, b1, ..., bn] (count+1 elementos)
 */
export function computeEqualWidthBinEdges(min: number, max: number, count: number = DEFAULT_BIN_COUNT): Array<number> {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError('min/max must be finite numbers');
    }
    if (!Number.isInteger(count) || count < 1) {
        throw new RangeError('count must be positive integer');
    }
    if (min === max) {
        // Degenerate - single value. Return [min, max] degenerate edges.
        return [min, max];
    }
    if (max < min) {
        [min, max] = [max, min];
    }
    const step = (max - min) / count;
    const edges = new Array(count + 1);
    for (let i = 0; i <= count; i++) {
        edges[i] = min + i * step;
    }
    edges[count] = max; // garantir borda exata sem float drift
    return edges;
}

/**
 * Calcula bordas de bins por frequência igual (quantis).
 *
 * @param {Array<number>} values
 * @param {number} count
 * @returns {Array<number>} bordas count+1 elementos
 */
export function computeEqualFrequencyBinEdges(values: Array<number>, count: number = DEFAULT_BIN_COUNT): Array<number> {
    if (!Array.isArray(values)) throw new TypeError('values must be array');
    if (!Number.isInteger(count) || count < 1) {
        throw new RangeError('count must be positive integer');
    }
    const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (finite.length === 0) return [0, 0];
    if (finite.length === 1) return [finite[0]!, finite[0]!];

    const edges = new Array(count + 1);
    edges[0] = finite[0];
    edges[count] = finite[finite.length - 1];
    for (let i = 1; i < count; i++) {
        const idx = Math.floor((i / count) * finite.length);
        edges[i] = finite[Math.min(idx, finite.length - 1)];
    }
    return edges;
}

/**
 * Aproximação 1D Jenks (natural breaks).
 * Para n pequeno (<200), iteração brute-force minimizando soma de
 * variâncias dentro do bin é suficiente. Para n maior, fallback
 * para equal-frequency.
 *
 * @param {Array<number>} values
 * @param {number} count
 * @returns {Array<number>} bordas count+1 elementos
 */
export function computeJenksBinEdges(values: Array<number>, count: number = DEFAULT_BIN_COUNT): Array<number> {
    if (!Array.isArray(values)) throw new TypeError('values must be array');
    const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
    const n = finite.length;
    if (n === 0) return [0, 0];
    if (n === 1) return [finite[0]!, finite[0]!];
    if (count >= n) return [...finite];

    // For n > 200, complexity is high - fallback to equal-frequency.
    if (n > 200) return computeEqualFrequencyBinEdges(finite, count);

    // Brute-force: try all combinations of (count-1) split points among (n-1) gaps.
    // For typical UI (count=5, n<=200), this is ~5e7 ops worst case - bounded.
    let bestSSD = Infinity;
        let bestSplits: any[]= [];

    function variance(start: any, end: any) {
        if (start >= end) return 0;
        let sum = 0;
        for (let i = start; i < end; i++) sum += finite[i]!;
        const mean = sum / (end - start);
        let v = 0;
        for (let i = start; i < end; i++) v += (finite[i]! - mean) ** 2;
        return v;
    }

    function tryRecurse(remaining: any, lastIdx: any, splits: any) {
        if (remaining === 0) {
            // Compute SSD: sum of variances in each bin.
            let ssd = 0;
            const allSplits = [0, ...splits, n];
            for (let i = 0; i < allSplits.length - 1; i++) {
                ssd += variance(allSplits[i], allSplits[i + 1]);
                if (ssd >= bestSSD) return; // prune
            }
            if (ssd < bestSSD) {
                bestSSD = ssd;
                bestSplits = [...splits];
            }
            return;
        }
        for (let i = lastIdx + 1; i <= n - remaining; i++) {
            tryRecurse(remaining - 1, i, [...splits, i]);
        }
    }

    tryRecurse(count - 1, 0, []);

    const edges = [finite[0]!];
    for (const sIdx of bestSplits) edges.push(finite[sIdx]!);
    edges.push(finite[n - 1]!);
    return edges;
}

/**
 * Atribui um valor ao bin correspondente (índice 0..count-1).
 * Valor abaixo de edges[0] vai para bin 0; acima de edges[count] vai para bin count-1.
 *
 * @param {number} value
 * @param {Array<number>} edges - count+1 elementos sortidos ASC
 * @returns {number} índice do bin (0-indexed)
 */
export function assignBin(value: number, edges: Array<number>): number {
    if (!Array.isArray(edges) || edges.length < 2) return 0;
    if (!Number.isFinite(value)) return 0;
    if (value <= edges[0]!) return 0;
    if (value >= edges[edges.length - 1]!) return edges.length - 2;
    for (let i = 1; i < edges.length; i++) {
        if (value <= edges[i]!) return i - 1;
    }
    return edges.length - 2;
}

/**
 * Computa histograma compacto: contagem por bin + bordas.
 *
 * @param {Array<number>} values
 * @param {Object} [options]
 * @param {string} [options.strategy] - BINNING_STRATEGIES
 * @param {number} [options.count]
 * @param {Array<number>} [options.edges] - manual mode
 * @returns {{edges: Array<number>, counts: Array<number>, strategy: string}}
 */
export function computeHistogram(values: Array<number>, options: { strategy?: string; count?: number; edges?: Array<number> } = {}): {edges: Array<number>, counts: Array<number>, strategy: string} {
    if (!Array.isArray(values)) throw new TypeError('values must be array');
    const strategy = options.strategy || BINNING_STRATEGIES.EQUAL_WIDTH;
    const count =
        Number.isInteger(options.count) && (options.count as number) > 0
            ? (options.count as number)
            : DEFAULT_BIN_COUNT;

    let edges;
    if (strategy === BINNING_STRATEGIES.MANUAL) {
        if (!Array.isArray(options.edges) || options.edges.length < 2) {
            throw new Error('Manual strategy requires options.edges array (length >= 2)');
        }
        edges = [...options.edges].sort((a, b) => a - b);
    } else if (strategy === BINNING_STRATEGIES.EQUAL_FREQUENCY) {
        edges = computeEqualFrequencyBinEdges(values, count);
    } else if (strategy === BINNING_STRATEGIES.JENKS) {
        edges = computeJenksBinEdges(values, count);
    } else {
        // Equal-width default
        const finite = values.filter(Number.isFinite);
        if (finite.length === 0) return { edges: [0, 0], counts: [0], strategy };
        const min = Math.min(...finite);
        const max = Math.max(...finite);
        edges = computeEqualWidthBinEdges(min, max, count);
    }

    const numBins = edges.length - 1;
    const counts = new Array(numBins).fill(0);
    for (const v of values) {
        if (Number.isFinite(v)) {
            counts[assignBin(v, edges)]++;
        }
    }
    return { edges, counts, strategy };
}

/**
 * Mapeia índice de bin para cor do ramp.
 *
 * @param {number} binIndex
 * @param {ReadonlyArray<string>} [ramp] - DEFAULT_COLOR_RAMP
 * @returns {string} cor hex
 */
export function binToColor(binIndex: number, ramp: ReadonlyArray<string> = DEFAULT_COLOR_RAMP): string {
    if (!Array.isArray(ramp) || ramp.length === 0) return '#888888';
    const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(binIndex)));
    return ramp[idx];
}

/**
 * Re-amostra ramp de cores para N steps via linear interpolation por canal RGB.
 *
 * @param {Array<string>} ramp - cores hex (#RRGGBB)
 * @param {number} steps
 * @returns {Array<string>}
 */
export function resampleColorRamp(ramp: Array<string>, steps: number): Array<string> {
    if (!Array.isArray(ramp) || ramp.length === 0) return [];
    if (!Number.isInteger(steps) || steps < 1) throw new RangeError('steps must be positive integer');
    if (steps === 1) return [ramp[0]!];

    const parsed = ramp.map(parseHexColor);
    const out = new Array(steps);
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const pos = t * (parsed.length - 1);
        const lo = Math.floor(pos);
        const hi = Math.min(lo + 1, parsed.length - 1);
        const frac = pos - lo;
        const r = Math.round(parsed[lo]![0]! + (parsed[hi]![0]! - parsed[lo]![0]!) * frac);
        const g = Math.round(parsed[lo]![1]! + (parsed[hi]![1]! - parsed[lo]![1]!) * frac);
        const b = Math.round(parsed[lo]![2]! + (parsed[hi]![2]! - parsed[lo]![2]!) * frac);
        out[i] = rgbToHex(r, g, b);
    }
    return out;
}

function parseHexColor(hex: any) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
    if (!m) return [128, 128, 128];
    const v = parseInt(m[1]!, 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function rgbToHex(r: any, g: any, b: any) {
    const clamp = (n: any) => Math.max(0, Math.min(255, Math.round(n as any)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/**
 * Module identity export.
 */
export const constellationMetricBinningMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.5',
    deliveredAt: '2026-05-01',
    strategies: ['equal-width', 'equal-frequency', 'jenks', 'manual'],
    defaultBinCount: DEFAULT_BIN_COUNT,
    exports: [
        'BINNING_STRATEGIES',
        'DEFAULT_BIN_COUNT',
        'DEFAULT_COLOR_RAMP',
        'computeEqualWidthBinEdges',
        'computeEqualFrequencyBinEdges',
        'computeJenksBinEdges',
        'assignBin',
        'computeHistogram',
        'binToColor',
        'resampleColorRamp',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
