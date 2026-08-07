// @ts-check
// Generated from src/app/js/core/photolog/manager.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   PHOTOLOG MANAGER — CRUD + Sync + Export/Import
   Gerenciador central do registro fotografico PDPLU.

   - Fotos sao metadata no element.data.photos[] + blob no IDB
   - Sync via fileManager.register() (Supabase files table)
   - Export ECO1: metadata only, sem blobs
   - Offline-first: salva IDB imediato, sync quando online

   Referencia: ADR.md deste modulo para decisoes arquiteturais.
   ================================================================ */
import { idbSet, idbGet, idbDelete } from '../../utils/storage/idbStore.js';
import { broadcastChange } from '../../utils/storage/broadcastSync.js';
import { getElementById, getAllElements } from '../elements/manager.js';
import { extractExifBasic } from './exif.js';
import { createThumbnail, resizeImage } from './capture.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// Limiar de aviso de armazenamento (100 MB)
const STORAGE_WARNING_BYTES = 100 * 1024 * 1024;
// IDB index key - backup do indice de fotos
const INDEX_KEY = 'ecbyts-photolog-index';
/**
 * @typedef {{ lat: number, lng: number, accuracy?: number }} PhotoGps
 * @typedef {{ id: string|null, name: string }} PhotoAuthor
 * @typedef {{
 *   id: string,
 *   blobKey: string,
 *   fileId: string|null,
 *   filename: string,
 *   mimeType: string,
 *   sizeBytes: number,
 *   checksumSha256: string,
 *   captureSource: string,
 *   description: string,
 *   author: PhotoAuthor,
 *   timestamp: string,
 *   gps: PhotoGps|null,
 *   elementId: string,
 *   thumbKey: string,
 *   syncStatus: string,
 *   syncError: string|null,
 *   createdAt: string,
 *   updatedAt: string
 * }} PhotoEntry
 * @typedef {{ captureSource?: string, description?: string, gps?: PhotoGps, filename?: string }} PhotoMeta
 * @typedef {Partial<PhotoEntry> & { id?: string, elementId?: string }} PhotoImportEntry
 */
/** @type {((...args: any[]) => any)|null} */
let requestUIRefresh: any = null;
/**
 * Injeta funcao de refresh de interface.
 * @param {(...args: any[]) => any} fn
 */
