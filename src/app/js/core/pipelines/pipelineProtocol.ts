// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PROTOCOL - one domain-neutral contract above Pipeline Pack.

   Design anchors:
   - BPMN: common visual process semantics.
   - DMN: explicit decision inputs and branches.
   - W3C PROV: activity, entity and agent/provenance separation.
   - OpenLineage-like facets: namespaced extensibility without schema lock-in.
   ================================================================ */

import {
    PIPELINE_PACK_SCHEMA_VERSION,
    PIPELINE_PACK_SCORE_MODEL,
    normalizePipelinePack,
    type PipelineConnectorDirection,
    type PipelineConnectorFailureBehavior,
    type PipelinePack,
    type PipelinePackEdge,
    type PipelinePackNode,
    type PipelinePoint,
} from './pipelinePack.js';
import {
    inferPipelineDomainProfile,
    normalizePipelineDomainText,
} from './pipelineDomainProfile.js';
import {
    extractPipelineConditionalGates,
    type PipelineConditionalGateStatus,
} from './pipelineConditionalGate.js';

export const PIPELINE_PROTOCOL_SCHEMA_VERSION = '1.0.0';
export const PIPELINE_PROTOCOL_ID = 'ecbyts.pipeline.protocol';
export const PIPELINE_PROTOCOL_FACET_PREFIX = 'ecbyts';

export type PipelineProtocolElementKind = 'start' | 'activity' | 'decision' | 'data' | 'end' | 'unknown';
export type PipelineProtocolConnectorKind = PipelinePackEdge['kind'];
export type PipelineProtocolIssueSeverity = 'error' | 'warning';
export type PipelineProtocolValidationScope = 'activity' | 'connector' | 'gate' | 'data' | 'ledger' | 'global';
export type PipelineProtocolFindingStatus = 'open' | 'blocked' | 'needs-owner' | 'ready';

export interface PipelineProtocolFacet {
    _schemaURL?: string;
    [key: string]: unknown;
}

export type PipelineProtocolFacets = Record<string, PipelineProtocolFacet>;

export interface PipelineProtocolRef {
    id: string;
    label: string;
    sourceLabel?: string;
}

export interface PipelineProtocolDataNature extends PipelineProtocolRef {
    category: 'field' | 'laboratory' | 'geospatial' | 'document' | 'tabular' | 'system' | 'image' | 'model' | 'technical-drawing' | 'sensor' | 'waste' | 'resource' | 'material' | 'other';
}

export interface PipelineProtocolElement {
    id: string;
    kind: PipelineProtocolElementKind;
    sourceType: string;
    label: string;
    phaseId?: string;
    stakeholderId?: string;
    responsiblePartyId?: string;
    dataNatureId?: string;
    evidenceRefs: string[];
    moduleTargetId?: string;
    originRef: string;
    version: string;
    sourceNodeId: string;
    facets: PipelineProtocolFacets;
}

export interface PipelineProtocolConnector {
    id: string;
    sourceId: string;
    targetId: string;
    kind: PipelineProtocolConnectorKind;
    direction: PipelineConnectorDirection;
    label?: string;
    branchLabel?: string;
    required: boolean;
    conditionRef?: string;
    conditionalRouteId?: string;
    dataNatureId?: string;
    dataRefs: string[];
    evidenceRefs: string[];
    phaseId?: string;
    stakeholderId?: string;
    responsiblePartyId?: string;
    originRef: string;
    version: string;
    failureBehavior: PipelineConnectorFailureBehavior;
    semanticJustification?: string;
    points: PipelinePoint[];
    facets: PipelineProtocolFacets;
}

export interface PipelineProtocolDecision {
    nodeId: string;
    label: string;
    status: PipelineConditionalGateStatus;
    moduleId: string;
    branchCount: number;
    requiredInputs: string[];
    pending: string[];
}

export interface PipelineProtocolActivity {
    id: string;
    label: string;
    phaseId?: string;
    stakeholderId?: string;
    responsiblePartyId?: string;
    dataNatureId?: string;
    evidenceRefs: string[];
    moduleTargetId?: string;
    originRef: string;
    version: string;
    sourceElementId: string;
}

export interface PipelineProtocolDataEntity {
    id: string;
    label: string;
    dataNatureId?: string;
    phaseId?: string;
    stakeholderId?: string;
    responsiblePartyId?: string;
    evidenceRefs: string[];
    originRef: string;
    version: string;
    sourceElementId: string;
}

export interface PipelineProtocolConditionalRoute {
    id: string;
    connectorId: string;
    sourceGateId: string;
    targetElementId: string;
    label: string;
    conditionRef?: string;
    routeKind: 'approval' | 'rework' | 'not-applicable' | 'manual-review' | 'neutral';
    dataRefs: string[];
    evidenceRefs: string[];
    responsiblePartyId?: string;
    originRef: string;
    version: string;
}

export interface PipelineProtocolGate {
    nodeId: string;
    label: string;
    status: PipelineConditionalGateStatus;
    phaseId?: string;
    stakeholderId?: string;
    responsiblePartyId?: string;
    dataNatureId?: string;
    evidenceRefs: string[];
    originRef: string;
    version: string;
    conditionalRoutes: PipelineProtocolConditionalRoute[];
}

export interface PipelineProtocolDocument {
    protocolId: typeof PIPELINE_PROTOCOL_ID;
    schemaVersion: typeof PIPELINE_PROTOCOL_SCHEMA_VERSION;
    scoreModel: typeof PIPELINE_PACK_SCORE_MODEL;
    packId: string;
    title: string;
    domainProfileId: string;
    domainProfileLabel: string;
    sourceKind: string;
    sourceFileName?: string;
    phases: PipelineProtocolRef[];
    stakeholders: PipelineProtocolRef[];
    dataNatures: PipelineProtocolDataNature[];
    elements: PipelineProtocolElement[];
    activities: PipelineProtocolActivity[];
    connectors: PipelineProtocolConnector[];
    decisions: PipelineProtocolDecision[];
    gates: PipelineProtocolGate[];
    data: PipelineProtocolDataEntity[];
    versionLedger: PipelineProtocolVersionLedger;
    facets: PipelineProtocolFacets;
}

