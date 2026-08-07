// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   VIDEO GENERATOR — Chamadas reais às APIs de geração de vídeo IA
   Suporta Google Veo 3 e Runway Gen-3 Alpha Turbo.

   Pipeline: prompt + frame de referência → API assíncrona → poll
             → blob MP4 → download

   NÃO depende de client.js (que é para chat LLM).
   Cada provider tem sua própria lógica de autenticação e polling.
   ================================================================ */

const VEO3_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning';
const VEO3_POLL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const RUNWAY_ENDPOINT = 'https://api.runwayml.com/v1/image_to_video';
const RUNWAY_POLL_BASE = 'https://api.runwayml.com/v1/tasks';
const RUNWAY_VERSION = '2024-11-06';

const POLL_INTERVAL_MS = 5_000; // 5s entre cada verificação
const POLL_TIMEOUT_MS = 300_000; // 5 minutos máximo

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Despacha a geração de vídeo para o provider configurado.
 * Retorna um Blob MP4 pronto para download.
 *
 * @param prompt - Prompt ambiental construído pelo videoBot
 * @param frames  - Array de { image: dataURL, ... } (primeiro frame usado como referência)
 * @param options
 */
export async function generateVideo(
    prompt: string,
    frames: Array<{ image?: string }>,
    options: { videoProvider?: string; videoKey?: string; durationSec?: number; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; ext: string; provider: string }> {
    const provider = options.videoProvider || 'veo3';
    const signal = options.signal || null;
    const refFrame = frames[0]?.image || null;
    const durationSec = Math.min(8, Math.max(5, options.durationSec || 8));

    if (provider === 'runway') {
        const runwayKey = options.videoKey || sessionStorage.getItem('ecbyts_video_key');
        if (!runwayKey) {
            throw new Error('Runway key não configurada. Insira sua key no campo "Runway Key" do painel.');
        }
        const blob = await callRunway(prompt, refFrame, { durationSec }, runwayKey, signal);
        return { blob, ext: 'mp4', provider: 'runway' };
    }

    // Default: Google Veo 3
    const geminiKey = sessionStorage.getItem('ecbyts_llm_key') || '';
    if (!geminiKey) {
        throw new Error('Google API key não configurada. Acesse AI Assistant > Configurações.');
    }
    const blob = await callVeo3(prompt, refFrame, { durationSec }, geminiKey, signal);
    return { blob, ext: 'mp4', provider: 'veo3' };
}

// ----------------------------------------------------------------
// GOOGLE VEO 3
// ----------------------------------------------------------------

/**
 * Envia prompt + frame de referência para o Veo 3 e aguarda o vídeo.
 * Usa long-running operation com polling.
 *
 * @param prompt
 * @param referenceFrame - Base64 data URL do primeiro frame
 * @param config
 * @param apiKey - Google AI API key (mesma do Gemini)
 * @param signal
 * @returns Blob video/mp4
 */
async function callVeo3(
    prompt: string,
    referenceFrame: string | null,
    config: { durationSec?: number },
    apiKey: string,
    signal: AbortSignal | null,
): Promise<Blob> {
    const instance = { prompt };

    const body = {
        instances: [instance],
        parameters: {
            durationSeconds: config.durationSec || 8,
            aspectRatio: '16:9',
            sampleCount: 1,
            resolution: '720p',
            personGeneration: 'allow_all',
            enhancePrompt: true,
        },
    };

    const startRes = await _fetchVideo(
        VEO3_ENDPOINT,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        },
        signal,
        'Veo 3',
        {
            400: 'Veo 3 rejeitou a requisicao. Verifique acesso ao modelo e formato do payload enviado.',
            403: 'Acesso ao Veo 3 negado. Ative em: aistudio.google.com/app/apikey (precisa de acesso especial ao modelo).',
            429: 'Limite de requisicoes Veo 3. Aguarde alguns minutos e tente novamente.',
        },
    );

    const startData: any = await startRes.json();
    const operationName = startData.name;
    if (!operationName) {
        throw new Error(`Veo 3: resposta inesperada ao iniciar - ${JSON.stringify(startData).slice(0, 200)}`);
    }

    const result = await pollOperation(
        async () => {
            const pollRes = await _fetchVideo(
                `${VEO3_POLL_BASE}/${operationName}`,
                {
                    method: 'GET',
                    headers: { 'x-goog-api-key': apiKey },
                },
                signal,
                'Veo 3 poll',
                {},
            );
            return await pollRes.json();
        },
        (data) => !!data.done,
        signal,
    );

    if (result.error) {
        throw new Error(`Veo 3 falhou: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const generatedVideos =
        result.response?.generatedVideos ||
        result.response?.generateVideoResponse?.generatedSamples ||
        result.response?.generatedVideoResponse?.generatedSamples ||
        [];
    const generatedVideo = generatedVideos[0];

    if (generatedVideo?.video?.videoBytes) {
        return _base64ToBlob(generatedVideo.video.videoBytes, generatedVideo.video.mimeType || 'video/mp4');
    }

    if (generatedVideo?.video?.uri) {
        const videoRes = await fetch(generatedVideo.video.uri, {
            signal,
            headers: { 'x-goog-api-key': apiKey },
        });
        if (!videoRes.ok) throw new Error(`Erro ao baixar video Veo 3: ${videoRes.status}`);
        return await videoRes.blob();
    }

    const candidates = result.response?.candidates || [];
    const videoPart = candidates[0]?.content?.parts?.find(
        (p: { inlineData?: any; fileData?: any }) => p.inlineData || p.fileData,
    );

    if (videoPart?.inlineData) {
        return _base64ToBlob(videoPart.inlineData.data, videoPart.inlineData.mimeType || 'video/mp4');
    }

    if (videoPart?.fileData?.fileUri) {
        const videoRes = await fetch(videoPart.fileData.fileUri, { signal });
        if (!videoRes.ok) throw new Error(`Erro ao baixar video Veo 3: ${videoRes.status}`);
        return await videoRes.blob();
    }

    throw new Error('Veo 3: nenhum video no resultado. Resposta: ' + JSON.stringify(result).slice(0, 300));
}

// ----------------------------------------------------------------
// RUNWAY GEN-3 ALPHA TURBO
// ----------------------------------------------------------------

/**
 * Envia frame de referência + prompt para o Runway e aguarda o vídeo.
 *
 * @param prompt
 * @param referenceFrame - Base64 data URL do primeiro frame
 * @param config
 * @param apiKey - Runway API key
 * @param signal
 * @returns Blob video/mp4
 */
async function callRunway(
    prompt: string,
    referenceFrame: string | null,
    config: { durationSec?: number },
    apiKey: string,
    signal: AbortSignal | null,
): Promise<Blob> {
    const body: {
        model: string;
        promptText: string;
        duration: number;
        ratio: string;
        seed: number;
        promptImage?: string;
    } = {
        model: 'gen3a_turbo',
        promptText: prompt,
        duration: Math.min(10, Math.max(5, config.durationSec || 8)),
        ratio: '1280:768',
        seed: Math.floor(Math.random() * 4_294_967_295),
    };

    // Runway aceita imagem de referência
    if (referenceFrame) {
        body.promptImage = referenceFrame; // aceita data URL diretamente
    }

    const startRes = await _fetchVideo(
        RUNWAY_ENDPOINT,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'X-Runway-Version': RUNWAY_VERSION,
            },
            body: JSON.stringify(body),
        },
        signal,
        'Runway',
        {
            401: 'Runway key inválida. Verifique em: app.runwayml.com/settings/api-keys',
            402: 'Créditos Runway insuficientes. Recarregue sua conta.',
            429: 'Limite de requisições Runway. Aguarde e tente novamente.',
        },
    );

    const { id: taskId } = await startRes.json();
    if (!taskId) throw new Error('Runway: não retornou task ID.');

    // Polling
    const result = await pollOperation(
        async () => {
            const pollRes = await _fetchVideo(
                `${RUNWAY_POLL_BASE}/${taskId}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'X-Runway-Version': RUNWAY_VERSION,
                    },
                },
                signal,
                'Runway poll',
                {},
            );
            return await pollRes.json();
        },
        (data) => data.status === 'SUCCEEDED' || data.status === 'FAILED',
        signal,
    );

    if (result.status === 'FAILED') {
        throw new Error(`Runway falhou: ${result.failure || result.failureCode || 'erro desconhecido'}`);
    }

    const videoUrl = result.output?.[0];
    if (!videoUrl) throw new Error('Runway: nenhuma URL de vídeo no resultado.');

    // Download do vídeo a partir da URL
    const videoRes = await fetch(videoUrl, { signal });
    if (!videoRes.ok) throw new Error(`Erro ao baixar vídeo Runway: ${videoRes.status}`);
    return await videoRes.blob();
}

