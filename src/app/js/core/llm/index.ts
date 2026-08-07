// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   MÓDULO LLM - Ponto de Entrada
   ================================================================

   Este arquivo exporta todas as funções do módulo LLM e fornece
   a função principal de processamento de comandos.

   USO:
   import { processCommand, initLLM } from './llm/index.js';

   await initLLM(); // Configura API key
   const result = await processCommand('adicionar benzeno 10 mg/L no ponto 1');

   ================================================================ */
// Exporta do client
export { LLMProvider, setApiKey, getApiKey, hasApiKey, clearApiKey, setProvider, getProvider, setModel, getModel, detectProvider, sendMessage, testConnection, validateConfig, getConfig, } from './client.js';
// Exporta do router
export { EngineType, getEngine, setEngine, getEngineConfig, getEngineDisplayName, validateEngineConfig, buildEngineSetupGuidance, routeMessage, routeMessageStream, getBrowserModel, setBrowserModel, getLocalUrl, setLocalUrl, getLocalModel, setLocalModel, } from './router.js';
// Exporta do promptBuilder
export { buildSystemPrompt, buildLitePrompt, formatUserMessage, getContextSummary, getKnowledgeContext, } from './promptBuilder.js';
// Exporta do intentClassifier
export { INTENT_MIN_CONFIDENCE, classifyApiIntent, validateAndNormalizeIntent, getTierActionCatalog, } from './intentClassifier.js';
// Exporta do parser
export { VALID_ACTIONS, CUSTOM_ACTIONS, getValidActions, parseResponse, resolveElementReference, resolveCampaignReference, resolveParameterReference, resolveUnitReference, validateActionParams, } from './parser.js';
// Exporta do commandExecutor
export { executeCommand, getSupportedActions } from './commandExecutor.js';
// Exporta do agentLoop
export { processAgentCommand } from './agentLoop.js';
// Exporta do functions
export { isReadOnlyAction } from './functions.js';
// Exporta do speechEngine
export { requestMicrophoneAccess, startRecording, stopRecording, transcribeAudio, synthesizeSpeech, speakNative, playAudio, stopPlayback, getSpeechStatus, getSTTModels, getTTSModels, unloadSpeechModels, isSTTEnabled, setSTTEnabled, isTTSEnabled, setTTSEnabled, getSTTModel, setSTTModel, } from './speechEngine.js';
// proactiveInsights e idleAnalysisProcessor sao importados dinamicamente
// onde necessarios (llmChat.js, main.js) para evitar cascading import failures.
// Nao re-exportar aqui para nao bloquear o carregamento do modulo principal.
// ================================================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO
// ================================================================
import { routeMessage, validateEngineConfig, getEngine, EngineType } from './router.js';
import { buildSystemPrompt, formatUserMessage } from './promptBuilder.js';
import { ensureSAO } from '../sao/index.js';
import { parseResponse } from './parser.js';
import { executeCommand } from './commandExecutor.js';
import { processAgentCommand } from './agentLoop.js';
import { isToolActive } from './chatTools.js';
import { getLlmActionMap, getHeadlessMeta } from '../../utils/api/registry.js';
import { CUSTOM_ACTIONS } from './parser.js';
import { classifyApiIntent, validateAndNormalizeIntent } from './intentClassifier.js';
import { showToast } from '../../utils/ui/toast.js';
import { t } from '../../utils/i18n/translations.js';
/**
 * Estado do chat
 */
/** @type {Array<any>} */
let chatHistory: any[] = [];
/** @type {any} */
let pendingConfirmation: any = null;
/**
 * Processa um comando em linguagem natural.
 * Se a engine e cloud e a tool 'workflows' esta ativa,
 * tenta o agent loop multi-turn antes do single-turn.
 *
 * @param {string} userInput - Texto do usuário
 * @param {Object} agentOptions - Opcoes do agent loop (onProgress, maxTurns)
 * @returns {Promise<Object>} - Resultado do processamento
 */
