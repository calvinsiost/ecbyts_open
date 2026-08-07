// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
import * as _session from '../auth/session.js';
const getCurrentUser = _session.getCurrentUser;
const getSupabaseClient = _session.getSupabaseClient;
import { parseFile } from '../../core/ingestion/parser.js';
import { getModelIdSync } from '../../core/io/modelLink.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import {
    DOWNLOAD_URL_EXPIRES_SECONDS,
    ERROR_CODE,
    FILE_BUCKET,
    FILE_REGISTER_MODE,
    FILE_SCOPE,
    FILE_SOURCE,
    FILE_STATUS,
    PREVIEW_EXTENSIONS,
    TEXT_EXTENSIONS,
    getFileRegisterMode,
} from './fileConstants.js';
import { computeFileChecksumSHA256, uploadToStorage } from './fileUploader.js';
/** @type {any[]} */
let _cachedList: any[] = [];
const _READ_TIMEOUT = 8000;
const _WRITE_TIMEOUT = 10000;
const API_SCHEMA = 'api';
const FILES_TABLE = 'files';
const DOCUMENT_ASSETS_TABLE = 'document_assets';
const FILE_METADATA_SELECT = [
    'id',
    'user_id',
    'model_id',
    'scope_type',
    'filename',
    'mime_type',
    'extension',
    'size_bytes',
    'storage_path',
    'checksum_sha256',
    'tags',
    'source',
    'status',
    'deleted_at',
    'created_at',
    'updated_at',
].join(', ');
/**
 * Executa query Supabase com timeout via Promise.race.
 * @param {() => Promise<any>} queryFn - funcao que retorna a promise da query
 * @param {number} [ms] - timeout em ms (default: _READ_TIMEOUT)
 * @returns {Promise<any>} - resultado da query ou rejeicao por timeout
 */
async function _withTimeout(queryFn: any,ms = _READ_TIMEOUT) {
    /** @type {any} */
    const timer: any = {};
    const timeoutPromise = new Promise((_, reject) => {
        timer.id = setTimeout(() => reject(new Error('Supabase query timeout')), ms);
    });
    try {
        return await Promise.race([queryFn(), timeoutPromise]);
    } finally {
        clearTimeout(timer.id);
    }
}
/** @param {any} [filters] */
export async function list(filters: any = {}) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    try {
        let q = _fromApi(ctx.client, FILES_TABLE)
            .select(FILE_METADATA_SELECT)
            .eq('user_id', ctx.user.id)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false });
        if (filters.extension) q = q.eq('extension', filters.extension.toLowerCase());
        if (filters.source) q = q.eq('source', filters.source);
        if (filters.scopeType) q = q.eq('scope_type', filters.scopeType);
        if (filters.modelId) q = q.eq('model_id', filters.modelId);
        if (filters.tag) q = q.contains('tags', [filters.tag]);
        const { data, error } = await _withTimeout(() => q, _READ_TIMEOUT);
        if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
        _cachedList = data || [];
        return ok(_cachedList);
    } catch (err: any) {
        return fail(err?.message || String(err), ERROR_CODE.FETCH_FAILED);
    }
}
/** @param {any} id */
export async function get(id: any) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    try {
        const meta: any = await _getMetaById(ctx, id);
        if (!meta.ok) return meta;
        const signed: any = await _getDownloadUrlByPath(ctx.client, meta.data.storage_path);
        const data = meta.data;
        return signed.ok ? ok({ ...data, signedUrl: signed.data.url }) : ok(data);
    } catch (err: any) {
        return fail(err?.message || String(err), ERROR_CODE.FETCH_FAILED);
    }
}
/**
 * @param {any} id
 * @param {any} [options]
 */