// ----------------------------------------------------------------
// POLLING HELPER
// ----------------------------------------------------------------

/**
 * Executa polling genérico até que `isDone(data)` retorne true.
 * Respeita AbortSignal e timeout global de 5 minutos.
 *
 * @param checkFn  - async () => data - executa cada verificação
 * @param isDone   - (data) => boolean - retorna true quando pronto
 * @param signal
 * @returns Último valor retornado por checkFn quando isDone = true
 */
async function pollOperation(
    checkFn: () => Promise<any>,
    isDone: (data: any) => boolean,
    signal: AbortSignal | null,
): Promise<any> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (true) {
        if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
        if (Date.now() >= deadline) {
            throw new Error('Geração ultrapassou 5 minutos. Tente um clipe mais curto ou tente mais tarde.');
        }

        const data = await checkFn();

        if (isDone(data)) return data;

        // Aguarda o intervalo antes da próxima verificação
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, POLL_INTERVAL_MS);
            signal?.addEventListener(
                'abort',
                () => {
                    clearTimeout(timer);
                    reject(new DOMException('Cancelado', 'AbortError'));
                },
                { once: true },
            );
        });
    }
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Fetch com mapeamento de erros HTTP para mensagens amigáveis.
 * @param url
 * @param fetchOptions
 * @param signal
 * @param providerLabel - Label para mensagens de erro
 * @param errorMessages - Mapa { statusCode: mensagem }
 */
async function _fetchVideo(
    url: string,
    fetchOptions: RequestInit,
    signal: AbortSignal | null,
    providerLabel: string,
    errorMessages: Record<number, string>,
): Promise<Response> {
    const res = await fetch(url, { ...fetchOptions, signal });

    if (!res.ok) {
        const customMsg = errorMessages[res.status];
        if (customMsg) throw new Error(customMsg);

        let detail = '';
        try {
            const body: any = await res.json();
            detail = body.error?.message || body.message || JSON.stringify(body).slice(0, 200);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.debug('[videoGenerator] resJson:', msg);
            /* ignore */
        }

        throw new Error(`${providerLabel} erro ${res.status}: ${detail || res.statusText}`);
    }

    return res;
}

/**
 * Converte string base64 em Blob.
 * @param base64 - Dados em base64 (sem prefixo data:...)
 * @param mimeType
 */
function _base64ToBlob(base64: string, mimeType: string): Blob {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}
