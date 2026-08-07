// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ingestionDropzone.ts — IMPORT-UX-001 RF-4
 *
 * Dropzone multi-arquivo com fila de importação para o modal de ingestão.
 * Aceita drag-and-drop de N arquivos; mantém uma fila visual com status por
 * arquivo (aguardando/processando/ok/erro); processa sequencialmente chamando
 * o handler existente `_startIngestionForFile` para cada arquivo.
 *
 * Módulo separado (não cresce o monolito ingestion.ts): expõe setupIngestionDropzone
 * que o ingestion.ts chama no pós-render do uploadForm.
 */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('IngestionDropzone');

/** Status de cada arquivo na fila de importação. */
export type ImportQueueItemStatus = 'aguardando' | 'processando' | 'ok' | 'erro';

/** Item da fila de importação multi-arquivo. */
export interface ImportQueueItem {
    file: File;
    status: ImportQueueItemStatus;
    message?: string;
}

/** Fila interna de importação (módulo state). */
let _importQueue: ImportQueueItem[] = [];
let _isProcessing = false;

/**
 * Processa callback que executa a ingestão de um único arquivo.
 * O ingestion.ts injeta este callback ao chamar setupIngestionDropzone.
 */
type ProcessFileFn = (file: File) => Promise<void>;
let _processFileFn: ProcessFileFn | null = null;

/** Container onde a fila visual é renderizada. */
let _queueContainerEl: HTMLElement | null = null;

/**
 * Define a função de processamento injetada pelo ingestion.ts.
 * Deve ser chamado ANTES de setupIngestionDropzone.
 */
export function setProcessFileFn(fn: ProcessFileFn): void {
    _processFileFn = fn;
}

/**
 * Configura o dropzone: attach dragover/drop/dragleave no elemento da área
 * tracejada do uploadForm. Chamado pelo ingestion.ts após renderUploadForm.
 *
 * @param dropzoneEl Elemento da área tracejada (border:2px dashed).
 * @param queueEl Elemento onde a fila visual será renderizada.
 * @param processFn Função que processa um arquivo (injeta _startIngestionForFile).
 */
export function setupIngestionDropzone(
    dropzoneEl: HTMLElement | null,
    queueEl: HTMLElement | null,
    processFn: ProcessFileFn,
): void {
    // Seta o processFn mesmo sem DOM (testes usam setupIngestionDropzone(null,null,fn))
    _processFileFn = processFn;
    _queueContainerEl = queueEl;
    if (!dropzoneEl) return;

    // AbortController para limpar listeners se o modal fechar (PERF-MASTER S3.3).
    const controller = new AbortController();

    dropzoneEl.addEventListener(
        'dragover',
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneEl.style.borderColor = 'var(--primary-500)';
            dropzoneEl.style.background = 'var(--primary-50, rgba(0,123,255,0.05))';
        },
        { signal: controller.signal },
    );

    dropzoneEl.addEventListener(
        'dragleave',
        () => {
            dropzoneEl.style.borderColor = 'var(--neutral-300)';
            dropzoneEl.style.background = '';
        },
        { signal: controller.signal },
    );

    dropzoneEl.addEventListener(
        'drop',
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneEl.style.borderColor = 'var(--neutral-300)';
            dropzoneEl.style.background = '';

            const dt = e.dataTransfer;
            if (!dt?.files || dt.files.length === 0) return;

            // Adiciona todos os arquivos dropped na fila
            const newFiles = Array.from(dt.files);
            addToImportQueue(newFiles);
        },
        { signal: controller.signal },
    );

    // Click no dropzone abre o seletor de arquivos (como antes)
    dropzoneEl.addEventListener(
        'click',
        () => {
            // RF-4 wiring: o input real no renderUploadForm e #ingestion-data-file-input;
            // selecionar por tipo evita acoplar ao id e mantem clique-abre-seletor funcional.
            const input = dropzoneEl.querySelector<HTMLInputElement>('input[type="file"]');
            if (input) input.click();
        },
        { signal: controller.signal },
    );

    log.debug('Dropzone setup complete', { hasQueue: !!queueEl });
}

/**
 * RF-4 wiring (IMPORT-UX-001#4): localiza a area tracejada (#ingestion-dropzone) e a fila
 * (#ingestion-import-queue) dentro do container recem-renderizado e ativa o dropzone, injetando
 * a pipeline existente (handleIngestionDirectFile) como processFn. Chamado por ingestion.ts logo
 * apos renderUploadForm() — fecha o modulo orfao apontado na reabertura.
 */
