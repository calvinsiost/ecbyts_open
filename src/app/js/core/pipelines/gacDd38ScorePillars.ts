// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import type { GacDd38NormativeProfile } from './gacDd38NormativeProfile.js';

export const GAC_DD38_SCORE_PILLAR_WEIGHTS = Object.freeze({
    sections: 250,
    decisions: 250,
    deliverables: 250,
    ux: 150,
    export: 100,
} as const);

export const GAC_DD38_SCORE_TARGET = 980;

export type GacDd38ScorePillarId = keyof typeof GAC_DD38_SCORE_PILLAR_WEIGHTS;

export interface GacDd38ScorePillar {
    id: GacDd38ScorePillarId;
    label: string;
    score: number;
    maxScore: number;
    passed: boolean;
    complete: number;
    total: number;
    blockers: string[];
    nextActions: string[];
}

export interface GacDd38ScoreResult {
    score: number;
    target: number;
    passed: boolean;
    verdict: 'pass' | 'fail';
    pillars: GacDd38ScorePillar[];
    blockers: string[];
    nextActions: string[];
}

export interface GacDd38ScoreUxEvidence {
    sectionsWithSummary: number;
    sectionsWithEvidence: number;
    sectionsWithAreaClasses: number;
    phaseMappingsPresent: number;
    phaseMappingsMapped: number;
}

export interface GacDd38ScoreExportEvidence {
    hasStandardId: boolean;
    hasSource: boolean;
    hasValidatedDate: boolean;
    noLocalPaths: boolean;
    referencesConsistent: boolean;
    referenceIssueCount: number;
}

