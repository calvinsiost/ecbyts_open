// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CHAT MODEL PURE — Núcleo de tipos + lógica de chat usuário↔agente
   SPEC_USER_CHAT_WITH_LLM_AGENTS (USER-CHAT-LLM-001) — Fase 1.

   Camada de DECISÃO pura, testável sem browser (Pixels-Over-DOM:
   este módulo só decide o que renderizar; o wire DOM da Fase 2 aplica).

   Cobre os RF da spec que são intra-mensagem / projeção:
     - RF-3  tipo de autor explícito (human|agent) + dono/agente do agente
     - RF-4  rótulo inquebrável "Agente de [Nome]" (visual E acessível)
     - RF-5  parse de @menção (separa dono-de-agente de humano)
     - NFR   limite de 4.000 chars no corpo (validateMessageBody)
     - LGPD  buildMessageVM minimiza projeção (nunca expõe email/uid)

   FORA DESTE ARQUIVO (Fase 2+ / outras camadas):
     - Realtime (Postgres Changes / Broadcast / Presence) → utils/realtime/
     - UI/wire DOM → utils/ui/chatPanel.ts
     - Enforcement cross-table de consentimento → _chatAgentConsentPure.ts
       + RPC SECURITY DEFINER no banco (o "quem pode convocar quem")
     - Cérebro do agente (geração de resposta) → fora da spec (§2.3)

   Tests: tests/chat-model-pure.test.mjs
   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

/** Teto de caracteres do corpo da mensagem (NFR §3 — CHECK no banco também). */
export const CHAT_BODY_MAX_LENGTH = 4000;

/**
 * Prefixo que marca, dentro de uma @menção, que se refere ao AGENTE de
 * alguém (não à pessoa). Ex.: "@agente-de-joao" convoca o agente do João.
 * Aceito com hífen ou underscore após "agente". Case-insensitive.
 */
export const AGENT_MENTION_PREFIX = 'agente-de-';

// ----------------------------------------------------------------
// TIPOS DE DOMÍNIO
// ----------------------------------------------------------------

/** Natureza do autor de uma mensagem. Inquebrável: nunca há terceiro estado. */
export type AuthorType = 'human' | 'agent';

/** Motivo pelo qual o agente postou (RF-9 auditoria). */
export type AgentTrigger = 'mention' | 'autoreply';

/** Papel do participante na sala. */
export type ParticipantRole = 'member' | 'owner';

/**
 * Participante de uma sala. `displayName` é o ÚNICO identificador humano
 * que pode chegar à UI (minimização LGPD — email/uid jamais projetados).
 */
export interface Participant {
    readonly userId: string;
    readonly displayName: string;
    readonly role: ParticipantRole;
    /** RF-6: consentimento por sala para o agente do próprio dono responder. */
    readonly agentAutoreply: boolean;
    /** RF-8: preenchido quando o usuário saiu da sala (null = ativo). */
    readonly leftAt: string | null;
}

/** Sala de chat. `kind` espelha o CHECK do schema (dm|group|context). */
export interface ChatThread {
    readonly id: string;
    readonly kind: 'dm' | 'group' | 'context';
    readonly title: string | null;
    readonly createdBy: string;
    /** RF-10 (V2): referência opcional a modelo/elemento/ECBT. */
    readonly contextRef: Record<string, unknown> | null;
}

/**
 * Mensagem de chat (modelo de domínio). Espelha colunas do schema
 * `chat_messages`, mas pode carregar campos internos (email/uid) que
 * `buildMessageVM` é OBRIGADO a NÃO projetar (LGPD).
 *
 * Invariante de identidade (RF-3): se `authorType==='agent'` então
 * `onBehalfOfUserId`, `agentId` e `trigger` são todos não-nulos. A função
 * `validateMessage` prova isso; o banco prova via CHECK `chk_agent_has_owner`.
 */
