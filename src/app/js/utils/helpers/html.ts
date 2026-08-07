// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type UncertaintyDisplayType = 'absolute' | 'relative' | null | undefined;

function stringifyDisplayValue(text: unknown): string {
    if (!text) return '';
    if (
        typeof text === 'string' ||
        typeof text === 'number' ||
        typeof text === 'boolean' ||
        typeof text === 'bigint' ||
        typeof text === 'symbol'
    ) {
        return String(text);
    }
    return Object.prototype.toString.call(text);
}

export function escapeHtml(text: unknown): string {
    return stringifyDisplayValue(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape full HTML: & < > " '. Use quando string vai num atributo OR
 * mistura entre conteúdo+atributo OR a string pode conter aspas/quotes
 * que confundiriam SVG/HTML parsing.
 *
 * Dedup canônico — substitui 5+ implementações inline (treeBuilder,
 * ialQuickReport, exportImage, markdownRenderer, consistencyVeredictHtmlPure).
 */
export function escapeHtmlFull(text: unknown): string {
    return stringifyDisplayValue(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeAttr(text: unknown): string {
    return stringifyDisplayValue(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function escapeJsAttr(text: unknown): string {
    return stringifyDisplayValue(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

export function formatUncertainty(
    uncertainty: number | null | undefined,
    uncertaintyType: UncertaintyDisplayType,
    coverageFactor: number | null | undefined,
): string {
    if (uncertainty == null || !Number.isFinite(uncertainty)) return '';
    const suffix = uncertaintyType === 'relative' ? '%' : '';
    const kStr =
        coverageFactor != null && Number.isFinite(coverageFactor) && coverageFactor !== 2
            ? ` (k=${coverageFactor})`
            : '';
    return `\u00B1\u00A0${uncertainty}${suffix}${kStr}`;
}
