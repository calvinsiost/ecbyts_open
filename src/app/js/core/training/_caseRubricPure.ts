// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CASE RUBRIC (pure) — LMS-INTERACTIVE-ASSESS-001 F2 / RF-6
   ================================================================
   Pontuação NÃO-COMPENSATÓRIA do caso (padrão EIS/severity): cada dimensão
   (Caracterização, Classificação, Risco, Remediação, Custo) é pontuada 0–100;
   a nota geral é a média geométrica ponderada (uma dimensão fraca derruba o
   conjunto — não dá para "comprar" nota boa). Vetos zeram para faixa F (ex.:
   remediar sem caracterizar). Faixa A–F.

   PURE: sem IO/DOM. Consome CaseState + CaseDefinition de _caseEnginePure.
   ================================================================ */

import type { CaseState, CaseDefinition } from './_caseEnginePure.js';

export interface DimensionScore {
    readonly id: string;
    readonly label: string;
    readonly score: number; // 0–100
}

export interface CaseScore {
    readonly overall: number; // 0–100 (não-compensatório)
    readonly band: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly dimensions: readonly DimensionScore[];
    readonly vetoes: readonly string[];
    readonly passed: boolean; // band >= C
    readonly summary: string;
}

const COST_FLAG = '__cost__';

function _bandOf(overall: number): CaseScore['band'] {
    if (overall >= 90) return 'A';
    if (overall >= 75) return 'B';
    if (overall >= 60) return 'C';
    if (overall >= 40) return 'D';
    return 'F';
}

/** Pontua a dimensão de custo: 100 se dentro do orçamento; decai linearmente. */
function _costScore(state: CaseState, def: CaseDefinition): number {
    const budget = Math.max(1, def.budgetCents || 0);
    const spent = Math.max(0, state.budgetSpentCents || 0);
    if (spent <= budget) return 100;
    const overPct = ((spent - budget) / budget) * 100;
    return Math.max(0, Math.round(100 - overPct));
}

/** Pontua a dimensão de sucesso (flag): 100 correta, 50 fora de ordem, 0 ausente. */
function _flagScore(state: CaseState, successFlag: string): number {
    if (state.flags[successFlag] !== true) return 0;
    return state.flagCorrect[successFlag] === true ? 100 : 50;
}

/**
 * Média geométrica ponderada (não-compensatória). Clampa cada dimensão em
 * [1,100] para evitar ln(0) — uma dimensão 0 vira 1 e derruba o conjunto, sem
 * zerar absoluto (a menos de veto).
 */
function _weightedGeoMean(scores: ReadonlyArray<{ score: number; weight: number }>): number {
    const valid = scores.filter((s) => s.weight > 0);
    if (valid.length === 0) return 0;
    const totalW = valid.reduce((a, s) => a + s.weight, 0);
    const sumWLn = valid.reduce((a, s) => a + s.weight * Math.log(Math.min(100, Math.max(1, s.score))), 0);
    return Math.round(Math.exp(sumWLn / totalW));
}

/** Avalia o caso: dimensões + média geométrica ponderada + vetos + faixa. */
export function scoreCase(state: CaseState, def: CaseDefinition): CaseScore {
    const dims = def.rubric?.dimensions || [];
    const dimensions: DimensionScore[] = dims.map((d) => {
        const score = d.successFlag === COST_FLAG ? _costScore(state, def) : _flagScore(state, d.successFlag);
        return { id: d.id, label: d.label, score };
    });

    let overall = _weightedGeoMean(dims.map((d, i) => ({ score: dimensions[i]!.score, weight: d.weight })));

    // Vetos: uma etapa CRÍTICA executada fora de ordem/inadequada (flag definida
    // mas flagCorrect != true) capeia a nota para faixa F (≤ 39). Ex.: remediar
    // sem caracterizar, ou com técnica inadequada. Se a etapa foi feita
    // corretamente (flagCorrect === true), não há veto.
    const vetoes: string[] = [];
    for (const v of def.rubric?.vetoes || []) {
        if (state.flags[v.whenFlag] === true && state.flagCorrect[v.whenFlag] !== true) {
            vetoes.push(v.message);
            overall = Math.min(overall, 39);
        }
    }

    const band = _bandOf(overall);
    const passed = overall >= 60;
    const summary = vetoes.length
        ? `Veto aplicado: ${vetoes[0]}`
        : passed
          ? 'Bom raciocínio — sequência de decisões adequada.'
          : 'Reveja a sequência: caracterizar antes de classificar/remediar.';

    return Object.freeze({
        overall,
        band,
        dimensions: Object.freeze(dimensions),
        vetoes: Object.freeze(vetoes),
        passed,
        summary,
    });
}
