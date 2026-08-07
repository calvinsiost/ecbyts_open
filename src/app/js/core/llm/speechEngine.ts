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
   SPEECH ENGINE — STT/TTS via Transformers.js v4
   ================================================================

   Camada de I/O de voz para o chat IA. Funciona com qualquer engine
   ativa (cloud, browser, local, web-llm) — nao e uma engine, e sim
   entrada (microfone → texto) e saida (texto → audio).

   STT: Whisper (OpenAI) via pipeline('automatic-speech-recognition')
   TTS: SpeechT5 (Microsoft) via pipeline('text-to-speech')
        Fallback: Web Speech API nativa (speechSynthesis)

   Reutiliza o mesmo CDN de Transformers.js v4 do browserEngine.js.
   Modelos cacheados pelo Cache API do browser — download unico.

   ================================================================ */

import { importCDN } from '../../utils/helpers/cdnLoader.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { getApiKey, getProvider } from './client.js';
import { LLMProvider, PROVIDER_CONFIG } from './providers.js';

/**
 * @typedef {(data: {status: string, message: string, progress: number}) => void} SpeechProgressCallback
 * @typedef {{language?: string, provider?: string, apiKey?: string, model?: string, lang?: string, timeoutMs?: number, onProgress?: SpeechProgressCallback}} SpeechOptions
 */

const log = createLogger('Speech');

// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0';

const SPEAKER_EMBEDDINGS_URL =
    'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

/**
 * Available STT models with metadata.
 * Modelos de reconhecimento de voz, ordenados por tamanho.
 */
const STT_MODELS = [
    {
        id: 'onnx-community/whisper-small',
        name: 'Whisper Small',
        sizeLabel: '~244MB',
        vramGB: 0.5,
        dtype: 'q4',
        tier: 'default',
        nameKey: 'sttModelWhisperSmall',
    },
    {
        id: 'onnx-community/whisper-tiny',
        name: 'Whisper Tiny',
        sizeLabel: '~39MB',
        vramGB: 0.1,
        dtype: 'q4',
        tier: 'fallback',
        nameKey: 'sttModelWhisperTiny',
    },
];

/**
 * Available TTS models with metadata.
 * Modelos de sintese de voz.
 */
const TTS_MODELS = [
    {
        id: 'Xenova/speecht5_tts',
        name: 'SpeechT5',
        vocoder: 'Xenova/speecht5_hifigan',
        sizeLabel: '~100MB',
        nameKey: 'ttsModelSpeechT5',
    },
];

// ----------------------------------------------------------------
// STORAGE KEYS
// Configuracoes de voz em localStorage (persistem entre sessoes)
// ----------------------------------------------------------------

const STORAGE_KEYS = {
    STT_ENABLED: 'ecbyts_speech_stt_enabled',
    TTS_ENABLED: 'ecbyts_speech_tts_enabled',
    STT_MODEL: 'ecbyts_speech_stt_model',
};

// ----------------------------------------------------------------
// SINGLETON STATE
// Pipelines e recursos carregados uma unica vez
// ----------------------------------------------------------------

/** @type {any} */
let _transformers: any = null;
/** @type {any} */
let _sttPipeline: any = null;
/** @type {any} */
let _ttsPipeline: any = null;
let _sttLoading = false;
let _ttsLoading = false;
/** @type {string|null} */
let _sttModelId: any = null;
/** @type {string|null} */
let _ttsModelId: any = null;

// Network retry state
let _networkRetryCount = 0;

// Recording state
/** @type {MediaStream|null} */
let _mediaStream: any = null;
/** @type {MediaRecorder|null} */
let _mediaRecorder: any = null;
let _isRecording = false;
/** @type {Blob[]} */
let _audioChunks: any = [];
/** @type {any} */
let _nativeRecognition: any = null;

// Playback state
/** @type {AudioBufferSourceNode|null} */
let _audioSource: any = null;
/** @type {AudioContext|null} */
let _audioContext: any = null;
let _isPlaying = false;

// TTS cache
/** @type {Float32Array|null} */
let _speakerEmbeddings: any = null;

// ----------------------------------------------------------------
// OOM TRACKING
// Rastreia modelos que falharam por falta de memoria
// ----------------------------------------------------------------

/** @type {Set<string>} */
const _oomFailedModels = new Set();

