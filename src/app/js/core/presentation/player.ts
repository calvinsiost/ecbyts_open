// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
import { setMachineState, getMachineState, getActivePresentation, setActivePresentation } from './manager.js';
import { tweenCamera, snapshotCamera } from './transitions.js';
import { buildShotPlan } from './shotPlanner.js';
import { planComposition } from './compositionPolicy.js';
import { toTtsSafeText } from './narrationSanitizer.js';
import { executeStepRuntime } from './runtimeActions.js';
/** @type {any} */
const _player: any = {
    presentation: null,
    currentStepIdx: 0,
    timer: null,
    audioInstance: null,
    onStepChange: null,
    cameraRef: null,
    controlsRef: null,
    viewport: 'desktop',
    currentScenePlan: null,
    executeRuntime: null,
};
function _clearTimer() {
    if (_player.timer) {
        clearTimeout(_player.timer);
        _player.timer = null;
    }
}
function _stopAudio() {
    if (_player.audioInstance && typeof _player.audioInstance.stop === 'function') {
        try {
            _player.audioInstance.stop();
        }
        catch (e: any) {
            console.debug('[presentation/player] stopAudio:', /** @type {any} */ (e)?.message || e);
            /* ignore */
        }
    }
    _player.audioInstance = null;
}
/**
 * Play presentation. Sequentially advances steps with camera tween + audio.
 *
 * @param {string} presentationId
 * @param {object} ctx - runtime context
 * @param {any} ctx.camera
 * @param {object} ctx.controls - OrbitControls
 * @param {Function} [ctx.onStepChange] - called with (stepIdx, step)
 * @param {Function} [ctx.playAudio] - audio.playStepAudio(step) - injected from audio.js to avoid circular dep
 * @returns {Promise<void>} resolves when presentation completes
 */
export async function play(presentationId: any, ctx: any) {
    setActivePresentation(presentationId);
    const presentation = getActivePresentation();
    if (!presentation || !presentation.steps?.length) {
        throw new Error('Empty or missing presentation');
    }
    _player.presentation = presentation;
    _player.currentStepIdx = 0;
    _player.cameraRef = ctx?.camera || null;
    _player.controlsRef = ctx?.controls || null;
    _player.onStepChange = ctx?.onStepChange || null;
    _player._playAudio = ctx?.playAudio || null;
    _player.viewport = ctx?.viewport || 'desktop';
    _player.currentScenePlan = null;
    _player.executeRuntime = typeof ctx?.executeRuntime === 'function' ? ctx.executeRuntime : executeStepRuntime;
    setMachineState('playing');
    await _renderStep(0);
    _scheduleNext();
}
/** @param {number} idx */
async function _renderStep(idx: any) {
    const presentation = _player.presentation;
    if (!presentation || idx >= presentation.steps.length)
        return;
    const step = presentation.steps[idx];
    _player.currentStepIdx = idx;
    const scenePlan = buildScenePlanForStep(presentation, idx, _player.viewport);
    _player.currentScenePlan = scenePlan;
    if (step.runtime && _player.executeRuntime) {
        try {
            await _player.executeRuntime(step, {
                presentation,
                stepIndex: idx,
                scenePlan,
            });
        }
        catch (e: any) {
            console.warn('[presentation] runtime action error', e);
        }
    }
    if (_player.onStepChange) {
        try {
            _player.onStepChange(idx, step, scenePlan);
        }
        catch (e: any) {
            console.warn('[presentation] onStepChange error', e);
        }
    }
    // Camera tween - shot plan overrides step defaults when a motion preset is active.
    if (_player.cameraRef && step.camera) {
        const from = (snapshotCamera(_player.cameraRef, _player.controlsRef)) as any;
        if (idx === 0) {
            await tweenCamera(_player.cameraRef, from, step.camera, 0.5, 'cubic');
        }
        else {
            const prevStep = presentation.steps[idx - 1];
            const baseDur = prevStep?.transitionDuration ?? 1.5;
            const baseEase = prevStep?.transitionEase ?? 'cubic';
            const dur = (scenePlan)?.shot?.camera?.durationSec ?? baseDur;
            const ease = /** @type {any} */ (scenePlan)?.shot?.camera?.ease ?? baseEase;
            await tweenCamera(_player.cameraRef, from, step.camera, dur, ease, (/** @type {any} */ { target }) => {
                if (_player.controlsRef && target) {
                    _player.controlsRef.target.set(target.x, target.y, target.z) as any;
                    _player.controlsRef.update?.();
                }
            });
        }
    }
    if (step.audio && _player._playAudio) {
        _player.audioInstance = _player._playAudio(step);
    }
}
/**
 * Build a scene plan for a single step combining shot, composition and TTS segmentation.
 * Pure function - exposed for UI overlays, export pipeline and preview.
 *
 * @param {any} presentation - sanitized presentation
 * @param {number} idx - step index
 * @param {string} [viewport] - 'mobile' | 'desktop' | 'clean_export'
 * @returns {{step: any, shot: any, composition: any, frameClip?: any, tts: any|null, viewport: string}|null}
 */
