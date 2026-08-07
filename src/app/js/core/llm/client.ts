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
   CLIENTE LLM — Multi-provider API abstraction
   ================================================================

   Interface unificada para comunicacao com multiplos provedores LLM.
   Suporta OpenAI, Claude, Google Gemini, DeepSeek e Groq.

   FUNCIONALIDADES:
   - Armazenamento seguro de API key (sessionStorage)
   - Suporte a 5 provedores
   - Selecao de modelo por provedor
   - Teste de conexao
   - Tratamento de erros e rate limiting
   - Suporte a visao/imagem (options.image) para analise multimodal

   ================================================================ */

import {
    LLMProvider,
    PROVIDER_CONFIG,
    getProviderConfig,
    getDefaultModel,
    detectProviderFromKey,
} from './providers.js';

// SPEC_RECONCILIATION_001_LLM_KEYS §Q1.3 — KDF canonico compartilhado.
// PBKDF2-SHA256 600k iteracoes (OWASP 2024 / NIST SP 800-132). Fonte unica
// de verdade do floor/default de iteracoes.
import { KDF_CONFIG } from './keySecurity.js';
import { guardBackendFetch } from '../../main/guestGate.js';
import { generateSalt as _generateSaltPure, aesEncrypt as _aesEncryptPure, aesDecrypt as _aesDecryptPure } from './_llmCryptoPure.js';

// Re-export LLMProvider for backwards compatibility
// Mantém compatibilidade com imports existentes
export { LLMProvider };

// ================================================================
// STORAGE KEYS
// ================================================================

const STORAGE_KEYS = {
    API_KEY: 'ecbyts_llm_key',
    PROVIDER: 'ecbyts_llm_provider',
    MODEL: 'ecbyts_llm_model',
    // Dev-only: quando '1', o client roteia chamadas LLM pelo api-server local
    // (POST /api/dev/llm/<provider>) em vez de chamar o endpoint upstream direto.
    // Evita "Failed to fetch" por CORS/ad-block e mantém a key no server.
    DEV_PROXY: 'ecbyts_llm_dev_proxy',
};

function isDevProxyActive(): boolean {
    try {
        return sessionStorage.getItem(STORAGE_KEYS.DEV_PROXY) === '1';
    } catch {
        return false;
    }
}

// ================================================================
// API KEY MANAGEMENT
// Gerenciamento de chave de API (armazenada na sessao do navegador)
// ================================================================

/**
 * Save API key to browser session.
 * Salva a API key na sessao do navegador.
 * @param {string} key - A chave de API
 */
