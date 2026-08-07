// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MINIMALISM BY SCREEN — score ATÔMICO de RUÍDO por tela/rota
   UI-MINIMALISM-001 RF-4. Calvin 2026-06-15.

   Espelha `_friendlinessByScreenPure`: agrupa os findings de clutter por
   `screen` e roda o motor não-compensatório completo por grupo, devolvendo
   overall + grade + veto + pior dimensão por tela. Responde "qual tela está
   mais verbosa — e por qual dimensão de ruído?". ADITIVO — reusa
   `computeMinimalismScore` do core, não o altera.

   Também agrega a SUÍTE (média não-compensatória das telas) p/ um número
   único da aplicação, na linha do North Star v2 (minimalismo ratcheteável).
   ================================================================ */

import {
    computeMinimalismScore,
    type ClutterFinding,
    type MinimalismScoreResult,
    type MinimalismGrade,
} from './_minimalismScorePure.js';

/** Tela default quando um finding não declara `screen`. */
export const UNASSIGNED_SCREEN = 'unassigned';

export interface ScreenScore {
    readonly screen: string;
    readonly overall: number;
    readonly grade: MinimalismGrade;
    readonly vetoApplied: boolean;
    readonly openFindings: number;
    readonly openBlockers: number;
    /** Pior dimensão da tela (menor score) — onde concentrar o drain. */
    readonly worstDimension: string | null;
    /** Resultado completo do motor para esta tela (drill-down). */
    readonly detail: MinimalismScoreResult;
}

/**
 * Computa o score ATÔMICO de cada tela. Agrupa os findings ABERTOS por `screen`
 * (resolvidos não geram tela — sem ruído aberto = sem entrada) e roda o motor
 * completo por grupo. Ordenado pior→melhor (menor overall primeiro; tiebreak
 * determinístico por nome).
 */
export function computeMinimalismByScreen(
    findings: ReadonlyArray<ClutterFinding>,
): ReadonlyArray<ScreenScore> {
    const list = Array.isArray(findings) ? findings : [];
    const byScreen = new Map<string, ClutterFinding[]>();

    for (const f of list) {
        if (!f || f.resolved) continue;
        const screen = typeof f.screen === 'string' && f.screen.trim() ? f.screen.trim() : UNASSIGNED_SCREEN;
        const arr = byScreen.get(screen);
        if (arr) arr.push(f);
        else byScreen.set(screen, [f]);
    }

    const out: ScreenScore[] = [];
    for (const [screen, group] of byScreen) {
        const detail = computeMinimalismScore(group);
        let worst: { dimension: string; score: number } | null = null;
        for (const d of detail.perDimension) {
            if (d.openFindings > 0 && (worst === null || d.score < worst.score)) {
                worst = { dimension: d.dimension, score: d.score };
            }
        }
        out.push(
            Object.freeze({
                screen,
                overall: detail.overall,
                grade: detail.grade,
                vetoApplied: detail.vetoApplied,
                openFindings: detail.totals.open,
                openBlockers: detail.totals.openBlockers,
                worstDimension: worst ? worst.dimension : null,
                detail,
            }),
        );
    }

    out.sort((a, b) => a.overall - b.overall || a.screen.localeCompare(b.screen));
    return Object.freeze(out);
}

export interface SuiteAggregate {
    /** Número único da suíte: média NÃO-compensatória das telas (geo-mean). */
    readonly overall: number;
    readonly grade: MinimalismGrade;
    readonly screenCount: number;
    /** Quantas telas têm bloqueio aberto (job-mixing). */
    readonly screensWithBlocker: number;
    /** Pior tela (menor overall) — onde começar o drain. */
    readonly worstScreen: string | null;
    readonly worstOverall: number | null;
}

const GRADE_THRESHOLDS = [
    { grade: 'A' as const, min: 90 },
    { grade: 'B' as const, min: 80 },
    { grade: 'C' as const, min: 70 },
    { grade: 'D' as const, min: 60 },
    { grade: 'F' as const, min: 0 },
];

function _gradeFor(score: number): MinimalismGrade {
    for (const t of GRADE_THRESHOLDS) if (score >= t.min) return t.grade;
    return 'F';
}

/**
 * Agrega o score das telas num número único da SUÍTE, NÃO-compensatório (média
 * geométrica): uma tela péssima não é mascarada por telas boas — coerente com a
 * filosofia do codebase (EIS/friendliness). Telas sem ruído (overall 100) ainda
 * entram (crédito). Sem telas → 100 (nada a drenar).
 */
export function aggregateMinimalismSuite(
    byScreen: ReadonlyArray<ScreenScore>,
): SuiteAggregate {
    const list = Array.isArray(byScreen) ? byScreen : [];
    if (!list.length) {
        return Object.freeze({
            overall: 100,
            grade: 'A',
            screenCount: 0,
            screensWithBlocker: 0,
            worstScreen: null,
            worstOverall: null,
        });
    }
    const GEO_EPSILON = 1;
    let lnSum = 0;
    let withBlocker = 0;
    let worst: ScreenScore | null = null;
    for (const s of list) {
        lnSum += Math.log(s.overall + GEO_EPSILON);
        if (s.openBlockers > 0) withBlocker++;
        if (worst === null || s.overall < worst.overall) worst = s;
    }
    let overall = Math.exp(lnSum / list.length) - GEO_EPSILON;
    overall = Math.max(0, Math.min(100, Math.round(overall * 100) / 100));
    return Object.freeze({
        overall,
        grade: _gradeFor(overall),
        screenCount: list.length,
        screensWithBlocker: withBlocker,
        worstScreen: worst ? worst.screen : null,
        worstOverall: worst ? worst.overall : null,
    });
}

/** Resumo de 1 linha por tela (CLI). */
export function summarizeScreenScore(s: ScreenScore): string {
    const w = s.worstDimension ? ` · pior:${s.worstDimension}` : '';
    return `${s.screen} ${s.overall}/100 [${s.grade}]${s.vetoApplied ? ' veto' : ''} · open=${s.openFindings}(blk=${s.openBlockers})${w}`;
}
