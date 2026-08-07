// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TRAINING SLIDE APP OPTIONS
   Small, isolated Training UI component for per-slide app bindings.
   It renders actions from injected data and calls existing window handlers
   when present. Missing handlers degrade inside the panel.
   ================================================================ */

import {
    TRAINING_SLIDE_APP_OPTIONS_STYLE_MARKER,
    TRAINING_SLIDE_APP_OPTIONS_STYLE_TEXT,
} from './trainingSlideAppOptionsStyles.js';
import {
    resolveTrainingSlideWindow,
    runNormalizedTrainingSlideAppOption,
    showTrainingSlideOptionToast,
} from './trainingSlideAppOptionsActionRuntime.js';
import {
    renderTrainingSlideOptionInspector,
    renderTrainingSlideOptionMeta,
    renderTrainingSlideProfessorRouteMap,
    renderTrainingSlideSnapshotFallback,
} from './trainingSlideAppOptionsCardChrome.js';
import {
    firstText,
    isRecord,
    normalizeTrainingSlideAppOptions,
    stringifyDisplayValue,
    uniqueStringArray,
} from './trainingSlideAppOptionsModel.js';
import {
    fallbackMessage,
    inspectorResultMessage,
    initialStatusMessage,
    visibleResultMessage,
} from './trainingSlideAppOptionsSummary.js';
import type {
    NormalizedTrainingSlideAppOption,
    TrainingSlideAppOptionActionResult,
    // eslint-disable-next-line
    TrainingSlideAppOptionInput,
    TrainingSlideAppOptionsInput,
    TrainingSlideAppOptionsRenderConfig,
} from './trainingSlideAppOptionsTypes.js';

export { normalizeTrainingSlideAppOptions } from './trainingSlideAppOptionsModel.js';
export {
    resolveTrainingSlideSnapshotAssetUrl,
    TRAINING_SLIDE_SNAPSHOT_ASSET_MAP,
} from './trainingSlideAppOptionsModel.js';
export { runTrainingSlideAppOption } from './trainingSlideAppOptionsActionRuntime.js';
export { summarizeTrainingSlideAppOptionForProfessor } from './trainingSlideAppOptionsSummary.js';
export { TRAINING_SLIDE_APP_OPTION_TYPES } from './trainingSlideAppOptionsTypes.js';
export type {
    TrainingSlideAppOptionResolverOptions,
    TrainingSlideSnapshotAssetLookup,
} from './trainingSlideAppOptionsModel.js';
export type {
    NormalizedTrainingSlideAppOption,
    TrainingSlideAppOptionActionResult,
    TrainingSlideAppOptionInput,
    TrainingSlideAppOptionProfessorSummary,
    TrainingSlideAppOptionsInput,
    TrainingSlideAppOptionsRenderConfig,
    TrainingSlideAppOptionType,
} from './trainingSlideAppOptionsTypes.js';

const ROOT_CLASS = 'tsao-panel';

function resolveDocument(documentRef: Document | undefined): Document {
    if (documentRef) return documentRef;
    if (typeof document !== 'undefined') return document;
    throw new Error('Document unavailable for Training slide app options panel.');
}

function ensureStyles(doc: Document): void {
    const marker = TRAINING_SLIDE_APP_OPTIONS_STYLE_MARKER;
    if (typeof doc.querySelector === 'function' && doc.querySelector(`style[${marker}="true"]`)) return;
    const style = doc.createElement('style');
    style.setAttribute(marker, 'true');
    style.textContent = TRAINING_SLIDE_APP_OPTIONS_STYLE_TEXT;
    (doc.head || doc.body || doc.documentElement).appendChild(style);
}

function slideSubtitle(data: TrainingSlideAppOptionsInput | null | undefined): string {
    if (Array.isArray(data) || !isRecord(data)) return '';
    const slideNumber = firstText(data.slideNumber);
    const slideId = firstText(data.slideId, data.id);
    const title = firstText(data.title);
    const prefix = slideNumber ? `Slide ${slideNumber}` : slideId ? `Slide ${slideId}` : '';
    return [prefix, title].filter(Boolean).join(' - ');
}

