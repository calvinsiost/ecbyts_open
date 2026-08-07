// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Shot Planner - motion presets driven by narrative intent + hotspot.
// Replaces "fade everywhere" with focus/proof/compare/tour/cta semantics.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §11 (LV5, LV6)

export interface CameraPreset {
    move: string;
    durationSec: number;
    ease: string;
}

export interface TransitionPreset {
    primary: string;
    secondary: string;
    forbidsFadeOnly: boolean;
}

export interface HighlightPreset {
    enabled: boolean;
    color: string | null;
    pulseMs: number;
}

export interface MotionPreset {
    id: string;
    description: string;
    camera: CameraPreset;
    transition: TransitionPreset;
    highlight: HighlightPreset;
    captionAffinity: string;
}

export interface ShotPlanInput {
    intent?: string;
    focus?: {
        targetId?: string;
        rect?: unknown;
        gravity?: string;
    };
    preset?: string;
    camera?: {
        durationSec?: number;
        ease?: string;
    };
}

export interface CameraOut {
    move: string;
    durationSec: number;
    ease: string;
    hotspot: unknown | null;
    target: string | null;
}

export interface ShotPlan {
    preset: string;
    description: string;
    camera: CameraOut;
    transition: TransitionPreset;
    highlight: HighlightPreset;
    captionAffinity: string;
    warnings: string[];
}

export interface StepLike {
    export?: {
        motion_preset?: string;
    };
    story?: {
        intent?: string;
    };
    transitionEase?: string;
    focus?: unknown;
}

export interface AuditWarning {
    index: number;
    code: string;
    detail?: string;
}

export const MOTION_PRESETS = {
    focus: {
        id: 'focus',
        description: 'Zoom curto até o hotspot + highlight pulsante + caption próxima.',
        camera: { move: 'zoom-in', durationSec: 1.1, ease: 'cubic' },
        transition: { primary: 'zoom-highlight', secondary: 'soft-in', forbidsFadeOnly: true },
        highlight: { enabled: true, color: '#4fc3f7', pulseMs: 900 },
        captionAffinity: 'near-hotspot',
    },
    proof: {
        id: 'proof',
        description: 'Movimento mínimo, foco preciso, reforça confiabilidade sem ornamento.',
        camera: { move: 'dolly-hold', durationSec: 0.9, ease: 'easeInOut' },
        transition: { primary: 'reveal-evidence', secondary: 'slide-in-right', forbidsFadeOnly: true },
        highlight: { enabled: true, color: '#81c784', pulseMs: 0 },
        captionAffinity: 'anchor-side',
    },
    compare: {
        id: 'compare',
        description: 'Antes/depois — split emphasis ou alternância guiada entre dois hotspots.',
        camera: { move: 'split-pan', durationSec: 1.6, ease: 'cubic' },
        transition: { primary: 'split-wipe', secondary: 'crossfade-short', forbidsFadeOnly: true },
        highlight: { enabled: true, color: '#ffb74d', pulseMs: 600 },
        captionAffinity: 'bridge-both',
    },
    tour: {
        id: 'tour',
        description: 'Navegação contínua de fluxo — câmera mais suave e longa.',
        camera: { move: 'orbit-smooth', durationSec: 1.8, ease: 'easeInOut' },
        transition: { primary: 'parallax-drift', secondary: 'motion-blur-soft', forbidsFadeOnly: false },
        highlight: { enabled: false, color: null, pulseMs: 0 },
        captionAffinity: 'stable-band',
    },
    cta: {
        id: 'cta',
        description: 'Fechamento — composição limpa, texto maior, menos distração.',
        camera: { move: 'pull-back', durationSec: 1.4, ease: 'cubic' },
        transition: { primary: 'clean-resolve', secondary: 'logo-lift', forbidsFadeOnly: true },
        highlight: { enabled: false, color: null, pulseMs: 0 },
        captionAffinity: 'hero-block',
    },
} as const;

