// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TRAINING ASSET MANIFEST (pure)

   Complemento ao trainingAssetReadinessPure: este modulo nao decide se a
   aula esta pronta. Ele consolida o manifesto de assets do curso/deck para
   deixar claro quais arquivos pertencem a qual slide/licao, qual origem eles
   ja possuem (local, Files, Supabase) e o que ainda precisa de upload.
   ================================================================ */

export type TrainingAssetManifestOrigin = 'local' | 'files' | 'supabase';

export type TrainingAssetManifestType =
    | 'course'
    | 'deck'
    | 'lesson'
    | 'slide'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'data'
    | 'other';

export interface TrainingAssetManifestPosition {
    readonly id?: string;
    readonly index?: number;
    readonly title?: string;
}

export interface TrainingAssetManifestAsset {
    readonly assetId?: string;
    readonly type?: TrainingAssetManifestType;
    readonly origin?: TrainingAssetManifestOrigin | readonly TrainingAssetManifestOrigin[];
    readonly required?: boolean;
    readonly hash?: string;
    readonly path?: string;
    readonly localPath?: string;
    readonly filesPath?: string;
    readonly supabasePath?: string;
    readonly lessonId?: string;
    readonly lessonIndex?: number;
    readonly lessonTitle?: string;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly slideTitle?: string;
    readonly label?: string;
}

export interface TrainingAssetManifestInput {
    readonly assets: readonly TrainingAssetManifestAsset[];
}

export interface TrainingAssetManifestItem {
    readonly assetId: string;
    readonly type: TrainingAssetManifestType;
    readonly origins: readonly TrainingAssetManifestOrigin[];
    readonly primaryOrigin: TrainingAssetManifestOrigin;
    readonly required: boolean;
    readonly needsUpload: boolean;
    readonly uploadMissingReason?: string;
    readonly hash?: string;
    readonly path?: string;
    readonly localPath?: string;
    readonly filesPath?: string;
    readonly supabasePath?: string;
    readonly lesson?: TrainingAssetManifestPosition;
    readonly slide?: TrainingAssetManifestPosition;
    readonly label?: string;
    readonly sourceIndexes: readonly number[];
}

export interface TrainingAssetManifestTeacherSummary {
    readonly message: string;
    readonly totalAssets: number;
    readonly requiredAssets: number;
    readonly optionalAssets: number;
    readonly remoteRequiredAssets: number;
    readonly localOnlyRequiredAssets: number;
    readonly missingUploadAssetIds: readonly string[];
    readonly byOrigin: Readonly<Record<TrainingAssetManifestOrigin, number>>;
}

export interface TrainingAssetManifest {
    readonly items: readonly TrainingAssetManifestItem[];
    readonly teacherSummary: TrainingAssetManifestTeacherSummary;
}

interface MutableManifestItem {
    assetId: string;
    type: TrainingAssetManifestType;
    origins: TrainingAssetManifestOrigin[];
    primaryOrigin: TrainingAssetManifestOrigin;
    required: boolean;
    needsUpload: boolean;
    uploadMissingReason?: string;
    hash?: string;
    path?: string;
    localPath?: string;
    filesPath?: string;
    supabasePath?: string;
    lesson?: TrainingAssetManifestPosition;
    slide?: TrainingAssetManifestPosition;
    label?: string;
    sourceIndexes: number[];
}

const ORIGIN_ORDER: readonly TrainingAssetManifestOrigin[] = ['local', 'files', 'supabase'];
const ORIGIN_RANK: Readonly<Record<TrainingAssetManifestOrigin, number>> = {
    local: 0,
    files: 1,
    supabase: 2,
};

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeType(value: unknown): TrainingAssetManifestType {
    const normalized = normalizeString(value).toLowerCase();
    const allowed: readonly TrainingAssetManifestType[] = [
        'course',
        'deck',
        'lesson',
        'slide',
        'image',
        'video',
        'audio',
        'document',
        'data',
        'other',
    ];
    return allowed.includes(normalized as TrainingAssetManifestType)
        ? (normalized as TrainingAssetManifestType)
        : 'other';
}