export interface ChatMessage {
    readonly id: string;
    readonly threadId: string;
    readonly authorType: AuthorType;
    /** Humano que escreveu OU dono do agente (sempre presente). */
    readonly authorUserId: string;
    /** Nome de exibição do autor humano (ou do dono, p/ rótulo de agente). */
    readonly authorDisplayName: string;
    /** RF-3/RF-9: dono em nome de quem o agente postou (NOT NULL sse agente). */
    readonly onBehalfOfUserId: string | null;
    /** RF-3/RF-9: identificador do agente (NOT NULL sse agente). */
    readonly agentId: string | null;
    /** RF-9: por que o agente postou (NOT NULL sse agente). */
    readonly trigger: AgentTrigger | null;
    readonly text: string;
    /** Epoch ms ou ISO; mantido opaco pela camada pura. */
    readonly ts: string | number;
    /** RF-5: donos/usuários mencionados (parse via parseMentions). */
    readonly mentions: ReadonlyArray<string>;
    /** RF-8: soft-delete — quando preenchido, texto vira marcador. */
    readonly deletedAt?: string | null;
}

/** Resultado do parse de @menções (RF-5). */
export interface ParsedMentions {
    /** Donos cujo AGENTE foi mencionado (ex.: "@agente-de-joao" → "joao"). */
    readonly agentOwners: ReadonlyArray<string>;
    /** Pessoas humanas mencionadas (ex.: "@maria" → "maria"). */
    readonly users: ReadonlyArray<string>;
}

/** Resultado de validação de uma mensagem antes de enviar/gravar. */
export interface MessageValidation {
    readonly ok: boolean;
    readonly errors: ReadonlyArray<string>;
}

/**
 * View-model de render de uma mensagem (RF-4 + A11y §9 + LGPD).
 * É o ÚNICO formato que a UI consome — não há caminho para a UI ler
 * a `ChatMessage` crua, portanto email/uid nunca vazam.
 */
export interface ChatMessageVM {
    readonly id: string;
    readonly authorType: AuthorType;
    /** Texto visível de autoria: "Você" | nome | "Agente de <nome>". */
    readonly authorLabel: string;
    /**
     * Rótulo acessível lido pelo leitor de tela ANTES do corpo (§9.2).
     * Para agente é SEMPRE distinto do humano — base do teste de mutação.
     */
    readonly ariaLabel: string;
    /** Verdadeiro só para agente — dirige cor/borda/ícone distintos. */
    readonly isAgent: boolean;
    /** Verdadeiro quando a mensagem é do próprio viewer (alinhar à direita). */
    readonly isOwn: boolean;
    /** Corpo já resolvido (marcador se soft-deletado). */
    readonly body: string;
    readonly ts: string | number;
    /** i18n: chave + params para o rótulo (UI resolve idioma). */
    readonly labelI18nKey: string;
    readonly labelI18nParams: Readonly<Record<string, string>>;
}

// ----------------------------------------------------------------
// CHAVES i18n (espelham §7 da spec — UI resolve idioma)
// ----------------------------------------------------------------

export const I18N_KEY_AGENT_LABEL = 'userChatLlm.agentLabel';
export const I18N_KEY_YOU = 'userChatLlm.you';
export const I18N_KEY_DELETED = 'userChatLlm.deletedPlaceholder';

// ----------------------------------------------------------------
// IDENTIFICAÇÃO HUMANO vs AGENTE (RF-3)
// ----------------------------------------------------------------

/** True se a mensagem foi postada por um agente de IA (RF-3). */
export function isAgentMessage(msg: Pick<ChatMessage, 'authorType'>): boolean {
    return msg.authorType === 'agent';
}

/** True se a mensagem foi escrita por uma pessoa humana (RF-3). */
export function isHumanMessage(msg: Pick<ChatMessage, 'authorType'>): boolean {
    return msg.authorType === 'human';
}

// ----------------------------------------------------------------
// PARSE DE @MENÇÃO (RF-5)
// ----------------------------------------------------------------

