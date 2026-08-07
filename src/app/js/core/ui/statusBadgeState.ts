// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Status Badge State - pure-logic, zero DOM (UX-82)
// Models system health, connection, sync, license, validation indicators.
// All operations return new frozen state (immutable).

const VALID_TYPES = Object.freeze(['connection', 'sync', 'health', 'license', 'validation', 'custom']);
const VALID_STATES = Object.freeze(['ok', 'warning', 'error', 'pending', 'offline']);
const HISTORY_CAP = 50;

// Severity order: worst case wins for getOverallSeverity.
// 'pending' < 'ok' < 'warning' < 'offline' < 'error'? - semantics: error is worst, then offline,
// then warning, then pending, then ok (no badges or all ok).
const SEVERITY_RANK = Object.freeze({
    ok: 0,
    pending: 1,
    warning: 2,
    offline: 3,
    error: 4,
});

function freezeBadge(badge: any): Readonly<any> {
    return Object.freeze({
        ...badge,
        history: Object.freeze(badge.history.map((h: any) => Object.freeze({ ...h }))),
    });
}

function freezeState(badgesMap: any): Readonly<{ badges: Map<any, any> }> {
    const frozen = new Map();
    for (const [id, badge] of badgesMap.entries()) {
        frozen.set(id, freezeBadge(badge));
    }
    // Note: Map itself can't be deeply frozen, but we wrap in frozen object.
    return Object.freeze({
        badges: frozen,
    });
}

/** Create empty status badge state. */
export function createStatusBadgeState(): Readonly<{ badges: Map<any, any> }> {
    return freezeState(new Map());
}

function validateType(type: any): void {
    if (!VALID_TYPES.includes(type)) {
        throw new Error(`invalid badge type: ${type}`);
    }
}

function validateBadgeState(state: any): void {
    if (!VALID_STATES.includes(state)) {
        throw new Error(`invalid badge state: ${state}`);
    }
}

function validatePriority(priority: any): void {
    if (typeof priority !== 'number' || !Number.isFinite(priority) || priority < 0 || priority > 10) {
        throw new Error('priority must be a number between 0 and 10');
    }
}

function validateBadge(badge: any): void {
    if (!badge || typeof badge !== 'object') throw new Error('badge must be an object');
    if (typeof badge.id !== 'string' || badge.id.length === 0) throw new Error('badge.id required');
    validateType(badge.type);
    validateBadgeState(badge.state);
    if (typeof badge.label !== 'string') throw new Error('badge.label required');
    if (badge.message !== undefined && badge.message !== null && typeof badge.message !== 'string') {
        throw new Error('badge.message must be a string');
    }
    if (typeof badge.lastUpdated !== 'number' || !Number.isFinite(badge.lastUpdated)) {
        throw new Error('badge.lastUpdated must be finite number');
    }
    validatePriority(badge.priority);
}

function normalizeBadgeInput(badge: any) {
    return {
        id: badge?.id,
        type: badge?.type,
        state: badge?.state,
        label: badge?.label ?? '',
        message: badge?.message ?? '',
        lastUpdated: badge?.lastUpdated ?? 0,
        history: Array.isArray(badge?.history) ? badge.history.slice() : [],
        priority: badge?.priority ?? 5,
    };
}

function assertStateValid(state: any): void {
    if (!state || !(state.badges instanceof Map)) throw new Error('invalid state');
}

function assertNotRegistered(state: any, id: string): void {
    if (state.badges.has(id)) {
        throw new Error(`badge already registered: ${id}`);
    }
}

/** Register a new badge. Throws on duplicate id or invalid fields. */
export function registerBadge(state: any, badge: any): Readonly<{ badges: Map<any, any> }> {
    assertStateValid(state);
    const normalized = normalizeBadgeInput(badge);
    validateBadge(normalized);
    assertNotRegistered(state, normalized.id);
    const next = new Map(state.badges);
    next.set(normalized.id, normalized);
    return freezeState(next);
}

function assertBadgeExists(state: any, badgeId: any): any {
    const existing = state.badges.get(badgeId);
    if (!existing) throw new Error(`badge not found: ${badgeId}`);
    return existing;
}

function assertValidNow(now: any): void {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
}

function applyBadgeUpdateState(existing: any, partial: any, updated: any): boolean {
    let pushHistory = false;
    if (partial.state !== undefined) {
        validateBadgeState(partial.state);
        if (partial.state !== existing.state) pushHistory = true;
        updated.state = partial.state;
    }
    return pushHistory;
}

function applyBadgeUpdateLabel(partial: any, updated: any): void {
    if (partial.label !== undefined) {
        if (typeof partial.label !== 'string') throw new Error('label must be string');
        updated.label = partial.label;
    }
}

function applyBadgeUpdateMessage(partial: any, updated: any, pushHistory: boolean): boolean {
    if (partial.message === undefined) return pushHistory;
    if (partial.message !== null && typeof partial.message !== 'string') {
        throw new Error('message must be string');
    }
    updated.message = partial.message ?? '';
    if (partial.state === undefined) return true;
    return pushHistory;
}

