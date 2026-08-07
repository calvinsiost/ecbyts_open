// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset Lock State — pure logic (RF14 / B8 / D8 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Calvin D8 recommendation: model approved by client can be LOCKED to
 * prevent silent preset changes after export. Lock flow is reversible
 * (auditor can unlock with a stated reason).
 *
 * State model:
 *   ComplianceLockState = { locked, lockedAt?, lockedBy? }
 *
 * Transitions:
 *   lock(state, actor, reason)       → locked    (always allowed when unlocked)
 *   unlock(state, actor, reason)     → unlocked  (always allowed when locked, audit recorded)
 *   changePreset(state, reason?)     → verdict   (gate, not state change)
 *
 * `changePreset` returns an `LockedActionVerdict`:
 *   - `allowed` when state is unlocked OR (locked AND non-empty reason)
 *   - `blocked` when locked AND no reason
 *
 * Pure: caller persists state + audit entry; module orchestrates verdict
 * + recommended audit row shape.
 *
 * Tests live in `tests/compliance-lock-state-pure.test.mjs`.
 */

export interface ComplianceLockState {
    readonly locked: boolean;
    readonly lockedAt?: string | undefined;
    readonly lockedBy?: string | undefined;
}

export interface LockTransitionAudit {
    readonly action: 'lock' | 'unlock';
    readonly actor: string;
    readonly reason: string;
    readonly ts: string;
}

export interface LockTransitionResult {
    readonly state: ComplianceLockState;
    readonly audit: LockTransitionAudit;
}

export interface LockedActionVerdict {
    readonly allowed: boolean;
    readonly reason: 'unlocked' | 'locked_with_reason' | 'locked_no_reason';
    /** Recommended audit row when allowed under lock (caller must persist). */
    readonly auditNote?: string;
}

const UNLOCKED: ComplianceLockState = Object.freeze({ locked: false });

function freezeState(s: ComplianceLockState): ComplianceLockState {
    return Object.freeze({ ...s });
}

function freezeResult(r: LockTransitionResult): LockTransitionResult {
    return Object.freeze({
        state: Object.freeze({ ...r.state }),
        audit: Object.freeze({ ...r.audit }),
    });
}

/**
 * Initial state — model created without lock. Frozen, safe to share.
 */
export function unlockedState(): ComplianceLockState {
    return UNLOCKED;
}

/**
 * Transition: unlocked → locked. Requires actor + non-empty reason.
 *
 * Throws (defensive) when:
 *   - already locked (caller bug — check `state.locked` first)
 *   - actor empty
 *   - reason empty (lock MUST be motivated for auditor trail)
 */
export function lock(
    state: ComplianceLockState | null | undefined,
    actor: string,
    reason: string,
    ts: string,
): LockTransitionResult {
    if (!state || typeof state !== 'object') {
        throw new Error('lock: state_invalid');
    }
    if (state.locked) {
        throw new Error('lock: already_locked');
    }
    if (typeof actor !== 'string' || actor.length === 0) {
        throw new Error('lock: actor_required');
    }
    if (typeof reason !== 'string' || reason.length === 0) {
        throw new Error('lock: reason_required');
    }
    if (typeof ts !== 'string' || !Number.isFinite(Date.parse(ts))) {
        throw new Error('lock: ts_invalid_iso');
    }
    return freezeResult({
        state: { locked: true, lockedAt: ts, lockedBy: actor },
        audit: { action: 'lock', actor, reason, ts },
    });
}

/**
 * Transition: locked → unlocked. Same guard rules as lock.
 */
export function unlock(
    state: ComplianceLockState | null | undefined,
    actor: string,
    reason: string,
    ts: string,
): LockTransitionResult {
    if (!state || typeof state !== 'object') {
        throw new Error('unlock: state_invalid');
    }
    if (!state.locked) {
        throw new Error('unlock: not_locked');
    }
    if (typeof actor !== 'string' || actor.length === 0) {
        throw new Error('unlock: actor_required');
    }
    if (typeof reason !== 'string' || reason.length === 0) {
        throw new Error('unlock: reason_required');
    }
    if (typeof ts !== 'string' || !Number.isFinite(Date.parse(ts))) {
        throw new Error('unlock: ts_invalid_iso');
    }
    return freezeResult({
        state: UNLOCKED,
        audit: { action: 'unlock', actor, reason, ts },
    });
}

/**
 * Gate: should a preset-change action be allowed given current lock state?
 *
 * Algorithm:
 *   - state.locked === false → ALLOWED, reason 'unlocked'
 *   - state.locked === true  + non-empty reason → ALLOWED with audit warning
 *   - state.locked === true  + empty/missing reason → BLOCKED
 */
export function decideChangePresetUnderLock(
    state: ComplianceLockState | null | undefined,
    reason?: string,
): LockedActionVerdict {
    if (!state || typeof state !== 'object' || !state.locked) {
        return Object.freeze({
            allowed: true,
            reason: 'unlocked' as const,
        });
    }
    if (typeof reason === 'string' && reason.length > 0) {
        return Object.freeze({
            allowed: true,
            reason: 'locked_with_reason' as const,
            auditNote: `Preset change applied on LOCKED model. Reason: ${reason}`,
        });
    }
    return Object.freeze({
        allowed: false,
        reason: 'locked_no_reason' as const,
    });
}

/**
 * Defensive — read-only helper, just normalises a possibly-corrupt persisted
 * state back to a frozen safe shape. Useful at load-time from IDB/Supabase.
 */
export function normaliseLockState(raw: unknown): ComplianceLockState {
    if (!raw || typeof raw !== 'object') return UNLOCKED;
    const r = raw as Partial<ComplianceLockState>;
    if (r.locked !== true) return UNLOCKED;
    return freezeState({
        locked: true,
        lockedAt: typeof r.lockedAt === 'string' ? r.lockedAt : undefined,
        lockedBy: typeof r.lockedBy === 'string' ? r.lockedBy : undefined,
    });
}
