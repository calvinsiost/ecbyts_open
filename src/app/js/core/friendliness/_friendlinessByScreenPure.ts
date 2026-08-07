// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FRIENDLINESS BY SCREEN — score ATÔMICO por tela/rota
   FRIEND-SCORE-001 (Calvin 2026-06-14 "atomico por tela").

   O breakdown por seção (_friendlinessScorePure.computeFriendlinessBySection)
   soma só a PENALIDADE. "Atômico por tela" quer o SCORE COMPLETO e
   independente de CADA tela: overall + grade + veto + por-dimensão, rodando
   o motor não-compensatório sobre apenas os findings daquela tela. Responde
   "qual tela está pior — e por qual dimensão?".

   Casa com o axe-core (ui-ux-audit-run --a11y) que já emite findings com
   section = ui/<routeId>: cada rota auditada vira uma tela com seu score
   atômico. ADITIVO — reusa computeFriendlinessScore do core, não o altera.
   ================================================================ */

import {
    computeFriendlinessScore,
    type FrictionFinding,
    type FriendlinessScoreResult,
} from './_friendlinessScorePure.js';

/** Seção default quando um finding não declara `section`. */
export const UNASSIGNED_SCREEN = 'unassigned';

export interface ScreenScore {
    readonly screen: string;
    readonly overall: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly vetoApplied: boolean;
    readonly openFindings: number;
    readonly openBlockers: number;
    /** Pior dimensão da tela (menor score) — onde concentrar o trabalho. */
    readonly worstDimension: string | null;
    /** Resultado completo do motor para esta tela (drill-down). */
    readonly detail: FriendlinessScoreResult;
}

/**
 * Computa o score ATÔMICO de cada tela. Agrupa os findings ABERTOS por
 * `section` (a tela) — resolvidos não geram tela (sem dívida = sem entrada) —
 * e roda o motor completo por grupo. Ordenado pior→melhor (menor overall
 * primeiro; tiebreak determinístico por nome).
 */
export function computeFriendlinessByScreen(
    findings: ReadonlyArray<FrictionFinding>,
): ReadonlyArray<ScreenScore> {
    const list = Array.isArray(findings) ? findings : [];
    const byScreen = new Map<string, FrictionFinding[]>();

    for (const f of list) {
        if (!f || f.resolved) continue;
        const screen = typeof f.section === 'string' && f.section.trim() ? f.section.trim() : UNASSIGNED_SCREEN;
        const arr = byScreen.get(screen);
        if (arr) arr.push(f);
        else byScreen.set(screen, [f]);
    }

    const out: ScreenScore[] = [];
    for (const [screen, group] of byScreen) {
        const detail = computeFriendlinessScore(group);
        // Pior dimensão entre as que têm fricção aberta nesta tela.
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

/** Resumo de 1 linha por tela (CLI). */
export function summarizeScreenScore(s: ScreenScore): string {
    const w = s.worstDimension ? ` · pior:${s.worstDimension}` : '';
    return `${s.screen} ${s.overall}/100 [${s.grade}]${s.vetoApplied ? ' veto' : ''} · open=${s.openFindings}(blk=${s.openBlockers})${w}`;
}