export async function getDownloadUrl(id: any,options: any = {}) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    const meta: any = await _getMetaById(ctx, id);
    if (!meta.ok) return meta;
    return _getDownloadUrlByPath(ctx.client, meta.data.storage_path, options.expiresIn);
}
/** @param {any} id */
export async function getContent(id: any) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    const meta: any = await _getMetaById(ctx, id);
    if (!meta.ok) return meta;
    const signed: any = await _getDownloadUrlByPath(ctx.client, meta.data.storage_path);
    if (!signed.ok) return signed;
    try {
        const resp = await fetch(signed.data.url);
        if (!resp.ok) return fail(`HTTP ${resp.status}`, ERROR_CODE.FETCH_FAILED);
        const buffer = await resp.arrayBuffer();
        const checksum = await _hashArrayBuffer(buffer);
        if (checksum !== meta.data.checksum_sha256) {
            return fail('Checksum mismatch no download.', ERROR_CODE.CHECKSUM_MISMATCH);
        }
        return ok(buffer);
    } catch (err: any) {
        return fail(err?.message || String(err), ERROR_CODE.FETCH_FAILED);
    }
}
/** @param {any} id */
export async function getAsText(id: any) {
    const fileRes = await get(id);
    if (!fileRes.ok) return fileRes;
    const ext = String(fileRes.data.extension || '').toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
        return fail('Formato nao textual.', ERROR_CODE.PREVIEW_UNAVAILABLE);
    }
    const content = await getContent(id);
    if (!content.ok) return content;
    return ok(new TextDecoder().decode(content.data));
}
/** @param {any} id */
export async function getAsParsed(id: any) {
    const meta = await get(id);
    if (!meta.ok) return meta;
    const ext = String(meta.data.extension || '').toLowerCase();
    if (!PREVIEW_EXTENSIONS.has(ext)) {
        return fail('Extensao nao suportada para parse.', ERROR_CODE.PREVIEW_UNAVAILABLE);
    }
    const content = await getContent(id);
    if (!content.ok) return content;
    try {
        const file = _toFile(meta.data.filename, meta.data.mime_type, content.data);
        const parsed = await parseFile(file);
        return ok(parsed);
    } catch (err: any) {
        return fail(`Falha de parse: ${err.message}`, ERROR_CODE.PARSE_FAILED);
    }
}
/**
 * @param {any} file
 * @param {any} [metadata]
 */
