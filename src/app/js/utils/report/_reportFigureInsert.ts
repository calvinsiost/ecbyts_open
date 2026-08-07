// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Seletor de figuras para o relatório (P2). Fontes: módulo Files (imagens carregadas
// pelo usuário — pedido Calvin) + screenshot da cena 3D atual. Embute como data URL
// base64 (durável: sobrevive a export PDF/DOCX e à chave .ecbt). HTML montado e
// sanitizado por _reportFigurePure (src allowlist + caption escapada).
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { asyncPrompt } from '../ui/asyncDialogs.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import {
    isImageFile,
    bytesToImageDataUrl,
    buildFigureHtml,
    buildCorporateFigureHtml,
    figureSizeWarning,
    sanitizeImageSrc,
} from './_reportFigurePure.js';
import {
    normalizeReportFigureInsertOptions,
    resolveReportFigureCaption,
    type ReportFigureInsertOptions,
    type ReportFigureOrigin,
} from './_reportFigureInsertCatalogPure.js';

const log = createLogger('ReportFigureInsert');

let _overlay: HTMLElement | null = null;
let _figureSeq = 0;

function _close(): void {
    if (_overlay) {
        _overlay.remove();
        _overlay = null;
    }
}

/** Insere o HTML da figura no editor de relatório (lazy import p/ evitar dep circular). */
async function _insert(figureHtml: string, _caption: string): Promise<void> {
    if (!figureHtml) {
        showToast(t('reportFigure.invalid') || 'Imagem inválida ou insegura.', 'error');
        return;
    }
    const ed: any = await import('./editor.js' as string);
    const ok = ed.insertFigureHtml?.(figureHtml);
    if (ok) {
        _figureSeq++;
        showToast(t('reportFigure.inserted') || 'Figura inserida no relatório', 'success');
        _close();
    } else {
        showToast(t('reportFigure.editorClosed') || 'Abra o editor de relatório primeiro.', 'warning');
    }
}

/**
 * Insere uma figura (data URL já pronta) no relatório ativo, SEM prompt — para uso por
 * automações (bots) que geram a imagem programaticamente. Retorna true se inserida.
 */
export async function insertReportFigure(
    dataUrl: string,
    captionOrOptions: string | ReportFigureInsertOptions,
    figureNumber?: number,
    origin?: ReportFigureOrigin,
): Promise<boolean> {
    if (!sanitizeImageSrc(dataUrl)) return false;
    const meta = _gatherReportMeta();
    const normalized = normalizeReportFigureInsertOptions(captionOrOptions, figureNumber, origin);
    const nextFigureNumber = normalized.figureNumber ?? _figureSeq + 1;
    const captionResolution = resolveReportFigureCaption(normalized, nextFigureNumber);
    // Layout corporativo (prancha em HTML): cabeçalho de projeto + nº + carimbo.
    // Quando `origin` é passado, o <figure> ganha data-attrs + role=button para
    // que o delegation handler do editor leve o usuário de volta à cena 3D.
    const html = buildCorporateFigureHtml({
        src: dataUrl,
        caption: captionResolution.caption,
        figureNumber: nextFigureNumber,
        projectName: meta.projectName,
        responsible: meta.responsible,
        date: meta.date,
        ...(normalized.origin?.providerId ? { providerId: normalized.origin.providerId } : {}),
        ...(normalized.origin?.candidateId ? { candidateId: normalized.origin.candidateId } : {}),
        ...(normalized.origin?.scope ? { scope: normalized.origin.scope } : {}),
        ...(captionResolution.figureTypeId ? { figureTypeId: captionResolution.figureTypeId } : {}),
        ...(Object.keys(normalized.subset).length ? { subset: normalized.subset } : {}),
    });
    if (!html) return false;
    const ed: any = await import('./editor.js' as string);
    const ok = ed.insertFigureHtml?.(html);
    if (ok) _figureSeq++;
    return !!ok;
}

/** Coleta metadados do relatório (projeto, responsável, data) dos inputs do DOM. */
function _gatherReportMeta(): { projectName: string; responsible: string; date: string } {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value?.trim() || '';
    return {
        projectName: val('project-name'),
        responsible: val('project-responsible-tech') || val('project-author'),
        date: new Date().toLocaleDateString(),
    };
}

