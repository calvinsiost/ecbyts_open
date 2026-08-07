// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { FILE_BUCKET, ERROR_CODE } from './fileConstants.js';

export async function computeFileChecksumSHA256(file: any) {
    if (!(file instanceof File)) {
        return fail('Arquivo invalido.', ERROR_CODE.INVALID_FILE);
    }
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(digest));
    const checksum = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return ok({ checksum, buffer });
}

export async function uploadToStorage(
    client: any,
    storagePath: any,
    file: any,
    mimeType: any,
) {
    try {
        const { error } = await client.storage.from(FILE_BUCKET).upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: mimeType || file.type || 'application/octet-stream',
        });
        if (error) {
            return fail(`Falha no upload: ${error.message}`, ERROR_CODE.UPLOAD_FAILED);
        }
        return ok({ storagePath });
    } catch (err) {
        return fail(`Falha no upload: ${(err as any).message}`, ERROR_CODE.UPLOAD_FAILED);
    }
}

function ok(data: any) {
    return { ok: true, data };
}

function fail(error: any, code: any) {
    return { ok: false, error, code };
}
