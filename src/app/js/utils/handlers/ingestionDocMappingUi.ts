// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { escapeHtml } from '../helpers/html.js';

const DEFAULT_STYLES = {
    muted: 'color:var(--neutral-500);',
    tableHeader: 'font-size:10px;color:var(--neutral-500);border-bottom:1px solid var(--neutral-200);',
    tableRow: 'border-bottom:1px solid var(--neutral-100);',
};

function normalizeElementName(name: any) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[\s\-_.]+/g, '');
}

function resolveStyles(styles: any = {}) {
    return {
        muted: styles.muted || DEFAULT_STYLES.muted,
        tableHeader: styles.tableHeader || DEFAULT_STYLES.tableHeader,
        tableRow: styles.tableRow || DEFAULT_STYLES.tableRow,
    };
}

export function autoMatchWells(wellIds: any, existingElements: any[] = []) {
    const existingMap = new Map();
    for (const element of Array.isArray(existingElements) ? existingElements : []) {
        existingMap.set(normalizeElementName(element?.name), element);
    }

    const matches = new Map();
    for (const wellId of Array.isArray(wellIds) ? wellIds : []) {
        const match = existingMap.get(normalizeElementName(wellId)) || null;
        matches.set(wellId, {
            action: match ? 'link' : 'create',
            existingElement: match,
            elementId: match?.id || null,
        });
    }
    return matches;
}

export function getScatterPosition(index: any, total: any) {
    const radius = 5;
    const angle = (2 * Math.PI * index) / Math.max(total, 1);
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
}

export function buildMappingModalStats(mapping: any) {
    const keys = [...(mapping instanceof Map ? mapping.keys() : [])];
    return {
        linkCount: keys.filter((key) => mapping.get(key)?.action === 'link').length,
        createCount: keys.filter((key) => mapping.get(key)?.action === 'create').length,
        ignoreCount: keys.filter((key) => mapping.get(key)?.action === 'ignore').length,
    };
}

