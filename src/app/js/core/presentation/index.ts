// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation Mode - barrel exports.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md
export {
    createPresentation,
    listPresentations,
    getPresentation,
    updatePresentation,
    deletePresentation,
    setActivePresentation,
    getActivePresentation,
    getMachineState,
    setMachineState,
    subscribe,
} from './manager.js';
export {
    startRecording,
    captureCurrentStep,
    removeLastStep,
    removeStep,
    updateStep,
    reorderSteps,
    finishRecording,
    cancelRecording,
    getDraft,
    clearDraft,
} from './recorder.js';
export {
    play,
    pause,
    resume,
    skipToStep,
    nextStep,
    previousStep,
    exit,
    getPlayerStatus,
    buildScenePlanForStep,
    getCurrentScenePlan,
} from './player.js';
export {
    cubicEase,
    linearEase,
    easeInOut,
    getEase,
    lerpVector3,
    lerpScalar,
    tweenCamera,
    snapshotCamera,
} from './transitions.js';
export { isTtsAvailable, listTtsVoices, speakTts, loadAudioFile, playBuffer, playStepAudio } from './audio.js';
export { validatePresentation, serializeForEcbt, deserializeFromEcbt, estimateSize } from './persistence.js';
export { executeStepRuntime } from './runtimeActions.js';
export {
    TECHNICAL_STORY_EXAMPLE_KEY,
    listPresentationExamples,
    getTechnicalStoryRandomRecipe,
    buildTechnicalStoryExample,
    createOrReplaceTechnicalStoryExample,
    ensureTechnicalStoryExamplePresentation,
} from './examples.js';
export {
    VIDEO_CAPTURE_MODES,
    CAPTION_EXPORT_MODES,
    VIDEO_EXPORT_PRESETS,
    detectSupportedMime,
    isVideoRecordingAvailable,
    isScreenRecordingAvailable,
    startCapture,
    startScreenCapture,
    startPlaybackCapture,
    startCaptureGuarded,
    stopCapture,
    normalizeTrimRange,
    buildPresentationTimeline,
    resolveTimelineStep,
    listVideoExportPresets,
    getVideoExportPreset,
    getSuggestedExportPreset,
    composeEditedRecording,
    trimRecordedVideo,
    downloadBlob,
    sanitizeFilename,
    getRecordingStatus,
} from './videoRecorder.js';
// F7 Captions (multi-idioma)
export {
    getSupportedLangs,
    getCaption,
    setCaption,
    generateCaption,
    generateAllCaptions,
    clearCaptions,
    countCaptions,
} from './captions.js';
// F8 AI Voice (alternativa premium a Web Speech)
export {
    AI_VOICE_PROVIDERS,
    listProviders as listAiVoiceProviders,
    synthesize as synthesizeAiVoice,
    playSynthesized as playAiVoice,
    isProviderAvailable as isAiVoiceProviderAvailable,
} from './aiVoice.js';
// Launch Video engine (PRESENTATION-LAUNCH-VIDEO-001)
export {
    normalize as normalizeNarration,
    detectMojibake,
    isMojibakeFree,
    repairMojibake,
    stripMarkdown,
    tameSymbols,
    splitIntoSegments,
    sanitizeNarration,
    toTtsSafeText,
    SANITIZER_CODES,
} from './narrationSanitizer.js';
export {
    STORY_INTENTS,
    CLAIM_LEVELS,
    VIEWPORTS,
    AUDIO_PROVIDERS,
    listProfiles,
    listProfileIds,
    getProfile,
    getDefaultProfile,
    applyProfile,
    validateStepAgainstProfile,
} from './storyProfiles.js';
export {
    VIEWPORT_PROFILES,
    getViewportProfile,
    computeCaptionBox,
    validateCaptionSafety,
    estimateLineCount,
    checkCaptionFit,
} from './captionLayout.js';
export { MOTION_PRESETS, DEFAULT_PRESET, buildShotPlan, auditMotionSequence, listPresets } from './shotPlanner.js';
export { planComposition, computeFrameClip, auditCompositionSequence } from './compositionPolicy.js';
export {
    normalizeFrameClipRect,
    shouldApplyPlaybackFrameClip,
    computePlaybackViewportTransform,
} from './playbackFrameClip.js';
export {
    EXPORT_BLOCKING_CODES,
    QUALITY_CODES,
    validateExportReadiness,
    validateLaunchReadiness,
    canExport,
} from './qualityChecks.js';
export { getSchemaVersion } from './persistence.js';
// Pure-logic slice (P1-9, 2026-04-23) - no browser globals.
export { PRESENTATION_STATES, PRESENTATION_EVENTS, VALID_TRANSITIONS, createPresentationFSM } from './fsm.js';
export {
    createStep,
    createPresentation as createPurePresentation,
    validateCameraRef,
    totalDuration,
    STEP_MODEL_CONSTANTS,
} from './stepModel.js';
export {
    ECBT_SEGMENT_PREFIX,
    ECBT_SEGMENT_VERSION,
    encodePresentationSegment,
    decodePresentationSegment,
    isPresentationSegment,
    getSegmentVersion,
} from './ecbtSegment.js';
