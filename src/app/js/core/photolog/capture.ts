// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PHOTO CAPTURE — Camera, clipboard, resize utilities
   Utilitarios de captura de imagem para o PhotoLog.

   - Camera: getUserMedia com facingMode configuravel
   - Clipboard: extrai imagem de ClipboardEvent
   - Resize: downscale preservando aspect ratio
   - Thumbnail: gera preview 200px para galeria

   Sem dependencia CDN — usa apenas APIs nativas do browser.
   ================================================================ */

/**
 * Opens device camera and captures a single frame.
 * Retorna blob JPEG da imagem capturada.
 *
 * @param opts
 * @param opts.facingMode - Camera traseira ou frontal
 * @param opts.maxDim - Dimensao maxima apos captura
 * @returns
 */
export async function openCameraCapture(
    opts: { facingMode?: string; maxDim?: number } = {}
): Promise<{ ok: true; blob: Blob; width: number; height: number } | { ok: false; error: string }> {
    const facingMode = opts.facingMode || 'environment';
    const maxDim = opts.maxDim || 1920;

    if (!navigator.mediaDevices?.getUserMedia) {
        return { ok: false, error: 'camera_not_available' };
    }

    let stream: MediaStream | null = null;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: maxDim }, height: { ideal: maxDim } },
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();

        // Aguarda dimensoes reais do video
        await (new Promise<void>((resolve) => {
            if (video.videoWidth > 0) return resolve();
            video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        }) as Promise<void>);

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(1, maxDim / Math.max(vw, vh));
        const cw = Math.round(vw * scale);
        const ch = Math.round(vh * scale);

        const canvas = _createCanvas(cw, ch);
        const ctx = canvas.getContext('2d') as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D
            | null;
        if (!ctx) return { ok: false, error: 'canvas_context_unavailable' };
        ctx.drawImage(video, 0, 0, cw, ch);

        const blob = await _canvasToBlob(canvas, 'image/jpeg', 0.85);

        return { ok: true, blob, width: cw, height: ch };
    } catch (err) {
        const e = err as { name?: string };
        if (e && e.name === 'NotAllowedError') {
            return { ok: false, error: 'permission_denied' };
        }
        return { ok: false, error: 'camera_not_available' };
    } finally {
        // Sempre para todos os tracks - evita indicador de camera ativo
        if (stream) stream.getTracks().forEach((t) => t.stop());
    }
}

/**
 * Extracts image blob from a clipboard paste event.
 * Procura item de imagem no clipboardData.
 *
 * @param event
 * @returns imagem ou null se nao houver
 */
export function captureFromClipboard(event: ClipboardEvent): Blob | null {
    if (!event?.clipboardData?.items) return null;

    for (const item of event.clipboardData.items) {
        if (item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}

/**
 * Resizes image blob to fit within maxDim, preserving aspect ratio.
 * Retorna blob JPEG comprimido.
 *
 * @param blob - imagem original
 * @param maxDim - dimensao maxima (largura ou altura)
 * @returns
 */
export async function resizeImage(blob: Blob, maxDim = 1920): Promise<Blob> {
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;

    // Se ja esta dentro do limite, retorna como JPEG (pode recomprimir)
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const cw = Math.round(width * scale);
    const ch = Math.round(height * scale);

    const canvas = _createCanvas(cw, ch);
    const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (!ctx) {
        bmp.close();
        throw new Error('canvas_context_unavailable');
    }
    ctx.drawImage(bmp, 0, 0, cw, ch);
    bmp.close();

    return _canvasToBlob(canvas, 'image/jpeg', 0.85);
}

/**
 * Creates a square thumbnail blob from image.
 * Centro da imagem, recortado para cover fit.
 *
 * @param blob - imagem original
 * @param size - dimensao do thumbnail (quadrado)
 * @returns
 */
export async function createThumbnail(blob: Blob, size = 200): Promise<Blob> {
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;

    // Cover crop - recorta o centro para preencher o quadrado
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;

    const canvas = _createCanvas(size, size);
    const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (!ctx) {
        bmp.close();
        throw new Error('canvas_context_unavailable');
    }
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
    bmp.close();

    return _canvasToBlob(canvas, 'image/jpeg', 0.6);
}

/**
 * Creates a canvas element (OffscreenCanvas with fallback).
 * Feature-detect OffscreenCanvas; fallback para <canvas> off-DOM.
 *
 * @param w - largura
 * @param h - altura
 * @returns
 */
function _createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(w, h);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

/**
 * Converts canvas to blob (handles both OffscreenCanvas and HTMLCanvasElement).
 * @param canvas
 * @param type - MIME type
 * @param quality - quality 0..1
 * @returns
 */
function _canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        return canvas.convertToBlob({ type, quality });
    }
    const html = canvas as HTMLCanvasElement;
    return new Promise<Blob>((resolve, reject) => {
        html.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob_failed'))), type, quality);
    }) as Promise<Blob>;
}
