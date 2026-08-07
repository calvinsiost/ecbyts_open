// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Presentation Mode - Player Overlay + native video export workflow
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §6.4
// @ts-check
import { play, pause, resume, nextStep, previousStep, exit, getPlayerStatus, buildScenePlanForStep, getCurrentScenePlan, getActivePresentation, updatePresentation, playStepAudio, isScreenRecordingAvailable, startPlaybackCapture, composeEditedRecording, stopCapture, downloadBlob, sanitizeFilename, listVideoExportPresets, getVideoExportPreset, getSuggestedExportPreset, buildPresentationTimeline, resolveTimelineStep, shouldApplyPlaybackFrameClip, computePlaybackViewportTransform, getCaption, } from '../../core/presentation/index.js';
import { getCurrentLanguage } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
/** @typedef {'clean'|'technical'} SceneOverlayMode */
/** @typedef {{sceneOverlayMode?:SceneOverlayMode,captureMode?:string,recordVideo?:boolean}} PlayerOptions */
/** @typedef {{duration?:number,transitionDuration?:number,label?:string,annotation?:string,audio?:unknown,story?:unknown}} PresentationStepLike */
/** @typedef {{id?:string,title?:string,profileId?:string,videoPresetId?:string,steps?:PresentationStepLike[]}} PresentationLike */
/** @typedef {{blob:Blob,mime?:string,durationMs?:number,sizeBytes:number}} RecordingLike */
/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return String(error);
}
/** @type {any} */
let _overlayEl: any = null;
/** @type {any} */
let _progressTimer: any = null;
let _totalDurationSec = 0;
let _videoRecordingActive = false;
/** @type {any} */
let _videoRecordHandle: any = null;
let _videoRecordingMode = 'screen';
/** @type {any} */
let _exportModalEl: any = null;
/** @type {any} */
let _playbackViewportShell: any = null;
/** @type {SceneOverlayMode} */
let _sceneOverlayMode = 'clean';
const _exportState: any = {
    recording: null,
    presentation: null,
    previewUrl: null,
    captureMode: 'screen',
};
function _getMainArea() {
    return document.getElementById('main-area');
}
/**
 * @param {PlayerOptions} [options]
 * @returns {SceneOverlayMode}
 */
function _resolveSceneOverlayMode(options: any = {}) {
    return options?.sceneOverlayMode === 'technical' ? 'technical' : 'clean';
}
function _isTechnicalSceneOverlayEnabled() {
    return _sceneOverlayMode === 'technical';
}
function _ensurePlaybackViewportShell() {
    if (_playbackViewportShell?.isConnected)
        return _playbackViewportShell;
    const mainArea = _getMainArea();
    if (!mainArea)
        return null;
    const shell = document.createElement('div');
    shell.id = 'presentation-playback-viewport';
    shell.className = 'presentation-playback-viewport';
    shell.setAttribute('data-presentation-shell', 'true');
    const children = Array.from(mainArea.childNodes);
    children.forEach((child: any) => {
        shell.appendChild(child);
    });
    mainArea.appendChild(shell);
    mainArea.classList.add('presentation-playback-active');
    _playbackViewportShell = shell;
    return shell;
}
function _resetPlaybackFrameClip() {
    const mainArea = _getMainArea();
    if (mainArea) {
        mainArea.classList.remove('presentation-playback-clipped');
    }
    if (_playbackViewportShell) {
        _playbackViewportShell.style.removeProperty('transform');
    }
}
function _releasePlaybackViewportShell() {
    const mainArea = _getMainArea();
    if (!_playbackViewportShell || !mainArea)
        return;
    _resetPlaybackFrameClip();
    const children = Array.from(_playbackViewportShell.childNodes);
    children.forEach((child: any) => mainArea.appendChild(child));
    _playbackViewportShell.remove();
    _playbackViewportShell = null;
    mainArea.classList.remove('presentation-playback-active');
}
/**
 * @param {any} frameClip
 */
