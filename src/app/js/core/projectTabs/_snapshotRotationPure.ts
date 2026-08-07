// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Tab Snapshot Rotation Policy — pure logic (companion to TAB-MODEL-SWITCH-001
 * §4.3 IDB Schema).
 *
 * IndexedDB has practical size limits — tab snapshots can grow to MB
 * each (elements + scene + thumbnail). This module decides WHICH
 * snapshots to evict when:
 *
 *   1. Total snapshot count exceeds `maxSnapshots` (default 20)
 *   2. Total bytes exceeds `maxBytes` (default 100 MB)
 *   3. Per-tab snapshots exceed `maxPerTab` (default 3 — keep last 3 per tab)
 *
 * Eviction policy: LRU + pinned + active protection
 *   - Snapshot for `activeTabId` is NEVER evicted (current session)
 *   - Snapshots flagged `pinned: true` NEVER evicted
 *   - Among the remaining, oldest `lastAccessedAt` evicted first
 *   - Per-tab keep at least 1 snapshot even if all are old (so tab not empty)
 *
 * Pure: caller passes the registry of snapshots + policy config; module
 * returns the list of snapshot ids to delete. Caller persists via IDB.
 *
 * Tests live in `tests/tab-snapshot-rotation-pure.test.mjs`.
 */

export interface SnapshotMetadata {
    readonly snapshotId: string;
    readonly tabId: string;
    /** ISO-8601 of last load/restore. */
    readonly lastAccessedAt: string;
    /** Size in bytes. */
    readonly sizeBytes: number;
    /** True when user pinned this snapshot (NEVER evict). */
    readonly pinned?: boolean;
}

export interface RotationConfig {
    readonly maxSnapshots?: number;
    readonly maxBytes?: number;
    readonly maxPerTab?: number;
    readonly activeTabId?: string;
}

export interface RotationDecision {
    readonly toEvict: ReadonlyArray<string>;
    readonly kept: ReadonlyArray<string>;
    readonly reason: 'within_limits' | 'count_exceeded' | 'bytes_exceeded' | 'per_tab_exceeded';
    readonly totalBytesBefore: number;
    readonly totalBytesAfter: number;
}

const DEFAULT_MAX_SNAPSHOTS = 20;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_PER_TAB = 3;

function isProtected(snap: SnapshotMetadata, activeTabId: string | undefined): boolean {
    if (snap.pinned === true) return true;
    if (activeTabId && snap.tabId === activeTabId) return true;
    return false;
}

function parseTs(iso: string): number {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
}

/**
 * Decide which snapshots to evict given the current registry + policy.
 * Pure: returns a frozen decision.
 *
 * Algorithm:
 *   1. Filter protected (active tab + pinned) — never evict
 *   2. For each tab, keep at least 1 most-recent snapshot
 *   3. Within each tab, evict oldest > maxPerTab
 *   4. If still over count limit → evict oldest from non-protected pool
 *   5. If still over bytes limit → evict oldest from non-protected pool
 */
export function decideRotation(
    snapshots: ReadonlyArray<SnapshotMetadata> | null | undefined,
    config?: RotationConfig | null,
): RotationDecision {
    const list = Array.isArray(snapshots) ? snapshots.filter((s) => s && typeof s === 'object') : [];
    const cfg: Required<RotationConfig> = {
        maxSnapshots:
            config && Number.isFinite(config.maxSnapshots) && (config.maxSnapshots as number) > 0
                ? (config.maxSnapshots as number)
                : DEFAULT_MAX_SNAPSHOTS,
        maxBytes:
            config && Number.isFinite(config.maxBytes) && (config.maxBytes as number) > 0
                ? (config.maxBytes as number)
                : DEFAULT_MAX_BYTES,
        maxPerTab:
            config && Number.isFinite(config.maxPerTab) && (config.maxPerTab as number) > 0
                ? (config.maxPerTab as number)
                : DEFAULT_MAX_PER_TAB,
        activeTabId: typeof config?.activeTabId === 'string' ? (config.activeTabId as string) : '',
    };

    const totalBytesBefore = list.reduce((acc, s) => acc + (Number.isFinite(s.sizeBytes) ? s.sizeBytes : 0), 0);

    // Pass 1: per-tab cap
    const byTab: Map<string, SnapshotMetadata[]> = new Map();
    for (const s of list) {
        const arr = byTab.get(s.tabId) ?? [];
        arr.push(s);
        byTab.set(s.tabId, arr);
    }
    const evictSet = new Set<string>();
    for (const [, arr] of byTab) {
        arr.sort((a, b) => parseTs(b.lastAccessedAt) - parseTs(a.lastAccessedAt));
        // Keep at least 1 (most recent), even if over cap
        for (let i = cfg.maxPerTab; i < arr.length; i++) {
            const s = arr[i] as SnapshotMetadata;
            if (!isProtected(s, cfg.activeTabId)) evictSet.add(s.snapshotId);
        }
    }
    let reason: RotationDecision['reason'] = evictSet.size > 0 ? 'per_tab_exceeded' : 'within_limits';

    // Pass 2: count cap (among NOT-already-evicted, not-protected)
    let alive = list.filter((s) => !evictSet.has(s.snapshotId));
    if (alive.length > cfg.maxSnapshots) {
        const aliveSorted = alive
            .filter((s) => !isProtected(s, cfg.activeTabId))
            .sort((a, b) => parseTs(a.lastAccessedAt) - parseTs(b.lastAccessedAt));
        const toRemove = alive.length - cfg.maxSnapshots;
        for (let i = 0; i < Math.min(toRemove, aliveSorted.length); i++) {
            evictSet.add(aliveSorted[i].snapshotId);
        }
        if (reason === 'within_limits') reason = 'count_exceeded';
        alive = list.filter((s) => !evictSet.has(s.snapshotId));
    }

    // Pass 3: bytes cap (same approach)
    let aliveBytes = alive.reduce((acc, s) => acc + (Number.isFinite(s.sizeBytes) ? s.sizeBytes : 0), 0);
    if (aliveBytes > cfg.maxBytes) {
        const aliveSorted = alive
            .filter((s) => !isProtected(s, cfg.activeTabId))
            .sort((a, b) => parseTs(a.lastAccessedAt) - parseTs(b.lastAccessedAt));
        for (const candidate of aliveSorted) {
            if (aliveBytes <= cfg.maxBytes) break;
            evictSet.add(candidate.snapshotId);
            aliveBytes -= Number.isFinite(candidate.sizeBytes) ? candidate.sizeBytes : 0;
            if (reason === 'within_limits' || reason === 'per_tab_exceeded') {
                reason = 'bytes_exceeded';
            }
        }
        alive = list.filter((s) => !evictSet.has(s.snapshotId));
    }

    const toEvict = Object.freeze([...evictSet]);
    const kept = Object.freeze(alive.map((s) => s.snapshotId));
    const totalBytesAfter = alive.reduce((acc, s) => acc + (Number.isFinite(s.sizeBytes) ? s.sizeBytes : 0), 0);

    return Object.freeze({
        toEvict,
        kept,
        reason,
        totalBytesBefore,
        totalBytesAfter,
    });
}
