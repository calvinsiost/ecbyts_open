// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Persistence - serialize/deserialize presentations to/from ECBT payload.
// Schema v1.1 adds Launch Video fields (story/focus/layout/export) under each step.
// Legacy v1.0 keys continue loading via optional-chain defaults.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §7

const PRESENTATION_VERSION = '1.1';
const STORY_INTENTS = ['focus', 'proof', 'compare', 'tour', 'cta'];
const CLAIM_LEVELS = ['verified', 'careful', 'visionary'];
const CAPTION_ZONES = ['auto', 'top', 'middle', 'lower-mid', 'lower'];
const CAPTION_ALIGNS = ['left', 'center', 'right'];
const FRAME_CLIP_MODES = ['auto', 'full', 'focus', 'center', 'left-pane', 'right-pane', 'top', 'bottom', 'custom'];
const AUDIO_TYPES = ['tts', 'aiVoice', 'upload', 'webSpeech', 'none'];
const AUDIO_PROVIDERS = ['openai', 'elevenlabs', 'piper', 'webSpeech', null];
const MOTION_PRESETS = ['focus', 'proof', 'compare', 'tour', 'cta'];
const EASES = ['linear', 'cubic', 'easeInOut'];
const RUNTIME_ACTION_TYPES = [
    'sleep',
    'close_known_surfaces',
    'switch_group',
    'switch_view',
    'fit_all_elements',
    'apply_geology_preset',
    'open_random_modal',
    'open_temporal_analysis',
    'datastudio_query',
    'datastudio_module',
    'open_eis_dashboard',
    'open_validation_profiles',
    'call_window_handler',
];

/**
 * Validate a presentation object structure. Returns sanitized copy or null if invalid.
 */
export function validatePresentation(input: any): object | null {
    if (!input || typeof input !== 'object') return null;
    if (!Array.isArray(input.steps)) return null;

    const sanitized = {
        id: typeof input.id === 'string' ? input.id : `pres-imported-${Date.now()}`,
        version: input.version || PRESENTATION_VERSION,
        profileId: typeof input.profileId === 'string' ? input.profileId : null,
        audience: typeof input.audience === 'string' ? input.audience : null,
        aspectRatio: typeof input.aspectRatio === 'string' ? input.aspectRatio : null,
        title: String(input.title || 'Untitled').slice(0, 200),
        description: String(input.description || '').slice(0, 1000),
        createdAt: input.createdAt || new Date().toISOString(),
        updatedAt: input.updatedAt || new Date().toISOString(),
        defaults: _sanitizeDefaults(input.defaults),
        steps: input.steps.map(_sanitizeStep).filter(Boolean),
        audioTrack: _sanitizeAudioTrack(input.audioTrack),
    };

    return sanitized;
}

function _sanitizeStep(step: any): object | null {
    if (!step || typeof step !== 'object') return null;
    if (!step.camera || typeof step.camera !== 'object') return null;

    return {
        id: String(step.id || `step-imported-${Math.random().toString(36).slice(2, 8)}`),
        label: String(step.label || 'Step').slice(0, 200),
        annotation: String(step.annotation || '').slice(0, 2000),
        camera: _sanitizeCamera(step.camera),
        duration: Math.max(0.1, Math.min(120, Number(step.duration) || 3.0)),
        transitionDuration: Math.max(0, Math.min(30, Number(step.transitionDuration) || 1.5)),
        transitionEase: EASES.includes(step.transitionEase) ? step.transitionEase : 'cubic',
        audio: _sanitizeAudio(step.audio),
        temporalT: typeof step.temporalT === 'number' ? Math.max(0, Math.min(1, step.temporalT)) : null,
        visibleElements: Array.isArray(step.visibleElements) ? step.visibleElements.map(String) : null,
        story: _sanitizeStory(step.story),
        focus: _sanitizeFocus(step.focus),
        layout: _sanitizeLayout(step.layout),
        export: _sanitizeExport(step.export),
        runtime: _sanitizeRuntime(step.runtime),
    };
}

function _sanitizeCamera(cam: any): object | null {
    if (!cam) return null;
    return {
        position: _sanitizeVec3(cam.position),
        target: _sanitizeVec3(cam.target || { x: 0, y: 0, z: 0 }),
        zoom: typeof cam.zoom === 'number' ? cam.zoom : 1.0,
    };
}

