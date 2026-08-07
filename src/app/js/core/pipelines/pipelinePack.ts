// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK - pure contract for customizable process workbenches.

   A PipelinePack separates graph, layout, semantics, module handoffs,
   assets, permissions and score rules. This keeps GAC/DD38 as a reference
   implementation without hard-coding future pipeline domains to GAC.
   ================================================================ */

export const PIPELINE_PACK_SCHEMA_VERSION = '1.0.0';
export const PIPELINE_PACK_SCORE_MODEL = 'unified-0-1000';

export const PIPELINE_PACK_ALLOWED_FILE_EXTENSIONS = [
    '.bpmn',
    '.ecbt',
    '.gif',
    '.jpeg',
    '.jpg',
    '.json',
    '.pdf',
    '.png',
    '.svg',
    '.vpp',
    '.webp',
    '.xml',
] as const;

export type PipelinePackSourceKind = 'vpp' | 'bpmn-xml' | 'pdf' | 'image' | 'ecbt' | 'json' | 'manual';
export type PipelinePackSourceSemantics = 'semantic' | 'visual-reference' | 'mixed';
export type PipelinePackMode = 'present' | 'edit' | 'audit';
export type PipelinePackAssetStatus = 'uploaded' | 'local-only' | 'missing' | 'no-permission' | 'pending-validation';
export type PipelinePackPermission = 'view' | 'edit' | 'owner' | 'teacher' | 'student';
export type PipelinePackOpenMode = 'inline' | 'side-panel' | 'fullscreen' | 'open-live' | 'snapshot-only';
export type PipelineConnectorDirection = 'forward' | 'backward' | 'bidirectional' | 'undirected';
export type PipelineConnectorFailureBehavior = 'block' | 'warn' | 'skip' | 'rework' | 'human-decision';

export interface PipelineNormativeCoverage {
    standardId?: string;
    sectionId?: string;
    sectionIds?: string[];
    checklistId?: string;
    checklistIds?: string[];
    [key: string]: unknown;
}

export interface PipelineNormativeReference {
    standardId?: string;
    sectionId?: string;
    sectionIds?: string[];
    checklistId?: string;
    checklistIds?: string[];
    normativeCoverage?: PipelineNormativeCoverage;
}

export interface PipelineSourceProvenance extends PipelineNormativeReference {
    kind: PipelinePackSourceKind;
    semantics: PipelinePackSourceSemantics;
    sourceFileName?: string;
    sourceFileHash?: string;
    importedAt?: string;
    importedBy?: string;
}

export interface PipelinePoint {
    x: number;
    y: number;
}

export interface PipelinePackNode extends PipelineNormativeReference {
    id: string;
    type: string;
    label: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    color?: string;
    lane?: string;
    phase?: string;
    dataNature?: string;
    contextLabel?: string;
    semanticRole?: string;
    targetModule?: string;
    moduleInputParams?: Record<string, unknown>;
}

export interface PipelinePackEdge extends PipelineNormativeReference {
    id: string;
    source: string;
    target: string;
    kind: 'control-flow' | 'data-association' | 'reference' | 'custom';
    label?: string;
    points?: PipelinePoint[];
    direction?: PipelineConnectorDirection;
    required?: boolean;
    conditionRef?: string;
    dataRefs?: string[];
    evidenceRefs?: string[];
    failureBehavior?: PipelineConnectorFailureBehavior;
    semanticJustification?: string;
}

export interface PipelinePackLane {
    id?: string;
    label: string;
    y?: number;
    h?: number;
}

export interface PipelinePackGroup {
    id?: string;
    label: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
}

export interface PipelineGraphModel {
    nodes: PipelinePackNode[];
    edges: PipelinePackEdge[];
    lanes: PipelinePackLane[];
    groups: PipelinePackGroup[];
    startNodeIds: string[];
    endNodeIds: string[];
}

export interface PipelineVisualLayout {
    renderTheme: 'app-dark' | 'reference-light' | string;
    hasReferenceOverlay: boolean;
    viewport?: {
        x: number;
        y: number;
        zoom: number;
    };
}

export interface PipelineSemanticEntry extends PipelineNormativeReference {
    nodeId: string;
    label: string;
    meaning?: string;
    domainTags: string[];
    confidence: 'manual' | 'imported' | 'inferred' | 'unknown';
}

export interface PipelineSemanticLayer {
    domain: string;
    glossary: Record<string, string>;
    entries: PipelineSemanticEntry[];
}

export interface PipelineTargetFallback {
    type: 'snapshot' | 'message' | 'none';
    assetId?: string;
    text?: string;
}

export type PipelineProjectDataStatus = 'empty' | 'filled' | 'review' | 'not-applicable' | string;
export type PipelineProjectDataValueKind =
    | 'selection'
    | 'text'
    | 'number'
    | 'percentage'
    | 'mass'
    | 'rate'
    | 'water'
    | 'energy'
    | 'document'
    | 'evidence'
    | 'reference'
    | 'list'
    | string;
export type PipelineObservationLinkStatus = 'linked' | 'missing' | 'needs-review' | 'not-applicable' | string;

export interface PipelineObservationLink extends PipelineNormativeReference {
    observationId: string;
    label?: string;
    sourceModuleId?: string;
    sourceElementId?: string;
    sourcePath?: string;
    status?: PipelineObservationLinkStatus;
}

export interface PipelineProjectDataBinding extends PipelineNormativeReference {
    id: string;
    parameterId: string;
    label: string;
    value: string | number | boolean;
    unit?: string;
    basis?: string;
    valueKind?: PipelineProjectDataValueKind;
    source?: string;
    status?: PipelineProjectDataStatus;
    observationLink?: PipelineObservationLink;
}

export interface PipelineModuleTarget extends PipelineNormativeReference {
    id: string;
    ownerNodeId?: string;
    ownerRegionId?: string;
    label: string;
    moduleId: string;
    adapterId: string;
    openMode: PipelinePackOpenMode;
    targetParams: Record<string, unknown>;
    projectDataBindings?: PipelineProjectDataBinding[];
    fallback: PipelineTargetFallback;
    requiredPermission: PipelinePackPermission;
}

export interface PipelineVariant {
    id: string;
    label: string;
    mode: PipelinePackMode;
    description?: string;
    baseVariantId?: string;
    moduleTargets?: PipelineModuleTarget[];
}

export interface PipelineValidationProfile extends PipelineNormativeReference {
    scoreModel: typeof PIPELINE_PACK_SCORE_MODEL;
    scope: string;
    minScore: number;
    visualForegroundMin?: number;
    requiredChecks: string[];
    quadrantPolicy?: {
        grid: '2x2' | '4x4';
        reportWorstBlocks: number;
    };
}

