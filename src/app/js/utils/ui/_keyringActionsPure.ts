// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — F3.3 pure-logic dos 3 handlers.
 * (claude - novaspec, 2026-06-03).
 *
 * State machine + audit log payload builder + i18n message resolver para os 3
 * handlers da coluna "Segurança" no painel Radar profile manager:
 *   - rotate: dispara geração de novo ECDH P-256 keypair (Web Crypto), substitui
 *     a chave pública do profile mantendo o profileId. Ações sub-sequentes:
 *     audit INSERT 'rotate' + flag de re-issue da chave ECBT-D nos modelos ativos.
 *   - revoke: zera ecdh_public_key_jwk + ecdh_key_id + ecdh_registered_at.
 *     Audit INSERT 'revoke'. Chaves ECBT-D antigas continuam decifráveis pelo
 *     recipient revogado (snapshot histórico) — apenas nova issue exclui ele.
 *   - inviteToRegister: gera link convite Supabase + audit INSERT 'invite'.
 *     Owner copia para clipboard ou compartilha via canal externo.
 *
 * Toda lógica é pure (sem DOM, sem Web Crypto, sem rede). O wire DOM
 * (utils/ui/radar/profileManagerModal.ts) chama estas funções para validar input,
 * obter mensagens i18n, e construir o payload do audit log. O wire é responsável
 * pelas chamadas reais a crypto.subtle e Supabase RPC.
 *
 * Refs:
 *   - SPEC §5.4 UI Visibility Rule
 *   - _ecbtCryptoModalsPure.ts (buildRadarProfileSecurityState — actionKeys)
 *   - supabase/migrations/20260603030000 (ecbt_encryption_audit schema)
 */

import { I18N_NAMESPACE, type ProfileKeyringStatus } from './_ecbtCryptoModalsPure.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

/** Ações canônicas do audit log (5 valores conforme migration §4.3). */
export const AUDIT_ACTIONS = Object.freeze(['issue', 'unwrap', 'revoke', 'rotate', 'invite'] as const);
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Estados do handler — gating de UI antes do call real. */
export const HANDLER_STATES = Object.freeze([
    'idle',
    'confirming',
    'pending',
    'success',
    'error',
] as const);
export type HandlerState = (typeof HANDLER_STATES)[number];

/** Operações handler-side suportadas. */
export const KEYRING_OPERATIONS = Object.freeze(['rotate', 'revoke', 'invite'] as const);
export type KeyringOperation = (typeof KEYRING_OPERATIONS)[number];

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface KeyringHandlerContext {
    readonly profileId: string;
    readonly currentStatus: ProfileKeyringStatus;
    readonly ownerUserId: string;
    readonly modelId?: string;
}

export interface KeyringHandlerState {
    readonly operation: KeyringOperation;
    readonly state: HandlerState;
    readonly confirmKey?: string; // i18n key da mensagem de confirmação
    readonly statusKey?: string; // i18n key da mensagem de status
    readonly errorMessage?: string;
}

