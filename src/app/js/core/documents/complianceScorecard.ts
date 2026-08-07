// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Scorecard - Phase 18 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S21
 *
 * Phase 18 (2026-05-01) - pure-logic aggregator que combina sinais de
 * múltiplas fases (rules + workflow + retention + approval + citations)
 * em um scorecard unificado de compliance por documento.
 *
 * Estratégia:
 *   - 5 dimensões: rules / workflow / retention / approval / citations
 *   - Cada dimensão produz score 0-100
 *   - Final = média ponderada (default igual: 0.2 cada)
 *   - Letter grade: A+ / A / B / C / D / F
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Dimensions canônicas. */
export const DIMENSIONS = Object.freeze(['rules', 'workflow', 'retention', 'approval', 'citations']);

/** Default weights (igual 0.2 cada). */
export const DEFAULT_WEIGHTS = Object.freeze({
    rules: 0.2,
    workflow: 0.2,
    retention: 0.2,
    approval: 0.2,
    citations: 0.2,
});

/** Letter grade thresholds. */
export const GRADE_THRESHOLDS = Object.freeze({
    'A+': 95,
    A: 85,
    B: 75,
    C: 65,
    D: 55,
    F: 0,
});

/** Identidade do módulo. */
export const SCORECARD_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 18,
    deliveredAt: '2026-05-01',
    dimensions: DIMENSIONS,
});

/**
 * Computa score de rules (a partir de findings da Phase 7).
 *
 * @param {Array<{severity?: string}>} findings
 * @returns {number} 0-100
 */
