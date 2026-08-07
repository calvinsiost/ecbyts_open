// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { getAllElements, getElementById, getMeshByElementId } from './manager.js';
import { loadOverlayTexture } from './meshFactory.js';
import { requestRender } from '../../utils/scene/setup.js';
function _resolveBoundary(boundaryOrId: any) {
    if (!boundaryOrId)
        return null;
    if (typeof boundaryOrId === 'string')
        return getElementById(boundaryOrId) || null;
    return boundaryOrId?.family === 'boundary' ? boundaryOrId : null;
}
function _getOverlayMaterial(boundaryOrId: any) {
    const boundary = (_resolveBoundary(boundaryOrId)) as any;
    if (!boundary?.id)
        return null;
    const mesh = getMeshByElementId(boundary.id);
    return mesh?.getObjectByName?.('overlay')?.material || null;
}
function _getTextureDimensions(texture: any) {
    const image = texture?.image || null;
    return {
        width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
        height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
    };
}
export function getBoundaryOverlayUrls(boundaryOrId: any) {
    const boundary = (_resolveBoundary(boundaryOrId)) as any;
    if (!boundary?.data?.overlayUrl)
        return [];
    return [boundary.data.overlayUrl, ...(boundary.data.overlayFallbackUrls || [])].filter(Boolean);
}
export function boundaryOverlayNeedsTexture(boundaryOrId: any) {
    const material = _getOverlayMaterial(boundaryOrId);
    const { width, height } = _getTextureDimensions(material?.map);
    return !material?.map || (width <= 1 && height <= 1);
}
export function setBoundaryOverlayOpacity(boundaryOrId: any, opacity: any) {
    const boundary = (_resolveBoundary(boundaryOrId)) as any;
    if (!boundary)
        return false;
    const material = _getOverlayMaterial(boundary);
    const nextOpacity = Number.parseFloat(opacity);
    if (!Number.isFinite(nextOpacity) || !material)
        return false;
    boundary.data = boundary.data || {};
    boundary.data.overlayOpacity = nextOpacity;
    material.opacity = nextOpacity;
    material.needsUpdate = true;
    requestRender();
    return true;
}
export async function applyBoundaryOverlayUrls(
boundaryOrId: any,
urls: any, { persistData = true }: any = {}) {
    const boundary = (_resolveBoundary(boundaryOrId)) as any;
    if (!boundary)
        return { applied: false, reason: 'missing-boundary' };
    const normalizedUrls = (Array.isArray(urls) ? urls : [urls]).filter((url: any) => typeof url === 'string' && url.trim());
    const material = _getOverlayMaterial(boundary);
    if (!material)
        return { applied: false, reason: 'missing-material' };
    if (persistData) {
        boundary.data = boundary.data || {};
        boundary.data.overlayUrl = normalizedUrls[0] || '';
        boundary.data.overlayFallbackUrls = normalizedUrls.slice(1);
    }
    if (material.map) {
        material.map.dispose?.();
        material.map = null;
    }
    if (!normalizedUrls.length) {
        material.needsUpdate = true;
        requestRender();
        return { applied: false, reason: 'cleared' };
    }
    const texture = await loadOverlayTexture(normalizedUrls, material);
    const { width, height } = _getTextureDimensions(texture);
    return { applied: true, reason: 'loaded', width, height };
}
export async function ensureBoundaryOverlayTexture(boundaryOrId: any, { force = false } = {}) {
    const boundary = (_resolveBoundary(boundaryOrId)) as any;
    if (!boundary)
        return { applied: false, reason: 'missing-boundary' };
    const urls = getBoundaryOverlayUrls(boundary);
    if (!urls.length)
        return { applied: false, reason: 'missing-urls' };
    if (!force && !boundaryOverlayNeedsTexture(boundary))
        return { applied: false, reason: 'already-loaded' };
    const result = await applyBoundaryOverlayUrls(boundary, urls, { persistData: false });
    return {
        ...result,
        boundaryId: boundary.id,
    };
}
export async function rehydrateBoundaryOverlayTextures({ boundaries = null as any, force = false }: any = {}) {
    const candidates = (Array.isArray(boundaries)
        ? (boundaries as any[]).map(_resolveBoundary).filter(Boolean)
        : getAllElements().filter((element: any) => element.family === 'boundary' && element.data?.overlayUrl)) as any[];
    const settled = await Promise.allSettled(candidates.map((boundary: any) => ensureBoundaryOverlayTexture(boundary, { force })));
    return settled.map((entry: any, index: number) => {
        if (entry.status === 'fulfilled')
            return entry.value;
        return {
            applied: false,
            boundaryId: candidates[index]?.id || null,
            reason: entry.reason?.message || String(entry.reason),
        };
    });
}
