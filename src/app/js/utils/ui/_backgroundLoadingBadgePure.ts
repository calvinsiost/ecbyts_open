// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// _backgroundLoadingBadgePure - pure state helpers for the discrete background
// loading badge in the status bar. No DOM, timers, or I/O.

export interface BgTask {
    readonly id: string;
    readonly label: string;
}

export interface BadgeVM {
    readonly visible: boolean;
    readonly text: string;
    readonly count: number;
}

/**
 * Adds or updates a background task. Immutable: returns a new frozen array.
 * Deduplicates by id, so adding the same id updates the label.
 */
export function addBgTask(
    tasks: ReadonlyArray<BgTask> | null | undefined,
    task: Partial<BgTask> | null | undefined,
): readonly BgTask[] {
    const list = Array.isArray(tasks) ? tasks : [];
    const id = String(task?.id || '').trim();
    if (!id) return Object.freeze(list.slice());
    const label = String(task?.label || '').trim();
    const filtered = list.filter((t) => t.id !== id);
    return Object.freeze([...filtered, Object.freeze({ id, label })]);
}

/** Removes a background task by id. Immutable. */
export function removeBgTask(
    tasks: ReadonlyArray<BgTask> | null | undefined,
    id: string | null | undefined,
): readonly BgTask[] {
    const list = Array.isArray(tasks) ? tasks : [];
    const target = String(id || '').trim();
    return Object.freeze(list.filter((t) => t.id !== target));
}

/**
 * Derives the badge view-model from active tasks.
 * 0 tasks: hidden. 1 task: first label. N tasks: first label + counter.
 */
export function deriveBadgeVM(tasks: ReadonlyArray<BgTask> | null | undefined): BadgeVM {
    const list = Array.isArray(tasks) ? tasks : [];
    const count = list.length;
    if (count === 0) return Object.freeze({ visible: false, text: '', count: 0 });
    const first = list[0]?.label || '…';
    const text = count > 1 ? `${first} +${count - 1}` : first;
    return Object.freeze({ visible: true, text, count });
}
