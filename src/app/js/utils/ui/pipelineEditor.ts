// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   PIPELINE EDITOR - Render do manager e editor de pipelines.

   Modos atuais:
   1. Editor linear offline - lista de node-cards editaveis.
   2. Renderizador nativo ECBT - SVG proprio para pipelines importados.

   Regra UI: sem emojis - usar HTML entities e CSS classes.
   ================================================================ */

import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { CONFIG } from '../../config.js';
import * as _pipelineSchema from '../../core/pipelines/schema.js';
const { NODE_TYPES, ALLOWED_PATHS } = /*as:{NODE_TYPES: any, ALLOWED_PATHS: any}*/(
    (_pipelineSchema as any)
);
import { getRegisteredActions } from '../../core/pipelines/executor.js';
import { buildPipelineDiagramSvg } from '../../core/pipelines/_diagramSvgPure.js';
import {
    renderPipelinePackTagCoverageReportMarkdown,
    renderPipelinePackWorkbenchHtml,
    renderPipelinePackWorkbenchReportMarkdown,
    updatePipelinePackTechnicalParameter,
} from '../../core/pipelines/pipelinePackWorkbench.js';
import { summarizeDomainTechnicalParameterCatalog } from '../../core/pipelines/pipelineDomainProfile.js';
import {
    buildModuleInputParamsFormViewModel,
    collectModuleInputParamsFromFields,
} from '../../core/pipelines/_pipelineModuleInputParamsFormPure.js';
import {
    extractPipelineConditionalGates,
    type PipelineConditionalGateRouteKind,
    type PipelineConditionalGateViewModel,
    updatePipelineConditionalGate,
    validatePipelineConditionalGateDraft,
} from '../../core/pipelines/pipelineConditionalGate.js';
import {
    type PipelineModuleTarget,
    upsertPipelinePackModuleTarget,
    type PipelinePack,
} from '../../core/pipelines/pipelinePack.js';
import { updatePipelinePackConnectorMetadata } from '../../core/pipelines/pipelinePackInspector.js';
import {
    PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT,
    PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT,
    PIPELINE_PACK_PRESENTATION_FALLBACK_ENTER_TEXT,
    PIPELINE_PACK_PRESENTATION_FALLBACK_EXIT_TEXT,
    PIPELINE_PACK_PRESENTATION_FALLBACK_HINT_TEXT,
    PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT,
} from '../../core/pipelines/pipelinePackPresentation.js';
import {
    PIPELINE_PACK_ARTIFACT_KIND,
    explainPipelinePackExportBlockers,
    registerPipelinePackArtifactKind,
} from '../../core/pipelines/pipelinePackArtifact.js';
import {
    decodeArtifact,
    encodeArtifact,
    importArtifactKey,
} from '../../core/io/portableArtifacts.js';
import {
    buildGacDd38PipelinePack,
    isGacDd38PipelineTarget,
} from '../../core/pipelines/gacDd38PipelinePreset.js';
import {
    buildMineBeneficiationPipelinePack,
    isMineBeneficiationPipelineTarget,
} from '../../core/pipelines/mineBeneficiationPipelinePreset.js';
import {
    PIPELINE_DIAGRAM_PALETTES,
    applyPipelinePalette,
    autoArrangePipeline,
    movePipelineNode,
    summarizePipelineDiagramEditing,
} from '../../core/pipelines/_diagramEditingPure.js';
import { showToast } from './toast.js';
import { getHeadlessMeta } from '../api/registry.js';
import { ACTION_REGISTRY } from '../api/registry.js';
import { t } from '../i18n/translations.js';

function _label(key: string, fallback: string): string {
    const translated = t(key);
    return translated && translated !== key ? translated : fallback;
}

// ----------------------------------------------------------------
// METADADOS DE CATEGORIAS - label PT-BR + cor para o action picker
// ----------------------------------------------------------------

const CAT_META = {
    elements: { label: 'Elementos', color: '#22c55e' },
    observations: { label: 'Observações', color: '#3b82f6' },
    campaigns: { label: 'Campanhas', color: '#a855f7' },
    families: { label: 'Famílias', color: '#10b981' },
    edges: { label: 'Conexões', color: '#6366f1' },
    stamps: { label: 'Timestamps', color: '#f97316' },
    parameters: { label: 'Parâmetros', color: '#f59e0b' },
    scenes: { label: 'Cenas', color: '#06b6d4' },
    camera: { label: 'Câmera', color: '#0ea5e9' },
    panels: { label: 'Painéis', color: '#64748b' },
    ui: { label: 'Interface', color: '#94a3b8' },
    project: { label: 'Projeto', color: '#d97706' },
    model: { label: 'Modelo', color: '#b45309' },
    governance: { label: 'Governança', color: '#dc2626' },
    io: { label: 'Import/Export', color: '#7c3aed' },
    merge: { label: 'Mesclagem', color: '#0d9488' },
    storage: { label: 'Armazenamento', color: '#475569' },
    analytics: { label: 'Análise', color: '#0891b2' },
    calculator: { label: 'Calculadora', color: '#0369a1' },
    interpolation: { label: 'Interpolação', color: '#0284c7' },
    sao: { label: 'SAO / ESH', color: '#be123c' },
    sensor: { label: 'Sensores', color: '#15803d' },
    ticker: { label: 'Ticker', color: '#a16207' },
    llm: { label: 'IA / LLM', color: '#7c3aed' },
    agents: { label: 'Agentes', color: '#6d28d9' },
    smartImport: { label: 'Smart Import', color: '#0f766e' },
    report: { label: 'Relatórios', color: '#e11d48' },
    automation: { label: 'Automacao', color: '#14b8a6' },
    presentation: { label: 'Presentation', color: '#8b5cf6' },
    pipelines: { label: 'Pipelines', color: '#f97316' },
    outros: { label: 'Outros', color: '#6b7280' },
};

// ----------------------------------------------------------------
// ESTADO DO MÓDULO
// ----------------------------------------------------------------

type PipelinePackPresentationRuntimeMode = 'off' | 'native' | 'fallback';

let _kvIdCounter = 0;
let _nativeEditorState: {
    containerId: string;
    model: any;
    selectedNodeId: string | null;
    selectedConnectorId: string | null;
    workbenchPack: PipelinePack | null;
    presentationActive: boolean;
    presentationFullscreenMode: PipelinePackPresentationRuntimeMode;
    presentationFallbackReason: string;
} | null = null;

const PIPELINE_PACK_LAST_EXPORTED_KEY = 'ecbyts-last-pipeline-pack-key';
let _lastPipelinePackKeyInMemory = '';

/**
 * Seleciona um elemento quando houver suporte nativo; hoje fecha painel legado.
 * @param {string} elementId - ID do elemento
 * @returns {boolean} true se o elemento foi encontrado e selecionado
 */
// Helper exposto para o inline-onchange do select de ações
/**
 * @param {string} actionName
 * @returns {string}
 */
(window as any)._pipelineActionMeta = function (actionName: any) {
    const meta = ACTION_REGISTRY.find((e: any) => e.name === actionName);
    return meta?.params?.length
        ? `Parâmetros: <b>${meta.params.join(', ')}</b>`
        : actionName
          ? 'Sem parâmetros obrigatórios'
          : 'Selecione uma ação';
};

/**
 * @param {string} elementId
 * @returns {boolean}
 */
export function selectPipelineElement(elementId: any): boolean {
    const id = String(elementId || '');
    const state = _nativeEditorState;
    if (!state || !id) {
        _hidePropPanel();
        return false;
    }
    const node = Array.isArray(state.model?.nodes)
        ? state.model.nodes.find((item: any) => String(item?.id || '') === id)
        : null;
    if (!node) {
        _hidePropPanel();
        return false;
    }
    _syncNativeNodeWithPipelinePackTarget(node, _findPipelinePackTargetByNodeId(id));
    state.selectedNodeId = id;
    _highlightNativeNode(id);
    _syncPipelinePackWorkbenchSelection(id);
    _showNativeNodePanel(node);
    return true;
}

/**
 * Deseleciona todos os elementos e oculta o painel de propriedades.
 * Útil para testes E2E.
 */
export function deselectPipelineElements() {
    if (_nativeEditorState) {
        _nativeEditorState.selectedNodeId = null;
        _nativeEditorState.selectedConnectorId = null;
        _highlightNativeNode(null);
        _syncPipelinePackWorkbenchSelection(null);
    }
    _hidePropPanel();
}

export function selectPipelineConnector(connectorId: any): boolean {
    const id = String(connectorId || '').trim();
    const state = _nativeEditorState;
    if (!state?.workbenchPack || !id) return false;
    const found = state.workbenchPack.graph.edges.some((edge) => edge.id === id);
    if (!found) return false;
    state.selectedConnectorId = id;
    _refreshPipelinePackWorkbench();
    return true;
}

export function getNativePipelineEditorModel(): any | null {
    return _nativeEditorState ? _cloneNativeModel(_nativeEditorState.model) : null;
}

/**
 * Renderiza o diagrama do pipeline com o RENDERIZADOR NATIVO (SVG próprio do
 * ecbyts) - sem editor externo, sem CDN, sem marca d'agua. Usado para pipelines que
 * carregam um modelo nativo { nodes, edges, startNodeId, lanes } (ex.: o
 * GAC-DD38 importado de uma chave ECBT). Read-only por enquanto (render fiel);
 * a edição estrutural continua via editor linear.
 *
 * @param {string} containerId
 * @param {{ nodes?: any[], edges?: any[], startNodeId?: string|null, lanes?: any[] }} model
 * @returns {boolean} true se renderizou
 */
export function renderNativeCanvas(containerId: any, model: any): boolean {
    const container = document.getElementById(containerId);
    if (!container) return false;
    const workingModel = _cloneNativeModel(model || {});
    const workbenchPack = _resolveNativePipelinePack(workingModel);
    _nativeEditorState = {
        containerId: String(containerId || ''),
        model: workingModel,
        selectedNodeId: null,
        selectedConnectorId: null,
        workbenchPack,
        presentationActive: false,
        presentationFullscreenMode: 'off',
        presentationFallbackReason: '',
    };
    const svg = buildPipelineDiagramSvg(workingModel || {}).replace('<svg ', '<svg style="width:100%;height:auto;display:block;position:relative;z-index:2" ');
    const workbenchHtml = _renderNativePipelinePackWorkbench(workbenchPack);
    const workbenchLayoutStyle = workbenchHtml
        ? 'display:grid;grid-template-columns:minmax(760px,1fr) minmax(300px,360px);gap:0;align-items:start;min-width:980px'
        : 'display:block';
    const presentButtonHtml = workbenchHtml
        ? `<button type="button" class="pl-present-fullscreen btn-primary btn-sm" data-pipeline-pack-present-fullscreen="true" aria-pressed="false" title="${_esc(PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT)}">${_esc(PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT)}</button>
           <span class="pl-present-hint" style="color:#93a4bd">${_esc(PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT)}</span>`
        : '';
    const presentationExitControlHtml = workbenchHtml
        ? `<button type="button" class="pl-presentation-exit btn-primary btn-sm" data-pipeline-pack-present-fullscreen="true" data-pipeline-pack-presentation-exit="true" data-pipeline-pack-fullscreen-mode="off" data-pipeline-pack-fullscreen-element="false" aria-pressed="false" title="${_esc(PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT)}">${_esc(PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT)}</button>
           <div class="pl-presentation-status" data-pipeline-pack-presentation-evidence="off" data-pipeline-pack-fullscreen-mode="off" data-pipeline-pack-fullscreen-element="false" data-pipeline-pack-fullscreen-fallback-reason="" aria-live="polite"></div>`
        : '';
    // Estrutura: barra de controles + palco (imagem de referência ATRÁS + SVG na FRENTE).
    // Permite sobrepor o fluxo ORIGINAL (imagem) ao fluxo REAL (SVG) e ajustar
    // opacidade/escala/deslocamento p/ comparar pixel-a-pixel. + Exportar PNG.
    container.innerHTML = `
      <div class="pipeline-native-canvas" style="width:100%;height:100%;overflow:auto;background:#0f172a;position:relative">
        ${_nativePipelinePackPresentationStyle()}
        ${presentationExitControlHtml}
        <div class="pl-overlay-toolbar" style="position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 12px;background:#111c33;border-bottom:1px solid #1e293b;font:12px system-ui;color:#e2e8f0">
          <button type="button" class="pl-ref-load btn-secondary btn-sm">${_esc(_label('pipeline.overlay.loadRef', 'Carregar referência'))}</button>
          <label style="display:flex;align-items:center;gap:6px" title="Opacidade da imagem de referência (PDF)">${_esc(_label('pipeline.overlay.opacity', 'Opacidade'))}
            <input type="range" class="pl-ref-opacity" min="0" max="100" value="55" style="width:80px"></label>
          <label style="display:flex;align-items:center;gap:6px" title="Opacidade do diagrama desenhado — baixe a 0 p/ ver SÓ a referência (PDF) pixel-a-pixel">${_esc(_label('pipeline.overlay.diagramOpacity', 'Diagrama'))}
            <input type="range" class="pl-diagram-opacity" min="0" max="100" value="100" style="width:80px"></label>
          <label style="display:flex;align-items:center;gap:4px" title="${_esc(_label('pipeline.overlay.rotate', 'Rotação'))} (graus)">${_esc(_label('pipeline.overlay.rotate', 'Rotação'))}
            <select class="pl-ref-rot" style="width:62px"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
          <label style="display:flex;align-items:center;gap:4px" title="${_esc(_label('pipeline.overlay.scale', 'Escala'))} X (%)">Esc.X<input type="number" class="pl-ref-sx" value="100" step="1" style="width:56px"></label>
          <label style="display:flex;align-items:center;gap:4px" title="${_esc(_label('pipeline.overlay.scale', 'Escala'))} Y (%)">Esc.Y<input type="number" class="pl-ref-sy" value="100" step="1" style="width:56px"></label>
          <label style="display:flex;align-items:center;gap:4px" title="Deslocamento X (px)">X<input type="number" class="pl-ref-x" value="0" step="1" style="width:54px"></label>
          <label style="display:flex;align-items:center;gap:4px" title="Deslocamento Y (px)">Y<input type="number" class="pl-ref-y" value="0" step="1" style="width:54px"></label>
          <button type="button" class="pl-ref-clear btn-secondary btn-sm" title="Remover referência">×</button>
          <span style="flex:1"></span>
          <span style="display:inline-flex;align-items:center;gap:2px" title="${_esc(_label('pipeline.overlay.zoom', 'Zoom'))}">
            <button type="button" class="pl-zoom-out btn-secondary btn-sm" title="Diminuir zoom">−</button>
            <span class="pl-zoom-val" style="min-width:44px;text-align:center">100%</span>
            <button type="button" class="pl-zoom-in btn-secondary btn-sm" title="Aumentar zoom">+</button>
            <button type="button" class="pl-zoom-fit btn-secondary btn-sm" title="Ajustar à tela">${_esc(_label('pipeline.overlay.fit', 'Ajustar'))}</button>
          </span>
          <button type="button" class="pl-auto-layout btn-secondary btn-sm" title="Reorganizar blocos, raias, fases e conectores">${_esc(_label('pipeline.overlay.autoLayout', 'Auto-organizar'))}</button>
          <label style="display:flex;align-items:center;gap:4px" title="Trocar paleta visual do fluxograma">${_esc(_label('pipeline.overlay.palette', 'Paleta'))}
            <select class="pl-palette" style="width:136px">${_paletteOptions((workingModel as any)?.diagramPalette)}</select></label>
          <button type="button" class="pl-legend-toggle btn-secondary btn-sm" title="Mostrar/ocultar legenda" aria-pressed="true">${_esc(_label('pipeline.overlay.legend', 'Legenda'))}</button>
          <button type="button" class="pl-export-png btn-primary btn-sm">${_esc(_label('pipeline.overlay.exportPng', 'Exportar PNG'))}</button>
          ${presentButtonHtml}
        </div>
        <div class="pl-workbench-layout" style="${workbenchLayoutStyle}">
          <div class="pl-stage-cell" style="position:relative;min-width:0">
          <div class="pl-stage" style="position:relative;width:100%;transform-origin:top left;transition:transform .08s">
          <img class="pl-ref-img" alt="referência" style="position:absolute;top:0;left:0;width:100%;height:auto;opacity:.55;display:none;pointer-events:none;transform-origin:top left;z-index:1" />
          <div class="pl-svg-holder" style="position:relative;z-index:2">${svg}</div>
          </div>
          ${_legendHtml()}
          </div>
          ${workbenchHtml}
        </div>
      </div>`;
    _wireNativeOverlay(container);
    _wireNativeNodeSelection(container);
    _wirePipelinePackWorkbench(container);
    _wirePipelinePackPresentation(container);
    return true;
}