function normalizeIndex(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeOrigin(value: unknown): TrainingAssetManifestOrigin | null {
    const normalized = normalizeString(value).toLowerCase();
    if (normalized === 'local' || normalized === 'files' || normalized === 'supabase') {
        return normalized;
    }
    return null;
}

function stableOrigins(values: readonly TrainingAssetManifestOrigin[]): TrainingAssetManifestOrigin[] {
    const seen = new Set<TrainingAssetManifestOrigin>();
    for (const value of values) {
        seen.add(value);
    }
    return ORIGIN_ORDER.filter((origin) => seen.has(origin));
}

function originFromPath(pathValue: string): TrainingAssetManifestOrigin {
    const lower = pathValue.toLowerCase();
    if (lower.startsWith('supabase://') || lower.includes('/storage/v1/object')) {
        return 'supabase';
    }
    if (lower.startsWith('files://') || lower.startsWith('/files/') || lower.includes('/files/')) {
        return 'files';
    }
    return 'local';
}

function inferOrigins(asset: TrainingAssetManifestAsset): TrainingAssetManifestOrigin[] {
    const origins: TrainingAssetManifestOrigin[] = [];
    const explicitOrigins = Array.isArray(asset.origin) ? asset.origin : [asset.origin];
    for (const origin of explicitOrigins) {
        const normalized = normalizeOrigin(origin);
        if (normalized) {
            origins.push(normalized);
        }
    }

    if (normalizeString(asset.localPath)) origins.push('local');
    if (normalizeString(asset.filesPath)) origins.push('files');
    if (normalizeString(asset.supabasePath)) origins.push('supabase');

    const genericPath = normalizeString(asset.path);
    if (genericPath) {
        origins.push(originFromPath(genericPath));
    }

    return stableOrigins(origins.length > 0 ? origins : ['local']);
}

function choosePrimaryOrigin(origins: readonly TrainingAssetManifestOrigin[]): TrainingAssetManifestOrigin {
    return [...origins].sort((a, b) => ORIGIN_RANK[b] - ORIGIN_RANK[a])[0] || 'local';
}

function choosePath(
    item: Pick<MutableManifestItem, 'supabasePath' | 'filesPath' | 'localPath' | 'path'>,
): string | undefined {
    return item.supabasePath || item.filesPath || item.localPath || item.path;
}

function hasRemoteOrigin(origins: readonly TrainingAssetManifestOrigin[]): boolean {
    return origins.includes('files') || origins.includes('supabase');
}

function needsUpload(required: boolean, origins: readonly TrainingAssetManifestOrigin[]): boolean {
    return required && !hasRemoteOrigin(origins);
}

function pluralize(value: number, singular: string, plural: string): string {
    return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

function topAssetList(assetIds: readonly string[]): string {
    const visible = assetIds.slice(0, 3);
    const remainder = assetIds.length - visible.length;
    if (remainder <= 0) {
        return visible.join(', ');
    }
    return `${visible.join(', ')} e mais ${remainder}`;
}

function buildPosition(id: unknown, index: unknown, title: unknown): TrainingAssetManifestPosition | undefined {
    const normalizedId = normalizeString(id);
    const normalizedIndex = normalizeIndex(index);
    const normalizedTitle = normalizeString(title);
    if (!normalizedId && typeof normalizedIndex !== 'number' && !normalizedTitle) {
        return undefined;
    }
    const out: { id?: string; index?: number; title?: string } = {};
    if (normalizedId) out.id = normalizedId;
    if (typeof normalizedIndex === 'number') out.index = normalizedIndex;
    if (normalizedTitle) out.title = normalizedTitle;
    return Object.freeze(out);
}

function mergePosition(
    current: TrainingAssetManifestPosition | undefined,
    next: TrainingAssetManifestPosition | undefined,
): TrainingAssetManifestPosition | undefined {
    if (!current) return next;
    if (!next) return current;
    const out: { id?: string; index?: number; title?: string } = {};
    const id = current.id || next.id;
    const index = typeof current.index === 'number' ? current.index : next.index;
    const title = current.title || next.title;
    if (id) out.id = id;
    if (typeof index === 'number') out.index = index;
    if (title) out.title = title;
    return Object.freeze(out);
}

function assetKey(asset: TrainingAssetManifestAsset, index: number): string {
    const assetId = normalizeString(asset.assetId);
    if (assetId) return assetId;

    const hash = normalizeString(asset.hash);
    if (hash) return `hash:${hash}`;

    const pathValue =
        normalizeString(asset.supabasePath) ||
        normalizeString(asset.filesPath) ||
        normalizeString(asset.localPath) ||
        normalizeString(asset.path);
    if (pathValue) return `path:${pathValue}`;

    return `asset-${index + 1}`;
}

function makeItem(asset: TrainingAssetManifestAsset, index: number): MutableManifestItem {
    const origins = inferOrigins(asset);
    const required = asset.required === true;
    const localPath = normalizeString(asset.localPath);
    const filesPath = normalizeString(asset.filesPath);
    const supabasePath = normalizeString(asset.supabasePath);
    const genericPath = normalizeString(asset.path);
    const item: MutableManifestItem = {
        assetId: assetKey(asset, index),
        type: normalizeType(asset.type),
        origins,
        primaryOrigin: choosePrimaryOrigin(origins),
        required,
        needsUpload: needsUpload(required, origins),
        sourceIndexes: [index],
    };

    const hash = normalizeString(asset.hash);
    const label = normalizeString(asset.label);
    if (hash) item.hash = hash;
    if (localPath) item.localPath = localPath;
    if (filesPath) item.filesPath = filesPath;
    if (supabasePath) item.supabasePath = supabasePath;
    if (genericPath) item.path = genericPath;
    if (label) item.label = label;

    const pathValue = choosePath(item);
    const lesson = buildPosition(asset.lessonId, asset.lessonIndex, asset.lessonTitle);
    const slide = buildPosition(asset.slideId, asset.slideIndex, asset.slideTitle);
    if (pathValue) item.path = pathValue;
    if (lesson) item.lesson = lesson;
    if (slide) item.slide = slide;
    if (item.needsUpload) {
        item.uploadMissingReason = 'required-asset-not-in-files-or-supabase';
    }
    return item;
}

function mergeItemType(current: MutableManifestItem, next: MutableManifestItem): void {
    if (current.type === 'other' && next.type !== 'other') {
        current.type = next.type;
    }
}

function mergeItemOrigins(current: MutableManifestItem, next: MutableManifestItem): void {
    current.required = current.required || next.required;
    current.origins = stableOrigins([...current.origins, ...next.origins]);
    current.primaryOrigin = choosePrimaryOrigin(current.origins);
}

function mergeItemPaths(current: MutableManifestItem, next: MutableManifestItem): void {
    const hash = current.hash || next.hash;
    if (hash) current.hash = hash;

    const localPath = current.localPath || next.localPath;
    if (localPath) current.localPath = localPath;

    const filesPath = current.filesPath || next.filesPath;
    if (filesPath) current.filesPath = filesPath;

    const supabasePath = current.supabasePath || next.supabasePath;
    if (supabasePath) current.supabasePath = supabasePath;

    const pathValue = choosePath(current) || choosePath(next);
    if (pathValue) current.path = pathValue;
}

function mergeItemPositions(current: MutableManifestItem, next: MutableManifestItem): void {
    const lesson = mergePosition(current.lesson, next.lesson);
    if (lesson) current.lesson = lesson;

    const slide = mergePosition(current.slide, next.slide);
    if (slide) current.slide = slide;
}

function mergeItemLabel(current: MutableManifestItem, next: MutableManifestItem): void {
    const label = current.label || next.label;
    if (label) current.label = label;
}

function syncUploadMissingReason(current: MutableManifestItem): void {
    current.needsUpload = needsUpload(current.required, current.origins);
    if (current.needsUpload) {
        current.uploadMissingReason = 'required-asset-not-in-files-or-supabase';
    } else {
        delete current.uploadMissingReason;
    }
}

function mergeItem(current: MutableManifestItem, next: MutableManifestItem): MutableManifestItem {
    current.sourceIndexes.push(...next.sourceIndexes);
    mergeItemType(current, next);
    mergeItemOrigins(current, next);
    mergeItemPaths(current, next);
    mergeItemPositions(current, next);
    mergeItemLabel(current, next);
    syncUploadMissingReason(current);
    return current;
}

function sortManifestItems(items: readonly MutableManifestItem[]): MutableManifestItem[] {
    const required = items.filter((item) => item.required);
    const optional = items.filter((item) => !item.required);
    return [...required, ...optional];
}

function freezeItem(item: MutableManifestItem): TrainingAssetManifestItem {
    return Object.freeze({
        assetId: item.assetId,
        type: item.type,
        origins: Object.freeze([...item.origins]),
        primaryOrigin: item.primaryOrigin,
        required: item.required,
        needsUpload: item.needsUpload,
        ...(item.uploadMissingReason ? { uploadMissingReason: item.uploadMissingReason } : {}),
        ...(item.hash ? { hash: item.hash } : {}),
        ...(item.path ? { path: item.path } : {}),
        ...(item.localPath ? { localPath: item.localPath } : {}),
        ...(item.filesPath ? { filesPath: item.filesPath } : {}),
        ...(item.supabasePath ? { supabasePath: item.supabasePath } : {}),
        ...(item.lesson ? { lesson: Object.freeze({ ...item.lesson }) } : {}),
        ...(item.slide ? { slide: Object.freeze({ ...item.slide }) } : {}),
        ...(item.label ? { label: item.label } : {}),
        sourceIndexes: Object.freeze([...item.sourceIndexes]),
    });
}

function summarizeItems(items: readonly TrainingAssetManifestItem[]): TrainingAssetManifestTeacherSummary {
    const missingUploadAssetIds = items.filter((item) => item.needsUpload).map((item) => item.assetId);
    const requiredAssets = items.filter((item) => item.required).length;
    const totalAssets = items.length;
    const remoteRequiredAssets = items.filter((item) => item.required && hasRemoteOrigin(item.origins)).length;
    const byOrigin = {
        local: items.filter((item) => item.origins.includes('local')).length,
        files: items.filter((item) => item.origins.includes('files')).length,
        supabase: items.filter((item) => item.origins.includes('supabase')).length,
    };

    let message = 'Nenhum asset registrado para a aula.';
    if (missingUploadAssetIds.length > 0) {
        message = `Falta upload de ${pluralize(
            missingUploadAssetIds.length,
            'asset obrigatorio',
            'assets obrigatorios',
        )}: ${topAssetList(missingUploadAssetIds)}. Envie para Files/Supabase antes da aula.`;
    } else if (requiredAssets > 0) {
        message = `Assets obrigatorios prontos: ${pluralize(
            remoteRequiredAssets,
            'item com origem em Files/Supabase',
            'itens com origem em Files/Supabase',
        )}.`;
    } else if (totalAssets > 0) {
        message = `Manifesto de assets sem obrigatorios: ${pluralize(totalAssets, 'item catalogado', 'itens catalogados')}.`;
    }

    return Object.freeze({
        message,
        totalAssets,
        requiredAssets,
        optionalAssets: totalAssets - requiredAssets,
        remoteRequiredAssets,
        localOnlyRequiredAssets: missingUploadAssetIds.length,
        missingUploadAssetIds: Object.freeze(missingUploadAssetIds),
        byOrigin: Object.freeze(byOrigin),
    });
}

function assetsFromInput(
    input: TrainingAssetManifestInput | readonly TrainingAssetManifestAsset[],
): readonly TrainingAssetManifestAsset[] {
    if (Array.isArray(input)) {
        return input;
    }
    if (input && Array.isArray((input as TrainingAssetManifestInput).assets)) {
        return (input as TrainingAssetManifestInput).assets;
    }
    return [];
}

/** Cria um manifesto deduplicado e ordenado de assets do curso/deck, sem IO. */
export function buildTrainingAssetManifest(
    input: TrainingAssetManifestInput | readonly TrainingAssetManifestAsset[],
): TrainingAssetManifest {
    const assets = assetsFromInput(input);
    const byKey = new Map<string, MutableManifestItem>();

    assets.forEach((asset: TrainingAssetManifestAsset, index: number) => {
        const item = makeItem(asset || {}, index);
        const current = byKey.get(item.assetId);
        if (current) {
            mergeItem(current, item);
        } else {
            byKey.set(item.assetId, item);
        }
    });

    const items = Object.freeze(sortManifestItems(Array.from(byKey.values())).map(freezeItem));
    return Object.freeze({
        items,
        teacherSummary: summarizeItems(items),
    });
}

/** Resumo curto para professor, reaproveitavel por UI/glue sem recalcular nada. */
export function summarizeTrainingAssetManifestForTeacher(
    manifestOrItems: TrainingAssetManifest | readonly TrainingAssetManifestItem[],
): string {
    if (Array.isArray(manifestOrItems)) {
        return summarizeItems(manifestOrItems).message;
    }
    return (manifestOrItems as TrainingAssetManifest).teacherSummary.message;
}
