// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK PRESENTATION - pure state and action contracts.

   Keeps the Apresentar mode clean: approved click-go actions, fullscreen
   commands as declarative contracts, hidden technical controls and Training
   return context without coupling to DOM or browser APIs.
   ================================================================ */

import {
    normalizePipelinePack,
    type PipelineModuleTarget,
    type PipelinePack,
} from './pipelinePack.js';

export const PIPELINE_PACK_PRESENTATION_MODE = 'present';
export const PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT = 'Apresentar em tela cheia';
export const PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT = 'Sair da tela cheia';
export const PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT = 'Use Esc para sair e continuar no mesmo processo.';
export const PIPELINE_PACK_PRESENTATION_FALLBACK_ENTER_TEXT = 'Apresentar nesta tela';
export const PIPELINE_PACK_PRESENTATION_FALLBACK_EXIT_TEXT = 'Sair da apresentacao';
export const PIPELINE_PACK_PRESENTATION_FALLBACK_HINT_TEXT = 'Quando a tela cheia nao estiver disponivel, o processo continua limpo nesta tela.';
export const PIPELINE_PACK_PRESENTATION_DEFAULT_TARGET_ELEMENT_ID = 'pipeline-pack-presentation-root';

export const PIPELINE_PACK_PRESENTATION_HIDDEN_CONTROL_IDS = [
    'pipeline-pack-import-key',
    'pipeline-pack-export-key',
    'pipeline-pack-workbench-editor',
    'pipeline-pack-save-target',
    'pipeline-pack-depara-editor',
    'pipeline-pack-variant-editor',
    'pipeline-pack-audit-score',
    'pipeline-pack-validator-panel',
    'pipeline-pack-reference-overlay-toggle',
    'pipeline-pack-asset-debug',
    'pipeline-pack-technical-log',
] as const;

export type PipelinePackPresentationOriginKind = 'training-lesson' | 'pipelines' | 'direct' | 'unknown';
export type PipelinePackPresentationActionKind = 'fullscreen' | 'return' | 'click-go';
export type PipelinePackPresentationCommandType =
    | 'fullscreen.request'
    | 'fullscreen.exit'
    | 'fullscreen.fallback.enter'
    | 'fullscreen.fallback.exit'
    | 'navigate.training.return'
    | 'open-module-target';

export interface PipelinePackPresentationOrigin {
    kind: PipelinePackPresentationOriginKind;
    courseId?: string;
    lessonId?: string;
    slideId?: string;
    slideIndex?: number;
    sourceModule?: string;
    returnLabel?: string;
}

export interface PipelinePackPresentationCurrentContext {
    packId: string;
    processId: string;
    variantId?: string;
    selectedNodeId?: string;
    slideId?: string;
    slideIndex?: number;
    lessonId?: string;
    sourceModule: PipelinePackPresentationOriginKind;
}

export interface PipelinePackPresentationFullscreenState {
    available: boolean;
    active: boolean;
    fallbackActive: boolean;
    requested: boolean;
    targetElementId: string;
    enterText: string;
    exitText: string;
    hintText: string;
    fallbackEnterText: string;
    fallbackExitText: string;
    fallbackHintText: string;
}

export interface PipelinePackPresentationTrainingReturnDestination {
    moduleId: 'training';
    label: string;
    courseId?: string;
    lessonId?: string;
    slideId?: string;
    slideIndex?: number;
}

export interface PipelinePackPresentationState {
    mode: typeof PIPELINE_PACK_PRESENTATION_MODE;
    packId: string;
    title: string;
    origin: PipelinePackPresentationOrigin;
    current: PipelinePackPresentationCurrentContext;
    fullscreen: PipelinePackPresentationFullscreenState;
    returnDestination: PipelinePackPresentationTrainingReturnDestination | null;
    hiddenControlIds: string[];
}

export interface PipelinePackPresentationInput {
    pack?: unknown;
    origin?: unknown;
    current?: unknown;
    fullscreen?: unknown;
}

export interface PipelinePackPresentationActionCommand {
    type: PipelinePackPresentationCommandType;
    targetElementId?: string;
    targetId?: string;
    moduleId?: string;
    ownerNodeId?: string;
    targetParams?: Record<string, unknown>;
    destination?: PipelinePackPresentationTrainingReturnDestination;
    preserveContext: PipelinePackPresentationCurrentContext;
}

export interface PipelinePackPresentationVisibleAction {
    id: string;
    kind: PipelinePackPresentationActionKind;
    label: string;
    visible: true;
    nodeId?: string;
    moduleId?: string;
    command: PipelinePackPresentationActionCommand;
}

