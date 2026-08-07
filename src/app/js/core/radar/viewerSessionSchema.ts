// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VIEWER SESSION SCHEMA — Pure-logic frozen-state module
   Modela o ciclo de vida da sessão de um visualizador externo
   que acessa um modelo 3D compartilhado via Model Radar.

   Sem DOM, sem rede, sem Three.js. Totalmente auto-contido.
   ================================================================ */

interface ViewerSession {
    id: string;
    shareCode: string;
    visitorToken: string;
    status: string;
    joinedAt: number;
    lastActiveAt: number;
    interactions: ReadonlyArray<any>;
    interactionCount: number;
    displayName: string;
    userAgent: string;
    leftAt?: number;
    duration?: number;
    bannedAt?: number;
    banReason?: string;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

/**
 * Status possíveis de uma sessão de visualizador.
 */
export const SESSION_STATUS = Object.freeze({
    joining: 'joining',
    active: 'active',
    idle: 'idle',
    disconnected: 'disconnected',
    banned: 'banned',
});

/**
 * Tipos de interação que um visualizador pode registrar.
 */
export const INTERACTION_TYPES = Object.freeze({
    view_element: 'view_element',
    inspect_observation: 'inspect_observation',
    toggle_layer: 'toggle_layer',
    export_request: 'export_request',
    chat_message: 'chat_message',
    screenshot: 'screenshot',
});

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Retorna os primeiros 8 caracteres do token + '…' para exibição segura.
 * @param token
 * @returns
 */
function _hashDisplayToken(token: string): string {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
        throw new Error('visitorToken deve ser uma string não vazia.');
    }
    return token.slice(0, 8) + '…'; // ellipsis character
}

/**
 * Valida e normaliza o displayName.
 * @param displayName
 * @returns
 */
function _normalizeDisplayName(displayName: string | undefined): string {
    if (!displayName || typeof displayName !== 'string') return 'Anonymous';
    const trimmed = displayName.trim();
    if (trimmed.length === 0) return 'Anonymous';
    return trimmed.slice(0, 50);
}

/**
 * Valida e normaliza o userAgent.
 * @param userAgent
 * @returns
 */
function _normalizeUserAgent(userAgent: string | undefined): string {
    if (!userAgent || typeof userAgent !== 'string') return '';
    return userAgent.slice(0, 200);
}

/**
 * Valida metadados de interação (max 5 chaves, string key/value).
 * @param metadata
 * @returns metadata validado e congelado
 */
function _validateMetadata(metadata: Record<string, any>): Readonly<Record<string, string>> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return Object.freeze({});
    }
    const keys = Object.keys(metadata);
    if (keys.length > 5) {
        throw new Error('metadata não pode ter mais de 5 chaves.');
    }
    const validated: Record<string, string> = {};
    for (const key of keys) {
        if (typeof key !== 'string') throw new Error('Chaves de metadata devem ser strings.');
        if (typeof metadata[key] !== 'string') throw new Error('Valores de metadata devem ser strings.');
        validated[key] = metadata[key];
    }
    return Object.freeze(validated);
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Cria uma nova sessão de visualizador no estado 'joining'.
 *
 * @param shareCode  - Código de compartilhamento do modelo
 * @param visitorToken - Token de visitante (não-vazio)
 * @param options
 * @param options.displayName
 * @param options.userAgent
 * @returns Sessão congelada
 */
export function createViewerSession(
    shareCode: string,
    visitorToken: string,
    options: { displayName?: string; userAgent?: string } = {}
): Readonly<ViewerSession> {
    if (!shareCode || typeof shareCode !== 'string' || shareCode.trim().length === 0) {
        throw new Error('shareCode deve ser uma string não vazia.');
    }

    const visitorTokenDisplay = _hashDisplayToken(visitorToken);
    const now = Date.now();

    return Object.freeze({
        id: crypto.randomUUID(),
        shareCode: shareCode.trim(),
        visitorToken: visitorTokenDisplay,
        status: SESSION_STATUS.joining,
        joinedAt: now,
        lastActiveAt: now,
        interactions: Object.freeze([]),
        interactionCount: 0,
        displayName: _normalizeDisplayName(options.displayName),
        userAgent: _normalizeUserAgent(options.userAgent),
    });
}

/**
 * Ativa uma sessão (joining → active).
 *
 * @param session
 * @returns Nova sessão congelada com status='active'
 * @throws Se status não for 'joining'
 */
export function activateSession(session: Readonly<ViewerSession>): Readonly<ViewerSession> {
    if (session.status !== SESSION_STATUS.joining) {
        throw new Error(`activateSession requer status='joining'. Status atual: '${session.status}'.`);
    }
    return Object.freeze({ ...session, status: SESSION_STATUS.active });
}

/**
 * Marca sessão como idle se (Date.now() - lastActiveAt) >= idleThresholdMs e status='active'.
 * Retorna sessão sem alteração se já idle, disconnected, banned ou joining.
 *
 * @param session
 * @param idleThresholdMs - Limiar em ms (padrão 5 min)
 * @returns Sessão (nova congelada ou a mesma)
 */
