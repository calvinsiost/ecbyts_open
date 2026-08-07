// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Deduplication - Phase 51 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S51
 *
 * Phase 51 (2026-05-02) - pure-logic deduplication para outputs de
 * pipeline. Suporta:
 *   - dedupeByKey (single field)
 *   - dedupeByKeys (composite)
 *   - dedupeByHash (FNV-1a)
 *   - keep first|last|max(field)
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export type KeepStrategy = 'first' | 'last' | 'max' | 'min';

export interface DedupOptions {
    keep?: string;
    tieField?: string;
}

export const KEEP_STRATEGIES = ['first', 'last', 'max', 'min'] as const;
export type KeepStrategyConstant = (typeof KEEP_STRATEGIES)[number];

export const DEDUP_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 51,
    deliveredAt: '2026-05-02',
});

import { fnv1aHash as _fnv1aHash } from '../../../utils/helpers/hashFnv1a.js';
function fnv1a(s: unknown): string {
    if (typeof s !== 'string') return '0';
    return _fnv1aHash(s).toString(16);
}

export function isValidStrategy(s: unknown): s is KeepStrategy {
    return typeof s === 'string' && (KEEP_STRATEGIES as readonly string[]).includes(s);
}

function pickWinner(
    a: unknown,
    b: unknown,
    strategy: KeepStrategy,
    tieField: string | null,
): unknown {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    switch (strategy) {
        case 'first':
            return a;
        case 'last':
            return b;
        case 'max':
            if (typeof tieField !== 'string') return b;
            return (Number(bObj[tieField]) || 0) > (Number(aObj[tieField]) || 0) ? b : a;
        case 'min':
            if (typeof tieField !== 'string') return b;
            return (Number(bObj[tieField]) || 0) < (Number(aObj[tieField]) || 0) ? b : a;
        default:
            return a;
    }
}

export function dedupeByKey(
    items: readonly unknown[],
    field: string,
    options: DedupOptions = {},
): readonly unknown[] {
    if (!Array.isArray(items) || typeof field !== 'string') return Object.freeze([]);
    const strategy: KeepStrategy = isValidStrategy(options.keep) ? (options.keep as KeepStrategy) : 'first';
    const tieField = typeof options.tieField === 'string' ? options.tieField : null;
    const map = new Map<string, unknown>();
    for (const it of items) {
        if (!it) continue;
        const itObj = it as Record<string, unknown>;
        const k = itObj[field];
        if (k === undefined || k === null) continue;
        const key = String(k);
        if (!map.has(key)) {
            map.set(key, it);
        } else {
            map.set(key, pickWinner(map.get(key), it, strategy, tieField));
        }
    }
    return Object.freeze(Array.from(map.values()));
}

export function dedupeByKeys(
    items: readonly unknown[],
    fields: readonly string[],
    options: DedupOptions = {},
): readonly unknown[] {
    if (!Array.isArray(items) || !Array.isArray(fields) || fields.length === 0) return Object.freeze([]);
    const strategy: KeepStrategy = isValidStrategy(options.keep) ? (options.keep as KeepStrategy) : 'first';
    const tieField = typeof options.tieField === 'string' ? options.tieField : null;
    const map = new Map<string, unknown>();
    for (const it of items) {
        if (!it) continue;
        const itObj = it as Record<string, unknown>;
        const parts = fields.map((f) => String(itObj[f] ?? ''));
        const key = parts.join('::');
        if (!map.has(key)) {
            map.set(key, it);
        } else {
            map.set(key, pickWinner(map.get(key), it, strategy, tieField));
        }
    }
    return Object.freeze(Array.from(map.values()));
}

export function dedupeByHash(
    items: readonly unknown[],
    options: DedupOptions = {},
): readonly unknown[] {
    if (!Array.isArray(items)) return Object.freeze([]);
    const strategy: KeepStrategy = isValidStrategy(options.keep) ? (options.keep as KeepStrategy) : 'first';
    const tieField = typeof options.tieField === 'string' ? options.tieField : null;
    const map = new Map<string, unknown>();
    for (const it of items) {
        if (it === undefined || it === null) continue;
        let s: string;
        try {
            s = JSON.stringify(it);
        } catch {
            continue;
        }
        const key = fnv1a(s);
        if (!map.has(key)) {
            map.set(key, it);
        } else {
            map.set(key, pickWinner(map.get(key), it, strategy, tieField));
        }
    }
    return Object.freeze(Array.from(map.values()));
}

export function countDuplicates(items: readonly unknown[], field: string): number {
    if (!Array.isArray(items) || typeof field !== 'string') return 0;
    const seen = new Set<string>();
    let dups = 0;
    for (const it of items) {
        if (!it) continue;
        const itObj = it as Record<string, unknown>;
        const k = String(itObj[field] ?? '');
        if (seen.has(k)) dups++;
        else seen.add(k);
    }
    return dups;
}

export function summarizeDedup(input: readonly unknown[], output: readonly unknown[]): Readonly<{ input: number; output: number; removed: number; ratio: number }> {
    const empty = { input: 0, output: 0, removed: 0, ratio: 0 };
    if (!Array.isArray(input) || !Array.isArray(output)) return Object.freeze(empty);
    return Object.freeze({
        input: input.length,
        output: output.length,
        removed: input.length - output.length,
        ratio: input.length > 0 ? output.length / input.length : 0,
    });
}

export const pipelineDeduplicationMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 51,
    deliveredAt: '2026-05-02',
    exports: [
        'KEEP_STRATEGIES',
        'DEDUP_META',
        'isValidStrategy',
        'dedupeByKey',
        'dedupeByKeys',
        'dedupeByHash',
        'countDuplicates',
        'summarizeDedup',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});