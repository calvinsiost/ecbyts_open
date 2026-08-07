// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CHAT AGENT CONSENT PURE — "quem pode convocar o agente de quem"
   SPEC_USER_CHAT_WITH_LLM_AGENTS (USER-CHAT-LLM-001) — Fase 1.
   RF-6 (consentimento) + RF-9 (auditoria) + §4.2/§4.3 (enforcement).

   Esta é a REGRA DE SEGURANÇA da spec, em pure-logic testável. Espelha
   EXATAMENTE a decisão que o RPC `post_agent_message` (SECURITY DEFINER)
   toma no banco — fonte da verdade é o servidor; este módulo existe para
   (a) provar a regra com cheap tests e (b) a UI antecipar o "permitido?"
   sem nunca CONFIAR no cliente.

   Regra (§4.3, não-forjável):
     Um agente só posta numa sala em DOIS casos, ambos server-side:
       1. AUTOREPLY: o DONO ligou `agentAutoreply=true` naquela sala; ou
       2. MENÇÃO PELO PRÓPRIO DONO: foi o próprio dono que mencionou o seu
          próprio agente (callerUserId === ownerUserId).
     Um TERCEIRO mencionar o agente alheio NÃO autoriza nada se o dono não
     ligou autoreply — gera só um evento de UI ("o agente de Fulano foi
     mencionado"), nunca uma postagem.

   IMPORTANTE: `mentions[]` vindo do cliente NÃO é confiável. A decisão
   usa apenas: identidade do chamador (auth.uid no banco / callerUserId
   aqui), participação ativa do dono na sala, e a flag agentAutoreply do
   dono. Nada que um terceiro consiga forjar.

   FORA DESTE ARQUIVO:
     - Rate-limit (NFR §3: 5 msgs/60s por agente) → decidido no RPC com
       estado temporal do banco; helper de classificação abaixo é só de
       apoio determinístico (a janela real vive no servidor).
     - Geração da resposta do agente (cérebro) → fora da spec (§2.3).

   Tests: tests/chat-agent-consent-pure.test.mjs
   ================================================================ */

import type { AgentTrigger } from './_chatModelPure.js';

// ----------------------------------------------------------------
// CONSTANTES (NFR §3)
// ----------------------------------------------------------------

/** Anti-spam de agente (NFR §3): teto de postagens por agente por sala. */
export const AGENT_RATE_LIMIT_MAX = 5;
/** Janela do teto de agente, em ms (60 s). */
export const AGENT_RATE_LIMIT_WINDOW_MS = 60_000;

// ----------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------

/**
 * Estado mínimo do DONO do agente naquela sala, do ponto de vista do
 * servidor (derivado de `chat_participants`). Nenhum campo aqui pode vir
 * do cliente que está chamando — todos são lidos pelo RPC no banco.
 */
export interface OwnerRoomState {
    /** UID do dono do agente. */
    readonly ownerUserId: string;
    /** O dono é participante ATIVO da sala? (left_at IS NULL) */
    readonly ownerIsActiveMember: boolean;
    /** RF-6.1: o dono ligou autoreply NESTA sala? (default false) */
    readonly agentAutoreply: boolean;
}

/**
 * Pedido de postagem de agente, do ponto de vista do enforcement.
 * `callerUserId` = identidade verificada do chamador (auth.uid no banco).
 * `trigger` = caminho pretendido ('autoreply' | 'mention').
 */
export interface AgentPostRequest {
    readonly callerUserId: string;
    readonly ownerUserId: string;
    readonly agentId: string;
    readonly trigger: AgentTrigger;
}

/** Códigos de motivo da decisão (estáveis — espelham §5.3 + auditoria). */
export type ConsentDecisionCode =
    | 'OK_AUTOREPLY'
    | 'OK_OWNER_MENTION'
    | 'ERR_AGENT_NOT_ALLOWED'
    | 'ERR_OWNER_NOT_MEMBER'
    | 'ERR_AGENT_NO_ID'
    | 'ERR_INVALID_TRIGGER';

/** Resultado da decisão de consentimento (RF-6). */
export interface ConsentDecision {
    readonly allowed: boolean;
    readonly code: ConsentDecisionCode;
    /** Trigger efetivo gravado p/ auditoria (RF-9) quando allowed. */
    readonly trigger: AgentTrigger | null;
}

// ----------------------------------------------------------------
// DECISÃO DE CONSENTIMENTO (RF-6) — núcleo não-forjável
// ----------------------------------------------------------------

/**
 * Decide se o agente PODE postar (RF-6). Não confia em `mentions[]`:
 * usa só identidade do chamador + estado do dono na sala.
 *
 *   Caminho AUTOREPLY (RF-6.1): dono ativo na sala com agentAutoreply=true.
 *     Qualquer chamador autorizado pode disparar (inclusive terceiro), pois
 *     o DONO deu consentimento explícito por sala.
 *   Caminho MENÇÃO (RF-6.2): exige callerUserId === ownerUserId (só o próprio
 *     dono convoca o próprio agente). Terceiro forjando menção → negado.
 *
 * Quando ambos os caminhos falham → ERR_AGENT_NOT_ALLOWED (vira evento de
 * UI, nunca postagem — §4.3).
 *
 * @param req   Pedido com identidade do chamador verificada server-side.
 * @param owner Estado do dono na sala, lido pelo servidor (não pelo cliente).
 */
export function decideAgentPost(
    req: AgentPostRequest,
    owner: OwnerRoomState,
): ConsentDecision {
    if (!req.agentId || req.agentId.length === 0) {
        return deny('ERR_AGENT_NO_ID');
    }
    if (req.ownerUserId !== owner.ownerUserId) {
        // Inconsistência de pedido — o dono alvo não bate com o estado lido.
        return deny('ERR_AGENT_NOT_ALLOWED');
    }
    if (!owner.ownerIsActiveMember) {
        // O dono precisa ser membro ativo p/ qualquer caminho valer.
        return deny('ERR_OWNER_NOT_MEMBER');
    }

    if (req.trigger === 'autoreply') {
        if (owner.agentAutoreply) {
            return { allowed: true, code: 'OK_AUTOREPLY', trigger: 'autoreply' };
        }
        return deny('ERR_AGENT_NOT_ALLOWED');
    }

    if (req.trigger === 'mention') {
        // RF-6.2: SÓ o próprio dono convoca o próprio agente por menção.
        if (req.callerUserId === owner.ownerUserId) {
            return { allowed: true, code: 'OK_OWNER_MENTION', trigger: 'mention' };
        }
        // Terceiro mencionou agente alheio sem autoreply → só evento de UI.
        return deny('ERR_AGENT_NOT_ALLOWED');
    }

    return deny('ERR_INVALID_TRIGGER');
}

function deny(code: ConsentDecisionCode): ConsentDecision {
    return { allowed: false, code, trigger: null };
}

/**
 * Conveniência booleana (cheap tests / UI antecipar "permitido?").
 * NUNCA é a fonte da verdade — o RPC server-side decide de fato.
 */
export function canAgentPost(req: AgentPostRequest, owner: OwnerRoomState): boolean {
    return decideAgentPost(req, owner).allowed;
}

// ----------------------------------------------------------------
// CLASSIFICAÇÃO DE MENÇÃO → EVENTO (RF-5 ↔ RF-6 fronteira)
// ----------------------------------------------------------------

export type MentionOutcome =
    /** A menção autoriza uma postagem do agente (próprio dono mencionou). */
    | 'invoke_agent'
    /** A menção NÃO autoriza postagem; vira só notificação de UI (§4.3). */
    | 'ui_event_only';

/**
 * Dado quem mencionou e de quem é o agente, classifica o desfecho da menção
 * (RF-5 → RF-6). Espelha §4.3: menção de terceiro nunca posta — só evento
 * de UI; menção do próprio dono é convocação real.
 *
 * NÃO considera autoreply aqui: autoreply é um caminho separado de
 * `decideAgentPost('autoreply')`, disparado pela orquestração, não por menção.
 */
export function classifyMention(
    mentionerUserId: string,
    agentOwnerUserId: string,
): MentionOutcome {
    return mentionerUserId === agentOwnerUserId ? 'invoke_agent' : 'ui_event_only';
}

// ----------------------------------------------------------------
// RATE-LIMIT DE AGENTE (NFR §3) — helper determinístico de apoio
// ----------------------------------------------------------------

/**
 * Classifica se uma nova postagem de agente excede o teto anti-loop
 * (NFR §3: máx. 5 msgs / 60 s por agente por sala). A janela REAL vive no
 * banco (RPC com `now()`); este helper é puro/determinístico para os cheap
 * tests e para a UI estimar antes de tentar.
 *
 * @param recentPostTimestamps Epochs (ms) das postagens recentes do agente
 *                             naquela sala (mais recente em qualquer ordem).
 * @param nowMs                Instante atual (ms).
 * @returns true se a nova postagem está DENTRO do teto (permitida).
 */
export function isAgentWithinRateLimit(
    recentPostTimestamps: ReadonlyArray<number>,
    nowMs: number,
): boolean {
    const windowStart = nowMs - AGENT_RATE_LIMIT_WINDOW_MS;
    let inWindow = 0;
    for (const ts of recentPostTimestamps) {
        if (typeof ts === 'number' && ts > windowStart && ts <= nowMs) {
            inWindow++;
        }
    }
    // A nova postagem ocuparia o slot (inWindow + 1) — deve caber no teto.
    return inWindow + 1 <= AGENT_RATE_LIMIT_MAX;
}
