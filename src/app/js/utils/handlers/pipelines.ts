// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PIPELINES HANDLER â€” window.* handlers para automaÃ§Ã£o de pipelines
   PadrÃ£o idÃªntico ao workflows.js: export handlers + setUpdateAllUI.

   Dois modais:
   - #pipeline-manager-modal : lista de pipelines + progresso de run
   - #pipeline-editor-modal  : editor local (linear ou render nativo ECBT)
   ================================================================ */
import './pipelinePortable.js'; // side-effect: registra kind 'pipeline' (P1-10 Fase B)
import {
    getAllPipelines,
    getPipeline,
    savePipeline,
    deletePipeline,
    loadFromStorage,
    buildGacDd38PipelineEntry,
    buildMineBeneficiationPipelineEntry,
} from '../../core/pipelines/index.js';
import { parseBpmnXml, validatePipeline, serializeToBpmn, BPMN_TEMPLATE } from '../../core/pipelines/schema.js';
import { runPipeline, abortRun } from '../../core/pipelines/executor.js';
import {
    getNativePipelineEditorModel,
    renderPipelineList,
    renderRunProgress,
    renderNativeCanvas,
    renderLinearEditor,
    selectPipelineElement,
    deselectPipelineElements,
} from '../ui/pipelineEditor.js';
import { showToast } from '../ui/toast.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { activateTabById } from '../ui/tabs.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { createLogger } from '../helpers/logger.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import {
    clearTrainingReturnBanner,
    normalizeTrainingReturnContext,
    renderTrainingReturnBanner,
    type TrainingReturnContext,
} from '../ui/trainingReturnContext.js';
import {
    pipelineOpenMessage,
    requestedTarget,
    resolvePipelineTarget,
    withSeededGacDd38PipelineResolution,
    type PipelineOpenResult,
    type PipelineOpenTargetInput,
    type PipelineTargetResolution,
} from './pipelineTrainingSurface.js';
import { maybeTriggerIntentHint } from '../tour/intentHint.js';
export { resolvePipelineTarget } from './pipelineTrainingSurface.js';
const log = createLogger('Pipelines');
// ----------------------------------------------------------------
// INJEÃ‡ÃƒO DE DEPENDÃŠNCIAS (padrÃ£o do projeto)
// ----------------------------------------------------------------
type PipelinesUIRefresh = (domain: string, reason?: string) => void;

let _requestUIRefresh: PipelinesUIRefresh | null = null;
/**
 * Injeta a funcao de refresh por dominio (chamada por handlers/index.js).
 * @param {PipelinesUIRefresh} fn
 */
export function setPipelinesUpdateAllUI(fn: PipelinesUIRefresh) {
    _requestUIRefresh = fn;
}
function requestPipelinesUIRefresh(reason = 'pipelines.changed', extraDomains: string[] = []) {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.PIPELINES,
        UI_INVALIDATION_DOMAINS.LIBRARIES,
        UI_INVALIDATION_DOMAINS.STATUS,
        ...extraDomains,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}

function raisePipelineModalAboveTeachingOverlay(modal: HTMLElement | null): void {
    if (!modal) return;
    // Aula visual isola o fundo com inert; Pipelines deve escapar desse isolamento quando aberto pela aula.
    try {
        const body = typeof document !== 'undefined' ? document.body : null;
        if (body && modal.parentElement && modal.parentElement !== body) {
            body.appendChild(modal);
        }
        (modal as HTMLElement & { inert?: boolean }).inert = false;
        modal.removeAttribute('inert');
        if (modal.getAttribute('aria-hidden') === 'true') modal.removeAttribute('aria-hidden');
    } catch (error: any) {
        log.debug('pipeline modal reparent skipped', error?.message || error);
    }
    modal.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL + 2);
    modal.style.pointerEvents = 'auto';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
}
// ----------------------------------------------------------------
// ESTADO DO MÃ“DULO
// ----------------------------------------------------------------
/** @type {Object|null} PipelineRun corrente (para poder abortar) */
let _currentRun: any = null;
/** @type {Set<string>} Indica se hÃ¡ run em andamento */
const _runningIds = new Set();