/** @param {any} opts */
export function buildMappingModalHtml({ mapping, extractedFields, existingElements = [], styles = {} }: any) {
    if (!(mapping instanceof Map)) return '';
    const { muted, tableHeader, tableRow } = resolveStyles(styles);
    const wellIds = [...mapping.keys()];
    const { linkCount, createCount, ignoreCount } = buildMappingModalStats(mapping);

    let html = `
        <div style="margin-bottom:12px;">
            <h3 style="margin:0 0 4px;font-size:14px;color:var(--neutral-800);">Mapeamento de Elementos</h3>
            <p style="font-size:11px;${muted}margin:0;">${wellIds.length} ponto(s) encontrado(s) no documento</p>
        </div>
    `;

    html += `<div style="max-height:250px;overflow-y:auto;border:1px solid var(--neutral-200);border-radius:6px;margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="${tableHeader}">
                <th style="padding:6px;text-align:left;">Documento</th>
                <th style="padding:6px;text-align:left;width:120px;">Acao</th>
                <th style="padding:6px;text-align:left;">Destino</th>
            </tr></thead><tbody>`;

    for (const wellId of wellIds) {
        const current = mapping.get(wellId) || {};
        const hasMatch = !!current.existingElement;
        const rowBg = hasMatch ? 'background:rgba(16,185,129,0.05);' : '';
        const existingOptions = (Array.isArray(existingElements) ? existingElements : [])
            .map(
                (element) =>
                    `<option value="${element.id}" ${current.elementId === element.id ? 'selected' : ''}>${escapeHtml(element.name)} (${element.family})</option>`,
            )
            .join('');

        html += `<tr style="${tableRow}${rowBg}">
            <td style="padding:4px 6px;font-weight:600;color:var(--neutral-800);">${escapeHtml(wellId)}</td>
            <td style="padding:4px 6px;">
                <select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:mapping-action" style="font-size:10px;padding:2px;border:1px solid var(--neutral-200);border-radius:4px;width:110px;background:var(--neutral-50);color:var(--neutral-800);"
                        data-cc-call-change="_docMappingAction|s:${encodeURIComponent(`${escapeHtml(wellId)}`)}|v">
                    <option value="link" ${current.action === 'link' ? 'selected' : ''}>Vincular</option>
                    <option value="create" ${current.action === 'create' ? 'selected' : ''}>Criar novo</option>
                    <option value="ignore" ${current.action === 'ignore' ? 'selected' : ''}>Ignorar</option>
                </select>
            </td>
            <td style="padding:4px 6px;font-size:10px;color:var(--neutral-600);">
                ${
                    current.action === 'link'
                        ? `<select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:mapping-target" style="font-size:10px;padding:2px;border:1px solid var(--neutral-200);border-radius:4px;max-width:150px;background:var(--neutral-50);color:var(--neutral-800);"
                    data-cc-call-change="_docMappingTarget|s:${encodeURIComponent(`${escapeHtml(wellId)}`)}|v">
                    ${existingOptions}
                </select>${hasMatch ? ' <span style="color:#10b981;">&#10003;</span>' : ''}`
                        : ''
                }
                ${current.action === 'create' ? '<span style="color:var(--neutral-400);">(novo elemento)</span>' : ''}
                ${current.action === 'ignore' ? '<span style="color:var(--neutral-400);">--</span>' : ''}
            </td>
        </tr>`;
    }

    html += `</tbody></table></div>`;

    if (Array.isArray(extractedFields) && extractedFields.length > 0) {
        html += `<details style="margin-bottom:10px;border:1px solid var(--neutral-200);border-radius:6px;padding:8px;">
            <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--neutral-800);">
                Campos Detectados (${extractedFields.length})
            </summary>
            <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:6px;">
                <thead><tr style="background:var(--neutral-50);">
                    <th style="padding:4px 6px;text-align:left;">Campo</th>
                    <th style="padding:4px 6px;text-align:left;">Valor no Documento</th>
                    <th style="padding:4px 6px;text-align:center;width:50px;">Importar</th>
                </tr></thead><tbody>`;

        for (let index = 0; index < extractedFields.length; index++) {
            const field = extractedFields[index];
            const checked = field?._import !== false;
            html += `<tr style="${tableRow}">
                <td style="padding:3px 6px;color:var(--neutral-600);">${escapeHtml(
                    String(field?.field || '')
                        .split('.')
                        .pop(),
                )}</td>
                <td style="padding:3px 6px;font-family:monospace;color:var(--neutral-800);">${escapeHtml(String(field?.value ?? ''))}</td>
                <td style="padding:3px 6px;text-align:center;">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:field-toggle" type="checkbox" ${checked ? 'checked' : ''}
                           data-cc-call-change="_docFieldToggle|j:${encodeURIComponent(String(index))}|c">
                </td>
            </tr>`;
        }

        html += `</tbody></table></details>`;
    }

    html += `<p style="font-size:10px;${muted}margin:4px 0 8px;">${linkCount} vincular, ${createCount} criar, ${ignoreCount} ignorar</p>`;
    html += `<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--neutral-200);padding-top:12px;">
        <button class="btn btn-secondary" data-cc-action="cc-68367b5e">Voltar</button>
        <button class="btn btn-primary" data-cc-action="cc-ae8ee8f5">Confirmar Importacao</button>
    </div>`;

    return html;
}

/** @param {any} opts */
export function renderMappingModal({
    documentRef = globalThis.document,
    state,
    existingElements = [],
    styles = {},
}: any) {
    const container = documentRef?.getElementById?.('ingestion-content');
    if (!container || !state?._mapping) return false;
    container.innerHTML = buildMappingModalHtml({
        mapping: state._mapping,
        extractedFields: state._extractedFields,
        existingElements,
        styles,
    });
    return true;
}

export function setDocMappingAction(state: any, wellId: any, action: any) {
    if (!state?._mapping) return false;
    const current = state._mapping.get(wellId);
    if (!current) return false;
    current.action = action;
    return true;
}

export function setDocMappingTarget(state: any, wellId: any, elementId: any) {
    if (!state?._mapping) return false;
    const current = state._mapping.get(wellId);
    if (!current) return false;
    current.elementId = elementId;
    return true;
}

export function setDocFieldToggle(state: any, index: any, checked: any) {
    if (!state?._extractedFields?.[index]) return false;
    state._extractedFields[index]._import = checked;
    return true;
}
