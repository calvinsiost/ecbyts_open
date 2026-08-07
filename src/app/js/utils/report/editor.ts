// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   REPORT EDITOR — Contenteditable rich-text editor with scene anchors
   Editor de texto rico com ancoras de cena para relatorios ambientais

   Renderiza toolbar (negrito, italico, titulo, listas, HR, blockquote)
   + area contenteditable. Suporta reparent entre containers
   (constellation HUD ↔ overlay full-screen).

   Ancoras de cena sao chips inline que, ao clicar, animam a camera.
   IntersectionObserver dispara transicoes de camera ao scrollar.
   ================================================================ */
import { getReport, setReportContent } from './manager.js';
import { getAllScenes, getSceneById } from '../scenes/manager.js';
import { animateCameraState } from '../scene/controls.js';
import { t } from '../i18n/translations.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
// eslint-disable-next-line
const showToast = _showToastImpl;
import { asyncPrompt } from '../ui/asyncDialogs.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
/** @type {any} */
let editorDiv: HTMLElement | null = null;
/** @type {any} */
let toolbarEl: HTMLElement | null = null;
/** @type {any} */
let resizeHandleEl: HTMLElement | null = null;
/** @type {any} */
let pickerEl: HTMLElement | null = null;
/** @type {any} */
let debounceTimer: any = null;
/** @type {any} */
let anchorObserver: IntersectionObserver | null = null;
/** @type {any} */
let lastTriggeredScene: string | null = null;
let lastTriggerTime = 0;
let _readOnly = false;
/** @type {any} */
let tooltipEl: HTMLElement | null = null;
/** @type {Map<string, string>} */
const thumbnailCache = new Map();
/** @type {any} */
let metricPickerEl: HTMLElement | null = null;
/** @type {any} */
let mcaMenuEl: HTMLElement | null = null;
// ----------------------------------------------------------------
// METRIC ANCHOR TYPES - icons como HTML entities (sem emojis)
// ----------------------------------------------------------------
const METRIC_TYPES = [
    { id: 'projectSummary', icon: '&#9632;', labelKey: 'exportSectionProjectSummary', fallback: 'Project Summary' },
    { id: 'eis', icon: '&#9670;', labelKey: 'exportSectionEIS', fallback: 'EIS Integrity Score' },
    { id: 'costSummary', icon: '&#9733;', labelKey: 'exportSectionCost', fallback: 'Cost Summary' },
    { id: 'compliance', icon: '&#9650;', labelKey: 'exportSectionCompliance', fallback: 'Compliance' },
    { id: 'eva', icon: '&#9654;', labelKey: 'exportSectionEVA', fallback: 'EVA Analysis' },
    {
        id: 'elementInventory',
        icon: '&#9679;',
        labelKey: 'exportSectionElementInventory',
        fallback: 'Element Inventory',
    },
    { id: 'campaignSummary', icon: '&#9643;', labelKey: 'exportSectionCampaignSummary', fallback: 'Campaign Summary' },
    { id: 'calculator', icon: '&#9881;', labelKey: 'exportSectionCalculator', fallback: 'Calculator Metrics' },
    {
        id: 'complianceMatrix',
        icon: '&#9638;',
        labelKey: 'exportSectionComplianceMatrix',
        fallback: 'Compliance Matrix',
    },
];
// ----------------------------------------------------------------
// INITIALIZATION
// Cria toolbar + contenteditable dentro do container fornecido
// ----------------------------------------------------------------
/**
 * Initialize report editor inside the given container element.
 * Monta toolbar e area editavel, carrega conteudo salvo.
 *
 * @param {HTMLElement} container - #report-editor-container
 */
export function initReportEditor(container: HTMLElement) {
    if (!container) return;
    // Evita dupla inicializacao
    if (editorDiv) return;
    // Resize handle (topo do HUD expandido)
    resizeHandleEl = document.createElement('div');
    resizeHandleEl.className = 'report-resize-handle';
    _setupResizeHandle(resizeHandleEl);
    container.appendChild(resizeHandleEl);
    // Toolbar
    toolbarEl = _buildToolbar();
    container.appendChild(toolbarEl);
    // Contenteditable
    editorDiv = document.createElement('div');
    editorDiv.id = 'report-editor-content';
    editorDiv.className = 'report-editor-content';
    editorDiv.contentEditable = 'true';
    editorDiv.setAttribute('data-placeholder', t('reportPlaceholder'));
    container.appendChild(editorDiv);
    // Carrega conteudo salvo
    const report = getReport();
    if (report.content) {
        editorDiv.innerHTML = report.content;
    }
    // Paste: forca plain text para prevenir XSS via clipboard
    editorDiv.addEventListener('paste', _onPastePlainText);
    // Sync de conteudo com debounce (salva a cada 500ms)
    editorDiv.addEventListener('input', _onEditorInput);
    // Click em ancoras de cena
    editorDiv.addEventListener('click', _onEditorClick);
    // Hover para thumbnail em scene anchors
    editorDiv.addEventListener('mouseover', _onAnchorHover);
    editorDiv.addEventListener('mouseout', _onAnchorLeave);
    // IntersectionObserver para transicoes ao scrollar
    _setupScrollObserver();
    // Marca ancoras orfas (cenas excluidas)
    _refreshOrphanAnchors();
}
/**
 * Sync editor content from manager state (after import).
 * Atualiza conteudo do editor a partir do estado do manager.
 */