export function setPhotologUpdateAllUI( fn: any) {
    requestUIRefresh = fn;
}
function requestPhotologManagerUIRefresh(reason = 'photolog.changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [
        UI_INVALIDATION_DOMAINS.PHOTOLOG,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ─── CRUD ────────────────────────────────────────────────────
/**
 * Adds a photo to an element.
 * Gera ID, computa SHA-256, salva blob+thumb em IDB, appende metadata no element.
 *
 * @param {string} elementId - ID do elemento PDPLU alvo
 * @param {Blob} blob - blob de imagem (JPEG/PNG/WebP)
 * @param {PhotoMeta} [meta={}] - metadados da captura
 * @returns {Promise<{ok:true, photo:PhotoEntry}|{ok:false, error:string}>}
 */
export async function addPhoto( elementId: any, blob: any, meta: any = {}) {
    // Validacao de entrada
    if (!elementId) return { ok: false, error: 'invalid_element' };
    const el = getElementById(elementId);
    if (!el) return { ok: false, error: 'element_not_found' };
    if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) {
        return { ok: false, error: 'invalid_mime_type' };
    }
    // Resize se necessario (max 1920px)
    let processedBlob = blob;
    try {
        processedBlob = await resizeImage(blob, 1920);
    } catch (e: any) {
        console.debug('[photolog] resize-image:', /** @type {any} */ (e)?.message || e);
        /* mantem original se resize falhar */
    }
    // SHA-256 checksum
    const buffer = await processedBlob.arrayBuffer();
    const digestBuf = await crypto.subtle.digest('SHA-256', buffer);
    const checksumSha256 = Array.from(new Uint8Array(digestBuf))
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join('');
    // Inicializa array de fotos se necessario
    if (!el.data) el.data = {};
    if (!Array.isArray(el.data.photos)) el.data.photos = [];
    // Deteccao de duplicata por checksum no mesmo elemento
    if (el.data.photos.some((p: any) => p.checksumSha256 === checksumSha256)) {
        return { ok: false, error: 'duplicate_photo' };
    }
    // EXIF extraction (GPS + date)
    const exif = extractExifBasic(buffer);
    const gps = meta.gps || (exif.gps ? { ...exif.gps, accuracy: 0 } : null);
    const timestamp = exif.dateTaken ? _exifDateToISO(exif.dateTaken) : new Date().toISOString();
    // Gera thumbnail
    let thumbBlob: any = null;
    try {
        thumbBlob = await createThumbnail(new Blob([buffer], { type: processedBlob.type }), 200);
    } catch (e: any) {
        console.debug('[photolog] thumbnail-create:', /** @type {any} */ (e)?.message || e);
        /* sem thumbnail se falhar */
    }
    // Gera ID unico
    const id = `photo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const blobKey = `ecbyts-photo:${id}`;
    const thumbKey = `ecbyts-photo-thumb:${id}`;
    // Salva blob em IDB - DEVE verificar retorno (T2 Attack #1)
    const blobOk = await idbSet(blobKey, processedBlob);
    if (!blobOk) {
        return { ok: false, error: 'storage_full' };
    }
    // Salva thumbnail em IDB (best-effort - nao bloqueia)
    if (thumbBlob) {
        await idbSet(thumbKey, thumbBlob);
    }
    // Author
    const author = _getAuthor();
    // Monta photo entry
    const now = new Date().toISOString();
    const photo: any = {
        id,
        blobKey,
        fileId: null,
        filename: meta.filename || `IMG_${_formatDateForFilename(now)}.jpg`,
        mimeType: processedBlob.type || 'image/jpeg',
        sizeBytes: processedBlob.size,
        checksumSha256,
        captureSource: meta.captureSource || 'upload',
        description: typeof meta.description === 'string' ? meta.description.slice(0, 500) : '',
        author,
        timestamp,
        gps,
        elementId,
        thumbKey,
        syncStatus: 'local',
        syncError: null,
        createdAt: now,
        updatedAt: now,
    };
    // Append ao element
    el.data.photos.push(photo);
    // Persiste indice de backup no IDB
    await _persistIndex();
    // Broadcast para outras tabs
    broadcastChange('photolog:added', { photoId: id, elementId });
    requestPhotologManagerUIRefresh('photolog.added');
    return { ok: true, photo };
}
/**
 * Returns photo metadata by ID (busca em todos os elementos).
 * @param {string} photoId
 * @returns {PhotoEntry|null} PhotoEntry ou null
 */
export function getPhoto( photoId: any) {
    for (const photo of _iterAllPhotos()) {
        if (photo.id === photoId) return photo;
    }
    return null;
}
/**
 * Returns photo blob from IDB.
 * Tenta IDB local primeiro.
 *
 * @param {string} photoId
 * @returns {Promise<Blob|null>}
 */
export async function getPhotoBlob( photoId: any) {
    const photo = getPhoto(photoId);
    if (!photo) return null;
    const blob = await idbGet(photo.blobKey);
    if (blob instanceof Blob) return blob;
    return null;
}
/**
 * Returns thumbnail blob from IDB.
 * @param {string} photoId
 * @returns {Promise<Blob|null>}
 */
export async function getPhotoThumb( photoId: any) {
    const photo = getPhoto(photoId);
    if (!photo) return null;
    const thumb = await idbGet(photo.thumbKey);
    if (thumb instanceof Blob) return thumb;
    // Fallback: gera thumbnail do blob original
    const blob = await getPhotoBlob(photoId);
    if (blob) {
        try {
            const newThumb = await createThumbnail(blob, 200);
            await idbSet(photo.thumbKey, newThumb);
            return newThumb;
        } catch (e: any) {
            console.debug('[photolog] thumbnail-fallback:', /** @type {any} */ (e)?.message || e);
            /* sem thumb */
        }
    }
    return null;
}
/**
 * Returns all photos for a specific element.
 * Ordenado por timestamp decrescente (mais recente primeiro).
 *
 * @param {string} elementId
 * @returns {PhotoEntry[]} Array de PhotoEntry
 */
export function getPhotosByElement( elementId: any) {
    const el = getElementById(elementId);
    if (!el?.data?.photos) return [];
    return [...el.data.photos].sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
}
/**
 * Returns all photos across all elements.
 * Ordenado por timestamp decrescente.
 *
 * @returns {PhotoEntry[]} Array de PhotoEntry
 */
export function getAllPhotos() {
    const all = [..._iterAllPhotos()];
    return all.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
}
/**
 * Deletes a photo from element and IDB.
 * Remove metadata do element.data.photos, blob e thumb do IDB.
 *
 * @param {string} photoId
 * @param {string} elementId
 * @returns {Promise<{ok:boolean}>}
 */
export async function deletePhoto( photoId: any, elementId: any) {
    const el = getElementById(elementId);
    if (!el?.data?.photos) return { ok: false };
    const idx = el.data.photos.findIndex((p: any) => p.id === photoId);
    if (idx === -1) return { ok: false };
    const photo = el.data.photos[idx];
    // Remove blob e thumbnail do IDB
    await idbDelete(photo.blobKey);
    await idbDelete(photo.thumbKey);
    // Remove do array do elemento
    el.data.photos.splice(idx, 1);
    // Persiste indice atualizado
    await _persistIndex();
    // Broadcast
    broadcastChange('photolog:deleted', { photoId, elementId });
    requestPhotologManagerUIRefresh('photolog.deleted');
    return { ok: true };
}
/**
 * Deletes all photos for a given element (cascade on element delete).
 * Limpa blobs e thumbs do IDB.
 *
 * @param {string} elementId
 * @returns {Promise<void>}
 */
export async function deletePhotosByElement( elementId: any) {
    const el = getElementById(elementId);
    if (!el?.data?.photos?.length) return;
    const deletes = el.data.photos.flatMap((p: any) => [idbDelete(p.blobKey), idbDelete(p.thumbKey)]);
    await Promise.all(deletes);
    el.data.photos = [];
    await _persistIndex();
    requestPhotologManagerUIRefresh('photolog.element-cleared');
}
/**
 * Updates photo metadata (description, tags).
 * @param {string} photoId
 * @param {{ description?: string }} updates - { description? }
 * @returns {boolean} true se encontrou e atualizou
 */
export function updatePhotoMeta( photoId: any, updates: any) {
    const photo = getPhoto(photoId);
    if (!photo) return false;
    if (typeof updates.description === 'string') {
        photo.description = updates.description.slice(0, 500);
    }
    photo.updatedAt = new Date().toISOString();
    requestPhotologManagerUIRefresh('photolog.metadata-updated');
    return true;
}
/**
 * Manually triggers sync of all pending photos via fileManager.
 * Usa import dinamico para evitar dependencia circular com fileManager.
 *
 * @returns {Promise<{ok:boolean, synced:number, failed:number}>}
 */
export async function syncPendingPhotos() {
    const pending = [..._iterAllPhotos()].filter((p: any) => p.syncStatus === 'local' || p.syncStatus === 'failed');
    if (!pending.length) return { ok: true, synced: 0, failed: 0 };
    let synced = 0;
    let failed = 0;
    // Import dinamico - fileManager pode nao estar disponivel offline
    let register;
    try {
        const fm = await import('../../utils/files/fileManager.js' as string);
        register = fm.register;
    } catch (e: any) {
        console.debug('[photolog] file-manager-import:', /** @type {any} */ (e)?.message || e);
        return { ok: false, synced: 0, failed: pending.length };
    }
    for (const photo of pending) {
        try {
            photo.syncStatus = 'syncing';
            const blob = await idbGet(photo.blobKey);
            if (!blob) {
                photo.syncStatus = 'failed';
                photo.syncError = 'blob_not_found';
                failed++;
                continue;
            }
            const file = new File([blob], photo.filename, { type: photo.mimeType });
            const result = await register(file, {
                source: 'photolog',
                tags: ['photolog', `element:${photo.elementId}`, `source:${photo.captureSource}`],
            });
            if (result.ok) {
                photo.fileId = result.file?.id || null;
                photo.syncStatus = 'synced';
                photo.syncError = null;
                synced++;
            } else {
                photo.syncStatus = 'failed';
                photo.syncError = result.error || 'sync_failed';
                failed++;
            }
        } catch (err: any) {
            photo.syncStatus = 'failed';
            photo.syncError = /** @type {any} */ (err).message || 'sync_error';
            failed++;
        }
        photo.updatedAt = new Date().toISOString();
    }
    await _persistIndex();
    requestPhotologManagerUIRefresh('photolog.synced');
    return { ok: true, synced, failed };
}
// ─── ECO1 Export / Import ──────────────────────────────────
/**
 * Exports all photo metadata for ECO1 serialization.
 * Retorna array de metadata (sem blobKey/thumbKey - sao locais).
 *
 * @returns {PhotoImportEntry[]} Array de photo metadata para ECO1
 */
export function exportPhotos() {
    const photos = [];
    for (const photo of _iterAllPhotos()) {
        photos.push({
            id: photo.id,
            elementId: photo.elementId,
            filename: photo.filename,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            checksumSha256: photo.checksumSha256,
            captureSource: photo.captureSource,
            description: photo.description,
            author: photo.author,
            timestamp: photo.timestamp,
            gps: photo.gps,
            fileId: photo.fileId,
            syncStatus: photo.syncStatus,
        });
    }
    return photos;
}
/**
 * Imports photo metadata from ECO1 into elements.
 * Blobs nao estao inclusos - fotos sem blob/fileId ficam 'unresolvable'.
 *
 * @param {PhotoImportEntry[]} data - array de photo metadata do ECO1
 */
export function importPhotos( data: any) {
    if (!Array.isArray(data)) return;
    for (const entry of data) {
        if (!entry?.elementId || !entry?.id) continue;
        const el = getElementById(entry.elementId);
        if (!el) continue;
        if (!el.data) el.data = {};
        if (!Array.isArray(el.data.photos)) el.data.photos = [];
        // Skip duplicatas
        if (el.data.photos.some((p: any) => p.id === entry.id)) continue;
        // Reconstroi entry completa com keys locais
        const photo: any = {
            id: entry.id,
            blobKey: `ecbyts-photo:${entry.id}`,
            fileId: entry.fileId || null,
            filename: entry.filename || 'photo.jpg',
            mimeType: entry.mimeType || 'image/jpeg',
            sizeBytes: entry.sizeBytes || 0,
            checksumSha256: entry.checksumSha256 || '',
            captureSource: entry.captureSource || 'upload',
            description: entry.description || '',
            author: entry.author || { id: null, name: 'unknown' },
            timestamp: entry.timestamp || new Date().toISOString(),
            gps: entry.gps || null,
            elementId: entry.elementId,
            thumbKey: `ecbyts-photo-thumb:${entry.id}`,
            // T2 Attack #2: fotos importadas sem blob e sem fileId = irrecuperaveis
            syncStatus:
                !entry.fileId && entry.syncStatus === 'local' ? 'unresolvable' : entry.syncStatus || 'unresolvable',
            syncError: null,
            createdAt: entry.timestamp || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        el.data.photos.push(photo);
    }
    requestPhotologManagerUIRefresh('photolog.imported');
}
// ─── Stats ──────────────────────────────────────────────────
/**
 * Returns photolog statistics.
 * @returns {{ total:number, local:number, synced:number, failed:number, unresolvable:number, totalBytes:number, storageWarning:boolean }}
 */
export function getPhotoStats() {
    let total = 0,
        local = 0,
        synced = 0,
        failed = 0,
        unresolvable = 0,
        totalBytes = 0;
    for (const photo of _iterAllPhotos()) {
        total++;
        totalBytes += photo.sizeBytes || 0;
        switch (photo.syncStatus) {
            case 'local':
            case 'syncing':
                local++;
                break;
            case 'synced':
                synced++;
                break;
            case 'failed':
                failed++;
                break;
            case 'unresolvable':
                unresolvable++;
                break;
        }
    }
    return {
        total,
        local,
        synced,
        failed,
        unresolvable,
        totalBytes,
        storageWarning: totalBytes > STORAGE_WARNING_BYTES,
    };
}
// ─── Internal helpers ───────────────────────────────────────
/**
 * Itera todas as fotos de todos os elementos.
 * @yields {PhotoEntry} PhotoEntry
 */
function* _iterAllPhotos() {
    for (const el of getAllElements()) {
        if (el.data?.photos) {
            yield* el.data.photos;
        }
    }
}
/**
 * Persiste indice de fotos no IDB (backup).
 */
async function _persistIndex() {
    const photos = [..._iterAllPhotos()].map((p: any) => ({
        id: p.id,
        elementId: p.elementId,
        filename: p.filename,
        syncStatus: p.syncStatus,
        timestamp: p.timestamp,
    }));
    await idbSet(INDEX_KEY, photos);
}
/**
 * Retorna autor a partir da sessao atual.
 * @returns {{ id: string|null, name: string }}
 */
function _getAuthor() {
    try {
        // Import dinamico inline para evitar dependencia circular
        const user = window._ecbtCurrentUser?.();
        if (user) return { id: user.id || null, name: user.displayName || user.email || 'user' };
    } catch (e: any) {
        console.debug('[photolog] author-resolve:', /** @type {any} */ (e)?.message || e);
        /* sem sessao */
    }
    return { id: null, name: 'anonymous' };
}
/**
 * Converte data EXIF "YYYY:MM:DD HH:MM:SS" para ISO 8601.
 * @param {string} exifDate
 * @returns {string} ISO date string
 */
function _exifDateToISO( exifDate: any) {
    try {
        const [date, time] = exifDate.split(' ');
        return `${date.replace(/:/g, '-')}T${time || '00:00:00'}`;
    } catch (e: any) {
        console.debug('[photolog] exif-date-parse:', /** @type {any} */ (e)?.message || e);
        return new Date().toISOString();
    }
}
/**
 * Formata data para nome de arquivo: YYYYMMDD_HHMMSS.
 * @param {string} iso
 * @returns {string}
 */
function _formatDateForFilename( iso: any) {
    return iso.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
}
