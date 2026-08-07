// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import {
    GAC_DD38_PIPELINE_ID,
    GAC_DD38_PIPELINE_NAME,
    GAC_DD38_SELECTED_NODE_ID,
    buildGacDd38PipelineModel,
} from '../../core/pipelines/gacDd38PipelinePreset.js';
import { buildPipelineDiagramSvg, type PipelineModel } from '../../core/pipelines/_diagramSvgPure.js';
import type { DeckWorkbenchSlide } from './lmsAuthoringDeckModel.js';
import {
    asRecord,
    planSuggestions,
    text,
    type PlanSuggestion,
    type TeachingPlan,
} from './lmsAuthoringDeckWorkbenchTypes.js';

function isGacPipelineSuggestion(suggestion: PlanSuggestion): boolean {
    const handler = text(suggestion.handler);
    const presetId = text(suggestion.presetId || suggestion.id).toLowerCase();
    const label = text(suggestion.label).toLowerCase();
    const nodeId = text(suggestion.nodeId).toLowerCase();
    return handler === 'handleOpenPipelineManager'
        && (presetId.includes('gac') || label.includes('gac') || nodeId.includes('gac'));
}

function deckWorkbenchGacSuggestion(plan: TeachingPlan): PlanSuggestion | null {
    const suggestions = planSuggestions(plan);
    return suggestions.find((suggestion) => text(suggestion.presetId || suggestion.id) === GAC_DD38_PIPELINE_ID)
        || suggestions.find(isGacPipelineSuggestion)
        || null;
}

function gacEmbedNodeId(suggestion: PlanSuggestion, model: PipelineModel): string {
    const nodeIds = new Set((model.nodes || []).map((node) => String(node?.id || '')));
    const explicit = text(suggestion.nodeId);
    if (explicit && nodeIds.has(explicit)) return explicit;
    const key = `${text(suggestion.presetId || suggestion.id)} ${text(suggestion.label)}`.toLowerCase();
    if (key.includes('remediation') || key.includes('remediacao')) return 'gac.p3.l1.s1';
    if (key.includes('monitoring') || key.includes('acompanhamento')) return 'gac.p4.l1.s1';
    if (key.includes('closeout') || key.includes('fechamento')) return 'gac.p5.l1.s1';
    if (key.includes('detection') || key.includes('deteccao')) return 'gac.p1.l1.s1';
    return GAC_DD38_SELECTED_NODE_ID;
}

export function renderDeckGacPipelineEmbed(slide: DeckWorkbenchSlide, plan: TeachingPlan): string {
    const suggestion = deckWorkbenchGacSuggestion(plan);
    if (!suggestion) return '';
    const model = buildGacDd38PipelineModel() as unknown as PipelineModel;
    const selectedNodeId = gacEmbedNodeId(suggestion, model);
    const svg = buildPipelineDiagramSvg(model, {}, selectedNodeId);
    const presetId = text(suggestion.presetId || suggestion.id || GAC_DD38_PIPELINE_ID);
    const optionId = text(suggestion.id || presetId);
    const title = text(asRecord(plan).title || slide.title || GAC_DD38_PIPELINE_NAME);
    return `
        <figure class="lms-author-deck-stage-media lms-author-deck-stage-media--module lms-author-deck-gac-embed"
            data-module-preset-id="${escapeAttr(presetId)}"
            data-module-equivalent="pipelines.gac"
            aria-label="${escapeAttr('Fluxograma GAC nativo do ecbyts')}">
            <div class="lms-author-deck-gac-head">
                <div>
                    <span>${escapeHtml('Modulo equivalente')}</span>
                    <strong>${escapeHtml('Fluxograma GAC nativo')}</strong>
                    <small>${escapeHtml(`${GAC_DD38_PIPELINE_NAME} - ${title}`)}</small>
                </div>
                <button type="button"
                    class="lms-author-deck-action lms-author-deck-action--primary lms-author-deck-gac-open"
                    data-deck-action-option-id="${escapeAttr(optionId)}"
                    data-deck-action-preset-id="${escapeAttr(presetId)}"
                    aria-label="${escapeAttr('Abrir o fluxograma GAC editavel no modulo Pipelines')}">
                    <span>${escapeHtml('Abrir no Pipelines')}</span>
                    <small>${escapeHtml('Editar fluxo GAC')}</small>
                    <em>${escapeHtml('Voltar ao slide pelo Workbench da aula')}</em>
                </button>
            </div>
            <div class="lms-author-deck-gac-canvas" aria-hidden="false">${svg}</div>
            <figcaption>${escapeHtml(
                'Este slide usa o fluxograma GAC do proprio ecbyts. A imagem do PowerPoint fica como referencia secundaria, nao como o material principal da aula.',
            )}</figcaption>
        </figure>`;
}

export function deckWorkbenchTeacherGuideSummary(plan: TeachingPlan): string {
    const explicitSummary = text(asRecord(plan).teacherGuideSummary);
    if (explicitSummary) return explicitSummary;
    const guide = asRecord(plan).teacherGuide;
    return Array.isArray(guide)
        ? guide.map((item) => text(item)).filter(Boolean).slice(0, 4).join(' -> ')
        : '';
}

function stageJourneySteps(plan: TeachingPlan): string[] {
    const summarySteps = deckWorkbenchTeacherGuideSummary(plan)
        .split(/\s*->\s*/u)
        .map((step) => step.trim())
        .filter(Boolean);
    if (summarySteps.length) return summarySteps.slice(0, 4);
    const guide = asRecord(plan).teacherGuide;
    return Array.isArray(guide) ? guide.map((step) => text(step)).filter(Boolean).slice(0, 4) : [];
}

function stageJourneyLabel(step: string): string {
    return String(step || '')
        .replace(/^decis[aã]o\s+/iu, '')
        .replace(/\s+da\s+fase\.?$/iu, '')
        .replace(/\s+passo\.?$/iu, '')
        .trim();
}

export function renderDeckWorkbenchStageJourney(plan: TeachingPlan): string {
    const steps = stageJourneySteps(plan);
    if (!steps.length) return '';
    return `<div class="lms-author-teacher-steps lms-author-deck-stage-journey" aria-label="${escapeAttr('Roteiro visual do slide')}">${steps
        .map(
            (step, index) => `<span class="lms-author-teacher-step lms-author-teacher-step--${escapeAttr(
                index === 0 ? 'current' : 'todo',
            )}"><b>${escapeHtml(String(index + 1))}</b>${escapeHtml(stageJourneyLabel(step))}</span>`,
        )
        .join('')}</div>`;
}