export function updateReportEditor() {
    if (!editorDiv) return;
    const report = getReport();
    editorDiv.innerHTML = report.content || '';
    _refreshOrphanAnchors();
    _setupScrollObserver();
}
/**
 * Switch editor to the currently active report.
 * Flush debounce pendente, carrega conteudo do novo relatorio ativo.
 * Chamado pelo handler ao trocar de relatorio na tree view.
 */
export function switchEditorReport() {
    // Flush pending debounce
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    // Reload content from new active report
    updateReportEditor();
}
// ----------------------------------------------------------------
// REPARENT - Move editor entre containers (constellation ↔ overlay)
// ----------------------------------------------------------------
/**
 * Get the editor contenteditable element.
 * @returns {HTMLElement|null}
 */
export function getEditorElement() {
    return editorDiv;
}
/**
 * Reparent editor DOM (resize handle + toolbar + contenteditable)
 * to a different container. Reinicia observers apos mover.
 *
 * @param {HTMLElement} targetContainer - Novo container pai
 */
export function reparentEditor(targetContainer: HTMLElement) {
    if (!editorDiv || !targetContainer) return;
    // Move na ordem: resize handle, toolbar, editor
    if (resizeHandleEl) targetContainer.appendChild(resizeHandleEl);
    if (toolbarEl) targetContainer.appendChild(toolbarEl);
    targetContainer.appendChild(editorDiv);
    // Reinicia IntersectionObserver (root muda com o container)
    _setupScrollObserver();
    _refreshOrphanAnchors();
}
// ----------------------------------------------------------------
// READ-ONLY MODE
// ----------------------------------------------------------------
/**
 * Toggle read-only mode.
 * @param {boolean} readonly
 */
export function setReadOnly(readonly: boolean) {
    _readOnly = !!readonly;
    if (editorDiv) {
        editorDiv.contentEditable = _readOnly ? 'false' : 'true';
    }
}
/**
 * Check if editor is in read-only mode.
 * @returns {boolean}
 */
export function isReadOnly() {
    return _readOnly;
}
// ----------------------------------------------------------------
// SCROLL / INSERT / ANCHOR
// ----------------------------------------------------------------
/**
 * Scroll the editor to the anchor matching the given scene ID.
 * Rola o editor ate a ancora da cena especificada (sync bidirecional).
 *
 * @param {string} sceneId
 */
export function scrollToAnchor(sceneId: string) {
    if (!editorDiv) return;
    const anchor = editorDiv.querySelector(`.report-scene-anchor[data-scene-id="${sceneId}"]`);
    if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash effect
        anchor.classList.add('report-scene-anchor--active');
        setTimeout(() => anchor.classList.remove('report-scene-anchor--active'), 1500);
    }
}
/**
 * Insert a scene anchor at the current cursor position.
 * Insere chip de ancora de cena na posicao do cursor.
 *
 * @param {string} sceneId
 */
export function insertSceneAnchor(sceneId: string) {
    if (!editorDiv || _readOnly) return;
    const scene = getSceneById(sceneId);
    if (!scene) return;
    // Foca o editor se necessario
    editorDiv.focus();
    const anchorHtml = `<span class="report-scene-anchor" data-scene-id="${sceneId}" contenteditable="false">&#9654; [Scene: ${_escapeHtml(scene.name)}]</span>&nbsp;`;
    // Usa insertHTML para inserir na posicao do cursor
    document.execCommand('insertHTML', false, anchorHtml);
    // Salva
    clearTimeout(debounceTimer);
    setReportContent(editorDiv.innerHTML);
    // Re-observa as ancoras
    _setupScrollObserver();
}
/**
 * Insert a metric anchor at the current cursor position.
 * Insere chip de ancora de metrica na posicao do cursor.
 * Se filterPresetId fornecido, vincula o filtro a ancora.
 *
 * @param {string} metricType - One of METRIC_TYPES[].id
 * @param {string} [filterPresetId?] - Optional filter preset ID
 */
