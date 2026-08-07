// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for EIS verdict classification + score formatting.
// DOM-free, framework-free, deps-free. Canonical thresholds from project_eis_motor
// (T+A+Cp+Ty+Cs+Cm scale 0..5, veredito: 🟢≥4.50 / 🟡≥3.50 / 🔴<3.50).
// Extracted Wave VVVV1 from src/app/js/utils/handlers/eis.ts (#5 monolito, 2787L).

export const VERDICT_THRESHOLD_GREEN = 4.5;
export const VERDICT_THRESHOLD_YELLOW = 3.5;

export type VerdictTier = 'green' | 'yellow' | 'red';

export const VERDICT_COLORS: Readonly<Record<VerdictTier, string>> = Object.freeze({
    green: 'rgb(34, 197, 94)',
    yellow: 'rgb(234, 179, 8)',
    red: 'rgb(239, 68, 68)',
}) as Readonly<Record<VerdictTier, string>>;

export const VERDICT_CLASSES: Readonly<Record<VerdictTier, string>> = Object.freeze({
    green: 'green',
    yellow: 'yellow',
    red: 'red',
}) as Readonly<Record<VerdictTier, string>>;

export const VERDICT_LABELS: Readonly<Record<VerdictTier, string>> = Object.freeze({
    green: 'AUDIT_READY',
    yellow: 'MANAGEMENT_READY',
    red: 'CRITICAL_DATA',
}) as Readonly<Record<VerdictTier, string>>;

export function clampEisScore(eis: unknown): number {
    const n = Number(eis);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 5) return 5;
    return n;
}

export function getVerdictTier(eis: unknown): VerdictTier {
    const n = clampEisScore(eis);
    if (n >= VERDICT_THRESHOLD_GREEN) return 'green';
    if (n >= VERDICT_THRESHOLD_YELLOW) return 'yellow';
    return 'red';
}

export function getVerdictColor(eis: unknown): string {
    return VERDICT_COLORS[getVerdictTier(eis)];
}

export function getVerdictClass(eis: unknown): string {
    return VERDICT_CLASSES[getVerdictTier(eis)];
}

export function getVerdictLabel(eis: unknown): string {
    return VERDICT_LABELS[getVerdictTier(eis)];
}

export function formatEisScore(eis: unknown, decimals: number = 2): string {
    const n = clampEisScore(eis);
    const d = Number.isFinite(decimals) && decimals >= 0 && decimals <= 10 ? Math.floor(decimals as number) : 2;
    return n.toFixed(d);
}

export function getCustomVerdictFromBands(
    score: unknown,
    bands: ReadonlyArray<{ min: number; tier?: VerdictTier; label?: string }> | null | undefined,
): { tier: VerdictTier; label: string } | null {
    if (!Array.isArray(bands) || bands.length === 0) return null;
    const s = clampEisScore(score);
    const sorted = [...bands].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
    let match: { tier: VerdictTier; label: string } | null = null;
    for (const band of sorted) {
        if (!band || typeof band.min !== 'number') continue;
        if (s >= band.min) {
            match = {
                tier: (band.tier ?? 'red') as VerdictTier,
                label: band.label ?? String(band.tier ?? 'red'),
            };
        }
    }
    return match;
}

export function compareEisScores(prev: unknown, curr: unknown): {
    delta: number;
    direction: 'up' | 'down' | 'flat';
    prevTier: VerdictTier;
    currTier: VerdictTier;
    tierChanged: boolean;
} {
    const p = clampEisScore(prev);
    const c = clampEisScore(curr);
    const delta = c - p;
    const prevTier = getVerdictTier(p);
    const currTier = getVerdictTier(c);
    let direction: 'up' | 'down' | 'flat';
    if (Math.abs(delta) < 0.001) direction = 'flat';
    else if (delta > 0) direction = 'up';
    else direction = 'down';
    return { delta, direction, prevTier, currTier, tierChanged: prevTier !== currTier };
}
