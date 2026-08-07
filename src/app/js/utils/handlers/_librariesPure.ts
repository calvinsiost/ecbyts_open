// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave IIII1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free formatters + classifiers from handlers/libraries.js
// (#4 monolito 2819 LOC). Pure: zero document/window/state refs.

/**
 * Format ISO date / Date / timestamp as short pt-BR locale date.
 *
 * @param {string|number|Date|null|undefined} bytes
 * @returns {string} '-' if invalid, else 'dd/mm/yyyy'
 */
import { formatBytes as _formatBytesCanonical } from '../helpers/formatBytes.js';
import { formatDate as _formatDateCanonical } from '../helpers/formatDate.js';

export function formatShortDate(value: any) {
    return _formatDateCanonical(value, { locale: 'pt-BR', unknownLabel: '-' });
}

/**
 * Format bytes as compact size string (B / KB / MB).
 * Backward-compat wrapper: '-' for invalid OR zero (legacy libraries behavior).
 *
 * @param {number|string|null|undefined} bytes
 * @returns {string} '-' se invalid/zero, else 'NN.N MB' / 'NN KB' / 'NN B'
 */
export function formatBytes(bytes: any) {
    return _formatBytesCanonical(bytes, { unknownLabel: '-', maxUnit: 'MB', zeroAsUnknown: true });
}

function pickStringField(item: any, version: Record<string, any>, key: string): string {
    return String((item && item[key]) || version[key] || '').trim();
}

function pickLowerStringField(item: any, version: Record<string, any>, key: string): string {
    return String((item && item[key]) || version[key] || '')
        .trim()
        .toLowerCase();
}

function pickNumberField(item: any, version: Record<string, any>, key: string): number {
    return Number((item && item[key]) || version[key] || 0);
}

/**
 * Normalize marketplace listing preview metadata (preview + main file).
 * Pure: dict normalization, fallback chain item → active_version_data.
 *
 * @param {{active_version_data?:Record<string,any>, preview_file_path?:string, preview_file_mime?:string, preview_file_size_bytes?:number, main_file_mime?:string, main_file_size_bytes?:number}|null|undefined} item
 * @returns {{preview_file_path:string, preview_file_mime:string, preview_file_size_bytes:number, main_file_mime:string, main_file_size_bytes:number}}
 */
export function normalizeListingPreview(item: any) {
    const version = (item && item.active_version_data) || {};
    return {
        preview_file_path: pickStringField(item, version, 'preview_file_path'),
        preview_file_mime: pickLowerStringField(item, version, 'preview_file_mime'),
        preview_file_size_bytes: pickNumberField(item, version, 'preview_file_size_bytes'),
        main_file_mime: pickLowerStringField(item, version, 'main_file_mime'),
        main_file_size_bytes: pickNumberField(item, version, 'main_file_size_bytes'),
    };
}

/**
 * Classify market preview file by MIME + extension into {icon, label} pair.
 *
 * @param {string} mime
 * @param {string} path
 * @returns {{icon:string, label:string}}
 */
export function classifyMarketPreviewKind( mime: any, path: any) {
    const safeMime = String(mime || '').toLowerCase();
    const safePath = String(path || '').toLowerCase();
    if (safeMime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/.test(safePath)) {
        return { icon: 'image', label: 'Imagem' };
    }
    if (safeMime.includes('pdf') || safePath.endsWith('.pdf')) {
        return { icon: 'file-text', label: 'PDF' };
    }
    if (safeMime.includes('csv') || safePath.endsWith('.csv')) {
        return { icon: 'table', label: 'CSV' };
    }
    if (safeMime.includes('json') || safePath.endsWith('.json')) {
        return { icon: 'braces', label: 'JSON' };
    }
    if (safeMime.includes('zip') || safePath.endsWith('.zip')) {
        return { icon: 'package', label: 'ZIP' };
    }
    return { icon: 'file-text', label: 'Arquivo' };
}
