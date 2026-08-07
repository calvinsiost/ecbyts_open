// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * UI Invalidation Coalesce — pure logic companion to WS-2 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Given a batch of domain invalidations + a dependency graph (e.g.
 * "interpolation depends on elementList"), computes the minimal
 * effective set + topological execution order.
 *
 * Pure: caller passes the raw batch + frozen dependency map; module
 * returns a frozen plan. No DOM/timer.
 *
 * Anti-N (correctness):
 *   - `full` invalidation wins over any subset — dropped granular domains
 *   - Self-dependencies ignored
 *   - Cycle in graph → caller's bug; module breaks cycle by visited-set
 *   - Unknown domain → treated as no-op (logged in `dropped`)
 *
 * Tests live in `tests/invalidation-coalesce-pure.test.mjs`.
 */

export interface CoalesceInput {
    /** Raw batch of invalidation requests (may include duplicates). */
    readonly batch: ReadonlyArray<string>;
    /** Dependency map: domain → list of domains that ALSO need re-render. */
    readonly dependencyMap?: Readonly<Record<string, ReadonlyArray<string>>>;
    /** Whitelist of known domains — anything else dropped. */
    readonly knownDomains: ReadonlyArray<string>;
    /** Sentinel for the "full re-render" pseudo-domain (default `'full'`). */
    readonly fullSentinel?: string;
}

export interface CoalescePlan {
    readonly ordered: ReadonlyArray<string>;
    readonly expanded: ReadonlyArray<string>; // domains added by dependency expansion
    readonly dropped: ReadonlyArray<string>; // duplicates or unknown
    readonly isFull: boolean;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * Compute the coalesce plan. Pure: returns frozen plan; never mutates inputs.
 */
export function coalesceInvalidations(input: CoalesceInput | null | undefined): CoalescePlan {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            ordered: Object.freeze([] as string[]),
            expanded: Object.freeze([] as string[]),
            dropped: Object.freeze([] as string[]),
            isFull: false,
        });
    }
    const fullSentinel = isNonEmptyString(input.fullSentinel) ? input.fullSentinel : 'full';
    const known = new Set(Array.isArray(input.knownDomains) ? input.knownDomains.filter(isNonEmptyString) : []);
    const depMap =
        input.dependencyMap && typeof input.dependencyMap === 'object' ? input.dependencyMap : {};
    const batch = Array.isArray(input.batch) ? input.batch : [];

    const dropped: string[] = [];
    const accepted = new Set<string>();
    let hasFull = false;

    // Pass 1: validate + dedup
    const seen = new Set<string>();
    for (const item of batch) {
        if (!isNonEmptyString(item)) {
            dropped.push(String(item));
            continue;
        }
        if (seen.has(item)) {
            dropped.push(item);
            continue;
        }
        seen.add(item);
        if (item === fullSentinel) {
            hasFull = true;
            continue;
        }
        if (!known.has(item)) {
            dropped.push(item);
            continue;
        }
        accepted.add(item);
    }

    // Pass 2: if FULL → drop all granular (full re-render covers them)
    if (hasFull) {
        for (const a of accepted) dropped.push(a);
        return Object.freeze({
            ordered: Object.freeze([fullSentinel]),
            expanded: Object.freeze([] as string[]),
            dropped: Object.freeze([...new Set(dropped)]),
            isFull: true,
        });
    }

    // Pass 3: dependency expansion (cycle-safe via visited)
    const expanded = new Set<string>();
    const visited = new Set<string>();
    const stack = [...accepted];
    while (stack.length > 0) {
        const node = stack.pop() as string;
        if (visited.has(node)) continue;
        visited.add(node);
        const deps = (depMap as Record<string, ReadonlyArray<string>>)[node];
        if (Array.isArray(deps)) {
            for (const d of deps) {
                if (!isNonEmptyString(d)) continue;
                if (d === node) continue;
                if (!known.has(d)) {
                    dropped.push(d);
                    continue;
                }
                if (!accepted.has(d)) {
                    expanded.add(d);
                    accepted.add(d);
                }
                stack.push(d);
            }
        }
    }

    // Pass 4: topological order — dependencies (deepest first), then origin.
    // Kahn's algorithm with in-degree from depMap.
    const inDegree = new Map<string, number>();
    for (const d of accepted) inDegree.set(d, 0);
    for (const node of accepted) {
        const deps = (depMap as Record<string, ReadonlyArray<string>>)[node];
        if (!Array.isArray(deps)) continue;
        for (const d of deps) {
            if (d === node) continue;
            if (accepted.has(d)) {
                inDegree.set(d, (inDegree.get(d) ?? 0) + 1);
            }
        }
    }
    // Sort entries by inDegree ASC, then by domain name ASC for determinism
    const ordered: string[] = [...accepted].sort((a, b) => {
        const da = inDegree.get(a) ?? 0;
        const db = inDegree.get(b) ?? 0;
        if (da !== db) return da - db;
        return a.localeCompare(b);
    });

    return Object.freeze({
        ordered: Object.freeze(ordered),
        expanded: Object.freeze([...expanded].sort()),
        dropped: Object.freeze([...new Set(dropped)]),
        isFull: false,
    });
}

/**
 * Convenience — returns the domain count savings vs naive (unique-batch
 * processing). Used by metrics + tests.
 */
export function coalesceSavings(input: CoalesceInput | null | undefined): Readonly<{ naive: number; coalesced: number; saved: number }> {
    const plan = coalesceInvalidations(input);
    const naive = Array.isArray(input?.batch) ? new Set(input?.batch || []).size : 0;
    const coalesced = plan.ordered.length;
    return Object.freeze({ naive, coalesced, saved: Math.max(0, naive - coalesced) });
}
