// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Figure category classifier — pure logic (RF-2 of SPEC_VISION_FALLBACK).
 *
 * Classifies a figure caption into one of 6 canonical categories so the
 * vision provider knows what prompt template to use. Heuristic only — the
 * vision model itself confirms by running its own analyser.
 *
 * Category vocabulary (SPEC §2.1 RF-2):
 *   - perfil_sondagem    — well logs, lithology profiles
 *   - cross_section      — geological cross-sections
 *   - pluma              — concentration iso-lines
 *   - potenciometrico    — piezometric maps
 *   - mapa_localizacao   — locator maps / project area outline
 *   - generic            — default catch-all
 *
 * Tests live in `tests/figure-category-classifier-pure.test.mjs`.
 */

export type FigureCategory =
    | 'perfil_sondagem'
    | 'cross_section'
    | 'pluma'
    | 'potenciometrico'
    | 'mapa_localizacao'
    | 'generic';

export interface ClassificationResult {
    readonly category: FigureCategory;
    readonly matchedPattern: string | null;
}

// Pattern table — order matters: first match wins.
const PATTERN_TABLE: ReadonlyArray<{
    readonly pattern: RegExp;
    readonly category: FigureCategory;
}> = Object.freeze([
    { pattern: /perfil|sondagem|log\s+(litol[óo]gico|de\s+po[çc]o)/i, category: 'perfil_sondagem' },
    { pattern: /se[çc][ãa]o|corte\s+(geol[óo]gico|geol[óo]gica)?|cross[\s_-]?section/i, category: 'cross_section' },
    { pattern: /pluma|isolinhas?\s+de\s+concentra/i, category: 'pluma' },
    { pattern: /potenciom[eé]tric[oa]|piezom[eé]tric[oa]/i, category: 'potenciometrico' },
    { pattern: /mapa\s+d[aeo]\s+(localiza|[áa]rea\s+do\s+(projeto|empreendimento))|mapa\s+(localiza|[áa]rea\s+do\s+(projeto|empreendimento))/i, category: 'mapa_localizacao' },
]);

/**
 * Classify a figure caption. Returns category + matched pattern string for
 * provenance. Empty / non-string captions → generic with null pattern.
 */
export function classifyFigureCategory(caption: unknown): ClassificationResult {
    if (typeof caption !== 'string' || caption.length === 0) {
        return Object.freeze({ category: 'generic', matchedPattern: null });
    }
    for (const entry of PATTERN_TABLE) {
        if (entry.pattern.test(caption)) {
            return Object.freeze({
                category: entry.category,
                matchedPattern: entry.pattern.source,
            });
        }
    }
    return Object.freeze({ category: 'generic', matchedPattern: null });
}

/** Convenience — return only the category id. */
export function categoryOf(caption: unknown): FigureCategory {
    return classifyFigureCategory(caption).category;
}

/**
 * Return all canonical categories — useful for UI grouping / typed iteration.
 */
export function listFigureCategories(): ReadonlyArray<FigureCategory> {
    return Object.freeze([
        'perfil_sondagem',
        'cross_section',
        'pluma',
        'potenciometrico',
        'mapa_localizacao',
        'generic',
    ]);
}