function _applyPlaybackFrameClip(frameClip: any) {
    const shell = _ensurePlaybackViewportShell();
    const mainArea = _getMainArea();
    if (!shell || !mainArea)
        return;
    if (!shouldApplyPlaybackFrameClip(frameClip)) {
        _resetPlaybackFrameClip();
        return;
    }
    const rect = mainArea.getBoundingClientRect();
    const plan = computePlaybackViewportTransform(frameClip, rect.width || 1, rect.height || 1);
    shell.style.transformOrigin = 'top left';
    shell.style.transform = plan.transform;
    mainArea.classList.add('presentation-playback-clipped');
}
// ----------------------------------------------------------------
// Overlay creation
// ----------------------------------------------------------------
function _createOverlay() {
    if (_overlayEl)
        return _overlayEl;
    /** @type {any} */
    const el = document.createElement('div');
    el.id = 'presentation-player-overlay';
    el.className = 'presentation-player presentation-overlay';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Reprodutor de Apresentacao');
    el.innerHTML = `
        <div class="presentation-player__panel">
            <div class="presentation-player__header">
                <div class="presentation-player__step-info">
                    <button type="button" class="presentation-player__nav-btn" id="player-btn-prev" title="${t('presentation.previous') || 'Anterior'}">⏮</button>
                    <span class="presentation-player__counter" id="player-step-counter">Step 0/0</span>
                    <span class="presentation-player__step-label" id="player-step-label">-</span>
                </div>
                <div class="presentation-player__header-actions">
                    <button type="button" class="presentation-player__nav-btn" id="player-btn-fullscreen" title="${t('presentation.fullscreen') || 'Tela cheia'}">⛶</button>
                    <button type="button" class="presentation-player__nav-btn" id="player-btn-close" title="${t('presentation.exit') || 'Sair'}">✕</button>
                </div>
            </div>
            <div class="presentation-player__progress-wrap">
                <div class="presentation-player__progress-bar" id="player-progress-bar">
                    <div class="presentation-player__progress-fill" id="player-progress-fill" style="width:0%"></div>
                </div>
                <div class="presentation-player__time" id="player-time">0:00 / 0:00</div>
            </div>
            <div class="presentation-player__controls">
                <button type="button" class="presentation-btn presentation-btn--primary" id="player-btn-playpause">▶ ${t('presentation.play') || 'Reproduzir'}</button>
                <button type="button" class="presentation-btn" id="player-btn-next">⏵ ${t('presentation.next') || 'Proximo'}</button>
            </div>
            <div class="presentation-player__annotation" id="player-annotation" style="display:none;">
                <span class="presentation-player__annotation-icon">📝</span>
                <span class="presentation-player__annotation-text" id="player-annotation-text"></span>
            </div>
            <div class="presentation-player__caption" id="player-caption" style="display:none;" aria-live="polite">
                <span id="player-caption-text"></span>
            </div>
        </div>
        <div class="presentation-player__scene-overlay" id="player-scene-overlay" aria-hidden="true"></div>
    `;
    (el.querySelector('#player-btn-prev') as any).addEventListener('click', () => previousStep());
    (el.querySelector('#player-btn-next') as any).addEventListener('click', () => nextStep());
    (el.querySelector('#player-btn-playpause') as any).addEventListener('click', () => {
        const state = getPlayerStatus().state;
        if (state === 'playing')
            pause();
        else if (state === 'paused')
            resume();
    });
    (el.querySelector('#player-btn-close') as any).addEventListener('click', () => {
        exit();
        _destroyOverlay();
    });
    (el.querySelector('#player-btn-fullscreen') as any).addEventListener('click', _toggleFullscreen);
    document.body.appendChild(el);
    _overlayEl = el;
    return el;
}
function _createExportModal() {
    if (_exportModalEl)
        return _exportModalEl;
    /** @type {any} */
    const el = document.createElement('div');
    el.id = 'presentation-export-modal';
    el.className = 'presentation-modal presentation-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Exportar video da apresentacao');
    el.innerHTML = `
        <div class="presentation-modal__panel presentation-modal__panel--export">
            <div class="presentation-modal__header">
                <span class="presentation-modal__title">Exportar video</span>
                <button type="button" class="presentation-modal__close" id="presentation-export-close" aria-label="Fechar">×</button>
            </div>
            <div class="presentation-modal__body presentation-export">
                <div class="presentation-export__media">
                    <video id="presentation-export-preview" class="presentation-export__preview" controls playsinline></video>
                    <div class="presentation-export__meta" id="presentation-export-meta"></div>
                </div>
                <div class="presentation-export__controls">
                    <label class="presentation-field">
                        <span class="presentation-field__label">Preset</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:select:L219" class="presentation-field__input" id="presentation-export-preset"></select>
                    </label>
                    <div class="presentation-field__row">
                        <label class="presentation-field">
                            <span class="presentation-field__label">Trim inicio (s)</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:input:L224" type="number" class="presentation-field__input" id="presentation-export-start" min="0" step="0.1" value="0">
                        </label>
                        <label class="presentation-field">
                            <span class="presentation-field__label">Trim fim (s)</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:input:L228" type="number" class="presentation-field__input" id="presentation-export-end" min="0.1" step="0.1" value="0">
                        </label>
                    </div>
                    <label class="presentation-field">
                        <span class="presentation-field__label">Legendas / overlays</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:select:L233" class="presentation-field__input" id="presentation-export-captions-mode">
                            <option value="captured">Usar o que foi capturado na tela</option>
                            <option value="rebuild">Recompor legenda e headline da apresentacao</option>
                            <option value="off">Nao adicionar nada extra</option>
                        </select>
                    </label>
                    <label class="presentation-field presentation-field--inline">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:input:L240" type="checkbox" id="presentation-export-keep-source-audio" checked>
                        <span>Manter audio capturado</span>
                    </label>
                    <div class="presentation-field__row">
                        <label class="presentation-field">
                            <span class="presentation-field__label">Volume do audio capturado</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:input:L246" type="range" class="presentation-field__input" id="presentation-export-source-volume" min="0" max="1.6" step="0.05" value="1">
                        </label>
                        <label class="presentation-field">
                            <span class="presentation-field__label">Audio extra</span>
                            <input type="file" class="presentation-field__input" id="presentation-export-audio-file" accept="audio/*">
                        </label>
                    </div>
                    <label class="presentation-field">
                        <span class="presentation-field__label">Volume do audio extra</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:presentationPlayer:input:L255" type="range" class="presentation-field__input" id="presentation-export-audio-volume" min="0" max="1" step="0.05" value="0.14">
                    </label>
                    <div class="presentation-export__notes" id="presentation-export-notes"></div>
                </div>
            </div>
            <div class="presentation-modal__footer">
                <button type="button" class="presentation-btn" id="presentation-export-download-raw">Baixar bruto</button>
                <button type="button" class="presentation-btn presentation-btn--primary" id="presentation-export-run">Exportar final</button>
            </div>
        </div>
    `;
    (el.querySelector('#presentation-export-close') as any).addEventListener('click', _closeExportModal);
    el.addEventListener('click', 
    (event: any) => {
        if (event.target === el)
            _closeExportModal();
    });
    (el.querySelector('#presentation-export-preset') as any).addEventListener('change', 
    (event: any) => {
        _applyExportPresetToForm((event.target as any).value);
    });
    (el.querySelector('#presentation-export-download-raw') as any).addEventListener('click', () => {
        if (!_exportState.recording?.blob || !_exportState.presentation)
            return;
        const baseName = sanitizeFilename(_exportState.presentation.title || 'apresentacao');
        const ext = _exportState.recording.mime?.includes('mp4') ? 'mp4' : 'webm';
        downloadBlob(_exportState.recording.blob, `${baseName}-raw.${ext}`);
    });
    (el.querySelector('#presentation-export-run') as any).addEventListener('click', _handleExportConfirm);
    document.body.appendChild(el);
    _exportModalEl = el;
    return el;
}
function _closeExportModal() {
    if (_exportState.previewUrl) {
        URL.revokeObjectURL(_exportState.previewUrl);
        _exportState.previewUrl = null;
    }
    if (_exportModalEl) {
        const preview = _exportModalEl.querySelector('#presentation-export-preview');
        if (preview) {
            preview.pause?.();
            preview.removeAttribute('src');
            preview.load?.();
        }
        _exportModalEl.style.display = 'none';
        _exportModalEl.setAttribute('aria-hidden', 'true');
    }
    _exportState.recording = null;
    _exportState.presentation = null;
    _exportState.captureMode = 'screen';
}
/**
 * @param {string} presetId
 */
