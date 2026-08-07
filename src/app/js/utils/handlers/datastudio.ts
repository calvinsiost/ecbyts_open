// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO HANDLERS — window.* handlers for Data Studio UI

   Handles para o painel de analytics de observacoes do Data Studio.
   ================================================================ */
import { computeAggregation } from '../datastudio/analyticsPanel.js';
import {
    normalizeDataStudioOpenContext,
    type DataStudioOpenContext,
} from '../../core/datastudio/datastudioOpenContextPure.js';
import { maybeTriggerIntentHint } from '../tour/intentHint.js';

let _lastDataStudioOpenContext: DataStudioOpenContext | null = null;

export function getLastDataStudioOpenContext(): DataStudioOpenContext | null {
    return _lastDataStudioOpenContext;
}

function _safeCssEscape(value: string): string {
    const css = (globalThis as any).CSS;
    return css && typeof css.escape === 'function' ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function _clearDataStudioTrainingContextBanner(): void {
    if (typeof document === 'undefined') return;
    document.querySelector('.ds-training-context-banner')?.remove();
}

function _activateDataStudioModule(moduleId: string, attempt = 0): void {
    if (typeof document === 'undefined') return;
    const button = document.querySelector<HTMLButtonElement>(`[data-ds-module-btn="${_safeCssEscape(moduleId)}"]`);
    if (button) {
        if (!button.classList.contains('active')) button.click();
        if (attempt < 3) {
            setTimeout(() => _activateDataStudioModule(moduleId, attempt + 1), 120);
        }
        return;
    }
    if (attempt < 6) {
        setTimeout(() => _activateDataStudioModule(moduleId, attempt + 1), 120);
    }
}

function _returnToTrainingSlide(context: DataStudioOpenContext): void {
    try {
        window.dispatchEvent(new CustomEvent('training:request-return-to-slide', { detail: context }));
    } catch (e: any) {
        console.debug('[datastudio] return event skipped', e?.message || e);
    }
    const w = window as any;
    const openTraining = w.openLmsModule || w.handleOpenTraining;
    if (typeof openTraining === 'function') {
        void openTraining({
            activeTab: 'createdCourses',
            skipResume: true,
            returnTo: {
                source: 'datastudio',
                course: context.course,
                slide: context.slide,
                presetId: context.presetId,
            },
        });
    }
}

function _renderDataStudioTrainingContext(context: DataStudioOpenContext, attempt = 0): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('datastudio-container');
    if (!container) {
        if (attempt < 5) {
            setTimeout(() => _renderDataStudioTrainingContext(context, attempt + 1), 80);
        }
        return;
    }
    _clearDataStudioTrainingContextBanner();
    if (!context.hasContext) return;

    const banner = document.createElement('section');
    banner.className = 'ds-training-context-banner';
    banner.setAttribute('data-ds-training-context', 'true');
    banner.setAttribute('aria-label', 'Contexto da aula');

    const copy = document.createElement('div');
    copy.className = 'ds-training-context-copy';
    const title = document.createElement('strong');
    title.textContent = context.label || 'DataStudio da aula';
    const hint = document.createElement('span');
    hint.textContent = context.hint || 'Aberto a partir do Workbench da aula.';
    copy.append(title, hint);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ds-training-context-return';
    button.textContent = context.returnLabel || 'Voltar ao slide';
    button.addEventListener('click', () => _returnToTrainingSlide(context));

    banner.append(copy, button);
    container.prepend(banner);
}

export async function handleOpenDataStudio(input: unknown = 'processing') {
    const context = normalizeDataStudioOpenContext(input);
    _lastDataStudioOpenContext = context.hasContext ? context : null;
    // T8.1: dica de intenção (1ª abertura -> 1 tooltip apontando a lição da
    // cadeia digital de dados). Suprimida quando já vem de dentro de uma aula.
    maybeTriggerIntentHint('datastudio', { openedFromTrainingContext: context.hasContext });
    try {
        const { switchGroup, VIEW_GROUPS } = await import('../scene/viewRouter.js' as string);
        await switchGroup(VIEW_GROUPS.DATASTUDIO, { skipAuthGate: true });
        const normalized = context.moduleId;
        if (!normalized) return;
        setTimeout(() => {
            _activateDataStudioModule(normalized);
            _renderDataStudioTrainingContext(context);
        }, 0);
        _renderDataStudioTrainingContext(context);
    } catch (err: any) {
        console.warn('[datastudio] failed to open DataStudio', err?.message || err);
    }
}
/**
 * Computes and displays the aggregation result in #ds-analytics-result.
 * Calcula e exibe o resultado da agregacao em #ds-analytics-result.
 *
 * Reads param from #ds-analytics-param and agg from #ds-analytics-agg.
 * Le o parametro de #ds-analytics-param e a agregacao de #ds-analytics-agg.
 */
export function handleDsAnalyticsRun() {
    const param = (document.getElementById('ds-analytics-param') as any)?.value;
    const agg = (document.getElementById('ds-analytics-agg') as any)?.value || 'mean';
    const w = window as any;
    const elements = typeof w.getAllElements === 'function' ? w.getAllElements() : [];
    const values = elements
        .flatMap((el: any) => el.observations || [])
        .filter((obs: any) => obs.parameter === param && typeof obs.value === 'number')
        .map((obs: any) => obs.value);
    const result = computeAggregation(values, agg);
    const container = document.getElementById('ds-analytics-result');
    if (container) {
        container.textContent =
            result !== null
                ? `${agg}(${param}) = ${result.toFixed(4)} (n=${values.length})`
                : `${agg}(${param}) = N/A (n=0)`;
    }
}
export const datastudioHandlers = { handleDsAnalyticsRun, handleOpenDataStudio };