let _lastPipelineOpenResult: PipelineOpenResult | null = null;
let _lastPipelineTrainingReturnContext: TrainingReturnContext | null = null;
// ----------------------------------------------------------------
// MANAGER - sidebar tab + modal legado
// ----------------------------------------------------------------
function rememberPipelineOpenResult(result: PipelineOpenResult): PipelineOpenResult {
    _lastPipelineOpenResult = Object.freeze(result);
    return result;
}

export function getLastPipelineOpenResult(): PipelineOpenResult | null {
    return _lastPipelineOpenResult;
}

export function getLastPipelineTrainingReturnContext(): TrainingReturnContext | null {
    return _lastPipelineTrainingReturnContext;
}

function seedGacDd38PipelineResolution(
    resolution: PipelineTargetResolution,
    targetInput?: PipelineOpenTargetInput,
): PipelineTargetResolution {
    try {
        return withSeededGacDd38PipelineResolution(resolution, targetInput, () => savePipeline(buildGacDd38PipelineEntry()));
    } catch (error) {
        log.warn('Pipeline GAC-DD38 preset seed failed', error);
        return resolution;
    }
}

function _isPipelineModalVisible(modal: HTMLElement | null): boolean {
    if (!modal || modal.hidden) return false;
    const inlineDisplay = modal.style?.display || '';
    if (inlineDisplay === 'none') return false;
    if (inlineDisplay === 'flex' || inlineDisplay === 'block' || inlineDisplay === 'grid') return true;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    return false;
}

function _hasVisiblePipelineSurface(): boolean {
    const editorModal = document.getElementById('pipeline-editor-modal') as HTMLElement | null;
    const managerModal = document.getElementById('pipeline-manager-modal') as HTMLElement | null;
    return _isPipelineModalVisible(editorModal) || _isPipelineModalVisible(managerModal);
}

function _ensureVisibleTrainingPipelineSurface(context: TrainingReturnContext | null): void {
    if (!context?.hasContext || typeof document === 'undefined') return;
    if (_hasVisiblePipelineSurface()) return;
    openPipelineManagerModal();
}

function _getPipelineEditorReturnHost(create = false): Element | null {
    if (typeof document === 'undefined') return null;
    const modal = document.querySelector('#pipeline-editor-modal .modal') as HTMLElement | null;
    const body = document.querySelector('.pipeline-editor-body') as HTMLElement | null;
    if (!modal || !body) return null;
    let host = modal.querySelector('.pipeline-editor-return-host') as HTMLElement | null;
    if (!host && create) {
        host = document.createElement('div');
        host.id = 'pipeline-editor-return-host';
        host.className = 'pipeline-editor-return-host';
        host.setAttribute('role', 'region');
        host.setAttribute('aria-label', 'Contexto da aula no editor de pipeline');
        host.setAttribute('data-pipeline-editor-return-host', 'true');
        modal.insertBefore(host, body);
    }
    return host;
}

function _renderPipelineTrainingReturnContext(context: TrainingReturnContext | null, attempt = 0): void {
    if (typeof document === 'undefined') return;
    const automationHost = document.getElementById('automation-content');
    const managerHost = document.getElementById('pipeline-manager-content');
    const editorBody = document.querySelector('.pipeline-editor-body');
    const editorReturnHost = _getPipelineEditorReturnHost(false);
    const hosts = [automationHost, managerHost, editorBody, editorReturnHost].filter(Boolean) as Element[];
    if (!hosts.length) {
        if (context?.hasContext && attempt < 5) {
            setTimeout(() => _renderPipelineTrainingReturnContext(context, attempt + 1), 80);
        }
        return;
    }
    for (const host of hosts) clearTrainingReturnBanner(host);
    if (!context?.hasContext) return;

    const editorModal = document.getElementById('pipeline-editor-modal') as HTMLElement | null;
    const managerModal = document.getElementById('pipeline-manager-modal') as HTMLElement | null;
    const editorVisible = !!editorBody && _isPipelineModalVisible(editorModal);
    const managerVisible = !!managerHost && _isPipelineModalVisible(managerModal);
    const targetHost = editorVisible ? _getPipelineEditorReturnHost(true) : managerVisible ? managerHost : automationHost;
    if (targetHost) {
        renderTrainingReturnBanner({ host: targetHost, context, source: 'pipelines' });
    }
}