function _resolveNativePipelinePack(model: any): PipelinePack | null {
    if ((CONFIG.FEATURES as any)?.PIPELINE_PACK_WORKBENCH === false) return null;
    if (isMineBeneficiationPipelineTarget(model)) return buildMineBeneficiationPipelinePack();
    if (isGacDd38PipelineTarget(model)) return buildGacDd38PipelinePack();
    return null;
}

function _renderNativePipelinePackWorkbench(pack: PipelinePack | null | undefined): string {
    if (!pack) return '';
    const options: any = {
        maxTargets: 8,
        maxAssets: 4,
        // GAC-DD38-NORMATIVE-COVERAGE-001 (aprovada Calvin, executada 2026-07-01):
        // flag ON por default; false = rollback hatch efetivo da Base DD-038.
        baseDd038Enabled: (CONFIG.FEATURES as any)?.GAC_DD38_NORMATIVE_COVERAGE !== false,
    };
    if (_nativeEditorState?.selectedNodeId) options.selectedNodeId = _nativeEditorState.selectedNodeId;
    if (_nativeEditorState?.selectedConnectorId) options.selectedConnectorId = _nativeEditorState.selectedConnectorId;
    return renderPipelinePackWorkbenchHtml(pack, options);
}

function _findPipelinePackTargetByNodeId(nodeId: string): PipelineModuleTarget | null {
    const targets = _nativeEditorState?.workbenchPack?.moduleTargets || [];
    return targets.find((target) => target.ownerNodeId === nodeId) || null;
}

function _syncNativeNodeWithPipelinePackTarget(node: any, target: PipelineModuleTarget | null): void {
    if (!node || !target) return;
    node.targetModule = target.moduleId || node.targetModule;
    node.contextLabel = target.label || node.contextLabel;
    node.moduleInputParams = {
        ...(target.targetParams || {}),
        nodeId: target.ownerNodeId || node.id,
        adapterId: target.adapterId || target.moduleId,
    };
}

function _wirePipelinePackWorkbench(root: HTMLElement): void {
    // PACK#46: o card de decisao (.pipeline-pack-workbench-gate) tambem carrega
    // data-pipeline-pack-inspect-node + aria-label "Selecionar decisao", mas ficava
    // FORA deste seletor — clicar nele nao abria o editor de gate. Inclui a classe.
    root.querySelectorAll('.pipeline-pack-workbench-summary-button[data-pipeline-pack-inspect-node], .pipeline-pack-workbench-gate[data-pipeline-pack-inspect-node]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackSummaryWired === 'true') return;
        (button as any).dataset.pipelinePackSummaryWired = 'true';
        button.addEventListener('click', () => {
            const nodeId = button.dataset.pipelinePackInspectNode || button.dataset.pipelinePackNodeId || '';
            if (!nodeId) return;
            const selected = selectPipelineElement(nodeId);
            if (selected) {
                setTimeout(() => {
                    const inspector = root.querySelector('[data-pipeline-pack-inspector]') as HTMLElement | null;
                    _focusPipelinePackVisibleElement(inspector);
                }, 0);
                showToast('Ponto selecionado no resumo. Detalhes e ligacao prontos para revisar.', 'info');
            }
        });
    });
    root.querySelectorAll('.pipeline-pack-workbench-target[data-pipeline-pack-node-id]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackWired === 'true') return;
        (button as any).dataset.pipelinePackWired = 'true';
        button.addEventListener('click', () => {
            const nodeId = button.dataset.pipelinePackNodeId || '';
            const moduleId = button.dataset.pipelinePackModuleId || '';
            if (nodeId) {
                selectPipelineElement(nodeId);
                _highlightNativeNode(nodeId);
            }
            showToast(moduleId ? `De-para selecionado: ${moduleId}.` : 'De-para selecionado.', 'info');
        });
    });
    root.querySelectorAll('[data-pipeline-pack-inspect-connector]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackConnectorWired === 'true') return;
        (button as any).dataset.pipelinePackConnectorWired = 'true';
        button.addEventListener('click', () => {
            const connectorId = button.dataset.pipelinePackInspectConnector || button.dataset.pipelinePackConnectorId || '';
            if (!connectorId) return;
            if (selectPipelineConnector(connectorId)) {
                setTimeout(() => {
                    const inspector = root.querySelector('[data-pipeline-pack-connector-inspector]') as HTMLElement | null;
                    _focusPipelinePackVisibleElement(inspector);
                }, 0);
                showToast('Conector selecionado. Dados, evidencias e rota de falha prontos para revisar.', 'info');
            }
        });
    });
    root.querySelectorAll('[data-pipeline-pack-open-target][data-pipeline-pack-node-id]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackOpenTargetWired === 'true') return;
        (button as any).dataset.pipelinePackOpenTargetWired = 'true';
        button.addEventListener('click', () => {
            const nodeId = button.dataset.pipelinePackNodeId || '';
            if (!nodeId) return;
            const state = _nativeEditorState;
            const node = Array.isArray(state?.model?.nodes)
                ? state.model.nodes.find((entry: any) => String(entry?.id || '') === nodeId)
                : null;
            if (!node) {
                showToast('Ponto nao encontrado para abrir a area.', 'warning');
                return;
            }
            _syncNativeNodeWithPipelinePackTarget(node, _findPipelinePackTargetByNodeId(nodeId));
            state!.selectedNodeId = nodeId;
            _highlightNativeNode(nodeId);
            _syncPipelinePackWorkbenchSelection(nodeId);
            _openNativeTargetModule(node);
        });
    });
    root.querySelectorAll('[data-pipeline-pack-save-target]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackSaveWired === 'true') return;
        (button as any).dataset.pipelinePackSaveWired = 'true';
        button.addEventListener('click', () => _savePipelinePackTargetFromWorkbench(button));
    });
    root.querySelectorAll('[data-pipeline-pack-save-connector]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackSaveConnectorWired === 'true') return;
        (button as any).dataset.pipelinePackSaveConnectorWired = 'true';
        button.addEventListener('click', () => _savePipelinePackConnectorFromWorkbench(button));
    });
    root.querySelectorAll('[data-pipeline-pack-save-parameter]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackSaveParameterWired === 'true') return;
        (button as any).dataset.pipelinePackSaveParameterWired = 'true';
        button.addEventListener('click', () => _savePipelinePackTechnicalParameterFromWorkbench(button));
    });
    root.querySelectorAll('[data-pipeline-pack-export-key]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackExportWired === 'true') return;
        (button as any).dataset.pipelinePackExportWired = 'true';
        button.addEventListener('click', () => void _exportPipelinePackKeyFromWorkbench());
    });
    root.querySelectorAll('[data-pipeline-pack-import-key]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackImportWired === 'true') return;
        (button as any).dataset.pipelinePackImportWired = 'true';
        button.addEventListener('click', () => _pickPipelinePackKeyFile());
    });
    root.querySelectorAll('[data-pipeline-pack-import-clipboard]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackImportClipboardWired === 'true') return;
        (button as any).dataset.pipelinePackImportClipboardWired = 'true';
        button.addEventListener('click', () => void _importPipelinePackKeyFromClipboard());
    });
    root.querySelectorAll('[data-pipeline-pack-export-report]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackReportWired === 'true') return;
        (button as any).dataset.pipelinePackReportWired = 'true';
        button.addEventListener('click', () => _exportPipelinePackReportFromWorkbench());
    });
    root.querySelectorAll('[data-pipeline-pack-export-tag-report]').forEach((item) => {
        const button = item as HTMLElement;
        button.textContent = _label('pipelinePack.tagCoverage.export', 'Exportar relatorio de tags');
        if ((button as any).dataset.pipelinePackTagReportWired === 'true') return;
        (button as any).dataset.pipelinePackTagReportWired = 'true';
        button.addEventListener('click', () => _exportPipelinePackTagCoverageReportFromWorkbench());
    });
    root.querySelectorAll('[data-pipeline-pack-reference-upload]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackReferenceWired === 'true') return;
        (button as any).dataset.pipelinePackReferenceWired = 'true';
        button.addEventListener('click', () => _pickPipelinePackVisualReference());
    });
    root.querySelectorAll('[data-pipeline-pack-open-library]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackLibraryWired === 'true') return;
        (button as any).dataset.pipelinePackLibraryWired = 'true';
        button.addEventListener('click', () => _focusPipelinePackLibraryEntry(button));
    });
    root.querySelectorAll('[data-pipeline-pack-present]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackPresentWired === 'true') return;
        (button as any).dataset.pipelinePackPresentWired = 'true';
        button.addEventListener('click', () => void _togglePipelinePackPresentation(root));
    });
}

function _focusPipelinePackVisibleElement(element: HTMLElement | null): void {
    if (!element) return;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    element.focus?.({ preventScroll: true });
    element.dataset.pipelinePackFocusVisible = 'true';
}

async function _exportPipelinePackKeyFromWorkbench(): Promise<void> {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Nao ha Pipeline Pack aberto para exportar.', 'warning');
        return;
    }
    // Antecipa o impedimento em linguagem de processo. Sem isto o usuario so
    // recebia a mensagem crua do encoder depois da falha da exportacao.
    const blockers = explainPipelinePackExportBlockers(state.workbenchPack);
    const firstBlocker = blockers.blockers[0];
    if (!blockers.ok && firstBlocker) {
        console.debug('[pipeline-editor] export blocked:', blockers.blockers.map((item) => item.technicalCode).join(', '));
        _markPipelinePackExportBlocked(blockers.blockers.length);
        showToast(
            `${_label('pipelinePack.export.blocked', 'Nao da para exportar ainda')}: `
            + `${firstBlocker.userMessage} ${firstBlocker.suggestedFix}`,
            'warning',
        );
        return;
    }
    try {
        registerPipelinePackArtifactKind();
        const key = await encodeArtifact(PIPELINE_PACK_ARTIFACT_KIND, state.workbenchPack);
        _rememberLastPipelinePackKey(key);
        _downloadTextFile(_pipelinePackFileName(state.workbenchPack), key);
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(key);
                showToast('Chave .ecbt do Pipeline Pack exportada e copiada.', 'success');
            } catch (_clipboardError) {
                showToast('Chave .ecbt exportada e pronta para reimportar nesta sessao.', 'success');
            }
            return;
        }
        showToast('Chave .ecbt do Pipeline Pack exportada e pronta para reimportar nesta sessao.', 'success');
    } catch (error: any) {
        // O motivo cru fica no log; a tela recebe linguagem de processo.
        console.debug('[pipeline-editor] export failed:', error?.message || error);
        _markPipelinePackExportBlocked(1);
        showToast(
            _label(
                'pipelinePack.export.failed',
                'Nao foi possivel gerar o arquivo do processo. Revise os pontos pendentes e tente de novo.',
            ),
            'error',
        );
    }
}

function _exportPipelinePackReportFromWorkbench(): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Nao ha Pipeline Pack aberto para salvar relatorio.', 'warning');
        return;
    }
    try {
        const options: any = {};
        if (state.selectedNodeId) options.selectedNodeId = state.selectedNodeId;
        const report = renderPipelinePackWorkbenchReportMarkdown(state.workbenchPack, options);
        _downloadTextFile(_pipelinePackReportFileName(state.workbenchPack), report);
        showToast('Relatorio do Pipeline Pack salvo.', 'success');
    } catch (error: any) {
        showToast(`Falha ao salvar relatorio: ${error?.message || error}`, 'error');
    }
}

function _exportPipelinePackTagCoverageReportFromWorkbench(): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast(_label('pipelinePack.tagCoverage.noPack', 'Nao ha Pipeline Pack aberto para exportar o relatorio de tags.'), 'warning');
        return;
    }
    try {
        const report = renderPipelinePackTagCoverageReportMarkdown(state.workbenchPack);
        _downloadTextFile(_pipelinePackTagReportFileName(state.workbenchPack), report);
        showToast(_label('pipelinePack.tagCoverage.exported', 'Relatorio de cobertura por tag exportado.'), 'success');
    } catch (error: any) {
        showToast(`${_label('pipelinePack.tagCoverage.exportError', 'Falha ao exportar relatorio de tags')}: ${error?.message || error}`, 'error');
    }
}

function _pickPipelinePackKeyFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ecbt,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) void _importPipelinePackKeyFromFile(file);
        input.remove();
    });
    document.body.appendChild(input);
    input.click();
}

function _pickPipelinePackVisualReference(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.png,.jpg,.jpeg,.webp,.pdf,application/pdf';
    input.style.display = 'none';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) {
            _markPipelinePackVisualReference(file);
            showToast(`Referencia visual carregada: ${file.name}`, 'success');
        }
        input.remove();
    });
    document.body.appendChild(input);
    input.click();
}

function _focusPipelinePackLibraryEntry(button: HTMLElement): void {
    const workbench = _workbenchElement();
    const section = (button.closest('[data-pipeline-pack-library-entry]') as HTMLElement | null)
        || (workbench?.querySelector('[data-pipeline-pack-library-entry="my-processes"]') as HTMLElement | null);
    if (!section) {
        showToast('Nao encontrei a entrada Meus processos nesta tela.', 'warning');
        return;
    }
    section.dataset.pipelinePackLibraryLastOpen = 'focused';
    section.setAttribute('tabindex', '-1');
    _focusPipelinePackVisibleElement(section);
    showToast('Meus processos em foco: use esta entrada para localizar processos criados ou recebidos.', 'info');
}

async function _importPipelinePackKeyFromClipboard(): Promise<void> {
    try {
        const key = await _readPipelinePackKeyFromClipboardOrSession();
        await _importPipelinePackKeyText(key, 'Pipeline Pack importado da chave copiada.');
    } catch (error: any) {
        showToast(`Falha ao ler chave copiada: ${error?.message || error}`, 'error');
    }
}

async function _readPipelinePackKeyFromClipboardOrSession(): Promise<string> {
    const sessionKey = _getLastPipelinePackKey();
    if (sessionKey) return sessionKey;
    if (navigator.clipboard?.readText) {
        try {
            const key = String(await navigator.clipboard.readText() || '').trim();
            if (key) return key;
        } catch (error: any) {
            console.debug('[pipeline-editor] clipboard read unavailable:', error instanceof Error ? error.message : error);
        }
    }
    return _getLastPipelinePackKey();
}

function _rememberLastPipelinePackKey(key: string): void {
    _lastPipelinePackKeyInMemory = String(key || '');
    try {
        sessionStorage.setItem(PIPELINE_PACK_LAST_EXPORTED_KEY, _lastPipelinePackKeyInMemory);
    } catch (error: any) {
        console.debug('[pipeline-editor] store exported key fallback failed:', error instanceof Error ? error.message : error);
    }
    _markPipelinePackExportResult(_lastPipelinePackKeyInMemory.length);
}

function _getLastPipelinePackKey(): string {
    try {
        return String(sessionStorage.getItem(PIPELINE_PACK_LAST_EXPORTED_KEY) || _lastPipelinePackKeyInMemory || '').trim();
    } catch (_error) {
        return _lastPipelinePackKeyInMemory.trim();
    }
}

async function _importPipelinePackKeyFromFile(file: File): Promise<void> {
    try {
        const key = await file.text();
        await _importPipelinePackKeyText(key, 'Pipeline Pack importado nesta sessao.');
    } catch (error: any) {
        showToast(`Falha ao importar Pipeline Pack: ${error?.message || error}`, 'error');
    }
}

async function _importPipelinePackKeyText(key: string, successMessage: string): Promise<void> {
    registerPipelinePackArtifactKind();
    const rawKey = String(key || '').trim();
    if (!rawKey) {
        showToast('A chave copiada esta vazia.', 'warning');
        return;
    }
    const decoded = await decodeArtifact(rawKey);
    if (!decoded || decoded.kind !== PIPELINE_PACK_ARTIFACT_KIND) {
        showToast('Esta chave nao e um Pipeline Pack.', 'warning');
        return;
    }
    if (!_nativeEditorState) {
        showToast('Abra um Pipeline Pack antes de importar nesta sessao.', 'warning');
        return;
    }
    const ok = await importArtifactKey(rawKey);
    _nativeEditorState!.workbenchPack = decoded.obj as PipelinePack;
    _refreshPipelinePackWorkbench();
    _markPipelinePackImportResult(ok);
    showToast(
        ok ? successMessage : `${successMessage} O navegador nao confirmou salvamento local; mantive nesta sessao.`,
        ok ? 'success' : 'warning',
    );
}

function _workbenchElement(): HTMLElement | null {
    const state = _nativeEditorState;
    const container = state?.containerId ? document.getElementById(state.containerId) : null;
    return (container?.querySelector('.pipeline-pack-workbench') as HTMLElement | null)
        || (document.querySelector('.pipeline-pack-workbench') as HTMLElement | null);
}

