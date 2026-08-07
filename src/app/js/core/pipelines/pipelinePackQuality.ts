// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK QUALITY - pure score/visual/test summary.
   ================================================================ */

export interface PipelinePackQualityInput {
    score?: number;
    minScore?: number;
    foregroundVisual?: number;
    minForegroundVisual?: number;
    testsPassed?: number;
    testsTotal?: number;
    warnings?: number;
    failures?: number;
    issues?: PipelinePackQualityIssueInput[];
}

export type PipelinePackQualityIssueSeverity = 'error' | 'warning';
export type PipelinePackQualityBlockerPriority = 'P0' | 'P1' | 'P2';

export interface PipelinePackQualityIssueInput {
    severity?: PipelinePackQualityIssueSeverity;
    code?: string;
    technicalCode?: string;
    message?: string;
    userMessage?: string;
    suggestedFix?: string;
    blocksPublish?: boolean;
    ownerItemId?: string;
    targetId?: string;
}

export interface PipelinePackQualityBlocker {
    priority: PipelinePackQualityBlockerPriority;
    priorityLabel: string;
    severity: PipelinePackQualityIssueSeverity;
    technicalCode: string;
    userMessage: string;
    suggestedFix: string;
    blocksPublish: boolean;
    ownerItemId: string;
}

export interface PipelinePackQualityPrioritySummary {
    priority: PipelinePackQualityBlockerPriority;
    label: string;
    count: number;
    blocksPublish: boolean;
    summary: string;
    items: PipelinePackQualityBlocker[];
}

export interface PipelinePackQualityStatus {
    passed: boolean;
    publishBlocked: boolean;
    scoreLabel: string;
    visualLabel: string;
    testsLabel: string;
    nextAction: string;
    blockers: string[];
    blockerDetails: PipelinePackQualityBlocker[];
    prioritySummary: PipelinePackQualityPrioritySummary[];
}

function _num(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
}

