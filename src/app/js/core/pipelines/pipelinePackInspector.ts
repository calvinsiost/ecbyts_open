// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK INSPECTOR - pure node summary for Workbench panels.

   The helpers below return UI-ready, HTML-safe PT-BR labels without touching
   DOM, storage or the pipeline editor runtime.
   ================================================================ */

import {
    normalizePipelinePack,
    validatePipelinePack,
    type PipelineConnectorDirection,
    type PipelineConnectorFailureBehavior,
    type PipelineModuleTarget,
    type PipelinePack,
    type PipelinePackEdge,
    type PipelinePackIssue,
    type PipelinePackNode,
    type PipelinePackOpenMode,
    type PipelinePackPermission,
    type PipelineSemanticEntry,
    type PipelineTargetFallback,
} from './pipelinePack.js';
import { suggestPipelineDomainModules } from './pipelineDomainProfile.js';
import { buildPipelineProtocol, validatePipelineProtocol, type PipelineProtocolConnector } from './pipelineProtocol.js';

export interface PipelinePackInspectorTypeInfo {
    id: string;
    label: string;
}

export interface PipelinePackInspectorModuleInfo {
    configured: boolean;
    targetId: string;
    moduleId: string;
    adapterId: string;
    label: string;
    openMode: PipelinePackOpenMode | 'none';
    openModeLabel: string;
}

export interface PipelinePackEquivalentModuleSuggestion {
    moduleId: string;
    adapterId: string;
    label: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    openMode: PipelinePackOpenMode;
}

export interface PipelinePackInspectorFallbackInfo {
    required: boolean;
    configured: boolean;
    type: PipelineTargetFallback['type'];
    label: string;
    text: string;
    assetId: string;
}

export interface PipelinePackInspectorPermissionInfo {
    required: PipelinePackPermission;
    label: string;
    allowedInPack: boolean;
}

export interface PipelinePackNodeInspection {
    nodeId: string;
    safeNodeId: string;
    found: boolean;
    friendlyName: string;
    type: PipelinePackInspectorTypeInfo;
    meaning: string;
    equivalentModule: PipelinePackInspectorModuleInfo;
    fallback: PipelinePackInspectorFallbackInfo;
    permission: PipelinePackInspectorPermissionInfo;
    suggestedEquivalentModule: PipelinePackEquivalentModuleSuggestion | null;
    pending: string[];
    suggestedActions: string[];
}

export interface PipelinePackConnectorEndpointInfo {
    id: string;
    label: string;
    found: boolean;
}

export interface PipelinePackConnectorInspection {
    connectorId: string;
    safeConnectorId: string;
    found: boolean;
    label: string;
    kindValue: string;
    kind: string;
    directionValue: string;
    direction: string;
    required: boolean;
    conditionRef: string;
    source: PipelinePackConnectorEndpointInfo;
    target: PipelinePackConnectorEndpointInfo;
    dataRefs: string[];
    evidenceRefs: string[];
    failureBehaviorValue: string;
    failureBehavior: string;
    semanticJustification: string;
    pointCount: number;
    pending: string[];
    suggestedActions: string[];
}

export interface PipelinePackConnectorMetadataPatch {
    connectorId: string;
    kind?: PipelinePackEdge['kind'] | string;
    direction?: PipelineConnectorDirection | string;
    required?: boolean;
    conditionRef?: string;
    dataRefs?: string[] | string;
    evidenceRefs?: string[] | string;
    failureBehavior?: PipelineConnectorFailureBehavior | string;
    semanticJustification?: string;
}

const MODULE_LABELS: Record<string, string> = {
    datastudio: 'Data Studio',
    files: 'Files',
    gantt: 'Cronograma',
    'model-3d': 'Modelo 3D',
    model: 'Modelo',
    pipelines: 'Pipelines/GAC',
    reports: 'Relatorios',
    'temporal-analysis': 'Mann-Kendall',
    training: 'Training',
};

const NODE_TYPE_LABELS: Record<string, string> = {
    action: 'Atividade',
    data: 'Dado',
    data_store: 'Deposito de dados',
    'data-store': 'Deposito de dados',
    datastore: 'Deposito de dados',
    decision: 'Decisao',
    end: 'Fim',
    end_event: 'Fim',
    event: 'Evento',
    gateway: 'Decisao',
    group: 'Grupo',
    lane: 'Raia',
    start: 'Inicio',
    start_event: 'Inicio',
    task: 'Atividade',
    trigger: 'Inicio',
};