function _markPipelinePackExportResult(keyLength: number): void {
    const workbench = _workbenchElement();
    if (!workbench) return;
    workbench.dataset.pipelinePackLastExport = keyLength > 0 ? 'ready' : 'empty';
    workbench.dataset.pipelinePackLastExportKeyLength = String(keyLength);
    delete workbench.dataset.pipelinePackLastExportBlockers;
}

/**
 * Marca durável do impedimento de exportacao. O toast some sozinho; sem este
 * marcador nao ha como a jornada (nem o usuario que volta a tela) saber por que
 * a chave nao saiu.
 */
function _markPipelinePackExportBlocked(blockerCount: number): void {
    const workbench = _workbenchElement();
    if (!workbench) return;
    workbench.dataset.pipelinePackLastExport = 'blocked';
    workbench.dataset.pipelinePackLastExportBlockers = String(blockerCount);
}

function _markPipelinePackImportResult(persisted: boolean): void {
    const workbench = _workbenchElement();
    if (!workbench) return;
    workbench.dataset.pipelinePackLastImport = persisted ? 'persisted' : 'session';
    workbench.dataset.pipelinePackLastImportTitle = _nativeEditorState?.workbenchPack?.title || '';
}

function _markPipelinePackVisualReference(file: File): void {
    const workbench = _workbenchElement();
    if (!workbench) return;
    workbench.dataset.pipelinePackVisualReference = 'loaded';
    workbench.dataset.pipelinePackVisualReferenceName = file.name;
    workbench.dataset.pipelinePackVisualReferenceType = file.type || 'unknown';
    workbench.dataset.pipelinePackVisualReferenceSize = String(file.size || 0);
    const status = workbench.querySelector('[data-pipeline-pack-reference-status]') as HTMLElement | null;
    if (status) {
        status.dataset.pipelinePackReferenceStatus = 'loaded';
        status.textContent = `Referencia carregada: ${file.name}`;
    }
}

function _pipelinePackFileName(pack: PipelinePack): string {
    const slug = String(pack.title || pack.id || 'pipeline-pack')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 80) || 'pipeline-pack';
    return `${slug}.ecbt`;
}

function _pipelinePackReportFileName(pack: PipelinePack): string {
    return _pipelinePackFileName(pack).replace(/\.ecbt$/i, '-relatorio.md');
}

function _pipelinePackTagReportFileName(pack: PipelinePack): string {
    return _pipelinePackFileName(pack).replace(/\.ecbt$/i, '-relatorio-tags.md');
}

function _downloadTextFile(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function _savePipelinePackTargetFromWorkbench(button: HTMLElement): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Nao ha Pipeline Pack aberto para editar.', 'warning');
        return;
    }
    const card = button.closest('.pipeline-pack-workbench-target-card') as HTMLElement | null;
    const nodeId = button.dataset.pipelinePackNodeId || '';
    const targetId = button.dataset.pipelinePackTargetId || '';
    const currentTarget = state.workbenchPack.moduleTargets.find((target) =>
        (!!targetId && target.id === targetId) || (!!nodeId && target.ownerNodeId === nodeId),
    );
    const moduleId = String((card?.querySelector('.pipeline-pack-workbench-edit-module') as HTMLSelectElement | null)?.value || '').trim();
    const adapterId = String((card?.querySelector('.pipeline-pack-workbench-edit-adapter') as HTMLInputElement | null)?.value || '').trim() || moduleId;
    const fallbackText = String((card?.querySelector('.pipeline-pack-workbench-edit-fallback') as HTMLTextAreaElement | null)?.value || '').trim()
        || currentTarget?.fallback?.text
        || `Se ${adapterId || moduleId} nao abrir, manter o usuario neste processo.`;
    if (!nodeId || !moduleId) {
        showToast('Escolha um no e um modulo antes de aplicar o de-para.', 'warning');
        return;
    }
    state.workbenchPack = upsertPipelinePackModuleTarget(state.workbenchPack, {
        ownerNodeId: nodeId,
        ...(currentTarget?.label ? { label: currentTarget.label } : {}),
        moduleId,
        adapterId,
        openMode: currentTarget?.openMode || 'open-live',
        targetParams: currentTarget?.targetParams || { source: 'pipeline-workbench-ui' },
        fallback: {
            type: currentTarget?.fallback?.type || 'message',
            ...(currentTarget?.fallback?.assetId ? { assetId: currentTarget.fallback.assetId } : {}),
            text: fallbackText,
        },
        requiredPermission: currentTarget?.requiredPermission || 'view',
    });
    _refreshPipelinePackWorkbench();
    selectPipelineElement(nodeId);
    showToast(`De-para atualizado nesta sessao: ${moduleId}.`, 'success');
}

function _readConnectorRefs(value: string): string[] {
    return Array.from(new Set(String(value || '').split(/[,;\n\r]+/).map((item) => item.trim()).filter(Boolean)));
}

function _savePipelinePackConnectorFromWorkbench(button: HTMLElement): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Nao ha Pipeline Pack aberto para editar.', 'warning');
        return;
    }
    const connectorId = button.dataset.pipelinePackConnectorId || '';
    const editor = button.closest('[data-pipeline-pack-connector-editor]') as HTMLElement | null;
    const current = state.workbenchPack.graph.edges.find((edge) => edge.id === connectorId);
    if (!connectorId || !current || !editor) {
        showToast('Selecione um conector existente antes de aplicar.', 'warning');
        return;
    }
    const kind = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-kind') as HTMLSelectElement | null)?.value || current.kind).trim();
    const direction = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-direction') as HTMLSelectElement | null)?.value || current.direction || 'forward').trim();
    const requiredValue = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-required') as HTMLSelectElement | null)?.value || 'true').trim();
    const dataRefs = _readConnectorRefs(String((editor.querySelector('.pipeline-pack-workbench-edit-connector-data') as HTMLInputElement | null)?.value || ''));
    const evidenceRefs = _readConnectorRefs(String((editor.querySelector('.pipeline-pack-workbench-edit-connector-evidence') as HTMLInputElement | null)?.value || ''));
    const conditionRef = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-condition') as HTMLSelectElement | null)?.value || '').trim();
    const failureBehavior = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-failure') as HTMLSelectElement | null)?.value || current.failureBehavior || 'block').trim();
    const semanticJustification = String((editor.querySelector('.pipeline-pack-workbench-edit-connector-justification') as HTMLTextAreaElement | null)?.value || '').trim();

    // A condicao so vale se apontar para uma decisao que existe no processo
    // (o protocolo rejeita o resto na exportacao). Bloqueia aqui, no salvamento,
    // em vez de deixar o processo virar inexportavel sem o usuario perceber.
    if (conditionRef && !extractPipelineConditionalGates(state.workbenchPack).some((gate) => gate.nodeId === conditionRef)) {
        showToast(
            _label(
                'pipelinePack.connector.conditionUnresolved',
                'Escolha uma decisao que existe neste processo ou deixe o conector sem condicao.',
            ),
            'warning',
        );
        return;
    }

    state.workbenchPack = updatePipelinePackConnectorMetadata(state.workbenchPack, {
        connectorId,
        kind,
        direction,
        required: requiredValue !== 'false',
        dataRefs,
        evidenceRefs,
        conditionRef,
        failureBehavior,
        semanticJustification,
    });
    state.selectedConnectorId = connectorId;
    _refreshPipelinePackWorkbench();
    showToast('Conector atualizado nesta sessao.', 'success');
}

function _savePipelinePackTechnicalParameterFromWorkbench(button: HTMLElement): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Nao ha Pipeline Pack aberto para editar.', 'warning');
        return;
    }
    const parameterId = button.dataset.pipelinePackParameterId || '';
    const targetId = button.dataset.pipelinePackTargetId || '';
    const nodeId = button.dataset.pipelinePackNodeId || '';
    const card = button.closest('[data-pipeline-pack-domain-parameter-id]') as HTMLElement | null;
    const value = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-value') as HTMLInputElement | null)?.value || '').trim();
    const status = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-status') as HTMLSelectElement | null)?.value || '').trim();
    const source = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-source') as HTMLInputElement | null)?.value || '').trim();
    const unit = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-unit') as HTMLInputElement | null)?.value || '').trim();
    const basis = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-basis') as HTMLInputElement | null)?.value || '').trim();
    const observationRef = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-observation-ref') as HTMLInputElement | null)?.value || '').trim();
    const observationLabel = String((card?.querySelector('.pipeline-pack-workbench-edit-parameter-observation-label') as HTMLInputElement | null)?.value || '').trim();
    if (!parameterId) {
        showToast('Parametro tecnico nao encontrado para aplicar.', 'warning');
        return;
    }
    if (!targetId && !nodeId && !state.workbenchPack.moduleTargets.length) {
        showToast('Crie uma area de abertura antes de guardar parametros tecnicos.', 'warning');
        return;
    }
    state.workbenchPack = updatePipelinePackTechnicalParameter(state.workbenchPack, {
        parameterId,
        value,
        status,
        source,
        unit,
        basis,
        observationRef,
        observationLabel,
        targetId,
        nodeId,
    });
    if (nodeId) state.selectedNodeId = nodeId;
    _refreshPipelinePackWorkbench();
    showToast('Parametro tecnico atualizado nesta sessao.', 'success');
}

function _refreshPipelinePackWorkbench(): void {
    const state = _nativeEditorState;
    const container = state?.containerId ? document.getElementById(state.containerId) : null;
    const current = container?.querySelector('.pipeline-pack-workbench') as HTMLElement | null;
    if (!state?.workbenchPack || !container || !current) return;
    current.outerHTML = _renderNativePipelinePackWorkbench(state.workbenchPack);
    _wirePipelinePackWorkbench(container);
    _wirePipelinePackPresentation(container);
}

function _syncPipelinePackWorkbenchSelection(nodeId: string | null): void {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) return;
    state.selectedNodeId = nodeId;
    state.selectedConnectorId = null;
    _refreshPipelinePackWorkbench();
}

function _wirePipelinePackPresentation(root: HTMLElement): void {
    root.querySelectorAll('[data-pipeline-pack-present-fullscreen]').forEach((item) => {
        const button = item as HTMLElement;
        if ((button as any).dataset.pipelinePackFullscreenWired === 'true') return;
        (button as any).dataset.pipelinePackFullscreenWired = 'true';
        button.addEventListener('click', () => void _togglePipelinePackPresentation(root));
    });
    const docAny = document as any;
    if ((docAny as any)._ecbytsPipelineFullscreenWired !== 'true') {
        (docAny as any)._ecbytsPipelineFullscreenWired = 'true';
        document.addEventListener('fullscreenchange', () => _syncPipelinePackPresentationFromBrowser());
        document.addEventListener('webkitfullscreenchange', () => _syncPipelinePackPresentationFromBrowser());
    }
    _refreshPipelinePackPresentationDom(false);
}

function _nativePipelinePackPresentationStyle(): string {
    return `
      <style>
        .pipeline-pack-presentation-shell{background:#05070d!important;overflow:hidden!important}
        .pipeline-pack-presentation-shell > .pl-overlay-toolbar,
        .pipeline-pack-presentation-shell .pl-ref-strip{display:none!important}
        .pipeline-pack-presentation-mode{background:#05070d!important;overflow:hidden!important}
        .pipeline-pack-presentation-mode .pl-overlay,
        .pipeline-pack-presentation-mode .pl-overlay-toolbar,
        .pipeline-pack-presentation-mode .pipeline-pack-workbench,
        .pipeline-pack-presentation-mode .pl-ref-img,
        .pipeline-pack-presentation-mode .pl-legend,
        .pipeline-pack-presentation-mode .pl-present-hint{display:none!important}
        .pipeline-pack-presentation-mode .pl-workbench-layout{display:block!important;min-width:0!important;height:100%!important}
        .pipeline-pack-presentation-mode .pl-stage-cell{height:100%!important}
        .pipeline-pack-presentation-mode .pl-stage{width:100%!important;height:100%!important;display:grid!important;place-items:center!important}
        .pipeline-pack-presentation-mode .pl-svg-holder{width:100%!important;max-height:100%!important;overflow:auto!important}
        .pipeline-pack-presentation-mode .pl-svg-holder svg{width:100%!important;max-height:100vh!important;height:auto!important}
        .pl-presentation-exit,
        .pl-presentation-status{display:none}
        .pipeline-pack-presentation-mode .pl-presentation-exit{display:inline-flex!important;position:fixed;top:12px;right:12px;z-index:30}
        .pipeline-pack-presentation-mode .pl-presentation-status[data-pipeline-pack-fullscreen-mode="fallback"]{display:block!important;position:fixed;left:12px;bottom:12px;z-index:30;max-width:min(560px,calc(100vw - 24px));background:#111827;color:#f8fafc;border:1px solid #f59e0b;border-radius:6px;padding:8px 10px;font:13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.35)}
      </style>`;
}

async function _togglePipelinePackPresentation(root: HTMLElement): Promise<void> {
    const state = _nativeEditorState;
    if (!state?.workbenchPack) {
        showToast('Abra um Pipeline Pack antes de apresentar.', 'warning');
        return;
    }
    const canvas = (root.querySelector('.pipeline-native-canvas') as HTMLElement | null) || root;
    const active = _isPipelinePackPresentationActive(canvas);
    if (active) {
        const nativeActive = _browserFullscreenContains(canvas);
        const exited = nativeActive ? await _exitPipelinePackFullscreen() : true;
        _setPipelinePackPresentationActive(false, 'off', '');
        showToast(
            exited
                ? 'Modo apresentacao encerrado. O processo aberto foi preservado.'
                : 'Modo apresentacao visual encerrado. O navegador nao confirmou saida do fullscreen.',
            exited ? 'info' : 'warning',
        );
        return;
    }
    const result = await _requestPipelinePackFullscreen(canvas);
    _setPipelinePackPresentationActive(true, result.mode, result.fallbackReason);
    showToast(
        result.mode === 'native'
            ? 'Modo apresentacao em tela cheia ativado.'
            : `Modo apresentacao ativado nesta tela. ${_pipelinePackFullscreenFallbackText(result.fallbackReason)}.`,
        result.mode === 'native' ? 'success' : 'warning',
    );
}

function _isPipelinePackPresentationActive(canvas: HTMLElement): boolean {
    return _browserFullscreenContains(canvas) || Boolean(_nativeEditorState?.presentationActive);
}

async function _requestPipelinePackFullscreen(canvas: HTMLElement): Promise<{ mode: 'native' | 'fallback'; fallbackReason: string }> {
    const request = _getPipelinePackFullscreenRequest(canvas);
    const unsupportedReason = _pipelinePackFullscreenUnsupportedReason(canvas);
    if (!request || unsupportedReason) {
        return { mode: 'fallback', fallbackReason: unsupportedReason || 'requestFullscreen-unavailable' };
    }
    try {
        await Promise.resolve(request.call(canvas));
        if (_browserFullscreenContains(canvas)) {
            return { mode: 'native', fallbackReason: '' };
        }
        return { mode: 'fallback', fallbackReason: 'document.fullscreenElement-unconfirmed' };
    } catch (error: any) {
        console.debug('[pipeline-editor] requestFullscreen failed:', error instanceof Error ? error.message : error);
        return { mode: 'fallback', fallbackReason: 'requestFullscreen-denied' };
    }
}

function _getPipelinePackFullscreenRequest(canvas: HTMLElement): (() => unknown) | null {
    const request =
        (canvas as any).requestFullscreen ||
        (canvas as any).webkitRequestFullscreen ||
        (canvas as any).msRequestFullscreen;
    return typeof request === 'function' ? request : null;
}

function _pipelinePackFullscreenUnsupportedReason(canvas: HTMLElement): string {
    if (!_getPipelinePackFullscreenRequest(canvas)) return 'requestFullscreen-unavailable';
    const docAny = document as any;
    if (
        docAny.fullscreenEnabled === false ||
        docAny.webkitFullscreenEnabled === false ||
        docAny.msFullscreenEnabled === false
    ) {
        return 'fullscreen-disabled';
    }
    return '';
}

function _isPipelinePackFullscreenSupported(canvas: HTMLElement): boolean {
    return !_pipelinePackFullscreenUnsupportedReason(canvas);
}

function _getBrowserFullscreenElement(): Element | null {
    const docAny = document as any;
    return (docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement || null) as Element | null;
}

function _browserFullscreenContains(canvas: HTMLElement): boolean {
    const fullscreenElement = _getBrowserFullscreenElement();
    return Boolean(fullscreenElement && (fullscreenElement === canvas || canvas.contains(fullscreenElement)));
}

async function _exitPipelinePackFullscreen(): Promise<boolean> {
    const docAny = document as any;
    const exit = docAny.exitFullscreen || docAny.webkitExitFullscreen || docAny.msExitFullscreen;
    if (typeof exit !== 'function') return false;
    try {
        await Promise.resolve(exit.call(document));
        return true;
    } catch (error: any) {
        console.debug('[pipeline-editor] exitFullscreen failed:', error instanceof Error ? error.message : error);
        return false;
    }
}

