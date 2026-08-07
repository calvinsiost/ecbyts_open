// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
/* ================================================================
   LIBRARIES PREVIEW PURE — normalização e classificação de previews
   de listings do marketplace.

   Lógica pura extraída de libraries.ts (ARCH-MONOLITH-ATOMIZATION-001):
   - normalizeListingPreview: extrai campos de preview de um item de
     listing (caminho/mime/tamanho do arquivo de preview e do principal).
   - marketPreviewKind: classifica o tipo de mídia (imagem/PDF/CSV/JSON/
     ZIP/arquivo) a partir do mime + caminho, devolvendo ícone + rótulo.
   - marketImagePreviewSrc: deriva uma URL de imagem segura para uso em
     <img src> (aceita data:image e http(s) com extensão/mime de imagem).

   Sem DOM, sem state mutável, sem efeitos colaterais. Todas as funções
   recebem dados e retornam dados/strings determinísticos.
   ================================================================ */

export interface NormalizedListingPreview {
    preview_file_path: string;
    preview_file_mime: string;
    preview_file_size_bytes: number;
    main_file_mime: string;
    main_file_size_bytes: number;
}

export interface MarketPreviewKind {
    icon: string;
    label: string;
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

export function normalizeListingPreview(item: any): NormalizedListingPreview {
    const version = (item && item.active_version_data) || {};
    return {
        preview_file_path: pickStringField(item, version, 'preview_file_path'),
        preview_file_mime: pickLowerStringField(item, version, 'preview_file_mime'),
        preview_file_size_bytes: pickNumberField(item, version, 'preview_file_size_bytes'),
        main_file_mime: pickLowerStringField(item, version, 'main_file_mime'),
        main_file_size_bytes: pickNumberField(item, version, 'main_file_size_bytes'),
    };
}

export function marketPreviewKind(mime: any, path: any): MarketPreviewKind {
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

export function marketImagePreviewSrc(path: any, mime: any): string {
    const safePath = String(path || '').trim();
    const safeMime = String(mime || '').toLowerCase();
    if (!safePath)
        return '';
    if (/^data:image\//i.test(safePath))
        return safePath;
    if (!/^https?:\/\//i.test(safePath))
        return '';
    if (safeMime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(safePath))
        return safePath;
    return '';
}