function slideIntro(data: TrainingSlideAppOptionsInput | null | undefined): string {
    if (Array.isArray(data) || !isRecord(data)) return '';
    return firstText(data.intro, data.description);
}

function slideGuide(data: TrainingSlideAppOptionsInput | null | undefined): readonly string[] {
    if (Array.isArray(data) || !isRecord(data)) return [];
    const raw = Array.isArray(data.teacherGuide)
        ? data.teacherGuide
        : Array.isArray(data.guide)
          ? data.guide
          : Array.isArray(data.journey)
            ? data.journey
            : [];
    return uniqueStringArray(raw.map(stringifyDisplayValue).filter(Boolean)).slice(0, 5);
}

function appendText(doc: Document, parent: HTMLElement, tag: string, className: string, text: string): HTMLElement {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
}

function renderSlideGuide(doc: Document, header: HTMLElement, items: readonly string[]): void {
    if (items.length === 0) return;
    const box = doc.createElement('div');
    box.className = 'tsao-guide';
    appendText(doc, box, 'div', 'tsao-guide-title', 'Roteiro rapido');
    const list = doc.createElement('ol');
    list.className = 'tsao-guide-list';
    for (const item of items) {
        appendText(doc, list, 'li', '', item);
    }
    box.appendChild(list);
    header.appendChild(box);
}

function setStatus(status: HTMLElement, state: 'idle' | 'ok' | 'fallback', message: string): void {
    status.dataset.state = state;
    status.textContent = message;
}

function emitPanelEvent(
    root: HTMLElement,
    name: string,
    option: NormalizedTrainingSlideAppOption,
    result: TrainingSlideAppOptionActionResult,
): void {
    if (typeof CustomEvent !== 'function') return;
    // PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1: se o painel foi re-renderizado
    // enquanto a ação assíncrona rodava, `root` está DESCONECTADO e o evento
    // não borbulha até o overlay/window — o authoring nunca fecha e cobre o
    // editor de Pipelines. Com root conectado o evento borbulha até window;
    // desconectado, despacha direto em window (mesmo alvo final).
    const event = new CustomEvent(name, {
        bubbles: true,
        detail: { option, result },
    });
    if (root.isConnected) {
        root.dispatchEvent(event);
        return;
    }
    (root.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null))?.dispatchEvent(event);
}