export interface PipelinePackPresentationViewModel {
    state: PipelinePackPresentationState;
    visibleActions: PipelinePackPresentationVisibleAction[];
    hiddenControlIds: string[];
    fullscreenText: {
        enter: string;
        exit: string;
        fallbackEnter: string;
        fallbackExit: string;
        current: string;
        hint: string;
    };
}

export type PipelinePackPresentationEvent =
    | { type: 'enter-fullscreen' }
    | { type: 'fullscreen-entered' }
    | { type: 'fullscreen-denied' }
    | { type: 'exit-fullscreen' }
    | { type: 'fullscreen-exited' }
    | { type: 'select-node'; nodeId?: unknown }
    | { type: 'set-slide'; slideId?: unknown; slideIndex?: unknown; lessonId?: unknown };

export interface PipelinePackPresentationTransition {
    state: PipelinePackPresentationState;
    commands: PipelinePackPresentationActionCommand[];
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _finiteNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function _originKind(value: unknown): PipelinePackPresentationOriginKind {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'training' || raw === 'training-lesson' || raw === 'lesson' || raw === 'lms') return 'training-lesson';
    if (raw === 'pipeline' || raw === 'pipelines') return 'pipelines';
    if (raw === 'direct') return 'direct';
    return 'unknown';
}

function _normalizeOrigin(value: unknown): PipelinePackPresentationOrigin {
    const raw = _asObject(value);
    const kind = _originKind(raw.kind ?? raw.sourceModule ?? raw.moduleId);
    const slideIndex = _finiteNumber(raw.slideIndex);
    return {
        kind,
        ...(_nonEmpty(raw.courseId) ? { courseId: _nonEmpty(raw.courseId) } : {}),
        ...(_nonEmpty(raw.lessonId) ? { lessonId: _nonEmpty(raw.lessonId) } : {}),
        ...(_nonEmpty(raw.slideId) ? { slideId: _nonEmpty(raw.slideId) } : {}),
        ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
        ...(_nonEmpty(raw.sourceModule) ? { sourceModule: _nonEmpty(raw.sourceModule) } : {}),
        ...(_nonEmpty(raw.returnLabel) ? { returnLabel: _nonEmpty(raw.returnLabel) } : {}),
    };
}

function _normalizeFullscreen(value: unknown): PipelinePackPresentationFullscreenState {
    const raw = _asObject(value);
    const targetElementId = _nonEmpty(raw.targetElementId) || PIPELINE_PACK_PRESENTATION_DEFAULT_TARGET_ELEMENT_ID;
    const available = raw.available !== false;
    const active = available && Boolean(raw.active);
    const fallbackActive = !active && Boolean(raw.fallbackActive);
    return {
        available,
        active,
        fallbackActive,
        requested: available && !active && !fallbackActive && Boolean(raw.requested),
        targetElementId,
        enterText: _nonEmpty(raw.enterText) || PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT,
        exitText: _nonEmpty(raw.exitText) || PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT,
        hintText: _nonEmpty(raw.hintText) || PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT,
        fallbackEnterText: _nonEmpty(raw.fallbackEnterText) || PIPELINE_PACK_PRESENTATION_FALLBACK_ENTER_TEXT,
        fallbackExitText: _nonEmpty(raw.fallbackExitText) || PIPELINE_PACK_PRESENTATION_FALLBACK_EXIT_TEXT,
        fallbackHintText: _nonEmpty(raw.fallbackHintText) || PIPELINE_PACK_PRESENTATION_FALLBACK_HINT_TEXT,
    };
}

function _normalizeCurrent(
    pack: PipelinePack,
    origin: PipelinePackPresentationOrigin,
    value: unknown,
): PipelinePackPresentationCurrentContext {
    const raw = _asObject(value);
    const slideIndex = _finiteNumber(raw.slideIndex ?? origin.slideIndex);
    const processId = _nonEmpty(raw.processId) || _nonEmpty(raw.pipelineId) || pack.id;
    return {
        packId: pack.id,
        processId,
        ...(_nonEmpty(raw.variantId) ? { variantId: _nonEmpty(raw.variantId) } : {}),
        ...(_nonEmpty(raw.selectedNodeId ?? raw.nodeId) ? { selectedNodeId: _nonEmpty(raw.selectedNodeId ?? raw.nodeId) } : {}),
        ...(_nonEmpty(raw.slideId ?? origin.slideId) ? { slideId: _nonEmpty(raw.slideId ?? origin.slideId) } : {}),
        ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
        ...(_nonEmpty(raw.lessonId ?? origin.lessonId) ? { lessonId: _nonEmpty(raw.lessonId ?? origin.lessonId) } : {}),
        sourceModule: origin.kind,
    };
}

