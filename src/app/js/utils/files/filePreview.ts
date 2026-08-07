// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { parseFile } from '../../core/ingestion/parser.js';
import { ERROR_CODE } from './fileConstants.js';

const PREVIEW_ROWS = 20;

/**
 * @param {File} file
 * @param {string} extension
 */
export async function buildPreview(file: any, extension: any) {
    const ext = String(extension || '').toLowerCase();
    if (ext === 'dxf') {
        return ok({ type: 'message', message: 'DXF preview not available yet.' });
    }
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
        return fail('Preview indisponivel para este formato.', ERROR_CODE.PREVIEW_UNAVAILABLE);
    }
    try {
        const parsed = (await parseFile(file) as any);
        const firstSheet = parsed?.sheets?.[0];
        if (!firstSheet) return ok({ type: 'table', headers: [], rows: [] });
        /** @type {string[]} */
        const headers = firstSheet.headers || Object.keys(firstSheet.rows?.[0] || {});
        const rows = (firstSheet.rows || [])
            .slice(0, PREVIEW_ROWS)
            .map((/** @type {Record<string, any>} */ row: any) => headers.map((/** @type {string} */ h: any) => row?.[h] ?? ''));
        return ok({ type: 'table', headers, rows });
    } catch (err) {
        return fail(`Falha ao gerar preview: ${(err as any).message}`, ERROR_CODE.PARSE_FAILED);
    }
}

/** @param {any} data */
function ok(data: any) {
    return { ok: true, data };
}

/**
 * @param {any} error
 * @param {any} code
 */
function fail(error: any, code: any) {
    return { ok: false, error, code };
}
