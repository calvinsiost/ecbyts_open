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
   LOCAL ENGINE — OpenAI-compatible local server client
   ================================================================

   Cliente para servidores locais como Ollama, LM Studio e llama.cpp.
   Usa formato OpenAI-compativel (POST /v1/chat/completions).
   Suporta modo sincrono e streaming (SSE).

   ================================================================ */

const LOCAL_TIMEOUT_MS = 120_000; // 2 minutos — modelos locais sao mais lentos

interface LocalGenOptions {
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
}

// ----------------------------------------------------------------
// RECOMMENDED LOCAL MODELS
// Modelos recomendados para servidor local (Ollama / LM Studio)
// ----------------------------------------------------------------

export const LOCAL_MODELS: Array<{
    id: string;
    name: string;
    params: string;
    vramGB: number;
    tier: string;
    license: string;
    recommended?: boolean;
}> = [
    {
        id: 'gemma4:e2b',
        name: 'Gemma 4 E2B',
        params: '2.3B effective',
        vramGB: 4,
        tier: 'desktop',
        license: 'Apache-2.0',
        recommended: true,
    },
    { id: 'gemma4', name: 'Gemma 4 E4B', params: '4B effective', vramGB: 6, tier: 'desktop', license: 'Apache-2.0' },
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', params: '3B', vramGB: 2.5, tier: 'desktop', license: 'Llama-3.2' },
    { id: 'qwen2.5:1.5b', name: 'Qwen 2.5 1.5B', params: '1.5B', vramGB: 1.2, tier: 'mobile', license: 'Apache-2.0' },
    { id: 'qwen2.5:0.5b', name: 'Qwen 2.5 0.5B', params: '0.5B', vramGB: 0.4, tier: 'micro', license: 'Apache-2.0' },
];

// ----------------------------------------------------------------
// SYNCHRONOUS GENERATION
// Chamada sincrona (stream: false) - retorna resposta completa
// ----------------------------------------------------------------

/**
 * Generate response from local server (non-streaming).
 * Envia mensagem para servidor local e aguarda resposta completa.
 *
 * @param url - Server endpoint (ex: http://localhost:11434/v1/chat/completions)
 * @param model - Model name (ex: llama3.2:3b)
 * @param systemPrompt - System prompt
 * @param userMessage - User message
 */
