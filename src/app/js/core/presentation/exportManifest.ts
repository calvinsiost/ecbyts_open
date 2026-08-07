// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Export Manifest - pure-logic MP4 export plan for Presentation Mode.
// UX-36 Phase 4 of SPEC_PRESENTATION_MODE_JOURNEY.
// Zero DOM, zero encoding. Generates a declarative manifest describing
// what the encoder MUST produce: frames, audio cues, metadata.
// Imutável: todos os retornos são frozen.

import { getSlideAt, getTotalDuration } from './storyboardState.js';

const VALID_RESOLUTIONS = ['720p', '1080p', '4K'];
const VALID_FPS = [24, 30, 60];
const VALID_VIDEO_CODECS = ['h264', 'h265', 'vp9'];
const VALID_AUDIO_CODECS = ['aac', 'opus'];

const RESOLUTION_DIMENSIONS = Object.freeze({
    '720p': Object.freeze({ width: 1280, height: 720 }),
    '1080p': Object.freeze({ width: 1920, height: 1080 }),
    '4K': Object.freeze({ width: 3840, height: 2160 }),
});

const DEFAULT_BITRATES_KBPS = Object.freeze({
    '720p': 4000,
    '1080p': 8000,
    '4K': 35000,
});

const AUDIO_BITRATE_KBPS = 128;
const TRANSITION_WINDOW_MS = 500;

/**
 * Resolve dimensões da resolução nomeada.
 */
export function getResolutionDimensions(
    resolution: '720p' | '1080p' | '4K',
): { width: number; height: number } {
    const dims = RESOLUTION_DIMENSIONS[resolution];
    if (!dims) throw new Error(`unknown resolution: ${resolution}`);
    return dims;
}

/**
 * Cria configuração de export frozen com defaults sensatos.
 * @returns frozen config
 */
export function createExportConfig({
    resolution = '1080p',
    fps = 30,
    bitrateKbps,
    codec = 'h264',
    audioCodec = 'aac',
}: Record<string, any> = {}): object {
    const _BITRATES = DEFAULT_BITRATES_KBPS as Record<string, number>;
    const resolvedBitrate =
        typeof bitrateKbps === 'number' && bitrateKbps > 0 ? bitrateKbps : (_BITRATES[resolution] ?? 8000);
    if (typeof bitrateKbps === 'number' && bitrateKbps <= 0) {
        throw new Error('bitrateKbps must be > 0');
    }
    return Object.freeze({
        resolution: String(resolution),
        fps: Number(fps),
        bitrateKbps: Number(resolvedBitrate),
        codec: String(codec),
        audioCodec: String(audioCodec),
    });
}

/**
 * Valida configuração de export.
 */
