// @ts-check
// Generated from src/app/js/core/llm/router.ts by TS-MIGRATION-001. Do not edit manually.
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
   ROUTER — AI Engine Router
   ================================================================

   Roteador central que abstrai tres backends de execucao de IA:
   - cloud:   APIs pagas existentes (OpenAI, Claude, Gemini, etc.)
   - browser: Inferencia local via WebGPU/WASM (Transformers.js v3)
   - local:   Servidor local OpenAI-compativel (Ollama, LM Studio)

   Retorna { content, provider, model, usage } em todos os casos,
   mantendo compatibilidade total com o pipeline existente
   (parser.js, commandExecutor.js, index.js).

   ================================================================ */
import { sendMessage, hasApiKey } from './client.js';
import { generateBrowser, generateBrowserStream, getBrowserModelStatus } from './browserEngine.js';
import { generateLocal, generateLocalStream } from './localEngine.js';
import { generateWebLlm, generateWebLlmStream } from './webllmEngine.js';
import { buildLitePrompt } from './promptBuilder.js';
import { buildEngineSetupGuidance as buildSetupGuidance } from './_engineSetupGuidancePure.js';
// ----------------------------------------------------------------
// ENGINE TYPES & STORAGE
// ----------------------------------------------------------------
/** @enum {string} */
export const EngineType = {
    CLOUD: 'cloud',
    BROWSER: 'browser',
    LOCAL: 'local',
    WEB_LLM: 'web-llm',
};
const STORAGE_KEYS = {
    ENGINE: 'ecbyts_llm_engine',
    LOCAL_URL: 'ecbyts_llm_local_url',
    LOCAL_MODEL: 'ecbyts_llm_local_model',
    BROWSER_MODEL: 'ecbyts_llm_browser_model',
    WEBLLM_MODEL: 'ecbyts_llm_webllm_model',
};
const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1/chat/completions';
const DEFAULT_LOCAL_MODEL = 'gemma4:e2b';
const DEFAULT_BROWSER_MODEL = 'onnx-community/Qwen2.5-1.5B-Instruct';
const DEFAULT_WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
// ----------------------------------------------------------------
// ENGINE STATE - getters / setters
// Estado da engine armazenado em sessionStorage
// ----------------------------------------------------------------
/**
 * Get active engine type.
 * Retorna a engine ativa (default: cloud para compatibilidade).
 * @returns {string}
 */
export function getEngine() {
    return sessionStorage.getItem(STORAGE_KEYS.ENGINE) || EngineType.CLOUD;
}
/**
 * Set active engine type.
 * Define qual engine sera usada para proximas mensagens.
 * @param {string} type - 'cloud' | 'browser' | 'local'
 */
export function setEngine(type: string) {
    if (!Object.values(EngineType).includes(type)) {
        throw new Error(`Invalid engine type: ${type}`);
    }
    sessionStorage.setItem(STORAGE_KEYS.ENGINE, type);
}
/** @returns {string} */
export function getLocalUrl() {
    return sessionStorage.getItem(STORAGE_KEYS.LOCAL_URL) || DEFAULT_LOCAL_URL;
}
/** @param {string} url */
export function setLocalUrl(url: string) {
    sessionStorage.setItem(STORAGE_KEYS.LOCAL_URL, url);
}
/** @returns {string} */
export function getLocalModel() {
    return sessionStorage.getItem(STORAGE_KEYS.LOCAL_MODEL) || DEFAULT_LOCAL_MODEL;
}
/** @param {string} model */
export function setLocalModel(model: string) {
    sessionStorage.setItem(STORAGE_KEYS.LOCAL_MODEL, model);
}
/** @returns {string} */
export function getBrowserModel() {
    return sessionStorage.getItem(STORAGE_KEYS.BROWSER_MODEL) || DEFAULT_BROWSER_MODEL;
}
/** @param {string} modelId */
export function setBrowserModel(modelId: string) {
    sessionStorage.setItem(STORAGE_KEYS.BROWSER_MODEL, modelId);
}
/** @returns {string} */
export function getWebLlmModel() {
    return sessionStorage.getItem(STORAGE_KEYS.WEBLLM_MODEL) || DEFAULT_WEBLLM_MODEL;
}
/** @param {string} modelId */
export function setWebLlmModel(modelId: string) {
    sessionStorage.setItem(STORAGE_KEYS.WEBLLM_MODEL, modelId);
}
// ----------------------------------------------------------------
// ENGINE DISPLAY INFO
// Informacoes para exibicao na UI
// ----------------------------------------------------------------
/**
 * Get human-readable engine display name.
 * Retorna nome amigavel para exibir no badge de engine.
 * @returns {string}
 */
export function getEngineDisplayName() {
    const engine = getEngine();
    switch (engine) {
        case EngineType.BROWSER: {
            const status = /** @type {{ device?: string }} */ (getBrowserModelStatus());
            return status.device === 'webgpu' ? 'WebGPU' : 'CPU (WASM)';
        }
        case EngineType.WEB_LLM:
            return 'WebGPU (MLC)';
        case EngineType.LOCAL:
            return 'Local';
        case EngineType.CLOUD:
        default:
            return 'Cloud';
    }
}
/**
 * Get engine configuration summary.
 * Retorna detalhes da engine para exibicao e diagnostico.
 * @returns {{ engine: string, displayName: string, detail: string, configured: boolean }}
 */
