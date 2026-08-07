// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK WORKBENCH - pure summary for customizable pipelines.

   Keeps the open pipeline screen easy to read without coupling future
   process domains to the GAC/DD38 preset.
   ================================================================ */

import {
    extractPipelinePackDeParaRows,
    normalizePipelinePack,
    summarizePipelinePack,
    validatePipelinePack,
    type PipelineAssetBinding,
    type PipelineDeParaRow,
    type PipelineModuleTarget,
    type PipelinePack,
    type PipelinePackSummary,
    type PipelineProjectDataBinding,
} from './pipelinePack.js';
import {
    summarizePipelineConditionalGates,
    type PipelineConditionalGateSummary,
} from './pipelineConditionalGate.js';
import {
    buildGacDd38NormativeProfile,
    summarizeGacDd38NormativeProfile,
    type GacDd38AreaClass,
    type GacDd38ChecklistItem,
    type GacDd38NormativeProfile,
    type GacDd38NormativeSection,
} from './gacDd38NormativeProfile.js';
import {
    summarizeDomainTechnicalParameterCatalog,
    type DomainTechnicalParameter,
    type DomainTechnicalParameterApplicability,
    type PipelineDomainTechnicalParameterCatalogSummary,
} from './pipelineDomainProfile.js';
import {
    buildPipelinePackAssetManifest,
    type PipelinePackAssetManifest,
    type PipelinePackAssetManifestItem,
    type PipelinePackAssetLike,
} from './pipelinePackAssets.js';
import { evaluatePipelinePackDod, type PipelinePackDodEvidence, type PipelinePackDodStatus } from './pipelinePackDod.js';
import {
    inspectPipelinePackConnector,
    inspectPipelinePackNode,
    type PipelinePackConnectorInspection,
    type PipelinePackNodeInspection,
} from './pipelinePackInspector.js';
import {
    buildPipelinePackLibraryViewModel,
    type PipelinePackLibraryRecommendation,
    type PipelinePackLibrarySummary,
} from './pipelinePackLibrary.js';
import { preparePipelinePackForMarketplace, type PipelinePackMarketplacePreparation } from './pipelinePackMarketplace.js';
import {
    buildPipelinePackPresentationViewModel,
    type PipelinePackPresentationVisibleAction,
    type PipelinePackPresentationViewModel,
} from './pipelinePackPresentation.js';
import { summarizePipelinePackQuality, type PipelinePackQualityInput, type PipelinePackQualityStatus } from './pipelinePackQuality.js';
import { buildPipelineTrainingOpenPlan, type PipelineTrainingOpenPlan } from './pipelinePackTrainingBridge.js';
import { buildPipelinePackUserMessage, type PipelinePackUserMessage } from './pipelinePackUserCopy.js';
import { summarizePipelinePackVisualAudit, type PipelinePackVisualAuditSummary } from './pipelinePackVisualAudit.js';
import {
    summarizePipelinePidDigitalTwinBridge,
    type PipelinePidDigitalTwinBinding,
    type PipelinePidDigitalTwinBridgeSummary,
} from './pipelinePidDiagramBridge.js';
import {
    buildPipelineTagCoverageReport,
    type PipelineTagCoverageReportLabels,
} from './_pipelineTagCoverageReportPure.js';
import {
    buildPipelineProtocol,
    validatePipelineProtocol,
} from './pipelineProtocol.js';
import {
    deriveGuidedTaskPlan,
    renderGuidedTaskPlanHtml,
} from '../pipeline/guidedTaskPlan.js';
import {
    computeProtocolEquivalence,
    renderProtocolEquivalenceHtml,
} from '../pipeline/protocolEquivalence.js';
import {
    buildDomainAssistant,
    buildProtocolConnectorPanel,
    buildProtocolDecisionPanel,
    buildProtocolItemPanel,
    renderDomainAssistantHtml,
    renderProtocolConnectorPanelHtml,
    renderProtocolDecisionPanelHtml,
    renderProtocolItemPanelHtml,
} from '../pipeline/protocolPanels.js';

export interface PipelinePackWorkbenchModuleRow {
    moduleId: string;
    count: number;
    label: string;
}

export interface PipelinePackWorkbenchTargetRow extends PipelineDeParaRow {
    targetId: string;
    label: string;
    statusLabel: string;
    fallbackText: string;
}

export interface PipelinePackWorkbenchAssetRow {
    id: string;
    label: string;
    fileName: string;
    status: PipelineAssetBinding['status'] | 'local';
    statusLabel: string;
    validationStatus: PipelinePackAssetManifestItem['validationStatus'];
    storageLabel: string;
    pendingCodes: string[];
}

export interface PipelinePackWorkbenchSummaryButton {
    id: string;
    label: string;
    detail: string;
    nodeId: string;
    moduleId: string;
}

export interface PipelinePackWorkbenchConnectorRow {
    connectorId: string;
    label: string;
    detail: string;
    kind: string;
    direction: string;
    required: boolean;
    pendingLabel: string;
    selected: boolean;
}

export type PipelinePackTechnicalParameterStatus = 'empty' | 'filled' | 'review' | 'not-applicable' | string;

export interface PipelinePackWorkbenchTechnicalParameterRow {
    parameterId: string;
    label: string;
    description: string;
    group: string;
    groupLabel: string;
    applicability: DomainTechnicalParameterApplicability;
    applicabilityLabel: string;
    valueKind: string;
    userPrompt: string;
    examples: string[];
    value: string;
    source: string;
    unit: string;
    basis: string;
    observationRef: string;
    observationLabel: string;
    status: PipelinePackTechnicalParameterStatus;
    statusLabel: string;
    targetId: string;
    nodeId: string;
    canSave: boolean;
}

export interface PipelinePackWorkbenchPidTwinRow {
    id: string;
    pidTag: string;
    pidElementType: string;
    functionalClass: string;
    status: PipelinePidDigitalTwinBinding['status'];
    statusLabel: string;
    ifcLabel: string;
    twinLabel: string;
    bimLabel: string;
    recommendation: string;
}

export interface PipelinePackWorkbenchBaseDd038FilterOption {
    id: string;
    label: string;
    count: number;
}

export interface PipelinePackWorkbenchBaseDd038ChecklistRow {
    id: string;
    label: string;
    requiredLabel: string;
    evidenceLabel: string;
    responsibleLabel: string;
    status: 'ready' | 'missing-section';
    statusLabel: string;
    sectionLabels: string[];
    areaClassLabels: string[];
}

export interface PipelinePackWorkbenchBaseDd038SectionRow {
    id: string;
    title: string;
    sectionLabel: string;
    pageLabel: string;
    kindLabel: string;
    summary: string;
    expectedEvidence: string[];
    checklistRows: PipelinePackWorkbenchBaseDd038ChecklistRow[];
    areaClassLabels: string[];
    phaseLabels: string[];
    status: 'ready' | 'missing-evidence';
    statusLabel: string;
}

export interface PipelinePackWorkbenchBaseDd038Summary {
    available: boolean;
    standardLabel: string;
    summaryLabel: string;
    status: 'ready' | 'pending' | 'unavailable';
    statusLabel: string;
    decisionStatusLabel: string;
    checklistStatusLabel: string;
    sectionRows: PipelinePackWorkbenchBaseDd038SectionRow[];
    checklistRows: PipelinePackWorkbenchBaseDd038ChecklistRow[];
    filters: {
        pendency: PipelinePackWorkbenchBaseDd038FilterOption[];
        areaClass: PipelinePackWorkbenchBaseDd038FilterOption[];
        phase: PipelinePackWorkbenchBaseDd038FilterOption[];
    };
}

export interface PipelinePackTechnicalParameterPatch {
    parameterId: string;
    value?: unknown;
    status?: PipelinePackTechnicalParameterStatus;
    source?: unknown;
    unit?: unknown;
    basis?: unknown;
    observationRef?: unknown;
    observationLabel?: unknown;
    projectDataLabel?: unknown;
    valueKind?: unknown;
    targetId?: string;
    nodeId?: string;
}

export interface PipelinePackWorkbenchViewModel {
    title: string;
    sourceLabel: string;
    scoreLabel: string;
    visualLabel: string;
    summary: PipelinePackSummary;
    summaryButtons: PipelinePackWorkbenchSummaryButton[];
    moduleRows: PipelinePackWorkbenchModuleRow[];
    targetRows: PipelinePackWorkbenchTargetRow[];
    assetRows: PipelinePackWorkbenchAssetRow[];
    pendingRows: string[];
    inspector: PipelinePackNodeInspection;
    connectorRows: PipelinePackWorkbenchConnectorRow[];
    connectorInspector: PipelinePackConnectorInspection;
    conditionalGateSummary: PipelineConditionalGateSummary;
    technicalParameterCatalog: PipelineDomainTechnicalParameterCatalogSummary;
    technicalParameterRows: PipelinePackWorkbenchTechnicalParameterRow[];
    pidDigitalTwinSummary: PipelinePidDigitalTwinBridgeSummary;
    pidDigitalTwinRows: PipelinePackWorkbenchPidTwinRow[];
    baseDd038: PipelinePackWorkbenchBaseDd038Summary;
    presentation: PipelinePackPresentationViewModel;
    presentationPrimaryAction: PipelinePackPresentationVisibleAction | null;
    visualAudit: PipelinePackVisualAuditSummary;
    visualAuditProcessingState: 'ready' | 'processing' | 'missing-data' | 'failed';
    visualAuditProcessingLabel: string;
    assetManifest: PipelinePackAssetManifest;
    marketplace: PipelinePackMarketplacePreparation;
    librarySummary: PipelinePackLibrarySummary;
    libraryRecommendation: PipelinePackLibraryRecommendation | null;
    quality: PipelinePackQualityStatus;
    dodStatus: PipelinePackDodStatus;
    trainingPlan: PipelineTrainingOpenPlan;
    userMessage: PipelinePackUserMessage;
    reportMarkdown: string;
}

export interface PipelinePackWorkbenchOptions {
    /**
     * Rollback hatch da Base DD-038 (GAC-DD38-NORMATIVE-COVERAGE-001 §11).
     * Default true (aprovado Calvin 2026-07-01 via ecosystem_registry). O caller
     * de UI injeta CONFIG.FEATURES.GAC_DD38_NORMATIVE_COVERAGE aqui — o core
     * permanece puro (sem import de config). false → painel Base DD-038 degrada
     * para "desativada" sem tocar o resto do Workbench.
     */
    baseDd038Enabled?: boolean;
    maxTargets?: number;
    maxAssets?: number;
    maxConnectors?: number;
    selectedNodeId?: string;
    selectedConnectorId?: string;
    maxPidTwinRows?: number;
    visualAuditResult?: unknown;
    visualAuditProcessing?: boolean;
    testsPassed?: number;
    testsTotal?: number;
    focusedTestsPass?: boolean;
    ecbtRoundTrip?: boolean;
    specLinked?: boolean;
    /**
     * PIPELINE-UNIFIED-PROTOCOL#9: modo auditoria expoe TODOS os campos
     * avancados do Plano guiado (sem precisar de achado ou perfil). Default
     * false — campos avancados so aparecem quando um achado, perfil ou este
     * modo exigir.
     */
    auditMode?: boolean;
    /**
     * PIPELINE-UNIFIED-PROTOCOL#10: referencia opcional (pack ou protocolo
     * original) para a equivalencia visual + estrutural. Sem ela, o Workbench
     * compara o protocolo do proprio pack (cobertura estrutural 100%) e a
     * dimensao visual continua vindo do visualAuditResult/audit do pack.
     */
    protocolEquivalenceReference?: unknown;
}

const MODULE_LABELS: Record<string, string> = {
    files: 'Arquivos',
    pipelines: 'Processos',
    datastudio: 'Data Studio',
    gantt: 'Cronograma',
    'model-3d': 'Modelo 3D',
    model: 'Modelo',
    reports: 'Relatorios',
    'temporal-analysis': 'Mann-Kendall',
    training: 'Aula Training',
};

const MODULE_OPTIONS = [
    'files',
    'pipelines',
    'datastudio',
    'gantt',
    'training',
    'reports',
    'temporal-analysis',
    'model-3d',
];

const CONNECTOR_KIND_OPTIONS = [
    ['control-flow', 'Fluxo de controle'],
    ['data-association', 'Associacao de dados'],
    ['reference', 'Referencia'],
    ['custom', 'Customizado'],
] as const;

const CONNECTOR_DIRECTION_OPTIONS = [
    ['forward', 'Avanco'],
    ['backward', 'Retorno'],
    ['bidirectional', 'Ida e volta'],
    ['undirected', 'Sem direcao operacional'],
] as const;

const CONNECTOR_FAILURE_OPTIONS = [
    ['block', 'Bloquear ate corrigir'],
    ['warn', 'Avisar e permitir seguir'],
    ['skip', 'Pular com justificativa'],
    ['rework', 'Voltar para retrabalho'],
    ['human-decision', 'Pedir decisao humana'],
] as const;

const TECHNICAL_PARAMETER_STATUS_OPTIONS = [
    ['empty', 'A preencher'],
    ['filled', 'Preenchido'],
    ['review', 'Revisar'],
    ['not-applicable', 'Nao aplicavel'],
] as const;

const TECHNICAL_PARAMETER_GROUP_LABELS: Record<string, string> = {
    phase: 'Fase',
    stakeholder: 'Responsavel',
    'data-nature': 'Dados/evidencias',
    ore: 'Minerio',
    granulometry: 'Granulometria',
    recovery: 'Recuperacao',
    'mass-balance': 'Balanco de massa',
    reagents: 'Reagentes',
    water: 'Agua',
    energy: 'Energia',
    tailings: 'Rejeitos',
    quality: 'Qualidade',
    traceability: 'Rastreabilidade',
    other: 'Outros',
};

const BASE_DD038_MAX_SECTIONS = 5;
const BASE_DD038_MAX_CHECKLIST = 6;

const BASE_DD038_SECTION_KIND_LABELS: Record<string, string> = {
    checklist: 'Checklist',
    definition: 'Definicao',
    deliverable: 'Entregavel',
    'legal-context': 'Contexto legal',
    licensing: 'Licenciamento',
    'material-destination': 'Destino de materiais',
    'process-step': 'Etapa do processo',
};

const BASE_DD038_EVIDENCE_KIND_LABELS: Record<string, string> = {
    declaration: 'Declaracao',
    'file-reference': 'Arquivo vinculado',
    'lab-data': 'Laudo ou dado de laboratorio',
    map: 'Mapa',
    other: 'Outra evidencia',
    plan: 'Plano',
    registry: 'Registro',
    report: 'Relatorio',
    term: 'Termo',
};

const BASE_DD038_RESPONSIBLE_LABELS: Record<string, string> = {
    campo: 'Campo',
    cetesb: 'CETESB',
    laboratorio: 'Laboratorio',
    'responsavel-legal': 'Responsavel legal',
    'responsavel-tecnico': 'Responsavel tecnico',
};

const SOURCE_LABELS: Record<string, string> = {
    bpmn: 'Fonte BPMN',
    direct: 'Aberto diretamente',
    ecbt: 'Chave .ecbt',
    image: 'Imagem de referencia',
    manual: 'Criado no ecbyts',
    pdf: 'PDF de referencia',
    unknown: 'Origem nao informada',
    vpp: 'Fonte original',
};

const SOURCE_SEMANTICS_LABELS: Record<string, string> = {
    semantic: 'fonte semantica editavel',
    'visual-reference': 'referencia visual, nao editavel sozinha',
    mixed: 'fonte mista: parte editavel e parte visual',
};

