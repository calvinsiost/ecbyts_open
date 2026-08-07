// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT KEY CONTENTS PANEL

   UI shell for "O que voce encontrara nessa chave". The raw key is never
   persisted; only the decoded tree summary and the user's folder order are
   stored locally.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { activateTabById } from './tabs.js';
import { showToast } from './toast.js';
import {
    buildEcbtKeyTreeSummary,
    type EcbtKeyGoAction,
    type EcbtKeyTreeNode,
    type EcbtKeyTreeSummary,
    type EcbtKeyTreeSummaryOptions,
    type EcbtKeySemanticMapItem,
} from '../../core/io/ecbtKeyTreeSummaryPure.js';

const SUMMARY_STORAGE_KEY = 'ecbyts-key-tree-summary:last';
const ORDER_STORAGE_PREFIX = 'ecbyts-key-tree-summary:order:';
const MODAL_ID = 'ecbt-key-contents-modal';
const COURSE_PREVIEW_MODAL_ID = 'ecbt-key-course-preview-modal';
const HOST_ID = 'ecbt-key-contents';
const FALLBACK_TABS_BY_HANDLER: Readonly<Record<string, readonly string[]>> = Object.freeze({
    handleOpenDataStudio: Object.freeze(['analytics']),
    handleOpenFiles: Object.freeze(['files']),
    handleOpenPipelineManager: Object.freeze(['automation']),
    handleOpenProjectGantt: Object.freeze(['project', 'governance']),
    handleOpenTraining: Object.freeze([]),
});

let _summary: EcbtKeyTreeSummary | null = null;
let _initialized = false;

type SetSummaryOptions = {
    readonly openPanel?: boolean;
    readonly openModal?: boolean;
};

type SummarizeInputOptions = EcbtKeyTreeSummaryOptions & SetSummaryOptions;

function safeJsonParse<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] parse json:', e?.message || e);
        return fallback;
    }
}

function loadStoredSummary(): EcbtKeyTreeSummary | null {
    if (typeof localStorage === 'undefined') return null;
    const parsed = safeJsonParse<EcbtKeyTreeSummary | null>(localStorage.getItem(SUMMARY_STORAGE_KEY), null);
    return parsed && parsed.schema === 'ecbt-key-tree-summary@1' ? parsed : null;
}

function saveStoredSummary(summary: EcbtKeyTreeSummary): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summary));
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] save summary:', e?.message || e);
    }
}

function orderStorageKey(summary: EcbtKeyTreeSummary): string {
    return `${ORDER_STORAGE_PREFIX}${summary.id}`;
}

function getFolderOrder(summary: EcbtKeyTreeSummary): string[] {
    const children = [...(summary.root.children || [])];
    const defaultOrder = children.map((node) => node.id);
    if (typeof localStorage === 'undefined') return defaultOrder;
    const saved = safeJsonParse<string[]>(localStorage.getItem(orderStorageKey(summary)), []);
    const known = new Set(defaultOrder);
    const ordered = saved.filter((id) => known.has(id));
    for (const id of defaultOrder) {
        if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
}

function setFolderOrder(summary: EcbtKeyTreeSummary, order: readonly string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(orderStorageKey(summary), JSON.stringify([...order]));
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] save order:', e?.message || e);
    }
}

function orderedRootChildren(summary: EcbtKeyTreeSummary): EcbtKeyTreeNode[] {
    const children = [...(summary.root.children || [])];
    const byId = new Map(children.map((node) => [node.id, node]));
    return getFolderOrder(summary)
        .map((id) => byId.get(id))
        .filter((node): node is EcbtKeyTreeNode => !!node);
}

function inferKeyFormat(input: string): string {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) return 'json';
    const ecbt = trimmed.match(/^ECBT\.([A-Z])/);
    if (ecbt) return ecbt[1] || 'ECBT';
    const eco = trimmed.match(/^ECO(\d+)/);
    if (eco) return `ECO${eco[1]}`;
    return 'unknown';
}

export async function decodeEcbtKeyInputForSummary(input: string): Promise<unknown> {
    const trimmed = String(input || '').trim();
    if (!trimmed) throw new Error('Chave vazia.');
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    if (trimmed.startsWith('ECBT') || trimmed.startsWith('ECO')) {
        const dec: any = await import('../../core/io/decoder.js' as string);
        return dec.parseInputAsync ? dec.parseInputAsync(trimmed) : dec.decodeKeyUniversal(trimmed);
    }
    throw new Error('Formato nao reconhecido para resumo de chave.');
}