function renderCard(
    doc: Document,
    root: HTMLElement,
    option: NormalizedTrainingSlideAppOption,
    config: TrainingSlideAppOptionsRenderConfig,
): HTMLElement {
    const card = doc.createElement('article');
    card.className = 'tsao-card';
    card.dataset.optionId = option.id;
    card.dataset.optionType = option.type;
    if (option.modelPresetId) card.dataset.modelPresetId = option.modelPresetId;
    if (option.adapterId) card.dataset.adapterId = option.adapterId;
    if (option.surfaceType) card.dataset.surfaceType = option.surfaceType;

    const top = doc.createElement('div');
    top.className = 'tsao-card-top';
    appendText(doc, top, 'h4', 'tsao-card-title', option.title);
    appendText(doc, top, 'span', 'tsao-chip', option.adapterId || option.type);
    card.appendChild(top);

    if (option.description) appendText(doc, card, 'div', 'tsao-description', option.description);
    renderTrainingSlideProfessorRouteMap(doc, card, option);
    const inspectorStatus = renderTrainingSlideOptionInspector(doc, card, option);
    renderTrainingSlideOptionMeta(doc, card, option);

    const reveal = option.type === 'reveal' ? appendText(doc, card, 'div', 'tsao-reveal', option.revealText) : null;
    if (reveal) reveal.hidden = true;
    const snapshot = option.type === 'snapshot' ? renderTrainingSlideSnapshotFallback(doc, card, option) : null;

    const actions = doc.createElement('div');
    actions.className = option.type === 'poll' && option.choices.length > 0 ? 'tsao-poll-choices' : 'tsao-actions';
    const status = doc.createElement('div');
    status.className = 'tsao-status';
    status.setAttribute('role', 'status');
    setStatus(status, 'idle', initialStatusMessage(option));

    const handleResult = (result: TrainingSlideAppOptionActionResult): void => {
        const state = result.ok ? 'ok' : 'fallback';
        const visibleMessage = visibleResultMessage(result, option);
        setStatus(status, state, visibleMessage);
        inspectorStatus.textContent = inspectorResultMessage(result, option);
        showTrainingSlideOptionToast(resolveTrainingSlideWindow(config.windowRef), visibleMessage, result.ok ? 'info' : 'warning');
        config.onAction?.(result, option);
        if (!result.ok) config.onFallback?.(result, option);
        emitPanelEvent(root, 'training-slide-app-option:action', option, result);
        if (!result.ok) emitPanelEvent(root, 'training-slide-app-option:fallback', option, result);
    };

    const runClick = (button: HTMLButtonElement, localPayload?: unknown): void => {
        button.disabled = true;
        status.dataset.state = 'ok';
        status.textContent = 'Abrindo...';
        inspectorStatus.textContent = 'Abrindo destino...';
        void runNormalizedTrainingSlideAppOption(option, config, localPayload)
            .then((result) => {
                if (option.type === 'reveal' && !result.ok && reveal) reveal.hidden = !reveal.hidden;
                if (option.type === 'snapshot' && !result.ok && snapshot) snapshot.hidden = false;
                handleResult(result);
            })
            .catch((error: unknown) => {
                handleResult({
                    ok: false,
                    id: option.id,
                    type: option.type,
                    mode: 'fallback',
                    handlerName: option.handlerName,
                    message: error instanceof Error ? error.message : fallbackMessage(option),
                });
            })
            .finally(() => {
                button.disabled = false;
            });
    };

    if (option.type === 'poll' && option.choices.length > 0) {
        for (const choice of option.choices) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'tsao-btn secondary';
            button.textContent = choice;
            button.addEventListener('click', () => {
                for (const sibling of Array.from(actions.querySelectorAll('button'))) {
                    sibling.setAttribute('aria-pressed', 'false');
                }
                button.setAttribute('aria-pressed', 'true');
                runClick(button, { optionId: option.id, choice, payload: option.payload });
            });
            actions.appendChild(button);
        }
    } else {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'tsao-btn';
        button.textContent = option.actionLabel;
        button.addEventListener('click', () => runClick(button));
        actions.appendChild(button);
    }

    card.appendChild(actions);
    card.appendChild(status);
    return card;
}

export function renderTrainingSlideAppOptionsPanel(
    data: TrainingSlideAppOptionsInput | null | undefined,
    config: TrainingSlideAppOptionsRenderConfig = {},
): HTMLElement {
    const doc = resolveDocument(config.documentRef);
    ensureStyles(doc);
    const options = normalizeTrainingSlideAppOptions(data);
    const root = doc.createElement('section');
    root.className = ROOT_CLASS;
    root.setAttribute('aria-label', 'Opcoes do app para este slide');

    const header = doc.createElement('header');
    header.className = 'tsao-header';
    appendText(doc, header, 'h3', 'tsao-title', 'Opcoes do app para este slide');
    const subtitle = slideSubtitle(data);
    const intro = slideIntro(data);
    const guide = slideGuide(data);
    if (subtitle) appendText(doc, header, 'div', 'tsao-subtitle', subtitle);
    if (intro) appendText(doc, header, 'div', 'tsao-subtitle', intro);
    renderSlideGuide(doc, header, guide);
    root.appendChild(header);

    const list = doc.createElement('div');
    list.className = 'tsao-list';
    if (options.length === 0) {
        appendText(doc, list, 'div', 'tsao-empty', 'Sem opcoes configuradas para este slide.');
    } else {
        for (const option of options) {
            list.appendChild(renderCard(doc, root, option, config));
        }
    }
    root.appendChild(list);
    return root;
}

export function mountTrainingSlideAppOptionsPanel(
    container: HTMLElement,
    data: TrainingSlideAppOptionsInput | null | undefined,
    config: TrainingSlideAppOptionsRenderConfig = {},
): HTMLElement {
    const panel = renderTrainingSlideAppOptionsPanel(data, {
        ...config,
        documentRef: config.documentRef || container.ownerDocument || undefined,
    });
    container.replaceChildren(panel);
    return panel;
}
