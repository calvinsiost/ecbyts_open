// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { getIntroModule01SlidePlan } from '../../core/training/teachingModelIntroModule01.js';
import type { DeckWorkbenchSlide } from './lmsAuthoringDeckModel.js';
import { normalizeTrainingSlideAppOptions } from './trainingSlideAppOptionsModel.js';
import { summarizeTrainingSlideAppOptionForProfessor } from './trainingSlideAppOptionsSummary.js';
import type { NormalizedTrainingSlideAppOption } from './trainingSlideAppOptionsTypes.js';
import {
    planSuggestions,
    type LmsAuthoringDeckWorkbenchContext,
    type TeachingPlan,
} from './lmsAuthoringDeckWorkbenchTypes.js';

export function renderDeckWorkbenchAppOptionsMount(slide: DeckWorkbenchSlide | undefined): string {
    if (!slide?.hasPlan) return '';
    const plan = getIntroModule01SlidePlan(slide.modelSlideNumber);
    const optionCount = planSuggestions(plan).length;
    return `<details class="lms-author-deck-app-details">
        <summary>
            <span>${escapeHtml('Plano completo do slide')}</span>
            <em>${escapeHtml(`${optionCount} opcoes`)}</em>
        </summary>
        <div class="lms-author-teaching-panel-mount lms-author-deck-app-options-mount"
            data-slide-index="${escapeAttr(String(slide.modelSlideNumber))}"
            data-lesson-id="${escapeAttr(slide.lesson.id)}"
            data-panel-placement="deck-workbench"></div>
    </details>`;
}

export function deckQuickActionsForPlan(
    plan: TeachingPlan,
    context: Pick<LmsAuthoringDeckWorkbenchContext, 'teachingPlanToPanelData'>,
): NormalizedTrainingSlideAppOption[] {
    if (!plan) return [];
    const options = normalizeTrainingSlideAppOptions(context.teachingPlanToPanelData(plan));
    const rankedOptions = options.slice().sort((a, b) =>
        actionRank(a) - actionRank(b) || a.actionLabel.localeCompare(b.actionLabel, 'pt-BR'),
    );
    const readableOptions = rankedOptions.filter((option) => !isGenericActionLabel(option));
    const quickActions: NormalizedTrainingSlideAppOption[] = [];
    const seenActionKeys = new Set<string>();
    for (const option of readableOptions.length ? readableOptions : rankedOptions) {
        const key = actionKey(option);
        if (seenActionKeys.has(key)) continue;
        seenActionKeys.add(key);
        quickActions.push(option);
        if (quickActions.length >= 4) break;
    }
    return quickActions;
}

function isGenericActionLabel(option: NormalizedTrainingSlideAppOption): boolean {
    const label = option.actionLabel.trim().toLowerCase();
    return label === 'abrir no app' || label === 'open app' || label === 'abrir app' || label === 'open in app';
}

function actionRank(option: NormalizedTrainingSlideAppOption): number {
    const actionLabel = option.actionLabel.toLowerCase();
    const presetId = option.modelPresetId.toLowerCase();
    if (option.handlerName === 'handleOpenPipelineManager' || actionLabel.includes('fluxo gac') || presetId.includes('gac.flow')) {
        return -2;
    }
    if (option.actionLabel.includes('Mann-Kendall') || option.modelPresetId.includes('mann-kendall')) return -1;
    if (option.actionLabel.includes('Gantt') || option.modelPresetId.includes('gantt')) return -1;
    if (option.handlerName === 'handleOpenDataStudio') return -1;
    if (option.type === 'open-handler') return 0;
    if (option.type === 'resource') return 1;
    if (option.type === 'snapshot') return 2;
    return 3;
}

function actionKey(option: NormalizedTrainingSlideAppOption): string {
    const summary = summarizeTrainingSlideAppOptionForProfessor(option);
    const teacherLabel = option.actionLabel.trim().toLowerCase();
    const destination = summary.destinationLabel.trim().toLowerCase();
    const handler = option.handlerName || option.type;
    return [handler, destination, teacherLabel].join('|');
}

export function renderDeckQuickActionDock(plan: TeachingPlan, context: LmsAuthoringDeckWorkbenchContext): string {
    const actions = deckQuickActionsForPlan(plan, context);
    const count = planSuggestions(plan).length || actions.length;
    if (!actions.length) {
        return `
        <aside class="lms-author-deck-ecbyts-dock" aria-label="${escapeAttr('Acoes ecbyts do slide')}">
            <div class="lms-author-deck-ecbyts-head">
                <span>${escapeHtml('Acoes ecbyts')}</span>
                <strong>${escapeHtml('Nenhum atalho')}</strong>
            </div>
            <p>${escapeHtml('Este slide fica como apresentacao estatica ate receber um destino do app.')}</p>
        </aside>`;
    }
    const actionButtons = actions.map((option, index) => renderDeckActionButton(option, index)).join('');
    const remainder = Math.max(0, count - actions.length);
    return `
        <aside class="lms-author-deck-ecbyts-dock" aria-label="${escapeAttr('Acoes ecbyts do slide')}">
            <div class="lms-author-deck-ecbyts-head">
                <span>${escapeHtml('Acoes ecbyts')}</span>
                <strong>${escapeHtml('Clique-go')}</strong>
            </div>
            <div class="lms-author-deck-action-list">${actionButtons}</div>
            <p>${escapeHtml(
                remainder > 0
                    ? `${remainder} acao extra fica no plano completo.`
                    : 'Acoes principais do slide prontas para testar.',
            )}</p>
        </aside>`;
}

function renderDeckActionButton(option: NormalizedTrainingSlideAppOption, index: number): string {
    const primary = index === 0 ? ' lms-author-deck-action--primary' : '';
    const summary = summarizeTrainingSlideAppOptionForProfessor(option);
    const actionAriaLabel = [
        option.actionLabel,
        `Destino: ${summary.destinationLabel}`,
        `Por que abrir: ${summary.reasonLabel}`,
        summary.presetStatusLabel,
        summary.returnLabel,
    ].filter(Boolean).join('. ');
    return `
        <button type="button" class="lms-author-deck-action${primary}"
            aria-label="${escapeAttr(actionAriaLabel)}"
            data-deck-action-option-id="${escapeAttr(option.id)}"
            data-deck-action-preset-id="${escapeAttr(option.modelPresetId)}"
            title="${escapeAttr(option.description || option.fallbackText || option.title)}">
            <span>${escapeHtml(option.actionLabel)}</span>
            <small>${escapeHtml(summary.destinationLabel)}</small>
            <em>${escapeHtml(`${summary.presetStatusLabel} - ${summary.returnLabel}`)}</em>
        </button>`;
}