export function setCurrentEcbtKeyTreeSummary(summary: EcbtKeyTreeSummary, options: SetSummaryOptions = {}): void {
    _summary = summary;
    saveStoredSummary(summary);
    renderEcbtKeyContentsPanel();
    if (options.openPanel) openEcbtKeyContentsPanel({ modal: false });
    if (options.openModal) openEcbtKeyContentsPanel({ modal: true });
    try {
        window.dispatchEvent(new CustomEvent('ecbtKeyContentsUpdated', { detail: { summaryId: summary.id } }));
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] dispatch update:', e?.message || e);
    }
}

export function setCurrentEcbtKeyTreeSummaryFromDecoded(
    decoded: unknown,
    options: SummarizeInputOptions = {},
): EcbtKeyTreeSummary {
    const summary = buildEcbtKeyTreeSummary(decoded, options);
    setCurrentEcbtKeyTreeSummary(summary, options);
    return summary;
}

export async function summarizeEcbtKeyInputForPanel(
    input: string,
    options: SummarizeInputOptions = {},
): Promise<EcbtKeyTreeSummary> {
    const decoded = await decodeEcbtKeyInputForSummary(input);
    const summaryOptions: EcbtKeyTreeSummaryOptions = {
        ...(options.sourceName ? { sourceName: options.sourceName } : {}),
        keyFormat: options.keyFormat || inferKeyFormat(input),
    };
    const summary = buildEcbtKeyTreeSummary(decoded, summaryOptions);
    setCurrentEcbtKeyTreeSummary(summary, options);
    return summary;
}

function activateSidePanel(): void {
    const win = window as any;
    if (typeof win.restorePanel === 'function') {
        win.restorePanel('properties', 'ecbt-key');
        return;
    }
    const tab = document.querySelector('.tab[data-tab="ecbt-key"]') as HTMLElement | null;
    tab?.click();
}

export function openEcbtKeyContentsPanel(options: { readonly modal?: boolean } = {}): void {
    if (options.modal) {
        openSummaryModal();
        return;
    }
    activateSidePanel();
    renderEcbtKeyContentsPanel();
}

function countPill(label: string, value: number): string {
    return `
        <span class="ecbt-key-count-pill">
            <strong>${escapeHtml(String(value))}</strong>
            <span>${escapeHtml(label)}</span>
        </span>
    `;
}

function statusLabel(status: string | undefined): string {
    if (status === 'ready') return 'Pronto';
    if (status === 'attention') return 'Revisar';
    if (status === 'blocked') return 'Bloqueado';
    return 'A conferir';
}

function actionArgsAttr(action: EcbtKeyGoAction): string {
    try {
        return escapeAttr(JSON.stringify(action.args || []));
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] action args:', e?.message || e);
        return '[]';
    }
}

function renderGoButton(action: EcbtKeyGoAction, variant: 'compact' | 'wide' = 'compact'): string {
    if (!action || action.type === 'none') return '';
    const label = action.label || 'Abrir destino';
    return `
        <button type="button"
            class="ecbt-key-go-btn ecbt-key-go-btn--${escapeAttr(variant)}"
            title="${escapeAttr(label)}"
            aria-label="${escapeAttr(label)}"
            data-ecbt-summary-action="go"
            data-go-type="${escapeAttr(action.type)}"
            data-go-label="${escapeAttr(label)}"
            data-go-handler="${escapeAttr(action.handler || '')}"
            data-go-tab="${escapeAttr(action.tabId || '')}"
            data-go-fallback-tab="${escapeAttr(action.fallbackTabId || '')}"
            data-go-args="${actionArgsAttr(action)}"
            data-go-fallback-message="${escapeAttr(action.fallbackMessage || '')}">
            <span data-icon="arrow-right-circle" data-icon-size="14px" aria-hidden="true"></span>
            <span>${escapeHtml(label)}</span>
        </button>
    `;
}

function semanticStatusLabel(status: string | undefined): string {
    if (status === 'blocked') return 'bloqueado';
    if (status === 'attention') return 'revisar';
    if (status === 'ready') return 'pronto';
    return 'a conferir';
}

