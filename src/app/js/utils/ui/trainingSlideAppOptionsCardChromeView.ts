// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { lookupKey, stringifyDisplayValue, uniqueStringArray } from './trainingSlideAppOptionsModel.js';
import {
    friendlyDestinationLabel,
    initialStatusMessage,
    moduleLabel,
    optionContentLabel,
    optionFallbackLabel,
    optionInputParamsLabel,
    optionModuleContextLabel,
    summarizeTrainingSlideAppOptionForProfessor,
} from './trainingSlideAppOptionsSummary.js';
import type { NormalizedTrainingSlideAppOption } from './trainingSlideAppOptionsTypes.js';

function appendText(doc: Document, parent: HTMLElement, tag: string, className: string, text: string): HTMLElement {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
}

function teacherFriendlyMetaLabel(value: string): string {
    const text = stringifyDisplayValue(value);
    if (!text) return '';
    if (/^(handler|preset|adapter|surface|fallback)\s*:/i.test(text)) return '';
    if (/^(asset|template):/i.test(text)) return '';
    if (/^m\d{2}\./i.test(text)) return '';
    const priority = text.match(/^prioridade\s*:\s*(.+)$/i);
    if (!priority) return text;
    const priorityValue = priority[1] || '';
    const level = lookupKey(priorityValue);
    if (['critical', 'critica', 'critico', 'alta', 'high'].includes(level)) return 'Prioridade alta';
    if (['medium', 'media', 'medio'].includes(level)) return 'Prioridade media';
    if (['low', 'baixa', 'baixo'].includes(level)) return 'Prioridade baixa';
    return `Prioridade ${priorityValue.trim()}`;
}

export function renderTrainingSlideOptionMeta(
    doc: Document,
    card: HTMLElement,
    option: NormalizedTrainingSlideAppOption,
): void {
    const items = uniqueStringArray([
        option.handlerName ? 'Abertura configurada' : '',
        option.modelPresetId ? 'Plano da aula' : '',
        option.adapterId || option.surfaceType ? friendlyDestinationLabel(option) : '',
        option.fallbackAssetId || option.fallbackText ? 'Apoio local pronto' : '',
        ...option.meta.map(teacherFriendlyMetaLabel),
    ]);
    if (items.length === 0) return;
    const meta = doc.createElement('div');
    meta.className = 'tsao-meta';
    for (const item of items) appendText(doc, meta, 'span', '', item);
    card.appendChild(meta);
}

function appendInspectorRow(doc: Document, parent: HTMLElement, label: string, value: string): HTMLElement {
    const row = doc.createElement('div');
    row.className = 'tsao-inspector-row';
    appendText(doc, row, 'span', 'tsao-inspector-label', label);
    const valueEl = appendText(doc, row, 'span', 'tsao-inspector-value', value);
    parent.appendChild(row);
    return valueEl;
}

export function renderTrainingSlideOptionInspector(
    doc: Document,
    card: HTMLElement,
    option: NormalizedTrainingSlideAppOption,
): HTMLElement {
    const inspector = doc.createElement('div');
    inspector.className = 'tsao-inspector';
    appendInspectorRow(doc, inspector, 'O que abre', optionContentLabel(option));
    appendInspectorRow(doc, inspector, 'Leva para o modulo', moduleLabel(option));
    appendInspectorRow(doc, inspector, 'Parametros de entrada', optionInputParamsLabel(option));
    appendInspectorRow(doc, inspector, 'Contexto LMS', optionModuleContextLabel(option));
    appendInspectorRow(doc, inspector, 'Destino', friendlyDestinationLabel(option));
    appendInspectorRow(doc, inspector, 'Se falhar, use', optionFallbackLabel(option));
    const statusValue = appendInspectorRow(doc, inspector, 'Status', initialStatusMessage(option));
    card.appendChild(inspector);
    return statusValue;
}

export function renderTrainingSlideProfessorRouteMap(
    doc: Document,
    card: HTMLElement,
    option: NormalizedTrainingSlideAppOption,
): void {
    const summary = summarizeTrainingSlideAppOptionForProfessor(option);
    const route = doc.createElement('div');
    route.className = 'tsao-route-map';
    const items = [
        ['Destino', summary.destinationLabel],
        ['Por que abrir', summary.reasonLabel],
        ['Preset', summary.presetStatusLabel],
        ['Retorno', summary.returnLabel],
    ] as const;
    for (const [label, value] of items) {
        const item = doc.createElement('div');
        item.className = 'tsao-route-item';
        appendText(doc, item, 'span', 'tsao-route-label', label);
        appendText(doc, item, 'strong', 'tsao-route-value', value);
        route.appendChild(item);
    }
    card.appendChild(route);
}

export function renderTrainingSlideSnapshotFallback(
    doc: Document,
    card: HTMLElement,
    option: NormalizedTrainingSlideAppOption,
): HTMLElement {
    const snapshot = doc.createElement('div');
    snapshot.className = 'tsao-snapshot';
    snapshot.hidden = true;
    if (option.imageUrl) {
        const img = doc.createElement('img');
        img.src = option.imageUrl;
        img.alt = option.title;
        snapshot.appendChild(img);
    } else {
        snapshot.textContent = option.fallbackText || 'Snapshot nao configurado para este ambiente.';
    }
    card.appendChild(snapshot);
    return snapshot;
}