const OPEN_MODE_LABELS: Record<PipelinePackOpenMode | 'none', string> = {
    fullscreen: 'Abrir em tela cheia',
    inline: 'Abrir dentro do processo',
    none: 'Sem abertura configurada',
    'open-live': 'Abrir modulo vivo',
    'side-panel': 'Abrir em painel lateral',
    'snapshot-only': 'Mostrar apenas snapshot',
};

const PERMISSION_LABELS: Record<PipelinePackPermission, string> = {
    edit: 'Edicao',
    owner: 'Proprietario',
    student: 'Aluno',
    teacher: 'Professor',
    view: 'Leitura',
};

const CONNECTOR_KIND_LABELS: Record<string, string> = {
    'control-flow': 'Fluxo de controle',
    custom: 'Fluxo customizado',
    'data-association': 'Associacao de dados',
    reference: 'Referencia',
};

const CONNECTOR_DIRECTION_LABELS: Record<string, string> = {
    backward: 'Retorno',
    bidirectional: 'Ida e volta',
    forward: 'Avanco',
    undirected: 'Sem direcao operacional',
};

const CONNECTOR_FAILURE_LABELS: Record<string, string> = {
    block: 'Bloquear ate corrigir',
    'human-decision': 'Pedir decisao humana',
    rework: 'Voltar para retrabalho',
    skip: 'Pular com justificativa',
    warn: 'Avisar e permitir seguir',
};

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

export function escapePipelinePackInspectorText(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _safe(value: unknown): string {
    return escapePipelinePackInspectorText(value);
}

function _unique(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => _nonEmpty(value))));
}

function _stringList(value: unknown): string[] {
    if (Array.isArray(value)) return _unique(value.map(_nonEmpty));
    return _unique(String(value ?? '').split(/[,;\n\r]+/).map(_nonEmpty));
}

function _connectorKindValue(value: unknown, fallback: PipelinePackEdge['kind']): PipelinePackEdge['kind'] {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'data' || raw === 'data-association') return 'data-association';
    if (raw === 'reference') return 'reference';
    if (raw === 'custom') return 'custom';
    if (raw === 'control-flow') return 'control-flow';
    return fallback;
}

function _connectorDirectionValue(value: unknown): PipelineConnectorDirection | '' {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'forward' || raw === 'backward' || raw === 'bidirectional' || raw === 'undirected') {
        return raw as PipelineConnectorDirection;
    }
    return '';
}

function _connectorFailureValue(value: unknown): PipelineConnectorFailureBehavior | '' {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'block' || raw === 'warn' || raw === 'skip' || raw === 'rework' || raw === 'human-decision') {
        return raw as PipelineConnectorFailureBehavior;
    }
    return '';
}

export function suggestPipelinePackEquivalentModules(
    node: PipelinePackNode,
    semantic?: PipelineSemanticEntry | null,
    domainProfileId?: string,
): PipelinePackEquivalentModuleSuggestion[] {
    return suggestPipelineDomainModules(node, domainProfileId, semantic || null)
        .map((suggestion) => ({
            moduleId: suggestion.moduleId,
            adapterId: suggestion.adapterId,
            label: _safe(suggestion.label),
            confidence: suggestion.confidence,
            reason: _safe(suggestion.reason),
            openMode: suggestion.openMode,
        }));
}

function _moduleLabel(moduleId: string): string {
    return MODULE_LABELS[moduleId] || moduleId || 'Modulo nao configurado';
}

function _typeLabel(type: string): string {
    const normalized = _nonEmpty(type).toLowerCase();
    return NODE_TYPE_LABELS[normalized] || type || 'No';
}

function _targetForNode(pack: PipelinePack, nodeId: string): PipelineModuleTarget | null {
    return pack.moduleTargets.find((target) => target.ownerNodeId === nodeId) || null;
}

function _semanticForNode(pack: PipelinePack, nodeId: string): PipelineSemanticEntry | null {
    return pack.semantics.entries.find((entry) => entry.nodeId === nodeId) || null;
}

