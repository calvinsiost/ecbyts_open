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

function resolveStyles(styles: any = {}) {
    const _s = styles as any;
    return {
        muted: _s.muted || DEFAULT_STYLES.muted,
        tableHeader: _s.tableHeader || DEFAULT_STYLES.tableHeader,
        tableRow: _s.tableRow || DEFAULT_STYLES.tableRow,
    };
}

function normalizeVisualAction(value: any) {
    return value === true || value === 'true' || value === 1;
}

function resolveSelectedFamily(families: any, action: any, item: any) {
    if (Array.isArray(families) && families.includes(action?.targetFamily)) return action.targetFamily;
    if (Array.isArray(families) && families.includes(item?.suggestedFamily)) return item.suggestedFamily;
    return 'generic';
}

export function buildDocVisualWizardHtml(args: any) {
    const {
        state,
        decisions,
        assets = [],
        families = [],
        getAssetLabel,
        styles = {},
    } = args as any;
    const { muted, tableHeader, tableRow } = resolveStyles(styles);
    const summary = state?._importSummary || {};
    let selectedActions = 0;
    for (const item of Array.isArray(assets) ? assets : []) {
        const action = decisions?.visualActions?.[item.assetKey] || {};
        if (action.createAsset || action.download) selectedActions++;
    }

    let html = `
        <div style="margin-bottom:12px;">
            <h3 style="margin:0 0 4px;font-size:14px;color:var(--neutral-800);">Wizard Visual Pos-Import</h3>
            <p style="font-size:11px;${muted}margin:0;">
                Importacao principal concluida: ${summary.totalReadings || 0} leitura(s), ${summary.elementsLinked || 0} vinculo(s), ${summary.elementsCreated || 0} elemento(s) criado(s).
            </p>
        </div>
    `;

    html += `<div style="max-height:320px;overflow-y:auto;border:1px solid var(--neutral-200);border-radius:6px;margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="${tableHeader}">
                <th style="padding:6px;text-align:left;">Asset</th>
                <th style="padding:6px;text-align:center;width:70px;">Criar</th>
                <th style="padding:6px;text-align:center;width:80px;">Download</th>
                <th style="padding:6px;text-align:left;width:120px;">Familia</th>
            </tr></thead><tbody>`;

    for (const item of Array.isArray(assets) ? assets : []) {
        const action = decisions?.visualActions?.[item.assetKey] || {};
        const createChecked = action.createAsset === true;
        const downloadChecked = action.download === true;
        const selectedFamily = resolveSelectedFamily(families, action, item);
        const assetLabel = `${getAssetLabel(item.assetType)}${item.page ? ` p.${item.page}` : ''}`;
        const thumb = item.asset?.blobUrl
            ? `<img src="${item.asset.blobUrl}" alt="${escapeHtml(assetLabel)}" style="width:42px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--neutral-200);margin-right:6px;">`
            : `<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:32px;border:1px dashed var(--neutral-300);border-radius:4px;margin-right:6px;font-size:9px;${muted}">N/A</span>`;

        html += `<tr style="${tableRow}">
            <td style="padding:4px 6px;color:var(--neutral-800);">
                <div style="display:flex;align-items:center;">
                    ${thumb}
                    <div>
                        <strong>${escapeHtml(assetLabel)}</strong>
                        <div style="font-size:9px;${muted}">${escapeHtml(item.classification?.method || 'heuristic')}</div>
                    </div>
                </div>
            </td>
            <td style="padding:4px 6px;text-align:center;">
                <input data-field-meta="true" data-field-meta-key="auto:ingestion:doc-visual-create" type="checkbox" ${createChecked ? 'checked' : ''}
                       data-cc-call-change="_docVisualActionSet|s:${encodeURIComponent(`${escapeHtml(item.assetKey)}`)}|s:createAsset|c">
            </td>
            <td style="padding:4px 6px;text-align:center;">
                <input data-field-meta="true" data-field-meta-key="auto:ingestion:doc-visual-download" type="checkbox" ${downloadChecked ? 'checked' : ''}
                       data-cc-call-change="_docVisualActionSet|s:${encodeURIComponent(`${escapeHtml(item.assetKey)}`)}|s:download|c">
            </td>
            <td style="padding:4px 6px;">
                <select data-field-meta="true" data-field-meta-key="auto:ingestion:doc-visual-family" style="font-size:10px;padding:2px 4px;border:1px solid var(--neutral-200);border-radius:4px;background:var(--neutral-50);color:var(--neutral-800);"
                        data-cc-call-change="_docVisualActionFamily|s:${encodeURIComponent(`${escapeHtml(item.assetKey)}`)}|v">
                    ${families.map((family: any) => `<option value="${family}" ${selectedFamily === family ? 'selected' : ''}>${escapeHtml(family)}</option>`).join('')}
                </select>
            </td>
        </tr>`;
    }

    html += `</tbody></table></div>`;
    html += `<p style="font-size:10px;${muted}margin:4px 0 8px;">${selectedActions} item(ns) com acao selecionada.</p>`;
    html += `<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--neutral-200);padding-top:12px;">
        <button class="btn btn-secondary" data-cc-action="cc-b25dc334">Concluir</button>
        <button class="btn btn-primary" data-cc-action="cc-1a0cd902" ${selectedActions === 0 ? 'disabled' : ''}>Aplicar Acoes</button>
    </div>`;

    return html;
}