export function markIdle(
    session: Readonly<ViewerSession>,
    idleThresholdMs = 300_000
): Readonly<ViewerSession> {
    if (session.status !== SESSION_STATUS.active) {
        return session;
    }
    const elapsed = Date.now() - session.lastActiveAt;
    if (elapsed < idleThresholdMs) {
        return session;
    }
    return Object.freeze({ ...session, status: SESSION_STATUS.idle });
}

/**
 * Registra uma interação na sessão.
 * Reativa sessões idle para 'active'.
 *
 * @param session
 * @param type - Deve ser um valor de INTERACTION_TYPES
 * @param metadata - Máximo 5 chaves string:string
 * @returns Nova sessão congelada
 * @throws Se type inválido ou metadata inválido
 */
export function recordInteraction(
    session: Readonly<ViewerSession>,
    type: string,
    metadata: Record<string, any> = {}
): Readonly<ViewerSession> {
    if (!(Object.values(INTERACTION_TYPES) as string[]).includes(type)) {
        throw new Error(
            `Tipo de interação inválido: '${type}'. Valores válidos: ${Object.keys(INTERACTION_TYPES).join(', ')}.`
        );
    }
    const validatedMeta = _validateMetadata(metadata);
    const now = Date.now();
    const interaction = Object.freeze({ type, metadata: validatedMeta, timestamp: now });

    // Copy-on-write: cria novo array com a interação appended
    const newInteractions = Object.freeze([...session.interactions, interaction]);

    return Object.freeze({
        ...session,
        status: SESSION_STATUS.active,
        lastActiveAt: now,
        interactions: newInteractions,
        interactionCount: session.interactionCount + 1,
    });
}

/**
 * Desconecta a sessão, calculando duração.
 *
 * @param session
 * @returns Nova sessão congelada com status='disconnected'
 * @throws Se já disconnected ou banned
 */
export function disconnectSession(session: Readonly<ViewerSession>): Readonly<ViewerSession> {
    if (session.status === SESSION_STATUS.disconnected || session.status === SESSION_STATUS.banned) {
        throw new Error(`disconnectSession não pode ser chamado quando status='${session.status}'.`);
    }
    const leftAt = Date.now();
    return Object.freeze({
        ...session,
        status: SESSION_STATUS.disconnected,
        leftAt,
        duration: leftAt - session.joinedAt,
    });
}

/**
 * Bane a sessão.
 *
 * @param session
 * @param reason - Motivo do banimento (máx 200 chars)
 * @returns Nova sessão congelada com status='banned'
 * @throws Se já banned
 */
export function banSession(session: Readonly<ViewerSession>, reason = ''): Readonly<ViewerSession> {
    if (session.status === SESSION_STATUS.banned) {
        throw new Error(`banSession não pode ser chamado quando status='banned'.`);
    }
    const banReason = typeof reason === 'string' ? reason.slice(0, 200) : '';
    return Object.freeze({
        ...session,
        status: SESSION_STATUS.banned,
        bannedAt: Date.now(),
        banReason,
    });
}

/**
 * Constrói um sumário agregado de múltiplas sessões.
 *
 * @param sessions
 * @returns Sumário congelado
 */
export function buildSessionSummary(sessions: ReadonlyArray<Readonly<ViewerSession>>): Readonly<object> {
    if (!Array.isArray(sessions)) {
        throw new Error('sessions deve ser um array.');
    }

    const byStatus = {
        joining: 0,
        active: 0,
        idle: 0,
        disconnected: 0,
        banned: 0,
    };

    const interactionTypeCounts: Record<string, number> = {};
    for (const key of Object.keys(INTERACTION_TYPES)) {
        interactionTypeCounts[key] = 0;
    }

    let totalInteractions = 0;
    let totalDurationMs = 0;
    let disconnectedCount = 0;

    for (const session of sessions) {
        const status = session.status;
        if (status in byStatus) {
            byStatus[status as keyof typeof byStatus]++;
        }

        totalInteractions += session.interactionCount || 0;

        if (status === SESSION_STATUS.disconnected && typeof session.duration === 'number') {
            totalDurationMs += session.duration;
            disconnectedCount++;
        }

        for (const interaction of session.interactions || []) {
            if (interaction.type in interactionTypeCounts) {
                interactionTypeCounts[interaction.type] = (interactionTypeCounts[interaction.type] ?? 0) + 1;
            }
        }
    }

    // avgDuration: null se não houver sessões disconnected com duração
    const avgDuration = disconnectedCount > 0 ? Math.round(totalDurationMs / disconnectedCount) : null;

    // topInteractionType: tipo com maior contagem; null se nenhuma interação
    let topInteractionType: string | null = null;
    let topCount = 0;
    for (const [type, count] of Object.entries(interactionTypeCounts)) {
        if (count > topCount) {
            topCount = count;
            topInteractionType = type;
        }
    }

    return Object.freeze({
        total: sessions.length,
        byStatus: Object.freeze({ ...byStatus }),
        avgDuration,
        totalInteractions,
        topInteractionType,
    });
}