function _issuesForNode(issues: PipelinePackIssue[], nodeId: string, targetId: string): PipelinePackIssue[] {
    return issues.filter((issue) => issue.nodeId === nodeId || (targetId && issue.targetId === targetId));
}

function _buildModuleInfo(target: PipelineModuleTarget | null): PipelinePackInspectorModuleInfo {
    if (!target) {
        return {
            configured: false,
            targetId: '',
            moduleId: '',
            adapterId: '',
            label: 'Modulo equivalente nao configurado',
            openMode: 'none',
            openModeLabel: OPEN_MODE_LABELS.none,
        };
    }
    return {
        configured: Boolean(target.moduleId && target.adapterId),
        targetId: _safe(target.id),
        moduleId: _safe(target.moduleId),
        adapterId: _safe(target.adapterId),
        label: _safe(_moduleLabel(target.moduleId)),
        openMode: target.openMode,
        openModeLabel: _safe(OPEN_MODE_LABELS[target.openMode] || target.openMode),
    };
}

function _buildFallbackInfo(pack: PipelinePack, target: PipelineModuleTarget | null): PipelinePackInspectorFallbackInfo {
    if (!target) {
        return {
            required: false,
            configured: false,
            type: 'none',
            label: 'Sem fallback configurado',
            text: 'Nenhum modulo equivalente foi configurado para este no.',
            assetId: '',
        };
    }

    const required = target.openMode !== 'snapshot-only';
    const configured = !required || target.fallback.type !== 'none';
    if (target.fallback.type === 'message') {
        return {
            required,
            configured,
            type: 'message',
            label: configured ? 'Mensagem de fallback' : 'Fallback obrigatorio ausente',
            text: _safe(target.fallback.text || 'Mostrar mensagem de fallback antes de sair do processo.'),
            assetId: '',
        };
    }
    if (target.fallback.type === 'snapshot') {
        const asset = target.fallback.assetId
            ? pack.assets.find((item) => item.id === target.fallback.assetId)
            : null;
        return {
            required,
            configured,
            type: 'snapshot',
            label: _safe(asset ? `Snapshot: ${asset.label}` : 'Snapshot de fallback'),
            text: _safe(target.fallback.text || 'Mostrar snapshot quando o modulo vivo nao abrir.'),
            assetId: _safe(target.fallback.assetId || ''),
        };
    }
    return {
        required,
        configured,
        type: 'none',
        label: required ? 'Fallback obrigatorio ausente' : 'Fallback opcional',
        text: required ? 'Defina uma mensagem ou snapshot para evitar fallback silencioso.' : 'Este destino usa apenas snapshot.',
        assetId: '',
    };
}

function _buildPermissionInfo(pack: PipelinePack, target: PipelineModuleTarget | null): PipelinePackInspectorPermissionInfo {
    const required = target?.requiredPermission || pack.permissions.defaultPermission || 'view';
    const allowedRoles = pack.permissions.allowedRoles;
    return {
        required,
        label: _safe(PERMISSION_LABELS[required] || required),
        allowedInPack: allowedRoles.length === 0 || allowedRoles.includes(required),
    };
}

function _targetHasParams(target: PipelineModuleTarget): boolean {
    return Object.keys(target.targetParams || {}).length > 0;
}