export interface PipelineProtocolIssue {
    severity: PipelineProtocolIssueSeverity;
    code: string;
    message: string;
    technicalCode: string;
    userMessage: string;
    suggestedFix: string;
    blocksPublish: boolean;
    ownerItemId: string;
    scope: PipelineProtocolValidationScope;
    action: string;
    dono: string;
    status: PipelineProtocolFindingStatus;
    targetId?: string;
}

export interface PipelineProtocolVersionLedger {
    protocolVersion: typeof PIPELINE_PROTOCOL_SCHEMA_VERSION;
    packSchemaVersion: string;
    packVersion: string;
    sourceKind: string;
    sourceFileName?: string;
    originRef: string;
    sourceVersion?: string;
    migrationId?: string;
    changeSet: string[];
    compatibility: 'current' | 'requires-migration' | 'unknown';
}

export interface PipelineProtocolValidationSection {
    valid: boolean;
    errors: number;
    warnings: number;
    findings: number;
}

export interface PipelineProtocolValidationResult {
    valid: boolean;
    errors: number;
    warnings: number;
    issues: PipelineProtocolIssue[];
    findings: PipelineProtocolIssue[];
    sections: Record<PipelineProtocolValidationScope, PipelineProtocolValidationSection>;
    summary: {
        phases: number;
        stakeholders: number;
        dataNatures: number;
        elements: number;
        activities: number;
        connectors: number;
        decisions: number;
        gates: number;
        data: number;
    };
}

const DATA_NATURE_CATALOG: ReadonlyArray<PipelineProtocolDataNature> = Object.freeze([
    { id: 'field', label: 'Campo', category: 'field' },
    { id: 'laboratory', label: 'Laboratorio', category: 'laboratory' },
    { id: 'geospatial', label: 'Geoespacial', category: 'geospatial' },
    { id: 'document-regulatory', label: 'Documental / regulatorio', category: 'document' },
    { id: 'tabular-analytical', label: 'Tabular / analitico', category: 'tabular' },
    { id: 'enterprise-system', label: 'Sistema corporativo', category: 'system' },
    { id: 'image-evidence', label: 'Imagem / evidencia visual', category: 'image' },
    { id: 'model-calculation', label: 'Modelo / calculo', category: 'model' },
    { id: 'technical-drawing', label: 'Projeto / desenho tecnico', category: 'technical-drawing' },
    { id: 'sensor-operational', label: 'Operacional / sensor', category: 'sensor' },
    { id: 'tailings-waste', label: 'Rejeitos / residuos', category: 'waste' },
    { id: 'water-energy-inputs', label: 'Agua / energia / insumos', category: 'resource' },
    { id: 'material-stream', label: 'Fluxo material / produto', category: 'material' },
    { id: 'other', label: 'Outro', category: 'other' },
]);

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _asStringList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(_nonEmpty).filter(Boolean);
    const text = _nonEmpty(value);
    return text ? [text] : [];
}

function _firstText(...values: unknown[]): string {
    for (const value of values) {
        const text = _nonEmpty(value);
        if (text) return text;
    }
    return '';
}