export function setApiKey(key: string) {
    sessionStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

/**
 * Retrieve API key from session.
 * Recupera a API key da sessao.
 * @returns {string|null}
 */
export function getApiKey(): string | null {
    return sessionStorage.getItem(STORAGE_KEYS.API_KEY);
}

/**
 * Check if API key is configured.
 * Verifica se ha uma API key configurada.
 * @returns {boolean}
 */
export function hasApiKey(): boolean {
    const key = getApiKey();
    return key !== null && key.trim() !== '';
}

/**
 * Dev-only bootstrap: if running on localhost via api-server and no session key
 * is configured, hydrate the browser session from /api/dev/llm-config.
 *
 * This intentionally no-ops outside local development.
 *
 * @returns {Promise<boolean>} true when a key was hydrated
 */
export async function hydrateDevLocalLlmConfig(): Promise<boolean> {
    if (hasApiKey()) return false;
    // ECBYTS-OPEN-LOCAL-001 F1: chamada /api/* de BOOT — skip silencioso em
    // Modo Convidado (era um 404 no console, F0 §1.4).
    if (!guardBackendFetch('llm:dev-config', 'boot')) return false;
    const hostname = window.location.hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return false;

    try {
        const res = await fetch('/api/dev/llm-config', { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return false;
        const payload = await res.json();
        const data = payload?.data;
        if (!data?.key || !data?.provider) return false;
        setProvider(data.provider);
        setApiKey(data.key);
        if (data.model) setModel(data.model);
        // Quando o server sinaliza proxy:true, todas as chamadas LLM passam pelo
        // api-server local em vez de fetch direto ao endpoint upstream.
        if (data.proxy) {
            try { sessionStorage.setItem(STORAGE_KEYS.DEV_PROXY, '1'); } catch (e) { console.debug('[llm:dev-proxy:set]', (e as any)?.message || e); }
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Remove API key from session.
 * Remove a API key da sessao.
 */
export function clearApiKey() {
    sessionStorage.removeItem(STORAGE_KEYS.API_KEY);
}

// ================================================================
// PROVIDER MANAGEMENT
// Gerenciamento de provedor e modelo selecionado
// ================================================================

/**
 * Set the LLM provider.
 * Define o provedor de LLM.
 * @param {string} provider - Provider ID (openai, claude, google, deepseek, groq)
 */
export function setProvider(provider: string) {
    if (!(PROVIDER_CONFIG as any)[provider]) {
        throw new Error(`Provider inválido: ${provider}`);
    }
    sessionStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
}

/**
 * Get configured provider.
 * Recupera o provedor configurado.
 * @returns {string}
 */
export function getProvider(): string {
    return sessionStorage.getItem(STORAGE_KEYS.PROVIDER) || LLMProvider.OPENAI;
}

/**
 * Set the model for current provider.
 * Define o modelo para o provedor atual.
 * @param {string} model - Model identifier
 */
export function setModel(model: string) {
    sessionStorage.setItem(STORAGE_KEYS.MODEL, model);
}

/**
 * Get configured model (falls back to provider default).
 * Recupera o modelo configurado.
 * @returns {string}
 */
export function getModel(): string {
    return sessionStorage.getItem(STORAGE_KEYS.MODEL) || getDefaultModel(getProvider());
}

/**
 * Detect provider from API key format.
 * Detecta o provedor baseado no formato da API key.
 * @param {string} key - A chave de API
 * @returns {string}
 */
export function detectProvider(key: string): string {
    return detectProviderFromKey(key);
}

// ================================================================
// LLM CLIENT - Send messages to any provider
// Envia mensagens para qualquer provedor de LLM
// ================================================================

const LLM_TIMEOUT_MS = 30_000; // 30 segundos — evita fetch pendurado indefinidamente

interface LlmProviderConfig {
    id: string;
    name: string;
    endpoint: string;
    apiFormat: string;
}

interface LlmRequestOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    image?: string;
    signal?: AbortSignal;
}

/**
 * Fetch com timeout e suporte a AbortSignal externo.
 * Aborta automaticamente após timeoutMs milissegundos.
 * Se options.signal for passado, o fetch respeita ambos (timeout interno + sinal externo).
 *
 * @param {string} url
 * @param {RequestInit} fetchOptions
 * @param {AbortSignal|null} externalSignal
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(
    url: string,
    fetchOptions: RequestInit,
    externalSignal: AbortSignal | null,
    timeoutMs: number = LLM_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);

    // Se o caller passou um signal externo, encadeia o abort
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            controller.abort(externalSignal.reason);
        } else {
            externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
        }
    }

    try {
        return await fetch(url, { ...fetchOptions, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Send message to LLM and return response.
 * Envia mensagem para o LLM e retorna a resposta.
 *
 * @param {string} systemPrompt - System prompt with context
 * @param {string} userMessage - User's message
 * @param {LlmRequestOptions} [options] - Additional options (model, temperature, maxTokens, image)
 * @returns {Promise<any>}
 */
export async function sendMessage(
    systemPrompt: string,
    userMessage: string,
    options: LlmRequestOptions = {},
): Promise<any> {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('API key não configurada');
    }

    const provider = getProvider();
    const config = getProviderConfig(provider) as any;
    if (!config) {
        throw new Error(`Provider não suportado: ${provider}`);
    }

    try {
        switch (config.apiFormat) {
            case 'openai':
                return await callOpenAICompatible(config, systemPrompt, userMessage, apiKey, options);
            case 'claude':
                return await callClaude(systemPrompt, userMessage, apiKey, options);
            case 'google':
                return await callGoogle(config, systemPrompt, userMessage, apiKey, options);
            default:
                throw new Error(`Formato de API desconhecido: ${config.apiFormat}`);
        }
    } catch (error) {
        console.error(`Erro na chamada LLM (${provider}):`, error);
        throw error;
    }
}

// ================================================================
// PROVIDER-SPECIFIC API CALLS
// ================================================================

/**
 * Call OpenAI-compatible APIs (OpenAI, DeepSeek, Groq).
 * Chamada para APIs compativeis com o formato OpenAI.
 */
/** @param {LlmProviderConfig} config @param {string} systemPrompt @param {string} userMessage @param {string} apiKey @param {LlmRequestOptions} [options] */
async function callOpenAICompatible(
    config: LlmProviderConfig,
    systemPrompt: string,
    userMessage: string,
    apiKey: string,
    options: LlmRequestOptions = {},
) {
    const _opts = options;
    const model = _opts.model || getModel();

    // Vision support - se options.image presente, envia conteudo multimodal
    const userContent = _opts.image
        ? [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: _opts.image } },
          ]
        : userMessage;

    const useProxy = isDevProxyActive();
    const url = useProxy ? `/api/dev/llm/${config.id}` : config.endpoint;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!useProxy) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetchWithTimeout(
        url,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                temperature: _opts.temperature || 0.3,
                max_tokens: _opts.maxTokens || 1000,
            }),
        },
        _opts.signal || null,
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || error.error || `Erro ${config.name}: ${response.status}`);
    }

    const data = await response.json();
    return {
        content: data.choices[0]?.message?.content || '',
        provider: config.id,
        model: model,
        usage: data.usage,
    };
}

