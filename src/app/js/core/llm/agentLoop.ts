// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   AGENT LOOP — Execucao multi-turn para LLM agentic
   Permite que o LLM consulte estado do modelo (read-only)
   antes de responder, encadeando ate 5 turns.

   APENAS para engines cloud. Browser/local usam single-turn.

   Pipeline:
   User → buildAgenticPrompt() → routeMessage() → parseResponse()
     → Se read-only (QUERY_*): executa, adiciona resultado, loop
     → Se mutante: retorna para confirmacao do usuario
     → Se conversacional: retorna texto
   ================================================================ */
import { routeMessage, validateEngineConfig, getEngine, EngineType } from './router.js';
import { buildAgenticPrompt, formatUserMessage, getKnowledgeContext } from './promptBuilder.js';
import { parseResponse } from './parser.js';
import { classifyApiIntent, validateAndNormalizeIntent } from './intentClassifier.js';
import { executeCommand } from './commandExecutor.js';
import { isReadOnlyAction } from './functions.js';
import { ANALYTICS_EVENTS, emitAnalyticsEvent } from '../events/analyticsEventBus.js';

interface ConversationMessage {
    role: string;
    content?: string;
    name?: string;
}

function _formatContextMessage(context: ConversationMessage[]): string {
    return context
        .map((m) => {
            if (m.role === 'function') {
                return `[RESULT of ${m.name}]: ${m.content}`;
            }
            return m.content || '';
        })
        .join('\n\n');
}

function _buildMessageResult(normalized: any, parsed: any, turn: number): any {
    return {
        type: 'message',
        content: normalized.message || parsed.data?.confirmation || parsed.error || 'Resposta nao interpretada',
        turns: turn + 1,
    };
}

function _buildActionResult(action: string, params: any, confirmation: string, turn: number, context: ConversationMessage[]): any {
    return {
        type: 'action',
        action,
        params,
        confirmation,
        turns: turn + 1,
        context,
    };
}

function _buildErrorResult(error: any, turn: number): any {
    console.error(`Agent loop turn ${turn + 1} error:`, error);
    return {
        type: 'error',
        message: error?.message || 'Erro no agent loop',
        turns: turn + 1,
    };
}

function _pushAssistantContext(context: ConversationMessage[], action: string, params: any, confirmation: string): void {
    context.push({
        role: 'assistant',
        content: JSON.stringify({
            understood: true,
            action,
            params,
            confirmation,
        }),
    });
}

function _pushFunctionContext(context: ConversationMessage[], action: string, result: any): void {
    context.push({
        role: 'function',
        name: action,
        content: result.success ? JSON.stringify(result.data) : `Error: ${result.message}`,
    });
}

async function _runReadOnlyAction(
    action: string,
    params: any,
    confirmation: string,
    turn: number,
    conversationContext: ConversationMessage[],
    options: any,
): Promise<void> {
    const result = await executeCommand(action, params);
    void emitAnalyticsEvent(ANALYTICS_EVENTS.AGENT_QUERY, {
        turn: turn + 1,
        action,
        success: result.success,
    });
    _pushAssistantContext(conversationContext, action, params, confirmation);
    _pushFunctionContext(conversationContext, action, result);
    if (options.onProgress) {
        options.onProgress({
            turn: turn + 1,
            action,
            result: result.data,
        });
    }
}

async function _executeTurn(
    userInput: string,
    systemPrompt: string,
    conversationContext: ConversationMessage[],
    options: any,
    turn: number,
): Promise<{ type: 'continue' } | { type: 'return'; value: any }> {
    void emitAnalyticsEvent(ANALYTICS_EVENTS.AGENT_THINKING, { turn: turn + 1, maxTurns: options.maxTurns || 5 });

    const fullMessage = _formatContextMessage(conversationContext);
    const response = await routeMessage(systemPrompt, fullMessage);
    const parsed = parseResponse(response.content);
    const intent = classifyApiIntent(userInput, { llmContent: response.content, maxTier: 2 });
    const normalized = validateAndNormalizeIntent(intent, { maxTier: 2 });

    if (normalized.type === 'needs_confirmation') {
        return { type: 'return', value: _buildMessageResult(normalized, parsed, turn) };
    }

    const action = normalized.action;
    const params = normalized.params;
    const confirmation = normalized.message;

    if (!action || !isReadOnlyAction(action)) {
        return { type: 'return', value: _buildActionResult(action, params, confirmation, turn, conversationContext) };
    }

    await _runReadOnlyAction(action, params, confirmation, turn, conversationContext, options);
    return { type: 'continue' };
}

/**
 * Processa um comando com capacidade agentic multi-turn.
 * O LLM pode chamar QUERY_STATE/QUERY_ELEMENT/QUERY_COMPLIANCE
 * automaticamente (sem confirmacao) para obter dados, e depois
 * responder com uma acao ou mensagem.
 *
 * @param {string} userInput - Texto do usuario
 * @param {Object} options
 * @param {number} [options.maxTurns] - Maximo de turns (default 5)
 * @param {Function} [options.onProgress] - Callback ({ turn, action, result })
 * @returns {Promise<any>}
 */
export async function processAgentCommand(userInput: string, options: any = {}) {
    const maxTurns = options.maxTurns || 5;
    // Verifica se engine e cloud (unica que suporta agentic)
    const engine = getEngine();
    if (engine !== EngineType.CLOUD) {
        // Fallback: retorna null para indicar que o caller deve usar single-turn
        return null;
    }
    const engineValidation = validateEngineConfig();
    if (!engineValidation.valid) {
        return {
            type: 'error',
            message: engineValidation.message || 'Configure the AI engine first',
        };
    }
    // Contexto da conversa multi-turn
    const conversationContext: ConversationMessage[] = [
        {
            role: 'user',
            content: formatUserMessage(userInput),
        },
    ];
    // Prefetch knowledge assets (async, popula cache para buildSystemPrompt sync)
    await getKnowledgeContext().catch((/** @type {any} */ _e: any) => console.debug('[core/llm/agentLoop:silent-catch]', _e?.message || _e));
    const systemPrompt = buildAgenticPrompt();
    for (let turn = 0; turn < maxTurns; turn++) {
        try {
            const turnResult = await _executeTurn(userInput, systemPrompt, conversationContext, options, turn);
            if (turnResult.type === 'continue') {
                continue;
            }
            return turnResult.value;
        }
        catch (error: any) {
            return _buildErrorResult(error, turn);
        }
    }
    return {
        type: 'error',
        message: 'Agent exceeded maximum turns without resolution',
        turns: maxTurns,
    };
}
//# sourceMappingURL=agentLoop.js.map