export type MotionPresetKey = (typeof MOTION_PRESETS)[keyof typeof MOTION_PRESETS]['id'];

export const DEFAULT_PRESET: 'tour' = 'tour';

const PRECISION_PRESETS = new Set(['focus', 'proof']);

function _resolveRequestedPreset(input: ShotPlanInput): string {
    return input.preset || input.intent || DEFAULT_PRESET;
}

function _resolveMotionPreset(requested: string): MotionPreset {
    const presets = MOTION_PRESETS as Record<string, MotionPreset>;
    return presets[requested] || presets[DEFAULT_PRESET] || MOTION_PRESETS[DEFAULT_PRESET];
}

function _buildShotWarnings(input: ShotPlanInput, preset: MotionPreset, requested: string): string[] {
    const warnings: string[] = [];
    if (!(requested in MOTION_PRESETS)) {
        warnings.push(`UNKNOWN_PRESET:${requested}`);
    }
    if (!input.focus && PRECISION_PRESETS.has(preset.id)) {
        warnings.push('MISSING_FOCUS_FOR_PRECISION_PRESET');
    }
    return warnings;
}

function _buildCameraOut(preset: MotionPreset, input: ShotPlanInput): CameraOut {
    const cameraOverrides = input.camera || {};
    return {
        move: preset.camera.move,
        durationSec: cameraOverrides.durationSec ?? preset.camera.durationSec,
        ease: cameraOverrides.ease ?? preset.camera.ease,
        hotspot: input.focus?.rect || null,
        target: input.focus?.targetId || null,
    };
}

export function buildShotPlan(input: ShotPlanInput = {}): ShotPlan {
    const requested = _resolveRequestedPreset(input);
    const preset = _resolveMotionPreset(requested);
    const warnings = _buildShotWarnings(input, preset, requested);
    const camera = _buildCameraOut(preset, input);

    return {
        preset: preset.id,
        description: preset.description,
        camera,
        transition: { ...preset.transition },
        highlight: { ...preset.highlight },
        captionAffinity: preset.captionAffinity,
        warnings,
    };
}

export function auditMotionSequence(
    steps: StepLike[],
    options: { repeatThreshold?: number; fadeOnlyCeiling?: number } = {}
): { warnings: AuditWarning[]; repeats: number; fadeOnlyFraction: number } {
    const repeatThreshold = options.repeatThreshold ?? 2;
    const fadeOnlyCeiling = options.fadeOnlyCeiling ?? 0.3;
    const warnings: AuditWarning[] = [];
    let lastPreset: string | null = null;
    let repeat = 0;
    let fadeOnly = 0;

    if (!Array.isArray(steps) || steps.length === 0) {
        return { warnings: [{ index: -1, code: 'NO_STEPS' }], repeats: 0, fadeOnlyFraction: 0 };
    }

    steps.forEach((s, i) => {
        const preset = s.export?.motion_preset || s.story?.intent || DEFAULT_PRESET;
        if (preset === lastPreset) {
            repeat += 1;
            if (repeat >= repeatThreshold) {
                warnings.push({ index: i, code: 'REPEAT_PRESET', detail: preset });
            }
        } else {
            repeat = 0;
        }
        lastPreset = preset;

        if (!s.export?.motion_preset && (s.transitionEase === 'linear' || !s.focus)) {
            fadeOnly += 1;
        }
    });

    const fadeOnlyFraction = fadeOnly / steps.length;
    if (fadeOnlyFraction > fadeOnlyCeiling) {
        warnings.push({ index: -1, code: 'MOTION_TOO_GENERIC', detail: `fadeOnly=${fadeOnlyFraction.toFixed(2)}` });
    }

    return { warnings, repeats: repeat, fadeOnlyFraction };
}

export function listPresets(): string[] {
    return Object.keys(MOTION_PRESETS);
}