export async function register(file: any,metadata: any = {}) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    if (!(file instanceof File)) return fail('Arquivo invalido.', ERROR_CODE.INVALID_FILE);
    if (file.size === 0) return fail('Arquivo vazio nao e permitido.', ERROR_CODE.INVALID_FILE);
    console.info('[files] upload_started', {
        name: file.name,
        size: file.size,
        source: metadata.source || FILE_SOURCE.MANUAL,
    });
    const checksumRes: any = await computeFileChecksumSHA256(file);
    if (!checksumRes.ok) return checksumRes;
    const extension = _getExtension(file.name);
    const currentModelId = getModelIdSync();
    const scopeType = metadata.scopeType || (currentModelId ? FILE_SCOPE.MODEL : FILE_SCOPE.WORKSPACE);
    const modelId = metadata.modelId || currentModelId || null;
    const source = metadata.source || FILE_SOURCE.MANUAL;
    const quota = await _checkQuota(ctx, file.size);
    if (!quota.ok) {
        console.warn('[files] quota_rejected', { reason: quota.error, code: quota.code });
        return quota;
    }
    const dedupe = await _findDuplicate(ctx, checksumRes.data.checksum, source, scopeType, modelId);
    if (!dedupe.ok) return dedupe;
    if (dedupe.data) {
        // Merge: preservar tags existentes e adicionar as novas sem sobrescrever
        const merged = _normalizeTags([...(dedupe.data.tags || []), ...(metadata.tags || [])]);
        const touch = await _touchDuplicate(ctx, dedupe.data.id, merged);
        return touch.ok ? ok({ ...dedupe.data, deduplicated: true }) : touch;
    }
    const storagePath = `${ctx.user.id}/${checksumRes.data.checksum}.${extension || 'bin'}`;
    const insertRes = await _insertPending(ctx, file, {
        extension,
        source,
        scopeType,
        modelId,
        storagePath,
        checksum: checksumRes.data.checksum,
        tags: metadata.tags || [],
    });
    if (!insertRes.ok) return insertRes;
    const uploadRes: any = await uploadToStorage(ctx.client, storagePath, file, file.type);
    if (!uploadRes.ok) {
        await _markOrphaned(ctx, insertRes.data.id, uploadRes.error);
        console.error('[files] upload_failed', { code: uploadRes.code, error: uploadRes.error });
        return uploadRes;
    }
    const activateRes = await _markActive(ctx, insertRes.data.id);
    if (!activateRes.ok) {
        await _markOrphaned(ctx, insertRes.data.id, activateRes.error);
        console.error('[files] register_failed', { code: activateRes.code, error: activateRes.error });
        return activateRes;
    }
    console.info('[files] upload_succeeded', { id: insertRes.data.id, storagePath });
    return ok(activateRes.data);
}
/** @param {any} id */
export async function softDelete(id: any) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    // SP-14: Collect asset storage paths BEFORE cascade deletes the rows
    const { data: assets } = await _fromApi(ctx.client, DOCUMENT_ASSETS_TABLE)
        .select('thumbnail_path, full_image_path')
        .eq('file_id', id)
        .eq('user_id', ctx.user.id);
    const assetPaths = (assets || []).flatMap((a: any) =>
        [a.thumbnail_path, a.full_image_path].filter(Boolean),
    );
    // Soft-delete the file (CASCADE removes document_assets rows)
    const now = new Date().toISOString();
    const { data, error } = await _fromApi(ctx.client, FILES_TABLE)
        .update({ deleted_at: now, status: FILE_STATUS.DELETED })
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .is('deleted_at', null)
        .select(FILE_METADATA_SELECT)
        .maybeSingle();
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    if (!data) return fail('Arquivo nao encontrado.', ERROR_CODE.NOT_FOUND);
    // SP-14: Schedule asset blob cleanup (best-effort, non-blocking)
    if (assetPaths.length > 0) {
        _scheduleStorageCleanup(ctx.client, assetPaths).catch((err: any) =>
            console.warn('[files] asset_blob_cleanup_failed', {
                count: assetPaths.length,
                error: err?.message || String(err),
            }),
        );
    }
    return ok(data);
}
/**
 * @param {any} id
 * @param {any} tags
 */
export async function updateTags(id: any,tags: any) {
    const ctx: any = _ctx();
    if (!ctx.ok) return ctx;
    const cleanTags = _normalizeTags(tags);
    const { data, error } = await _fromApi(ctx.client, FILES_TABLE)
        .update({ tags: cleanTags })
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .is('deleted_at', null)
        .select(FILE_METADATA_SELECT)
        .maybeSingle();
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    if (!data) return fail('Arquivo nao encontrado.', ERROR_CODE.NOT_FOUND);
    return ok(data);
}
export function getCachedList() {
    return [..._cachedList];
}
/**
 * @param {any} file
 * @param {any} [metadata]
 */
export async function registerFromIngestion(file: any,metadata: any = {}) {
    const mode = metadata.mode || getFileRegisterMode();
    const result = await register(file, { ...metadata, source: FILE_SOURCE.IMPORT });
    if (result.ok) return result;
    if (mode === FILE_REGISTER_MODE.BEST_EFFORT) {
        _setReconcileWarning(result.error, result.code);
        return result;
    }
    return fail(result.error, result.code || ERROR_CODE.REGISTER_FAILED);
}
/** @returns {any} */
function _ctx(): any {
    const client = getSupabaseClient();
    const user = getCurrentUser();
    if (!client) return fail('Supabase nao inicializado.', ERROR_CODE.CLIENT_NOT_READY);
    if (!user?.id) return fail('Usuario nao autenticado.', ERROR_CODE.NOT_AUTHENTICATED);
    return { ok: true, client, user };
}
/**
 * @param {any} client
 * @param {any} table
 */
