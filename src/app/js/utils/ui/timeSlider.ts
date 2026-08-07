// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   TIME SLIDER — DOM slider para controle temporal da cena 3D
   Componente horizontal na base do viewport que permite navegar
   entre campanhas no tempo. Inclui marcadores de campanha,
   controles de play/pause, velocidade e label de data.

   Nao bloqueia o render loop — usa requestAnimationFrame para
   animacao suave do slider.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { sortCampaignsByDate, normalizedToCampaignIndex } from '../../core/sequencer/temporalFilter.js';
import { getScene } from '../scene/setup.js';
import { applyTemporalClip, timeToX } from '../../core/temporal/index.js';
const log = createLogger('timeSlider');
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
const _state: any = {
    /** @type {HTMLElement|null} */
    container: null,
    root: null as any,
    rangeInput: null as any,
    /** @type {any[]} Sorted campaigns */
    campaigns: [],
    /** @type {number} Normalized time 0..1 */
    currentTime: 0,
    playing: false,
    /** @type {number} Playback speed multiplier */
    speed: 1,
    /** @type {number|null} requestAnimationFrame ID */
    rafId: null,
    /** @type {number} Last animation timestamp */
    lastTimestamp: 0,
    /** @type {Array<Function>} Change callbacks */
    callbacks: [],
    visible: false,
};
const SPEEDS = [0.5, 1, 2, 4];
const STEP_DURATION_MS = 2000; // Base duration per campaign step at 1x speed
// ----------------------------------------------------------------
// DOM CREATION
// ----------------------------------------------------------------
/**
 * Build the time slider DOM structure.
 * Cria slider horizontal com controles de playback.
 *
 * @returns {HTMLElement} Root element of the time slider
 */
function _buildDOM() {
    const root = document.createElement('div');
    root.id = 'time-slider-panel';
    root.className = 'time-slider-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('data-panel', 'time-slider');
    root.setAttribute('aria-label', t('timeSlider.title') || 'Time Slider');
    root.innerHTML = `
        <div class="time-slider-controls">
            <button class="time-slider-btn time-slider-play"
                    id="time-slider-play-btn"
                    title="${escapeHtml(t('timeSlider.play') || 'Play')}"
                    data-cc-action="cc-9dad8e36">
                &#9654;
            </button>
            <button class="time-slider-btn time-slider-pause"
                    id="time-slider-pause-btn"
                    title="${escapeHtml(t('timeSlider.pause') || 'Pause')}"
                    data-cc-action="cc-f7a1aad8"
                    style="display:none;">
                &#10074;&#10074;
            </button>
            <div class="time-slider-track-wrap">
                <div class="time-slider-markers" id="time-slider-markers"></div>
                <input data-field-meta="true" data-field-meta-key="auto:time-slider-range" type="range" class="time-slider-range"
                       id="time-slider-range"
                       min="0" max="1000" value="0" step="1"
                       aria-label="${escapeHtml(t('timeSlider.title') || 'Timeline position')}">
            </div>
            <div class="time-slider-label" id="time-slider-label">--</div>
            <select data-field-meta="true" data-field-meta-key="auto:time-slider-speed" class="time-slider-speed" id="time-slider-speed"
                    title="${escapeHtml(t('timeSlider.speed') || 'Speed')}"
                    data-cc-change="cc-db00c5b4">
                ${SPEEDS.map((s: any) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}x</option>`).join('')}
            </select>
        </div>
    `;
    return root;
}
// ----------------------------------------------------------------
// MARKER RENDERING
// ----------------------------------------------------------------
/**
 * Render campaign markers on the slider track.
 * Cria pontos visuais nas posicoes correspondentes a cada campanha.
 */
function _renderMarkers() {
    const container = document.getElementById('time-slider-markers');
    if (!container)
        return;
    container.innerHTML = '';
    const n = _state.campaigns.length;
    if (n === 0)
        return;
    _state.campaigns.forEach((camp: any, i: any) => {
        const pct = n === 1 ? 50 : (i / (n - 1)) * 100;
        const dot = document.createElement('span');
        dot.className = 'time-slider-marker';
        dot.style.left = `${pct}%`;
        dot.title = escapeHtml(camp.name || camp.startDate || `#${i + 1}`);
        if (camp.color) {
            dot.style.backgroundColor = camp.color;
        }
        container.appendChild(dot);
    });
}
// ----------------------------------------------------------------
// LABEL UPDATE
// ----------------------------------------------------------------
/**
 * Update the current campaign label display.
 * Mostra o nome e data da campanha na posicao atual do slider.
 */