export function scoreRules(findings: Array<{ severity?: string }>): number {
    if (!Array.isArray(findings)) return 100;
    let penalty = 0;
    for (const f of findings) {
        if (!f) continue;
        if (f.severity === 'critical') penalty += 10;
        else if (f.severity === 'major') penalty += 5;
        else if (f.severity === 'minor') penalty += 2;
        else if (f.severity === 'info') penalty += 1;
    }
    return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * Computa score de workflow (Phase 8 FSM state).
 *
 * @param {string} state
 * @returns {number}
 */
export function scoreWorkflow(state: string): number {
    const map: Record<string, number> = {
        published: 100,
        approved: 90,
        under_review: 70,
        pending_review: 60,
        changes_requested: 40,
        drafting: 30,
        rejected: 10,
        superseded: 50,
        archived: 50,
    };
    return state in map ? (map[state] as number) : 0;
}

/**
 * Computa score de retention (Phase 10 action).
 *
 * @param {string} action
 * @returns {number}
 */
export function scoreRetention(action: string): number {
    const map: Record<string, number> = {
        keep: 100,
        review: 80,
        archive: 70,
        anonymize: 60,
        dispose: 50,
    };
    return action in map ? (map[action] as number) : 100; // unknown → assume ok
}

/**
 * Computa score de approval (Phase 11 flow status).
 *
 * @param {string} status
 * @returns {number}
 */
export function scoreApproval(status: string): number {
    const map: Record<string, number> = {
        approved: 100,
        in_progress: 50,
        pending: 30,
        rejected: 0,
        cancelled: 20,
        expired: 10,
    };
    return status in map ? (map[status] as number) : 50;
}

/**
 * Computa score de citations (Phase 16 valid/invalid).
 *
 * @param {{validCount?: number, invalidCount?: number}} stats
 * @returns {number}
 */
export function scoreCitations(stats: { validCount?: number; invalidCount?: number }): number {
    if (!stats || typeof stats !== 'object') return 100;
    const valid = stats.validCount || 0;
    const invalid = stats.invalidCount || 0;
    const total = valid + invalid;
    if (total === 0) return 100;
    return Math.round((valid / total) * 100);
}

/**
 * Computa weighted score final.
 *
 * @param {Record<string, number>} scores
 * @param {Record<string, number>} [number>]
 * @returns {number}
 */
export function computeFinalScore(
    scores: Record<string, number>,
    weights: Record<string, number> = DEFAULT_WEIGHTS,
): number {
    if (!scores || typeof scores !== 'object') return 0;
    const w: Record<string, number> = weights && typeof weights === 'object' ? weights : DEFAULT_WEIGHTS;
    let total = 0;
    let totalWeight = 0;
    for (const dim of DIMENSIONS) {
        const score = Number.isFinite(scores[dim]) ? (scores[dim] as number) : null;
        if (score == null) continue;
        const weight = Number.isFinite(w[dim]) ? (w[dim] as number) : 0;
        total += score * weight;
        totalWeight += weight;
    }
    if (totalWeight === 0) return 0;
    return Math.round(total / totalWeight);
}

/**
 * Mapeia score numérico para letter grade.
 *
 * @param {number} score 0-100
 * @returns {string}
 */
export function scoreToGrade(score: number): string {
    if (!Number.isFinite(score)) return 'F';
    for (const [grade, threshold] of Object.entries(GRADE_THRESHOLDS)) {
        if (score >= threshold) return grade;
    }
    return 'F';
}

/**
 * Cria scorecard completo.
 *
 * @param {Record<string, any>} signals - { findings, workflowState, retentionAction, approvalStatus, citationStats }
 * @param {{weights?: Record<string, number>}} [options]
 * @returns {Object} scorecard frozen
 */
export function createScorecard(
    signals: Record<string, any> = {},
    options: { weights?: Record<string, number> } = {},
): object {
    const scores = {
        rules: scoreRules(signals.findings),
        workflow: scoreWorkflow(signals.workflowState),
        retention: scoreRetention(signals.retentionAction),
        approval: scoreApproval(signals.approvalStatus),
        citations: scoreCitations(signals.citationStats),
    };
    const finalScore = computeFinalScore(scores, options.weights);
    const grade = scoreToGrade(finalScore);
    return Object.freeze({
        scores: Object.freeze(scores),
        finalScore,
        grade,
        weights: Object.freeze({ ...(options.weights || DEFAULT_WEIGHTS) }),
        timestamp: new Date().toISOString(),
    });
}

/**
 * Compara dois scorecards.
 *
 * @param {Record<string, any>} a - scorecard prior
 * @param {Record<string, any>} any> - scorecard atual
 * @returns {{deltaFinal: number, deltaGrade: string, deltaScores: Record<string, number>}}
 */
export function compareScorecards(
    a: Record<string, any>,
    b: Record<string, any>,
): Readonly<{ deltaFinal: number; deltaGrade: string; deltaScores: Record<string, number> }> {
    if (!a || !b) {
        return Object.freeze({ deltaFinal: 0, deltaGrade: '=', deltaScores: {} });
    }
    const deltaScores: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
        const sa = a.scores && Number.isFinite(a.scores[dim]) ? a.scores[dim] : 0;
        const sb = b.scores && Number.isFinite(b.scores[dim]) ? b.scores[dim] : 0;
        deltaScores[dim] = sb - sa;
    }
    return Object.freeze({
        deltaFinal: (b.finalScore || 0) - (a.finalScore || 0),
        deltaGrade: a.grade === b.grade ? '=' : `${a.grade} → ${b.grade}`,
        deltaScores: Object.freeze(deltaScores),
    });
}

/**
 * Formata scorecard como markdown.
 */
export function formatScorecard(scorecard: any): string {
    if (!scorecard) return '(no scorecard)';
    const lines = [];
    lines.push(`# Compliance Scorecard`);
    lines.push(`**Final Score:** ${scorecard.finalScore || 0}/100 (${scorecard.grade || 'F'})`);
    lines.push('');
    lines.push('## Dimensions');
    for (const dim of DIMENSIONS) {
        const score = scorecard.scores && scorecard.scores[dim];
        lines.push(`- **${dim}:** ${Number.isFinite(score) ? score : 0}/100`);
    }
    return lines.join('\n');
}

/**
 * Module identity export.
 */
export const complianceScorecardMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 18,
    deliveredAt: '2026-05-01',
    dimensions: DIMENSIONS,
    exports: [
        'DIMENSIONS',
        'DEFAULT_WEIGHTS',
        'GRADE_THRESHOLDS',
        'SCORECARD_META',
        'scoreRules',
        'scoreWorkflow',
        'scoreRetention',
        'scoreApproval',
        'scoreCitations',
        'computeFinalScore',
        'scoreToGrade',
        'createScorecard',
        'compareScorecards',
        'formatScorecard',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