/** Mostra opções de gráfico (Chart.js) geradas a partir dos dados reais do modelo. */
async function _pickFromChart(): Promise<void> {
    const body = _overlay?.querySelector('.report-figure-body');
    if (!body) return;
    body.innerHTML = `<p class="report-figure-hint">${escapeHtml(t('reportFigure.chartLoading') || 'Analisando dados do modelo…')}</p>`;
    let data: any = null;
    try {
        const [{ getAllElements }, { gatherGroundingData }]: any = await Promise.all([
            import('../../core/elements/manager.js' as string),
            import('./_reportGroundingGather.js' as string),
        ]);
        data = await gatherGroundingData(getAllElements?.() || []);
    } catch (e: any) {
        log.error('chart data gather failed:', e?.message || e);
    }
    const hasExceed = !!data?.exceedances?.length;
    const hasHist = (data?.topParamValues?.length || 0) >= 2;
    if (!hasExceed && !hasHist) {
        body.innerHTML = `<p class="report-figure-hint">${escapeHtml(t('reportFigure.chartNoData') || 'Sem dados suficientes para gerar gráficos.')}</p>`;
        return;
    }
    const opts: string[] = [];
    if (hasExceed) opts.push(`<button type="button" class="report-figure-src-btn" data-chart="exceed">${escapeHtml(t('reportFigure.chartExceed') || 'Excedências (medido vs limite)')}</button>`);
    if (hasHist) opts.push(`<button type="button" class="report-figure-src-btn" data-chart="hist">${escapeHtml((t('reportFigure.chartHist') || 'Histograma') + (data.topParamName ? ` — ${data.topParamName}` : ''))}</button>`);
    body.innerHTML = `<div class="report-figure-grid">${opts.join('')}</div>`;
    body.querySelectorAll('[data-chart]').forEach((btn: any) => {
        btn.addEventListener('click', () => _insertChart(btn.getAttribute('data-chart'), data));
    });
}

async function _insertChart(kind: string, data: any): Promise<void> {
    try {
        const cap: any = await import('./chartCapture.js' as string);
        let dataUrl: string | null = null;
        let defaultCaption = '';
        if (kind === 'exceed') {
            dataUrl = cap.captureExceedanceChart?.(data.exceedances);
            defaultCaption = t('reportFigure.chartExceedCaption') || 'Excedências regulatórias (valor medido vs limite)';
        } else if (kind === 'hist') {
            dataUrl = cap.captureHistogramChart?.(data.topParamValues);
            defaultCaption = (t('reportFigure.chartHistCaption') || 'Distribuição de frequência') + (data.topParamName ? ` — ${data.topParamName}` : '');
        }
        if (!dataUrl) {
            showToast(t('reportFigure.chartFailed') || 'Falha ao gerar o gráfico (Chart.js indisponível?).', 'error');
            return;
        }
        const caption =
            (await asyncPrompt(t('reportFigure.captionPrompt') || 'Legenda da figura', defaultCaption, {
                placeholder: t('reportFigure.captionPlaceholder') || 'Ex: Excedências',
                confirmLabel: t('insert') || 'Inserir',
                cancelLabel: t('cancel') || 'Cancelar',
            })) || defaultCaption;
        const html = buildFigureHtml({ src: dataUrl, caption, figureNumber: _figureSeq + 1 });
        await _insert(html, caption);
    } catch (e: any) {
        log.error('chart insert failed:', e?.message || e);
        showToast(t('reportFigure.chartFailed') || 'Falha ao gerar o gráfico.', 'error');
    }
}

/** Captura a cena 3D atual e insere como figura. */
async function _insertFromScene(): Promise<void> {
    try {
        const { sceneOwner }: any = await import('../../core/scene/lifecycleOwner.js' as string);
        const dataUrl: string = await sceneOwner.captureFrame();
        if (!sanitizeImageSrc(dataUrl)) {
            showToast(t('reportFigure.captureFailed') || 'Falha ao capturar a cena.', 'error');
            return;
        }
        const caption =
            (await asyncPrompt(t('reportFigure.captionPrompt') || 'Legenda da figura', '', {
                placeholder: t('reportFigure.captionPlaceholder') || 'Ex: Vista 3D do sítio',
                confirmLabel: t('insert') || 'Inserir',
                cancelLabel: t('cancel') || 'Cancelar',
            })) || '';
        const html = buildFigureHtml({ src: dataUrl, caption, figureNumber: _figureSeq + 1 });
        await _insert(html, caption);
    } catch (e: any) {
        log.error('scene capture failed:', e?.message || e);
        showToast(t('reportFigure.captureFailed') || 'Falha ao capturar a cena.', 'error');
    }
}