/**
 * Renderiza a lista de pipelines na aba "AutomaÃ§Ã£o" da sidebar direita.
 * Chamada pelo runtime quando a aba estÃ¡ visÃ­vel.
 */
export function renderPipelineManagerTab() {
    const content = document.getElementById('automation-content');
    if (!content)
        return;
    loadFromStorage();
    const pipelines = getAllPipelines();
    // Action bar com botÃµes de criaÃ§Ã£o/importaÃ§Ã£o
    const actionBar = `<div class="pipeline-tab-actions">
        <button type="button" class="btn-primary btn-sm" data-cc-action="cc-e0236ea2">
            &#43; <span data-i18n="pipeline.manager.new">${t('pipeline.manager.new') || 'Nova Automacao'}</span>
        </button>
        <button type="button" class="btn-secondary btn-sm" data-cc-action="cc-e2eb8a87">
            &#8595; <span data-i18n="pipeline.manager.import">${t('pipeline.manager.import') || 'Importar .bpmn'}</span>
        </button>
    </div>`;
    // Renderizar lista em div temporÃ¡rio para combinar com action bar
    const listDiv = document.createElement('div');
    renderPipelineList(listDiv, pipelines, _runningIds);
    content.innerHTML = actionBar + listDiv.innerHTML;
    _renderPipelineTrainingReturnContext(_lastPipelineTrainingReturnContext);
}
/**
 * Abre o Pipeline Manager ativando a aba "AutomaÃ§Ã£o" na sidebar direita.
 */
export function handleOpenPipelineManager(targetInput?: PipelineOpenTargetInput): PipelineOpenResult {
    // T4.7b: garante o wiring mesmo se este módulo carregou antes de `window`
    // existir (module-scope roda no import; aqui roda só quando o handler é
    // efetivamente chamado, com window certamente disponível).
    _wirePipelineReturnToSlideOnce();
    const trainingContext = normalizeTrainingReturnContext(targetInput, {
        label: 'Fluxo GAC da aula',
        returnLabel: 'Voltar ao slide',
    });
    _lastPipelineTrainingReturnContext = trainingContext.hasContext ? trainingContext : null;
    activateTabById('automation');
    loadFromStorage();
    const pipelines = getAllPipelines();
    const resolution = seedGacDd38PipelineResolution(resolvePipelineTarget(pipelines, targetInput), targetInput);
    if (resolution.targetPipelineId) {
        void handleEditPipeline(resolution.targetPipelineId);
    }
    const result: PipelineOpenResult = {
        ok: resolution.reason === 'no-target' || resolution.reason === 'target-found',
        opened: !!resolution.targetPipelineId,
        fallback: resolution.reason === 'target-not-found' || resolution.reason === 'no-pipelines',
        reason: resolution.reason,
        targetPipelineId: resolution.targetPipelineId,
        requested: requestedTarget(resolution),
        message: pipelineOpenMessage(resolution),
    };
    if (result.fallback) {
        log.warn('Pipeline open fallback', result);
        showToast(result.message, 'warning');
    }
    requestPipelinesUIRefresh(result.fallback ? 'pipelines.manager-opened-fallback' : 'pipelines.manager-opened');
    _ensureVisibleTrainingPipelineSurface(_lastPipelineTrainingReturnContext);
    _renderPipelineTrainingReturnContext(_lastPipelineTrainingReturnContext);
    setTimeout(() => {
        _ensureVisibleTrainingPipelineSurface(_lastPipelineTrainingReturnContext);
        _renderPipelineTrainingReturnContext(_lastPipelineTrainingReturnContext);
    }, 120);
    // T8.1: dica de intenção (1ª abertura -> 1 tooltip apontando a lição do
    // fluxo GAC). Suprimida quando esta abertura já vem de dentro de uma aula
    // (Clique-go do GAC) — não faz sentido sugerir a própria aula de origem.
    maybeTriggerIntentHint('pipelines', { openedFromTrainingContext: trainingContext.hasContext });
    return rememberPipelineOpenResult(result);
}
/**
 * Abre o Pipeline Manager como MODAL autossuficiente (nÃ£o depende da aba
 * aninhada estar visÃ­vel). Usado pelo deep link `?tools=pipelines` â€” leva o
 * usuÃ¡rio direto Ã  lista de pipelines + botÃ£o "Importar .ecbt", contornando o
 * botÃ£o de barra escondido. Idempotente.
 */