function _fromApi(client: any,table: any) {
    if (client && typeof client.schema === 'function') {
        const api = client.schema(API_SCHEMA);
        if (api && typeof api.from === 'function') return api.from(table);
    }
    return client.from(table);
}
/**
 * @param {any} client
 * @param {any} functionName
 * @param {any} params
 */
function _rpcFromApi(client: any,functionName: any,params: any) {
    if (client && typeof client.schema === 'function') {
        const api = client.schema(API_SCHEMA);
        if (api && typeof api.rpc === 'function') return api.rpc(functionName, params);
    }
    return client.rpc(functionName, params);
}
/**
 * @param {any} ctx
 * @param {any} fileSize
 */
async function _checkQuota(ctx: any,fileSize: any) {
    const { data, error } = await _withTimeout(
        () => _rpcFromApi(ctx.client, 'check_files_quota_v2', { p_file_size: fileSize }),
        _WRITE_TIMEOUT,
    );
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.allowed) return fail(row?.message || 'Quota excedida.', ERROR_CODE.QUOTA_EXCEEDED);
    return ok(row);
}
/**
 * @param {any} ctx
 * @param {any} checksum
 * @param {any} source
 * @param {any} scopeType
 * @param {any} modelId
 */
async function _findDuplicate(ctx: any,checksum: any,source: any,scopeType: any,modelId: any) {
    let q = _fromApi(ctx.client, FILES_TABLE)
        .select(FILE_METADATA_SELECT)
        .eq('user_id', ctx.user.id)
        .eq('checksum_sha256', checksum)
        .eq('source', source)
        .eq('scope_type', scopeType)
        .is('deleted_at', null);
    if (modelId) q = q.eq('model_id', modelId);
    else q = q.is('model_id', null);
    const { data, error } = await _withTimeout(() => q.limit(1).maybeSingle(), _WRITE_TIMEOUT);
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    return ok(data || null);
}
/**
 * @param {any} ctx
 * @param {any} id
 * @param {any} tags
 */
async function _touchDuplicate(ctx: any,id: any,tags: any) {
    // tags deve chegar ja normalizado (via _normalizeTags no caller)
    const { data, error } = await _fromApi(ctx.client, FILES_TABLE)
        .update({ updated_at: new Date().toISOString(), tags })
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .select(FILE_METADATA_SELECT)
        .maybeSingle();
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    return ok(data);
}
/**
 * @param {any} ctx
 * @param {any} id
 */
async function _getMetaById(ctx: any,id: any) {
    const { data, error } = await _fromApi(ctx.client, FILES_TABLE)
        .select(FILE_METADATA_SELECT)
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) return fail(error.message, ERROR_CODE.FETCH_FAILED);
    if (!data) return fail('Arquivo nao encontrado.', ERROR_CODE.NOT_FOUND);
    return ok(data);
}
/**
 * @param {any} ctx
 * @param {any} file
 * @param {any} meta
 */
async function _insertPending(ctx: any,file: any,meta: any) {
    const payload = {
        user_id: ctx.user.id,
        model_id: meta.modelId,
        scope_type: meta.scopeType,
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        extension: meta.extension || '',
        size_bytes: file.size || 0,
        storage_path: meta.storagePath,
        checksum_sha256: meta.checksum,
        tags: _normalizeTags(meta.tags),
        source: meta.source,
        status: FILE_STATUS.PENDING_UPLOAD,
    };
    const { data, error } = await _withTimeout(
        () => _fromApi(ctx.client, FILES_TABLE).insert(payload).select(FILE_METADATA_SELECT).single(),
        _WRITE_TIMEOUT,
    );
    if (error) return fail(error.message, ERROR_CODE.REGISTER_FAILED);
    return ok(data);
}
/**
 * @param {any} ctx
 * @param {any} id
 */
async function _markActive(ctx: any,id: any) {
    const { data, error } = await _withTimeout(
        () =>
            _fromApi(ctx.client, FILES_TABLE)
                .update({ status: FILE_STATUS.ACTIVE })
                .eq('id', id)
                .eq('user_id', ctx.user.id)
                .select(FILE_METADATA_SELECT)
                .single(),
        _WRITE_TIMEOUT,
    );
    if (error) return fail(error.message, ERROR_CODE.REGISTER_FAILED);
    return ok(data);
}
/**
 * @param {any} ctx
 * @param {any} id
 * @param {any} reason
 */
