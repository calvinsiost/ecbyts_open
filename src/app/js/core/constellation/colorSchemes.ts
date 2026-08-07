// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Color Schemes - Phase 1.16 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S16
 *
 * Phase 1.16 (2026-05-01) - pure-logic helpers para gerenciamento
 * de palettes de cores em constelações: palettes built-in, geração
 * de gradientes, conversão hex/rgb/hsl, contrast checks (WCAG 2.1).
 *
 * Estratégia:
 *   - Palettes frozen (categórica + sequencial + divergente)
 *   - Hex → RGB → HSL conversions (sem dependência de browser)
 *   - Lerp entre cores em RGB space
 *   - Contrast ratio (WCAG 2.1 - luminance relative)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Palette types canônicos. */
export const PALETTE_TYPES = Object.freeze(['categorical', 'sequential', 'diverging']);

/** Built-in palettes (frozen). */
export const PALETTES = Object.freeze({
    // Categorical - distinct colors for clusters
    cat10: Object.freeze([
        '#1f77b4',
        '#ff7f0e',
        '#2ca02c',
        '#d62728',
        '#9467bd',
        '#8c564b',
        '#e377c2',
        '#7f7f7f',
        '#bcbd22',
        '#17becf',
    ]),
    // Sequential - gradient from light to dark (viridis-like)
    viridis5: Object.freeze(['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']),
    blues5: Object.freeze(['#deebf7', '#9ecae1', '#6baed6', '#3182bd', '#08519c']),
    // Diverging - for centered scales
    redBlue: Object.freeze(['#b2182b', '#ef8a62', '#f7f7f7', '#67a9cf', '#2166ac']),
    redGreen: Object.freeze(['#a50026', '#f46d43', '#ffffbf', '#66bd63', '#006837']),
});

/** WCAG 2.1 contrast thresholds. */
export const CONTRAST_LEVELS = Object.freeze({
    AA_NORMAL: 4.5,
    AA_LARGE: 3.0,
    AAA_NORMAL: 7.0,
    AAA_LARGE: 4.5,
});

/** Identidade do módulo. */
export const COLOR_SCHEMES_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.16',
    deliveredAt: '2026-05-01',
    paletteTypes: PALETTE_TYPES,
    paletteNames: Object.keys(PALETTES),
});

/**
 * Verifica se string é hex color válido.
 *
 * @param {string} hex
 * @returns {boolean}
 */
export function isValidHex(hex: string): boolean {
    if (typeof hex !== 'string') return false;
    return /^#[0-9a-fA-F]{6}$/.test(hex.trim());
}

/**
 * Converte hex → RGB.
 *
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}|null}
 */
export function hexToRgb(hex: string): {r: number, g: number, b: number}|null {
    if (!isValidHex(hex)) return null;
    const h = hex.trim().slice(1);
    return Object.freeze({
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    });
}

/**
 * Converte RGB → hex.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {string}
 */
export function rgbToHex(rgb: {r: number, g: number, b: number}): string {
    if (!rgb || typeof rgb !== 'object') return '#000000';
    const r = Math.max(0, Math.min(255, Math.round(rgb.r || 0)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g || 0)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b || 0)));
    const hex = (n: any) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Converte RGB → HSL.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {{h: number, s: number, l: number}|null} h em [0,360], s+l em [0,1]
 */
export function rgbToHsl(rgb: {r: number, g: number, b: number}): {h: number, s: number, l: number}|null {
    if (!rgb || typeof rgb !== 'object') return null;
    const r = (rgb.r || 0) / 255;
    const g = (rgb.g || 0) / 255;
    const b = (rgb.b || 0) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            default:
                h = ((r - g) / d + 4) / 6;
        }
    }
    return Object.freeze({ h: h * 360, s, l });
}

/**
 * Lerp linear entre duas cores RGB.
 *
 * @param {{r: number, g: number, b: number}} a
 * @param {{r: number, g: number, b: number}} b
 * @param {number} t - [0,1]
 * @returns {{r: number, g: number, b: number}}
 */
export function lerpRgb(a: {r: number, g: number, b: number}, b: {r: number, g: number, b: number}, t: number): {r: number, g: number, b: number} {
    if (!a || !b) return Object.freeze({ r: 0, g: 0, b: 0 });
    const _t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    return Object.freeze({
        r: a.r + (b.r - a.r) * _t,
        g: a.g + (b.g - a.g) * _t,
        b: a.b + (b.b - a.b) * _t,
    });
}

