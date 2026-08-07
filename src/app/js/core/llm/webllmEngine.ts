// @ts-check
// Generated from src/app/js/core/llm/webllmEngine.ts by TS-MIGRATION-001. Do not edit manually.
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
   WEB-LLM ENGINE — On-device LLM inference via MLC/TVM + WebGPU
   ================================================================

   Inferencia local de modelos de linguagem no navegador usando
   WebGPU via @mlc-ai/web-llm (compilacao TVM otimizada).

   Diferenca do browserEngine.js (Transformers.js / ONNX Runtime):
   - web-llm usa modelos compilados via MLC/TVM — otimizados para chat
   - API compativel com OpenAI (chat.completions.create)
   - Streaming nativo via async iterable
   - Melhor performance em text-generation puro

   Posicionamento: assistente offline para consultas simples.
   NAO substitui Cloud AI para raciocinio regulatorio complexo.

   ================================================================ */
// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------
import { importCDN } from '../../utils/helpers/cdnLoader.js';
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.82';
/**
 * Available web-llm models with metadata.
 * Modelos compilados via MLC, otimizados para chat no browser.
 *
 * Model IDs devem corresponder exatamente aos nomes no repositorio
 * MLC (https://huggingface.co/mlc-ai).
 */
const WEBLLM_MODELS = [
    {
        id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
        name: 'Qwen 2.5 0.5B',
        size: '0.5B',
        vramGB: 0.4,
        tier: 'micro',
        nameKey: 'webllmModelQwen05',
        descKey: 'webllmModelQwen05Desc',
    },
    {
        id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
        name: 'Qwen 2.5 1.5B',
        size: '1.5B',
        vramGB: 1.0,
        tier: 'mobile',
        nameKey: 'webllmModelQwen15',
        descKey: 'webllmModelQwen15Desc',
    },
    {
        id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
        name: 'SmolLM2 1.7B',
        size: '1.7B',
        vramGB: 1.2,
        tier: 'mobile',
        nameKey: 'webllmModelSmolLM',
        descKey: 'webllmModelSmolLMDesc',
    },
    {
        id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
        name: 'Llama 3.2 1B',
        size: '1B',
        vramGB: 0.8,
        tier: 'mobile',
        nameKey: 'webllmModelLlama1B',
        descKey: 'webllmModelLlama1BDesc',
    },
    {
        id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
        name: 'Llama 3.2 3B',
        size: '3B',
        vramGB: 2.0,
        tier: 'desktop',
        nameKey: 'webllmModelLlama3B',
        descKey: 'webllmModelLlama3BDesc',
    },
    {
        id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
        name: 'Phi 3.5 Mini',
        size: '3.8B',
        vramGB: 2.5,
        tier: 'desktop',
        nameKey: 'webllmModelPhi',
        descKey: 'webllmModelPhiDesc',
    },
];
// ----------------------------------------------------------------
// SINGLETON STATE
// Engine MLC carregada uma unica vez, reutilizada entre mensagens
// ----------------------------------------------------------------
/** @type {any} MLC web-llm module */
let _webllm: any = null;
/** @type {any} MLCEngine instance */
let _engine: any = null;
/** @type {boolean} */
let _loading = false;
/** @type {string|null} */
let _currentModelId: any = null;
/** @type {number} 0-100 */
let _loadProgress = 0;
// ----------------------------------------------------------------
// OOM TRACKING
// ----------------------------------------------------------------
/** @type {Set<string>} Model IDs que falharam por OOM nesta sessao */
const _oomFailedModels = new Set();
const _OOM_PATTERN = /out.of.memory|alloc.*fail|memory|OOM|webgpu.*lost|device.*lost/i;
// ----------------------------------------------------------------
// LIBRARY LOADING
// ----------------------------------------------------------------
/**
 * Lazy-load @mlc-ai/web-llm from CDN.
 * Carrega a biblioteca apenas quando necessario (primeira chamada).
 * @returns {Promise<any>} Modulo web-llm
 */
