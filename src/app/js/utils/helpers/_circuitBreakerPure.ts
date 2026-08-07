// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Circuit Breaker — pure logic.
 *
 * Classic 3-state circuit breaker (closed → open → half-open → closed)
 * to protect downstream services from cascading failure. Pure: caller
 * passes the current state + event; module returns frozen new state.
 *
 * Use cases: Supabase edge function pool, library marketplace API,
 * Surya OCR proxy, photolog upload — anything where consecutive failures
 * mean "give up trying for a while".
 *
 * State machine:
 *   - closed: pass-through; count failures; → open when threshold hit
 *   - open: short-circuit (reject all); after cooldown → half-open
 *   - half-open: allow probe; success → closed; failure → open (extended cooldown)
 *
 * Tests live in `tests/circuit-breaker-pure.test.mjs`.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitConfig {
    readonly failureThreshold: number; // failures in window to trip
    readonly cooldownMs: number; // open → half-open after this many ms
    readonly halfOpenMaxProbes: number; // concurrent probes allowed in half-open
}

export interface CircuitStateSnapshot {
    readonly state: CircuitState;
    readonly consecutiveFailures: number;
    readonly lastFailureAt: number; // epoch ms (0 = never)
    readonly openedAt: number; // epoch ms (0 = never opened)
    readonly halfOpenProbesActive: number;
    readonly config: CircuitConfig;
}

export interface BreakerDecision {
    readonly allowed: boolean;
    readonly reason: 'closed_ok' | 'half_open_probe' | 'half_open_full' | 'open_cooldown';
    readonly state: CircuitState;
}

const DEFAULT_CONFIG: CircuitConfig = Object.freeze({
    failureThreshold: 5,
    cooldownMs: 30_000,
    halfOpenMaxProbes: 1,
});

function freezeSnapshot(s: CircuitStateSnapshot): CircuitStateSnapshot {
    return Object.freeze({ ...s, config: Object.freeze({ ...s.config }) });
}

/**
 * Bootstrap a closed circuit with default or custom config.
 */
export function createCircuit(config?: Partial<CircuitConfig>): CircuitStateSnapshot {
    const cfg: CircuitConfig = {
        failureThreshold:
            typeof config?.failureThreshold === 'number' && config.failureThreshold > 0
                ? Math.floor(config.failureThreshold)
                : DEFAULT_CONFIG.failureThreshold,
        cooldownMs:
            typeof config?.cooldownMs === 'number' && config.cooldownMs > 0
                ? config.cooldownMs
                : DEFAULT_CONFIG.cooldownMs,
        halfOpenMaxProbes:
            typeof config?.halfOpenMaxProbes === 'number' && config.halfOpenMaxProbes > 0
                ? Math.floor(config.halfOpenMaxProbes)
                : DEFAULT_CONFIG.halfOpenMaxProbes,
    };
    return freezeSnapshot({
        state: 'closed',
        consecutiveFailures: 0,
        lastFailureAt: 0,
        openedAt: 0,
        halfOpenProbesActive: 0,
        config: cfg,
    });
}

/**
 * Decide whether to allow a new request given current state + clock.
 * Pure: returns frozen verdict.
 */
export function decideRequest(
    snap: CircuitStateSnapshot | null | undefined,
    nowMs: number,
): BreakerDecision {
    if (!snap || typeof snap !== 'object') {
        return Object.freeze({
            allowed: true,
            reason: 'closed_ok' as const,
            state: 'closed' as const,
        });
    }
    if (snap.state === 'closed') {
        return Object.freeze({ allowed: true, reason: 'closed_ok' as const, state: 'closed' });
    }
    if (snap.state === 'open') {
        // Cooldown elapsed → caller should transition via tickClock
        if (nowMs - snap.openedAt >= snap.config.cooldownMs) {
            return Object.freeze({
                allowed: true,
                reason: 'half_open_probe' as const,
                state: 'half_open',
            });
        }
        return Object.freeze({
            allowed: false,
            reason: 'open_cooldown' as const,
            state: 'open',
        });
    }
    // half_open
    if (snap.halfOpenProbesActive < snap.config.halfOpenMaxProbes) {
        return Object.freeze({
            allowed: true,
            reason: 'half_open_probe' as const,
            state: 'half_open',
        });
    }
    return Object.freeze({
        allowed: false,
        reason: 'half_open_full' as const,
        state: 'half_open',
    });
}

/**
 * Transition: caller starts a probe (half-open) → increment counter.
 */
export function startProbe(snap: CircuitStateSnapshot | null | undefined, nowMs: number): CircuitStateSnapshot {
    if (!snap) return createCircuit();
    // Auto-promote from open to half_open if cooldown elapsed
    let s = snap;
    if (s.state === 'open' && nowMs - s.openedAt >= s.config.cooldownMs) {
        s = freezeSnapshot({ ...s, state: 'half_open', halfOpenProbesActive: 0 });
    }
    if (s.state === 'half_open') {
        return freezeSnapshot({ ...s, halfOpenProbesActive: s.halfOpenProbesActive + 1 });
    }
    return s;
}

/**
 * Record a success. Pure: returns new state.
 *   - closed → closed (reset counter)
 *   - half_open → closed (success rehabilitates)
 *   - open → no change (caller shouldn't be calling success when open)
 */
export function recordSuccess(snap: CircuitStateSnapshot | null | undefined): CircuitStateSnapshot {
    if (!snap) return createCircuit();
    if (snap.state === 'closed' && snap.consecutiveFailures === 0) return snap;
    if (snap.state === 'closed') {
        return freezeSnapshot({ ...snap, consecutiveFailures: 0 });
    }
    if (snap.state === 'half_open') {
        return freezeSnapshot({
            ...snap,
            state: 'closed',
            consecutiveFailures: 0,
            openedAt: 0,
            halfOpenProbesActive: 0,
        });
    }
    return snap;
}

/**
 * Record a failure. Pure: returns new state.
 *   - closed → closed (incremented) or → open (threshold reached)
 *   - half_open → open (failure during probe re-opens)
 *   - open → open (timestamp update only)
 */
export function recordFailure(snap: CircuitStateSnapshot | null | undefined, nowMs: number): CircuitStateSnapshot {
    if (!snap) return createCircuit();
    if (snap.state === 'closed') {
        const failures = snap.consecutiveFailures + 1;
        if (failures >= snap.config.failureThreshold) {
            return freezeSnapshot({
                ...snap,
                state: 'open',
                consecutiveFailures: failures,
                lastFailureAt: nowMs,
                openedAt: nowMs,
            });
        }
        return freezeSnapshot({ ...snap, consecutiveFailures: failures, lastFailureAt: nowMs });
    }
    if (snap.state === 'half_open') {
        return freezeSnapshot({
            ...snap,
            state: 'open',
            consecutiveFailures: snap.consecutiveFailures + 1,
            lastFailureAt: nowMs,
            openedAt: nowMs,
            halfOpenProbesActive: 0,
        });
    }
    // open → just update timestamp
    return freezeSnapshot({ ...snap, lastFailureAt: nowMs });
}

/**
 * Convenience — `true` when state is currently rejecting requests.
 */
export function isTripped(snap: CircuitStateSnapshot | null | undefined): boolean {
    if (!snap) return false;
    return snap.state === 'open';
}

export const CIRCUIT_DEFAULT_CONFIG = DEFAULT_CONFIG;