/** Regex para detectar erros de memoria / out-of-memory do ONNX Runtime */
const _OOM_PATTERN = /bad_alloc|out.of.memory|alloc.*fail|memory.*alloc|ERROR_CODE:\s*6/i;

// ----------------------------------------------------------------
// SETTINGS - getters / setters
// ----------------------------------------------------------------

/**
 * Check if STT is enabled.
 * Verifica se entrada por voz esta habilitada.
 * @returns {boolean}
 */
export function isSTTEnabled() {
    return localStorage.getItem(STORAGE_KEYS.STT_ENABLED) === '1';
}

/**
 * Enable/disable STT.
 * Habilita ou desabilita entrada por voz.
 * @param {boolean} val
 */
export function setSTTEnabled(val: any) {
    localStorage.setItem(STORAGE_KEYS.STT_ENABLED, val ? '1' : '0');
}

/**
 * Check if TTS is enabled.
 * Verifica se saida por voz esta habilitada.
 * @returns {boolean}
 */
export function isTTSEnabled() {
    return localStorage.getItem(STORAGE_KEYS.TTS_ENABLED) === '1';
}

/**
 * Enable/disable TTS.
 * Habilita ou desabilita saida por voz.
 * @param {boolean} val
 */
export function setTTSEnabled(val: any) {
    localStorage.setItem(STORAGE_KEYS.TTS_ENABLED, val ? '1' : '0');
}

/**
 * Get selected STT model ID.
 * Retorna o modelo STT selecionado (default: whisper-small).
 * @returns {string}
 */
export function getSTTModel() {
    return localStorage.getItem(STORAGE_KEYS.STT_MODEL) || STT_MODELS[0]!.id;
}

/**
 * Set STT model ID.
 * Define o modelo STT a ser usado.
 * @param {string} modelId
 */
export function setSTTModel(modelId: any) {
    localStorage.setItem(STORAGE_KEYS.STT_MODEL, modelId);
}

// ----------------------------------------------------------------
// LIBRARY LOADING
// Carrega Transformers.js v4 do CDN sob demanda
// ----------------------------------------------------------------

/**
 * Lazy-load Transformers.js v4 from CDN.
 * Reutiliza o mesmo CDN ja usado pelo browserEngine.
 * @returns {Promise<any>} Modulo transformers
 */
async function ensureTransformers() {
    if (_transformers) return _transformers;
    _transformers = await importCDN(TRANSFORMERS_CDN, { name: 'Transformers.js v4' });
    return _transformers;
}

// ----------------------------------------------------------------
// PIPELINE MANAGEMENT - STT
// ----------------------------------------------------------------

/**
 * Ensure STT pipeline is ready.
 * Cria pipeline de reconhecimento de voz se necessario.
 *
 * @param {string} [modelId] - Override model ID
 * @param {SpeechProgressCallback} [onProgress] - Progress callback
 * @returns {Promise<void>}
 */
