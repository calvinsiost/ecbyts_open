// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export function computeGeorefCanvasSize(arg: any) {
    const { clientWidth, imageWidth, imageHeight, fallbackWidth = 400 } = arg || {};
    const width = Math.max(1, Math.round(clientWidth || fallbackWidth));
    const safeImageWidth = Math.max(1, Number(imageWidth) || 1);
    const safeImageHeight = Math.max(1, Number(imageHeight) || 1);
    const ratio = safeImageWidth / safeImageHeight;

    return {
        width,
        height: Math.max(1, Math.round(width / ratio)),
    };
}

export function projectImageToCanvasPixels(
    imgX: any,
    imgY: any,
    canvasWidth: any,
    canvasHeight: any,
    imageWidth: any,
    imageHeight: any,
) {
    const safeImageWidth = Math.max(1, Number(imageWidth) || 1);
    const safeImageHeight = Math.max(1, Number(imageHeight) || 1);

    return {
        x: Number(imgX || 0) * (canvasWidth / safeImageWidth),
        y: Number(imgY || 0) * (canvasHeight / safeImageHeight),
    };
}

export function projectClientToImagePixels(
    rect: any,
    imageWidth: any,
    imageHeight: any,
    clientX: any,
    clientY: any,
    { clamp = false } = {},
) {
    const safeImageWidth = Math.max(1, Number(imageWidth) || 1);
    const safeImageHeight = Math.max(1, Number(imageHeight) || 1);
    const safeRectWidth = Math.max(1, Number(rect?.width) || 1);
    const safeRectHeight = Math.max(1, Number(rect?.height) || 1);

    let x = (clientX - rect.left) * (safeImageWidth / safeRectWidth);
    let y = (clientY - rect.top) * (safeImageHeight / safeRectHeight);

    if (clamp) {
        x = Math.max(0, Math.min(safeImageWidth, x));
        y = Math.max(0, Math.min(safeImageHeight, y));
    }

    return { x, y };
}

export function findHitGeorefGcp(arg: any) {
    const { gcps = [], mouseX, mouseY, canvasWidth, canvasHeight, imageWidth, imageHeight, hitRadius } = arg || {};
    let closest = -1;
    let minDist = hitRadius;

    for (let index = 0; index < gcps.length; index++) {
        const gcp = gcps[index];
        const point = projectImageToCanvasPixels(
            gcp.imgX,
            gcp.imgY,
            canvasWidth,
            canvasHeight,
            imageWidth,
            imageHeight,
        );
        const dx = mouseX - point.x;
        const dy = mouseY - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDist) {
            minDist = distance;
            closest = index;
        }
    }

    return closest;
}