/** Carrega imagens do módulo Files e insere a selecionada como figura base64. */
async function _pickFromFiles(): Promise<void> {
    let images: any[];
    try {
        const fm: any = await import('../files/fileManager.js' as string);
        const res = await fm.list({});
        const all = res?.ok ? res.data || [] : [];
        images = all.filter((f: any) => isImageFile(f));
    } catch (e: any) {
        log.error('files list failed:', e?.message || e);
        showToast(t('reportFigure.filesUnavailable') || 'Arquivos indisponíveis (faça login).', 'warning');
        return;
    }
    if (images.length === 0) {
        showToast(t('reportFigure.noImages') || 'Nenhuma imagem no módulo Files.', 'info');
        return;
    }
    _renderFilesGrid(images);
}

function _renderFilesGrid(images: any[]): void {
    const body = _overlay?.querySelector('.report-figure-body');
    if (!body) return;
    const cards = images
        .map(
            (f) => `
        <button type="button" class="report-figure-file" data-file-id="${escapeHtml(String(f.id))}" data-mime="${escapeHtml(String(f.mime_type || 'image/png'))}">
            <span class="report-figure-file-name">${escapeHtml(String(f.filename || f.id))}</span>
            <span class="report-figure-file-ext">${escapeHtml(String(f.extension || '').toUpperCase())}</span>
        </button>`,
        )
        .join('');
    body.innerHTML = `<div class="report-figure-grid">${cards}</div>`;
    body.querySelectorAll('.report-figure-file').forEach((btn: any) => {
        btn.addEventListener('click', () => _embedFileAsFigure(btn.getAttribute('data-file-id'), btn.getAttribute('data-mime')));
    });
}

async function _embedFileAsFigure(fileId: string, mime: string): Promise<void> {
    try {
        const fm: any = await import('../files/fileManager.js' as string);
        const content = await fm.getContent(fileId);
        if (!content?.ok) {
            showToast(t('reportFigure.loadFailed') || 'Falha ao carregar a imagem.', 'error');
            return;
        }
        const buffer: ArrayBuffer = content.data;
        const warn = figureSizeWarning(buffer.byteLength);
        if (warn) showToast(warn, 'warning');
        const dataUrl = bytesToImageDataUrl(new Uint8Array(buffer), mime);
        const caption =
            (await asyncPrompt(t('reportFigure.captionPrompt') || 'Legenda da figura', '', {
                placeholder: t('reportFigure.captionPlaceholder') || 'Ex: Foto do sítio',
                confirmLabel: t('insert') || 'Inserir',
                cancelLabel: t('cancel') || 'Cancelar',
            })) || '';
        const html = buildFigureHtml({ src: dataUrl, caption, figureNumber: _figureSeq + 1 });
        await _insert(html, caption);
    } catch (e: any) {
        log.error('embed file failed:', e?.message || e);
        showToast(t('reportFigure.loadFailed') || 'Falha ao carregar a imagem.', 'error');
    }
}

/** Abre o seletor de figuras (overlay com fontes: Files + Cena 3D). */
export function openFigurePicker(): void {
    _close();
    _overlay = document.createElement('div');
    _overlay.className = 'async-dialog-overlay report-figure-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', t('reportFigure.title') || 'Inserir figura');
    _overlay.innerHTML = `
        <div class="async-dialog report-figure-dialog">
            <div class="report-figure-header">
                <span class="report-figure-title">${escapeHtml(t('reportFigure.title') || 'Inserir figura')}</span>
                <button type="button" class="report-figure-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
            </div>
            <div class="report-figure-sources">
                <button type="button" class="report-figure-src-btn" data-src="files">${escapeHtml(t('reportFigure.fromFiles') || 'Do módulo Files')}</button>
                <button type="button" class="report-figure-src-btn" data-src="scene">${escapeHtml(t('reportFigure.fromScene') || 'Cena 3D atual')}</button>
                <button type="button" class="report-figure-src-btn" data-src="chart">${escapeHtml(t('reportFigure.fromChart') || 'Gráfico dos dados')}</button>
            </div>
            <div class="report-figure-body">
                <p class="report-figure-hint">${escapeHtml(t('reportFigure.hint') || 'Escolha a origem da figura.')}</p>
            </div>
        </div>`;
    document.body.appendChild(_overlay);
    _overlay.querySelector('.report-figure-close')?.addEventListener('click', _close);
    _overlay.addEventListener('click', (e: any) => {
        if (e.target === _overlay) _close();
    });
    _overlay.querySelector('[data-src="files"]')?.addEventListener('click', _pickFromFiles);
    _overlay.querySelector('[data-src="scene"]')?.addEventListener('click', _insertFromScene);
    _overlay.querySelector('[data-src="chart"]')?.addEventListener('click', _pickFromChart);
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            _close();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}

if (typeof window !== 'undefined') {
    (window as any).openReportFigurePicker = openFigurePicker;
}
