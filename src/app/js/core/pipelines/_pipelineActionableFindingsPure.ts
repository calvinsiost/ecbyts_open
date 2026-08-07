// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PIPELINE ACTIONABLE FINDINGS - pure score-to-pendencies translator
   (PIPELINE-PACK-CUSTOMIZATION-001 #2).

   "Criar validador explicavel que transforma o score em pendencias
   claras, com acao sugerida e item responsavel por cada bloqueio."
   (SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md, secao 3.1).

   Reuses the existing PipelineProtocolIssue shape (userMessage/
   suggestedFix/blocksPublish/ownerItemId) instead of inventing a new
   severity taxonomy. Turns the pack score breakdown + protocol issues
   into a single prioritized list of actionable findings.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

/** Severidade reaproveitada de PipelineProtocolIssue (sem taxonomia nova). */
export type ActionableFindingSeverity = 'error' | 'warning';

/**
 * Fatia da decomposicao do score do pack usada para estimar o peso de
 * cada achado. Cada dimensao representa uma categoria de nota (ex.:
 * "score", "visual", "testes") com seu deficit em relacao a meta.
 */
export interface PipelinePackScoreDimension {
    id: string;
    label?: string;
    weight?: number;
    value?: number;
    target?: number;
}

/** Decomposicao minima do score do pack usada como entrada pura. */
export interface PipelinePackScoreBreakdown {
    total?: number;
    minScore?: number;
    dimensions?: PipelinePackScoreDimension[];
}

/**
 * Subconjunto de PipelineProtocolIssue consumido por este modulo. Aceita
 * o tipo completo (pipelineProtocol.ts) sem precisar importa-lo, evitando
 * acoplamento circular entre modulos pure.
 */
export interface ActionableFindingIssueInput {
    severity?: ActionableFindingSeverity;
    code?: string;
    technicalCode?: string;
    message?: string;
    userMessage?: string;
    suggestedFix?: string;
    blocksPublish?: boolean;
    ownerItemId?: string;
    targetId?: string;
}

/** Achado acionavel: pendencia com mensagem leiga e proxima acao. */
export interface ActionableFinding {
    severity: ActionableFindingSeverity;
    technicalCode: string;
    userMessage: string;
    suggestedFix: string;
    blocksPublish: boolean;
    ownerItemId: string;
    scoreImpact: number;
}

function _text(value: unknown, fallback: string): string {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function _num(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Estimate how many score points a single dimension is losing, i.e. how
 * much it would gain back if fixed. Never negative - a dimension already
 * at or above its target contributes zero impact.
 * @param {PipelinePackScoreDimension} dimension
 * @returns {number}
 */
function _dimensionDeficit(dimension: PipelinePackScoreDimension): number {
    const value = _num(dimension.value, 0);
    const target = _num(dimension.target, 0);
    const weight = _num(dimension.weight, 1);
    const gap = target - value;
    if (gap <= 0) return 0;
    return gap * (weight > 0 ? weight : 1);
}

/**
 * Match a protocol issue to the score dimension it most likely affects,
 * by comparing the issue's technical code / owner item id against the
 * dimension id (prefix match, e.g. "connector.*" -> dimension "connector").
 * Falls back to the largest remaining deficit when no dimension name is
 * referenced in the code, so every issue still carries some weight.
 * @param {ActionableFindingIssueInput} issue
 * @param {PipelinePackScoreDimension[]} dimensions
 * @returns {number}
 */
function _scoreImpactForIssue(
    issue: ActionableFindingIssueInput,
    dimensions: PipelinePackScoreDimension[],
): number {
    const code = _text(issue.technicalCode || issue.code, '');
    const matched = dimensions.find((dimension) => code.startsWith(String(dimension.id || '')));
    if (matched) return _dimensionDeficit(matched);
    if (!dimensions.length) return issue.severity === 'warning' ? 1 : 2;
    const deficits = dimensions.map(_dimensionDeficit);
    const maxDeficit = deficits.reduce((max, deficit) => Math.max(max, deficit), 0);
    return maxDeficit > 0 ? maxDeficit : (issue.severity === 'warning' ? 1 : 2);
}

/**
 * Normalize a single raw protocol issue into an ActionableFinding, filling
 * in a plain-language message/fix when the input omits them so the UI
 * never renders an empty explanation.
 * @param {ActionableFindingIssueInput} issue
 * @param {PipelinePackScoreDimension[]} dimensions
 * @param {number} index
 * @returns {ActionableFinding}
 */
function _toFinding(
    issue: ActionableFindingIssueInput,
    dimensions: PipelinePackScoreDimension[],
    index: number,
): ActionableFinding {
    const severity: ActionableFindingSeverity = issue.severity === 'warning' ? 'warning' : 'error';
    const blocksPublish = typeof issue.blocksPublish === 'boolean' ? issue.blocksPublish : severity === 'error';
    return {
        severity,
        technicalCode: _text(issue.technicalCode || issue.code, `pipeline.finding.${index + 1}`),
        userMessage: _text(issue.userMessage || issue.message, 'Pendencia do pipeline precisa de revisao.'),
        suggestedFix: _text(issue.suggestedFix, 'Abrir o item indicado e completar as informacoes obrigatorias.'),
        blocksPublish,
        ownerItemId: _text(issue.ownerItemId || issue.targetId, 'pipeline-protocol'),
        scoreImpact: _scoreImpactForIssue(issue, dimensions),
    };
}

/**
 * Sort findings by priority: findings that block publication come first,
 * then by descending score impact (whoever weighs more on the note first).
 * Stable for equal priority/impact - preserves the input relative order.
 * @param {ActionableFinding[]} findings
 * @returns {ActionableFinding[]}
 */
function _prioritize(findings: ActionableFinding[]): ActionableFinding[] {
    return findings
        .map((finding, index) => ({ finding, index }))
        .sort((a, b) => {
            if (a.finding.blocksPublish !== b.finding.blocksPublish) {
                return a.finding.blocksPublish ? -1 : 1;
            }
            if (a.finding.scoreImpact !== b.finding.scoreImpact) {
                return b.finding.scoreImpact - a.finding.scoreImpact;
            }
            return a.index - b.index;
        })
        .map((entry) => entry.finding);
}

/**
 * Translate a pack score breakdown and its protocol issues into a
 * prioritized list of actionable findings: each finding carries a plain-
 * language message, a suggested next action, its owner item, whether it
 * blocks publishing and how much it weighs on the score. Reuses the
 * severity/fields already present on PipelineProtocolIssue - does not
 * invent a new severity taxonomy.
 *
 * Priority order: findings that block publication first, then by
 * descending score impact.
 *
 * @param {PipelinePackScoreBreakdown | undefined | null} packScoreBreakdown - score decomposition by dimension (may be omitted)
 * @param {ActionableFindingIssueInput[] | undefined | null} protocolIssues - existing PipelineProtocolIssue-shaped list
 * @returns {ActionableFinding[]} prioritized actionable findings, empty when there are no issues
 */
export function deriveActionableFindings(
    packScoreBreakdown: PipelinePackScoreBreakdown | undefined | null,
    protocolIssues: ActionableFindingIssueInput[] | undefined | null,
): ActionableFinding[] {
    const issues = Array.isArray(protocolIssues) ? protocolIssues : [];
    if (!issues.length) return [];
    const dimensions = Array.isArray(packScoreBreakdown?.dimensions) ? packScoreBreakdown!.dimensions! : [];
    const findings = issues.map((issue, index) => _toFinding(issue, dimensions, index));
    return _prioritize(findings);
}
