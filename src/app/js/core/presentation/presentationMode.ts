// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRESENTATION MODE — SPEC_PRESENTATION_MODE (PRESENTATION-MODE-001)

   Pure helpers para modo apresentação (tour guiado):
   - Step schema + validation
   - Mode state machine: idle → record → edit → player
   - Camera tween cubic ease §Q3
   - TTS vs upload audio decision §Q2
   - ECBT encoder integration (presentation campo opcional) §Q4

   Three.js + Web Speech API em handler. Core só matemática + state.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Modes §1
// ──────────────────────────────────────────────────────────────────────

export const PRESENTATION_MODES = Object.freeze(['idle', 'record', 'edit', 'player']);
export const DEFAULT_MODE = 'idle';

// §3.2 durations
export const DEFAULT_STEP_DURATION_MS = 3000;
export const DEFAULT_TRANSITION_MS = 1500;
export const MIN_STEP_DURATION_MS = 100;
export const MAX_STEP_DURATION_MS = 60_000;

// Audio types §Q2
export const AUDIO_TYPES = Object.freeze(['none', 'tts', 'upload']);

// Presentation schema version §Q4 (backward compat)
export const PRESENTATION_SCHEMA_VERSION = 'presentation.v1';

// ──────────────────────────────────────────────────────────────────────
// Mode state machine
// ──────────────────────────────────────────────────────────────────────

const MODE_TRANSITIONS: Readonly<Record<string, string[]>> = Object.freeze({
    idle: ['record', 'edit', 'player'],
    record: ['idle', 'edit'],
    edit: ['idle', 'player', 'record'],
    player: ['idle', 'edit'],
});

/**
 * @param from
 * @param to
 */