export function openPipelineManagerModal() {
    loadFromStorage();
    const pipelines = getAllPipelines();
    const content = document.getElementById('pipeline-manager-content');
    if (content) renderPipelineList(content, pipelines, _runningIds);
    const modal = document.getElementById('pipeline-manager-modal');
    if (modal) {
        raisePipelineModalAboveTeachingOverlay(modal);
        modal.style.display = 'flex';
        modal.removeAttribute('hidden');
    }
}

/**
 * Abre um pipeline ESPECÃFICO pelo id no editor (render fiel nativo, read-only).
 * Usado por botÃµes de slide / deep-link p/ "levar o aluno ao fluxo exato".
 * @param {string} id
 */
export function openPipelineById(id: any) {
    loadFromStorage();
    const entry = getPipeline(id);
    if (!entry) {
        showToast(t('pipeline.notFound') || 'Fluxo nÃ£o encontrado.', 'error');
        return;
    }
    _editingId = id;
    const entryAny = entry as any;
    const rawModel = entryAny.model && typeof entryAny.model === 'object' ? entryAny.model : {};
    const enrichedModel = {
        ...rawModel,
        id: rawModel.id || entryAny.id,
        name: rawModel.name || entryAny.name,
        title: rawModel.title || entryAny.title || entryAny.name,
        presetId: rawModel.presetId || entryAny.presetId || entryAny.id,
        templateId: rawModel.templateId || entryAny.templateId,
        sourceFile: rawModel.sourceFile || entryAny.sourceFile,
        sourceFormat: rawModel.sourceFormat || entryAny.sourceFormat,
    };
    _openEditor(entry.xml || BPMN_TEMPLATE, entry.name || '', enrichedModel);
}

/**
 * Abre o FLUXO DE CLASSIFICAÃ‡ÃƒO DE ÃREA (GAC) â€” semeia na 1Âª vez e abre o
 * fluxograma interativo. Deep-link `?tools=gac-flow` + botÃ£o de slide da aula.
 * @param {unknown} [_payload?]
 */
export function openGacFlow(_payload?: unknown) {
    const saved = savePipeline(buildGacDd38PipelineEntry());
    const id = String(saved?.id || 'm01.gac.flow.dd38');
    openPipelineById(id);
}

/**
 * Abre um fluxo produtivo generico de beneficiamento mineral.
 * Usado como base editavel para aulas, comparacoes e futuros modelos de mina.
 * @param {unknown} [_payload?]
 */
export function openMineBeneficiationFlow(_payload?: unknown) {
    const saved = savePipeline(buildMineBeneficiationPipelineEntry());
    const id = String(saved?.id || 'mine.beneficiation.flow.high-level');
    openPipelineById(id);
}

/**
 * Re-renderiza a lista do gerenciador (modal + aba) SEM forÃ§ar a abertura.
 * Usado apÃ³s importar uma chave .ecbt para a lista refletir o novo pipeline na
 * hora (antes era preciso dar F5). Idempotente; no-op se nenhum container existe.
 */
export function refreshPipelineManager() {
    loadFromStorage();
    const pipelines = getAllPipelines();
    const modalContent = document.getElementById('pipeline-manager-content');
    if (modalContent) renderPipelineList(modalContent, pipelines, _runningIds);
    if (document.getElementById('automation-content')) renderPipelineManagerTab();
}
/**
 * Fecha o Pipeline Manager modal (fallback legado).
 */
export function handleClosePipelineManager() {
    const modal = document.getElementById('pipeline-manager-modal');
    if (modal)
        modal.style.display = 'none';
}
function _renderManager() {
    renderPipelineManagerTab();
    const content = document.getElementById('pipeline-manager-content');
    if (!content)
        return;
    loadFromStorage();
    const pipelines = getAllPipelines();
    renderPipelineList(content, pipelines, _runningIds);
}
// ----------------------------------------------------------------
// EDITOR MODAL
// ----------------------------------------------------------------
/** Pipeline sendo editado (ou novo) */
/** @type {string|null} */
let _editingId: any = null;
/**
 * Abre editor para novo pipeline (template padrÃ£o).
 */
