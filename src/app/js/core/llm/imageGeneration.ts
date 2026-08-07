// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   IMAGE GENERATION — Nano Banana (Gemini) + DALL-E 3 (OpenAI)
   ================================================================

   Gera imagens via APIs ja cadastradas no sistema.
   Nano Banana (Gemini) suporta text-to-image e image-to-image.
   DALL-E 3 (OpenAI) suporta apenas text-to-image.

   MODELOS:
   - google:  gemini-3.1-flash-image-preview  (Nano Banana 2)
   - openai:  dall-e-3

   ================================================================ */

import { getApiKey, getProvider } from './client.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const IMAGE_MODELS = {
    google: [
        'gemini-3.1-flash-image-preview', // Nano Banana 2 (primary)
        'gemini-2.5-flash-preview-image-generation', // fallback
    ],
    openai: ['dall-e-3'],
};

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Gera imagem via Nano Banana (Gemini) ou DALL-E 3 (OpenAI).
 * Usa o provider e API key ja configurados no sistema.
 *
 * @param {string} prompt - Texto descrevendo a imagem desejada
 * @param {Object} [options]
 * @param {string} [options.referenceImage] - data:image/...;base64,... para img2img (so Gemini)
 * @param {AbortSignal} [options.signal] - AbortController signal para cancelamento
 * @returns {Promise<{image: string, text: string, provider: string}>}
 *   image = data:image/png;base64,...
 *   text = descricao textual (Gemini retorna junto com a imagem)
 * @throws {Error} NO_API_KEY | UNSUPPORTED_PROVIDER | NO_IMAGE_IN_RESPONSE | API errors
 */
export async function generateImage(prompt: string, options: { referenceImage?: string; signal?: AbortSignal } = {}) {
    const provider = getProvider();
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    switch (provider) {
        case 'google':
            return _generateGemini(prompt, apiKey, options);
        case 'openai':
            return _generateDallE(prompt, apiKey, options);
        default:
            throw new Error('UNSUPPORTED_PROVIDER');
    }
}

/**
 * Retorna IDs dos providers que suportam geracao de imagem.
 * @returns {string[]}
 */
export function getImageCapableProviders() {
    return Object.keys(IMAGE_MODELS);
}

/**
 * Verifica se o provider ativo suporta geracao de imagem.
 * @returns {boolean}
 */
export function isImageGenerationAvailable() {
    return getProvider() in IMAGE_MODELS;
}

// ----------------------------------------------------------------
// GEMINI (Nano Banana)
// ----------------------------------------------------------------

/**
 * Gera imagem via Gemini generateContent com responseModalities IMAGE.
 * Suporta img2img quando referenceImage fornecida.
 */
async function _generateGemini(prompt: string, apiKey: string, options: { referenceImage?: string; signal?: AbortSignal }) {
    const models = IMAGE_MODELS.google;
    let lastError: unknown = null;

    for (const model of models) {
        try {
            return await _callGeminiModel(model, prompt, apiKey, options);
        } catch (err) {
            lastError = err;
            console.warn(`[imageGeneration] ${model} failed, trying next:`, (err as Error)?.message);
        }
    }

    throw lastError || new Error('All Gemini image models failed');
}

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

/**
 * Parseia uma data URL de referencia para img2img.
 * @returns {{ mimeType: string; base64Data: string }}
 * @throws {Error} Invalid referenceImage
 */
function _parseReferenceImage(referenceImage: string): { mimeType: string; base64Data: string } {
    const commaIdx = referenceImage.indexOf(',');
    if (commaIdx === -1) throw new Error('Invalid referenceImage: not a data URL');

    const header = referenceImage.slice(0, commaIdx);
    const base64Data = referenceImage.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:(.*?);/);
    const mimeType = (mimeMatch && mimeMatch[1]) || 'image/png';

    return { mimeType, base64Data };
}

/**
 * Extrai imagem e texto dos parts retornados pelo Gemini.
 * @throws {Error} NO_IMAGE_IN_RESPONSE
 */
function _extractGeminiOutput(parts: GeminiPart[]): { image: string; text: string } {
    let image = '';
    let text = '';

    for (const p of parts) {
        if (p.inlineData && !image) {
            image = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        }
        if (p.text) {
            text += (text ? '\n' : '') + p.text;
        }
    }

    if (!image) throw new Error('NO_IMAGE_IN_RESPONSE');
    return { image, text };
}

/**
 * Chamada individual para um modelo Gemini image.
 */
async function _callGeminiModel(
    model: string,
    prompt: string,
    apiKey: string,
    options: { referenceImage?: string; signal?: AbortSignal },
) {
    const url = `${GEMINI_ENDPOINT}/${model}:generateContent`;

    const parts: GeminiPart[] = [{ text: prompt }];

    // img2img: envia imagem de referencia junto com o prompt
    if (options.referenceImage) {
        const { mimeType, base64Data } = _parseReferenceImage(options.referenceImage);
        parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                temperature: 0.8,
            },
        }),
        signal: options.signal || null,
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as { error?: { message?: string } }));
        throw new Error(err.error?.message || `Gemini error: ${resp.status}`);
    }

    const data = await resp.json();
    const resParts: GeminiPart[] = data.candidates?.[0]?.content?.parts || [];
    const { image, text } = _extractGeminiOutput(resParts);

    return { image, text, provider: 'google' };
}

// ----------------------------------------------------------------
// OPENAI (DALL-E 3)
// ----------------------------------------------------------------

/**
 * Gera imagem via OpenAI Images API.
 * Somente text-to-image (referenceImage ignorada).
 */
async function _generateDallE(prompt: string, apiKey: string, options: { signal?: AbortSignal }) {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
        }),
        signal: options.signal || null,
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as { error?: { message?: string } }));
        throw new Error(err.error?.message || `DALL-E error: ${resp.status}`);
    }

    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('NO_IMAGE_IN_RESPONSE');

    return {
        image: `data:image/png;base64,${b64}`,
        text: data.data?.[0]?.revised_prompt || '',
        provider: 'openai',
    };
}
