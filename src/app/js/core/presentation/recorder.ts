// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only

import { setMachineState, mutateActive, getActivePresentation, setActivePresentation } from './manager.js';
import { snapshotCamera } from './transitions.js';

const DRAFT_KEY = 'ecbyts-presentation-draft';

function _generateStepId() {
    return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function _saveDraft(/** @type {any} */ presentationId: any) {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ presentationId, at: Date.now() }));
    } catch (/** @type {any} */ e) {
        console.debug('[presentation-recorder] saveDraft:', (e as any)?.message || e);
        /* ignore */
    }
}

export function getDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY) || '';
        return raw ? JSON.parse(raw) : null;
    } catch (/** @type {any} */ e) {
        console.debug('[presentation-recorder] getDraft:', (e as any)?.message || e);
        return null;
    }
}

export function clearDraft() {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch (/** @type {any} */ e) {
        console.debug('[presentation-recorder] clearDraft:', (e as any)?.message || e);
        /* ignore */
    }
}

/**
 * Start a recording session for the given presentation.
 */
export function startRecording(/** @type {any} */ presentationId: any) {
    setActivePresentation(presentationId);
    setMachineState('recording');
    _saveDraft(presentationId);
}

type CaptureOptions = {
    camera?: any;
    controls?: any;
    label?: any;
    annotation?: any;
    duration?: any;
    transitionDuration?: any;
    transitionEase?: any;
    audio?: any;
    temporalT?: any;
    visibleElements?: any;
    layout?: any;
};

type NormalizedCaptureOptions = {
    camera: any;
    controls: any;
    label: string;
    annotation: string;
    duration: number;
    transitionDuration: number;
    transitionEase: string;
    audio: any;
    temporalT: any;
    visibleElements: any;
    layout: any;
};

const VALID_TRANSITION_EASES = ['linear', 'cubic', 'easeInOut'];

function _requireActivePresentation(): any {
    const active = getActivePresentation();
    if (!active) {
        throw new Error('No active presentation. Call startRecording(id) first.');
    }
    return active;
}

const CAPTURE_DEFAULTS = {
    label: 'Untitled',
    annotation: '',
    duration: 3.0,
    transitionDuration: 1.5,
    transitionEase: 'cubic',
    audio: null,
    temporalT: null,
    visibleElements: null,
    layout: null,
};

function _coerceCaptureValue<T>(value: T | undefined, fallback: T): T {
    return value === undefined ? fallback : value;
}

function _normalizeCaptureOptions(options: CaptureOptions | null | undefined): NormalizedCaptureOptions {
    const raw = options || {};
    if (!raw.camera) {
        throw new Error('camera required');
    }

    return {
        camera: raw.camera,
        controls: raw.controls,
        label: String(_coerceCaptureValue(raw.label, CAPTURE_DEFAULTS.label)).slice(0, 200),
        annotation: String(_coerceCaptureValue(raw.annotation, CAPTURE_DEFAULTS.annotation) || '').slice(0, 2000),
        duration: Math.max(0.1, Math.min(120, Number(_coerceCaptureValue(raw.duration, CAPTURE_DEFAULTS.duration)) || 3.0)),
        transitionDuration: Math.max(
            0,
            Math.min(30, Number(_coerceCaptureValue(raw.transitionDuration, CAPTURE_DEFAULTS.transitionDuration)) || 1.5),
        ),
        transitionEase: VALID_TRANSITION_EASES.includes(raw.transitionEase as string)
            ? (raw.transitionEase as string)
            : CAPTURE_DEFAULTS.transitionEase,
        audio: _coerceCaptureValue(raw.audio, CAPTURE_DEFAULTS.audio),
        temporalT: _coerceCaptureValue(raw.temporalT, CAPTURE_DEFAULTS.temporalT),
        visibleElements: _coerceCaptureValue(raw.visibleElements, CAPTURE_DEFAULTS.visibleElements),
        layout: _coerceCaptureValue(raw.layout, CAPTURE_DEFAULTS.layout),
    };
}

