// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createModal } from '../ui/modal.js';
import { buildPreview } from './filePreview.js';
import { getCachedList, getDownloadUrl, list } from './fileManager.js';
import { listLocalGeneratedFiles } from './localGeneratedFiles.js';
import { ERROR_CODE } from './fileConstants.js';
import { listSampleFiles, isSampleFileId } from './sampleFiles.js';
let _state = {
    extension: '',
    source: '',
    scopeType: '',
    tag: '',
    sortBy: 'updated_at',
    sortOrder: 'desc',
    contextLabel: '',
    contextHint: '',
    contextPreviewFiles: [] as any[],
};
let _rendering = false;
let _localCachedList: any[] = [];
const _LIST_TIMEOUT_MS = 12000;
export async function renderFilesPanel() {
    if (_rendering) return;
    _rendering = true;
    try {
        const host = document.getElementById('files-content');
        if (!host) return;
        // Feedback imediato enquanto a query Supabase roda
        host.innerHTML = _loadingHtml();
        let remoteRows = [];
        let remoteError = '';
        let notAuthenticated = false;
        try {
            /** @type {{ ok?: boolean, data?: any[], code?: string, error?: any }} */
            const q = await Promise.race([
                list({
                    extension: _state.extension || undefined,
                    source: _state.source || undefined,
                    scopeType: _state.scopeType || undefined,
                    tag: _state.tag || undefined,
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Files list timeout')), _LIST_TIMEOUT_MS)),
            ]);
            if (q.ok) {
                remoteRows = q.data || [];
            } else if (q.code === ERROR_CODE.NOT_AUTHENTICATED) {
                notAuthenticated = true;
            } else {
                remoteError = q.error || 'Unknown error';
            }
        } catch (err: any) {
            console.error('[Files] render error:', err);
            remoteError = err?.message || 'Unknown error';
        }
        const localRes = await listLocalGeneratedFiles({
            extension: _state.extension || undefined,
            source: _state.source || undefined,
            scopeType: _state.scopeType || undefined,
            tag: _state.tag || undefined,
        });
        _localCachedList = localRes.ok ? localRes.data || [] : [];
        const sampleRes: any = listSampleFiles(({
            extension: _state.extension || undefined,
            source: _state.source || undefined,
            scopeType: _state.scopeType || undefined,
            tag: _state.tag || undefined,
        }) as any);
        const sampleRows = sampleRes.ok
            ? (sampleRes.data || []).map((r: any) => ({
                  ...r,
                  filename: _localizeSampleName(r),
              }))
            : [];
        const mergedRows = _sortRows(
            [...sampleRows, ...remoteRows, ..._localCachedList],
            _state.sortBy,
            _state.sortOrder,
        );
        if (!mergedRows.length && notAuthenticated && !_state.contextPreviewFiles.length) {
            host.innerHTML = _loginRequired();
            return;
        }
        host.innerHTML = _panelHtml(mergedRows, remoteError, { notAuthenticated });
    } finally {
        _rendering = false;
    }
}
/**
 * @param {string} key
 * @param {any} value
 */
export function updateFilesFilter(key: any, value: any) {
    _state = { ..._state, [key]: String(value || '') };
}
export function resetFilesFilter() {
    _state = {
        extension: '',
        source: '',
        scopeType: '',
        tag: '',
        sortBy: 'updated_at',
        sortOrder: 'desc',
        contextLabel: '',
        contextHint: '',
        contextPreviewFiles: [],
    };
}
/** @param {any[]} files */
export function setFilesContextPreviewFiles(files: any[] = []) {
    _state = {
        ..._state,
        contextPreviewFiles: Array.isArray(files) ? files.filter((file: any) => file && typeof file === 'object').slice(0, 240) : [],
    };
}
/** @param {any} file */
export async function openInlinePreview(file: any) {
    const ext = String(file?.extension || '').toLowerCase();
    if (ext === 'dxf') {
        showToast('DXF preview not available yet.', 'info');
        return;
    }
    let response = await fetch(file?.signedUrl || '');
    // Signed URL pode ter expirado (1h) - tentar renovar antes de falhar
    if ((response.status === 401 || response.status === 403) && file?.id) {
        const renewed = await getDownloadUrl(file.id);
        if (renewed.ok) response = await fetch(renewed.data.url);
    }
    if (!response.ok) {
        showToast(`Preview failed (HTTP ${response.status})`, 'error');
        return;
    }
    const blob = await response.blob();
    const localFile = new File([blob], file.filename || 'file', { type: file.mime_type || blob.type });
    const preview = await buildPreview(localFile, ext);
    if (!(preview as any).ok) {
        showToast((preview as any).error || 'Preview unavailable', 'error');
        return;
    }
    const previewData: any = (preview as any).data;
    if (previewData.type === 'message') {
        showToast(previewData.message, 'info');
        return;
    }
    // Renderizar preview tabular no painel em vez de usar alert()
    _renderPreviewModal(file.filename || 'Preview', previewData);
}
/** @param {any[]} rows @param {string} [errorMessage] @param {{notAuthenticated?: boolean}} [options] */
function _panelHtml(rows: any, errorMessage: any = "", options: any = {}) {
    return `
        <div class="section">
            <div class="section-header"><span>${t('filesTab') || 'Files'}</span><span class="chevron">▼</span></div>
            <div class="section-content">
                ${_warningHtml()}
                ${_contextBannerHtml()}
                ${options.notAuthenticated ? _contextAuthHintHtml() : ''}
                ${_contextPreviewFilesHtml()}
                ${errorMessage ? _error(errorMessage) : ''}
                ${_toolbarHtml(rows.length)}
                ${rows.length ? _tableHtml(rows) : _empty()}
            </div>
        </div>
    `;
}
function _contextBannerHtml() {
    const label = String((_state as any).contextLabel || '').trim();
    const hint = String((_state as any).contextHint || '').trim();
    if (!label) return '';
    return `<div style="border:1px solid rgba(73,155,234,0.45);background:rgba(25,78,130,0.18);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:var(--text-primary,#e8eef8);">
        <strong>${_esc(label)}</strong>${hint ? `<span style="display:block;color:var(--text-secondary,#aeb8ca);font-size:11px;margin-top:2px;">${_esc(hint)}</span>` : ''}
    </div>`;
}
function _contextAuthHintHtml() {
    return `<div style="border:1px solid rgba(245,158,11,0.36);background:rgba(120,53,15,0.18);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:var(--text-primary,#e8eef8);">
        <strong>Lista autenticada indisponivel</strong>
        <span style="display:block;color:var(--text-secondary,#aeb8ca);font-size:11px;margin-top:2px;">Mostrei abaixo a pre-visualizacao da chave ECBT. Entre no Supabase/Files para confirmar a lista viva.</span>
    </div>`;
}
function _contextPreviewFilesHtml() {
    const files = Array.isArray(_state.contextPreviewFiles) ? _state.contextPreviewFiles : [];
    if (!files.length) return '';
    const shown = files.slice(0, 80);
    const rows = shown
        .map((file: any) => {
            const name = file.filename || file.title || file.name || file.id || 'Arquivo da aula';
            const ext = file.extension || _extFromName(name) || '';
            const role = file.role || file.type || 'apoio';
            const source = file.source || 'chave ECBT';
            const path = file.path || file.storagePath || file.url || file.fileId || '';
            return `<tr>
                <td>${_esc(name)}</td>
                <td>${_esc(String(ext).toUpperCase())}</td>
                <td>${_esc(role)}</td>
                <td>${_esc(source)}</td>
                <td>${_esc(path)}</td>
            </tr>`;
        })
        .join('');
    return `
        <div style="border:1px solid rgba(34,197,94,0.32);background:rgba(6,78,59,0.16);border-radius:6px;padding:10px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <div>
                    <strong style="font-size:12px;color:var(--text-primary,#e8eef8);">Pacote da aula vindo da chave ECBT</strong>
                    <span style="display:block;font-size:11px;color:var(--text-secondary,#aeb8ca);">${files.length} arquivo(s) referenciado(s). A lista abaixo e uma pre-visualizacao; a tabela principal continua mostrando o Files vivo quando autenticado.</span>
                </div>
                <span style="font-size:11px;color:#6ee7b7;font-weight:700;">${shown.length}/${files.length}</span>
            </div>
            <div style="overflow:auto;max-height:220px;">
                <table class="table" style="width:100%;font-size:11px;">
                    <thead><tr><th>Nome</th><th>Ext</th><th>Papel</th><th>Origem</th><th>Caminho</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}
/** @param {number} total */
function _toolbarHtml(total: any) {
    const extensions = _unique('extension');
    const sources = _unique('source');
    const scopes = _unique('scope_type');
    return `
        <div style="display:grid;grid-template-columns:repeat(3,minmax(80px,1fr));gap:8px;margin-bottom:8px;">
            ${_select('ext', 'extension', extensions, _state.extension)}
            ${_select('source', 'source', sources, _state.source)}
            ${_select('scope', 'scopeType', scopes, _state.scopeType)}
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:10px;">
            <input data-field-meta="true" data-field-meta-key="auto-pos:filePanel:input:L147" type="text" value="${_esc(_state.tag)}" placeholder="tag"
                   data-cc-input="cc-e52b9a32" class="form-input" />
            ${_sortSelect()}
            <button type="button" class="btn btn-secondary" data-cc-action="cc-8ae35881">${t('clear') || 'Clear'}</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
            <input type="file" id="files-import-wizard-input" style="display:none" accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.shp,.zip" data-cc-change="cc-cefddab2" />
            <button type="button" class="btn btn-primary" data-cc-action="cc-9ac99f0b">${t('importData') || 'Importar Dados'}</button>
            <input type="file" id="files-upload-input" style="display:none" data-cc-change="cc-26ae344e" />
            <button type="button" class="btn btn-secondary" data-cc-action="cc-2f4ad463">${t('uploadFile') || 'Upload'}</button>
            <button type="button" class="btn btn-secondary" data-cc-action="cc-36aa9f3f">PhotoLog</button>
            <button type="button" class="btn btn-secondary" data-cc-action="cc-d60fddba">Baixar curvas (GeoJSON)</button>
            <button type="button" class="btn btn-secondary" data-cc-action="cc-9f989a35">Salvar curvas (GeoJSON)</button>
            <span style="font-size:11px;color:var(--neutral-500);">${total} file(s)</span>
        </div>
        <div id="files-drop-zone" data-cc-call-dragover="handleFilesDragOver|e" data-cc-call-drop="handleFilesDrop|e"
             style="border:1px dashed var(--neutral-300);border-radius:6px;padding:8px;font-size:11px;color:var(--neutral-500);margin-bottom:10px;">
             ${t('filesDropZone') || 'Drag and drop to register without ingestion'}
        </div>
    `;
}
/** @param {any[]} rows */
function _tableHtml(rows: any) {
    const trs = rows
        .map(
            (f: any) => `
        <tr>
            <td>${_esc(f.filename || '')}</td>
            <td>${_esc((f.extension || '').toUpperCase())}</td>
            <td>${_fmtSize(f.size_bytes)}</td>
            <td>${_esc(f.source || '')}</td>
            <td>${_esc((f.tags || []).join(', '))}</td>
            <td>${_fmtDate(f.updated_at || f.created_at)}</td>
            <td>${isSampleFileId(f.id) ? _sampleActions(f) : _actions(f.id)}</td>
        </tr>
    `,
        )
        .join('');
    return `
        <div style="overflow:auto;max-height:380px;">
            <table class="table" style="width:100%;font-size:11px;">
                <thead><tr><th>${t('filesColName') || 'Name'}</th><th>${t('filesColExt') || 'Ext'}</th><th>${t('filesColSize') || 'Size'}</th><th>${t('filesColSource') || 'Source'}</th><th>${t('filesColTags') || 'Tags'}</th><th>${t('filesColUpdated') || 'Updated'}</th><th>${t('filesColActions') || 'Actions'}</th></tr></thead>
                <tbody>${trs}</tbody>
            </table>
        </div>
    `;
}
/** @param {any} id */
function _actions(id: any) {
    return `
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesPreview|s:${encodeURIComponent(`${id}`)}">${t('filesBtnPreview') || 'Preview'}</button>
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesDownload|s:${encodeURIComponent(`${id}`)}">${t('filesBtnDownload') || 'Download'}</button>
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesReimport|s:${encodeURIComponent(`${id}`)}">${t('filesBtnReimport') || 'Re-import'}</button>
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesEditTags|s:${encodeURIComponent(`${id}`)}">${t('filesBtnTag') || 'Tag'}</button>
            <button class="btn btn-xs btn-danger" data-cc-call-click="handleFilesDelete|s:${encodeURIComponent(`${id}`)}">${t('filesBtnDelete') || 'Delete'}</button>
        </div>
    `;
}
/** @param {any} f */
function _sampleActions(f: any) {
    const id = f.id;
    const consumers = Array.isArray(f.consumers) ? f.consumers : [];
    const useOptions = consumers
        .map((c: any) => `<option value="${_esc(c)}">${_esc(t('sample.consumer.' + c) || c)}</option>`)
        .join('');
    const useLabel = t('sample.useAs') || 'Use in…';
    return `
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesPreviewSample|s:${encodeURIComponent(`${id}`)}">${t('filesBtnPreview') || 'Preview'}</button>
            <button class="btn btn-xs btn-secondary" data-cc-call-click="handleFilesDownloadSample|s:${encodeURIComponent(`${id}`)}">${t('filesBtnDownload') || 'Download'}</button>
            <select data-field-meta="true" data-field-meta-key="auto-pos:filePanel:sampleUse:${_esc(id)}" class="form-input" style="max-width:140px;font-size:11px;"
                data-cc-call-change="handleUseSampleFileAs|s:${encodeURIComponent(`${id}`)}|v" data-cc-vreset="1">
                <option value="">${_esc(useLabel)}</option>
                ${useOptions}
            </select>
        </div>
    `;
}
/** @param {any} row */
function _localizeSampleName(row: any) {
    if (!row || !row.displayNameKey) return row?.filename || '';
    const localized = t(row.displayNameKey);
    return localized && localized !== row.displayNameKey ? localized : row.filename;
}
function _sortSelect() {
    const selected = `${_state.sortBy}:${_state.sortOrder}`;
    return `
        <select data-field-meta="true" data-field-meta-key="auto-pos:filePanel:select:L210" class="form-input" data-cc-change="cc-6e152ebc">
            <option value="updated_at:desc" ${selected === 'updated_at:desc' ? 'selected' : ''}>Date ↓</option>
            <option value="updated_at:asc" ${selected === 'updated_at:asc' ? 'selected' : ''}>Date ↑</option>
            <option value="filename:asc" ${selected === 'filename:asc' ? 'selected' : ''}>Name A-Z</option>
            <option value="filename:desc" ${selected === 'filename:desc' ? 'selected' : ''}>Name Z-A</option>
            <option value="size_bytes:desc" ${selected === 'size_bytes:desc' ? 'selected' : ''}>Size ↓</option>
            <option value="size_bytes:asc" ${selected === 'size_bytes:asc' ? 'selected' : ''}>Size ↑</option>
        </select>
    `;
}
/** @param {any} label @param {any} key @param {any[]} options @param {any} selected */
function _select(label: any, key: any, options: any, selected: any) {
    const values = options
        .map(
            (v: any) =>
                `<option value="${_esc(v)}" ${selected === v ? 'selected' : ''}>${_esc(v)}</option>`,
        )
        .join('');
    return `
        <label style="font-size:10px;color:var(--neutral-500);">
            ${label}
            <select data-field-meta="true" data-field-meta-key="auto-pos:filePanel:select:L228" class="form-input" data-cc-call-change="handleFilesFilter|s:${encodeURIComponent(`${key}`)}|v">
                <option value="">all</option>
                ${values}
            </select>
        </label>
    `;
}
/** @param {any} key */
function _unique(key: any) {
    const values = [...getCachedList(), ..._localCachedList].map((f: any) => String(f?.[key] || '').trim()).filter(Boolean);
    return [...new Set(values)].sort((a: any, b: any) => a.localeCompare(b));
}
function _warningHtml() {
    try {
        const raw = localStorage.getItem('ecbyts-files-reconcile-warning') || '';
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        return `<div style="background:var(--warning-50);border:1px solid var(--warning-300);padding:8px;border-radius:6px;margin-bottom:8px;font-size:11px;">
            Reconciliation needed: ${_esc(parsed.code || 'files/register_failed')} (${_esc(parsed.at || '')})
            <button type="button" class="btn btn-xs btn-secondary" style="margin-left:8px;" data-cc-action="cc-78019b29">dismiss</button>
        </div>`;
    } catch (_: any) {
        return '';
    }
}
/** @param {any} title @param {any} data */
function _renderPreviewModal(title: any, data: any) {
    const existing = document.getElementById('files-preview-modal');
    if (existing) existing.remove();
    const header = (data.headers || [])
        .map(
            (h: any) =>
                `<th style="padding:4px 8px;border-bottom:1px solid var(--neutral-300);white-space:nowrap;">${_esc(String(h))}</th>`,
        )
        .join('');
    const rows = (data.rows || [])
        .slice(0, 50)
        .map(
            (r: any) =>
                `<tr>${r.map((c: any) => `<td style="padding:3px 8px;font-size:11px;">${_esc(String(c ?? ''))}</td>`).join('')}</tr>`,
        )
        .join('');
    // POC: refactored para createModal canonical (Wave A.4 — claude-otimizacao 2026-05-20)
    // Antes: 22L de modal inline + style.cssText + onclick close manual + listener cleanup manual
    // Depois: 10L body content + createModal handles overlay/dialog/header/close/AbortController
    const bodyEl = document.createElement('div');
    bodyEl.style.overflow = 'auto';
    bodyEl.innerHTML = `
        <table style="border-collapse:collapse;font-size:11px;width:100%;">
            <thead><tr style="background:var(--neutral-100,#f5f5f5);">${header}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${data.rows?.length > 50 ? `<p style="font-size:10px;color:var(--neutral-500);margin-top:8px;">Showing 50 of ${data.rows.length} rows.</p>` : ''}
    `;
    createModal({
        size: 'xl',
        title,
        body: bodyEl,
        extraClass: 'files-preview-dialog',
    });
}
function _loadingHtml() {
    return `
        <div class="section">
            <div class="section-header"><span>${t('filesTab') || 'Files'}</span><span class="chevron">&#9660;</span></div>
            <div class="section-content">
                <div style="padding:24px;text-align:center;">
                    <p style="font-size:12px;color:var(--neutral-500);">${t('filesLoading') || 'Loading files...'}</p>
                </div>
            </div>
        </div>`;
}
function _loginRequired() {
    return `
        <div class="section">
            <div class="section-header"><span>${t('filesTab') || 'Files'}</span><span class="chevron">&#9660;</span></div>
            <div class="section-content">
                <div style="padding:24px;text-align:center;">
                    <p style="font-size:13px;color:var(--neutral-500);margin-bottom:12px;">
                        ${t('filesLoginRequired') || 'Sign in to access your files.'}
                    </p>
                    <button type="button" class="btn btn-primary" data-cc-action="cc-3a51fb8c">
                        ${t('filesLoginBtn') || 'Sign In'}
                    </button>
                </div>
            </div>
        </div>`;
}
function _empty() {
    return `<p style="font-size:11px;color:var(--neutral-500);">${t('filesEmpty') || 'No files registered yet.'}</p>`;
}
/** @param {any} message */
function _error(message: any) {
    return `<p style="font-size:11px;color:var(--error-600);">Files load failed: ${_esc(String(message || 'Unknown error'))}</p>`;
}
/** @param {any[]} rows @param {any} sortBy @param {any} order */
function _sortRows(rows: any, sortBy: any, order: any) {
    const dir = order === 'asc' ? 1 : -1;
    return [...rows].sort((a: any, b: any) => {
        if (sortBy === 'size_bytes') return ((a.size_bytes || 0) - (b.size_bytes || 0)) * dir;
        if (sortBy === 'filename') return String(a.filename || '').localeCompare(String(b.filename || '')) * dir;
        return String(a.updated_at || '').localeCompare(String(b.updated_at || '')) * dir;
    });
}
/** @param {any} bytes */
function _fmtSize(bytes: any) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/** @param {any} value */
function _fmtDate(value: any) {
    if (!value) return '-';
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleString();
}
/** @param {any} value */
function _extFromName(value: any) {
    const match = String(value || '').match(/\.([a-z0-9]{1,8})(?:$|[?#])/i);
    return match?.[1] ? match[1].toLowerCase() : '';
}
/** @param {any} v */
function _esc(v: any) {
    return String(v || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
