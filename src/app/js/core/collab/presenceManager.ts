// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Collaboration Presence Manager - pure user-presence state for UX-17 M9.
 *
 * This module intentionally has no DOM, timer, BroadcastChannel, storage, or
 * Supabase dependency. UI adapters can call these transitions after receiving
 * realtime events or local heartbeats, then render the returned avatar stack.
 *
 * Presence row:
 *   { userId, displayName, role, avatarUrl, color, tabId, status,
 *     joinedAt, lastSeenAt, lastAction }
 */

export const DEFAULT_PRESENCE_HEARTBEAT_MS = 15000;
export const DEFAULT_PRESENCE_TIMEOUT_MS = 30000;
export const DEFAULT_VISIBLE_AVATARS = 4;

const VALID_ROLES = new Set(['owner', 'admin', 'editor', 'viewer', 'public']);
const VALID_STATUSES = new Set(['active', 'idle', 'offline']);
const ROLE_ORDER = new Map([
    ['owner', 0],
    ['admin', 1],
    ['editor', 2],
    ['viewer', 3],
    ['public', 4],
]);

function assertState(state: any) {
    if (!state || !(state.users instanceof Map)) {
        throw new Error('presence state required');
    }
}

function assertFiniteNumber(value: any, label: any) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be finite number`);
    }
    return value;
}

function nonEmptyString(value: any, label: any) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} required`);
    }
    return value.trim();
}

function normalizeOptionalString(value: any) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeRole(role: any) {
    const value = role || 'viewer';
    if (!VALID_ROLES.has(value)) throw new Error(`invalid role: ${value}`);
    return value;
}

function normalizeStatus(status: any) {
    const value = status || 'active';
    if (!VALID_STATUSES.has(value)) throw new Error(`invalid status: ${value}`);
    return value;
}

function freezeUser(user: any) {
    return Object.freeze({ ...user });
}

function freezeState({ modelId, orgId, users }: any) {
    const frozenUsers = new Map();
    for (const [userId, user] of users) {
        frozenUsers.set(userId, freezeUser(user));
    }
    return Object.freeze({
        modelId,
        orgId: orgId || null,
        users: frozenUsers,
    });
}

function cloneUsers(users: any) {
    const out = new Map();
    for (const [userId, user] of users) out.set(userId, { ...user });
    return out;
}

function normalizePresenceInput(
    input: any,
    previous: any,
    state: any,
    fallbackNow: any,
) {
    if (!input || typeof input !== 'object') throw new Error('presence input required');
    const userId = nonEmptyString(input.userId, 'userId');
    const lastSeenAt = assertFiniteNumber(input.lastSeenAt ?? fallbackNow, 'lastSeenAt');
    const joinedAt = assertFiniteNumber(input.joinedAt ?? previous?.joinedAt ?? lastSeenAt, 'joinedAt');
    const displayName = nonEmptyString(input.displayName ?? previous?.displayName ?? userId, 'displayName');

    return {
        userId,
        modelId: state.modelId,
        orgId: state.orgId,
        displayName,
        role: normalizeRole(input.role ?? previous?.role ?? 'viewer'),
        avatarUrl: normalizeOptionalString(input.avatarUrl ?? previous?.avatarUrl),
        color: normalizeOptionalString(input.color ?? previous?.color),
        tabId: normalizeOptionalString(input.tabId ?? previous?.tabId),
        status: normalizeStatus(input.status ?? previous?.status ?? 'active'),
        joinedAt,
        lastSeenAt,
        lastAction: normalizeOptionalString(input.lastAction ?? previous?.lastAction),
    };
}

function comparePresence(a: any, b: any) {
    const byRole = (ROLE_ORDER.get(a.role) ?? 99) - (ROLE_ORDER.get(b.role) ?? 99);
    if (byRole !== 0) return byRole;
    const bySeen = b.lastSeenAt - a.lastSeenAt;
    if (bySeen !== 0) return bySeen;
    const byName = a.displayName.localeCompare(b.displayName, 'en');
    if (byName !== 0) return byName;
    return a.userId.localeCompare(b.userId, 'en');
}

function initialsFor(displayName: any) {
    const parts = String(displayName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) return '?';
    const first = (parts[0] ?? '').charAt(0);
    const last = parts.length > 1 ? (parts[parts.length - 1] ?? '').charAt(0) : '';
    return `${first}${last}`.toUpperCase();
}

function avatarRow(user: any, now: any) {
    const seconds = Math.max(0, Math.floor((now - user.lastSeenAt) / 1000));
    return Object.freeze({
        ...user,
        initials: initialsFor(user.displayName),
        lastSeenSecondsAgo: seconds,
        ariaLabel: `${user.displayName}, ${user.role}, last seen ${seconds}s ago`,
    });
}

/**
 * Creates an empty presence state for one model.
 *
 * @param {{modelId:string, orgId?:string|null}} args
 */
export function createPresenceState({ modelId, orgId = null } = ({} as any)) {
    return freezeState({
        modelId: nonEmptyString(modelId, 'modelId'),
        orgId: normalizeOptionalString(orgId),
        users: new Map(),
    });
}

/**
 * Adds or replaces one user's current presence row.
 *
 * @param {any} state
 * @param {any} input
 */
export function upsertPresence(state: any, input: any) {
    assertState(state);
    const userId = nonEmptyString(input?.userId, 'userId');
    const users = cloneUsers(state.users);
    const previous = users.get(userId) || null;
    const fallbackNow = previous?.lastSeenAt ?? Date.now();
    users.set(userId, normalizePresenceInput(input, previous, state, fallbackNow));
    return freezeState({ ...state, users });
}