function renderSemanticMapItem(item: EcbtKeySemanticMapItem): string {
    return `
        <article class="ecbt-key-semantic-card ecbt-key-semantic-card--${escapeAttr(item.status || 'unknown')}">
            <div class="ecbt-key-semantic-card-head">
                <span>${escapeHtml(semanticStatusLabel(item.status))}</span>
                ${item.action ? renderGoButton(item.action, 'compact') : ''}
            </div>
            <div class="ecbt-key-semantic-lanes" aria-label="De-para semantico">
                <div>
                    <small>Veio na chave</small>
                    <strong>${escapeHtml(item.from)}</strong>
                </div>
                <div>
                    <small>Significa</small>
                    <strong>${escapeHtml(item.meaning)}</strong>
                </div>
                <div>
                    <small>Abrir no app</small>
                    <strong>${escapeHtml(item.to)}</strong>
                </div>
            </div>
            ${item.reason ? `<p>${escapeHtml(item.reason)}</p>` : ''}
        </article>
    `;
}

function renderSemanticMap(summary: EcbtKeyTreeSummary): string {
    const items = summary.semanticMap || [];
    if (!items.length) return '';
    return `
        <section class="ecbt-key-semantic-map" aria-label="De-para semantico da chave">
            <div class="ecbt-key-semantic-map-head">
                <div>
                    <strong>De-para semantico</strong>
                    <span>Como transformar a chave em uma estrutura navegavel no app.</span>
                </div>
                <span>${escapeHtml(String(items.length))} conexoes</span>
            </div>
            <div class="ecbt-key-semantic-list">
                ${items.map(renderSemanticMapItem).join('')}
            </div>
        </section>
    `;
}

