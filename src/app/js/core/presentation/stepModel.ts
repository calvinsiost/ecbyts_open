// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation step/presentation model - pure-logic validation + frozen shapes.
// Complements the browser-coupled persistence.js (which sanitizes user imports).
// This module produces shapes used by the FSM; sanitization is the job of
// persistence.js. Here we REJECT bad input instead of silently repairing it.
//
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §3.4

const EASE_TYPES = Object.freeze(['linear', 'cubic', 'easeInOut']);
const AUDIO_TYPES = Object.freeze(['tts', 'upload', 'none']);

const MAX_STEP_LABEL = 200;
const MAX_STEP_NOTES = 2000;
const MAX_NARRATION = 5000;
const MAX_TITLE = 200;
const MAX_STEPS = 500;

function isFiniteNumber(n: any): boolean {
    return typeof n === 'number' && Number.isFinite(n);
}

function isNonEmptyString(s: any): boolean {
    return typeof s === 'string' && s.trim().length > 0;
}

function freezeDeep(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
        freezeDeep(obj[key]);
    }
    return Object.freeze(obj);
}

/**
 * Validates and freezes a single presentation step. Throws on malformed input.
 *
 * @param input - raw step input (validated at runtime)
 * @returns frozen step
 */
export function createStep(input: any): Readonly<any> {
    if (!input || typeof input !== 'object') {
        throw new TypeError('createStep: input object required');
    }
    if (!isNonEmptyString(input.id)) {
        throw new RangeError('createStep: id must be a non-empty string');
    }
    if (!isNonEmptyString(input.title)) {
        throw new RangeError('createStep: title must be a non-empty string');
    }
    if (input.title.length > MAX_STEP_LABEL) {
        throw new RangeError(`createStep: title exceeds ${MAX_STEP_LABEL} chars`);
    }
    if (!isFiniteNumber(input.duration) || input.duration <= 0 || input.duration > 600) {
        throw new RangeError('createStep: duration must be a number in (0, 600]');
    }

    const audioType = input.audioType == null ? 'none' : input.audioType;
    if (!AUDIO_TYPES.includes(audioType)) {
        throw new RangeError(`createStep: audioType must be one of ${AUDIO_TYPES.join(', ')}`);
    }

    const transitionDuration = input.transitionDuration == null ? 0 : Number(input.transitionDuration);
    if (!isFiniteNumber(transitionDuration) || transitionDuration < 0 || transitionDuration > 30) {
        throw new RangeError('createStep: transitionDuration must be in [0, 30]');
    }
    const transitionEase = input.transitionEase || 'cubic';
    if (!EASE_TYPES.includes(transitionEase)) {
        throw new RangeError(`createStep: transitionEase must be one of ${EASE_TYPES.join(', ')}`);
    }

    if (input.notes != null) {
        if (typeof input.notes !== 'string') {
            throw new TypeError('createStep: notes must be a string');
        }
        if (input.notes.length > MAX_STEP_NOTES) {
            throw new RangeError(`createStep: notes exceeds ${MAX_STEP_NOTES} chars`);
        }
    }

    let narration: any = null;
    if (audioType === 'tts') {
        if (!input.narration || typeof input.narration !== 'object') {
            throw new TypeError('createStep: narration object required when audioType="tts"');
        }
        if (!isNonEmptyString(input.narration.text)) {
            throw new RangeError('createStep: narration.text must be a non-empty string');
        }
        if (input.narration.text.length > MAX_NARRATION) {
            throw new RangeError(`createStep: narration.text exceeds ${MAX_NARRATION} chars`);
        }
        narration = {
            text: input.narration.text,
            lang: isNonEmptyString(input.narration.lang) ? input.narration.lang : 'pt-BR',
            voice: isNonEmptyString(input.narration.voice) ? input.narration.voice : null,
        };
    } else if (audioType === 'upload') {
        if (!input.narration || !isNonEmptyString(input.narration.filename)) {
            throw new RangeError('createStep: narration.filename required when audioType="upload"');
        }
        narration = {
            filename: input.narration.filename,
            lang: isNonEmptyString(input.narration.lang) ? input.narration.lang : 'pt-BR',
        };
    }

    let cameraRef: any = null;
    if (input.cameraRef != null) {
        cameraRef = validateCameraRef(input.cameraRef);
    }

    let sceneRef: any = null;
    if (input.sceneRef != null) {
        if (!input.sceneRef || typeof input.sceneRef !== 'object' || !isNonEmptyString(input.sceneRef.id)) {
            throw new TypeError('createStep: sceneRef.id must be a non-empty string');
        }
        sceneRef = { id: input.sceneRef.id };
    }

    const step = {
        id: input.id,
        title: input.title,
        duration: input.duration,
        transitionDuration,
        transitionEase,
        audioType,
        notes: input.notes || null,
        narration,
        cameraRef,
        sceneRef,
    };

    return freezeDeep(step);
}

