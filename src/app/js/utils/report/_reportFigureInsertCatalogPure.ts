// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { getFigureType } from '../../core/report/_figureCatalog.js';
import { buildFigureChrome } from '../../core/report/_corporateFigureChromePure.js';

export type ReportFigureSubset = Readonly<Record<string, unknown>>;

export type ReportFigureOrigin = Readonly<{
    providerId?: string;
    candidateId?: string;
    scope?: {
        elementId?: string | null;
        groupId?: string | null;
        plumeId?: string | null;
        photoId?: string | null;
    } | null;
}>;

export type ReportFigureInsertOptions = Readonly<{
    caption?: string | null;
    figureNumber?: number | null;
    figureTypeId?: string | null;
    subset?: ReportFigureSubset | null;
    origin?: ReportFigureOrigin | null;
}>;

export type NormalizedReportFigureInsertOptions = Readonly<{
    caption: string;
    figureNumber: number | null;
    figureTypeId: string | null;
    subset: ReportFigureSubset;
    origin: ReportFigureOrigin | null;
}>;

export type ReportFigureCaptionResolution = Readonly<{
    caption: string;
    figureTypeId: string | null;
    usedCatalogCaption: boolean;
    canRenderCatalogFigure: boolean;
    missingRequired: ReadonlyArray<string>;
    missingPlaceholders: ReadonlyArray<string>;
}>;

function cleanText(value: unknown): string {
    return String(value ?? '').trim();
}

function cleanFigureTypeId(value: unknown): string | null {
    const id = cleanText(value).toUpperCase();
    return /^[A-Z][0-9]{1,2}$/.test(id) ? id : null;
}

function freezeSubset(value: unknown): ReportFigureSubset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const k = cleanText(key);
        if (!k || raw === null || raw === undefined) continue;
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
            out[k] = raw;
        } else if (Array.isArray(raw)) {
            out[k] = raw
                .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
                .map((item) => item as string | number | boolean);
        }
    }
    return Object.freeze(out);
}

export function normalizeReportFigureInsertOptions(
    captionOrOptions: string | ReportFigureInsertOptions | null | undefined,
    figureNumber?: number,
    origin?: ReportFigureOrigin,
): NormalizedReportFigureInsertOptions {
    if (captionOrOptions && typeof captionOrOptions === 'object') {
        return Object.freeze({
            caption: cleanText(captionOrOptions.caption),
            figureNumber: typeof captionOrOptions.figureNumber === 'number' ? captionOrOptions.figureNumber : null,
            figureTypeId: cleanFigureTypeId(captionOrOptions.figureTypeId),
            subset: freezeSubset(captionOrOptions.subset),
            origin: captionOrOptions.origin || null,
        });
    }
    return Object.freeze({
        caption: cleanText(captionOrOptions),
        figureNumber: typeof figureNumber === 'number' ? figureNumber : null,
        figureTypeId: null,
        subset: Object.freeze({}),
        origin: origin || null,
    });
}

export function resolveReportFigureCaption(
    options: NormalizedReportFigureInsertOptions,
    fallbackFigureNumber: number,
): ReportFigureCaptionResolution {
    const figureNumber =
        typeof options.figureNumber === 'number' && options.figureNumber > 0
            ? options.figureNumber
            : fallbackFigureNumber;
    const fallbackCaption = cleanText(options.caption);
    const figureType = options.figureTypeId ? getFigureType(options.figureTypeId) : null;
    if (!figureType) {
        return Object.freeze({
            caption: fallbackCaption,
            figureTypeId: options.figureTypeId,
            usedCatalogCaption: false,
            canRenderCatalogFigure: false,
            missingRequired: Object.freeze([]),
            missingPlaceholders: Object.freeze([]),
        });
    }
    const chrome = buildFigureChrome(figureType, Object.freeze({ ...options.subset, N: figureNumber }));
    const canUseCatalogCaption = chrome.canRender && chrome.missingPlaceholders.length === 0;
    return Object.freeze({
        caption: canUseCatalogCaption || !fallbackCaption ? chrome.caption : fallbackCaption,
        figureTypeId: chrome.figureTypeId,
        usedCatalogCaption: canUseCatalogCaption,
        canRenderCatalogFigure: chrome.canRender,
        missingRequired: chrome.missingRequired,
        missingPlaceholders: chrome.missingPlaceholders,
    });
}

export const REPORT_FIGURE_INSERT_CATALOG_META = Object.freeze({
    moduleId: 'report.figure-insert-catalog',
    version: 1,
});
