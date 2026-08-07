// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// IMPORT-UX-001 RF-8 — Cache/resume por hash.
// Dor P11: retry repete a extração do zero (40s+ jogados fora). Este módulo
// cacheia o resultado da extração por página no IndexedDB, chaveado pelo
// SHA-256 do conteúdo do arquivo. Retry retoma de onde parou.
//
// Build-free: sem entrada em ts-migration-map.json. Testes via
// node --experimental-strip-types --test. O import do idbStore é lazy
// (dynamic import) para não exigir o mirror .js em contexto Node.

export interface PageExtraction {
    page: number;
    text: string;
    tables: unknown[];
    imageCount: number;
    status: 'ok' | 'error';
    error: string | null;
}

export interface ImportCacheEntry {
    hash: string;
    fileName: string;
    fileSize: number;
    totalPages: number;
    completedPages: number;
    pages: PageExtraction[];
    createdAt: number;
    updatedAt: number;
}

export interface FileLike {
    name: string;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
}

const CACHE_PREFIX = 'import-cache:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StorageGet = (key: string) => Promise<unknown | null>;
type StorageSet = (key: string, value: unknown) => Promise<boolean>;
type StorageDelete = (key: string) => Promise<boolean>;

let _get: StorageGet | null = null;
let _set: StorageSet | null = null;
let _del: StorageDelete | null = null;
let _storageReady: Promise<void> | null = null;

function _ensureStorage(): Promise<void> {
    if (_get) return Promise.resolve();
    if (!_storageReady) {
        _storageReady = import('../storage/idbStore.js').then((m: any) => {
            _get = m.idbGet as StorageGet;
            _set = m.idbSet as StorageSet;
            _del = m.idbDelete as StorageDelete;
        });
    }
    return _storageReady;
}

export function _setStorageForTest(
    get: StorageGet,
    set: StorageSet,
    del: StorageDelete,
): void {
    _get = get;
    _set = set;
    _del = del;
    _storageReady = Promise.resolve();
}

export function _resetForTest(): void {
    _get = null;
    _set = null;
    _del = null;
    _storageReady = null;
}

export function cacheKey(hash: string): string {
    return `${CACHE_PREFIX}${hash}`;
}

export async function computeFileHash(file: FileLike): Promise<string> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === undefined) continue;
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

export async function getCachedResult(hash: string): Promise<ImportCacheEntry | null> {
    if (!hash) return null;
    await _ensureStorage();
    const raw = await _get!(cacheKey(hash));
    if (raw == null) return null;
    const entry = raw as ImportCacheEntry;
    if (typeof entry.updatedAt !== 'number') return null;
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
        await _del!(cacheKey(hash));
        return null;
    }
    return entry;
}

export async function setCachedResult(hash: string, result: ImportCacheEntry): Promise<boolean> {
    if (!hash) return false;
    await _ensureStorage();
    const now = Date.now();
    const entry: ImportCacheEntry = {
        ...result,
        hash,
        updatedAt: now,
        createdAt: result.createdAt || now,
    };
    return _set!(cacheKey(hash), entry);
}

export async function clearCachedResult(hash: string): Promise<boolean> {
    if (!hash) return false;
    await _ensureStorage();
    return _del!(cacheKey(hash));
}

export function getResumePoint(entry: ImportCacheEntry | null): number {
    if (!entry || !Array.isArray(entry.pages)) return 0;
    let maxCompleted = 0;
    for (const p of entry.pages) {
        if (p.status === 'ok' && p.page > maxCompleted) {
            maxCompleted = p.page;
        }
    }
    return maxCompleted;
}

export function isCacheComplete(entry: ImportCacheEntry | null): boolean {
    if (!entry) return false;
    return entry.completedPages >= entry.totalPages && entry.totalPages > 0;
}

export function buildCacheEntry(
    hash: string,
    fileName: string,
    fileSize: number,
    totalPages: number,
    pages: PageExtraction[],
): ImportCacheEntry {
    const now = Date.now();
    const completedPages = pages.filter((p) => p.status === 'ok').length;
    return {
        hash,
        fileName,
        fileSize,
        totalPages,
        completedPages,
        pages,
        createdAt: now,
        updatedAt: now,
    };
}
