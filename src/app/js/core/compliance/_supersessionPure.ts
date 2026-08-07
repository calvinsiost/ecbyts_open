// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset Supersession Helper — pure logic (RF11 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET, ADR A8).
 *
 * Helpers for the `(id, version)` immutable versioning scheme: walk
 * `preset.supersededBy` chains, detect whether a current preset has a
 * newer published version, return the chain of ancestors/descendants.
 *
 * Pure: caller passes a registry (map of presetId → preset) plus the
 * current preset id; module returns frozen verdicts. No I/O, no DOM.
 *
 * Anti-requirements (anti-N1 hygiene):
 *   - Cycle detection: visited-set + MAX_CHAIN_DEPTH cap prevents
 *     infinite loops if registry has a malformed `supersededBy` ring.
 *   - Missing successor: when a chain points to an id not in the
 *     registry, the walk stops and the result records the dangling id.
 *
 * Tests live in `tests/compliance-supersession-pure.test.mjs`.
 */

import type { CompliancePreset } from './_presetPure';

export type PresetRegistry = Readonly<Record<string, CompliancePreset>>;

export interface SupersessionStatus {
    readonly hasUpdate: boolean;
    /** The newest preset id reachable by following `supersededBy`. */
    readonly latestId: string;
    /** Depth of the chain from `currentId` to `latestId` (0 = already latest). */
    readonly chainDepth: number;
    /**
     * Why we stopped walking. `terminal` = `supersededBy` is absent (good);
     * `dangling` = chain references unknown id; `cycle` = visited revisit;
     * `depth_cap` = hit MAX_CHAIN_DEPTH.
     */
    readonly stopReason: 'terminal' | 'dangling' | 'cycle' | 'depth_cap' | 'not_found';
    readonly chain: ReadonlyArray<string>;
}

const MAX_CHAIN_DEPTH = 32;

/**
 * Walk `preset.supersededBy` starting from `startId` and return the chain
 * of ids in walk order (`[startId, next1, next2, ...]`).
 *
 * Stops at: missing successor (terminal), dangling reference, cycle
 * detected, or depth cap reached. Always frozen.
 */
export function walkSupersessionChain(
    startId: string | null | undefined,
    registry: PresetRegistry | null | undefined,
): SupersessionStatus {
    if (typeof startId !== 'string' || startId.length === 0) {
        return Object.freeze({
            hasUpdate: false,
            latestId: '',
            chainDepth: 0,
            stopReason: 'not_found' as const,
            chain: Object.freeze([] as string[]),
        });
    }
    if (!registry || typeof registry !== 'object') {
        return Object.freeze({
            hasUpdate: false,
            latestId: startId,
            chainDepth: 0,
            stopReason: 'not_found' as const,
            chain: Object.freeze([startId]),
        });
    }
    const start = registry[startId];
    if (!start) {
        return Object.freeze({
            hasUpdate: false,
            latestId: startId,
            chainDepth: 0,
            stopReason: 'not_found' as const,
            chain: Object.freeze([startId]),
        });
    }

    const chain: string[] = [startId];
    const visited = new Set<string>([startId]);
    let current = start;
    let stopReason: SupersessionStatus['stopReason'] = 'terminal';

    for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
        const nextId = current.supersededBy;
        if (typeof nextId !== 'string' || nextId.length === 0) {
            stopReason = 'terminal';
            break;
        }
        if (visited.has(nextId)) {
            stopReason = 'cycle';
            break;
        }
        const next = registry[nextId];
        if (!next) {
            chain.push(nextId);
            stopReason = 'dangling';
            break;
        }
        chain.push(nextId);
        visited.add(nextId);
        current = next;
        if (depth + 1 === MAX_CHAIN_DEPTH) {
            stopReason = 'depth_cap';
            break;
        }
    }

    const latestId = chain[chain.length - 1] ?? startId;
    const chainDepth = Math.max(0, chain.length - 1);
    // `hasUpdate` is true only when we walked AT LEAST one valid successor
    // AND the stop reason is healthy (terminal or depth_cap, not cycle/dangling).
    const hasUpdate = chainDepth > 0 && (stopReason === 'terminal' || stopReason === 'depth_cap');
    return Object.freeze({
        hasUpdate,
        latestId,
        chainDepth,
        stopReason,
        chain: Object.freeze(chain),
    });
}

/**
 * Convenience — `true` if `presetId`'s chain leads to a newer published
 * preset (i.e. an update is available). Wraps `walkSupersessionChain`.
 */
export function hasUpdateAvailable(
    presetId: string | null | undefined,
    registry: PresetRegistry | null | undefined,
): boolean {
    return walkSupersessionChain(presetId, registry).hasUpdate;
}

/**
 * Build a reverse index: `{ presetId → directPredecessorId | null }`.
 * Useful for "who supersedes whom" displays and for migration UIs.
 *
 * Pure: returns frozen map. If a preset has multiple predecessors (which
 * the schema does not allow but defensive coding cheap), the LAST one
 * scanned wins — registry callers should validate uniqueness upstream.
 */
export function buildPredecessorIndex(registry: PresetRegistry | null | undefined): Readonly<Record<string, string>> {
    if (!registry || typeof registry !== 'object') return Object.freeze({});
    const index: Record<string, string> = Object.create(null);
    for (const id of Object.keys(registry)) {
        const p = registry[id];
        if (p && typeof p.supersededBy === 'string' && p.supersededBy.length > 0) {
            index[p.supersededBy] = id;
        }
    }
    return Object.freeze(index);
}

/**
 * Return the canonical chain head (oldest ancestor) reachable from `presetId`
 * via the predecessor index. Useful when caller wants to display the entire
 * lineage of a preset (origin → current).
 *
 * Pure + cycle-safe via visited set.
 */
export function findChainOrigin(
    presetId: string | null | undefined,
    registry: PresetRegistry | null | undefined,
): string {
    if (typeof presetId !== 'string' || presetId.length === 0) return '';
    if (!registry || !registry[presetId]) return presetId;
    const predIndex = buildPredecessorIndex(registry);
    const visited = new Set<string>([presetId]);
    let current = presetId;
    for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
        const prev = predIndex[current];
        if (!prev || visited.has(prev)) return current;
        visited.add(prev);
        current = prev;
    }
    return current;
}