export function renderDocVisualWizard(args: any) {
    const {
        documentRef = globalThis.document,
        state,
        decisions,
        assets = [],
        families = [],
        getAssetLabel,
        styles = {},
    } = args as any;
    const container = documentRef?.getElementById?.('ingestion-content');
    if (!container) return false;
    container.innerHTML = buildDocVisualWizardHtml({
        state,
        decisions,
        assets,
        families,
        getAssetLabel,
        styles,
    });
    return true;
}

export function setDocVisualAction(
    state: any,
    assetKey: any,
    field: any,
    value: any,
    ensureDecisions: any,
) {
    if (!state || !assetKey) return false;
    const decisions = ensureDecisions(state);
    if (!decisions.visualActions || typeof decisions.visualActions !== 'object') {
        decisions.visualActions = {};
    }
    const current = { ...(decisions.visualActions[assetKey] || {}) };
    current[field] = normalizeVisualAction(value);
    if (!current.targetFamily) current.targetFamily = 'generic';
    decisions.visualActions[assetKey] = current;
    state._decisions = decisions;
    return true;
}

export function setDocVisualActionFamily(
    state: any,
    assetKey: any,
    family: any,
    ensureDecisions: any,
    families: any[] = [],
) {
    if (!state || !assetKey) return false;
    const decisions = ensureDecisions(state);
    if (!decisions.visualActions || typeof decisions.visualActions !== 'object') {
        decisions.visualActions = {};
    }
    const current = { ...(decisions.visualActions[assetKey] || {}) };
    current.targetFamily = Array.isArray(families) && families.includes(family) ? family : 'generic';
    decisions.visualActions[assetKey] = current;
    state._decisions = decisions;
    return true;
}

export function applyDocVisualActions(args: any) {
    const {
        state,
        ensureDecisions,
        families = [],
        getScatterPosition,
        addElement,
        getAssetLabel,
        downloadAsset,
        showToast,
        logger,
        nowFn = () => Date.now(),
    } = args as any;
    if (!state) return { created: 0, downloaded: 0, failures: 0, selectedActions: 0 };
    const decisions = ensureDecisions(state);
    const assets = Array.isArray(state._postImportVisualAssets) ? state._postImportVisualAssets : [];
    if (!assets.length) return { created: 0, downloaded: 0, failures: 0, selectedActions: 0 };

    let created = 0;
    let downloaded = 0;
    let failures = 0;
    let selectedActions = 0;
    let scatterIndex = 0;
    const ts = nowFn();

    for (const item of assets) {
        const action = decisions.visualActions?.[item.assetKey] || {};
        if (!action.createAsset && !action.download) continue;
        selectedActions++;

        if (action.createAsset) {
            try {
                const family = resolveSelectedFamily(families, action, item);
                const pos = getScatterPosition(scatterIndex++, Math.max(assets.length, 1));
                const id = `doc-visual-${family}-${ts}-${created}`;
                const label = `${getAssetLabel(item.assetType)}${item.page ? ` p.${item.page}` : ''}`;
                const data: any = {
                    x: pos.x,
                    y: 0,
                    z: pos.z,
                    source: 'document_ingestion',
                    assetType: item.assetType,
                    page: item.page || null,
                    ingestionFile: state.fileName || null,
                    previewUrl: item.asset?.blobUrl || item.asset?.dataUrl || null,
                    classification: item.classification || null,
                };

                if (family === 'plume') {
                    data.depth = { level: 'shallow', top: 0, bottom: -5 };
                    data.shape = { radiusX: 6, radiusY: 4, radiusZ: 2 };
                    data.center = { x: pos.x, y: -2, z: pos.z };
                }

                addElement(family, id, label, data);
                created++;
            } catch (err) {
                failures++;
                logger?.warn?.('Visual element creation failed', (err as any)?.message || err);
            }
        }

        if (action.download) {
            const ok = downloadAsset(item);
            if (ok) downloaded++;
            else failures++;
        }
    }

    const parts = [];
    if (created > 0) parts.push(`${created} ativo(s) visual(is)`);
    if (downloaded > 0) parts.push(`${downloaded} download(s)`);
    if (failures > 0) parts.push(`${failures} falha(s)`);
    if (parts.length > 0) {
        showToast(`Wizard visual concluido: ${parts.join(', ')}`, failures > 0 ? 'warning' : 'success');
    }

    return { created, downloaded, failures, selectedActions };
}
