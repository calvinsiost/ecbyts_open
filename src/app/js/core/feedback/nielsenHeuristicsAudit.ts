// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-014 (claude - novaspec, 2026-05-30) — Nielsen 10 Heuristics Audit (pure-logic).
 *
 * North Star v2 Pilar 1 (usabilidade) — último item da lista de frentes v2:
 * "audit golden-path vs 10 heurísticas Nielsen".
 *
 * Implementa registry frozen das 10 heurísticas clássicas de Nielsen (1994/2020)
 * + scorer pure-logic que avalia observações de uma jornada de usuário
 * ("golden path") contra cada heurística.
 *
 * NÃO faz I/O — apenas registry + scorer. Caller (Playwright E2E + audit
 * agentic) coleta observações da UI real e passa para `scoreGoldenPath()`
 * que retorna score normalizado 0-100 + breakdown + recomendações.
 *
 * Refs:
 *   - Nielsen, J. (1994/2020) "10 Usability Heuristics for User Interface Design"
 *     https://www.nngroup.com/articles/ten-usability-heuristics/
 *   - Nielsen NN/g Workbook "Severity Ratings for Usability Problems"
 *   - WCAG 2.1 AA (acessibilidade complementar)
 */

export type HeuristicId =
    | 'H1_visibility_of_system_status'
    | 'H2_match_real_world'
    | 'H3_user_control_freedom'
    | 'H4_consistency_standards'
    | 'H5_error_prevention'
    | 'H6_recognition_vs_recall'
    | 'H7_flexibility_efficiency'
    | 'H8_aesthetic_minimalist'
    | 'H9_error_recovery'
    | 'H10_help_documentation';

export type Severity = 0 | 1 | 2 | 3 | 4;
// 0 = não-issue · 1 = cosmético · 2 = menor · 3 = maior · 4 = catastrófico (Nielsen NN/g)

export interface NielsenHeuristic {
    id: HeuristicId;
    nameKey: string;
    /** Resumo curto (i18n key) */
    summaryKey: string;
    /** Perguntas-guia para auditor avaliar (i18n keys) */
    auditQuestionsKeys: ReadonlyArray<string>;
    /** Exemplos do que constitui violação (i18n keys) */
    violationExamplesKeys: ReadonlyArray<string>;
}

export interface AuditObservation {
    heuristicId: HeuristicId;
    /** Severidade observada (0-4 Nielsen scale) */
    severity: Severity;
    /** Descrição curta da observação (não-i18n; vai para audit log) */
    description: string;
    /** Screenshot path opcional (Playwright tests/screenshots/*.png) */
    screenshotPath?: string;
    /** Recomendação curta (i18n key opcional, ou string livre) */
    recommendation?: string;
    /** Where in UI (selector CSS ou view name) */
    location?: string;
}

export interface HeuristicScore {
    heuristicId: HeuristicId;
    /** Soma de severidades (0+ — quanto MAIOR, pior) */
    totalSeverity: number;
    /** Quantidade de observações (issues) */
    issueCount: number;
    /** Maior severidade individual */
    maxSeverity: Severity;
    /** Score normalizado 0-100 desta heurística (100 = perfeito) */
    score: number;
}

export interface GoldenPathAuditReport {
    /** Score agregado 0-100 (média ponderada por severidade) */
    overallScore: number;
    /** Veredict humano-legível (i18n key) */
    verdictKey: string;
    /** Score por cada uma das 10 heurísticas */
    perHeuristic: HeuristicScore[];
    /** Top issues (severity ≥ 3) para priorizar fix */
    topIssues: AuditObservation[];
    /** Total de observações coletadas */
    totalObservations: number;
    /** Heurísticas COM ZERO observações (não-auditadas — não significa OK) */
    notAudited: HeuristicId[];
}

// ── Registry 10 heurísticas Nielsen ──────────────────────────────────────

