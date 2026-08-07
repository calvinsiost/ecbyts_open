// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   COMPLETION POLICY (pure) — LMS-INTERACTIVE-ASSESS-001 F7 / B1
   ================================================================
   Blind-spot #1 (auditoria 2026-06-14): a avaliação era contornável — o
   fail-safe "marcar concluída" (sem modelo/dados) dava CRÉDITO sem responder, e
   _maybeIssueCertificate defaultava score=100. Resultado: certificado sem lastro.

   Este módulo PURO separa "concluir a navegação" (não prender o aluno, NFR-5) de
   "ser avaliado" (integridade da certificação). Define quais tipos de lição são
   AVALIAÇÕES e decide a elegibilidade do certificado SEM default-100: o
   certificado só sai quando todas as lições avaliativas têm nota real (não
   puladas) e a nota final atinge o corte.

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

/** Tipos de lição que são AVALIAÇÕES (exigem nota real para certificar). */
const ASSESSMENT_TYPES: ReadonlySet<string> = new Set([
    'quiz',
    'model-quiz',
    'classify',
    'interpret',
    'case',
    'order-investigation',
    'remediation-decision',
    'emergency',
    'checklist',
]);

/** Tipos NÃO avaliativos (ler/assistir/praticar): written, video, interactive. */
export function isAssessmentType(type: unknown): boolean {
    return typeof type === 'string' && ASSESSMENT_TYPES.has(type);
}

export type CompletionOutcome = 'assessed' | 'skipped' | 'completed';

/**
 * Classifica o resultado de concluir uma lição:
 * - 'assessed'  → avaliação concluída COM nota (vale para o certificado).
 * - 'skipped'   → avaliação concluída via fail-safe (sem nota) — NÃO certifica.
 * - 'completed' → lição não avaliativa (leitura/vídeo/prática) concluída.
 */
export function classifyCompletion(type: unknown, hasScore: boolean): CompletionOutcome {
    if (!isAssessmentType(type)) return 'completed';
    return hasScore ? 'assessed' : 'skipped';
}

export interface CertLessonRef {
    readonly id: string;
    readonly type: string;
}

export type CertGapIssue = 'not_completed' | 'skipped_no_score' | 'below_passing';

export interface CertEligibility {
    readonly eligible: boolean;
    readonly reason: string;
    /** nº de lições avaliativas exigidas. */
    readonly requiredAssessments: number;
    /** nº de avaliativas concluídas COM nota. */
    readonly assessedOk: number;
    /** lacunas que impedem o certificado. */
    readonly gaps: ReadonlyArray<{ readonly lessonId: string; readonly issue: CertGapIssue }>;
}

export interface CertEligibilityInput {
    readonly lessons: readonly CertLessonRef[];
    readonly completedIds: readonly string[];
    /** notas por lessonId (0–100); ausência = pulada (fail-safe). */
    readonly scores: Readonly<Record<string, number>>;
    /** corte mínimo (final quiz / avaliações pontuadas). default 70. */
    readonly passingScore?: number;
}

/**
 * Elegibilidade do certificado SEM default-100. Exige que TODA lição avaliativa
 * do curso esteja concluída COM nota ≥ corte (nenhuma pulada). Cursos sem
 * avaliação (só leitura/vídeo) são elegíveis ao concluir.
 */
export function evaluateCourseCertificate(input: CertEligibilityInput): CertEligibility {
    const passing = Number.isFinite(input.passingScore) ? (input.passingScore as number) : 70;
    const completed = new Set((input.completedIds || []).filter(Boolean));
    const scores = input.scores || {};
    const required = (input.lessons || []).filter((l) => l && isAssessmentType(l.type));

    const gaps: Array<{ lessonId: string; issue: CertGapIssue }> = [];
    let assessedOk = 0;
    for (const l of required) {
        if (!completed.has(l.id)) {
            gaps.push({ lessonId: l.id, issue: 'not_completed' });
            continue;
        }
        const score = scores[l.id];
        if (!Number.isFinite(score)) {
            gaps.push({ lessonId: l.id, issue: 'skipped_no_score' });
            continue;
        }
        if ((score as number) < passing) {
            gaps.push({ lessonId: l.id, issue: 'below_passing' });
            continue;
        }
        assessedOk += 1;
    }

    const eligible = gaps.length === 0;
    const skipped = gaps.filter((g) => g.issue === 'skipped_no_score').length;
    const reason = eligible
        ? required.length === 0
            ? 'Curso concluído (sem avaliações) — certificado liberado.'
            : 'Todas as avaliações concluídas com nota — certificado liberado.'
        : skipped > 0
          ? `Certificado pendente: ${skipped} avaliação(ões) concluída(s) sem nota (carregue um modelo e refaça).`
          : 'Certificado pendente: há avaliações não concluídas ou abaixo do corte.';

    return Object.freeze({
        eligible,
        reason,
        requiredAssessments: required.length,
        assessedOk,
        gaps: Object.freeze(gaps),
    });
}

/** Há avaliações puladas (fail-safe) no progresso? — para mensagem de UX. */
export function hasSkippedAssessments(input: CertEligibilityInput): boolean {
    return evaluateCourseCertificate(input).gaps.some((g) => g.issue === 'skipped_no_score');
}

/**
 * Mensagem pt-BR pronta para a UI a partir dos gaps de evaluateCourseCertificate —
 * T5.1b: comunicar a regra ("faltam N") em vez de silêncio/mensagem genérica.
 * lessonTitleById é opcional (fallback ao id quando o título não é resolvível).
 */
export function describeCertificateGaps(
    gaps: CertEligibility['gaps'],
    lessonTitleById?: Readonly<Record<string, string>>,
): string {
    const list = gaps || [];
    if (list.length === 0) return '';
    const names = list.map((g) => (lessonTitleById && lessonTitleById[g.lessonId]) || g.lessonId);
    const noun = list.length === 1 ? 'avaliação' : 'avaliações';
    return `Faltam ${list.length} ${noun} para o certificado: ${names.join(', ')}.`;
}