export async function handleNewPipeline() {
    _editingId = null;
    _openEditor(BPMN_TEMPLATE, '');
}
/**
 * Abre editor para pipeline existente.
 * @param {string} id - Pipeline ID
 */
export async function handleEditPipeline(id: any) {
    const entry = getPipeline(id);
    if (!entry) {
        showToast('Pipeline nÃ£o encontrado.', 'error');
        return;
    }
    _editingId = id;
    _openEditor(entry.xml || BPMN_TEMPLATE, entry.name || '', (entry as any).model);
}
/**
 * @param {string} xml
 * @param {string} name
 * @param {object} [model?] - modelo nativo {nodes,edges,startNodeId,lanes}; quando
 *   presente, usa o renderizador nativo (sem editor externo/CDN/marca d'agua).
 */
async function _openEditor(xml: any, name: any, model?: any) {
    const modal = document.getElementById('pipeline-editor-modal');
    if (!modal)
        return;
    raisePipelineModalAboveTeachingOverlay(modal);
    // Preencher nome
    const nameInput = (document.getElementById('pipeline-editor-name')) as HTMLInputElement|null;
    if (nameInput)
        nameInput.value = name || '';
    // TRAINING-LMS-OPEN-001 T4.7a: aberto a partir de uma aula (Clique-go GAC) →
    // modo AULA: some com Salvar/nome editável/toolbar de edição, mantendo só
    // leitura (zoom/legenda/apresentar). Fora desse contexto, edição normal.
    modal.classList.toggle('pipeline-editor-class-mode', Boolean(_lastPipelineTrainingReturnContext?.hasContext));
    modal.style.display = 'flex';
    modal.removeAttribute('hidden');
    const canvas = document.getElementById('bpmn-canvas');
    if (canvas) {
        // Pipeline com modelo nativo (ex.: chave ECBT importada) â†’ render FIEL prÃ³prio
        if (model && Array.isArray(model.nodes) && model.nodes.length) {
            renderNativeCanvas('bpmn-canvas', model);
            return;
        }
        // Pipeline legado: usar sempre o editor linear local, sem dependencia externa.
        const def = parseBpmnXml(xml || BPMN_TEMPLATE);
        renderLinearEditor(canvas, def);
    }
}
/**
 * Fecha o editor de pipeline.
 */
export function handleClosePipelineEditor() {
    const modal = document.getElementById('pipeline-editor-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('pipeline-editor-class-mode'); // T4.7a: não vaza p/ a próxima abertura em modo edição normal
    }
    _editingId = null;
}

// TRAINING-LMS-OPEN-001 T4.7b: 'training:request-return-to-slide' é disparado por
// returnToTrainingSlide/datastudio.ts ANTES do modal do curso reabrir, mas até aqui
// ninguém escutava — o editor/manager de pipeline ficava aberto por cima (zIndex
// elevado por raisePipelineModalAboveTeachingOverlay), cobrindo o slide reaberto.
let _pipelineReturnToSlideWired = false;
function _wirePipelineReturnToSlideOnce(): void {
    if (_pipelineReturnToSlideWired || typeof window === 'undefined') return;
    _pipelineReturnToSlideWired = true;
    window.addEventListener('training:request-return-to-slide', () => {
        handleClosePipelineEditor();
        handleClosePipelineManager();
        _lastPipelineTrainingReturnContext = null;
    });
}
_wirePipelineReturnToSlideOnce();
/**
 * Salva o pipeline corrente pelo editor linear local.
 */
