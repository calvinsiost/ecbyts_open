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
   LLM PROVIDERS REGISTRY — Multi-provider configuration
   Registro de provedores LLM com metadados e endpoints

   Cada provedor tem configuracao de endpoint, modelos disponiveis,
   formato de autenticacao e link para obter chave de API.
   ================================================================ */

// ================================================================
// PROVIDER IDS
// ================================================================

export const LLMProvider = {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    GOOGLE: 'google',
    DEEPSEEK: 'deepseek',
    GROQ: 'groq',
};

interface ProviderModel {
    id: string;
    name: string;
}

interface ProviderConfigEntry {
    id: string;
    name: string;
    endpoint: string;
    defaultModel: string;
    models: ProviderModel[];
    apiKeyUrl: string;
    apiFormat: string;
    keyPrefix: string;
    keyHint: string;
}

// ================================================================
// PROVIDER CONFIGURATIONS
// ================================================================

export const PROVIDER_CONFIG: Record<string, ProviderConfigEntry> = {
    [LLMProvider.OPENAI]: {
        id: LLMProvider.OPENAI,
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        ],
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        apiFormat: 'openai',
        keyPrefix: 'sk-',
        keyHint: 'sk-...',
    },

    [LLMProvider.CLAUDE]: {
        id: LLMProvider.CLAUDE,
        name: 'Anthropic Claude',
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-sonnet-4-20250514',
        models: [
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
        ],
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        apiFormat: 'claude',
        keyPrefix: 'sk-ant-',
        keyHint: 'sk-ant-...',
    },

    [LLMProvider.GOOGLE]: {
        id: LLMProvider.GOOGLE,
        name: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        defaultModel: 'gemini-3.1-pro-preview',
        models: [
            { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash-lite-preview-06-17', name: 'Gemini 2.5 Flash Lite' },
        ],
        apiKeyUrl: 'https://aistudio.google.com/apikey',
        apiFormat: 'google',
        keyPrefix: 'AIza',
        keyHint: 'AIza...',
    },

    [LLMProvider.DEEPSEEK]: {
        id: LLMProvider.DEEPSEEK,
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        defaultModel: 'deepseek-chat',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
        ],
        apiKeyUrl: 'https://platform.deepseek.com/api_keys',
        apiFormat: 'openai',
        keyPrefix: 'sk-',
        keyHint: 'sk-...',
    },

    [LLMProvider.GROQ]: {
        id: LLMProvider.GROQ,
        name: 'Groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
        ],
        apiKeyUrl: 'https://console.groq.com/keys',
        apiFormat: 'openai',
        keyPrefix: 'gsk_',
        keyHint: 'gsk_...',
    },
};

// ================================================================
// HELPERS
// ================================================================

/**
 * Get provider config by ID.
 * Retorna a configuracao de um provedor pelo seu ID.
 *
 * @param providerId - Provider identifier
 * @returns Configuracao tipada do provedor, ou null se desconhecido.
 *          NUNCA retornar `object` (anula o TypeScript e forca casts no
 *          chamador): tipamos com a forma real do PROVIDER_CONFIG.
 */
export function getProviderConfig(providerId: string): ProviderConfigEntry | null {
    return PROVIDER_CONFIG[providerId] || null;
}

/**
 * Get all provider IDs.
 * Retorna lista de todos os provedores disponiveis.
 *
 * @returns
 */
export function getAllProviderIds(): string[] {
    return Object.keys(PROVIDER_CONFIG);
}

/**
 * Get models for a provider.
 * Retorna a lista de modelos disponiveis para um provedor.
 *
 * @param providerId - Provider identifier
 * @returns
 */
export function getProviderModels(providerId: string): Array<{ id: string; name: string }> {
    const config = PROVIDER_CONFIG[providerId];
    return config ? config.models : [];
}

/**
 * Get default model for a provider.
 * Retorna o modelo padrao de um provedor.
 *
 * @param providerId - Provider identifier
 * @returns
 */
export function getDefaultModel(providerId: string): string {
    const config = PROVIDER_CONFIG[providerId];
    return config ? config.defaultModel : 'gpt-4o';
}

/**
 * Detect provider from API key format.
 * Detecta o provedor baseado no formato da chave de API.
 *
 * @param key - The API key
 * @returns Provider ID
 */