async function ensureSTTPipeline(modelId: any, onProgress: any) {
    const targetModel = modelId || getSTTModel();

    if (_sttPipeline && _sttModelId === targetModel) return;
    if (_sttLoading) throw new Error('STT model is already loading. Please wait.');

    _sttLoading = true;

    try {
        const tf = await ensureTransformers();

        // Descarrega pipeline anterior se modelo diferente
        if (_sttPipeline && _sttModelId !== targetModel) {
            await _sttPipeline.dispose?.();
            _sttPipeline = null;
            _sttModelId = null;
        }

        const modelConfig = STT_MODELS.find((m) => m.id === targetModel);
        const dtype = modelConfig?.dtype || 'q4';

        _notify(onProgress, 'loading', `Loading ${targetModel}...`, 0);

        _sttPipeline = await tf.pipeline('automatic-speech-recognition', targetModel, {
            dtype,
            progress_callback: (/** @type {any} */ data: any) => {
                if (data.status === 'progress' && typeof data.progress === 'number') {
                    _notify(
                        onProgress,
                        'downloading',
                        `Downloading STT model... ${Math.round(data.progress)}%`,
                        Math.round(data.progress),
                    );
                } else if (data.status === 'done') {
                    _notify(onProgress, 'downloading', 'Download complete', 100);
                } else if (data.status === 'initiate') {
                    _notify(onProgress, 'downloading', `Loading ${data.file || ''}...`, 0);
                }
            },
        });

        _sttModelId = targetModel;
        _networkRetryCount = 0;
        _notify(onProgress, 'ready', 'STT model ready!', 100);
    } catch (err) {
        const error: any = err;
        _sttPipeline = null;
        _sttModelId = null;

        // OOM fallback: tenta modelo menor
        if (_OOM_PATTERN.test(error.message)) {
            _oomFailedModels.add(targetModel);
            const smaller = _findSmallerSTTModel(targetModel);
            if (smaller) {
                log.warn(`STT model ${targetModel} OOM, falling back to ${smaller}`);
                _notify(onProgress, 'fallback', `Not enough memory. Trying smaller model...`, 0);
                _sttLoading = false;
                return ensureSTTPipeline(smaller, onProgress);
            }
            throw new Error('Not enough memory for any STT model. Try closing other tabs.', { cause: err });
        }

        // Network retry: tenta novamente em caso de falha de rede
        const isNetworkError =
            error.name === 'TypeError' ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('network');

        if (isNetworkError && _networkRetryCount < 2) {
            _networkRetryCount++;
            const delay = _networkRetryCount * 2000;
            log.warn(`STT network retry ${_networkRetryCount}/2 in ${delay}ms`);
            _notify(onProgress, 'retrying', `Network error. Retrying (${_networkRetryCount}/2)...`, 0);
            _sttLoading = false;
            await new Promise((r) => setTimeout(r, delay));
            return ensureSTTPipeline(targetModel, onProgress);
        }

        if (isNetworkError) {
            _networkRetryCount = 0;
            throw new Error('Could not download speech model. Check your internet connection and try again.', {
                cause: err,
            });
        }

        throw new Error(`Failed to load STT model ${targetModel}: ${error.message}`, { cause: err });
    } finally {
        _sttLoading = false;
    }
}

/**
 * Find a smaller STT model as OOM fallback.
 * Busca modelo menor que ainda nao falhou por OOM.
 * @param {string} failedModelId
 * @returns {string|null}
 */
function _findSmallerSTTModel(failedModelId: any) {
    const failed = STT_MODELS.find((m) => m.id === failedModelId);
    const failedVram = failed ? failed.vramGB : Infinity;
    const sorted = [...STT_MODELS].sort((a, b) => a.vramGB - b.vramGB);

    for (const model of sorted) {
        if (model.id === failedModelId) continue;
        if (_oomFailedModels.has(model.id)) continue;
        if (model.vramGB >= failedVram) continue;
        return model.id;
    }
    return null;
}

// ----------------------------------------------------------------
// PIPELINE MANAGEMENT - TTS
// ----------------------------------------------------------------

/**
 * Ensure TTS pipeline is ready.
 * Cria pipeline de sintese de voz com vocoder HiFiGAN.
 *
 * @param {SpeechProgressCallback} [onProgress] - Progress callback
 * @returns {Promise<void>}
 */
async function ensureTTSPipeline(onProgress: any) {
    if (_ttsPipeline) return;
    if (_ttsLoading) throw new Error('TTS model is already loading. Please wait.');

    _ttsLoading = true;

    try {
        const tf = await ensureTransformers();
        const model = TTS_MODELS[0]!;

        _notify(onProgress, 'loading', `Loading ${model.name}...`, 0);

        _ttsPipeline = await tf.pipeline('text-to-speech', model.id, {
            progress_callback: (/** @type {any} */ data: any) => {
                if (data.status === 'progress' && typeof data.progress === 'number') {
                    _notify(
                        onProgress,
                        'downloading',
                        `Downloading TTS model... ${Math.round(data.progress)}%`,
                        Math.round(data.progress),
                    );
                } else if (data.status === 'done') {
                    _notify(onProgress, 'downloading', 'Download complete', 100);
                }
            },
        });

        // Pre-fetch speaker embeddings
        if (!_speakerEmbeddings) {
            try {
                const resp = await fetch(SPEAKER_EMBEDDINGS_URL);
                const buf = await resp.arrayBuffer();
                _speakerEmbeddings = new Float32Array(buf);
            } catch (e) {
                console.debug('[speechEngine] fetchSpeakerEmbeddings:', e instanceof Error ? e.message : e);
                log.warn('Could not fetch speaker embeddings, TTS may use defaults');
            }
        }

        _ttsModelId = model.id;
        _notify(onProgress, 'ready', 'TTS model ready!', 100);
    } catch (err) {
        const error: any = err;
        _ttsPipeline = null;
        _ttsModelId = null;
        throw new Error(`Failed to load TTS model: ${error.message}`, { cause: err });
    } finally {
        _ttsLoading = false;
    }
}