const USER_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
    [/Pipeline Pack/g, 'processo'],
    [/\bpack\b/gi, 'processo'],
    [/\bassets?\b/gi, 'arquivos'],
    [/\bFiles\b/g, 'arquivos'],
    [/\bDoD\b/g, 'checklist final'],
    [/\bclick-go\b/gi, 'clique para abrir'],
    [/\bforeground\b/gi, 'visual principal'],
    [/\bde-para\b/gi, 'ligacao'],
    [/\binspector\b/gi, 'painel de detalhes'],
    [/\bscore\b/gi, 'nota'],
    [/\bModulo equivalente\b/g, 'Area que abre'],
    [/\bmodulo equivalente\b/g, 'area que abre'],
    [/Destino de modulo incompleto/g, 'Escolha o que deve abrir ao clicar'],
    [/\bGate\b/g, 'Decisao'],
    [/\bgate\b/gi, 'decisao'],
    [/Destino vivo/g, 'Abertura direta'],
    [/\bAdaptador\b/g, 'Como abrir'],
    [/\badaptador\b/gi, 'como abrir'],
    [/\bparametros\b/gi, 'dados de abertura'],
    [/\bparams\b/gi, 'dados de abertura'],
    [/\bpayload\b/gi, 'dados'],
    [/\bschema\b/gi, 'modelo'],
    [/\btarget\b/gi, 'destino'],
    [/\bnodeId\b/g, 'identificador do ponto'],
    [/\bnode\b/gi, 'ponto'],
    [/Significado do no/g, 'Significado deste ponto'],
    [/para este no/g, 'para este ponto'],
    [/este no/g, 'este ponto'],
    [/No nao encontrado/g, 'Ponto nao encontrado'],
    [/no grafo/g, 'no desenho'],
    [/Selecionar um no/g, 'Selecionar um ponto'],
    [/Nenhuma pendencia critica para este no/g, 'Nenhuma pendencia critica para este ponto'],
    [/\bFallback\b/g, 'Plano B'],
    [/\bfallback\b/g, 'plano B'],
];

function _esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _moduleLabel(moduleId: string): string {
    return MODULE_LABELS[moduleId] || moduleId || 'Area do ecbyts';
}

function _targetStatusLabel(status: PipelineDeParaRow['status']): string {
    if (status === 'ready') return 'Pronto';
    if (status === 'needs-fallback') return 'Sem plano B';
    if (status === 'needs-target') return 'Escolha o que abre';
    return 'Ponto nao encontrado';
}

function _assetStatusLabel(status: PipelineAssetBinding['status'] | 'local'): string {
    if (status === 'uploaded') return 'Enviado';
    if (status === 'local-only') return 'Local';
    if (status === 'local') return 'Local';
    if (status === 'missing') return 'Precisa vincular';
    if (status === 'no-permission') return 'Sem permissao';
    return 'Revisar';
}

function _gateRouteKindLabel(kind: string): string {
    if (kind === 'approval') return 'Aprovacao';
    if (kind === 'rework') return 'Retrabalho';
    if (kind === 'not-applicable') return 'Nao aplicavel';
    if (kind === 'manual-review') return 'Revisao humana';
    return 'Rota';
}

function _friendlyText(value: unknown): string {
    return USER_COPY_REPLACEMENTS.reduce(
        (text, [pattern, replacement]) => text.replace(pattern, replacement),
        String(value ?? '').trim(),
    );
}

function _reportText(value: unknown): string {
    const text = _friendlyText(value).replace(/\s+/g, ' ').trim();
    return text || 'Nenhum';
}

function _reportList(items: unknown[], emptyText: string): string {
    const rows = items.map((item) => `- ${_reportText(item)}`);
    return rows.length ? rows.join('\n') : `- ${_reportText(emptyText)}`;
}