async function ensureWebLlm() {
    if (_webllm) return _webllm;
    const mod = await importCDN(WEBLLM_CDN, {
        name: '@mlc-ai/web-llm',
        timeout: 20000,
    });
    _webllm = /** @type {any} */ (mod);
    return _webllm;
}
// ----------------------------------------------------------------
// ENGINE MANAGEMENT
// Criacao e gerenciamento da MLCEngine singleton
// ----------------------------------------------------------------
/**
 * Ensure MLCEngine is ready with the requested model.
 * Cria engine se necessario ou se o modelo mudou.
 *
 * @param {string} modelId - MLC model ID
 * @param {Function|null} [onProgress] - Progress callback: { status, message, progress }
 * @returns {Promise<void>}
 */
async function ensureEngine(modelId: string, onProgress: any = null) {
    // Engine ja existe para este modelo
    if (_engine && _currentModelId === modelId) return;
    // Evita carregamento duplicado
    if (_loading) {
        throw new Error('Model is already loading. Please wait.');
    }
    _loading = true;
    _loadProgress = 0;
    try {
        const webllm = await ensureWebLlm();
        // Descarrega modelo anterior se diferente
        if (_engine && _currentModelId !== modelId) {
            await _engine.unload();
            _engine = null;
            _currentModelId = null;
        }
        _notify(onProgress, 'loading', `Loading ${modelId}...`, 0);
        // Cria nova engine com o modelo solicitado
        _engine = await webllm.CreateMLCEngine(
            modelId,
            {
                initProgressCallback: (report: any) => {
                    // report.text contem descricao do progresso
                    // report.progress contem valor 0-1 (quando disponivel)
                    const pct = typeof report.progress === 'number' ? Math.round(report.progress * 100) : _loadProgress;
                    _loadProgress = pct;
                    _notify(onProgress, 'downloading', report.text || `Loading... ${pct}%`, pct);
                },
                logLevel: 'SILENT',
            },
            {
                context_window_size: 2048,
            },
        );
        _currentModelId = modelId;
        _notify(onProgress, 'ready', 'Model ready!', 100);
    } catch (err: any) {
        _engine = null;
        _currentModelId = null;
        // --- OOM fallback: tenta modelo menor ---
        if (_OOM_PATTERN.test(err?.message || '')) {
            _oomFailedModels.add(modelId);
            const smaller = _findSmallerModel(modelId);
            if (smaller) {
                console.warn(`[web-llm] Model ${modelId} OOM. Falling back to ${smaller}...`);
                _notify(onProgress, 'fallback', `Not enough memory for ${modelId}. Trying smaller model...`, 0);
                _loading = false;
                return ensureEngine(smaller, onProgress);
            }
            throw new Error(
                `Not enough GPU memory to run any web-llm model. ` +
                    `Try closing other tabs or switch to Cloud engine.`,
                { cause: err },
            );
        }
        throw new Error(`Failed to load model ${modelId}: ${err?.message}`, { cause: err });
    } finally {
        _loading = false;
    }
}
/**
 * Find a smaller model as OOM fallback.
 * @param {string} failedModelId
 * @returns {string|null}
 */
function _findSmallerModel(failedModelId: string) {
    const failedModel = WEBLLM_MODELS.find((m) => m.id === failedModelId);
    const failedVram = failedModel ? failedModel.vramGB : Infinity;
    const sorted = [...WEBLLM_MODELS].sort((a, b) => a.vramGB - b.vramGB);
    for (const model of sorted) {
        if (model.id === failedModelId) continue;
        if (_oomFailedModels.has(model.id)) continue;
        if (model.vramGB >= failedVram) continue;
        return model.id;
    }
    return null;
}
/**
 * Notify progress callback.
 * @param {Function|null|undefined} cb
 * @param {string} status
 * @param {string} message
 * @param {number} progress
 */