function _syncPipelinePackPresentationFromBrowser(): void {
    const state = _nativeEditorState;
    if (!state?.containerId) return;
    const container = document.getElementById(state.containerId);
    const canvas = container?.querySelector('.pipeline-native-canvas') as HTMLElement | null;
    if (!canvas) return;
    const active = _browserFullscreenContains(canvas);
    if (active) {
        _setPipelinePackPresentationActive(true, 'native', '');
    } else if (state.presentationFullscreenMode === 'native') {
        _setPipelinePackPresentationActive(false, 'off', 'browser-fullscreen-exited');
    }
}

function _setPipelinePackPresentationActive(
    active: boolean,
    mode: PipelinePackPresentationRuntimeMode,
    fallbackReason: string,
): void {
    const state = _nativeEditorState;
    if (!state?.containerId) return;
    state.presentationActive = active;
    state.presentationFullscreenMode = active ? mode : 'off';
    state.presentationFallbackReason = active && mode === 'fallback'
        ? (fallbackReason || 'visual-fallback')
        : '';
    _refreshPipelinePackPresentationDom(true);
}

function _refreshPipelinePackPresentationDom(focus: boolean): void {
    const state = _nativeEditorState;
    if (!state?.containerId) return;
    const container = document.getElementById(state.containerId);
    const canvas = container?.querySelector('.pipeline-native-canvas') as HTMLElement | null;
    if (!canvas) return;
    const active = Boolean(state.presentationActive);
    const mode: PipelinePackPresentationRuntimeMode = active ? state.presentationFullscreenMode : 'off';
    const fallbackReason = mode === 'fallback' ? (state.presentationFallbackReason || 'visual-fallback') : '';
    const supported = _isPipelinePackFullscreenSupported(canvas);
    const fullscreenElementActive = _browserFullscreenContains(canvas);
    container?.classList.toggle('pipeline-pack-presentation-shell', active);
    canvas.classList.toggle('pipeline-pack-presentation-mode', active);
    canvas.dataset.pipelinePackPresentationActive = String(active);
    canvas.dataset.pipelinePackFullscreenMode = mode;
    canvas.dataset.pipelinePackFullscreenSupported = String(supported);
    canvas.dataset.pipelinePackFullscreenElement = String(fullscreenElementActive);
    canvas.dataset.pipelinePackFullscreenEvidence = fullscreenElementActive ? 'document.fullscreenElement' : '';
    canvas.dataset.pipelinePackFullscreenFallbackReason = fallbackReason;
    container?.querySelectorAll('[data-pipeline-pack-present-fullscreen]').forEach((item) => {
        const button = item as HTMLElement;
        button.setAttribute('aria-pressed', String(active));
        button.dataset.pipelinePackFullscreenMode = mode;
        button.dataset.pipelinePackFullscreenSupported = String(supported);
        button.dataset.pipelinePackFullscreenElement = String(fullscreenElementActive);
        button.dataset.pipelinePackFullscreenEvidence = fullscreenElementActive ? 'document.fullscreenElement' : '';
        button.dataset.pipelinePackFullscreenFallbackReason = fallbackReason;
        button.textContent = _pipelinePackPresentationButtonText(active, mode, supported);
        button.title = active
            ? PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT
            : (supported ? PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT : PIPELINE_PACK_PRESENTATION_FALLBACK_HINT_TEXT);
    });
    container?.querySelectorAll('[data-pipeline-pack-presentation-evidence]').forEach((item) => {
        const status = item as HTMLElement;
        status.dataset.pipelinePackPresentationEvidence = fullscreenElementActive ? 'document.fullscreenElement' : (fallbackReason || 'off');
        status.dataset.pipelinePackFullscreenMode = mode;
        status.dataset.pipelinePackFullscreenSupported = String(supported);
        status.dataset.pipelinePackFullscreenElement = String(fullscreenElementActive);
        status.dataset.pipelinePackFullscreenFallbackReason = fallbackReason;
        status.textContent = _pipelinePackPresentationStatusText(mode, fallbackReason, fullscreenElementActive);
    });
    if (!focus) return;
    const focusTarget = active
        ? ((container?.querySelector('[data-pipeline-pack-presentation-exit="true"]') as HTMLElement | null)
            || (container?.querySelector('[data-pipeline-pack-present-fullscreen]') as HTMLElement | null))
        : (container?.querySelector('.pipeline-pack-workbench') as HTMLElement | null);
    _focusPipelinePackVisibleElement(focusTarget);
}

function _pipelinePackPresentationButtonText(
    active: boolean,
    mode: PipelinePackPresentationRuntimeMode,
    supported: boolean,
): string {
    if (active) return mode === 'fallback'
        ? PIPELINE_PACK_PRESENTATION_FALLBACK_EXIT_TEXT
        : PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT;
    return supported
        ? PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT
        : PIPELINE_PACK_PRESENTATION_FALLBACK_ENTER_TEXT;
}

function _pipelinePackPresentationStatusText(
    mode: PipelinePackPresentationRuntimeMode,
    fallbackReason: string,
    fullscreenElementActive: boolean,
): string {
    if (mode === 'native' && fullscreenElementActive) {
        return 'Tela cheia real confirmada por document.fullscreenElement.';
    }
    if (mode === 'fallback') {
        return `${PIPELINE_PACK_PRESENTATION_FALLBACK_HINT_TEXT} Motivo: ${_pipelinePackFullscreenFallbackText(fallbackReason)}.`;
    }
    return '';
}

function _pipelinePackFullscreenFallbackText(reason: string): string {
    if (reason === 'requestFullscreen-unavailable') return 'requestFullscreen indisponivel neste navegador';
    if (reason === 'fullscreen-disabled') return 'fullscreen bloqueado pelo navegador ou iframe';
    if (reason === 'requestFullscreen-denied') return 'requestFullscreen negado pelo navegador';
    if (reason === 'document.fullscreenElement-unconfirmed') return 'document.fullscreenElement nao confirmou tela cheia';
    if (reason === 'browser-fullscreen-exited') return 'o navegador encerrou fullscreen';
    return 'fallback visual ativo';
}

function _cloneNativeModel(model: any): any {
    try {
        return JSON.parse(JSON.stringify(model || {}));
    } catch (error: any) {
        console.debug('[pipeline-editor] clone native model failed:', error instanceof Error ? error.message : error);
        return {};
    }
}

function _wireNativeNodeSelection(root: any): void {
    const holder = root.querySelector('.pl-svg-holder') as HTMLElement | null;
    if (!holder) return;
    _prepareNativeNodeElements(holder);
    if ((holder as any).dataset.nativeSelectionWired === 'true') return;
    (holder as any).dataset.nativeSelectionWired = 'true';
    holder.addEventListener('pointerdown', (event: PointerEvent) => _handleNativeNodePointerDown(event, holder));
    holder.addEventListener('click', (event: Event) => {
        const target = event.target as Element | null;
        const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;
        if (!nodeEl) return;
        selectPipelineElement(nodeEl.dataset.nodeId || '');
    });
    holder.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as Element | null;
        const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;
        if (!nodeEl) return;
        event.preventDefault();
        selectPipelineElement(nodeEl.dataset.nodeId || '');
    });
}

function _prepareNativeNodeElements(holder: HTMLElement): void {
    holder.querySelectorAll('[data-node-id]').forEach((el) => {
        (el as HTMLElement).style.cursor = 'pointer';
        (el as HTMLElement).setAttribute('tabindex', '0');
        (el as HTMLElement).setAttribute('role', 'button');
        (el as HTMLElement).setAttribute('aria-label', `Mover ou editar bloco ${((el as HTMLElement).dataset.nodeId || '').trim()}`);
    });
}

function _highlightNativeNode(nodeId: string | null): void {
    const containerId = _nativeEditorState?.containerId || '';
    const container = containerId ? document.getElementById(containerId) : null;
    if (!container) return;
    container.querySelectorAll('[data-node-id]').forEach((group) => {
        const el = group as HTMLElement;
        const selected = !!nodeId && el.dataset.nodeId === nodeId;
        el.classList.toggle('pl-node--selected', selected);
        const rect = el.querySelector('rect') as SVGRectElement | null;
        if (!rect) return;
        if (!rect.dataset.origStroke) {
            rect.dataset.origStroke = rect.getAttribute('stroke') || '';
            rect.dataset.origStrokeWidth = rect.getAttribute('stroke-width') || '';
        }
        rect.setAttribute('stroke', selected ? '#0ea5e9' : rect.dataset.origStroke || '#7c4a1e');
        rect.setAttribute('stroke-width', selected ? '3' : rect.dataset.origStrokeWidth || '1');
    });
}

