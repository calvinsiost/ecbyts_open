// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// FORMS FACTORY — canonical form/field builders for ECBT modals & panels.
// Espelha .ecbt-form* tokens em design-tokens.css.
//
// API minimal:
//   createField({ type, name, labelKey, value?, placeholderKey?, required? }) → HTMLElement
//   createForm(fields, opts?) → HTMLFormElement
//   getFormData(formEl) → Record<string, string>
//
// USO:
//   import { createForm, getFormData } from './forms.ts';
//   const form = createForm([
//     { type: 'text', name: 'title', labelKey: 'projectTitle', required: true },
//     { type: 'select', name: 'category', labelKey: 'category', options: [...] },
//   ]);
//   form.addEventListener('submit', e => {
//     e.preventDefault();
//     const data = getFormData(form);
//   });

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';

export type FieldType = 'text' | 'number' | 'email' | 'password' | 'select' | 'textarea' | 'checkbox' | 'date' | 'color';

export interface SelectOption {
    value: string;
    labelKey?: string;
    label?: string;
}

export interface FormField {
    type: FieldType;
    name: string;
    labelKey: string;
    value?: string | number | boolean;
    placeholderKey?: string;
    required?: boolean;
    options?: SelectOption[]; // for select
    rows?: number; // for textarea
    min?: number; // for number
    max?: number; // for number
    pattern?: string; // for text
}

export interface FormOptions {
    submitLabelKey?: string;
    cancelLabelKey?: string;
    onSubmit?: (data: Record<string, string>) => void;
    onCancel?: () => void;
}

/**
 * Cria 1 field (label + input + error placeholder) com classes .ecbt-form-*.
 */
export function createField(field: FormField): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'ecbt-form-field';
    const id = 'ecbt-field-' + field.name;

    const label = document.createElement('label');
    label.className = 'ecbt-form-label';
    label.htmlFor = id;
    label.textContent = t(field.labelKey) || field.labelKey;
    if (field.required) label.dataset.required = 'true';
    wrap.appendChild(label);

    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (field.type === 'select') {
        const sel = document.createElement('select');
        sel.className = 'ecbt-form-select';
        for (const opt of field.options || []) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.labelKey ? (t(opt.labelKey) || opt.labelKey) : (opt.label || opt.value);
            sel.appendChild(o);
        }
        if (field.value != null) sel.value = String(field.value);
        input = sel;
    } else if (field.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.className = 'ecbt-form-textarea';
        ta.rows = field.rows || 4;
        if (field.value != null) ta.value = String(field.value);
        input = ta;
    } else if (field.type === 'checkbox') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'ecbt-form-check';
        cb.checked = Boolean(field.value);
        input = cb;
    } else {
        const inp = document.createElement('input');
        inp.type = field.type;
        inp.className = 'ecbt-form-input';
        if (field.value != null) inp.value = String(field.value);
        if (field.placeholderKey) inp.placeholder = t(field.placeholderKey) || field.placeholderKey;
        if (field.min != null) inp.min = String(field.min);
        if (field.max != null) inp.max = String(field.max);
        if (field.pattern) inp.pattern = field.pattern;
        input = inp;
    }

    input.id = id;
    input.name = field.name;
    if (field.required) input.required = true;
    wrap.appendChild(input);

    const err = document.createElement('div');
    err.className = 'ecbt-form-error';
    err.setAttribute('role', 'alert');
    err.hidden = true;
    wrap.appendChild(err);

    return wrap;
}

/**
 * Cria <form> completo com fields + opcionalmente botões submit/cancel.
 */
export function createForm(fields: FormField[], opts: FormOptions = {}): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'ecbt-form';

    for (const field of fields) {
        form.appendChild(createField(field));
    }

    if (opts.submitLabelKey || opts.cancelLabelKey) {
        const actions = document.createElement('div');
        actions.className = 'ecbt-form-actions';

        if (opts.cancelLabelKey) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'ecbt-btn ecbt-btn--secondary';
            cancelBtn.textContent = t(opts.cancelLabelKey) || opts.cancelLabelKey;
            cancelBtn.addEventListener('click', () => opts.onCancel?.());
            actions.appendChild(cancelBtn);
        }

        if (opts.submitLabelKey) {
            const submitBtn = document.createElement('button');
            submitBtn.type = 'submit';
            submitBtn.className = 'ecbt-btn ecbt-btn--primary';
            submitBtn.textContent = t(opts.submitLabelKey) || opts.submitLabelKey;
            actions.appendChild(submitBtn);
        }

        form.appendChild(actions);
    }

    if (opts.onSubmit) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            opts.onSubmit?.(getFormData(form));
        });
    }

    return form;
}

/**
 * Extrai dados de form como Record<string, string>. Checkbox vira 'true'/'false'.
 */
export function getFormData(form: HTMLFormElement): Record<string, string> {
    const data: Record<string, string> = {};
    const elements = form.elements as unknown as HTMLCollectionOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    for (const el of Array.from(elements)) {
        if (!el.name) continue;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            data[el.name] = el.checked ? 'true' : 'false';
        } else {
            data[el.name] = el.value;
        }
    }
    return data;
}

/**
 * Helper para exibir erro em campo específico.
 */
export function setFieldError(form: HTMLFormElement, fieldName: string, message: string): void {
    const wrap = form.querySelector('[name="' + fieldName + '"]')?.closest('.ecbt-form-field');
    if (!wrap) return;
    const err = wrap.querySelector('.ecbt-form-error') as HTMLDivElement | null;
    if (err) {
        err.textContent = escapeHtml(message);
        err.hidden = false;
    }
}

/**
 * Clear all field errors no form.
 */
export function clearFormErrors(form: HTMLFormElement): void {
    form.querySelectorAll('.ecbt-form-error').forEach((el) => {
        (el as HTMLDivElement).hidden = true;
        el.textContent = '';
    });
}