// ----------------------------------------------------------------
// MICROPHONE - Recording
// Gravacao de audio via MediaRecorder API
// ----------------------------------------------------------------

/**
 * Request microphone access with user-friendly error handling.
 * Solicita permissao de microfone. Retorna stream ou erro explicativo.
 * @returns {Promise<{stream: MediaStream|null, error: string|null}>}
 */
export async function requestMicrophoneAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
        log.warn('STT: getUserMedia not available');
        return { stream: null, error: 'Microphone not supported in this browser.' };
    }

    try {
        log.debug('STT: requesting microphone access');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        log.debug('STT: microphone access granted');
        return { stream, error: null };
    } catch (err) {
        const error: any = err;
        log.warn('STT: microphone access error', error.name, error.message);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            return { stream: null, error: 'micPermissionDenied' };
        }
        return { stream: null, error: `Microphone error: ${error.message}` };
    }
}

/**
 * Start recording audio from microphone.
 * Inicia gravacao via MediaRecorder. Formato: webm/opus ou mp4 (Safari).
 *
 * @param {(state: 'recording'|'stopped') => void} [onStateChange] - Callback: 'recording' | 'stopped'
 * @returns {Promise<boolean>} true if recording started
 */
export async function startRecording(onStateChange: any) {
    if (_isRecording) {
        log.warn('STT: already recording');
        return false;
    }

    // Obtem stream se nao tiver
    if (!_mediaStream) {
        const { stream, error } = await requestMicrophoneAccess();
        if (error || !stream) {
            log.warn('STT: cannot start recording — mic unavailable', error);
            return false;
        }
        _mediaStream = stream;
    }

    // Detecta mimeType suportado (webm para Chrome/Firefox, mp4 para Safari)
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

    const options = mimeType ? { mimeType } : {};
    _mediaRecorder = new MediaRecorder(_mediaStream, options);
    _audioChunks = [];

    _mediaRecorder.ondataavailable = (e: any) => {
        if (e.data.size > 0) _audioChunks.push(e.data);
    };

    _mediaRecorder.start();
    _isRecording = true;
    if (onStateChange) onStateChange('recording');
    return true;
}

/**
 * Stop recording and return audio blob.
 * Para gravacao e retorna blob de audio para transcricao.
 * @returns {Promise<Blob|null>}
 */
export async function stopRecording(): Promise<Blob | null> {
    if (!_isRecording || !_mediaRecorder) return null;
    const recorder = _mediaRecorder;

    return new Promise((resolve) => {
        recorder.onstop = () => {
            _isRecording = false;
            const blob = new Blob(_audioChunks, { type: recorder.mimeType || 'audio/webm' });
            _audioChunks = [];

            // Libera tracks do microfone
            if (_mediaStream) {
                _mediaStream.getTracks().forEach((t: any) => t.stop());
                _mediaStream = null;
            }

            resolve(blob);
        };
        recorder.stop();
    });
}

// ----------------------------------------------------------------
// AUDIO CONVERSION
// Converte blob de audio para Float32Array 16kHz mono (Whisper)
// ----------------------------------------------------------------

/**
 * Convert audio blob to Float32Array at 16kHz mono.
 * Decodifica audio e resampla para formato esperado pelo Whisper.
 * @param {Blob} audioBlob - Audio data (webm/opus, mp4, etc.)
 * @returns {Promise<Float32Array>} PCM 16kHz mono
 */
async function _convertAudioToFloat32(audioBlob: any) {
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Decodifica na taxa nativa do device
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextCtor();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    // Resampla para 16kHz mono via OfflineAudioContext
    const targetRate = 16000;
    const duration = decoded.duration;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * targetRate), targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();

    const resampled = await offlineCtx.startRendering();
    return resampled.getChannelData(0);
}