function _applyExportPresetToForm(presetId: any) {
    if (!_exportModalEl || !_exportState.recording)
        return;
    const preset = getVideoExportPreset(presetId);
    const durationSec = Math.max(0.1, (_exportState.recording.durationMs || 0) / 1000);
    _exportModalEl.querySelector('#presentation-export-start').value = String(preset.trimPadStart || 0);
    _exportModalEl.querySelector('#presentation-export-end').value = String(Math.max(0.1, durationSec - (preset.trimPadEnd || 0)));
    _exportModalEl.querySelector('#presentation-export-captions-mode').value = preset.captionsMode || 'captured';
    _exportModalEl.querySelector('#presentation-export-keep-source-audio').checked = preset.keepSourceAudio !== false;
    _exportModalEl.querySelector('#presentation-export-source-volume').value = String(preset.sourceAudioVolume || 1);
    _exportModalEl.querySelector('#presentation-export-audio-volume').value = String(preset.backgroundAudioVolume || 0.14);
    _exportModalEl.querySelector('#presentation-export-notes').textContent = preset.description || '';
    if (_exportState.presentation?.id) {
        try {
            updatePresentation(_exportState.presentation.id, { videoPresetId: presetId });
        }
        catch (e: any) {
            console.debug('[presentationPlayer] updatePresetPersist:', _errorMessage(e));
            /* ignore */
        }
    }
}
/**
 * @param {any} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} radius
 * @param {string} fillStyle
 * @param {string|null} [strokeStyle]
 */