function _buildFoundInspection(pack: PipelinePack, node: PipelinePackNode): PipelinePackNodeInspection {
    const target = _targetForNode(pack, node.id);
    const semantic = _semanticForNode(pack, node.id);
    const suggestedEquivalentModule = suggestPipelinePackEquivalentModules(node, semantic, pack.semantics.domain)[0] || null;
    const validation = validatePipelinePack(pack);
    const moduleInfo = _buildModuleInfo(target);
    const fallbackInfo = _buildFallbackInfo(pack, target);
    const permissionInfo = _buildPermissionInfo(pack, target);
    const friendlyName = _nonEmpty(node.contextLabel)
        || _nonEmpty(semantic?.label)
        || _nonEmpty(target?.label)
        || _nonEmpty(node.label)
        || node.id;
    const meaning = _nonEmpty(semantic?.meaning)
        || _nonEmpty(node.semanticRole)
        || _nonEmpty(semantic?.label)
        || '';
    const pending: string[] = [];
    const suggestedActions: string[] = [];

    if (!meaning) {
        pending.push('Significado do no ainda nao documentado.');
        suggestedActions.push('Documentar o significado em linguagem de processo antes de apresentar.');
    }
    if (!target) {
        pending.push('Modulo equivalente ainda nao foi configurado para este no.');
        if (suggestedEquivalentModule) {
            suggestedActions.push(`Sugestao: mapear este no para ${suggestedEquivalentModule.label}.`);
        } else {
            suggestedActions.push('Mapear este no para Files, Data Studio, Gantt, Training ou outro modulo equivalente.');
        }
        suggestedActions.push('Definir fallback antes de publicar ou apresentar o pack.');
    } else {
        if (!target.moduleId || !target.adapterId) {
            pending.push('Destino de modulo incompleto.');
            suggestedActions.push('Preencher modulo e adaptador do click-go.');
        }
        if (target.openMode !== 'snapshot-only' && !_targetHasParams(target)) {
            pending.push('Destino vivo nao declara parametros de abertura.');
            suggestedActions.push(`Preencher parametros para abrir ${_safe(_moduleLabel(target.moduleId))} no contexto certo.`);
        }
        if (fallbackInfo.required && !fallbackInfo.configured) {
            pending.push('Fallback obrigatorio ausente para este click-go.');
            suggestedActions.push('Definir uma mensagem ou snapshot de fallback para este click-go.');
        } else {
            suggestedActions.push(`Testar abertura de ${_safe(_moduleLabel(target.moduleId))} a partir do inspector.`);
        }
    }
    if (!permissionInfo.allowedInPack) {
        pending.push(`Permissao ${permissionInfo.label} nao aparece nas permissoes do pack.`);
        suggestedActions.push(`Adicionar ${permissionInfo.label} as permissoes permitidas ou ajustar o destino.`);
    }

    const issueMessages = _issuesForNode(
        validation.errors.concat(validation.warnings),
        node.id,
        target?.id || '',
    ).map((issue) => _safe(issue.message));
    pending.push(...issueMessages);

    if (pending.length === 0) {
        pending.push('Nenhuma pendencia critica para este no.');
        suggestedActions.push('Manter este de-para como pronto e validar no modo apresentacao.');
    }

    return {
        nodeId: node.id,
        safeNodeId: _safe(node.id),
        found: true,
        friendlyName: _safe(friendlyName),
        type: {
            id: _safe(node.type),
            label: _safe(_typeLabel(node.type)),
        },
        meaning: meaning ? _safe(meaning) : 'Significado ainda nao documentado.',
        equivalentModule: moduleInfo,
        fallback: fallbackInfo,
        permission: permissionInfo,
        suggestedEquivalentModule,
        pending: _unique(pending),
        suggestedActions: _unique(suggestedActions),
    };
}

function _buildMissingInspection(pack: PipelinePack, nodeId: string): PipelinePackNodeInspection {
    const permissionInfo = _buildPermissionInfo(pack, null);
    const safeNodeId = _safe(nodeId);
    return {
        nodeId,
        safeNodeId,
        found: false,
        friendlyName: `No nao encontrado: ${safeNodeId}`,
        type: {
            id: 'missing',
            label: 'No inexistente',
        },
        meaning: 'Nao ha significado porque o no nao existe no pack atual.',
        equivalentModule: _buildModuleInfo(null),
        fallback: _buildFallbackInfo(pack, null),
        permission: permissionInfo,
        suggestedEquivalentModule: null,
        pending: [`Nao encontrei o no ${safeNodeId} no grafo deste Pipeline Pack.`],
        suggestedActions: [
            'Conferir o nodeId recebido pelo canvas ou pelo sumario clicavel.',
            'Selecionar um no existente antes de editar modulo equivalente, fallback ou permissao.',
        ],
    };
}

function _connectorEndpoint(pack: PipelinePack, nodeId: string): PipelinePackConnectorEndpointInfo {
    const node = pack.graph.nodes.find((item) => item.id === nodeId);
    return {
        id: _safe(nodeId),
        label: _safe(node?.contextLabel || node?.label || nodeId || 'Nao informado'),
        found: Boolean(node),
    };
}

function _connectorLabel(connector: PipelineProtocolConnector): string {
    return _safe(connector.label || `${connector.sourceId} -> ${connector.targetId}`);
}