export function canTransitionMode(from: string, to: string): { allowed: boolean; reason: string } {
    if (!PRESENTATION_MODES.includes(from)) return { allowed: false, reason: `invalid from: ${from}` };
    if (!PRESENTATION_MODES.includes(to)) return { allowed: false, reason: `invalid to: ${to}` };
    if (from === to) return { allowed: false, reason: 'no_op' };
    const allowed = MODE_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) return { allowed: false, reason: `not allowed: ${from} → ${to}` };
    return { allowed: true, reason: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// Step schema validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de step.
 *
 * @param step - { id, camera: {x,y,z, targetX,targetY,targetZ}, label, durationMs, transitionMs?, audio?, temporalT? }
 */
export function validateStep(step: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!step || typeof step !== 'object') return { valid: false, errors: ['step not object'] };
    if (!step.id || typeof step.id !== 'string') errors.push('id required');
    if (!step.camera || typeof step.camera !== 'object') {
        errors.push('camera required');
    } else {
        const required = ['x', 'y', 'z', 'targetX', 'targetY', 'targetZ'];
        for (const key of required) {
            if (!Number.isFinite(step.camera[key])) errors.push(`camera.${key} must be finite`);
        }
    }
    if (
        !Number.isFinite(step.durationMs) ||
        step.durationMs < MIN_STEP_DURATION_MS ||
        step.durationMs > MAX_STEP_DURATION_MS
    ) {
        errors.push(`durationMs must be in [${MIN_STEP_DURATION_MS}, ${MAX_STEP_DURATION_MS}]`);
    }
    if (step.transitionMs != null && (!Number.isFinite(step.transitionMs) || step.transitionMs < 0)) {
        errors.push('transitionMs must be non-negative');
    }
    if (step.audio) {
        if (!AUDIO_TYPES.includes(step.audio.type)) errors.push(`audio.type must be one of: ${AUDIO_TYPES.join(', ')}`);
        if (step.audio.type === 'tts' && (!step.audio.text || typeof step.audio.text !== 'string')) {
            errors.push('audio.text required for tts');
        }
    }
    if (step.temporalT != null && (!Number.isFinite(step.temporalT) || step.temporalT < 0 || step.temporalT > 1)) {
        errors.push('temporalT must be in [0, 1]');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Presentation schema validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida presentation completa.
 *
 * @param presentation - { version, steps, title?, description? }
 */
export function validatePresentation(presentation: any): {
    valid: boolean;
    errors: string[];
    stepErrors: Array<{ index: number; errors: string[] }>;
} {
    const errors: string[] = [];
    const stepErrors: Array<{ index: number; errors: string[] }> = [];
    if (!presentation || typeof presentation !== 'object') {
        return { valid: false, errors: ['presentation not object'], stepErrors: [] };
    }
    if (presentation.version !== PRESENTATION_SCHEMA_VERSION) {
        errors.push(`version must be ${PRESENTATION_SCHEMA_VERSION}`);
    }
    if (!Array.isArray(presentation.steps)) {
        errors.push('steps must be array');
    } else {
        presentation.steps.forEach((step: any, i: number) => {
            const r = validateStep(step);
            if (!r.valid) {
                stepErrors.push({ index: i, errors: r.errors });
                errors.push(`step[${i}] invalid`);
            }
        });
    }
    return { valid: errors.length === 0, errors, stepErrors };
}

// ──────────────────────────────────────────────────────────────────────
// Camera tween - cubic ease §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Cubic ease-in-out para alpha ∈ [0, 1].
 *
 * @param t
 */
export function cubicEaseInOut(t: number): number {
    if (!Number.isFinite(t)) return 0;
    const clamped = Math.max(0, Math.min(1, t));
    return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Interpola camera entre dois steps.
 *
 * @param cameraA
 * @param any>
 * @param cameraB - ∈ [0, 1]
 */
export function interpolateCamera(
    cameraA: Record<string, any> | null | undefined,
    cameraB: Record<string, any> | null | undefined,
    alpha: number,
): Record<string, number> | null {
    if (!cameraA || !cameraB) return null;
    const t = cubicEaseInOut(alpha);
    const keys = ['x', 'y', 'z', 'targetX', 'targetY', 'targetZ'];
    const out: Record<string, number> = {};
    for (const key of keys) {
        const a = Number(cameraA[key]);
        const b = Number(cameraB[key]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        out[key] = a + (b - a) * t;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Playback timeline
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa duração total da presentation.
 *
 * @param presentation
 * @returns ms
 */
export function computeTotalDuration(presentation: any): number {
    if (!presentation || !Array.isArray(presentation.steps)) return 0;
    return presentation.steps.reduce((sum: number, step: any) => {
        const dur = Number(step.durationMs) || DEFAULT_STEP_DURATION_MS;
        const trans = Number(step.transitionMs) || DEFAULT_TRANSITION_MS;
        return sum + dur + trans;
    }, 0);
}

/**
 * Encontra step atual dado tempo decorrido.
 *
 * @param presentation
 * @param elapsedMs
 */
export function findCurrentStep(
    presentation: any,
    elapsedMs: number,
): { stepIndex: number; stepProgress: number; phase: string } {
    if (!presentation || !Array.isArray(presentation.steps) || presentation.steps.length === 0) {
        return { stepIndex: -1, stepProgress: 0, phase: 'idle' };
    }
    let acc = 0;
    for (let i = 0; i < presentation.steps.length; i++) {
        const step = presentation.steps[i];
        const dur = Number(step.durationMs) || DEFAULT_STEP_DURATION_MS;
        const trans = Number(step.transitionMs) || DEFAULT_TRANSITION_MS;

        if (elapsedMs < acc + dur) {
            return { stepIndex: i, stepProgress: (elapsedMs - acc) / dur, phase: 'hold' };
        }
        if (elapsedMs < acc + dur + trans) {
            return {
                stepIndex: i,
                stepProgress: (elapsedMs - acc - dur) / trans,
                phase: 'transition',
            };
        }
        acc += dur + trans;
    }
    return {
        stepIndex: presentation.steps.length - 1,
        stepProgress: 1,
        phase: 'complete',
    };
}

// ──────────────────────────────────────────────────────────────────────
// Step CRUD (pure)
// ──────────────────────────────────────────────────────────────────────

/**
 * Insere step em posição.
 * @param steps
 * @param step
 * @param index
 */
export function insertStep(steps: any[], step: any, index?: number): any[] {
    const arr = Array.isArray(steps) ? steps.slice() : [];
    const validInsertAt =
        Number.isFinite(index) && (index as number) >= 0 && (index as number) <= arr.length
            ? (index as number)
            : arr.length;
    arr.splice(validInsertAt, 0, step);
    return arr;
}

/**
 * Reordena step.
 * @param steps
 * @param fromIndex
 * @param toIndex
 */
export function moveStep(steps: any[], fromIndex: number, toIndex: number): any[] {
    if (!Array.isArray(steps) || fromIndex === toIndex) return steps;
    if (fromIndex < 0 || fromIndex >= steps.length) return steps;
    if (toIndex < 0 || toIndex >= steps.length) return steps;
    const arr = steps.slice();
    const [removed] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, removed);
    return arr;
}

/**
 * Remove step.
 * @param steps
 * @param stepId
 */
export function removeStep(steps: any[], stepId: string): any[] {
    if (!Array.isArray(steps) || !stepId) return steps || [];
    return steps.filter((s: any) => s?.id !== stepId);
}
