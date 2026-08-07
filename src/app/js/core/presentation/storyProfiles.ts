// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Story Profiles - presets that bind narrative intent to composition/motion policies.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §4 (LV1, LV10)

export const STORY_INTENTS = Object.freeze(['focus', 'proof', 'compare', 'tour', 'cta']);
export const CLAIM_LEVELS = Object.freeze(['verified', 'careful', 'visionary']);
export const VIEWPORTS = Object.freeze(['mobile', 'desktop', 'clean_export']);
export const AUDIO_PROVIDERS = Object.freeze(['aiVoice', 'upload', 'webSpeech', 'none']);

export interface StoryProfile {
    id: string;
    label: string;
    description: string;
    audience: string;
    aspectRatio: string;
    previewViewports: string[];
    audio: {
        defaultProvider: string;
        allowWebSpeechForExport: boolean;
        language: string;
        voice: string | null;
        volume: number;
    };
    captions: {
        burnIn: boolean;
        requireShort: boolean;
        desktopSafeMargin: number;
        mobileSafeMargin: number;
        maxLinesMobile: number;
        maxLinesDesktop: number;
    };
    motion: {
        defaultPreset: string;
        forbidFadeOnlySequences: boolean;
        repeatPresetWarningAfter: number;
        cameraEase: string;
        cameraDefaultDuration: number;
    };
    narration: {
        sanitizerProfile: string;
        segmentLimit: number;
        blockOnMojibake: boolean;
        requireVoiceScript: boolean;
        requireCaptionShort: boolean;
    };
    quality: {
        minSteps: number;
        maxSteps: number;
        requireHotspotPerStep: boolean;
        requireHeadlinePerStep: boolean;
        maxRepeatLowerThird: number;
    };
}

const PROFILES: Record<string, StoryProfile> = {
    launch_video_technical_environmental: {
        id: 'launch_video_technical_environmental',
        label: 'Launch Video · Technical Environmental',
        description:
            'Master para público técnico ambiental. Prioriza prova visual, rastreabilidade e composição procedural.',
        audience: 'technical_environmental',
        aspectRatio: '9:16',
        previewViewports: ['mobile', 'desktop', 'clean_export'],
        audio: {
            defaultProvider: 'aiVoice',
            allowWebSpeechForExport: false,
            language: 'pt-BR',
            voice: 'nova',
            volume: 0.95,
        },
        captions: {
            burnIn: true,
            requireShort: true,
            desktopSafeMargin: 0.18,
            mobileSafeMargin: 0.12,
            maxLinesMobile: 3,
            maxLinesDesktop: 2,
        },
        motion: {
            defaultPreset: 'focus',
            forbidFadeOnlySequences: true,
            repeatPresetWarningAfter: 2,
            cameraEase: 'cubic',
            cameraDefaultDuration: 1.2,
        },
        narration: {
            sanitizerProfile: 'strict',
            segmentLimit: 180,
            blockOnMojibake: true,
            requireVoiceScript: true,
            requireCaptionShort: true,
        },
        quality: {
            minSteps: 4,
            maxSteps: 12,
            requireHotspotPerStep: true,
            requireHeadlinePerStep: false,
            maxRepeatLowerThird: 2,
        },
    },
    commercial_demo: {
        id: 'commercial_demo',
        label: 'Commercial Demo',
        description: 'Apresentações comerciais curtas com CTA forte e motion mais livre.',
        audience: 'commercial',
        aspectRatio: '9:16',
        previewViewports: ['mobile', 'desktop'],
        audio: {
            defaultProvider: 'aiVoice',
            allowWebSpeechForExport: false,
            language: 'pt-BR',
            voice: 'nova',
            volume: 0.95,
        },
        captions: {
            burnIn: true,
            requireShort: true,
            desktopSafeMargin: 0.15,
            mobileSafeMargin: 0.1,
            maxLinesMobile: 3,
            maxLinesDesktop: 2,
        },
        motion: {
            defaultPreset: 'tour',
            forbidFadeOnlySequences: true,
            repeatPresetWarningAfter: 3,
            cameraEase: 'cubic',
            cameraDefaultDuration: 1.0,
        },
        narration: {
            sanitizerProfile: 'strict',
            segmentLimit: 200,
            blockOnMojibake: true,
            requireVoiceScript: true,
            requireCaptionShort: true,
        },
        quality: {
            minSteps: 3,
            maxSteps: 10,
            requireHotspotPerStep: false,
            requireHeadlinePerStep: false,
            maxRepeatLowerThird: 3,
        },
    },
    academic: {
        id: 'academic',
        label: 'Academic / Research',
        description: 'Tours para defesa acadêmica — ritmo maior, sem pressão comercial.',
        audience: 'academic',
        aspectRatio: '16:9',
        previewViewports: ['desktop', 'clean_export'],
        audio: {
            defaultProvider: 'aiVoice',
            allowWebSpeechForExport: true,
            language: 'pt-BR',
            voice: 'nova',
            volume: 0.9,
        },
        captions: {
            burnIn: false,
            requireShort: false,
            desktopSafeMargin: 0.15,
            mobileSafeMargin: 0.1,
            maxLinesMobile: 3,
            maxLinesDesktop: 2,
        },
        motion: {
            defaultPreset: 'tour',
            forbidFadeOnlySequences: false,
            repeatPresetWarningAfter: 4,
            cameraEase: 'cubic',
            cameraDefaultDuration: 1.6,
        },
        narration: {
            sanitizerProfile: 'lenient',
            segmentLimit: 260,
            blockOnMojibake: true,
            requireVoiceScript: false,
            requireCaptionShort: false,
        },
        quality: {
            minSteps: 4,
            maxSteps: 30,
            requireHotspotPerStep: false,
            requireHeadlinePerStep: false,
            maxRepeatLowerThird: 5,
        },
    },
    free_form: {
        id: 'free_form',
        label: 'Free Form',
        description: 'Perfil mínimo sem guardrails. Para rascunho rápido.',
        audience: 'any',
        aspectRatio: 'inherit',
        previewViewports: ['desktop'],
        audio: {
            defaultProvider: 'webSpeech',
            allowWebSpeechForExport: true,
            language: 'pt-BR',
            voice: null,
            volume: 0.9,
        },
        captions: {
            burnIn: false,
            requireShort: false,
            desktopSafeMargin: 0.08,
            mobileSafeMargin: 0.08,
            maxLinesMobile: 4,
            maxLinesDesktop: 3,
        },
        motion: {
            defaultPreset: 'tour',
            forbidFadeOnlySequences: false,
            repeatPresetWarningAfter: 99,
            cameraEase: 'linear',
            cameraDefaultDuration: 1.5,
        },
        narration: {
            sanitizerProfile: 'lenient',
            segmentLimit: 400,
            blockOnMojibake: false,
            requireVoiceScript: false,
            requireCaptionShort: false,
        },
        quality: {
            minSteps: 1,
            maxSteps: 100,
            requireHotspotPerStep: false,
            requireHeadlinePerStep: false,
            maxRepeatLowerThird: 99,
        },
    },
};