export async function handleSavePipeline() {
    const nameInput = (document.getElementById('pipeline-editor-name')) as HTMLInputElement|null;
    const name = nameInput ? nameInput.value.trim() : 'Pipeline';
    const canvasEl = document.getElementById('bpmn-canvas');
    if (canvasEl?.querySelector('.pipeline-native-canvas')) {
        const nativeModel = getNativePipelineEditorModel();
        if (!nativeModel || !Array.isArray(nativeModel.nodes) || !nativeModel.nodes.length) {
            showToast('Nao foi possivel salvar o fluxograma tecnico aberto.', 'error');
            return;
        }
        savePipeline({ id: _editingId || undefined, name, model: nativeModel });
        showToast(t('pipeline.export.success') || 'Pipeline salvo.', 'success');
        handleClosePipelineEditor();
        _renderManager();
        requestPipelinesUIRefresh('pipelines.native-saved');
        return;
    }
    const canvas = document.getElementById('bpmn-canvas');
    if (!canvas)
        return;
    const def = _collectLinearEditorDef(canvas);
    if (!def)
        return;
    const xml = serializeToBpmn({ ...def, name });
    // Validar
    const parsed = parseBpmnXml(xml as any);
    const validation = /** @type {{valid: boolean, errors: string[]}} */ (validatePipeline(parsed));
    if (!validation.valid) {
        showToast(validation.errors.map((e: any) => t(e) || e).join(' | '), 'error');
        return;
    }
    savePipeline({ id: _editingId || undefined, name, xml });
    showToast(t('pipeline.export.success') || 'Pipeline salvo.', 'success');
    handleClosePipelineEditor();
    _renderManager();
    requestPipelinesUIRefresh('pipelines.saved');
}
/**
 * Coleta definiÃ§Ã£o do editor linear a partir do DOM.
 * LÃª os campos de formulÃ¡rio visÃ­veis por tipo de nÃ³ - nÃ£o o textarea escondido.
 * @param {HTMLElement} canvas
 * @returns {Object|null}
 */
function _collectLinearEditorDef(canvas: any) {
    const nodeCards = (canvas.querySelectorAll('[data-node-id]')) as NodeListOf<HTMLElement>;
    /** @type {Array<{id: string, type: string, label: string, config: Record<string, any>}>} */
    const nodes: any[] = [];
    /** @type {Array<{id: string, from: string, to: string}>} */
    const edges: any[] = [];
    nodeCards.forEach((card: any, i: any) => {
        const id = card.dataset.nodeId || '';
        const type = card.dataset.nodeType || '';
        const label = _field(card, '.pipeline-node-label')?.value || id;
        const config = _readConfigFromForm(card, type);
        nodes.push({ id, type, label, config });
        // Edge sequencial simples
        const nextCard = canvas.querySelectorAll('[data-node-id]')[i + 1];
        if (nextCard) {
            const nextId = (nextCard).dataset.nodeId || '';
            edges.push({ id: 'e_' + id + '_' + nextId, from: id, to: nextId });
        }
    });
    const startNode = nodes.find((n: any) => n.type === 'trigger');
    return { nodes, edges, startNodeId: startNode?.id || null };
}
/**
 * LÃª config de um node-card a partir dos campos de formulÃ¡rio visÃ­veis.
 * Fallback para o textarea escondido se campos nÃ£o estiverem presentes.
 * @param {HTMLElement} card
 * @param {string} type
 * @returns {Object}
 */
function _readConfigFromForm(card: any, type: any) {
    switch (type) {
        case 'trigger': {
            const triggerType = _field(card, '.pipeline-cfg-trigger-type')?.value;
            if (triggerType !== undefined)
                return { triggerType };
            break;
        }
        case 'action': {
            const action = _field(card, '.pipeline-cfg-action')?.value;
            const paramsRaw = _field(card, '.pipeline-cfg-params')?.value || '{}';
            const params = safeJsonParse<Record<string, any>>(paramsRaw, {}, 'pipeline-action-params');
            if (action !== undefined)
                return { action, params };
            break;
        }
        case 'condition': {
            const subject = _field(card, '.pipeline-cfg-subject')?.value;
            const operator = _field(card, '.pipeline-cfg-operator')?.value;
            const value = Number(_field(card, '.pipeline-cfg-value')?.value ?? 0);
            if (subject !== undefined)
                return { subject, operator, value };
            break;
        }
        case 'delay': {
            const ms = Number(_field(card, '.pipeline-cfg-ms')?.value ?? 0);
            const msEl = _field(card, '.pipeline-cfg-ms');
            if (msEl)
                return { ms };
            break;
        }
        case 'api_call': {
            const url = _field(card, '.pipeline-cfg-url')?.value || '';
            const method = _field(card, '.pipeline-cfg-method')?.value || 'GET';
            const bodyRaw = _field(card, '.pipeline-cfg-body')?.value || '{}';
            const timeoutMs = Number(_field(card, '.pipeline-cfg-timeout')?.value ?? 30000);
            const body = safeJsonParse<Record<string, any>>(bodyRaw, {}, 'pipeline-api-body');
            if (_field(card, '.pipeline-cfg-url'))
                return { url, method, body, timeoutMs };
            break;
        }
    }
    // Fallback: textarea escondido
    const configInput = _field(card, '.pipeline-node-config');
    if (configInput) {
        return safeJsonParse<Record<string, any>>(configInput.value || '{}', {}, 'pipeline-config-fallback');
    }
    return {};
}
/**
 * @param {Element|Document} root
 * @param {string} selector
 * @returns {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null}
 */