function _nativeGateViewModel(node: any): PipelineConditionalGateViewModel | null {
    const pack = _nativeEditorState?.workbenchPack;
    const nodeId = String(node?.id || '');
    if (!pack || !nodeId) return null;
    try {
        return extractPipelineConditionalGates(pack).find((gate) => gate.nodeId === nodeId) || null;
    } catch (error: any) {
        console.debug('[pipeline-editor] gate view model failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

function _nativeGateRouteKindOptions(current: PipelineConditionalGateRouteKind): string {
    const kinds: Array<[PipelineConditionalGateRouteKind, string]> = [
        ['approval', _label('pipelinePack.gate.editor.kindApproval', 'Aprovacao')],
        ['rework', _label('pipelinePack.gate.editor.kindRework', 'Retrabalho')],
        ['not-applicable', _label('pipelinePack.gate.editor.kindNotApplicable', 'Nao aplicavel')],
        ['manual-review', _label('pipelinePack.gate.editor.kindManualReview', 'Revisao humana')],
        ['neutral', _label('pipelinePack.gate.editor.kindNeutral', 'Neutra')],
    ];
    return kinds.map(([value, label]) =>
        `<option value="${_escProp(value)}"${value === current ? ' selected' : ''}>${_esc(label)}</option>`,
    ).join('');
}

/**
 * Vinculo da rota com a decisao. O protocolo so aceita rota ligada a PROPRIA
 * decisao de origem, entao a escolha do usuario e binaria — escrever um id a
 * mao (o campo de texto antigo) so conseguia produzir vinculo quebrado.
 */
function _nativeGateRouteConditionOptions(gate: PipelineConditionalGateViewModel, current: string): string {
    const options: Array<[string, string]> = [
        ['', _label('pipelinePack.gate.editor.routeConditionNone', 'Sem condicao')],
        [gate.nodeId, _label('pipelinePack.gate.editor.routeConditionLinked', 'Vincular a esta decisao')],
    ];
    const selected = current === gate.nodeId ? gate.nodeId : '';
    return options.map(([value, label]) =>
        `<option value="${_escProp(value)}"${value === selected ? ' selected' : ''}>${_esc(label)}</option>`,
    ).join('');
}

function _renderNativeGateEditor(node: any): string {
    const gate = _nativeGateViewModel(node);
    if (!gate) return '';
    const routes = gate.branches.map((branch) => `
        <div class="props-field" data-native-gate-route="${_escProp(branch.edgeId)}">
            <label class="props-label">${_esc(_label('pipelinePack.gate.editor.routeTo', 'Rota para'))}: ${_esc(branch.targetLabel)}</label>
            <input class="props-input" data-native-gate-route-label type="text" value="${_escProp(branch.label)}" placeholder="${_escProp(_label('pipelinePack.gate.editor.routeLabel', 'Rotulo da rota'))}" />
            <select class="props-input" data-native-gate-route-kind aria-label="${_escProp(_label('pipelinePack.gate.editor.routeKind', 'Tipo de rota'))}">${_nativeGateRouteKindOptions(branch.routeKind)}</select>
            <input class="props-input" data-native-gate-route-justification type="text" value="${_escProp(branch.semanticJustification)}" placeholder="${_escProp(_label('pipelinePack.gate.editor.routeJustification', 'Criterio em palavras (ex: laudo aprovado)'))}" />
            <select class="props-input" data-native-gate-route-criterion aria-label="${_escProp(_label('pipelinePack.gate.editor.routeCriterion', 'Criterio da rota (condicao)'))}">${_nativeGateRouteConditionOptions(gate, branch.conditionRef)}</select>
        </div>`,
    ).join('');
    return `
        <section data-native-gate-editor="${_escProp(gate.nodeId)}">
            <div class="props-field">
                <label class="props-label">${_esc(_label('pipelinePack.gate.editor.title', 'Decisao condicional'))}</label>
            </div>
            <div class="props-field">
                <label class="props-label">${_esc(_label('pipelinePack.gate.editor.question', 'Pergunta da decisao'))}</label>
                <input class="props-input" data-native-gate-field="question" type="text" value="${_escProp(gate.question)}" />
            </div>
            ${routes}
            <div class="props-field">
                <label class="props-label">
                    <input type="checkbox" data-native-gate-field="allowNotApplicable"${gate.nonApplicable.allowed ? ' checked' : ''} />
                    ${_esc(_label('pipelinePack.gate.editor.allowNotApplicable', 'Permitir "nao aplicavel" com justificativa'))}
                </label>
            </div>
            <div class="props-field">
                <label class="props-label">${_esc(_label('pipelinePack.gate.editor.notApplicableLabel', 'Rotulo da opcao nao aplicavel'))}</label>
                <input class="props-input" data-native-gate-field="notApplicableLabel" type="text" value="${_escProp(gate.nonApplicable.label)}" />
            </div>
            <button type="button" class="btn-secondary btn-sm" data-native-gate-save>${_esc(_label('pipelinePack.gate.editor.save', 'Aplicar decisao'))}</button>
            <p class="props-note" data-native-gate-issues></p>
        </section>`;
}

function _saveNativeGateEditor(node: any, body: HTMLElement): void {
    const state = _nativeEditorState;
    const issuesEl = body.querySelector('[data-native-gate-issues]') as HTMLElement | null;
    if (!state?.workbenchPack) {
        showToast(_label('pipelinePack.gate.editor.noPack', 'Abra um Pipeline Pack para editar a decisao.'), 'warning');
        return;
    }
    const nodeId = String(node?.id || '');
    const editor = body.querySelector('[data-native-gate-editor]') as HTMLElement | null;
    if (!nodeId || !editor) return;
    const readField = (name: string): string =>
        String((editor.querySelector(`[data-native-gate-field="${name}"]`) as HTMLInputElement | null)?.value ?? '');
    const routes = Array.from(editor.querySelectorAll('[data-native-gate-route]')).map((item) => {
        const routeEl = item as HTMLElement;
        return {
            edgeId: routeEl.dataset.nativeGateRoute || '',
            label: String((routeEl.querySelector('[data-native-gate-route-label]') as HTMLInputElement | null)?.value ?? ''),
            routeKind: String((routeEl.querySelector('[data-native-gate-route-kind]') as HTMLSelectElement | null)?.value || 'neutral') as PipelineConditionalGateRouteKind,
            criterion: String((routeEl.querySelector('[data-native-gate-route-criterion]') as HTMLSelectElement | null)?.value ?? ''),
            justification: String((routeEl.querySelector('[data-native-gate-route-justification]') as HTMLInputElement | null)?.value ?? ''),
        };
    });
    const patch = {
        nodeId,
        question: readField('question'),
        allowNotApplicable: Boolean((editor.querySelector('[data-native-gate-field="allowNotApplicable"]') as HTMLInputElement | null)?.checked),
        notApplicableLabel: readField('notApplicableLabel'),
        routes,
    };
    const validation = validatePipelineConditionalGateDraft(state.workbenchPack, patch);
    if (!validation.ok) {
        if (issuesEl) issuesEl.textContent = validation.issues.join(' ');
        showToast(`${_label('pipelinePack.gate.editor.invalid', 'Revise a decisao condicional')}: ${validation.issues[0] || ''}`, 'warning');
        return;
    }
    state.workbenchPack = updatePipelineConditionalGate(state.workbenchPack, patch);
    _refreshPipelinePackWorkbench();
    _showNativeNodePanel(node);
    showToast(_label('pipelinePack.gate.editor.saved', 'Decisao condicional atualizada nesta sessao.'), 'success');
}

function _showNativeNodePanel(node: any): void {
    const panel = document.getElementById('pipeline-props-panel');
    const body = document.getElementById('pipeline-props-body');
    if (!panel || !body) return;
    body.innerHTML = _renderNativeNodeFields(node);
    panel.style.display = 'flex';
    const titleEl = document.getElementById('pipeline-props-title');
    if (titleEl) {
        titleEl.innerHTML =
            `<span class="props-type-badge props-type-${_escProp(node?.type || 'action')}">${_escProp(_nativeTypeLabel(node?.type))}</span>&nbsp;` +
            _escProp(node?.label || node?.id || 'No selecionado');
    }
    body.querySelectorAll('[data-native-node-field]').forEach((input) => {
        input.addEventListener('input', () => _saveNativeNodeFields(node, body));
        input.addEventListener('change', () => _saveNativeNodeFields(node, body));
    });
    const openBtn = body.querySelector('[data-native-module-open]');
    openBtn?.addEventListener('click', () => {
        _saveNativeNodeFields(node, body);
        _openNativeTargetModule(node);
    });
    const gateSaveBtn = body.querySelector('[data-native-gate-save]');
    gateSaveBtn?.addEventListener('click', () => _saveNativeGateEditor(node, body));
}

function _renderNativeNodeFields(node: any): string {
    const ro = (label: string, value: any) => `
        <div class="props-field">
            <label class="props-label">${_escProp(label)}</label>
            <input class="props-input" type="text" value="${_escProp(value || '')}" readonly />
        </div>`;
    return `
        <div class="props-field">
            <label class="props-label">Nome da atividade</label>
            <input class="props-input" data-native-node-field="label" type="text" value="${_escProp(node?.label || '')}" />
        </div>
        ${ro('Tipo tecnico', _nativeTypeLabel(node?.type))}
        <div class="props-field">
            <label class="props-label">Parte interessada / raia</label>
            <input class="props-input" data-native-node-field="lane" list="pipeline-native-stakeholder-options" type="text" value="${_escProp(node?.lane || '')}" placeholder="ex: Campo, Laboratorio, Responsavel Tecnico" />
            <datalist id="pipeline-native-stakeholder-options">${_nativeStakeholderOptions()}</datalist>
        </div>
        <div class="props-field">
            <label class="props-label">Fase / etapa do fluxo</label>
            <input class="props-input" data-native-node-field="phase" list="pipeline-native-phase-options" type="text" value="${_escProp(node?.phase || '')}" placeholder="ex: Deteccao, Caracterizacao, Remediacao" />
            <datalist id="pipeline-native-phase-options">${_nativePhaseOptions()}</datalist>
        </div>
        <div class="props-field">
            <label class="props-label">Natureza de dados</label>
            <input class="props-input" data-native-node-field="dataNature" list="pipeline-native-data-nature-options" type="text" value="${_escProp(node?.dataNature || '')}" placeholder="ex: Campo, Laboratorio, Geoespacial" />
            <datalist id="pipeline-native-data-nature-options">${_nativeDataNatureOptions()}</datalist>
        </div>
        <div class="props-field">
            <label class="props-label">Levar para modulo</label>
            <input class="props-input" data-native-node-field="targetModule" list="pipeline-native-module-targets" type="text" value="${_escProp(node?.targetModule || '')}" placeholder="ex: pipelines.gac" />
            <datalist id="pipeline-native-module-targets">${_nativeModuleOptions()}</datalist>
        </div>
        <div class="props-field" data-native-module-params-form>
            <label class="props-label">${_escProp(_label('pipeline.native.moduleInputParams', 'Parametros de entrada do modulo'))}</label>
            ${_renderModuleInputParamsForm(node)}
        </div>
        <button type="button" class="btn-secondary btn-sm" data-native-module-open>Abrir modulo de destino</button>
        <div class="props-field">
            <label class="props-label">Contexto tecnico</label>
            <textarea class="props-input" data-native-node-field="contextLabel" rows="4">${_escProp(node?.contextLabel || '')}</textarea>
        </div>
        ${_renderNativeGateEditor(node)}
        ${ro('ID interno', node?.id || '')}
        <p class="props-note">Alteracoes ficam no modelo aberto e sao gravadas quando voce clicar em Salvar.</p>
    `;
}

function _renderModuleInputParamsForm(node: any): string {
    const pack = _nativeEditorState?.workbenchPack || null;
    let parameters: any[] = [];
    try {
        const catalog = summarizeDomainTechnicalParameterCatalog(pack || undefined);
        parameters = [...(catalog.required || []), ...(catalog.optional || [])];
    } catch (error: any) {
        console.debug('[pipeline-editor] module params catalog failed:', error instanceof Error ? error.message : error);
    }
    const vm = buildModuleInputParamsFormViewModel({
        parameters,
        currentParams: node?.moduleInputParams && typeof node.moduleInputParams === 'object' ? node.moduleInputParams : null,
        targetModule: String(node?.targetModule || ''),
    });
    if (!vm.fields.length) {
        return `<p class="props-note">${_escProp(_label('pipeline.native.moduleInputParams.empty', 'Nenhum parametro catalogado para este perfil.'))}</p>`;
    }
    return vm.fields.map((field) => {
        const listId = field.examples.length ? `pipeline-native-param-${field.key}` : '';
        const requiredMark = field.applicability === 'required' ? ' *' : '';
        const customMark = field.known ? '' : ` <span class="props-note">(${_escProp(_label('pipeline.native.moduleInputParams.custom', 'chave livre'))})</span>`;
        return `
            <div class="props-field props-module-param" data-native-module-param-row="${_escProp(field.key)}">
                <label class="props-label">${_escProp(field.label)}${requiredMark}${customMark}</label>
                <input class="props-input" type="text" data-native-module-param="${_escProp(field.key)}" data-value-kind="${_escProp(field.valueKind)}"${listId ? ` list="${_escProp(listId)}"` : ''} value="${_escProp(field.value)}" placeholder="${_escProp(field.placeholder)}" />
                ${listId ? `<datalist id="${_escProp(listId)}">${field.examples.map((example) => `<option value="${_escProp(example)}"></option>`).join('')}</datalist>` : ''}
                ${field.description ? `<p class="props-note">${_escProp(field.description)}</p>` : ''}
            </div>`;
    }).join('');
}

function _saveNativeModuleInputParams(node: any, body: HTMLElement): void {
    const inputs = Array.from(body.querySelectorAll('[data-native-module-param]')) as HTMLInputElement[];
    if (!inputs.length) return;
    const params = collectModuleInputParamsFromFields(inputs.map((input) => ({
        key: input.dataset.nativeModuleParam || '',
        value: input.value || '',
        valueKind: input.dataset.valueKind || 'text',
    })));
    if (params) node.moduleInputParams = params;
    else delete node.moduleInputParams;
}

function _saveNativeNodeFields(node: any, body: HTMLElement): void {
    _saveNativeModuleInputParams(node, body);
    body.querySelectorAll('[data-native-node-field]').forEach((input) => {
        const field = (input as HTMLElement).dataset.nativeNodeField || '';
        if (!field) return;
        const value = (input as HTMLInputElement | HTMLTextAreaElement).value || '';
        if (field === 'moduleInputParamsJson') {
            const params = _parseModuleInputParams(value);
            if (params) node.moduleInputParams = params;
            else delete node.moduleInputParams;
            return;
        }
        node[field] = value;
    });
    _updateNativeNodeLabel(node?.id, node?.label);
    const titleEl = document.getElementById('pipeline-props-title');
    if (titleEl) {
        titleEl.innerHTML =
            `<span class="props-type-badge props-type-${_escProp(node?.type || 'action')}">${_escProp(_nativeTypeLabel(node?.type))}</span>&nbsp;` +
            _escProp(node?.label || node?.id || 'No selecionado');
    }
}

function _updateNativeNodeLabel(nodeId: any, label: any): void {
    const containerId = _nativeEditorState?.containerId || '';
    const container = containerId ? document.getElementById(containerId) : null;
    const nodeEl = Array.from(container?.querySelectorAll('[data-node-id]') || []).find(
        (el) => (el as HTMLElement).dataset.nodeId === String(nodeId || ''),
    );
    const textEl = nodeEl?.querySelector('text') as SVGTextElement | null;
    if (textEl) textEl.textContent = _truncateNativeLabel(String(label || nodeId || ''), 24);
}

function _truncateNativeLabel(label: string, max = 24): string {
    return label.length > max ? label.slice(0, max - 1) + '...' : label;
}

function _nativeTypeLabel(type: any): string {
    const labels: Record<string, string> = {
        trigger: 'Inicio',
        action: 'Tarefa',
        condition: 'Decisao',
        delay: 'Espera',
        api_call: 'Integracao',
        data_store: 'Deposito de dados',
        end: 'Fim',
    };
    return labels[String(type || '')] || String(type || 'Tarefa');
}

function _nativeModuleOptions(): string {
    const options = [
        ['pipelines.gac', 'Fluxo GAC/DD-38'],
        ['files', 'Arquivos'],
        ['elements', 'Elementos'],
        ['campaigns', 'Campanhas'],
        ['observations', 'Observacoes'],
        ['dataStudio', 'Data Studio'],
        ['inspector', 'Inspector'],
        ['reports', 'Relatorios'],
        ['governance', 'Governanca'],
        ['eis', 'EIS'],
        ['interpolation', 'Interpolacao'],
        ['libraries', 'Bibliotecas'],
        ['training', 'Treinamento'],
    ];
    return options.map(([value, label]) => `<option value="${_escProp(value)}">${_esc(label)}</option>`).join('');
}

function _nativeStakeholderOptions(): string {
    const model = _nativeEditorState?.model || {};
    const laneLabels = Array.isArray((model as any).lanes)
        ? (model as any).lanes.map((lane: any) => String(lane?.label || '').trim()).filter(Boolean)
        : [];
    const defaults = [
        'Resp. Legal',
        'Responsavel Tecnico',
        'Campo',
        'Laboratorio',
        'Atividades Especializadas',
        'Orgaos Publicos',
        'Operacao',
        'Qualidade',
        'Meio Ambiente',
        'Manutencao',
    ];
    return _uniqueNativeOptions([...laneLabels, ...defaults]);
}

function _nativePhaseOptions(): string {
    const model = _nativeEditorState?.model || {};
    const phaseLabels = Array.isArray((model as any).groups)
        ? (model as any).groups.map((group: any) => String(group?.label || '').trim()).filter(Boolean)
        : [];
    const defaults = [
        'Deteccao',
        'Caracterizacao',
        'Remediacao',
        'Acompanhamento',
        'Fechamento',
        'Recebimento',
        'Preparacao',
        'Processamento',
        'Controle',
        'Entrega',
    ];
    return _uniqueNativeOptions([...phaseLabels, ...defaults]);
}

function _nativeDataNatureOptions(): string {
    return _uniqueNativeOptions([
        'Campo',
        'Laboratorio',
        'Geoespacial',
        'Documental / regulatorio',
        'Tabular / analitico',
        'Sistema corporativo',
        'Imagem / evidencia visual',
        'Modelo / calculo',
        'Projeto / desenho tecnico',
        'Operacional / sensor',
        'Rejeitos / residuos',
        'Agua / energia / insumos',
    ]);
}

function _uniqueNativeOptions(values: string[]): string {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
        .map((value) => `<option value="${_escProp(value)}"></option>`)
        .join('');
}

function _parseModuleInputParams(value: string): Record<string, unknown> | null {
    const text = String(value || '').trim();
    if (!text) return null;
    if (text.startsWith('{')) {
        const parsed = safeJsonParse<Record<string, unknown>>(text, null, 'pipelineEditor-moduleInputParams');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
    const fromLines = _parseModuleInputParamLines(text);
    if (fromLines) return fromLines;
    return { raw: text };
}

function _parseModuleInputParamLines(text: string): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const sep = line.indexOf('=');
        if (sep <= 0) return null;
        const key = line.slice(0, sep).trim();
        if (!key) return null;
        out[key] = _parseModuleParamScalar(line.slice(sep + 1).trim());
    }
    return Object.keys(out).length ? out : null;
}

function _parseModuleParamScalar(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    return value;
}

function _openNativeTargetModule(node: any): boolean {
    const targetModule = String(node?.targetModule || '').trim();
    if (!targetModule) {
        showToast('Informe o modulo de destino antes de abrir.', 'warning');
        return false;
    }
    const actionName = _resolveNativeTargetModuleAction(targetModule);
    const action = actionName ? (window as any)[actionName] : null;
    if (!actionName || typeof action !== 'function') {
        showToast(`Modulo de destino sem rota cadastrada: ${targetModule}`, 'warning');
        return false;
    }
    const params = _buildNativeTargetModuleParams(node);
    try {
        action(params);
        showToast(`Modulo aberto: ${targetModule}`, 'success');
        return true;
    } catch (error: any) {
        showToast(`Falha ao abrir modulo: ${error?.message || error}`, 'error');
        return false;
    }
}

function _resolveNativeTargetModuleAction(targetModule: string): string {
    const normalized = targetModule.trim().toLowerCase();
    const aliases: Record<string, string> = {
        'pipelines': 'handleOpenPipelineManager',
        'pipelines.gac': 'handleOpenPipelineManager',
        'gac': 'handleOpenPipelineManager',
        'files': 'handleOpenFiles',
        'arquivos': 'handleOpenFiles',
        'datastudio': 'handleOpenDataStudio',
        'reports': 'handleOpenReportOverlay',
        'relatorios': 'handleOpenReportOverlay',
        'libraries': 'handleOpenLibraryManager',
        'bibliotecas': 'handleOpenLibraryManager',
        'interpolation': 'handleOpenInterpolationPanel',
        'interpolacao': 'handleOpenInterpolationPanel',
        'sensors': 'handleOpenSensorsCenter',
        'sensores': 'handleOpenSensorsCenter',
        'governance': 'handleOpenGovernancePanel',
        'governanca': 'handleOpenGovernancePanel',
        'eis': 'handleOpenEisModal',
    };
    const actionName = aliases[normalized] || targetModule.trim();
    const registered = ACTION_REGISTRY.some((entry) => entry.name === actionName);
    return registered || typeof (window as any)[actionName] === 'function' ? actionName : '';
}

function _buildNativeTargetModuleParams(node: any): Record<string, unknown> {
    const params = node?.moduleInputParams && typeof node.moduleInputParams === 'object'
        ? { ...node.moduleInputParams }
        : {};
    if (!params.nodeId && node?.id) params.nodeId = String(node.id);
    if (!params.source) params.source = 'pipeline-native-editor';
    const targetModule = String(node?.targetModule || '').toLowerCase();
    if (targetModule.includes('gac') && !params.presetId) params.presetId = 'm01.gac.flow.dd38';
    return params;
}

/** Estado da imagem de referência (por instância do canvas). Escala X/Y independente p/ alinhar aspectos diferentes. */
function _readRefState(root: any): { opacity: number; sx: number; sy: number; x: number; y: number; rot: number } {
    const num = (sel: string, def: number) => {
        const v = parseFloat((root.querySelector(sel) as HTMLInputElement)?.value);
        return Number.isFinite(v) ? v : def;
    };
    const rotSel = root.querySelector('.pl-ref-rot') as HTMLSelectElement | null;
    return {
        opacity: num('.pl-ref-opacity', 55) / 100,
        sx: num('.pl-ref-sx', 100) / 100,
        sy: num('.pl-ref-sy', 100) / 100,
        x: num('.pl-ref-x', 0),
        y: num('.pl-ref-y', 0),
        rot: rotSel ? parseInt(rotSel.value, 10) || 0 : 0,
    };
}

/** Aplica o estado (opacidade/rotação/escala X-Y/deslocamento) à imagem de referência no DOM. */
function _applyRefTransform(root: any): void {
    const img = root.querySelector('.pl-ref-img') as HTMLImageElement | null;
    if (!img) return;
    const s = _readRefState(root);
    img.style.opacity = String(s.opacity);
    img.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg) scale(${s.sx}, ${s.sy})`;
}

/** Legenda fixa (canto inferior-direito) — explica cores/formas/linhas do diagrama.
 *  Não escala com o zoom (fica fora do .pl-stage). Itens canônicos do diagrama BPMN. */
function _legendHtml(): string {
    const sw = (c: string) => `<span style="display:inline-block;width:14px;height:11px;border-radius:2px;background:${c};border:1px solid #00000033"></span>`;
    const line = (dash: boolean) =>
        `<svg width="22" height="8" style="vertical-align:middle"><line x1="1" y1="4" x2="21" y2="4" stroke="#64748b" stroke-width="2"${dash ? ' stroke-dasharray="4 3"' : ''}/></svg>`;
    const rows: Array<[string, string]> = [
        [sw('#ffc080'), 'Tarefa'],
        [sw('#ff992e'), 'Decisão (gateway)'],
        [sw('#c0c000'), 'Depósito de dados'],
        [sw('#c3f57a'), 'Início'],
        [sw('#f57a7a'), 'Fim'],
        [line(false), 'Fluxo de controle'],
        [line(true), 'Associação de dados'],
    ];
    const items = rows
        .map(([m, lbl]) => `<div style="display:flex;align-items:center;gap:7px;white-space:nowrap">${m}<span>${_esc(lbl)}</span></div>`)
        .join('');
    // Wrapper sticky de altura ZERO: a legenda flutua no rodapé VISÍVEL da
    // COLUNA do diagrama (.pl-stage-cell) sem ocupar altura de layout e sem
    // invadir a coluna do Workbench (PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1:
    // antes ela era absolute no canvas inteiro e cobria os botões de
    // export/import do Workbench, interceptando os cliques).
    return (
        `<div class="pl-legend-anchor" style="position:sticky;bottom:12px;height:0;z-index:7">` +
        `<div class="pl-legend" title="Arraste para reposicionar a legenda" style="position:absolute;right:12px;bottom:0;width:max-content;background:#0b1220ee;border:1px solid #1e293b;` +
        `border-radius:8px;padding:8px 10px;font:11px system-ui;color:#cbd5e1;display:grid;gap:4px;box-shadow:0 2px 10px #0006;cursor:move;user-select:none">` +
        `<div style="font-weight:600;color:#e2e8f0;margin-bottom:2px">${_esc(_label('pipeline.overlay.legend', 'Legenda'))}</div>${items}</div></div>`
    );
}