export function insertMetricAnchor(metricType: string, filterPresetId?: string | null) {
    if (!editorDiv || _readOnly) return;
    const def = METRIC_TYPES.find((m) => m.id === metricType);
    if (!def) return;
    editorDiv.focus();
    const label = t(def.labelKey) || def.fallback;
    const filterAttr = filterPresetId ? ` data-filter-preset="${filterPresetId}"` : '';
    const anchorHtml = `<span class="report-metric-anchor" data-metric-type="${metricType}"${filterAttr} contenteditable="false">${def.icon} [${_escapeHtml(label)}]</span>&nbsp;`;
    document.execCommand('insertHTML', false, anchorHtml);
    clearTimeout(debounceTimer);
    setReportContent(editorDiv.innerHTML);
}
/**
 * Insert pre-built figure HTML (<figure><img>…</figure>) at the cursor position.
 * O HTML já vem sanitizado por _reportFigurePure.buildFigureHtml (src allowlist +
 * caption escapada). Usado pelo seletor de figuras (Files / cena 3D / gráfico).
 *
 * @param {string} figureHtml - HTML de <figure> já sanitizado
 * @returns {boolean} true se inserido
 */
export function insertFigureHtml(figureHtml: string): boolean {
    if (!editorDiv || _readOnly) return false;
    if (!figureHtml || typeof figureHtml !== 'string') return false;
    editorDiv.focus();
    document.execCommand('insertHTML', false, figureHtml);
    clearTimeout(debounceTimer);
    setReportContent(editorDiv.innerHTML);
    return true;
}
// ----------------------------------------------------------------
// EVENT HANDLERS
// ----------------------------------------------------------------
/** @private */
function _onEditorInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (editorDiv) setReportContent(editorDiv.innerHTML);
    }, 500);
}
/**
 * Paste handler: force plain text to prevent XSS via clipboard.
 * Intercepta paste de HTML e insere apenas o texto plano.
 * @param {ClipboardEvent} e
 */
function _onPastePlainText(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
}
/**
 * @private
 * @param {any} e
 */
function _onEditorClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest('.report-scene-anchor') as HTMLElement | null;
    if (anchor) {
        e.preventDefault();
        const sceneId = anchor.dataset.sceneId || '';
        if (sceneId) window.handleReportAnchorClick?.(sceneId);
        return;
    }
    // Botão ✎ no header da figura — abre modal de edição (Opção A Calvin 2026-06-01).
    // Tem precedência sobre o click-to-3D do <figure> (closest .report-fc-edit-btn fica
    // dentro do closest .report-figure-linked, mas o stopPropagation aqui evita o segundo).
    const editBtn = target?.closest('.report-fc-edit-btn') as HTMLElement | null;
    if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const fig = editBtn.closest('.report-figure-corporate') as HTMLElement | null;
        if (fig) _openFigureEdit(fig);
        return;
    }
    // Figura corporativa com origem 3D: data-figure-provider + opcional data-figure-{element|group|plume|photo}-id.
    // Click leva o usuário ao objeto/foto que gerou a figura.
    const fig = target?.closest('.report-figure-linked') as HTMLElement | null;
    if (fig) {
        e.preventDefault();
        _handleFigureClick(fig);
    }
}

async function _openFigureEdit(figEl: HTMLElement) {
    try {
        const m: any = await import('./figureEditModal.js' as string);
        await m.openFigureEditModal?.(figEl);
    } catch (e: any) {
        console.debug('[editor:openFigureEdit]', e?.message || e);
    }
}

/**
 * Resolve o destino da figura clicada e navega:
 *   - elementId → handleSelectElement (seleciona + destaca no 3D)
 *   - photoId   → abre PhotoLog gallery focando a foto
 *   - groupId   → seleciona elementos do grupo (fallback: primeiro elemento)
 *   - sem scope → toast informativo (sem destino)
 */
function _handleFigureClick(fig: HTMLElement) {
    const elementId = fig.getAttribute('data-figure-element-id') || '';
    const photoId = fig.getAttribute('data-figure-photo-id') || '';
    const provider = fig.getAttribute('data-figure-provider') || '';
    if (elementId) {
        try {
            (window as any).handleSelectElement?.(elementId);
            (window as any).showToast?.(`Selecionado no 3D: ${elementId}`, 'info', 2500);
        } catch (err: any) {
            console.debug('[editor:figure-click:select]', err?.message || err);
        }
        return;
    }
    if (photoId) {
        try {
            (window as any).handleOpenPhotoGallery?.({ photoId });
            (window as any).showToast?.('Abrindo foto…', 'info', 2000);
        } catch (err: any) {
            console.debug('[editor:figure-click:photo]', err?.message || err);
        }
        return;
    }
    // Sem scope específico — figura agregada (ex: mapa geo-pedo do site inteiro).
    try {
        (window as any).showToast?.(`Figura ${provider || ''} — sem destino 3D específico (foi gerada do site inteiro)`, 'info', 3000);
    } catch (err: any) {
        console.debug('[editor:figure-click:noscope]', err?.message || err);
    }
}
// ----------------------------------------------------------------
// SCENE ANCHOR THUMBNAIL - Hover tooltip com preview da camera
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} e
 */