export function buildScenePlanForStep(presentation: any, idx: any, viewport: any = "desktop") {
    if (!presentation || !Array.isArray(presentation.steps))
        return null;
    const step = presentation.steps[idx];
    if (!step)
        return null;
    const shot = buildShotPlan({
        intent: step.story?.intent,
        focus: step.focus,
        preset: step.export?.motion_preset,
    });
    const composition = planComposition(step, viewport);
    const frameClip = composition?.frameClip || null;
    const voiceText = step.story?.voice_script || step.audio?.text || '';
    const tts = voiceText ? toTtsSafeText(voiceText) : null;
    return { step, shot, composition, frameClip, tts, viewport };
}
/**
 * Read the currently active scene plan (set during _renderStep).
 * @returns {object|null}
 */
export function getCurrentScenePlan() {
    return _player.currentScenePlan || null;
}
function _scheduleNext() {
    _clearTimer();
    const presentation = _player.presentation;
    if (!presentation)
        return;
    const idx = _player.currentStepIdx;
    const step = presentation.steps[idx];
    if (!step) {
        _exit();
        return;
    }
    const durationMs = (step.duration || 3.0) * 1000;
    _player.timer = setTimeout(async () => {
        const next = idx + 1;
        if (next >= presentation.steps.length) {
            _exit();
            return;
        }
        await _renderStep(next);
        _scheduleNext();
    }, durationMs);
}
function _exit() {
    _clearTimer();
    _stopAudio();
    setMachineState('idle');
    _player.presentation = null;
    _player.currentStepIdx = 0;
}
export function pause() {
    if (getMachineState() !== 'playing')
        return false;
    _clearTimer();
    _stopAudio();
    setMachineState('paused');
    return true;
}
export function resume() {
    if (getMachineState() !== 'paused')
        return false;
    setMachineState('playing');
    _scheduleNext();
    return true;
}
/** @param {number} idx */
export async function skipToStep(idx: any) {
    const presentation = _player.presentation;
    if (!presentation)
        return false;
    if (idx < 0 || idx >= presentation.steps.length)
        return false;
    _clearTimer();
    _stopAudio();
    await _renderStep(idx);
    if (getMachineState() === 'playing')
        _scheduleNext();
    return true;
}
export async function nextStep() {
    if (!_player.presentation)
        return false;
    const next = _player.currentStepIdx + 1;
    if (next >= _player.presentation.steps.length) {
        _exit();
        return false;
    }
    return skipToStep(next);
}
export async function previousStep() {
    if (!_player.presentation)
        return false;
    const prev = Math.max(0, _player.currentStepIdx - 1);
    return skipToStep(prev);
}
export function exit() {
    _exit();
}
export function getPlayerStatus() {
    return {
        state: getMachineState(),
        presentation: _player.presentation,
        currentStepIdx: _player.currentStepIdx,
        totalSteps: _player.presentation?.steps?.length || 0,
    };
}
/**
 * Reset for tests.
 */
export function _reset() {
    _exit();
    _player.executeRuntime = null;
}
