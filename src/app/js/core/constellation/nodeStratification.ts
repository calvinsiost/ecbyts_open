// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Stratification - Phase 1.44 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S44
 *
 * Phase 1.44 (2026-05-02) - pure-logic estratificação de nodes em
 * tiers/buckets via thresholds ou quantis. Suporta:
 *   - stratifyByThresholds (boundary list)
 *   - stratifyByQuantiles (n buckets equal-frequency)
 *   - stratifyByEqualWidth (n buckets equal-range)
 *   - assignTier por valor numérico
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface StratNode {
    [key: string]: unknown;
}

export interface StratEntry {
    node: StratNode;
    tier: number;
}

export const STRATIFY_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.44',
    deliveredAt: '2026-05-02',
} as const;

export type StratifyMeta = (typeof STRATIFY_META);

/**
 * Atribui tier (0..N) por value contra thresholds[].
 * thresholds asc; value < t[0] → 0, t[0] ≤ v < t[1] → 1, etc.
 */
export function assignTier(value: number, thresholds: readonly number[]): number {
    if (!Number.isFinite(value)) return -1;
    if (!Array.isArray(thresholds) || thresholds.length === 0) return 0;
    let tier = 0;
    for (const t of thresholds) {
        if (Number.isFinite(t) && value >= t) tier++;
        else break;
    }
    return tier;
}

/**
 * Estratifica nodes por field via thresholds.
 */
export function stratifyByThresholds(
    nodes: readonly StratNode[],
    field: string,
    thresholds: readonly number[],
): readonly Readonly<StratEntry>[] {
    if (!Array.isArray(nodes) || typeof field !== 'string') {
        return Object.freeze([]);
    }
    const ths: readonly number[] = Array.isArray(thresholds) ? thresholds : [];
    return Object.freeze(
        nodes
            .filter((n) => n && typeof n[field] === 'number' && Number.isFinite(n[field] as number))
            .map((n) => Object.freeze({ node: n, tier: assignTier(n[field] as number, ths) })),
    );
}

/**
 * Computa quantis (n buckets equal-frequency).
 */
export function computeQuantiles(values: readonly number[], n: number): readonly number[] {
    if (!Array.isArray(values)) return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 1) return Object.freeze([]);
    const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
    if (sorted.length === 0) return Object.freeze([]);
    const out: number[] = [];
    for (let i = 1; i < n; i++) {
        const idx = Math.floor((i / n) * sorted.length);
        out.push(sorted[Math.min(idx, sorted.length - 1)]);
    }
    return Object.freeze(out);
}

/**
 * Estratifica via quantis.
 */
export function stratifyByQuantiles(
    nodes: readonly StratNode[],
    field: string,
    n: number,
): readonly Readonly<StratEntry>[] {
    if (!Array.isArray(nodes) || typeof field !== 'string') {
        return Object.freeze([]);
    }
    const values: number[] = nodes
        .map((node) => (node ? node[field] : undefined))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const thresholds = computeQuantiles(values, n);
    return stratifyByThresholds(nodes, field, [...thresholds]);
}

/**
 * Estratifica via buckets de largura igual entre [min, max].
 */
export function stratifyByEqualWidth(
    nodes: readonly StratNode[],
    field: string,
    n: number,
): readonly Readonly<StratEntry>[] {
    if (!Array.isArray(nodes) || typeof field !== 'string') {
        return Object.freeze([]);
    }
    if (!Number.isInteger(n) || n <= 1) {
        return Object.freeze([]);
    }
    const values: number[] = nodes
        .map((node) => (node ? node[field] : undefined))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) return Object.freeze([]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (hi === lo) return stratifyByThresholds(nodes, field, []);
    const step = (hi - lo) / n;
    const thresholds: number[] = [];
    for (let i = 1; i < n; i++) thresholds.push(lo + i * step);
    return stratifyByThresholds(nodes, field, thresholds);
}

/**
 * Conta nodes por tier.
 */
export function tierDistribution(stratified: readonly Readonly<StratEntry>[]): Readonly<Record<string, number>> {
    if (!Array.isArray(stratified)) return Object.freeze({});
    const out: Record<string, number> = {};
    for (const s of stratified) {
        if (!s || typeof s.tier !== 'number') continue;
        const k = String(s.tier);
        out[k] = (out[k] || 0) + 1;
    }
    return Object.freeze(out);
}

/**
 * Sumariza estratificação.
 */
export function summarizeStratification(
    stratified: readonly Readonly<StratEntry>[],
): Readonly<{ count: number; tierCount: number; balanced: boolean; minTierSize?: number; maxTierSize?: number }> {
    const empty = { count: 0, tierCount: 0, balanced: false };
    if (!Array.isArray(stratified) || stratified.length === 0) return empty as any;
    const dist = tierDistribution(stratified);
    const counts = Object.values(dist);
    const tiers = counts.length;
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const balanced = max === 0 ? false : (max - min) / max < 0.5;
    return Object.freeze({
        count: stratified.length,
        tierCount: tiers,
        balanced,
        minTierSize: min,
        maxTierSize: max,
    });
}

/**
 * Module identity export.
 */
export const nodeStratificationMeta = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.44',
    deliveredAt: '2026-05-02',
    exports: [
        'STRATIFY_META',
        'assignTier',
        'stratifyByThresholds',
        'computeQuantiles',
        'stratifyByQuantiles',
        'stratifyByEqualWidth',
        'tierDistribution',
        'summarizeStratification',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;

export type NodeStratificationMeta = (typeof nodeStratificationMeta);