function _paletteOptions(activeId: unknown): string {
    const active = String(activeId || 'reference');
    return Object.values(PIPELINE_DIAGRAM_PALETTES)
        .map((palette: any) => `<option value="${_escProp(palette.id)}"${palette.id === active ? ' selected' : ''}>${_esc(palette.label)}</option>`)
        .join('');
}

/** Liga os controles do overlay (carregar referência, opacidade/escala/offset, exportar PNG). */
function _wireNativeOverlay(root: any): void {
    const img = root.querySelector('.pl-ref-img') as HTMLImageElement | null;
    const loadBtn = root.querySelector('.pl-ref-load') as HTMLButtonElement | null;
    const clearBtn = root.querySelector('.pl-ref-clear') as HTMLButtonElement | null;
    const exportBtn = root.querySelector('.pl-export-png') as HTMLButtonElement | null;
    // sliders/inputs → transform ao vivo
    for (const sel of ['.pl-ref-opacity', '.pl-ref-sx', '.pl-ref-sy', '.pl-ref-x', '.pl-ref-y']) {
        root.querySelector(sel)?.addEventListener('input', () => _applyRefTransform(root));
    }
    root.querySelector('.pl-ref-rot')?.addEventListener('change', () => _applyRefTransform(root));
    // carregar imagem de referência (PNG/JPG) — fica ATRÁS do SVG
    loadBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file && img) {
                img.src = URL.createObjectURL(file);
                img.style.display = 'block';
                _applyRefTransform(root);
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    });
    clearBtn?.addEventListener('click', () => {
        if (img) {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    });
    exportBtn?.addEventListener('click', () => _exportNativeDiagramPng(root));
    // opacidade do diagrama desenhado (0 = mostra só a referência/PDF → pixel-a-pixel)
    const diagOpacity = root.querySelector('.pl-diagram-opacity') as HTMLInputElement | null;
    const svgHolder = root.querySelector('.pl-svg-holder') as HTMLElement | null;
    diagOpacity?.addEventListener('input', () => {
        if (svgHolder) svgHolder.style.opacity = String((parseFloat(diagOpacity.value) || 0) / 100);
    });
    // legenda: mostrar/ocultar
    const legendBtn = root.querySelector('.pl-legend-toggle') as HTMLButtonElement | null;
    const legend = root.querySelector('.pl-legend') as HTMLElement | null;
    legendBtn?.addEventListener('click', () => {
        const show = legend && legend.style.display === 'none';
        if (legend) legend.style.display = show ? 'grid' : 'none';
        legendBtn.setAttribute('aria-pressed', String(!!show));
    });
    const autoBtn = root.querySelector('.pl-auto-layout') as HTMLButtonElement | null;
    autoBtn?.addEventListener('click', () => {
        if (!_nativeEditorState) return;
        _nativeEditorState.model = autoArrangePipeline(_nativeEditorState.model, { grid: 10 });
        _renderNativeSvg(root);
        const summary = summarizePipelineDiagramEditing(_nativeEditorState.model);
        showToast(`Fluxo reorganizado: ${summary.nodeCount} blocos e ${summary.edgeCount} conectores.`, 'success');
    });
    const paletteSelect = root.querySelector('.pl-palette') as HTMLSelectElement | null;
    paletteSelect?.addEventListener('change', () => {
        if (!_nativeEditorState) return;
        _nativeEditorState.model = applyPipelinePalette(_nativeEditorState.model, paletteSelect.value);
        _renderNativeSvg(root);
        showToast('Paleta visual aplicada ao fluxograma.', 'success');
    });
    _wireLegendDrag(root);
    _wireZoom(root);
}

function _renderNativeSvg(root: any): void {
    const state = _nativeEditorState;
    const holder = root.querySelector('.pl-svg-holder') as HTMLElement | null;
    if (!state || !holder) return;
    holder.innerHTML = buildPipelineDiagramSvg(state.model || {}, {}, state.selectedNodeId).replace(
        '<svg ',
        '<svg style="width:100%;height:auto;display:block;position:relative;z-index:2" ',
    );
    _wireNativeNodeSelection(root);
    if (state.selectedNodeId) _highlightNativeNode(state.selectedNodeId);
}

function _svgPoint(svg: SVGSVGElement, event: PointerEvent): { x: number; y: number } {
    const ctm = svg.getScreenCTM?.();
    if (ctm && svg.createSVGPoint) {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const out = pt.matrixTransform(ctm.inverse());
        return { x: out.x, y: out.y };
    }
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function _handleNativeNodePointerDown(event: PointerEvent, holder: HTMLElement): void {
    if (event.button !== 0) return;
    const nodeEl = (event.target as Element | null)?.closest('[data-node-id]') as SVGElement | null;
    const svg = holder.querySelector('svg') as SVGSVGElement | null;
    const state = _nativeEditorState;
    if (!nodeEl || !svg || !state) return;
    const nodeId = ((nodeEl as unknown) as HTMLElement).dataset.nodeId || '';
    const start = _svgPoint(svg, event);
    const baseModel = _cloneNativeModel(state.model);
    let moved = false;
    event.preventDefault();
    try {
        (nodeEl as any).setPointerCapture?.(event.pointerId);
    } catch (error: any) {
        console.debug('[pipeline-editor] pointer capture unavailable:', error instanceof Error ? error.message : error);
    }
    const onMove = (moveEvent: PointerEvent) => {
        const point = _svgPoint(svg, moveEvent);
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        moved = moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
        nodeEl.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
    };
    const onUp = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        nodeEl.removeAttribute('transform');
        if (!moved) return;
        const point = _svgPoint(svg, upEvent);
        state.model = movePipelineNode(baseModel, nodeId, { dx: point.x - start.x, dy: point.y - start.y }, { grid: 10 });
        state.selectedNodeId = nodeId;
        _renderNativeSvg(holder.closest('.pipeline-native-canvas') || holder);
        selectPipelineElement(nodeId);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
}

function _wireLegendDrag(root: any): void {
    const legend = root.querySelector('.pl-legend') as HTMLElement | null;
    const canvas = root.querySelector('.pipeline-native-canvas') as HTMLElement | null;
    if (!legend || !canvas || (legend as any).dataset.dragWired === 'true') return;
    (legend as any).dataset.dragWired = 'true';
    legend.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.button !== 0) return;
        // Base relativa ao offsetParent real (o wrapper sticky .pl-legend-anchor),
        // não ao canvas — mantém o drag correto na nova âncora por coluna.
        const parentRect = (legend.offsetParent as HTMLElement | null)?.getBoundingClientRect()
            || canvas.getBoundingClientRect();
        const legendRect = legend.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const baseLeft = legendRect.left - parentRect.left;
        const baseTop = legendRect.top - parentRect.top;
        event.preventDefault();
        const onMove = (moveEvent: PointerEvent) => {
            // Sem clamp em 0: a âncora sticky tem altura zero no rodapé, então
            // mover a legenda para CIMA exige top negativo relativo a ela.
            const left = baseLeft + moveEvent.clientX - startX;
            const top = baseTop + moveEvent.clientY - startY;
            legend.style.left = `${Math.round(left)}px`;
            legend.style.top = `${Math.round(top)}px`;
            legend.style.right = 'auto';
            legend.style.bottom = 'auto';
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp, { once: true });
    });
}

/** Liga os botões de zoom (− / + / ajustar) — aplica escala ao palco (SVG + referência). */
function _wireZoom(root: any): void {
    const stage = root.querySelector('.pl-stage') as HTMLElement | null;
    const valEl = root.querySelector('.pl-zoom-val') as HTMLElement | null;
    const scroller = root.querySelector('.pipeline-native-canvas') as HTMLElement | null;
    if (!stage) return;
    let zoom = 1;
    const MIN = 0.2;
    const MAX = 4;
    const apply = () => {
        stage.style.transform = `scale(${zoom})`;
        if (valEl) valEl.textContent = Math.round(zoom * 100) + '%';
    };
    const setZoom = (z: number) => {
        zoom = Math.min(MAX, Math.max(MIN, z));
        apply();
    };
    root.querySelector('.pl-zoom-in')?.addEventListener('click', () => setZoom(zoom * 1.25));
    root.querySelector('.pl-zoom-out')?.addEventListener('click', () => setZoom(zoom / 1.25));
    root.querySelector('.pl-zoom-fit')?.addEventListener('click', () => {
        // ajusta a largura do diagrama à largura visível do scroller
        const svg = root.querySelector('.pl-svg-holder svg') as SVGSVGElement | null;
        if (svg && scroller) {
            const natW = svg.getBoundingClientRect().width / (zoom || 1);
            const avail = scroller.clientWidth - 24;
            if (natW > 0) setZoom(avail / natW);
        } else {
            setZoom(1);
        }
    });
    // Ctrl + roda do mouse = zoom no ponto
    scroller?.addEventListener(
        'wheel',
        (ev: any) => {
            if (!ev.ctrlKey) return;
            ev.preventDefault();
            setZoom(zoom * (ev.deltaY < 0 ? 1.1 : 0.9));
        },
        { passive: false },
    );
    apply();
}

/**
 * Exporta o diagrama como PNG (composição: imagem de referência ATRÁS + SVG na
 * FRENTE, respeitando opacidade/escala/offset). Facilita a análise pixel-a-pixel.
 */
function _exportNativeDiagramPng(root: any): void {
    try {
        const svgEl = root.querySelector('.pl-svg-holder svg') as SVGSVGElement | null;
        if (!svgEl) return;
        const vb = svgEl.viewBox?.baseVal;
        const baseW = vb && vb.width ? vb.width : svgEl.clientWidth || 1200;
        const baseH = vb && vb.height ? vb.height : svgEl.clientHeight || 800;
        const SCALE = 2;
        const W = Math.ceil(baseW * SCALE);
        const H = Math.ceil(baseH * SCALE);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        const refImg = root.querySelector('.pl-ref-img') as HTMLImageElement | null;
        const st = _readRefState(root);
        const drawSvgAndSave = () => {
            const svgStr = new XMLSerializer().serializeToString(svgEl);
            const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const sImg = new Image();
            sImg.onload = () => {
                ctx.drawImage(sImg, 0, 0, W, H);
                URL.revokeObjectURL(url);
                canvas.toBlob((blob) => {
                    if (!blob) return;
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'pipeline-diagram.png';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }, 'image/png');
            };
            sImg.onerror = () => {
                URL.revokeObjectURL(url);
                showToast('Falha ao exportar PNG do diagrama.', 'error');
            };
            sImg.src = url;
        };
        // se há referência visível, desenha ATRÁS (opacidade/rotação/escala X-Y/offset)
        if (refImg && refImg.getAttribute('src') && refImg.style.display !== 'none') {
            ctx.save();
            ctx.globalAlpha = st.opacity;
            ctx.translate(st.x * SCALE, st.y * SCALE);
            if (st.rot) {
                ctx.rotate((st.rot * Math.PI) / 180);
            }
            ctx.drawImage(refImg, 0, 0, W * st.sx, H * st.sy);
            ctx.restore();
        }
        drawSvgAndSave();
    } catch (e: any) {
        console.debug('[pipeline-editor] export png:', e instanceof Error ? e.message : e);
        showToast('Falha ao exportar PNG do diagrama.', 'error');
    }
}

// ----------------------------------------------------------------
// PIPELINE MANAGER - lista de pipelines
// ----------------------------------------------------------------

/**
 * Renderiza lista de pipelines no container.
 *
 * @param {HTMLElement} container
 * @param {any[]} pipelines - Array de PipelineDefinition
 * @param {Set<string>} runningIds - IDs de pipelines em execução
 */
export function renderPipelineList(container: any, pipelines: any, runningIds = new Set()) {
    if (!container) return;

    const importBtnHtml = `<div class="pipeline-list-toolbar">
        <button class="btn-pipeline-import-ecbt" data-cc-action="cc-b6cb112f"
                title="${_label('pipeline.import.ecbtTitle', 'Importar pipeline de arquivo .ecbt (Library ecbyts ou local)')}">
            &#8593; ${_label('pipeline.import.ecbtLabel', 'Importar .ecbt')}
        </button>
    </div>`;

    if (!pipelines || pipelines.length === 0) {
        container.innerHTML = `${importBtnHtml}<p class="pipeline-empty">${t('pipeline.manager.empty') || 'Nenhuma automação definida.'}</p>`;
        return;
    }

    container.innerHTML = importBtnHtml + pipelines
        .map((p: any) => {
            const nodeCount = p.model && Array.isArray(p.model.nodes) ? p.model.nodes.length : _countNodes(p.xml);
            const stepsLabel = t('pipeline.manager.steps', { n: nodeCount });
            const dateLabel = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';
            const isRunning = runningIds.has(p.id);
            const runBtnDisabled = isRunning ? 'disabled' : '';
            const pipelineId = encodeURIComponent(`${p.id}`);
            const hasNativeDiagram = p.model && Array.isArray(p.model.nodes) && p.model.nodes.length > 0;
            const viewDiagramTitle = _esc(_label('pipeline.manager.viewDiagramTitle', 'Abrir visualizador do fluxograma'));
            const viewDiagramLabel = _esc(_label('pipeline.manager.viewDiagram', 'Ver fluxograma'));
            const viewDiagramButton = hasNativeDiagram
                ? `<button class="btn-pipeline-view" data-cc-call-click="handleEditPipeline|s:${pipelineId}"
            title="${viewDiagramTitle}"
            aria-label="${viewDiagramTitle}"
            style="width:100%;justify-content:center;font-weight:600;margin-bottom:8px">
            ${viewDiagramLabel}
        </button>`
                : '';

            return `<div class="pipeline-card" data-pipeline-id="${p.id}">
  <div class="pipeline-card-header">
    <span class="pipeline-card-name" title="${_esc(p.name)}">${_esc(p.name)}</span>
    <span class="pipeline-card-meta">${stepsLabel} &bull; ${dateLabel}</span>
  </div>
  <div class="pipeline-run-progress"></div>
  ${viewDiagramButton}
  <div class="pipeline-card-actions">
    <button class="btn-pipeline-run" data-cc-call-click="handleRunPipeline|s:${pipelineId}" ${runBtnDisabled}
            title="${t('pipeline.run.starting') || 'Executar'}">&#9654;</button>
    <button class="btn-pipeline-edit" data-cc-call-click="handleEditPipeline|s:${pipelineId}"
            title="Editar">&#9998;</button>
    <button class="btn-pipeline-export" data-cc-call-click="handleExportPipeline|s:${pipelineId}"
            title="${t('pipeline.export.success') || 'Exportar'}">&#8595;</button>
    <button class="btn-pipeline-export-ecbt" data-cc-call-click="exportPipelineEcbt|s:${pipelineId}"
            title="${t('pipeline.export.ecbtTitle') || 'Salvar como .ecbt (Library ecbyts ou arquivo local)'}">&#128190;</button>
    <button class="btn-pipeline-delete" data-cc-call-click="handleDeletePipeline|s:${pipelineId}"
            title="${t('pipeline.delete.confirm') || 'Excluir'}">&#9003;</button>
  </div>
</div>`;
        })
        .join('');
}

/**
 * Conta nós BPMN em um XML (estimativa rápida por regex).
 * @param {string} xml
 * @returns {number}
 */
function _countNodes(xml: any): number {
    if (!xml) return 0;
    const matches = xml.match(
        /<bpmn:(startEvent|serviceTask|exclusiveGateway|intermediateCatchEvent|scriptTask|endEvent)/g,
    );
    return matches ? matches.length : 0;
}

// ----------------------------------------------------------------
// RUN PROGRESS - progresso inline no card
// ----------------------------------------------------------------

/**
 * Renderiza progresso de execução no elemento dado.
 *
 * @param {HTMLElement} container
 * @param {any} run - PipelineRun corrente
 */
