// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// F6 Video Recorder - captura presentation player como MP4/WebM via MediaRecorder API.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §F14
//
// Limitação conhecida: TTS Web Speech API NÃO conecta a AudioContext, então áudio TTS
// NÃO é embedded no vídeo. Workaround: usuário usa audio.type='upload' (AudioContext route).


import { canExport } from './qualityChecks.js';

export const VIDEO_CAPTURE_MODES = Object.freeze(['screen', 'canvas']);
export const CAPTION_EXPORT_MODES = Object.freeze(['captured', 'rebuild', 'off']);
export const VIDEO_EXPORT_PRESETS = Object.freeze({
    launch_video_final: {
        id: 'launch_video_final',
        label: 'Launch Video Final',
        description: 'Capture a reproducao real da tela, mantenha overlays visiveis e finalize com trim curto.',
        captureMode: 'screen',
        captionsMode: 'captured',
        keepSourceAudio: true,
        trimPadStart: 0.2,
        trimPadEnd: 0.35,
        backgroundAudioVolume: 0.14,
    },
    dogfood_review: {
        id: 'dogfood_review',
        label: 'Dogfood Review',
        description: 'Exporta a reproducao real com pouco processamento para revisao interna.',
        captureMode: 'screen',
        captionsMode: 'captured',
        keepSourceAudio: true,
        trimPadStart: 0,
        trimPadEnd: 0,
        backgroundAudioVolume: 0,
    },
    canvas_rebuild: {
        id: 'canvas_rebuild',
        label: 'Canvas + Rebuild Overlay',
        description: 'Fallback para browsers sem captura de tela; recompõe legenda e headline no export.',
        captureMode: 'canvas',
        captionsMode: 'rebuild',
        keepSourceAudio: false,
        trimPadStart: 0,
        trimPadEnd: 0,
        backgroundAudioVolume: 0.12,
    },
});

/** @type {{recorder: any, chunks: any[], stream: any, audioStream: any, startedAt: number, onStop: any, mode: any}} */
const _state: any = {
    recorder: null,
    chunks: [],
    stream: null,
    audioStream: null,
    startedAt: 0,
    onStop: null,
    mode: null,
};

/** @param {any} value */
function _clone(value: any) {
    return JSON.parse(JSON.stringify(value));
}

/**
 * Detect best supported video codec.
 * Returns mime type string or null if MediaRecorder unavailable.
 */
export function detectSupportedMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
        'video/mp4;codecs=h264,aac', // Safari + Chrome 121+
        'video/mp4;codecs=avc1', // Some Safari
        'video/webm;codecs=vp9,opus', // Chrome/Edge/Firefox
        'video/webm;codecs=vp8,opus', // Older Chrome
        'video/webm;codecs=vp9', // Video only
        'video/webm', // Fallback
    ];
    for (const mime of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(mime)) return mime;
        } catch (e) {
            console.debug('[videoRecorder] mimeSupportProbe:', /** @type {any} */ (e as any)?.message || e);
            /* skip */
        }
    }
    return null;
}

/**
 * Check if video recording is available in this browser.
 */
export function isVideoRecordingAvailable() {
    return detectSupportedMime() !== null && typeof HTMLCanvasElement !== 'undefined';
}

/**
 * Check if getDisplayMedia screen recording is available.
 */
export function isScreenRecordingAvailable() {
    return (
        detectSupportedMime() !== null &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function'
    );
}

export function listVideoExportPresets() {
    return Object.values(VIDEO_EXPORT_PRESETS).map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        captureMode: preset.captureMode,
        captionsMode: preset.captionsMode,
    }));
}

/** @param {any} id */
export function getVideoExportPreset(id: any) {
    const preset = (VIDEO_EXPORT_PRESETS as any)[id];
    if (!preset) throw new Error(`Unknown video export preset: ${id}`);
    return _clone(preset);
}

/** @param {any} profileId */
export function getSuggestedExportPreset(profileId: any) {
    if (profileId === 'launch_video_technical_environmental') return 'launch_video_final';
    return 'dogfood_review';
}

