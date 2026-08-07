// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export function loadPreviewImage(dataUrl: any, ImageCtor: any = globalThis.Image): Promise<any> {
    return new Promise((resolve, reject) => {
        if (typeof ImageCtor !== 'function') {
            reject(new Error('Preview image constructor unavailable'));
            return;
        }

        const image = new ImageCtor();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image'));
        image.src = dataUrl;
    });
}

export function paintPreviewImage(arg: any): any {
    const { containerWidth, canvas, image, computePreviewCanvasSize } = arg || {};
    const previewSize = computePreviewCanvasSize({
        containerWidth,
        imageWidth: image.width,
        imageHeight: image.height,
    });

    canvas.width = previewSize.width;
    canvas.height = previewSize.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
        ctx,
        width: canvas.width,
        height: canvas.height,
        previewSize,
    };
}

export function paintImageOnCanvas(arg: any): any {
    const { canvas, image } = arg || {};
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return ctx;
}
