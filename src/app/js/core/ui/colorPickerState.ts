// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-74 Color Picker State - pure-logic, zero DOM.
 * Imutável: toda mutação retorna novo state frozen.
 * HSV/RGB/HEX/HSL conversions + palette + recent + WCAG contrast.
 */

const VALID_MODES = new Set(['hex', 'rgb', 'hsv', 'hsl']);
const MAX_RECENT = 10;
const HEX3_RE = /^#([0-9a-fA-F]{3})$/;
const HEX6_RE = /^#([0-9a-fA-F]{6})$/;
const HEX8_RE = /^#([0-9a-fA-F]{8})$/;

/* ---------- conversions ---------- */

import { clamp } from '../../utils/helpers/math.js';

function assertHsv({ h, s, v }: { h: number; s: number; v: number }): void {
    if (!Number.isFinite(h) || h < 0 || h > 360) throw new Error(`hsv: h out of range [0,360]: ${h}`);
    if (!Number.isFinite(s) || s < 0 || s > 1) throw new Error(`hsv: s out of range [0,1]: ${s}`);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`hsv: v out of range [0,1]: ${v}`);
}

function assertRgb({ r, g, b }: { r: number; g: number; b: number }): void {
    for (const [name, val] of [
        ['r', r],
        ['g', g],
        ['b', b],
    ] as Array<[string, number]>) {
        if (!Number.isFinite(val) || val < 0 || val > 255) {
            throw new Error(`rgb: ${name} out of range [0,255]: ${val}`);
        }
    }
}

/** HSV → RGB. h:0..360, s:0..1, v:0..1 → r/g/b:0..255 */
export function hsvToRgb({ h, s, v }: { h: number; s: number; v: number }): { r: number; g: number; b: number } {
    assertHsv({ h, s, v });
    const c = v * s;
    const hh = (h % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r1: number;
    let g1: number;
    let b1: number;
    if (hh >= 0 && hh < 1) {
        r1 = c;
        g1 = x;
        b1 = 0;
    } else if (hh < 2) {
        r1 = x;
        g1 = c;
        b1 = 0;
    } else if (hh < 3) {
        r1 = 0;
        g1 = c;
        b1 = x;
    } else if (hh < 4) {
        r1 = 0;
        g1 = x;
        b1 = c;
    } else if (hh < 5) {
        r1 = x;
        g1 = 0;
        b1 = c;
    } else {
        r1 = c;
        g1 = 0;
        b1 = x;
    }
    const m = v - c;
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

/** RGB → HSV. r/g/b:0..255 → h:0..360, s:0..1, v:0..1 */
export function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
    assertRgb({ r, g, b });
    const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rn) h = 60 * (((gn - bn) / d) % 6);
        else if (max === gn) h = 60 * ((bn - rn) / d + 2);
        else h = 60 * ((rn - gn) / d + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
}

function toHex2(n: number): string {
    const v = clamp(Math.round(n), 0, 255);
    return v.toString(16).padStart(2, '0');
}

/** RGB(A) → '#RRGGBB' or '#RRGGBBAA' */
export function rgbToHex({
    r,
    g,
    b,
    alpha,
}: {
    r: number;
    g: number;
    b: number;
    alpha?: number | null;
}): string {
    assertRgb({ r, g, b });
    const base = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
    if (alpha === undefined || alpha === null || alpha === 1) return base;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
        throw new Error(`rgbToHex: alpha out of range [0,1]: ${alpha}`);
    }
    return base + toHex2(alpha * 255);
}

interface RgbA {
    r: number;
    g: number;
    b: number;
    alpha: number;
}

/** Hex → {r,g,b,alpha}. Aceita #RGB, #RRGGBB, #RRGGBBAA. */
export function hexToRgb(hex: unknown): RgbA {
    if (typeof hex !== 'string') throw new Error(`hexToRgb: expected string, got ${typeof hex}`);
    let m: RegExpExecArray | null;
    if ((m = HEX3_RE.exec(hex))) {
        const s = m[1] as string;
        return {
            r: parseInt(s[0]! + s[0]!, 16),
            g: parseInt(s[1]! + s[1]!, 16),
            b: parseInt(s[2]! + s[2]!, 16),
            alpha: 1,
        };
    }
    if ((m = HEX6_RE.exec(hex))) {
        const s = m[1] as string;
        return {
            r: parseInt(s.slice(0, 2), 16),
            g: parseInt(s.slice(2, 4), 16),
            b: parseInt(s.slice(4, 6), 16),
            alpha: 1,
        };
    }
    if ((m = HEX8_RE.exec(hex))) {
        const s = m[1] as string;
        return {
            r: parseInt(s.slice(0, 2), 16),
            g: parseInt(s.slice(2, 4), 16),
            b: parseInt(s.slice(4, 6), 16),
            alpha: parseInt(s.slice(6, 8), 16) / 255,
        };
    }
    throw new Error(`hexToRgb: invalid hex "${hex}"`);
}