/**
 * Call Anthropic Claude API.
 * Chamada para API da Anthropic (Claude).
 */
/** @param {string} systemPrompt @param {string} userMessage @param {string} apiKey @param {LlmRequestOptions} [options] */
async function callClaude(
    systemPrompt: string,
    userMessage: string,
    apiKey: string,
    options: LlmRequestOptions = {},
) {
    const _opts = options;
    const model = _opts.model || getModel();

    // Vision support - se options.image presente, envia conteudo multimodal
    let userContent: any = userMessage;
    if (_opts.image) {
        const [header, base64Data] = _opts.image.split(',');
        const mediaType = (header!.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
        userContent = [
            { type: 'text', text: userMessage },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        ];
    }

    const useProxy = isDevProxyActive();
    const url = useProxy ? '/api/dev/llm/claude' : (PROVIDER_CONFIG as any)[LLMProvider.CLAUDE].endpoint;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!useProxy) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const response = await fetchWithTimeout(
        url,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model,
                max_tokens: _opts.maxTokens || 1000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }],
            }),
        },
        _opts.signal || null,
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || error.error || `Erro Claude: ${response.status}`);
    }

    const data = await response.json();
    return {
        content: data.content[0]?.text || '',
        provider: LLMProvider.CLAUDE,
        model: model,
        usage: data.usage,
    };
}

/**
 * Call Google Gemini API.
 * Chamada para API do Google Gemini (usa query param para autenticacao).
 */