function _onAnchorHover(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest('.report-scene-anchor') as HTMLElement | null;
    if (!anchor) return;
    const sceneId = anchor.dataset?.sceneId;
    if (!sceneId) return;
    const scene = getSceneById(sceneId);
    if (!scene?.viewStart) return;
    // Cria tooltip se necessario
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'report-scene-tooltip';
        document.body.appendChild(tooltipEl);
    }
    // Verifica cache de thumbnail
    const cached = thumbnailCache.get(sceneId);
    if (cached) {
        _showTooltip(anchor, scene.name, cached);
    } else {
        // Gera thumbnail async (import dinamico para evitar dep circular)
        _generateThumbnail(sceneId, scene).then((dataUrl) => {
            if (dataUrl) _showTooltip(anchor, scene.name, dataUrl);
        });
    }
}
/**
 * @private
 * @param {any} e
 */
function _onAnchorLeave(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest('.report-scene-anchor');
    if (!anchor && tooltipEl) {
        tooltipEl.classList.remove('visible');
    }
}
/**
 * @private
 * @param {any} anchorEl
 * @param {string} sceneName
 * @param {string} imgDataUrl
 */
function _showTooltip(anchorEl: HTMLElement, sceneName: string, imgDataUrl: string) {
    if (!tooltipEl) return;
    tooltipEl.innerHTML = `
        <img src="${imgDataUrl}" alt="${_escapeHtml(sceneName)}">
        <div class="report-scene-tooltip-label">${_escapeHtml(sceneName)}</div>
    `;
    // Posiciona acima do anchor
    const rect = anchorEl.getBoundingClientRect();
    const currentTooltip = tooltipEl;
    if (!currentTooltip) return;
    currentTooltip.style.left = `${rect.left}px`;
    currentTooltip.style.top = `${rect.top - 160}px`;
    // Ajusta se sair da tela
    requestAnimationFrame(() => {
        const tr = currentTooltip.getBoundingClientRect();
        if (tr.top < 0) currentTooltip.style.top = `${rect.bottom + 8}px`;
        if (tr.right > window.innerWidth) currentTooltip.style.left = `${window.innerWidth - tr.width - 8}px`;
    });
    currentTooltip.classList.add('visible');
}
/**
 * @private
 * @param {string} sceneId
 * @param {any} scene
 */
