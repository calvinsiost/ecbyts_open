// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   VIDEO BOT — AI-powered video generation from timeline
   Captura frames dos keyframes da timeline, constroi prompt
   ambiental contextualizado, e envia para API de geracao de video.

   Pipeline: Capture Frames → Build Prompt → Send to AI → Poll Status

   Providers suportados:
   - OpenAI (Sora)       — via /v1/video/generations
   - Google (Veo)        — via generativelanguage.googleapis.com
   - Runway (Gen-3)      — via api.runwayml.com
   - Replicate (SVD)     — via api.replicate.com
   ================================================================ */
// REFATORACAO (pattern §4.1): le estado da folha ./state.js (quebra
// videoBot→manager). `seek` vem do registry de engine em ./state.js
// (quebra videoBot→engine). `setCameraState` de controls.js via
// `await import()` dinamico (quebra videoBot→utils/scene/controls).
// Imports de elements/campaigns/llm permanecem inalterados (fora do escopo).
import { getItems, getKeyframes, getPlayback, getEngineActions } from './state.js';
import { getRenderer, requestRender } from '../../utils/scene/setup.js';
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { hasApiKey } from '../llm/client.js';
import { assessVideoGenerationGate } from './videoGate.js';
import { lazyImport } from '../../utils/helpers/lazyImport.js';

