// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Figure numbering — pure logic (SPEC_REPORT_FIGURE_CATALOG complement).
 *
 * Assigns sequential numbers `{N}` to a list of (figureTypeId, subset)
 * tuples already validated by `_figureSubsetValidatorPure`. Pure function
 * — caller passes the ordered list, gets back the same list enriched with
 * `N` numbers + resolved captions ready for the report renderer.
 *
 * Numbering policy:
 *   - Global counter starts at the caller-provided `startAt` (default 1)
 *   - One number per concrete figure (expanded tuples already counted as
 *     separate figures by the caller)
 *   - Optional `chapterPrefix` enables `{chapter}.{N}` numbering
 *     (e.g. '4.1', '4.2', ...) used in long reports
 *
 * Tests live in `tests/figure-numbering-pure.test.mjs`.
 */

import { getFigureType, resolveCaption } from './_figureCatalogPure.js';
import type { FigureSubset } from './_figureSubsetValidatorPure.js';

export interface FigureTuple {
    readonly figureTypeId: string;
    readonly subset: FigureSubset;
}

export interface NumberedFigure {
    readonly N: string;
    readonly figureTypeId: string;
    readonly subset: FigureSubset;
    readonly caption: string;
}

export interface NumberingOptions {
    /** First number assigned. Default 1. */
    readonly startAt?: number;
    /** Optional chapter prefix → numbers render as `${chapter}.${N}`. */
    readonly chapterPrefix?: string;
    /** Citation/source text inserted into the {citacao} placeholder. */
    readonly citacao?: string;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(n: number, chapter: string | undefined): string {
    if (typeof chapter === 'string' && chapter.length > 0) {
        return `${chapter}.${n}`;
    }
    return String(n);
}

/**
 * Number a list of figures and resolve captions. Pure, returns new frozen
 * array (does not mutate input).
 *
 * Tuples with unknown figureTypeId are SKIPPED (anti-N1: never invent a
 * number for an unrecognised figure).
 */
export function numberFigures(
    tuples: ReadonlyArray<FigureTuple> | null | undefined,
    options: NumberingOptions = {},
): ReadonlyArray<NumberedFigure> {
    const startAt = isFiniteNumber(options.startAt) ? Math.trunc(options.startAt) : 1;
    const chapter = typeof options.chapterPrefix === 'string' ? options.chapterPrefix : undefined;
    const citacao = typeof options.citacao === 'string' ? options.citacao : '';

    const out: NumberedFigure[] = [];
    if (!Array.isArray(tuples)) return Object.freeze(out);

    let n = startAt;
    for (const tuple of tuples) {
        if (!tuple || typeof tuple !== 'object') continue;
        if (typeof tuple.figureTypeId !== 'string') continue;
        const entry = getFigureType(tuple.figureTypeId);
        if (!entry) continue;
        const subset = tuple.subset && typeof tuple.subset === 'object' ? tuple.subset : {};
        const N = formatNumber(n, chapter);
        const caption = resolveCaption(entry.captionTemplate, {
            ...subset,
            N,
            citacao,
        });
        out.push(
            Object.freeze({
                N,
                figureTypeId: tuple.figureTypeId,
                subset,
                caption,
            }),
        );
        n++;
    }
    return Object.freeze(out);
}

/**
 * Build a manifest summary — useful for the report's "List of Figures" page
 * (ABNT NBR 14724 §5.2.3).
 */
export function buildFigureManifest(
    numbered: ReadonlyArray<NumberedFigure>,
): ReadonlyArray<{ readonly N: string; readonly id: string; readonly caption: string }> {
    if (!Array.isArray(numbered)) return Object.freeze([]);
    return Object.freeze(
        numbered.map((f) =>
            Object.freeze({
                N: f.N,
                id: f.figureTypeId,
                caption: f.caption,
            }),
        ),
    );
}