function _drawRoundedRect(ctx: any, x: any, y: any, w: any, h: any, radius: any, fillStyle: any, strokeStyle: any = null) {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
/**
 * @param {any} ctx
 * @param {unknown} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {CanvasTextAlign} [align]
 */
function _drawWrappedText(ctx: any, text: any, x: any, y: any, maxWidth: any, lineHeight: any, align: any = "left") {
    const words = String(text || '')
        .split(/\s+/)
        .filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach((word: any) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !current) {
            current = candidate;
            return;
        }
        lines.push(current);
        current = word;
    });
    if (current)
        lines.push(current);
    ctx.textAlign = align;
    lines.forEach((line: any, idx: any) => {
        ctx.fillText(line, x, y + idx * lineHeight);
    });
}
/**
 * @param {PresentationLike} presentation
 * @returns {any}
 */
function _createExportDrawFrame(presentation: any) {
    if (!presentation?.steps?.length)
        return null;
    const timeline = buildPresentationTimeline(presentation);
    /** @type {Map<number, any>} */
    const cache = new Map();
    return (
    (frame: any) => {
        const { ctx, canvas, absoluteSec } = frame;
        const entry = resolveTimelineStep(timeline, absoluteSec);
        if (!entry)
            return;
        let scenePlan = cache.get(entry.idx);
        if (!scenePlan) {
            scenePlan = buildScenePlanForStep(presentation, entry.idx, 'clean_export');
            cache.set(entry.idx, scenePlan);
        }
        /** @type {any[]} */
        const blocks = scenePlan?.composition?.blocks || [];
        blocks.forEach((block: any) => {
            const left = block.box.x * canvas.width;
            const top = block.box.y * canvas.height;
            const width = block.box.w * canvas.width;
            const fontScale = block.fontScale || 1;
            const align = block.align || 'left';
            if (block.type === 'headline') {
                const pad = 18;
                _drawRoundedRect(ctx, left, top, width, 84 * fontScale, 14, 'rgba(8, 18, 30, 0.72)', '#4fc3f7');
                ctx.fillStyle = '#ffffff';
                ctx.font = `${Math.round(30 * fontScale)}px "Segoe UI", sans-serif`;
                ctx.textBaseline = 'top';
                _drawWrappedText(ctx, block.text, left + pad, top + 16, width - pad * 2, 34 * fontScale, align);
                return;
            }
            if (block.type === 'caption') {
                const pad = 18;
                _drawRoundedRect(ctx, left, top, width, 96 * fontScale, 16, 'rgba(0, 0, 0, 0.7)');
                ctx.fillStyle = '#ffffff';
                ctx.font = `${Math.round(26 * fontScale)}px "Segoe UI", sans-serif`;
                ctx.textBaseline = 'top';
                _drawWrappedText(ctx, block.text, left + pad, top + 14, width - pad * 2, 30 * fontScale, align);
                return;
            }
            if (block.type === 'proof') {
                _drawRoundedRect(ctx, left, top, width, 34 * fontScale, 12, 'rgba(22, 62, 33, 0.82)', '#81c784');
                ctx.fillStyle = '#d8ffd8';
                ctx.font = `${Math.round(16 * fontScale)}px "Segoe UI", sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = align;
                const anchorX = align === 'center' ? left + width / 2 : align === 'right' ? left + width - 14 : left + 14;
                ctx.fillText(block.text, anchorX, top + 17 * fontScale);
                return;
            }
            if (block.type === 'cta') {
                _drawRoundedRect(ctx, left, top, width, 92 * fontScale, 18, 'rgba(28, 108, 184, 0.92)', '#4fc3f7');
                ctx.fillStyle = '#ffffff';
                ctx.font = `${Math.round(34 * fontScale)}px "Segoe UI", sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = align;
                const anchorX = align === 'center' ? left + width / 2 : align === 'right' ? left + width - 20 : left + 20;
                ctx.fillText(block.text, anchorX, top + 46 * fontScale);
            }
        });
    });
}
/**
 * @param {RecordingLike} recording
 * @param {PresentationLike|null} presentation
 * @param {{captureMode?:string}} [options]
 */