export interface PipelineAssetBinding extends PipelineNormativeReference {
    id: string;
    label: string;
    kind: 'reference' | 'snapshot' | 'video' | 'document' | 'data' | 'other';
    status: PipelinePackAssetStatus;
    fileName?: string;
    storagePath?: string;
    bucket?: string;
    checksum?: string;
    sizeBytes?: number;
    linkedNodeIds: string[];
    /**
     * Documented, human-authored justification for keeping a local-only path at
     * export time (e.g. a draft not yet uploaded to Files/Supabase). When absent,
     * an asset whose only reference is a local filesystem path blocks export -
     * see pipelinePackArtifact.ts `assertPipelinePackExportable`.
     */
    localPathException?: string;
}

export interface PipelinePermissionPolicy {
    defaultPermission: PipelinePackPermission;
    allowedRoles: PipelinePackPermission[];
}

export interface PipelineAuditTrail {
    generatedAt?: string;
    lastScore?: number;
    foregroundVisual?: number;
    notes: string[];
}

export interface PipelinePack extends PipelineNormativeReference {
    id: string;
    title: string;
    description?: string;
    schemaVersion: string;
    version: string;
    source: PipelineSourceProvenance;
    graph: PipelineGraphModel;
    layout: PipelineVisualLayout;
    semantics: PipelineSemanticLayer;
    moduleTargets: PipelineModuleTarget[];
    variants: PipelineVariant[];
    validationProfile: PipelineValidationProfile;
    assets: PipelineAssetBinding[];
    permissions: PipelinePermissionPolicy;
    audit: PipelineAuditTrail;
}

export interface PipelinePackIssue {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    nodeId?: string;
    targetId?: string;
    assetId?: string;
}

export interface PipelinePackValidationResult {
    valid: boolean;
    score: number;
    errors: PipelinePackIssue[];
    warnings: PipelinePackIssue[];
    checks: Array<{ id: string; passed: boolean; message: string }>;
}

export interface PipelinePackSummary {
    title: string;
    sourceKind: PipelinePackSourceKind;
    sourceSemantics: PipelinePackSourceSemantics;
    stats: {
        nodes: number;
        edges: number;
        lanes: number;
        groups: number;
        moduleTargets: number;
        assets: number;
        missingAssets: number;
        unresolvedTargets: number;
    };
    whatYouWillFind: string[];
    modules: Array<{ moduleId: string; count: number }>;
    pending: string[];
    score: number;
}

export interface PipelineDeParaRow {
    nodeId?: string;
    nodeLabel: string;
    moduleId: string;
    adapterId: string;
    openMode: PipelinePackOpenMode;
    fallbackType: PipelineTargetFallback['type'];
    status: 'ready' | 'needs-fallback' | 'needs-target' | 'node-missing';
}

export interface PipelineModuleTargetPatch {
    id?: string;
    ownerNodeId?: string;
    ownerRegionId?: string;
    label?: string;
    moduleId: string;
    adapterId?: string;
    openMode?: PipelinePackOpenMode;
    targetParams?: Record<string, unknown>;
    fallback?: PipelineTargetFallback;
    requiredPermission?: PipelinePackPermission;
}

export interface PipelinePackVariantPatch {
    id?: string;
    label: string;
    mode?: PipelinePackMode;
    description?: string;
    baseVariantId?: string;
    moduleTargets?: PipelineModuleTarget[];
    captureCurrentModuleTargets?: boolean;
}

export interface PipelinePackMigrationResult {
    migrated: boolean;
    fromSchemaVersion: string;
    toSchemaVersion: string;
    sourceShape: 'pipeline-pack' | 'legacy-pipeline-artifact' | 'legacy-preset' | 'unknown';
    changes: string[];
    warnings: string[];
    pack: PipelinePack;
}