function _field(root: any, selector: any) {
    return /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (root.querySelector(selector));
}
// ----------------------------------------------------------------
// RUN
// ----------------------------------------------------------------
/**
 * Executa um pipeline pelo ID.
 * @param {string} id - Pipeline ID
 */
export async function handleRunPipeline(id: any) {
    if (_runningIds.has(id)) {
        showToast(t('pipeline.run.alreadyRunning') || 'JÃ¡ em execuÃ§Ã£o.', 'warning');
        return;
    }
    const entry = getPipeline(id);
    if (!entry) {
        showToast('Pipeline nÃ£o encontrado.', 'error');
        return;
    }
    // Pipeline nativo importado (modelo {nodes,edges} sem xml BPMN): Ã© um diagrama
    // de VISUALIZAÃ‡ÃƒO (tarefas descritivas, nÃ£o aÃ§Ãµes executÃ¡veis do motor ecbyts).
    // Rodar tentaria parsear xml vazio â†’ "noNodes/noStart". Mensagem clara em vez disso.
    if ((entry as any).model && !entry.xml) {
        showToast(
            t('pipeline.native.notRunnable')
                || 'Diagrama importado: somente visualizaÃ§Ã£o (nÃ£o executÃ¡vel no motor de pipelines).',
            'info',
        );
        return;
    }
    const def = parseBpmnXml(entry.xml || '');
    (def as any).pipelineId = id;
    const validation = /** @type {{valid: boolean, errors: string[]}} */ (validatePipeline(def));
    if (!validation.valid) {
        showToast(validation.errors.map((e: any) => t(e) || e).join(' | '), 'error');
        return;
    }
    _runningIds.add(id);
    showToast(t('pipeline.run.starting') || 'Iniciando...', 'info');
    // Contexto da app (elements, campaigns, scenes via window globals)
    const appCtx = {
        elements: (window.getAllElements && window.getAllElements()) || [],
        campaigns: (window.getAllCampaigns && window.getAllCampaigns()) || [],
        scenes: (window.getAllScenes && window.getAllScenes()) || [],
    };
    // Mostrar progresso no manager
    _renderManager();
    try {
        const run = /** @type {{status: string, error?: string}} */ (await runPipeline(def, {
            appCtx,
            onProgress: (r: any) => {
                _currentRun = r;
                _showRunProgressInManager(id, r);
            },
            onLog: () => { },
        }));
        _currentRun = run;
        _runningIds.delete(id);
        if (run.status === 'completed') {
            showToast(t('pipeline.run.completed') || 'AutomaÃ§Ã£o concluÃ­da.', 'success');
        }
        else if (run.status === 'aborted') {
            showToast(t('pipeline.run.aborted') || 'Interrompida.', 'warning');
        }
        else {
            showToast((t('pipeline.run.failed') || 'Falhou') + ': ' + (run.error || ''), 'error');
        }
        requestPipelinesUIRefresh('pipelines.run-finished', [
            UI_INVALIDATION_DOMAINS.MODEL,
            UI_INVALIDATION_DOMAINS.LISTS,
            UI_INVALIDATION_DOMAINS.SCENE,
            UI_INVALIDATION_DOMAINS.ANALYTICS,
            UI_INVALIDATION_DOMAINS.INSPECTOR,
        ]);
    }
    catch ( /** @type {any} */err) {
        _runningIds.delete(id);
        log.error('Pipeline run failed', (err as any).message);
        showToast('Erro inesperado: ' + (err as any).message, 'error');
    }
    _renderManager();
}
/**
 * Aborta o run corrente de um pipeline.
 * @param {string} runId
 */