function applyBadgeUpdatePriority(partial: any, updated: any): void {
    if (partial.priority !== undefined) {
        validatePriority(partial.priority);
        updated.priority = partial.priority;
    }
}

function applyBadgeUpdateType(partial: any, updated: any): void {
    if (partial.type !== undefined) {
        validateType(partial.type);
        updated.type = partial.type;
    }
}

function buildUpdatedHistory(existing: any, updated: any, now: number, pushHistory: boolean): any[] {
    if (!pushHistory) return existing.history.slice();
    const entry = { state: updated.state, timestamp: now, message: updated.message ?? '' };
    const history = existing.history.concat([entry]);
    return history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history;
}

/** Update badge fields, push history entry on state change. */
export function updateBadge(
    state: any,
    badgeId: any,
    partial: any,
    now: any,
): Readonly<{ badges: Map<any, any> }> {
    assertStateValid(state);
    const existing = assertBadgeExists(state, badgeId);
    assertValidNow(now);
    const updated = { ...existing };
    let pushHistory = applyBadgeUpdateState(existing, partial, updated);
    applyBadgeUpdateLabel(partial, updated);
    pushHistory = applyBadgeUpdateMessage(partial, updated, pushHistory);
    applyBadgeUpdatePriority(partial, updated);
    applyBadgeUpdateType(partial, updated);
    updated.lastUpdated = now;
    updated.history = buildUpdatedHistory(existing, updated, now, pushHistory);
    const next = new Map(state.badges);
    next.set(badgeId, updated);
    return freezeState(next);
}

/** Remove a badge by id. No-op if not found. */
export function unregisterBadge(state: any, badgeId: any): Readonly<{ badges: Map<any, any> }> {
    if (!state || !(state.badges instanceof Map)) throw new Error('invalid state');
    if (!state.badges.has(badgeId)) return state;
    const next = new Map(state.badges);
    next.delete(badgeId);
    return freezeState(next);
}

/** Shortcut: set state + optional message, push history. */
export function setBadgeState(
    state: any,
    badgeId: any,
    newState: any,
    message: any,
    now: any,
): Readonly<{ badges: Map<any, any> }> {
    return updateBadge(state, badgeId, { state: newState, message: message ?? '' }, now);
}

/** Lookup badge by id. */
export function getBadgeById(state: any, badgeId: any): any {
    if (!state || !(state.badges instanceof Map)) return null;
    return state.badges.get(badgeId) ?? null;
}

/** Filter badges by type. */
export function getBadgesByType(state: any, type: any): any[] {
    validateType(type);
    const out: any[] = [];
    for (const b of state.badges.values()) {
        if (b.type === type) out.push(b);
    }
    return out;
}

/** Filter badges by state. */
export function getBadgesByState(state: any, badgeState: any): any[] {
    validateBadgeState(badgeState);
    const out: any[] = [];
    for (const b of state.badges.values()) {
        if (b.state === badgeState) out.push(b);
    }
    return out;
}

/** Worst-case severity across all badges. Empty → 'ok'. */
export function getOverallSeverity(state: any): string {
    if (!state || !(state.badges instanceof Map) || state.badges.size === 0) return 'ok';
    let worst = 'ok';
    let worstRank: number = SEVERITY_RANK.ok;
    for (const b of state.badges.values()) {
        const r = (SEVERITY_RANK as Record<string, number>)[b.state] as number;
        if (r > worstRank) {
            worstRank = r;
            worst = b.state;
        }
    }
    return worst;
}

/** Active alerts (warning/error/offline) sorted by priority desc, then id asc. */
export function getActiveAlerts(state: any): any[] {
    const out: any[] = [];
    for (const b of state.badges.values()) {
        if (b.state === 'warning' || b.state === 'error' || b.state === 'offline') {
            out.push(b);
        }
    }
    out.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
}

/** Clear history of one badge. */
export function clearHistory(state: any, badgeId: any): Readonly<{ badges: Map<any, any> }> {
    if (!state || !(state.badges instanceof Map)) throw new Error('invalid state');
    const existing = state.badges.get(badgeId);
    if (!existing) throw new Error(`badge not found: ${badgeId}`);
    const updated = { ...existing, history: [] };
    const next = new Map(state.badges);
    next.set(badgeId, updated);
    return freezeState(next);
}

/** Summary stats. */
export function summarizeStatusBadges(state: any): Readonly<any> {
    const byState = { ok: 0, warning: 0, error: 0, pending: 0, offline: 0 };
    const byType = { connection: 0, sync: 0, health: 0, license: 0, validation: 0, custom: 0 };
    let activeAlertsCount = 0;
    for (const b of state.badges.values()) {
        (byState as Record<string, number>)[b.state] = ((byState as Record<string, number>)[b.state] ?? 0) + 1;
        (byType as Record<string, number>)[b.type] = ((byType as Record<string, number>)[b.type] ?? 0) + 1;
        if (b.state === 'warning' || b.state === 'error' || b.state === 'offline') {
            activeAlertsCount++;
        }
    }
    return Object.freeze({
        total: state.badges.size,
        byState: Object.freeze(byState),
        byType: Object.freeze(byType),
        overallSeverity: getOverallSeverity(state),
        activeAlertsCount,
    });
}
