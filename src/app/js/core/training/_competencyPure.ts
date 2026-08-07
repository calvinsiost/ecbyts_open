// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   COMPETENCY & BADGES (pure) — LMS-INTERACTIVE-ASSESS-001 F6 / RF-13
   ================================================================
   Calvin 2026-06-14: "concluir casos acumula COMPETÊNCIAS (Caracterização,
   Risco, Remediação) e BADGES". Agrega as lições/casos concluídos (por tipo +
   nota) em competências do domínio ambiental e deriva os badges conquistados.
   Reúsa o padrão de FAIXA (bronze/prata/ouro) do EIS/severity — nível é
   não-compensatório: exige QUANTIDADE de evidência E qualidade (nota média).

   PURE: sem IO/DOM/THREE. Consome um registro de progresso (lições concluídas).
   ================================================================ */

export type CompetencyId =
    | 'characterization' // caracterização do sítio (dados, classificação de faixa)
    | 'interpretation' // interpretação de resultados (tendência temporal)
    | 'classification' // classificação regulatória da área (AP/AS/ACI)
    | 'risk' // avaliação de risco
    | 'remediation' // decisão/execução de remediação
    | 'response'; // resposta a emergência / procedimento de campo

export const COMPETENCY_LABELS: Readonly<Record<CompetencyId, string>> = Object.freeze({
    characterization: 'Caracterização',
    interpretation: 'Interpretação de resultados',
    classification: 'Classificação regulatória',
    risk: 'Avaliação de risco',
    remediation: 'Remediação',
    response: 'Resposta e campo',
});

/** Mapeia o TIPO de lição para as competências que ela exercita. */
const TYPE_TO_COMPETENCIES: Readonly<Record<string, readonly CompetencyId[]>> = Object.freeze({
    'model-quiz': Object.freeze<CompetencyId[]>(['characterization']),
    classify: Object.freeze<CompetencyId[]>(['characterization', 'classification']),
    interpret: Object.freeze<CompetencyId[]>(['interpretation']),
    'order-investigation': Object.freeze<CompetencyId[]>(['characterization']),
    'remediation-decision': Object.freeze<CompetencyId[]>(['remediation']),
    emergency: Object.freeze<CompetencyId[]>(['response']),
    checklist: Object.freeze<CompetencyId[]>(['response']),
    // um caso exercita o ciclo completo → evidência forte para várias competências
    case: Object.freeze<CompetencyId[]>([
        'characterization',
        'classification',
        'risk',
        'remediation',
    ]),
});

export interface LessonCompletion {
    readonly lessonId: string;
    readonly type: string;
    /** nota 0–100 quando avaliada; ausente para lições não pontuadas. */
    readonly score?: number;
    readonly passed?: boolean;
}

export type CompetencyLevel = 0 | 1 | 2 | 3; // none / bronze / prata / ouro

export interface CompetencyScore {
    readonly id: CompetencyId;
    readonly label: string;
    readonly evidenceCount: number;
    readonly avgScore: number; // 0–100 (média das evidências pontuadas)
    readonly level: CompetencyLevel;
    readonly earned: boolean; // level >= 1
}

export const LEVEL_LABELS: Readonly<Record<CompetencyLevel, string>> = Object.freeze({
    0: 'Não iniciada',
    1: 'Bronze',
    2: 'Prata',
    3: 'Ouro',
});

function _avg(nums: readonly number[]): number {
    const v = nums.filter((n) => Number.isFinite(n));
    if (v.length === 0) return 0;
    return Math.round(v.reduce((a, n) => a + n, 0) / v.length);
}

/**
 * Nível não-compensatório por competência:
 * - 0: nenhuma evidência aprovada.
 * - 1 (bronze): ≥ 1 evidência aprovada.
 * - 2 (prata): ≥ 2 evidências aprovadas E média ≥ 70.
 * - 3 (ouro):  ≥ 3 evidências aprovadas E média ≥ 85.
 */
