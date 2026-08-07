// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { escapeHtml } from '../helpers/html.js';

export interface ElementDetailsLike {
    id: string;
    name?: string;
    label?: string;
    description?: string;
    family: string;
    iconClass?: string;
    data?: {
        position?: {
            x?: number;
            y?: number;
            z?: number;
        };
        observations?: unknown[];
    };
}

export interface ElementDetailsRenderContext {
    familyName?: string;
    editable?: boolean;
    t?: (key: string) => string;
}

function escapeAttrStrict(text: unknown): string {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTranslator(ctx: ElementDetailsRenderContext): (key: string) => string {
    return ctx.t || ((key: string) => key);
}

export function buildElementHeader(
    element: ElementDetailsLike | null | undefined,
    ctx: ElementDetailsRenderContext = {},
): string {
    if (!element || !element.id) return '';
    const t = getTranslator(ctx);
    const editable = ctx.editable !== false;
    const familyName = ctx.familyName || element.family || '-';
    const displayName = element.name || element.label || element.id;

    return `
        <div class="ecbt-edetails-header" data-element-id="${escapeAttrStrict(element.id)}">
            <div class="ecbt-edetails-header-main">
                <div class="ecbt-edetails-header-name" title="${escapeAttrStrict(displayName)}">
                    ${escapeHtml(displayName)}
                </div>
                <div class="ecbt-edetails-header-meta">
                    <span class="ecbt-edetails-family-badge">${escapeHtml(familyName)}</span>
                    <code class="ecbt-edetails-id-badge" title="${escapeAttrStrict(element.id)}">#${escapeHtml(element.id.slice(0, 8))}</code>
                </div>
            </div>
            <div class="ecbt-edetails-header-actions">
                <button type="button" class="ecbt-edetails-action-btn"
                        title="${escapeAttrStrict(t('editExtendedMetadata') || 'Edit metadata')}"
                        data-cc-call-click="handleOpenExtendedMetadataEditor|s:${encodeURIComponent(`${escapeAttrStrict(element.id)}`)}">
                    <span data-icon="edit-3" data-icon-size="13px"></span>
                </button>
                ${
                    editable
                        ? `<button type="button" class="ecbt-edetails-action-btn ecbt-edetails-action-danger"
                                title="${escapeAttrStrict(t('delete') || 'Delete')}"
                                data-cc-call-click="handleRemoveElement|s:${encodeURIComponent(`${escapeAttrStrict(element.id)}`)}">
                            <span data-icon="trash-2" data-icon-size="13px"></span>
                        </button>`
                        : ''
                }
            </div>
        </div>`;
}

export function buildIdentitySection(
    element: ElementDetailsLike,
    ctx: ElementDetailsRenderContext = {},
): string {
    if (!element || !element.id) return '';
    const t = getTranslator(ctx);
    const ro = ctx.editable === false ? 'readonly disabled' : '';
    const eid = escapeHtml(element.id);

    return `
        <div class="section ecbt-edetails-section" data-section-id="edetails-identity">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="elementIdentity">${escapeHtml(t('elementIdentity') || 'Identity')}</span>
                <span class="chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="form-group">
                    <label class="form-label" data-i18n="elementName">${escapeHtml(t('elementName') || 'Element Name')}</label>
                    <input data-field-meta="true" data-field-meta-key="element:${eid}:name" class="form-input" type="text"
                           value="${escapeAttrStrict(element.name || '')}" ${ro}
                           data-cc-call-input="handleElementFieldChange|s:${encodeURIComponent(`${eid}`)}|s:name|v">
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="elementLabel">${escapeHtml(t('elementLabel') || 'Label')}</label>
                    <input data-field-meta="true" data-field-meta-key="element:${eid}:label" class="form-input" type="text"
                           value="${escapeAttrStrict(element.label || '')}" ${ro}
                           data-cc-call-input="handleElementFieldChange|s:${encodeURIComponent(`${eid}`)}|s:label|v">
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="description">${escapeHtml(t('description') || 'Description')}</label>
                    <textarea data-field-meta="true" data-field-meta-key="element:${eid}:description" class="form-input" rows="2" ${ro}
                              data-cc-call-input="handleElementFieldChange|s:${encodeURIComponent(`${eid}`)}|s:description|v"
                    >${escapeHtml(element.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="iconClass">${escapeHtml(t('iconClass') || 'Icon Class')}</label>
                    <input data-field-meta="true" data-field-meta-key="element:${eid}:iconClass" class="form-input" type="text"
                           value="${escapeAttrStrict(element.iconClass || '')}" ${ro}
                           data-cc-call-input="handleElementFieldChange|s:${encodeURIComponent(`${eid}`)}|s:iconClass|v">
                </div>
            </div>
        </div>`;
}

export function buildPositionSection(
    element: ElementDetailsLike,
    ctx: ElementDetailsRenderContext = {},
): string {
    if (!element || !element.id) return '';
    const t = getTranslator(ctx);
    const pos = element.data?.position;
    if (!pos || typeof pos !== 'object') return '';

    const fmt = (value: number | undefined): string =>
        typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';

    return `
        <div class="section ecbt-edetails-section" data-section-id="edetails-position">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="position">${escapeHtml(t('position') || 'Position')}</span>
                <span class="chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="ecbt-edetails-coord-grid">
                    <div class="ecbt-edetails-coord">
                        <span class="ecbt-edetails-coord-label">X</span>
                        <span class="ecbt-edetails-coord-value">${fmt(pos.x)}</span>
                    </div>
                    <div class="ecbt-edetails-coord">
                        <span class="ecbt-edetails-coord-label">Y</span>
                        <span class="ecbt-edetails-coord-value">${fmt(pos.y)}</span>
                    </div>
                    <div class="ecbt-edetails-coord">
                        <span class="ecbt-edetails-coord-label">Z</span>
                        <span class="ecbt-edetails-coord-value">${fmt(pos.z)}</span>
                    </div>
                </div>
            </div>
        </div>`;
}

export function buildEmptyState(ctx: ElementDetailsRenderContext = {}): string {
    const t = getTranslator(ctx);
    return `
        <div class="ecbt-edetails-empty">
            <span data-icon="mouse-pointer" data-icon-size="20px"></span>
            <p data-i18n="selectElementPrompt">${escapeHtml(t('selectElementPrompt') || 'Select an element to edit its properties.')}</p>
        </div>`;
}

export function buildStructuredHeader(
    element: ElementDetailsLike | null | undefined,
    ctx: ElementDetailsRenderContext = {},
): string {
    if (!element || !element.id) return buildEmptyState(ctx);
    return [buildElementHeader(element, ctx), buildIdentitySection(element, ctx), buildPositionSection(element, ctx)].join('\n');
}