async function _generateThumbnail(sceneId: string, scene: any) {
    try {
        const { captureSceneScreenshot } = await import('./pdfExport.js');
        const dataUrl = captureSceneScreenshot(scene.viewStart);
        if (dataUrl) thumbnailCache.set(sceneId, dataUrl);
        return dataUrl;
    } catch {
        return null;
    }
}
// ----------------------------------------------------------------
// TOOLBAR
// Barra de ferramentas: B, I, H1-3, listas, HR, blockquote, cenas, PDF
// ----------------------------------------------------------------
/** @private */
function _buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'report-editor-toolbar';
    // Formatting buttons
    const fmtButtons = [
        { cmd: 'bold', label: 'B', title: t('reportBold'), style: 'font-weight:700' },
        { cmd: 'italic', label: 'I', title: t('reportItalic'), style: 'font-style:italic' },
        { cmd: 'formatBlock:h1', label: 'H1', title: t('reportHeading') + ' 1' },
        { cmd: 'formatBlock:h2', label: 'H2', title: t('reportHeading') + ' 2' },
        { cmd: 'formatBlock:h3', label: 'H3', title: t('reportHeading') + ' 3' },
        { cmd: 'insertUnorderedList', label: '•', title: t('reportBulletList') },
        { cmd: 'insertOrderedList', label: '1.', title: t('reportNumberedList') },
        { cmd: 'formatBlock:blockquote', label: '“', title: t('reportBlockquote') || 'Citacao' },
        { cmd: 'insertHorizontalRule', label: '—', title: t('reportHorizontalRule') || 'Linha horizontal' },
    ];
    fmtButtons.forEach((btn) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'report-toolbar-btn';
        el.title = btn.title;
        el.innerHTML = `<span style="${btn.style || ''}">${btn.label}</span>`;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (_readOnly) return;
            if (btn.cmd.startsWith('formatBlock:')) {
                document.execCommand('formatBlock', false, btn.cmd.split(':')[1]);
            } else {
                document.execCommand(btn.cmd, false, undefined);
            }
            editorDiv?.focus();
        });
        toolbar.appendChild(el);
    });
    // Separator
    const sep1 = document.createElement('div');
    sep1.className = 'report-toolbar-separator';
    toolbar.appendChild(sep1);
    // Insert Scene button
    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'report-toolbar-btn';
    insertBtn.title = t('insertScene');
    insertBtn.innerHTML = `<span style="font-size:10px">&#9654;</span> ${t('insertScene')}`;
    insertBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _toggleScenePicker(insertBtn);
    });
    toolbar.appendChild(insertBtn);
    // Insert Metric button
    const insertMetricBtn = document.createElement('button');
    insertMetricBtn.type = 'button';
    insertMetricBtn.className = 'report-toolbar-btn';
    insertMetricBtn.title = t('insertMetric');
    insertMetricBtn.innerHTML = `<span style="font-size:10px">&#9638;</span> ${t('insertMetric')}`;
    insertMetricBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _toggleMetricPicker(insertMetricBtn);
    });
    toolbar.appendChild(insertMetricBtn);
    // Insert Figure button (P2: figuras de Files / cena 3D)
    const insertFigureBtn = document.createElement('button');
    insertFigureBtn.type = 'button';
    insertFigureBtn.className = 'report-toolbar-btn';
    insertFigureBtn.title = t('reportFigure.title') || 'Inserir figura';
    insertFigureBtn.innerHTML = `<span style="font-size:10px">&#9645;</span> ${t('reportFigure.short') || 'Figura'}`;
    insertFigureBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_readOnly) return;
        const { openFigurePicker } = await import('./_reportFigureInsert.js');
        openFigurePicker();
    });
    toolbar.appendChild(insertFigureBtn);
    // Figuras do ecbyts (seleção): abre o seletor de figuras por recorte do dataset
    // (raio 500 m por área/zona/pluma, cena 3D, mapas geo/pedo) — usuário escolhe quais.
    const autoFiguresBtn = document.createElement('button');
    autoFiguresBtn.type = 'button';
    autoFiguresBtn.className = 'report-toolbar-btn';
    autoFiguresBtn.title = t('reportFigure.autoTitle') || 'Selecionar figuras do ecbyts (raio 500 m por área/pluma, cena 3D, mapas geo/pedo)';
    autoFiguresBtn.innerHTML = `<span style="font-size:10px">&#9670;</span> ${t('reportFigure.autoShort') || 'Figuras ecbyts'}`;
    autoFiguresBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_readOnly) return;
        const { openFigureSelectModal } = await import('./figureSelectModal.js');
        openFigureSelectModal();
    });
    toolbar.appendChild(autoFiguresBtn);
    // Insert MCA button (P1-11 Fase B: Modelo Conceitual da Área — seção + diagrama)
    const insertMcaBtn = document.createElement('button');
    insertMcaBtn.type = 'button';
    insertMcaBtn.className = 'report-toolbar-btn';
    insertMcaBtn.title = t('mca.insert') || 'Inserir Modelo Conceitual da Área';
    insertMcaBtn.innerHTML = `<span style="font-size:10px">&#9671;</span> ${t('mca.short') || 'MCA'}`;
    insertMcaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_readOnly) return;
        _toggleMcaMenu(insertMcaBtn);
    });
    toolbar.appendChild(insertMcaBtn);
    // Insert Responsibility Declaration button (CETESB DD 038/2017 itens s/t, q/r)
    const insertRespBtn = document.createElement('button');
    insertRespBtn.type = 'button';
    insertRespBtn.className = 'report-toolbar-btn';
    insertRespBtn.title = t('responsibility.insert') || 'Inserir Declaração de Responsabilidade';
    insertRespBtn.textContent = t('responsibility.short') || 'Declaração';
    insertRespBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_readOnly) return;
        const { buildResponsibilityBlockHtml } = await import('../../core/report/_responsibilityBlockPure.js');
        insertFigureHtml(buildResponsibilityBlockHtml());
    });
    toolbar.appendChild(insertRespBtn);
    // Separator
    const sep2 = document.createElement('div');
    sep2.className = 'report-toolbar-separator';
    toolbar.appendChild(sep2);
    // Insert SQL Table button
    const insertSQLBtn = document.createElement('button');
    insertSQLBtn.type = 'button';
    insertSQLBtn.className = 'report-toolbar-btn';
    insertSQLBtn.title = t('sqlTable.insert');
    insertSQLBtn.innerHTML = `<span style="font-size:10px">&#9638;</span> ${t('sqlTable.insertShort')}`;
    insertSQLBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const query = await asyncPrompt(t('sqlTable.insert'), '', {
            placeholder: t('report.sqlPlaceholder'),
            confirmLabel: t('insert') || 'Inserir',
            cancelLabel: t('cancel') || 'Cancelar',
        });
        // No report ID passed - handlers default to active report
        if (query) window.handleInsertSQLTable?.(undefined, query);
    });
    toolbar.appendChild(insertSQLBtn);
    // Insert GAC Pivot button
    const insertGACBtn = document.createElement('button');
    insertGACBtn.type = 'button';
    insertGACBtn.className = 'report-toolbar-btn';
    insertGACBtn.title = t('sqlTable.pivot');
    insertGACBtn.innerHTML = `<span style="font-size:10px">&#9638;</span> ${t('sqlTable.pivotShort')}`;
    insertGACBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const param = await asyncPrompt(t('sqlTable.pivot'), '', {
            placeholder: t('report.metricPlaceholder'),
            confirmLabel: t('insert') || 'Inserir',
            cancelLabel: t('cancel') || 'Cancelar',
        });
        if (param) window.handleInsertGACPivot?.(undefined, param);
    });
    toolbar.appendChild(insertGACBtn);
    // Check ABNT References button
    const abntBtn = document.createElement('button');
    abntBtn.type = 'button';
    abntBtn.className = 'report-toolbar-btn';
    abntBtn.title = t('abntChecker.title');
    abntBtn.textContent = t('abntChecker.shortLabel');
    abntBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Pass no ID → handler defaults to the active report
        window.handleCheckABNTReferences?.();
    });
    toolbar.appendChild(abntBtn);
    // Document Compliance Validator button (DOC-COMP-001)
    const docComplianceBtn = document.createElement('button');
    docComplianceBtn.type = 'button';
    docComplianceBtn.className = 'report-toolbar-btn';
    docComplianceBtn.title = t('documentCompliance.title') || 'Document Compliance';
    docComplianceBtn.setAttribute('aria-label', t('documentCompliance.title') || 'Document Compliance');
    docComplianceBtn.textContent = t('documentCompliance.shortLabel') || 'Compliance';
    docComplianceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleValidateDocumentCompliance?.();
    });
    toolbar.appendChild(docComplianceBtn);
    // Translate button (C5a) - opens modal with estimate + language selection
    const translateBtn = document.createElement('button');
    translateBtn.type = 'button';
    translateBtn.className = 'report-toolbar-btn';
    translateBtn.title = t('report.translate.title');
    translateBtn.setAttribute('aria-label', t('report.translate.title') || 'Translate Report');
    translateBtn.innerHTML = `<span style="font-size:13px">&#127760;</span> ${t('report.translate.shortLabel')}`;
    translateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleOpenTranslateModal?.();
    });
    toolbar.appendChild(translateBtn);
    // AI Report Bot button (C5b) - template-based section generation
    const aiBtn = document.createElement('button');
    aiBtn.type = 'button';
    aiBtn.className = 'report-toolbar-btn';
    aiBtn.title = t('aiReport.title');
    aiBtn.setAttribute('aria-label', t('aiReport.title') || 'AI Report Generator');
    aiBtn.innerHTML = `<span style="font-size:11px">&#9670;</span> ${t('aiReport.shortLabel')}`;
    aiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleOpenAIReportModal?.();
    });
    toolbar.appendChild(aiBtn);
    // Separator
    const sep3 = document.createElement('div');
    sep3.className = 'report-toolbar-separator';
    toolbar.appendChild(sep3);
    // Save as PDF button
    const pdfBtn = document.createElement('button');
    pdfBtn.type = 'button';
    pdfBtn.className = 'report-toolbar-btn';
    pdfBtn.title = t('reportExportPDFLabel');
    pdfBtn.textContent = t('reportExportPDFShort');
    pdfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleSaveReportAsPDF?.();
    });
    toolbar.appendChild(pdfBtn);
    // Save as DOCX button
    const docxBtn = document.createElement('button');
    docxBtn.type = 'button';
    docxBtn.className = 'report-toolbar-btn';
    docxBtn.title = t('reportExportDOCXLabel');
    docxBtn.textContent = t('reportExportDOCXShort');
    docxBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleSaveReportAsDOCX?.();
    });
    toolbar.appendChild(docxBtn);
    // Separator
    const sep4 = document.createElement('div');
    sep4.className = 'report-toolbar-separator';
    toolbar.appendChild(sep4);
    // Export button (opens format/section picker)
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'report-toolbar-btn';
    exportBtn.title = t('exportReport');
    exportBtn.textContent = t('exportReport') || 'Export';
    exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleExportReport();
    });
    toolbar.appendChild(exportBtn);
    // Share as .ecbt (compartilhamento portável de relatório — generaliza export AI template)
    const ecbtBtn = document.createElement('button');
    ecbtBtn.type = 'button';
    ecbtBtn.className = 'report-toolbar-btn';
    ecbtBtn.title = t('report.share.exportTitle') || 'Salvar relatório como chave .ecbt';
    ecbtBtn.setAttribute('aria-label', t('report.share.exportTitle') || 'Salvar .ecbt');
    ecbtBtn.textContent = t('report.share.exportShort') || 'Salvar .ecbt';
    ecbtBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const m = await import('./_reportShareEcbt.js' as string);
        m.exportActiveReportEcbt?.();
    });
    toolbar.appendChild(ecbtBtn);
    // Import .ecbt (importar relatório compartilhado)
    const ecbtImportBtn = document.createElement('button');
    ecbtImportBtn.type = 'button';
    ecbtImportBtn.className = 'report-toolbar-btn';
    ecbtImportBtn.title = t('report.share.importTitle') || 'Importar relatório de chave .ecbt';
    ecbtImportBtn.setAttribute('aria-label', t('report.share.importTitle') || 'Importar .ecbt');
    ecbtImportBtn.textContent = t('report.share.importShort') || 'Importar .ecbt';
    ecbtImportBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const m = await import('./_reportShareEcbt.js' as string);
        m.importReportEcbt?.();
    });
    toolbar.appendChild(ecbtImportBtn);
    return toolbar;
}
// ----------------------------------------------------------------
// SCENE PICKER
// Dropdown para selecionar cena a inserir como ancora
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} anchorBtn
 */