function _sanitizeVec3(v: any): { x: number; y: number; z: number } {
    if (!v || typeof v !== 'object') return { x: 0, y: 0, z: 0 };
    return {
        x: Number(v.x) || 0,
        y: Number(v.y) || 0,
        z: Number(v.z) || 0,
    };
}

function _sanitizeAudio(audio: any): object | null {
    if (!audio || typeof audio !== 'object') return null;
    const rawType = audio.type;
    const type = AUDIO_TYPES.includes(rawType) ? rawType : 'none';
    const provider = AUDIO_PROVIDERS.includes(audio.provider) ? audio.provider : null;
    return {
        type,
        provider,
        text: ['tts', 'aiVoice', 'webSpeech'].includes(type) ? String(audio.text || '').slice(0, 5000) : undefined,
        lang: typeof audio.lang === 'string' ? audio.lang : 'pt-BR',
        voice: typeof audio.voice === 'string' ? audio.voice : null,
        rate: typeof audio.rate === 'number' ? audio.rate : 1.0,
        pitch: typeof audio.pitch === 'number' ? audio.pitch : 1.0,
        volume: typeof audio.volume === 'number' ? audio.volume : 1.0,
        filename: type === 'upload' && typeof audio.filename === 'string' ? audio.filename : undefined,
    };
}

function _sanitizeAudioTrack(track: any): object | null {
    if (!track || typeof track !== 'object') return null;
    return {
        type: track.type || 'upload',
        filename: track.filename || null,
        volume: typeof track.volume === 'number' ? track.volume : 0.3,
    };
}

function _sanitizeStory(story: any): object | null {
    if (!story || typeof story !== 'object') return null;
    const intent = STORY_INTENTS.includes(story.intent) ? story.intent : null;
    const claim_level = CLAIM_LEVELS.includes(story.claim_level) ? story.claim_level : null;
    const emphasis_terms = Array.isArray(story.emphasis_terms)
        ? story.emphasis_terms.map(String).filter(Boolean).slice(0, 12)
        : [];
    return {
        intent,
        audience: typeof story.audience === 'string' ? story.audience : null,
        headline: String(story.headline || '').slice(0, 240),
        voice_script: String(story.voice_script || '').slice(0, 5000),
        caption_text: String(story.caption_text || '').slice(0, 1200),
        caption_short: String(story.caption_short || '').slice(0, 200),
        emphasis_terms,
        claim_level,
    };
}

function _sanitizeFocus(focus: any): object | null {
    if (!focus || typeof focus !== 'object') return null;
    const rect =
        focus.rect && typeof focus.rect === 'object'
            ? {
                  x: _clamp01(focus.rect.x),
                  y: _clamp01(focus.rect.y),
                  w: _clamp01(focus.rect.w),
                  h: _clamp01(focus.rect.h),
              }
            : null;
    return {
        targetId: typeof focus.targetId === 'string' ? focus.targetId : null,
        rect,
        gravity: ['center', 'left', 'right', 'top', 'bottom'].includes(focus.gravity) ? focus.gravity : 'center',
    };
}

function _sanitizeLayout(layout: any): object | null {
    if (!layout || typeof layout !== 'object') return null;
    return {
        caption_zone: CAPTION_ZONES.includes(layout.caption_zone) ? layout.caption_zone : 'auto',
        caption_align: CAPTION_ALIGNS.includes(layout.caption_align) ? layout.caption_align : 'left',
        desktop_safe: layout.desktop_safe !== false,
        mobile_safe: layout.mobile_safe !== false,
        frame_clip_mode: FRAME_CLIP_MODES.includes(layout.frame_clip_mode) ? layout.frame_clip_mode : 'auto',
        frame_clip_rect: _sanitizeFrameClipRect(layout.frame_clip_rect),
    };
}

function _sanitizeExport(exportCfg: any): object | null {
    if (!exportCfg || typeof exportCfg !== 'object') return null;
    return {
        burn_in_caption: exportCfg.burn_in_caption !== false,
        show_headline: !!exportCfg.show_headline,
        motion_preset: MOTION_PRESETS.includes(exportCfg.motion_preset) ? exportCfg.motion_preset : null,
        embedAudio: exportCfg.embedAudio !== false,
    };
}

function _sanitizeRuntime(runtime: any): object | null {
    if (!runtime || typeof runtime !== 'object') return null;
    const actions = Array.isArray(runtime.actions) ? runtime.actions.map(_sanitizeRuntimeAction).filter(Boolean) : [];
    return actions.length ? { actions } : null;
}

