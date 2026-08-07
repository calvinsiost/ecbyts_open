// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SEVERITY GLYPH — forma + rótulo por severidade (não-só-cor)
   RELATIONS-UX-001 F2 (R4). Calvin 2026-06-14.

   WCAG 1.4.1 (Use of Color): a severidade não pode ser comunicada SÓ por
   cor — daltônicos (8% dos homens) não distinguem vermelho/amarelo/verde.
   Pesquisa (Sigma/Carbon): adicionar forma/ícone + rótulo textual além da
   cor; testar protanopia/deuteranopia/tritanopia.

   Este módulo mapeia cada severidade → um GLYPH geométrico distinto (forma,
   não emoji) + chave i18n. Usado pela legenda (R3) e — quando o renderer
   quiser — desenhado sobre o nó crítico no canvas.

   Pure: sem DOM, sem cor hardcoded (a cor vem de severityDotColor). Frozen.
   ================================================================ */

export type SeverityKind = 'intervention' | 'prevention' | 'reference' | null;

export interface SeverityGlyph {
    readonly severity: Exclude<SeverityKind, null>;
    /** Nome da forma (semântico — para o renderer canvas escolher o traço). */
    readonly shape: 'triangle' | 'diamond' | 'circle';
    /** Símbolo HTML-entity para render textual (legenda/badge). Geométrico, não emoji. */
    readonly glyphChar: string;
    /** Chave i18n do rótulo (texto além da cor — WCAG 1.4.1). */
    readonly labelKey: string;
}

/** Catálogo canônico: forma distinta por severidade (distinguível sem cor). */
export const SEVERITY_GLYPHS: Readonly<Record<Exclude<SeverityKind, null>, SeverityGlyph>> =
    Object.freeze({
        // ▲ triângulo (alerta) = crítico/intervenção — a forma mais "urgente".
        intervention: Object.freeze({
            severity: 'intervention',
            shape: 'triangle',
            glyphChar: '▲',
            labelKey: 'relationsPanel.sevIntervention',
        }),
        // ◆ diamante = atenção/prevenção.
        prevention: Object.freeze({
            severity: 'prevention',
            shape: 'diamond',
            glyphChar: '◆',
            labelKey: 'relationsPanel.sevPrevention',
        }),
        // ● círculo = referência (linha de base).
        reference: Object.freeze({
            severity: 'reference',
            shape: 'circle',
            glyphChar: '●',
            labelKey: 'relationsPanel.sevReference',
        }),
    });

/** Severidade → glyph (null/desconhecida → null: sem marcador). */
export function resolveSeverityGlyph(sev: SeverityKind): SeverityGlyph | null {
    if (sev === 'intervention' || sev === 'prevention' || sev === 'reference') {
        return SEVERITY_GLYPHS[sev];
    }
    return null;
}

/** Ordem canônica das severidades para a legenda (mais grave primeiro). */
export const SEVERITY_ORDER: ReadonlyArray<Exclude<SeverityKind, null>> = Object.freeze([
    'intervention',
    'prevention',
    'reference',
]);
