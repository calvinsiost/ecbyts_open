// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   TIME SLIDER HANDLERS — Window.* functions for time slider
   ================================================================

   Handlers para controles do slider temporal 3D.
   Toggle, play, pause, speed. Integra campanhas com elementos.

   ================================================================ */
import { createLogger } from '../helpers/logger.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import {
    initTimeSlider,
    setTimelineCampaigns,
    onTimeChange,
    play,
    pause,
    setSpeed,
    isVisible,
    show,
    hide,
} from '../ui/timeSlider.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { getAllElements, getMeshByElementId } from '../../core/elements/manager.js';
import { filterElementsByTime, setElementTemporalVisibility } from '../../core/sequencer/temporalFilter.js';
import { requestRender } from '../scene/setup.js';
import { pickTimeSliderContainerId } from '../../core/temporal/timeSliderCore.js';
const _log = createLogger('timeSliderHandler');
/** @type {boolean} Whether the slider has been initialized */
let _initialized = false;
/**
 * Apply temporal filtering to 3D scene.
 * Callback registrado no slider para atualizar visibilidade dos elementos.
 *
 * @param {number} normalizedTime - Current time 0..1
 * @param {Array<any>} sortedCampaigns - Sorted campaign list
 */
function _applyTemporalFilter(normalizedTime: any, sortedCampaigns: any) {
    const elements = getAllElements() as any;
    const visibility = filterElementsByTime(elements, normalizedTime, sortedCampaigns);
    for (const { elementId, visible } of visibility) {
        setElementTemporalVisibility(elementId, visible, getMeshByElementId);
    }
    requestRender();
}
/**
 * Check whether an element is actually rendered on screen
 * (não basta existir no DOM — display:none em ancestral zera offsetParent).
 *
 * @param {HTMLElement|null} el - Element to check
 * @returns {boolean}
 */
function _isActuallyShown(el: HTMLElement | null): boolean {
    return !!el && el.offsetParent !== null;
}
/**
 * Toggle the time slider on/off.
 * Inicializa na primeira abertura, depois alterna visibilidade.
 * Contrato camada-4 (SPEC_REFERENCE_RESILIENCE_SWEEPS): OU o slider
 * aparece de fato, OU degrada com toast explicativo — nunca silêncio.
 */
function handleToggleTimeSlider() {
    const panelEl = /** @type {HTMLElement|null} */ (document.getElementById('time-slider-panel'));
    if (_initialized && isVisible() && _isActuallyShown(panelEl)) {
        hide();
        // Restore all elements to visible when closing
        const elements = getAllElements();
        for (const el of elements) {
            setElementTemporalVisibility(el.id, true, getMeshByElementId);
        }
        requestRender();
        return;
    }
    const canvasEl = /** @type {HTMLElement|null} */ (document.getElementById('canvas-container'));
    const mainEl = /** @type {HTMLElement|null} */ (document.getElementById('main-area'));
    const targetId = pickTimeSliderContainerId(_isActuallyShown(canvasEl), _isActuallyShown(mainEl));
    if (!targetId) {
        showToast(t('timeSlider.noContainer') || 'Nenhum viewport visível — abra o modo 3D para usar a linha do tempo', 'warning');
        return;
    }
    const container = targetId === 'canvas-container' ? canvasEl : mainEl;
    if (!_initialized) {
        initTimeSlider(container);
        onTimeChange(_applyTemporalFilter);
        _initialized = true;
    } else {
        show();
        // Painel pode ter sido montado num container que hoje está oculto
        // (ex.: canvas-container do modo 3D fechado) — re-monta no visível.
        if (!_isActuallyShown(/** @type {HTMLElement|null} */ (document.getElementById('time-slider-panel')))) {
            initTimeSlider(container); // destroy() interno limpa instância e callbacks
            onTimeChange(_applyTemporalFilter);
        }
    }
    // Load current campaigns
    const campaigns = getAllCampaigns();
    setTimelineCampaigns(campaigns);
    if (campaigns.length === 0) {
        showToast(t('timeSlider.noCampaigns') || 'Nenhuma campanha com dados temporais — adicione campanhas primeiro', 'info');
    }
    // Última guarda do contrato: se mesmo assim nada ficou visível, avisar.
    if (!_isActuallyShown(/** @type {HTMLElement|null} */ (document.getElementById('time-slider-panel')))) {
        showToast(t('timeSlider.noContainer') || 'Não foi possível exibir a linha do tempo neste modo de visualização', 'warning');
    }
}
/**
 * Start time slider playback.
 */
function handleTimeSliderPlay() {
    play();
}
/**
 * Pause time slider playback.
 */
function handleTimeSliderPause() {
    pause();
}
/**
 * Set time slider playback speed.
 *
 * @param {number|string} speed - Speed multiplier
 */
function handleTimeSliderSpeed(speed: any) {
    setSpeed(speed);
}
export const timeSliderHandlers = {
    handleToggleTimeSlider,
    handleTimeSliderPlay,
    handleTimeSliderPause,
    handleTimeSliderSpeed,
};