export function renderRunProgress(container: any, run: any) {
    if (!container || !run) return;

    const statusClasses: Record<string, string> = {
        running: 'status-running',
        completed: 'status-completed',
        failed: 'status-failed',
        aborted: 'status-aborted',
    };
    const statusClass = statusClasses[run.status] || '';

    const logHtml = (run.log || [] as any[])
        .map((entry: any) => {
            const cls =
                entry.status === 'completed' ? 'log-ok' : entry.status === 'failed' ? 'log-fail' : 'log-running';
            const errStr = entry.error ? ` — ${_esc(entry.error)}` : '';
            return `<div class="pipeline-log-entry ${cls}">&#9679; ${_esc(entry.nodeId)} [${entry.status}]${errStr}</div>`;
        })
        .join('');

    const abortBtn =
        run.status === 'running'
            ? `<button class="btn-pipeline-abort" data-cc-call-click="handleAbortPipeline|s:${encodeURIComponent(`${run.runId}`)}">${t('pipeline.run.abort') || 'Abortar'}</button>`
            : '';

    container.innerHTML = `<div class="pipeline-run-status ${statusClass}">
  ${abortBtn}
  <div class="pipeline-log-scroll">${logHtml || '<em>Iniciando...</em>'}</div>
</div>`;
}

// ----------------------------------------------------------------
// EDITOR LINEAR (Plan A - offline, sem editor externo)
// ----------------------------------------------------------------

/**
 * Renderiza editor linear de nodes no container.
 * Lista vertical de node-cards com botões ▲/▼/✕ e "+ Adicionar passo".
 *
 * @param {HTMLElement} container
 * @param {{ nodes: any[], edges: any[], startNodeId: string|null }} def
 */
export function renderLinearEditor(container: any, def: any) {
    if (!container) return;

    const nodes = def && def.nodes ? [...def.nodes] : [];

    const notice = `<div class="pipeline-linear-notice">${t('pipeline.editor.linearMode') || 'Editor linear (modo offline)'}</div>`;
    const addBtn = `<button class="btn-add-node" data-cc-action="cc-261c9a80">${t('pipeline.editor.addStep') || '+ Adicionar passo'}</button>`;

    container.innerHTML =
        notice +
        '<div id="pipeline-nodes-list">' +
        nodes.map((node, i) => _renderNodeCard(node, i, nodes.length)).join(_addBtnBetween()) +
        '</div>' +
        addBtn;

    // Expor callbacks de manipulação de nós no window (escopo linear editor)
    (window as any)._pipelineAddNode = () => _addNode(container);
    (window as any)._pipelineMoveUp = (i: any) => _moveNode(container, def, i, -1);
    (window as any)._pipelineMoveDown = (i: any) => _moveNode(container, def, i, +1);
    (window as any)._pipelineRemoveNode = (i: any) => _removeNode(container, def, i);
    (window as any)._pipelineNodeType = (i: any, type: any) =>
        _changeNodeType(container, def, i, type);
}

function _addBtnBetween() {
    return '<div class="pipeline-add-between">&#43;</div>';
}

/**
 * Renderiza card de um nó individual.
 * @param {any} node
 * @param {number} index
 * @param {number} total
 * @returns {string} HTML
 */
function _renderNodeCard(node: any, index: any, total: any): string {
    const configJson = JSON.stringify(node.config || {}, null, 2);
    const configSummaryLabel = t('pipeline.node.config') || 'Configuracao';

    // Nó terminal (endEvent) - exibido como read-only, sem edição de tipo nem config
    if (node.type === 'end') {
        const endLabel = t('pipeline.node.type.end') || 'Fim';
        return `<div class="pipeline-node-card pipeline-node-card--end" data-node-id="${_esc(node.id)}" data-node-type="end">
  <div class="pipeline-node-header">
    <span class="pipeline-node-type-badge pipeline-node-badge--end">${endLabel}</span>
    <span class="pipeline-node-label-readonly">${_esc(node.label || node.id)}</span>
  </div>
</div>`;
    }

    const typeOptions = Object.values(NODE_TYPES)
        .map(
            (nt) =>
                `<option value="${nt}" ${nt === node.type ? 'selected' : ''}>${t('pipeline.node.type.' + nt) || nt}</option>`,
        )
        .join('');

    const configFormHtml = _renderConfigForm(node);
    const typeClass = `pipeline-node-card--${node.type || 'action'}`;

    return `<div class="pipeline-node-card ${typeClass}" data-node-id="${_esc(node.id)}" data-node-type="${_esc(node.type)}">
  <div class="pipeline-node-header">
    <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L415" class="pipeline-node-type-select" data-cc-call-change="_pipelineNodeType|j:${encodeURIComponent(String(index))}|v" title="Tipo do passo">${typeOptions}</select>
    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L416" class="pipeline-node-label" type="text" value="${_esc(node.label || node.id)}" placeholder="Nome do passo" />
    <div class="pipeline-node-btns">
      ${index > 0 ? `<button data-cc-call-click="_pipelineMoveUp|j:${encodeURIComponent(String(index))}" title="Mover acima">&#9650;</button>` : ''}
      ${index < total - 1 ? `<button data-cc-call-click="_pipelineMoveDown|j:${encodeURIComponent(String(index))}" title="Mover abaixo">&#9660;</button>` : ''}
      <button data-cc-call-click="_pipelineRemoveNode|j:${encodeURIComponent(String(index))}" title="Remover">&#10005;</button>
    </div>
  </div>
  <details class="pipeline-node-config-wrap">
    <summary>${configSummaryLabel}</summary>
    ${configFormHtml}
    <textarea data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:textarea:L426" class="pipeline-node-config" rows="3" style="display:none">${_esc(configJson)}</textarea>
  </details>
</div>`;
}

/**
 * Renderiza formulário de config específico por tipo.
 * @param {any} node
 * @returns {string} HTML
 */
function _renderConfigForm(node: any): string {
    const cfg = node.config || {};

    switch (node.type) {
        case NODE_TYPES.TRIGGER: {
            return `<label>Tipo de gatilho:
              <select data-field-meta="true" data-field-meta-key="auto-name:triggerType" class="pipeline-cfg-trigger-type" name="triggerType">
                <option value="manual" ${cfg.triggerType !== 'eventBus' ? 'selected' : ''}>Manual</option>
                <option value="eventBus" ${cfg.triggerType === 'eventBus' ? 'selected' : ''}>Evento do sistema</option>
              </select></label>`;
        }

        case NODE_TYPES.ACTION: {
            const actions = getRegisteredActions();
            const options = actions
                .map((a: any) => `<option value="${_esc(a)}" ${a === cfg.action ? 'selected' : ''}>${_esc(a)}</option>`)
                .join('');
            const paramsStr = JSON.stringify(cfg.params || {});

            // P2: Schema-driven param form when paramsSchema available (YELLOW-C3)
            let paramsFormHtml = '';
            const meta = cfg.action ? getHeadlessMeta(cfg.action) : null;
            if (meta?.paramsSchema) {
                const schema = meta.paramsSchema;
                const params = cfg.params || {};
                paramsFormHtml =
                    '<div class="pipeline-params-form" style="margin-top:6px;padding:6px;border:1px solid var(--border-color,#444);border-radius:4px;">';
                paramsFormHtml += `<div style="font-size:10px;color:var(--text-muted,#888);margin-bottom:4px;">Headless params (${meta.headlessSafe ? 'headless-safe' : 'UI fallback'})</div>`;
                for (const [key, def] of Object.entries(schema) as [string, any][]) {
                    const val = params[key] ?? def.default ?? '';
                    const reqMark = def.required ? ' *' : '';
                    if (def.type === 'select' && def.options) {
                        const opts = (def.options as any[])
                            .map(
                                (o: any) => `<option value="${_esc(String(o))}" ${o === val ? 'selected' : ''}>${_esc(String(o))}</option>`,
                            )
                            .join('');
                        paramsFormHtml += `<label style="font-size:11px;">${_esc(def.label || key)}${reqMark}: <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L471" class="pipeline-param" data-param="${_esc(key)}">${opts}</select></label>`;
                    } else {
                        const inputType = def.type === 'number' ? 'number' : 'text';
                        paramsFormHtml += `<label style="font-size:11px;">${_esc(def.label || key)}${reqMark}: <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L474" class="pipeline-param" data-param="${_esc(key)}" type="${inputType}" value="${_esc(String(val))}" /></label>`;
                    }
                }
                paramsFormHtml += `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Tip: use $prev.fieldName for chaining</div>`;
                paramsFormHtml += '</div>';
            }

            return `<label>Acao:
              <select data-field-meta="true" data-field-meta-key="auto-name:action" class="pipeline-cfg-action" name="action">${options}</select></label>
              ${paramsFormHtml}
              <label>Parametros (JSON):
              <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L485" class="pipeline-cfg-params" type="text" value="${_esc(paramsStr)}" placeholder="{}" /></label>`;
        }

        case NODE_TYPES.CONDITION: {
            const subjectOptions = Object.keys(ALLOWED_PATHS)
                .map((k) => `<option value="${_esc(k)}" ${k === cfg.subject ? 'selected' : ''}>${_esc(k)}</option>`)
                .join('');
            const ops = ['>', '<', '>=', '<=', '===', '!=='];
            const opOptions = ops
                .map((op) => `<option value="${op}" ${op === cfg.operator ? 'selected' : ''}>${op}</option>`)
                .join('');
            return `<label>Sujeito: <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L496" class="pipeline-cfg-subject">${subjectOptions}</select></label>
              <label>Operador: <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L497" class="pipeline-cfg-operator">${opOptions}</select></label>
              <label>Valor: <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L498" class="pipeline-cfg-value" type="number" value="${_esc(String(cfg.value ?? '0'))}" /></label>`;
        }

        case NODE_TYPES.DELAY: {
            return `<label>Aguardar (ms):
              <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L503" class="pipeline-cfg-ms" type="number" min="0" max="300000" value="${_esc(String(cfg.ms || 0))}" /></label>`;
        }

        case NODE_TYPES.API_CALL: {
            const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
            const methOpts = methods
                .map((m) => `<option value="${m}" ${m === (cfg.method || 'GET') ? 'selected' : ''}>${m}</option>`)
                .join('');
            return `<label>URL: <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L511" class="pipeline-cfg-url" type="url" value="${_esc(cfg.url || '')}" placeholder="https://..." /></label>
              <label>Metodo: <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L512" class="pipeline-cfg-method">${methOpts}</select></label>
              <label>Body (JSON): <textarea data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:textarea:L513" class="pipeline-cfg-body" rows="2">${_esc(JSON.stringify(cfg.body || {}))}</textarea></label>
              <label>Timeout (ms): <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L514" class="pipeline-cfg-timeout" type="number" min="1000" max="120000" value="${_esc(String(cfg.timeoutMs || 30000))}" /></label>`;
        }

        default:
            return '<em>Configure este passo via JSON:</em>';
    }
}

// ----------------------------------------------------------------
// AÇÕES DO EDITOR LINEAR
// ----------------------------------------------------------------

/** @param {HTMLElement} container */
function _addNode(container: any) {
    const list = container.querySelector('#pipeline-nodes-list');
    if (!list) return;
    const newNode = {
        id: 'n_' + Date.now().toString(36),
        type: NODE_TYPES.ACTION,
        label: 'Novo passo',
        config: {},
    };
    const div = document.createElement('div');
    div.innerHTML = _renderNodeCard(newNode, list.children.length, list.children.length + 1);
    if (div.firstElementChild) list.appendChild(div.firstElementChild);
}

/**
 * @param {HTMLElement} container
 * @param {any} def
 * @param {number} index
 * @param {number} delta
 */
function _moveNode(container: any, def: any, index: any, delta: any) {
    const nodes = [...(def.nodes || [])];
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= nodes.length) return;
    [nodes[index], nodes[newIdx]] = [nodes[newIdx], nodes[index]];
    def.nodes = nodes;
    renderLinearEditor(container, def);
}

/**
 * @param {HTMLElement} container
 * @param {any} def
 * @param {number} index
 */
function _removeNode(container: any, def: any, index: any) {
    const nodes = [...(def.nodes || [])];
    nodes.splice(index, 1);
    def.nodes = nodes;
    renderLinearEditor(container, def);
}

/**
 * @param {HTMLElement} container
 * @param {any} def
 * @param {number} index
 * @param {string} newType
 */
function _changeNodeType(container: any, def: any, index: any, newType: any) {
    const nodes = [...(def.nodes || [])];
    if (!nodes[index]) return;
    nodes[index] = { ...nodes[index], type: newType, config: {} };
    def.nodes = nodes;
    renderLinearEditor(container, def);
}

// ----------------------------------------------------------------
// UTILITÁRIOS
// ----------------------------------------------------------------

/**
 * Escapa HTML para prevenir XSS em strings de usuário em innerHTML.
 * @param {string} str
 * @returns {string}
 */
function _esc(str: any): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ----------------------------------------------------------------
// UTILITÁRIOS DE UI - nomes amigáveis, kv-editor
// ----------------------------------------------------------------

/**
 * Converte nome de handler em rótulo legível para o usuário.
 * Ex: "handleOpenReportOverlay" → "Open Report Overlay"
 * @param {string} name
 * @returns {string}
 */