/**
 * Resample palette para N cores (interpolação linear).
 *
 * @param {Array<string>} palette - hex colors
 * @param {number} n
 * @returns {Array<string>}
 */
export function resamplePalette(palette: Array<string>, n: number): Array<string> {
    if (!Array.isArray(palette) || palette.length === 0) return [];
    if (!Number.isInteger(n) || n <= 0) return [];
    if (n === 1) return [palette[0]!];
    if (palette.length === n) return [...palette];

    const result: string[] = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const idx = t * (palette.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(palette.length - 1, lo + 1);
        const frac = idx - lo;
        const a = hexToRgb(palette[lo]!);
        const b = hexToRgb(palette[hi]!);
        if (!a || !b) {
            result.push(palette[lo]!);
            continue;
        }
        result.push(rgbToHex(lerpRgb(a, b, frac)));
    }
    return result;
}

/**
 * Resolve palette por nome (com fallback).
 *
 * @param {string} name
 * @returns {Array<string>|null}
 */
export function resolvePalette(name: string): Array<string>|null {
    if (typeof name !== 'string') return null;
    return ((PALETTES as Record<string, any>)[name] || null as Array<string>|null);
}

/**
 * Gera mapeamento value → color usando palette sequencial.
 *
 * @param {number} value
 * @param {{min: number, max: number}} domain
 * @param {Array<string>} palette
 * @returns {string} hex
 */
export function valueToColor(value: number, domain: {min: number, max: number}, palette: Array<string>): string {
    if (!Number.isFinite(value) || !domain || !Array.isArray(palette) || palette.length === 0) {
        return palette && palette[0] ? palette[0] : '#000000';
    }
    const min = Number.isFinite(domain.min) ? domain.min : 0;
    const max = Number.isFinite(domain.max) ? domain.max : 1;
    const range = max - min;
    if (range === 0) return palette[0]!;

    const t = Math.max(0, Math.min(1, (value - min) / range));
    const idx = t * (palette.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(palette.length - 1, lo + 1);
    const frac = idx - lo;
    const a = hexToRgb(palette[lo]!);
    const b = hexToRgb(palette[hi]!);
    if (!a || !b) return palette[lo]!;
    return rgbToHex(lerpRgb(a, b, frac));
}

/**
 * Computa luminance relativa (WCAG 2.1).
 *
 * @param {{r: number, g: number, b: number}} rgb - 0-255
 * @returns {number}
 */
export function relativeLuminance(rgb: {r: number, g: number, b: number}): number {
    if (!rgb) return 0;
    const adj = (c: any) => {
        const v = (c || 0) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * adj(rgb.r) + 0.7152 * adj(rgb.g) + 0.0722 * adj(rgb.b);
}

/**
 * Computa contrast ratio entre duas cores (WCAG 2.1).
 *
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number} 1-21
 */
export function contrastRatio(hexA: string, hexB: string): number {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return 1;
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifica se par de cores satisfaz WCAG AA normal text.
 *
 * @param {string} fg
 * @param {string} bg
 * @returns {boolean}
 */
export function meetsContrastAA(fg: string, bg: string): boolean {
    return contrastRatio(fg, bg) >= CONTRAST_LEVELS.AA_NORMAL;
}

/**
 * Sugere foreground (preto/branco) com melhor contraste para um background.
 *
 * @param {string} bg
 * @returns {string} '#000000' ou '#ffffff'
 */
export function bestForeground(bg: string): string {
    const rgb = hexToRgb(bg);
    if (!rgb) return '#000000';
    const lum = relativeLuminance(rgb);
    return lum > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Module identity export.
 */
export const colorSchemesMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.16',
    deliveredAt: '2026-05-01',
    paletteTypes: PALETTE_TYPES,
    paletteCount: Object.keys(PALETTES).length,
    exports: [
        'PALETTE_TYPES',
        'PALETTES',
        'CONTRAST_LEVELS',
        'COLOR_SCHEMES_META',
        'isValidHex',
        'hexToRgb',
        'rgbToHex',
        'rgbToHsl',
        'lerpRgb',
        'resamplePalette',
        'resolvePalette',
        'valueToColor',
        'relativeLuminance',
        'contrastRatio',
        'meetsContrastAA',
        'bestForeground',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
