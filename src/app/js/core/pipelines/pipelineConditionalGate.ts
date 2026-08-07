// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE CONDITIONAL GATE - reusable decision guidance.

   Converts process-specific decision nodes into a shared UI model:
   branches, missing inputs, mapped module and the next plain-language action.
   ================================================================ */

import {
    normalizePipelinePack,
    type PipelineModuleTarget,
    type PipelinePack,
    type PipelinePackEdge,
    type PipelinePackNode,
    type PipelineSemanticEntry,
    type PipelineTargetFallback,
} from './pipelinePack.js';
import {
    findPipelineDomainProfile,
    inferPipelineDomainProfile,
    listPipelineDomainGateTemplates,
    normalizePipelineDomainText,
    type PipelineDomainGateTemplate,
    type PipelineDomainProfile,
    type PipelineDomainProfileId,
} from './pipelineDomainProfile.js';

export type PipelineConditionalGateStatus = 'ready' | 'needs-inputs' | 'needs-branches' | 'unmapped';
export type PipelineConditionalGateRouteKind = 'approval' | 'rework' | 'not-applicable' | 'manual-review' | 'neutral';
export type PipelineConditionalGateCriterionSource =
    'condition-ref'
    | 'edge-label'
    | 'semantic-justification'
    | 'data-ref'
    | 'evidence-ref'
    | 'domain-profile'
    | 'node-params';

export interface PipelineConditionalGateCriterion {
    id: string;
    label: string;
    configured: boolean;
    source: PipelineConditionalGateCriterionSource;
    routeEdgeId?: string;
}

export interface PipelineConditionalGateBranch {
    edgeId: string;
    label: string;
    targetNodeId: string;
    targetLabel: string;
    kind: PipelinePackEdge['kind'];
    conditionRef: string;
    failureBehavior: PipelinePackEdge['failureBehavior'] | '';
    semanticJustification: string;
    dataRefs: string[];
    evidenceRefs: string[];
    routeKind: PipelineConditionalGateRouteKind;
    criteria: PipelineConditionalGateCriterion[];
    criterionLabel: string;
}

export interface PipelineConditionalGateRequiredInput {
    id: string;
    label: string;
    configured: boolean;
    source: 'domain-profile' | 'node-params';
}

export interface PipelineConditionalGateFallback {
    type: PipelineTargetFallback['type'] | 'missing';
    text: string;
    assetId: string;
    configured: boolean;
}

export interface PipelineConditionalGateNonApplicable {
    allowed: boolean;
    configured: boolean;
    label: string;
    routeLabels: string[];
    justificationRequired: boolean;
}

export interface PipelineConditionalGateApprovalRule {
    ready: boolean;
    label: string;
    approvalRouteLabels: string[];
    reworkRouteLabels: string[];
    notApplicableRouteLabels: string[];
    manualReviewRouteLabels: string[];
    missing: string[];
}

export interface PipelineConditionalGateViewModel {
    nodeId: string;
    label: string;
    question: string;
    description: string;
    domainProfileId: PipelineDomainProfileId;
    domainProfileLabel: string;
    templateId: string;
    templateLabel: string;
    status: PipelineConditionalGateStatus;
    statusLabel: string;
    moduleConfigured: boolean;
    moduleId: string;
    adapterId: string;
    branchCount: number;
    branches: PipelineConditionalGateBranch[];
    requiredInputs: PipelineConditionalGateRequiredInput[];
    criteriaByRoute: PipelineConditionalGateBranch[];
    fallback: PipelineConditionalGateFallback;
    nonApplicable: PipelineConditionalGateNonApplicable;
    approvalRule: PipelineConditionalGateApprovalRule;
    pending: string[];
    nextAction: string;
}

export interface PipelineConditionalGateSummary {
    profileId: PipelineDomainProfileId;
    profileLabel: string;
    total: number;
    ready: number;
    needsInputs: number;
    needsBranches: number;
    unmapped: number;
    completionPercent: number;
    topBlockers: string[];
    gates: PipelineConditionalGateViewModel[];
}

export interface PipelineConditionalGatePanelOptions {
    profile?: PipelineDomainProfile | PipelineDomainProfileId;
    maxGates?: number;
    includeStyle?: boolean;
}

export interface PipelineConditionalGateRoutePatch {
    edgeId: string;
    label?: string;
    routeKind?: PipelineConditionalGateRouteKind;
    /**
     * VINCULO da rota com a decisao (conditionRef). So aceita vazio ou o nodeId
     * da propria decisao — o protocolo rejeita qualquer outro valor. Para
     * escrever o criterio EM PALAVRAS use `justification`.
     */
    criterion?: string;
    /** Criterio em palavras (semanticJustification), texto livre do usuario. */
    justification?: string;
}

export interface PipelineConditionalGatePatch {
    nodeId: string;
    question?: string;
    allowNotApplicable?: boolean;
    notApplicableLabel?: string;
    routes?: PipelineConditionalGateRoutePatch[];
}

export interface PipelineConditionalGateValidation {
    ok: boolean;
    issues: string[];
    gate: PipelineConditionalGateViewModel | null;
}

