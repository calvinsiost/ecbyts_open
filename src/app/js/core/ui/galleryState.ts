// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-67 - Image Gallery / Lightbox State (pure-logic, zero DOM)
// Modelo imutavel para galeria de imagens com lightbox, zoom, fullscreen e EXIF.

type GalleryViewMode = 'grid' | 'lightbox' | 'fullscreen';

interface GalleryImageExif {
    lat?: number;
    lon?: number;
    other?: any;
}

interface GalleryImageInput {
    id: string;
    src: string;
    thumbnail?: string | null;
    title?: string | null;
    caption?: string | null;
    exif?: GalleryImageExif | null;
    width: number;
    height: number;
}

interface GalleryImage {
    id: string;
    src: string;
    thumbnail: string | null;
    title: string | null;
    caption: string | null;
    exif: Readonly<GalleryImageExif> | null;
    width: number;
    height: number;
}

interface GalleryState {
    images: ReadonlyArray<GalleryImage>;
    currentIndex: number;
    isLightboxOpen: boolean;
    zoomLevel: number;
    zoomCenter: Readonly<{ x: number; y: number }>;
    viewMode: GalleryViewMode;
    preloadedIds: Set<string>;
}

const ZOOM_MIN = 1.0;
const ZOOM_MAX = 5.0;

function freeze<T>(obj: T): Readonly<T> {
    return Object.freeze(obj);
}

function freezeImage(img: GalleryImageInput): GalleryImage {
    if (!img || typeof img !== 'object') throw new Error('image must be object');
    if (typeof img.id !== 'string' || !img.id) throw new Error('image.id required');
    if (typeof img.src !== 'string' || !img.src) throw new Error('image.src required');
    if (!Number.isFinite(img.width) || img.width <= 0) throw new Error('image.width must be positive finite');
    if (!Number.isFinite(img.height) || img.height <= 0) throw new Error('image.height must be positive finite');
    const exif = img.exif ? Object.freeze({ ...img.exif }) : null;
    return Object.freeze({
        id: img.id,
        src: img.src,
        thumbnail: img.thumbnail ?? null,
        title: img.title ?? null,
        caption: img.caption ?? null,
        exif,
        width: img.width,
        height: img.height,
    });
}

/**
 * @returns frozen gallery state
 */
export function createGalleryState(images: Array<GalleryImageInput> = []): GalleryState {
    if (!Array.isArray(images)) throw new Error('images must be array');
    const seen: Set<string> = new Set();
    const frozen = images.map((img: GalleryImageInput) => {
        const fi = freezeImage(img);
        if (seen.has(fi.id)) throw new Error(`duplicate image id ${fi.id}`);
        seen.add(fi.id);
        return fi;
    });
    return freeze({
        images: Object.freeze(frozen),
        currentIndex: frozen.length > 0 ? 0 : -1,
        isLightboxOpen: false,
        zoomLevel: 1.0,
        zoomCenter: Object.freeze({ x: 0.5, y: 0.5 }),
        viewMode: 'grid' as GalleryViewMode,
        preloadedIds: new Set() as Set<string>,
    });
}