/**
 * Updates the heartbeat for an already-known user.
 *
 * @param {any} state
 * @param {string} userId
 * @param {number} lastSeenAt
 * @param {{status?:string, tabId?:string, lastAction?:string}} [patch]
 */
export function recordPresenceHeartbeat(state: any, userId: string, lastSeenAt: number, patch: {status?:string, tabId?:string, lastAction?:string} = {}) {
    assertState(state);
    const id = nonEmptyString(userId, 'userId');
    if (!state.users.has(id)) throw new Error(`unknown presence user: ${id}`);
    const users = cloneUsers(state.users);
    const previous = users.get(id);
    const status = patch.status ?? (previous.status === 'offline' ? 'active' : previous.status);
    users.set(id, {
        ...previous,
        status: normalizeStatus(status),
        tabId: patch.tabId === undefined ? previous.tabId : normalizeOptionalString(patch.tabId),
        lastAction: patch.lastAction === undefined ? previous.lastAction : normalizeOptionalString(patch.lastAction),
        lastSeenAt: assertFiniteNumber(lastSeenAt, 'lastSeenAt'),
    });
    return freezeState({ ...state, users });
}

/**
 * Marks a user offline while preserving the row for audit/debug UI.
 */
export function markPresenceOffline(state: any, userId: any, at: any) {
    assertState(state);
    const id = nonEmptyString(userId, 'userId');
    if (!state.users.has(id)) return state;
    const users = cloneUsers(state.users);
    const previous = users.get(id);
    users.set(id, {
        ...previous,
        status: 'offline',
        lastSeenAt: assertFiniteNumber(at, 'lastSeenAt'),
    });
    return freezeState({ ...state, users });
}

/**
 * Removes a user's presence row. Idempotent.
 */
export function removePresence(state: any, userId: any) {
    assertState(state);
    const id = nonEmptyString(userId, 'userId');
    if (!state.users.has(id)) return state;
    const users = cloneUsers(state.users);
    users.delete(id);
    return freezeState({ ...state, users });
}

/**
 * Returns active, non-offline users sorted for top-right avatar rendering.
 */
export function listActivePresence(
    state: any,
    now: any,
    timeoutMs = DEFAULT_PRESENCE_TIMEOUT_MS,
) {
    assertState(state);
    assertFiniteNumber(now, 'now');
    assertFiniteNumber(timeoutMs, 'timeoutMs');
    if (timeoutMs <= 0) throw new Error('timeoutMs must be positive');
    const cutoff = now - timeoutMs;
    return Object.freeze(
        Array.from(state.users.values())
            .filter((user: any) => user.status !== 'offline' && user.lastSeenAt > cutoff)
            .sort(comparePresence)
            .map(freezeUser),
    );
}

/**
 * Builds the pure view-model for top-right presence avatars.
 */
export function buildPresenceAvatarStack(
    state: any,
    now: any,
    opts: any = {},
) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PRESENCE_TIMEOUT_MS;
    const maxVisible = opts.maxVisible ?? DEFAULT_VISIBLE_AVATARS;
    if (!Number.isInteger(maxVisible) || maxVisible <= 0) {
        throw new Error('maxVisible must be positive integer');
    }
    const active = listActivePresence(state, now, timeoutMs);
    const visible = active.slice(0, maxVisible).map((user) => avatarRow(user, now));
    return Object.freeze({
        visible: Object.freeze(visible),
        overflow: Math.max(0, active.length - visible.length),
        totalActive: active.length,
        ariaLabel: `${active.length} active collaborator${active.length === 1 ? '' : 's'}`,
    });
}

/**
 * Summarizes presence state for diagnostics and cheap tests.
 */
export function summarizePresence(
    state: any,
    now: any,
    timeoutMs = DEFAULT_PRESENCE_TIMEOUT_MS,
) {
    assertState(state);
    const active = listActivePresence(state, now, timeoutMs);
        const byRole: Record<string, number>= { owner: 0, admin: 0, editor: 0, viewer: 0, public: 0 };
        const byStatus: Record<string, number>= { active: 0, idle: 0, offline: 0 };
    for (const user of state.users.values()) {
        byRole[user.role] = (byRole[user.role] || 0) + 1;
        byStatus[user.status] = (byStatus[user.status] || 0) + 1;
    }
    return Object.freeze({
        modelId: state.modelId,
        totalUsers: state.users.size,
        activeUsers: active.length,
        inactiveUsers: state.users.size - active.length,
        byRole: Object.freeze(byRole),
        byStatus: Object.freeze(byStatus),
    });
}

/**
 * Builds the persistence/realtime payload an adapter can send every 15s.
 */
export function buildPresenceHeartbeatPayload(
    state: any,
    userId: any,
    lastSeenAt: any,
) {
    assertState(state);
    const id = nonEmptyString(userId, 'userId');
    const user = state.users.get(id);
    if (!user) throw new Error(`unknown presence user: ${id}`);
    return Object.freeze({
        type: 'collab_presence_heartbeat',
        modelId: state.modelId,
        orgId: state.orgId,
        userId: id,
        role: user.role,
        tabId: user.tabId,
        lastSeenAt: assertFiniteNumber(lastSeenAt, 'lastSeenAt'),
        heartbeatMs: DEFAULT_PRESENCE_HEARTBEAT_MS,
        timeoutMs: DEFAULT_PRESENCE_TIMEOUT_MS,
    });
}
