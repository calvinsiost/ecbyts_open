// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Binding UI helpers - pure HTML snippet generators.
 *
 * Extracted in ARCH-MONO-001 Phase 4 from `app/js/utils/ui/lists.js`
 * (lines 1921-2029). These are small, pure functions with a single
 * dependency on the i18n `t()` helper and the `escapeHtml` helper.
 *
 * Responsibilities:
 *   - Detect if an observation field has an active binding
 *   - Return the CSS class suffix for bound / broken fields
 *   - Generate tooltip text for binding status
 *   - Render a label with a chain-icon toggle button
 *   - Render a bindable number field (label + input + chain icon)
 *
 * The helpers are used by `observationRow` in `lists.js` to render the
 * observation form with the binding / field-derivation affordance.
 * They never mutate their inputs and never touch the DOM directly -
 * they just return HTML strings.
 *
 * Why extracted: `lists.js` was 3270 lines and these were the clearest
 * leaf block (110 lines, no module state, no reverse dependencies into
 * lists.js). Shrinking lists.js is Phase 4 of ARCH-MONO-001.
 */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';

/**
 * Check if an observation field has an active binding.
 * Active = status 'ok' or 'stale' (broken/circular count as NOT bound).
 *
 * @param {any} obs - observation object with optional `.bindings[field]`
 * @param {string} field - field name (e.g. 'x', 'y', 'z', 'date')
 * @returns {boolean}
 */
export function isFieldBound(obs: any, field: any) {
    const b = obs?.bindings?.[field];
    return b && (b.status === 'ok' || b.status === 'stale');
}

/**
 * Get CSS class suffix for a bound field.
 * Returns '' | ' obs-bound' | ' obs-bound-broken'.
 *
 * @param {any} obs
 * @param {string} field
 * @returns {string}
 */
export function bindingClass(obs: any, field: any) {
    const b = obs?.bindings?.[field];
    if (!b) return '';
    if (b.status === 'ok' || b.status === 'stale') return ' obs-bound';
    if (b.status === 'broken') return ' obs-bound-broken';
    if (b.status === 'circular') return ' obs-bound-broken';
    return '';
}

/**
 * Generate tooltip text describing the current binding state.
 *
 * @param {any} obs
 * @param {string} field
 * @returns {string}
 */
export function bindingTooltip(obs: any, field: any) {
    const b = obs?.bindings?.[field];
    if (!b) return t('bindField') || 'Bind field';
    if (b.status === 'broken') return `${t('bindingBroken') || 'Binding broken'}: ${b.targetType}/${b.targetId}`;
    if (b.status === 'circular') return t('bindingCircular') || 'Circular binding detected';
    // ok/stale: mostra origem
    const transform = b.transform !== 'identity' ? ` (${b.transform})` : '';
    return `${t('boundTo') || 'Bound to'}: ${b.targetId} > ${b.targetPath}${transform}`;
}

/**
 * Render a label with optional chain-icon binding toggle.
 *
 * Click behavior:
 *   - If any binding exists (ok / stale / broken / circular) → click unbinds
 *   - Otherwise → click opens the binding picker modal
 *
 * @param {string} elementId
 * @param {number} index - observation index
 * @param {any} obs
 * @param {string} field
 * @param {string} labelText - display text
 * @param {boolean} editable
 * @returns {string} HTML fragment
 */
export function bindableFieldLabel(elementId: any, index: any, obs: any, field: any, labelText: any, editable: any) {
    const bound = isFieldBound(obs, field);
    const binding = obs?.bindings?.[field];
    const isBroken = binding && (binding.status === 'broken' || binding.status === 'circular');
    const hasAnyBinding = !!binding;
    const tooltip = bindingTooltip(obs, field);

    const iconClass = bound
        ? 'obs-bind-icon obs-bind-active'
        : isBroken
          ? 'obs-bind-icon obs-bind-broken'
          : 'obs-bind-icon';

    // CC-S1 B3 artesanal: ternário movido para o NOME no payload data-cc-call
    // (args idênticos) — ambas fns na whitelist via extra-whitelist.
    const bindFn = hasAnyBinding ? 'handleUnbindField' : 'handleOpenBindingPicker';
    const bindBtn = editable
        ? `<button type="button" class="${iconClass}" title="${escapeHtml(tooltip)}"
        data-cc-call-click="${bindFn}|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${field}`)}">&#128279;</button>`
        : '';

    return `<label class="form-label">${labelText} ${bindBtn}</label>`;
}

/**
 * Render a bindable number input (label + input + chain icon).
 * The input becomes `readonly` when the field is bound (ok/stale).
 *
 * @param {string} elementId
 * @param {number} index
 * @param {any} obs
 * @param {string} field - 'x' | 'y' | 'z' etc
 * @param {string} label
 * @param {boolean} editable
 * @returns {string} HTML fragment
 */
export function bindableNumberField(elementId: any, index: any, obs: any, field: any, label: any, editable: any) {
    const bound = isFieldBound(obs, field);
    const cssClass = `form-input${bindingClass(obs, field)}`;

    return `<div class="form-group">
        ${bindableFieldLabel(elementId, index, obs, field, label, editable)}
        <input data-field-meta="true" data-field-meta-key="auto-pos:bindingHelpers:input:L138" class="${cssClass}" type="number" step="0.01" value="${obs[field] ?? 0}"
               ${bound ? 'readonly' : ''}
               data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${field}`)}|v">
    </div>`;
}