export const NIELSEN_HEURISTICS: Readonly<Record<HeuristicId, NielsenHeuristic>> = Object.freeze({
    H1_visibility_of_system_status: Object.freeze({
        id: 'H1_visibility_of_system_status',
        nameKey: 'nielsen.h1.name',
        summaryKey: 'nielsen.h1.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h1.q.feedbackImmediate',
            'nielsen.h1.q.progressIndicator',
            'nielsen.h1.q.timeRemaining',
            'nielsen.h1.q.dataFreshness',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h1.v.spinnerWithoutText',
            'nielsen.h1.v.silentBackgroundAction',
            'nielsen.h1.v.staleDataNoIndicator',
        ]),
    }),
    H2_match_real_world: Object.freeze({
        id: 'H2_match_real_world',
        nameKey: 'nielsen.h2.name',
        summaryKey: 'nielsen.h2.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h2.q.naturalLanguage',
            'nielsen.h2.q.domainTerminology',
            'nielsen.h2.q.logicalOrder',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h2.v.codigosTecnicos',
            'nielsen.h2.v.icones Ambiguos',
            'nielsen.h2.v.jargãoDev',
        ]),
    }),
    H3_user_control_freedom: Object.freeze({
        id: 'H3_user_control_freedom',
        nameKey: 'nielsen.h3.name',
        summaryKey: 'nielsen.h3.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h3.q.undoAvailable',
            'nielsen.h3.q.cancelMidAction',
            'nielsen.h3.q.escapeFromModal',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h3.v.noUndo',
            'nielsen.h3.v.confirmShaming',
            'nielsen.h3.v.lockedDeepFlow',
        ]),
    }),
    H4_consistency_standards: Object.freeze({
        id: 'H4_consistency_standards',
        nameKey: 'nielsen.h4.name',
        summaryKey: 'nielsen.h4.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h4.q.consistentLabels',
            'nielsen.h4.q.platformConventions',
            'nielsen.h4.q.designTokens',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h4.v.differentButtonStyles',
            'nielsen.h4.v.inconsistentTerminology',
            'nielsen.h4.v.nonStandardShortcut',
        ]),
    }),
    H5_error_prevention: Object.freeze({
        id: 'H5_error_prevention',
        nameKey: 'nielsen.h5.name',
        summaryKey: 'nielsen.h5.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h5.q.confirmDestructive',
            'nielsen.h5.q.inputValidationInline',
            'nielsen.h5.q.disabledWhenInvalid',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h5.v.deleteWithoutConfirm',
            'nielsen.h5.v.validateOnlyAfterSubmit',
            'nielsen.h5.v.silentDataLoss',
        ]),
    }),
    H6_recognition_vs_recall: Object.freeze({
        id: 'H6_recognition_vs_recall',
        nameKey: 'nielsen.h6.name',
        summaryKey: 'nielsen.h6.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h6.q.visibleOptions',
            'nielsen.h6.q.recentHistoryShown',
            'nielsen.h6.q.contextualHelp',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h6.v.requireRememberCommands',
            'nielsen.h6.v.hiddenOptions',
            'nielsen.h6.v.noBreadcrumbs',
        ]),
    }),
    H7_flexibility_efficiency: Object.freeze({
        id: 'H7_flexibility_efficiency',
        nameKey: 'nielsen.h7.name',
        summaryKey: 'nielsen.h7.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h7.q.keyboardShortcuts',
            'nielsen.h7.q.customizable',
            'nielsen.h7.q.bulkActions',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h7.v.noKeyboardShortcuts',
            'nielsen.h7.v.noTemplate',
            'nielsen.h7.v.repetitiveClicks',
        ]),
    }),
    H8_aesthetic_minimalist: Object.freeze({
        id: 'H8_aesthetic_minimalist',
        nameKey: 'nielsen.h8.name',
        summaryKey: 'nielsen.h8.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h8.q.signalNoiseRatio',
            'nielsen.h8.q.visualHierarchy',
            'nielsen.h8.q.minimumDistraction',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h8.v.tooMuchInfoAtOnce',
            'nielsen.h8.v.competingFocus',
            'nielsen.h8.v.decorativeIcons',
        ]),
    }),
    H9_error_recovery: Object.freeze({
        id: 'H9_error_recovery',
        nameKey: 'nielsen.h9.name',
        summaryKey: 'nielsen.h9.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h9.q.plainLanguageError',
            'nielsen.h9.q.suggestRecoveryAction',
            'nielsen.h9.q.preserveInputOnError',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h9.v.errorCodeOnly',
            'nielsen.h9.v.noNextStep',
            'nielsen.h9.v.formClearedOnError',
        ]),
    }),
    H10_help_documentation: Object.freeze({
        id: 'H10_help_documentation',
        nameKey: 'nielsen.h10.name',
        summaryKey: 'nielsen.h10.summary',
        auditQuestionsKeys: Object.freeze([
            'nielsen.h10.q.contextualTooltips',
            'nielsen.h10.q.searchableDocs',
            'nielsen.h10.q.taskFocusedHelp',
        ]),
        violationExamplesKeys: Object.freeze([
            'nielsen.h10.v.noHelp',
            'nielsen.h10.v.referenceManualOnly',
            'nielsen.h10.v.brokenHelpLinks',
        ]),
    }),
});

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Lista todas as 10 heurísticas.
 */