function _toggleScenePicker(anchorBtn: HTMLElement) {
    // Fecha picker existente
    if (pickerEl) {
        pickerEl.remove();
        pickerEl = null;
        return;
    }
    const scenes = getAllScenes();
    pickerEl = document.createElement('div');
    pickerEl.className = 'report-scene-picker';
    if (scenes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'report-scene-picker-empty';
        empty.textContent = t('noScenesForAnchor');
        pickerEl.appendChild(empty);
    } else {
        scenes.forEach((scene: any) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'report-scene-picker-item';
            item.textContent = scene.name || scene.id;
            item.addEventListener('click', () => {
                insertSceneAnchor(scene.id);
                pickerEl?.remove();
                pickerEl = null;
            });
            pickerEl?.appendChild(item);
        });
    }
    // Posiciona abaixo do botao
    const rect = anchorBtn.getBoundingClientRect();
    pickerEl.style.position = 'fixed';
    pickerEl.style.left = `${rect.left}px`;
    pickerEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    document.body.appendChild(pickerEl);
    // Fecha ao clicar fora
    const closeHandler = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (pickerEl && !pickerEl.contains(target) && !anchorBtn.contains(target)) {
            pickerEl.remove();
            pickerEl = null;
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}
// ----------------------------------------------------------------
// MCA MENU (P1-11 Fase B.1/B.2 + P1-10 kind csm)
// Dropdown de ações do Modelo Conceitual da Área: inserir no relatório,
// salvar/importar como chave .ecbt portável (Library ecbyts | dispositivo local).
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} anchorBtn
 */