function _sanitizeRuntimeAction(action: any): object | null {
    if (!action || typeof action !== 'object') return null;
    const type = RUNTIME_ACTION_TYPES.includes(action.type) ? action.type : null;
    if (!type) return null;

    return {
        type,
        delayMs: _sanitizeDelay(action.delayMs),
        waitAfterMs: _sanitizeDelay(action.waitAfterMs),
        ms: _sanitizeDelay(action.ms),
        ids: Array.isArray(action.ids) ? action.ids.map(String).filter(Boolean).slice(0, 12) : undefined,
        group: typeof action.group === 'string' ? action.group.slice(0, 60) : undefined,
        mode: typeof action.mode === 'string' ? action.mode.slice(0, 60) : undefined,
        preset: typeof action.preset === 'string' ? action.preset.slice(0, 60) : undefined,
        module: typeof action.module === 'string' ? action.module.slice(0, 60) : undefined,
        analyticsModule: typeof action.analyticsModule === 'string' ? action.analyticsModule.slice(0, 60) : undefined,
        sql: typeof action.sql === 'string' ? action.sql.slice(0, 4000) : undefined,
        run: typeof action.run === 'boolean' ? action.run : undefined,
        handler: typeof action.handler === 'string' ? action.handler.slice(0, 120) : undefined,
        args: Array.isArray(action.args) ? action.args.slice(0, 8) : undefined,
        selectedFamilies: Array.isArray(action.selectedFamilies)
            ? action.selectedFamilies.map(String).filter(Boolean).slice(0, 32)
            : undefined,
        preferredFamilies: Array.isArray(action.preferredFamilies)
            ? action.preferredFamilies.map(String).filter(Boolean).slice(0, 16)
            : undefined,
        preferredParameters: Array.isArray(action.preferredParameters)
            ? action.preferredParameters.map(String).filter(Boolean).slice(0, 16)
            : undefined,
        minObservations: Number.isFinite(Number(action.minObservations))
            ? Math.max(3, Math.min(500, Math.round(Number(action.minObservations))))
            : undefined,
        options: action.options && typeof action.options === 'object' ? { ...action.options } : undefined,
    };
}

function _sanitizeDefaults(defaults: any): object | null {
    if (!defaults || typeof defaults !== 'object') return null;
    return {
        audio: defaults.audio && typeof defaults.audio === 'object' ? defaults.audio : null,
        captions: defaults.captions && typeof defaults.captions === 'object' ? defaults.captions : null,
        motion: defaults.motion && typeof defaults.motion === 'object' ? defaults.motion : null,
        narration: defaults.narration && typeof defaults.narration === 'object' ? defaults.narration : null,
        quality: defaults.quality && typeof defaults.quality === 'object' ? defaults.quality : null,
    };
}

function _sanitizeFrameClipRect(rect: any): { x: number; y: number; w: number; h: number } | null {
    if (!rect || typeof rect !== 'object') return null;
    const w = _clampRange(rect.w, 0.08, 1, 1);
    const h = _clampRange(rect.h, 0.08, 1, 1);
    const x = _clampRange(rect.x, 0, Math.max(0, 1 - w), 0);
    const y = _clampRange(rect.y, 0, Math.max(0, 1 - h), 0);
    return { x, y, w, h };
}

function _clamp01(v: any): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function _clampRange(v: any, min: number, max: number, fallback: number = min): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function _sanitizeDelay(v: any): number | undefined {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(60_000, Math.round(n)));
}

/**
 * Serialize presentation for inclusion in ECBT key payload.
 */
export function serializeForEcbt(presentation: any): object | null {
    const v = validatePresentation(presentation);
    if (!v) return null;
    return v;
}

/**
 * Deserialize presentation from ECBT key payload.
 * Returns null if absent (backward compat with v3.0 keys without presentation field).
 * Backward compat with schema v1.0 preserved - new fields default to null.
 */
export function deserializeFromEcbt(payload: any): object | null {
    if (!payload || !payload.presentation) return null;
    return validatePresentation(payload.presentation);
}

/**
 * Estimate serialized size in bytes (for UI warnings about chave size).
 */
export function estimateSize(presentation: any): number {
    try {
        return JSON.stringify(presentation || {}).length;
    } catch {
        return 0;
    }
}

/**
 * Schema version accessor for diagnostics.
 */
export function getSchemaVersion(): string {
    return PRESENTATION_VERSION;
}