function _trainingReturnDestination(
    origin: PipelinePackPresentationOrigin,
    current: PipelinePackPresentationCurrentContext,
): PipelinePackPresentationTrainingReturnDestination | null {
    if (origin.kind !== 'training-lesson') return null;
    const lessonId = _nonEmpty(origin.lessonId ?? current.lessonId);
    const slideId = _nonEmpty(origin.slideId ?? current.slideId);
    const slideIndex = _finiteNumber(origin.slideIndex ?? current.slideIndex);
    if (!lessonId && !slideId && typeof slideIndex !== 'number') return null;
    return {
        moduleId: 'training',
        label: origin.returnLabel || 'Voltar para a aula',
        ...(_nonEmpty(origin.courseId) ? { courseId: _nonEmpty(origin.courseId) } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(slideId ? { slideId } : {}),
        ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
    };
}

function _isApprovedPresentationTarget(target: PipelineModuleTarget): boolean {
    if (!target.id || !target.moduleId || !target.adapterId) return false;
    if (target.openMode === 'snapshot-only') return true;
    return target.fallback?.type !== 'none';
}

function _cloneCurrent(current: PipelinePackPresentationCurrentContext): PipelinePackPresentationCurrentContext {
    return { ...current };
}

function _fullscreenCommand(
    type: 'fullscreen.request' | 'fullscreen.exit' | 'fullscreen.fallback.enter' | 'fullscreen.fallback.exit',
    state: PipelinePackPresentationState,
): PipelinePackPresentationActionCommand {
    return {
        type,
        targetElementId: state.fullscreen.targetElementId,
        preserveContext: _cloneCurrent(state.current),
    };
}

function _actionForTarget(
    target: PipelineModuleTarget,
    state: PipelinePackPresentationState,
): PipelinePackPresentationVisibleAction {
    return {
        id: `click-go-${target.id}`,
        kind: 'click-go',
        label: target.label || target.moduleId,
        visible: true,
        ...(target.ownerNodeId ? { nodeId: target.ownerNodeId } : {}),
        moduleId: target.moduleId,
        command: {
            type: 'open-module-target',
            targetId: target.id,
            moduleId: target.moduleId,
            ...(target.ownerNodeId ? { ownerNodeId: target.ownerNodeId } : {}),
            targetParams: { ...(target.targetParams || {}) },
            preserveContext: _cloneCurrent(state.current),
        },
    };
}

export function createPipelinePackPresentationState(input: PipelinePackPresentationInput | unknown): PipelinePackPresentationState {
    const raw = _asObject(input);
    const pack = normalizePipelinePack(raw.pack ?? input);
    const origin = _normalizeOrigin(raw.origin);
    const current = _normalizeCurrent(pack, origin, raw.current);
    const fullscreen = _normalizeFullscreen(raw.fullscreen);
    return {
        mode: PIPELINE_PACK_PRESENTATION_MODE,
        packId: pack.id,
        title: pack.title,
        origin,
        current,
        fullscreen,
        returnDestination: _trainingReturnDestination(origin, current),
        hiddenControlIds: [...PIPELINE_PACK_PRESENTATION_HIDDEN_CONTROL_IDS],
    };
}

export function buildPipelinePackPresentationVisibleActions(input: PipelinePackPresentationInput | unknown): PipelinePackPresentationVisibleAction[] {
    const raw = _asObject(input);
    const pack = normalizePipelinePack(raw.pack ?? input);
    const state = createPipelinePackPresentationState(input);
    const presentationActive = state.fullscreen.active || state.fullscreen.fallbackActive;
    const usingFallback = state.fullscreen.fallbackActive && !state.fullscreen.active;
    const fullscreenType = presentationActive
        ? (usingFallback ? 'fullscreen.fallback.exit' : 'fullscreen.exit')
        : (state.fullscreen.available ? 'fullscreen.request' : 'fullscreen.fallback.enter');
    const fullscreenAction: PipelinePackPresentationVisibleAction = {
        id: presentationActive
            ? 'exit-fullscreen'
            : (state.fullscreen.available ? 'enter-fullscreen' : 'enter-presentation-fallback'),
        kind: 'fullscreen',
        label: presentationActive
            ? (usingFallback ? state.fullscreen.fallbackExitText : state.fullscreen.exitText)
            : (state.fullscreen.available ? state.fullscreen.enterText : state.fullscreen.fallbackEnterText),
        visible: true,
        command: _fullscreenCommand(fullscreenType, state),
    };
    const returnAction = state.returnDestination
        ? [{
            id: 'return-to-training',
            kind: 'return' as const,
            label: state.returnDestination.label,
            visible: true as const,
            command: {
                type: 'navigate.training.return' as const,
                destination: state.returnDestination,
                preserveContext: _cloneCurrent(state.current),
            },
        }]
        : [];
    const clickGoActions = pack.moduleTargets
        .filter(_isApprovedPresentationTarget)
        .map((target) => _actionForTarget(target, state));
    return [fullscreenAction, ...returnAction, ...clickGoActions];
}

export function buildPipelinePackPresentationViewModel(input: PipelinePackPresentationInput | unknown): PipelinePackPresentationViewModel {
    const state = createPipelinePackPresentationState(input);
    const presentationActive = state.fullscreen.active || state.fullscreen.fallbackActive;
    const usingFallback = state.fullscreen.fallbackActive && !state.fullscreen.active;
    return {
        state,
        visibleActions: buildPipelinePackPresentationVisibleActions(input),
        hiddenControlIds: [...state.hiddenControlIds],
        fullscreenText: {
            enter: state.fullscreen.enterText,
            exit: state.fullscreen.exitText,
            fallbackEnter: state.fullscreen.fallbackEnterText,
            fallbackExit: state.fullscreen.fallbackExitText,
            current: presentationActive
                ? (usingFallback ? state.fullscreen.fallbackExitText : state.fullscreen.exitText)
                : (state.fullscreen.available ? state.fullscreen.enterText : state.fullscreen.fallbackEnterText),
            hint: usingFallback || !state.fullscreen.available
                ? state.fullscreen.fallbackHintText
                : state.fullscreen.hintText,
        },
    };
}

export function reducePipelinePackPresentationState(
    state: PipelinePackPresentationState,
    event: PipelinePackPresentationEvent,
): PipelinePackPresentationTransition {
    const next: PipelinePackPresentationState = {
        ...state,
        origin: { ...state.origin },
        current: _cloneCurrent(state.current),
        fullscreen: { ...state.fullscreen },
        returnDestination: state.returnDestination ? { ...state.returnDestination } : null,
        hiddenControlIds: [...state.hiddenControlIds],
    };
    const commands: PipelinePackPresentationActionCommand[] = [];

    if (event.type === 'enter-fullscreen') {
        if (next.fullscreen.active || next.fullscreen.fallbackActive || next.fullscreen.requested) {
            return { state: next, commands };
        }
        if (next.fullscreen.available) {
            next.fullscreen.requested = true;
            commands.push(_fullscreenCommand('fullscreen.request', next));
        } else {
            next.fullscreen.fallbackActive = true;
            commands.push(_fullscreenCommand('fullscreen.fallback.enter', next));
        }
        return { state: next, commands };
    }

    if (event.type === 'fullscreen-entered') {
        next.fullscreen.active = true;
        next.fullscreen.fallbackActive = false;
        next.fullscreen.requested = false;
        return { state: next, commands };
    }

    if (event.type === 'fullscreen-denied') {
        next.fullscreen.active = false;
        next.fullscreen.fallbackActive = true;
        next.fullscreen.requested = false;
        return { state: next, commands };
    }

    if (event.type === 'exit-fullscreen') {
        if (next.fullscreen.fallbackActive && !next.fullscreen.active && !next.fullscreen.requested) {
            next.fullscreen.fallbackActive = false;
            commands.push(_fullscreenCommand('fullscreen.fallback.exit', next));
        } else if (next.fullscreen.active || next.fullscreen.requested) {
            next.fullscreen.requested = false;
            commands.push(_fullscreenCommand('fullscreen.exit', next));
        }
        return { state: next, commands };
    }

    if (event.type === 'fullscreen-exited') {
        next.fullscreen.active = false;
        next.fullscreen.fallbackActive = false;
        next.fullscreen.requested = false;
        return { state: next, commands };
    }

    if (event.type === 'select-node') {
        const nodeId = _nonEmpty(event.nodeId);
        if (nodeId) next.current.selectedNodeId = nodeId;
        return { state: next, commands };
    }

    if (event.type === 'set-slide') {
        const slideId = _nonEmpty(event.slideId);
        const lessonId = _nonEmpty(event.lessonId);
        const slideIndex = _finiteNumber(event.slideIndex);
        if (slideId) next.current.slideId = slideId;
        if (lessonId) next.current.lessonId = lessonId;
        if (typeof slideIndex === 'number') next.current.slideIndex = slideIndex;
        next.returnDestination = _trainingReturnDestination(next.origin, next.current);
        return { state: next, commands };
    }

    return { state: next, commands };
}