export async function processCommand(userInput: string, agentOptions: any = {}) {
    // Verifica configuração da engine ativa
    const engineValidation = validateEngineConfig();
    if (!engineValidation.valid) {
        return {
            success: false,
            needsConfig: true,
            message: engineValidation.message || t('llmNoApiKey') || 'Configure the AI engine first',
        };
    }
    // LOADING-PERF GAP-2: SAO é lazy. Garante init antes do build de prompt (sync)
    // para que getParametersContext injete os parâmetros SAO-filtrados. Idempotente.
    await ensureSAO().catch((e) => console.debug('[llm] ensureSAO best-effort:', e?.message || e));
    try {
        // --- Agentic mode: tenta multi-turn se engine cloud + tool workflows ativa ---
        if (getEngine() === EngineType.CLOUD && isToolActive('workflows')) {
            const agentResult = await processAgentCommand(userInput, 
            /** @type {{ maxTurns?: number, onProgress?: Function }} */ (agentOptions));
            if (agentResult) {
                // Adiciona ao historico
                chatHistory.push({
                    role: 'user',
                    content: userInput,
                    timestamp: new Date().toISOString(),
                });
                if (agentResult.type === 'message') {
                    chatHistory.push({
                        role: 'assistant',
                        content: agentResult.content,
                        timestamp: new Date().toISOString(),
                    });
                    return {
                        success: true,
                        understood: false,
                        message: agentResult.content,
                        agentTurns: agentResult.turns,
                    };
                }
                if (agentResult.type === 'action') {
                    pendingConfirmation = {
                        action: agentResult.action,
                        params: agentResult.params,
                        confirmation: agentResult.confirmation,
                    };
                    chatHistory.push({
                        role: 'assistant',
                        content: agentResult.confirmation,
                        timestamp: new Date().toISOString(),
                        pendingAction: true,
                    });
                    return {
                        success: true,
                        understood: true,
                        needsConfirmation: true,
                        action: agentResult.action,
                        params: agentResult.params,
                        confirmation: agentResult.confirmation,
                        agentTurns: agentResult.turns,
                    };
                }
                if (agentResult.type === 'error') {
                    // Fallback para single-turn
                    console.warn('Agent loop failed, falling back to single-turn:', agentResult.message);
                }
            }
        }
        // --- Single-turn mode (default) ---
        // Constrói prompts
        const systemPrompt = buildSystemPrompt();
        const userMessage = formatUserMessage(userInput);
        // Adiciona ao histórico
        chatHistory.push({
            role: 'user',
            content: userInput,
            timestamp: new Date().toISOString(),
        });
        // Chama o LLM via router (cloud, browser ou local)
        const response = await routeMessage(systemPrompt, userMessage);
        // Mantem parse legado para observabilidade e fallback de mensagem.
        const parsed = parseResponse(response.content);
        // Novo fluxo: classificador canonico -> validador deterministico (Tier 1/2).
        const intent = classifyApiIntent(userInput, { llmContent: response.content, maxTier: 2 });
        const normalized = validateAndNormalizeIntent(intent, { maxTier: 2 });
        if (normalized.type === 'needs_confirmation') {
            const fallbackMessage = normalized.message ||
                parsed.data?.confirmation ||
                parsed.error ||
                'Nao consegui interpretar o comando. Pode reformular de forma objetiva?';
            chatHistory.push({
                role: 'assistant',
                content: fallbackMessage,
                timestamp: new Date().toISOString(),
            });
            return {
                success: true,
                understood: false,
                message: fallbackMessage,
                ambiguities: normalized.ambiguities || [],
                confidence: normalized.confidence,
                intent,
            };
        }
        const data = {
            action: normalized.action,
            params: normalized.params,
            confirmation: normalized.message,
            confidence: normalized.confidence,
        };
        // Auto-execute apenas para registry actions nao-destrutivas.
        const isCustom = CUSTOM_ACTIONS.has(data.action);
        const registryEntry = !isCustom ? getLlmActionMap().get(data.action) : null;
        const isDestructive = registryEntry ? getHeadlessMeta(registryEntry.name)?.destructive : false;
        const shouldAutoExecute = normalized.type === 'executable' && registryEntry && !isDestructive;
        if (shouldAutoExecute) {
            const result = await executeCommand(data.action, data.params);
            chatHistory.push({
                role: 'assistant',
                content: result.message || data.confirmation,
                timestamp: new Date().toISOString(),
            });
            return {
                success: result.success,
                understood: true,
                needsConfirmation: false,
                autoExecuted: true,
                action: data.action,
                params: data.params,
                message: result.message || data.confirmation,
                data: result.data,
                confidence: data.confidence,
                intent,
            };
        }
        // Confirm path: custom, destrutiva ou confirmavel por politica.
        pendingConfirmation = {
            action: data.action,
            params: data.params,
            confirmation: data.confirmation,
        };
        chatHistory.push({
            role: 'assistant',
            content: data.confirmation,
            timestamp: new Date().toISOString(),
            pendingAction: true,
        });
        return {
            success: true,
            understood: true,
            needsConfirmation: true,
            action: data.action,
            params: data.params,
            confirmation: data.confirmation,
            confidence: data.confidence,
            intent,
        };
    }
    catch (error: any) {
        console.error('Erro ao processar comando:', error);
        return {
            success: false,
            message: /** @type {any} */ (error)?.message || 'Erro ao processar comando',
        };
    }
}
/**
 * Confirma e executa a ação pendente
 * @returns {Promise<Object>}
 */
export async function confirmAction() {
    if (!pendingConfirmation) {
        return {
            success: false,
            message: 'Nenhuma ação pendente',
        };
    }
    const { action, params } = pendingConfirmation;
    try {
        const result = await executeCommand(action, { ...params, _confirmed: true });
        // Limpa ação pendente
        pendingConfirmation = null;
        if (result.success) {
            chatHistory.push({
                role: 'system',
                content: result.message,
                timestamp: new Date().toISOString(),
            });
            showToast(result.message, 'success');
        }
        return result;
    }
    catch (error: any) {
        pendingConfirmation = null;
        return {
            success: false,
            message: /** @type {any} */ (error)?.message,
        };
    }
}
/**
 * Cancela a ação pendente
 */
export function cancelAction() {
    if (pendingConfirmation) {
        chatHistory.push({
            role: 'system',
            content: 'Ação cancelada',
            timestamp: new Date().toISOString(),
        });
        pendingConfirmation = null;
    }
}
/**
 * Retorna o histórico do chat
 * @returns {Array<any>}
 */
export function getChatHistory() {
    return [...chatHistory];
}
/**
 * Limpa o histórico do chat
 */
export function clearChatHistory() {
    chatHistory = [];
    pendingConfirmation = null;
}
/**
 * Verifica se há ação pendente
 * @returns {boolean}
 */
export function hasPendingAction() {
    return pendingConfirmation !== null;
}
/**
 * Retorna a ação pendente
 * @returns {any}
 */
export function getPendingAction() {
    return pendingConfirmation ? { ...pendingConfirmation } : null;
}
/**
 * Set a pending action from external source (streaming handler).
 * Permite que o handler de streaming armazene acao pendente
 * para posterior confirmacao via confirmAction().
 *
 * @param {Object} actionData - { action, params, confirmation }
 */
export function setPendingAction(actionData: any) {
    pendingConfirmation = actionData ? { ...actionData } : null;
}
//# sourceMappingURL=index.js.map