// ----------------------------------------------------------------
// STT - Speech-to-Text
// ----------------------------------------------------------------

/**
 * Transcribe audio blob to text.
 * Converte audio em texto usando Whisper via Transformers.js.
 *
 * @param {Blob} audioBlob - Audio data (webm/opus or wav)
 * @param {SpeechOptions} [options] - { language, onProgress }
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribeAudio(audioBlob: any, options: any = {}) {
    log.debug('STT: loading Whisper pipeline');
    await ensureSTTPipeline(undefined, options.onProgress);

    // Converte para Float32Array 16kHz mono
    log.debug('STT: converting audio to 16kHz mono');
    const audioData = await _convertAudioToFloat32(audioBlob);
    log.debug('STT: audio converted, samples:', audioData.length);

    const pipelineOptions: Record<string, any> = {};
    if (options.language) {
        pipelineOptions.language = options.language;
    }

    log.debug('STT: running transcription, lang:', options.language || 'auto');
    const result = await _sttPipeline(audioData, pipelineOptions);
    const text = result?.text?.trim() || '';
    log.debug('STT: result', text || '(empty)');

    return { text, language: options.language || 'auto' };
}

/**
 * Transcribe audio using external API provider (OpenAI/Groq).
 * Transcreve audio via API externa quando configurada.
 *
 * @param {Blob} audioBlob
 * @param {SpeechOptions} [options]
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribeExternalAudio(audioBlob: any, options: any = {}) {
    const provider = options.provider || getProvider();
    const apiKey = options.apiKey || getApiKey();
    if (!apiKey) throw new Error('External STT requires API key.');

    if (provider === LLMProvider.GOOGLE) {
        const model = options.model || 'gemini-2.5-flash';
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        const mimeType = audioBlob.type || 'audio/webm';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const body = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: 'Transcribe this audio exactly. Return plain text only, no explanations, no labels.',
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 512,
            },
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `External STT failed (${response.status})`, { cause: err });
        }
        const data = await response.json();
        const text =
            data?.candidates?.[0]?.content?.parts
                ?.map((/** @type {any} */ p: any) => p?.text || '')
                .join('\n')
                .trim() || '';
        return { text, language: options.language || 'auto' };
    }

    const conf = PROVIDER_CONFIG[provider];
    if (!conf || conf.apiFormat !== 'openai') {
        throw new Error(`Provider ${provider} does not support OpenAI-compatible STT endpoint.`);
    }
    if (![LLMProvider.OPENAI, LLMProvider.GROQ].includes(provider)) {
        throw new Error(`External STT currently enabled for OpenAI/Groq/Gemini (got: ${provider}).`);
    }

    const endpoint = conf.endpoint.replace('/chat/completions', '/audio/transcriptions');
    const model = options.model || (provider === LLMProvider.GROQ ? 'whisper-large-v3-turbo' : 'whisper-1');

    const form = new FormData();
    const file = new File([audioBlob], 'speech.webm', { type: audioBlob.type || 'audio/webm' });
    form.append('file', file);
    form.append('model', model);
    if (options.language) form.append('language', options.language);
    form.append('temperature', '0');

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `External STT failed (${response.status})`);
    }
    const data = await response.json();
    return {
        text: String(data.text || '').trim(),
        language: options.language || 'auto',
    };
}

/**
 * Check native browser STT support (Web Speech API).
 * Verifica suporte a reconhecimento de voz nativo do browser.
 * @returns {boolean}
 */