function _connectorIssues(pack: PipelinePack, connectorId: string): string[] {
    return validatePipelineProtocol(buildPipelineProtocol(pack)).issues
        .filter((issue) => issue.targetId === connectorId || issue.ownerItemId === connectorId)
        .map((issue) => _safe(issue.userMessage || issue.message));
}

function _buildConnectorInspection(pack: PipelinePack, connector: PipelineProtocolConnector): PipelinePackConnectorInspection {
    const pending: string[] = [];
    const suggestedActions: string[] = [];
    const issues = _connectorIssues(pack, connector.id);

    if (connector.required && !connector.semanticJustification && connector.dataRefs.length === 0 && connector.evidenceRefs.length === 0) {
        pending.push('Conector obrigatorio ainda nao explica dado, evidencia ou justificativa.');
        suggestedActions.push('Informar o que este conector transporta ou por que ele e obrigatorio.');
    }
    if (connector.conditionRef && !pack.graph.nodes.some((node) => node.id === connector.conditionRef)) {
        pending.push('Condicao vinculada nao foi encontrada no processo.');
        suggestedActions.push('Selecionar uma decisao existente ou remover a condicao do conector.');
    }
    if (connector.kind === 'data-association' && connector.dataRefs.length === 0 && !connector.dataNatureId) {
        pending.push('Associacao de dados sem dado ou natureza de dados vinculada.');
        suggestedActions.push('Vincular o dado transportado ou escolher a natureza do dado.');
    }
    if (connector.points.length === 0) {
        suggestedActions.push('Se a fonte original tiver layout, preservar pontos visuais do conector.');
    }

    pending.push(...issues);
    if (pending.length === 0) {
        pending.push('Nenhuma pendencia critica para este conector.');
        suggestedActions.push('Manter o conector como pronto e validar no modo auditoria.');
    }

    return {
        connectorId: connector.id,
        safeConnectorId: _safe(connector.id),
        found: true,
        label: _connectorLabel(connector),
        kindValue: connector.kind,
        kind: _safe(CONNECTOR_KIND_LABELS[connector.kind] || connector.kind),
        directionValue: connector.direction,
        direction: _safe(CONNECTOR_DIRECTION_LABELS[connector.direction] || connector.direction),
        required: connector.required,
        conditionRef: _safe(connector.conditionRef || ''),
        source: _connectorEndpoint(pack, connector.sourceId),
        target: _connectorEndpoint(pack, connector.targetId),
        dataRefs: connector.dataRefs.map(_safe),
        evidenceRefs: connector.evidenceRefs.map(_safe),
        failureBehaviorValue: connector.failureBehavior,
        failureBehavior: _safe(CONNECTOR_FAILURE_LABELS[connector.failureBehavior] || connector.failureBehavior),
        semanticJustification: _safe(connector.semanticJustification || ''),
        pointCount: connector.points.length,
        pending: _unique(pending),
        suggestedActions: _unique(suggestedActions),
    };
}

function _buildMissingConnectorInspection(connectorId: string): PipelinePackConnectorInspection {
    const safeConnectorId = _safe(connectorId);
    return {
        connectorId,
        safeConnectorId,
        found: false,
        label: `Conector nao encontrado: ${safeConnectorId}`,
        kindValue: '',
        kind: 'Conector inexistente',
        directionValue: '',
        direction: 'Sem direcao',
        required: false,
        conditionRef: '',
        source: { id: '', label: 'Origem nao encontrada', found: false },
        target: { id: '', label: 'Destino nao encontrado', found: false },
        dataRefs: [],
        evidenceRefs: [],
        failureBehaviorValue: '',
        failureBehavior: 'Nao definido',
        semanticJustification: '',
        pointCount: 0,
        pending: [`Nao encontrei o conector ${safeConnectorId} neste Pipeline Pack.`],
        suggestedActions: [
            'Conferir o id do conector recebido pelo canvas.',
            'Selecionar um conector existente antes de editar dados, condicao ou rota de falha.',
        ],
    };
}

function _inspectNormalizedPack(pack: PipelinePack, nodeId: string): PipelinePackNodeInspection {
    const requestedNodeId = _nonEmpty(nodeId);
    const node = pack.graph.nodes.find((item) => item.id === requestedNodeId);
    if (!node) return _buildMissingInspection(pack, requestedNodeId);
    return _buildFoundInspection(pack, node);
}

