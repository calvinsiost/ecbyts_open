// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
import { activateTabById } from '../ui/tabs.js';
import { showToast, showLoadingToast } from '../ui/toast.js';
import { asyncConfirm, asyncPrompt } from '../ui/asyncDialogs.js';
import { ERROR_CODE, getFileRegisterMode } from '../files/fileConstants.js';
import { openInlinePreview, renderFilesPanel, resetFilesFilter, setFilesContextPreviewFiles, updateFilesFilter } from '../files/filePanel.js';
import { get, getContent, getDownloadUrl, register, registerFromIngestion, softDelete, updateTags, } from '../files/fileManager.js';
import { deleteLocalGeneratedFile, getLocalGeneratedFile, isLocalGeneratedFileId, updateLocalGeneratedFileTags, } from '../files/localGeneratedFiles.js';
import { getSampleFile, getSampleFileAsBlob, getSampleFileAsFile } from '../files/sampleFiles.js';
import { handleIngestionDirectFile, handleOpenIngestionModal } from './ingestion.js';
import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import { openFileDropIntentDialog } from '../ui/fileDropIntentDialog.js';
import { formatBytes } from '../helpers/formatBytes.js';
import { validateDropFile } from '../ui/_fileDropIntentPure.js';
import { buildContoursFromGrid } from '../../core/interpolation/contours.js';
import { getAllLayers, recomputeLayer } from '../../core/interpolation/manager.js';
import { getOrigin, getEPSG, relativeToWGS84 } from '../../core/io/geo/coordinates.js';
import { getAllElements } from '../../core/elements/manager.js';
import { normalizeFilesOpenContext } from '../../core/files/filesOpenContextPure.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Files');
/** @typedef {Record<string, any>} AnyRecord */
/** @param {unknown} err @returns {string} */
function _errorMessage( err: any) {
    return (err)?.message || String(err);
}
let _requestUIRefresh: any = null;
const CONTOUR_EXPORT_TYPES = new Set(['water_table', 'terrain', 'contamination']);
let _lastFilesOpenContext: any = null;
/** @param {any} fn */
export function setFilesUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function requestFilesUIRefresh(reason = 'files.changed', extraDomains: any[] = []) {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.FILES,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.STATUS,
        ...extraDomains,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
export function getLastFilesOpenContext() {
    return _lastFilesOpenContext;
}
export async function handleOpenFiles(input?: any) {
    const context = normalizeFilesOpenContext(input);
    _lastFilesOpenContext = context.hasContext ? context : null;
    if (context.hasContext) {
        resetFilesFilter();
        for (const [key, value] of Object.entries(context.filter)) {
            updateFilesFilter(key, value);
        }
        if (context.contextLabel) updateFilesFilter('contextLabel', context.contextLabel);
        if (context.contextHint) updateFilesFilter('contextHint', context.contextHint);
        setFilesContextPreviewFiles([...(context.previewFiles || [])]);
    }
    activateTabById('files');
    await renderFilesPanel();
    if (context.contextLabel) {
        showToast(`${context.contextLabel}: ${context.contextHint || 'materiais filtrados.'}`, 'info');
    }
    requestFilesUIRefresh(context.hasContext ? 'files.opened.contextual' : 'files.opened');
}
/** @param {any} input */
export async function handleFilesUploadInput( input: any) {
    const file = input?.files?.[0];
    if (!file)
        return;
    // SPEC_TOAST_AUTO_DISMISS_AUDIT 2026-05-14: loading handle substitui o toast info no final
    const handle = showLoadingToast(`Uploading ${file.name}...`);
    const res = await register(file, { source: 'manual' });
    if (res?.ok) {
        handle.success('Arquivo registrado.');
    }
    else {
        const errMsg = res?.error || 'Falha no upload';
        handle.error(errMsg);
    }
    if (input)
        input.value = '';
    await _refresh();
}
/** @param {any} event */
export function handleFilesDragOver( event: any) {
    event.preventDefault();
}
/** @param {any} event */
export async function handleFilesDrop( event: any) {
    event.preventDefault();
    const files = [...(event?.dataTransfer?.files || [])];
    if (!files.length)
        return;
    // FILE-DROP-INTENT-001 M3: drop pergunta intenção em vez de registrar
    // direto. Flag false = rollback hatch para o registro direto legado.
    if ((CONFIG as any)?.FEATURES?.FILE_DROP_INTENT) {
        await processFileDropIntent(files, { origin: 'files-panel' });
        return;
    }
    // SPEC_TOAST_AUTO_DISMISS_AUDIT 2026-05-14: loading handle para upload batch
    const handle = showLoadingToast(`Uploading ${files.length} file(s)...`);
    let failures = 0;
    let processed = 0;
    for (const file of files) {
        const res = await register(file, { source: 'manual' });
        if (!res.ok)
            failures++;
        processed++;
        if (files.length > 1)
            handle.updateMessage(`Uploading ${processed}/${files.length}...`);
    }
    if (failures) {
        handle.error(`${failures} upload(s) failed`);
    }
    else {
        handle.success(`${files.length} file(s) registered`);
    }
    await _refresh();
}
/**
 * FILE-DROP-INTENT-001 — valida (M5), pergunta intenção (M1) e executa os
 * efeitos escolhidos: Files primeiro, wizard depois (critério de sucesso #4).
 * Cancelar = zero efeito colateral. `origin: 'ecby'` ativa o follow-up S2.
 * @param {File[]} files
 * @param {{origin?: 'app'|'ecby'|'files-panel'}} opts
 */
export async function processFileDropIntent( files: File[], opts: { origin?: string } = {}) {
    const file = files?.[0];
    if (!(file instanceof File))
        return;
    // M5 — recusa com motivo, sem dialog.
    const verdict = validateDropFile({ name: file.name, size: file.size });
    if (!verdict.ok) {
        const msg = verdict.reason === 'too_large'
            ? t('fdi.rejectedSize', { size: formatBytes(file.size) })
            : t('fdi.rejectedType', { ext: verdict.ext || '?' });
        showToast(msg, 'warning');
        return;
    }
    const choice = await openFileDropIntentDialog(files, { wizardSupported: verdict.wizardSupported });
    if (!choice || (!choice.addToFiles && !choice.openWizard))
        return;
    if (choice.addToFiles) {
        const handle = showLoadingToast(`Uploading ${file.name}...`);
        const res = await register(file, { source: 'manual' });
        if (res?.ok)
            handle.success(t('fdi.addedToFiles'));
        else
            handle.error(res?.error || 'Falha no upload');
        await _refresh();
    }
    if (choice.openWizard) {
        handleOpenIngestionModal();
        await handleIngestionDirectFile(file);
        return;
    }
    // S2 — drop no painel ecby sem wizard: bot oferece o próximo passo.
    if (opts.origin === 'ecby' && choice.addToFiles) {
        try {
            const llm: any = await import('./llmChat.js');
            llm.addMessage?.(t('fdi.ecbyFollowUp', { name: file.name }), 'assistant');
        } catch (e: any) {
            console.debug('[files:dropIntent] S2 follow-up skip', e?.message || e);
        }
    }
}
/**
 * FILE-DROP-INTENT-001 M4 — dropzone global: tela do app + painel do ecby
 * (#llm-chat-panel) num único par de listeners document-level.
 * Guardas: só DataTransfer com 'Files'; drops já tratados por dropzones
 * específicos (defaultPrevented, ex.: #files-drop-zone, raster modal,
 * survey import) são ignorados. Highlight `.fdi-drop-hover` no painel ecby.
 * Flag OFF = no-op (zero listener, comportamento legado).
 * @returns {() => void} cleanup
 */
export function installFileDropIntent() {
    if (!(CONFIG as any)?.FEATURES?.FILE_DROP_INTENT)
        return () => { };
    if (typeof document === 'undefined')
        return () => { };
    const controller = new AbortController();
    const { signal } = controller;
    /** @param {DragEvent} id */
    const hasFiles = (e: any) => {
        const types = e?.dataTransfer?.types;
        return !!types && Array.prototype.includes.call(types, 'Files');
    };
    const ecbyPanel = () => document.getElementById('llm-chat-panel');
    document.addEventListener('dragover', (e: any) => {
        if (!hasFiles(e))
            return;
        // Permite o drop em toda a tela + impede o browser de abrir o arquivo.
        e.preventDefault();
        const overEcby = !!e.target?.closest?.('#llm-chat-panel');
        ecbyPanel()?.classList.toggle('fdi-drop-hover', overEcby);
    }, { signal });
    document.addEventListener('dragleave', (e: any) => {
        // Saiu da janela (relatedTarget null) → limpa o highlight.
        if (!e.relatedTarget)
            ecbyPanel()?.classList.remove('fdi-drop-hover');
    }, { signal });
    document.addEventListener('drop', (e: any) => {
        ecbyPanel()?.classList.remove('fdi-drop-hover');
        if (!hasFiles(e))
            return;
        // Dropzone específico já tratou (preventDefault na fase bubble interna).
        if (e.defaultPrevented)
            return;
        e.preventDefault();
        const files = [...(e.dataTransfer?.files || [])];
        if (!files.length)
            return;
        const origin = e.target?.closest?.('#llm-chat-panel') ? 'ecby' : 'app';
        void processFileDropIntent(files, { origin });
    }, { signal });
    return () => controller.abort();
}
/** @param {any} id */
export async function handleFilesDelete( id: any) {
    const yes = await asyncConfirm('Soft delete this file?');
    if (!yes)
        return;
    if (isLocalGeneratedFileId(id)) {
        const localRes = await deleteLocalGeneratedFile(id);
        _showResult(localRes);
        await _refresh();
        return;
    }
    const res = await softDelete(id);
    _showResult(res);
    await _refresh();
}
/** @param {any} id */
export async function handleFilesDownload( id: any) {
    if (isLocalGeneratedFileId(id)) {
        const local: any = await getLocalGeneratedFile(id);
        if (!local.ok || !local.data?.blob) {
            showToast(local.error || 'Download local falhou', 'error');
            return;
        }
        _downloadBlob(local.data.blob, local.data.filename || 'video.mp4');
        showToast('Arquivo local baixado.', 'success');
        return;
    }
    const signed: any = await getDownloadUrl(id, { expiresIn: 3600 });
    if (!signed.ok) {
        showToast(signed.error || 'Download failed', 'error');
        return;
    }
    window.open(signed.data.url, '_blank', 'noopener');
}
/** @param {any} id */
export async function handleFilesPreview( id: any) {
    if (isLocalGeneratedFileId(id)) {
        showToast('Preview unavailable for local video.', 'info');
        return;
    }
    const file = await get(id);
    if (!file.ok) {
        showToast(file.error || 'Preview unavailable', 'error');
        return;
    }
    await openInlinePreview(file.data);
}
/** @param {any} id */
export async function handleFilesEditTags( id: any) {
    if (isLocalGeneratedFileId(id)) {
        const localCurrent: any = await getLocalGeneratedFile(id);
        if (!localCurrent.ok) {
            showToast(localCurrent.error || 'Tag edit failed', 'error');
            return;
        }
        const rawLocal = await asyncPrompt('Comma separated tags', (localCurrent.data.tags || []).join(', '));
        if (rawLocal == null)
            return;
        const localTags = rawLocal
            .split(',')
            .map((x: any) => x.trim())
            .filter(Boolean);
        const localRes = await updateLocalGeneratedFileTags(id, localTags);
        _showResult(localRes);
        await _refresh();
        return;
    }
    const current = await get(id);
    if (!current.ok) {
        showToast(current.error || 'Tag edit failed', 'error');
        return;
    }
    const raw = await asyncPrompt('Comma separated tags', (current.data.tags || []).join(', '));
    if (raw == null)
        return;
    const tags = raw
        .split(',')
        .map((x: any) => x.trim())
        .filter(Boolean);
    const res = await updateTags(id, tags);
    _showResult(res);
    await _refresh();
}
/** @param {any} id */
export async function handleFilesReimport( id: any) {
    if (isLocalGeneratedFileId(id)) {
        showToast('Re-import not supported for local video.', 'info');
        return;
    }
    const meta = await get(id);
    if (!meta.ok) {
        showToast(meta.error || 'File not found', 'error');
        return;
    }
    const bufferRes = await getContent(id);
    if (!bufferRes.ok) {
        showToast(bufferRes.error || 'Read failed', 'error');
        return;
    }
    const file = new File([bufferRes.data], meta.data.filename || 'file.bin', {
        type: meta.data.mime_type || 'application/octet-stream',
    });
    handleOpenIngestionModal();
    await handleIngestionDirectFile(file);
}
/**
 * Abre o wizard "Importar Dados" com o arquivo selecionado pelo usuário.
 * Chamado pelo botão "Importar Dados" no painel Files.
 * @param {HTMLInputElement} input
 */
export async function handleFilesImportFromInput( input: any) {
    const file = input?.files?.[0];
    if (!file)
        return;
    if (document.querySelector('#ingestion-modal.active')) {
        const yes = await asyncConfirm('Um import já está em andamento. Descartar e iniciar novo?');
        if (!yes)
            return;
    }
    if (input)
        input.value = ''; // reset para permitir re-seleção do mesmo arquivo
    handleOpenIngestionModal();
    await handleIngestionDirectFile(file);
}
/** @param {any} key @param {any} value */
export async function handleFilesFilter( key: any, value: any) {
    updateFilesFilter(key, value);
    await renderFilesPanel();
}
/** @param {any} value */
export async function handleFilesSort( value: any) {
    const [sortBy, sortOrder] = String(value || 'updated_at:desc').split(':');
    updateFilesFilter('sortBy', sortBy || 'updated_at');
    updateFilesFilter('sortOrder', sortOrder || 'desc');
    await renderFilesPanel();
}
export async function handleFilesClearFilters() {
    resetFilesFilter();
    await renderFilesPanel();
}
export async function handleFilesDismissWarning() {
    try {
        localStorage.removeItem('ecbyts-files-reconcile-warning');
    }
    catch (err: any) {
        log.debug('Files warning dismiss ignored', (err)?.message);
    }
    await renderFilesPanel();
}
export async function handleFilesSaveContoursGeoJSON() {
    const built: any = await _buildContoursGeoJSON();
    if (!built.ok) {
        showToast(built.error || 'Falha ao gerar GeoJSON.', 'warning');
        return;
    }
    const data: any = (built.data);
    const { filename, blob } = data;
    const file = new File([blob], filename, { type: 'application/geo+json' });
    const res = await register(file, {
        source: 'manual',
        tags: ['contours', 'geojson', ...data.layerTypes],
    });
    if (!res.ok && res.code === ERROR_CODE.NOT_AUTHENTICATED) {
        _downloadBlob(blob, filename);
        showToast('Sem login no Files: GeoJSON baixado direto no navegador.', 'warning');
        return;
    }
    _showResult(res, `Curvas salvas em Arquivos (${data.featureCount} feições).`);
    await _refresh();
}
export async function handleFilesDownloadContoursGeoJSON() {
    const built: any = await _buildContoursGeoJSON();
    if (!built.ok) {
        showToast(built.error || 'Falha ao gerar GeoJSON.', 'warning');
        return;
    }
    const data: any = (built.data);
    _downloadBlob(data.blob, data.filename);
    showToast(`GeoJSON baixado (${data.featureCount} feições).`, 'success');
}
/**
 * Registra arquivo originado de importacao (ingestion pipeline).
 * @internal - chamado diretamente por outros modulos, nao exposto via window.*
 * @param {File} file
 * @param {object} metadata
 */
export async function handleFilesRegisterFromIngestion( file: any, metadata: any = {}) {
    const mode = (metadata).mode || getFileRegisterMode();
    return registerFromIngestion(file, { ...metadata, mode });
}
/* ============================================================
 * Sample files (read-only public catalog)
 * ============================================================ */
/** @param {any} id */
export async function handleFilesPreviewSample( id: any) {
    const meta = getSampleFile(id);
    if (!meta.ok)
        return showToast(meta.error, 'error');
    if ((meta.data.mime_type || '').startsWith('image/')) {
        window.open(meta.data.url, '_blank', 'noopener');
        return;
    }
    showToast('Preview indisponivel para este tipo.', 'info');
}
/** @param {any} id */
export async function handleFilesDownloadSample( id: any) {
    const res = await getSampleFileAsBlob(id);
    if (!res.ok)
        return showToast(res.error || 'Download falhou.', 'error');
    _downloadBlob(res.data, res.meta.filename);
    showToast('Sample baixado.', 'success');
}
/**
 * Route a sample file to a downstream consumer action. Each consumer
 * expects a File instance; fetch once then dispatch.
 *
 * @param {string} id Sample id (e.g. 'sample:aerial-default')
 * @param {string} action Consumer key (aerial-overlay|raster-upload|ai-recognition|automation-input)
 */
export async function handleUseSampleFileAs( id: any, action: any) {
    const meta = getSampleFile(id);
    if (!meta.ok)
        return showToast(meta.error, 'error');
    const fetched = await getSampleFileAsFile(id);
    if (!fetched.ok)
        return showToast(fetched.error || 'Falha ao obter amostra.', 'error');
    const file = fetched.data;
    switch (action) {
        case 'aerial-overlay':
            if (typeof window.handleApplyAerialImage === 'function') {
                await window.handleApplyAerialImage({ file, source: 'sample', sampleId: id });
            }
            else if (typeof window.handleOpenAerialGeoAI === 'function') {
                (window).handleOpenAerialGeoAI({ file, sampleId: id });
            }
            else {
                showToast('Aerial overlay handler nao disponivel.', 'warn');
            }
            break;
        case 'raster-upload':
            if (typeof window.handleUploadRaster === 'function') {
                window.handleUploadRaster();
                setTimeout(() => {
                    const input = (document.getElementById('raster-file-input'));
                    if (input) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        input.files = dt.files;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, 60);
            }
            else {
                showToast('Raster upload handler nao disponivel.', 'warn');
            }
            break;
        case 'ai-recognition':
            if (typeof window.handleOpenAIImageModal === 'function') {
                window.handleOpenAIImageModal({ file, sampleId: id });
            }
            else if (typeof window.handleAnalyzeImage === 'function') {
                window.handleAnalyzeImage({ file, sampleId: id });
            }
            else {
                showToast('AI recognition handler nao disponivel.', 'warn');
            }
            break;
        case 'automation-input':
            if (typeof (window as any).handleOpenAutomationPanel === 'function') {
                (window as any).handleOpenAutomationPanel({ inputFile: file, sampleId: id });
            }
            else {
                showToast('Automation panel nao disponivel.', 'warn');
            }
            break;
        default:
            showToast(`Acao desconhecida: ${action}`, 'warn');
    }
    log.info(`Sample dispatched: ${id} → ${action}`);
}
async function _refresh(reason = 'files.changed') {
    await renderFilesPanel();
    requestFilesUIRefresh(reason);
}
/** @param {any} result @param {any} successMessage */
function _showResult( result: any, successMessage: any = '') {
    if (result.ok) {
        showToast(successMessage, 'success');
        return;
    }
    showToast(result.error || 'Files operation failed', 'error');
}
export const filesHandlers = {
    handleOpenFiles,
    handleFilesUploadInput,
    handleFilesDragOver,
    handleFilesDrop,
    handleFilesDelete,
    handleFilesDownload,
    handleFilesPreview,
    handleFilesEditTags,
    handleFilesReimport,
    handleFilesImportFromInput,
    handleFilesFilter,
    handleFilesSort,
    handleFilesClearFilters,
    handleFilesDismissWarning,
    handleFilesSaveContoursGeoJSON,
    handleFilesDownloadContoursGeoJSON,
    handleFilesPreviewSample,
    handleFilesDownloadSample,
    handleUseSampleFileAs,
};
async function _buildContoursGeoJSON() {
    const baseLayers = (getAllLayers()).filter((l: any) => CONTOUR_EXPORT_TYPES.has(l?.type));
    const fallbackBounds = _computeBoundaryBoundsFromElements();
    for (const l of baseLayers) {
        if (l?.grid && l?.bounds && l?.gridSize)
            continue;
        if (!l.bounds && fallbackBounds)
            l.bounds = fallbackBounds;
        if (l.type === 'water_table' && !l.parameterId)
            l.parameterId = 'water_level';
        try {
            await recomputeLayer(l.id);
        }
        catch (err: any) {
            log.debug('Layer recompute ignored', (err)?.message);
        }
    }
    const layers = (getAllLayers()).filter((l: any) => CONTOUR_EXPORT_TYPES.has(l?.type) && l.grid && l.bounds && l.gridSize);
    if (layers.length === 0) {
        return { ok: false, error: 'Nenhuma camada com curvas e grid para exportar.' };
    }
    const features = [];
    const origin = (getOrigin());
    const exportedAt = new Date().toISOString();
    for (const layer of layers) {
        const levelCount = _contourLevelCount(layer.contourDensity);
        const contours = buildContoursFromGrid({
            grid: layer.grid,
            bounds: layer.bounds,
            gridSize: layer.gridSize,
            levelCount,
        });
        if (!Array.isArray(contours) || contours.length === 0)
            continue;
        for (let i = 0; i < contours.length; i++) {
            const line: any = contours[i];
            const pts = (Array.isArray(line.points) ? line.points : []);
            if (pts.length < 2)
                continue;
            const coords = pts.map((p: any) => {
                const wgs = relativeToWGS84({ x: p.x, y: 0, z: p.z });
                return [_round(wgs.longitude, 7), _round(wgs.latitude, 7)];
            });
            features.push({
                type: 'Feature',
                id: `${layer.id}-contour-${i}`,
                geometry: { type: 'LineString', coordinates: coords },
                properties: {
                    layerId: layer.id,
                    layerName: layer.name || layer.id,
                    layerType: layer.type,
                    parameterId: layer.parameterId || null,
                    contourLevel: Number(line.level),
                    unit: _layerContourUnit(layer),
                    generatedAt: exportedAt,
                },
            });
        }
    }
    if (features.length === 0) {
        return { ok: false, error: 'Curvas de nível não disponíveis para exportação.' };
    }
    const payload = {
        type: 'FeatureCollection',
        name: 'ECByTS Contours',
        metadata: {
            exported: exportedAt,
            source: 'ecbyts',
            kind: 'interpolation_contours',
            utmOrigin: {
                easting: origin.easting,
                northing: origin.northing,
                elevation: origin.elevation,
                zone: origin.zone,
                hemisphere: origin.hemisphere,
                epsg: getEPSG(origin.zone, origin.hemisphere),
            },
            layerCount: layers.length,
            featureCount: features.length,
        },
        features,
    };
    const layerTypes = [...new Set(layers.map((l: any) => l.type))].sort();
    const stamp = exportedAt.slice(0, 19).replaceAll(':', '-');
    const filename = `contours-${layerTypes.join('-')}-${stamp}.geojson`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/geo+json' });
    return { ok: true, data: { filename, blob, featureCount: features.length, layerTypes } };
}
/** @param {any} blob @param {any} filename */
function _downloadBlob( blob: any, filename: any) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function _computeBoundaryBoundsFromElements() {
    const boundary = (getAllElements().find((e: any) => e?.family === 'boundary' && Array.isArray(e?.data?.vertices) && e.data.vertices.length >= 3));
    if (!boundary)
        return null;
    const vertices = (boundary.data.vertices);
    const xs = vertices.map((v: any) => Number(v?.x)).filter(Number.isFinite);
    const zs = vertices.map((v: any) => Number(v?.z)).filter(Number.isFinite);
    if (xs.length < 3 || zs.length < 3)
        return null;
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
    };
}
/** @param {any} density */
function _contourLevelCount( density: any) {
    if (density === 'low')
        return 6;
    if (density === 'high')
        return 14;
    return 10;
}
/** @param {any} layer */
function _layerContourUnit( layer: any) {
    if (layer?.type === 'terrain' || layer?.type === 'water_table')
        return 'm';
    return layer?.parameterId || 'value';
}
/** @param {any} v @param {any} p */
function _round( v: any, p: any = 7) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return 0;
    const f = 10 ** p;
    return Math.round(n * f) / f;
}