function renderNodeList(nodes: readonly EcbtKeyTreeNode[] | undefined): string {
    const safeNodes = nodes || [];
    if (!safeNodes.length) return '<p class="ecbt-key-muted">Sem itens nesta pasta.</p>';
    return `
        <ul class="ecbt-key-node-list">
            ${safeNodes
                .map((node) => {
                    const meta = node.meta
                        ? Object.entries(node.meta)
                              .filter(([, value]) => value !== null && value !== '')
                              .slice(0, 4)
                              .map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`)
                              .join('')
                        : '';
                    const children = node.children?.length ? renderNodeList(node.children) : '';
                    return `
                        <li class="ecbt-key-node ecbt-key-node--${escapeAttr(node.type)}">
                            <div class="ecbt-key-node-main">
                                <span class="ecbt-key-node-title">${escapeHtml(node.title)}</span>
                                ${typeof node.count === 'number' ? `<span class="ecbt-key-node-count">${node.count}</span>` : ''}
                                ${node.action ? renderGoButton(node.action, 'compact') : ''}
                            </div>
                            ${meta ? `<div class="ecbt-key-node-meta">${meta}</div>` : ''}
                            ${children}
                        </li>
                    `;
                })
                .join('')}
        </ul>
    `;
}

function renderFolder(summary: EcbtKeyTreeSummary, folder: EcbtKeyTreeNode, index: number, total: number): string {
    return `
        <details class="ecbt-key-folder" open data-folder-id="${escapeAttr(folder.id)}">
            <summary>
                <span class="ecbt-key-folder-title">
                    <span class="icon" data-icon="folder" aria-hidden="true"></span>
                    <span>${escapeHtml(folder.title)}</span>
                </span>
                <span class="ecbt-key-folder-tools">
                    ${typeof folder.count === 'number' ? `<span class="ecbt-key-folder-count">${folder.count}</span>` : ''}
                    <span class="ecbt-key-status ecbt-key-status--${escapeAttr(folder.status || 'unknown')}">${escapeHtml(statusLabel(folder.status))}</span>
                    <button type="button" class="ecbt-key-icon-btn" title="Mover para cima" aria-label="Mover pasta para cima" data-ecbt-summary-action="move-folder" data-folder-id="${escapeAttr(folder.id)}" data-dir="-1" ${index === 0 ? 'disabled' : ''}>
                        <span data-icon="chevron-up" data-icon-size="14px"></span>
                    </button>
                    <button type="button" class="ecbt-key-icon-btn" title="Mover para baixo" aria-label="Mover pasta para baixo" data-ecbt-summary-action="move-folder" data-folder-id="${escapeAttr(folder.id)}" data-dir="1" ${index === total - 1 ? 'disabled' : ''}>
                        <span data-icon="chevron-down" data-icon-size="14px"></span>
                    </button>
                </span>
            </summary>
            ${renderNodeList(folder.children)}
        </details>
    `;
}

function emptyHtml(): string {
    return `
        <section class="ecbt-key-summary-shell ecbt-key-summary-empty">
            <div class="ecbt-key-summary-heading">
                <h3>O que voce encontrara nessa chave</h3>
                <p>Nenhuma chave ECBT foi aberta nesta sessao. Importe uma chave para ver aqui a estrutura de pastas, arquivos, aulas e modulos relacionados.</p>
            </div>
            <button type="button" class="btn btn-secondary" data-ecbt-summary-action="open-import">
                <span class="icon" data-icon="upload"></span>
                <span>Importar chave</span>
            </button>
        </section>
    `;
}

function summaryHtml(summary: EcbtKeyTreeSummary, mode: 'panel' | 'modal'): string {
    const folders = orderedRootChildren(summary).filter((folder) => folder.id !== 'semantic-map');
    return `
        <section class="ecbt-key-summary-shell" data-summary-id="${escapeAttr(summary.id)}" data-summary-mode="${mode}">
            <div class="ecbt-key-summary-heading">
                <div>
                    <h3>O que voce encontrara nessa chave</h3>
                    <p>${escapeHtml(summary.title)}</p>
                    <p class="ecbt-key-summary-contains">${escapeHtml(
                        `Esta chave contem ${summary.counts.lessons} licao(oes), ${summary.counts.files} arquivo(s), ${summary.counts.liveModules} modulo(s) vivo(s) e ${summary.counts.warnings} aviso(s).`,
                    )}</p>
                </div>
                <div class="ecbt-key-summary-actions">
                    ${mode === 'panel'
                        ? `<button type="button" class="ecbt-key-icon-btn" title="Abrir em janela" aria-label="Abrir resumo em janela" data-ecbt-summary-action="open-modal"><span data-icon="maximize" data-icon-size="14px"></span></button>`
                        : `<button type="button" class="ecbt-key-icon-btn" title="Abrir no menu lateral" aria-label="Abrir resumo no menu lateral" data-ecbt-summary-action="open-panel"><span data-icon="layout" data-icon-size="14px"></span></button>`}
                </div>
            </div>
            <div class="ecbt-key-summary-meta">
                <span>Tipo: ${escapeHtml(summary.type)}</span>
                ${summary.keyFormat ? `<span>Formato: ${escapeHtml(summary.keyFormat)}</span>` : ''}
                ${typeof summary.schemaVersion === 'number' ? `<span>Schema: ${summary.schemaVersion}</span>` : ''}
            </div>
            <div class="ecbt-key-counts">
                ${countPill('licoes', summary.counts.lessons)}
                ${countPill('slides', summary.counts.slides)}
                ${countPill('arquivos', summary.counts.files)}
                ${countPill('modulos', summary.counts.liveModules)}
                ${countPill('avisos', summary.counts.warnings)}
            </div>
            ${renderSemanticMap(summary)}
            <div class="ecbt-key-tree">
                ${folders.map((folder, index) => renderFolder(summary, folder, index, folders.length)).join('')}
            </div>
        </section>
    `;
}

function currentSummary(): EcbtKeyTreeSummary | null {
    if (_summary) return _summary;
    _summary = loadStoredSummary();
    return _summary;
}

export function renderEcbtKeyContentsPanel(): void {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const summary = currentSummary();
    host.innerHTML = summary ? summaryHtml(summary, 'panel') : emptyHtml();
    attachActionHandlers(host);
    hydrate(host);
}

function ensureModal(): HTMLElement {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay ecbt-key-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl ecbt-key-dialog">
            <div class="ecbt-header">
                <h2 class="ecbt-title">Conteudo da chave ECBT</h2>
                <button type="button" class="ecbt-close" aria-label="Fechar" data-ecbt-summary-action="close-modal">&times;</button>
            </div>
            <div class="ecbt-key-modal-body"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeSummaryModal();
    });
    attachActionHandlers(modal);
    return modal;
}

function openSummaryModal(): void {
    const modal = ensureModal();
    const body = modal.querySelector('.ecbt-key-modal-body') as HTMLElement | null;
    const summary = currentSummary();
    if (body) {
        body.innerHTML = summary ? summaryHtml(summary, 'modal') : emptyHtml();
        attachActionHandlers(body);
        hydrate(body);
    }
    modal.style.display = 'flex';
    modal.classList.add('active');
    hydrate(modal);
}

function closeSummaryModal(): void {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

function closeCoursePreviewModal(): void {
    const modal = document.getElementById(COURSE_PREVIEW_MODAL_ID);
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

function summaryFolder(summary: EcbtKeyTreeSummary, folderId: string): EcbtKeyTreeNode | null {
    return (summary.root.children || []).find((node) => node.id === folderId) || null;
}

function summaryFolderChildren(summary: EcbtKeyTreeSummary, folderId: string): readonly EcbtKeyTreeNode[] {
    return summaryFolder(summary, folderId)?.children || [];
}

function cleanLessonTitle(title: string): string {
    return String(title || '').replace(/^\s*\d+\.\s*/, '').trim() || 'Slide sem titulo';
}

function renderCoursePreviewLessons(summary: EcbtKeyTreeSummary): string {
    const lessons = summaryFolderChildren(summary, 'lessons').filter((node) => node.type === 'lesson');
    if (!lessons.length) {
        return '<p class="ecbt-key-muted">A chave nao trouxe uma lista de slides navegavel.</p>';
    }
    return `
        <ol class="ecbt-key-course-slide-list">
            ${lessons
                .map((lesson, index) => {
                    const type = lesson.meta?.type ? String(lesson.meta.type) : 'slide';
                    const lessonId = lesson.meta?.id ? String(lesson.meta.id) : lesson.id;
                    return `
                        <li>
                            <span class="ecbt-key-course-slide-number">${escapeHtml(String(index + 1))}</span>
                            <div>
                                <strong>${escapeHtml(cleanLessonTitle(lesson.title))}</strong>
                                <small>${escapeHtml(`Tipo: ${type}`)}${lessonId ? escapeHtml(` - ID: ${lessonId}`) : ''}</small>
                            </div>
                        </li>
                    `;
                })
                .join('')}
        </ol>
    `;
}

function previewSupportItems(summary: EcbtKeyTreeSummary): EcbtKeySemanticMapItem[] {
    return (summary.semanticMap || [])
        .filter((item) => {
            const action = item.action;
            if (!action || action.type === 'none') return false;
            return !(action.handler === 'handleOpenTraining' && /\bppt\b/i.test(action.label || ''));
        })
        .slice(0, 8);
}

function renderCoursePreviewSupport(summary: EcbtKeyTreeSummary): string {
    const items = previewSupportItems(summary);
    const openTrainingAction: EcbtKeyGoAction = {
        label: 'Abrir Training',
        type: 'handler',
        handler: 'handleOpenTraining',
        args: [{ activeTab: 'myCourses', skipResume: true }],
        fallbackMessage: 'Training nao esta disponivel nesta tela; use esta visao como roteiro da chave.',
    };
    return `
        <div class="ecbt-key-course-support-grid">
            <article class="ecbt-key-course-support-card">
                <span>Editor da aula</span>
                <strong>Training / painel PPT</strong>
                <p>Use este atalho para continuar editando quando o curso ja estiver salvo no modulo Training.</p>
                ${renderGoButton(openTrainingAction, 'wide')}
            </article>
            ${items
                .map(
                    (item) => `
                        <article class="ecbt-key-course-support-card">
                            <span>${escapeHtml(item.from)}</span>
                            <strong>${escapeHtml(item.to)}</strong>
                            <p>${escapeHtml(item.meaning)}</p>
                            ${item.action ? renderGoButton(item.action, 'wide') : ''}
                        </article>
                    `,
                )
                .join('')}
        </div>
    `;
}

function renderCoursePreviewWarnings(summary: EcbtKeyTreeSummary): string {
    if (!summary.warnings.length) {
        return '<p class="ecbt-key-course-ok">Nenhum aviso critico encontrado nesta chave.</p>';
    }
    return `
        <ul class="ecbt-key-course-warning-list">
            ${summary.warnings
                .slice(0, 6)
                .map((warning) => `<li>${escapeHtml(warning.message)}</li>`)
                .join('')}
        </ul>
    `;
}

function renderCoursePreviewHtml(summary: EcbtKeyTreeSummary): string {
    return `
        <section class="ecbt-key-course-preview" data-summary-id="${escapeAttr(summary.id)}">
            <div class="ecbt-key-course-breadcrumb">Chave ECBT &gt; PPT/Training</div>
            <div class="ecbt-key-course-hero">
                <div>
                    <span>Curso recebido pela chave</span>
                    <h3>${escapeHtml(summary.title)}</h3>
                    <p>${escapeHtml(
                        `Esta chave contem ${summary.counts.slides} slide(s), ${summary.counts.files} arquivo(s) de apoio e ${summary.counts.liveModules} modulo(s) vivo(s) para a aula.`,
                    )}</p>
                </div>
                <div class="ecbt-key-course-stats" aria-label="Resumo do curso recebido">
                    ${countPill('slides', summary.counts.slides)}
                    ${countPill('arquivos', summary.counts.files)}
                    ${countPill('modulos', summary.counts.liveModules)}
                    ${countPill('avisos', summary.counts.warnings)}
                </div>
            </div>
            <div class="ecbt-key-course-layout">
                <section class="ecbt-key-course-block">
                    <div class="ecbt-key-course-block-head">
                        <strong>Ordem dos slides</strong>
                        <span>Roteiro que o professor deve enxergar antes da aula.</span>
                    </div>
                    ${renderCoursePreviewLessons(summary)}
                </section>
                <section class="ecbt-key-course-block">
                    <div class="ecbt-key-course-block-head">
                        <strong>Atalhos vivos da aula</strong>
                        <span>De-para da chave para os modulos do app.</span>
                    </div>
                    ${renderCoursePreviewSupport(summary)}
                </section>
                <section class="ecbt-key-course-block">
                    <div class="ecbt-key-course-block-head">
                        <strong>Conferencias antes de apresentar</strong>
                        <span>Itens que ainda podem quebrar a jornada em sala.</span>
                    </div>
                    ${renderCoursePreviewWarnings(summary)}
                </section>
            </div>
        </section>
    `;
}

function ensureCoursePreviewModal(): HTMLElement {
    let modal = document.getElementById(COURSE_PREVIEW_MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = COURSE_PREVIEW_MODAL_ID;
    modal.className = 'ecbt-overlay ecbt-key-course-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl ecbt-key-course-dialog">
            <div class="ecbt-header">
                <h2 class="ecbt-title">PPT recebido na chave</h2>
                <button type="button" class="ecbt-close" aria-label="Fechar visualizacao do curso" data-ecbt-summary-action="close-course-preview">&times;</button>
            </div>
            <div class="ecbt-key-course-modal-body"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeCoursePreviewModal();
    });
    attachActionHandlers(modal);
    return modal;
}

function openCoursePreviewModal(): void {
    const summary = currentSummary();
    if (!summary || summary.type !== 'training_course') {
        showGoToast('Esta chave ainda nao contem um curso Training navegavel.', 'warning');
        return;
    }
    closeSummaryModal();
    const modal = ensureCoursePreviewModal();
    const body = modal.querySelector('.ecbt-key-course-modal-body') as HTMLElement | null;
    if (body) {
        body.innerHTML = renderCoursePreviewHtml(summary);
        attachActionHandlers(body);
        hydrate(body);
    }
    modal.style.display = 'flex';
    modal.classList.add('active');
    hydrate(modal);
}

function moveFolder(folderId: string, dir: number): void {
    const summary = currentSummary();
    if (!summary) return;
    const order = getFolderOrder(summary);
    const index = order.indexOf(folderId);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const copy = [...order];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item!);
    setFolderOrder(summary, copy);
    renderEcbtKeyContentsPanel();
    const modal = document.getElementById(MODAL_ID);
    if (modal?.classList.contains('active')) openSummaryModal();
}

function parseGoArgs(value: string): readonly unknown[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] go args:', e?.message || e);
        return [];
    }
}

function showGoToast(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
    const win = window as any;
    if (typeof win.showToast === 'function') {
        win.showToast(message, type);
        return;
    }
    showToast(message, type);
}

function activateGoTab(tabId: string): boolean {
    if (!tabId) return false;
    activateTabById(tabId);
    return Array.from(document.querySelectorAll<HTMLElement>('.tab.active')).some((tab) => tab.dataset.tab === tabId);
}

function fallbackTabsForClick(button: HTMLElement): string[] {
    const out: string[] = [];
    const add = (tabId: string): void => {
        if (tabId && !out.includes(tabId)) out.push(tabId);
    };
    add(button.dataset.goFallbackTab || '');
    const handlerName = button.dataset.goHandler || '';
    for (const tabId of FALLBACK_TABS_BY_HANDLER[handlerName] || []) add(tabId);
    add(button.dataset.goTab || '');
    return out;
}

function openFallbackTab(button: HTMLElement): string {
    for (const tabId of fallbackTabsForClick(button)) {
        if (activateGoTab(tabId)) return tabId;
    }
    return '';
}

async function runGoAction(button: HTMLElement): Promise<void> {
    const goType = button.dataset.goType || '';
    const label = button.dataset.goLabel || 'Abrir destino';
    const handlerName = button.dataset.goHandler || '';
    const tabId = button.dataset.goTab || '';
    const fallbackMessage = button.dataset.goFallbackMessage || 'Destino ainda nao esta disponivel nesta tela.';
    const args = parseGoArgs(button.dataset.goArgs || '');
    const win = window as any;
    const summary = currentSummary();
    if (summary?.type === 'training_course' && handlerName === 'handleOpenTraining' && /\bppt\b/i.test(label)) {
        openCoursePreviewModal();
        return;
    }
    if (goType === 'handler' && handlerName && typeof win[handlerName] === 'function') {
        closeCoursePreviewModal();
        closeSummaryModal();
        try {
            await Promise.resolve(win[handlerName](...args));
            showGoToast(`${label} aberto.`, 'success');
            return;
        } catch (e: any) {
            console.warn('[ecbtKeyContentsPanel] click-go handler failed:', e?.message || e);
        }
    }
    if (goType === 'tab' && tabId && activateGoTab(tabId)) {
        closeCoursePreviewModal();
        closeSummaryModal();
        showGoToast(`${label} aberto.`, 'success');
        return;
    }
    const openedFallback = openFallbackTab(button);
    if (openedFallback) {
        closeCoursePreviewModal();
        closeSummaryModal();
        showGoToast(`${fallbackMessage} Aba aberta: ${openedFallback}.`, 'warning');
        return;
    }
    showGoToast(fallbackMessage, 'warning');
}

function attachActionHandlers(root: HTMLElement): void {
    if ((root as any)._ecbtKeySummaryBound) return;
    (root as any)._ecbtKeySummaryBound = true;
    root.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest('[data-ecbt-summary-action]') as HTMLElement | null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.ecbtSummaryAction || '';
        if (action === 'open-import') {
            (window as any).openImportModal?.();
        } else if (action === 'open-modal') {
            openSummaryModal();
        } else if (action === 'open-panel') {
            closeSummaryModal();
            openEcbtKeyContentsPanel({ modal: false });
        } else if (action === 'close-modal') {
            closeSummaryModal();
        } else if (action === 'close-course-preview') {
            closeCoursePreviewModal();
        } else if (action === 'move-folder') {
            moveFolder(button.dataset.folderId || '', Number(button.dataset.dir) || 0);
        } else if (action === 'go') {
            void runGoAction(button);
        }
    });
}

function hydrate(root: HTMLElement): void {
    try {
        (window as any).hydrateIcons?.(root);
    } catch (e: any) {
        console.debug('[ecbtKeyContentsPanel] hydrate icons:', e?.message || e);
    }
}

export function initEcbtKeyContentsPanel(): void {
    if (_initialized) return;
    _initialized = true;
    _summary = loadStoredSummary();
    (window as any).openEcbtKeyContentsPanel = openEcbtKeyContentsPanel;
    (window as any).renderEcbtKeyContentsPanel = renderEcbtKeyContentsPanel;
    (window as any).summarizeEcbtKeyInputForPanel = summarizeEcbtKeyInputForPanel;
    window.addEventListener('tabChanged', (event: any) => {
        if (event?.detail?.tab === 'ecbt-key') renderEcbtKeyContentsPanel();
    });
    renderEcbtKeyContentsPanel();
}