function _updateLabel() {
    const label = document.getElementById('time-slider-label');
    if (!label)
        return;
    const n = _state.campaigns.length;
    if (n === 0) {
        label.textContent = t('timeSlider.noCampaigns') || '--';
        return;
    }
    const idx = normalizedToCampaignIndex(_state.currentTime, n);
    const camp = _state.campaigns[idx];
    if (!camp) {
        label.textContent = '--';
        return;
    }
    const name = camp.name || `${t('timeSlider.campaign') || 'Campaign'} ${idx + 1}`;
    const date = camp.startDate || '';
    label.textContent = date ? `${name} (${date})` : name;
}
// ----------------------------------------------------------------
// PLAYBACK ANIMATION
// ----------------------------------------------------------------
/**
 * Animation loop for auto-play.
 * Avanca o slider suavemente usando requestAnimationFrame.
 *
 * @param {number} timestamp - rAF timestamp
 */
function _animationStep(timestamp: any) {
    if (!_state.playing)
        return;
    if (_state.lastTimestamp === 0) {
        _state.lastTimestamp = timestamp;
    }
    const elapsed = timestamp - _state.lastTimestamp;
    _state.lastTimestamp = timestamp;
    const n = _state.campaigns.length;
    if (n <= 1) {
        pause();
        return;
    }
    // Calculate increment: full range in (n-1) * STEP_DURATION_MS / speed
    const totalDuration = ((n - 1) * STEP_DURATION_MS) / _state.speed;
    const increment = elapsed / totalDuration;
    _state.currentTime = Math.min(1, _state.currentTime + increment);
    _syncRangeInput();
    _updateLabel();
    _notifyCallbacks();
    if (_state.currentTime >= 1) {
        pause();
        return;
    }
    _state.rafId = requestAnimationFrame(_animationStep);
}
// ----------------------------------------------------------------
// INTERNAL SYNC
// ----------------------------------------------------------------
/**
 * Sync the range input value to current state.
 */
function _syncRangeInput() {
    if (_state.rangeInput) {
        _state.rangeInput.value = String(Math.round(_state.currentTime * 1000));
    }
}
/**
 * Notify all registered callbacks of time change.
 */
