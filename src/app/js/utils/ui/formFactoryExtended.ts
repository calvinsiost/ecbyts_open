// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Form Factory Extended (Phase 1 Q4=1) for SPEC_UI_REUSE_OPTIMIZATION_PROGRAM.
// Hand-authored R1-safe extension de forms.js (Wave A) — adiciona advanced
// builders sem touch em forms.js codemod-governed.
//
// Calvin Q4=1: priorizar Form (atinge 92% modais, normaliza i18n, fim de
// style.cssText 281 sites).
//
// Spec NOT:
// - NÃO duplicar createField/createForm (delega forms.js)
// - NÃO style.cssText inline (CSS classes apenas)
// - NÃO emoji em strings
// - NÃO criar nova chave localStorage

import { createField, createForm, getFormData, setFieldError, clearFormErrors } from './forms.js';
import type { FieldType } from './forms.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';

/**
 * Cria datalist com options pré-definidas para autocomplete.
 * @param {{id:string, options:Array<{value:string, labelKey?:string}>}} input
 * @returns {HTMLElement}
 */
export function createDatalist(input: { id?: string; options?: Array<{ value?: string; labelKey?: string }> }) {
    const el = document.createElement('datalist');
    el.id = String(input?.id || '');
    const options = Array.isArray(input?.options) ? input.options : [];
    el.innerHTML = options
        .map((o: { value?: string; labelKey?: string }) => {
            const value = escapeHtml(o?.value || '');
            const label = o?.labelKey ? t(o.labelKey) || o.labelKey : value;
            return `<option value="${value}">${escapeHtml(label)}</option>`;
        })
        .join('');
    return el;
}

/**
 * Cria field com datalist anexada (autocomplete).
 * @param {{type:string, name:string, labelKey:string, datalistId:string, options:Array<{value:string,labelKey?:string}>}} input
 * @returns {HTMLElement}
 */
export function createFieldWithAutocomplete(input: { type?: FieldType; name: string; labelKey: string; datalistId: string; options?: Array<{ value?: string; labelKey?: string }> }) {
    const wrap = document.createElement('div');
    wrap.className = 'ecbt-form-field-with-datalist';
    const field = createField({
        type: input.type || 'text',
        name: input.name,
        labelKey: input.labelKey,
    });
    const inputEl = /** @type {any} */ (field.querySelector('input'));
    if (inputEl) inputEl.setAttribute('list', input.datalistId);
    const datalist = createDatalist({ id: input.datalistId, options: input.options || [] });
    wrap.appendChild(field);
    wrap.appendChild(datalist);
    return wrap;
}

/**
 * Validation display canonical — mostra erros agregados de uma form.
 * @param {Record<string,string>} errors  Map de fieldName → message
 * @returns {HTMLElement}
 */
export function createValidationDisplay(errors: Record<string, string>) {
    const el = document.createElement('div');
    el.className = 'ecbt-form-validation-display';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    if (!errors || typeof errors !== 'object') {
        el.hidden = true;
        return el;
    }
    const entries = Object.entries(errors).filter(([, msg]) => typeof msg === 'string' && msg);
    if (!entries.length) {
        el.hidden = true;
        return el;
    }
    el.hidden = false;
    const title = t('form.validation.title') || 'Verifique os campos';
    el.innerHTML = `<strong class="ecbt-form-validation-title">${escapeHtml(title)}</strong>
        <ul class="ecbt-form-validation-list">
            ${entries.map(([name, msg]) => `<li class="ecbt-form-validation-item" data-field="${escapeHtml(name)}">${escapeHtml(name)}: ${escapeHtml(msg)}</li>`).join('')}
        </ul>`;
    return el;
}

/**
 * Form com validation display embutido + submit handler.
 * @param {{fields:Array<*>, opts?:object, onSubmit?:(data:object)=>{valid:boolean,errors?:Record<string,string>}}} input
 * @returns {{form:HTMLElement, validation:HTMLElement, getData:Function, setErrors:Function, clearErrors:Function}}
 */
export function createFormWithValidation(input: { fields?: any[]; opts?: Record<string, any>; onSubmit?: (data: Record<string, any>) => { valid: boolean; errors?: Record<string, string> } }) {
    const form = createForm(input.fields || [], input.opts || {});
    const validation = createValidationDisplay({});
    form.appendChild(validation);
    const refreshErrors = (errors: Record<string, string> = {}) => {
        clearFormErrors(form);
        const filtered: Record<string, string> = {};
        for (const [name, msg] of Object.entries(errors || {})) {
            if (typeof msg !== 'string' || !msg) continue;
            filtered[name] = msg;
            setFieldError(form, name, msg);
        }
        validation.replaceWith(createValidationDisplay(filtered));
    };
    /** @type {any} */ (form).addEventListener?.('submit', (ev) => {
        ev?.preventDefault?.();
        const data = getFormData(form);
        if (!input.onSubmit) return;
        try {
            const result = input.onSubmit(data) || { valid: true };
            if (!result.valid) refreshErrors(result.errors || {});
            else clearFormErrors(form);
        } catch (e: any) {
            console.debug('[formFactoryExtended:submit]', e?.message || e);
        }
    });
    return {
        form,
        validation,
        getData: () => getFormData(form),
        setErrors: (errs: Record<string, string>) => refreshErrors(errs),
        clearErrors: () => clearFormErrors(form),
    };
}

/**
 * Cria submit + cancel buttons row canonical.
 * @param {{submitLabelKey?:string, cancelLabelKey?:string, onCancel?:Function}} opts
 * @returns {HTMLElement}
 */
export function createFormActions(opts: { submitLabelKey?: string; cancelLabelKey?: string; onCancel?: () => void } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'ecbt-form-actions';
    const submitLabel = t(opts.submitLabelKey || 'form.action.submit') || 'Salvar';
    const cancelLabel = t(opts.cancelLabelKey || 'form.action.cancel') || 'Cancelar';
    wrap.innerHTML = `
        <button type="button" class="ecbt-btn ecbt-btn--ghost" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="submit" class="ecbt-btn ecbt-btn--primary" data-action="submit">${escapeHtml(submitLabel)}</button>
    `;
    if (typeof opts.onCancel === 'function') {
        const onCancel = opts.onCancel;
        wrap.querySelector('[data-action="cancel"]')?.addEventListener('click', () => onCancel());
    }
    return wrap;
}