function _slug(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _asArray<T>(value: T[] | undefined | null): T[] {
    return Array.isArray(value) ? value : [];
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function _normalizePoint(value: unknown): PipelinePoint | null {
    if (Array.isArray(value) && value.length >= 2) {
        const x = Number(value[0]);
        const y = Number(value[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    const obj = _asObject(value);
    const x = Number(obj.x);
    const y = Number(obj.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function _normalizeEdgeKind(value: unknown): PipelinePackEdge['kind'] {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'data' || raw === 'data-association') return 'data-association';
    if (raw === 'reference') return 'reference';
    if (raw === 'custom') return 'custom';
    return 'control-flow';
}

function _normalizeConnectorDirection(value: unknown): PipelineConnectorDirection | undefined {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'forward' || raw === 'backward' || raw === 'bidirectional' || raw === 'undirected') {
        return raw as PipelineConnectorDirection;
    }
    return undefined;
}

function _normalizeFailureBehavior(value: unknown): PipelineConnectorFailureBehavior | undefined {
    const raw = _nonEmpty(value).toLowerCase();
    if (raw === 'block' || raw === 'warn' || raw === 'skip' || raw === 'rework' || raw === 'human-decision') {
        return raw as PipelineConnectorFailureBehavior;
    }
    return undefined;
}

function _asStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(_nonEmpty).filter(Boolean) : [];
}

function _normalizeNormativeCoverage(value: unknown): PipelineNormativeCoverage | undefined {
    const raw = _asObject(value);
    if (Object.keys(raw).length === 0) return undefined;
    const sectionIds = _asStringList(raw.sectionIds);
    const checklistIds = _asStringList(raw.checklistIds);
    const out: PipelineNormativeCoverage = {};
    for (const [key, entryValue] of Object.entries(raw)) {
        if (['standardId', 'sectionId', 'sectionIds', 'checklistId', 'checklistIds'].includes(key)) continue;
        out[key] = entryValue;
    }
    const standardId = _nonEmpty(raw.standardId);
    const sectionId = _nonEmpty(raw.sectionId);
    const checklistId = _nonEmpty(raw.checklistId);
    if (standardId) out.standardId = standardId;
    if (sectionId) out.sectionId = sectionId;
    if (sectionIds.length > 0) out.sectionIds = sectionIds;
    if (checklistId) out.checklistId = checklistId;
    if (checklistIds.length > 0) out.checklistIds = checklistIds;
    return out;
}

function _normalizeNormativeReference(value: unknown): PipelineNormativeReference {
    const raw = _asObject(value);
    const sectionIds = _asStringList(raw.sectionIds);
    const checklistIds = _asStringList(raw.checklistIds);
    const normativeCoverage = _normalizeNormativeCoverage(raw.normativeCoverage);
    const out: PipelineNormativeReference = {};
    const standardId = _nonEmpty(raw.standardId);
    const sectionId = _nonEmpty(raw.sectionId);
    const checklistId = _nonEmpty(raw.checklistId);
    if (standardId) out.standardId = standardId;
    if (sectionId) out.sectionId = sectionId;
    if (sectionIds.length > 0) out.sectionIds = sectionIds;
    if (checklistId) out.checklistId = checklistId;
    if (checklistIds.length > 0) out.checklistIds = checklistIds;
    if (normativeCoverage) out.normativeCoverage = normativeCoverage;
    return out;
}

function _normalizeObservationLink(value: unknown): PipelineObservationLink | undefined {
    const raw = _asObject(value);
    const observationId = _firstText(raw.observationId, raw.id, raw.ref, raw.observationRef);
    if (!observationId) return undefined;
    const status = _firstText(raw.status, raw.state) as PipelineObservationLinkStatus;
    return {
        observationId,
        ..._normalizeNormativeReference(raw),
        ...(_firstText(raw.label, raw.name, raw.title) ? { label: _firstText(raw.label, raw.name, raw.title) } : {}),
        ...(_nonEmpty(raw.sourceModuleId) ? { sourceModuleId: _nonEmpty(raw.sourceModuleId) } : {}),
        ...(_nonEmpty(raw.sourceElementId) ? { sourceElementId: _nonEmpty(raw.sourceElementId) } : {}),
        ...(_firstText(raw.sourcePath, raw.path) ? { sourcePath: _firstText(raw.sourcePath, raw.path) } : {}),
        ...(status ? { status } : {}),
    };
}

function _normalizeProjectDataBinding(value: unknown, index: number): PipelineProjectDataBinding | null {
    const raw = _asObject(value);
    const parameterId = _firstText(raw.parameterId, raw.parameter, raw.key, raw.id);
    if (!parameterId) return null;
    const rawValue = raw.value ?? raw.valor ?? raw.text ?? '';
    const normalizedValue = typeof rawValue === 'number' || typeof rawValue === 'boolean'
        ? rawValue
        : _nonEmpty(rawValue);
    const observationLink = _normalizeObservationLink(
        raw.observationLink
        || raw.observation
        || (raw.observationRef || raw.observationId
            ? {
                observationId: _firstText(raw.observationRef, raw.observationId),
                label: _firstText(raw.observationLabel, raw.observationName),
                status: _firstText(raw.observationStatus, 'linked'),
            }
            : null),
    );
    return {
        id: _firstText(raw.id, `project-data-${_slug(parameterId) || index + 1}`),
        parameterId,
        label: _firstText(raw.label, raw.name, parameterId),
        value: normalizedValue,
        ..._normalizeNormativeReference(raw),
        ...(_nonEmpty(raw.unit) ? { unit: _nonEmpty(raw.unit) } : {}),
        ...(_firstText(raw.basis, raw.base, raw.period) ? { basis: _firstText(raw.basis, raw.base, raw.period) } : {}),
        ...(_nonEmpty(raw.valueKind) ? { valueKind: _nonEmpty(raw.valueKind) } : {}),
        ...(_firstText(raw.source, raw.fonte, raw.evidence, raw.evidencia) ? {
            source: _firstText(raw.source, raw.fonte, raw.evidence, raw.evidencia),
        } : {}),
        ...(_firstText(raw.status, raw.state, raw.situacao) ? { status: _firstText(raw.status, raw.state, raw.situacao) } : {}),
        ...(observationLink ? { observationLink } : {}),
    };
}

function _normalizeProjectDataBindings(...values: unknown[]): PipelineProjectDataBinding[] {
    return _firstArray(...values)
        .map(_normalizeProjectDataBinding)
        .filter((binding): binding is PipelineProjectDataBinding => !!binding);
}

function _firstArray(...values: unknown[]): unknown[] {
    for (const value of values) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

function _firstText(...values: unknown[]): string {
    for (const value of values) {
        const text = _nonEmpty(value);
        if (text) return text;
    }
    return '';
}

function _inferSourceKind(fileName: string): PipelinePackSourceKind {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.vpp')) return 'vpp';
    if (lower.endsWith('.bpmn') || lower.endsWith('.xml')) return 'bpmn-xml';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.ecbt')) return 'ecbt';
    if (lower.endsWith('.json')) return 'json';
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].some((ext) => lower.endsWith(ext))) return 'image';
    return 'manual';
}

function _normalizeLegacyEdges(edges: unknown[]): unknown[] {
    return edges.map((raw, index) => {
        const edge = _asObject(raw);
        return {
            ...edge,
            id: _firstText(edge.id, `edge-${index + 1}`),
            source: _firstText(edge.source, edge.from, edge.sourceId, edge.fromId),
            target: _firstText(edge.target, edge.to, edge.targetId, edge.toId),
            kind: _firstText(edge.kind, edge.type),
        };
    });
}

function _normalizeNodes(rawNodes: unknown[]): PipelinePackNode[] {
    return rawNodes
        .map((raw, index) => {
            const node = _asObject(raw);
            const id = _nonEmpty(node.id) || `node-${index + 1}`;
            const out: PipelinePackNode = {
                id,
                type: _nonEmpty(node.type) || 'action',
                label: _nonEmpty(node.label) || id,
                ..._normalizeNormativeReference(node),
            };
            for (const key of ['x', 'y', 'w', 'h'] as const) {
                const n = Number(node[key]);
                if (Number.isFinite(n)) out[key] = n;
            }
            for (const key of ['color', 'lane', 'phase', 'dataNature', 'contextLabel', 'semanticRole', 'targetModule'] as const) {
                const text = _nonEmpty(node[key]);
                if (text) out[key] = text;
            }
            const params = _asObject(node.moduleInputParams);
            if (Object.keys(params).length > 0) out.moduleInputParams = params;
            return out;
        });
}

function _normalizeEdges(rawEdges: unknown[]): PipelinePackEdge[] {
    return rawEdges
        .map((raw, index) => {
            const edge = _asObject(raw);
            const source = _nonEmpty(edge.source) || _nonEmpty(edge.from);
            const target = _nonEmpty(edge.target) || _nonEmpty(edge.to);
            const id = _nonEmpty(edge.id) || `edge-${index + 1}`;
            const points = _asArray(edge.points as unknown[])
                .map(_normalizePoint)
                .filter((point): point is PipelinePoint => !!point);
            const out: PipelinePackEdge = {
                id,
                source,
                target,
                kind: _normalizeEdgeKind(edge.kind),
                ..._normalizeNormativeReference(edge),
            };
            const label = _nonEmpty(edge.label);
            if (label) out.label = label;
            if (points.length > 0) out.points = points;
            const direction = _normalizeConnectorDirection(edge.direction);
            const failureBehavior = _normalizeFailureBehavior(edge.failureBehavior);
            const conditionRef = _nonEmpty(edge.conditionRef);
            const semanticJustification = _nonEmpty(edge.semanticJustification);
            const dataRefs = _asStringList(edge.dataRefs);
            const evidenceRefs = _asStringList(edge.evidenceRefs);
            if (direction) out.direction = direction;
            if (typeof edge.required === 'boolean') out.required = edge.required;
            if (conditionRef) out.conditionRef = conditionRef;
            if (dataRefs.length > 0) out.dataRefs = dataRefs;
            if (evidenceRefs.length > 0) out.evidenceRefs = evidenceRefs;
            if (failureBehavior) out.failureBehavior = failureBehavior;
            if (semanticJustification) out.semanticJustification = semanticJustification;
            return out;
        });
}

function _normalizeSource(value: unknown): PipelineSourceProvenance {
    const source = _asObject(value);
    const kind = _nonEmpty(source.kind) as PipelinePackSourceKind;
    const semantics = _nonEmpty(source.semantics) as PipelinePackSourceSemantics;
    return {
        kind: kind || 'manual',
        semantics: semantics || 'semantic',
        ..._normalizeNormativeReference(source),
        ...(_nonEmpty(source.sourceFileName) ? { sourceFileName: _nonEmpty(source.sourceFileName) } : {}),
        ...(_nonEmpty(source.sourceFileHash) ? { sourceFileHash: _nonEmpty(source.sourceFileHash) } : {}),
        ...(_nonEmpty(source.importedAt) ? { importedAt: _nonEmpty(source.importedAt) } : {}),
        ...(_nonEmpty(source.importedBy) ? { importedBy: _nonEmpty(source.importedBy) } : {}),
    };
}

function _normalizeGraph(input: Record<string, unknown>): PipelineGraphModel {
    const graph = _asObject(input.graph);
    const nodes = _normalizeNodes(_asArray((graph.nodes ?? input.nodes) as unknown[]));
    const edges = _normalizeEdges(_asArray((graph.edges ?? input.edges) as unknown[]));
    const lanes = _asArray((graph.lanes ?? input.lanes) as unknown[]).map((raw, index) => {
        const lane = _asObject(raw);
        return {
            ...(_nonEmpty(lane.id) ? { id: _nonEmpty(lane.id) } : { id: `lane-${index + 1}` }),
            label: _nonEmpty(lane.label) || `Lane ${index + 1}`,
            ...(Number.isFinite(Number(lane.y)) ? { y: Number(lane.y) } : {}),
            ...(Number.isFinite(Number(lane.h)) ? { h: Number(lane.h) } : {}),
        };
    });
    const groups = _asArray((graph.groups ?? input.groups) as unknown[]).map((raw, index) => {
        const group = _asObject(raw);
        return {
            ...(_nonEmpty(group.id) ? { id: _nonEmpty(group.id) } : { id: `group-${index + 1}` }),
            label: _nonEmpty(group.label) || `Group ${index + 1}`,
            ...(Number.isFinite(Number(group.x)) ? { x: Number(group.x) } : {}),
            ...(Number.isFinite(Number(group.y)) ? { y: Number(group.y) } : {}),
            ...(Number.isFinite(Number(group.w)) ? { w: Number(group.w) } : {}),
            ...(Number.isFinite(Number(group.h)) ? { h: Number(group.h) } : {}),
        };
    });
    return {
        nodes,
        edges,
        lanes,
        groups,
        startNodeIds: _asArray((graph.startNodeIds ?? input.startNodeIds) as string[]).map(_nonEmpty).filter(Boolean),
        endNodeIds: _asArray((graph.endNodeIds ?? input.endNodeIds) as string[]).map(_nonEmpty).filter(Boolean),
    };
}

function _targetFromNode(node: PipelinePackNode): PipelineModuleTarget | null {
    if (!node.targetModule) return null;
    const params = node.moduleInputParams || {};
    const moduleId = node.targetModule.includes('.') ? (node.targetModule.split('.')[0] || node.targetModule) : node.targetModule;
    const fallbackText = _nonEmpty(params.fallbackText) || `Nao foi possivel abrir ${node.targetModule}.`;
    const projectDataBindings = _normalizeProjectDataBindings(params.projectDataBindings);
    return {
        id: `target-${node.id}`,
        ownerNodeId: node.id,
        label: node.contextLabel || node.label,
        moduleId,
        adapterId: node.targetModule,
        openMode: 'open-live',
        ..._normalizeNormativeReference(node),
        targetParams: params,
        ...(projectDataBindings.length > 0 ? { projectDataBindings } : {}),
        fallback: {
            type: 'message',
            text: fallbackText,
        },
        requiredPermission: 'view',
    };
}

function _normalizeTargets(inputTargets: unknown[], nodes: PipelinePackNode[]): PipelineModuleTarget[] {
    const explicit = inputTargets.map((raw, index) => {
        const target = _asObject(raw);
        const fallback = _asObject(target.fallback);
        const targetParams = _asObject(target.targetParams);
        const projectDataBindings = _normalizeProjectDataBindings(target.projectDataBindings, targetParams.projectDataBindings);
        return {
            id: _nonEmpty(target.id) || `target-${index + 1}`,
            ..._normalizeNormativeReference(target),
            ...(_nonEmpty(target.ownerNodeId) ? { ownerNodeId: _nonEmpty(target.ownerNodeId) } : {}),
            ...(_nonEmpty(target.ownerRegionId) ? { ownerRegionId: _nonEmpty(target.ownerRegionId) } : {}),
            label: _nonEmpty(target.label) || _nonEmpty(target.moduleId) || `Target ${index + 1}`,
            moduleId: _nonEmpty(target.moduleId),
            adapterId: _nonEmpty(target.adapterId) || _nonEmpty(target.moduleId),
            openMode: (_nonEmpty(target.openMode) as PipelinePackOpenMode) || 'open-live',
            targetParams,
            ...(projectDataBindings.length > 0 ? { projectDataBindings } : {}),
            fallback: {
                type: ((_nonEmpty(fallback.type) as PipelineTargetFallback['type']) || 'none'),
                ...(_nonEmpty(fallback.assetId) ? { assetId: _nonEmpty(fallback.assetId) } : {}),
                ...(_nonEmpty(fallback.text) ? { text: _nonEmpty(fallback.text) } : {}),
            },
            requiredPermission: ((_nonEmpty(target.requiredPermission) as PipelinePackPermission) || 'view'),
        };
    });
    const fromNodes = nodes.map(_targetFromNode).filter((target): target is PipelineModuleTarget => !!target);
    const seen = new Set(explicit.map((target) => target.id));
    const explicitNodeIds = new Set(explicit.map((target) => target.ownerNodeId).filter(Boolean));
    return explicit.concat(fromNodes.filter((target) => !seen.has(target.id) && !explicitNodeIds.has(target.ownerNodeId)));
}

function _normalizeAssets(rawAssets: unknown[]): PipelineAssetBinding[] {
    return rawAssets.map((raw, index) => {
        const asset = _asObject(raw);
        return {
            id: _nonEmpty(asset.id) || `asset-${index + 1}`,
            label: _nonEmpty(asset.label) || _nonEmpty(asset.fileName) || `Asset ${index + 1}`,
            kind: (_nonEmpty(asset.kind) as PipelineAssetBinding['kind']) || 'other',
            status: (_nonEmpty(asset.status) as PipelinePackAssetStatus) || 'pending-validation',
            ..._normalizeNormativeReference(asset),
            ...(_nonEmpty(asset.fileName) ? { fileName: _nonEmpty(asset.fileName) } : {}),
            ...(_nonEmpty(asset.storagePath) ? { storagePath: _nonEmpty(asset.storagePath) } : {}),
            ...(_nonEmpty(asset.bucket) ? { bucket: _nonEmpty(asset.bucket) } : {}),
            ...(_nonEmpty(asset.localPathException) ? { localPathException: _nonEmpty(asset.localPathException) } : {}),
            ...(_nonEmpty(asset.checksum) ? { checksum: _nonEmpty(asset.checksum) } : {}),
            ...(Number.isFinite(Number(asset.sizeBytes)) ? { sizeBytes: Number(asset.sizeBytes) } : {}),
            linkedNodeIds: _asArray(asset.linkedNodeIds as string[]).map(_nonEmpty).filter(Boolean),
        };
    });
}

function _normalizeValidationProfile(value: unknown): PipelineValidationProfile {
    const profile = _asObject(value);
    const minScore = Number(profile.minScore);
    const visualForegroundMin = Number(profile.visualForegroundMin);
    return {
        scoreModel: PIPELINE_PACK_SCORE_MODEL,
        scope: _nonEmpty(profile.scope) || 'pipeline',
        minScore: Number.isFinite(minScore) ? minScore : 980,
        ..._normalizeNormativeReference(profile),
        ...(Number.isFinite(visualForegroundMin) ? { visualForegroundMin } : {}),
        requiredChecks: _asArray(profile.requiredChecks as string[]).map(_nonEmpty).filter(Boolean),
        ...(profile.quadrantPolicy && typeof profile.quadrantPolicy === 'object'
            ? {
                quadrantPolicy: {
                    grid: ((_asObject(profile.quadrantPolicy).grid as '2x2' | '4x4') || '4x4'),
                    reportWorstBlocks: Number(_asObject(profile.quadrantPolicy).reportWorstBlocks) || 4,
                },
            }
            : {}),
    };
}

export function migrateLegacyPipelinePreset(input: unknown): PipelinePackMigrationResult {
    const raw = _asObject(input);
    const model = _asObject(raw.model);
    const graph = _asObject(raw.graph);
    const source = _asObject(raw.source);
    const hasCurrentPackShape = _nonEmpty(raw.schemaVersion) === PIPELINE_PACK_SCHEMA_VERSION && Array.isArray(graph.nodes);
    const legacyNodes = _firstArray(graph.nodes, raw.nodes, model.nodes, raw.elements, model.elements);
    const legacyEdges = _firstArray(graph.edges, raw.edges, raw.connections, model.edges, model.connections);
    const sourceShape: PipelinePackMigrationResult['sourceShape'] = hasCurrentPackShape
        ? 'pipeline-pack'
        : (Array.isArray(model.nodes) || Array.isArray(model.edges) || Array.isArray(model.connections))
            ? 'legacy-pipeline-artifact'
            : (Array.isArray(raw.nodes) || Array.isArray(raw.edges) || Array.isArray(raw.connections) || Array.isArray(raw.elements))
                ? 'legacy-preset'
                : 'unknown';
    const fromSchemaVersion = _firstText(raw.schemaVersion, raw.schema_version, raw.packSchemaVersion, raw.version, 'legacy');
    const changes: string[] = [];
    const warnings: string[] = [];

    let normalizedInput: Record<string, unknown> = raw;
    if (!hasCurrentPackShape) {
        const title = _firstText(raw.title, raw.name, model.title, model.name, 'Processo importado');
        const sourceFileName = _firstText(
            source.sourceFileName,
            raw.sourceFileName,
            raw.fileName,
            raw.importedFromFile,
            model.sourceFileName,
            model.fileName,
        );
        const kind = (_firstText(source.kind, raw.sourceKind) as PipelinePackSourceKind) || _inferSourceKind(sourceFileName);
        const semantics = (_firstText(source.semantics, raw.sourceSemantics) as PipelinePackSourceSemantics)
            || (kind === 'image' || kind === 'pdf' ? 'visual-reference' : 'semantic');
        const startNodeIds = _firstArray(graph.startNodeIds, raw.startNodeIds, model.startNodeIds)
            .map(_nonEmpty)
            .filter(Boolean);
        const endNodeIds = _firstArray(graph.endNodeIds, raw.endNodeIds, model.endNodeIds)
            .map(_nonEmpty)
            .filter(Boolean);
        const startNodeId = _firstText(graph.startNodeId, raw.startNodeId, model.startNodeId);
        const endNodeId = _firstText(graph.endNodeId, raw.endNodeId, model.endNodeId);
        if (startNodeId && startNodeIds.length === 0) startNodeIds.push(startNodeId);
        if (endNodeId && endNodeIds.length === 0) endNodeIds.push(endNodeId);
        if (legacyNodes.length === 0) warnings.push('Nenhum no legado foi encontrado para migrar.');
        if (legacyEdges.length === 0) warnings.push('Nenhum conector legado foi encontrado para migrar.');
        normalizedInput = {
            ...raw,
            id: _firstText(raw.id, raw.presetId, model.id, model.presetId, `pipeline-pack-${_slug(title) || 'importado'}`),
            title,
            schemaVersion: PIPELINE_PACK_SCHEMA_VERSION,
            source: {
                ...source,
                kind,
                semantics,
                ...(sourceFileName ? { sourceFileName } : {}),
                ...(_firstText(source.importedAt, raw.importedAt) ? { importedAt: _firstText(source.importedAt, raw.importedAt) } : {}),
                ...(_firstText(source.importedBy, raw.importedBy) ? { importedBy: _firstText(source.importedBy, raw.importedBy) } : {}),
            },
            graph: {
                nodes: legacyNodes,
                edges: _normalizeLegacyEdges(legacyEdges),
                lanes: _firstArray(graph.lanes, raw.lanes, model.lanes),
                groups: _firstArray(graph.groups, raw.groups, model.groups),
                startNodeIds,
                endNodeIds,
            },
            layout: Object.keys(_asObject(raw.layout)).length > 0 ? raw.layout : model.layout,
            moduleTargets: _firstArray(raw.moduleTargets, model.moduleTargets),
            variants: _firstArray(raw.variants, model.variants),
            validationProfile: Object.keys(_asObject(raw.validationProfile)).length > 0 ? raw.validationProfile : model.validationProfile,
            assets: _firstArray(raw.assets, model.assets, raw.files, model.files),
            permissions: Object.keys(_asObject(raw.permissions)).length > 0 ? raw.permissions : model.permissions,
            audit: Object.keys(_asObject(raw.audit)).length > 0 ? raw.audit : model.audit,
        };
        changes.push('schemaVersion atualizado para PipelinePack atual');
        changes.push('grafo legado convertido para graph.nodes e graph.edges');
        if (sourceFileName || kind !== 'manual') changes.push('proveniencia de origem normalizada');
        if (_firstText(raw.presetId, model.presetId)) changes.push('presetId legado preservado como id do pack');
    }

    const pack = normalizePipelinePack(normalizedInput);
    if (!hasCurrentPackShape) {
        pack.audit.notes = [
            ...pack.audit.notes,
            `Migrado localmente de ${sourceShape} para PipelinePack ${PIPELINE_PACK_SCHEMA_VERSION}.`,
        ];
    }

    return {
        migrated: !hasCurrentPackShape,
        fromSchemaVersion,
        toSchemaVersion: PIPELINE_PACK_SCHEMA_VERSION,
        sourceShape,
        changes,
        warnings,
        pack,
    };
}

export function normalizePipelinePack(input: unknown): PipelinePack {
    const raw = _asObject(input);
    const graph = _normalizeGraph(raw);
    const title = _nonEmpty(raw.title) || _nonEmpty(raw.name) || 'Processo sem titulo';
    const moduleTargets = _normalizeTargets(_asArray(raw.moduleTargets as unknown[]), graph.nodes);
    const rawLayout = _asObject(raw.layout);
    const rawViewport = _asObject(rawLayout.viewport);
    const viewport = Number.isFinite(Number(rawViewport.x))
        && Number.isFinite(Number(rawViewport.y))
        && Number.isFinite(Number(rawViewport.zoom))
        ? { x: Number(rawViewport.x), y: Number(rawViewport.y), zoom: Number(rawViewport.zoom) }
        : null;
    return {
        id: _nonEmpty(raw.id) || `pipeline-pack-${_slug(title) || 'untitled'}`,
        title,
        ...(_nonEmpty(raw.description) ? { description: _nonEmpty(raw.description) } : {}),
        schemaVersion: _nonEmpty(raw.schemaVersion) || PIPELINE_PACK_SCHEMA_VERSION,
        version: _nonEmpty(raw.version) || '1.0.0',
        ..._normalizeNormativeReference(raw),
        source: _normalizeSource(raw.source),
        graph,
        layout: {
            renderTheme: _nonEmpty(rawLayout.renderTheme) || 'app-dark',
            hasReferenceOverlay: Boolean(rawLayout.hasReferenceOverlay),
            ...(viewport ? { viewport } : {}),
        },
        semantics: {
            domain: _nonEmpty(_asObject(raw.semantics).domain) || 'general',
            glossary: _asObject(_asObject(raw.semantics).glossary) as Record<string, string>,
            entries: _asArray(_asObject(raw.semantics).entries as unknown[]).map((entryRaw) => {
                const entry = _asObject(entryRaw);
                return {
                    nodeId: _nonEmpty(entry.nodeId),
                    label: _nonEmpty(entry.label),
                    ..._normalizeNormativeReference(entry),
                    ...(_nonEmpty(entry.meaning) ? { meaning: _nonEmpty(entry.meaning) } : {}),
                    domainTags: _asArray(entry.domainTags as string[]).map(_nonEmpty).filter(Boolean),
                    confidence: (_nonEmpty(entry.confidence) as PipelineSemanticEntry['confidence']) || 'unknown',
                };
            }),
        },
        moduleTargets,
        variants: _asArray(raw.variants as unknown[]).map((variantRaw, index) => {
            const variant = _asObject(variantRaw);
            const variantTargets = _normalizeTargets(_asArray(variant.moduleTargets as unknown[]), graph.nodes);
            return {
                id: _nonEmpty(variant.id) || `variant-${index + 1}`,
                label: _nonEmpty(variant.label) || `Variant ${index + 1}`,
                mode: (_nonEmpty(variant.mode) as PipelinePackMode) || 'edit',
                ...(_nonEmpty(variant.description) ? { description: _nonEmpty(variant.description) } : {}),
                ...(_nonEmpty(variant.baseVariantId) ? { baseVariantId: _nonEmpty(variant.baseVariantId) } : {}),
                ...(variantTargets.length > 0 ? { moduleTargets: variantTargets } : {}),
            };
        }),
        validationProfile: _normalizeValidationProfile(raw.validationProfile),
        assets: _normalizeAssets(_asArray(raw.assets as unknown[])),
        permissions: {
            defaultPermission: ((_nonEmpty(_asObject(raw.permissions).defaultPermission) as PipelinePackPermission) || 'view'),
            allowedRoles: _asArray(_asObject(raw.permissions).allowedRoles as PipelinePackPermission[])
                .map((role) => _nonEmpty(role) as PipelinePackPermission)
                .filter(Boolean),
        },
        audit: {
            ...(_nonEmpty(_asObject(raw.audit).generatedAt) ? { generatedAt: _nonEmpty(_asObject(raw.audit).generatedAt) } : {}),
            ...(Number.isFinite(Number(_asObject(raw.audit).lastScore)) ? { lastScore: Number(_asObject(raw.audit).lastScore) } : {}),
            ...(Number.isFinite(Number(_asObject(raw.audit).foregroundVisual))
                ? { foregroundVisual: Number(_asObject(raw.audit).foregroundVisual) }
                : {}),
            notes: _asArray(_asObject(raw.audit).notes as string[]).map(_nonEmpty).filter(Boolean),
        },
    };
}

function _addIssue(list: PipelinePackIssue[], code: string, message: string, extra: Partial<PipelinePackIssue> = {}): void {
    list.push({ severity: 'error', code, message, ...extra });
}

function _addWarning(list: PipelinePackIssue[], code: string, message: string, extra: Partial<PipelinePackIssue> = {}): void {
    list.push({ severity: 'warning', code, message, ...extra });
}

function _extension(fileName: string): string {
    const idx = fileName.lastIndexOf('.');
    return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

function _targetKey(target: Pick<PipelineModuleTarget, 'id' | 'ownerNodeId' | 'ownerRegionId'>): string {
    if (target.ownerNodeId) return `node:${target.ownerNodeId}`;
    if (target.ownerRegionId) return `region:${target.ownerRegionId}`;
    return `id:${target.id}`;
}

function _moduleId(adapterId: string, fallback: string): string {
    return adapterId.includes('.') ? (adapterId.split('.')[0] || fallback) : fallback;
}

function _normalizeModuleTargetPatch(patch: PipelineModuleTargetPatch, nodes: Map<string, PipelinePackNode>): PipelineModuleTarget {
    const ownerNodeId = _nonEmpty(patch.ownerNodeId);
    const ownerRegionId = _nonEmpty(patch.ownerRegionId);
    const adapterId = _nonEmpty(patch.adapterId) || _nonEmpty(patch.moduleId);
    const moduleId = _nonEmpty(patch.moduleId) || _moduleId(adapterId, adapterId);
    const node = ownerNodeId ? nodes.get(ownerNodeId) : null;
    const label = _nonEmpty(patch.label) || node?.contextLabel || node?.label || moduleId || 'Destino de modulo';
    const fallbackText = _nonEmpty(patch.fallback?.text) || `Se ${adapterId || moduleId} nao abrir, manter o usuario neste processo e mostrar ${label}.`;
    const id = _nonEmpty(patch.id)
        || (ownerNodeId ? `target-${ownerNodeId}` : ownerRegionId ? `target-region-${ownerRegionId}` : `target-${_slug(label) || 'module'}`);
    return {
        id,
        ...(ownerNodeId ? { ownerNodeId } : {}),
        ...(ownerRegionId ? { ownerRegionId } : {}),
        label,
        moduleId,
        adapterId,
        openMode: patch.openMode || 'open-live',
        targetParams: _asObject(patch.targetParams),
        fallback: {
            type: patch.fallback?.type || 'message',
            ...(_nonEmpty(patch.fallback?.assetId) ? { assetId: _nonEmpty(patch.fallback?.assetId) } : {}),
            text: fallbackText,
        },
        requiredPermission: patch.requiredPermission || 'view',
    };
}

export function validatePipelinePack(input: unknown): PipelinePackValidationResult {
    const pack = normalizePipelinePack(input);
    const errors: PipelinePackIssue[] = [];
    const warnings: PipelinePackIssue[] = [];
    const checks: PipelinePackValidationResult['checks'] = [];
    const nodeIds = new Set(pack.graph.nodes.map((node) => node.id));
    const targetIds = new Set<string>();

    if (!pack.id) _addIssue(errors, 'pack.id.required', 'Pipeline Pack precisa de id.');
    if (!pack.title) _addIssue(errors, 'pack.title.required', 'Pipeline Pack precisa de titulo.');
    if (pack.graph.nodes.length === 0) _addIssue(errors, 'graph.nodes.empty', 'Processo precisa ter pelo menos um no.');
    checks.push({ id: 'graph.nodes', passed: pack.graph.nodes.length > 0, message: `${pack.graph.nodes.length} nos` });

    for (const edge of pack.graph.edges) {
        if (!edge.source || !edge.target) {
            _addIssue(errors, 'edge.endpoint.required', 'Conector precisa de origem e destino.', { targetId: edge.id });
            continue;
        }
        if (!nodeIds.has(edge.source)) {
            _addIssue(errors, 'edge.source.missing', `Conector referencia origem inexistente: ${edge.source}.`, { targetId: edge.id });
        }
        if (!nodeIds.has(edge.target)) {
            _addIssue(errors, 'edge.target.missing', `Conector referencia destino inexistente: ${edge.target}.`, { targetId: edge.id });
        }
    }
    checks.push({
        id: 'graph.edges',
        passed: errors.every((issue) => !issue.code.startsWith('edge.')),
        message: `${pack.graph.edges.length} conectores`,
    });

    for (const target of pack.moduleTargets) {
        if (targetIds.has(target.id)) {
            _addIssue(errors, 'target.id.duplicate', `Destino duplicado: ${target.id}.`, { targetId: target.id });
        }
        targetIds.add(target.id);
        if (target.ownerNodeId && !nodeIds.has(target.ownerNodeId)) {
            _addIssue(errors, 'target.node.missing', `Destino aponta para no inexistente: ${target.ownerNodeId}.`, {
                targetId: target.id,
                nodeId: target.ownerNodeId,
            });
        }
        if (!target.moduleId || !target.adapterId) {
            _addIssue(errors, 'target.module.required', 'Destino precisa de modulo e adaptador.', { targetId: target.id });
        }
        if (target.openMode !== 'snapshot-only' && target.fallback.type === 'none') {
            _addIssue(errors, 'target.fallback.required', 'Destino vivo precisa de fallback.', { targetId: target.id });
        }
        if (Object.keys(target.targetParams || {}).length === 0 && target.openMode !== 'snapshot-only') {
            _addWarning(warnings, 'target.params.empty', 'Destino vivo nao declara parametros de abertura.', { targetId: target.id });
        }
    }
    checks.push({
        id: 'module-targets',
        passed: errors.every((issue) => !issue.code.startsWith('target.')),
        message: `${pack.moduleTargets.length} destinos de modulo`,
    });

    for (const asset of pack.assets) {
        if (asset.status === 'missing' || asset.status === 'no-permission') {
            _addIssue(errors, `asset.${asset.status}`, `Asset indisponivel: ${asset.label}.`, { assetId: asset.id });
        }
        if (asset.fileName) {
            const ext = _extension(asset.fileName);
            if (!PIPELINE_PACK_ALLOWED_FILE_EXTENSIONS.includes(ext as typeof PIPELINE_PACK_ALLOWED_FILE_EXTENSIONS[number])) {
                _addIssue(errors, 'asset.extension.blocked', `Extensao de asset nao permitida: ${ext || '(sem extensao)'}.`, {
                    assetId: asset.id,
                });
            }
        }
        if (asset.status === 'uploaded' && !asset.storagePath) {
            _addWarning(warnings, 'asset.storagePath.empty', 'Asset enviado precisa guardar path logico de Storage.', {
                assetId: asset.id,
            });
        }
    }
    checks.push({
        id: 'assets',
        passed: errors.every((issue) => !issue.code.startsWith('asset.')),
        message: `${pack.assets.length} assets`,
    });

    if (pack.validationProfile.scoreModel !== PIPELINE_PACK_SCORE_MODEL) {
        _addIssue(errors, 'score.model.invalid', 'Score precisa usar o modelo unificado 0-1000.');
    }
    if (pack.validationProfile.minScore < 0 || pack.validationProfile.minScore > 1000) {
        _addIssue(errors, 'score.min.invalid', 'Score minimo precisa estar entre 0 e 1000.');
    }
    const visualSourceKinds: PipelinePackSourceKind[] = ['pdf', 'image'];
    if (visualSourceKinds.includes(pack.source.kind) && pack.source.semantics === 'semantic') {
        _addIssue(
            errors,
            'source.visual-marked-semantic',
            'PDF/imagem e referencia visual; marque como visual ou misto ate haver validacao humana ou enriquecimento posterior.',
        );
    }
    if (pack.source.semantics === 'visual-reference' && pack.moduleTargets.length > 0) {
        _addWarning(warnings, 'source.visual-only.with-targets', 'Fonte visual com click-go exige revisao humana do de-para.');
    }

    const score = Math.max(0, 1000 - errors.length * 120 - warnings.length * 20);
    return {
        valid: errors.length === 0,
        score,
        errors,
        warnings,
        checks,
    };
}

export function extractPipelinePackDeParaRows(input: unknown): PipelineDeParaRow[] {
    const pack = normalizePipelinePack(input);
    const nodes = new Map(pack.graph.nodes.map((node) => [node.id, node]));
    return pack.moduleTargets.map((target) => {
        const node = target.ownerNodeId ? nodes.get(target.ownerNodeId) : null;
        const needsTarget = !target.moduleId || !target.adapterId || Object.keys(target.targetParams || {}).length === 0;
        const needsFallback = target.openMode !== 'snapshot-only' && target.fallback.type === 'none';
        const row: PipelineDeParaRow = {
            nodeLabel: node?.contextLabel || node?.label || target.label,
            moduleId: target.moduleId,
            adapterId: target.adapterId,
            openMode: target.openMode,
            fallbackType: target.fallback.type,
            status: target.ownerNodeId && !node
                ? 'node-missing'
                : needsTarget
                    ? 'needs-target'
                    : needsFallback
                        ? 'needs-fallback'
                        : 'ready',
        };
        if (target.ownerNodeId) row.nodeId = target.ownerNodeId;
        return row;
    });
}

export function summarizePipelinePack(input: unknown): PipelinePackSummary {
    const pack = normalizePipelinePack(input);
    const validation = validatePipelinePack(pack);
    const moduleCounts = new Map<string, number>();
    for (const target of pack.moduleTargets) {
        moduleCounts.set(target.moduleId, (moduleCounts.get(target.moduleId) || 0) + 1);
    }
    const missingAssets = pack.assets.filter((asset) => asset.status === 'missing' || asset.status === 'no-permission').length;
    const unresolvedTargets = extractPipelinePackDeParaRows(pack).filter((row) => row.status !== 'ready').length;
    const whatYouWillFind = [
        `${pack.graph.nodes.length} nos e ${pack.graph.edges.length} conectores`,
        `${pack.graph.lanes.length} raias e ${pack.graph.groups.length} grupos`,
        `${pack.moduleTargets.length} ligacoes com modulos do ecbyts`,
        `${pack.assets.length} assets associados`,
    ];
    if (pack.source.sourceFileName) whatYouWillFind.unshift(`Fonte: ${pack.source.sourceFileName}`);
    return {
        title: pack.title,
        sourceKind: pack.source.kind,
        sourceSemantics: pack.source.semantics,
        stats: {
            nodes: pack.graph.nodes.length,
            edges: pack.graph.edges.length,
            lanes: pack.graph.lanes.length,
            groups: pack.graph.groups.length,
            moduleTargets: pack.moduleTargets.length,
            assets: pack.assets.length,
            missingAssets,
            unresolvedTargets,
        },
        whatYouWillFind,
        modules: Array.from(moduleCounts.entries()).map(([moduleId, count]) => ({ moduleId, count })),
        pending: validation.errors.concat(validation.warnings).map((issue) => issue.message),
        score: validation.score,
    };
}

export function upsertPipelinePackModuleTarget(input: unknown, patch: PipelineModuleTargetPatch): PipelinePack {
    const pack = normalizePipelinePack(input);
    const nodes = new Map(pack.graph.nodes.map((node) => [node.id, node]));
    const target = _normalizeModuleTargetPatch(patch, nodes);
    const key = _targetKey(target);
    const matches = (item: PipelineModuleTarget): boolean => _targetKey(item) === key || item.id === target.id;
    // Editar um de-para que JA existe preserva a posicao original na lista. O
    // painel do Workbench mostra uma janela dos primeiros N destinos, entao
    // reanexar no fim empurrava para fora da janela justamente o ponto que o
    // usuario acabou de editar (ele perdia de vista o proprio trabalho).
    const previousIndex = pack.moduleTargets.findIndex(matches);
    const remaining = pack.moduleTargets.filter((item) => !matches(item));
    const nextTargets = previousIndex >= 0
        ? remaining.slice(0, previousIndex).concat(target, remaining.slice(previousIndex))
        : remaining.concat(target);
    const nextNodes = pack.graph.nodes.map((node) => {
        if (!target.ownerNodeId || node.id !== target.ownerNodeId) return node;
        return {
            ...node,
            targetModule: target.adapterId,
            moduleInputParams: {
                ...(node.moduleInputParams || {}),
                ...target.targetParams,
            },
        };
    });
    return normalizePipelinePack({
        ...pack,
        graph: {
            ...pack.graph,
            nodes: nextNodes,
        },
        moduleTargets: nextTargets,
    });
}

function _normalizeVariantPatch(patch: PipelinePackVariantPatch, pack: PipelinePack): PipelineVariant {
    const label = _nonEmpty(patch.label) || 'Variante sem titulo';
    const id = _nonEmpty(patch.id) || `variant-${_slug(label) || 'custom'}`;
    const captureCurrent = patch.captureCurrentModuleTargets !== false;
    const moduleTargets = patch.moduleTargets
        ? _normalizeTargets(patch.moduleTargets, pack.graph.nodes)
        : captureCurrent
            ? _normalizeTargets(pack.moduleTargets, pack.graph.nodes)
            : [];
    return {
        id,
        label,
        mode: patch.mode || 'edit',
        ...(_nonEmpty(patch.description) ? { description: _nonEmpty(patch.description) } : {}),
        ...(_nonEmpty(patch.baseVariantId) ? { baseVariantId: _nonEmpty(patch.baseVariantId) } : {}),
        ...(moduleTargets.length > 0 ? { moduleTargets } : {}),
    };
}

export function savePipelinePackVariant(input: unknown, patch: PipelinePackVariantPatch): PipelinePack {
    const pack = normalizePipelinePack(input);
    const variant = _normalizeVariantPatch(patch, pack);
    const nextVariants = pack.variants.filter((item) => item.id !== variant.id).concat(variant);
    return normalizePipelinePack({
        ...pack,
        variants: nextVariants,
    });
}

export function applyPipelinePackVariant(input: unknown, variantRef: string): PipelinePack {
    const pack = normalizePipelinePack(input);
    const ref = _nonEmpty(variantRef);
    const variant = pack.variants.find((item) => item.id === ref || item.label === ref);
    if (!variant?.moduleTargets?.length) return pack;
    return normalizePipelinePack({
        ...pack,
        moduleTargets: variant.moduleTargets,
    });
}

export function removePipelinePackModuleTarget(input: unknown, targetRef: string): PipelinePack {
    const pack = normalizePipelinePack(input);
    const ref = _nonEmpty(targetRef);
    const removedNodeIds = new Set<string>();
    const nextTargets = pack.moduleTargets.filter((target) => {
        const remove = target.id === ref || target.ownerNodeId === ref || target.ownerRegionId === ref;
        if (remove && target.ownerNodeId) removedNodeIds.add(target.ownerNodeId);
        return !remove;
    });
    const nextNodes = pack.graph.nodes.map((node) => {
        if (!removedNodeIds.has(node.id)) return node;
        const { targetModule: _targetModule, moduleInputParams: _moduleInputParams, ...rest } = node;
        return rest;
    });
    return normalizePipelinePack({
        ...pack,
        graph: {
            ...pack.graph,
            nodes: nextNodes,
        },
        moduleTargets: nextTargets,
    });
}