export function inspectPipelinePackNode(input: unknown, nodeId: string): PipelinePackNodeInspection {
    const pack = normalizePipelinePack(input);
    return _inspectNormalizedPack(pack, nodeId);
}

export function inspectPipelinePackNodes(input: unknown, nodeIds?: string[]): PipelinePackNodeInspection[] {
    const pack = normalizePipelinePack(input);
    const ids = Array.isArray(nodeIds) && nodeIds.length > 0
        ? nodeIds.map(_nonEmpty).filter(Boolean)
        : pack.graph.nodes.map((node) => node.id);
    return ids.map((nodeId) => _inspectNormalizedPack(pack, nodeId));
}

export function inspectPipelinePackConnector(input: unknown, connectorId: string): PipelinePackConnectorInspection {
    const pack = normalizePipelinePack(input);
    const requestedConnectorId = _nonEmpty(connectorId);
    const protocol = buildPipelineProtocol(pack);
    const connector = protocol.connectors.find((item) => item.id === requestedConnectorId);
    if (!connector) return _buildMissingConnectorInspection(requestedConnectorId);
    return _buildConnectorInspection(pack, connector);
}

export function inspectPipelinePackConnectors(input: unknown, connectorIds?: string[]): PipelinePackConnectorInspection[] {
    const pack = normalizePipelinePack(input);
    const protocol = buildPipelineProtocol(pack);
    const ids = Array.isArray(connectorIds) && connectorIds.length > 0
        ? connectorIds.map(_nonEmpty).filter(Boolean)
        : protocol.connectors.map((connector) => connector.id);
    return ids.map((connectorId) => {
        const connector = protocol.connectors.find((item) => item.id === connectorId);
        return connector ? _buildConnectorInspection(pack, connector) : _buildMissingConnectorInspection(connectorId);
    });
}

function _applyConnectorMetadataPatch(edge: PipelinePackEdge, patch: PipelinePackConnectorMetadataPatch): PipelinePackEdge {
    const next: PipelinePackEdge = {
        ...edge,
        kind: patch.kind === undefined ? edge.kind : _connectorKindValue(patch.kind, edge.kind),
    };
    if (patch.direction !== undefined) {
        const direction = _connectorDirectionValue(patch.direction);
        if (direction) next.direction = direction;
        else delete next.direction;
    }
    if (patch.required !== undefined) next.required = Boolean(patch.required);
    if (patch.conditionRef !== undefined) {
        const conditionRef = _nonEmpty(patch.conditionRef);
        if (conditionRef) next.conditionRef = conditionRef;
        else delete next.conditionRef;
    }
    if (patch.dataRefs !== undefined) {
        const dataRefs = _stringList(patch.dataRefs);
        if (dataRefs.length > 0) next.dataRefs = dataRefs;
        else delete next.dataRefs;
    }
    if (patch.evidenceRefs !== undefined) {
        const evidenceRefs = _stringList(patch.evidenceRefs);
        if (evidenceRefs.length > 0) next.evidenceRefs = evidenceRefs;
        else delete next.evidenceRefs;
    }
    if (patch.failureBehavior !== undefined) {
        const failureBehavior = _connectorFailureValue(patch.failureBehavior);
        if (failureBehavior) next.failureBehavior = failureBehavior;
        else delete next.failureBehavior;
    }
    if (patch.semanticJustification !== undefined) {
        const semanticJustification = _nonEmpty(patch.semanticJustification);
        if (semanticJustification) next.semanticJustification = semanticJustification;
        else delete next.semanticJustification;
    }
    return next;
}

export function updatePipelinePackConnectorMetadata(input: unknown, patch: PipelinePackConnectorMetadataPatch): PipelinePack {
    const pack = normalizePipelinePack(input);
    const connectorId = _nonEmpty(patch.connectorId);
    if (!connectorId) return pack;
    const nextEdges = pack.graph.edges.map((edge) =>
        edge.id === connectorId ? _applyConnectorMetadataPatch(edge, patch) : edge,
    );
    return normalizePipelinePack({
        ...pack,
        graph: {
            ...pack.graph,
            edges: nextEdges,
        },
    });
}