function _toggleMcaMenu(anchorBtn: HTMLElement) {
    if (mcaMenuEl) {
        mcaMenuEl.remove();
        mcaMenuEl = null;
        return;
    }
    mcaMenuEl = document.createElement('div');
    mcaMenuEl.className = 'report-scene-picker'; // reusa estilo de dropdown
    const actions = [
        { label: t('mca.actionInsert') || 'Inserir no relatório', run: async () => (await import('./_mcaInsert.js')).insertMcaIntoReport() },
        { label: t('mca.actionPanel') || 'Editar matriz (painel)', run: async () => (await import('../ui/mcaPanel.js')).openMcaPanel() },
        { label: t('mca.actionSave') || 'Salvar como .ecbt', run: async () => (await import('./_mcaPortableKind.js')).exportMcaEcbt() },
        { label: t('mca.actionImport') || 'Importar de .ecbt', run: async () => (await import('./_mcaPortableKind.js')).importMcaEcbt() },
    ];
    actions.forEach((a) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'report-scene-picker-item';
        item.textContent = a.label;
        item.addEventListener('click', () => {
            a.run();
            mcaMenuEl?.remove();
            mcaMenuEl = null;
        });
        mcaMenuEl?.appendChild(item);
    });
    const rect = anchorBtn.getBoundingClientRect();
    mcaMenuEl.style.position = 'fixed';
    mcaMenuEl.style.left = `${rect.left}px`;
    mcaMenuEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    document.body.appendChild(mcaMenuEl);
    const closeHandler = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (mcaMenuEl && !mcaMenuEl.contains(target) && !anchorBtn.contains(target)) {
            mcaMenuEl.remove();
            mcaMenuEl = null;
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}
// ----------------------------------------------------------------
// METRIC PICKER
// Dropdown para selecionar metrica a inserir como ancora
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} anchorBtn
 */
