// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

export interface PdfBbox {
    x0: unknown;
    y0: unknown;
    x1: unknown;
    y1: unknown;
}

export interface RectLike {
    left: unknown;
    top: unknown;
    width?: unknown;
    height?: unknown;
}

export interface DocHighlightParams {
    bbox?: PdfBbox | null;
    pdfScale?: unknown;
    canvasWidth?: unknown;
    canvasHeight?: unknown;
    canvasRect?: RectLike | null;
    wrapperRect?: RectLike | null;
    padX?: unknown;
    padY?: unknown;
}

export interface DocHighlightRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function numberValue(value: unknown): number {
    return Number(value);
}

/**
 * Computes a highlight rectangle in wrapper-local CSS pixels.
 * Converts PDF-point bbox -> rendered canvas pixels -> CSS pixels and offsets.
 */
export function computeDocHighlightRect(params: DocHighlightParams | null | undefined): DocHighlightRect | null {
    if (!isRecord(params)) return null;

    const {
        bbox,
        pdfScale,
        canvasWidth,
        canvasHeight,
        canvasRect,
        wrapperRect,
        padX = 8,
        padY = 4,
    } = params;

    if (!isRecord(bbox) || bbox.x0 == null || bbox.y0 == null || bbox.x1 == null || bbox.y1 == null) return null;
    if (!isRecord(canvasRect) || !isRecord(wrapperRect)) return null;
    if (
        !Number.isFinite(pdfScale) ||
        numberValue(pdfScale) <= 0 ||
        !Number.isFinite(canvasWidth) ||
        numberValue(canvasWidth) <= 0 ||
        !Number.isFinite(canvasHeight) ||
        numberValue(canvasHeight) <= 0
    ) {
        return null;
    }

    const scaleX = numberValue(canvasRect.width) / numberValue(canvasWidth);
    const scaleY = numberValue(canvasRect.height) / numberValue(canvasHeight);
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;

    const offX = numberValue(canvasRect.left) - numberValue(wrapperRect.left);
    const offY = numberValue(canvasRect.top) - numberValue(wrapperRect.top);

    const rawLeft = offX + numberValue(bbox.x0) * numberValue(pdfScale) * scaleX;
    const rawTop = offY + numberValue(bbox.y0) * numberValue(pdfScale) * scaleY;
    const rawWidth = (numberValue(bbox.x1) - numberValue(bbox.x0)) * numberValue(pdfScale) * scaleX;
    const rawHeight = (numberValue(bbox.y1) - numberValue(bbox.y0)) * numberValue(pdfScale) * scaleY;

    if (
        !Number.isFinite(rawLeft) ||
        !Number.isFinite(rawTop) ||
        !Number.isFinite(rawWidth) ||
        !Number.isFinite(rawHeight)
    ) {
        return null;
    }
    if (rawWidth <= 0 || rawHeight <= 0) return null;

    return {
        left: Math.max(0, rawLeft - numberValue(padX)),
        top: Math.max(0, rawTop - numberValue(padY)),
        width: Math.max(1, rawWidth + numberValue(padX) * 2),
        height: Math.max(1, rawHeight + numberValue(padY) * 2),
    };
}