type VideoProgress = { stage: string; percent: number; message: string };
type CapturedFrame = {
    image: string;
    index: number;
    keyframeId?: string;
    itemId?: string;
    itemName?: string;
    itemType?: string;
    position?: number;
    duration?: number;
    transition?: any;
    annotation?: string;
};
type CaptureOptions = { format?: string; quality?: number; interpolated?: boolean };
type PromptOptions = { style?: any; language?: string; customPrompt?: string };
type GenerateVideoOptions = {
    style?: any;
    resolution?: string;
    fps?: number;
    onProgress?: (progress: VideoProgress) => void;
    interpolated?: boolean;
    customPrompt?: string;
    videoProvider?: string;
    videoKey?: string;
};
type VideoStage = (typeof VIDEO_STAGE_ORDER)[number];
type VideoResult = {
    success: boolean;
    videoBlob: Blob;
    videoExt: string;
    prompt: string;
    frames: Array<{ image: string; itemName?: string; position?: number }>;
    config: Record<string, any>;
    estimatedCost: Record<string, any>;
};
// ----------------------------------------------------------------
// LAZY CONTROLS MODULE — dynamic import (quebra edge → controls.js)
// ----------------------------------------------------------------
/** @type {Promise<any>|null} */
let _controlsPromise: any = null;
/** @returns {Promise<any>} */
function _loadControls() {
    // REF-SWEEPS RF-2: mesma raiz do renderer.ts — import() cru disparado no TOPO DO
    // MODULO por _loadControls() fire-and-forget. lazyImport nunca rejeita; em falha
    // limpamos o cache para nao envenenar os awaits seguintes com um promise rejeitado.
    if (!_controlsPromise) {
        _controlsPromise = lazyImport('../../utils/scene/controls.js', {
            importer: () => import('../../utils/scene/controls.js' as string),
        }).then((mod: any) => {
            if (!mod) _controlsPromise = null;
            return mod;
        });
    }
    return _controlsPromise;
}
void _loadControls();
/** Seek via registry de engine (state.js). @param {number} position */
function seek(position: any) {
    return (getEngineActions() as any).seek(position);
}
/**
 * @typedef {{image: string, index: number, keyframeId?: string, itemId?: string, itemName?: string, itemType?: string, position?: number, duration?: number, transition?: any, annotation?: string}} CapturedFrame
 * @typedef {{stage: string, percent: number, message: string}} VideoProgress
 * @typedef {{success: boolean, videoBlob: Blob, videoExt: string, prompt: string, frames: Array<{image: string, itemName?: string, position?: number}>, config: Record<string, any>, estimatedCost: Record<string, any>}} VideoResult
 * @typedef {{format?: string, quality?: number, interpolated?: boolean}} CaptureOptions
 * @typedef {{style?: string, language?: string, customPrompt?: string}} PromptOptions
 * @typedef {{style?: string, resolution?: string, fps?: number, onProgress?: (progress: VideoProgress) => void, interpolated?: boolean, customPrompt?: string, videoProvider?: string, videoKey?: string}} GenerateVideoOptions
 */
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const _VIDEO_STYLES = ['photorealistic', 'technical', 'artistic'];
const _RESOLUTIONS = ['720p', '1080p', '4K'];
const _FPS_OPTIONS = [12, 24, 30, 60];
const STYLE_PROMPTS = {
    photorealistic: 'Photorealistic aerial drone footage, golden hour lighting, cinematic 4K quality.',
    technical: 'Technical engineering visualization, clean lines, labeled elements, orthographic perspective.',
    artistic: 'Artistic interpretation, painterly style, dramatic lighting, atmospheric haze.',
};
const CAPTURE_DELAY_MS = 100; // Tempo para render estabilizar apos setCameraState
const VIDEO_STAGE_IDLE = 'idle';
const VIDEO_STAGE_CAPTURE = 'capture';
const VIDEO_STAGE_PROMPT = 'prompt';
const VIDEO_STAGE_GENERATE = 'generate';
const VIDEO_STAGE_COMPLETE = 'complete';
const VIDEO_STAGE_CANCELLED = 'cancelled';
const VIDEO_STAGE_ERROR = 'error';
const VIDEO_STAGE_ORDER = [
    VIDEO_STAGE_IDLE,
    VIDEO_STAGE_CAPTURE,
    VIDEO_STAGE_PROMPT,
    VIDEO_STAGE_GENERATE,
    VIDEO_STAGE_COMPLETE,
    VIDEO_STAGE_CANCELLED,
    VIDEO_STAGE_ERROR,
] as const;
const VIDEO_STAGE_TRANSITIONS: Record<VideoStage, Set<VideoStage>> = {
    [VIDEO_STAGE_IDLE]: new Set([VIDEO_STAGE_CAPTURE, VIDEO_STAGE_CANCELLED, VIDEO_STAGE_ERROR]),
    [VIDEO_STAGE_CAPTURE]: new Set([VIDEO_STAGE_PROMPT, VIDEO_STAGE_CANCELLED, VIDEO_STAGE_ERROR]),
    [VIDEO_STAGE_PROMPT]: new Set([VIDEO_STAGE_GENERATE, VIDEO_STAGE_CANCELLED, VIDEO_STAGE_ERROR]),
    [VIDEO_STAGE_GENERATE]: new Set([VIDEO_STAGE_COMPLETE, VIDEO_STAGE_CANCELLED, VIDEO_STAGE_ERROR]),
    [VIDEO_STAGE_COMPLETE]: new Set([VIDEO_STAGE_CAPTURE]),
    [VIDEO_STAGE_CANCELLED]: new Set([VIDEO_STAGE_CAPTURE]),
    [VIDEO_STAGE_ERROR]: new Set([VIDEO_STAGE_CAPTURE]),
};
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _generating = false;
let _abortRequested = false;
/** @type {VideoProgress} */
let _progress = { stage: VIDEO_STAGE_IDLE, percent: 0, message: '' };
/** @type {Array<(progress: VideoProgress) => void>} */
let _onProgressCallbacks: any[] = [];
/** @type {AbortController|null} */
let _abortController: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Verifica se o bot pode gerar video (tem keyframes + key de video disponivel).
 * Aceita key do Gemini (para Veo 3) OU key separada do Runway.
 * @returns {{ canGenerate: boolean, reason: string|null }}
 */
export function canGenerateVideo() {
    return assessVideoGenerationGate({
        keyframeCount: getKeyframes().length,
        hasPrimaryKey: hasApiKey(),
        hasRunwayKey: !!sessionStorage.getItem('ecbyts_video_key'),
        generating: _generating,
    });
}
/**
 * Captura frames de todos os keyframes da timeline.
 * Retorna array de { image: dataURL, metadata } para cada keyframe.
 *
 * @param {CaptureOptions} [options]
 * @returns {Promise<Array<CapturedFrame>>}
 */