function _slug(value: unknown, fallback: string): string {
    const text = _nonEmpty(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return text || fallback;
}

function _facet(name: string, value: Record<string, unknown>): PipelineProtocolFacets {
    return {
        [`${PIPELINE_PROTOCOL_FACET_PREFIX}_${name}`]: {
            _schemaURL: `ecbyts://pipeline-protocol/${PIPELINE_PROTOCOL_SCHEMA_VERSION}/facets/${name}`,
            ...value,
        },
    };
}

function _packOriginRef(pack: PipelinePack): string {
    return _firstText(pack.source.sourceFileName, pack.source.sourceFileHash, pack.source.importedAt, pack.source.kind, pack.id);
}

function _packSourceVersion(pack: PipelinePack): string {
    return _firstText(pack.source.sourceFileHash, pack.source.importedAt, pack.version);
}

function _itemVersion(pack: PipelinePack, params: Record<string, unknown>): string {
    return _firstText(params.version, params.itemVersion, params.sourceVersion, params.updatedAt, pack.version);
}

function _itemOriginRef(pack: PipelinePack, params: Record<string, unknown>): string {
    return _firstText(
        params.originRef,
        params.sourceRef,
        params.sourceDocument,
        params.sourceFile,
        params.source,
        params.standard,
        _packOriginRef(pack),
    );
}

function _itemEvidenceRefs(pack: PipelinePack, params: Record<string, unknown>, extraRefs: string[] = []): string[] {
    const refs = new Set<string>(extraRefs.map(_nonEmpty).filter(Boolean));
    for (const key of ['evidenceRefs', 'evidenceRef', 'sourceEvidence', 'traceabilityEvidence', 'sourceDocument', 'sourceFile', 'standard'] as const) {
        for (const ref of _asStringList(params[key])) refs.add(ref);
    }
    const originRef = _packOriginRef(pack);
    if (refs.size === 0 && originRef && (pack.source.kind !== 'manual' || Boolean(pack.source.sourceFileName || pack.source.sourceFileHash))) {
        refs.add(originRef);
    }
    return Array.from(refs);
}

function _nodeParams(node?: PipelinePackNode | null): Record<string, unknown> {
    return _asObject(node?.moduleInputParams);
}

function _elementKind(type: unknown): PipelineProtocolElementKind {
    const normalized = normalizePipelineDomainText(type);
    if (normalized.includes('trigger') || normalized.includes('start')) return 'start';
    if (normalized.includes('condition') || normalized.includes('gateway') || normalized.includes('decision')) return 'decision';
    if (normalized.includes('data')) return 'data';
    if (normalized.includes('end') || normalized.includes('finish')) return 'end';
    if (normalized.includes('action') || normalized.includes('task') || normalized.includes('activity')) return 'activity';
    return 'unknown';
}

function _catalogById(): Map<string, PipelineProtocolDataNature> {
    return new Map(DATA_NATURE_CATALOG.map((item) => [item.id, item]));
}

function _inferDataNatureId(node: PipelinePackNode, edge?: PipelinePackEdge | null): string {
    const params = node.moduleInputParams || {};
    const explicit = _nonEmpty(node.dataNature)
        || _nonEmpty(params.dataNature)
        || _nonEmpty(params.dataNatureId)
        || _nonEmpty((params as any).evidenceNature);
    if (explicit) {
        const explicitSlug = _slug(explicit, 'other');
        const found = DATA_NATURE_CATALOG.find((item) =>
            item.id === explicitSlug
            || normalizePipelineDomainText(item.label) === normalizePipelineDomainText(explicit)
            || item.category === explicitSlug,
        );
        return found?.id || explicitSlug;
    }

    const text = normalizePipelineDomainText([
        node.label,
        node.contextLabel,
        node.lane,
        node.phase,
        node.semanticRole,
        node.targetModule,
        edge?.label,
    ].map(_nonEmpty).filter(Boolean).join(' '));

    if (/(ficha|campo|amostra|sondagem|coleta|field)/.test(text)) return 'field';
    if (/(lims|laboratorio|laboratory|laudo|analit|pdf|edd)/.test(text)) return 'laboratory';
    if (/(gis|geoespacial|geograf|mapa|coordenada)/.test(text)) return 'geospatial';
    if (/(cad|corel|desenho|planta|projeto)/.test(text)) return 'technical-drawing';
    if (/(document|relatorio|licenca|regulator|cetesb|matricula|termo)/.test(text)) return 'document-regulatory';
    if (/(excel|tabela|tabular|planilha|csv|xlsx)/.test(text)) return 'tabular-analytical';
    if (/(erp|sistema|manutencao|corporativo)/.test(text)) return 'enterprise-system';
    if (/(imagem|foto|evidencia visual|png|jpg|jpeg|webp)/.test(text)) return 'image-evidence';
    if (/(sensor|operacional|tempo real|telemetria)/.test(text)) return 'sensor-operational';
    if (/(rejeito|residuo|tailings|barragem|empilhamento seco|pasta)/.test(text)) return 'tailings-waste';
    if (/(agua|energia|kwh|insumo|consumo)/.test(text)) return 'water-energy-inputs';
    if (/(p80|granulometria|recuperacao|balanco|modelo|calculo|reagente)/.test(text)) return 'model-calculation';
    if (/(rom|minerio|mineral|britado|moagem|polpa|concentrado|produto|alimentacao)/.test(text)) return 'material-stream';
    return 'other';
}

function _connectorDirection(edge: PipelinePackEdge): PipelineConnectorDirection {
    if (edge.direction) return edge.direction;
    const label = normalizePipelineDomainText(edge.label);
    if (/(retorno|voltar|revalidar|revisar|recircular|reprocessar|ajustar)/.test(label)) return 'backward';
    if (edge.kind === 'data-association' || edge.kind === 'reference') return 'undirected';
    return 'forward';
}

function _connectorFailureBehavior(edge: PipelinePackEdge): PipelineConnectorFailureBehavior {
    if (edge.failureBehavior) return edge.failureBehavior;
    const label = normalizePipelineDomainText(edge.label);
    if (/(nao|revisar|ajustar|revalidar|retrabalho|corrigir|recircular|reprocessar)/.test(label)) return 'rework';
    if (edge.kind === 'reference') return 'warn';
    return 'block';
}

function _edgeExplicitRequired(edge: PipelinePackEdge): boolean {
    return typeof edge.required === 'boolean' ? edge.required : edge.kind === 'control-flow';
}

function _connectorDataRefs(edge: PipelinePackEdge, source?: PipelinePackNode, target?: PipelinePackNode): string[] {
    const refs = new Set<string>((edge.dataRefs || []).map(_nonEmpty).filter(Boolean));
    if (source && _elementKind(source.type) === 'data') refs.add(source.id);
    if (target && _elementKind(target.type) === 'data') refs.add(target.id);
    return Array.from(refs);
}

function _connectorJustification(
    edge: PipelinePackEdge,
    source?: PipelinePackNode,
    target?: PipelinePackNode,
    dataRefs: string[] = [],
): string | undefined {
    const explicit = _nonEmpty(edge.semanticJustification);
    if (explicit) return explicit;
    if (dataRefs.length > 0) return `Transporta ou referencia dado do processo: ${dataRefs.join(', ')}.`;
    if (edge.kind === 'control-flow') {
        return `Fluxo de controle importado entre "${source?.label || edge.source}" e "${target?.label || edge.target}".`;
    }
    if (edge.kind === 'reference') {
        return 'Referencia auxiliar entre itens do processo; revisar quando publicar.';
    }
    return undefined;
}

function _refsFromLabels(labels: string[], fallbackPrefix: string): PipelineProtocolRef[] {
    return Array.from(new Set(labels.map(_nonEmpty).filter(Boolean)))
        .map((label, index) => ({
            id: _slug(label, `${fallbackPrefix}-${index + 1}`),
            label,
            sourceLabel: label,
        }));
}

function _phaseId(label: unknown): string | undefined {
    const text = _nonEmpty(label);
    return text ? _slug(text, 'phase') : undefined;
}

function _stakeholderId(label: unknown): string | undefined {
    const text = _nonEmpty(label);
    return text ? _slug(text, 'stakeholder') : undefined;
}

function _responsiblePartyId(node?: PipelinePackNode | null): string | undefined {
    const params = _nodeParams(node);
    return _stakeholderId(_firstText(
        params.responsibleParty,
        params.responsiblePartyId,
        params.owner,
        params.dono,
        params.responsavel,
        node?.lane,
    ));
}

function _moduleTargetId(pack: PipelinePack, nodeId: string): string | undefined {
    return pack.moduleTargets.find((target) => target.ownerNodeId === nodeId)?.id;
}

function _buildElement(pack: PipelinePack, node: PipelinePackNode): PipelineProtocolElement {
    const kind = _elementKind(node.type);
    const inferredDataNatureId = _inferDataNatureId(node);
    const params = _nodeParams(node);
    const materialDecisionNature = new Set(['model-calculation', 'tailings-waste', 'water-energy-inputs', 'material-stream']);
    const dataNatureId = kind === 'data' || _nonEmpty(node.dataNature) || materialDecisionNature.has(inferredDataNatureId)
        ? inferredDataNatureId
        : undefined;
    const evidenceRefs = _itemEvidenceRefs(pack, params);
    const originRef = _itemOriginRef(pack, params);
    const version = _itemVersion(pack, params);
    const out: PipelineProtocolElement = {
        id: node.id,
        sourceNodeId: node.id,
        kind,
        sourceType: node.type,
        label: node.label,
        evidenceRefs,
        originRef,
        version,
        facets: {
            ..._facet('process', {
                phaseLabel: node.phase || '',
                stakeholderLabel: node.lane || '',
                responsiblePartyLabel: _firstText(params.responsibleParty, params.owner, params.dono, params.responsavel, node.lane),
                semanticRole: node.semanticRole || '',
                targetModule: node.targetModule || '',
                originRef,
                version,
            }),
            ...(dataNatureId ? _facet('data', { dataNatureId }) : {}),
            ...(evidenceRefs.length > 0 ? _facet('evidence', { evidenceRefs }) : {}),
        },
    };
    const phaseId = _phaseId(node.phase);
    const stakeholderId = _stakeholderId(node.lane);
    const responsiblePartyId = _responsiblePartyId(node);
    const moduleTargetId = _moduleTargetId(pack, node.id);
    if (phaseId) out.phaseId = phaseId;
    if (stakeholderId) out.stakeholderId = stakeholderId;
    if (responsiblePartyId) out.responsiblePartyId = responsiblePartyId;
    if (dataNatureId) out.dataNatureId = dataNatureId;
    if (moduleTargetId) out.moduleTargetId = moduleTargetId;
    return out;
}

function _buildConnector(pack: PipelinePack, edge: PipelinePackEdge, nodesById: Map<string, PipelinePackNode>): PipelineProtocolConnector {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    const sourceParams = _nodeParams(source);
    const targetParams = _nodeParams(target);
    const dataNatureId = source && _elementKind(source.type) === 'data'
        ? _inferDataNatureId(source, edge)
        : target && _elementKind(target.type) === 'data'
            ? _inferDataNatureId(target, edge)
            : undefined;
    const dataRefs = _connectorDataRefs(edge, source, target);
    const evidenceRefs = _itemEvidenceRefs(pack, sourceParams, [
        ..._asStringList(edge.evidenceRefs),
        ..._asStringList(targetParams.evidenceRefs),
        ..._asStringList(targetParams.evidenceRef),
        ..._asStringList(targetParams.sourceEvidence),
    ]);
    const semanticJustification = _connectorJustification(edge, source, target, dataRefs);
    const phaseId = _phaseId(source?.phase || target?.phase);
    const stakeholderId = _stakeholderId(source?.lane || target?.lane);
    const responsiblePartyId = _responsiblePartyId(source) || _responsiblePartyId(target);
    const originRef = _itemOriginRef(pack, {
        ...targetParams,
        ...sourceParams,
        sourceRef: _firstText(edge.id, source?.id, target?.id),
    });
    const version = _itemVersion(pack, sourceParams);
    return {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        kind: edge.kind,
        direction: _connectorDirection(edge),
        ...(edge.label ? { label: edge.label, branchLabel: edge.label } : {}),
        required: _edgeExplicitRequired(edge),
        ...(edge.conditionRef ? { conditionRef: edge.conditionRef, conditionalRouteId: `${edge.conditionRef}:${edge.id}` } : {}),
        ...(dataNatureId ? { dataNatureId } : {}),
        dataRefs,
        evidenceRefs,
        ...(phaseId ? { phaseId } : {}),
        ...(stakeholderId ? { stakeholderId } : {}),
        ...(responsiblePartyId ? { responsiblePartyId } : {}),
        originRef,
        version,
        failureBehavior: _connectorFailureBehavior(edge),
        points: Array.isArray(edge.points) ? edge.points : [],
        ...(semanticJustification ? { semanticJustification } : {}),
        facets: _facet('connector', {
            sourceKind: source ? _elementKind(source.type) : 'unknown',
            targetKind: target ? _elementKind(target.type) : 'unknown',
            points: Array.isArray(edge.points) ? edge.points.length : 0,
            direction: _connectorDirection(edge),
            failureBehavior: _connectorFailureBehavior(edge),
            phaseId: phaseId || '',
            stakeholderId: stakeholderId || '',
            responsiblePartyId: responsiblePartyId || '',
            originRef,
            version,
        }),
    };
}

function _buildDataNatureRefs(elements: PipelineProtocolElement[], connectors: PipelineProtocolConnector[]): PipelineProtocolDataNature[] {
    const ids = new Set<string>();
    for (const element of elements) if (element.dataNatureId) ids.add(element.dataNatureId);
    for (const connector of connectors) if (connector.dataNatureId) ids.add(connector.dataNatureId);
    const catalog = _catalogById();
    return Array.from(ids)
        .map((id) => catalog.get(id) || { id, label: id, category: 'other' as const })
        .sort((a, b) => a.label.localeCompare(b.label));
}

type PipelineConditionalGateView = ReturnType<typeof extractPipelineConditionalGates>[number];

function _buildActivities(elements: PipelineProtocolElement[]): PipelineProtocolActivity[] {
    return elements
        .filter((element) => element.kind === 'activity')
        .map((element) => ({
            id: element.id,
            label: element.label,
            ...(element.phaseId ? { phaseId: element.phaseId } : {}),
            ...(element.stakeholderId ? { stakeholderId: element.stakeholderId } : {}),
            ...(element.responsiblePartyId ? { responsiblePartyId: element.responsiblePartyId } : {}),
            ...(element.dataNatureId ? { dataNatureId: element.dataNatureId } : {}),
            evidenceRefs: element.evidenceRefs,
            ...(element.moduleTargetId ? { moduleTargetId: element.moduleTargetId } : {}),
            originRef: element.originRef,
            version: element.version,
            sourceElementId: element.id,
        }));
}

function _buildDataEntities(elements: PipelineProtocolElement[]): PipelineProtocolDataEntity[] {
    return elements
        .filter((element) => element.kind === 'data')
        .map((element) => ({
            id: element.id,
            label: element.label,
            ...(element.dataNatureId ? { dataNatureId: element.dataNatureId } : {}),
            ...(element.phaseId ? { phaseId: element.phaseId } : {}),
            ...(element.stakeholderId ? { stakeholderId: element.stakeholderId } : {}),
            ...(element.responsiblePartyId ? { responsiblePartyId: element.responsiblePartyId } : {}),
            evidenceRefs: element.evidenceRefs,
            originRef: element.originRef,
            version: element.version,
            sourceElementId: element.id,
        }));
}

function _routeKindFromConnector(connector: PipelineProtocolConnector): PipelineProtocolConditionalRoute['routeKind'] {
    const text = normalizePipelineDomainText([
        connector.conditionRef,
        connector.label,
        connector.branchLabel,
        connector.semanticJustification,
        connector.failureBehavior,
    ].map(_nonEmpty).filter(Boolean).join(' '));
    if (connector.failureBehavior === 'skip' || /(nao aplicavel|\bn\/a\b|\bn a\b|sem aplicacao|dispensad|pular|skip)/.test(text)) {
        return 'not-applicable';
    }
    if (connector.failureBehavior === 'human-decision' || /(revisao humana|decisao humana|arbitrar|manual)/.test(text)) {
        return 'manual-review';
    }
    if (connector.failureBehavior === 'rework'
        || /(nao|no|ajustar|revisar|retrabalho|corrigir|reprocessar|reconciliar|recircular|remoagem|voltar)/.test(text)) {
        return 'rework';
    }
    if (/(sim|yes|aprovad|aprovar|seguir|ok|liberad|aceit|fechar|publicar|concluir|pronto)/.test(text)) {
        return 'approval';
    }
    return 'neutral';
}

function _buildDecisions(gates: PipelineConditionalGateView[]): PipelineProtocolDecision[] {
    return gates.map((gate) => ({
        nodeId: gate.nodeId,
        label: gate.label,
        status: gate.status,
        moduleId: gate.moduleId,
        branchCount: gate.branchCount,
        requiredInputs: gate.requiredInputs.map((input) => input.id),
        pending: gate.pending,
    }));
}

function _buildGates(
    elements: PipelineProtocolElement[],
    connectors: PipelineProtocolConnector[],
    gateViews: PipelineConditionalGateView[],
): PipelineProtocolGate[] {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const branchKindByEdgeId = new Map<string, PipelineProtocolConditionalRoute['routeKind']>();
    for (const view of gateViews) {
        for (const branch of view.branches) branchKindByEdgeId.set(branch.edgeId, branch.routeKind);
    }
    return gateViews.map((gate) => {
        const element = elementsById.get(gate.nodeId);
        const routeConnectors = connectors.filter((connector) =>
            connector.sourceId === gate.nodeId || connector.conditionRef === gate.nodeId,
        );
        return {
            nodeId: gate.nodeId,
            label: gate.label,
            status: gate.status,
            ...(element?.phaseId ? { phaseId: element.phaseId } : {}),
            ...(element?.stakeholderId ? { stakeholderId: element.stakeholderId } : {}),
            ...(element?.responsiblePartyId ? { responsiblePartyId: element.responsiblePartyId } : {}),
            ...(element?.dataNatureId ? { dataNatureId: element.dataNatureId } : {}),
            evidenceRefs: element?.evidenceRefs || [],
            originRef: element?.originRef || '',
            version: element?.version || '',
            conditionalRoutes: routeConnectors.map((connector) => ({
                id: connector.conditionalRouteId || `${gate.nodeId}:${connector.id}`,
                connectorId: connector.id,
                sourceGateId: gate.nodeId,
                targetElementId: connector.targetId,
                label: connector.branchLabel || connector.label || `Rota para ${connector.targetId}`,
                ...(connector.conditionRef ? { conditionRef: connector.conditionRef } : {}),
                routeKind: branchKindByEdgeId.get(connector.id) || _routeKindFromConnector(connector),
                dataRefs: connector.dataRefs,
                evidenceRefs: connector.evidenceRefs,
                ...(connector.responsiblePartyId ? { responsiblePartyId: connector.responsiblePartyId } : {}),
                originRef: connector.originRef,
                version: connector.version,
            })),
        };
    });
}

function _buildVersionLedger(pack: PipelinePack): PipelineProtocolVersionLedger {
    const sourceVersion = _packSourceVersion(pack);
    const migrationId = pack.schemaVersion !== PIPELINE_PACK_SCHEMA_VERSION
        ? `pipeline-pack-${pack.schemaVersion || 'unknown'}-to-${PIPELINE_PACK_SCHEMA_VERSION}`
        : '';
    return {
        protocolVersion: PIPELINE_PROTOCOL_SCHEMA_VERSION,
        packSchemaVersion: pack.schemaVersion,
        packVersion: pack.version,
        sourceKind: pack.source.kind,
        ...(pack.source.sourceFileName ? { sourceFileName: pack.source.sourceFileName } : {}),
        originRef: _packOriginRef(pack),
        ...(sourceVersion ? { sourceVersion } : {}),
        ...(migrationId ? { migrationId } : {}),
        changeSet: (pack.audit.notes || []).slice(0, 12),
        compatibility: pack.schemaVersion === PIPELINE_PACK_SCHEMA_VERSION
            ? 'current'
            : pack.schemaVersion
                ? 'requires-migration'
                : 'unknown',
    };
}

export function buildPipelineProtocol(input: unknown): PipelineProtocolDocument {
    const pack = normalizePipelinePack(input);
    const profileMatch = inferPipelineDomainProfile(pack);
    const nodesById = new Map(pack.graph.nodes.map((node) => [node.id, node]));
    const elements = pack.graph.nodes.map((node) => _buildElement(pack, node));
    const connectors = pack.graph.edges.map((edge) => _buildConnector(pack, edge, nodesById));
    const gateViews = extractPipelineConditionalGates(pack);
    const activities = _buildActivities(elements);
    const data = _buildDataEntities(elements);
    const gates = _buildGates(elements, connectors, gateViews);
    const phases = _refsFromLabels([
        ...pack.graph.groups.map((group) => group.label),
        ...pack.graph.nodes.map((node) => node.phase || ''),
    ], 'phase');
    const stakeholders = _refsFromLabels([
        ...pack.graph.lanes.map((lane) => lane.label),
        ...pack.graph.nodes.map((node) => node.lane || ''),
    ], 'stakeholder');

    return {
        protocolId: PIPELINE_PROTOCOL_ID,
        schemaVersion: PIPELINE_PROTOCOL_SCHEMA_VERSION,
        scoreModel: PIPELINE_PACK_SCORE_MODEL,
        packId: pack.id,
        title: pack.title,
        domainProfileId: profileMatch.profile.id,
        domainProfileLabel: profileMatch.profile.label,
        sourceKind: pack.source.kind,
        ...(pack.source.sourceFileName ? { sourceFileName: pack.source.sourceFileName } : {}),
        phases,
        stakeholders,
        dataNatures: _buildDataNatureRefs(elements, connectors),
        elements,
        activities,
        connectors,
        decisions: _buildDecisions(gateViews),
        gates,
        data,
        versionLedger: _buildVersionLedger(pack),
        facets: _facet('protocol', {
            sourceSemantics: pack.source.semantics,
            validationScope: pack.validationProfile.scope,
            minScore: pack.validationProfile.minScore,
            packVersion: pack.version,
            packSchemaVersion: pack.schemaVersion,
        }),
    };
}

function _issue(
    issues: PipelineProtocolIssue[],
    severity: PipelineProtocolIssueSeverity,
    code: string,
    message: string,
    targetId?: string,
    scope: PipelineProtocolValidationScope = 'global',
): void {
    const suggestedFix = _suggestedFixForIssue(code);
    const ownerItemId = targetId || 'pipeline-protocol';
    issues.push({
        severity,
        code,
        message,
        technicalCode: code,
        userMessage: _userMessageForIssue(code, message),
        suggestedFix,
        blocksPublish: severity === 'error',
        ownerItemId,
        scope,
        action: _actionForIssue(code),
        dono: _donoForIssue(scope, ownerItemId),
        status: _statusForIssue(severity, scope, ownerItemId),
        ...(targetId ? { targetId } : {}),
    });
}

function _userMessageForIssue(code: string, message: string): string {
    if (code === 'activity.evidence.required') {
        return 'Atividade sem evidencia ou origem rastreavel.';
    }
    if (code === 'activity.responsible.required') {
        return 'Atividade sem dono responsavel definido.';
    }
    if (code === 'phase.none') {
        return 'O processo ainda nao tem fases definidas.';
    }
    if (code === 'stakeholder.none') {
        return 'O processo ainda nao tem parte interessada ou raia definida.';
    }
    if (code.startsWith('connector.source')) {
        return 'Conector aponta para uma origem que nao existe no processo.';
    }
    if (code.startsWith('connector.target')) {
        return 'Conector aponta para um destino que nao existe no processo.';
    }
    if (code === 'connector.semantic.required') {
        return 'Conector obrigatorio sem dado, evidencia, condicao ou justificativa.';
    }
    if (code === 'connector.conditionRef.unresolved') {
        return 'Conector usa uma condicao que ainda nao foi vinculada ao grafo.';
    }
    if (code === 'connector.responsible.required') {
        return 'Conector sem dono responsavel pela rota.';
    }
    if (code === 'decision.branches.low') {
        return 'Condicional precisa de pelo menos dois caminhos claros.';
    }
    if (code === 'decision.module.unmapped') {
        return 'Condicional ainda nao tem modulo equivalente.';
    }
    if (code === 'gate.route.broken') {
        return 'Gate condicional tem rota quebrada ou sem decisao de origem.';
    }
    if (code === 'gate.route.criteria.required') {
        return 'Gate condicional tem rota sem criterio explicito.';
    }
    if (code.startsWith('data.nature')) {
        return 'Dado do processo esta sem natureza de dados valida.';
    }
    if (code === 'data.evidence.required') {
        return 'Dado sem evidencia, origem ou justificativa.';
    }
    if (code === 'data.responsible.required') {
        return 'Dado sem parte responsavel definida.';
    }
    if (code.startsWith('element.phase')) {
        return 'Item do processo esta ligado a uma fase inexistente.';
    }
    if (code.startsWith('element.stakeholder')) {
        return 'Item do processo esta ligado a uma parte interessada inexistente.';
    }
    if (code === 'version.ledger.required') {
        return 'Protocolo esta sem registro minimo de versao.';
    }
    if (code === 'version.origin.required') {
        return 'Ledger de versao esta sem origem rastreavel.';
    }
    if (code === 'version.migration.required') {
        return 'Pack precisa registrar migracao antes de publicar.';
    }
    return message;
}

function _suggestedFixForIssue(code: string): string {
    if (code === 'activity.evidence.required') {
        return 'Vincular evidencia, origem do documento ou justificativa manual da atividade.';
    }
    if (code === 'activity.responsible.required') {
        return 'Atribuir dono/responsavel ou vincular a atividade a uma raia existente.';
    }
    if (code === 'phase.none') {
        return 'Adicionar pelo menos uma fase/etapa ao processo.';
    }
    if (code === 'stakeholder.none') {
        return 'Adicionar pelo menos uma parte interessada ou raia responsavel.';
    }
    if (code.startsWith('connector.source') || code.startsWith('connector.target')) {
        return 'Revisar a ligacao do conector e apontar para uma atividade existente.';
    }
    if (code === 'connector.semantic.required') {
        return 'Informar dado transportado, evidencia, condicao ou justificativa do conector.';
    }
    if (code === 'connector.conditionRef.unresolved') {
        return 'Vincular o conector a uma decisao existente ou remover a condicao.';
    }
    if (code === 'connector.responsible.required') {
        return 'Definir a parte responsavel pelo conector ou herdar a raia da origem/destino.';
    }
    if (code.startsWith('decision.')) {
        return 'Abrir a decisao e definir criterios, rotas e modulo equivalente.';
    }
    if (code === 'gate.route.broken') {
        return 'Corrigir conditionRef da rota para apontar para um gate existente.';
    }
    if (code === 'gate.route.criteria.required') {
        return 'Preencher label, conditionRef, evidencia ou justificativa da rota.';
    }
    if (code.startsWith('data.nature')) {
        return 'Selecionar a natureza do dado ou marcar como nao aplicavel com justificativa.';
    }
    if (code === 'data.evidence.required') {
        return 'Vincular documento, evidencia, fonte de origem ou justificativa para este dado.';
    }
    if (code === 'data.responsible.required') {
        return 'Definir a parte responsavel pelo dado ou vincular a uma raia.';
    }
    if (code.startsWith('element.phase')) {
        return 'Vincular o item a uma fase existente do processo.';
    }
    if (code.startsWith('element.stakeholder')) {
        return 'Vincular o item a uma parte interessada ou raia existente.';
    }
    if (code.startsWith('version.')) {
        return 'Revisar versao, origem e migracao antes de exportar ou publicar.';
    }
    return 'Revisar o item indicado e completar as informacoes obrigatorias.';
}

function _actionForIssue(code: string): string {
    if (code.includes('evidence')) return 'vincular evidencia';
    if (code.includes('responsible') || code.includes('stakeholder')) return 'atribuir dono';
    if (code.includes('conditionRef') || code.includes('route')) return 'corrigir rota condicional';
    if (code.includes('phase')) return 'atribuir fase';
    if (code.includes('nature')) return 'definir natureza de dados';
    if (code.startsWith('version.')) return 'revisar ledger de versao/origem';
    return 'revisar protocolo';
}

function _donoForIssue(scope: PipelineProtocolValidationScope, ownerItemId: string): string {
    if (scope === 'ledger') return 'governanca-do-pack';
    if (scope === 'global') return 'pipeline-protocol';
    return ownerItemId;
}

function _statusForIssue(
    severity: PipelineProtocolIssueSeverity,
    scope: PipelineProtocolValidationScope,
    ownerItemId: string,
): PipelineProtocolFindingStatus {
    if (severity === 'error') return 'blocked';
    if (scope !== 'global' && ownerItemId === 'pipeline-protocol') return 'needs-owner';
    return 'open';
}

export function validatePipelineProtocol(input: unknown): PipelineProtocolValidationResult {
    const protocol = (input && typeof input === 'object' && (input as PipelineProtocolDocument).protocolId === PIPELINE_PROTOCOL_ID)
        ? input as PipelineProtocolDocument
        : buildPipelineProtocol(input);
    const issues: PipelineProtocolIssue[] = [];
    const activities = Array.isArray(protocol.activities) ? protocol.activities : _buildActivities(protocol.elements || []);
    const dataEntities = Array.isArray(protocol.data) ? protocol.data : _buildDataEntities(protocol.elements || []);
    const gates = Array.isArray(protocol.gates) ? protocol.gates : [];
    const elementIds = new Set(protocol.elements.map((element) => element.id));
    const phaseIds = new Set(protocol.phases.map((phase) => phase.id));
    const stakeholderIds = new Set(protocol.stakeholders.map((stakeholder) => stakeholder.id));
    const dataNatureIds = new Set(protocol.dataNatures.map((nature) => nature.id));
    const gateIds = new Set(protocol.decisions.map((decision) => decision.nodeId));

    if (!protocol.phases.length) _issue(issues, 'warning', 'phase.none', 'Nenhuma fase/etapa foi definida.', undefined, 'global');
    if (!protocol.stakeholders.length) _issue(issues, 'warning', 'stakeholder.none', 'Nenhuma parte interessada/raia foi definida.', undefined, 'global');

    for (const element of protocol.elements) {
        const scope: PipelineProtocolValidationScope = element.kind === 'data'
            ? 'data'
            : element.kind === 'decision'
                ? 'gate'
                : 'activity';
        if (element.phaseId && !phaseIds.has(element.phaseId)) {
            _issue(issues, 'error', 'element.phase.missing', `Elemento usa fase inexistente: ${element.phaseId}.`, element.id, scope);
        }
        if (element.stakeholderId && !stakeholderIds.has(element.stakeholderId)) {
            _issue(issues, 'error', 'element.stakeholder.missing', `Elemento usa parte interessada inexistente: ${element.stakeholderId}.`, element.id, scope);
        }
        if (element.kind === 'data' && !element.dataNatureId) {
            _issue(issues, 'error', 'data.nature.required', 'Deposito de dados precisa de natureza de dados.', element.id, 'data');
        }
        if (element.dataNatureId && !dataNatureIds.has(element.dataNatureId)) {
            _issue(issues, 'error', 'data.nature.missing', `Natureza de dados inexistente: ${element.dataNatureId}.`, element.id, scope);
        }
    }

    for (const activity of activities) {
        if (!activity.phaseId) {
            _issue(issues, 'warning', 'element.phase.missing', 'Atividade sem fase vinculada.', activity.id, 'activity');
        }
        if (!activity.responsiblePartyId && !activity.stakeholderId) {
            _issue(issues, 'warning', 'activity.responsible.required', 'Atividade precisa de dono responsavel.', activity.id, 'activity');
        }
        if (activity.evidenceRefs.length === 0) {
            _issue(issues, 'warning', 'activity.evidence.required', 'Atividade precisa de evidencia ou origem rastreavel.', activity.id, 'activity');
        }
    }

    for (const dataEntity of dataEntities) {
        if (!dataEntity.dataNatureId) {
            _issue(issues, 'error', 'data.nature.required', 'Dado precisa de natureza de dados.', dataEntity.id, 'data');
        }
        if (!dataEntity.responsiblePartyId && !dataEntity.stakeholderId) {
            _issue(issues, 'warning', 'data.responsible.required', 'Dado precisa de parte responsavel.', dataEntity.id, 'data');
        }
        if (dataEntity.evidenceRefs.length === 0) {
            _issue(issues, 'warning', 'data.evidence.required', 'Dado precisa de evidencia ou origem rastreavel.', dataEntity.id, 'data');
        }
    }

    for (const connector of protocol.connectors) {
        if (!elementIds.has(connector.sourceId)) {
            _issue(issues, 'error', 'connector.source.missing', `Conector aponta para origem inexistente: ${connector.sourceId}.`, connector.id, 'connector');
        }
        if (!elementIds.has(connector.targetId)) {
            _issue(issues, 'error', 'connector.target.missing', `Conector aponta para destino inexistente: ${connector.targetId}.`, connector.id, 'connector');
        }
        if (connector.required
            && connector.dataRefs.length === 0
            && connector.evidenceRefs.length === 0
            && !connector.dataNatureId
            && !_nonEmpty(connector.semanticJustification)) {
            _issue(
                issues,
                'error',
                'connector.semantic.required',
                'Conector obrigatorio precisa explicar dado, evidencia, condicao ou justificativa.',
                connector.id,
                'connector',
            );
        }
        if (!connector.responsiblePartyId && !connector.stakeholderId) {
            _issue(
                issues,
                'warning',
                'connector.responsible.required',
                'Conector precisa de dono responsavel pela rota.',
                connector.id,
                'connector',
            );
        }
        if (connector.conditionRef && (!elementIds.has(connector.conditionRef) || !gateIds.has(connector.conditionRef))) {
            _issue(
                issues,
                'error',
                'connector.conditionRef.unresolved',
                `Conector aponta para condicao ainda nao vinculada no grafo: ${connector.conditionRef}.`,
                connector.id,
                'connector',
            );
        }
    }

    for (const decision of protocol.decisions) {
        if (decision.branchCount < 2) {
            _issue(issues, 'warning', 'decision.branches.low', 'Condicional deveria ter pelo menos dois caminhos.', decision.nodeId, 'gate');
        }
        if (decision.status === 'unmapped') {
            _issue(issues, 'warning', 'decision.module.unmapped', 'Condicional ainda nao tem modulo equivalente.', decision.nodeId, 'gate');
        }
    }

    for (const gate of gates) {
        if (!gate.responsiblePartyId && !gate.stakeholderId) {
            _issue(issues, 'warning', 'activity.responsible.required', 'Gate precisa de dono responsavel.', gate.nodeId, 'gate');
        }
        for (const route of gate.conditionalRoutes) {
            if (!elementIds.has(route.targetElementId) || (route.conditionRef && route.conditionRef !== gate.nodeId)) {
                _issue(
                    issues,
                    'error',
                    'gate.route.broken',
                    `Rota condicional quebrada: ${route.connectorId}.`,
                    route.connectorId,
                    'gate',
                );
            }
            if (route.dataRefs.length === 0
                && route.evidenceRefs.length === 0
                && !_nonEmpty(route.conditionRef)
                && !normalizePipelineDomainText(route.label)) {
                _issue(
                    issues,
                    'warning',
                    'gate.route.criteria.required',
                    `Rota condicional sem criterio explicito: ${route.connectorId}.`,
                    route.connectorId,
                    'gate',
                );
            }
        }
    }

    if (!protocol.versionLedger?.protocolVersion || !protocol.versionLedger?.packVersion || !protocol.versionLedger?.packSchemaVersion) {
        _issue(issues, 'error', 'version.ledger.required', 'Protocolo precisa manter versao do protocolo e do pack.', undefined, 'ledger');
    }
    if (!protocol.versionLedger?.sourceKind || !protocol.versionLedger?.originRef) {
        _issue(issues, 'error', 'version.origin.required', 'Protocolo precisa manter origem rastreavel do pack.', undefined, 'ledger');
    }
    if (protocol.versionLedger?.compatibility === 'requires-migration') {
        _issue(issues, 'warning', 'version.migration.required', 'Pack precisa registrar migracao antes de publicar.', protocol.packId, 'ledger');
    }

    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    const scopes: PipelineProtocolValidationScope[] = ['activity', 'connector', 'gate', 'data', 'ledger', 'global'];
    const sections = scopes.reduce((acc, scope) => {
        const scoped = issues.filter((issue) => issue.scope === scope);
        const scopedErrors = scoped.filter((issue) => issue.severity === 'error').length;
        const scopedWarnings = scoped.filter((issue) => issue.severity === 'warning').length;
        acc[scope] = {
            valid: scopedErrors === 0,
            errors: scopedErrors,
            warnings: scopedWarnings,
            findings: scoped.length,
        };
        return acc;
    }, {} as Record<PipelineProtocolValidationScope, PipelineProtocolValidationSection>);
    return {
        valid: errors === 0,
        errors,
        warnings,
        issues,
        findings: issues,
        sections,
        summary: {
            phases: protocol.phases.length,
            stakeholders: protocol.stakeholders.length,
            dataNatures: protocol.dataNatures.length,
            elements: protocol.elements.length,
            activities: activities.length,
            connectors: protocol.connectors.length,
            decisions: protocol.decisions.length,
            gates: gates.length,
            data: dataEntities.length,
        },
    };
}