/** @param {any} stream @param {any} [options] */
function _startRecorderFromStream(stream: any, options: any = {}) {
    if (!stream) {
        throw new Error('MediaStream required');
    }
    const mime = detectSupportedMime();
    if (!mime) {
        throw new Error('MediaRecorder not supported in this browser');
    }

    const videoBitsPerSecond = options.videoBitsPerSecond || 2_500_000;
    const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond,
    });

    _state.recorder = recorder;
    _state.stream = stream;
    _state.chunks = [];
    _state.startedAt = Date.now();
    _state.mode = options.mode || 'canvas';

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) _state.chunks.push(e.data);
    };

    recorder.start(1000);
    console.debug('[video-recorder] started', {
        mime,
        bitrate: videoBitsPerSecond,
        mode: _state.mode,
    });

    return {
        stop: stopCapture,
        mime,
        getStream: () => stream,
        getAudioDestination: () => _state.audioStream,
    };
}

/**
 * Start recording the canvas (and optional audio buffer).
 *
 * @param {HTMLCanvasElement} canvas - 3D scene canvas
 * @param {object} [options]
 * @param {number} [options.fps=30] - capture frame rate
 * @param {number} [options.videoBitsPerSecond=2500000] - bitrate (default 2.5 Mbps)
 * @param {AudioContext} [options.audioCtx] - if provided, captures audio destination too
 * @returns {{stop: Function, mime: string}} control object
 */
export function startCapture(canvas: any, options: any = {}) {
    if (!canvas || typeof canvas.captureStream !== 'function') {
        throw new Error('Canvas with captureStream() required');
    }
    const fps = options.fps || 30;
    const stream = canvas.captureStream(fps);

    // Add audio track if AudioContext provided (for upload audio embedding)
    if (options.audioCtx && typeof options.audioCtx.createMediaStreamDestination === 'function') {
        try {
            const dest = options.audioCtx.createMediaStreamDestination();
            /** @type {any} */ (options)._audioDest = dest;
            for (const track of dest.stream.getAudioTracks()) {
                stream.addTrack(track);
            }
            _state.audioStream = dest;
        } catch (e) {
            console.warn('[video-recorder] audio capture failed', /** @type {any} */ (e as any)?.message);
        }
    }

    return _startRecorderFromStream(stream, {
        ...options,
        mode: 'canvas',
        fps,
    });
}

/**
 * Start recording a real browser tab/window/screen.
 *
 * @param {object} [options]
 * @param {number} [options.fps=30]
 * @param {boolean} [options.captureAudio=true]
 * @returns {Promise<{stop: Function, mime: string, getStream: Function}>}
 */
export async function startScreenCapture(options: any = {}) {
    if (!isScreenRecordingAvailable()) {
        throw new Error('Screen capture unavailable in this browser');
    }
    const fps = options.fps || 30;
    const captureAudio = options.captureAudio !== false;
    const stream = await navigator.mediaDevices.getDisplayMedia(({
        video: {
            frameRate: fps,
            displaySurface: 'browser',
        },
        audio: captureAudio,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
    }) as any);

    return _startRecorderFromStream(stream, {
        ...options,
        mode: 'screen',
        fps,
    });
}

/**
 * Start playback capture using preferred mode and fallback to canvas when needed.
 *
 * @param {HTMLCanvasElement|null} canvas
 * @param {object} [options]
 * @param {'screen'|'canvas'} [options.mode='screen']
 */
export async function startPlaybackCapture(canvas: any, options: any = {}) {
    const mode = VIDEO_CAPTURE_MODES.includes(/** @type {any} */ (options.mode)) ? options.mode : 'screen';
    if (mode === 'screen') {
        if (isScreenRecordingAvailable()) {
            return startScreenCapture(/** @type {any} */ (options));
        }
        if (canvas) {
            return startCapture(canvas, /** @type {any} */ (options));
        }
        throw new Error('Screen capture unavailable and no canvas fallback provided');
    }
    return startCapture(/** @type {any} */ (canvas), /** @type {any} */ (options));
}

/**
 * Stop recording. Returns Promise resolving to Blob.
 *
 * @returns {Promise<{blob: Blob, mime: string, durationMs: number, sizeBytes: number}>}
 */