export function detectProviderFromKey(key: string): string {
    if (!key) return LLMProvider.OPENAI;
    if (key.startsWith('sk-ant-')) return LLMProvider.CLAUDE;
    if (key.startsWith('AIza')) return LLMProvider.GOOGLE;
    if (key.startsWith('gsk_')) return LLMProvider.GROQ;
    // DeepSeek and OpenAI both use sk- prefix, default to OpenAI
    return LLMProvider.OPENAI;
}

/**
 * Get API key URL for a provider.
 * Retorna o link para obter a chave de API de um provedor.
 *
 * @param providerId - Provider identifier
 * @returns
 */
export function getApiKeyUrl(providerId: string): string {
    const config = PROVIDER_CONFIG[providerId];
    return config ? config.apiKeyUrl : '';
}

/**
 * Update the model list for a provider at runtime.
 * Atualiza a lista de modelos de um provedor em tempo de execucao.
 *
 * @param providerId
 * @param models
 * @returns
 */
export function setProviderModels(providerId: string, models: Array<{ id: string; name: string }>): void {
    const config = PROVIDER_CONFIG[providerId];
    if (config && models.length > 0) {
        // Clonar entradas para evitar mutacao externa do array compartilhado.
        config.models = models.map((m) => ({ ...m }));
    }
}

// ================================================================
// DYNAMIC MODEL FETCHING
// Busca modelos disponiveis diretamente da API do provedor
// ================================================================

/**
 * Fetch available models from a provider's API.
 * Busca a lista de modelos disponiveis direto da API do provedor.
 * Cada provedor tem um endpoint e formato diferente.
 *
 * @param providerId - Provider identifier
 * @param apiKey - API key for authentication
 * @returns List of models
 */
export async function fetchProviderModels(
    providerId: string,
    apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
    if (!apiKey) throw new Error('API key required');

    switch (providerId) {
        case LLMProvider.OPENAI:
            return await fetchOpenAIModels(apiKey, 'https://api.openai.com/v1/models');
        case LLMProvider.CLAUDE:
            return await fetchClaudeModels(apiKey);
        case LLMProvider.GOOGLE:
            return await fetchGoogleModels(apiKey);
        case LLMProvider.DEEPSEEK:
            return await fetchOpenAIModels(apiKey, 'https://api.deepseek.com/v1/models');
        case LLMProvider.GROQ:
            return await fetchOpenAIModels(apiKey, 'https://api.groq.com/openai/v1/models');
        default:
            return [];
    }
}

/**
 * Fetch models from OpenAI-compatible API (OpenAI, DeepSeek, Groq).
 * @param apiKey
 * @param endpoint - Base models endpoint
 * @returns
 */
async function fetchOpenAIModels(
    apiKey: string,
    endpoint: string,
): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        const err: any = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const models = (data.data || [])
        .filter((m: { id: string }) => {
            const id = m.id.toLowerCase();
            // Filter for chat-capable models, skip embeddings/tts/whisper/dall-e/moderation
            if (
                id.includes('embed') ||
                id.includes('tts') ||
                id.includes('whisper') ||
                id.includes('dall-e') ||
                id.includes('moderation') ||
                id.includes('realtime') ||
                id.includes('transcri') ||
                id.includes('audio')
            ) {
                return false;
            }
            return true;
        })
        .map((m: { id: string }) => ({
            id: m.id,
            name: formatModelName(m.id),
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return models;
}

/**
 * Fetch models from Anthropic Claude API.
 * @param apiKey
 * @returns
 */
async function fetchClaudeModels(apiKey: string): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
    });

    if (!response.ok) {
        const err: any = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const models = (data.data || [])
        .map((m: { id: string }) => ({
            id: m.id,
            name: formatModelName(m.id),
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return models;
}

/**
 * Fetch models from Google Gemini API.
 * @param apiKey
 * @returns
 */
async function fetchGoogleModels(apiKey: string): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
        const err: any = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const models = (data.models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) => {
            // Only models that support generateContent
            const methods = m.supportedGenerationMethods || [];
            return methods.includes('generateContent');
        })
        .map((m: { name: string; displayName?: string }) => {
            // Google model names are "models/gemini-2.5-flash", strip prefix
            const id = m.name.replace('models/', '');
            return {
                id,
                name: m.displayName || formatModelName(id),
            };
        })
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return models;
}

/**
 * Format a model ID into a readable name.
 * Formata o ID do modelo em um nome legivel.
 *
 * @param modelId
 * @returns
 */
function formatModelName(modelId: string): string {
    return modelId
        .replace(/^models\//, '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
