// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Color Map - Phase 1.48 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S48
 *
 * Phase 1.48 (2026-05-02) - pure-logic mapeamento numeric → hex color
 * via gradient (linear ou stops). Suporta:
 *   - linearGradient (start, end colors)
 *   - stopsGradient ([{stop, color}])
 *   - categorical map por groupKey
 *
 * NÃO depende de browser. Sem DOM/canvas/Three.js.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export type GradientFn = (t: number) => string;

export interface GradientStop {
    stop: number;
    color: string;
}

/** Identidade do módulo. */
export const COLOR_MAP_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.48',
    deliveredAt: '2026-05-02',
} as const;

/**
 * Parse #rrggbb / #rgb / rgb int.
 * @param c
 */
export function parseColor(c: string | number | unknown): RGB | null {
    if (typeof c === 'number') {
        return { r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff };
    }
    if (typeof c !== 'string') return null;
    const s = c.trim().replace(/^#/, '');
    if (s.length === 3) {
        const c0 = s[0] ?? '0';
        const c1 = s[1] ?? '0';
        const c2 = s[2] ?? '0';
        return {
            r: parseInt(c0 + c0, 16),
            g: parseInt(c1 + c1, 16),
            b: parseInt(c2 + c2, 16),
        };
    }
    if (s.length === 6) {
        return {
            r: parseInt(s.slice(0, 2), 16),
            g: parseInt(s.slice(2, 4), 16),
            b: parseInt(s.slice(4, 6), 16),
        };
    }
    return null;
}

/**
 * Format {r,g,b} → '#rrggbb'.
 * @param c?
 */
export function formatColor(c?: RGB | null): string {
    if (!c) return '#000000';
    const r = Math.max(0, Math.min(255, Math.round(c.r))).toString(16).padStart(2, '0');
    const g = Math.max(0, Math.min(255, Math.round(c.g))).toString(16).padStart(2, '0');
    const b = Math.max(0, Math.min(255, Math.round(c.b))).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/**
 * Lerp entre 2 cores.
 * @param a
 * @param b
 * @param t
 */
export function lerpColor(a: string | number | unknown, b: string | number | unknown, t: number): string {
    const A = parseColor(a);
    const B = parseColor(b);
    if (!A || !B) return '#000000';
    const tt = Math.max(0, Math.min(1, t));
    return formatColor({
        r: A.r + (B.r - A.r) * tt,
        g: A.g + (B.g - A.g) * tt,
        b: A.b + (B.b - A.b) * tt,
    });
}

/**
 * Linear gradient: value normalizado [0,1] → cor.
 * @param start
 * @param end
 */
export function linearGradient(start: string | number | unknown, end: string | number | unknown): GradientFn {
    return (t: number) => lerpColor(start, end, t);
}

/**
 * Stops gradient: [{stop:0..1, color}].
 * @param stops
 */
export function stopsGradient(stops: Array<GradientStop> | unknown): GradientFn {
    if (!Array.isArray(stops) || stops.length < 2) {
        return () => '#000000';
    }
    const sortedStops = stops as Array<GradientStop>;
    const sorted = sortedStops
        .filter((s: unknown): s is GradientStop => 
            !!s && 
            typeof s === 'object' && 
            'stop' in s && 
            'color' in s && 
            Number.isFinite((s as any).stop) && 
            typeof (s as any).color === 'string'
        )
        .slice()
        .sort((a, b) => a.stop - b.stop);

    if (sorted.length < 2) return () => '#000000';
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) return () => '#000000';
    return (t: number) => {
        const tt = Math.max(0, Math.min(1, t));
        if (tt <= first.stop) return first.color;
        if (tt >= last.stop) return last.color;
        for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i];
            const b = sorted[i + 1];
            if (!a || !b) continue;
            if (tt >= a.stop && tt <= b.stop) {
                const local = (tt - a.stop) / (b.stop - a.stop);
                return lerpColor(a.color, b.color, local);
            }
        }
        return last.color;
    };
}

/**
 * Mapeia value contra [min, max] via gradient fn.
 * @param value
 * @param min
 * @param max
 * @param gradientFn
 */
export function mapValue(value: number, min: number, max: number, gradientFn: GradientFn): string {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return '#000000';
    if (typeof gradientFn !== 'function') return '#000000';
    if (max === min) return gradientFn(0.5);
    const t = (value - min) / (max - min);
    return gradientFn(t);
}

/**
 * Categorical map: cada groupKey value mapeia para color fixa do palette.
 * @param groupKeys
 * @param palette
 */
export function categoricalMap(groupKeys: Array<unknown>, palette: Array<string>): Readonly<Record<string, string>> {
    if (!Array.isArray(groupKeys) || !Array.isArray(palette) || palette.length === 0) {
        return Object.freeze({});
    }
    const map: Record<string, string> = {};
    let i = 0;
    for (const k of groupKeys) {
        if (k === undefined || k === null) continue;
        const key = String(k);
        if (map[key]) continue;
        const color = palette[i % palette.length];
        if (color === undefined) continue;
        map[key] = color;
        i++;
    }
    return Object.freeze(map);
}

/**
 * Sumariza color map.
 * @param map?
 */
export function summarizeColorMap(map?: Record<string, string> | null): { entries: number; uniqueColors: number } {
    const empty = { entries: 0, uniqueColors: 0 };
    if (!map || typeof map !== 'object') return empty;
    const entries = Object.keys(map).length;
    const colors = new Set(Object.values(map));
    return Object.freeze({ entries, uniqueColors: colors.size });
}

/**
 * Module identity export.
 */
export const nodeColorMapMeta = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.48',
    deliveredAt: '2026-05-02',
    exports: [
        'COLOR_MAP_META',
        'parseColor',
        'formatColor',
        'lerpColor',
        'linearGradient',
        'stopsGradient',
        'mapValue',
        'categoricalMap',
        'summarizeColorMap',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;