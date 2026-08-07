// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import {
    deckWorkbenchEditableBounds,
    deckWorkbenchEditableElementId,
    deckWorkbenchEditableElementLabel,
    deckWorkbenchEditableElements,
    deckWorkbenchSelectedEditableElement,
    type DeckEditableSlideElement,
    type DeckWorkbenchSlide,
} from './lmsAuthoringDeckModel.js';
import type { LmsAuthoringDeckWorkbenchContext } from './lmsAuthoringDeckWorkbenchTypes.js';

type EditableContext = Pick<LmsAuthoringDeckWorkbenchContext, 'selectedEditableElementId'>;

export function renderDeckWorkbenchEditableLayer(
    slide: DeckWorkbenchSlide | undefined,
    context: EditableContext,
): string {
    const elements = deckWorkbenchEditableElements(slide);
    if (!elements.length) return '';
    const items = elements.map((element, index) => {
        const id = deckWorkbenchEditableElementId(element, index);
        const bounds = deckWorkbenchEditableBounds(element);
        const label = deckWorkbenchEditableElementLabel(element, index);
        const type = String(element.type || element.kind || 'shape').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        const reviewClass = element.needsPositionReview ? ' lms-author-slide-editable-element--needs-review' : '';
        const textClass = bounds.w >= 0.12 && bounds.h >= 0.055 ? '' : ' lms-author-slide-editable-element--compact';
        const selectedClass = context.selectedEditableElementId === id
            ? ' lms-author-slide-editable-element--selected'
            : '';
        const style = [
            `left:${(bounds.x * 100).toFixed(3)}%`,
            `top:${(bounds.y * 100).toFixed(3)}%`,
            `width:${(bounds.w * 100).toFixed(3)}%`,
            `height:${(bounds.h * 100).toFixed(3)}%`,
        ].join(';');
        return `<button type="button"
            class="lms-author-slide-editable-element lms-author-slide-editable-element--${escapeAttr(type)}${reviewClass}${textClass}${selectedClass}"
            style="${escapeAttr(style)}"
            data-editable-lesson-id="${escapeAttr(slide?.lesson.id || '')}"
            data-editable-element-id="${escapeAttr(id)}"
            data-editable-element-type="${escapeAttr(type)}"
            aria-label="${escapeAttr(`Elemento editavel ${index + 1}: ${label}`)}"
            title="${escapeAttr(label)}"><span>${escapeHtml(label)}</span></button>`;
    }).join('');
    return `<div class="lms-author-slide-editable-layer" aria-label="${escapeAttr('Elementos editaveis do slide')}">${items}</div>`;
}

export function renderDeckEditableInspector(
    slide: DeckWorkbenchSlide | undefined,
    context: EditableContext,
): string {
    const elements = deckWorkbenchEditableElements(slide);
    if (!slide || !elements.length) {
        return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
            <div class="lms-author-slide-editable-inspector-head">
                <span>${escapeHtml('Editar slide')}</span>
                <strong>${escapeHtml('Sem objetos editaveis')}</strong>
            </div>
            <p>${escapeHtml('Importe ou gere um pacote editavel para transformar o slide em objetos internos do ecbyts.')}</p>
        </aside>`;
    }
    const selected = deckWorkbenchSelectedEditableElement(slide, context.selectedEditableElementId);
    if (!selected) {
        return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
            <div class="lms-author-slide-editable-inspector-head">
                <span>${escapeHtml('Editar slide')}</span>
                <strong>${escapeHtml(`${elements.length} elementos`)}</strong>
            </div>
            <p>${escapeHtml('Clique em uma caixa azul no slide para editar texto, rotulo e posicao desse elemento.')}</p>
        </aside>`;
    }
    return renderSelectedEditableInspector(slide, selected.element, selected.index, selected.id);
}

function renderSelectedEditableInspector(
    slide: DeckWorkbenchSlide,
    element: DeckEditableSlideElement,
    index: number,
    id: string,
): string {
    const label = deckWorkbenchEditableElementLabel(element, index);
    const type = String(element.type || element.kind || 'elemento');
    const bounds = deckWorkbenchEditableBounds(element);
    const positionSource = element.needsPositionReview ? 'precisa revisar posicao' : 'posicao revisada';
    const numberField = (field: 'x' | 'y' | 'w' | 'h', value: number, labelText: string) => `
        <label>
            <span>${escapeHtml(labelText)}</span>
            <input type="number" min="0" max="100" step="0.1"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(id)}"
                data-editable-field="${escapeAttr(field)}"
                value="${escapeAttr((value * 100).toFixed(1))}">
        </label>`;
    return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
        <div class="lms-author-slide-editable-inspector-head">
            <span>${escapeHtml('Editar elemento')}</span>
            <strong>${escapeHtml(type)}</strong>
        </div>
        <label>
            <span>${escapeHtml('Rotulo')}</span>
            <input type="text"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(id)}"
                data-editable-field="label"
                value="${escapeAttr(label)}">
        </label>
        <label>
            <span>${escapeHtml('Texto')}</span>
            <textarea rows="4"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(id)}"
                data-editable-field="text">${escapeHtml(String(element.text || ''))}</textarea>
        </label>
        <div class="lms-author-slide-editable-grid" aria-label="${escapeAttr('Posicao em percentual do slide')}">
            ${numberField('x', bounds.x, 'X')}
            ${numberField('y', bounds.y, 'Y')}
            ${numberField('w', bounds.w, 'Largura')}
            ${numberField('h', bounds.h, 'Altura')}
        </div>
        <button type="button" class="btn btn-secondary lms-author-editable-position-reviewed"
            data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
            data-editable-element-id="${escapeAttr(id)}">${escapeHtml('Marcar posicao revisada')}</button>
        <p>${escapeHtml(`${positionSource}. Alteracoes ficam no rascunho e entram na proxima chave ECBT exportada.`)}</p>
    </aside>`;
}