function _openExportModal(recording: any, presentation: any, options: any = {}) {
    const modal = _createExportModal();
    _exportState.recording = recording;
    _exportState.presentation = presentation;
    _exportState.captureMode = options.captureMode || 'screen';
    if (_exportState.previewUrl) {
        URL.revokeObjectURL(_exportState.previewUrl);
    }
    _exportState.previewUrl = URL.createObjectURL(recording.blob);
    const presetId = String(presentation?.videoPresetId || getSuggestedExportPreset(presentation?.profileId || ''));
    const presetSelect = modal.querySelector('#presentation-export-preset');
    /** @type {any[]} */
    const presets = listVideoExportPresets();
    presetSelect.innerHTML = presets.map((preset: any) => `<option value="${preset.id}">${preset.label}</option>`).join('');
    presetSelect.value = presetId;
    const preview = modal.querySelector('#presentation-export-preview');
    preview.src = _exportState.previewUrl;
    preview.load();
    const durationSec = Math.max(0.1, (recording.durationMs || 0) / 1000);
    modal.querySelector('#presentation-export-meta').textContent =
        `captura ${_exportState.captureMode} · ${(recording.sizeBytes / 1024 / 1024).toFixed(2)} MB · ${durationSec.toFixed(1)} s`;
    _applyExportPresetToForm(presetId);
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
}
async function _handleExportConfirm() {
    if (!_exportModalEl || !_exportState.recording?.blob || !_exportState.presentation)
        return;
    const button = _exportModalEl.querySelector('#presentation-export-run');
    const presetId = _exportModalEl.querySelector('#presentation-export-preset').value;
    const startSec = Number(_exportModalEl.querySelector('#presentation-export-start').value || 0);
    const endSec = Number(_exportModalEl.querySelector('#presentation-export-end').value || 0);
    const captionsMode = _exportModalEl.querySelector('#presentation-export-captions-mode').value;
    const keepSourceAudio = _exportModalEl.querySelector('#presentation-export-keep-source-audio').checked;
    const sourceAudioVolume = Number(_exportModalEl.querySelector('#presentation-export-source-volume').value || 1);
    const backgroundAudioFile = _exportModalEl.querySelector('#presentation-export-audio-file').files?.[0] || null;
    const backgroundAudioVolume = Number(_exportModalEl.querySelector('#presentation-export-audio-volume').value || 0);
    const drawFrame = captionsMode === 'rebuild' ? _createExportDrawFrame(_exportState.presentation) : null;
    button.disabled = true;
    button.textContent = 'Exportando...';
    try {
        const result = /*as:{blob:Blob,mime:string}*/ await composeEditedRecording(_exportState.recording.blob, {
            startSec,
            endSec,
            keepSourceAudio,
            sourceAudioVolume,
            backgroundAudioFile,
            backgroundAudioVolume,
            drawFrame,
        });
        const baseName = sanitizeFilename(_exportState.presentation.title || 'apresentacao');
        const ext = (result as any).mime.includes('mp4') ? 'mp4' : 'webm';
        downloadBlob((result as any).blob, `${baseName}-${presetId}.${ext}`);
        showToast(`Video exportado (${ext.toUpperCase()})`, 'success');
        _closeExportModal();
    }
    catch (error: any) {
        console.warn('[presentation-player] export failed', error);
        showToast(`Falha ao exportar: ${_errorMessage(error)}`, 'error');
    }
    finally {
        button.disabled = false;
        button.textContent = 'Exportar final';
    }
}
async function _destroyOverlay() {
    if (_progressTimer) {
        clearInterval(_progressTimer);
        _progressTimer = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    document.removeEventListener('keydown', _onKeydown);
    if (_videoRecordingActive && _videoRecordHandle) {
        try {
            const result = await stopCapture();
            const presentation = getActivePresentation();
            _openExportModal(result, presentation, { captureMode: _videoRecordingMode });
            showToast('Captura concluida. Ajuste trim, audio e exporte o corte final.', 'success');
        }
        catch (e: any) {
            console.warn('[presentation-player] video stop failed', _errorMessage(e));
        }
        _videoRecordingActive = false;
        _videoRecordHandle = null;
        _videoRecordingMode = 'screen';
    }
    _releasePlaybackViewportShell();
    _sceneOverlayMode = 'clean';
}
function _toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch((e) => {
            console.debug('[presentation-player] fullscreen', _errorMessage(e));
        });
    }
    else {
        document.exitFullscreen?.().catch((e) => {
            console.debug('[presentation-player] exit-fullscreen', _errorMessage(e));
        });
    }
}
/**
 * @param {KeyboardEvent} e
 */