function _text(value: unknown, fallback: string): string {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function _priorityLabel(priority: PipelinePackQualityBlockerPriority): string {
    if (priority === 'P0') return 'P0 - bloqueia publicacao';
    if (priority === 'P1') return 'P1 - revisar antes de compartilhar';
    return 'P2 - acompanhar';
}

function _priorityFor(severity: PipelinePackQualityIssueSeverity, blocksPublish: boolean): PipelinePackQualityBlockerPriority {
    if (blocksPublish) return 'P0';
    if (severity === 'warning') return 'P1';
    return 'P2';
}

function _blocker(
    severity: PipelinePackQualityIssueSeverity,
    technicalCode: string,
    userMessage: string,
    suggestedFix: string,
    blocksPublish: boolean,
    ownerItemId: string,
): PipelinePackQualityBlocker {
    const priority = _priorityFor(severity, blocksPublish);
    return {
        priority,
        priorityLabel: _priorityLabel(priority),
        severity,
        technicalCode,
        userMessage,
        suggestedFix,
        blocksPublish,
        ownerItemId,
    };
}

function _normalizeIssue(issue: PipelinePackQualityIssueInput, index: number): PipelinePackQualityBlocker {
    const severity = issue.severity === 'warning' ? 'warning' : 'error';
    const technicalCode = _text(issue.technicalCode || issue.code, `pipeline.issue.${index + 1}`);
    const blocksPublish = typeof issue.blocksPublish === 'boolean' ? issue.blocksPublish : severity === 'error';
    return _blocker(
        severity,
        technicalCode,
        _text(issue.userMessage || issue.message, 'Pendencia do pipeline precisa de revisao.'),
        _text(issue.suggestedFix, 'Abrir o item indicado e completar as informacoes obrigatorias.'),
        blocksPublish,
        _text(issue.ownerItemId || issue.targetId, 'pipeline-protocol'),
    );
}

function _prioritySummary(blockers: PipelinePackQualityBlocker[]): PipelinePackQualityPrioritySummary[] {
    const priorities: PipelinePackQualityBlockerPriority[] = ['P0', 'P1', 'P2'];
    return priorities
        .map((priority) => {
            const items = blockers.filter((item) => item.priority === priority);
            const label = _priorityLabel(priority);
            return {
                priority,
                label,
                count: items.length,
                blocksPublish: items.some((item) => item.blocksPublish),
                summary: `${label}: ${items.length} item(ns).`,
                items,
            };
        })
        .filter((group) => group.count > 0);
}

export function summarizePipelinePackQualityByPriority(
    blockers: PipelinePackQualityBlocker[],
): PipelinePackQualityPrioritySummary[] {
    return _prioritySummary(blockers);
}

export function summarizePipelinePackQuality(input: PipelinePackQualityInput): PipelinePackQualityStatus {
    const score = _num(input.score);
    const minScore = Number.isFinite(_num(input.minScore)) ? _num(input.minScore) : 980;
    const visual = _num(input.foregroundVisual);
    const minVisual = Number.isFinite(_num(input.minForegroundVisual)) ? _num(input.minForegroundVisual) : 95;
    const testsPassed = _num(input.testsPassed);
    const testsTotal = _num(input.testsTotal);
    const warnings = Number.isFinite(_num(input.warnings)) ? _num(input.warnings) : 0;
    const failures = Number.isFinite(_num(input.failures)) ? _num(input.failures) : 0;
    const blockerDetails: PipelinePackQualityBlocker[] = [];
    const explicitIssues = Array.isArray(input.issues) ? input.issues.map(_normalizeIssue) : [];
    const hasExplicitErrors = explicitIssues.some((issue) => issue.severity === 'error');
    const hasExplicitWarnings = explicitIssues.some((issue) => issue.severity === 'warning');

    if (!Number.isFinite(score)) {
        blockerDetails.push(_blocker(
            'error',
            'score.missing',
            'Score local ainda nao foi calculado.',
            'Executar o validador do pipeline antes de publicar.',
            true,
            'pipeline-score',
        ));
    } else if (score < minScore) {
        blockerDetails.push(_blocker(
            'error',
            'score.below-target',
            `Score local abaixo da meta: ${score}/1000 (meta ${minScore}/1000).`,
            'Corrigir os bloqueios P0/P1 e recalcular o score do pipeline.',
            true,
            'pipeline-score',
        ));
    }
    if (!Number.isFinite(visual)) {
        blockerDetails.push(_blocker(
            'error',
            'visual.missing',
            'Comparacao visual ainda nao foi registrada.',
            'Gerar ou anexar a comparacao visual antes de liberar o pacote.',
            true,
            'pipeline-visual-audit',
        ));
    } else if (visual < minVisual) {
        blockerDetails.push(_blocker(
            'error',
            'visual.below-target',
            `Fidelidade visual abaixo da meta: ${visual.toFixed(2)}% (meta ${minVisual}%).`,
            'Revisar os piores blocos visuais e repetir a comparacao.',
            true,
            'pipeline-visual-audit',
        ));
    }
    if (!Number.isFinite(testsTotal) || testsTotal <= 0 || testsPassed !== testsTotal) {
        const testsMessage = Number.isFinite(testsPassed) && Number.isFinite(testsTotal)
            ? `Testes focados ainda nao estao totalmente verdes: ${testsPassed}/${testsTotal}.`
            : 'Testes focados ainda nao foram registrados.';
        blockerDetails.push(_blocker(
            'error',
            'tests.not-green',
            testsMessage,
            'Rodar os testes focados e corrigir qualquer falha antes de publicar.',
            true,
            'pipeline-focused-tests',
        ));
    }
    if (failures > 0 && !hasExplicitErrors) {
        blockerDetails.push(_blocker(
            'error',
            'validation.failures',
            `Ha ${failures} falha(s) tecnica(s) no score.`,
            'Abrir os achados tecnicos do validador e corrigir os itens bloqueantes.',
            true,
            'pipeline-validation-errors',
        ));
    }
    if (warnings > 0 && !hasExplicitWarnings) {
        blockerDetails.push(_blocker(
            'warning',
            'validation.warnings',
            `Ha ${warnings} alerta(s) a revisar antes de compartilhar.`,
            'Revisar os alertas e registrar a justificativa quando nao bloquearem publicacao.',
            false,
            'pipeline-validation-warnings',
        ));
    }
    blockerDetails.push(...explicitIssues);
    const blockers = blockerDetails.map((blocker) => blocker.userMessage);
    const prioritySummary = summarizePipelinePackQualityByPriority(blockerDetails);

    return {
        passed: blockerDetails.length === 0,
        publishBlocked: blockerDetails.some((blocker) => blocker.blocksPublish),
        scoreLabel: Number.isFinite(score) ? `${score}/1000` : 'sem score',
        visualLabel: Number.isFinite(visual) ? `${visual.toFixed(2)}%` : 'sem comparacao visual',
        testsLabel: Number.isFinite(testsPassed) && Number.isFinite(testsTotal) ? `${testsPassed}/${testsTotal}` : 'sem testes registrados',
        nextAction: blockerDetails[0]
            ? `${blockerDetails[0].userMessage} Acao: ${blockerDetails[0].suggestedFix}`
            : 'Manter evidencias e seguir para validacao visual no app.',
        blockers,
        blockerDetails,
        prioritySummary,
    };
}
