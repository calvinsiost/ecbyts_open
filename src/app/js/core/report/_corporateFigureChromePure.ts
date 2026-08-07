// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// REPORT-FIG-CAT-001 — Caption + chrome resolver (pure-logic).
//
// Resolve o `captionTemplate` de um FigureType substituindo placeholders
// usando o `subset` da figura + metadados globais (número sequencial, citação).
//
// Spec: docs/specs/features/SPEC_REPORT_FIGURE_CATALOG_2026_05_29.md (DoD item 4)
// corrId: d7dcac60 (footer customizável).
//
// Pure-logic 100%: sem DOM, sem IO. Object.freeze nos returns.

import type { FigureType, SubsetFilterDim } from './_figureCatalog';

export interface CaptionSubset {
    readonly N?: number | string | null;
    readonly area?: string | null;
    readonly campanha?: string | null;
    readonly matriz?: string | null;
    readonly contaminante?: string | null;
    readonly cenario_risco?: string | null;
    readonly wellCount?: number | null;
    readonly citacao?: string | null;
    readonly [key: string]: unknown;
}

export interface CaptionResolverInput {
    readonly figureType: FigureType;
    readonly subset?: CaptionSubset | null;
}

export interface CaptionResolverResult {
    readonly caption: string;
    readonly missingPlaceholders: ReadonlyArray<string>;
    readonly resolvedPlaceholders: ReadonlyArray<string>;
    readonly hasUnresolved: boolean;
}

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const FALLBACK_TOKEN = '—';

/**
 * Extrai todos os placeholders únicos de um template (ordem de aparição).
 */
export function extractPlaceholders(template: unknown): ReadonlyArray<string> {
    if (typeof template !== 'string' || template.length === 0) return Object.freeze([]);
    const seen = new Set<string>();
    const out: string[] = [];
    let match: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
        const k = match[1]!; // PLACEHOLDER_RE tem grupo 1 garantido quando casa
        if (!seen.has(k)) {
            seen.add(k);
            out.push(k);
        }
    }
    return Object.freeze(out);
}

/**
 * Normaliza valor → string para substituição. null/undefined → FALLBACK_TOKEN.
 */
function valueToString(v: unknown): string {
    if (v === null || v === undefined) return FALLBACK_TOKEN;
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return FALLBACK_TOKEN;
        return String(v);
    }
    if (typeof v === 'boolean') return v ? 'sim' : 'não';
    try {
        return JSON.stringify(v);
    } catch {
        return FALLBACK_TOKEN;
    }
}

/**
 * Resolve placeholders no captionTemplate usando subset.
 * Placeholders não-encontrados em subset → marcados em missingPlaceholders e
 * substituídos pelo FALLBACK_TOKEN (não quebra a string).
 *
 * Defensive:
 *   - figureType null/undefined → caption fallback "Figura — (sem template)"
 *   - subset null/undefined → todos placeholders viram FALLBACK_TOKEN
 *   - captionTemplate vazio → caption vazia
 */
export function resolveCaption(input: unknown): CaptionResolverResult {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            caption: 'Figura — (sem template)',
            missingPlaceholders: Object.freeze([] as string[]),
            resolvedPlaceholders: Object.freeze([] as string[]),
            hasUnresolved: true,
        });
    }
    const inp = input as CaptionResolverInput;
    const ft = inp.figureType;
    if (!ft || typeof ft !== 'object' || typeof ft.captionTemplate !== 'string') {
        return Object.freeze({
            caption: 'Figura — (sem template)',
            missingPlaceholders: Object.freeze([] as string[]),
            resolvedPlaceholders: Object.freeze([] as string[]),
            hasUnresolved: true,
        });
    }

    const tpl = ft.captionTemplate;
    const subset = (inp.subset && typeof inp.subset === 'object' ? inp.subset : {}) as CaptionSubset;

    const placeholders = extractPlaceholders(tpl);
    const missing: string[] = [];
    const resolved: string[] = [];

    let caption = tpl;
    for (const key of placeholders) {
        const raw = (subset as Record<string, unknown>)[key];
        const hasValue =
            raw !== null && raw !== undefined && (typeof raw !== 'string' || raw.trim().length > 0);
        const val = valueToString(raw);
        // Substitui TODAS as ocorrências do placeholder na string
        const re = new RegExp(`\\{${key}\\}`, 'g');
        caption = caption.replace(re, val);
        if (hasValue) resolved.push(key);
        else missing.push(key);
    }

    return Object.freeze({
        caption,
        missingPlaceholders: Object.freeze(missing),
        resolvedPlaceholders: Object.freeze(resolved),
        hasUnresolved: missing.length > 0,
    });
}

/**
 * Verifica se um subset satisfaz todos os filtros obrigatórios do figure-type.
 * Retorna a lista de filtros REQUIRED ausentes (vazia = subset válido).
 */
export function listMissingRequiredFilters(
    figureType: unknown,
    subset: unknown,
): ReadonlyArray<SubsetFilterDim> {
    if (!figureType || typeof figureType !== 'object') return Object.freeze([]);
    const ft = figureType as FigureType;
    if (!Array.isArray(ft.requiredFilters)) return Object.freeze([]);
    const s = (subset && typeof subset === 'object' ? subset : {}) as Record<string, unknown>;
    const missing: SubsetFilterDim[] = [];
    for (const dim of ft.requiredFilters) {
        const v = s[dim];
        if (v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0)) {
            missing.push(dim);
        }
    }
    return Object.freeze(missing);
}

/**
 * Build "chrome" completo = caption + status de validação.
 * Retorna struct frozen pronto para o renderer corporativo.
 */
export interface FigureChromeResult {
    readonly caption: string;
    readonly canRender: boolean;
    readonly missingRequired: ReadonlyArray<SubsetFilterDim>;
    readonly missingPlaceholders: ReadonlyArray<string>;
    readonly figureTypeId: string;
}

export function buildFigureChrome(
    figureType: unknown,
    subset: unknown,
): FigureChromeResult {
    const captionResult = resolveCaption({
        figureType: figureType as FigureType,
        subset: subset as CaptionSubset,
    });
    const missingReq = listMissingRequiredFilters(figureType, subset);
    const ft = figureType as FigureType | null;
    const figureTypeId = ft && typeof ft.id === 'string' ? ft.id : '?';
    return Object.freeze({
        caption: captionResult.caption,
        canRender: missingReq.length === 0,
        missingRequired: missingReq,
        missingPlaceholders: captionResult.missingPlaceholders,
        figureTypeId,
    });
}

export const CORPORATE_FIGURE_CHROME_META = Object.freeze({
    moduleId: 'report.corporate-figure-chrome',
    version: 1,
    fallbackToken: FALLBACK_TOKEN,
    placeholderPattern: '{key}',
});
