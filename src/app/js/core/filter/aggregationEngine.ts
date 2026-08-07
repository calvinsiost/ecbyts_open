// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * FEAT-FILTER-RADAR-001 - Aggregation engine (Phase 1 pure logic)
 * Canonical groups: VOC / SVOC / Metais / Físico-Químicos / Hidrocarbonetos / Pesticidas / Nutrientes
 * 7 groups per Calvin Q7 decision 2026-04-18 (max 8 axes).
 * Academic ref: EPA QAPP §3.4.2 + EPA-240/B-06-003 §A.1.3 (P95 interpolation)
 * @module core/filter/aggregationEngine
 */

interface CanonicalGroup {
    id: string;
    label: string;
    color: string;
    parameterPatterns: RegExp[];
}

type GroupId = 'voc' | 'svoc' | 'metals' | 'physicochem' | 'hydrocarbons' | 'pesticides' | 'nutrients';

interface GroupIndexEntry {
    voc: boolean;
    svoc: boolean;
    metals: boolean;
    physicochem: boolean;
    hydrocarbons: boolean;
    pesticides: boolean;
    nutrients: boolean;
    customGroupIds: string[];
}

/**
 * 7 canonical parameter groups (Q7: 7 groups, max 8 axes).
 * Patterns match parameter names in EN and PT-BR.
 */
export const CANONICAL_GROUPS: Record<GroupId, CanonicalGroup> = {
    voc: {
        id: 'voc',
        label: 'VOC',
        color: '#4A90D9',
        parameterPatterns: [/benzene|toluene|xylene|ethylbenzene|mtbe|btex|tce|pce|dcl|vcl|benzeno|tolueno|xileno/i],
    },
    svoc: {
        id: 'svoc',
        label: 'SVOC',
        color: '#7B68EE',
        parameterPatterns: [
            /naphth|pyrene|benzo.a.piren|pcb|dioxin|furan|pah|fluorene|anthracene|naftal|pireno|benzopireno/i,
        ],
    },
    metals: {
        id: 'metals',
        label: 'Metais',
        color: '#E67E22',
        parameterPatterns: [
            /lead|mercury|cadmium|chromium|arsenic|nickel|zinc|copper|iron|manganese|chumbo|mercurio|cadmio|cromo|arsenico|niquel|zinco|cobre|ferro|manganes/i,
        ],
    },
    physicochem: {
        id: 'physicochem',
        label: 'Físico-Químicos',
        color: '#27AE60',
        parameterPatterns: [/\bph\b|conductivity|turbidity|sst|\bcod\b|\bbod\b|dqo|dbo|condutiv|turbidez/i],
    },
    hydrocarbons: {
        id: 'hydrocarbons',
        label: 'Hidrocarbonetos',
        color: '#C0392B',
        parameterPatterns: [/\btph\b|\bhtp\b|gasoline|diesel|motor.oil|hidrocarboneto|btph/i],
    },
    pesticides: {
        id: 'pesticides',
        label: 'Pesticidas',
        color: '#8E44AD',
        parameterPatterns: [
            /pesticide|herbicide|insecticide|\bddt\b|aldrin|endrin|lindane|glyphosate|pesticid|herbicid|inseticid|glifosato/i,
        ],
    },
    nutrients: {
        id: 'nutrients',
        label: 'Nutrientes',
        color: '#16A085',
        parameterPatterns: [
            /nitrate|nitrite|ammonia|phosphate|\bnitrogen\b|nitrato|nitrito|amonia|fosfato|nitrogenio/i,
        ],
    },
};

/** Maximum visible axes in the radar chart (Q7). */
export const MAX_RADAR_AXES = 8;

/**
 * Match a parameter name against canonical group patterns.
 * @param parameterName
 * @returns array of matching group IDs
 */
export function matchParameterToGroups(parameterName: string): string[] {
    const name = String(parameterName || '');
    return Object.values(CANONICAL_GROUPS)
        .filter((g) => g.parameterPatterns.some((rx) => rx.test(name)))
        .map((g) => g.id);
}

