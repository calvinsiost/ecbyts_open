// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   UX TRIAD — agregador NÃO-compensatório dos 3 indicadores de UX por tela
   UI-MINIMALISM-001 RF-7. Calvin 2026-06-15.

   Combina, POR TELA, os três indicadores programáticos de UX:
     - UF  Friendliness (facilidade)  → core/friendliness
     - UI  Quality-per-screen (Nielsen/WCAG/código) → scripts/quality
     - MIN Minimalism (ruído)         → core/minimalism

   Veredito NÃO-COMPENSATÓRIO: a PIOR das três puxa (uma tela amigável mas
   verbosa, ou minimal mas inacessível, NÃO ganha nota boa). Degrada gracioso:
   se um eixo falta para uma tela, o veredito usa só os presentes — nunca
   inventa um zero falso. PURO: recebe três mapas tela→nota, devolve as linhas
   ordenadas pior→melhor. Sem DOM/IO. Extraído de ux-triad-report.mjs para
   habilitar cheap tests (RF-7 / F2.6).
   ================================================================ */

export type TriadGrade = 'A' | 'B' | 'C' | 'D' | 'F' | '—';

export interface TriadRow {
    readonly screen: string;
    readonly uf: number | null;
    readonly ui: number | null;
    readonly min: number | null;
    /** A pior das notas presentes (não-compensatório). null se nenhuma presente. */
    readonly verdict: number | null;
    readonly verdictGrade: TriadGrade;
    /** "k/3" — quantos eixos foram medidos para esta tela. */
    readonly coverage: string;
    /** Rótulo do eixo que puxou o veredito (o pior presente). */
    readonly worstAxis: string | null;
}

/** Grade A≥90 / B≥80 / C≥70 / D≥60 / F; null/ausente → "—". */
export function triadGradeFor(score: number | null | undefined): TriadGrade {
    if (score == null || !Number.isFinite(score)) return '—';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

function _num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Agrega os três eixos por tela com veredito NÃO-compensatório (a pior das
 * notas PRESENTES puxa). Une as telas das três fontes; ordena pior-veredito
 * primeiro (telas sem nenhuma medição por último); tiebreak determinístico por
 * nome. Resultado frozen.
 */
export function aggregateUxTriad(
    ufByScreen: ReadonlyMap<string, number | null> | Record<string, number | null>,
    uiByScreen: ReadonlyMap<string, number | null> | Record<string, number | null>,
    minByScreen: ReadonlyMap<string, number | null> | Record<string, number | null>,
): ReadonlyArray<TriadRow> {
    const get = (
        src: ReadonlyMap<string, number | null> | Record<string, number | null>,
        key: string,
    ): number | null => {
        const raw = src instanceof Map ? src.get(key) : (src as Record<string, number | null>)[key];
        return _num(raw);
    };
    const keysOf = (src: ReadonlyMap<string, number | null> | Record<string, number | null>): string[] =>
        src instanceof Map ? [...src.keys()] : Object.keys(src || {});

    const screens = new Set<string>([
        ...keysOf(ufByScreen),
        ...keysOf(uiByScreen),
        ...keysOf(minByScreen),
    ]);

    const rows: TriadRow[] = [];
    for (const screen of screens) {
        const uf = get(ufByScreen, screen);
        const ui = get(uiByScreen, screen);
        const min = get(minByScreen, screen);
        const present = [uf, ui, min].filter((v): v is number => v != null);
        const verdict = present.length ? Math.min(...present) : null;
        let worstAxis: string | null = null;
        if (verdict != null) {
            // Ordem de desempate do rótulo: UF → MIN → UI (espelha o script).
            worstAxis =
                verdict === uf
                    ? 'UF (friendliness)'
                    : verdict === min
                      ? 'MIN (minimalismo)'
                      : 'UI (quality)';
        }
        rows.push(
            Object.freeze({
                screen,
                uf,
                ui,
                min,
                verdict,
                verdictGrade: triadGradeFor(verdict),
                coverage: `${present.length}/3`,
                worstAxis,
            }),
        );
    }

    rows.sort((a, b) => {
        if (a.verdict == null && b.verdict == null) return a.screen.localeCompare(b.screen);
        if (a.verdict == null) return 1;
        if (b.verdict == null) return -1;
        return a.verdict - b.verdict || a.screen.localeCompare(b.screen);
    });

    return Object.freeze(rows);
}