function _levelOf(passedCount: number, avg: number): CompetencyLevel {
    if (passedCount >= 3 && avg >= 85) return 3;
    if (passedCount >= 2 && avg >= 70) return 2;
    if (passedCount >= 1) return 1;
    return 0;
}

/** Agrega as conclusões em competências (evidência + média + nível). */
export function computeCompetencies(
    completions: readonly LessonCompletion[],
): readonly CompetencyScore[] {
    const evidence = new Map<CompetencyId, { scores: number[]; passed: number }>();
    for (const id of Object.keys(COMPETENCY_LABELS) as CompetencyId[]) {
        evidence.set(id, { scores: [], passed: 0 });
    }
    for (const c of completions || []) {
        if (!c || typeof c.type !== 'string') continue;
        const comps = TYPE_TO_COMPETENCIES[c.type];
        if (!comps) continue;
        // lição é "evidência aprovada" se passed===true, ou (sem flag) score>=60.
        const hasScore = Number.isFinite(c.score);
        const isPassed = c.passed === true || (c.passed === undefined && hasScore && (c.score as number) >= 60);
        for (const comp of comps) {
            const bucket = evidence.get(comp)!;
            if (hasScore) bucket.scores.push(c.score as number);
            if (isPassed) bucket.passed += 1;
        }
    }

    return Object.freeze(
        (Object.keys(COMPETENCY_LABELS) as CompetencyId[]).map((id) => {
            const b = evidence.get(id)!;
            const avg = _avg(b.scores);
            const level = _levelOf(b.passed, b.scores.length ? avg : 100);
            return Object.freeze({
                id,
                label: COMPETENCY_LABELS[id],
                evidenceCount: b.passed,
                avgScore: avg,
                level,
                earned: level >= 1,
            });
        }),
    );
}

export interface BadgeAward {
    readonly id: string; // 'badge-remediation-2'
    readonly competencyId: CompetencyId;
    readonly label: string;
    readonly level: 1 | 2 | 3;
    readonly levelLabel: string;
}

/** Deriva os badges conquistados (um por competência com nível ≥ 1, no nível alcançado). */
export function computeBadges(competencies: readonly CompetencyScore[]): readonly BadgeAward[] {
    return Object.freeze(
        (competencies || [])
            .filter((c) => c.level >= 1)
            .map((c) =>
                Object.freeze({
                    id: `badge-${c.id}-${c.level}`,
                    competencyId: c.id,
                    label: `${c.label} — ${LEVEL_LABELS[c.level]}`,
                    level: c.level as 1 | 2 | 3,
                    levelLabel: LEVEL_LABELS[c.level],
                }),
            ),
    );
}

export type LearnerTitle = 'Iniciante' | 'Praticante' | 'Especialista' | 'Mestre';

export interface CompetencyProfile {
    readonly competencies: readonly CompetencyScore[];
    readonly badges: readonly BadgeAward[];
    /** competências conquistadas / total. */
    readonly earnedCount: number;
    readonly totalCount: number;
    /** soma dos níveis (0–18) — métrica de progresso global. */
    readonly levelSum: number;
    readonly title: LearnerTitle;
}

function _titleOf(earned: number, total: number, levelSum: number): LearnerTitle {
    if (total > 0 && earned === total && levelSum >= total * 3 - 1) return 'Mestre';
    if (earned >= Math.ceil(total * 0.66)) return 'Especialista';
    if (earned >= 1) return 'Praticante';
    return 'Iniciante';
}

/** Perfil completo de competências + badges + título do aluno. */
export function computeCompetencyProfile(
    completions: readonly LessonCompletion[],
): CompetencyProfile {
    const competencies = computeCompetencies(completions);
    const badges = computeBadges(competencies);
    const earnedCount = competencies.filter((c) => c.earned).length;
    const totalCount = competencies.length;
    const levelSum = competencies.reduce((a, c) => a + c.level, 0);
    return Object.freeze({
        competencies,
        badges,
        earnedCount,
        totalCount,
        levelSum,
        title: _titleOf(earnedCount, totalCount, levelSum),
    });
}
