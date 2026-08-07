// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation FSM - pure-logic finite state machine for playback lifecycle.
// No browser globals, no localStorage, no DOM. In-memory only.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §3.3
// Paired with: stepModel.js (validated shape), ecbtSegment.js (serialization)

/**
 * Canonical states for the presentation playback lifecycle.
 * Exposed as a frozen tuple for downstream UI owners (KIMI) and audio driver (Codex).
 */
export const PRESENTATION_STATES = Object.freeze({
    IDLE: 'IDLE',
    LOADING: 'LOADING',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR',
});

/**
 * Valid transition matrix. Rejecting unknown transitions prevents UI race
 * conditions where a pause click arrives after completion, etc.
 * Key: from-state. Value: frozen array of allowed to-states.
 */
export const VALID_TRANSITIONS = Object.freeze({
    IDLE: Object.freeze(['LOADING', 'ERROR']),
    LOADING: Object.freeze(['PLAYING', 'ERROR', 'IDLE']),
    PLAYING: Object.freeze(['PAUSED', 'COMPLETED', 'ERROR', 'IDLE']),
    PAUSED: Object.freeze(['PLAYING', 'IDLE', 'ERROR']),
    COMPLETED: Object.freeze(['IDLE', 'LOADING']),
    ERROR: Object.freeze(['IDLE', 'LOADING']),
});

const VALID_TRANSITIONS_BY_STATE: Record<string, ReadonlyArray<string>> = VALID_TRANSITIONS;

/**
 * Events that drive FSM transitions. The state machine is event-sourced -
 * callers dispatch events; the machine decides if the transition is legal.
 */
export const PRESENTATION_EVENTS = Object.freeze({
    LOAD: 'LOAD',
    LOADED: 'LOADED',
    PLAY: 'PLAY',
    PAUSE: 'PAUSE',
    RESUME: 'RESUME',
    NEXT: 'NEXT',
    PREV: 'PREV',
    JUMP: 'JUMP',
    COMPLETE: 'COMPLETE',
    RESET: 'RESET',
    FAIL: 'FAIL',
});

/**
 * Pure reducer: given (state, event, payload?) → next state identifier.
 * Does not mutate; always returns a string from PRESENTATION_STATES.
 *
 * @param event - current state (must be in PRESENTATION_STATES)
 * @param event - event from PRESENTATION_EVENTS
 * @returns next state - identical to `state` if event is a no-op here
 */
function reduceIdle(event: string): string {
    if (event === 'LOAD') return 'LOADING';
    if (event === 'FAIL') return 'ERROR';
    return 'IDLE';
}

function reduceLoading(event: string): string {
    if (event === 'LOADED' || event === 'PLAY') return 'PLAYING';
    if (event === 'FAIL') return 'ERROR';
    if (event === 'RESET') return 'IDLE';
    return 'LOADING';
}

function reducePlaying(event: string): string {
    if (event === 'PAUSE') return 'PAUSED';
    if (event === 'COMPLETE') return 'COMPLETED';
    if (event === 'FAIL') return 'ERROR';
    if (event === 'RESET') return 'IDLE';
    return 'PLAYING';
}

function reducePaused(event: string): string {
    if (event === 'RESUME' || event === 'PLAY') return 'PLAYING';
    if (event === 'RESET') return 'IDLE';
    if (event === 'FAIL') return 'ERROR';
    return 'PAUSED';
}

function reduceCompleted(event: string): string {
    if (event === 'RESET') return 'IDLE';
    if (event === 'LOAD') return 'LOADING';
    return 'COMPLETED';
}

function reduceError(event: string): string {
    if (event === 'RESET') return 'IDLE';
    if (event === 'LOAD') return 'LOADING';
    return 'ERROR';
}

const REDUCERS: Readonly<Record<string, (event: string) => string>> = Object.freeze({
    IDLE: reduceIdle,
    LOADING: reduceLoading,
    PLAYING: reducePlaying,
    PAUSED: reducePaused,
    COMPLETED: reduceCompleted,
    ERROR: reduceError,
});

function reduceState(state: string, event: string): string {
    const reducer = REDUCERS[state];
    return typeof reducer === 'function' ? reducer(event) : 'ERROR';
}

/**
 * Creates a presentation FSM bound to a validated `presentation` object.
 * The instance is a plain object with frozen API. External listeners
 * subscribe via `subscribe(fn)` and receive every state/index change.
 *
 * Advancing steps (NEXT/PREV/JUMP) is synchronous - the timing driver
 * (UI rAF loop or Codex audio engine) is responsible for scheduling. This
 * pure slice only enforces semantic validity.
 *
 * @param opts
 * @returns frozen FSM instance
 */
