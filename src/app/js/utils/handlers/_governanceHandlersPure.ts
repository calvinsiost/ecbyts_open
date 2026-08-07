// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for handlers/governance.ts (WBS parsing + uncertainty hub diff/sensitivity).
// DOM-free, framework-free. Extracted Wave XXXX1 (governance #handler 1363L).

export const WBS_NUMERIC_FIELDS: readonly string[] = Object.freeze([
    'cost',
    'weight',
    'percentComplete',
]);

export function parseWbsField(key: unknown, raw: unknown): unknown {
    if (typeof key === 'string' && WBS_NUMERIC_FIELDS.includes(key)) {
        const n = parseFloat(String(raw));
        return Number.isFinite(n) ? n : 0;
    }
    return raw;
}

export type SensitivityCandidate = {
    id?: unknown;
    infoGain?: unknown;
    residualRisk?: unknown;
    normalizedCost?: unknown;
};

export type SensitivityRankedItem = {
    id: string;
    score: number;
};

export function computeSensitivity(
    optimization: unknown,
    topN: number = 5,
): { topDrivers: SensitivityRankedItem[] } {
    const opt = optimization as { selected?: unknown } | null | undefined;
    const selected = Array.isArray(opt?.selected) ? (opt.selected as SensitivityCandidate[]) : [];
    const n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN as number) : 5;
    const ranked = selected
        .filter((c): c is SensitivityCandidate => c !== null && typeof c === 'object')
        .map((c) => {
            const info = toFiniteNumber(c?.infoGain, 0);
            const risk = toFiniteNumber(c?.residualRisk, 0);
            const cost = toFiniteNumber(c?.normalizedCost, 0);
            return {
                id: String(c?.id ?? 'unknown'),
                score: roundTo(info - risk - cost, 4),
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
    return { topDrivers: ranked };
}

export type ResultDiff = {
    decisionActionChanged: boolean;
    decision: {
        before: string | null;
        after: string | null;
    };
    selectedCountDelta: number;
};

export function computeResultDiff(prev: unknown, current: unknown): ResultDiff {
    const prevAction = extractDecisionAction(prev);
    const currAction = extractDecisionAction(current);
    const prevSelected = extractSelectedLength(prev);
    const currSelected = extractSelectedLength(current);
    return {
        decisionActionChanged: prevAction !== currAction,
        decision: { before: prevAction, after: currAction },
        selectedCountDelta: currSelected - prevSelected,
    };
}

function extractDecisionAction(state: unknown): string | null {
    const s = state as { decision?: { action?: unknown } } | null | undefined;
    const action = s?.decision?.action;
    if (action === null || action === undefined) return null;
    return String(action);
}

function extractSelectedLength(state: unknown): number {
    const s = state as { optimization?: { selected?: unknown } } | null | undefined;
    const selected = s?.optimization?.selected;
    return Array.isArray(selected) ? selected.length : 0;
}

function toFiniteNumber(value: unknown, fallback: number = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function roundTo(value: number, decimals: number = 4): number {
    if (!Number.isFinite(value)) return 0;
    const d = Math.max(0, Math.min(20, Math.floor(decimals)));
    const factor = Math.pow(10, d);
    return Math.round(value * factor) / factor;
}

export function clampHistoryEntries<T>(entries: ReadonlyArray<T>, maxSize: number = 30): T[] {
    if (!Array.isArray(entries)) return [];
    const cap = Number.isFinite(maxSize) && maxSize > 0 ? Math.floor(maxSize as number) : 30;
    if (entries.length <= cap) return [...entries];
    return entries.slice(-cap);
}
