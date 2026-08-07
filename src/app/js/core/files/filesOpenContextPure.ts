// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

type UnknownRecord = Record<string, unknown>;

export interface FilesOpenContextFilter {
    readonly extension?: string;
    readonly source?: string;
    readonly scopeType?: string;
    readonly tag?: string;
}

export interface FilesOpenContextPreviewFile {
    readonly id: string;
    readonly filename: string;
    readonly extension: string;
    readonly role: string;
    readonly type: string;
    readonly source: string;
    readonly path: string;
}

export interface NormalizedFilesOpenContext {
    readonly hasContext: boolean;
    readonly filter: FilesOpenContextFilter;
    readonly contextLabel: string;
    readonly contextHint: string;
    readonly requestedTags: readonly string[];
    readonly previewFiles: readonly FilesOpenContextPreviewFile[];
}

function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function slug(value: unknown): string {
    return clean(value)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function tag(prefix: string, value: unknown): string {
    const suffix = slug(value);
    return suffix ? `${prefix}:${suffix}` : '';
}

function unique(values: readonly string[]): readonly string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const item = clean(value);
        if (!item || seen.has(item)) continue;
        seen.add(item);
        out.push(item);
    }
    return Object.freeze(out);
}

function extensionFrom(value: unknown): string {
    const explicit = clean(value);
    if (explicit) return explicit.replace(/^\./, '').toLowerCase();
    return '';
}

function pathExtension(pathValue: string): string {
    const match = pathValue.match(/\.([a-z0-9]{1,8})(?:$|[?#])/i);
    return match?.[1] ? match[1].toLowerCase() : '';
}

function normalizePreviewFiles(value: unknown): readonly FilesOpenContextPreviewFile[] {
    const rows = Array.isArray(value) ? value : [];
    const out: FilesOpenContextPreviewFile[] = [];
    const seen = new Set<string>();
    rows.slice(0, 240).forEach((row, index) => {
        if (!isRecord(row)) return;
        const pathValue = clean(row.path) || clean(row.storagePath) || clean(row.url) || clean(row.fileId) || clean(row.id);
        const filename =
            clean(row.filename) || clean(row.name) || clean(row.title) || clean(row.label) || pathValue.split('/').pop() || `Arquivo ${index + 1}`;
        const id = clean(row.id) || clean(row.fileId) || `${index + 1}-${filename}`;
        const key = `${id}:${pathValue || filename}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(
            Object.freeze({
                id,
                filename,
                extension: extensionFrom(row.extension) || pathExtension(filename) || pathExtension(pathValue),
                role: clean(row.role),
                type: clean(row.type) || clean(row.mimeType),
                source: clean(row.source),
                path: pathValue,
            }),
        );
    });
    return Object.freeze(out);
}

export function normalizeFilesOpenContext(input: unknown): NormalizedFilesOpenContext {
    const root = isRecord(input) ? input : {};
    const filter = isRecord(root.filter) ? root.filter : root;
    const explicitTag = clean(filter.tag) || clean(root.tag);
    const course = clean(filter.courseId) || clean(filter.course_id) || clean(filter.course) || clean(root.courseId);
    const collection = clean(filter.collection) || clean(root.collection);
    const purpose = clean(filter.purpose) || clean(root.purpose);
    const deck = clean(filter.deckId) || clean(root.deckId);
    const slide = clean(filter.slideId) || clean(filter.slide) || clean(root.slideId);
    const hasTrainingContext = Boolean(course || collection || purpose || deck || slide || root.training === true);
    const requestedTags = unique([
        explicitTag,
        hasTrainingContext ? 'training' : '',
        tag('course', course),
        tag('collection', collection),
        tag('purpose', purpose),
        tag('deck', deck),
        tag('slide', slide),
    ]);
    const selectedTag = explicitTag || (hasTrainingContext ? 'training' : '');
    const normalizedFilter: FilesOpenContextFilter = Object.freeze({
        ...(clean(filter.extension) ? { extension: clean(filter.extension).toLowerCase() } : {}),
        ...(clean(filter.source) || hasTrainingContext ? { source: clean(filter.source) || 'import' } : {}),
        ...(clean(filter.scopeType) || clean(filter.scope_type) || hasTrainingContext
            ? { scopeType: clean(filter.scopeType) || clean(filter.scope_type) || 'workspace' }
            : {}),
        ...(selectedTag ? { tag: selectedTag } : {}),
    });
    const label = clean(root.label) || clean(filter.label) || (hasTrainingContext ? 'Files da aula' : '');
    const hintParts = unique([
        course ? `curso ${course}` : '',
        collection ? `colecao ${collection}` : '',
        purpose ? `uso ${purpose}` : '',
    ]);
    const previewFiles = normalizePreviewFiles(root.previewFiles || filter.previewFiles || root.contextFiles || filter.contextFiles);
    return Object.freeze({
        hasContext: Boolean(label || Object.keys(normalizedFilter).length || previewFiles.length),
        filter: normalizedFilter,
        contextLabel: label,
        contextHint: clean(root.hint) || clean(filter.hint) || hintParts.join(' · '),
        requestedTags,
        previewFiles,
    });
}