function _toggleMetricPicker(anchorBtn: HTMLElement) {
    if (metricPickerEl) {
        metricPickerEl.remove();
        metricPickerEl = null;
        return;
    }
    metricPickerEl = document.createElement('div');
    metricPickerEl.className = 'report-metric-picker';
    METRIC_TYPES.forEach((metric) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'report-metric-picker-item';
        item.innerHTML = `<span class="report-metric-picker-icon">${metric.icon}</span> ${t(metric.labelKey) || metric.fallback}`;
        item.addEventListener('click', () => {
            insertMetricAnchor(metric.id, null);
            metricPickerEl?.remove();
            metricPickerEl = null;
        });
        metricPickerEl?.appendChild(item);
    });
    // Posiciona acima do botao
    const rect = anchorBtn.getBoundingClientRect();
    metricPickerEl.style.position = 'fixed';
    metricPickerEl.style.left = `${rect.left}px`;
    metricPickerEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    document.body.appendChild(metricPickerEl);
    // Fecha ao clicar fora
    const closeHandler = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (metricPickerEl && !metricPickerEl.contains(target) && !anchorBtn.contains(target)) {
            metricPickerEl.remove();
            metricPickerEl = null;
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}
// ----------------------------------------------------------------
// SCROLL-TRIGGERED TRANSITIONS
// IntersectionObserver para transicoes de camera ao scrollar
// ----------------------------------------------------------------
/** @private */
function _setupScrollObserver() {
    // Limpa observer anterior
    if (anchorObserver) anchorObserver.disconnect();
    if (!editorDiv) return;
    // Encontra o scroll container real (pode ser o editor, o container pai, ou o document)
    const scrollRoot = _findScrollParent(editorDiv);
    anchorObserver = new IntersectionObserver(
        (entries) => {
            // Nao dispara durante digitacao ativa (selecao expandida = texto sendo escrito)
            const sel = window.getSelection();
            const currentEditor = editorDiv;
            if (sel && !sel.isCollapsed && currentEditor && sel.anchorNode && currentEditor.contains(sel.anchorNode)) return;
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const sceneId = (entry.target as HTMLElement).dataset?.sceneId;
                    if (!sceneId) continue;
                    // Debounce: nao re-dispara para mesma cena em 2s
                    const now = Date.now();
                    if (sceneId === lastTriggeredScene && now - lastTriggerTime < 2000) continue;
                    lastTriggeredScene = sceneId;
                    lastTriggerTime = now;
                    const scene = getSceneById(sceneId);
                    if (scene?.viewStart) {
                        // BUG-7: se o report está em fullscreen, o overlay opaco cobre o
                        // canvas e a câmera 3D mexe invisível ("o modelo some"). Garante
                        // o split mode para o usuário VER a cena. Idempotente + lazy
                        // (dynamic import evita ciclo overlay↔editor).
                        void import('./overlay.js')
                            .then((m) => m.ensureReportSplitMode?.())
                            .catch((e) => console.debug('[report:editor:ensureSplitMode]', e?.message || e));
                        animateCameraState(scene.viewStart, 600);
                    }
                    break; // Apenas uma transicao por vez
                }
            }
        },
        {
            root: scrollRoot,
            threshold: 0.3, // Threshold menor — ancora menor precisa de menos visibilidade
            rootMargin: '0px 0px -30% 0px', // Dispara quando ancora entra na metade superior
        },
    );
    // Observa todas as ancoras
    const anchors = editorDiv.querySelectorAll('.report-scene-anchor');
    anchors.forEach((a) => anchorObserver?.observe(a));
}
/**
 * Find the nearest scrollable ancestor of an element.
 * @param {HTMLElement} el
 * @returns {HTMLElement|null} Scroll container or null for viewport
 * @private
 */
function _findScrollParent(el: HTMLElement) {
    let parent = el.parentElement;
    while (parent) {
        const ovf = getComputedStyle(parent).overflowY;
        if (ovf === 'auto' || ovf === 'scroll') return parent;
        parent = parent.parentElement;
    }
    return null; // null = viewport (padrao do IntersectionObserver)
}
// ----------------------------------------------------------------
// ORPHAN ANCHORS
// Marca ancoras cujas cenas foram excluidas
// ----------------------------------------------------------------
/** @private */
function _refreshOrphanAnchors() {
    if (!editorDiv) return;
    const anchors = editorDiv.querySelectorAll('.report-scene-anchor');
    anchors.forEach((a: any) => {
        const sceneId = a.dataset.sceneId || '';
        const scene = getSceneById(sceneId);
        if (!scene) {
            a.classList.add('report-scene-anchor--orphan');
            a.textContent = `▶ [Scene: ${t('sceneDeleted')}]`;
        } else {
            a.classList.remove('report-scene-anchor--orphan');
        }
    });
}
// ----------------------------------------------------------------
// RESIZE HANDLE
// Permite redimensionar o HUD arrastando o topo
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} handle
 */
function _setupResizeHandle(handle: HTMLElement) {
    let startY = 0;
    let startHeight = 0;
    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        const hud = document.getElementById('constellation-hud');
        if (!hud) return;
        startY = e.clientY;
        startHeight = hud.offsetHeight;
        const onMove = (me: MouseEvent) => {
            const delta = startY - me.clientY;
            const newHeight = Math.max(160, Math.min(window.innerHeight * 0.85, startHeight + delta));
            hud.style.height = `${newHeight}px`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @private
 * @param {any} str
 */
function _escapeHtml(str: any) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
//# sourceMappingURL=editor.js.map
