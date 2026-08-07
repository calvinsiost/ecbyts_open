// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Quality Checks - pre-export diagnostics for launch-grade output.
// Aggregates narration, caption, motion, composition and export policy gates.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §4 (LV9) + §13.4

import { toTtsSafeText, detectMojibake, SANITIZER_CODES } from './narrationSanitizer.js';
import { validateCaptionSafety, checkCaptionFit } from './captionLayout.js';
import { auditMotionSequence, buildShotPlan } from './shotPlanner.js';
import { auditCompositionSequence } from './compositionPolicy.js';
import { getProfile, validateStepAgainstProfile } from './storyProfiles.js';

export const EXPORT_BLOCKING_CODES = Object.freeze({
    MOJIBAKE: 'MOJIBAKE_PRESENT',
    EXPORT_AUDIO_PROVIDER_UNSUPPORTED: 'EXPORT_AUDIO_PROVIDER_UNSUPPORTED',
    NO_STEPS: 'NO_STEPS',
    MIN_STEPS_NOT_REACHED: 'MIN_STEPS_NOT_REACHED',
    MAX_STEPS_EXCEEDED: 'MAX_STEPS_EXCEEDED',
    MISSING_VOICE_SCRIPT: 'MISSING_VOICE_SCRIPT',
    MISSING_CAPTION_SHORT: 'MISSING_CAPTION_SHORT',
    MISSING_HOTSPOT: 'MISSING_HOTSPOT',
    CAPTION_UNSAFE: 'CAPTION_UNSAFE',
    MOTION_TOO_GENERIC: 'MOTION_TOO_GENERIC',
    LOWER_THIRD_OVERUSED: 'LOWER_THIRD_OVERUSED',
} as const);

interface ExportReadinessResult {
    ok: boolean;
    errors: string[];
}

interface LaunchReadinessOptions {
    viewport?: string;
}

interface LaunchReadinessResult {
    ok: boolean;
    score: number;
    errors: any[];
    warnings: any[];
    perStep: any[];
    summary: {
        stepCount: number;
        profile?: string;
        compositionHealth?: number;
        motionFadeFraction?: number;
    };
}

