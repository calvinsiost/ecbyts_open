// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Approval - Phase 11 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S14
 *
 * Phase 11 (2026-05-01) - pure-logic engine para multi-stage approval
 * routing. Define stages com quorum (any/majority/all/threshold), aprovações
 * paralelas, delegação e auto-promotion quando quorum é atingido.
 *
 * Estratégia:
 *   - Approval flow: stages[] sequencial, cada stage com quorum strategy
 *   - Decision: pendentes/aprovações/rejeições por stage
 *   - Quorum strategies: 'any' / 'majority' / 'all' / 'threshold'
 *   - Delegação: aprovador X delega para Y (lista linkada)
 *   - Engine puro: input(flow, decisions) → status + nextStageOnReady
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Quorum strategies canônicas. */
export const QUORUM_STRATEGIES = Object.freeze(['any', 'majority', 'all', 'threshold']);

/** Decision types canônicas. */
export const DECISION_TYPES = Object.freeze(['approve', 'reject', 'abstain', 'delegate']);

/** Flow status canônicos. */
export const FLOW_STATUS = Object.freeze(['pending', 'in_progress', 'approved', 'rejected', 'cancelled', 'expired']);

/** Identidade do módulo. */
export const APPROVAL_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 11,
    deliveredAt: '2026-05-01',
    quorumStrategies: QUORUM_STRATEGIES,
    decisionTypes: DECISION_TYPES,
    flowStatuses: FLOW_STATUS,
});

/**
 * Cria stage frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createStage(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createStage: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createStage: id required');
    }
    if (!(QUORUM_STRATEGIES as readonly string[]).includes(spec.quorum)) {
        throw new TypeError(`createStage: quorum must be one of ${QUORUM_STRATEGIES.join(',')}`);
    }
    const approvers = Array.isArray(spec.approvers)
        ? spec.approvers.filter((a: any) => typeof a === 'string' && a.trim())
        : [];
    if (approvers.length === 0) {
        throw new TypeError('createStage: at least one approver required');
    }

    let threshold = null;
    if (spec.quorum === 'threshold') {
        if (!Number.isInteger(spec.threshold) || spec.threshold <= 0 || spec.threshold > approvers.length) {
            throw new TypeError(`createStage: threshold must be integer 1..${approvers.length}`);
        }
        threshold = spec.threshold;
    }

    return Object.freeze({
        id: spec.id,
        name: spec.name || spec.id,
        quorum: spec.quorum,
        threshold,
        approvers: Object.freeze(approvers),
        rejectOnFirst: spec.rejectOnFirst === true,
        timeoutMs: Number.isFinite(spec.timeoutMs) ? spec.timeoutMs : null,
    });
}

/**
 * Cria flow (sequência de stages) frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createFlow(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createFlow: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createFlow: id required');
    }
    if (!Array.isArray(spec.stages) || spec.stages.length === 0) {
        throw new TypeError('createFlow: at least one stage required');
    }
    return Object.freeze({
        id: spec.id,
        documentId: spec.documentId || null,
        stages: Object.freeze(
            spec.stages.map((s: any) => (Object.isFrozen(s as any) ? s : createStage(s as any))),
        ),
        createdAt: Number.isFinite(spec.createdAt) ? spec.createdAt : Date.now(),
    });
}

/**
 * Cria decision frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createDecision(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createDecision: spec required');
    }
    if (!(DECISION_TYPES as readonly string[]).includes(spec.type)) {
        throw new TypeError(`createDecision: invalid type`);
    }
    if (typeof spec.actorId !== 'string' || !spec.actorId.trim()) {
        throw new TypeError('createDecision: actorId required');
    }
    if (typeof spec.stageId !== 'string' || !spec.stageId.trim()) {
        throw new TypeError('createDecision: stageId required');
    }
    return Object.freeze({
        type: spec.type,
        actorId: spec.actorId,
        stageId: spec.stageId,
        delegateTo: spec.type === 'delegate' ? spec.delegateTo || null : null,
        comment: spec.comment || '',
        timestamp: Number.isFinite(spec.timestamp) ? spec.timestamp : Date.now(),
    });
}

/**
 * Verifica se quorum foi atingido em um stage.
 *
 * @param {Record<string, any>} stage
 * @param {Array<Record<string, any>>} any>
 * @returns {{achieved: boolean, approvals: number, rejections: number, abstentions: number}}
 */
export function checkQuorum(
    stage: Record<string, any>,
    stageDecisions: Array<Record<string, any>>,
): Readonly<{ achieved: boolean; approvals: number; rejections: number; abstentions: number }> {
    if (!stage || !Array.isArray(stageDecisions)) {
        return Object.freeze({ achieved: false, approvals: 0, rejections: 0, abstentions: 0 });
    }
    const approvals = stageDecisions.filter((d) => d && d.type === 'approve').length;
    const rejections = stageDecisions.filter((d) => d && d.type === 'reject').length;
    const abstentions = stageDecisions.filter((d) => d && d.type === 'abstain').length;
    const totalApprovers = stage.approvers.length;

    let achieved = false;
    switch (stage.quorum) {
        case 'any':
            achieved = approvals >= 1;
            break;
        case 'all':
            achieved = approvals >= totalApprovers;
            break;
        case 'majority':
            achieved = approvals > totalApprovers / 2;
            break;
        case 'threshold':
            achieved = Number.isInteger(stage.threshold) && approvals >= stage.threshold;
            break;
    }

    return Object.freeze({ achieved, approvals, rejections, abstentions });
}