function _notifyCallbacks() {
    // 3D Temporal Clipping Integration
    const scene = getScene();
    if (scene) {
        const xCurrent = timeToX(_state.currentTime, {
            mode: 'date',
            xScale: 100,
            xOffset: 0,
            campaigns: _state.campaigns,
        });
        applyTemporalClip(/** @type {any} */ (scene), xCurrent);
    }
    for (const cb of _state.callbacks) {
        try {
            cb(_state.currentTime, _state.campaigns);
        }
        catch (err: any) {
            log.error('Time change callback error:', /** @type {any} */ (err)?.message || err);
        }
    }
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Initialize the time slider component.
 * Cria o DOM e anexa ao container fornecido.
 *
 * @param {HTMLElement} container - Parent element to attach slider to
 */
export function initTimeSlider(container: any) {
    if (!container) {
        log.error('initTimeSlider: no container provided');
        return;
    }
    // Cleanup previous instance if any
    destroy();
    _state.container = container;
    _state.root = _buildDOM();
    container.appendChild(_state.root);
    _state.rangeInput = /** @type {HTMLInputElement|null} */ (document.getElementById('time-slider-range'));
    if (_state.rangeInput) {
        _state.rangeInput.addEventListener('input', _onRangeInput);
    }
    _state.visible = true;
    _renderMarkers();
    _updateLabel();
    log.info('Time slider initialized');
}
/**
 * Handle range input changes from user scrubbing.
 *
 * @param {Event} e - Input event
 */
function _onRangeInput(e: Event) {
    const target = (e.target) as HTMLInputElement;
    const val = parseInt(target.value, 10);
    _state.currentTime = val / 1000;
    _updateLabel();
    _notifyCallbacks();
}
/**
 * Set campaigns to display on the timeline.
 * Ordena por data e renderiza marcadores.
 *
 * @param {any[]} campaigns - Array of campaign objects
 */
export function setTimelineCampaigns(campaigns: any) {
    _state.campaigns = sortCampaignsByDate(campaigns || []);
    _state.currentTime = 0;
    _syncRangeInput();
    _renderMarkers();
    _updateLabel();
    log.info(`Timeline set with ${_state.campaigns.length} campaigns`);
}
/**
 * Register a callback for slider position changes.
 * Callback recebe (normalizedTime, sortedCampaigns).
 *
 * @param {Function} callback - Function called on time change
 */
export function onTimeChange(callback: any) {
    if (typeof callback === 'function') {
        _state.callbacks.push(callback);
    }
}
/**
 * Get current normalized time position.
 *
 * @returns {number} Current time 0..1
 */
export function getCurrentTime() {
    return _state.currentTime;
}
/**
 * Get current campaign index.
 *
 * @returns {number} Current campaign index
 */
export function getCurrentCampaignIndex() {
    return normalizedToCampaignIndex(_state.currentTime, _state.campaigns.length);
}
/**
 * Start auto-play animation.
 * Avanca o slider automaticamente pelo tempo.
 */
export function play() {
    if (_state.campaigns.length <= 1) {
        showToast(t('timeSlider.needCampaigns') || 'Need at least 2 campaigns', 'warning');
        return;
    }
    // Reset to start if at the end
    if (_state.currentTime >= 1) {
        _state.currentTime = 0;
        _syncRangeInput();
    }
    _state.playing = true;
    _state.lastTimestamp = 0;
    const playBtn = document.getElementById('time-slider-play-btn');
    const pauseBtn = document.getElementById('time-slider-pause-btn');
    if (playBtn)
        playBtn.style.display = 'none';
    if (pauseBtn)
        pauseBtn.style.display = '';
    _state.rafId = requestAnimationFrame(_animationStep);
    log.info('Playback started');
}
/**
 * Pause auto-play animation.
 * Para o avanco automatico mantendo posicao atual.
 */
export function pause() {
    _state.playing = false;
    if (_state.rafId) {
        cancelAnimationFrame(_state.rafId);
        _state.rafId = null;
    }
    const playBtn = document.getElementById('time-slider-play-btn');
    const pauseBtn = document.getElementById('time-slider-pause-btn');
    if (playBtn)
        playBtn.style.display = '';
    if (pauseBtn)
        pauseBtn.style.display = 'none';
    log.info('Playback paused');
}
/**
 * Set playback speed.
 *
 * @param {number|string} speed - Speed multiplier (0.5, 1, 2, 4)
 */
export function setSpeed(speed: any) {
    const s = parseFloat(/** @type {any} */ (speed));
    if (SPEEDS.includes(s)) {
        _state.speed = s;
        log.info(`Speed set to ${s}x`);
    }
}
/**
 * Check if the time slider is currently visible.
 *
 * @returns {boolean}
 */
export function isVisible() {
    return _state.visible;
}
/**
 * Show the time slider panel.
 */
export function show() {
    if (_state.root) {
        _state.root.style.display = '';
        _state.visible = true;
    }
}
/**
 * Hide the time slider panel.
 */
export function hide() {
    pause();
    if (_state.root) {
        _state.root.style.display = 'none';
        _state.visible = false;
    }
}
/**
 * Cleanup and remove the time slider.
 * Remove DOM, cancela animacao, limpa callbacks.
 */
export function destroy() {
    pause();
    if (_state.rangeInput) {
        _state.rangeInput.removeEventListener('input', _onRangeInput);
    }
    if (_state.root && _state.root.parentNode) {
        _state.root.parentNode.removeChild(_state.root);
    }
    _state.root = null;
    _state.rangeInput = null;
    _state.container = null;
    _state.campaigns = [];
    _state.currentTime = 0;
    _state.callbacks = [];
    _state.visible = false;
    log.info('Time slider destroyed');
}