export function getEngineConfig() {
    const engine = getEngine();
    switch (engine) {
        case EngineType.BROWSER:
            return {
                engine,
                displayName: getEngineDisplayName(),
                detail: `Model: ${getBrowserModel()}`,
                configured: true, // Browser engine nao precisa de config externa
            };
        case EngineType.WEB_LLM:
            return {
                engine,
                displayName: getEngineDisplayName(),
                detail: `Model: ${getWebLlmModel()}`,
                configured: !!navigator.gpu,
            };
        case EngineType.LOCAL:
            return {
                engine,
                displayName: 'Local Server',
                detail: `${getLocalModel()} @ ${getLocalUrl()}`,
                configured: !!getLocalModel(),
            };
        case EngineType.CLOUD:
        default:
            return {
                engine,
                displayName: 'Cloud',
                detail: `API: ${hasApiKey() ? 'configured' : 'not configured'}`,
                configured: hasApiKey(),
            };
    }
}
/**
 * Validate that the current engine is properly configured.
 * Verifica se a engine ativa tem configuracao minima para funcionar.
 * @returns {{ valid: boolean, message: string }}
 */
export function validateEngineConfig() {
    const engine = getEngine();
    switch (engine) {
        case EngineType.BROWSER:
            return { valid: true, message: 'Browser engine ready' };
        case EngineType.WEB_LLM:
            if (!navigator.gpu) {
                return { valid: false, message: 'WebGPU not available in this browser' };
            }
            return { valid: true, message: 'WebGPU (MLC) engine ready' };
        case EngineType.LOCAL:
            if (!getLocalModel()) {
                return { valid: false, message: 'Local model not configured' };
            }
            return { valid: true, message: 'Local server configured' };
        case EngineType.CLOUD:
        default:
            if (!hasApiKey()) {
                return { valid: false, message: 'API key not configured' };
            }
            return { valid: true, message: 'Cloud API configured' };
    }
}

/**
 * Build a short, non-technical first-use explanation for an unconfigured engine.
 * The returned copy never contains provider errors, credentials or model values.
 */
export function buildEngineSetupGuidance(engine: string = getEngine()) {
    return buildSetupGuidance(engine);
}
// ----------------------------------------------------------------
// MESSAGE ROUTING - SYNCHRONOUS
// Roteamento principal: despacha para a engine ativa
// ----------------------------------------------------------------
/**
 * Route message to the active engine.
 * Funcao principal de roteamento - drop-in replacement para sendMessage().
 * Retorna a mesma shape: { content, provider, model, usage }
 *
 * @param {string} systemPrompt - System prompt with context
 * @param {string} userMessage - User's message
 * @param {Object} [options] - temperature, maxTokens, signal, onProgress
 * @returns {Promise<Object>} - { content, provider, model, usage }
 */
export async function routeMessage(systemPrompt: string, userMessage: string, options: any = {}) {
    const engine = getEngine();
    // Browser/local/web-llm engines usam prompt lite (contexto limitado, modo conversacional)
    const useLite = engine === EngineType.BROWSER || engine === EngineType.LOCAL || engine === EngineType.WEB_LLM;
    const effectivePrompt = useLite ? buildLitePrompt() : systemPrompt;
    switch (engine) {
        case EngineType.BROWSER:
            return generateBrowser(getBrowserModel(), effectivePrompt, userMessage, options);
        case EngineType.WEB_LLM:
            return generateWebLlm(getWebLlmModel(), effectivePrompt, userMessage, options);
        case EngineType.LOCAL:
            return generateLocal(getLocalUrl(), getLocalModel(), effectivePrompt, userMessage, options);
        case EngineType.CLOUD:
        default:
            return sendMessage(systemPrompt, userMessage, options);
    }
}
// ----------------------------------------------------------------
// MESSAGE ROUTING - STREAMING
// Async generator que yield tokens para exibicao em tempo real
// ----------------------------------------------------------------
/**
 * Route message with streaming support.
 * Async generator que yield tokens conforme a engine os produz.
 * Para cloud (sem streaming nativo), yield a resposta completa como token unico.
 *
 * @param {string} systemPrompt - System prompt
 * @param {string} userMessage - User's message
 * @param {Object} [options] - temperature, maxTokens, signal, onProgress
 * @yields {string} Individual tokens
 */
export async function* routeMessageStream(systemPrompt: string, userMessage: string, options: any = {}) {
    const engine = getEngine();
    // Browser/local/web-llm engines usam prompt lite (contexto limitado, modo conversacional)
    const useLite = engine === EngineType.BROWSER || engine === EngineType.LOCAL || engine === EngineType.WEB_LLM;
    const effectivePrompt = useLite ? buildLitePrompt() : systemPrompt;
    switch (engine) {
        case EngineType.BROWSER:
            yield* generateBrowserStream(getBrowserModel(), effectivePrompt, userMessage, options);
            break;
        case EngineType.WEB_LLM:
            yield* generateWebLlmStream(getWebLlmModel(), effectivePrompt, userMessage, options);
            break;
        case EngineType.LOCAL:
            yield* generateLocalStream(getLocalUrl(), getLocalModel(), effectivePrompt, userMessage, options);
            break;
        case EngineType.CLOUD:
        default: {
            // Cloud nao suporta streaming - yield resposta completa
            const response = await sendMessage(systemPrompt, userMessage, options);
            yield response.content;
            break;
        }
    }
}
//# sourceMappingURL=router.js.map