/** @param {LlmProviderConfig} config @param {string} systemPrompt @param {string} userMessage @param {string} apiKey @param {LlmRequestOptions} [options] */
async function callGoogle(
    config: LlmProviderConfig,
    systemPrompt: string,
    userMessage: string,
    apiKey: string,
    options: LlmRequestOptions = {},
) {
    const _opts = options;
    const model = _opts.model || getModel();
    const useProxy = isDevProxyActive();
    const url = useProxy ? '/api/dev/llm/google' : `${config.endpoint}/${model}:generateContent?key=${apiKey}`;

    // Vision support - se options.image presente, adiciona inlineData
    const userParts: any[] = [{ text: userMessage }];
    if (_opts.image) {
        const [header, base64Data] = _opts.image.split(',');
        const mimeType = (header!.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
        userParts.push({ inlineData: { mimeType, data: base64Data } });
    }

    const requestBody: Record<string, any> = {
        system_instruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
                role: 'user',
                parts: userParts,
            },
        ],
        generationConfig: {
            temperature: _opts.temperature || 0.3,
            maxOutputTokens: _opts.maxTokens || 1000,
        },
    };
    if (useProxy) requestBody.model = model;

    const response = await fetchWithTimeout(
        url,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        },
        _opts.signal || null,
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || error.error || `Erro Gemini: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
        content: text,
        provider: LLMProvider.GOOGLE,
        model: model,
        usage: data.usageMetadata || {},
    };
}

// ================================================================
// CONNECTION TEST
// Testa a conexao com o provedor usando uma requisicao minima
// ================================================================

/**
 * Test connection to current provider.
 * Testa a conexao com o provedor selecionado.
 *
 * @returns {Promise<Object>} - { success, message, provider, model }
 */
export async function testConnection(): Promise<Object> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return { success: false, message: 'API key não configurada' };
    }

    try {
        const result = (await sendMessage(
            'You are a test assistant. Reply with exactly: OK',
            'Respond with the word OK only.',
            { maxTokens: 10 },
        )) as any;

        return {
            success: true,
            message: `Conectado: ${result.provider} (${result.model})`,
            provider: result.provider,
            model: result.model,
        };
    } catch (error) {
        return {
            success: false,
            message: (error as any)?.message || 'Falha na conexão',
        };
    }
}

// ================================================================
// UTILITIES
// ================================================================

/**
 * Validate configuration completeness.
 * Verifica se a configuracao esta completa.
 * @returns {Object} - { valid: boolean, message: string }
 */
export function validateConfig(): Object {
    if (!hasApiKey()) {
        return { valid: false, message: 'API key não configurada' };
    }
    return { valid: true, message: 'Configuração válida' };
}

/**
 * Get current configuration info.
 * Retorna informacoes sobre a configuracao atual.
 * @returns {Object}
 */
export function getConfig(): Object {
    const provider = getProvider();
    const config = getProviderConfig(provider) as any;
    return {
        hasKey: hasApiKey(),
        provider: provider,
        providerName: config ? config.name : provider,
        model: getModel(),
    };
}

// ================================================================
// SUPABASE PERSISTENCE - API key encrypted cloud sync
// Persistencia de chaves LLM no Supabase, encriptadas com AES-GCM.
// A chave de encriptacao e derivada do userId via PBKDF2 -
// deterministico, sem necessidade de senha adicional.
// Protege contra vazamentos de banco (dump SQL) sem expor o plaintext.
// ================================================================

// F03 - Salt legado (pre-migration). Valor publico (visivel no source) - risco aceito:
// migration on-read move todas as rows ativas para salt per-user na proxima carga.
const _LEGACY_SALT = 'ecbyts-llm-v1';

function _llmKeysApiClient(supabase: any): any {
    return typeof supabase?.schema === 'function' ? supabase.schema('api') : supabase;
}

/**
 * Derive AES-GCM key from a user-supplied passphrase via PBKDF2-SHA256.
 *
 * SPEC_RECONCILIATION_001_LLM_KEYS §T1 — caminho seguro (v0.3). O material de
 * chave e o segredo digitado pelo usuario (NUNCA userId/email). Iteracoes
 * default 600k seguindo OWASP 2024; floor 300k. Opt-in: so usado quando o
 * chamador fornece uma passphrase.
 *
 * Em portugues: gera a chave AES a partir de uma senha secreta do usuario,
 * tornando o vazamento de banco insuficiente para decifrar as chaves de API.
 *
 * @param {string} passphrase - segredo digitado pelo usuario (>= 12 chars)
 * @param {string} salt - hex string per-user (64 chars)
 * @param {number} [iterations=KDF_CONFIG.DEFAULT_ITERATIONS] - >= floor 300k
 * @returns {Promise<CryptoKey>}
 */
async function _deriveEncKeyFromPassphrase(
    passphrase: string,
    salt: string,
    iterations: number = KDF_CONFIG.DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
        throw new Error('passphrase required for secure LLM key derivation');
    }
    // Garante piso de iteracoes mesmo se chamador passar valor abaixo do floor.
    const iter = Math.max(KDF_CONFIG.FLOOR_ITERATIONS, Number(iterations) || KDF_CONFIG.DEFAULT_ITERATIONS);
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: KDF_CONFIG.ALGORITHM, salt: enc.encode(salt), iterations: iter, hash: KDF_CONFIG.HASH },
        keyMat,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/**
 * LEGACY (v0.2) — Derive AES-GCM key from non-secret userId via PBKDF2.
 *
 * SPEC_RECONCILIATION_001_LLM_KEYS §Q1.2 — caminho legado, READ-ONLY para
 * migracao. O userId NAO e secreto, portanto esta derivacao protege apenas
 * contra dumps de banco triviais. Mantido por 2 releases para decifrar
 * chaves antigas e re-cifrar com passphrase. Emite console.warn.
 *
 * @deprecated Use _deriveEncKeyFromPassphrase. Removido apos v0.5.
 * @param {string} userId
 * @param {string} salt - hex string (64 chars) ou salt legado
 * @returns {Promise<CryptoKey>}
 */
async function _deriveEncKeyLegacyUserId(userId: string, salt: string): Promise<CryptoKey> {
    console.warn(
        '[llm:keySecurity] LEGACY KDF (userId, 100k iter) em uso — chave LLM em formato v0.2. ' +
            'Re-cifre com passphrase (SPEC_RECONCILIATION_001_LLM_KEYS §Q1.2).',
    );
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(userId), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' },
        keyMat,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/**
 * F03 - Gera salt criptografico unico (32 bytes -> 64 hex chars).
 * @returns {string}
 */
function _generateSalt(): string {
    return _generateSaltPure();
}

async function _aesEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
    return _aesEncryptPure(key, plaintext);
}

async function _aesDecrypt(key: CryptoKey, b64: string): Promise<string> {
    return _aesDecryptPure(key, b64);
}

/**
 * Save API key for a provider to Supabase (AES-GCM encrypted).
 * Salva a API key de um provider no Supabase encriptada.
 *
 * @param {any} supabase - Supabase client
 * @param {string} userId
 * @param {string} provider - openai | claude | google | deepseek | groq
 * @param {string} apiKey - plaintext API key
 * @param {string} [model?] - selected model identifier
 * @param {string} [passphrase?] - SPEC_RECONCILIATION_001 §T1: obrigatoria em
 *        runtime para novas escritas. Cifra com PBKDF2 passphrase 600k (formato v0.3).
 * @returns {Promise<void>}
 */
export async function saveKeyToSupabase(
    supabase: any,
    userId: string,
    provider: string,
    apiKey: string,
    model?: string,
    passphrase?: string,
): Promise<void> {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
        throw new Error('passphrase required to sync LLM key to Supabase');
    }
    if (typeof userId !== 'string' || userId.length === 0) {
        throw new Error('userId required to sync LLM key to Supabase');
    }
    // F03 - Buscar salt existente ou gerar novo
    const api = _llmKeysApiClient(supabase);
    const { data: existingRows } = (await api.rpc('get_user_llm_keys', { p_provider: provider })) as any;
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const salt = existing?.enc_salt || _generateSalt();

    // SPEC_RECONCILIATION_001_LLM_KEYS §T1 — novas escritas exigem passphrase.
    const encKey = await _deriveEncKeyFromPassphrase(passphrase, salt);
    const encApiKey = await _aesEncrypt(encKey, apiKey);
    const { error } = await api.rpc('upsert_user_llm_key', {
        p_provider: provider,
        p_enc_key: encApiKey,
        p_enc_salt: salt,
        p_model: model || null,
        p_kdf: 'passphrase',
        p_format: 'v0.3',
    });
    if (error) throw new Error(error.message);
}

/**
 * Load all saved API keys for a user from Supabase (decrypted).
 * Carrega e decripta todas as API keys salvas do usuario.
 *
 * @param {any} supabase - Supabase client
 * @param {string} userId
 * @param {string} [passphrase?] - SPEC_RECONCILIATION_001 §T1: necessaria para
 *        decifrar rows em formato v0.3 (kdf=passphrase). Rows legadas (v0.2)
 *        continuam decifrando via userId (read-only) ate a migracao.
 * @returns {Promise<any|null>} { provider: { key, model } } ou null se vazio/erro
 */
export async function loadKeysFromSupabase(
    supabase: any,
    userId: string,
    passphrase?: string,
): Promise<any | null> {
    const api = _llmKeysApiClient(supabase);
    const { data, error } = (await api.rpc('get_user_llm_keys', { p_provider: null })) as any;
    if (error || !data?.length) return null;
    const hasPassphrase = typeof passphrase === 'string' && passphrase.length > 0;
    const result: any = {};
    for (const row of data) {
        try {
            let apiKey;
            const isPassphraseRow = row.kdf === 'passphrase' || row.format === 'v0.3';
            if (isPassphraseRow) {
                // SPEC_RECONCILIATION_001 §T1 — formato v0.3 exige passphrase.
                if (!hasPassphrase) {
                    console.warn(`[llm] row v0.3 provider=${row.provider} requer passphrase — pulando`);
                    continue;
                }
                const encKey = await _deriveEncKeyFromPassphrase(passphrase as string, row.enc_salt);
                apiKey = await _aesDecrypt(encKey, row.enc_key);
            } else if (row.enc_salt) {
                // Formato v0.2: salt per-user, material = userId (legacy read-only)
                const encKey = await _deriveEncKeyLegacyUserId(userId, row.enc_salt);
                apiKey = await _aesDecrypt(encKey, row.enc_key);
            } else {
                // F03 - Legado: salt fixo. Decriptar e re-salvar com salt novo (migration on-read)
                const legacyKey = await _deriveEncKeyLegacyUserId(userId, _LEGACY_SALT);
                apiKey = await _aesDecrypt(legacyKey, row.enc_key);
                // Re-encrypt com salt per-user (async, nao bloqueia).
                // Inclui model para evitar perda em upsert (PostgREST PATCH preserva, mas explicito e mais seguro)
                const newSalt = _generateSalt();
                const newKey = await _deriveEncKeyLegacyUserId(userId, newSalt);
                const newEnc = await _aesEncrypt(newKey, apiKey);
                api
                    .rpc('upsert_user_llm_key', {
                        p_provider: row.provider,
                        p_enc_key: newEnc,
                        p_enc_salt: newSalt,
                        p_model: row.model,
                        p_kdf: 'legacy',
                        p_format: 'v0.2',
                    })
                    .then((res: any) => {
                        const e = res?.error;
                        if (e) console.warn('[llm] migration salt falhou:', row.provider, e.message);
                    });
            }
            result[row.provider] = { key: apiKey, model: row.model };
        } catch (e) {
            console.warn(`[llm] row corrompida provider=${row.provider}, ignorando:`, (e as any)?.message);
        }
    }
    return Object.keys(result).length ? result : null;
}
