// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// F8 AI Voice - síntese de voz via LLM (OpenAI/Gemini/ElevenLabs/etc.).
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §F16 (extensão pós-F6)
//
// Alternativa premium ao Web Speech API (audio.js):
// - OpenAI TTS: gpt-4o-mini-tts (2026) · 6 voices · MP3 output
// - Gemini: não tem TTS público (fallback)
// - ElevenLabs v3: multi-voice + emoção (requer chave própria)
// - Fallback: Web Speech API (speakTts)
//
// Cache: IndexedDB `ecbyts-ai-voice-cache` key=`${provider}:${voice}:${hash(text)}` → Blob.


import { idbGet, idbSet } from '../../utils/storage/idbStore.js';
import { guardBackendFetch, GUEST_API_TOAST_MESSAGE } from '../../main/guestGate.js';

interface ProviderConfig {
    id: string;
    label: string;
    voices: string[];
    defaultVoice: string | null;
    outputMime: string | null;
}

interface SynthesizeOptions {
    provider?: string;
    voice?: string;
    lang?: string;
    useCache?: boolean;
}

interface SynthesizeResult {
    blob: Blob;
    mime: string;
    provider: string;
    cached: boolean;
}

interface PlaybackControl {
    stop: () => void;
    audio?: HTMLAudioElement;
}

interface PlaybackOptions {
    volume?: number;
}

const CACHE_PREFIX = 'ai-voice-cache:';
const ELEVENLABS_DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

export const AI_VOICE_PROVIDERS: Record<string, ProviderConfig> = {
    elevenlabs: {
        id: 'elevenlabs',
        label: 'ElevenLabs TTS (local dev proxy)',
        voices: [ELEVENLABS_DEFAULT_VOICE],
        defaultVoice: ELEVENLABS_DEFAULT_VOICE,
        outputMime: 'audio/mpeg',
    },
    openai: {
        id: 'openai',
        label: 'OpenAI TTS',
        voices: ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'],
        defaultVoice: 'nova',
        outputMime: 'audio/mpeg',
    },
    webSpeech: {
        id: 'webSpeech',
        label: 'Web Speech (browser nativo)',
        voices: [], // populated by speechSynthesis.getVoices()
        defaultVoice: null,
        outputMime: null, // no blob, direct playback
    },
};

export function listProviders(): ProviderConfig[] {
    return Object.values(AI_VOICE_PROVIDERS);
}

import { fnv1aHash as _fnv1aHash } from '../../utils/helpers/hashFnv1a.js';
function hashText(text: string): string {
    return _fnv1aHash(text).toString(16);
}

/**
 * Synthesize voice via AI provider.
 *
 * @param {string} text
 * @param {object} options
 * @param {string} [options.provider='openai']
 * @param {string} [options.voice]
 * @param {string} [options.lang='pt-BR']
 * @param {boolean} [options.useCache=true]
 * @returns {Promise<{blob: Blob, mime: string, provider: string, cached: boolean}>}
 */
export async function synthesize(text: string, options: SynthesizeOptions = {}): Promise<SynthesizeResult> {
    const { provider = 'openai', voice, lang = 'pt-BR', useCache = true } = options;
    if (!text || !text.trim()) {
        throw new Error('Text required');
    }

    const providerConfig = (AI_VOICE_PROVIDERS as Record<string, ProviderConfig>)[provider];
    if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);

    const effectiveVoice = voice || providerConfig.defaultVoice;
    const cacheKey = `${CACHE_PREFIX}${provider}:${effectiveVoice}:${lang}:${hashText(text)}`;

    // Try cache first
    if (useCache) {
        try {
            const cached = await idbGet(cacheKey);
            if (cached && cached instanceof Blob) {
                return { blob: cached, mime: cached.type, provider, cached: true };
            }
        } catch (e) {
            console.debug('[ai-voice] cache lookup miss:', (e as any)?.message || e);
        }
    }

    // Dispatch by provider
    let blob: Blob;
    if (provider === 'elevenlabs') {
        blob = await _synthesizeElevenLabs(text, effectiveVoice!, lang);
    } else if (provider === 'openai') {
        blob = await _synthesizeOpenAI(text, effectiveVoice!, lang);
    } else if (provider === 'webSpeech') {
        throw new Error('Web Speech is playback-only; use audio.js speakTts() instead');
    } else {
        throw new Error(`Provider not implemented: ${provider}`);
    }

    // Cache result
    if (useCache && blob) {
        try {
            await idbSet(cacheKey, blob);
        } catch (e) {
            console.debug('[ai-voice] cache write failed', (e as any)?.message || e);
        }
    }

    return { blob, mime: blob.type || 'audio/mpeg', provider, cached: false };
}

