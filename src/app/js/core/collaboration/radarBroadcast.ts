// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Radar Broadcast State - pure-logic (UX-40, Phase 4 SPEC_COLLABORATION_JOURNEY)
 *
 * Modelo de estado para broadcast de modelos via share_code (Model Radar feature).
 * Zero dependência de DOM/network/storage - apenas estado imutável e transições
 * puras. As camadas de transporte (Supabase realtime, share URLs) serão adicionadas
 * em fases posteriores.
 *
 * Estado:
 *   { sessions: Map<shareCode, BroadcastSession> }
 * BroadcastSession:
 *   { shareCode, ownerId, modelId, createdAt, expiresAt, profile,
 *     heartbeats: Map<viewerId, lastSeenAt>, viewerCount, accessLog: [...] }
 */

const VALID_PROFILES = new Set(['view', 'comment', 'edit']);

function freezeSession(session: any) {
    const heartbeats = new Map();
    for (const [k, v] of session.heartbeats) heartbeats.set(k, v);
    return Object.freeze({
        shareCode: session.shareCode,
        ownerId: session.ownerId,
        modelId: session.modelId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        profile: session.profile,
        heartbeats,
        viewerCount: session.viewerCount,
        accessLog: Object.freeze([...session.accessLog]),
    });
}

function freezeState(state: any) {
    const sessions = new Map();
    for (const [k, v] of state.sessions) sessions.set(k, freezeSession(v));
    return Object.freeze({ sessions });
}

function cloneSessions(sessions: any) {
    const out = new Map();
    for (const [k, v] of sessions) {
        out.set(k, {
            ...v,
            heartbeats: new Map(v.heartbeats),
            accessLog: [...v.accessLog],
        });
    }
    return out;
}

/**
 * Cria um store vazio frozen.
 */
export function createRadarStore() {
    return freezeState({ sessions: new Map() });
}

/**
 * Inicia um broadcast.
 * @throws se shareCode duplicado, profile inválido, ttlMs ≤ 0.
 */
export function startBroadcast(
    state: any,
    { shareCode, ownerId, modelId, profile, ttlMs, now }: any,
) {
    if (!shareCode || typeof shareCode !== 'string') throw new Error('shareCode required');
    if (!ownerId || typeof ownerId !== 'string') throw new Error('ownerId required');
    if (!modelId || typeof modelId !== 'string') throw new Error('modelId required');
    if (!VALID_PROFILES.has(profile)) throw new Error(`invalid profile: ${profile}`);
    if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new Error('ttlMs must be positive finite number');
    }
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
    if (state.sessions.has(shareCode)) throw new Error(`shareCode already active: ${shareCode}`);
    const sessions = cloneSessions(state.sessions);
    sessions.set(shareCode, {
        shareCode,
        ownerId,
        modelId,
        createdAt: now,
        expiresAt: now + ttlMs,
        profile,
        heartbeats: new Map(),
        viewerCount: 0,
        accessLog: [],
    });
    return freezeState({ sessions });
}

/**
 * Para o broadcast. Apenas owner.
 * @throws se shareCode desconhecido ou actor não é owner.
 */
export function stopBroadcast(state: any, shareCode: any, actorId: any) {
    const session = state.sessions.get(shareCode);
    if (!session) throw new Error(`unknown shareCode: ${shareCode}`);
    if (session.ownerId !== actorId) {
        throw new Error(`actor ${actorId} is not owner of ${shareCode}`);
    }
    const sessions = cloneSessions(state.sessions);
    sessions.delete(shareCode);
    return freezeState({ sessions });
}

/**
 * Viewer entra no broadcast. Registra em heartbeats + accessLog.
 * @throws se shareCode inexistente ou expirado.
 */
export function joinBroadcast(
    state: any,
    shareCode: any,
    viewerId: any,
    now: any,
) {
    const session = state.sessions.get(shareCode);
    if (!session) throw new Error(`unknown shareCode: ${shareCode}`);
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
    if (now >= session.expiresAt) throw new Error(`broadcast expired: ${shareCode}`);
    if (!viewerId || typeof viewerId !== 'string') throw new Error('viewerId required');
    const sessions = cloneSessions(state.sessions);
    const s = sessions.get(shareCode);
    const isNew = !s.heartbeats.has(viewerId);
    s.heartbeats.set(viewerId, now);
    if (isNew) s.viewerCount += 1;
    s.accessLog.push({ viewerId, action: 'join', at: now });
    return freezeState({ sessions });
}

/**
 * Atualiza heartbeat do viewer.
 * @throws se shareCode desconhecido ou viewer não registrado.
 */
export function recordHeartbeat(
    state: any,
    shareCode: any,
    viewerId: any,
    now: any,
) {
    const session = state.sessions.get(shareCode);
    if (!session) throw new Error(`unknown shareCode: ${shareCode}`);
    if (!session.heartbeats.has(viewerId)) {
        throw new Error(`viewer ${viewerId} not in broadcast ${shareCode}`);
    }
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
    const sessions = cloneSessions(state.sessions);
    sessions.get(shareCode).heartbeats.set(viewerId, now);
    return freezeState({ sessions });
}

/**
 * Viewer sai. Idempotente - sai silenciosamente se não registrado.
 */
export function leaveBroadcast(
    state: any,
    shareCode: any,
    viewerId: any,
    now = 0,
) {
    const session = state.sessions.get(shareCode);
    if (!session) return state;
    if (!session.heartbeats.has(viewerId)) return state;
    const sessions = cloneSessions(state.sessions);
    const s = sessions.get(shareCode);
    s.heartbeats.delete(viewerId);
    s.accessLog.push({ viewerId, action: 'leave', at: now });
    return freezeState({ sessions });
}

/**
 * Retorna viewerIds com lastSeenAt > now - timeoutMs.
 */
export function getActiveViewers(
    state: any,
    shareCode: any,
    now: any,
    timeoutMs = 15000,
) {
    const session = state.sessions.get(shareCode);
    if (!session) return [];
    const cutoff = now - timeoutMs;
    const out = [];
    for (const [viewerId, lastSeenAt] of session.heartbeats) {
        if (lastSeenAt > cutoff) out.push(viewerId);
    }
    return out;
}

/**
 * Verifica se a sessão expirou.
 */
export function isExpired(session: any, now: any) {
    if (!session) return true;
    return now >= session.expiresAt;
}

/**
 * Remove sessões expiradas.
 */
export function cleanupExpired(state: any, now: any) {
    const sessions = cloneSessions(state.sessions);
    let changed = false;
    for (const [code, s] of sessions) {
        if (now >= s.expiresAt) {
            sessions.delete(code);
            changed = true;
        }
    }
    if (!changed) return state;
    return freezeState({ sessions });
}

/**
 * Sumário do estado.
 */
export function summarizeBroadcasts(state: any, now: any) {
    let activeSessionCount = 0;
    let totalViewers = 0;
    const profileBreakdown = ({ view: 0, comment: 0, edit: 0 } as Record<string, number>);
    for (const s of state.sessions.values()) {
        if (now < s.expiresAt) {
            activeSessionCount += 1;
            totalViewers += s.viewerCount;
            profileBreakdown[s.profile] = (profileBreakdown[s.profile] || 0) + 1;
        }
    }
    return { activeSessionCount, totalViewers, profileBreakdown };
}