export function listHeuristics(): HeuristicId[] {
    return Object.keys(NIELSEN_HEURISTICS) as HeuristicId[];
}

/**
 * Score por heurística baseado em observações.
 *
 * Fórmula:
 *   - Sem observação: score=100 (não-auditado é tratado como neutro)
 *   - Penalização: cada severity contribui (severity^2) para reduzir score
 *   - score = max(0, 100 - sum(severity^2) * 5)
 *
 * Quadrática (severity^2) reflete Nielsen "catastrophic dominates":
 * 1 issue severity=4 (catastrófico) → -80 pontos = score 20
 * 4 issues severity=1 (cosmético) → -20 pontos = score 80
 */
export function scoreHeuristic(
    heuristicId: HeuristicId,
    observations: ReadonlyArray<AuditObservation>,
): HeuristicScore {
    const obs = observations.filter((o) => o.heuristicId === heuristicId);
    if (obs.length === 0) {
        return {
            heuristicId,
            totalSeverity: 0,
            issueCount: 0,
            maxSeverity: 0,
            score: 100,
        };
    }
    const totalSeverity = obs.reduce((sum, o) => sum + o.severity, 0);
    const sumSquared = obs.reduce((sum, o) => sum + o.severity * o.severity, 0);
    const maxSeverity = obs.reduce((max, o) => (o.severity > max ? o.severity : max), 0 as Severity);
    const score = Math.max(0, Math.round(100 - sumSquared * 5));
    return {
        heuristicId,
        totalSeverity,
        issueCount: obs.length,
        maxSeverity,
        score,
    };
}

/**
 * Audita golden path completo: produz report agregado.
 *
 * Caller (Playwright E2E + manual audit agentic) coleta observações;
 * esta função retorna report estruturado para UI dashboard + PDF report.
 */
export function scoreGoldenPath(
    observations: ReadonlyArray<AuditObservation>,
): GoldenPathAuditReport {
    const all = Array.isArray(observations) ? observations : [];
    const perHeuristic = listHeuristics().map((h) => scoreHeuristic(h, all));
    const notAudited = perHeuristic
        .filter((h) => h.issueCount === 0)
        .map((h) => h.heuristicId);
    // Score agregado: média simples das 10 heurísticas
    const overall = perHeuristic.reduce((sum, h) => sum + h.score, 0) / perHeuristic.length;
    const overallScore = Math.round(overall);
    const verdictKey = classifyVerdict(overallScore);
    const topIssues = all
        .filter((o) => o.severity >= 3)
        .sort((a, b) => b.severity - a.severity);
    return {
        overallScore,
        verdictKey,
        perHeuristic,
        topIssues,
        totalObservations: all.length,
        notAudited,
    };
}

function classifyVerdict(score: number): string {
    if (score >= 90) return 'nielsen.verdict.excellent';
    if (score >= 75) return 'nielsen.verdict.good';
    if (score >= 60) return 'nielsen.verdict.acceptable';
    if (score >= 40) return 'nielsen.verdict.needsImprovement';
    return 'nielsen.verdict.critical';
}

/**
 * Filtra observações por severidade mínima (útil para priorização).
 */
export function filterBySeverity(
    observations: ReadonlyArray<AuditObservation>,
    minSeverity: Severity,
): AuditObservation[] {
    return observations.filter((o) => o.severity >= minSeverity);
}

/**
 * Agrupa observações por heurística (útil para dashboard).
 */
export function groupByHeuristic(
    observations: ReadonlyArray<AuditObservation>,
): Record<HeuristicId, AuditObservation[]> {
    const groups: Record<string, AuditObservation[]> = {};
    for (const h of listHeuristics()) groups[h] = [];
    for (const o of observations) {
        const g = groups[o.heuristicId];
        if (g) g.push(o);
    }
    return groups as Record<HeuristicId, AuditObservation[]>;
}

/**
 * Severity → i18n label key (Nielsen NN/g).
 */
export function severityLabelKey(severity: Severity): string {
    switch (severity) {
        case 0:
            return 'nielsen.severity.none';
        case 1:
            return 'nielsen.severity.cosmetic';
        case 2:
            return 'nielsen.severity.minor';
        case 3:
            return 'nielsen.severity.major';
        case 4:
            return 'nielsen.severity.catastrophic';
        default:
            return 'nielsen.severity.unknown';
    }
}