function _onKeydown(e: any) {
    const state = getPlayerStatus().state;
    if (state !== 'playing' && state !== 'paused')
        return;
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousStep();
    }
    else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
    }
    else if (e.key === ' ') {
        e.preventDefault();
        if (state === 'playing')
            pause();
        else
            resume();
    }
    else if (e.key === 'Escape') {
        e.preventDefault();
        exit();
        _destroyOverlay();
    }
}
/**
 * @param {PresentationLike} presentation
 * @returns {number}
 */
function _computeTotalDuration(presentation: any) {
    if (!presentation?.steps)
        return 0;
    return presentation.steps.reduce((sum: any, step: any) => sum + (step.duration || 3) + (step.transitionDuration || 1.5), 0);
}
/**
 * @param {number} sec
 * @returns {string}
 */
function _formatTime(sec: any) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function _detectViewport() {
    if (typeof window === 'undefined')
        return 'desktop';
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = h > 0 ? w / h : 16 / 9;
    if (ratio < 0.9)
        return 'mobile';
    return 'desktop';
}
/**
 * @param {any} container
 * @param {any} frameClip
 */
function _renderFrameClipGuide(container: any, frameClip: any) {
    if (!container || !frameClip?.rect || frameClip.mode === 'full')
        return;
    const guide = document.createElement('div');
    guide.className = 'presentation-scene-clip';
    guide.setAttribute('data-mode', frameClip.mode);
    guide.style.left = `${(frameClip.rect.x * 100).toFixed(2)}%`;
    guide.style.top = `${(frameClip.rect.y * 100).toFixed(2)}%`;
    guide.style.width = `${(frameClip.rect.w * 100).toFixed(2)}%`;
    guide.style.height = `${(frameClip.rect.h * 100).toFixed(2)}%`;
    const label = document.createElement('div');
    label.className = 'presentation-scene-clip__label';
    label.textContent = `clip: ${frameClip.mode}`;
    guide.appendChild(label);
    container.appendChild(guide);
}
/**
 * @param {any} scenePlan
 */
