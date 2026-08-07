// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK TRAINING BRIDGE - pure lesson return context.

   Keeps a Pipeline Pack opened from Training connected to the class slide,
   without falling back to a random process.
   ================================================================ */

import {
    GAC_DD38_PIPELINE_ID,
    GAC_DD38_SELECTED_NODE_ID,
    GAC_DD38_TEMPLATE_ID,
    isGacDd38PipelineTarget,
} from './gacDd38PipelinePreset.js';

export interface PipelineTrainingBridgeInput {
    packId?: string;
    presetId?: string;
    templateId?: string;
    nodeId?: string;
    target?: string;
    source?: string;
    origin?: string;
    course?: string;
    courseId?: string;
    lesson?: string;
    lessonId?: string;
    slide?: string | number;
    slideNumber?: string | number;
    slideId?: string;
    slideIndex?: string | number;
    slideTitle?: string;
    label?: string;
    returnLabel?: string;
}

export interface PipelineTrainingReturnContext {
    source: 'training' | 'lms';
    courseId: string;
    lessonId: string;
    slideId: string;
    slideIndex: number | null;
    slideTitle: string;
    returnLabel: string;
}

export interface PipelineTrainingClickGoCommand {
    type: 'pipelines.open-pack';
    moduleId: 'pipelines';
    presetId: string;
    templateId: string;
    selectedNodeId: string;
    returnContext: PipelineTrainingReturnContext | null;
    fallbackPolicy: 'block-no-random';
}

export interface PipelineTrainingOpenPlan {
    ok: boolean;
    moduleId: 'pipelines';
    openMode: 'open-live' | 'blocked';
    presetId: string;
    templateId: string;
    selectedNodeId: string;
    returnToTraining: boolean;
    returnContext: PipelineTrainingReturnContext | null;
    clickGoCommand: PipelineTrainingClickGoCommand | null;
    fallbackPolicy: 'block-no-random';
    randomFallback: false;
    breadcrumb: string[];
    userMessage: string;
    blockers: string[];
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _number(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function _firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
        const n = _number(value);
        if (n !== null) return n;
    }
    return null;
}

function _source(value: PipelineTrainingBridgeInput): 'training' | 'lms' | '' {
    const raw = _text(value.source || value.origin).toLowerCase();
    if (raw === 'training' || raw === 'training-lesson' || raw === 'lesson') return 'training';
    if (raw === 'lms') return 'lms';
    if (
        _text(value.courseId || value.course || value.lessonId || value.lesson || value.slideId)
        || _firstNumber(value.slideIndex, value.slide, value.slideNumber) !== null
    ) {
        return 'training';
    }
    return '';
}

function _isGacTarget(input: PipelineTrainingBridgeInput): boolean {
    return isGacDd38PipelineTarget({
        id: input.packId,
        pipelineId: input.packId,
        presetId: input.presetId,
        templateId: input.templateId,
        nodeId: input.nodeId,
        target: input.target,
        hint: [input.label, input.slideTitle].map(_text).filter(Boolean).join(' '),
    });
}

function _returnContext(
    input: PipelineTrainingBridgeInput,
    source: 'training' | 'lms' | '',
    slideTitle: string,
): PipelineTrainingReturnContext | null {
    if (!source) return null;
    const courseId = _text(input.courseId || input.course);
    const lessonId = _text(input.lessonId || input.lesson);
    const slideId = _text(input.slideId);
    const slideIndex = _firstNumber(input.slideIndex, input.slide, input.slideNumber);
    if (!courseId && !lessonId && !slideId && slideIndex === null) return null;
    return {
        source,
        courseId,
        lessonId,
        slideId,
        slideIndex,
        slideTitle,
        returnLabel: _text(input.returnLabel) || 'Voltar ao slide',
    };
}

function _hasReturnToSlide(context: PipelineTrainingReturnContext | null): boolean {
    return Boolean(context && (context.lessonId || context.slideId || context.slideIndex !== null));
}

export function buildPipelineTrainingOpenPlan(input: PipelineTrainingBridgeInput): PipelineTrainingOpenPlan {
    const isGac = _isGacTarget(input);
    const source = _source(input);
    const presetId = _text(input.presetId) || (isGac ? GAC_DD38_PIPELINE_ID : '');
    const templateId = _text(input.templateId || input.packId) || (isGac ? GAC_DD38_TEMPLATE_ID : '');
    const selectedNodeId = _text(input.nodeId) || (isGac ? GAC_DD38_SELECTED_NODE_ID : '');
    const slideTitle = _text(input.slideTitle || input.label) || 'slide da aula';
    const returnContext = _returnContext(input, source, slideTitle);
    const blockers: string[] = [];

    if (!presetId && !templateId) blockers.push('Informe qual processo deve abrir.');
    if (!selectedNodeId) blockers.push('Informe qual parte do processo deve receber foco.');
    if (source && !_hasReturnToSlide(returnContext)) {
        blockers.push('Informe a aula ou o slide para voltar depois do Pipeline Pack.');
    }

    const ok = blockers.length === 0;
    const clickGoCommand: PipelineTrainingClickGoCommand | null = ok
        ? {
            type: 'pipelines.open-pack',
            moduleId: 'pipelines',
            presetId,
            templateId,
            selectedNodeId,
            returnContext,
            fallbackPolicy: 'block-no-random',
        }
        : null;

    return {
        ok,
        moduleId: 'pipelines',
        openMode: ok ? 'open-live' : 'blocked',
        presetId,
        templateId,
        selectedNodeId,
        returnToTraining: Boolean(returnContext),
        returnContext,
        clickGoCommand,
        fallbackPolicy: 'block-no-random',
        randomFallback: false,
        breadcrumb: [
            'Aula',
            slideTitle,
            ok ? 'Pipeline conectado' : 'Pipeline pendente',
        ],
        userMessage: ok
            ? `Abrir o processo conectado ao ${slideTitle} e manter o retorno para a aula.`
            : 'Nao vou abrir um processo aleatorio. Complete o destino do slide antes de apresentar.',
        blockers,
    };
}