interface CanExportResult {
    canExport: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate that the chosen audio config is admissible for an embedded-audio export.
 * Web Speech API cannot be recorded into MediaRecorder streams, so it's forbidden here.
 *
 * @param {any} stepOrConfig - step.audio OR {audio, export}
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateExportReadiness(stepOrConfig: any): ExportReadinessResult {
    const errors: string[] = [];
    if (!stepOrConfig) return { ok: false, errors: ['NO_INPUT'] };
    const _cfg = stepOrConfig;
    const audio = _cfg.audio || _cfg;
    const exportCfg = _cfg.export || {};

    const embedAudio = exportCfg.embedAudio !== false;
    if (embedAudio && audio && audio.type === 'webSpeech') {
        errors.push(EXPORT_BLOCKING_CODES.EXPORT_AUDIO_PROVIDER_UNSUPPORTED);
    }
    if (audio && audio.text && detectMojibake(audio.text)) {
        errors.push(EXPORT_BLOCKING_CODES.MOJIBAKE);
    }

    return { ok: errors.length === 0, errors };
}

/**
 * Full launch-readiness diagnostic.
 * Aggregates narration, caption, motion and export-policy checks.
 *
 * @param {any} presentation - sanitized presentation v1.1
 * @param {LaunchReadinessOptions} [options]
 * @returns {{ok: boolean, score: number, errors: any[], warnings: any[], perStep: any[], summary: object}}
 */
export function validateLaunchReadiness(presentation: any, options: LaunchReadinessOptions = {}): LaunchReadinessResult {
    const viewport = options.viewport || 'desktop';
    const errors: any[] = [];
    const warnings: any[] = [];
    const perStep: any[] = [];

    const _pres = presentation;
    if (!_pres || !Array.isArray(_pres.steps) || _pres.steps.length === 0) {
        return {
            ok: false,
            score: 0,
            errors: [{ code: EXPORT_BLOCKING_CODES.NO_STEPS }],
            warnings: [],
            perStep: [],
            summary: { stepCount: 0 },
        };
    }

    const profileId = _pres.profileId || 'launch_video_technical_environmental';
    let profile: any;
    try {
        profile = getProfile(profileId);
    } catch {
        profile = getProfile('launch_video_technical_environmental');
        warnings.push({ code: 'UNKNOWN_PROFILE_FALLBACK', detail: profileId });
    }

    if (_pres.steps.length < profile.quality.minSteps) {
        errors.push({ code: EXPORT_BLOCKING_CODES.MIN_STEPS_NOT_REACHED, detail: profile.quality.minSteps });
    }
    if (_pres.steps.length > profile.quality.maxSteps) {
        warnings.push({ code: EXPORT_BLOCKING_CODES.MAX_STEPS_EXCEEDED, detail: profile.quality.maxSteps });
    }

    _pres.steps.forEach((step: any, i: any) => {
        const stepReport: { index: number, id: any, errors: any[], warnings: any[] } = { index: i, id: step.id, errors: [], warnings: [] };

        const profileCheck = validateStepAgainstProfile(step, profile.id);
        profileCheck.missing.forEach((m: string) => {
            if (m === 'story.voice_script')
                stepReport.errors.push({ code: EXPORT_BLOCKING_CODES.MISSING_VOICE_SCRIPT });
            else if (m === 'story.caption_short')
                stepReport.errors.push({ code: EXPORT_BLOCKING_CODES.MISSING_CAPTION_SHORT });
            else if (m === 'focus.targetId|focus.rect')
                stepReport.errors.push({ code: EXPORT_BLOCKING_CODES.MISSING_HOTSPOT });
            else stepReport.warnings.push({ code: `MISSING:${m}` });
        });

        const voiceText = step.story?.voice_script || step.audio?.text || '';
        if (voiceText) {
            const tts = toTtsSafeText(voiceText, { segmentLimit: profile.narration.segmentLimit });
            tts.errors.forEach((e: string) => stepReport.errors.push({ code: e }));
            tts.warnings.forEach((w: string) => stepReport.warnings.push({ code: w }));
        }

        const captionText = step.story?.caption_short || step.story?.caption_text || '';
        if (captionText) {
            const fit = checkCaptionFit(captionText, viewport);
            if (!fit.fits) stepReport.warnings.push({ code: 'CAPTION_OVERFLOW', detail: `${fit.lines}/${fit.max}` });
        }

        const captionSafety = validateCaptionSafety(step, viewport);
        if (!captionSafety.ok) {
            captionSafety.violations.forEach((v: string) =>
                stepReport.errors.push({ code: EXPORT_BLOCKING_CODES.CAPTION_UNSAFE, detail: v }),
            );
        }

        const audioCheck = validateExportReadiness({ audio: step.audio, export: step.export });
        audioCheck.errors.forEach((e) => stepReport.errors.push({ code: e }));

        const shot = buildShotPlan({
            intent: step.story?.intent,
            focus: step.focus,
            preset: step.export?.motion_preset,
        });
        shot.warnings.forEach((w: string) => stepReport.warnings.push({ code: w }));

        perStep.push(stepReport);
    });

    const motionAudit = auditMotionSequence(_pres.steps, {
        repeatThreshold: profile.motion.repeatPresetWarningAfter,
    });
    motionAudit.warnings.forEach((w: any) => warnings.push(w));

    const compAudit = auditCompositionSequence(_pres.steps, viewport);
    compAudit.warnings.forEach((w: any) => warnings.push({ code: w.code, index: w.index }));

    perStep.forEach((s: any) => {
        s.errors.forEach((e: any) => errors.push({ step: s.index, ...e }));
        s.warnings.forEach((w: any) => warnings.push({ step: s.index, ...w }));
    });

    const score = _scoreReadiness({
        stepCount: _pres.steps.length,
        errors,
        warnings,
        compHealth: compAudit.sequenceHealth,
    });

    return {
        ok: errors.length === 0,
        score,
        errors,
        warnings,
        perStep,
        summary: {
            stepCount: _pres.steps.length,
            profile: profile.id,
            compositionHealth: compAudit.sequenceHealth,
            motionFadeFraction: motionAudit.fadeOnlyFraction,
        },
    };
}

function _scoreReadiness({ stepCount: _stepCount, errors, warnings, compHealth }: { stepCount: number, errors: any[], warnings: any[], compHealth: number }): number {
    if (errors.length > 0) return 0;
    const warnPenalty = Math.min(0.4, warnings.length * 0.04);
    const base = 0.7 + compHealth * 0.3;
    return Math.max(0, Math.min(1, base - warnPenalty));
}

/**
 * Shortcut used by UI: bubble-up single boolean plus localized error codes.
 *
 * @param {any} presentation
 * @returns {{canExport: boolean, errors: string[], warnings: string[]}}
 */
export function canExport(presentation: any): CanExportResult {
    const result = validateLaunchReadiness(presentation);
    return {
        canExport: result.ok,
        errors: result.errors.map((e) => e.code),
        warnings: result.warnings.map((w) => w.code),
    };
}

export const QUALITY_CODES = Object.freeze({
    ...EXPORT_BLOCKING_CODES,
    ...SANITIZER_CODES,
});