function _buildStep(normalized: NormalizedCaptureOptions): any {
    return {
        id: _generateStepId(),
        label: normalized.label,
        annotation: normalized.annotation,
        camera: snapshotCamera(normalized.camera, normalized.controls),
        duration: normalized.duration,
        transitionDuration: normalized.transitionDuration,
        transitionEase: normalized.transitionEase,
        audio: normalized.audio,
        temporalT: normalized.temporalT,
        visibleElements: normalized.visibleElements,
        layout: normalized.layout,
    };
}

/**
 * Capture current camera state as a new step.
 *
 * @param {object} options
 * @param {any} options.camera
 * @param {object} options.controls - OrbitControls (for target)
 * @param {string} options.label
 * @param {string} [options.annotation]
 * @param {number} [options.duration] - seconds in step (default 3)
 * @param {number} [options.transitionDuration] - seconds to next step (default 1.5)
 * @param {string} [options.transitionEase] - 'linear'|'cubic'|'easeInOut' (default cubic)
 * @param {object|null} [options.audio] - { type, text, lang, voice, ... }
 * @param {number} [options.temporalT] - 0..1 time slider position
 * @param {string[]} [options.visibleElements] - element IDs filter
 * @param {object} [options.layout] - step layout metadata (caption/frame clip policy)
 * @returns {object|null} step
 */
export function captureCurrentStep(options: any) {
    const active = _requireActivePresentation();
    const normalized = _normalizeCaptureOptions(options);
    const step = _buildStep(normalized);

    mutateActive((/** @type {any} */ p: any) => {
        p.steps.push(step);
    });
    _saveDraft(active.id);
    return step;
}

/**
 * Remove the last step from active presentation.
 */
export function removeLastStep() {
    const active = getActivePresentation();
    if (!active || active.steps.length === 0) return false;
    let removed = null;
    mutateActive((/** @type {any} */ p: any) => {
        removed = p.steps.pop();
    });
    return !!removed;
}

/**
 * Remove step by id.
 */
export function removeStep(/** @type {any} */ stepId: any) {
    const active = getActivePresentation();
    if (!active) return false;
    let found = false;
    mutateActive((/** @type {any} */ p: any) => {
        const before = p.steps.length;
        p.steps = p.steps.filter((/** @type {any} */ s: any) => s.id !== stepId);
        found = p.steps.length !== before;
    });
    return found;
}

/**
 * Update step in-place.
 */
export function updateStep(/** @type {any} */ stepId: any, /** @type {any} */ patch: any) {
    const active = getActivePresentation();
    if (!active) return null;
    let updated = null;
    mutateActive((/** @type {any} */ p: any) => {
        const idx = p.steps.findIndex((/** @type {any} */ s: any) => s.id === stepId);
        if (idx >= 0) {
            p.steps[idx] = { ...p.steps[idx], ...patch };
            updated = p.steps[idx];
        }
    });
    return updated;
}

/**
 * Reorder steps via drag-and-drop.
 */
export function reorderSteps(/** @type {any} */ fromIdx: any, /** @type {any} */ toIdx: any) {
    const active = getActivePresentation();
    if (!active) return false;
    if (fromIdx < 0 || fromIdx >= active.steps.length) return false;
    if (toIdx < 0 || toIdx >= active.steps.length) return false;
    mutateActive((/** @type {any} */ p: any) => {
        const [moved] = p.steps.splice(fromIdx, 1);
        p.steps.splice(toIdx, 0, moved);
    });
    return true;
}

/**
 * Finish recording - transition state machine to editing.
 */
export function finishRecording() {
    setMachineState('editing');
    clearDraft();
    return getActivePresentation();
}

/**
 * Cancel recording - return to idle without saving (does NOT delete presentation).
 */
export function cancelRecording() {
    setMachineState('idle');
    clearDraft();
}