function _formatPercent(value: number): string {
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function _workbenchVisualLabel(score: number | null | undefined, target: number | null | undefined): string {
    const hasScore = typeof score === 'number' && Number.isFinite(score);
    const hasTarget = typeof target === 'number' && Number.isFinite(target);
    if (hasScore) {
        return `${_formatPercent(score)} do visual preservado${hasTarget ? ` / meta ${_formatPercent(target)}` : ''}`;
    }
    return hasTarget ? `Meta visual ${_formatPercent(target)}` : 'Sem comparacao visual';
}

function _visualLabel(pack: PipelinePack): string {
    const min = pack.validationProfile.visualForegroundMin;
    const current = pack.audit.foregroundVisual;
    if (typeof current === 'number' && Number.isFinite(current)) {
        return _workbenchVisualLabel(current, min);
    }
    return _workbenchVisualLabel(null, min);
}

function _sourceLabel(pack: PipelinePack): string {
    const kind = _text(pack.source.kind).toLowerCase();
    const source = SOURCE_LABELS[kind] || SOURCE_LABELS.unknown;
    const semantics = SOURCE_SEMANTICS_LABELS[pack.source.semantics] || SOURCE_SEMANTICS_LABELS.mixed;
    const file = pack.source.sourceFileName ? `: ${pack.source.sourceFileName}` : '';
    return `${source}${file} - ${semantics}`;
}

function _moduleOptions(currentModuleId: string): string {
    const ids = MODULE_OPTIONS.includes(currentModuleId)
        ? MODULE_OPTIONS
        : MODULE_OPTIONS.concat(currentModuleId).filter(Boolean);
    return ids.map((moduleId) =>
        `<option value="${_esc(moduleId)}"${moduleId === currentModuleId ? ' selected' : ''}>${_esc(_moduleLabel(moduleId))}</option>`,
    ).join('');
}

/**
 * Opcoes de "Condicao" do conector montadas com as DECISOES reais do processo.
 * O protocolo exige que conditionRef aponte para um gate existente
 * (connector.conditionRef.unresolved), entao digitar o id a mao — o campo de
 * texto antigo — so conseguia produzir vinculo quebrado: a tela aceitava em
 * verde e o pack ficava inexportavel.
 */
function _connectorConditionOptions(
    gates: ReadonlyArray<{ nodeId: string; label: string; question?: string }>,
    currentValue: string,
): string {
    // O preset repete rotulo E pergunta entre decisoes (ex. 15 decisoes, 9
    // rotulos): sem desempate o usuario escolheria as cegas. Numera as
    // repetidas em vez de expor o id cru.
    const seen = new Map<string, number>();
    const known: Array<readonly [string, string]> = gates.map((gate) => {
        const question = String(gate.question || '').trim();
        const base = question && question !== gate.label ? `${gate.label} - ${question}` : gate.label;
        const repeats = (seen.get(base) || 0) + 1;
        seen.set(base, repeats);
        return [gate.nodeId, repeats > 1 ? `${base} (${repeats})` : base] as const;
    });
    const rows: Array<readonly [string, string]> = [['', 'Sem condicao'] as const, ...known];
    // Valor legado fora do catalogo continua visivel para o usuario poder trocar.
    if (currentValue && !known.some(([value]) => value === currentValue)) {
        rows.push([currentValue, `${currentValue} (nao vinculada)`] as const);
    }
    return rows.map(([value, label]) =>
        `<option value="${_esc(value)}"${value === currentValue ? ' selected' : ''}>${_esc(label)}</option>`,
    ).join('');
}

function _connectorOptions(options: ReadonlyArray<readonly [string, string]>, currentValue: string): string {
    const values = options.map(([value]) => value);
    const rows = values.includes(currentValue) || !currentValue
        ? options
        : options.concat([[currentValue, currentValue]] as const);
    return rows.map(([value, label]) =>
        `<option value="${_esc(value)}"${value === currentValue ? ' selected' : ''}>${_esc(label)}</option>`,
    ).join('');
}

function _connectorRefsText(values: string[]): string {
    return values.join(', ');
}

function _technicalParameterApplicabilityLabel(applicability: DomainTechnicalParameterApplicability): string {
    if (applicability === 'required') return 'Obrigatorio';
    if (applicability === 'optional') return 'Opcional';
    return 'Nao se aplica neste dominio';
}

function _technicalParameterStatusLabel(status: PipelinePackTechnicalParameterStatus): string {
    const normalized = _text(status).toLowerCase();
    if (normalized === 'filled') return 'Preenchido';
    if (normalized === 'review') return 'Revisar';
    if (normalized === 'not-applicable') return 'Nao aplicavel';
    if (normalized === 'empty') return 'A preencher';
    return _text(status) || 'A preencher';
}

function _technicalParameterStatusOptions(currentStatus: PipelinePackTechnicalParameterStatus): string {
    const current = _text(currentStatus) || 'empty';
    const values = TECHNICAL_PARAMETER_STATUS_OPTIONS.map(([value]) => value);
    const rows: Array<readonly [string, string]> = [...TECHNICAL_PARAMETER_STATUS_OPTIONS];
    if (!values.includes(current as typeof values[number])) {
        rows.push([current, _technicalParameterStatusLabel(current)] as const);
    }
    return rows.map(([value, label]) =>
        `<option value="${_esc(value)}"${value === current ? ' selected' : ''}>${_esc(label)}</option>`,
    ).join('');
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _pidBridgeDiagramFromPack(pack: PipelinePack): unknown {
    const targetsByNodeId = new Map(
        pack.moduleTargets
            .filter((target) => _text(target.ownerNodeId))
            .map((target) => [target.ownerNodeId || '', target]),
    );
    return {
        elements: pack.graph.nodes.map((node) => {
            const target = targetsByNodeId.get(node.id);
            return {
                ...node,
                props: {
                    ..._asRecord(node.moduleInputParams),
                    ..._asRecord(target?.targetParams),
                },
            };
        }),
        connections: pack.graph.edges.map((edge) => ({
            ...edge,
            fromId: edge.source,
            toId: edge.target,
        })),
    };
}

function _pidTwinStatusLabel(status: PipelinePidDigitalTwinBinding['status']): string {
    if (status === 'linked') return 'Ligado';
    if (status === 'missing-ifc') return 'Falta BIM/IFC';
    if (status === 'missing-twin') return 'Falta digital twin';
    if (status === 'candidate') return 'Candidato';
    return 'Revisar';
}

function _pidTwinFunctionalClassLabel(value: PipelinePidDigitalTwinBinding['functionalClass']): string {
    if (value === 'equipment') return 'Equipamento';
    if (value === 'instrumentation') return 'Instrumentacao';
    if (value === 'piping') return 'Linha ou tubulacao';
    if (value === 'valve') return 'Valvula';
    if (value === 'connection') return 'Conexao';
    if (value === 'asset') return 'Ativo';
    return 'Ativo';
}

function _pidTwinIfcLabel(binding: PipelinePidDigitalTwinBinding): string {
    if (binding.ifcGlobalId) return `IFC GlobalId ${binding.ifcGlobalId}`;
    if (binding.ifcElementId) return `IFC elemento ${binding.ifcElementId}`;
    return `${binding.ifcEntity || 'IfcAsset'} sugerido`;
}

function _pidTwinTwinLabel(binding: PipelinePidDigitalTwinBinding): string {
    if (binding.digitalTwinId) return `Digital twin ${binding.digitalTwinId}`;
    if (binding.twinElementId) return `Elemento twin ${binding.twinElementId}`;
    return 'Digital twin nao vinculado';
}

function _buildPidDigitalTwinRows(
    summary: PipelinePidDigitalTwinBridgeSummary,
    maxRows: number,
): PipelinePackWorkbenchPidTwinRow[] {
    return summary.bindings.slice(0, maxRows).map((binding) => ({
        id: binding.id,
        pidTag: binding.pidTag || binding.assetTag || binding.pidElementId || 'Tag sem nome',
        pidElementType: binding.pidElementType || 'Ponto do P&ID',
        functionalClass: _pidTwinFunctionalClassLabel(binding.functionalClass),
        status: binding.status,
        statusLabel: _pidTwinStatusLabel(binding.status),
        ifcLabel: _pidTwinIfcLabel(binding),
        twinLabel: _pidTwinTwinLabel(binding),
        bimLabel: binding.bimSystem || binding.bimSpatialPath || binding.ifcEntity || 'Sistema BIM nao informado',
        recommendation: _friendlyText(binding.recommendations[0] || binding.reason || 'Revisar vinculos deste ativo.'),
    }));
}

function _readParameterStatus(value: unknown, fallback: PipelinePackTechnicalParameterStatus): PipelinePackTechnicalParameterStatus {
    const status = _text(value).toLowerCase();
    if (!status) return fallback;
    if (status === 'pending') return 'empty';
    if (status === 'done' || status === 'complete' || status === 'completed') return 'filled';
    if (status === 'needs-review' || status === 'needs_review') return 'review';
    if (status === 'na' || status === 'n/a') return 'not-applicable';
    return status;
}

function _parameterStorageMaps(target: PipelineModuleTarget | null | undefined): Record<string, unknown>[] {
    const params = _asRecord(target?.targetParams);
    return [
        _asRecord(params.domainTechnicalParameters),
        _asRecord(params.technicalParameters),
        _asRecord(params.domainParameters),
    ];
}

function _projectDataBindingFromRecord(value: unknown): PipelineProjectDataBinding | null {
    const record = _asRecord(value);
    const parameterId = _text(record.parameterId);
    if (!parameterId) return null;
    return record as unknown as PipelineProjectDataBinding;
}

function _projectDataBindingsFromTarget(target: PipelineModuleTarget | null | undefined): PipelineProjectDataBinding[] {
    const params = _asRecord(target?.targetParams);
    const direct = Array.isArray(target?.projectDataBindings) ? target.projectDataBindings : [];
    const fromParams = Array.isArray(params.projectDataBindings)
        ? params.projectDataBindings.map(_projectDataBindingFromRecord).filter((item): item is PipelineProjectDataBinding => !!item)
        : [];
    return direct.concat(fromParams);
}

function _projectDataForParameter(
    target: PipelineModuleTarget | null | undefined,
    parameterId: string,
): PipelineProjectDataBinding | null {
    return _projectDataBindingsFromTarget(target).find((binding) => _text(binding.parameterId) === parameterId) || null;
}

function _defaultTechnicalParameterStatus(parameter: DomainTechnicalParameter): PipelinePackTechnicalParameterStatus {
    return parameter.applicability === 'not-applicable' ? 'not-applicable' : 'empty';
}

function _technicalParameterStateFromTarget(
    target: PipelineModuleTarget | null | undefined,
    parameter: DomainTechnicalParameter,
): {
    found: boolean;
    value: string;
    source: string;
    unit: string;
    basis: string;
    observationRef: string;
    observationLabel: string;
    status: PipelinePackTechnicalParameterStatus;
} {
    const fallbackStatus = _defaultTechnicalParameterStatus(parameter);
    for (const map of _parameterStorageMaps(target)) {
        const raw = map[parameter.id];
        if (raw === undefined) continue;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const record = raw as Record<string, unknown>;
            const value = _text(record.value ?? record.valor ?? record.text);
            return {
                found: true,
                value,
                source: _text(record.source ?? record.fonte ?? record.evidence ?? record.evidencia),
                unit: _text(record.unit ?? record.unidade),
                basis: _text(record.basis ?? record.base ?? record.period),
                observationRef: _text(record.observationRef ?? record.observationId),
                observationLabel: _text(record.observationLabel ?? record.observationName),
                status: _readParameterStatus(record.status ?? record.state ?? record.situacao, value ? 'filled' : fallbackStatus),
            };
        }
        const value = _text(raw);
        return {
            found: true,
            value,
            source: '',
            unit: '',
            basis: '',
            observationRef: '',
            observationLabel: '',
            status: value ? 'filled' : fallbackStatus,
        };
    }
    const projectData = _projectDataForParameter(target, parameter.id);
    if (projectData) {
        const value = _text(projectData.value);
        return {
            found: true,
            value,
            source: _text(projectData.source),
            unit: _text(projectData.unit),
            basis: _text(projectData.basis),
            observationRef: _text(projectData.observationLink?.observationId),
            observationLabel: _text(projectData.observationLink?.label),
            status: _readParameterStatus(projectData.status, value ? 'filled' : fallbackStatus),
        };
    }
    return {
        found: false,
        value: '',
        source: '',
        unit: '',
        basis: '',
        observationRef: '',
        observationLabel: '',
        status: fallbackStatus,
    };
}

function _technicalParameterStorageTarget(pack: PipelinePack, parameter: DomainTechnicalParameter): PipelineModuleTarget | null {
    return pack.moduleTargets.find((target) => _technicalParameterStateFromTarget(target, parameter).found)
        || pack.moduleTargets[0]
        || null;
}

function _buildTechnicalParameterRows(
    pack: PipelinePack,
    catalog: PipelineDomainTechnicalParameterCatalogSummary,
): PipelinePackWorkbenchTechnicalParameterRow[] {
    const parameters = catalog.required.concat(catalog.optional, catalog.notApplicable);
    return parameters.map((parameter) => {
        const target = _technicalParameterStorageTarget(pack, parameter);
        const state = _technicalParameterStateFromTarget(target, parameter);
        return {
            parameterId: parameter.id,
            label: _friendlyText(parameter.label),
            description: _friendlyText(parameter.description),
            group: parameter.group,
            groupLabel: TECHNICAL_PARAMETER_GROUP_LABELS[parameter.group] || parameter.group || 'Parametro',
            applicability: parameter.applicability,
            applicabilityLabel: _technicalParameterApplicabilityLabel(parameter.applicability),
            valueKind: parameter.valueKind,
            userPrompt: _friendlyText(parameter.userPrompt || parameter.description),
            examples: parameter.examples ? parameter.examples.map(_friendlyText) : [],
            value: state.value,
            source: state.source,
            unit: state.unit,
            basis: state.basis,
            observationRef: state.observationRef,
            observationLabel: state.observationLabel,
            status: state.status,
            statusLabel: _technicalParameterStatusLabel(state.status),
            targetId: target?.id || '',
            nodeId: target?.ownerNodeId || '',
            canSave: Boolean(target),
        };
    });
}

export function updatePipelinePackTechnicalParameter(
    input: unknown,
    patch: PipelinePackTechnicalParameterPatch,
): PipelinePack {
    const pack = normalizePipelinePack(input);
    const parameterId = _text(patch.parameterId);
    if (!parameterId) return pack;
    const target = pack.moduleTargets.find((item) =>
        (!!patch.targetId && item.id === patch.targetId) || (!!patch.nodeId && item.ownerNodeId === patch.nodeId),
    ) || pack.moduleTargets[0] || null;
    if (!target) return pack;
    const targetParams = _asRecord(target.targetParams);
    const currentParameters = _asRecord(targetParams.domainTechnicalParameters);
    const currentEntry = _asRecord(currentParameters[parameterId]);
    const currentProjectData = _projectDataForParameter(target, parameterId);
    const value = _text(patch.value ?? currentEntry.value ?? currentProjectData?.value);
    const source = _text(patch.source ?? currentEntry.source ?? currentProjectData?.source);
    const unit = _text(patch.unit ?? currentEntry.unit ?? currentProjectData?.unit);
    const basis = _text(patch.basis ?? currentEntry.basis ?? currentProjectData?.basis);
    const observationRef = _text(patch.observationRef
        ?? currentEntry.observationRef
        ?? currentProjectData?.observationLink?.observationId);
    const observationLabel = _text(patch.observationLabel
        ?? currentEntry.observationLabel
        ?? currentProjectData?.observationLink?.label);
    const valueKind = _text(patch.valueKind ?? currentEntry.valueKind ?? currentProjectData?.valueKind);
    const projectDataLabel = _text(patch.projectDataLabel ?? currentEntry.label ?? currentProjectData?.label ?? parameterId);
    const status = _readParameterStatus(patch.status ?? currentEntry.status, value ? 'filled' : 'empty');
    const observationLink = observationRef
        ? {
            observationId: observationRef,
            ...(observationLabel ? { label: observationLabel } : {}),
            sourceModuleId: 'observations',
            status: 'linked',
        }
        : currentProjectData?.observationLink;
    const projectDataBinding: PipelineProjectDataBinding = {
        id: _text(currentProjectData?.id) || `project-data-${target.id}-${parameterId}`.replace(/[^a-z0-9_.-]+/gi, '-'),
        parameterId,
        label: projectDataLabel,
        value,
        ...(unit ? { unit } : {}),
        ...(basis ? { basis } : {}),
        ...(valueKind ? { valueKind } : {}),
        ...(source ? { source } : {}),
        status,
        ...(observationLink ? { observationLink } : {}),
    };
    const nextProjectDataBindings = _projectDataBindingsFromTarget(target)
        .filter((binding) => _text(binding.parameterId) !== parameterId)
        .concat(projectDataBinding);
    const nextParameters = {
        ...currentParameters,
        [parameterId]: {
            value,
            status,
            source,
            ...(unit ? { unit } : {}),
            ...(basis ? { basis } : {}),
            ...(valueKind ? { valueKind } : {}),
            ...(observationRef ? { observationRef } : {}),
            ...(observationLabel ? { observationLabel } : {}),
        },
    };
    return normalizePipelinePack({
        ...pack,
        moduleTargets: pack.moduleTargets.map((item) => item.id === target.id
            ? {
                ...item,
                targetParams: {
                    ...targetParams,
                    domainTechnicalParameters: nextParameters,
                    projectDataBindings: nextProjectDataBindings,
                },
                projectDataBindings: nextProjectDataBindings,
            }
            : item),
    });
}

function _firstTargetNodeId(pack: PipelinePack): string {
    return (
        pack.moduleTargets.find((target) => _text(target.ownerNodeId))?.ownerNodeId ||
        pack.graph.startNodeIds.find(Boolean) ||
        pack.graph.nodes[0]?.id ||
        ''
    );
}

function _selectedNodeId(pack: PipelinePack, options: PipelinePackWorkbenchOptions): string {
    const requested = _text(options.selectedNodeId);
    if (requested && pack.graph.nodes.some((node) => node.id === requested)) return requested;
    return _firstTargetNodeId(pack);
}

function _firstConnectorId(pack: PipelinePack, selectedNodeId: string): string {
    const connected = selectedNodeId
        ? pack.graph.edges.find((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
        : null;
    return connected?.id || pack.graph.edges[0]?.id || '';
}

function _selectedConnectorId(pack: PipelinePack, options: PipelinePackWorkbenchOptions, selectedNodeId: string): string {
    const requested = _text(options.selectedConnectorId);
    if (requested && pack.graph.edges.some((edge) => edge.id === requested)) return requested;
    return _firstConnectorId(pack, selectedNodeId);
}

function _buildConnectorRows(pack: PipelinePack, selectedConnectorId: string, limit: number): PipelinePackWorkbenchConnectorRow[] {
    const visibleIds = pack.graph.edges
        .map((edge) => edge.id)
        .filter(Boolean);
    const selectedFirst = selectedConnectorId && visibleIds.includes(selectedConnectorId)
        ? [selectedConnectorId]
        : [];
    return _uniqueTextValues(selectedFirst.concat(visibleIds))
        .slice(0, limit)
        .map((connectorId) => inspectPipelinePackConnector(pack, connectorId))
        .map((info) => ({
            connectorId: info.connectorId,
            label: info.label,
            detail: `${info.source.label} -> ${info.target.label}`,
            kind: info.kind,
            direction: info.direction,
            required: info.required,
            pendingLabel: info.pending[0] || 'Nenhuma pendencia critica para este conector.',
            selected: info.connectorId === selectedConnectorId,
        }));
}

function _targetForNode(pack: PipelinePack, nodeId: string): PipelinePack['moduleTargets'][number] | null {
    return pack.moduleTargets.find((target) => target.ownerNodeId === nodeId) || pack.moduleTargets[0] || null;
}

function _visualAuditInput(pack: PipelinePack, options: PipelinePackWorkbenchOptions): unknown {
    if (options.visualAuditResult) return options.visualAuditResult;
    return {
        foregroundScore: pack.audit.foregroundVisual,
        threshold: pack.validationProfile.visualForegroundMin,
        focus: 'foreground',
        quadrantGrid: pack.validationProfile.quadrantPolicy?.grid,
    };
}

function _visualAuditProcessingState(
    visualAudit: PipelinePackVisualAuditSummary,
    processing: boolean | undefined,
): PipelinePackWorkbenchViewModel['visualAuditProcessingState'] {
    if (processing) return 'processing';
    if (visualAudit.status === 'approved') return 'ready';
    if (visualAudit.status === 'failed') return 'failed';
    return 'missing-data';
}

function _visualAuditProcessingLabel(state: PipelinePackWorkbenchViewModel['visualAuditProcessingState']): string {
    if (state === 'processing') return 'Processando comparacao visual';
    if (state === 'ready') return 'Comparacao visual pronta';
    if (state === 'failed') return 'Comparacao visual precisa de ajuste';
    return 'Comparacao visual aguardando execucao';
}

function _buildSummaryButtons(rows: PipelinePackWorkbenchTargetRow[]): PipelinePackWorkbenchSummaryButton[] {
    return rows.slice(0, 4).map((row, index) => ({
        id: row.targetId || row.nodeId || `summary-${index + 1}`,
        label: row.nodeLabel,
        detail: `${_moduleLabel(row.moduleId)} - ${row.statusLabel}`,
        nodeId: row.nodeId || '',
        moduleId: row.moduleId,
    }));
}

function _buildAssetManifest(pack: PipelinePack): PipelinePackAssetManifest {
    const assets: PipelinePackAssetLike[] = pack.assets.map((asset) => ({
        assetId: asset.id,
        label: asset.label,
        kind: asset.kind,
        status: asset.status,
        required: true,
        ...(asset.fileName ? { fileName: asset.fileName } : {}),
        ...(asset.storagePath ? { storagePath: asset.storagePath } : {}),
        ...(asset.bucket ? { bucket: asset.bucket } : {}),
        ...(asset.checksum ? { checksum: asset.checksum } : {}),
        ...(typeof asset.sizeBytes === 'number' ? { sizeBytes: asset.sizeBytes } : {}),
        ...(asset.linkedNodeIds?.length ? { linkedNodeIds: asset.linkedNodeIds } : {}),
    }));
    return buildPipelinePackAssetManifest(assets, {
        packId: pack.id,
        fileNamePrefix: 'pipeline-pack',
    });
}

function _assetRowsFromManifest(manifest: PipelinePackAssetManifest, limit: number): PipelinePackWorkbenchAssetRow[] {
    return manifest.items.slice(0, limit).map((asset) => ({
        id: asset.assetId,
        label: asset.label,
        fileName: asset.originalFileName || asset.finalFileName || asset.label,
        status: asset.status === 'local' ? 'local' : asset.status,
        statusLabel: _assetStatusLabel(asset.status === 'local' ? 'local' : asset.status),
        validationStatus: asset.validationStatus,
        storageLabel: asset.storagePath || asset.plannedStoragePath || 'Sem local nos arquivos',
        pendingCodes: [...asset.validationCodes],
    }));
}

function _buildTrainingPlan(pack: PipelinePack, selectedNodeId: string): PipelineTrainingOpenPlan {
    const target = _targetForNode(pack, selectedNodeId);
    const params = target?.targetParams || {};
    return buildPipelineTrainingOpenPlan({
        packId: pack.id,
        presetId: _text(params.presetId) || pack.id,
        templateId: _text(params.templateId) || pack.id,
        nodeId: target?.ownerNodeId || selectedNodeId,
        slideTitle: pack.title,
    });
}

function _buildLibrary(pack: PipelinePack, summary: PipelinePackSummary): ReturnType<typeof buildPipelinePackLibraryViewModel> {
    return buildPipelinePackLibraryViewModel([
        {
            pack,
            metadata: {
                origin: 'mine',
                score: summary.score,
                updatedAt: pack.audit.generatedAt,
            },
        },
    ], {
        selectedPackId: pack.id,
        maxPendingLabels: 2,
    });
}

function _buildUserMessage(pack: PipelinePack, summary: PipelinePackSummary, assetManifest: PipelinePackAssetManifest): PipelinePackUserMessage {
    const firstBlockedAsset = assetManifest.items.find((asset) => asset.validationStatus === 'blocked');
    if (firstBlockedAsset) {
        return buildPipelinePackUserMessage('missing-asset', {
            processTitle: pack.title,
            assetLabel: firstBlockedAsset.label,
        });
    }
    if (summary.stats.unresolvedTargets > 0) {
        return buildPipelinePackUserMessage('incomplete-depara', {
            processTitle: pack.title,
            missingCount: summary.stats.unresolvedTargets,
        });
    }
    return buildPipelinePackUserMessage('ready', { processTitle: pack.title });
}

function _testsAreGreen(options: PipelinePackWorkbenchOptions): boolean {
    if (typeof options.focusedTestsPass === 'boolean') return options.focusedTestsPass;
    const passed = Number(options.testsPassed);
    const total = Number(options.testsTotal);
    return Number.isFinite(passed) && Number.isFinite(total) && total > 0 && passed === total;
}

function _uniqueTextValues(values: unknown[]): string[] {
    return Array.from(new Set(values.map(_text).filter(Boolean)));
}

function _countedFilterOptions(values: string[]): PipelinePackWorkbenchBaseDd038FilterOption[] {
    const counts = new Map<string, number>();
    for (const value of values) {
        const label = _text(value);
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item',
        label,
        count,
    }));
}

function _baseDd038SectionKindLabel(kind: string): string {
    return BASE_DD038_SECTION_KIND_LABELS[kind] || kind || 'Secao';
}

function _baseDd038EvidenceKindLabel(kind: string): string {
    return BASE_DD038_EVIDENCE_KIND_LABELS[kind] || kind || 'Evidencia';
}

function _baseDd038ResponsibleLabel(role: string): string {
    return BASE_DD038_RESPONSIBLE_LABELS[role] || role || 'Responsavel';
}

function _baseDd038AreaClassLabels(
    areaClassIds: readonly string[],
    profile: GacDd38NormativeProfile,
): string[] {
    const byId = new Map(profile.areaClasses.map((areaClass) => [areaClass.id, areaClass]));
    return areaClassIds.map((areaClassId) => {
        const found = byId.get(areaClassId as GacDd38AreaClass['id']);
        return found ? `${found.id} - ${found.label}` : areaClassId;
    }).filter(Boolean);
}

function _baseDd038ChecklistRows(
    checklistItems: readonly GacDd38ChecklistItem[],
    profile: GacDd38NormativeProfile,
): PipelinePackWorkbenchBaseDd038ChecklistRow[] {
    const sectionsById = new Map(profile.sections.map((section) => [section.id, section]));
    return checklistItems.map((item) => {
        const missingSection = item.sectionIds.some((sectionId) => !sectionsById.has(sectionId));
        const sectionLabels = item.sectionIds.map((sectionId) => sectionsById.get(sectionId)?.title || sectionId);
        return {
            id: item.id,
            label: _friendlyText(item.label),
            requiredLabel: item.required ? 'Obrigatorio' : 'Complementar',
            evidenceLabel: _baseDd038EvidenceKindLabel(item.evidenceKind),
            responsibleLabel: _baseDd038ResponsibleLabel(item.responsibleRole),
            status: missingSection ? 'missing-section' : 'ready',
            statusLabel: missingSection ? 'Revisar secao' : 'Base pronta',
            sectionLabels,
            areaClassLabels: _baseDd038AreaClassLabels(item.relatedAreaClasses, profile),
        };
    });
}

function _baseDd038SectionRows(
    profile: GacDd38NormativeProfile,
    checklistRows: PipelinePackWorkbenchBaseDd038ChecklistRow[],
    phaseLabels: string[],
): PipelinePackWorkbenchBaseDd038SectionRow[] {
    return profile.sections.slice(0, BASE_DD038_MAX_SECTIONS).map((section: GacDd38NormativeSection) => {
        const rows = checklistRows.filter((item) =>
            item.sectionLabels.some((sectionLabel) => sectionLabel === section.title || sectionLabel === section.id),
        );
        const hasEvidence = section.expectedEvidence.length > 0;
        return {
            id: section.id,
            title: _friendlyText(section.title),
            sectionLabel: section.sectionNumber || section.title,
            pageLabel: section.pageStart === section.pageEnd
                ? `pagina ${section.pageStart}`
                : `paginas ${section.pageStart}-${section.pageEnd}`,
            kindLabel: _baseDd038SectionKindLabel(section.kind),
            summary: _friendlyText(section.summaryPt),
            expectedEvidence: section.expectedEvidence.map(_friendlyText),
            checklistRows: rows.slice(0, 3),
            areaClassLabels: _baseDd038AreaClassLabels(section.relatedAreaClasses, profile),
            phaseLabels,
            status: hasEvidence ? 'ready' : 'missing-evidence',
            statusLabel: hasEvidence ? 'Evidencias esperadas definidas' : 'Definir evidencias esperadas',
        };
    });
}

function _baseDd038AppliesToPack(
    pack: PipelinePack,
    conditionalGateSummary: PipelineConditionalGateSummary,
    technicalParameterCatalog: PipelineDomainTechnicalParameterCatalogSummary,
): boolean {
    const text = [
        pack.id,
        pack.title,
        pack.description,
        pack.source.sourceFileName,
        pack.semantics.domain,
        pack.validationProfile.scope,
        conditionalGateSummary.profileId,
        technicalParameterCatalog.profileId,
    ].map((value) => _text(value).toLowerCase()).join(' ');
    return text.includes('gac') || text.includes('dd38') || text.includes('dd-38') || text.includes('dd 038') || text.includes('cetesb');
}

function _unavailableBaseDd038Summary(statusLabel: string): PipelinePackWorkbenchBaseDd038Summary {
    return {
        available: false,
        standardLabel: '',
        summaryLabel: '',
        status: 'unavailable',
        statusLabel,
        decisionStatusLabel: 'Sem decisoes DD-038 neste processo.',
        checklistStatusLabel: 'Sem checklist DD-038 neste processo.',
        sectionRows: [],
        checklistRows: [],
        filters: { pendency: [], areaClass: [], phase: [] },
    };
}

function _buildBaseDd038Summary(
    pack: PipelinePack,
    conditionalGateSummary: PipelineConditionalGateSummary,
    technicalParameterCatalog: PipelineDomainTechnicalParameterCatalogSummary,
    dodStatus: PipelinePackDodStatus,
    enabled: boolean = true,
): PipelinePackWorkbenchBaseDd038Summary {
    // Rollback hatch GAC_DD38_NORMATIVE_COVERAGE (spec §11): flag desligada →
    // painel degrada para indisponivel sem tocar o resto do Workbench.
    if (enabled === false) {
        return _unavailableBaseDd038Summary('Base DD-038 desativada nesta versao.');
    }
    if (!_baseDd038AppliesToPack(pack, conditionalGateSummary, technicalParameterCatalog)) {
        return _unavailableBaseDd038Summary('Base DD-038 nao aplicada neste processo.');
    }

    const profile = buildGacDd38NormativeProfile();
    const coverage = summarizeGacDd38NormativeProfile(profile);
    const phaseValues = pack.graph.nodes.map((node) => _text(node.phase)).filter(Boolean);
    const phaseLabels = _uniqueTextValues(phaseValues).slice(0, 8);
    const checklistRows = _baseDd038ChecklistRows(profile.checklistItems, profile);
    const gatePendingCount = conditionalGateSummary.unmapped
        + conditionalGateSummary.needsBranches
        + conditionalGateSummary.needsInputs;
    const status: PipelinePackWorkbenchBaseDd038Summary['status'] =
        coverage.status === 'profile-ready' && gatePendingCount === 0 && dodStatus.blocked.length === 0
            ? 'ready'
            : 'pending';
    const pendency = [
        ...(coverage.missingCriticalSectionIds.length
            ? [{
                id: 'secoes',
                label: 'Secoes da base a revisar',
                count: coverage.missingCriticalSectionIds.length,
            }]
            : []),
        ...(gatePendingCount
            ? [{
                id: 'decisoes',
                label: 'Decisoes com pendencia',
                count: gatePendingCount,
            }]
            : []),
        ...(dodStatus.blocked.length
            ? [{
                id: 'checklist',
                label: 'Checklist final pendente',
                count: dodStatus.blocked.length,
            }]
            : []),
    ];
    const areaClass = profile.areaClasses.map((areaClass) => ({
        id: areaClass.id,
        label: `${areaClass.id} - ${areaClass.label}`,
        count: profile.sections.filter((section) => section.relatedAreaClasses.includes(areaClass.id)).length,
    }));

    return {
        available: true,
        standardLabel: coverage.title,
        summaryLabel: `${coverage.mappedCriticalSectionCount}/${coverage.criticalSectionCount} secoes criticas mapeadas; ${coverage.checklistItemCount} itens de checklist.`,
        status,
        statusLabel: status === 'ready' ? 'Base pronta' : 'Base pronta para uso; revisar pendencias abertas',
        decisionStatusLabel: conditionalGateSummary.total
            ? `${conditionalGateSummary.ready}/${conditionalGateSummary.total} decisoes prontas; ${gatePendingCount} pendente(s).`
            : 'Nenhuma decisao DD-038 encontrada no processo.',
        checklistStatusLabel: `${dodStatus.done}/${dodStatus.total} itens do checklist final concluidos.`,
        sectionRows: _baseDd038SectionRows(profile, checklistRows, phaseLabels),
        checklistRows: checklistRows.slice(0, BASE_DD038_MAX_CHECKLIST),
        filters: {
            pendency: pendency.length ? pendency : [{ id: 'sem-pendencia', label: 'Sem pendencia da base', count: 0 }],
            areaClass,
            phase: _countedFilterOptions(phaseValues).slice(0, 8),
        },
    };
}

type PipelinePackWorkbenchReportView = Omit<PipelinePackWorkbenchViewModel, 'reportMarkdown'>;

function _buildWorkbenchReportMarkdown(vm: PipelinePackWorkbenchReportView): string {
    const modules = vm.moduleRows.map((row) => `${row.label}: ${row.count}`);
    const targets = vm.targetRows.map((row) => `${row.nodeLabel} -> ${_moduleLabel(row.moduleId)} (${row.statusLabel})`);
    const assets = vm.assetRows.map((row) => `${row.label}: ${row.statusLabel} - ${row.storageLabel}`);
    const technicalParameters = vm.technicalParameterRows.map((row) =>
        `${row.label}: ${row.applicabilityLabel}; ${row.statusLabel}; valor ${row.value || 'nao informado'}; unidade ${row.unit || 'nao informada'}; base ${row.basis || 'nao informada'}; fonte ${row.source || 'nao informada'}; observacao ${row.observationLabel || row.observationRef || 'nao vinculada'}`,
    );
    const pidTwinRows = vm.pidDigitalTwinRows.map((row) =>
        `${row.pidTag}: ${row.statusLabel}; ${row.functionalClass}; ${row.ifcLabel}; ${row.twinLabel}; ${row.recommendation}`,
    );
    const dod = vm.dodStatus.items.map((item) => `${item.done ? 'OK' : 'Pendente'} - ${item.label} ${item.evidence}`);
    const qualityBlockers = vm.quality.blockers.length ? vm.quality.blockers : ['Nenhum bloqueio de qualidade registrado.'];
    const visualTasks = vm.visualAudit.tasks.length ? vm.visualAudit.tasks : ['Nenhum ajuste visual pendente no resumo atual.'];
    const gateRows = vm.conditionalGateSummary.gates.map((gate) =>
        `${gate.label}: ${gate.statusLabel} - ${gate.nextAction}`,
    );
    const baseDd038Sections = vm.baseDd038.sectionRows.map((row) =>
        `${row.sectionLabel}: ${row.summary}; evidencias esperadas: ${row.expectedEvidence.join(', ') || 'nao informadas'}`,
    );
    const baseDd038Checklist = vm.baseDd038.checklistRows.map((row) =>
        `${row.label}: ${row.requiredLabel}; ${row.evidenceLabel}; ${row.statusLabel}`,
    );
    const baseDd038Filters = [
        ...vm.baseDd038.filters.pendency.map((item) => `Pendencia - ${item.label}: ${item.count}`),
        ...vm.baseDd038.filters.areaClass.map((item) => `Classe - ${item.label}: ${item.count}`),
        ...vm.baseDd038.filters.phase.map((item) => `Fase - ${item.label}: ${item.count}`),
    ];

    return [
        `# Relatorio do processo: ${_reportText(vm.title)}`,
        '',
        '## Resumo',
        `- Origem: ${_reportText(vm.sourceLabel)}`,
        `- Nota local: ${_reportText(vm.scoreLabel)}`,
        `- Parecido com o original: ${_reportText(vm.visualLabel)}`,
        `- Pontos: ${vm.summary.stats.nodes}`,
        `- Conectores: ${vm.summary.stats.edges}`,
        `- Raias: ${vm.summary.stats.lanes}`,
        `- Grupos: ${vm.summary.stats.groups}`,
        '',
        '## Areas que abrem',
        _reportList(modules, 'Nenhuma area configurada.'),
        '',
        '## Cliques configurados',
        _reportList(targets, 'Nenhum clique configurado.'),
        '',
        '## Decisoes do processo',
        `- Perfil: ${_reportText(vm.conditionalGateSummary.profileLabel)}`,
        `- Prontas: ${vm.conditionalGateSummary.ready}/${vm.conditionalGateSummary.total}`,
        `- Pendentes: ${vm.conditionalGateSummary.unmapped + vm.conditionalGateSummary.needsBranches + vm.conditionalGateSummary.needsInputs}`,
        _reportList(gateRows, 'Nenhuma decisao condicional encontrada.'),
        ...(vm.baseDd038.available ? [
            '',
            '## Base DD-038',
            `- Norma: ${_reportText(vm.baseDd038.standardLabel)}`,
            `- Resumo: ${_reportText(vm.baseDd038.summaryLabel)}`,
            `- Estado: ${_reportText(vm.baseDd038.statusLabel)}`,
            `- Decisoes: ${_reportText(vm.baseDd038.decisionStatusLabel)}`,
            `- Checklist: ${_reportText(vm.baseDd038.checklistStatusLabel)}`,
            '### Secoes',
            _reportList(baseDd038Sections, 'Nenhuma secao DD-038 disponivel.'),
            '### Checklist da base',
            _reportList(baseDd038Checklist, 'Nenhum item de checklist DD-038 disponivel.'),
            '### Filtros',
            _reportList(baseDd038Filters, 'Nenhum filtro DD-038 disponivel.'),
        ] : []),
        '',
        '## Parametros tecnicos',
        `- Perfil: ${_reportText(vm.technicalParameterCatalog.label)}`,
        `- Obrigatorios: ${vm.technicalParameterCatalog.requiredCount}`,
        `- Opcionais: ${vm.technicalParameterCatalog.optionalCount}`,
        `- Nao se aplicam: ${vm.technicalParameterCatalog.notApplicableCount}`,
        _reportList(technicalParameters, 'Nenhum parametro tecnico catalogado para este dominio.'),
        '',
        '## Ponte P&ID, BIM/IFC e digital twin',
        `- Tags reconhecidas: ${vm.pidDigitalTwinSummary.counts.bindings}`,
        `- Ligadas: ${vm.pidDigitalTwinSummary.counts.linked}`,
        `- Falta BIM/IFC: ${vm.pidDigitalTwinSummary.counts.missingIfc}`,
        `- Falta digital twin: ${vm.pidDigitalTwinSummary.counts.missingTwin}`,
        _reportList(pidTwinRows, 'Nenhuma tag P&ID com ponte BIM/IFC e digital twin encontrada.'),
        '',
        '## Arquivos vinculados',
        _reportList(assets, 'Nenhum arquivo vinculado.'),
        '',
        '## Comparacao visual',
        `- Estado: ${_reportText(vm.visualAuditProcessingLabel)}`,
        `- Resultado: ${_reportText(vm.visualAudit.foregroundStatusLabel)} (${_reportText(vm.visualAudit.foregroundLabel)})`,
        `- Quadrantes: ${_reportText(vm.visualAudit.quadrantGridLabel)} / ${_reportText(vm.visualAudit.subquadrantGridLabel)}`,
        _reportList(visualTasks, 'Nenhum ajuste visual pendente no resumo atual.'),
        '',
        '## Conferencia',
        `- Nota: ${_reportText(vm.quality.scoreLabel)}`,
        `- Testes: ${_reportText(vm.quality.testsLabel)}`,
        `- Proxima acao: ${_reportText(vm.quality.nextAction)}`,
        _reportList(qualityBlockers, 'Nenhum bloqueio de qualidade registrado.'),
        '',
        '## Checklist final',
        `- Feitos: ${vm.dodStatus.done}/${vm.dodStatus.total}`,
        `- Conclusao: ${vm.dodStatus.percent}%`,
        _reportList(dod, 'Nenhum item de checklist registrado.'),
        '',
        '## Pendencias do processo',
        _reportList(vm.pendingRows, 'Nenhuma pendencia critica neste processo.'),
        '',
    ].join('\n');
}

function _visualComparisonItems(vm: PipelinePackWorkbenchViewModel): string {
    const worst = (vm.visualAudit.worstSubquadrants.length ? vm.visualAudit.worstSubquadrants : vm.visualAudit.worstQuadrants).slice(0, 4);
    if (!worst.length) {
        return '<li>Nenhuma parte critica destacada nesta comparacao.</li>';
    }
    return worst.map((item) => `
        <li>
          <span class="pipeline-pack-workbench-color-dot" data-pipeline-pack-audit-color="${_esc(item.color)}"></span>
          <span>${_esc(_friendlyText(item.title))}</span>
          <small>${_esc(_friendlyText(item.description))}</small>
        </li>`).join('');
}

function _visualComparisonLegend(vm: PipelinePackWorkbenchViewModel): string {
    return vm.visualAudit.severityLegend.map((item) => `
        <span class="pipeline-pack-workbench-legend-item">
          <span class="pipeline-pack-workbench-color-dot" data-pipeline-pack-audit-color="${_esc(item.color)}"></span>
          ${_esc(item.label)}
        </span>`).join('');
}

function _baseDd038FilterChips(
    kind: 'pendency' | 'class' | 'phase',
    rows: PipelinePackWorkbenchBaseDd038FilterOption[],
    emptyText: string,
): string {
    if (!rows.length) {
        return `<span class="pipeline-pack-workbench-filter-chip" data-pipeline-pack-base-dd038-filter="${_esc(kind)}" data-pipeline-pack-base-dd038-filter-empty="true">${_esc(emptyText)}</span>`;
    }
    return rows.map((row) => `
        <span class="pipeline-pack-workbench-filter-chip"
              data-pipeline-pack-base-dd038-filter="${_esc(kind)}"
              data-pipeline-pack-base-dd038-filter-id="${_esc(row.id)}"
              data-pipeline-pack-base-dd038-filter-count="${_esc(row.count)}">
          ${_esc(row.label)}${row.count > 0 ? ` (${_esc(row.count)})` : ''}
        </span>`).join('');
}

function _renderBaseDd038WorkbenchHtml(base: PipelinePackWorkbenchBaseDd038Summary): string {
    if (!base.available) return '';
    const filters = `
        <div class="pipeline-pack-workbench-filter-group" data-pipeline-pack-base-dd038-filter-group="pendency">
          <strong>Pendencia</strong>
          <div>${_baseDd038FilterChips('pendency', base.filters.pendency, 'Sem pendencia informada')}</div>
        </div>
        <div class="pipeline-pack-workbench-filter-group" data-pipeline-pack-base-dd038-filter-group="class">
          <strong>Classe</strong>
          <div>${_baseDd038FilterChips('class', base.filters.areaClass, 'Sem classe informada')}</div>
        </div>
        <div class="pipeline-pack-workbench-filter-group" data-pipeline-pack-base-dd038-filter-group="phase">
          <strong>Fase</strong>
          <div>${_baseDd038FilterChips('phase', base.filters.phase, 'Sem fase informada')}</div>
        </div>`;
    const checklistRows = base.checklistRows.length
        ? base.checklistRows.map((row) => `
            <li data-pipeline-pack-base-dd038-checklist-id="${_esc(row.id)}"
                data-pipeline-pack-base-dd038-checklist-status="${_esc(row.status)}"
                data-pipeline-pack-base-dd038-class-labels="${_esc(row.areaClassLabels.join('|'))}">
              <span>${_esc(row.label)}</span>
              <small>${_esc(row.requiredLabel)} - ${_esc(row.evidenceLabel)} - ${_esc(row.responsibleLabel)}</small>
              <small>${_esc(row.statusLabel)}</small>
            </li>`).join('')
        : '<li>Nenhum item da Base DD-038 disponivel.</li>';
    const sectionRows = base.sectionRows.length
        ? base.sectionRows.map((row) => {
            const evidenceRows = row.expectedEvidence.length
                ? row.expectedEvidence.map((item) => `<li>${_esc(item)}</li>`).join('')
                : '<li>Nenhuma evidencia esperada informada.</li>';
            const linkedChecklist = row.checklistRows.length
                ? row.checklistRows.map((item) => `<li>${_esc(item.label)} - ${_esc(item.statusLabel)}</li>`).join('')
                : '<li>Nenhum item especifico desta secao.</li>';
            return `
            <article class="pipeline-pack-workbench-base-section"
                     data-pipeline-pack-base-dd038-section-id="${_esc(row.id)}"
                     data-pipeline-pack-base-dd038-section-status="${_esc(row.status)}"
                     data-pipeline-pack-base-dd038-class-labels="${_esc(row.areaClassLabels.join('|'))}"
                     data-pipeline-pack-base-dd038-phase-labels="${_esc(row.phaseLabels.join('|'))}">
              <div class="pipeline-pack-workbench-base-section-head">
                <span>${_esc(row.title)}</span>
                <strong>${_esc(row.statusLabel)}</strong>
              </div>
              <small data-pipeline-pack-base-dd038-section-label="true">${_esc(row.sectionLabel)} - ${_esc(row.pageLabel)} - ${_esc(row.kindLabel)}</small>
              <p data-pipeline-pack-base-dd038-summary="true">${_esc(row.summary)}</p>
              <div class="pipeline-pack-workbench-base-subblock">
                <strong>Evidencias esperadas</strong>
                <ul data-pipeline-pack-base-dd038-evidence="true">${evidenceRows}</ul>
              </div>
              <div class="pipeline-pack-workbench-base-subblock">
                <strong>Checklist da secao</strong>
                <ul data-pipeline-pack-base-dd038-section-checklist="true">${linkedChecklist}</ul>
              </div>
            </article>`;
        }).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhuma secao da Base DD-038 disponivel.</div>';

    return `
        <section data-pipeline-pack-base-dd038="true"
                 data-pipeline-pack-base-dd038-status="${_esc(base.status)}"
                 data-pipeline-pack-base-dd038-standard="${_esc(base.standardLabel)}">
          <h4>Base DD-038</h4>
          <p class="pipeline-pack-workbench-note" data-pipeline-pack-base-dd038-summary="true">${_esc(base.summaryLabel)}</p>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(base.statusLabel)}</strong><small>Base</small></span>
            <span data-pipeline-pack-base-dd038-decision-status="true"><strong>${_esc(base.decisionStatusLabel)}</strong><small>Decisoes</small></span>
            <span><strong>${_esc(base.checklistStatusLabel)}</strong><small>Checklist</small></span>
          </div>
          <div class="pipeline-pack-workbench-filters" data-pipeline-pack-base-dd038-filters="true">${filters}</div>
          <div class="pipeline-pack-workbench-base-list" data-pipeline-pack-base-dd038-sections="true">${sectionRows}</div>
          <div class="pipeline-pack-workbench-base-subblock" data-pipeline-pack-base-dd038-checklist="true">
            <strong>Checklist Base DD-038</strong>
            <ul>${checklistRows}</ul>
          </div>
        </section>`;
}

export function buildPipelinePackWorkbenchViewModel(
    input: unknown,
    options: PipelinePackWorkbenchOptions = {},
): PipelinePackWorkbenchViewModel {
    const pack = normalizePipelinePack(input);
    const summary = summarizePipelinePack(pack);
    const validation = validatePipelinePack(pack);
    const targetLimit = Math.max(1, Math.floor(Number(options.maxTargets) || 8));
    const assetLimit = Math.max(1, Math.floor(Number(options.maxAssets) || 4));
    const connectorLimit = Math.max(1, Math.floor(Number(options.maxConnectors) || 6));
    const pidTwinLimit = Math.max(1, Math.floor(Number(options.maxPidTwinRows) || 6));
    const deParaRows = extractPipelinePackDeParaRows(pack);
    const targetRows = deParaRows
        .slice(0, targetLimit)
        .map((row, index) => ({
            ...row,
            targetId: pack.moduleTargets[index]?.id || '',
            label: `${row.nodeLabel} abre ${_moduleLabel(row.moduleId)}`,
            statusLabel: _targetStatusLabel(row.status),
            fallbackText: pack.moduleTargets[index]?.fallback?.text || '',
        }));
    const selectedNodeId = _selectedNodeId(pack, options);
    const selectedConnectorId = _selectedConnectorId(pack, options, selectedNodeId);
    const visualOptions = {
        ...(typeof pack.validationProfile.visualForegroundMin === 'number'
            ? { foregroundTarget: pack.validationProfile.visualForegroundMin }
            : {}),
        ...(typeof pack.validationProfile.quadrantPolicy?.reportWorstBlocks === 'number'
            ? { worstBlockCount: pack.validationProfile.quadrantPolicy.reportWorstBlocks }
            : {}),
    };
    const visualAudit = summarizePipelinePackVisualAudit(_visualAuditInput(pack, options), visualOptions);
    const visualAuditProcessingState = _visualAuditProcessingState(visualAudit, options.visualAuditProcessing);
    const visualAuditProcessingLabel = _visualAuditProcessingLabel(visualAuditProcessingState);
    const conditionalGateSummary = summarizePipelineConditionalGates(pack);
    const technicalParameterCatalog = summarizeDomainTechnicalParameterCatalog(pack);
    const technicalParameterRows = _buildTechnicalParameterRows(pack, technicalParameterCatalog);
    const pidDigitalTwinSummary = summarizePipelinePidDigitalTwinBridge(_pidBridgeDiagramFromPack(pack));
    const pidDigitalTwinRows = _buildPidDigitalTwinRows(pidDigitalTwinSummary, pidTwinLimit);
    const assetManifest = _buildAssetManifest(pack);
    const marketplace = preparePipelinePackForMarketplace(pack);
    const library = _buildLibrary(pack, summary);
    const presentation = buildPipelinePackPresentationViewModel({
        pack,
        origin: { kind: 'pipelines' },
        current: {
            processId: pack.id,
            selectedNodeId,
            variantId: pack.variants.find((variant) => variant.mode === 'present')?.id,
        },
    });
    const trainingPlan = _buildTrainingPlan(pack, selectedNodeId);
    const foregroundVisual = visualAudit.foregroundScore ?? pack.audit.foregroundVisual;
    const qualityInput: PipelinePackQualityInput = {
        score: summary.score,
        minScore: pack.validationProfile.minScore,
        minForegroundVisual: visualAudit.foregroundTarget,
        warnings: validation.warnings.length,
        failures: validation.errors.length,
        ...(typeof foregroundVisual === 'number' ? { foregroundVisual } : {}),
        ...(typeof options.testsPassed === 'number' ? { testsPassed: options.testsPassed } : {}),
        ...(typeof options.testsTotal === 'number' ? { testsTotal: options.testsTotal } : {}),
    };
    const quality = summarizePipelinePackQuality(qualityInput);
    const dodEvidence: PipelinePackDodEvidence = {
        userCanImportOrCreate: true,
        hasSummary: summary.whatYouWillFind.length > 0,
        canEditDePara: targetRows.length > 0,
        score: summary.score,
        minScore: pack.validationProfile.minScore,
        minForegroundVisual: visualAudit.foregroundTarget,
        trainingOpensContext: trainingPlan.ok,
        ecbtRoundTrip: Boolean(options.ecbtRoundTrip),
        filesPermissionsReady: assetManifest.ok && assetManifest.counts.local === 0 && assetManifest.counts.pendingValidation === 0,
        noRandomFallback: summary.stats.unresolvedTargets === 0,
        focusedTestsPass: _testsAreGreen(options),
        specLinked: Boolean(options.specLinked),
        ...(typeof foregroundVisual === 'number' ? { foregroundVisual } : {}),
    };
    const dodStatus = evaluatePipelinePackDod(dodEvidence);
    const baseDd038 = _buildBaseDd038Summary(
        pack,
        conditionalGateSummary,
        technicalParameterCatalog,
        dodStatus,
        options.baseDd038Enabled !== false,
    );
    const assetRows = _assetRowsFromManifest(assetManifest, assetLimit);
    const vm: PipelinePackWorkbenchReportView = {
        title: summary.title,
        sourceLabel: _sourceLabel(pack),
        scoreLabel: `${summary.score}/1000`,
        visualLabel: _workbenchVisualLabel(visualAudit.foregroundScore, visualAudit.foregroundTarget) || _visualLabel(pack),
        summary,
        summaryButtons: _buildSummaryButtons(targetRows),
        moduleRows: summary.modules.map((row) => ({
            moduleId: row.moduleId,
            count: row.count,
            label: _moduleLabel(row.moduleId),
        })),
        targetRows,
        assetRows,
        pendingRows: summary.pending,
        inspector: inspectPipelinePackNode(pack, selectedNodeId),
        connectorRows: _buildConnectorRows(pack, selectedConnectorId, connectorLimit),
        connectorInspector: inspectPipelinePackConnector(pack, selectedConnectorId),
        conditionalGateSummary,
        technicalParameterCatalog,
        technicalParameterRows,
        pidDigitalTwinSummary,
        pidDigitalTwinRows,
        baseDd038,
        presentation,
        presentationPrimaryAction: presentation.visibleActions.find((action) => action.kind === 'fullscreen') || null,
        visualAudit,
        visualAuditProcessingState,
        visualAuditProcessingLabel,
        assetManifest,
        marketplace,
        librarySummary: library.summary,
        libraryRecommendation: library.recommendedSelection,
        quality,
        dodStatus,
        trainingPlan,
        userMessage: _buildUserMessage(pack, summary, assetManifest),
    };
    return {
        ...vm,
        reportMarkdown: _buildWorkbenchReportMarkdown(vm),
    };
}

export function renderPipelinePackWorkbenchReportMarkdown(input: unknown, options: PipelinePackWorkbenchOptions = {}): string {
    return buildPipelinePackWorkbenchViewModel(input, options).reportMarkdown;
}

export interface PipelinePackTagCoverageReportOptions {
    /** Label overrides (i18n via t() with pt-BR fallback) for the report. */
    labels?: Partial<PipelineTagCoverageReportLabels>;
}

/**
 * Readable Markdown report of per-tag coverage across the P&ID ->
 * BIM/IFC -> digital twin bridge (spec 10.4): status, origin, evidence
 * and next expected action per tag, plus the pending-tags section.
 */
export function renderPipelinePackTagCoverageReportMarkdown(
    input: unknown,
    options: PipelinePackTagCoverageReportOptions = {},
): string {
    const pack = normalizePipelinePack(input);
    const summary = summarizePipelinePidDigitalTwinBridge(_pidBridgeDiagramFromPack(pack));
    return buildPipelineTagCoverageReport({
        processLabel: pack.title || pack.id,
        bindings: summary.bindings,
        ...(options.labels ? { labels: options.labels } : {}),
    }).markdown;
}

// PIPELINE-UNIFIED-PROTOCOL#9: Plano guiado derivado do protocolo —
// currentStep/nextAction/decisao/auto-fixes, com campos avancados ocultos
// ate que um achado, perfil ou modo auditoria exija.
function _guidedPlanSectionHtml(input: unknown, options: PipelinePackWorkbenchOptions): string {
    const protocol = buildPipelineProtocol(input);
    const validation = validatePipelineProtocol(protocol);
    const plan = deriveGuidedTaskPlan(protocol, validation.issues, { auditMode: options.auditMode === true });
    return renderGuidedTaskPlanHtml(plan);
}

// PIPELINE-UNIFIED-PROTOCOL#12: Painel do item, do conector e da decisao +
// Assistente de dominio — superficies de UI da spec ligadas ao protocolo real
// (fase/raia/natureza/origem/evidencias/pendencias; tipo de fluxo/dado/
// condicao/rota de falha/pontos; pergunta/criterios/rotas; perfil de dominio).
const PROTOCOL_PANEL_SELECTOR_LIMIT = 8;

function _protocolPanelsSectionHtml(
    input: unknown,
    options: PipelinePackWorkbenchOptions,
    vm: PipelinePackWorkbenchViewModel,
): string {
    const protocol = buildPipelineProtocol(input);
    const validation = validatePipelineProtocol(protocol);
    const selectedElementId = options.selectedNodeId || vm.inspector.nodeId || protocol.elements[0]?.id || '';
    const selectedConnectorId = options.selectedConnectorId || vm.connectorInspector.connectorId || protocol.connectors[0]?.id || '';
    const itemPanel = buildProtocolItemPanel(protocol, selectedElementId, {
        issues: validation.issues,
        technicalParameters: vm.technicalParameterRows
            .filter((row) => row.nodeId === selectedElementId)
            .map((row) => ({ label: row.label, statusLabel: row.statusLabel })),
    });
    const connectorPanel = buildProtocolConnectorPanel(protocol, selectedConnectorId, { issues: validation.issues });
    const decisionPanel = buildProtocolDecisionPanel(protocol, protocol.gates[0]?.nodeId || '', { issues: validation.issues });
    const assistant = buildDomainAssistant(protocol);
    const elementButtons = protocol.elements.slice(0, PROTOCOL_PANEL_SELECTOR_LIMIT).map((element) => `
            <button type="button" class="pipeline-protocol-panel-selector"
                    data-pipeline-protocol-select-element="${_esc(element.id)}"
                    data-pipeline-pack-inspect-node="${_esc(element.sourceNodeId || element.id)}"
                    data-pipeline-protocol-selected="${_esc(element.id === itemPanel.elementId ? 'true' : 'false')}">
              <span>${_esc(element.label)}</span>
            </button>`).join('');
    const connectorButtons = protocol.connectors.slice(0, PROTOCOL_PANEL_SELECTOR_LIMIT).map((connector) => `
            <button type="button" class="pipeline-protocol-panel-selector"
                    data-pipeline-protocol-select-connector="${_esc(connector.id)}"
                    data-pipeline-pack-inspect-connector="${_esc(connector.id)}"
                    data-pipeline-protocol-selected="${_esc(connector.id === connectorPanel.connectorId ? 'true' : 'false')}">
              <span>${_esc(connector.label || connector.id)}</span>
            </button>`).join('');
    return `<section class="pipeline-protocol-panels" data-pipeline-protocol-panels="true"
             data-pipeline-protocol-panels-profile="${_esc(protocol.domainProfileId)}">
          <h4>Paineis do protocolo</h4>
          <div class="pipeline-protocol-panel-selectors" role="group" aria-label="Escolher item do processo">${elementButtons}
          </div>
          ${renderProtocolItemPanelHtml(itemPanel)}
          <div class="pipeline-protocol-panel-selectors" role="group" aria-label="Escolher conector do processo">${connectorButtons}
          </div>
          ${renderProtocolConnectorPanelHtml(connectorPanel)}
          ${renderProtocolDecisionPanelHtml(decisionPanel)}
          ${renderDomainAssistantHtml(assistant)}
        </section>`;
}

// PIPELINE-UNIFIED-PROTOCOL#10: Equivalencia visual + estrutural — seis
// dimensoes (visual, quadrantes, elementos, conectores, fases, natureza de
// dados). Visual >= 95% NAO aprova sozinho com lacuna critica estrutural.
function _equivalenceSectionHtml(input: unknown, options: PipelinePackWorkbenchOptions): string {
    const pack = normalizePipelinePack(input);
    const candidate = buildPipelineProtocol(pack);
    const reference = options.protocolEquivalenceReference
        ? buildPipelineProtocol(options.protocolEquivalenceReference)
        : candidate;
    const score = computeProtocolEquivalence({
        visual: _visualAuditInput(pack, options),
        reference,
        candidate,
    });
    return renderProtocolEquivalenceHtml(score);
}

export function renderPipelinePackWorkbenchHtml(input: unknown, options: PipelinePackWorkbenchOptions = {}): string {
    const vm = buildPipelinePackWorkbenchViewModel(input, options);
    const stats = vm.summary.stats;
    const summaryButtons = vm.summaryButtons.length
        ? vm.summaryButtons.map((row) => `
            <button type="button" class="pipeline-pack-workbench-summary-button"
                    data-pipeline-pack-inspect-node="${_esc(row.nodeId)}"
                    data-pipeline-pack-node-id="${_esc(row.nodeId)}"
                    data-pipeline-pack-module-id="${_esc(row.moduleId)}"
                    data-pipeline-pack-keyboard-step="select-node"
                    aria-label="Selecionar ponto ${_esc(row.label)} e revisar abertura em ${_esc(_moduleLabel(row.moduleId))}">
              <span>${_esc(row.label)}</span>
              <small>${_esc(_friendlyText(row.detail))}</small>
            </button>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhum ponto para clicar configurado.</div>';
    const moduleRows = vm.moduleRows.length
        ? vm.moduleRows.map((row) => `
            <div class="pipeline-pack-workbench-row">
              <span>${_esc(row.label)}</span>
              <strong>${_esc(row.count)}</strong>
            </div>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhuma area de abertura configurada.</div>';
    const targetRows = vm.targetRows.length
        ? vm.targetRows.map((row) => `
            <div class="pipeline-pack-workbench-target-card" data-pipeline-pack-target-id="${_esc(row.targetId)}">
              <button type="button" class="pipeline-pack-workbench-target"
                      data-pipeline-pack-node-id="${_esc(row.nodeId || '')}"
                      data-pipeline-pack-module-id="${_esc(row.moduleId)}"
                      data-pipeline-pack-keyboard-step="select-depara"
                      aria-label="Selecionar ponto ${_esc(row.nodeLabel)} para revisar ligacao com ${_esc(_moduleLabel(row.moduleId))}">
                <span>${_esc(row.nodeLabel)}</span>
                <small>${_esc(_moduleLabel(row.moduleId))} - ${_esc(row.statusLabel)}</small>
              </button>
              <button type="button" class="pipeline-pack-workbench-open-target"
                      data-pipeline-pack-open-target="true"
                      data-pipeline-pack-node-id="${_esc(row.nodeId || '')}"
                      data-pipeline-pack-target-id="${_esc(row.targetId)}"
                      data-pipeline-pack-module-id="${_esc(row.moduleId)}"
                      data-pipeline-pack-keyboard-step="open-destination"
                      aria-label="Abrir ${_esc(_moduleLabel(row.moduleId))} para o ponto ${_esc(row.nodeLabel)}">Abrir area</button>
              <details class="pipeline-pack-workbench-editor" data-pipeline-pack-keyboard-step="edit-depara">
                <summary>Editar o que este ponto abre</summary>
                <label>Area do ecbyts
                  <select class="pipeline-pack-workbench-edit-module">${_moduleOptions(row.moduleId)}</select>
                </label>
                <label>Como abrir
                  <input class="pipeline-pack-workbench-edit-adapter" type="text" value="${_esc(row.adapterId)}" />
                </label>
                <label>Plano B
                  <textarea class="pipeline-pack-workbench-edit-fallback" rows="3">${_esc(row.fallbackText)}</textarea>
                </label>
                <button type="button" class="pipeline-pack-workbench-save"
                        data-pipeline-pack-save-target="true"
                        data-pipeline-pack-target-id="${_esc(row.targetId)}"
                        data-pipeline-pack-node-id="${_esc(row.nodeId || '')}"
                        data-pipeline-pack-keyboard-step="apply-depara"
                        aria-label="Aplicar ligacao do ponto ${_esc(row.nodeLabel)} nesta sessao">Aplicar nesta sessao</button>
              </details>
            </div>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhum clique configurado.</div>';
    const assetRows = vm.assetRows.length
        ? vm.assetRows.map((row) => `
            <div class="pipeline-pack-workbench-row">
              <span title="${_esc(row.fileName)}">${_esc(row.label)}</span>
              <small>${_esc(row.statusLabel)} - ${_esc(_friendlyText(row.storageLabel))}</small>
            </div>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhum arquivo vinculado.</div>';
    const pendingRows = vm.pendingRows.length
        ? vm.pendingRows.map((item) => `<li>${_esc(_friendlyText(item))}</li>`).join('')
        : '<li>Nenhuma pendencia critica neste processo.</li>';
    const inspectorPendingRows = vm.inspector.pending.slice(0, 3).map((item) => `<li>${_esc(_friendlyText(item))}</li>`).join('');
    const inspectorAction = _friendlyText(vm.inspector.suggestedActions[0] || 'Selecionar outro ponto do processo.');
    const inspectorSuggestion = vm.inspector.suggestedEquivalentModule && !vm.inspector.equivalentModule.configured
        ? `<div class="pipeline-pack-workbench-row"
                data-pipeline-pack-module-suggestion="${_esc(vm.inspector.suggestedEquivalentModule.moduleId)}"
                data-pipeline-pack-module-suggestion-confidence="${_esc(vm.inspector.suggestedEquivalentModule.confidence)}">
             <span>Sugestao: abrir em ${_esc(vm.inspector.suggestedEquivalentModule.label)}</span>
             <small>${_esc(_friendlyText(vm.inspector.suggestedEquivalentModule.reason))}</small>
           </div>`
        : '';
    const connectorRows = vm.connectorRows.length
        ? vm.connectorRows.map((row) => `
            <button type="button" class="pipeline-pack-workbench-connector"
                    data-pipeline-pack-inspect-connector="${_esc(row.connectorId)}"
                    data-pipeline-pack-connector-id="${_esc(row.connectorId)}"
                    data-pipeline-pack-selected="${_esc(row.selected ? 'true' : 'false')}"
                    data-pipeline-pack-keyboard-step="select-connector"
                    aria-label="Selecionar conector ${_esc(row.label)} para revisar dados, evidencias e rota de falha">
              <span>${_esc(row.label)}</span>
              <small>${_esc(row.detail)}</small>
              <small>${_esc(row.kind)} - ${_esc(row.direction)} - ${_esc(row.required ? 'Obrigatorio' : 'Opcional')}</small>
              <small>${_esc(_friendlyText(row.pendingLabel))}</small>
            </button>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhum conector no processo.</div>';
    const connectorPendingRows = vm.connectorInspector.pending.slice(0, 4)
        .map((item) => `<li>${_esc(_friendlyText(item))}</li>`)
        .join('');
    const connectorAction = _friendlyText(vm.connectorInspector.suggestedActions[0] || 'Selecionar um conector do processo.');
    const connectorEditor = vm.connectorInspector.found
        ? `<div class="pipeline-pack-workbench-editor pipeline-pack-workbench-connector-editor"
                data-pipeline-pack-connector-editor="true">
             <label>Tipo de conector
               <select class="pipeline-pack-workbench-edit-connector-kind">${_connectorOptions(CONNECTOR_KIND_OPTIONS, vm.connectorInspector.kindValue)}</select>
             </label>
             <label>Direcao
               <select class="pipeline-pack-workbench-edit-connector-direction">${_connectorOptions(CONNECTOR_DIRECTION_OPTIONS, vm.connectorInspector.directionValue)}</select>
             </label>
             <label>Obrigatoriedade
               <select class="pipeline-pack-workbench-edit-connector-required">
                 <option value="true"${vm.connectorInspector.required ? ' selected' : ''}>Obrigatorio</option>
                 <option value="false"${!vm.connectorInspector.required ? ' selected' : ''}>Opcional</option>
               </select>
             </label>
             <label>Dados transportados
               <input class="pipeline-pack-workbench-edit-connector-data" type="text" value="${_esc(_connectorRefsText(vm.connectorInspector.dataRefs))}" placeholder="ex: amostra-01, laudo" />
             </label>
             <label>Evidencias vinculadas
               <input class="pipeline-pack-workbench-edit-connector-evidence" type="text" value="${_esc(_connectorRefsText(vm.connectorInspector.evidenceRefs))}" placeholder="ex: evidencia-review" />
             </label>
             <label>Condicao
               <select class="pipeline-pack-workbench-edit-connector-condition">${
                   _connectorConditionOptions(vm.conditionalGateSummary.gates, vm.connectorInspector.conditionRef)
               }</select>
             </label>
             <label>Rota se falhar
               <select class="pipeline-pack-workbench-edit-connector-failure">${_connectorOptions(CONNECTOR_FAILURE_OPTIONS, vm.connectorInspector.failureBehaviorValue)}</select>
             </label>
             <label>Justificativa
               <textarea class="pipeline-pack-workbench-edit-connector-justification" rows="3">${_esc(vm.connectorInspector.semanticJustification)}</textarea>
             </label>
             <button type="button" class="pipeline-pack-workbench-save"
                     data-pipeline-pack-save-connector="true"
                     data-pipeline-pack-connector-id="${_esc(vm.connectorInspector.connectorId)}"
                     data-pipeline-pack-keyboard-step="apply-connector"
                     aria-label="Aplicar campos do conector ${_esc(vm.connectorInspector.label)} nesta sessao">Aplicar conector nesta sessao</button>
           </div>`
        : '<div class="pipeline-pack-workbench-muted">Selecione um conector existente antes de editar dados, evidencias ou rota de falha.</div>';
    const technicalParameterRows = vm.technicalParameterRows.length
        ? vm.technicalParameterRows.map((row) => {
            const examples = row.examples.length
                ? `<small>Exemplos: ${_esc(row.examples.slice(0, 3).join(', '))}</small>`
                : '';
            const saveDisabled = row.canSave ? '' : ' disabled';
            const saveHint = row.canSave
                ? 'Aplicar parametro nesta sessao'
                : 'Crie uma area de abertura antes de aplicar este parametro';
            return `
            <div class="pipeline-pack-workbench-parameter"
                 data-pipeline-pack-domain-parameter-id="${_esc(row.parameterId)}"
                 data-pipeline-pack-domain-parameter-applicability="${_esc(row.applicability)}"
                 data-pipeline-pack-domain-parameter-status="${_esc(row.status)}"
                 data-pipeline-pack-target-id="${_esc(row.targetId)}"
                 data-pipeline-pack-node-id="${_esc(row.nodeId)}">
              <div class="pipeline-pack-workbench-parameter-head">
                <span>${_esc(row.label)}</span>
                <strong data-pipeline-pack-domain-parameter-label="${_esc(row.applicability)}">${_esc(row.applicabilityLabel)}</strong>
              </div>
              <small>${_esc(row.groupLabel)} - ${_esc(row.userPrompt)}</small>
              ${examples}
              <div class="pipeline-pack-workbench-parameter-state">
                <small><b>Status:</b> ${_esc(row.statusLabel)}</small>
                <small><b>Valor:</b> ${_esc(row.value || 'Sem valor informado')}</small>
                <small><b>Unidade:</b> ${_esc(row.unit || 'Sem unidade informada')}</small>
                <small><b>Base:</b> ${_esc(row.basis || 'Sem base informada')}</small>
                <small><b>Fonte:</b> ${_esc(row.source || 'Sem fonte informada')}</small>
                <small><b>Observacao vinculada:</b> ${_esc(row.observationLabel || row.observationRef || 'Sem observacao vinculada')}</small>
              </div>
              <details class="pipeline-pack-workbench-editor" data-pipeline-pack-keyboard-step="edit-domain-parameter" data-pipeline-pack-project-data="true">
                <summary>Editar parametro</summary>
                <label>Valor
                  <input class="pipeline-pack-workbench-edit-parameter-value" type="text" value="${_esc(row.value)}" placeholder="${_esc(row.description)}" />
                </label>
                <label>Unidade
                  <input class="pipeline-pack-workbench-edit-parameter-unit" type="text" value="${_esc(row.unit)}" placeholder="ex: t/h, t/d, m3/t, kWh/t" />
                </label>
                <label>Base de medicao
                  <input class="pipeline-pack-workbench-edit-parameter-basis" type="text" value="${_esc(row.basis)}" placeholder="ex: ROM por turno, concentrado seco, campanha A" />
                </label>
                <label>Observacao vinculada
                  <input class="pipeline-pack-workbench-edit-parameter-observation-ref" type="text" value="${_esc(row.observationRef)}" placeholder="ex: obs-rom-feed-rate" />
                </label>
                <label>Nome da observacao
                  <input class="pipeline-pack-workbench-edit-parameter-observation-label" type="text" value="${_esc(row.observationLabel)}" placeholder="ex: Observacao ROM balanca 01" />
                </label>
                <label>Status
                  <select class="pipeline-pack-workbench-edit-parameter-status">${_technicalParameterStatusOptions(row.status)}</select>
                </label>
                <label>Fonte
                  <input class="pipeline-pack-workbench-edit-parameter-source" type="text" value="${_esc(row.source)}" placeholder="ex: laudo, testwork, DD-38, planilha de planta" />
                </label>
                <button type="button" class="pipeline-pack-workbench-save"
                        data-pipeline-pack-save-parameter="true"
                        data-pipeline-pack-parameter-id="${_esc(row.parameterId)}"
                        data-pipeline-pack-target-id="${_esc(row.targetId)}"
                        data-pipeline-pack-node-id="${_esc(row.nodeId)}"
                        data-pipeline-pack-keyboard-step="apply-domain-parameter"
                        aria-label="${_esc(saveHint)}"${saveDisabled}>${_esc(saveHint)}</button>
              </details>
            </div>`;
        }).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhum parametro tecnico catalogado para este dominio.</div>';
    const pidDigitalTwinRows = vm.pidDigitalTwinRows.length
        ? vm.pidDigitalTwinRows.map((row) => `
            <div class="pipeline-pack-workbench-pid-twin"
                 data-pipeline-pack-pid-twin-row="${_esc(row.id)}"
                 data-pipeline-pack-pid-twin-status="${_esc(row.status)}">
              <div class="pipeline-pack-workbench-pid-twin-head">
                <span>${_esc(row.pidTag)}</span>
                <strong>${_esc(row.statusLabel)}</strong>
              </div>
              <small>${_esc(row.functionalClass)} - ${_esc(row.pidElementType)}</small>
              <small><b>BIM/IFC:</b> ${_esc(row.ifcLabel)}</small>
              <small><b>Digital twin:</b> ${_esc(row.twinLabel)}</small>
              <small><b>Sistema:</b> ${_esc(row.bimLabel)}</small>
              <small>${_esc(row.recommendation)}</small>
            </div>`).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhuma tag P&ID com ponte BIM/IFC e digital twin encontrada.</div>';
    const gateRows = vm.conditionalGateSummary.gates.length
        ? vm.conditionalGateSummary.gates.slice(0, 5).map((gate) => {
            const missingInputs = gate.requiredInputs.filter((input) => !input.configured).length;
            const detail = gate.pending[0] || gate.nextAction;
            const routeRows = gate.branches.map((branch) => {
                const criteria = branch.criteria.length
                    ? branch.criteria.map((criterionRow) =>
                        `<small data-pipeline-pack-gate-criterion-source="${_esc(criterionRow.source)}">${_esc(_friendlyText(criterionRow.label))}${criterionRow.configured ? '' : ' (pendente)'}</small>`,
                    ).join('')
                    : '<small>Sem criterio configurado.</small>';
                return `
              <div class="pipeline-pack-workbench-gate-route"
                   data-pipeline-pack-gate-route-kind="${_esc(branch.routeKind)}"
                   data-pipeline-pack-gate-condition-ref="${_esc(branch.conditionRef)}"
                   data-pipeline-pack-gate-edge-id="${_esc(branch.edgeId)}">
                <span>${_esc(branch.label)} - ${_esc(_gateRouteKindLabel(branch.routeKind))}</span>
                <small>${_esc(branch.targetLabel)}</small>
                ${criteria}
              </div>`;
            }).join('');
            const notApplicableLabel = gate.nonApplicable.allowed
                ? `${gate.nonApplicable.configured ? 'Configurado' : 'Pendente'}: ${gate.nonApplicable.routeLabels.join(', ') || gate.nonApplicable.label}`
                : 'Nao habilitado';
            return `
            <div class="pipeline-pack-workbench-gate-card"
                 data-pipeline-pack-gate-card="${_esc(gate.nodeId)}"
                 data-pipeline-pack-gate-fallback="${_esc(gate.fallback.configured ? 'configured' : 'missing')}"
                 data-pipeline-pack-gate-not-applicable="${_esc(gate.nonApplicable.configured ? 'configured' : gate.nonApplicable.allowed ? 'pending' : 'disabled')}">
              <button type="button" class="pipeline-pack-workbench-gate"
                      data-pipeline-pack-gate-id="${_esc(gate.templateId)}"
                      data-pipeline-pack-gate-node-id="${_esc(gate.nodeId)}"
                      data-pipeline-pack-gate-status="${_esc(gate.status)}"
                      data-pipeline-pack-inspect-node="${_esc(gate.nodeId)}"
                      data-pipeline-pack-node-id="${_esc(gate.nodeId)}"
                      aria-label="Selecionar decisao ${_esc(gate.label)} para revisar pendencias">
                <span>${_esc(gate.label)}</span>
                <strong>${_esc(_friendlyText(gate.statusLabel))}</strong>
                <small>${_esc(_friendlyText(detail))}</small>
                <small>${_esc(gate.branchCount)} caminho(s), ${_esc(missingInputs)} criterio(s) pendente(s)</small>
              </button>
              <div class="pipeline-pack-workbench-gate-detail" data-pipeline-pack-gate-detail="${_esc(gate.nodeId)}">
                <div class="pipeline-pack-workbench-gate-line" data-pipeline-pack-gate-question="true">
                  <span>Pergunta</span><small>${_esc(gate.question)}</small>
                </div>
                <div class="pipeline-pack-workbench-gate-routes" data-pipeline-pack-gate-routes="true">${routeRows}</div>
                <div class="pipeline-pack-workbench-gate-line" data-pipeline-pack-gate-approval-rule="${_esc(gate.approvalRule.ready ? 'ready' : 'pending')}">
                  <span>Aprovacao/retrabalho</span><small>${_esc(_friendlyText(gate.approvalRule.label))}</small>
                </div>
                <div class="pipeline-pack-workbench-gate-line">
                  <span>Plano B</span><small>${_esc(_friendlyText(gate.fallback.text))}</small>
                </div>
                <div class="pipeline-pack-workbench-gate-line">
                  <span>Nao aplicavel</span><small>${_esc(_friendlyText(notApplicableLabel))}</small>
                </div>
              </div>
            </div>`;
        }).join('')
        : '<div class="pipeline-pack-workbench-muted">Nenhuma decisao condicional encontrada neste processo.</div>';
    const gatePendingCount = vm.conditionalGateSummary.unmapped
        + vm.conditionalGateSummary.needsBranches
        + vm.conditionalGateSummary.needsInputs;
    const clickGoCount = vm.presentation.visibleActions.filter((action) => action.kind === 'click-go').length;
    const presentationAction = vm.presentationPrimaryAction;
    const auditTasks = vm.visualAudit.tasks.length
        ? vm.visualAudit.tasks.slice(0, 3).map((task) => `<li>${_esc(_friendlyText(task.text))}</li>`).join('')
        : '<li>Nenhum ajuste visual pendente no resumo atual.</li>';
    const visualComparisonItems = _visualComparisonItems(vm);
    const visualComparisonLegend = _visualComparisonLegend(vm);
    const dodBlockedRows = vm.dodStatus.blocked.length
        ? vm.dodStatus.blocked.slice(0, 4).map((item) => `<li>${_esc(_friendlyText(item.label))}</li>`).join('')
        : '<li>Checklist final completo para as evidencias informadas.</li>';
    const qualityBlockers = vm.quality.blockers.length
        ? vm.quality.blockers.slice(0, 3).map((item) => `<li>${_esc(_friendlyText(item))}</li>`).join('')
        : '<li>Qualidade local sem bloqueios no resumo atual.</li>';
    const marketplaceLabel = vm.marketplace.publishable
        ? 'Pronto para compartilhar'
        : `${vm.marketplace.blockers.length} pendencia(s) para compartilhar`;
    const libraryRecommendation = vm.libraryRecommendation
        ? `${vm.libraryRecommendation.actionLabel}: ${_friendlyText(vm.libraryRecommendation.reason)}`
        : 'Nenhuma recomendacao de biblioteca.';
    const baseDd038Block = _renderBaseDd038WorkbenchHtml(vm.baseDd038);
    const guidedPlanBlock = _guidedPlanSectionHtml(input, options);
    const equivalenceBlock = _equivalenceSectionHtml(input, options);
    const protocolPanelsBlock = _protocolPanelsSectionHtml(input, options, vm);

    return `
      <style>
        .pipeline-pack-workbench{position:sticky;top:58px;align-self:start;width:min(360px,34vw);max-height:calc(100vh - 96px);overflow:auto;margin:12px 12px 12px 0;padding:14px;border:1px solid #334155;border-radius:8px;background:#101827;color:#dbeafe;font:12px system-ui;box-shadow:0 16px 40px rgba(0,0,0,.28)}
        .pipeline-pack-workbench h3,.pipeline-pack-workbench h4,.pipeline-pack-workbench p{margin:0}
        .pipeline-pack-workbench h3{font-size:15px;line-height:1.25;color:#f8fafc}
        .pipeline-pack-workbench h4{margin:14px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0;color:#93c5fd}
        .pipeline-pack-workbench p,.pipeline-pack-workbench small,.pipeline-pack-workbench-muted{color:#a8b7ca}
        .pipeline-pack-workbench-eyebrow{display:block;margin-bottom:4px;color:#5eead4;font-weight:700;text-transform:uppercase;font-size:10px}
        .pipeline-pack-workbench-score,.pipeline-pack-workbench-stats{display:grid;gap:8px;margin-top:12px}
        .pipeline-pack-workbench-score{grid-template-columns:1fr}
        .pipeline-pack-workbench-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
        .pipeline-pack-workbench-score span,.pipeline-pack-workbench-stats span{display:grid;gap:2px;padding:8px;border:1px solid #1e3a5f;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench strong{color:#f8fafc}
        .pipeline-pack-workbench-actions{margin-top:12px;padding:8px;border:1px solid #273449;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-actions summary{cursor:pointer;font-weight:700;color:#93c5fd}
        .pipeline-pack-workbench-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        .pipeline-pack-workbench-actions-grid button[data-pipeline-pack-export-report]{grid-column:1/-1}
        .pipeline-pack-workbench-actions button{padding:8px;border:1px solid #2563eb;border-radius:6px;background:#0f3c75;color:#dbeafe;font-weight:700;cursor:pointer}
        .pipeline-pack-workbench-actions button:hover{background:#1d4ed8}
        .pipeline-pack-workbench button:focus-visible,.pipeline-pack-workbench summary:focus-visible,.pipeline-pack-workbench input:focus-visible,.pipeline-pack-workbench select:focus-visible,.pipeline-pack-workbench textarea:focus-visible{outline:3px solid #facc15;outline-offset:2px}
        .pipeline-pack-workbench-message{display:grid;gap:2px;margin-top:10px;padding:8px;border:1px solid #38546b;border-radius:6px;background:#132033}
        .pipeline-pack-workbench-message strong{color:#f8fafc}
        .pipeline-pack-workbench-row,.pipeline-pack-workbench-target,.pipeline-pack-workbench-summary-button,.pipeline-pack-workbench-connector{width:100%;display:grid;gap:2px;margin:6px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#162235;color:#dbeafe;text-align:left;overflow-wrap:anywhere}
        .pipeline-pack-workbench-summary-button,.pipeline-pack-workbench-connector{cursor:pointer}
        .pipeline-pack-workbench-summary-button:hover,.pipeline-pack-workbench-connector:hover{border-color:#5eead4;background:#193044}
        .pipeline-pack-workbench-connector[data-pipeline-pack-selected="true"]{border-color:#5eead4;background:#0e2f33}
        .pipeline-pack-workbench-gate-card{display:grid;gap:6px;margin:6px 0;padding:0;border:1px solid #273449;border-radius:6px;background:#101b2b;overflow:hidden}
        .pipeline-pack-workbench-gate{width:100%;display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin:6px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#162235;color:#dbeafe;text-align:left;cursor:pointer;overflow-wrap:anywhere}
        .pipeline-pack-workbench-gate span,.pipeline-pack-workbench-gate small{grid-column:1/-1}
        .pipeline-pack-workbench-gate strong{justify-self:end;font-size:11px}
        .pipeline-pack-workbench-gate:hover{border-color:#5eead4;background:#193044}
        .pipeline-pack-workbench-gate[data-pipeline-pack-gate-status="unmapped"]{border-color:#f97316;background:#22180d}
        .pipeline-pack-workbench-gate[data-pipeline-pack-gate-status="needs-inputs"]{border-color:#eab308;background:#211f0d}
        .pipeline-pack-workbench-gate[data-pipeline-pack-gate-status="needs-branches"]{border-color:#38bdf8;background:#0b2233}
        .pipeline-pack-workbench-gate[data-pipeline-pack-gate-status="ready"]{border-color:#22c55e;background:#0f2418}
        .pipeline-pack-workbench-gate-card .pipeline-pack-workbench-gate{margin:0;border-width:0 0 1px 0;border-radius:0}
        .pipeline-pack-workbench-gate-detail{display:grid;gap:6px;padding:8px}
        .pipeline-pack-workbench-gate-line,.pipeline-pack-workbench-gate-route{display:grid;gap:2px;padding:7px;border:1px solid #273449;border-radius:6px;background:#0b1322;overflow-wrap:anywhere}
        .pipeline-pack-workbench-gate-line span,.pipeline-pack-workbench-gate-route span{font-weight:700;color:#f8fafc}
        .pipeline-pack-workbench-gate-route[data-pipeline-pack-gate-route-kind="approval"]{border-color:#22c55e}
        .pipeline-pack-workbench-gate-route[data-pipeline-pack-gate-route-kind="rework"]{border-color:#f97316}
        .pipeline-pack-workbench-gate-route[data-pipeline-pack-gate-route-kind="not-applicable"]{border-color:#94a3b8}
        .pipeline-pack-workbench-gate-routes{display:grid;gap:6px}
        .pipeline-pack-workbench-filters{display:grid;gap:8px;margin:8px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-filter-group{display:grid;gap:4px}
        .pipeline-pack-workbench-filter-group div{display:flex;flex-wrap:wrap;gap:4px}
        .pipeline-pack-workbench-filter-chip{display:inline-flex;align-items:center;max-width:100%;padding:3px 6px;border:1px solid #334155;border-radius:999px;background:#101b2b;color:#cbd5e1;font-size:10px;overflow-wrap:anywhere}
        .pipeline-pack-workbench-base-list{display:grid;gap:8px}
        .pipeline-pack-workbench-base-section{display:grid;gap:6px;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b;overflow-wrap:anywhere}
        .pipeline-pack-workbench-base-section-head{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start}
        .pipeline-pack-workbench-base-section-head span{font-weight:700;color:#f8fafc}
        .pipeline-pack-workbench-base-section-head strong{padding:2px 6px;border:1px solid #334155;border-radius:999px;background:#0b1322;font-size:10px;white-space:nowrap}
        .pipeline-pack-workbench-base-subblock{display:grid;gap:5px;margin-top:6px;padding:8px;border:1px solid #273449;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-base-subblock li{display:grid;gap:2px;margin-top:4px}
        .pipeline-pack-workbench-parameter{display:grid;gap:6px;margin:6px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b;overflow-wrap:anywhere}
        .pipeline-pack-workbench-parameter-head{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start}
        .pipeline-pack-workbench-parameter-head span{font-weight:700;color:#f8fafc}
        .pipeline-pack-workbench-parameter-head strong{padding:2px 6px;border-radius:999px;border:1px solid #334155;background:#0b1322;font-size:10px;white-space:nowrap}
        .pipeline-pack-workbench-parameter-head strong[data-pipeline-pack-domain-parameter-label="required"]{border-color:#f59e0b;color:#fde68a}
        .pipeline-pack-workbench-parameter-head strong[data-pipeline-pack-domain-parameter-label="optional"]{border-color:#38bdf8;color:#bae6fd}
        .pipeline-pack-workbench-parameter-head strong[data-pipeline-pack-domain-parameter-label="not-applicable"]{border-color:#64748b;color:#cbd5e1}
        .pipeline-pack-workbench-parameter-state{display:grid;gap:3px;padding:6px;border:1px solid #273449;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-pid-twin{display:grid;gap:5px;margin:6px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b;overflow-wrap:anywhere}
        .pipeline-pack-workbench-pid-twin-head{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start}
        .pipeline-pack-workbench-pid-twin-head span{font-weight:700;color:#f8fafc}
        .pipeline-pack-workbench-pid-twin-head strong{padding:2px 6px;border:1px solid #334155;border-radius:999px;background:#0b1322;font-size:10px;white-space:nowrap}
        .pipeline-pack-workbench-pid-twin[data-pipeline-pack-pid-twin-status="linked"]{border-color:#22c55e;background:#0f2418}
        .pipeline-pack-workbench-pid-twin[data-pipeline-pack-pid-twin-status="missing-ifc"],.pipeline-pack-workbench-pid-twin[data-pipeline-pack-pid-twin-status="missing-twin"]{border-color:#eab308;background:#211f0d}
        .pipeline-pack-workbench-pid-twin[data-pipeline-pack-pid-twin-status="needs-review"]{border-color:#f97316;background:#22180d}
        .pipeline-pack-workbench-target-card{margin:6px 0;border:1px solid #273449;border-radius:6px;background:#101b2b}
        .pipeline-pack-workbench-target-card .pipeline-pack-workbench-target{margin:0;border:0;border-radius:6px 6px 0 0;background:#162235}
        .pipeline-pack-workbench-target{cursor:pointer}
        .pipeline-pack-workbench-target:hover{border-color:#38bdf8;background:#1d3048}
        .pipeline-pack-workbench-open-target{width:calc(100% - 16px);margin:8px;padding:7px 8px;border:1px solid #0ea5e9;border-radius:6px;background:#0f3c75;color:#dbeafe;font-weight:700;cursor:pointer}
        .pipeline-pack-workbench-open-target:hover{background:#1d4ed8}
        .pipeline-pack-workbench-editor{padding:8px;border-top:1px solid #273449;color:#cbd5e1}
        .pipeline-pack-workbench-editor summary{cursor:pointer;font-weight:700;color:#93c5fd}
        .pipeline-pack-workbench-editor label{display:grid;gap:4px;margin-top:8px;color:#a8b7ca}
        .pipeline-pack-workbench-editor input,.pipeline-pack-workbench-editor select,.pipeline-pack-workbench-editor textarea{width:100%;box-sizing:border-box;border:1px solid #334155;border-radius:6px;background:#0b1322;color:#e2e8f0;padding:6px;font:12px system-ui}
        .pipeline-pack-workbench-save{width:100%;margin-top:8px;padding:7px 8px;border:1px solid #0ea5e9;border-radius:6px;background:#075985;color:#e0f2fe;font-weight:700;cursor:pointer}
        .pipeline-pack-workbench-save:hover{background:#0369a1}
        .pipeline-pack-workbench-save:disabled{cursor:not-allowed;opacity:.55;background:#334155;border-color:#475569}
        .pipeline-pack-workbench-present{width:100%;padding:8px;border:1px solid #15803d;border-radius:6px;background:#112719;color:#d1fae5;font-weight:700;cursor:pointer}
        .pipeline-pack-workbench-present:hover{background:#14532d}
        .pipeline-pack-workbench-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
        .pipeline-pack-workbench-kpis span{display:grid;gap:2px;padding:8px;border:1px solid #334155;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-note{margin-top:6px;color:#a8b7ca}
        .pipeline-pack-workbench ul{margin:0;padding-left:16px;color:#a8b7ca}
        .pipeline-pack-workbench-visual-compare{display:grid;gap:8px;margin:10px 0;padding:8px;border:1px solid #334155;border-radius:6px;background:#0b1322}
        .pipeline-pack-workbench-visual-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .pipeline-pack-workbench-visual-pane{display:grid;gap:3px;min-width:0;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b}
        .pipeline-pack-workbench-visual-pane strong{font-size:12px}
        .pipeline-pack-workbench-visual-pane small{overflow-wrap:anywhere}
        .pipeline-pack-workbench-legend{display:flex;flex-wrap:wrap;gap:6px;color:#a8b7ca}
        .pipeline-pack-workbench-legend-item{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid #273449;border-radius:999px;background:#101b2b}
        .pipeline-pack-workbench-reference,.pipeline-pack-workbench-entry{display:grid;gap:5px;margin-top:8px;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b}
        .pipeline-pack-workbench-reference button,.pipeline-pack-workbench-entry button{width:100%;padding:7px 8px;border:1px solid #0ea5e9;border-radius:6px;background:#0f3c75;color:#dbeafe;font-weight:700;cursor:pointer}
        .pipeline-pack-workbench-reference button:hover,.pipeline-pack-workbench-entry button:hover{background:#1d4ed8}
        .pipeline-pack-workbench-visual-list{display:grid;gap:6px;padding-left:0!important;list-style:none}
        .pipeline-pack-workbench-visual-list li{display:grid;grid-template-columns:auto 1fr;gap:2px 6px;align-items:start}
        .pipeline-pack-workbench-visual-list small{grid-column:2;color:#94a3b8}
        .pipeline-protocol-panel-row{display:grid;gap:2px;padding:7px;border:1px solid #273449;border-radius:6px;background:#0b1322;margin:4px 0;overflow-wrap:anywhere}
        .pipeline-protocol-panel-row span{font-weight:700;color:#f8fafc}
        .pipeline-protocol-panel-block{display:grid;gap:4px;margin:6px 0;padding:8px;border:1px solid #273449;border-radius:6px;background:#101b2b}
        .pipeline-protocol-panel-block>span{font-weight:700;color:#f8fafc}
        .pipeline-protocol-panel-muted,.pipeline-protocol-panel-note{color:#a8b7ca}
        .pipeline-protocol-panel-ok{color:#86efac}
        .pipeline-protocol-panel-pending li{color:#fca5a5}
        .pipeline-protocol-panel-selectors{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
        .pipeline-protocol-panel-selector{padding:4px 8px;border:1px solid #334155;border-radius:999px;background:#101b2b;color:#cbd5e1;font-size:10px;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
        .pipeline-protocol-panel-selector:hover{border-color:#5eead4}
        .pipeline-protocol-panel-selector[data-pipeline-protocol-selected="true"]{border-color:#5eead4;background:#0e2f33}
        .pipeline-protocol-domain-options{display:grid;gap:6px;margin:8px 0}
        .pipeline-protocol-domain-option{width:100%;padding:8px;border:1px solid #334155;border-radius:6px;background:#162235;color:#dbeafe;font-weight:700;text-align:left;cursor:pointer}
        .pipeline-protocol-domain-option:hover{border-color:#5eead4;background:#193044}
        .pipeline-protocol-domain-option[data-pipeline-protocol-domain-selected="true"]{border-color:#22c55e;background:#0f2418}
        .pipeline-pack-workbench-color-dot{width:10px;height:10px;border-radius:999px;margin-top:3px;background:#facc15;box-shadow:0 0 0 1px rgba(255,255,255,.18)}
        .pipeline-pack-workbench-color-dot[data-pipeline-pack-audit-color="red"]{background:#ef4444}
        .pipeline-pack-workbench-color-dot[data-pipeline-pack-audit-color="purple"]{background:#a855f7}
        .pipeline-pack-workbench-color-dot[data-pipeline-pack-audit-color="blue"]{background:#38bdf8}
        .pipeline-pack-workbench-color-dot[data-pipeline-pack-audit-color="yellow"]{background:#facc15}
        @media (max-width:1100px){.pipeline-pack-workbench{position:relative;top:auto;width:auto;max-height:none;margin:12px}}
      </style>
      <aside class="pipeline-pack-workbench"
             data-pipeline-pack-workbench="true"
             data-pipeline-pack-source-kind="${_esc(vm.summary.sourceKind)}"
             data-pipeline-pack-source-semantics="${_esc(vm.summary.sourceSemantics)}"
             aria-label="Resumo do processo aberto">
        <div class="pipeline-pack-workbench-head">
          <span class="pipeline-pack-workbench-eyebrow">Processo aberto</span>
          <h3>O que voce encontrara neste processo</h3>
          <p>${_esc(vm.sourceLabel)}</p>
        </div>
        <div class="pipeline-pack-workbench-message" data-pipeline-pack-user-message="${_esc(vm.userMessage.state)}">
          <strong>${_esc(vm.userMessage.title)}</strong>
          <small>${_esc(vm.userMessage.body)}</small>
        </div>
        ${guidedPlanBlock}
        ${equivalenceBlock}
        ${protocolPanelsBlock}
        <div class="pipeline-pack-workbench-score">
          <span><strong>${_esc(vm.scoreLabel)}</strong><small>Nota local</small></span>
          <span><strong>${_esc(vm.visualLabel)}</strong><small>Parecido com o original</small></span>
        </div>
        <details class="pipeline-pack-workbench-actions" data-pipeline-pack-advanced-controls="collapsed">
          <summary>Ferramentas de troca</summary>
          <p class="pipeline-pack-workbench-note" data-pipeline-pack-advanced-reason="share-import-export">Use quando precisar compartilhar, importar ou guardar evidencia deste processo.</p>
          <div class="pipeline-pack-workbench-actions-grid">
            <button type="button" data-pipeline-pack-export-key="true" data-pipeline-pack-action-level="secondary">Exportar .ecbt</button>
            <button type="button" data-pipeline-pack-import-key="true" data-pipeline-pack-action-level="secondary">Importar .ecbt</button>
            <button type="button" data-pipeline-pack-import-clipboard="true" data-pipeline-pack-action-level="secondary">Importar chave copiada</button>
            <button type="button" data-pipeline-pack-export-report="true" data-pipeline-pack-action-level="secondary">Salvar relatorio</button>
            <button type="button" data-pipeline-pack-export-tag-report="true" data-pipeline-pack-action-level="secondary">Exportar relatorio de tags</button>
          </div>
        </details>
        <div class="pipeline-pack-workbench-stats">
          <span><strong>${_esc(stats.nodes)}</strong><small>pontos</small></span>
          <span><strong>${_esc(stats.edges)}</strong><small>conectores</small></span>
          <span><strong>${_esc(stats.lanes)}</strong><small>raias</small></span>
          <span><strong>${_esc(stats.groups)}</strong><small>grupos</small></span>
        </div>
        <section>
          <h4>Clique para abrir</h4>
          ${summaryButtons}
        </section>
        <section data-pipeline-pack-gates-summary="true"
                 data-pipeline-pack-gates-profile="${_esc(vm.conditionalGateSummary.profileId)}"
                 data-pipeline-pack-gates-total="${_esc(vm.conditionalGateSummary.total)}"
                 data-pipeline-pack-gates-ready="${_esc(vm.conditionalGateSummary.ready)}"
                 data-pipeline-pack-gates-pending="${_esc(gatePendingCount)}">
          <h4>Decisoes do processo</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(`${vm.conditionalGateSummary.ready}/${vm.conditionalGateSummary.total}`)}</strong><small>prontas</small></span>
            <span><strong>${_esc(gatePendingCount)}</strong><small>pendentes</small></span>
          </div>
          <p class="pipeline-pack-workbench-note">${_esc(vm.conditionalGateSummary.profileLabel)} guia os criterios deste processo.</p>
          ${gateRows}
        </section>
        ${baseDd038Block}
        <section data-pipeline-pack-domain-parameters="true"
                 data-pipeline-pack-domain-profile="${_esc(vm.technicalParameterCatalog.profileId)}"
                 data-pipeline-pack-domain-required="${_esc(vm.technicalParameterCatalog.requiredCount)}"
                 data-pipeline-pack-domain-optional="${_esc(vm.technicalParameterCatalog.optionalCount)}"
                 data-pipeline-pack-domain-not-applicable="${_esc(vm.technicalParameterCatalog.notApplicableCount)}">
          <h4>Parametros tecnicos</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(vm.technicalParameterCatalog.requiredCount)}</strong><small>obrigatorios</small></span>
            <span><strong>${_esc(vm.technicalParameterCatalog.optionalCount)}</strong><small>opcionais</small></span>
            <span><strong>${_esc(vm.technicalParameterCatalog.notApplicableCount)}</strong><small>nao se aplicam</small></span>
          </div>
          <p class="pipeline-pack-workbench-note">${_esc(vm.technicalParameterCatalog.label)} define quais dados precisam ser preenchidos neste dominio.</p>
          ${technicalParameterRows}
        </section>
        <section data-pipeline-pack-pid-twin-summary="true"
                 data-pipeline-pack-pid-twin-total="${_esc(vm.pidDigitalTwinSummary.counts.bindings)}"
                 data-pipeline-pack-pid-twin-linked="${_esc(vm.pidDigitalTwinSummary.counts.linked)}"
                 data-pipeline-pack-pid-twin-missing-ifc="${_esc(vm.pidDigitalTwinSummary.counts.missingIfc)}"
                 data-pipeline-pack-pid-twin-missing-twin="${_esc(vm.pidDigitalTwinSummary.counts.missingTwin)}">
          <h4>Ponte P&ID, BIM/IFC e digital twin</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(`${vm.pidDigitalTwinSummary.counts.linked}/${vm.pidDigitalTwinSummary.counts.bindings}`)}</strong><small>ligadas</small></span>
            <span><strong>${_esc(vm.pidDigitalTwinSummary.counts.missingIfc)}</strong><small>falta BIM/IFC</small></span>
            <span><strong>${_esc(vm.pidDigitalTwinSummary.counts.missingTwin)}</strong><small>falta digital twin</small></span>
          </div>
          <p class="pipeline-pack-workbench-note">Use as tags do P&ID para ligar cada ativo ao modelo BIM/IFC e ao espelho operacional.</p>
          ${pidDigitalTwinRows}
        </section>
        <section data-pipeline-pack-inspector="true"
                 data-pipeline-pack-inspect-node="${_esc(vm.inspector.nodeId)}"
                 data-pipeline-pack-keyboard-step="inspect-node"
                 tabindex="-1">
          <h4>Detalhes do ponto</h4>
          <div class="pipeline-pack-workbench-row">
            <span>${_esc(vm.inspector.friendlyName)}</span>
            <small>${_esc(vm.inspector.type.label)} - ${_esc(vm.inspector.equivalentModule.label)}</small>
          </div>
          <div class="pipeline-pack-workbench-row">
            <span>${_esc(vm.inspector.fallback.label)}</span>
            <small>${_esc(vm.inspector.permission.label)} - ${_esc(vm.inspector.equivalentModule.openModeLabel)}</small>
          </div>
          ${inspectorSuggestion}
          <ul>${inspectorPendingRows}</ul>
          <p class="pipeline-pack-workbench-note">${_esc(inspectorAction)}</p>
        </section>
        <section data-pipeline-pack-connectors-summary="true">
          <h4>Conectores do processo</h4>
          ${connectorRows}
        </section>
        <section data-pipeline-pack-connector-inspector="true"
                 data-pipeline-pack-inspect-connector="${_esc(vm.connectorInspector.connectorId)}"
                 data-pipeline-pack-keyboard-step="inspect-connector"
                 tabindex="-1">
          <h4>Detalhes do conector</h4>
          <div class="pipeline-pack-workbench-row">
            <span>${_esc(vm.connectorInspector.label)}</span>
            <small>${_esc(vm.connectorInspector.source.label)} -> ${_esc(vm.connectorInspector.target.label)}</small>
          </div>
          <div class="pipeline-pack-workbench-row">
            <span>${_esc(vm.connectorInspector.kind)} - ${_esc(vm.connectorInspector.direction)}</span>
            <small>${_esc(vm.connectorInspector.required ? 'Obrigatorio' : 'Opcional')} - ${_esc(vm.connectorInspector.failureBehavior)}</small>
          </div>
          ${connectorEditor}
          <ul>${connectorPendingRows}</ul>
          <p class="pipeline-pack-workbench-note">${_esc(connectorAction)}</p>
        </section>
        <section>
          <h4>Apresentar</h4>
          <button type="button" class="pipeline-pack-workbench-present"
                  data-pipeline-pack-present="true"
                  data-pipeline-pack-action-level="primary"
                  data-pipeline-pack-keyboard-step="present"
                  data-pipeline-pack-action-id="${_esc(presentationAction?.id || 'enter-fullscreen')}"
                  data-pipeline-pack-command-type="${_esc(presentationAction?.command.type || 'fullscreen.request')}">
            ${_esc(presentationAction?.label || 'Apresentar')}
          </button>
          <p class="pipeline-pack-workbench-note">${_esc(clickGoCount)} cliques de apresentacao aprovados, ${_esc(vm.presentation.hiddenControlIds.length)} configuracoes avancadas escondidas.</p>
          <p class="pipeline-pack-workbench-note">${_esc(vm.trainingPlan.userMessage)}</p>
        </section>
        <section data-pipeline-pack-audit-summary="true"
                 data-pipeline-pack-audit-status="${_esc(vm.visualAudit.status)}"
                 data-pipeline-pack-audit-processing-state="${_esc(vm.visualAuditProcessingState)}"
                 aria-busy="${_esc(vm.visualAuditProcessingState === 'processing' ? 'true' : 'false')}"
                 data-pipeline-pack-foreground-score="${_esc(vm.visualAudit.foregroundScore ?? '')}">
          <h4>Comparar com o original</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(vm.visualAudit.foregroundStatusLabel)}</strong><small>${_esc(_friendlyText(vm.visualAudit.foregroundLabel))}</small></span>
            <span><strong>${_esc(vm.visualAudit.quadrantGridLabel)}</strong><small>partes avaliadas</small></span>
            <span><strong>${_esc(vm.visualAudit.subquadrantGridLabel)}</strong><small>detalhe final</small></span>
          </div>
          <div class="pipeline-pack-workbench-visual-compare" data-pipeline-pack-visual-comparison="true">
            <div class="pipeline-pack-workbench-visual-pair">
              <div class="pipeline-pack-workbench-visual-pane" data-pipeline-pack-visual-side="original">
                <strong>Original</strong>
                <small>${_esc(vm.sourceLabel)}</small>
              </div>
              <div class="pipeline-pack-workbench-visual-pane" data-pipeline-pack-visual-side="ecbyts">
                <strong>No ecbyts</strong>
                <small>${_esc(_friendlyText(`${vm.visualAudit.foregroundStatusLabel} - ${vm.visualAudit.foregroundLabel}`))}</small>
              </div>
            </div>
            <div class="pipeline-pack-workbench-legend" aria-label="Legenda da comparacao visual">${visualComparisonLegend}</div>
            <ul class="pipeline-pack-workbench-visual-list">${visualComparisonItems}</ul>
            <div class="pipeline-pack-workbench-reference" data-pipeline-pack-reference-panel="true">
              <button type="button" data-pipeline-pack-reference-upload="true">Carregar referencia visual</button>
              <small data-pipeline-pack-reference-status="empty">Use imagem ou PDF do desenho original para comparar sem depender de captura solta.</small>
            </div>
          </div>
          <p class="pipeline-pack-workbench-note">${_esc(vm.visualAuditProcessingLabel)}</p>
          <ul>${auditTasks}</ul>
        </section>
        <section>
          <h4>O que cada clique abre</h4>
          ${moduleRows}
        </section>
        <section>
          <h4>Cliques configurados</h4>
          ${targetRows}
        </section>
        <section data-pipeline-pack-assets-summary="true"
                 data-pipeline-pack-assets-total="${_esc(vm.assetManifest.counts.total)}"
                 data-pipeline-pack-assets-blocked="${_esc(vm.assetManifest.counts.blocked)}">
          <h4>Arquivos vinculados</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(vm.assetManifest.counts.total)}</strong><small>vinculados</small></span>
            <span><strong>${_esc(vm.assetManifest.counts.blocked)}</strong><small>bloqueados</small></span>
          </div>
          ${assetRows}
          <p class="pipeline-pack-workbench-note">${_esc(marketplaceLabel)}</p>
        </section>
        <section data-pipeline-pack-library-summary="true"
                 data-pipeline-pack-library-entry="my-processes"
                 data-pipeline-pack-library-total="${_esc(vm.librarySummary.total)}"
                 data-pipeline-pack-library-ready="${_esc(vm.librarySummary.ready)}"
                 aria-label="Meus processos">
          <h4>Meus processos</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(vm.librarySummary.total)}</strong><small>processos</small></span>
            <span><strong>${_esc(vm.librarySummary.needsReview + vm.librarySummary.blocked)}</strong><small>pendencias</small></span>
          </div>
          <p class="pipeline-pack-workbench-note">${_esc(libraryRecommendation)}</p>
          <div class="pipeline-pack-workbench-entry">
            <button type="button" data-pipeline-pack-open-library="my-processes">Ver meus processos</button>
            <small>Entrada para encontrar processos criados, recebidos ou modelos antes de abrir o desenho.</small>
          </div>
        </section>
        <section>
          <h4>Conferencia</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(vm.quality.scoreLabel)}</strong><small>nota</small></span>
            <span><strong>${_esc(vm.quality.testsLabel)}</strong><small>testes</small></span>
          </div>
          <p class="pipeline-pack-workbench-note">${_esc(vm.quality.nextAction)}</p>
          <ul>${qualityBlockers}</ul>
        </section>
        <section data-pipeline-pack-dod-summary="true"
                 data-pipeline-pack-dod-done="${_esc(vm.dodStatus.done)}"
                 data-pipeline-pack-dod-total="${_esc(vm.dodStatus.total)}">
          <h4>Checklist final</h4>
          <div class="pipeline-pack-workbench-kpis">
            <span><strong>${_esc(`${vm.dodStatus.done}/${vm.dodStatus.total}`)}</strong><small>itens feitos</small></span>
            <span><strong>${_esc(`${vm.dodStatus.percent}%`)}</strong><small>conclusao</small></span>
          </div>
          <ul>${dodBlockedRows}</ul>
        </section>
        <section>
          <h4>Pendencias do processo</h4>
          <ul>${pendingRows}</ul>
        </section>
      </aside>`;
}
