// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INVITE ENFORCEMENT — decisão PURA do gate de convite pós-login
   ================================================================
   Contexto (EARLY-ADOPTER-LAUNCH-READINESS#oauth-invite-claim):
   o login por email/senha saiu da UI (decisão Calvin 2026-08-05) e o
   cadastro passou a ser OAuth-only. O claim do convite vivia SOMENTE no
   caminho de email (handlers/auth.ts::_processInviteAfterSignup, chamado
   por handleRegisterEmail) — o callback OAuth nunca reivindicava nada.
   Resultado medido em prod 2026-08-06: 17 contas, 13 convites, ZERO
   reivindicados (identity.invite_redemptions vazia). O beta "fechado"
   estava aberto para qualquer conta Google/GitHub/Microsoft.

   Este módulo é a decisão pura (sem DOM, sem rede, sem storage) usada por
   utils/auth/session.ts::enforceInviteGateAfterAuth.

   REGRA DE OURO: os fatos que LIBERAM a sessão vêm todos do SERVIDOR, via
   api.invite_gate_status() (migration 20260806120000), que deriva de
   auth.uid() e não aceita parâmetro de usuário. O cliente não pode forjar
   "já reivindicado", "sou admin" nem "sou conta antiga". O único input local
   é o CÓDIGO pendente — e código só serve para TENTAR um claim, que o
   servidor valida (expiração, max_uses, revogação) em api.claim_invite.
   ================================================================ */

import { validateInviteCodeFormat } from './inviteCode.js';

/**
 * Corte de grandfathering — espelha identity.invite_gate_cutoff() na
 * migration 20260806120000. Mantido aqui apenas para documentação e testes:
 * a decisão real usa o campo `grandfathered` devolvido pelo servidor.
 */
export const INVITE_GRANDFATHER_BEFORE_ISO = '2026-08-06T00:00:00.000Z';

export type InviteEnforcementAction = 'allow' | 'claim' | 'deny';

export type InviteEnforcementReason =
    | 'feature-off'
    | 'no-user'
    | 'e2e-bypass'
    | 'status-unavailable'
    | 'already-claimed'
    | 'privileged-role'
    | 'grandfathered'
    | 'server-allowed'
    | 'claim-stored-code'
    | 'no-invite'
    | 'invalid-stored-code'
    | 'claim-failed';

/** Retorno normalizado de api.invite_gate_status(). */
export interface InviteGateServerStatus {
    authenticated: boolean;
    /** consumiu convite (identity.invite_redemptions OU platform_invites.claimed_by) */
    claimed: boolean;
    /** conta criada antes de identity.invite_gate_cutoff() */
    grandfathered: boolean;
    /** profiles.role in (admin, superadmin) */
    privileged: boolean;
    /** claimed OR grandfathered OR privileged — veredito do servidor */
    allowed: boolean;
}

export interface InviteEnforcementInput {
    /** CONFIG.FEATURES.INVITE_ONLY */
    inviteOnly: boolean;
    /** Há sessão autenticada? (sem sessão não há nada a decidir) */
    hasUser: boolean;
    /**
     * Resposta de api.invite_gate_status(). `null`/ausente = indeterminado
     * (PostgREST fora, rede caída) — NÃO é o mesmo que "sem convite".
     */
    serverStatus?: InviteGateServerStatus | null;
    /** Código pendente lido de sessionStorage/localStorage (?invite=CODE) */
    storedCode?: string | null;
    /** Bypass E2E — SOMENTE quando o caller comprovou localhost/127.0.0.1 */
    localhostBypass?: boolean;
}

export interface InviteEnforcementDecision {
    action: InviteEnforcementAction;
    reason: InviteEnforcementReason;
    /** Código normalizado a reivindicar quando action === 'claim' */
    code: string | null;
}

function bool(value: unknown): boolean {
    return value === true || value === 'true';
}

/**
 * Normaliza o jsonb de api.invite_gate_status() de forma defensiva.
 * Retorna null quando a resposta não é aproveitável (indeterminado) — o que
 * é diferente de um status válido dizendo "não permitido".
 */
export function parseGateStatus(raw: unknown): InviteGateServerStatus | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    // Sem a chave 'allowed' não há veredito do servidor: trate como indeterminado
    // em vez de assumir false (assumir false expulsaria todo mundo num deploy
    // em que a RPC ainda não existe).
    if (!('allowed' in r)) return null;
    const claimed = bool(r.claimed);
    const grandfathered = bool(r.grandfathered);
    const privileged = bool(r.privileged);
    return {
        authenticated: bool(r.authenticated),
        claimed,
        grandfathered,
        privileged,
        // o servidor é a autoridade, mas se ele disser allowed sem nenhum
        // motivo, ainda respeitamos o veredito (reason vira 'server-allowed').
        allowed: bool(r.allowed) || claimed || grandfathered || privileged,
    };
}