export function canUseNativeSTT() {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/**
 * Transcribe one utterance using native Web Speech API.
 * Transcreve uma fala unica usando SpeechRecognition nativo.
 *
 * Notes:
 * - Must be called from a user gesture in most browsers.
 * - one-shot mode (continuous=false) to reduce accidental captures.
 *
 * @param {SpeechOptions} [options]
 * @returns {Promise<{text: string, language: string}>}
 */
export function transcribeNativeOnce(options: any = {}) {
    return new Promise((resolve, reject) => {
        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!Ctor) {
            reject(new Error('Native STT not supported'));
            return;
        }

        const recognition = new Ctor();
        _nativeRecognition = recognition;
        const lang = options.lang || 'en-US';
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12000;
        let settled = false;

        /** @type {ReturnType<typeof setTimeout>|null} */
        let timeoutId: any = null;
        /** @param {() => void} fn */
        const finish = (fn: any) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            try {
                recognition.onresult = null;
                recognition.onerror = null;
                recognition.onend = null;
                recognition.stop?.();
            } catch (e) {
                console.debug('[speechEngine] nativeRecognition-finishCleanup:', e instanceof Error ? e.message : e);
                /* noop */
            }
            _nativeRecognition = null;
            fn();
        };

        recognition.lang = lang;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (/** @type {any} */ event: any) => {
            const text = event?.results?.[0]?.[0]?.transcript?.trim() || '';
            finish(() => resolve({ text, language: lang }));
        };
        recognition.onerror = (/** @type {any} */ event: any) => {
            const code = event?.error || 'unknown';
            finish(() => reject(new Error(`Native STT error: ${code}`)));
        };
        recognition.onend = () => {
            if (!settled) {
                finish(() => resolve({ text: '', language: lang }));
            }
        };

        timeoutId = setTimeout(() => {
            finish(() => reject(new Error('Native STT timeout')));
        }, timeoutMs);

        try {
            recognition.start();
        } catch (err) {
            const error: any = err;
            _nativeRecognition = null;
            reject(new Error(`Native STT start failed: ${error.message}`));
        }
    });
}

// ----------------------------------------------------------------
// TTS - Text-to-Speech
// ----------------------------------------------------------------

/**
 * Synthesize text to audio via SpeechT5.
 * Converte texto em audio usando SpeechT5 + HiFiGAN vocoder.
 *
 * @param {string} text - Text to speak
 * @param {SpeechOptions} [options] - { onProgress }
 * @returns {Promise<{audio: Float32Array, samplingRate: number}>}
 */
export async function synthesizeSpeech(text: any, options: any = {}) {
    await ensureTTSPipeline(options.onProgress);

    const pipelineOptions: Record<string, any> = {};
    if (_speakerEmbeddings) {
        pipelineOptions.speaker_embeddings = _speakerEmbeddings;
    }

    const result = await _ttsPipeline(text, pipelineOptions);
    return {
        audio: result.audio,
        samplingRate: result.sampling_rate || 16000,
    };
}

/**
 * Speak text using native Web Speech API (fallback).
 * Usa speechSynthesis nativa como fallback zero-download.
 * Suporta pt-BR nativamente na maioria dos browsers.
 *
 * @param {string} text - Text to speak
 * @param {string} [lang] - Language code (default: 'pt-BR')
 * @returns {Promise<void>} Resolves when speech finishes
 */
export function speakNative(text: any, lang = 'pt-BR') {
    return new Promise<void>((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('Web Speech API not supported'));
            return;
        }

        /**
         * Cria e fala a utterance. Chamada apos vozes carregarem.
         * Em muitos browsers, getVoices() retorna [] na primeira chamada -
         * as vozes carregam de forma assincrona via 'voiceschanged'.
         */
        function doSpeak() {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;

            // Tenta encontrar voz especifica para o idioma solicitado
            const voices = window.speechSynthesis.getVoices();
            const match = voices.find((v: any) => v.lang === lang || v.lang.startsWith(lang.split('-')[0]!));
            if (match) utterance.voice = match;

            utterance.onend = () => {
                log.debug('TTS: native speech finished');
                resolve();
            };
            utterance.onerror = (e) => {
                // 'interrupted' e 'canceled' nao sao erros reais
                if (e.error === 'interrupted' || e.error === 'canceled') {
                    resolve();
                    return;
                }
                log.warn('TTS: native speech error', e.error);
                reject(new Error(`Speech error: ${e.error}`));
            };

            // Chrome bug: speechSynthesis pode ficar travado. Resume previne.
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
            log.debug('TTS: native speech started, lang:', lang, 'voice:', match?.name || 'default');
        }

        // Vozes podem nao estar carregadas ainda - aguarda evento
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            doSpeak();
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.onvoiceschanged = null;
                doSpeak();
            };
            // Fallback: se voiceschanged nunca dispara (raro), tenta apos 500ms
            setTimeout(() => {
                if (!window.speechSynthesis.speaking) doSpeak();
            }, 500);
        }
    });
}

// ----------------------------------------------------------------
// AUDIO PLAYBACK
// Reproducao de audio sintetizado via Web Audio API
// ----------------------------------------------------------------