/**
 * Validates a camera reference triplet. Throws on malformed.
 */
export function validateCameraRef(cam: any): {
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
} {
    if (!cam || typeof cam !== 'object') {
        throw new TypeError('validateCameraRef: object required');
    }
    const pos = cam.position;
    const tgt = cam.target;
    if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(isFiniteNumber)) {
        throw new RangeError('validateCameraRef: position must be [x,y,z] of finite numbers');
    }
    if (!Array.isArray(tgt) || tgt.length !== 3 || !tgt.every(isFiniteNumber)) {
        throw new RangeError('validateCameraRef: target must be [x,y,z] of finite numbers');
    }
    const zoom = cam.zoom == null ? 1 : Number(cam.zoom);
    if (!isFiniteNumber(zoom) || zoom <= 0) {
        throw new RangeError('validateCameraRef: zoom must be > 0');
    }
    return {
        position: [pos[0], pos[1], pos[2]],
        target: [tgt[0], tgt[1], tgt[2]],
        zoom,
    };
}

/**
 * Validates and freezes a full presentation: id, title, steps[].
 * Rejects: duplicate step IDs, empty steps, > MAX_STEPS, bad title.
 */
export function createPresentation(input: any): Readonly<any> {
    if (!input || typeof input !== 'object') {
        throw new TypeError('createPresentation: input object required');
    }
    if (!isNonEmptyString(input.id)) {
        throw new RangeError('createPresentation: id must be a non-empty string');
    }
    if (!isNonEmptyString(input.title)) {
        throw new RangeError('createPresentation: title must be a non-empty string');
    }
    if (input.title.length > MAX_TITLE) {
        throw new RangeError(`createPresentation: title exceeds ${MAX_TITLE} chars`);
    }
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
        throw new RangeError('createPresentation: steps must be a non-empty array');
    }
    if (input.steps.length > MAX_STEPS) {
        throw new RangeError(`createPresentation: steps exceeds ${MAX_STEPS} entries`);
    }

    const seenIds = new Set();
    const steps = [];
    for (let i = 0; i < input.steps.length; i++) {
        const raw = input.steps[i];
        // Allow pre-validated frozen steps OR raw objects.
        const step = Object.isFrozen(raw) && raw.id && raw.title && raw.duration ? raw : createStep(raw);
        if (seenIds.has(step.id)) {
            throw new RangeError(`createPresentation: duplicate step id "${step.id}" at index ${i}`);
        }
        seenIds.add(step.id);
        steps.push(step);
    }

    const presentation = {
        id: input.id,
        title: input.title,
        description: typeof input.description === 'string' ? input.description : '',
        createdAt: isNonEmptyString(input.createdAt) ? input.createdAt : new Date(0).toISOString(),
        schemaVersion: '1.0-pure',
        steps: Object.freeze(steps),
    };

    return Object.freeze(presentation);
}

/**
 * Total dwell+transition time in seconds (for UI progress bar estimation).
 */
export function totalDuration(presentation: any): number {
    if (!presentation || !Array.isArray(presentation.steps)) return 0;
    let t = 0;
    for (const s of presentation.steps) {
        t += (Number(s.duration) || 0) + (Number(s.transitionDuration) || 0);
    }
    return t;
}

export const STEP_MODEL_CONSTANTS = Object.freeze({
    EASE_TYPES,
    AUDIO_TYPES,
    MAX_STEP_LABEL,
    MAX_STEP_NOTES,
    MAX_NARRATION,
    MAX_TITLE,
    MAX_STEPS,
});