function _renderScenePlan(scenePlan: any) {
    if (!_overlayEl)
        return;
    const container = _overlayEl.querySelector('#player-scene-overlay');
    if (!container)
        return;
    if (!scenePlan || !scenePlan.composition || !scenePlan.composition.blocks) {
        container.innerHTML = '';
        container.setAttribute('aria-hidden', 'true');
        return;
    }
    const { frameClip } = scenePlan.composition;
    const blocks = scenePlan.composition.blocks;
    const viewport = scenePlan.viewport || 'desktop';
    const html = blocks
        .map((block: any) => {
        const left = (block.box.x * 100).toFixed(2);
        const top = (block.box.y * 100).toFixed(2);
        const width = (block.box.w * 100).toFixed(2);
        const fontScale = block.fontScale || 1;
        const align = block.align || 'left';
        const safeText = String(block.text || '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<div class="presentation-scene-block presentation-scene-block--${block.type}"
                        data-type="${block.type}"
                        style="left:${left}%;top:${top}%;width:${width}%;text-align:${align};--fs:${fontScale};z-index:${block.zIndex || 10}">
                        ${safeText}
                    </div>`;
    })
        .join('');
    container.innerHTML = html;
    container.setAttribute('aria-hidden', 'false');
    container.setAttribute('data-viewport', viewport);
    _renderFrameClipGuide(container, frameClip);
    const focusRect = scenePlan.step?.focus?.rect;
    if (focusRect && scenePlan.shot?.highlight?.enabled) {
        const color = scenePlan.shot.highlight.color || '#4fc3f7';
        const pulseMs = scenePlan.shot.highlight.pulseMs || 0;
        const highlight = document.createElement('div');
        highlight.className = 'presentation-scene-highlight';
        highlight.style.left = `${(focusRect.x * 100).toFixed(2)}%`;
        highlight.style.top = `${(focusRect.y * 100).toFixed(2)}%`;
        highlight.style.width = `${(focusRect.w * 100).toFixed(2)}%`;
        highlight.style.height = `${(focusRect.h * 100).toFixed(2)}%`;
        highlight.style.borderColor = color;
        if (pulseMs > 0)
            highlight.style.animationDuration = `${pulseMs}ms`;
        container.appendChild(highlight);
    }
}
/**
 * @param {any} status
 */
function _updateUI(status: any) {
    if (!_overlayEl)
        return;
    const presentation = status.presentation;
    const idx = status.currentStepIdx;
    const total = status.totalSteps;
    const step = presentation?.steps?.[idx];
    const counterEl = _overlayEl.querySelector('#player-step-counter');
    if (counterEl)
        counterEl.textContent = `Step ${idx + 1}/${total}`;
    const labelEl = _overlayEl.querySelector('#player-step-label');
    if (labelEl)
        labelEl.textContent = step?.label ? `"${step.label}"` : '-';
    const playBtn = _overlayEl.querySelector('#player-btn-playpause');
    if (playBtn) {
        playBtn.innerHTML =
            status.state === 'playing'
                ? `⏸ ${t('presentation.pause') || 'Pausar'}`
                : `▶ ${t('presentation.resume') || 'Continuar'}`;
    }
    const annotationWrap = _overlayEl.querySelector('#player-annotation');
    const annotationText = _overlayEl.querySelector('#player-annotation-text');
    if (annotationWrap && annotationText) {
        if (step?.annotation) {
            annotationWrap.style.display = 'flex';
            annotationText.textContent = step.annotation;
        }
        else {
            annotationWrap.style.display = 'none';
        }
    }
    const captionWrap = _overlayEl.querySelector('#player-caption');
    const captionText = _overlayEl.querySelector('#player-caption-text');
    if (captionWrap && captionText && step) {
        const lang = (() => {
            try {
                const resolved = getCurrentLanguage();
                if (resolved === 'pt')
                    return 'pt-BR';
                if (resolved === 'en')
                    return 'en-US';
                if (resolved === 'es')
                    return 'es-LA';
                return resolved;
            }
            catch {
                return 'pt-BR';
            }
        })();
        const caption = getCaption(step, lang);
        if (caption && caption.trim()) {
            captionWrap.style.display = 'block';
            captionText.textContent = caption;
        }
        else {
            captionWrap.style.display = 'none';
        }
    }
    const scenePlan = getCurrentScenePlan();
    if (_isTechnicalSceneOverlayEnabled()) {
        if (scenePlan && step?.story) {
            _renderScenePlan(scenePlan);
            _applyPlaybackFrameClip(scenePlan.frameClip || scenePlan.composition?.frameClip);
        }
        else if (step) {
            const fresh = /*as:any*/ buildScenePlanForStep(presentation, idx, _detectViewport());
            if (fresh?.composition?.blocks?.length) {
                _renderScenePlan(fresh);
                _applyPlaybackFrameClip(fresh.frameClip || fresh.composition?.frameClip);
            }
            else {
                _renderScenePlan(null);
                _resetPlaybackFrameClip();
            }
        }
        else {
            _renderScenePlan(null);
            _resetPlaybackFrameClip();
        }
    }
    else {
        _renderScenePlan(null);
        _resetPlaybackFrameClip();
    }
    const elapsedBefore = (presentation?.steps || [])
        .slice(0, idx)
        .reduce((sum: any, item: any) => sum + (item.duration || 3) + (item.transitionDuration || 1.5), 0);
    const currentDur = (step?.duration || 3) + (step?.transitionDuration || 1.5);
    const pct = _totalDurationSec > 0 ? ((elapsedBefore + currentDur * 0.5) / _totalDurationSec) * 100 : 0;
    const fill = _overlayEl.querySelector('#player-progress-fill');
    if (fill)
        fill.style.width = `${Math.min(100, pct)}%`;
    const timeEl = _overlayEl.querySelector('#player-time');
    if (timeEl) {
        const elapsedSec = elapsedBefore + currentDur * 0.5;
        timeEl.textContent = `${_formatTime(elapsedSec)} / ${_formatTime(_totalDurationSec)}`;
    }
}
// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------
/**
 * @param {string} presentationId
 * @param {PlayerOptions} [options]
 */
export async function openPlayer(presentationId: any, options: any = {}) {
    let presentation = getActivePresentation();
    if (!presentation || presentation.id !== presentationId) {
        // Fallback: resolve by ID directly so the player can open even if
        // active presentation state is momentarily stale (v14ui robustness).
        const { getPresentation: _getPresentation } = await import('../../core/presentation/manager.js' as string);
        presentation = _getPresentation(presentationId);
    }
    if (!presentation) {
        showToast(t('presentation.notFound') || 'Apresentacao nao encontrada', 'error');
        return;
    }
    if (!presentation.steps?.length) {
        showToast(t('presentation.empty') || 'Apresentacao vazia', 'error');
        return;
    }
    _closeExportModal();
    _createOverlay();
    _overlayEl.style.display = 'flex';
    _overlayEl.setAttribute('aria-hidden', 'false');
    _totalDurationSec = _computeTotalDuration(presentation);
    _sceneOverlayMode = _resolveSceneOverlayMode(options);
    document.addEventListener('keydown', _onKeydown);
    const camera = window.__ecbtCamera || null;
    const controls = window.__ecbtControls || null;
    _videoRecordingActive = false;
    _videoRecordHandle = null;
    _videoRecordingMode = options.captureMode || 'screen';
    if (options.recordVideo) {
        const canvas = 
        /*as:any*/ document.querySelector('#canvas-container canvas') || document.querySelector('canvas');
        if (isScreenRecordingAvailable()) {
            showToast('Compartilhe esta aba com audio para capturar exatamente o que esta sendo reproduzido.', 'info');
        }
        try {
            _videoRecordHandle = await startPlaybackCapture(canvas, {
                mode: options.captureMode || 'screen',
                fps: 30,
                captureAudio: true,
            });
            _videoRecordingActive = true;
            _videoRecordingMode = options.captureMode || (isScreenRecordingAvailable() ? 'screen' : 'canvas');
            showToast('Gravando a reproducao. O corte final abre ao terminar.', 'info');
        }
        catch (error: any) {
            console.warn('[presentation-player] capture start failed', _errorMessage(error));
            showToast((t('presentation.video.error') || 'Falha ao iniciar gravacao: ') + _errorMessage(error), 'warning');
        }
    }
    try {
        await play(presentationId, {
            camera,
            controls,
            viewport: _detectViewport(),
            /**
             * @param {number} _idx
             * @param {any} step
             * @param {any} scenePlan
             */
            onStepChange: (_idx: any, step: any, scenePlan: any) => {
                _updateUI(getPlayerStatus());
                if (_isTechnicalSceneOverlayEnabled() && scenePlan) {
                    _renderScenePlan(scenePlan);
                    return;
                }
                _renderScenePlan(null);
                _resetPlaybackFrameClip();
            },
            playAudio: (step: any) => {
                if (!step?.audio)
                    return null;
                try {
                    return playStepAudio(step);
                }
                catch (error: any) {
                    console.warn('[player] audio error', error);
                }
                return null;
            },
        });
        _updateUI(getPlayerStatus());
    }
    catch (error: any) {
        showToast(_errorMessage(error), 'error');
        _destroyOverlay();
    }
    if (_progressTimer)
        clearInterval(_progressTimer);
    _progressTimer = setInterval(() => {
        const state = getPlayerStatus().state;
        if (state === 'playing' || state === 'paused') {
            _updateUI(getPlayerStatus());
        }
        else {
            _destroyOverlay();
        }
    }, 500);
}
export function closePlayer() {
    exit();
    _destroyOverlay();
}
