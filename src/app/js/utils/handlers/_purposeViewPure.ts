// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for handlers/purpose.ts (time window + verdict + delta display formatting).
// DOM-free, i18n-free (returns i18n keys + fallbacks for caller to resolve via t()).
// Extracted Wave AAAAA1 from src/app/js/utils/handlers/purpose.ts (455L).

export const PURPOSE_TIME_WINDOWS: ReadonlySet<string> = new Set(['1d', '7d', '30d', 'all']);

export const PURPOSE_AXIS_KEYS: readonly string[] = Object.freeze(['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm']);

export const DEFAULT_TIME_WINDOW = '7d';

export function normalizeTimeWindow(value: unknown): string {
    const candidate = typeof value === 'string' ? value : '';
    return PURPOSE_TIME_WINDOWS.has(candidate) ? candidate : DEFAULT_TIME_WINDOW;
}

export type VerdictDisplay = {
    labelKey: string;
    labelFallback: string;
    cssClass: 'high' | 'medium' | 'low';
};

export function getVerdictDisplay(eis: unknown, verdict?: unknown): VerdictDisplay {
    const score = toFiniteNumber(eis, 0);
    const cssClass: 'high' | 'medium' | 'low' = score >= 4.5 ? 'high' : score >= 3.5 ? 'medium' : 'low';
    const v = String(verdict ?? '');
    if (v === 'Audit Ready') {
        return { labelKey: 'eisVerdictAudit', labelFallback: 'Audit Ready', cssClass };
    }
    if (v === 'Management Ready') {
        return { labelKey: 'eisVerdictManagement', labelFallback: 'Management Ready', cssClass };
    }
    return { labelKey: 'eisVerdictCritical', labelFallback: 'Critical Data', cssClass };
}

export function getPeriodLabel(window: unknown): { key: string; fallback: string } {
    const w = normalizeTimeWindow(window);
    if (w === '1d') return { key: 'purposeToday', fallback: 'Today' };
    if (w === '7d') return { key: 'purposeThisWeek', fallback: 'This week' };
    if (w === '30d') return { key: 'purposeThisMonth', fallback: 'This month' };
    return { key: 'purposeAllTime', fallback: 'All time' };
}

export function deltaArrow(value: unknown): string {
    const v = toFiniteNumber(value, 0);
    if (v > 0) return '&#9650;';
    if (v < 0) return '&#9660;';
    return '&#8212;';
}

export function deltaSign(value: unknown): string {
    return toFiniteNumber(value, 0) > 0 ? '+' : '';
}

export function deltaClass(value: unknown): 'positive' | 'negative' | 'neutral' {
    const v = toFiniteNumber(value, 0);
    if (v > 0) return 'positive';
    if (v < 0) return 'negative';
    return 'neutral';
}

export function axisFillPercent(score: unknown, maxScore: number = 5): number {
    const s = toFiniteNumber(score, 0);
    const max = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 5;
    const pct = (s / max) * 100;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
}

export type WeakAxis = {
    key: string;
    score: number;
};

export function getWeakestAxes(
    axes: Record<string, unknown> | null | undefined,
    topN: number = 2,
    scoreThreshold: number = 4,
): WeakAxis[] {
    if (!axes || typeof axes !== 'object') return [];
    const n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN as number) : 2;
    const ranked = PURPOSE_AXIS_KEYS
        .map((key) => ({ key, score: toFiniteNumber((axes as Record<string, unknown>)[key], 0) }))
        .sort((a, b) => a.score - b.score)
        .filter((a) => a.score < scoreThreshold)
        .slice(0, n);
    return ranked;
}

function toFiniteNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
