// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only

export interface TtsOptions {
    lang?: string | undefined;
    voice?: string | undefined;
    rate?: number | undefined;
    pitch?: number | undefined;
    volume?: number | undefined;
}

export interface TtsHandle {
    stop: () => void;
    finished: Promise<void>;
}

export interface PlayOptions {
    volume?: number | undefined;
    startOffset?: number | undefined;
}

export interface StepAudio {
    type: string;
    text?: string;
    lang?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    buffer?: AudioBuffer;
}

export interface StepLike {
    audio?: StepAudio | null;
}

let _audioCtx: AudioContext | null = null;

function _getCtx(): AudioContext | null {
    if (_audioCtx) return _audioCtx;
    try {
        const w = (window as unknown) as Window;
        const Ctx = (w as any).AudioContext || (w as any).webkitAudioContext;
        if (Ctx) _audioCtx = new Ctx();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.debug('[presentation-audio] AudioContext-init:', msg);
        _audioCtx = null;
    }
    return _audioCtx;
}

/**
 * Check if Web Speech API is available.
 */
export function isTtsAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

/**
 * List available TTS voices for a given language.
 */
export function listTtsVoices(lang: string = 'pt-BR'): SpeechSynthesisVoice[] {
    if (!isTtsAvailable()) return [];
    const all = window.speechSynthesis.getVoices() || [];
    return all.filter((v: SpeechSynthesisVoice) => v.lang?.startsWith(lang.slice(0, 2)));
}

/**
 * Speak text via Web Speech API. Returns Promise that resolves when finished.
 */
export function speakTts(text: string, options: TtsOptions = {}): TtsHandle {
    if (!isTtsAvailable() || !text) {
        return { stop: () => {}, finished: Promise.resolve() };
    }
    const utter = new window.SpeechSynthesisUtterance(String(text));
    utter.lang = options.lang || 'pt-BR';
    utter.rate = Math.max(0.5, Math.min(2, options.rate ?? 1.0));
    utter.pitch = Math.max(0, Math.min(2, options.pitch ?? 1.0));
    utter.volume = Math.max(0, Math.min(1, options.volume ?? 1.0));

    if (options.voice) {
        const voices = window.speechSynthesis.getVoices?.() || [];
        const match = voices.find((v: SpeechSynthesisVoice) => v.name === options.voice);
        if (match) utter.voice = match;
    }

    let finished: () => void = () => {};
    const finishedPromise = new Promise<void>((resolve) => {
        finished = resolve;
    });
    utter.onend = () => finished();
    utter.onerror = () => finished();

    try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    } catch (e) {
        console.warn('[audio] tts speak error', e);
        finished();
    }

    return {
        stop: () => {
            try {
                window.speechSynthesis.cancel();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.debug('[presentation-audio] speechSynthesis-cancel:', msg);
                /* ignore */
            }
            finished();
        },
        finished: finishedPromise,
    };
}

/**
 * Decode audio file (mp3/ogg/wav) to AudioBuffer via Web Audio API.
 */
export function loadAudioFile(file: File | Blob): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
        const ctx = _getCtx();
        if (!ctx) {
            reject(new Error('AudioContext not available'));
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
                resolve(buffer);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Play a decoded AudioBuffer. Returns control object.
 */
export function playBuffer(buffer: AudioBuffer, options: PlayOptions = {}): { stop: () => void; source?: AudioBufferSourceNode } {
    const ctx = _getCtx();
    if (!ctx || !buffer) return { stop: () => {} };
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, options.volume ?? 0.8));

    source.connect(gain);
    gain.connect(ctx.destination);

    try {
        source.start(0, options.startOffset || 0);
    } catch (e) {
        console.warn('[audio] play start failed', e);
    }

    return {
        stop: () => {
            try {
                source.stop();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.debug('[presentation-audio] source-stop:', msg);
                /* ignore */
            }
        },
        source,
    };
}

/**
 * Play step audio based on its type. Used by player.js via injection (no circular dep).
 */
export function playStepAudio(step: StepLike): { stop: () => void } {
    if (!step?.audio || step.audio.type === 'none') return { stop: () => {} };

    if (step.audio.type === 'tts') {
        const handle = speakTts(step.audio.text ?? '', {
            lang: step.audio.lang,
            voice: step.audio.voice,
            rate: step.audio.rate,
            pitch: step.audio.pitch,
            volume: step.audio.volume,
        });
        return { stop: handle.stop };
    }

    if (step.audio.type === 'upload' && step.audio.buffer) {
        return playBuffer(step.audio.buffer, { volume: step.audio.volume });
    }

    return { stop: () => {} };
}