/**
 * Faz o parse de @menções no corpo, separando "donos cujo agente foi
 * mencionado" de "pessoas humanas mencionadas" (RF-5).
 *
 * Regras:
 *   - "@agente-de-<handle>" → o agente daquele dono (agentOwners += handle).
 *   - "@<handle>"           → pessoa humana (users += handle).
 *   - A menção de agente também conta o dono em `users` (foi citado como
 *     pessoa também) — alinha o exemplo UT-004 da spec.
 *   - Handles são normalizados para minúsculas; duplicatas removidas.
 *
 * Esta função NÃO autoriza nada (RF-5 ≠ RF-6). A autorização de postagem
 * de agente é decidida server-side (_chatAgentConsentPure + RPC).
 */
export function parseMentions(body: unknown): ParsedMentions {
    if (typeof body !== 'string' || body.length === 0) {
        return { agentOwners: [], users: [] };
    }
    const agentOwners: string[] = [];
    const users: string[] = [];
    // @handle onde handle = [a-z0-9_-] (cobre "agente-de-joao" e "joao").
    const re = /@([a-z0-9_-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        const raw = m[1]!.toLowerCase();
        if (raw.startsWith(AGENT_MENTION_PREFIX)) {
            const owner = raw.slice(AGENT_MENTION_PREFIX.length);
            if (owner.length > 0) {
                pushUnique(agentOwners, owner);
                // O dono também foi citado como pessoa (UT-004).
                pushUnique(users, owner);
            }
        } else {
            pushUnique(users, raw);
        }
    }
    return { agentOwners, users };
}

function pushUnique(arr: string[], value: string): void {
    if (!arr.includes(value)) arr.push(value);
}

// ----------------------------------------------------------------
// VALIDAÇÃO DE MENSAGEM (NFR + RF-3 invariante de identidade)
// ----------------------------------------------------------------

/**
 * Valida o corpo de uma mensagem antes de enviar (NFR §3 — UI bloqueia
 * antes do envio; o banco repete o CHECK char_length<=4000).
 * Códigos de erro espelham §5.3 da spec.
 */
export function validateMessageBody(body: unknown): MessageValidation {
    const errors: string[] = [];
    if (typeof body !== 'string') {
        errors.push('ERR_MSG_INVALID');
        return { ok: false, errors };
    }
    const trimmed = body.trim();
    if (trimmed.length === 0) {
        errors.push('ERR_MSG_EMPTY');
    }
    // Conta caracteres (code units) — alinha char_length do Postgres p/ ASCII;
    // limite é conservador o suficiente p/ não destoar de grafemas comuns.
    if (body.length > CHAT_BODY_MAX_LENGTH) {
        errors.push('ERR_MSG_TOO_LONG');
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Valida a INTEGRIDADE de identidade da mensagem (RF-3, invariante intra-linha).
 * Espelha em pure-logic a CHECK `chk_agent_has_owner` do schema: um agente
 * NUNCA é anônimo. Mensagem humana não pode carregar campos de agente.
 */
export function validateMessage(msg: ChatMessage): MessageValidation {
    const errors: string[] = [];
    const bodyCheck = validateMessageBody(msg.text);
    for (const e of bodyCheck.errors) errors.push(e);

    if (msg.authorType === 'agent') {
        if (!msg.onBehalfOfUserId) errors.push('ERR_AGENT_NO_OWNER');
        if (!msg.agentId) errors.push('ERR_AGENT_NO_ID');
        if (!msg.trigger) errors.push('ERR_AGENT_NO_TRIGGER');
    } else {
        // Humano não pode forjar campos de agente (defesa em profundidade).
        if (msg.onBehalfOfUserId || msg.agentId || msg.trigger) {
            errors.push('ERR_HUMAN_HAS_AGENT_FIELDS');
        }
    }
    return { ok: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// RÓTULO DE AUTOR (RF-4) — inquebrável humano vs agente
// ----------------------------------------------------------------

/**
 * Resolve o nome de exibição do dono de uma mensagem de agente. Aceita um
 * resolvedor opcional (mapa userId→nome) para o caso de o dono não ser o
 * próprio autor. Default usa `authorDisplayName` (autor = dono do agente).
 */
function resolveOwnerName(
    msg: ChatMessage,
    resolveName?: (userId: string) => string | undefined,
): string {
    const ownerId = msg.onBehalfOfUserId ?? msg.authorUserId;
    const resolved = resolveName?.(ownerId);
    return (resolved && resolved.trim()) || msg.authorDisplayName || ownerId;
}

/**
 * Retorna o rótulo de autor para exibição (RF-4), SEM vazar email/uid (LGPD):
 *   - mensagem própria do viewer (humana) → "Você"
 *   - mensagem humana de terceiro          → "<nome de exibição>"
 *   - mensagem de agente                    → "Agente de <nome do dono>"
 *
 * O caminho de agente é INQUEBRÁVEL: sempre prefixa "Agente de"; nunca
 * renderiza um agente como se fosse pessoa (anti-requisito §2.3).
 *
 * @param msg          Mensagem de domínio.
 * @param viewerUserId UID do usuário que está vendo (para detectar "Você").
 * @param t?            Resolvedor i18n opcional (key, params) → string.
 *                     Sem `t`, devolve PT-BR canônico (fallback).
 * @param params?  Resolvedor opcional userId→nome do dono.
 */
export function authorLabel(
    msg: ChatMessage,
    viewerUserId: string,
    t?: (key: string, params?: Record<string, string>) => string,
    resolveName?: (userId: string) => string | undefined,
): string {
    if (msg.authorType === 'agent') {
        const name = resolveOwnerName(msg, resolveName);
        return t
            ? t(I18N_KEY_AGENT_LABEL, { name })
            : `Agente de ${name}`;
    }
    if (msg.authorUserId === viewerUserId) {
        return t ? t(I18N_KEY_YOU) : 'Você';
    }
    return msg.authorDisplayName || msg.authorUserId;
}

// ----------------------------------------------------------------
// VIEW-MODEL DE RENDER (RF-4 + A11y §9 + LGPD §3)
// ----------------------------------------------------------------

/**
 * Monta a view-model de uma mensagem aplicando minimização LGPD: o objeto
 * resultante NUNCA carrega email/uid internos — só o estritamente exibível
 * (rótulo, corpo, flags de render). É o único formato que a UI consome.
 *
 * A11y (§9.2): `ariaLabel` para agente é distinto e contém "Agente de
 * <nome>" — base do teste de mutação UT-006 (remover o rótulo de agente
 * DEVE quebrar um teste).
 */
export function buildMessageVM(
    msg: ChatMessage,
    viewerUserId: string,
    t?: (key: string, params?: Record<string, string>) => string,
    resolveName?: (userId: string) => string | undefined,
): ChatMessageVM {
    const isAgent = isAgentMessage(msg);
    const isOwn = !isAgent && msg.authorUserId === viewerUserId;
    const label = authorLabel(msg, viewerUserId, t, resolveName);

    const deleted = !!msg.deletedAt;
    const body = deleted
        ? (t ? t(I18N_KEY_DELETED) : '[mensagem apagada]')
        : msg.text;

    const ownerName = isAgent ? resolveOwnerName(msg, resolveName) : '';
    // Aria do agente é SEMPRE distinto (não depende de cor) — §9.2.
    const ariaLabel = isAgent
        ? `Agente de ${ownerName}, mensagem`
        : `${label}, mensagem`;

    const labelI18nParams: Record<string, string> = isAgent ? { name: ownerName } : {};

    return Object.freeze({
        id: msg.id,
        authorType: msg.authorType,
        authorLabel: label,
        ariaLabel,
        isAgent,
        isOwn,
        body,
        ts: msg.ts,
        labelI18nKey: isAgent ? I18N_KEY_AGENT_LABEL : (isOwn ? I18N_KEY_YOU : ''),
        labelI18nParams: Object.freeze(labelI18nParams),
    });
}
