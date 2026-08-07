// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Pipeline Metadata - Phase 47 (P1-6)
 * Pure metadata registry for ECBT transform pipelines.
 * No browser, DOM, Three.js, or Supabase dependencies.
 */

export type PipelineMetadataCustom = Readonly<Record<string, unknown>>;

export interface PipelineMetadataSpec {
    readonly createdAt?: unknown;
    readonly updatedAt?: unknown;
    readonly author?: unknown;
    readonly description?: unknown;
    readonly tags?: unknown;
    readonly version?: unknown;
    readonly custom?: unknown;
}

export interface PipelineMetadata {
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly author: string;
    readonly description: string;
    readonly tags: readonly string[];
    readonly version: string;
    readonly custom: PipelineMetadataCustom;
    readonly [key: string]: unknown;
}

export type PipelineMetadataPatch = Readonly<Record<string, unknown>>;

export interface PipelineMetadataSummary {
    readonly tagCount: number;
    readonly customCount: number;
    readonly ageMs: number;
    readonly hasAuthor: boolean;
    readonly version?: string;
}

export const RESERVED_KEYS = Object.freeze(['createdAt', 'updatedAt', 'author', 'description', 'tags', 'version'] as const);

export const METADATA_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 47,
    deliveredAt: '2026-05-02',
} as const);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function resolveNow(now: unknown): number {
    return isFiniteNumber(now) ? now : Date.now();
}

function stringTags(value: unknown): readonly string[] {
    return Array.isArray(value) ? Object.freeze(value.filter((tag): tag is string => typeof tag === 'string')) : Object.freeze([]);
}

/** Creates frozen pipeline metadata. */
export function createMetadata(spec: PipelineMetadataSpec | null | undefined = {}, now?: unknown): PipelineMetadata {
    const resolvedNow = resolveNow(now);
    const metadataSpec = isObjectRecord(spec) ? spec : {};
    const custom = isObjectRecord(metadataSpec.custom) ? metadataSpec.custom : {};

    return Object.freeze({
        createdAt: isFiniteNumber(metadataSpec.createdAt) ? metadataSpec.createdAt : resolvedNow,
        updatedAt: isFiniteNumber(metadataSpec.updatedAt) ? metadataSpec.updatedAt : resolvedNow,
        author: typeof metadataSpec.author === 'string' ? metadataSpec.author : '',
        description: typeof metadataSpec.description === 'string' ? metadataSpec.description : '',
        tags: stringTags(metadataSpec.tags),
        version: typeof metadataSpec.version === 'string' ? metadataSpec.version : '0.0.0',
        custom: Object.freeze({ ...custom }),
    });
}

/** Shallow-merges a metadata patch and bumps updatedAt. */
export function updateMetadata(
    meta: PipelineMetadata | null | undefined,
    patch: unknown,
    now?: unknown,
): PipelineMetadata | null | undefined {
    if (!meta) return meta;
    if (!isObjectRecord(patch)) return meta;

    const resolvedNow = resolveNow(now);
    const next: Record<string, unknown> = { ...meta, updatedAt: resolvedNow };

    for (const [key, value] of Object.entries(patch)) {
        if (key === 'createdAt') continue;
        if (key === 'tags' && Array.isArray(value)) {
            next.tags = stringTags(value);
            continue;
        }
        if (key === 'custom' && isObjectRecord(value)) {
            next.custom = Object.freeze({ ...meta.custom, ...value });
            continue;
        }
        next[key] = value;
    }

    return Object.freeze(next) as PipelineMetadata;
}

/** Adds a tag idempotently. */
export function addTag(
    meta: PipelineMetadata | null | undefined,
    tag: unknown,
    now?: unknown,
): PipelineMetadata | null | undefined {
    if (!meta || typeof tag !== 'string' || !tag.trim()) return meta;
    if (meta.tags.includes(tag)) return meta;
    return updateMetadata(meta, { tags: [...meta.tags, tag] }, now);
}

/** Removes a tag. */
export function removeTag(
    meta: PipelineMetadata | null | undefined,
    tag: unknown,
    now?: unknown,
): PipelineMetadata | null | undefined {
    if (!meta || typeof tag !== 'string') return meta;
    if (!meta.tags.includes(tag)) return meta;
    return updateMetadata(meta, { tags: meta.tags.filter((entry) => entry !== tag) }, now);
}

/** Sets a non-reserved custom field. */
export function setCustom(
    meta: PipelineMetadata | null | undefined,
    key: unknown,
    value: unknown,
    now?: unknown,
): PipelineMetadata | null | undefined {
    if (!meta || typeof key !== 'string' || !key.trim()) return meta;
    if (isReservedKey(key)) return meta;
    return updateMetadata(meta, { custom: { ...meta.custom, [key]: value } }, now);
}

/** Checks whether a metadata key is reserved. */
export function isReservedKey(key: unknown): boolean {
    return typeof key === 'string' && (RESERVED_KEYS as readonly string[]).includes(key);
}

/** Merges two metadata values; b overwrites a and the oldest createdAt wins. */
export function mergeMetadata(
    a: PipelineMetadata | null | undefined,
    b: PipelineMetadata | null | undefined,
    now?: unknown,
): PipelineMetadata | null | undefined {
    if (!a) return b;
    if (!b) return a;

    const resolvedNow = resolveNow(now);
    return Object.freeze({
        createdAt: Math.min(a.createdAt || resolvedNow, b.createdAt || resolvedNow),
        updatedAt: resolvedNow,
        author: b.author || a.author,
        description: b.description || a.description,
        tags: Object.freeze(Array.from(new Set([...(a.tags || []), ...(b.tags || [])]))),
        version: b.version || a.version,
        custom: Object.freeze({ ...(a.custom || {}), ...(b.custom || {}) }),
    });
}

/** Summarizes metadata counters and flags. */
export function summarizeMetadata(meta: PipelineMetadata | null | undefined): PipelineMetadataSummary {
    const empty = { tagCount: 0, customCount: 0, ageMs: 0, hasAuthor: false };
    if (!meta) return empty;

    return Object.freeze({
        tagCount: (meta.tags || []).length,
        customCount: Object.keys(meta.custom || {}).length,
        ageMs: Number.isFinite(meta.updatedAt) && Number.isFinite(meta.createdAt) ? meta.updatedAt - meta.createdAt : 0,
        hasAuthor: !!meta.author,
        version: meta.version || '0.0.0',
    });
}

export const pipelineMetadataMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 47,
    deliveredAt: '2026-05-02',
    exports: [
        'RESERVED_KEYS',
        'METADATA_META',
        'createMetadata',
        'updateMetadata',
        'addTag',
        'removeTag',
        'setCustom',
        'isReservedKey',
        'mergeMetadata',
        'summarizeMetadata',
    ],
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
} as const);
