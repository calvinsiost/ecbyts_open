// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { idbGet, idbSet } from '../storage/idbStore.js';

const STORE_KEY = 'ecbyts-local-generated-videos';
const LOCAL_PREFIX = 'local-video:';
const LOCAL_SOURCE = 'automation_local';

/**
 * @param {File} file
 * @param {Record<string, any>} [metadata]
 */
export async function saveLocalGeneratedVideo(file: any, metadata = {}) {
    if (!(file instanceof File)) return fail('Arquivo invalido.');
    const rows = await _readRows();
    const now = new Date().toISOString();
    const meta = metadata as any;
    const provider = String(meta.provider || 'veo3').toLowerCase();
    const tags = _normalizeTags(['video', 'ai-generated', provider, ...(meta.tags || [])]);
    const row = {
        id: _newId(),
        filename: file.name || `ecbyts-video-${Date.now()}.mp4`,
        extension: _getExtension(file.name || '') || 'mp4',
        mime_type: file.type || 'video/mp4',
        size_bytes: Number(file.size || 0),
        source: LOCAL_SOURCE,
        scope_type: 'workspace',
        tags,
        status: 'active',
        created_at: now,
        updated_at: now,
        local_only: true,
        blob: file,
    };
    rows.unshift(row);
    const persisted = await idbSet(STORE_KEY, rows);
    if (!persisted) return fail('Falha ao salvar localmente.');
    return ok(_withoutBlob(row));
}

/**
 * @param {Record<string, any>} [filters]
 */
export async function listLocalGeneratedFiles(filters = {}) {
    const rows = await _readRows();
    const f = filters as any;
    const filtered = rows.filter((row) => {
        if (f.extension && row.extension !== String(f.extension).toLowerCase()) return false;
        if (f.source && row.source !== f.source) return false;
        if (f.scopeType && row.scope_type !== f.scopeType) return false;
        if (f.tag && !Array.isArray(row.tags)) return false;
        if (f.tag && !row.tags.includes(f.tag)) return false;
        return true;
    });
    return ok(filtered.map(_withoutBlob));
}

/** @param {string} id */
export async function getLocalGeneratedFile(id: any) {
    const rows = await _readRows();
    const row = rows.find((r) => r.id === id);
    if (!row) return fail('Arquivo local nao encontrado.');
    return ok({ ...row });
}

/** @param {string} id */
export async function deleteLocalGeneratedFile(id: any) {
    const rows = await _readRows();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return fail('Arquivo local nao encontrado.');
    const persisted = await idbSet(STORE_KEY, next);
    if (!persisted) return fail('Falha ao remover arquivo local.');
    return ok(true);
}

/** @param {string} id @param {Array<string>} tags */
export async function updateLocalGeneratedFileTags(id: any, tags: any) {
    const rows = await _readRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return fail('Arquivo local nao encontrado.');
    const providerTag = String(
        rows[idx].tags?.find((/** @type {any} */ t: any) => t.startsWith('veo') || t.startsWith('runway')) || '',
    );
    const cleanTags = _normalizeTags([...tags, providerTag].filter(Boolean));
    rows[idx] = {
        ...rows[idx],
        tags: cleanTags,
        updated_at: new Date().toISOString(),
    };
    const persisted = await idbSet(STORE_KEY, rows);
    if (!persisted) return fail('Falha ao atualizar tags locais.');
    return ok(_withoutBlob(rows[idx]));
}

/** @param {string} id */
export function isLocalGeneratedFileId(id: any) {
    return String(id || '').startsWith(LOCAL_PREFIX);
}

function _newId() {
    const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    return `${LOCAL_PREFIX}${uuid}`;
}

async function _readRows() {
    const raw = await idbGet(STORE_KEY);
    return Array.isArray(raw) ? raw : [];
}

/** @param {any} row */
function _withoutBlob(row: any) {
    // eslint-disable-next-line
    const { blob, ...rest } = row || {};
    return rest;
}

/** @param {string} filename */
function _getExtension(filename: any) {
    const parts = String(filename || '').split('.');
    return parts.length > 1 ? (parts.pop() as string).toLowerCase() : '';
}

/** @param {any} tags */
function _normalizeTags(tags: any) {
    return [
        ...new Set(
            (Array.isArray(tags) ? tags : []).map(/** @type {any} */ (t) => String(t || '').trim()).filter(Boolean),
        ),
    ].slice(0, 20);
}

/** @param {any} data */
function ok(data: any) {
    return { ok: true, data };
}

/** @param {any} error */
function fail(error: any) {
    return { ok: false, error };
}