/**
 * Build inverted index: elementId → group membership flags.
 * O(N×M) where N=elements, M=observations - incremental updates are caller's responsibility.
 * @param elements
 * @param customGroups
 */
export function buildElementGroupIndex(
    elements: Array<{ id: string; observations?: Array<{ parameterName?: string; parameter?: string }> }>,
    customGroups: Array<{ id: string; parameterPatterns: RegExp[] }> = [],
): Map<string, GroupIndexEntry> {
    const index = new Map<string, GroupIndexEntry>();
    for (const el of elements) {
        const entry: GroupIndexEntry = {
            voc: false,
            svoc: false,
            metals: false,
            physicochem: false,
            hydrocarbons: false,
            pesticides: false,
            nutrients: false,
            customGroupIds: [],
        };
        for (const obs of el.observations ?? []) {
            const name = obs.parameterName ?? obs.parameter ?? '';
            for (const gid of matchParameterToGroups(name)) {
                entry[gid as GroupId] = true;
            }
            for (const cg of customGroups) {
                if (cg.parameterPatterns.some((rx) => rx.test(name)) && !entry.customGroupIds.includes(cg.id)) {
                    entry.customGroupIds.push(cg.id);
                }
            }
        }
        index.set(el.id, entry);
    }
    return index;
}

/**
 * Compute a single aggregate value from an array of numbers.
 * Ignores non-finite values silently.
 * @param values
 * @param fn
 * @returns null when no valid values
 */
export function aggregate(
    values: number[],
    fn: 'mean' | 'median' | 'max' | 'min' | 'p95' | 'stddev' = 'mean',
): number | null {
    const nums = values.filter((v) => typeof v === 'number' && isFinite(v));
    if (nums.length === 0) return null;
    switch (fn) {
        case 'mean':
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'median':
            return _median(nums);
        case 'max':
            return Math.max(...nums);
        case 'min':
            return Math.min(...nums);
        case 'p95':
            return _percentile(nums, 95);
        case 'stddev':
            return _stddev(nums);
        default:
            return null;
    }
}

/**
 * Compute radar data for one element across the given groups.
 * @param element
 * @param fn
 * @param groupIds defaults to all 7 canonical groups
 */
export function computeElementRadarData(
    element: {
        id: string;
        observations?: Array<{ parameterName?: string; parameter?: string; value?: number }>;
    },
    fn: 'mean' | 'median' | 'max' | 'min' | 'p95' | 'stddev' = 'mean',
    groupIds: string[] = Object.keys(CANONICAL_GROUPS),
): Record<string, { value: number | null; count: number; hasData: boolean }> {
    const result: Record<string, { value: number | null; count: number; hasData: boolean }> = {};
    for (const gid of groupIds) {
        const group = CANONICAL_GROUPS[gid as GroupId];
        if (!group) {
            result[gid] = { value: null, count: 0, hasData: false };
            continue;
        }
        const vals = (element.observations ?? [])
            .filter((obs) => {
                const name = obs.parameterName ?? obs.parameter ?? '';
                return group.parameterPatterns.some((rx: RegExp) => rx.test(name));
            })
            .map((obs) => Number(obs.value))
            .filter((v) => isFinite(v));
        result[gid] = { value: aggregate(vals, fn), count: vals.length, hasData: vals.length > 0 };
    }
    return result;
}

// --- private helpers ---

function _median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length === 0) return NaN;
    if (sorted.length % 2 === 0) {
        const a = sorted[mid - 1];
        const b = sorted[mid];
        return a !== undefined && b !== undefined ? (a + b) / 2 : NaN;
    }
    const v = sorted[mid];
    return v !== undefined ? v : NaN;
}

/**
 * Linear interpolation per EPA-240/B-06-003 §A.1.3.
 * @param nums
 * @param p
 */
function _percentile(nums: number[], p: number): number {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted.length === 0) return NaN;
    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const lo = sorted[lower];
    const hi = sorted[upper];
    if (lo === undefined || hi === undefined) return NaN;
    if (lower === upper) return lo;
    return lo + (rank - lower) * (hi - lo);
}

function _stddev(nums: number[]): number {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
}