/**
 * OpenAI TTS via sendMessage (reuse llm/client.js for key management).
 */
async function _synthesizeOpenAI(text: string, voice: string, _lang: string): Promise<Blob> {
    const { getApiKey, getProvider, hasApiKey } = await import('../llm/client.js');
    if (!hasApiKey()) throw new Error('LLM API key not configured');
    const key = getApiKey();
    const currentProvider = getProvider();

    if (currentProvider !== 'openai') {
        throw new Error(`AI Voice OpenAI requires provider=openai (current: ${currentProvider})`);
    }

    // Direct fetch to OpenAI audio/speech (not covered by generic sendMessage)
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice,
            input: text.slice(0, 4000), // OpenAI 4096 char limit
            response_format: 'mp3',
        }),
    });

    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`OpenAI TTS ${resp.status}: ${err.slice(0, 200)}`);
    }
    return await resp.blob();
}

/**
 * ElevenLabs TTS via local dev proxy so the browser never sees ELEVEN_LABS_API_KEY.
 * Works only when ecbyts is running through the local api-server.
 */
async function _synthesizeElevenLabs(text: string, voice: string, lang: string): Promise<Blob> {
    if (typeof window === 'undefined') {
        throw new Error('ElevenLabs local proxy requires browser runtime');
    }

    const hostname = window.location.hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
        throw new Error('ElevenLabs local proxy is available only on localhost/dev');
    }
    // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A11): módulo de ação — toast + abort.
    if (!guardBackendFetch('presentation:tts-elevenlabs', 'action')) {
        throw new Error(GUEST_API_TOAST_MESSAGE);
    }

    const resp = await fetch('/api/dev/tts/elevenlabs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text.slice(0, 5000),
            voice: voice || ELEVENLABS_DEFAULT_VOICE,
            lang,
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`ElevenLabs TTS ${resp.status}: ${errText.slice(0, 200)}`);
    }
    return await resp.blob();
}

/**
 * Play synthesized voice (returns control with stop()).
 *
 * @param {Blob} blob
 * @param {{volume?: number}} [options]
 * @returns {{stop: Function, audio?: HTMLAudioElement}}
 */
export function playSynthesized(blob: Blob, options: PlaybackOptions = {}): PlaybackControl {
    if (!blob) return { stop: () => {} };
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, options.volume ?? 0.9));

    audio.play().catch((e: any) => console.debug('[ai-voice] play failed', e?.message));

    const cleanup = () => {
        try {
            URL.revokeObjectURL(url);
        } catch (e) {
            console.debug('[ai-voice] revokeObjectURL:', (e as any)?.message || e);
        }
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;

    return {
        stop: () => {
            try {
                audio.pause();
                audio.currentTime = 0;
                cleanup();
            } catch (e) {
                console.debug('[ai-voice] stop:', (e as any)?.message || e);
            }
        },
        audio,
    };
}

/**
 * Check if provider is available (has API key + correct provider configured).
 */
export async function isProviderAvailable(provider: string): Promise<boolean> {
    if (provider === 'webSpeech') {
        return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
    }
    if (provider === 'elevenlabs') {
        if (typeof window === 'undefined') return false;
        const hostname = window.location.hostname;
        if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return false;
        // ECBYTS-OPEN-LOCAL-001 F1: probe de disponibilidade — skip silencioso
        // em Modo Convidado (provider é reportado como indisponível, sem toast).
        if (!guardBackendFetch('presentation:tts-config', 'boot')) return false;
        try {
            const resp = await fetch('/api/dev/tts-config', { signal: AbortSignal.timeout(2500) });
            if (!resp.ok) return false;
            const payload = await resp.json();
            return payload?.success === true && payload?.data?.elevenlabs?.enabled === true;
        } catch {
            return false;
        }
    }
    try {
        const { hasApiKey, getProvider } = await import('../llm/client.js');
        if (!hasApiKey()) return false;
        if (provider === 'openai' && getProvider() !== 'openai') return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear voice cache (IDB).
 */
export async function clearCache(): Promise<void> {
    // No bulk delete API in our idbStore; caller should iterate keys if needed
    console.debug('[ai-voice] clearCache — bulk delete not implemented, clear via browser devtools');
}