async function _markOrphaned(ctx: any,id: any,reason: any) {
    console.warn('[files] reconcile_orphaned', { id, reason: String(reason || '').slice(0, 120) });
    // Buscar tags existentes antes de sobrescrever para nao destrui-las
    const { data: meta } = await _fromApi(ctx.client, FILES_TABLE)
        .select('tags')
        .eq('id', id)
        .maybeSingle();
    const existingTags = meta?.tags || [];
    const orphanTags = _normalizeTags([
        ...existingTags,
        `orphaned:${new Date().toISOString()}`,
        `reason:${String(reason || '').slice(0, 60)}`,
    ]);
    await _fromApi(ctx.client, FILES_TABLE)
        .update({
            status: FILE_STATUS.ORPHANED,
            tags: orphanTags,
        })
        .eq('id', id)
        .eq('user_id', ctx.user.id);
}
/** @param {any} filename */
function _getExtension(filename: any) {
    const parts = String(filename || '').split('.');
    return parts.length > 1 ? (parts.pop() || '').toLowerCase() : '';
}
/** @param {any} tags */
function _normalizeTags(tags: any) {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags.map((t: any) => String(t || '').trim()).filter(Boolean))].slice(0, 20);
}
/**
 * @param {any} error
 * @param {any} code
 */
function _setReconcileWarning(error: any,code: any) {
    const payload = {
        at: new Date().toISOString(),
        error: String(error || ''),
        code: code || ERROR_CODE.REGISTER_FAILED,
    };
    safeSetItem('ecbyts-files-reconcile-warning', JSON.stringify(payload));
}
/**
 * @param {any} client
 * @param {string} path
 * @param {number} [expiresIn]
 */
async function _getDownloadUrlByPath(client: any,path: any,expiresIn = DOWNLOAD_URL_EXPIRES_SECONDS) {
    const { data, error } = await client.storage.from(FILE_BUCKET).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
        return fail(error?.message || 'Falha ao gerar URL de download.', ERROR_CODE.FETCH_FAILED);
    }
    return ok({ url: data.signedUrl, expiresIn });
}
/** @param {ArrayBuffer} buffer */
async function _hashArrayBuffer(buffer: any) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b: any) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * @param {any} name
 * @param {any} type
 * @param {any} arrayBuffer
 */
function _toFile(name: any,type: any,arrayBuffer: any) {
    const blob = new Blob([arrayBuffer], { type: type || 'application/octet-stream' });
    return new File([blob], name || 'file.bin', { type: type || blob.type });
}
// ---------------------------------------------------------------------------
// v0.2: Asset blob cleanup (SP-14)
// ---------------------------------------------------------------------------
/**
 * Best-effort removal of Storage blobs from deleted document assets.
 * Runs async, does not block softDelete response.
 * Failures logged but not surfaced to user.
 *
 * @param {any} client - Supabase client
 * @param {string[]} paths - Storage paths to remove
 */
async function _scheduleStorageCleanup(client: any,paths: any) {
    const BATCH_SIZE = 100; // Supabase Storage supports batch delete up to 100
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE);
        try {
            const { error } = await client.storage.from(FILE_BUCKET).remove(batch);
            if (error) {
                console.warn('[files] blob_batch_remove_failed', { count: batch.length, error: error.message });
            }
        } catch (err: any) {
            console.warn('[files] blob_batch_remove_error', {
                count: batch.length,
                error: err.message,
            });
        }
    }
}
/**
 * @param {any} [data]
 * @returns {any}
 */
function ok(data: any): any {
    return { ok: true, data };
}
/**
 * @param {any} error
 * @param {any} [code?]
 * @returns {any}
 */
function fail(error: any,code?: any): any {
    return { ok: false, error, code };
}
