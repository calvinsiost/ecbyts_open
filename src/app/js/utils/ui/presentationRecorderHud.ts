// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Presentation Mode - F2 UI Shell: Recorder HUD
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §6.2
import { captureCurrentStep, removeLastStep, finishRecording, cancelRecording } from '../../core/presentation/index.js';
import { subscribe } from '../../core/presentation/index.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { openStepModal, setStepModalCallback } from './presentationModal.js';
import { lazyImport } from '../helpers/lazyImport.js';
/** @type {HTMLElement | null} */
let _hudEl: any = null;
/** @type {any} */
let _presentation: any = null;
/** @type {any} */
let _unsub: any = null;
const _stepCounter = 0;
let _timerStart = 0;
/** @type {any} */
let _timerInterval: any = null;
// ----------------------------------------------------------------
// HUD creation
// ----------------------------------------------------------------
function _createHud() {
    if (_hudEl) return _hudEl;
    const el = document.createElement('div');
    el.id = 'presentation-recorder-hud';
    el.className = 'presentation-hud presentation-hud--recorder';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
        <div class="presentation-hud__badge">
            <span class="presentation-hud__pulse"></span>
            <span class="presentation-hud__status">${t('presentation.recording') || 'Gravando'}</span>
        </div>
        <div class="presentation-hud__title" id="recorder-hud-title">—</div>
        <div class="presentation-hud__meta">
            <span id="recorder-hud-steps">0 ${t('presentation.steps') || 'passos'}</span>
            <span class="presentation-hud__divider">·</span>
            <span id="recorder-hud-timer">0s</span>
        </div>
        <div class="presentation-hud__warn-steps" id="recorder-hud-warn-steps" style="display:none;" role="alert">
            <span class="presentation-hud__warn-icon">⚠</span>
            <span class="presentation-hud__warn-text">${t('presentation.warnManySteps') || 'Apresentações ideais têm 3-5 passos. Muitos passos reduzem engajamento.'}</span>
        </div>
        <div class="presentation-hud__last" id="recorder-hud-last" style="display:none;">
            <span class="presentation-hud__last-label">${t('presentation.last') || 'Último'}:</span>
            <span class="presentation-hud__last-value" id="recorder-hud-last-value">—</span>
        </div>
        <div class="presentation-hud__actions">
            <button type="button" class="presentation-btn presentation-btn--primary" id="recorder-btn-add">
                + ${t('presentation.addStep') || 'Passo'}
            </button>
            <button type="button" class="presentation-btn" id="recorder-btn-remove">
                − ${t('presentation.remove') || 'Remover'}
            </button>
            <button type="button" class="presentation-btn presentation-btn--success" id="recorder-btn-finish">
                ✓ ${t('presentation.finish') || 'Concluir'}
            </button>
            <button type="button" class="presentation-btn presentation-btn--ghost" id="recorder-btn-cancel">
                ✕ ${t('presentation.cancel') || 'Cancel'}
            </button>
        </div>
    `;
    el.querySelector('#recorder-btn-add')?.addEventListener('click', _onAddStep);
    el.querySelector('#recorder-btn-remove')?.addEventListener('click', _onRemoveStep);
    el.querySelector('#recorder-btn-finish')?.addEventListener('click', _onFinish);
    el.querySelector('#recorder-btn-cancel')?.addEventListener('click', _onCancel);
    document.body.appendChild(el);
    _hudEl = el;
    return el;
}
function _destroyHud() {
    if (_hudEl) {
        _hudEl.remove();
        _hudEl = null;
    }
    if (_timerInterval) {
        clearInterval(_timerInterval);
        _timerInterval = null;
    }
}
function _startTimer() {
    _timerStart = Date.now();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - _timerStart) / 1000);
        const el = document.getElementById('recorder-hud-timer');
        if (el) el.textContent = `${sec}s`;
    }, 1000);
}
function _updateMeta() {
    const steps = _presentation?.steps || [];
    const stepCount = steps.length;
    const lastStep = steps[stepCount - 1];
    const stepsEl = document.getElementById('recorder-hud-steps');
    if (stepsEl) stepsEl.textContent = `${stepCount} ${t('presentation.steps') || 'passos'}`;
    const lastWrap = document.getElementById('recorder-hud-last');
    const lastValue = document.getElementById('recorder-hud-last-value');
    if (lastWrap && lastValue) {
        if (lastStep) {
            lastWrap.style.display = 'flex';
            lastValue.textContent = lastStep.label || '—';
        } else {
            lastWrap.style.display = 'none';
        }
    }
    // Fix #5 (2026-04-18): warning UI se > 10 passos
    // Best practice (Storylane/Userpilot 2026): 3-5 steps ideal, keep brief.
    const warnEl = document.getElementById('recorder-hud-warn-steps');
    if (warnEl) {
        warnEl.style.display = stepCount > 10 ? 'flex' : 'none';
    }
}
async function _onAddStep() {
    setStepModalCallback((data: any) => {
        // Wire to core/recorder captureCurrentStep
        // Camera refs must be injected from scene context
        const camera = window.__ecbtCamera || null;
        const controls = window.__ecbtControls || null;
        if (!camera) {
            showToast(t('presentation.cameraUnavailable') || 'Câmera não disponível', 'error');
            return;
        }
        const audio =
            data.audioType === 'tts'
                ? {
                      type: 'tts',
                      text: data.ttsText,
                      lang: data.lang,
                  }
                : data.audioType === 'upload'
                  ? {
                        type: 'upload',
                        filename: '',
                    }
                  : null;
        try {
            captureCurrentStep({
                camera,
                controls,
                label: data.label,
                annotation: data.annotation,
                duration: data.duration,
                transitionDuration: data.transitionDuration,
                transitionEase: data.transitionEase,
                audio,
                temporalT: data.temporalT,
                layout: data.layout,
            });
            _updateMeta();
            showToast(t('presentation.stepAdded') || 'Passo adicionado', 'success');
        } catch (e: any) {
            showToast(e?.message || String(e), 'error');
        }
    });
    openStepModal();
}
async function _onRemoveStep() {
    // REF-SWEEPS RF-2: _onRemoveStep e registrado via addEventListener (_createHud),
    // logo roda fire-and-forget — import() cru aqui virava 'Uncaught (in promise)'.
    // Guard de CONSENTIMENTO: sem o dialogo, aborta (fail-closed) em vez de remover
    // o passo sem o usuario confirmar.
    const _dlg = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js' as string) });
    if (!_dlg) return;
    const { asyncConfirm } = _dlg;
    const confirmed = await asyncConfirm(t('presentation.confirmRemoveStep') || 'Remover o último passo?', {
        confirmLabel: t('remove') || 'Remover',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!confirmed) return;
    const ok = removeLastStep();
    if (ok) {
        _updateMeta();
        showToast(t('presentation.stepRemoved') || 'Passo removido', 'success');
    }
}
async function _onFinish() {
    // REF-SWEEPS RF-2: idem — handler de click, fire-and-forget. Fail-closed: sem o
    // dialogo de confirmacao nao encerramos a gravacao.
    const _dlg = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js' as string) });
    if (!_dlg) return;
    const { asyncConfirm } = _dlg;
    const confirmed = await asyncConfirm(t('presentation.confirmFinish') || 'Concluir gravação?', {
        confirmLabel: t('finish') || 'Concluir',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!confirmed) return;
    finishRecording();
    _destroyHud();
    showToast(t('presentation.saved') || 'Apresentação salva!', 'success');
    // Auto-open post-save mini modal — a apresentacao JA foi salva acima, entao a
    // queda do chunk so cancela o convite "reproduzir agora" (degradacao benigna).
    const _dlg2 = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js' as string) });
    if (!_dlg2) return;
    const { asyncConfirm: asyncConfirm2 } = _dlg2;
    const playNow = await asyncConfirm2(t('presentation.playNow') || 'Reproduzir agora?', {
        confirmLabel: '▶ ' + (t('play') || 'Reproduzir'),
        cancelLabel: t('close') || 'Fechar',
    });
    if (playNow) {
        const _player = await lazyImport('./presentationPlayer.js', { importer: () => import('./presentationPlayer.js' as string) });
        const _mgr = await lazyImport('../../core/presentation/manager.js', { importer: () => import('../../core/presentation/manager.js' as string) });
        if (!_player || !_mgr) {
            showToast(t('presentation.playFailed') || 'Falha ao abrir player', 'error');
            return;
        }
        const { openPlayer } = _player;
        const { getActivePresentation } = _mgr;
        const active = getActivePresentation() || _presentation;
        if (!active) {
            console.warn('[presentationRecorderHud] _onFinish: no active presentation to play');
            showToast(t('presentation.notFound') || 'Apresentação não encontrada', 'error');
            return;
        }
        try {
            await openPlayer(active.id);
        } catch (err: any) {
            console.error('[presentationRecorderHud] openPlayer failed:', err);
            showToast(t('presentation.playFailed') || 'Falha ao abrir player', 'error');
        }
    }
}
async function _onCancel() {
    // REF-SWEEPS RF-2: handler de click (fire-and-forget). Fail-closed: sem o dialogo
    // NAO descartamos a gravacao — perder passos exige confirmacao explicita.
    const _dlg = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js' as string) });
    if (!_dlg) return;
    const { asyncConfirm } = _dlg;
    const confirmed = await asyncConfirm(
        t('presentation.confirmCancel') || 'Cancelar gravação? Os passos não salvos serão perdidos.',
        { danger: true, confirmLabel: t('cancelRecording') || 'Cancelar', cancelLabel: t('keep') || 'Manter' },
    );
    if (!confirmed) return;
    cancelRecording();
    _destroyHud();
    showToast(t('presentation.recordingCancelled') || 'Gravação cancelada', 'info');
}
// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------
/** @param {any} presentation */
export function openRecorderHud(presentation: any) {
    _presentation = presentation;
    _createHud();
    _updateMeta();
    _startTimer();
    const titleEl = document.getElementById('recorder-hud-title');
    if (titleEl) titleEl.textContent = presentation?.title || '—';
    // Subscribe to state changes for robustness
    if (_unsub) _unsub();
    _unsub = subscribe((ev: any) => {
        if (ev.type === 'state-change' && ev.payload.current === 'idle') {
            _destroyHud();
        }
    });
}
export function closeRecorderHud() {
    _destroyHud();
    if (_unsub) {
        _unsub();
        _unsub = null;
    }
}