/** RGB → HSL. r/g/b:0..255 → h:0..360, s:0..1, l:0..1 */
export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
    assertRgb({ r, g, b });
    const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0,
        s = 0;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === rn) h = 60 * (((gn - bn) / d) % 6);
        else if (max === gn) h = 60 * ((bn - rn) / d + 2);
        else h = 60 * ((rn - gn) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s, l };
}

/* ---------- WCAG ---------- */

/** Relative luminance per WCAG 2.1. {r,g,b}:0..255 → 0..1 */
export function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    assertRgb({ r, g, b });
    const f = (c: number): number => {
        const cs = c / 255;
        return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio + WCAG levels. fg/bg como hex string ou {r,g,b}. */
export function validateContrast(
    fg: unknown,
    bg: unknown,
): { ratio: number; wcagAA: boolean; wcagAAA: boolean; level: string } {
    const fgRgb = typeof fg === 'string' ? hexToRgb(fg) : (fg as { r: number; g: number; b: number });
    const bgRgb = typeof bg === 'string' ? hexToRgb(bg) : (bg as { r: number; g: number; b: number });
    const l1 = getRelativeLuminance(fgRgb);
    const l2 = getRelativeLuminance(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    const wcagAA = ratio >= 4.5;
    const wcagAAA = ratio >= 7;
    let level = 'fail';
    if (wcagAAA) level = 'AAA';
    else if (wcagAA) level = 'AA';
    else if (ratio >= 3) level = 'AA-large';
    return { ratio, wcagAA, wcagAAA, level };
}

/* ---------- state ---------- */

interface FrozenColor {
    h: number;
    s: number;
    v: number;
    alpha: number;
}

function freezeColor(c: FrozenColor): FrozenColor {
    return Object.freeze({ ...c });
}

function validateAlpha(alpha: number | undefined, label: string): asserts alpha is number {
    if (alpha === undefined || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
        throw new Error(`${label}: alpha out of range [0,1]: ${alpha}`);
    }
}

function normalizeFromHex(hex: string): FrozenColor {
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb);
    return freezeColor({ ...hsv, alpha: rgb.alpha });
}

function isHsvLike(obj: Record<string, unknown>): obj is { h: number; s: number; v: number; alpha?: number } {
    return typeof obj.h === 'number' && typeof obj.s === 'number' && typeof obj.v === 'number';
}

function isRgbLike(obj: Record<string, unknown>): obj is { r: number; g: number; b: number; alpha?: number } {
    return typeof obj.r === 'number' && typeof obj.g === 'number' && typeof obj.b === 'number';
}

function normalizeFromHsv(obj: Record<string, number>): FrozenColor {
    const asUnknown = obj as Record<string, unknown>;
    if (!isHsvLike(asUnknown)) throw new Error('normalizeColor: invalid HSV object');
    assertHsv({ h: asUnknown.h, s: asUnknown.s, v: asUnknown.v });
    validateAlpha(asUnknown.alpha, 'normalizeColor');
    return freezeColor({ h: asUnknown.h, s: asUnknown.s, v: asUnknown.v, alpha: asUnknown.alpha });
}

function normalizeFromRgb(obj: Record<string, number>): FrozenColor {
    const asUnknown = obj as Record<string, unknown>;
    if (!isRgbLike(asUnknown)) throw new Error('normalizeColor: invalid RGB object');
    assertRgb({ r: asUnknown.r, g: asUnknown.g, b: asUnknown.b });
    const hsv = rgbToHsv({ r: asUnknown.r, g: asUnknown.g, b: asUnknown.b });
    validateAlpha(asUnknown.alpha, 'normalizeColor');
    return freezeColor({ ...hsv, alpha: asUnknown.alpha });
}

function normalizeColor(input: unknown): FrozenColor {
    // Accepts {h,s,v,alpha?}, {r,g,b,alpha?}, or hex string. Returns {h,s,v,alpha} frozen.
    if (typeof input === 'string') return normalizeFromHex(input);
    if (input && typeof input === 'object') {
        const obj = input as Record<string, number>;
        if ('h' in obj && 's' in obj && 'v' in obj) return normalizeFromHsv(obj);
        if ('r' in obj && 'g' in obj && 'b' in obj) return normalizeFromRgb(obj);
    }
    throw new Error('normalizeColor: invalid color input');
}

function colorHex(color: FrozenColor): string {
    const rgb = hsvToRgb({ h: color.h, s: color.s, v: color.v });
    return rgbToHex({ ...rgb, alpha: color.alpha });
}

interface ColorPickerState {
    currentColor: FrozenColor;
    mode: string;
    palette: ReadonlyArray<FrozenColor>;
    recent: ReadonlyArray<FrozenColor>;
    favorites: Set<string>;
}

/** Cria state frozen. */
export function createColorPickerState({
    initialColor = '#000000',
    palette = [] as unknown[],
    recent = [] as unknown[],
    favorites = [] as string[],
    mode = 'hex',
}: {
    initialColor?: string;
    palette?: unknown[];
    recent?: unknown[];
    favorites?: string[];
    mode?: string;
} = {}): ColorPickerState {
    if (!VALID_MODES.has(mode)) throw new Error(`createColorPickerState: invalid mode "${mode}"`);
    const currentColor = normalizeColor(initialColor);
    const paletteFrozen = Object.freeze(palette.map(normalizeColor));
    const recentFrozen = Object.freeze(recent.slice(0, MAX_RECENT).map(normalizeColor));
    const favSet = new Set(favorites);
    return Object.freeze({
        currentColor,
        mode,
        palette: paletteFrozen,
        recent: recentFrozen,
        favorites: favSet,
    });
}

export function setColor(state: ColorPickerState, partial: unknown): ColorPickerState {
    let next: FrozenColor;
    if (typeof partial === 'string') {
        next = normalizeColor(partial);
    } else if (partial && typeof partial === 'object') {
        const p = partial as Record<string, number>;
        if ('h' in p || 's' in p || 'v' in p) {
            const merged = {
                h: 'h' in p ? p.h : state.currentColor.h,
                s: 's' in p ? p.s : state.currentColor.s,
                v: 'v' in p ? p.v : state.currentColor.v,
                alpha: 'alpha' in p ? p.alpha : state.currentColor.alpha,
            };
            next = normalizeColor(merged);
        } else if ('r' in p && 'g' in p && 'b' in p) {
            const alpha = 'alpha' in p ? p.alpha : state.currentColor.alpha;
            next = normalizeColor({ ...p, alpha });
        } else {
            throw new Error('setColor: invalid partial');
        }
    } else {
        throw new Error('setColor: invalid input');
    }
    return Object.freeze({ ...state, currentColor: next });
}

export function setMode(state: ColorPickerState, mode: string): ColorPickerState {
    if (!VALID_MODES.has(mode)) throw new Error(`setMode: invalid mode "${mode}"`);
    return Object.freeze({ ...state, mode });
}

export function addToPalette(state: ColorPickerState, color: unknown): ColorPickerState {
    const c = normalizeColor(color);
    const palette = Object.freeze([...state.palette, c]);
    return Object.freeze({ ...state, palette });
}

export function removeFromPalette(state: ColorPickerState, hex: unknown): ColorPickerState {
    if (typeof hex !== 'string') throw new Error('removeFromPalette: hex must be string');
    const palette = Object.freeze(state.palette.filter((c: FrozenColor) => colorHex(c) !== hex));
    return Object.freeze({ ...state, palette });
}

export function addToRecent(state: ColorPickerState, color: unknown): ColorPickerState {
    const c = normalizeColor(color);
    const hex = colorHex(c);
    const filtered = state.recent.filter((rc: FrozenColor) => colorHex(rc) !== hex);
    const next = [c, ...filtered].slice(0, MAX_RECENT);
    return Object.freeze({ ...state, recent: Object.freeze(next) });
}

export function toggleFavorite(state: ColorPickerState, hex: unknown): ColorPickerState {
    if (typeof hex !== 'string') throw new Error('toggleFavorite: hex must be string');
    const next = new Set(state.favorites);
    if (next.has(hex)) next.delete(hex);
    else next.add(hex);
    return Object.freeze({ ...state, favorites: next });
}

export function getCurrentHex(state: ColorPickerState): string {
    return colorHex(state.currentColor);
}

export function getCurrentRgb(state: ColorPickerState): { r: number; g: number; b: number; alpha: number } {
    const { h, s, v, alpha } = state.currentColor;
    const rgb = hsvToRgb({ h, s, v });
    return { ...rgb, alpha };
}

export function getCurrentHsl(state: ColorPickerState): { h: number; s: number; l: number } {
    const rgb = hsvToRgb({
        h: state.currentColor.h,
        s: state.currentColor.s,
        v: state.currentColor.v,
    });
    return rgbToHsl(rgb);
}

export function summarizeColorPicker(state: ColorPickerState): {
    currentHex: string;
    mode: string;
    paletteSize: number;
    recentSize: number;
    favoriteCount: number;
} {
    return {
        currentHex: getCurrentHex(state),
        mode: state.mode,
        paletteSize: state.palette.length,
        recentSize: state.recent.length,
        favoriteCount: state.favorites.size,
    };
}
