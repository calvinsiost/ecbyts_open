// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Tab Switch Progress — pure logic (companion to TAB-MODEL-SWITCH-001
 * SPEC §5.1 states + §6 performance gates).
 *
 * Maps a switch phase + elapsed time + element count into a frozen
 * progress VM (phaseLabel + percent 0..100 + estimatedRemainingMs).
 * Pure: caller passes current state; module returns a frozen UI-ready
 * verdict. No DOM, no timers, no IDB.
 *
 * Used by `switchOverlay` (renderer) and tests to validate that the
 * progress UI never goes backwards, completes ≤ 3s on small models,
 * and reports a reasonable ETA.
 *
 * Phases ordered:
 *   snapshotting → disposing → loading → restoring → initializing → rendering → done
 *
 * Tests live in `tests/tab-switch-progress-pure.test.mjs`.
 */

export type SwitchPhase =
    | 'idle'
    | 'snapshotting'
    | 'disposing'
    | 'loading'
    | 'restoring'
    | 'initializing'
    | 'rendering'
    | 'done'
    | 'failed';

export interface SwitchProgressInput {
    readonly phase: SwitchPhase;
    /** Number of elements in the target tab (drives ETA heuristic). */
    readonly elementsCount?: number;
    /** Elapsed ms since switch started. */
    readonly elapsedMs?: number;
}

export interface SwitchProgressVM {
    readonly phase: SwitchPhase;
    readonly phaseLabelKey: string;
    readonly percent: number;
    readonly estimatedRemainingMs: number;
    readonly isComplete: boolean;
    readonly isFailed: boolean;
}

/** Phase weight ordering (used to compute percent baseline). */
const PHASE_ORDER: ReadonlyArray<SwitchPhase> = Object.freeze([
    'idle',
    'snapshotting',
    'disposing',
    'loading',
    'restoring',
    'initializing',
    'rendering',
    'done',
]);

/** % completion baseline per phase (start of phase). */
const PHASE_PERCENT: Readonly<Record<SwitchPhase, number>> = Object.freeze({
    idle: 0,
    snapshotting: 5,
    disposing: 20,
    loading: 35,
    restoring: 55,
    initializing: 80,
    rendering: 95,
    done: 100,
    failed: 100,
});

const PHASE_LABEL_KEY: Readonly<Record<SwitchPhase, string>> = Object.freeze({
    idle: 'tabSwitch.idle',
    snapshotting: 'tabSwitch.savingCurrent',
    disposing: 'tabSwitch.disposing',
    loading: 'tabSwitch.loading',
    restoring: 'tabSwitch.restoringTarget',
    initializing: 'tabSwitch.initializing',
    rendering: 'tabSwitch.rendering',
    done: 'tabSwitch.done',
    failed: 'tabSwitch.failed',
});

/** Calibrated per CS2 (≤3s for ≤500 elements) — heuristic linear extrapolation. */
const BASE_DURATION_MS = 1500;
const MS_PER_ELEMENT = 3;

function clampNonNeg(v: unknown, fallback: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fallback;
    return v;
}

function expectedTotalMs(elementsCount: number): number {
    return BASE_DURATION_MS + Math.max(0, elementsCount) * MS_PER_ELEMENT;
}

/**
 * Resolve a frozen progress VM for the current switch state.
 *
 * Algorithm:
 *   - phase invalid → idle baseline
 *   - phase=done → 100%
 *   - phase=failed → 100% + isFailed:true (caller shows error toast)
 *   - else → percent = PHASE_PERCENT[phase]; ETA = expectedTotal - elapsed
 *
 * Anti-regression invariant: percent monotonically non-decreasing across
 * the ordered phase list (verified in tests).
 */
export function resolveSwitchProgress(input: SwitchProgressInput | null | undefined): SwitchProgressVM {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            phase: 'idle' as const,
            phaseLabelKey: PHASE_LABEL_KEY.idle,
            percent: 0,
            estimatedRemainingMs: 0,
            isComplete: false,
            isFailed: false,
        });
    }
    const elementsCount = clampNonNeg(input.elementsCount, 0);
    const elapsedMs = clampNonNeg(input.elapsedMs, 0);
    let phase: SwitchPhase = input.phase as SwitchPhase;
    if (!(phase in PHASE_PERCENT)) phase = 'idle';

    const percent = PHASE_PERCENT[phase];
    const isComplete = phase === 'done';
    const isFailed = phase === 'failed';

    let estimatedRemainingMs = 0;
    if (!isComplete && !isFailed) {
        const total = expectedTotalMs(elementsCount);
        estimatedRemainingMs = Math.max(0, Math.round(total - elapsedMs));
    }

    return Object.freeze({
        phase,
        phaseLabelKey: PHASE_LABEL_KEY[phase],
        percent,
        estimatedRemainingMs,
        isComplete,
        isFailed,
    });
}

/**
 * Convenience — validate that a SEQUENCE of phases produces monotone
 * non-decreasing percents (no UI flicker). Used by tests + safety checks.
 */
export function isPhaseSequenceMonotonic(phases: ReadonlyArray<SwitchPhase>): boolean {
    if (!Array.isArray(phases) || phases.length === 0) return true;
    let last = -1;
    for (const p of phases) {
        const pct = PHASE_PERCENT[p as SwitchPhase];
        if (typeof pct !== 'number') continue;
        if (p === 'failed') continue; // failed jumps to 100 — exempt
        if (pct < last) return false;
        last = pct;
    }
    return true;
}

/**
 * Convenience — return phase order list (frozen).
 */
export function getPhaseOrder(): ReadonlyArray<SwitchPhase> {
    return PHASE_ORDER;
}
