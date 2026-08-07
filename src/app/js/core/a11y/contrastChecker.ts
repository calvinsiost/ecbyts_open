// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export const WCAG_THRESHOLDS = Object.freeze({
    AA_NORMAL: 4.5,
    AA_LARGE: 3.0,
    AAA_NORMAL: 7.0,
    AAA_LARGE: 4.5,
});

export type RgbTuple = readonly [number, number, number];

export interface ContrastCheckResult {
    readonly ratio: number;
    readonly passesAA: boolean;
    readonly passesAALarge: boolean;
    readonly passesAAA: boolean;
}

export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '').trim();
    if (h.length === 3) {
        return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channelToLinear(channel: number): number {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: RgbTuple): number {
    const sR = channelToLinear(rgb[0]);
    const sG = channelToLinear(rgb[1]);
    const sB = channelToLinear(rgb[2]);
    return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

export function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hexToRgb(hex1));
    const l2 = relativeLuminance(hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export function checkContrast(foreground: string, background: string): ContrastCheckResult {
    const ratio = contrastRatio(foreground, background);
    return {
        ratio: Math.round(ratio * 100) / 100,
        passesAA: ratio >= WCAG_THRESHOLDS.AA_NORMAL,
        passesAALarge: ratio >= WCAG_THRESHOLDS.AA_LARGE,
        passesAAA: ratio >= WCAG_THRESHOLDS.AAA_NORMAL,
    };
}