export function stopCapture() {
    return new Promise((resolve, reject) => {
        const recorder = _state.recorder;
        if (!recorder) {
            reject(new Error('Not recording'));
            return;
        }
        recorder.onstop = () => {
            const mime = recorder.mimeType || 'video/webm';
            const blob = new Blob(_state.chunks, { type: mime });
            const result = {
                blob,
                mime,
                durationMs: Date.now() - _state.startedAt,
                sizeBytes: blob.size,
            };

            // Cleanup
            try {
                _state.stream?.getTracks().forEach((/** @type {any} */ t: any) => t.stop());
            } catch (e) {
                console.debug('[videoRecorder] stopStreamTracks:', /** @type {any} */ (e as any)?.message || e);
                /* ignore */
            }
            _state.recorder = null;
            _state.stream = null;
            _state.chunks = [];
            _state.audioStream = null;
            _state.mode = null;

            console.debug('[video-recorder] stopped', {
                mime,
                durationMs: result.durationMs,
                sizeKB: Math.round(result.sizeBytes / 1024),
            });
            resolve(result);
        };
        try {
            recorder.stop();
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Trigger browser download of blob.
 *
 * @param {Blob} blob
 * @param {string} filename - e.g. 'apresentacao-tour-cetesb.webm'
 */
export function downloadBlob(blob: any, filename: any) {
    if (!blob) throw new Error('Blob required');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `apresentacao-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Guarded export: validates presentation via qualityChecks.canExport() before
 * delegating to startCapture(). Refuses when webSpeech + embedAudio conflict
 * or any launch-blocking error is present.
 *
 * Spec: PRESENTATION-LAUNCH-VIDEO-001 §4 (LV8) + §13.4 (EXPORT_AUDIO_PROVIDER_UNSUPPORTED)
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} presentation - sanitized presentation v1.1
 * @param {object} [options] - forwarded to startCapture
 * @returns {{stop: Function, mime: string}} control object
 * @throws {Error} when readiness gate fails; error.code is first failing code
 */
export function startCaptureGuarded(canvas: any, presentation: any, options: any = {}) {
    const gate = canExport(presentation);
    if (!gate.canExport) {
        const err: any = new Error(`Export blocked: ${gate.errors.join(', ')}`);
        err.code = gate.errors[0] || 'EXPORT_BLOCKED';
        err.errors = gate.errors;
        err.warnings = gate.warnings;
        throw err;
    }
    return startCapture(canvas, options);
}

/**
 * Sanitize title for filename.
 */
/** @param {any} title */
export function sanitizeFilename(title: any) {
    return String(title || 'apresentacao')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 80);
}

/** @param {any} durationSec @param {any} [startSec] @param {any} [endSec] */
export function normalizeTrimRange(durationSec: any, startSec = 0, endSec = null) {
    const duration = Math.max(0, Number(durationSec) || 0);
    const start = Math.max(0, Math.min(duration, Number(startSec) || 0));
    const proposedEnd = endSec == null || endSec === '' ? duration : Number(endSec);
    const end = Math.max(start + 0.05, Math.min(duration, Number.isFinite(proposedEnd) ? proposedEnd : duration));
    return {
        startSec: start,
        endSec: end,
        durationSec: Math.max(0.05, end - start),
    };
}

/** @param {any} presentation */
export function buildPresentationTimeline(presentation: any) {
    if (!presentation?.steps?.length) return [];
    let cursor = 0;
    return presentation.steps.map((/** @type {any} */ step: any, /** @type {number} */ idx: any) => {
        const duration = Math.max(0.1, Number(step?.duration) || 3);
        const transitionDuration = Math.max(0, Number(step?.transitionDuration) || 0);
        const entry = {
            idx,
            step,
            startSec: cursor,
            contentEndSec: cursor + duration,
            endSec: cursor + duration + transitionDuration,
            durationSec: duration,
            transitionDurationSec: transitionDuration,
        };
        cursor = entry.endSec;
        return entry;
    });
}

/** @param {any} timeline @param {any} elapsedSec */
export function resolveTimelineStep(timeline: any, elapsedSec: any) {
    if (!Array.isArray(timeline) || timeline.length === 0) return null;
    const t = Math.max(0, Number(elapsedSec) || 0);
    return timeline.find((entry) => t >= entry.startSec && t < entry.endSec) || timeline[timeline.length - 1];
}

/** @param {any} target @param {any} eventName */
function _waitEvent(target: any, eventName: any) {
    return new Promise<void>((resolve, reject) => {
        const onOk = () => {
            cleanup();
            resolve();
        };
        const onErr = (/** @type {any} */ event: any) => {
            cleanup();
            reject(event?.error || new Error(`${eventName} failed`));
        };
        const cleanup = () => {
            target.removeEventListener(eventName, onOk);
            target.removeEventListener('error', onErr);
        };
        target.addEventListener(eventName, onOk, { once: true });
        target.addEventListener('error', onErr, { once: true });
    });
}

/** @param {any} element @param {any} timeSec */
async function _seekMedia(element: any, timeSec: any) {
    if (!Number.isFinite(timeSec)) return;
    if (Math.abs((element.currentTime || 0) - timeSec) < 0.02) return;
    element.currentTime = Math.max(0, timeSec);
    await _waitEvent(element, 'seeked');
}

/** @param {any} videoEl @param {any} src */
async function _loadVideoMetadata(videoEl: any, src: any) {
    videoEl.src = src;
    videoEl.preload = 'auto';
    videoEl.playsInline = true;
    videoEl.crossOrigin = 'anonymous';
    await _waitEvent(videoEl, 'loadedmetadata');
}

/** @param {any} audioEl @param {any} src */
async function _loadAudioElement(audioEl: any, src: any) {
    audioEl.src = src;
    audioEl.preload = 'auto';
    audioEl.crossOrigin = 'anonymous';
    await _waitEvent(audioEl, 'loadedmetadata');
}

/**
 * Compose a trimmed export from a recorded blob with optional audio mix and overlay drawing.
 *
 * @param {Blob} blob
 * @param {object} [options]
 * @param {number} [options.startSec]
 * @param {number} [options.endSec]
 * @param {number} [options.fps=30]
 * @param {boolean} [options.keepSourceAudio=true]
 * @param {number} [options.sourceAudioVolume=1]
 * @param {File|Blob|null} [options.backgroundAudioFile]
 * @param {number} [options.backgroundAudioVolume=0.18]
 * @param {(payload: {ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, video: HTMLVideoElement, elapsedSec: number, absoluteSec: number}) => void} [options.drawFrame]
 * @returns {Promise<{blob: Blob, mime: string, durationMs: number, sizeBytes: number}>}
 */
export async function composeEditedRecording(blob: any, options: any = {}) {
    if (!blob) throw new Error('Recorded blob required');
    const mime = detectSupportedMime();
    if (!mime) throw new Error('MediaRecorder not supported in this browser');

    const opts = /** @type {any} */ (options);
    const sourceUrl = URL.createObjectURL(blob);
    const videoEl = document.createElement('video');
    const bgAudioEl = opts.backgroundAudioFile ? document.createElement('audio') : null;
    const bgAudioUrl = opts.backgroundAudioFile ? URL.createObjectURL(opts.backgroundAudioFile) : null;
    const fps = Math.max(12, Math.min(60, Number(opts.fps) || 30));
    let audioCtx = null;
    let rafId = 0;

    try {
        await _loadVideoMetadata(videoEl, sourceUrl);
        if (bgAudioEl && bgAudioUrl) await _loadAudioElement(bgAudioEl, bgAudioUrl);

        const trim = normalizeTrimRange(videoEl.duration || 0, opts.startSec, opts.endSec);
        const width = opts.width || videoEl.videoWidth || 1080;
        const height = opts.height || videoEl.videoHeight || 1920;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context unavailable');

        const stream = canvas.captureStream(fps);

        try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (Ctx) {
                audioCtx = new Ctx();
                const dest = audioCtx.createMediaStreamDestination();
                if (opts.keepSourceAudio !== false) {
                    const videoSource = audioCtx.createMediaElementSource(videoEl);
                    const gain = audioCtx.createGain();
                    gain.gain.value = Math.max(0, Math.min(2, Number(opts.sourceAudioVolume) || 1));
                    videoSource.connect(gain);
                    gain.connect(dest);
                }
                if (bgAudioEl && bgAudioUrl) {
                    const bgSource = audioCtx.createMediaElementSource(bgAudioEl);
                    const bgGain = audioCtx.createGain();
                    bgGain.gain.value = Math.max(0, Math.min(1, Number(opts.backgroundAudioVolume) || 0.18));
                    bgSource.connect(bgGain);
                    bgGain.connect(dest);
                }
                dest.stream.getAudioTracks().forEach((/** @type {any} */ track) => stream.addTrack(track));
            }
        } catch (error) {
            console.warn('[video-recorder] audio mix unavailable', /** @type {any} */ (error as any)?.message || error);
        }

        const handle = _startRecorderFromStream(stream, {
            mode: 'compose',
            videoBitsPerSecond: opts.videoBitsPerSecond,
        });

        await _seekMedia(videoEl, trim.startSec);
        if (bgAudioEl) {
            bgAudioEl.currentTime = 0;
        }

        const renderFrame = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(videoEl, 0, 0, width, height);
            if (typeof opts.drawFrame === 'function') {
                opts.drawFrame({
                    ctx,
                    canvas,
                    video: videoEl,
                    elapsedSec: Math.max(0, videoEl.currentTime - trim.startSec),
                    absoluteSec: videoEl.currentTime,
                });
            }

            if (videoEl.currentTime >= trim.endSec || videoEl.ended) return;
            rafId = window.requestAnimationFrame(renderFrame);
        };

        if (/** @type {any} */ (audioCtx)?.state === 'suspended') {
            try {
                await /** @type {any} */ (audioCtx).resume();
            } catch (e) {
                console.debug('[videoRecorder] resumeAudioCtx:', /** @type {any} */ (e as any)?.message || e);
                /* ignore */
            }
        }

        await videoEl.play();
        if (bgAudioEl) {
            bgAudioEl.volume = 1;
            bgAudioEl.loop = false;
            await bgAudioEl.play().catch((/** @type {any} */ e) => console.debug('[videoRecorder] bgAudio play failed', e?.message || e));
        }

        renderFrame();
        await new Promise<void>((resolve) => {
            const check = () => {
                if (videoEl.currentTime >= trim.endSec || videoEl.ended) {
                    resolve();
                    return;
                }
                window.setTimeout(check, 40);
            };
            check();
        });

        if (rafId) window.cancelAnimationFrame(rafId);
        videoEl.pause();
        if (bgAudioEl) bgAudioEl.pause();
        return await handle.stop();
    } finally {
        if (rafId) {
            try {
                window.cancelAnimationFrame(rafId);
            } catch (e) {
                console.debug('[videoRecorder] cancelRafFinally:', /** @type {any} */ (e as any)?.message || e);
                /* ignore */
            }
        }
        try {
            videoEl.pause();
        } catch (e) {
            console.debug('[videoRecorder] pauseVideoFinally:', /** @type {any} */ (e as any)?.message || e);
            /* ignore */
        }
        if (bgAudioEl) {
            try {
                bgAudioEl.pause();
            } catch (e) {
                console.debug('[videoRecorder] pauseBgAudioFinally:', /** @type {any} */ (e as any)?.message || e);
                /* ignore */
            }
        }
        if (audioCtx) {
            try {
                await /** @type {any} */ (audioCtx).close();
            } catch (e) {
                console.debug('[videoRecorder] closeAudioCtxFinally:', /** @type {any} */ (e as any)?.message || e);
                /* ignore */
            }
        }
        URL.revokeObjectURL(sourceUrl);
        if (bgAudioUrl) URL.revokeObjectURL(bgAudioUrl);
    }
}

/** @param {any} blob @param {any} [options] */
export function trimRecordedVideo(blob: any, options: any = {}) {
    const opts = /** @type {any} */ (options);
    return composeEditedRecording(blob, {
        ...opts,
        keepSourceAudio: opts.keepSourceAudio !== false,
    });
}

/**
 * Reset state (tests).
 */
export function _reset() {
    if (_state.recorder) {
        try {
            _state.recorder.stop();
        } catch (e) {
            console.debug('[videoRecorder] resetRecorderStop:', /** @type {any} */ (e as any)?.message || e);
            /* ignore */
        }
    }
    _state.recorder = null;
    _state.stream = null;
    _state.chunks = [];
    _state.audioStream = null;
    _state.mode = null;
}

/**
 * Get current recording status.
 */
export function getRecordingStatus() {
    return {
        active: !!_state.recorder,
        startedAt: _state.startedAt,
        elapsedMs: _state.recorder ? Date.now() - _state.startedAt : 0,
        mode: _state.mode,
    };
}