function _notify(cb: any, status: string, message: string, progress: number) {
    if (cb) cb({ status, message, progress });
}
// ----------------------------------------------------------------
// TEXT GENERATION - SYNCHRONOUS
// ----------------------------------------------------------------
/**
 * Generate response using web-llm engine (non-streaming).
 * Executa inferencia local via MLC/TVM e retorna resposta completa.
 *
 * @param {string} modelId - MLC model ID
 * @param {string} systemPrompt - System prompt
 * @param {string} userMessage - User message
 * @param {any} [options] - temperature, maxTokens, onProgress
 * @returns {Promise<Object>} - { content, provider: 'web-llm', model, usage }
 */
export async function generateWebLlm(modelId: string, systemPrompt: string, userMessage: string, options: any = {}) {
    await ensureEngine(modelId, options.onProgress);
    const reply = await _engine.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 1000,
        stream: false,
    });
    const content = reply.choices?.[0]?.message?.content || '';
    return {
        content,
        provider: 'web-llm',
        model: modelId,
        usage: {
            device: 'webgpu',
            prompt_tokens: reply.usage?.prompt_tokens,
            completion_tokens: reply.usage?.completion_tokens,
        },
    };
}
// ----------------------------------------------------------------
// TEXT GENERATION - STREAMING
// Async generator com API OpenAI-compativel nativa do web-llm
// ----------------------------------------------------------------
/**
 * Generate response using web-llm engine (streaming).
 * Async generator que yield tokens via OpenAI-compatible streaming.
 *
 * @param {string} modelId - MLC model ID
 * @param {string} onProgress - System prompt
 * @param {string} userMessage - User message
 * @param {any} [options] - temperature, maxTokens, onProgress
 * @yields {string} Individual tokens
 */
export async function* generateWebLlmStream(modelId: string, systemPrompt: string, userMessage: string, options: any = {}) {
    await ensureEngine(modelId, options.onProgress);
    const chunks = await _engine.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 1000,
        stream: true,
    });
    for await (const chunk of chunks) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) yield token;
    }
}
// ----------------------------------------------------------------
// MODEL MANAGEMENT
// ----------------------------------------------------------------
/**
 * Explicitly load a web-llm model.
 * Carrega modelo sem gerar texto - util para pre-download.
 *
 * @param {string} modelId - MLC model ID
 * @param {Function} [onProgress] - Progress callback
 * @returns {Promise<void>}
 */
export async function loadWebLlmModel(modelId: string, onProgress: any) {
    await ensureEngine(modelId, onProgress);
}
/**
 * Unload current model from memory.
 * Libera a engine MLC e o modelo da memoria GPU.
 */
export async function unloadWebLlmModel() {
    if (_engine) {
        await _engine.unload();
        _engine = null;
        _currentModelId = null;
        _loadProgress = 0;
    }
}
/**
 * Get available web-llm models.
 * Retorna lista de modelos MLC disponiveis com metadata.
 * @returns {Array<Object>}
 */
export function getWebLlmModels() {
    return [...WEBLLM_MODELS];
}
/**
 * Get current model loading status.
 * Retorna estado atual do modelo (carregado, carregando, progresso).
 * @returns {{ loaded: boolean, modelId: string|null, loading: boolean, progress: number, device: string }}
 */
export function getWebLlmModelStatus() {
    return {
        loaded: _engine !== null,
        modelId: _currentModelId,
        loading: _loading,
        progress: _loadProgress,
        device: 'webgpu',
    };
}
/**
 * Check web-llm engine availability.
 * web-llm requer WebGPU - sem fallback WASM.
 * @returns {{ webgpu: boolean, wasm: boolean }}
 */
export function isWebLlmAvailable() {
    return {
        webgpu: !!navigator.gpu,
        wasm: false, // web-llm nao suporta WASM, apenas WebGPU
    };
}
//# sourceMappingURL=webllmEngine.js.map