/** Motivo mais específico por trás de um `allowed` do servidor. */
function allowReason(status: InviteGateServerStatus): InviteEnforcementReason {
    if (status.claimed) return 'already-claimed';
    if (status.privileged) return 'privileged-role';
    if (status.grandfathered) return 'grandfathered';
    return 'server-allowed';
}

/**
 * Decide o que fazer com uma sessão recém-autenticada em modo INVITE_ONLY.
 *
 * - 'allow' → sessão segue (servidor liberou, feature desligada, sem sessão,
 *   bypass E2E local, ou status indeterminado por falha de infra).
 * - 'claim' → há código pendente com formato válido: o caller DEVE chamar
 *   api.claim_invite e tratar o resultado com resolveClaimOutcome().
 * - 'deny'  → sem convite: o caller DEVE encerrar a sessão (signOut) e
 *   mostrar mensagem de acesso por convite.
 */
export function decideInviteEnforcement(input: InviteEnforcementInput): InviteEnforcementDecision {
    if (!input.inviteOnly) return { action: 'allow', reason: 'feature-off', code: null };
    if (!input.hasUser) return { action: 'allow', reason: 'no-user', code: null };
    if (input.localhostBypass === true) return { action: 'allow', reason: 'e2e-bypass', code: null };

    const status = input.serverStatus ?? null;
    if (!status) {
        // Fail-open DELIBERADO: derrubar sessão por falha de rede trancaria
        // todos os usuários fora do app numa queda do PostgREST. O próximo
        // login reavalia, e a camada de servidor (api.create_platform_invite
        // exigindo identity.user_invite_ok) continua barrando propagação.
        return { action: 'allow', reason: 'status-unavailable', code: null };
    }

    if (status.allowed) return { action: 'allow', reason: allowReason(status), code: null };

    const raw = input.storedCode == null ? '' : String(input.storedCode);
    if (!raw.trim()) return { action: 'deny', reason: 'no-invite', code: null };

    const check = validateInviteCodeFormat(raw);
    if (!check.valid) return { action: 'deny', reason: 'invalid-stored-code', code: null };

    return { action: 'claim', reason: 'claim-stored-code', code: check.code };
}

/**
 * Traduz o retorno da RPC api.claim_invite (boolean, verificada no servidor:
 * exige auth.uid() = p_user_id, expires_at >= now(), use_count < max_uses,
 * revoked_at nulo) na ação final. Claim que falha ⇒ nega.
 */
export function resolveClaimOutcome(claimOk: unknown): InviteEnforcementDecision {
    return claimOk === true
        ? { action: 'allow', reason: 'already-claimed', code: null }
        : { action: 'deny', reason: 'claim-failed', code: null };
}

/** true quando a decisão obriga o caller a encerrar a sessão. */
export function mustSignOut(decision: InviteEnforcementDecision | null | undefined): boolean {
    return decision?.action === 'deny';
}