/**
 * Verifica se stage foi rejeitado (rejectOnFirst ou todos rejeitaram).
 *
 * @param {Record<string, any>} stage
 * @param {Array<Record<string, any>>} any>
 * @returns {boolean}
 */
export function isStageRejected(stage: Record<string, any>, stageDecisions: Array<Record<string, any>>): boolean {
    if (!stage || !Array.isArray(stageDecisions)) return false;
    const rejections = stageDecisions.filter((d) => d && d.type === 'reject').length;
    if (stage.rejectOnFirst === true && rejections >= 1) return true;
    // Default: stage rejeitado se todos os approvers (não absentees) votaram reject
    const approvals = stageDecisions.filter((d) => d && d.type === 'approve').length;
    const totalActed = approvals + rejections;
    if (totalActed === stage.approvers.length && rejections > approvals) return true;
    return false;
}

/**
 * Verifica se actor pode votar em stage.
 *
 * @param {Record<string, any>} stage
 * @param {string} any>
 * @returns {boolean}
 */
export function canVote(stage: Record<string, any>, actorId: string): boolean {
    if (!stage || typeof actorId !== 'string') return false;
    return stage.approvers.includes(actorId);
}

/**
 * Resolve stage atual pendente.
 *
 * @param {Record<string, any>} flow
 * @param {Array<Record<string, any>>} any>
 * @returns {{stageIndex: number, stage: any, status: string}}
 */
export function resolveCurrentStage(
    flow: Record<string, any>,
    allDecisions: Array<Record<string, any>>,
): Readonly<{ stageIndex: number; stage: any; status: string }> {
    if (!flow || !Array.isArray(flow.stages)) {
        return Object.freeze({ stageIndex: -1, stage: null, status: 'cancelled' });
    }
    const decisions = Array.isArray(allDecisions) ? allDecisions : [];

    for (let i = 0; i < flow.stages.length; i++) {
        const stage = flow.stages[i];
        const stageDecisions = decisions.filter((d) => d && d.stageId === stage.id);
        if (isStageRejected(stage, stageDecisions)) {
            return Object.freeze({ stageIndex: i, stage, status: 'rejected' });
        }
        const q = checkQuorum(stage, stageDecisions);
        if (!q.achieved) {
            return Object.freeze({ stageIndex: i, stage, status: 'in_progress' });
        }
    }
    return Object.freeze({
        stageIndex: flow.stages.length,
        stage: null,
        status: 'approved',
    });
}

/**
 * Determina status global do flow.
 *
 * @param {Object} flow
 * @param {Array<Record<string, any>>} allDecisions
 * @returns {string}
 */
export function evaluateFlow(flow: any, allDecisions: Array<Record<string, any>>): string {
    const r = resolveCurrentStage(flow, allDecisions);
    return r.status;
}

/**
 * Filtra decisions por stageId.
 *
 * @param {Array<Record<string, any>>} decisions
 * @param {string} any>>
 * @returns {Array<Object>}
 */
export function decisionsForStage(decisions: Array<Record<string, any>>, stageId: string): object[] {
    if (!Array.isArray(decisions)) return [];
    return decisions.filter((d) => d && d.stageId === stageId);
}

/**
 * Sumariza flow + decisions.
 *
 * @param {Record<string, any>} flow
 * @param {Array<Record<string, any>>} any>
 * @returns {{status: string, stageCount: number, currentStageIndex: number, totalApprovals: number, totalRejections: number, totalDecisions: number}}
 */
export function summarizeFlow(
    flow: Record<string, any>,
    allDecisions: Array<Record<string, any>>,
): {
    status: string;
    stageCount: number;
    currentStageIndex: number;
    totalApprovals: number;
    totalRejections: number;
    totalDecisions: number;
} {
    const empty = {
        status: 'cancelled',
        stageCount: 0,
        currentStageIndex: -1,
        totalApprovals: 0,
        totalRejections: 0,
        totalDecisions: 0,
    };
    if (!flow) return empty;
    const decisions = Array.isArray(allDecisions) ? allDecisions : [];
    const r = resolveCurrentStage(flow, decisions);
    const totalApprovals = decisions.filter((d) => d && d.type === 'approve').length;
    const totalRejections = decisions.filter((d) => d && d.type === 'reject').length;
    return {
        status: r.status,
        stageCount: flow.stages.length,
        currentStageIndex: r.stageIndex,
        totalApprovals,
        totalRejections,
        totalDecisions: decisions.length,
    };
}

/**
 * Module identity export.
 */
export const complianceApprovalMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 11,
    deliveredAt: '2026-05-01',
    quorumStrategies: QUORUM_STRATEGIES,
    decisionTypes: DECISION_TYPES,
    flowStatuses: FLOW_STATUS,
    exports: [
        'QUORUM_STRATEGIES',
        'DECISION_TYPES',
        'FLOW_STATUS',
        'APPROVAL_META',
        'createStage',
        'createFlow',
        'createDecision',
        'checkQuorum',
        'isStageRejected',
        'canVote',
        'resolveCurrentStage',
        'evaluateFlow',
        'decisionsForStage',
        'summarizeFlow',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