export function validateExportConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['config must be object'] };
    }
    if (!VALID_RESOLUTIONS.includes(config.resolution)) {
        errors.push(`invalid resolution: ${config.resolution}`);
    }
    if (!VALID_FPS.includes(config.fps)) {
        errors.push(`invalid fps: ${config.fps} (must be 24, 30, or 60)`);
    } else if (config.fps < 24 || config.fps > 60) {
        errors.push('fps must be in [24,60]');
    }
    if (typeof config.bitrateKbps !== 'number' || config.bitrateKbps <= 0) {
        errors.push('bitrateKbps must be > 0');
    }
    if (!VALID_VIDEO_CODECS.includes(config.codec)) {
        errors.push(`invalid codec: ${config.codec}`);
    }
    if (!VALID_AUDIO_CODECS.includes(config.audioCodec)) {
        errors.push(`invalid audioCodec: ${config.audioCodec}`);
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Encontra slide anterior ao tempo dado (para transition crossfades).
 * Retorna null se primeiro slide ou storyboard vazio.
 */
function getPreviousSlideAt(state: any, timeMs: any): any {
    if (!state || state.slides.length === 0) return null;
    let acc = 0;
    let prev = null;
    for (const slide of state.slides) {
        const d = Number(slide.durationMs) || 0;
        if (timeMs < acc + d) return prev;
        prev = slide;
        acc += d;
    }
    return prev;
}

/**
 * Calcula offset acumulado de início do slide.
 */
function getSlideStartMs(state: any, slideId: any): number {
    let acc = 0;
    for (const slide of state.slides) {
        if (slide.id === slideId) return acc;
        acc += Number(slide.durationMs) || 0;
    }
    return -1;
}

/**
 * Estima tamanho final do arquivo em bytes.
 * size = (videoBitrate + audioBitrate) * duration / 8.
 * @returns bytes
 */
export function estimateFileSize(config: Record<string, any>, durationMs: number): number {
    if (!config || typeof config.bitrateKbps !== 'number') return 0;
    const dur = Number(durationMs) || 0;
    if (dur <= 0) return 0;
    const totalKbps = config.bitrateKbps + AUDIO_BITRATE_KBPS;
    const seconds = dur / 1000;
    return Math.round((totalKbps * 1000 * seconds) / 8);
}

/**
 * Constrói manifest declarativo de export MP4.
 * @param storyboard - frozen storyboard state
 * @param any> - frozen narration track ({cues})
 * @param narrationTrack - frozen export config
 * @returns frozen manifest
 */
export function buildExportManifest(
    storyboard: Record<string, any>,
    narrationTrack: Record<string, any>,
    config: Record<string, any>,
): object {
    if (!storyboard || !Array.isArray(storyboard.slides)) {
        throw new Error('storyboard must be a valid storyboard state');
    }
    if (!narrationTrack || !Array.isArray(narrationTrack.cues)) {
        throw new Error('narrationTrack must be a valid narration track state');
    }
    const validation = validateExportConfig(config);
    if (!validation.valid) {
        throw new Error(`invalid export config: ${validation.errors.join(', ')}`);
    }

    const totalDurationMs = getTotalDuration(storyboard as any);
    const fps = config.fps;
    const frameStepMs = 1000 / fps;

    const frames: any[] = [];
    if (storyboard.slides.length > 0 && totalDurationMs > 0) {
        const frameCount = Math.floor(totalDurationMs / frameStepMs);
        for (let i = 0; i < frameCount; i++) {
            const timeMs = i * frameStepMs;
            const slide = getSlideAt(storyboard as any, timeMs);
            if (!slide) continue;
            const slideStart = getSlideStartMs(storyboard, slide.id);
            const elapsedInSlide = timeMs - slideStart;
            const frame: any = {
                timeMs,
                slideId: slide.id,
                cameraState: slide.cameraState ? Object.freeze({ ...slide.cameraState }) : null,
            };
            // Detecta janela de transição: 500ms iniciais do slide (exceto primeiro slide).
            if (elapsedInSlide < TRANSITION_WINDOW_MS && slide.transition !== 'cut') {
                const prev = getPreviousSlideAt(storyboard, timeMs);
                if (prev && prev.id !== slide.id) {
                    frame.transitionFrom = prev.id;
                    frame.transitionTo = slide.id;
                    frame.transitionT = Math.min(1, elapsedInSlide / TRANSITION_WINDOW_MS);
                }
            }
            frames.push(Object.freeze(frame));
        }
    }

    const audioCues = narrationTrack.cues.map((c: any) =>
        Object.freeze({
            id: c.id,
            slideId: c.slideId,
            startSec: c.startMs / 1000,
            endSec: c.endMs / 1000,
            text: c.text,
            ...(c.voice !== undefined ? { voice: c.voice } : {}),
        }),
    );

    const estimatedSizeBytes = estimateFileSize(config, totalDurationMs);

    return Object.freeze({
        frames: Object.freeze(frames),
        audioCues: Object.freeze(audioCues),
        metadata: Object.freeze({
            totalDurationMs,
            frameCount: frames.length,
            estimatedSizeBytes,
            config,
        }),
    });
}

/**
 * Resumo executivo de um manifest.
 */
export function summarizeManifest(
    manifest: Record<string, any>,
): { frameCount: number; audioCueCount: number; durationSec: number; sizeMB: number } {
    if (!manifest || !manifest.metadata) {
        return { frameCount: 0, audioCueCount: 0, durationSec: 0, sizeMB: 0 };
    }
    const sizeMB = manifest.metadata.estimatedSizeBytes / (1024 * 1024);
    return {
        frameCount: manifest.metadata.frameCount,
        audioCueCount: manifest.audioCues.length,
        durationSec: manifest.metadata.totalDurationMs / 1000,
        sizeMB: Math.round(sizeMB * 100) / 100,
    };
}
