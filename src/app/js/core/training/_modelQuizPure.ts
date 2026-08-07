// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODEL-AWARE QUIZ (pure) — SPEC_TRAINING_MODULE_LMS
   ================================================================
   Calvin 2026-06-14: "permitir ao usuário dentro do treinamento ter acesso aos
   elementos reais do modelo e poder ser questionado sobre eles, p.e. em um quiz
   'qual dos poços destacados está acima do valor de referência?'".

   Gera uma pergunta de múltipla escolha a partir dos ELEMENTOS REAIS do modelo
   carregado. O adapter de runtime (utils/ui/lmsManager) classifica cada poço
   contra os limites regulatórios (computeElementCompliance → VR/VP/VI) e passa
   candidatos {id,name,exceeds} para este gerador PURO, que monta o enunciado,
   as opções, o conjunto correto e os ids a destacar no 3D. Correção também aqui.

   PURE: sem IO, sem DOM, sem THREE. Testável isoladamente.
   ================================================================ */

export interface QuizCandidate {
    readonly id: string;
    readonly name: string;
    /** true se o poço tem ao menos uma medição acima do Valor de Referência. */
    readonly exceeds: boolean;
    /** pior severity de compliance (intervention/prevention/reference) ou null. */
    readonly severity?: string | null;
}

export interface ModelQuizQuestion {
    readonly ok: boolean;
    readonly reason?: string;
    readonly questionText: string;
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
    /** ids dos poços acima do VR (resposta correta). */
    readonly correctIds: readonly string[];
    /** ids a destacar (outline) no 3D — todos os candidatos apresentados. */
    readonly highlightIds: readonly string[];
    readonly multiSelect: true;
}

export interface ModelQuizGrade {
    readonly passed: boolean;
    /** 0..100 — proporção de acertos (Jaccard sobre o conjunto union). */
    readonly score: number;
    readonly correctIds: readonly string[];
    readonly selectedIds: readonly string[];
    readonly missed: readonly string[];
    readonly wrong: readonly string[];
}

const DEFAULT_MAX_OPTIONS = 6;
const SEVERITY_RANK: Record<string, number> = { intervention: 4, prevention: 3, reference: 2, info: 1 };

/** Severity é "acima do VR" se rank >= reference (2). */
export function isAboveReference(severity: unknown): boolean {
    if (typeof severity !== 'string') return false;
    return (SEVERITY_RANK[severity] || 0) >= (SEVERITY_RANK.reference ?? 2);
}

/**
 * Constrói a pergunta a partir dos candidatos (poços reais do modelo).
 * @param candidates Lista de poços com flag exceeds (acima do VR).
 * @param opts maxOptions (default 6).
 */
export function buildModelElementQuestion(
    candidates: readonly QuizCandidate[],
    opts: { maxOptions?: number } = {},
): ModelQuizQuestion {
    const maxOptions = Math.max(2, Math.min(12, Math.floor(opts.maxOptions ?? DEFAULT_MAX_OPTIONS)));
    const valid = (Array.isArray(candidates) ? candidates : []).filter(
        (c) => c && typeof c.id === 'string' && c.id.length > 0 && typeof c.name === 'string',
    );
    if (valid.length < 2) {
        return Object.freeze({
            ok: false,
            reason: 'Modelo sem poços suficientes para a pergunta (mínimo 2 com dados).',
            questionText: '',
            options: Object.freeze([]),
            correctIds: Object.freeze([]),
            highlightIds: Object.freeze([]),
            multiSelect: true as const,
        });
    }

    // Prioriza um mix (alguns acima, alguns abaixo) para uma pergunta significativa,
    // mas funciona com qualquer distribuição.
    const above = valid.filter((c) => c.exceeds);
    const below = valid.filter((c) => !c.exceeds);
    const ordered = _interleave(above, below).slice(0, maxOptions);

    const options = ordered.map((c) => Object.freeze({ id: c.id, label: c.name }));
    const correctIds = ordered.filter((c) => c.exceeds).map((c) => c.id);
    const highlightIds = ordered.map((c) => c.id);

    return Object.freeze({
        ok: true,
        questionText:
            'Observe os poços destacados no modelo 3D. Selecione TODOS os que têm ao menos ' +
            'uma medição acima do Valor de Referência (VR).',
        options: Object.freeze(options),
        correctIds: Object.freeze(correctIds),
        highlightIds: Object.freeze(highlightIds),
        multiSelect: true as const,
    });
}

/**
 * Corrige a resposta. Passa se o conjunto selecionado == conjunto correto (exato).
 * score = Jaccard(selected, correct) × 100 (parcial, p/ feedback).
 */
export function gradeModelQuiz(
    selectedIds: readonly string[],
    correctIds: readonly string[],
): ModelQuizGrade {
    const sel = new Set((Array.isArray(selectedIds) ? selectedIds : []).filter(Boolean));
    const cor = new Set((Array.isArray(correctIds) ? correctIds : []).filter(Boolean));
    const missed = [...cor].filter((id) => !sel.has(id));
    const wrong = [...sel].filter((id) => !cor.has(id));
    const union = new Set([...sel, ...cor]);
    const inter = [...sel].filter((id) => cor.has(id)).length;
    // Conjuntos vazios idênticos = 100% (nenhum acima, usuário não marcou nada).
    const score = union.size === 0 ? 100 : Math.round((inter / union.size) * 100);
    const passed = missed.length === 0 && wrong.length === 0;
    return Object.freeze({
        passed,
        score,
        correctIds: Object.freeze([...cor]),
        selectedIds: Object.freeze([...sel]),
        missed: Object.freeze(missed),
        wrong: Object.freeze(wrong),
    });
}

/** Intercala duas listas (a,b,a,b,...) preservando a ordem relativa. */
function _interleave<T>(a: readonly T[], b: readonly T[]): T[] {
    const out: T[] = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (i < a.length) out.push(a[i]!);
        if (i < b.length) out.push(b[i]!);
    }
    return out;
}