/**
 * Play synthesized audio via Web Audio API.
 * Reproduz audio sintetizado usando AudioContext.
 *
 * @param {Float32Array} audioData - PCM audio samples
 * @param {number} samplingRate - Sample rate (e.g., 16000)
 * @returns {Promise<void>} Resolves when playback finishes
 */
export function playAudio(audioData: any, samplingRate: any) {
    return new Promise<void>((resolve) => {
        // Reutiliza AudioContext (limite de ~6 por tab no Chrome)
        if (!_audioContext || _audioContext.state === 'closed') {
            const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
            _audioContext = new AudioContextCtor();
        }

        // Resume se suspenso (autoplay policy)
        if (_audioContext.state === 'suspended') {
            _audioContext.resume();
        }

        const buffer = _audioContext.createBuffer(1, audioData.length, samplingRate);
        buffer.copyToChannel(/** @type {Float32Array<ArrayBuffer>} */ (audioData), 0);

        // Para audio anterior se existir
        if (_audioSource) {
            try {
                _audioSource.stop();
            } catch (e) {
                console.debug('[speechEngine] playAudio-stopPrevSource:', e instanceof Error ? e.message : e);
                /* ja parou */
            }
        }

        _audioSource = _audioContext.createBufferSource();
        _audioSource.buffer = buffer;
        _audioSource.connect(_audioContext.destination);

        _isPlaying = true;
        _audioSource.onended = () => {
            _isPlaying = false;
            _audioSource = null;
            resolve();
        };
        _audioSource.start();
    });
}

/**
 * Stop any currently playing TTS audio.
 * Para reproducao de audio TTS em andamento.
 */
export function stopPlayback() {
    if (_audioSource) {
        try {
            _audioSource.stop();
        } catch (e) {
            console.debug('[speechEngine] stopPlayback-audioSource:', e instanceof Error ? e.message : e);
            /* ja parou */
        }
        _audioSource = null;
    }
    _isPlaying = false;

    // Para Web Speech API tambem
    if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Stop native STT recognition if active.
 * Para reconhecimento nativo em andamento, se existir.
 */
export function stopNativeRecognition() {
    if (_nativeRecognition) {
        try {
            _nativeRecognition.stop?.();
        } catch (e) {
            console.debug('[speechEngine] stopNativeRecognition:', e instanceof Error ? e.message : e);
            /* noop */
        }
        _nativeRecognition = null;
    }
}

// ----------------------------------------------------------------
// STATUS & MANAGEMENT
// ----------------------------------------------------------------

/**
 * Get STT/TTS status.
 * Retorna estado atual dos pipelines de voz.
 * @returns {Object}
 */
export function getSpeechStatus() {
    return {
        sttLoaded: _sttPipeline !== null,
        ttsLoaded: _ttsPipeline !== null,
        sttLoading: _sttLoading,
        ttsLoading: _ttsLoading,
        sttModelId: _sttModelId,
        ttsModelId: _ttsModelId,
        recording: _isRecording,
        playing: _isPlaying,
    };
}

/**
 * Get available STT models.
 * Retorna lista de modelos de reconhecimento de voz.
 * @returns {Array<Object>}
 */
export function getSTTModels() {
    return [...STT_MODELS];
}

/**
 * Get available TTS models.
 * Retorna lista de modelos de sintese de voz.
 * @returns {Array<Object>}
 */
export function getTTSModels() {
    return [...TTS_MODELS];
}

/**
 * Unload speech pipelines from memory.
 * Libera pipelines STT e TTS da memoria.
 */
export async function unloadSpeechModels() {
    if (_sttPipeline) {
        await _sttPipeline.dispose?.();
        _sttPipeline = null;
        _sttModelId = null;
    }
    if (_ttsPipeline) {
        await _ttsPipeline.dispose?.();
        _ttsPipeline = null;
        _ttsModelId = null;
    }
    _speakerEmbeddings = null;
    stopPlayback();
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Notify progress callback.
 * Helper para padronizar notificacoes de progresso.
 * @param {SpeechProgressCallback|null|undefined} cb
 * @param {string} status
 * @param {string} message
 * @param {number} progress
 */
function _notify(cb: any, status: any, message: any, progress: any) {
    if (cb) cb({ status, message, progress });
}