export function addImage(state: GalleryState, image: GalleryImageInput): GalleryState {
    const fi = freezeImage(image);
    if (state.images.some((i: GalleryImage) => i.id === fi.id)) {
        throw new Error(`duplicate image id ${fi.id}`);
    }
    const images = Object.freeze([...state.images, fi]);
    return freeze({
        ...state,
        images,
        currentIndex: state.currentIndex < 0 ? 0 : state.currentIndex,
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function removeImage(state: GalleryState, imageId: string): GalleryState {
    const idx = state.images.findIndex((i: GalleryImage) => i.id === imageId);
    if (idx < 0) return state;
    const images = Object.freeze(state.images.filter((i: GalleryImage) => i.id !== imageId));
    let currentIndex = state.currentIndex;
    if (images.length === 0) {
        currentIndex = -1;
    } else if (idx < state.currentIndex) {
        currentIndex = state.currentIndex - 1;
    } else if (idx === state.currentIndex && currentIndex >= images.length) {
        currentIndex = images.length - 1;
    }
    const preloadedIds: Set<string> = new Set(state.preloadedIds);
    preloadedIds.delete(imageId);
    return freeze({
        ...state,
        images,
        currentIndex,
        preloadedIds,
        isLightboxOpen: images.length === 0 ? false : state.isLightboxOpen,
        viewMode: (images.length === 0 ? 'grid' : state.viewMode) as GalleryViewMode,
    });
}

export function setCurrentIndex(state: GalleryState, index: number): GalleryState {
    if (state.images.length === 0) throw new Error('cannot set index on empty gallery');
    if (!Number.isInteger(index)) throw new Error('index must be integer');
    const clamped = Math.max(0, Math.min(state.images.length - 1, index));
    return freeze({
        ...state,
        currentIndex: clamped,
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function next(state: GalleryState): GalleryState {
    if (state.images.length === 0) return state;
    const ni = (state.currentIndex + 1) % state.images.length;
    return freeze({ ...state, currentIndex: ni, preloadedIds: new Set(state.preloadedIds) });
}

export function prev(state: GalleryState): GalleryState {
    if (state.images.length === 0) return state;
    const n = state.images.length;
    const pi = (state.currentIndex - 1 + n) % n;
    return freeze({ ...state, currentIndex: pi, preloadedIds: new Set(state.preloadedIds) });
}

export function openLightbox(state: GalleryState, imageId?: string): GalleryState {
    if (state.images.length === 0) throw new Error('cannot open lightbox on empty gallery');
    let currentIndex = state.currentIndex;
    if (imageId !== undefined && imageId !== null) {
        const idx = state.images.findIndex((i: GalleryImage) => i.id === imageId);
        if (idx < 0) throw new Error(`image ${imageId} not found`);
        currentIndex = idx;
    }
    return freeze({
        ...state,
        isLightboxOpen: true,
        viewMode: 'lightbox' as GalleryViewMode,
        currentIndex,
        zoomLevel: 1.0,
        zoomCenter: Object.freeze({ x: 0.5, y: 0.5 }),
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function closeLightbox(state: GalleryState): GalleryState {
    return freeze({
        ...state,
        isLightboxOpen: false,
        viewMode: 'grid' as GalleryViewMode,
        zoomLevel: 1.0,
        zoomCenter: Object.freeze({ x: 0.5, y: 0.5 }),
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function enterFullscreen(state: GalleryState): GalleryState {
    if (state.images.length === 0) throw new Error('cannot fullscreen empty gallery');
    return freeze({
        ...state,
        viewMode: 'fullscreen' as GalleryViewMode,
        isLightboxOpen: true,
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function exitFullscreen(state: GalleryState): GalleryState {
    const viewMode: GalleryViewMode = state.isLightboxOpen ? 'lightbox' : 'grid';
    return freeze({
        ...state,
        viewMode,
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function setZoom(state: GalleryState, level: number, center?: { x: number; y: number }): GalleryState {
    if (!Number.isFinite(level)) throw new Error('zoom level must be finite');
    if (level < ZOOM_MIN || level > ZOOM_MAX) {
        throw new Error(`zoom level out of range [${ZOOM_MIN}, ${ZOOM_MAX}]`);
    }
    let zoomCenter = state.zoomCenter;
    if (center !== undefined && center !== null) {
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
            throw new Error('zoom center must have finite x/y');
        }
        zoomCenter = Object.freeze({ x: center.x, y: center.y });
    }
    return freeze({
        ...state,
        zoomLevel: level,
        zoomCenter,
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function resetZoom(state: GalleryState): GalleryState {
    return freeze({
        ...state,
        zoomLevel: 1.0,
        zoomCenter: Object.freeze({ x: 0.5, y: 0.5 }),
        preloadedIds: new Set(state.preloadedIds),
    });
}

export function markPreloaded(state: GalleryState, imageId: string): GalleryState {
    if (!state.images.some((i: GalleryImage) => i.id === imageId)) {
        throw new Error(`image ${imageId} not found`);
    }
    const preloadedIds: Set<string> = new Set(state.preloadedIds);
    preloadedIds.add(imageId);
    return freeze({ ...state, preloadedIds });
}

export function getCurrentImage(state: GalleryState): GalleryImage | null {
    if (state.images.length === 0 || state.currentIndex < 0) return null;
    return state.images[state.currentIndex] ?? null;
}

export function getImagesWithGPS(state: GalleryState): GalleryImage[] {
    return state.images.filter(
        (i: GalleryImage) => !!i.exif && Number.isFinite(i.exif.lat) && Number.isFinite(i.exif.lon),
    );
}

export function getImageById(state: GalleryState, imageId: string): GalleryImage | null {
    return state.images.find((i: GalleryImage) => i.id === imageId) ?? null;
}

export function getNextImage(state: GalleryState): GalleryImage | null {
    if (state.images.length === 0) return null;
    const ni = (state.currentIndex + 1) % state.images.length;
    return state.images[ni] ?? null;
}

export function getPrevImage(state: GalleryState): GalleryImage | null {
    if (state.images.length === 0) return null;
    const n = state.images.length;
    const pi = (state.currentIndex - 1 + n) % n;
    return state.images[pi] ?? null;
}

export function summarizeGallery(
    state: GalleryState,
): Readonly<{
    imageCount: number;
    currentIndex: number;
    mode: GalleryViewMode;
    zoomLevel: number;
    withGPSCount: number;
}> {
    return Object.freeze({
        imageCount: state.images.length,
        currentIndex: state.currentIndex,
        mode: state.viewMode,
        zoomLevel: state.zoomLevel,
        withGPSCount: getImagesWithGPS(state).length,
    });
}