function _toFriendlyName(name: any): string {
    return String(name || '')
        .replace(/^handle/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim() || name;
}

/**
 * Renderiza um editor visual de pares chave-valor.
 * @param {string} cfgKey - data-cfg-key do campo
 * @param {any} obj    - Objeto { chave: valor }
 * @param {string} keyPlaceholder
 * @param {string} valPlaceholder
 * @returns {string} HTML
 */
function _renderKvEditor(cfgKey: any, obj: any, keyPlaceholder = 'Chave', valPlaceholder = 'Valor'): string {
    const rows = Object.entries(obj || {})
        .map(
            ([k, v]) =>
                `<div class="kv-row">
            <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L614" class="kv-key" placeholder="${_escProp(keyPlaceholder)}" value="${_escProp(k)}" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L615" class="kv-value" placeholder="${_escProp(valPlaceholder)}" value="${_escProp(String(v ?? ''))}" />
            <button type="button" class="kv-remove" title="Remover linha">&#10005;</button>
        </div>`,
        )
        .join('');
    return `<div class="kv-editor" data-cfg-key="${_escProp(cfgKey)}" data-kv="1"
        data-kv-key-ph="${_escProp(keyPlaceholder)}" data-kv-val-ph="${_escProp(valPlaceholder)}">
        ${rows}
        <button type="button" class="kv-add">&#43; Adicionar</button>
    </div>`;
}

/**
 * Lê um kv-editor e retorna o objeto { chave: valor }.
 * @param {HTMLElement} kvEl
 * @returns {Record<string, string>}
 */
function _readKvEditor(kvEl: any): Record<string, string> {
    const obj: Record<string, string> = {};
    kvEl.querySelectorAll('.kv-row').forEach((row: any) => {
        const rowEl = (row as HTMLElement);
        const keyInput = (rowEl.querySelector('.kv-key') as HTMLInputElement|null);
        const valueInput = (rowEl.querySelector('.kv-value') as HTMLInputElement|null);
        // guided row tem chave fixa em data-param-key; free row usa input.kv-key
        const k = rowEl.dataset.paramKey || keyInput?.value?.trim();
        const v = valueInput?.value?.trim();
        if (k) obj[k] = v ?? '';
    });
    return obj;
}

/**
 * Renderiza params guiados: chaves conhecidas como labels + input de valor;
 * params extras como linha editável livre.
 * @param {string} action - Nome da ação selecionada
 * @param {string[]} knownParams - Lista de params conhecidos da ação
 * @param {any} currentParams - Valores já salvos
 * @returns {string} HTML
 */
function _renderGuidedParams(action: any, knownParams: any, currentParams: any): string {
    const guided = (knownParams || [])
        .map((p: any) => {
            const v = currentParams?.[p] ?? '';
            return `<div class="kv-row kv-row-guided" data-param-key="${_escProp(p)}">
            <span class="kv-key-label" title="${_escProp(p)}">${_escProp(p)}</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L657" class="kv-value" value="${_escProp(String(v))}" placeholder="valor" />
        </div>`;
        })
        .join('');
    const extras = Object.entries(currentParams || {})
        .filter(([k]) => !(knownParams || []).includes(k))
        .map(
            ([k, v]) =>
                `<div class="kv-row">
                <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L666" class="kv-key" value="${_escProp(k)}" placeholder="chave" />
                <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L667" class="kv-value" value="${_escProp(String(v ?? ''))}" placeholder="valor" />
                <button type="button" class="kv-remove">&#10005;</button>
            </div>`,
        )
        .join('');
    return `<div class="kv-editor" data-cfg-key="params" data-kv="1"
            data-kv-key-ph="chave" data-kv-val-ph="valor" data-params-panel="1">
        ${guided}${extras}
        <button type="button" class="kv-add">&#43; Param extra</button>
    </div>`;
}

// ----------------------------------------------------------------
// PROPERTIES PANEL - painel de propriedades inline legado/local
// ----------------------------------------------------------------

/**
 * Le ecbyts:config do elemento local.
 * @param {any} element - Elemento local
 * @returns {{ type: string|null, config: Record<string, any> }}
 */
function _getEcbytsCfg(element: any): { type: string|null, config: Record<string, any> } {
    try {
        const bo = element.businessObject;
        const ext = bo.extensionElements;
        if (!ext || !ext.values) return { type: null, config: {} };
        for (const val of ext.values) {
            const text = val.$body || val.value || '';
            if (text) {
                const parsed = safeJsonParse<any>(text, null, 'pipelineEditor-ecbytsCfg');
                if (parsed) return { type: parsed.type || null, config: parsed.config || {} };
            }
        }
    } catch (error: any) {
        console.debug('[pipelineEditor] read ECBT config failed:', error instanceof Error ? error.message : error);
    }
    return { type: null, config: {} };
}

/**
 * Grava ecbyts:config de volta no elemento local via adaptador de modelagem.
 * @param {any} element - Elemento local
 * @param {any} modeling - Servico de modelagem local
 * @param {string} type - Tipo do nó
 * @param {any} config - Configuração a salvar
 */
function _setEcbytsCfg(element: any, modeling: any, type: any, config: any) {
    try {
        const bo = element.businessObject;
        const configJson = JSON.stringify({ type, config });

        if (bo.extensionElements && bo.extensionElements.values) {
            for (const val of bo.extensionElements.values) {
                if (val.$body !== undefined || val.value !== undefined) {
                    if (val.$body !== undefined) val.$body = configJson;
                    else val.value = configJson;
                    modeling.updateProperties(element, {});
                    return;
                }
            }
        }
        console.warn('[pipelineEditor] Sem extensionElements para atualizar config');
    } catch (e: any) {
        console.warn('[pipelineEditor] Falha ao salvar config:', e instanceof Error ? e.message : e);
    }
}

/**
 * Esconde o painel de propriedades.
 */
function _hidePropPanel() {
    const panel = document.getElementById('pipeline-props-panel');
    if (panel) panel.style.display = 'none';
    const titleEl = document.getElementById('pipeline-props-title');
    if (titleEl) titleEl.textContent = 'Propriedades';
}

/**
 * Anexa event listeners de add/remove/input em um kv-editor.
 * Extraído para reutilização ao re-renderizar params após troca de ação.
 */
/**
 * @param {HTMLElement} kvEl
 * @param {any} element
 * @param {any} modeling
 * @param {string} nodeType
 * @param {HTMLElement} body
 */
function _attachKvListeners(kvEl: any, element: any, modeling: any, nodeType: any, body: any) {
    kvEl.addEventListener('input', () => _savePropFields(element, modeling, nodeType, body));
    kvEl.addEventListener('change', () => _savePropFields(element, modeling, nodeType, body));
    kvEl.addEventListener('click', (e: any) => {
        const target = (e.target as Element|null);
        const btn = target?.closest('button');
        if (!btn) return;
        if (btn.classList.contains('kv-remove')) {
            btn.closest('.kv-row')?.remove();
            _savePropFields(element, modeling, nodeType, body);
        } else if (btn.classList.contains('kv-add')) {
            const kPh = kvEl.dataset.kvKeyPh || 'Chave';
            const vPh = kvEl.dataset.kvValPh || 'Valor';
            const row = document.createElement('div');
            row.className = 'kv-row';
            row.innerHTML =
                `<input data-field-meta="true" data-field-meta-key="auto-tpl:pipelineEditor:input:L763" class="kv-key" id="kv-key-${_kvIdCounter}" placeholder="${_escProp(kPh)}" aria-label="${_escProp(kPh)}" />` +
                `<input data-field-meta="true" data-field-meta-key="auto-tpl:pipelineEditor:input:L764" class="kv-value" id="kv-val-${_kvIdCounter++}" placeholder="${_escProp(vPh)}" aria-label="${_escProp(vPh)}" />` +
                `<button type="button" class="kv-remove" title="Remover linha">&#10005;</button>`;
            btn.before(row);
            (row.querySelector('.kv-key') as HTMLInputElement|null)?.focus();
            _savePropFields(element, modeling, nodeType, body);
        }
    });
}

/**
 * Mostra painel de propriedades para o elemento selecionado.
 * @param {any} element - Elemento selecionado
 * @param {any} modeling - Servico de modelagem local
 */
function _showPropPanel(element: any, modeling: any) {
    const panel = document.getElementById('pipeline-props-panel');
    const body = document.getElementById('pipeline-props-body');
    if (!panel || !body) return;

    const { type, config } = _getEcbytsCfg(element);
    const elType = element.type || '';
    const nodeType = type || _bpmnTypeToNodeType(elType);

    body.innerHTML = _renderPropFields(nodeType, config, element);
    panel.style.display = 'flex';

    // Atualizar título do painel com tipo + nome do elemento
    const titleEl = document.getElementById('pipeline-props-title');
    if (titleEl) {
        const bo = element.businessObject;
        const elName = bo?.name || element.id || '';
        titleEl.innerHTML = `<span class="props-type-badge props-type-${_escProp(nodeType)}">${_escProp(nodeType)}</span>&nbsp;${_escProp(elName)}`;
    }

    // Listeners em todos os campos diretos (excluindo kv e action-picker)
    body.querySelectorAll('[data-cfg-key]:not([data-kv]):not([data-action-picker])').forEach((input) => {
        input.addEventListener('change', () => _savePropFields(element, modeling, nodeType, body));
        input.addEventListener('input', () => _savePropFields(element, modeling, nodeType, body));
    });
    // Listeners delegados nos kv-editors
    body.querySelectorAll('[data-kv]').forEach((kvEl) =>
        _attachKvListeners((kvEl as HTMLElement), element, modeling, nodeType, body),
    );
    // Action picker: filter + click
    const searchEl = (body.querySelector('.props-action-search') as HTMLInputElement|null);
    const pickerEl = (body.querySelector('[data-action-picker]') as HTMLElement|null);
    if (searchEl && pickerEl) {
        searchEl.addEventListener('input', () => {
            const v = searchEl.value.toLowerCase();
            pickerEl.querySelectorAll('.action-option').forEach((o) => {
                const option = (o as HTMLElement);
                option.hidden =
                    !!v &&
                    !(option.textContent || '').toLowerCase().includes(v) &&
                    !(option.dataset.value || '').toLowerCase().includes(v);
            });
            pickerEl.querySelectorAll('.action-cat-group').forEach((g) => {
                const group = (g as HTMLElement);
                group.hidden =
                    !!v &&
                    !Array.from(group.querySelectorAll('.action-option')).some(
                        (o) => !((o as HTMLElement).hidden),
                    );
            });
        });
        pickerEl.addEventListener('click', (e) => {
            const target = (e.target as Element|null);
            const opt = (target?.closest('.action-option') as HTMLElement|null);
            if (!opt) return;
            pickerEl.querySelectorAll('.action-option.selected').forEach((o) => o.classList.remove('selected'));
            opt.classList.add('selected');
            const actionName = opt.dataset.value || '';
            const knownParams = JSON.parse(opt.dataset.params || '[]');
            // Atualizar hint
            const hintEl = body.querySelector('.props-action-hint');
            if (hintEl)
                hintEl.innerHTML = knownParams.length
                    ? `Parâmetros: <b>${knownParams.join(', ')}</b>`
                    : actionName
                      ? 'Sem parâmetros obrigatórios'
                      : 'Selecione uma ação';
            // Re-renderizar params guiados
            const oldParams = body.querySelector('[data-params-panel]');
            if (oldParams) {
                oldParams.outerHTML = _renderGuidedParams(actionName, knownParams, {});
                const newParams = body.querySelector('[data-params-panel]');
                if (newParams)
                    _attachKvListeners((newParams as HTMLElement), element, modeling, nodeType, body);
            }
            _savePropFields(element, modeling, nodeType, body);
        });
    }
}

/**
 * Mapeia tipo BPMN para tipo interno ecbyts.
 * @param {string} bpmnType
 * @returns {string}
 */
function _bpmnTypeToNodeType(bpmnType: any): string {
    const map: Record<string, string> = {
        'bpmn:StartEvent': 'trigger',
        'bpmn:ServiceTask': 'action',
        'bpmn:ExclusiveGateway': 'condition',
        'bpmn:IntermediateCatchEvent': 'delay',
        'bpmn:ScriptTask': 'api_call',
        'bpmn:EndEvent': 'end',
    };
    return map[bpmnType] || 'action';
}

/**
 * Renderiza os campos de formulário baseado no tipo de nó.
 * @param {string} nodeType
 * @param {any} config
 * @param {any} element
 * @returns {string} HTML dos campos
 */
function _renderPropFields(nodeType: any, config: any, element: any): string {
    const bo = element.businessObject;
    const label = bo.name || '';

    let fields = `
        <div class="props-field">
            <label class="props-label">Nome</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L877" class="props-input" data-cfg-key="__name__" type="text" value="${_escProp(label)}" placeholder="Nome do passo" />
        </div>
        <div class="props-field props-field--type">
            <label class="props-label">Tipo</label>
            <span class="props-type-badge props-type-${_escProp(nodeType)}">${_escProp(nodeType)}</span>
        </div>
    `;

    switch (nodeType) {
        case 'trigger':
            fields += `
                <div class="props-field">
                    <label class="props-label">Tipo de gatilho</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L890" class="props-input" data-cfg-key="triggerType">
                        <option value="manual" ${config.triggerType === 'manual' ? 'selected' : ''}>Manual</option>
                        <option value="schedule" ${config.triggerType === 'schedule' ? 'selected' : ''}>Agendado</option>
                        <option value="event" ${config.triggerType === 'event' ? 'selected' : ''}>Evento</option>
                    </select>
                </div>`;
            break;

        case 'action': {
            // Agrupar ações registradas por categoria
            const registered = new Set(getRegisteredActions());
            const groups: Record<string, any[]> = {};
            for (const entry of ACTION_REGISTRY) {
                if (!registered.has(entry.name)) continue;
                const cat = entry.cat || 'outros';
                (groups[cat] = groups[cat] || []).push(entry);
            }
            // Ações não mapeadas → "outros"
            const mappedSet = new Set(ACTION_REGISTRY.map((e: any) => e.name));
            const unmapped = [...registered].filter((n) => !mappedSet.has(n));
            if (unmapped.length) {
                groups.outros = (groups.outros || []).concat(unmapped.map((n) => ({ name: n, params: [] })));
            }
            // Gerar picker rows
            const pickerRows = Object.entries(groups)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, entries]) => {
                    const catMeta = (CAT_META as Record<string, any>)[cat] || CAT_META.outros;
                    const opts = entries
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                        .map(
                            (e: any) => `<div class="action-option${e.name === config.action ? ' selected' : ''}"
                              data-value="${_escProp(e.name)}"
                              data-params="${_escProp(JSON.stringify(e.params || []))}"
                              title="${_escProp(e.name)}">${_escProp(_toFriendlyName(e.name))}</div>`,
                        )
                        .join('');
                    return `<div class="action-cat-group" data-cat="${_escProp(cat)}">
                        <div class="action-cat-header" style="--cat-color:${catMeta.color}">
                            <span class="action-cat-dot"></span>${_escProp(catMeta.label)}
                        </div>
                        ${opts}
                    </div>`;
                })
                .join('');
            // Hint dos parâmetros esperados
            const actionMeta = ACTION_REGISTRY.find((e: any) => e.name === config.action);
            const knownParams = actionMeta?.params || [];
            const paramHint = knownParams.length
                ? `Parâmetros: <b>${knownParams.join(', ')}</b>`
                : config.action
                  ? 'Sem parâmetros obrigatórios'
                  : 'Selecione uma ação';
            fields += `
                <div class="props-field">
                    <label class="props-label">Buscar ação</label>
                    <input type="search" class="props-action-search" placeholder="Filtrar..." />
                    <div class="action-picker" data-cfg-key="action" data-action-picker="1">${pickerRows}</div>
                </div>
                <div class="props-field">
                    <span class="props-action-hint">${paramHint}</span>
                </div>
                <div class="props-field">
                    <label class="props-label">Parâmetros</label>
                    ${_renderGuidedParams(config.action, knownParams, config.params || {})}
                </div>`;
            break;
        }

        case 'condition':
            fields += `
                <div class="props-field">
                    <label class="props-label">Sujeito</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L964" class="props-input" data-cfg-key="subject" type="text" value="${_escProp(config.subject || '')}" placeholder="ex: elements.length" />
                </div>
                <div class="props-field">
                    <label class="props-label">Operador</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L968" class="props-input" data-cfg-key="operator">
                        <option value=">=" ${config.operator === '>=' ? 'selected' : ''}>&gt;=</option>
                        <option value=">" ${config.operator === '>' ? 'selected' : ''}>&gt;</option>
                        <option value="==" ${config.operator === '==' ? 'selected' : ''}>=</option>
                        <option value="!=" ${config.operator === '!=' ? 'selected' : ''}>!=</option>
                        <option value="<" ${config.operator === '<' ? 'selected' : ''}>&lt;</option>
                        <option value="<=" ${config.operator === '<=' ? 'selected' : ''}>&lt;=</option>
                    </select>
                </div>
                <div class="props-field">
                    <label class="props-label">Valor</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L979" class="props-input" data-cfg-key="value" type="text" value="${_escProp(String(config.value ?? ''))}" placeholder="ex: 1" />
                </div>`;
            break;

        case 'delay':
            fields += `
                <div class="props-field">
                    <label class="props-label">Delay (ms)</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L987" class="props-input" data-cfg-key="ms" type="number" value="${config.ms || 1000}" min="0" step="100" />
                </div>`;
            break;

        case 'api_call':
            fields += `
                <div class="props-field">
                    <label class="props-label">URL</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L995" class="props-input" data-cfg-key="url" type="text" value="${_escProp(config.url || '')}" placeholder="https://api.exemplo.com/endpoint" />
                </div>
                <div class="props-field">
                    <label class="props-label">Metodo HTTP</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:select:L999" class="props-input" data-cfg-key="method">
                        <option value="GET"    ${(config.method || 'GET') === 'GET' ? 'selected' : ''}>GET — Buscar dados</option>
                        <option value="POST"   ${config.method === 'POST' ? 'selected' : ''}>POST — Enviar dados</option>
                        <option value="PUT"    ${config.method === 'PUT' ? 'selected' : ''}>PUT — Substituir</option>
                        <option value="PATCH"  ${config.method === 'PATCH' ? 'selected' : ''}>PATCH — Atualizar parcial</option>
                        <option value="DELETE" ${config.method === 'DELETE' ? 'selected' : ''}>DELETE — Excluir</option>
                    </select>
                </div>
                <div class="props-field">
                    <label class="props-label">Timeout (ms)</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:pipelineEditor:input:L1009" class="props-input" data-cfg-key="timeoutMs" type="number" value="${config.timeoutMs || 10000}" min="1000" step="1000" />
                </div>
                <div class="props-field">
                    <label class="props-label">Headers</label>
                    ${_renderKvEditor('headers', config.headers || {}, 'Header', 'Valor')}
                </div>
                <div class="props-field">
                    <label class="props-label">Body (pares chave-valor)</label>
                    ${_renderKvEditor('body', typeof config.body === 'object' ? config.body || {} : {}, 'Campo', 'Valor')}
                </div>`;
            break;

        case 'end':
            fields += `<p class="props-note">Evento de fim &#8212; sem configuracao adicional.</p>`;
            break;
    }

    return fields;
}

/**
 * Lê os campos do painel e salva via modeling.
 * @param {any} element
 * @param {any} modeling
 * @param {string} nodeType
 * @param {HTMLElement} body
 */
function _savePropFields(element: any, modeling: any, nodeType: any, body: any) {
    const config: Record<string, any> = {};
    body.querySelectorAll('[data-cfg-key]').forEach((el: any) => {
        const field = (el as HTMLElement & { value?: string, type?: string });
        const key = field.dataset.cfgKey || '';
        if (key === '__name__') return;
        // action-picker: ler a opção selecionada
        if (field.dataset.actionPicker) {
            const sel = (field.querySelector('.action-option.selected') as HTMLElement|null);
            config[key] = sel?.dataset.value || '';
            return;
        }
        // kv-editor: serializar pares chave-valor como objeto
        if (field.dataset.kv) {
            config[key] = _readKvEditor(field);
            return;
        }
        /** @type {string|number} */
        let val: string | number = field.value || '';
        if (field.type === 'number') val = parseFloat(val as string) || 0;
        config[key] = val;
    });

    const nameInput = (body.querySelector('[data-cfg-key="__name__"]') as HTMLInputElement|null);
    if (nameInput) {
        try {
            modeling.updateLabel(element, nameInput.value);
        } catch (error: any) {
            console.debug('[pipelineEditor] update BPMN label failed:', error instanceof Error ? error.message : error);
        }
    }

    _setEcbytsCfg(element, modeling, nodeType, config);
}

/**
 * Escapa atributos HTML para uso em innerHTML do painel de propriedades.
 * @param {string} str
 * @returns {string}
 */
function _escProp(str: any): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
