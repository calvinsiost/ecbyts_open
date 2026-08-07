// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { getElementById } from '../../core/elements/manager.js';
import { applyBoundaryOverlayUrls, setBoundaryOverlayOpacity } from '../../core/elements/boundaryOverlayRuntime.js';
import { getImageryById } from '../libraries/loader.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('BoundaryOverlay');
/**
 * Atualiza campo do overlay de boundary (opacidade ou URL da imagem).
 * Altera o data do elemento E atualiza o mesh 3D em tempo real.
 *
 * @param {string} elementId - ID do elemento boundary
 * @param {string} el - 'overlayOpacity' ou 'overlayUrl'
 * @param {*} value - Novo valor
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper do slider de opacidade do
 * overlay (elementControls): atualiza o label percentual irmão E aplica a
 * opacidade (era multi-statement inline com getElementById).
 */
export function handleBoundaryOpacityInput(elementId: string, el: any) {
    const v = parseFloat(el?.value);
    const label = document.getElementById(`opacity-val-${elementId}`);
    if (label) label.textContent = `${(v * 100).toFixed(0)}%`;
    handleBoundaryFieldChange(elementId, 'overlayOpacity', v);
}

export function handleBoundaryFieldChange(elementId: string, field: string, value: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    element.data = element.data || {};
    element.data[field] = value;
    if (field === 'overlayOpacity') {
        setBoundaryOverlayOpacity(elementId, value);
        return;
    }
    if (field === 'overlayUrl') {
        void applyBoundaryOverlayUrls(elementId, value ? [value] : [], { persistData: true }).catch(
        /** @param {any} input */ (err: any) => {
            log.warn('Boundary overlay update failed', err?.message || String(err));
        });
    }
}
/**
 * Handle custom image upload for boundary overlay.
 * Redimensiona a imagem para max 512x512 e comprime como JPEG.
 *
 * @param {string} input - ID do elemento boundary
 * @param {HTMLInputElement} input - File input element
 */
export async function handleOverlayUpload(elementId: string, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file)
        return;
    if (file.size > 5 * 1024 * 1024) {
        showToast(t('overlayFileTooLarge') || 'File too large (max 5MB)', 'error');
        input.value = '';
        return;
    }
    try {
        const img = new Image();
        const url = URL.createObjectURL(file);
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
        const MAX = 512;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX || h > MAX) {
            const scale = Math.min(MAX / w, MAX / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        await applyBoundaryOverlayUrls(elementId, [dataUrl], { persistData: true });
        showToast(t('overlayUploaded') || 'Custom image applied', 'success');
    }
    catch (err: any) {
        log.error('Overlay image upload failed', err?.message || String(err));
        showToast(t('overlayUploadFailed') || 'Failed to process image', 'error');
    }
    finally {
        input.value = '';
    }
}
/**
 * Apply library imagery to a boundary element.
 * Para imagens remotas, usa URL direta. Para sentinel-tiles, gera on-demand.
 *
 * @param {string} elementId - Boundary element ID
 * @param {string} imageryId - Imagery entry ID from library
 * @param {boolean} isSentinel - True if source is 'sentinel-tiles' (on-demand)
 */
export async function handleApplyImagery(elementId: string, imageryId: string, isSentinel: boolean) {
    const element = getElementById(elementId);
    if (!element)
        return;
    const img = getImageryById(imageryId);
    if (!img) {
        showToast('Imagery not found', 'error');
        return;
    }
    try {
        let overlayUrl;
        if (isSentinel && Array.isArray(img.bbox) && img.bbox.length === 4) {
            const [south, west, north, east] = img.bbox;
            const { stitchTiles } = await import('../../core/io/geo/tileStitcher.js' as string);
            const sw = { latitude: south, longitude: west };
            const ne = { latitude: north, longitude: east };
            overlayUrl = await stitchTiles(sw, ne, 512);
        }
        else if (img.url) {
            overlayUrl = img.url;
        }
        else {
            showToast(t('imageryCorsError') || 'Image unavailable', 'warning');
            return;
        }
        if (!overlayUrl) {
            showToast(t('imageryCorsError') || 'Image unavailable', 'warning');
            return;
        }
        element.data = element.data || {};
        element.data.imageryId = imageryId;
        element.data.imageryLibraryId = img.libraryId;
        await applyBoundaryOverlayUrls(element, [overlayUrl], { persistData: true });
        showToast(t('imageryApplied') || 'Imagery applied', 'success');
    }
    catch (err: any) {
        log.error('Apply imagery failed', err?.message || String(err));
        showToast(t('imageryCorsError') || 'Image unavailable — CORS restriction', 'error');
    }
}
export const boundaryOverlayHandlers = {
    handleBoundaryFieldChange,
    handleBoundaryOpacityInput,
    handleOverlayUpload,
    handleApplyImagery,
};