export async function captureTimelineFrames(options: CaptureOptions = {}): Promise<CapturedFrame[]> {
    const format = options.format || 'image/jpeg';
    const quality = options.quality ?? 0.85;
    const keyframes = getKeyframes();
    const items = getItems();
    const renderer = getRenderer();
    const playback = getPlayback();
    if (!renderer || keyframes.length === 0) return [];
    const ctrl = await _loadControls();
    if (!ctrl) return []; // chunk de controls fora do ar — sem camera nao ha frames
    /** @type {CapturedFrame[]} */
    const frames: CapturedFrame[] = [];
    if (options.interpolated) {
        // Modo interpolado: 1 frame por segundo, camera interpola entre keyframes
        const totalSec = Math.max(1, Math.round(playback.totalDuration / 1000));
        const frameCount = Math.max(2, totalSec);
        const savedPosition = playback.position;
        for (let i = 0; i < frameCount; i++) {
            const position = i / (frameCount - 1);
            _setProgress('capture', ((i + 1) / frameCount) * 30, `Capturando frame ${i + 1}/${frameCount}...`);
            // Usa seek() para posicionar camera na posicao interpolada
            seek(position);
            requestRender();
            await _delay(CAPTURE_DELAY_MS);
            const dataUrl = renderer.domElement.toDataURL(format, quality);
            // Metadados do keyframe mais proximo
            const nearestKf = keyframes.reduce((best: any, kf: any) =>
                Math.abs(kf.position - position) < Math.abs(best.position - position) ? kf : best,
            );
            const item = items.find((it: any) => it.id === nearestKf.itemId);
            frames.push({
                image: dataUrl,
                index: i,
                keyframeId: nearestKf.id,
                itemId: nearestKf.itemId,
                itemName: item ? item.name : 'Unknown',
                itemType: item ? item.type : 'unknown',
                position,
                duration: nearestKf.duration,
                transition: nearestKf.transition,
                annotation: nearestKf.annotation,
            });
        }
        // Restaurar posicao original
        seek(savedPosition);
    } else {
        // Modo original: 1 frame por keyframe
        for (let i = 0; i < keyframes.length; i++) {
            const kf = keyframes[i];
            const item = items.find((it: any) => it.id === kf.itemId);
            if (!item) continue;
            _setProgress(
                'capture',
                ((i + 1) / keyframes.length) * 30,
                `Capturando frame ${i + 1}/${keyframes.length}...`,
            );
            const cameraState = kf.cameraOverride || item.cameraState;
            if (cameraState) ctrl.setCameraState(cameraState);
            requestRender();
            await _delay(CAPTURE_DELAY_MS);
            const dataUrl = renderer.domElement.toDataURL(format, quality);
            frames.push({
                image: dataUrl,
                index: i,
                keyframeId: kf.id,
                itemId: item.id,
                itemName: item.name,
                itemType: item.type,
                position: kf.position,
                duration: kf.duration,
                transition: kf.transition,
                annotation: kf.annotation,
            });
        }
    }
    return frames;
}
/**
 * Constroi prompt ambiental contextualizado a partir dos frames e metadados.
 * O prompt descreve a cena para geracao de video IA.
 *
 * @param {Array<CapturedFrame>} frames - Frames capturados
 * @param {PromptOptions} [options]
 * @returns {string} - Prompt completo para geracao de video
 */