/**
 * List all registered story profiles.
 *
 * @returns
 */
export function listProfiles(): Array<object> {
    return Object.values(PROFILES).map((p) => ({
        id: p.id,
        label: p.label,
        audience: p.audience,
        description: p.description,
    }));
}

/**
 * Return deep clone of a profile by ID; throws for unknown IDs.
 *
 * @param id
 * @returns
 */
export function getProfile(id: string): StoryProfile {
    const p = PROFILES[id];
    if (!p) throw new Error(`Unknown story profile: ${id}`);
    return JSON.parse(JSON.stringify(p)) as StoryProfile;
}

/**
 * Return the default profile (Launch Video · Technical Environmental).
 */
export function getDefaultProfile() {
    return getProfile('launch_video_technical_environmental');
}

/**
 * Merge a profile into a bare presentation object.
 * Sets presentation.profileId and propagates defaults to presentation.audio, etc.
 *
 * @param presentation
 * @param profileId
 * @returns new presentation (does not mutate input)
 */
export function applyProfile(presentation: any, profileId: string): any {
    const base: any = presentation ? JSON.parse(JSON.stringify(presentation)) : {};
    const profile = getProfile(profileId);
    base.profileId = profile.id;
    base.audience = profile.audience;
    base.aspectRatio = base.aspectRatio ?? profile.aspectRatio;
    base.defaults = {
        audio: profile.audio,
        captions: profile.captions,
        motion: profile.motion,
        narration: profile.narration,
        quality: profile.quality,
    };
    return base;
}

interface StepValidationContext {
    readonly story: Record<string, unknown>;
    readonly focus: Record<string, unknown>;
    readonly missing: string[];
}

function validateNarrationRequirements(ctx: StepValidationContext, profile: StoryProfile): void {
    if (profile.narration.requireVoiceScript && !ctx.story.voice_script) {
        ctx.missing.push('story.voice_script');
    }
    if (profile.narration.requireCaptionShort && !ctx.story.caption_short) {
        ctx.missing.push('story.caption_short');
    }
}

function validateHotspotRequirement(ctx: StepValidationContext, profile: StoryProfile): void {
    if (!profile.quality.requireHotspotPerStep) return;
    if (!ctx.focus.targetId && !ctx.focus.rect) ctx.missing.push('focus.targetId|focus.rect');
}

function validateHeadlineRequirement(ctx: StepValidationContext, profile: StoryProfile): void {
    if (profile.quality.requireHeadlinePerStep && !ctx.story.headline) {
        ctx.missing.push('story.headline');
    }
}

function validateStoryEnums(ctx: StepValidationContext): void {
    const intent = ctx.story.intent;
    if (typeof intent === 'string' && !STORY_INTENTS.includes(intent)) {
        ctx.missing.push('story.intent(invalid)');
    }
    const claimLevel = ctx.story.claim_level;
    if (typeof claimLevel === 'string' && !CLAIM_LEVELS.includes(claimLevel)) {
        ctx.missing.push('story.claim_level(invalid)');
    }
}

/**
 * Check that a step satisfies the active profile's minimum narrative requirements.
 *
 * @param step
 * @param profileId
 * @returns
 */
export function validateStepAgainstProfile(step: any, profileId: string): { ok: boolean; missing: string[] } {
    const profile = getProfile(profileId);
    if (!step || typeof step !== 'object') {
        return { ok: false, missing: ['step'] };
    }
    const story = step.story || {};
    const focus = step.focus || {};
    const missing: string[] = [];
    const ctx: StepValidationContext = { story, focus, missing };

    validateNarrationRequirements(ctx, profile);
    validateHotspotRequirement(ctx, profile);
    validateHeadlineRequirement(ctx, profile);
    validateStoryEnums(ctx);

    return { ok: missing.length === 0, missing };
}

/**
 * Return the list of profile IDs for UI selectors.
 */
export function listProfileIds() {
    return Object.keys(PROFILES);
}