export function createPresentationFSM(
    { presentation, clock }: { presentation: any; clock?: () => number } = {} as any,
): Readonly<{
    dispatch: (event: string, payload?: any) => any;
    subscribe: (fn: (snap: any) => void) => () => void;
    getState: () => any;
    canTransition: (event: string) => boolean;
}> {
    if (!presentation || typeof presentation !== 'object') {
        throw new TypeError('createPresentationFSM: presentation is required');
    }
    if (!Array.isArray(presentation.steps) || presentation.steps.length === 0) {
        throw new RangeError('createPresentationFSM: presentation.steps must be non-empty');
    }
    const now = typeof clock === 'function' ? clock : Date.now;
    const total = presentation.steps.length;

    // Mutable inner state - only this closure writes to it.
    const inner: {
        state: string;
        currentStepIndex: number;
        lastEvent: string | null;
        lastEventAt: number | null;
        errorReason: string | null;
        listeners: Array<(snap: any) => void>;
    } = {
        state: 'IDLE',
        currentStepIndex: 0,
        lastEvent: null,
        lastEventAt: null,
        errorReason: null,
        listeners: [],
    };

    function snapshot() {
        return Object.freeze({
            state: inner.state,
            currentStepIndex: inner.currentStepIndex,
            totalSteps: total,
            lastEvent: inner.lastEvent,
            lastEventAt: inner.lastEventAt,
            errorReason: inner.errorReason,
            currentStep: presentation.steps[inner.currentStepIndex] || null,
            presentationId: presentation.id,
        });
    }

    function emit() {
        const snap = snapshot();
        for (const cb of inner.listeners.slice()) {
            try {
                cb(snap);
            } catch (err) {
                // Pure-logic module: surface via console only (no rethrow).
                const msg = err instanceof Error ? err.message : err;
                console.warn('[presentation-fsm] listener threw', msg);
            }
        }
    }

    /**
     * @param fn
     */
    function subscribe(fn: (snap: any) => void): () => void {
        if (typeof fn !== 'function') throw new TypeError('subscribe: fn must be a function');
        inner.listeners.push(fn);
        return () => {
            const idx = inner.listeners.indexOf(fn);
            if (idx >= 0) inner.listeners.splice(idx, 1);
        };
    }

    /**
     * Dispatch an event. Returns { accepted: boolean, from, to, reason? }.
     * `accepted=false` means the event was a no-op for this state (NOT an error).
     * @param event
     * @param payload?
     */
    function dispatch(
        event: string,
        payload?: any,
    ): { accepted: boolean; from: string; to: string; event?: string; reason?: string } {
        if (typeof event !== 'string' || !(event in PRESENTATION_EVENTS)) {
            throw new RangeError(`dispatch: unknown event "${event}"`);
        }
        const from = inner.state;

        // Index navigation events are orthogonal to the state FSM.
        if (event === 'NEXT') {
            return _advanceIndex(from, 1);
        }
        if (event === 'PREV') {
            return _advanceIndex(from, -1);
        }
        if (event === 'JUMP') {
            return _jumpIndex(from, payload);
        }

        const to = reduceState(from, event);
        const accepted = to !== from;

        if (accepted && !(VALID_TRANSITIONS_BY_STATE[from] || []).includes(to)) {
            // Defensive: reducer produced a transition that the matrix forbids.
            // This is a bug, not a user input problem - throw to surface fast.
            throw new Error(`FSM invariant violated: ${from}→${to} on ${event}`);
        }

        if (accepted) {
            inner.state = to;
            inner.lastEvent = event;
            inner.lastEventAt = now();
            if (event === 'FAIL') {
                inner.errorReason = payload && payload.reason ? String(payload.reason) : 'unknown';
            }
            if (event === 'RESET') {
                inner.currentStepIndex = 0;
                inner.errorReason = null;
            }
            emit();
        }
        return { accepted, from, to, event };
    }

    /**
     * @param from
     * @param delta
     */
    function _advanceIndex(
        from: string,
        delta: number,
    ): { accepted: boolean; from: string; to: string; event?: string; reason?: string } {
        if (from !== 'PLAYING' && from !== 'PAUSED') {
            return { accepted: false, from, to: from, reason: 'not-in-playback' };
        }
        const next = inner.currentStepIndex + delta;
        if (next < 0 || next >= total) {
            if (delta > 0) {
                // Past last step → natural completion.
                return dispatch('COMPLETE');
            }
            return { accepted: false, from, to: from, reason: 'out-of-range' };
        }
        inner.currentStepIndex = next;
        inner.lastEvent = delta > 0 ? 'NEXT' : 'PREV';
        inner.lastEventAt = now();
        emit();
        return { accepted: true, from, to: from, event: inner.lastEvent };
    }

    /**
     * @param from
     * @param payload
     */
    function _jumpIndex(
        from: string,
        payload: any,
    ): { accepted: boolean; from: string; to: string; event?: string; reason?: string } {
        if (from !== 'PLAYING' && from !== 'PAUSED' && from !== 'LOADING') {
            return { accepted: false, from, to: from, reason: 'not-in-playback' };
        }
        const target = payload && Number.isInteger(payload.index) ? payload.index : NaN;
        if (!Number.isInteger(target) || target < 0 || target >= total) {
            throw new RangeError(`JUMP: index ${target} out of range [0, ${total - 1}]`);
        }
        inner.currentStepIndex = target;
        inner.lastEvent = 'JUMP';
        inner.lastEventAt = now();
        emit();
        return { accepted: true, from, to: from, event: 'JUMP' };
    }

    function getState() {
        return snapshot();
    }

    /**
     * @param event
     */
    function canTransition(event: string): boolean {
        if (typeof event !== 'string' || !(event in PRESENTATION_EVENTS)) return false;
        if (event === 'NEXT' || event === 'PREV' || event === 'JUMP') {
            return inner.state === 'PLAYING' || inner.state === 'PAUSED';
        }
        const to = reduceState(inner.state, event);
        return to !== inner.state;
    }

    return Object.freeze({
        dispatch,
        subscribe,
        getState,
        canTransition,
    });
}