const STATUS_LABELS: Record<PipelineConditionalGateStatus, string> = {
    ready: 'Pronto',
    'needs-inputs': 'Precisa preencher criterios',
    'needs-branches': 'Precisa conectar caminhos',
    unmapped: 'Precisa definir modulo equivalente',
};

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(_nonEmpty).filter(Boolean) : [];
}

function _unique(values: string[]): string[] {
    return Array.from(new Set(values.map(_nonEmpty).filter(Boolean)));
}

function _slug(value: unknown, fallback = 'item'): string {
    const slug = normalizePipelineDomainText(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || fallback;
}

function _truthy(value: unknown): boolean {
    if (value === true) return true;
    const raw = normalizePipelineDomainText(value);
    return ['1', 'true', 'sim', 'yes', 'y', 'ok'].includes(raw);
}

function _html(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _resolveProfile(input: unknown, profileInput?: PipelineDomainProfile | PipelineDomainProfileId): PipelineDomainProfile {
    if (profileInput && typeof profileInput === 'object') return profileInput;
    if (typeof profileInput === 'string') return findPipelineDomainProfile(profileInput) || inferPipelineDomainProfile(input).profile;
    return inferPipelineDomainProfile(input).profile;
}

function _semanticForNode(pack: PipelinePack, nodeId: string): PipelineSemanticEntry | null {
    return pack.semantics.entries.find((entry) => entry.nodeId === nodeId) || null;
}

function _targetForNode(pack: PipelinePack, nodeId: string): PipelineModuleTarget | null {
    return pack.moduleTargets.find((target) => target.ownerNodeId === nodeId) || null;
}

function _nodeSearchText(node: PipelinePackNode, semantic: PipelineSemanticEntry | null): string {
    return [
        node.id,
        node.type,
        node.label,
        node.contextLabel,
        node.semanticRole,
        node.targetModule,
        node.lane,
        node.phase,
        semantic?.label,
        semantic?.meaning,
        ...(semantic?.domainTags || []),
        ..._asStringArray(_asObject(node.moduleInputParams).requiredInputs),
    ].map(_nonEmpty).filter(Boolean).join(' ');
}

function _templateMatchScore(node: PipelinePackNode, semantic: PipelineSemanticEntry | null, template: PipelineDomainGateTemplate): number {
    const text = normalizePipelineDomainText(_nodeSearchText(node, semantic));
    let score = 0;
    for (const pattern of template.nodeIdPatterns) {
        if (normalizePipelineDomainText(node.id).includes(normalizePipelineDomainText(pattern))) score += 6;
    }
    for (const role of template.semanticRoles) {
        if (normalizePipelineDomainText(node.semanticRole).includes(normalizePipelineDomainText(role))) score += 5;
    }
    for (const term of template.labelTerms) {
        if (text.includes(normalizePipelineDomainText(term))) score += 2;
    }
    return score;
}

function _templateForNode(
    node: PipelinePackNode,
    semantic: PipelineSemanticEntry | null,
    templates: PipelineDomainGateTemplate[],
): PipelineDomainGateTemplate | null {
    const matches = templates
        .map((template) => ({ template, score: _templateMatchScore(node, semantic, template) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
    return matches[0]?.template || null;
}

function _isGateNode(node: PipelinePackNode, semantic: PipelineSemanticEntry | null, templates: PipelineDomainGateTemplate[]): boolean {
    const type = normalizePipelineDomainText(node.type);
    const role = normalizePipelineDomainText(node.semanticRole);
    const explicitGate = type.includes('condition')
        || type.includes('gateway')
        || type.includes('decision')
        || role.includes('decision')
        || role.includes('gateway')
        || node.label.includes('?');
    if (explicitGate) return true;

    const template = _templateForNode(node, semantic, templates);
    if (!template) return false;
    const nodeId = normalizePipelineDomainText(node.id);
    const strongIdMatch = template.nodeIdPatterns.some((pattern) => nodeId.includes(normalizePipelineDomainText(pattern)));
    const strongRoleMatch = template.semanticRoles.some((templateRole) => role.includes(normalizePipelineDomainText(templateRole)));
    return strongIdMatch || strongRoleMatch;
}

function _branchLabel(edge: PipelinePackEdge, target: PipelinePackNode | null): string {
    return _nonEmpty(edge.label) || target?.label || `Caminho para ${edge.target}`;
}

const ROUTE_KIND_VALUES: PipelineConditionalGateRouteKind[] = [
    'approval',
    'rework',
    'not-applicable',
    'manual-review',
    'neutral',
];

function _routeKindOverrides(node: PipelinePackNode | null | undefined): Map<string, PipelineConditionalGateRouteKind> {
    const raw = _asObject(_asObject(node?.moduleInputParams).routeKinds);
    const out = new Map<string, PipelineConditionalGateRouteKind>();
    for (const [edgeId, value] of Object.entries(raw)) {
        const kind = _nonEmpty(value) as PipelineConditionalGateRouteKind;
        if (ROUTE_KIND_VALUES.includes(kind)) out.set(edgeId, kind);
    }
    return out;
}

function _routeKind(edge: PipelinePackEdge, label: string): PipelineConditionalGateRouteKind {
    const text = normalizePipelineDomainText([
        edge.conditionRef,
        edge.label,
        label,
        edge.semanticJustification,
        edge.failureBehavior,
    ].map(_nonEmpty).filter(Boolean).join(' '));
    if (edge.failureBehavior === 'skip' || /(nao aplicavel|\bn\/a\b|\bn a\b|sem aplicacao|dispensad|pular|skip)/.test(text)) {
        return 'not-applicable';
    }
    if (edge.failureBehavior === 'human-decision' || /(revisao humana|decisao humana|arbitrar|manual)/.test(text)) {
        return 'manual-review';
    }
    if (edge.failureBehavior === 'rework'
        || /(nao|no|ajustar|revisar|retrabalho|corrigir|reprocessar|reconciliar|recircular|remoagem|voltar)/.test(text)) {
        return 'rework';
    }
    if (/(sim|yes|aprovad|aprovar|seguir|ok|liberad|aceit|fechar|publicar|concluir|pronto)/.test(text)) {
        return 'approval';
    }
    return 'neutral';
}

function _criterion(
    edge: PipelinePackEdge,
    label: string,
    source: PipelineConditionalGateCriterionSource,
    configured = true,
): PipelineConditionalGateCriterion {
    return {
        id: `${edge.id}:${source}:${_slug(label, 'criterio')}`,
        label: _humanizeInput(label),
        configured,
        source,
        routeEdgeId: edge.id,
    };
}

function _criteriaForEdge(edge: PipelinePackEdge, label: string): PipelineConditionalGateCriterion[] {
    const rows: PipelineConditionalGateCriterion[] = [];
    const conditionRef = _nonEmpty(edge.conditionRef);
    const semanticJustification = _nonEmpty(edge.semanticJustification);
    if (conditionRef) rows.push(_criterion(edge, conditionRef, 'condition-ref'));
    if (semanticJustification) rows.push(_criterion(edge, semanticJustification, 'semantic-justification'));
    for (const ref of edge.dataRefs || []) rows.push(_criterion(edge, ref, 'data-ref'));
    for (const ref of edge.evidenceRefs || []) rows.push(_criterion(edge, ref, 'evidence-ref'));
    if (rows.length === 0) {
        const explicitLabel = _nonEmpty(edge.label);
        rows.push(_criterion(
            edge,
            explicitLabel || `Definir criterio da rota ${label}`,
            'edge-label',
            Boolean(explicitLabel),
        ));
    }
    return rows;
}

function _branchesForNode(pack: PipelinePack, nodeId: string): PipelineConditionalGateBranch[] {
    const nodesById = new Map(pack.graph.nodes.map((node) => [node.id, node]));
    const routeKindOverrides = _routeKindOverrides(nodesById.get(nodeId));
    return pack.graph.edges
        .filter((edge) => edge.source === nodeId && edge.kind === 'control-flow')
        .map((edge) => {
            const target = nodesById.get(edge.target) || null;
            const label = _branchLabel(edge, target);
            const criteria = _criteriaForEdge(edge, label);
            return {
                edgeId: edge.id,
                label,
                targetNodeId: edge.target,
                targetLabel: target?.label || edge.target,
                kind: edge.kind,
                conditionRef: _nonEmpty(edge.conditionRef),
                failureBehavior: edge.failureBehavior || '',
                semanticJustification: _nonEmpty(edge.semanticJustification),
                dataRefs: edge.dataRefs || [],
                evidenceRefs: edge.evidenceRefs || [],
                routeKind: routeKindOverrides.get(edge.id) || _routeKind(edge, label),
                criteria,
                criterionLabel: criteria.map((criterionRow) => criterionRow.label).join('; '),
            };
        });
}

function _configuredInputSet(node: PipelinePackNode, target: PipelineModuleTarget | null): Set<string> {
    const sources = [
        _asObject(node.moduleInputParams),
        _asObject(target?.targetParams),
    ];
    const configured = new Set<string>();
    for (const source of sources) {
        for (const key of ['inputValues', 'evidenceInputs', 'calibratedInputs'] as const) {
            const values = _asObject(source[key]);
            for (const valueKey of Object.keys(values)) {
                if (_nonEmpty(values[valueKey]) || values[valueKey] === 0 || values[valueKey] === false) {
                    configured.add(normalizePipelineDomainText(valueKey));
                }
            }
        }
        for (const value of _asStringArray(source.configuredInputs)) {
            configured.add(normalizePipelineDomainText(value));
        }
    }
    return configured;
}

function _humanizeInput(value: string): string {
    return value
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function _requiredInputsForGate(
    node: PipelinePackNode,
    target: PipelineModuleTarget | null,
    template: PipelineDomainGateTemplate | null,
): PipelineConditionalGateRequiredInput[] {
    const configured = _configuredInputSet(node, target);
    const fromProfile = template?.requiredInputs || [];
    const fromParams = _asStringArray(_asObject(node.moduleInputParams).requiredInputs);
    const rows: PipelineConditionalGateRequiredInput[] = [];
    for (const value of _unique(fromProfile)) {
        rows.push({
            id: value,
            label: _humanizeInput(value),
            configured: configured.has(normalizePipelineDomainText(value)),
            source: 'domain-profile',
        });
    }
    for (const value of _unique(fromParams)) {
        if (rows.some((row) => normalizePipelineDomainText(row.id) === normalizePipelineDomainText(value))) continue;
        rows.push({
            id: value,
            label: _humanizeInput(value),
            configured: configured.has(normalizePipelineDomainText(value)),
            source: 'node-params',
        });
    }
    return rows;
}

function _questionForGate(
    node: PipelinePackNode,
    target: PipelineModuleTarget | null,
    template: PipelineDomainGateTemplate | null,
): string {
    const nodeParams = _asObject(node.moduleInputParams);
    const targetParams = _asObject(target?.targetParams);
    const explicit = _nonEmpty(nodeParams.question) || _nonEmpty(targetParams.question);
    if (explicit) return explicit.endsWith('?') ? explicit : `${explicit}?`;
    const label = _nonEmpty(node.label);
    if (label.endsWith('?')) return label;
    return `${template?.label || label || 'Decisao'}?`;
}

function _fallbackForGate(target: PipelineModuleTarget | null): PipelineConditionalGateFallback {
    const fallback = target?.fallback || null;
    const type = fallback?.type || 'missing';
    const text = _nonEmpty(fallback?.text);
    const assetId = _nonEmpty(fallback?.assetId);
    const configured = Boolean(target && type !== 'none' && (type === 'snapshot' || text || assetId));
    return {
        type,
        text: text || 'Plano B nao configurado.',
        assetId,
        configured,
    };
}

function _nonApplicableForGate(
    node: PipelinePackNode,
    target: PipelineModuleTarget | null,
    branches: PipelineConditionalGateBranch[],
): PipelineConditionalGateNonApplicable {
    const nodeParams = _asObject(node.moduleInputParams);
    const targetParams = _asObject(target?.targetParams);
    const routeLabels = branches
        .filter((branch) => branch.routeKind === 'not-applicable')
        .map((branch) => branch.label);
    const explicitAllowed = _truthy(nodeParams.allowNotApplicable)
        || _truthy(nodeParams.nonApplicableAllowed)
        || _truthy(nodeParams.naoAplicavel)
        || _truthy(targetParams.allowNotApplicable)
        || _truthy(targetParams.nonApplicableAllowed)
        || _truthy(targetParams.naoAplicavel);
    const configured = routeLabels.length > 0;
    const label = _nonEmpty(nodeParams.nonApplicableLabel)
        || _nonEmpty(targetParams.nonApplicableLabel)
        || routeLabels[0]
        || 'Nao aplicavel com justificativa';
    return {
        allowed: explicitAllowed || configured,
        configured,
        label,
        routeLabels,
        justificationRequired: true,
    };
}

function _approvalRuleForGate(
    branches: PipelineConditionalGateBranch[],
    requiredInputs: PipelineConditionalGateRequiredInput[],
    fallback: PipelineConditionalGateFallback,
    nonApplicable: PipelineConditionalGateNonApplicable,
): PipelineConditionalGateApprovalRule {
    const approvalRouteLabels = branches.filter((branch) => branch.routeKind === 'approval').map((branch) => branch.label);
    const reworkRouteLabels = branches.filter((branch) => branch.routeKind === 'rework').map((branch) => branch.label);
    const notApplicableRouteLabels = branches.filter((branch) => branch.routeKind === 'not-applicable').map((branch) => branch.label);
    const manualReviewRouteLabels = branches.filter((branch) => branch.routeKind === 'manual-review').map((branch) => branch.label);
    const missing: string[] = [];
    const missingInputs = requiredInputs.filter((input) => !input.configured);
    const missingRouteCriteria = branches
        .filter((branch) => branch.criteria.some((criterionRow) => !criterionRow.configured))
        .map((branch) => branch.label);
    if (approvalRouteLabels.length === 0) missing.push('Definir rota de aprovacao.');
    if (reworkRouteLabels.length === 0) missing.push('Definir rota de retrabalho.');
    if (missingInputs.length > 0) {
        missing.push(`Preencher criterios obrigatorios: ${missingInputs.slice(0, 5).map((input) => input.label).join(', ')}.`);
    }
    if (missingRouteCriteria.length > 0) {
        missing.push(`Preencher criterio por rota: ${missingRouteCriteria.slice(0, 5).join(', ')}.`);
    }
    if (!fallback.configured) missing.push('Configurar plano B para a decisao.');
    if (nonApplicable.allowed && !nonApplicable.configured) {
        missing.push('Conectar rota de nao aplicavel ou remover esta opcao.');
    }
    const ready = missing.length === 0;
    const approvalLabel = approvalRouteLabels.length ? `aprovacao: ${approvalRouteLabels.join(', ')}` : 'aprovacao sem rota';
    const reworkLabel = reworkRouteLabels.length ? `retrabalho: ${reworkRouteLabels.join(', ')}` : 'retrabalho sem rota';
    const naLabel = notApplicableRouteLabels.length ? `nao aplicavel: ${notApplicableRouteLabels.join(', ')}` : '';
    return {
        ready,
        label: [approvalLabel, reworkLabel, naLabel].filter(Boolean).join(' | '),
        approvalRouteLabels,
        reworkRouteLabels,
        notApplicableRouteLabels,
        manualReviewRouteLabels,
        missing,
    };
}

function _statusForGate(
    target: PipelineModuleTarget | null,
    branches: PipelineConditionalGateBranch[],
    requiredInputs: PipelineConditionalGateRequiredInput[],
    template: PipelineDomainGateTemplate | null,
    fallback: PipelineConditionalGateFallback,
    approvalRule: PipelineConditionalGateApprovalRule,
): PipelineConditionalGateStatus {
    if (!target?.moduleId || !target.adapterId) return 'unmapped';
    const minimumBranches = Math.min(Math.max(template?.expectedBranches.length || 2, 2), 3);
    if (branches.length < minimumBranches) return 'needs-branches';
    if (requiredInputs.some((input) => !input.configured)
        || branches.some((branch) => branch.criteria.some((criterionRow) => !criterionRow.configured))
        || !fallback.configured
        || !approvalRule.ready) {
        return 'needs-inputs';
    }
    return 'ready';
}

function _pendingForStatus(
    status: PipelineConditionalGateStatus,
    branches: PipelineConditionalGateBranch[],
    requiredInputs: PipelineConditionalGateRequiredInput[],
    fallback: PipelineConditionalGateFallback,
    approvalRule: PipelineConditionalGateApprovalRule,
): string[] {
    if (status === 'ready') return ['Decisao pronta para orientar o usuario.'];
    if (status === 'unmapped') return ['Definir o modulo equivalente que abre quando o usuario clicar nesta decisao.'];
    if (status === 'needs-branches') return [`Conectar pelo menos dois caminhos visiveis; hoje ha ${branches.length}.`];
    const missing = requiredInputs.filter((input) => !input.configured).slice(0, 5).map((input) => input.label);
    const pending: string[] = [];
    if (missing.length > 0) pending.push(`Preencher criterios antes de liberar esta decisao: ${missing.join(', ')}.`);
    const missingRouteCriteria = branches
        .filter((branch) => branch.criteria.some((criterionRow) => !criterionRow.configured))
        .slice(0, 5)
        .map((branch) => branch.label);
    if (missingRouteCriteria.length > 0) pending.push(`Preencher criterio por rota: ${missingRouteCriteria.join(', ')}.`);
    if (!fallback.configured) pending.push('Configurar plano B para quando a area nao abrir ou faltar evidencia.');
    for (const item of approvalRule.missing) {
        if (!pending.includes(item)) pending.push(item);
    }
    return pending.length ? pending : ['Revisar criterios de aprovacao e retrabalho antes de liberar esta decisao.'];
}

function _nextAction(
    status: PipelineConditionalGateStatus,
    template: PipelineDomainGateTemplate | null,
    target: PipelineModuleTarget | null,
    fallback: PipelineConditionalGateFallback,
    approvalRule: PipelineConditionalGateApprovalRule,
): string {
    if (status === 'ready') return template?.userCheck || 'Testar a decisao no fluxo aberto.';
    if (status === 'unmapped') return 'Escolher modulo equivalente, adaptador e plano B antes de usar esta decisao em aula.';
    if (status === 'needs-branches') return 'Adicionar ou revisar os caminhos de saida para o usuario entender o que acontece em cada resposta.';
    if (!fallback.configured) return 'Configurar o plano B da decisao antes de liberar a rota.';
    if (target?.moduleId === 'files') return 'Anexar ou apontar as evidencias que comprovam a decisao.';
    if (template?.userCheck) return template.userCheck;
    if (!approvalRule.ready && approvalRule.missing.length > 0) {
        return approvalRule.missing[0] || 'Revisar a regra de aprovacao e retrabalho da decisao.';
    }
    return template?.userCheck || 'Preencher os criterios de decisao no modulo equivalente.';
}

function _gateViewModel(
    pack: PipelinePack,
    node: PipelinePackNode,
    profile: PipelineDomainProfile,
    templates: PipelineDomainGateTemplate[],
): PipelineConditionalGateViewModel {
    const semantic = _semanticForNode(pack, node.id);
    const target = _targetForNode(pack, node.id);
    const template = _templateForNode(node, semantic, templates);
    const branches = _branchesForNode(pack, node.id);
    const requiredInputs = _requiredInputsForGate(node, target, template);
    const fallback = _fallbackForGate(target);
    const nonApplicable = _nonApplicableForGate(node, target, branches);
    const approvalRule = _approvalRuleForGate(branches, requiredInputs, fallback, nonApplicable);
    const status = _statusForGate(target, branches, requiredInputs, template, fallback, approvalRule);
    return {
        nodeId: node.id,
        label: node.label,
        question: _questionForGate(node, target, template),
        description: template?.description || semantic?.meaning || node.contextLabel || node.label,
        domainProfileId: profile.id,
        domainProfileLabel: profile.label,
        templateId: template?.id || 'generic-route-decision',
        templateLabel: template?.label || 'Decisao de rota',
        status,
        statusLabel: STATUS_LABELS[status],
        moduleConfigured: Boolean(target?.moduleId && target.adapterId),
        moduleId: target?.moduleId || '',
        adapterId: target?.adapterId || '',
        branchCount: branches.length,
        branches,
        requiredInputs,
        criteriaByRoute: branches,
        fallback,
        nonApplicable,
        approvalRule,
        pending: _pendingForStatus(status, branches, requiredInputs, fallback, approvalRule),
        nextAction: _nextAction(status, template, target, fallback, approvalRule),
    };
}

function _routeKindToFailureBehavior(
    kind: PipelineConditionalGateRouteKind,
    current: PipelinePackEdge['failureBehavior'] | undefined,
): PipelinePackEdge['failureBehavior'] | undefined {
    if (kind === 'not-applicable') return 'skip';
    if (kind === 'rework') return 'rework';
    if (kind === 'manual-review') return 'human-decision';
    // approval/neutral: remove o comportamento de falha que classificaria a
    // rota como retrabalho/nao aplicavel/revisao; preserva block/warn ja
    // configurados no conector.
    if (current === 'skip' || current === 'rework' || current === 'human-decision') return undefined;
    return current;
}

/**
 * Aplica a edicao da UI do gate condicional (pergunta, criterios por rota,
 * tipo de cada rota e opcao nao-aplicavel) sobre o Pipeline Pack.
 * Pure: devolve um pack novo normalizado; entrada invalida devolve o pack
 * original sem lancar erro.
 */
export function updatePipelineConditionalGate(input: unknown, patch: PipelineConditionalGatePatch): PipelinePack {
    const pack = normalizePipelinePack(input);
    const nodeId = _nonEmpty(patch?.nodeId);
    if (!nodeId) return pack;
    const node = pack.graph.nodes.find((item) => item.id === nodeId);
    if (!node) return pack;
    const routePatches = new Map<string, PipelineConditionalGateRoutePatch>();
    for (const route of Array.isArray(patch.routes) ? patch.routes : []) {
        const edgeId = _nonEmpty(route?.edgeId);
        if (edgeId) routePatches.set(edgeId, route);
    }
    const gateEdgeIds = new Set(
        pack.graph.edges
            .filter((edge) => edge.source === nodeId && edge.kind === 'control-flow')
            .map((edge) => edge.id),
    );
    const nextEdges = pack.graph.edges.map((edge) => {
        if (!gateEdgeIds.has(edge.id)) return edge;
        const routePatch = routePatches.get(edge.id);
        if (!routePatch) return edge;
        const next: PipelinePackEdge = { ...edge };
        if (routePatch.label !== undefined) {
            const label = _nonEmpty(routePatch.label);
            if (label) next.label = label;
            else delete next.label;
        }
        if (routePatch.criterion !== undefined) {
            const criterion = _nonEmpty(routePatch.criterion);
            if (criterion) next.conditionRef = criterion;
            else delete next.conditionRef;
        }
        if (routePatch.justification !== undefined) {
            const justification = _nonEmpty(routePatch.justification);
            if (justification) next.semanticJustification = justification;
            else delete next.semanticJustification;
        }
        if (routePatch.routeKind && ROUTE_KIND_VALUES.includes(routePatch.routeKind)) {
            const behavior = _routeKindToFailureBehavior(routePatch.routeKind, next.failureBehavior);
            if (behavior) next.failureBehavior = behavior;
            else delete next.failureBehavior;
        }
        return next;
    });
    const params: Record<string, unknown> = { ..._asObject(node.moduleInputParams) };
    if (patch.question !== undefined) {
        const question = _nonEmpty(patch.question);
        if (question) params.question = question;
        else delete params.question;
    }
    if (typeof patch.allowNotApplicable === 'boolean') {
        params.allowNotApplicable = patch.allowNotApplicable;
    }
    if (patch.notApplicableLabel !== undefined) {
        const notApplicableLabel = _nonEmpty(patch.notApplicableLabel);
        if (notApplicableLabel) params.nonApplicableLabel = notApplicableLabel;
        else delete params.nonApplicableLabel;
    }
    const routeKindPatches = Array.from(routePatches.values())
        .filter((route) => route.routeKind && ROUTE_KIND_VALUES.includes(route.routeKind));
    if (routeKindPatches.length > 0) {
        const routeKinds: Record<string, unknown> = { ..._asObject(params.routeKinds) };
        for (const route of routeKindPatches) {
            routeKinds[_nonEmpty(route.edgeId)] = route.routeKind;
        }
        params.routeKinds = routeKinds;
    }
    const nextNodes = pack.graph.nodes.map((item) =>
        item.id === nodeId ? { ...item, moduleInputParams: params } : item,
    );
    return normalizePipelinePack({
        ...pack,
        graph: {
            ...pack.graph,
            nodes: nextNodes,
            edges: nextEdges,
        },
    });
}

/**
 * Valida o rascunho da UI do gate condicional ANTES de salvar: aplica o
 * patch numa copia pure e confere pergunta, criterio por rota e coerencia
 * da opcao nao-aplicavel. Nunca lanca erro; devolve issues em linguagem
 * humana para a UI mostrar.
 */
export function validatePipelineConditionalGateDraft(
    input: unknown,
    patch: PipelineConditionalGatePatch,
): PipelineConditionalGateValidation {
    const pack = normalizePipelinePack(input);
    const nodeId = _nonEmpty(patch?.nodeId);
    if (!nodeId) return { ok: false, issues: ['Selecione a decisao antes de salvar.'], gate: null };
    if (!pack.graph.nodes.some((node) => node.id === nodeId)) {
        return { ok: false, issues: ['Decisao nao encontrada neste processo.'], gate: null };
    }
    const next = updatePipelineConditionalGate(pack, patch);
    const gate = extractPipelineConditionalGates(next).find((item) => item.nodeId === nodeId) || null;
    if (!gate) return { ok: false, issues: ['Este ponto nao e uma decisao condicional.'], gate: null };
    const issues: string[] = [];
    const knownEdgeIds = new Set(gate.branches.map((branch) => branch.edgeId));
    for (const route of Array.isArray(patch.routes) ? patch.routes : []) {
        const edgeId = _nonEmpty(route?.edgeId);
        if (edgeId && !knownEdgeIds.has(edgeId)) {
            issues.push('Uma das rotas nao pertence mais a esta decisao; recarregue o painel.');
        }
    }
    if (!_nonEmpty(gate.question)) issues.push('Preencha a pergunta da decisao.');
    // O protocolo so aceita uma rota vinculada a PROPRIA decisao de origem
    // (pipelineProtocol: gate.route.broken / connector.conditionRef.unresolved).
    // Validar aqui faz o bloqueio acontecer no salvamento da decisao, em vez de
    // so na exportacao — antes disso um vinculo invalido era aceito em verde e
    // deixava o processo inexportavel.
    for (const branch of gate.branches) {
        const conditionRef = _nonEmpty(branch.conditionRef);
        if (conditionRef && conditionRef !== gate.nodeId) {
            issues.push(
                `A rota "${branch.label}" esta vinculada a uma condicao que nao existe neste processo. `
                + 'Escolha "Vincular a esta decisao" ou deixe a rota sem condicao.',
            );
        }
    }
    for (const branch of gate.branches) {
        if (!branch.criteria.some((criterionRow) => criterionRow.configured)) {
            issues.push(`Preencha o criterio da rota "${branch.label}".`);
        }
    }
    if (gate.nonApplicable.allowed && !gate.nonApplicable.configured) {
        issues.push('Marque uma rota como "nao aplicavel" ou desative esta opcao.');
    }
    return { ok: issues.length === 0, issues, gate };
}

export function extractPipelineConditionalGates(
    input: unknown,
    profileInput?: PipelineDomainProfile | PipelineDomainProfileId,
): PipelineConditionalGateViewModel[] {
    const pack = normalizePipelinePack(input);
    const profile = _resolveProfile(pack, profileInput);
    const templates = listPipelineDomainGateTemplates(profile);
    return pack.graph.nodes
        .filter((node) => _isGateNode(node, _semanticForNode(pack, node.id), templates))
        .map((node) => _gateViewModel(pack, node, profile, templates))
        .sort((a, b) => {
            const statusOrder: Record<PipelineConditionalGateStatus, number> = {
                unmapped: 0,
                'needs-branches': 1,
                'needs-inputs': 2,
                ready: 3,
            };
            return statusOrder[a.status] - statusOrder[b.status] || a.label.localeCompare(b.label);
        });
}

export function summarizePipelineConditionalGates(
    input: unknown,
    profileInput?: PipelineDomainProfile | PipelineDomainProfileId,
): PipelineConditionalGateSummary {
    const pack = normalizePipelinePack(input);
    const profile = _resolveProfile(pack, profileInput);
    const gates = extractPipelineConditionalGates(pack, profile);
    const ready = gates.filter((gate) => gate.status === 'ready').length;
    const needsInputs = gates.filter((gate) => gate.status === 'needs-inputs').length;
    const needsBranches = gates.filter((gate) => gate.status === 'needs-branches').length;
    const unmapped = gates.filter((gate) => gate.status === 'unmapped').length;
    const total = gates.length;
    return {
        profileId: profile.id,
        profileLabel: profile.label,
        total,
        ready,
        needsInputs,
        needsBranches,
        unmapped,
        completionPercent: total > 0 ? Math.round((ready / total) * 1000) / 10 : 100,
        topBlockers: gates
            .filter((gate) => gate.status !== 'ready')
            .slice(0, 5)
            .map((gate) => `${gate.label}: ${gate.pending[0]}`),
        gates,
    };
}

function _routeKindLabel(kind: PipelineConditionalGateRouteKind): string {
    if (kind === 'approval') return 'Aprovacao';
    if (kind === 'rework') return 'Retrabalho';
    if (kind === 'not-applicable') return 'Nao aplicavel';
    if (kind === 'manual-review') return 'Revisao humana';
    return 'Rota';
}

function _gatePanelStyle(): string {
    return `<style>
      .pipeline-conditional-gate-panel{display:grid;gap:10px}
      .pipeline-conditional-gate-card{display:grid;gap:8px;padding:10px;border:1px solid #273449;border-radius:6px;background:#101b2b;color:#dbeafe;font:12px system-ui}
      .pipeline-conditional-gate-card h4,.pipeline-conditional-gate-card p{margin:0}
      .pipeline-conditional-gate-card h4{font-size:13px;color:#f8fafc}
      .pipeline-conditional-gate-card small{color:#a8b7ca}
      .pipeline-conditional-gate-row{display:grid;gap:2px;padding:7px;border:1px solid #273449;border-radius:6px;background:#0b1322}
      .pipeline-conditional-gate-routes{display:grid;gap:6px}
      .pipeline-conditional-gate-route{display:grid;gap:2px;padding:7px;border:1px solid #334155;border-radius:6px;background:#162235}
    </style>`;
}

function _gateRoutesHtml(gate: PipelineConditionalGateViewModel): string {
    return gate.branches.map((branch) => {
        const criteria = branch.criteria.length
            ? branch.criteria.map((criterionRow) =>
                `<small data-pipeline-conditional-gate-criterion-source="${_html(criterionRow.source)}">${_html(criterionRow.label)}${criterionRow.configured ? '' : ' (pendente)'}</small>`,
            ).join('')
            : '<small>Sem criterio de rota.</small>';
        return `<div class="pipeline-conditional-gate-route"
                     data-pipeline-conditional-gate-route-kind="${_html(branch.routeKind)}"
                     data-pipeline-conditional-gate-condition-ref="${_html(branch.conditionRef)}"
                     data-pipeline-conditional-gate-edge-id="${_html(branch.edgeId)}">
          <strong>${_html(branch.label)} - ${_html(_routeKindLabel(branch.routeKind))}</strong>
          <small>${_html(branch.targetLabel)}</small>
          ${criteria}
        </div>`;
    }).join('');
}

function _gateCardHtml(gate: PipelineConditionalGateViewModel): string {
    const missing = gate.pending.map((item) => `<li>${_html(item)}</li>`).join('');
    const notApplicable = gate.nonApplicable.allowed
        ? `${gate.nonApplicable.configured ? 'Configurado' : 'Pendente'}: ${gate.nonApplicable.routeLabels.join(', ') || gate.nonApplicable.label}`
        : 'Nao habilitado';
    return `<article class="pipeline-conditional-gate-card"
                    data-pipeline-conditional-gate-node-id="${_html(gate.nodeId)}"
                    data-pipeline-conditional-gate-status="${_html(gate.status)}"
                    data-pipeline-conditional-gate-template="${_html(gate.templateId)}">
      <h4>${_html(gate.label)}</h4>
      <p data-pipeline-conditional-gate-question="true">${_html(gate.question)}</p>
      <div class="pipeline-conditional-gate-row">
        <strong>${_html(gate.statusLabel)}</strong>
        <small>${_html(gate.description)}</small>
      </div>
      <div class="pipeline-conditional-gate-routes" data-pipeline-conditional-gate-routes="true">${_gateRoutesHtml(gate)}</div>
      <div class="pipeline-conditional-gate-row" data-pipeline-conditional-gate-approval-rule="true">
        <strong>${_html(gate.approvalRule.ready ? 'Regra pronta' : 'Regra pendente')}</strong>
        <small>${_html(gate.approvalRule.label)}</small>
      </div>
      <div class="pipeline-conditional-gate-row" data-pipeline-conditional-gate-fallback="${_html(gate.fallback.configured ? 'configured' : 'missing')}">
        <strong>Plano B</strong>
        <small>${_html(gate.fallback.text)}</small>
      </div>
      <div class="pipeline-conditional-gate-row" data-pipeline-conditional-gate-not-applicable="${_html(gate.nonApplicable.configured ? 'configured' : gate.nonApplicable.allowed ? 'pending' : 'disabled')}">
        <strong>Nao aplicavel</strong>
        <small>${_html(notApplicable)}</small>
      </div>
      <ul>${missing}</ul>
    </article>`;
}

export function renderPipelineConditionalGatePanelHtml(
    input: unknown,
    options: PipelineConditionalGatePanelOptions = {},
): string {
    const summary = summarizePipelineConditionalGates(input, options.profile);
    const limit = Math.max(1, Math.floor(Number(options.maxGates) || summary.gates.length || 1));
    const cards = summary.gates.slice(0, limit).map(_gateCardHtml).join('')
        || '<div class="pipeline-conditional-gate-card" data-pipeline-conditional-gate-empty="true">Nenhuma decisao condicional encontrada.</div>';
    return `${options.includeStyle === false ? '' : _gatePanelStyle()}
      <section class="pipeline-conditional-gate-panel"
               data-pipeline-conditional-gate-panel="true"
               data-pipeline-conditional-gate-profile="${_html(summary.profileId)}"
               data-pipeline-conditional-gate-total="${_html(summary.total)}"
               data-pipeline-conditional-gate-ready="${_html(summary.ready)}">
        ${cards}
      </section>`;
}