function _nonEmpty(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

function _asArray<T>(value: T[] | readonly T[] | undefined | null): T[] {
    return Array.isArray(value) ? value : [];
}

function _scorePart(done: number, total: number, max: number): number {
    if (total <= 0) return 0;
    return Math.max(0, Math.min(max, Math.round((Math.max(0, done) / total) * max)));
}

function _makePillar(
    id: GacDd38ScorePillarId,
    label: string,
    maxScore: number,
    complete: number,
    total: number,
    blockers: string[],
    nextActions: string[],
): GacDd38ScorePillar {
    const score = _scorePart(complete, total, maxScore);
    return {
        id,
        label,
        score,
        maxScore,
        passed: blockers.length === 0 && complete >= total,
        complete,
        total,
        blockers,
        nextActions,
    };
}

function _evaluateSections(profile: GacDd38NormativeProfile): GacDd38ScorePillar {
    const maxScore = GAC_DD38_SCORE_PILLAR_WEIGHTS.sections;
    const criticalIds = _asArray(profile.criticalSectionIds);
    const sectionById = new Map(_asArray(profile.sections).map((s) => [s.id, s]));
    const blockers: string[] = [];
    const nextActions: string[] = [];
    let complete = 0;

    if (criticalIds.length === 0) {
        blockers.push('Nenhuma secao critica cadastrada no perfil.');
        nextActions.push('Cadastrar criticalSectionIds com as secoes obrigatorias do PDF DD-038.');
    }

    for (const id of criticalIds) {
        const section = sectionById.get(id);
        if (!section) {
            blockers.push(`Secao critica ausente: ${id}.`);
            nextActions.push(`Cadastrar secao critica ${id}.`);
            continue;
        }
        const issues: string[] = [];
        if (!_nonEmpty(section.title)) issues.push('titulo vazio');
        if (!_nonEmpty(section.summaryPt)) issues.push('resumo vazio');
        if (!(section.pageStart > 0 && section.pageEnd >= section.pageStart)) issues.push('paginas invalidas');
        if (!_nonEmpty(section.blockId)) issues.push('blockId vazio');
        if (_asArray(section.expectedEvidence).length === 0) issues.push('evidencias esperadas vazias');
        if (_asArray(section.relatedAreaClasses).length === 0) issues.push('classes de area vazias');
        if (issues.length > 0) {
            blockers.push(`Secao ${id} incompleta: ${issues.join('; ')}.`);
            nextActions.push(`Completar metadados da secao ${id}.`);
            continue;
        }
        complete += 1;
    }

    return _makePillar('sections', 'Secoes criticas mapeadas', maxScore, complete, Math.max(1, criticalIds.length), blockers, nextActions);
}

function _evaluateDecisions(profile: GacDd38NormativeProfile): GacDd38ScorePillar {
    const maxScore = GAC_DD38_SCORE_PILLAR_WEIGHTS.decisions;
    const criteria = _asArray(profile.decisionCriteria);
    const sectionIds = new Set(_asArray(profile.sections).map((s) => s.id));
    const blockers: string[] = [];
    const nextActions: string[] = [];
    let complete = 0;

    if (criteria.length === 0) {
        blockers.push('Nenhum criterio de decisao cadastrado.');
        nextActions.push('Cadastrar decisionCriteria com condicoes de sucesso e falha.');
    }

    for (const criterion of criteria) {
        const issues: string[] = [];
        if (!_nonEmpty(criterion.id)) issues.push('id vazio');
        if (!_nonEmpty(criterion.label)) issues.push('label vazio');
        if (!_nonEmpty(criterion.passConditionPt)) issues.push('condicao de sucesso vazia');
        if (!_nonEmpty(criterion.failConditionPt)) issues.push('condicao de falha vazia');
        if (!_nonEmpty(criterion.responsibleRole)) issues.push('responsavel vazio');
        if (_asArray(criterion.sectionIds).length === 0) {
            issues.push('sectionIds vazio');
        } else {
            const invalid = criterion.sectionIds.filter((sid) => !sectionIds.has(sid));
            if (invalid.length > 0) issues.push(`sectionIds invalidos: ${invalid.join(', ')}`);
        }
        if (_asArray(criterion.requiredEvidence).length === 0) issues.push('evidencias requeridas vazias');
        if (issues.length > 0) {
            blockers.push(`Decisao ${criterion.id || '(sem id)'} incompleta: ${issues.join('; ')}.`);
            nextActions.push(`Completar criterio de decisao ${criterion.id || '(sem id)'}.`);
            continue;
        }
        complete += 1;
    }

    const total = Math.max(1, criteria.length);
    return _makePillar('decisions', 'Decisoes com criterio real', maxScore, complete, total, blockers, nextActions);
}

function _evaluateDeliverables(profile: GacDd38NormativeProfile): GacDd38ScorePillar {
    const maxScore = GAC_DD38_SCORE_PILLAR_WEIGHTS.deliverables;
    const templates = _asArray(profile.deliverableTemplates);
    const sectionIds = new Set(_asArray(profile.sections).map((s) => s.id));
    const blockers: string[] = [];
    const nextActions: string[] = [];
    let complete = 0;

    if (templates.length === 0) {
        blockers.push('Nenhum template de entregavel cadastrado.');
        nextActions.push('Cadastrar deliverableTemplates com checklists normativos.');
    }

    for (const template of templates) {
        const issues: string[] = [];
        if (!_nonEmpty(template.id)) issues.push('id vazio');
        if (!_nonEmpty(template.label)) issues.push('label vazio');
        if (!_nonEmpty(template.fileTargetKind)) issues.push('fileTargetKind vazio');
        if (_asArray(template.sectionIds).length === 0) {
            issues.push('sectionIds vazio');
        } else {
            const invalid = template.sectionIds.filter((sid) => !sectionIds.has(sid));
            if (invalid.length > 0) issues.push(`sectionIds invalidos: ${invalid.join(', ')}`);
        }
        const checklist = _asArray(template.checklist);
        if (checklist.length === 0) {
            issues.push('checklist vazio');
        } else {
            const incompleteItems = checklist.filter(
                (item) => !_nonEmpty(item.id) || !_nonEmpty(item.label) || !_nonEmpty(item.evidenceKind),
            );
            if (incompleteItems.length > 0) issues.push(`${incompleteItems.length} item(ns) de checklist incompleto(s)`);
        }
        if (issues.length > 0) {
            blockers.push(`Entregavel ${template.id || '(sem id)'} incompleto: ${issues.join('; ')}.`);
            nextActions.push(`Completar template de entregavel ${template.id || '(sem id)'}.`);
            continue;
        }
        complete += 1;
    }

    const total = Math.max(1, templates.length);
    return _makePillar('deliverables', 'Entregaveis com checklist', maxScore, complete, total, blockers, nextActions);
}

function _evaluateUx(profile: GacDd38NormativeProfile, evidence?: GacDd38ScoreUxEvidence): GacDd38ScorePillar {
    const maxScore = GAC_DD38_SCORE_PILLAR_WEIGHTS.ux;
    const sections = _asArray(profile.sections);
    const criticalIds = new Set(_asArray(profile.criticalSectionIds));
    const criticalSections = sections.filter((s) => criticalIds.has(s.id));
    const blockers: string[] = [];
    const nextActions: string[] = [];

    const withSummary = criticalSections.filter((s) => _nonEmpty(s.summaryPt)).length;
    const withEvidence = criticalSections.filter((s) => _asArray(s.expectedEvidence).length > 0).length;
    const withAreaClasses = criticalSections.filter((s) => _asArray(s.relatedAreaClasses).length > 0).length;

    const phaseMappings = _asArray(profile.phaseMappings);
    const mappedPhases = phaseMappings.filter((p) => p.status === 'mapped' || p.status === 'partial').length;

    const uxEvidence: GacDd38ScoreUxEvidence = evidence || {
        sectionsWithSummary: withSummary,
        sectionsWithEvidence: withEvidence,
        sectionsWithAreaClasses: withAreaClasses,
        phaseMappingsPresent: phaseMappings.length,
        phaseMappingsMapped: mappedPhases,
    };

    const totalCritical = Math.max(1, criticalSections.length);
    let checks = 0;
    const totalChecks = 4;

    if (uxEvidence.sectionsWithSummary >= totalCritical) {
        checks += 1;
    } else {
        blockers.push(`Secoes criticas sem resumo: ${totalCritical - uxEvidence.sectionsWithSummary}/${totalCritical}.`);
        nextActions.push('Adicionar resumo em linguagem clara para todas as secoes criticas.');
    }

    if (uxEvidence.sectionsWithEvidence >= totalCritical) {
        checks += 1;
    } else {
        blockers.push(`Secoes criticas sem evidencia esperada: ${totalCritical - uxEvidence.sectionsWithEvidence}/${totalCritical}.`);
        nextActions.push('Listar evidencias esperadas para cada secao critica.');
    }

    if (uxEvidence.sectionsWithAreaClasses >= totalCritical) {
        checks += 1;
    } else {
        blockers.push(`Secoes criticas sem classe de area: ${totalCritical - uxEvidence.sectionsWithAreaClasses}/${totalCritical}.`);
        nextActions.push('Vincular classes de area a cada secao critica.');
    }

    if (uxEvidence.phaseMappingsPresent > 0 && uxEvidence.phaseMappingsMapped >= uxEvidence.phaseMappingsPresent) {
        checks += 1;
    } else if (uxEvidence.phaseMappingsPresent === 0) {
        blockers.push('Nenhum mapeamento de fase do pipeline cadastrado.');
        nextActions.push('Cadastrar phaseMappings ligando etapas do pipeline a secoes DD-038.');
    } else {
        blockers.push(`Fases sem mapeamento completo: ${uxEvidence.phaseMappingsPresent - uxEvidence.phaseMappingsMapped}/${uxEvidence.phaseMappingsPresent}.`);
        nextActions.push('Completar mapeamento de todas as fases do pipeline.');
    }

    const score = _scorePart(checks, totalChecks, maxScore);
    return {
        id: 'ux',
        label: 'UX de consulta normativa',
        score,
        maxScore,
        passed: blockers.length === 0,
        complete: checks,
        total: totalChecks,
        blockers,
        nextActions,
    };
}

function _evaluateExport(profile: GacDd38NormativeProfile, evidence?: GacDd38ScoreExportEvidence): GacDd38ScorePillar {
    const maxScore = GAC_DD38_SCORE_PILLAR_WEIGHTS.export;
    const blockers: string[] = [];
    const nextActions: string[] = [];

    const sectionIds = new Set(_asArray(profile.sections).map((s) => s.id));
    const blockIds = new Set(_asArray(profile.blocks).map((b) => b.id));
    const areaClassIds = new Set(_asArray(profile.areaClasses).map((a) => a.id));

    let referenceIssues = 0;
    for (const section of _asArray(profile.sections)) {
        if (section.blockId && !blockIds.has(section.blockId)) referenceIssues += 1;
        for (const ac of _asArray(section.relatedAreaClasses)) {
            if (!areaClassIds.has(ac)) referenceIssues += 1;
        }
    }
    for (const criterion of _asArray(profile.decisionCriteria)) {
        for (const sid of _asArray(criterion.sectionIds)) {
            if (!sectionIds.has(sid)) referenceIssues += 1;
        }
    }
    for (const template of _asArray(profile.deliverableTemplates)) {
        for (const sid of _asArray(template.sectionIds)) {
            if (!sectionIds.has(sid)) referenceIssues += 1;
        }
    }

    const exportEvidence: GacDd38ScoreExportEvidence = evidence || {
        hasStandardId: _nonEmpty(profile.standardId),
        hasSource: _nonEmpty(profile.source),
        hasValidatedDate: _nonEmpty(profile.validatedDate),
        noLocalPaths: true,
        referencesConsistent: referenceIssues === 0,
        referenceIssueCount: referenceIssues,
    };

    let checks = 0;
    const totalChecks = 5;

    if (exportEvidence.hasStandardId) {
        checks += 1;
    } else {
        blockers.push('standardId ausente no perfil.');
        nextActions.push('Definir standardId do perfil normativo.');
    }

    if (exportEvidence.hasSource) {
        checks += 1;
    } else {
        blockers.push('source ausente no perfil.');
        nextActions.push('Definir source do perfil normativo.');
    }

    if (exportEvidence.hasValidatedDate) {
        checks += 1;
    } else {
        blockers.push('validatedDate ausente no perfil.');
        nextActions.push('Definir data de validacao do perfil.');
    }

    if (exportEvidence.noLocalPaths) {
        checks += 1;
    } else {
        blockers.push('Perfil contem caminhos locais que nao podem ser exportados.');
        nextActions.push('Remover caminhos locais antes de exportar .ecbt.');
    }

    if (exportEvidence.referencesConsistent) {
        checks += 1;
    } else {
        blockers.push(`Referencias internas inconsistentes: ${exportEvidence.referenceIssueCount} problema(s).`);
        nextActions.push('Corrigir referencias cruzadas do perfil normativo.');
    }

    const score = _scorePart(checks, totalChecks, maxScore);
    return {
        id: 'export',
        label: 'Exportacao e evidencias',
        score,
        maxScore,
        passed: blockers.length === 0,
        complete: checks,
        total: totalChecks,
        blockers,
        nextActions,
    };
}

export function evaluateGacDd38ScorePillars(
    profile: GacDd38NormativeProfile,
    options?: { ux?: GacDd38ScoreUxEvidence; export?: GacDd38ScoreExportEvidence; target?: number },
): GacDd38ScoreResult {
    const target = options?.target ?? GAC_DD38_SCORE_TARGET;
    const pillars: GacDd38ScorePillar[] = [
        _evaluateSections(profile),
        _evaluateDecisions(profile),
        _evaluateDeliverables(profile),
        _evaluateUx(profile, options?.ux),
        _evaluateExport(profile, options?.export),
    ];

    const score = Math.min(1000, pillars.reduce((sum, p) => sum + p.score, 0));
    const blockers = pillars.flatMap((p) => p.blockers);
    const nextActions = pillars.flatMap((p) => p.nextActions);
    const passed = score >= target && blockers.length === 0;

    return {
        score,
        target,
        passed,
        verdict: passed ? 'pass' : 'fail',
        pillars,
        blockers,
        nextActions,
    };
}

export function renderGacDd38ScorePillarsReport(result: GacDd38ScoreResult): string {
    const lines = [
        `GAC/DD-038 Score 5 Pilares: ${result.score}/1000 (${result.verdict}; meta ${result.target})`,
        '',
        'Pilares:',
    ];
    for (const pillar of result.pillars) {
        lines.push(`- [${pillar.passed ? 'OK' : 'FALHA'}] ${pillar.label}: ${pillar.score}/${pillar.maxScore} (${pillar.complete}/${pillar.total})`);
        for (const blocker of pillar.blockers.slice(0, 3)) {
            lines.push(`    bloqueio: ${blocker}`);
        }
    }
    if (result.nextActions.length > 0) {
        lines.push('', 'Proximas acoes:');
        for (const action of result.nextActions.slice(0, 10)) {
            lines.push(`- ${action}`);
        }
    }
    return lines.join('\n');
}