export function wireIngestionDropzone(container: HTMLElement | null, processFn: ProcessFileFn): void {
    if (!container) return;
    const dropzoneEl = container.querySelector<HTMLElement>('#ingestion-dropzone');
    const queueEl = container.querySelector<HTMLElement>('#ingestion-import-queue');
    setupIngestionDropzone(dropzoneEl, queueEl, processFn);
}

/**
 * Adiciona arquivos à fila de importação e inicia o processamento se não
 * estiver em andamento.
 */
export function addToImportQueue(files: File[]): void {
    for (const file of files) {
        _importQueue.push({ file, status: 'aguardando' });
    }
    if (files.length > 1 && typeof document !== 'undefined') {
        showToast(
            t('ingestion.queueAdded') || `${files.length} files added to queue`,
            'info',
        );
    }
    renderImportQueue();
    if (!_isProcessing) {
        void processQueueSequentially();
    }
}

/**
 * Renderiza a fila visual de importação no container designado.
 * Cada arquivo mostra: nome + status + mensagem (se erro).
 */
export function renderImportQueue(): void {
    if (!_queueContainerEl) return;
    if (_importQueue.length === 0) {
        _queueContainerEl.innerHTML = '';
        _queueContainerEl.style.display = 'none';
        return;
    }
    _queueContainerEl.style.display = 'block';
    const rows = _importQueue
        .map((item, i) => {
            const statusIcon =
                item.status === 'ok'
                    ? '<span style="color:var(--success);">&#10003;</span>'
                    : item.status === 'erro'
                      ? '<span style="color:var(--error);">&#10007;</span>'
                      : item.status === 'processando'
                        ? '<span class="ingestion-queue-spinner"></span>'
                        : '<span style="color:var(--neutral-400);">&#9679;</span>';
            const msg = item.message ? ` <span style="font-size:10px;color:var(--neutral-500);">${escapeHtml(item.message)}</span>` : '';
            return `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:11px;border-bottom:1px solid var(--neutral-100);">
                ${statusIcon}
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.file.name)}</span>
                <span style="font-size:10px;color:var(--neutral-400);">${(item.file.size / 1024).toFixed(0)} KB</span>
                ${msg}
            </div>`;
        })
        .join('');
    _queueContainerEl.innerHTML = `
        <div style="margin-top:12px;border:1px solid var(--neutral-200);border-radius:6px;overflow:hidden;">
            <div style="background:var(--neutral-50);padding:6px 8px;font-size:10px;font-weight:600;color:var(--neutral-600);">
                ${t('ingestion.queueTitle') || 'Import Queue'} (${_importQueue.length})
                <button type="button" class="btn btn-secondary" style="float:right;font-size:9px;padding:2px 8px;" data-cc-action="cc-a3f2d1c9">${t('ingestion.queueClear') || 'Clear'}</button>
            </div>
            ${rows}
        </div>
    `;
}

/**
 * Processa a fila sequencialmente: um arquivo por vez, chamando a função
 * de processamento injetada. Atualiza o status de cada item conforme
 * avança. Erro em um arquivo não bloqueia os demais (best-effort).
 */
export async function processQueueSequentially(): Promise<void> {
    if (!_processFileFn) {
        log.warn('processQueueSequentially called without processFileFn');
        return;
    }
    _isProcessing = true;
    try {
        for (const item of _importQueue) {
            if (item.status !== 'aguardando') continue;
            item.status = 'processando';
            renderImportQueue();
            try {
                await _processFileFn(item.file);
                item.status = 'ok';
            } catch (err: any) {
                item.status = 'erro';
                item.message = err?.message || String(err);
                log.error('Queue item failed', item.file.name, item.message);
            }
            renderImportQueue();
        }
    } finally {
        _isProcessing = false;
    }
}

/**
 * Limpa a fila de importação (remove todos os itens, inclusive já processados).
 */
export function clearImportQueue(): void {
    _importQueue = [];
    renderImportQueue();
}

/** Getter para inspeção/teste do estado atual da fila. */
export function getImportQueue(): readonly ImportQueueItem[] {
    return [..._importQueue];
}