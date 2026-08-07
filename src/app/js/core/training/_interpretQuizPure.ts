// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   INTERPRET QUIZ (pure) — LMS-INTERACTIVE-ASSESS-001 F1 / RF-2
   ================================================================
   Calvin 2026-06-14: interpretar a TENDÊNCIA temporal de um parâmetro num poço
   REAL do modelo (ex.: "a concentração está aumentando, estável ou em queda?").
   O adapter de runtime (lmsManager) monta a série temporal real e roda
   computeMannKendallTrend (Mann-Kendall, α=0.05); passa {wellName,parameterLabel,
   n,correctTrend} para este gerador PURO, que monta a pergunta e corrige.

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

export type TrendDirection = 'increasing' | 'stable' | 'decreasing';

export const TREND_LABELS: Readonly<Record<TrendDirection, string>> = Object.freeze({
    increasing: 'Tendência de AUMENTO (piora) — concentração crescente',
    stable: 'Estável — sem tendência estatística significativa',
    decreasing: 'Tendência de QUEDA (atenuação) — concentração decrescente',
});

const TREND_ORDER: readonly TrendDirection[] = Object.freeze(['increasing', 'stable', 'decreasing']);

/** Mapeia o resultado do Mann-Kendall (increasing/decreasing/no_trend) para a opção. */
export function trendFromMannKendall(mkTrend: unknown): TrendDirection {
    if (mkTrend === 'increasing') return 'increasing';
    if (mkTrend === 'decreasing') return 'decreasing';
    return 'stable'; // 'no_trend' ou qualquer outro
}

export interface InterpretQuestion {
    readonly ok: boolean;
    readonly reason?: string;
    readonly questionText: string;
    readonly contextNote: string;
    readonly options: ReadonlyArray<{ readonly id: TrendDirection; readonly label: string }>;
    readonly correctId: TrendDirection;
    readonly multiSelect: false;
}

export interface InterpretInput {
    readonly wellName: string;
    readonly parameterLabel: string;
    /** nº de pontos da série (para o contexto; mínimo 4 para Mann-Kendall útil). */
    readonly n: number;
    readonly correctTrend: TrendDirection;
}

const MIN_POINTS = 4;

/** Monta a pergunta de interpretação de tendência (escolha única). */
export function buildInterpretQuestion(input: InterpretInput): InterpretQuestion {
    if (
        !input ||
        typeof input.wellName !== 'string' ||
        typeof input.parameterLabel !== 'string' ||
        !TREND_ORDER.includes(input.correctTrend) ||
        Number(input.n) < MIN_POINTS
    ) {
        return Object.freeze({
            ok: false,
            reason: `Série temporal insuficiente (mínimo ${MIN_POINTS} pontos).`,
            questionText: '',
            contextNote: '',
            options: Object.freeze([]),
            correctId: 'stable',
            multiSelect: false as const,
        });
    }
    return Object.freeze({
        ok: true,
        questionText:
            `Observe a série temporal de ${input.parameterLabel} no poço ${input.wellName} ` +
            `(${input.n} campanhas). Qual é a tendência segundo o teste de Mann-Kendall?`,
        contextNote:
            'Mann-Kendall é não-paramétrico (α = 0,05): detecta tendência monotônica ' +
            'sem assumir distribuição — padrão para séries ambientais.',
        options: Object.freeze(TREND_ORDER.map((id) => Object.freeze({ id, label: TREND_LABELS[id] }))),
        correctId: input.correctTrend,
        multiSelect: false as const,
    });
}

export interface InterpretGrade {
    readonly passed: boolean;
    readonly score: 0 | 100;
    readonly correctId: TrendDirection;
    readonly correctLabel: string;
}

/** Corrige a interpretação (escolha única, exata). */
export function gradeInterpret(answer: unknown, correctTrend: TrendDirection): InterpretGrade {
    const passed = answer === correctTrend;
    return Object.freeze({
        passed,
        score: passed ? 100 : 0,
        correctId: correctTrend,
        correctLabel: TREND_LABELS[correctTrend],
    });
}