export interface AuditLogPayload {
    readonly action: AuditAction;
    readonly profileId: string;
    readonly ownerUserId: string;
    readonly modelId?: string;
    readonly timestamp: string; // ISO 8601
    readonly metadata: Readonly<Record<string, unknown>>;
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Determina se uma operação é permitida dado o status atual do keyring.
 *
 * Regras:
 *   - rotate: permitido em 'registered' ou 'expired' (não em 'missing' — sem
 *     chave anterior para rotacionar)
 *   - revoke: permitido apenas em 'registered' ou 'expired'
 *   - invite: permitido apenas em 'missing' (não faz sentido convidar quem já
 *     tem chave)
 */
export function isOperationAllowed(
    operation: KeyringOperation,
    status: ProfileKeyringStatus,
): boolean {
    if (operation === 'rotate' || operation === 'revoke') {
        return status === 'registered' || status === 'expired';
    }
    if (operation === 'invite') {
        return status === 'missing';
    }
    return false;
}

/** Type guard para KeyringOperation. */
export function isKeyringOperation(input: unknown): input is KeyringOperation {
    return (
        typeof input === 'string' &&
        (KEYRING_OPERATIONS as ReadonlyArray<string>).includes(input)
    );
}

// ----------------------------------------------------------------
// STATE MACHINE BUILDER
// ----------------------------------------------------------------

/**
 * Constrói o estado inicial do handler quando o usuário clica no botão.
 *
 * Sempre começa em 'confirming' (modal de confirmação antes da ação real).
 * Após confirmação positiva, o wire deve avançar para 'pending' chamando
 * advanceHandlerState(state, 'pending').
 */
export function buildInitialHandlerState(
    operation: KeyringOperation,
    context: KeyringHandlerContext,
): KeyringHandlerState {
    if (!context || typeof context.profileId !== 'string' || !context.profileId) {
        throw new Error('[keyringActions] profileId required');
    }
    if (!isKeyringOperation(operation)) {
        throw new Error(`[keyringActions] invalid operation: ${operation}`);
    }
    if (!isOperationAllowed(operation, context.currentStatus)) {
        return Object.freeze({
            operation,
            state: 'error',
            errorMessage: `Operation ${operation} not allowed for status ${context.currentStatus}`,
        });
    }
    const confirmKey = `${I18N_NAMESPACE}.profile.confirm.${operation}`;
    return Object.freeze({
        operation,
        state: 'confirming',
        confirmKey,
    });
}

/**
 * Avança o estado do handler — transições permitidas:
 *   confirming → pending | idle (cancel)
 *   pending → success | error
 *   success | error → idle (reset para próxima operação)
 */
export function advanceHandlerState(
    current: KeyringHandlerState,
    next: HandlerState,
    extra?: { statusKey?: string; errorMessage?: string },
): KeyringHandlerState {
    const ALLOWED_TRANSITIONS: Readonly<Record<HandlerState, ReadonlyArray<HandlerState>>> = Object.freeze({
        idle: Object.freeze<HandlerState[]>(['confirming']),
        confirming: Object.freeze<HandlerState[]>(['pending', 'idle']),
        pending: Object.freeze<HandlerState[]>(['success', 'error']),
        success: Object.freeze<HandlerState[]>(['idle']),
        error: Object.freeze<HandlerState[]>(['idle']),
    });
    const allowed = ALLOWED_TRANSITIONS[current.state] || [];
    if (!allowed.includes(next)) {
        throw new Error(
            `[keyringActions] invalid transition ${current.state} → ${next}`,
        );
    }
    const result: any = {
        operation: current.operation,
        state: next,
    };
    if (next === 'success' || next === 'pending') {
        result.statusKey =
            extra?.statusKey || `${I18N_NAMESPACE}.profile.status.${current.operation}.${next}`;
    }
    if (next === 'error') {
        result.errorMessage = extra?.errorMessage || 'unknown error';
        result.statusKey = `${I18N_NAMESPACE}.profile.status.${current.operation}.error`;
    }
    return Object.freeze(result);
}

// ----------------------------------------------------------------
// AUDIT LOG PAYLOAD BUILDER
// ----------------------------------------------------------------

/**
 * Constrói o payload para INSERT em public.ecbt_encryption_audit.
 *
 * Operações handler-side mapeiam para audit actions:
 *   rotate → 'rotate'
 *   revoke → 'revoke'
 *   invite → 'invite'
 */
export function buildAuditLogPayload(
    operation: KeyringOperation,
    context: KeyringHandlerContext,
    extraMetadata?: Record<string, unknown>,
    nowIso?: string,
): AuditLogPayload {
    if (!isKeyringOperation(operation)) {
        throw new Error(`[keyringActions] invalid operation: ${operation}`);
    }
    if (!context || typeof context.profileId !== 'string' || !context.profileId) {
        throw new Error('[keyringActions] profileId required');
    }
    if (typeof context.ownerUserId !== 'string' || !context.ownerUserId) {
        throw new Error('[keyringActions] ownerUserId required');
    }
    const action: AuditAction = operation;
    const timestamp = nowIso || new Date().toISOString();
    const metadata: Record<string, unknown> = {
        previous_status: context.currentStatus,
        operation_source: 'profile_manager_modal',
    };
    if (extraMetadata) Object.assign(metadata, extraMetadata);
    const result: any = {
        action,
        profileId: context.profileId,
        ownerUserId: context.ownerUserId,
        timestamp,
        metadata: Object.freeze(metadata),
    };
    if (context.modelId) result.modelId = context.modelId;
    return Object.freeze(result);
}

// ----------------------------------------------------------------
// INVITE LINK BUILDER
// ----------------------------------------------------------------

export interface InviteLinkParams {
    readonly profileId: string;
    readonly profileSlug: string;
    readonly projectId: string;
    readonly origin: string; // ex: 'https://ecbyts.com'
    readonly token?: string; // se já tem token Supabase gerado
}

/**
 * Constrói o link de convite para o stakeholder registrar sua chave ECDH.
 *
 * Formato: {origin}/?invite=ecbt-crypto&pid={profileId}&slug={slug}&proj={projectId}[&token={token}]
 *
 * O recipient abre o link → guard de auth → modal "Registrar chave de
 * criptografia" → gera ECDH P-256 local (IDB) → upload pública via Supabase →
 * profile passa de 'missing' para 'registered'.
 */
export function buildInviteLink(params: InviteLinkParams): string {
    if (!params || typeof params !== 'object') {
        throw new Error('[keyringActions] InviteLinkParams required');
    }
    const required = ['profileId', 'profileSlug', 'projectId', 'origin'] as const;
    for (const k of required) {
        if (typeof params[k] !== 'string' || !params[k]) {
            throw new Error(`[keyringActions] ${k} required (got ${typeof params[k]})`);
        }
    }
    // origin sem trailing slash
    const cleanOrigin = params.origin.replace(/\/+$/, '');
    const qp = new URLSearchParams({
        invite: 'ecbt-crypto',
        pid: params.profileId,
        slug: params.profileSlug,
        proj: params.projectId,
    });
    if (params.token) qp.set('token', params.token);
    return `${cleanOrigin}/?${qp.toString()}`;
}

// ----------------------------------------------------------------
// I18N KEY HELPERS
// ----------------------------------------------------------------

/**
 * Resolve i18n key para texto do botão de cada operação no painel Radar.
 * Reutilizado por buildRadarProfileSecurityState (já existente em F3).
 */
export function getActionLabelKey(operation: KeyringOperation): string {
    if (operation === 'rotate') return `${I18N_NAMESPACE}.profile.action.rotate`;
    if (operation === 'revoke') return `${I18N_NAMESPACE}.profile.action.revoke`;
    if (operation === 'invite') return `${I18N_NAMESPACE}.profile.action.inviteToRegister`;
    throw new Error(`[keyringActions] unknown operation: ${operation}`);
}

/** Resolve i18n key da mensagem de toast em caso de sucesso. */
export function getSuccessToastKey(operation: KeyringOperation): string {
    return `${I18N_NAMESPACE}.profile.toast.${operation}.success`;
}

/** Resolve i18n key da mensagem de toast em caso de erro. */
export function getErrorToastKey(operation: KeyringOperation): string {
    return `${I18N_NAMESPACE}.profile.toast.${operation}.error`;
}
