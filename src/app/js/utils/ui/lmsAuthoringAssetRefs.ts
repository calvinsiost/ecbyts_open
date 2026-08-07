// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import type {
    TrainingAssetManifestAsset,
    TrainingAssetManifestType,
} from '../../core/training/trainingAssetManifestPure.js';

export function smallStableHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}

export function normalizeAssetRef(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/^<|>$/g, '') : '';
}

export function assetFileName(ref: string): string {
    const clean = ref.split(/[?#]/)[0] || '';
    return clean.split('/').filter(Boolean).pop() || '';
}

export function assetIdForRef(ref: string, lessonIndex: number, assetIndex: number): string {
    if (ref.startsWith('data:')) return `embedded-slide-${lessonIndex}-${smallStableHash(ref.slice(0, 2048))}`;
    const fileName = assetFileName(ref).replace(/[^a-zA-Z0-9._-]+/g, '-');
    return fileName ? `asset:${fileName}` : `asset:slide-${lessonIndex}-${assetIndex + 1}`;
}

export function assetTypeForRef(ref: string): TrainingAssetManifestType {
    const lower = ref.toLowerCase();
    if (lower.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|svg)([?#].*)?$/.test(lower)) return 'image';
    if (lower.startsWith('data:video/') || /\.(mp4|mov|webm|m4v)([?#].*)?$/.test(lower)) return 'video';
    if (lower.startsWith('data:audio/') || /\.(mp3|wav|ogg|m4a)([?#].*)?$/.test(lower)) return 'audio';
    if (/\.(pdf|pptx?|docx?|xlsx?|csv|json)([?#].*)?$/.test(lower)) return 'document';
    return 'other';
}

export function assetOriginPatch(ref: string): Pick<
    TrainingAssetManifestAsset,
    'origin' | 'localPath' | 'filesPath' | 'supabasePath' | 'path'
> {
    const lower = ref.toLowerCase();
    if (lower.startsWith('supabase://') || lower.includes('/storage/v1/object')) {
        return { origin: 'supabase', supabasePath: ref };
    }
    if (lower.startsWith('files://') || lower.startsWith('/files/') || lower.includes('/files/')) {
        return { origin: 'files', filesPath: ref };
    }
    return { origin: 'local', localPath: ref.startsWith('data:') ? 'embedded-data-uri' : ref, path: ref };
}

export function looksLikeAssetRef(ref: string): boolean {
    const lower = ref.toLowerCase();
    return (
        lower.startsWith('data:') ||
        lower.startsWith('files://') ||
        lower.startsWith('supabase://') ||
        lower.includes('/storage/v1/object') ||
        lower.includes('/files/') ||
        lower.startsWith('/') ||
        lower.startsWith('./') ||
        lower.startsWith('../') ||
        /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|m4v|mp3|wav|ogg|m4a|pdf|pptx?|docx?|xlsx?|csv|json)([?#].*)?$/.test(lower)
    );
}

export function markdownAssetRefs(markdown: unknown): string[] {
    const text = typeof markdown === 'string' ? markdown : '';
    const refs = new Set<string>();
    const imageRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    const mediaRegex = /<(?:img|video|source|audio)\b[^>]*\bsrc=["']([^"']+)["']/gi;
    const linkRegex = /\[[^\]]+]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    for (const regex of [imageRegex, mediaRegex, linkRegex]) {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text))) {
            const ref = normalizeAssetRef(match[1]);
            if (ref && (regex !== linkRegex || looksLikeAssetRef(ref))) refs.add(ref);
        }
    }
    return Array.from(refs);
}

export function firstMarkdownImageSrc(markdown: string): string | null {
    const match = /!\[[^\]]*\]\(([^)]+)\)/.exec(String(markdown || ''));
    return match ? (match[1] ?? null) : null;
}
