// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PLUME ANIMATION HANDLERS
   utils/handlers/plumeAnimation.js

   Handlers window.* para animacao temporal de plumas.
   Registrados em utils/handlers/index.js.
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { withLoading } from '../ui/loadingOverlay.js';
import { generatePlumeAnimation, playPlumeAnimation, addPlumeAnimationToSequencer, removePlumeAnimation, getAllPlumeAnimations, startPlumePlayback, stopPlumePlayback, setPlumeAnimationSpeed, exportCurrentFrame, } from '../../core/sequencer/plumeAnimation.js';
import { openPlumeAnimationDialog } from '../ui/plumeAnimationDialog.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('PlumeAnimation');
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Abre o dialogo de configuracao de animacao de pluma.
 * Chamado via inspector context menu em elementos da familia 'plume'.
 *
 * @param {string} elementId - ID do elemento pluma
 */
async function handleOpenPlumeAnimationDialog(elementId: any) {
    if (!elementId) {
        showToast(t('plumeAnimation.selectElement') || 'Selecione um elemento do tipo Pluma.', 'warning');
        return;
    }
    openPlumeAnimationDialog(elementId, handleGeneratePlumeAnimation);
}
/**
 * Gera a animacao com as opcoes configuradas no dialogo.
 * Chamado pelo callback do openPlumeAnimationDialog.
 *
 * @param {string} elementId
 * @param {Object} options - { parameterId, method }
 */
async function handleGeneratePlumeAnimation(elementId: any, options: any) {
    try {
        /** @type {any} */
        let anim: any;
        await (withLoading as any)(async (setMsg: any, setProgress: any) => {
            setMsg(t('plumeAnimation.generating') || 'Gerando animacao...');
            anim = await generatePlumeAnimation(elementId, {
                ...options,
                onProgress: (pct: any) => setProgress(Math.round(pct * 100)),
            });
        });
        if (!anim)
            return;
        showToast(`${t('plumeAnimation.generated') || 'Animacao gerada'}: ${anim.frames.length} ${t('plumeAnimation.frames') || 'frames'}`, 'success');
        // Registra automaticamente no sequencer e inicia playback
        addPlumeAnimationToSequencer(anim.id);
        showToast(t('plumeAnimation.registeredSequencer') || 'Animacao registrada no sequencer. Use Play para reproduzir.', 'info');
    }
    catch (err: any) {
        log.error('Plume animation generation failed', err.message);
        showToast(`${t('plumeAnimation.error') || 'Erro ao gerar animacao'}: ${err.message}`, 'error');
    }
}
/**
 * Inicia o playback de uma animacao de pluma.
 *
 * @param {string} animationId
 */
function handlePlayPlumeAnimation(animationId: any) {
    if (!animationId) {
        // Se nao fornecido, usa a primeira animacao disponivel
        const anims = getAllPlumeAnimations();
        if (anims.length === 0) {
            showToast(t('plumeAnimation.noAnimations') || 'Nenhuma animacao de pluma gerada.', 'warning');
            return;
        }
        animationId = anims[0].id;
    }
    try {
        playPlumeAnimation(animationId);
        showToast(t('plumeAnimation.playing') || 'Reproduzindo animacao de pluma...', 'info');
    }
    catch (err: any) {
        log.error('Plume animation playback failed', err.message);
        showToast(`${t('plumeAnimation.error') || 'Erro'}: ${err.message}`, 'error');
    }
}
/**
 * Remove uma animacao de pluma e seus recursos.
 *
 * @param {string} animationId
 */
function handleRemovePlumeAnimation(animationId: any) {
    try {
        removePlumeAnimation(animationId);
        showToast(t('plumeAnimation.removed') || 'Animacao removida.', 'info');
    }
    catch (err: any) {
        log.error('Plume animation removal failed', err.message);
    }
}
/**
 * Starts plume animation playback with optional speed.
 * Wraps startPlumePlayback for window.* handler registration.
 *
 * @param {string} [animationId] - Animation ID (uses first if omitted)
 * @param {number} [speed=1.0] - Playback speed multiplier
 */
function handleStartPlumeAnimation(animationId: any, speed: any) {
    const anims = getAllPlumeAnimations();
    if (anims.length === 0) {
        showToast(t('plumeAnimation.noAnimations') || 'Nenhuma animacao de pluma gerada.', 'warning');
        return;
    }
    try {
        startPlumePlayback(animationId, speed);
        showToast(t('plumeAnimation.playing') || 'Reproduzindo animacao de pluma...', 'info');
    }
    catch (err: any) {
        log.error('Start plume animation failed', err.message);
        showToast(`${t('plumeAnimation.error') || 'Erro'}: ${err.message}`, 'error');
    }
}
/**
 * Stops (pauses) plume animation playback.
 */
function handleStopPlumeAnimation() {
    try {
        stopPlumePlayback();
        showToast(t('plumeAnimation.pause') || 'Animacao pausada.', 'info');
    }
    catch (err: any) {
        log.error('Stop plume animation failed', err.message);
    }
}
/**
 * Sets playback speed for plume animation.
 *
 * @param {number} speed - Speed multiplier (0.25 to 4.0)
 */
function handlePlumeAnimationSpeed(speed: any) {
    const numSpeed = Number(speed);
    if (!Number.isFinite(numSpeed) || numSpeed <= 0) {
        showToast(t('plumeAnimation.speed') + ': 0.25 - 4.0', 'warning');
        return;
    }
    setPlumeAnimationSpeed(numSpeed);
    showToast(`${t('plumeAnimation.speed') || 'Velocidade'}: ${numSpeed}x`, 'info');
}
/**
 * Exports the current animation frame as a serializable object.
 *
 * @param {string} [animationId] - Animation ID (uses first if omitted)
 */
function handleExportPlumeFrame(animationId: any) {
    const frame = exportCurrentFrame(animationId);
    if (!frame) {
        showToast(t('plumeAnimation.noAnimations') || 'Nenhuma animacao de pluma gerada.', 'warning');
        return;
    }
    log.info('Exported plume frame:', JSON.stringify(frame, null, 2));
    showToast(`${t('plumeAnimation.exportFrame') || 'Frame exportado'}: ${ /** @type {*} */(frame).frame.campaignName}`, 'success');
    return frame;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const plumeAnimationHandlers = {
    handleOpenPlumeAnimationDialog,
    handleGeneratePlumeAnimation,
    handlePlayPlumeAnimation,
    handleRemovePlumeAnimation,
    handleStartPlumeAnimation,
    handleStopPlumeAnimation,
    handlePlumeAnimationSpeed,
    handleExportPlumeFrame,
};