export function handleAbortPipeline(runId: any) {
    abortRun(runId);
    showToast(t('pipeline.run.aborted') || 'Abortando...', 'warning');
}
/**
 * @param {string} pipelineId
 * @param {any} run
 */
function _showRunProgressInManager(pipelineId: any, run: any) {
    const content = document.getElementById('pipeline-manager-content');
    if (!content)
        return;
    const card = content.querySelector(`[data-pipeline-id="${pipelineId}"]`);
    if (!card)
        return;
    const progressArea = card.querySelector('.pipeline-run-progress');
    if (progressArea)
        renderRunProgress(progressArea, run);
}
// ----------------------------------------------------------------
// EXPORT / IMPORT DE ARQUIVO
// ----------------------------------------------------------------
/**
 * Exporta pipeline como arquivo .bpmn para download.
 * @param {string} id - Pipeline ID
 */
export function handleExportPipeline(id: any) {
    const entry = getPipeline(id);
    if (!entry)
        return;
    const blob = new Blob([/** @type {BlobPart} */ (entry.xml || '')], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (entry.name || 'pipeline').replace(/[^a-z0-9_-]/gi, '_') + '.bpmn';
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('pipeline.export.success') || 'Exportado.', 'success');
}
/**
 * Abre seletor de arquivo para importar .bpmn.
 */
export function handleImportPipeline() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bpmn,.xml';
    input.onchange = async (e) => {
        const file = (e.target as any)?.files?.[0];
        if (!file)
            return;
        try {
            const xml = await file.text() as HTMLInputElement|null;
            const def = parseBpmnXml(xml as any);
            if (def.error)
                throw new Error(def.error);
            // Nome do arquivo como nome do pipeline
            const name = file.name.replace(/\.(bpmn|xml)$/i, '').replace(/_/g, ' ');
            savePipeline({ name, xml });
            showToast(t('pipeline.import.success') || 'Importado.', 'success');
            _renderManager();
            requestPipelinesUIRefresh('pipelines.imported');
        }
        catch ( /** @type {any} */err) {
            log.error('Pipeline import failed', (err as any).message);
            showToast((t('pipeline.import.error') || 'Arquivo invÃ¡lido') + ': ' + (err as any).message, 'error');
        }
    };
    input.click();
}
// ----------------------------------------------------------------
// DELETE
// ----------------------------------------------------------------
/**
 * Remove pipeline apÃ³s confirmaÃ§Ã£o.
 * @param {string} id
 */
export async function handleDeletePipeline(id: any) {
    const confirmed = await asyncConfirm(t('pipeline.delete.confirm') || 'Excluir esta automaÃ§Ã£o?', 
    /** @type {any} */ ({
        confirmLabel: t('delete') || 'Excluir',
        cancelLabel: t('cancel') || 'Cancelar',
        danger: true,
    }));
    if (!confirmed)
        return;
    deletePipeline(id);
    _renderManager();
    requestPipelinesUIRefresh('pipelines.deleted');
}
// ----------------------------------------------------------------
// EXPORT DO MÃ“DULO
// ----------------------------------------------------------------
// Exposto para testes E2E
export { selectPipelineElement, deselectPipelineElements };
export const pipelineHandlers = {
    handleOpenPipelineManager,
    getLastPipelineOpenResult,
    openPipelineManagerModal,
    openPipelineById,
    openGacFlow,
    openMineBeneficiationFlow,
    refreshPipelineManager,
    handleClosePipelineManager,
    renderPipelineManagerTab,
    handleNewPipeline,
    handleEditPipeline,
    handleClosePipelineEditor,
    handleSavePipeline,
    handleRunPipeline,
    handleAbortPipeline,
    handleExportPipeline,
    handleImportPipeline,
    handleDeletePipeline,
    pipelineSelectElement: selectPipelineElement,
    pipelineDeselectAll: deselectPipelineElements,
};