export function buildEnvironmentalPrompt(frames: CapturedFrame[], options: PromptOptions = {}): string {
    const style = options.style || 'photorealistic';
    const elements = getAllElements();
    const campaigns = getAllCampaigns();
    const playback = getPlayback();
    // Analisa composicao do modelo
    const familyCounts: any = {};
    for (const el of elements) {
        familyCounts[el.family] = (familyCounts[el.family] || 0) + 1;
    }
    // Determina escala espacial
    const positions = elements.map((el: any) => el.data?.position).filter(Boolean);
    let extent = 'compact site';
    if (positions.length > 1) {
        const xs = positions.map((p: any) => p.x || 0);
        const zs = positions.map((p: any) => p.z || 0);
        const rangeX = Math.max(...xs) - Math.min(...xs);
        const rangeZ = Math.max(...zs) - Math.min(...zs);
        const maxRange = Math.max(rangeX, rangeZ);
        if (maxRange > 5000) extent = 'large-scale regional area spanning several kilometers';
        else if (maxRange > 500) extent = 'medium-scale site covering several hundred meters';
        else extent = 'compact monitoring site';
    }
    // Descreve elementos por familia
    const familyDescriptions = [];
    if (familyCounts.well)
        familyDescriptions.push(`${familyCounts.well} monitoring wells (vertical boreholes with metal casings)`);
    if (familyCounts.plume)
        familyDescriptions.push(`${familyCounts.plume} contamination plume(s) (colored subsurface volumes)`);
    if (familyCounts.lake) familyDescriptions.push(`${familyCounts.lake} lake(s) (surface water body)`);
    if (familyCounts.river) familyDescriptions.push(`${familyCounts.river} river(s) (flowing water)`);
    if (familyCounts.building) familyDescriptions.push(`${familyCounts.building} building(s)`);
    if (familyCounts.tank) familyDescriptions.push(`${familyCounts.tank} storage tank(s)`);
    if (familyCounts.boundary) familyDescriptions.push(`${familyCounts.boundary} site boundary marker(s)`);
    if (familyCounts.spring)
        familyDescriptions.push(`${familyCounts.spring} spring(s) (natural groundwater discharge)`);
    // Descreve transicoes da timeline
    const transitionDescs = frames.map((f: CapturedFrame, i: number) => {
        if (i === 0) return `Frame 1: Overview of "${f.itemName}" (${f.itemType})`;
        const prev = frames[i - 1] as CapturedFrame;
        return `Frame ${i + 1}: Transition from "${prev!.itemName}" to "${f.itemName}" (${(f.transition / 1000).toFixed(1)}s)`;
    });
    // Estilo visual
    const totalDuration = Math.round(playback.totalDuration / 1000);
    return [
        `Generate a ${totalDuration}-second cinematic flyover video of an environmental monitoring site.`,
        '',
        `Scene description: A ${extent} featuring:`,
        ...familyDescriptions.map((d: any) => `- ${d}`),
        '',
        `Camera sequence (${frames.length} keyframes):`,
        ...transitionDescs.map((d: any) => `- ${d}`),
        '',
        campaigns.length > 0
            ? `Temporal context: ${campaigns.length} sampling campaign(s). Show seasonal/temporal changes if applicable.`
            : '',
        '',
        `Visual style: ${(STYLE_PROMPTS as Record<string, any>)[style] || STYLE_PROMPTS.photorealistic}`,
        '',
        'The video should smoothly interpolate between keyframe positions with professional camera movement.',
        'Include subtle environmental details: wind in vegetation, water reflections, dust particles.',
        options.customPrompt ? `\nAdditional user instructions: ${options.customPrompt}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
/**
 * Gera video a partir da timeline usando AI.
 * Pipeline completo: capture → prompt → send → poll.
 *
 * @param {GenerateVideoOptions} [options]
 * @returns {Promise<VideoResult>}
 */
export async function generateTimelineVideo(options: GenerateVideoOptions = {}): Promise<VideoResult> {
    const check = canGenerateVideo();
    if (!check.canGenerate) {
        throw new Error(check.reason || 'Video generation is not available');
    }
    _generating = true;
    _abortRequested = false;
    if (options.onProgress) _onProgressCallbacks.push(options.onProgress);
    try {
        // 1. CAPTURA DE FRAMES
        _setProgress(VIDEO_STAGE_CAPTURE, 0, 'Capturando frames da timeline...');
        const frames = await captureTimelineFrames({
            format: 'image/jpeg',
            quality: 0.85,
            interpolated: !!options.interpolated,
        });
        if (frames.length < 2) {
            throw new Error('Nao foi possivel capturar frames suficientes');
        }
        // 2. CONSTRUCAO DO PROMPT
        _setProgress(VIDEO_STAGE_PROMPT, 30, 'Construindo prompt ambiental...');
        const prompt = buildEnvironmentalPrompt(frames, {
            style: options.style || 'photorealistic',
            customPrompt: options.customPrompt || '',
        });
        // 3. GERACAO DE VIDEO via API especializada (Veo 3 ou Runway)
        const providerLabel = options.videoProvider === 'runway' ? 'Runway Gen-3' : 'Google Veo 3';
        _setProgress(VIDEO_STAGE_GENERATE, 40, `Enviando para ${providerLabel}...`);
        const { generateVideo } = await import('./videoGenerator.js' as string);
        _abortController = new AbortController();
        const videoResult = await generateVideo(prompt, frames, {
            videoProvider: options.videoProvider || 'veo3',
            videoKey: options.videoKey,
            durationSec: Math.round((getPlayback().totalDuration || 8000) / 1000),
            signal: _abortController.signal,
        });
        _setProgress(VIDEO_STAGE_COMPLETE, 100, 'Video gerado!');
        // 4. RESULTADO
        return {
            success: true,
            videoBlob: videoResult.blob,
            videoExt: videoResult.ext,
            prompt,
            frames: frames.map((f: any) => ({
                image: f.image,
                itemName: f.itemName,
                position: f.position,
            })),
            config: {
                style: options.style || 'photorealistic',
                resolution: options.resolution || '720p',
                fps: options.fps || 12,
                provider: videoResult.provider,
            },
            estimatedCost: _estimateCost(frames.length, options.resolution || '720p'),
        };
    } catch (err: any) {
        const isAbort = err?.name === 'AbortError' || /cancelad/i.test(String(err?.message || ''));
        if (!isAbort || !_abortRequested) {
            _setProgress(VIDEO_STAGE_ERROR, 0, err?.message || 'Falha na geracao de video');
        }
        throw err;
    } finally {
        _generating = false;
        _abortRequested = false;
        _abortController = null;
        if (options.onProgress) {
            _onProgressCallbacks = _onProgressCallbacks.filter((cb: any) => cb !== options.onProgress);
        }
    }
}
/**
 * Retorna o estado atual do progresso.
 * @returns {{ stage: string, percent: number, message: string }}
 */
export function getProgress() {
    return { ..._progress };
}
/**
 * Registra callback de progresso.
 * @param {(progress: VideoProgress) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onProgress(callback: (progress: VideoProgress) => void) {
    _onProgressCallbacks.push(callback);
    return () => {
        _onProgressCallbacks = _onProgressCallbacks.filter((cb: any) => cb !== callback);
    };
}
/**
 * Cancela geracao em andamento.
 */
export function cancelGeneration() {
    if (!_generating) return;
    _abortRequested = true;
    _setProgress(VIDEO_STAGE_CANCELLED, 0, 'Geracao cancelada');
    if (_abortController) {
        _abortController.abort(new DOMException('Cancelado pelo usuario', 'AbortError'));
    }
}
/**
 * Retorna true se esta gerando.
 * @returns {boolean}
 */
export function isGenerating() {
    return _generating;
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
/**
 * @param {string} stage
 * @param {number} percent
 * @param {string} message
 */
function _setProgress(stage: string, percent: number, message: string) {
    const normalizedStage: VideoStage = (VIDEO_STAGE_ORDER as readonly string[]).includes(stage)
        ? (stage as VideoStage)
        : VIDEO_STAGE_ERROR;
    const currentStage = _progress.stage as VideoStage;
    const allowed = VIDEO_STAGE_TRANSITIONS[currentStage];
    const canTransition = allowed?.has(normalizedStage) || currentStage === normalizedStage;
    if (!canTransition) return;
    _progress = {
        stage: normalizedStage,
        percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
        message: message || '',
    };
    for (const cb of _onProgressCallbacks) {
        try {
            cb(_progress);
        } catch (e: any) {
            console.debug('[videoBot] progressCb:', e?.message || e);
            /* ignore */
        }
    }
}
/** @param {number} ms */
function _delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * @param {number} frameCount
 * @param {string} resolution
 */
function _estimateCost(frameCount: number, resolution: string) {
    // Estimativas baseadas nos precos publicados (2025-2026)
    const baseCost = resolution === '4K' ? 0.08 : resolution === '1080p' ? 0.04 : 0.02;
    return {
        perFrame: baseCost,
        total: (baseCost * frameCount).toFixed(2),
        currency: 'USD',
        disclaimer: 'Estimativa. Custo real depende do provider e modelo usado.',
    };
}
