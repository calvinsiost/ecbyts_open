// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface PreviewCanvasSizeOptions {
    containerWidth: number;
    imageWidth: number;
    imageHeight: number;
    maxWidth?: number;
    fallbackWidth?: number;
    minInteractiveWidth?: number;
}

export interface PreviewCanvasSize {
    targetWidth: number;
    scale: number;
    width: number;
    height: number;
}

export interface ClientRectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface MenuRectLike {
    width: number;
    height: number;
    right: number;
    bottom: number;
}

export interface NormalizedCanvasPoint {
    nx: number;
    ny: number;
}

export interface CanvasPixelPoint {
    x: number;
    y: number;
}

export interface FloatingMenuPosition {
    left: number;
    top: number;
}

export function computePreviewCanvasSize({
    containerWidth,
    imageWidth,
    imageHeight,
    maxWidth = 620,
    fallbackWidth = 560,
    minInteractiveWidth = 100,
}: PreviewCanvasSizeOptions): PreviewCanvasSize {
    const targetWidth = containerWidth > minInteractiveWidth ? Math.min(maxWidth, containerWidth) : fallbackWidth;
    const scale = targetWidth / imageWidth;

    return {
        targetWidth,
        scale,
        width: Math.round(imageWidth * scale),
        height: Math.round(imageHeight * scale),
    };
}

export function getNormalizedCanvasPoint(
    rect: ClientRectLike | null | undefined,
    clientX: number,
    clientY: number,
): NormalizedCanvasPoint | null {
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;

    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { nx, ny };
}

export function projectClientToCanvasPixels(
    rect: ClientRectLike | null | undefined,
    canvasWidth: number,
    canvasHeight: number,
    clientX: number,
    clientY: number,
): CanvasPixelPoint {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: (clientX - rect.left) * (canvasWidth / rect.width),
        y: (clientY - rect.top) * (canvasHeight / rect.height),
    };
}

export function constrainFloatingMenuPosition(
    x: number,
    y: number,
    menuRect: MenuRectLike,
    viewportWidth: number,
    viewportHeight: number,
    padding = 8,
): FloatingMenuPosition {
    let left = x;
    let top = y;

    if (menuRect.right > viewportWidth) {
        left = viewportWidth - menuRect.width - padding;
    }
    if (menuRect.bottom > viewportHeight) {
        top = viewportHeight - menuRect.height - padding;
    }

    return { left, top };
}
