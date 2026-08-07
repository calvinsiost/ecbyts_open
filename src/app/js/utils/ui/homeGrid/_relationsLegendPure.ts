// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS LEGEND — VM da legenda de severidade do painel Relações
   RELATIONS-UX-001 F2 (R3). Calvin 2026-06-14.

   Pesquisa (Sigma/Carbon): legenda ≤8 itens; nunca depender só de cor;
   rotular direto. Este módulo monta o ViewModel da legenda — cada severidade
   PRESENTE no grafo vira uma entrada com cor + glyph (forma) + chave i18n.
   Só inclui severidades com contagem > 0 (legenda enxuta, relevante ao que
   está na tela). O renderer (DOM) injeta o markup.

   Pure: sem DOM. A cor vem do caller (severityDotColor) e o glyph de
   _severityGlyphPure — este módulo só compõe e ordena. Frozen.
   ================================================================ */

import { SEVERITY_ORDER, resolveSeverityGlyph, type SeverityKind } from './_severityGlyphPure.js';

export interface LegendEntry {
    readonly severity: Exclude<SeverityKind, null>;
    readonly color: string;
    /** Símbolo geométrico (forma — WCAG 1.4.1). */
    readonly glyphChar: string;
    readonly labelKey: string;
    readonly count: number;
}

export interface SeverityCounts {
    readonly intervention?: number;
    readonly prevention?: number;
    readonly reference?: number;
}

/** Máximo de entradas na legenda (Sigma: ≤8 antes de confundir). */
export const LEGEND_MAX_ENTRIES = 8;

/**
 * Constrói a legenda de severidade: uma entrada por severidade PRESENTE
 * (count>0), na ordem canônica (mais grave primeiro), cada uma com cor +
 * glyph + rótulo i18n. `colorOf` injeta a cor (reusa severityDotColor sem
 * acoplar). Vazio → legenda some (nada a explicar).
 */
export function buildSeverityLegend(
    counts: SeverityCounts,
    colorOf: (sev: Exclude<SeverityKind, null>) => string,
): ReadonlyArray<LegendEntry> {
    const out: LegendEntry[] = [];
    for (const sev of SEVERITY_ORDER) {
        const count = _nonNegInt((counts as any)?.[sev]);
        if (count <= 0) continue;
        const glyph = resolveSeverityGlyph(sev);
        if (!glyph) continue;
        out.push(
            Object.freeze({
                severity: sev,
                color: typeof colorOf === 'function' ? String(colorOf(sev)) : '#94a3b8',
                glyphChar: glyph.glyphChar,
                labelKey: glyph.labelKey,
                count,
            }),
        );
        if (out.length >= LEGEND_MAX_ENTRIES) break;
    }
    return Object.freeze(out);
}

function _nonNegInt(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