export async function generateLocal(
    url: string,
    model: string,
    systemPrompt: string,
    userMessage: string,
    options: LocalGenOptions = {},
): Promise<{ content: string; provider: 'local'; model: string; usage: Record<string, unknown> }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), LOCAL_TIMEOUT_MS);

    // Encadeia signal externo se fornecido
    const externalSignal = options.signal;
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            throw new DOMException('Aborted', 'AbortError');
        }
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens ?? 1000,
                stream: false,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Local server error: ${response.status}`);
        }

        const data = await response.json();
        return {
            content: data.choices?.[0]?.message?.content || '',
            provider: 'local',
            model,
            usage: data.usage || {},
        };
    } catch (err) {
        throw wrapLocalError(err, url);
    } finally {
        clearTimeout(timeoutId);
    }
}

// ----------------------------------------------------------------
// STREAMING GENERATION
// Usa SSE (Server-Sent Events) para yield de tokens incrementais
// ----------------------------------------------------------------

/**
 * Generate response from local server (streaming).
 * Async generator que yield tokens conforme chegam via SSE.
 *
 * @param url - Server endpoint
 * @param model - Model name
 * @param systemPrompt - System prompt
 * @param userMessage - User message
 */
export async function* generateLocalStream(
    url: string,
    model: string,
    systemPrompt: string,
    userMessage: string,
    options: LocalGenOptions = {},
): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), LOCAL_TIMEOUT_MS);

    const externalSignal = options.signal;
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            throw new DOMException('Aborted', 'AbortError');
        }
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens ?? 1000,
                stream: true,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Local server error: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('Local server returned no response body for streaming request');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Ultimo elemento pode ser incompleto - preserva no buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;

                const payload = trimmed.slice(5).trim();
                if (payload === '[DONE]') return;

                try {
                    const chunk = JSON.parse(payload);
                    const token = chunk.choices?.[0]?.delta?.content;
                    if (token) yield token;
                } catch (e) {
                    console.debug('[localEngine] sseChunk:', e instanceof Error ? e.message : e);
                    // Linha SSE malformada - ignora silenciosamente
                }
            }
        }
    } catch (err) {
        throw wrapLocalError(err, url);
    } finally {
        clearTimeout(timeoutId);
    }
}

// ----------------------------------------------------------------
// CONNECTION TEST
// Testa conectividade com o servidor local
// ----------------------------------------------------------------

/**
 * Test connection to local server.
 * Envia prompt minimo para verificar se o servidor responde.
 *
 * @param url - Server endpoint
 * @param model - Model name
 */
export async function testLocalConnection(
    url: string,
    model: string,
): Promise<{ success: boolean; message: string }> {
    try {
        const _result = await generateLocal(url, model, 'Reply with OK only.', 'Say OK.', { maxTokens: 10 });
        return {
            success: true,
            message: `Connected: ${model} @ ${new URL(url).host}`,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            success: false,
            message,
        };
    }
}

// ----------------------------------------------------------------
// MODEL DISCOVERY
// Busca lista de modelos disponiveis no servidor local
// ----------------------------------------------------------------

/**
 * Fetch available models from local server.
 * Chama GET /v1/models (padrao OpenAI) para listar modelos.
 *
 * @param baseUrl - Server base URL (ex: http://localhost:11434)
 * @returns Lista de model IDs
 */
export async function fetchLocalModels(baseUrl: string): Promise<Array<string>> {
    // Deriva URL de models a partir do endpoint de completions
    const modelsUrl = baseUrl.replace(/\/v1\/chat\/completions\/?$/, '/v1/models');

    try {
        const response = await fetch(modelsUrl, {
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        const list: Array<{ id?: string; name?: string }> = data.data || data.models || [];
        return list.map((m) => m.id || m.name || '').filter(Boolean);
    } catch (err) {
        throw wrapLocalError(err, modelsUrl);
    }
}

// ----------------------------------------------------------------
// ERROR WRAPPER
// Traduz erros de rede em mensagens uteis para o usuario
// ----------------------------------------------------------------

/**
 * Wrap network errors with helpful guidance.
 * Transforma erros genericos em mensagens com orientacao de CORS.
 *
 * @param err - Erro original
 * @param url - URL tentada
 * @returns Erro com mensagem amigavel
 */
function wrapLocalError(err: unknown, url: string): Error {
    const errObj: { name?: string; message?: string } = err && typeof err === 'object' ? err : {};
    // CORS ou servidor indisponivel - TypeError: Failed to fetch
    if (
        errObj.name === 'TypeError' &&
        typeof errObj.message === 'string' &&
        errObj.message.includes('Failed to fetch')
    ) {
        return new Error(
            `Cannot reach local server at ${url}.\n` +
                'Check:\n' +
                '1. Server is running (ollama serve / lm-studio)\n' +
                '2. CORS is enabled (Ollama: OLLAMA_ORIGINS=* ollama serve)\n' +
                '3. URL is correct',
        );
    }

    // Timeout
    if (errObj.name === 'TimeoutError') {
        return new Error(
            `Local server timed out after ${LOCAL_TIMEOUT_MS / 1000}s.\n` +
                'The model may be too large or the server overloaded.',
        );
    }

    // AbortError - usuario cancelou
    if (errObj.name === 'AbortError') {
        return new Error('Request cancelled.');
    }

    if (err instanceof Error) return err;
    return new Error(typeof errObj.message === 'string' ? errObj.message : String(err));
}
