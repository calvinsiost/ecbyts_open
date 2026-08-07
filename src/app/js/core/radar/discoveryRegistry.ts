// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RADAR DISCOVERY REGISTRY — SPEC_RADAR_GLOBAL_MODEL_DISCOVERY_9_67

   Pure-logic in-memory registry para descoberta global de modelos
   compartilhados. Sem DOM, IDB, Three.js ou fetch.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

/** Comprimento mínimo e máximo do shareCode (alphanum). */
const SHARE_CODE_MIN = 8;
const SHARE_CODE_MAX = 32;

/** Tamanho máximo de tags por entrada. */
const TAGS_MAX = 10;

/** Comprimento máximo de campos textuais. */
const TITLE_MAX = 120;
const OWNER_ALIAS_MAX = 64;
const DESCRIPTION_MAX = 500;

/** Regex para validar shareCode (alfanumérico). */
const SHARE_CODE_RE = /^[A-Za-z0-9]+$/;

interface ModelSummary {
    elementCount: number;
    campaignCount: number;
    hasObservations: boolean;
}

interface DiscoveryEntry {
    shareCode: string;
    title: string;
    ownerAlias: string;
    familyIds: ReadonlyArray<string>;
    tags: ReadonlyArray<string>;
    description: string;
    publishedAt: string;
    expiresAt: string | null;
    modelSummary: Readonly<ModelSummary>;
}

interface DiscoveryRegistry {
    register: (entry: Readonly<DiscoveryEntry>) => Readonly<DiscoveryEntry>;
    unregister: (shareCode: string) => boolean;
    get: (shareCode: string) => Readonly<DiscoveryEntry> | null;
    search: (params?: {
        query?: string;
        tags?: string[];
        familyId?: string;
        limit?: number;
    }) => Array<Readonly<DiscoveryEntry>>;
    listAll: () => Array<Readonly<DiscoveryEntry>>;
    prune: () => number;
    size: () => number;
}

// ──────────────────────────────────────────────────────────────────────
// createDiscoveryEntry
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria e congela uma entrada de descoberta global de modelo.
 */
export function createDiscoveryEntry(fields: any): Readonly<DiscoveryEntry> {
    if (!fields || typeof fields !== 'object') {
        throw new TypeError('createDiscoveryEntry: fields must be an object');
    }

    if (typeof fields.shareCode !== 'string' || !fields.shareCode) {
        throw new TypeError('createDiscoveryEntry: shareCode is required and must be a string');
    }
    if (!SHARE_CODE_RE.test(fields.shareCode)) {
        throw new TypeError('createDiscoveryEntry: shareCode must be alphanumeric');
    }
    if (fields.shareCode.length < SHARE_CODE_MIN) {
        throw new RangeError(`createDiscoveryEntry: shareCode too short (min ${SHARE_CODE_MIN})`);
    }
    if (fields.shareCode.length > SHARE_CODE_MAX) {
        throw new RangeError(`createDiscoveryEntry: shareCode too long (max ${SHARE_CODE_MAX})`);
    }

    if (typeof fields.title !== 'string' || !fields.title.trim()) {
        throw new TypeError('createDiscoveryEntry: title is required and must be a non-empty string');
    }
    if (fields.title.length > TITLE_MAX) {
        throw new RangeError(`createDiscoveryEntry: title too long (max ${TITLE_MAX})`);
    }

    if (typeof fields.ownerAlias !== 'string' || !fields.ownerAlias.trim()) {
        throw new TypeError('createDiscoveryEntry: ownerAlias is required and must be a non-empty string');
    }
    if (fields.ownerAlias.length > OWNER_ALIAS_MAX) {
        throw new RangeError(`createDiscoveryEntry: ownerAlias too long (max ${OWNER_ALIAS_MAX})`);
    }

    if (typeof fields.publishedAt !== 'string' || !fields.publishedAt) {
        throw new TypeError('createDiscoveryEntry: publishedAt is required and must be a string');
    }
    if (isNaN(Date.parse(fields.publishedAt))) {
        throw new TypeError('createDiscoveryEntry: publishedAt must be a valid ISO date string');
    }

    const familyIds = Array.isArray(fields.familyIds)
        ? fields.familyIds.map((f: unknown) => String(f))
        : [];

    const tags = Array.isArray(fields.tags) ? fields.tags.map((t: unknown) => String(t)) : [];
    if (tags.length > TAGS_MAX) {
        throw new RangeError(`createDiscoveryEntry: tags array exceeds max (${TAGS_MAX})`);
    }

    const description = fields.description != null ? String(fields.description) : '';
    if (description.length > DESCRIPTION_MAX) {
        throw new RangeError(`createDiscoveryEntry: description too long (max ${DESCRIPTION_MAX})`);
    }

    let expiresAt: string | null = null;
    if (fields.expiresAt != null) {
        if (typeof fields.expiresAt !== 'string') {
            throw new TypeError('createDiscoveryEntry: expiresAt must be a string or null');
        }
        if (isNaN(Date.parse(fields.expiresAt))) {
            throw new TypeError('createDiscoveryEntry: expiresAt must be a valid ISO date string');
        }
        expiresAt = fields.expiresAt;
    }

    const ms = fields.modelSummary && typeof fields.modelSummary === 'object' ? fields.modelSummary : {};
    const modelSummary = Object.freeze({
        elementCount: typeof ms.elementCount === 'number' ? ms.elementCount : 0,
        campaignCount: typeof ms.campaignCount === 'number' ? ms.campaignCount : 0,
        hasObservations: ms.hasObservations === true,
    });

    return Object.freeze({
        shareCode: fields.shareCode,
        title: fields.title,
        ownerAlias: fields.ownerAlias,
        familyIds: Object.freeze(familyIds),
        tags: Object.freeze(tags),
        description,
        publishedAt: fields.publishedAt,
        expiresAt,
        modelSummary,
    });
}

// ──────────────────────────────────────────────────────────────────────
// scoreEntry
// ──────────────────────────────────────────────────────────────────────

/**
 * Calcula relevância de uma entrada para uma query de texto.
 */
export function scoreEntry(entry: Readonly<DiscoveryEntry>, query: string): number {
    if (!entry || typeof query !== 'string' || !query.trim()) return 0;
    const q = query.trim().toLowerCase();
    const title = (entry.title || '').toLowerCase();
    if (title === q) return 1.0;
    if (title.includes(q)) return 0.8;
    const tagsMatch =
        Array.isArray(entry.tags) && entry.tags.some((t: string) => t.toLowerCase().includes(q));
    if (tagsMatch) return 0.6;
    const desc = (entry.description || '').toLowerCase();
    if (desc.includes(q)) return 0.4;
    return 0;
}

// ──────────────────────────────────────────────────────────────────────
// createDiscoveryRegistry
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria um registry in-memory de descoberta global de modelos.
 */
export function createDiscoveryRegistry(
    opts: { maxEntries?: number; ttlMs?: number } = {},
): DiscoveryRegistry {
    const maxEntries = typeof opts.maxEntries === 'number' ? opts.maxEntries : 500;
    // ttlMs reservado para extensão futura.
    const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : 24 * 3600_000;
    void ttlMs;

    const store: Map<string, Readonly<DiscoveryEntry>> = new Map();

    function isExpired(entry: Readonly<DiscoveryEntry>): boolean {
        if (!entry.expiresAt) return false;
        return Date.parse(entry.expiresAt) < Date.now();
    }

    return {
        register(entry: Readonly<DiscoveryEntry>): Readonly<DiscoveryEntry> {
            if (!entry || typeof entry.shareCode !== 'string') {
                throw new TypeError('register: entry must have a valid shareCode');
            }
            if (!store.has(entry.shareCode) && store.size >= maxEntries) {
                throw new RangeError(`register: registry full (max ${maxEntries} entries)`);
            }
            store.set(entry.shareCode, entry);
            return entry;
        },

        unregister(shareCode: string): boolean {
            return store.delete(shareCode);
        },

        get(shareCode: string): Readonly<DiscoveryEntry> | null {
            return store.get(shareCode) ?? null;
        },

        search({
            query,
            tags: filterTags,
            familyId,
            limit = 50,
        }: { query?: string; tags?: string[]; familyId?: string; limit?: number } = {}): Array<
            Readonly<DiscoveryEntry>
        > {
            const results: Array<{ entry: Readonly<DiscoveryEntry>; score: number }> = [];
            for (const entry of store.values()) {
                if (isExpired(entry)) continue;

                if (familyId && (!Array.isArray(entry.familyIds) || !entry.familyIds.includes(familyId))) {
                    continue;
                }

                if (Array.isArray(filterTags) && filterTags.length > 0) {
                    const entryTags = entry.tags || [];
                    const hasTag = filterTags.some((ft: string) => entryTags.includes(ft));
                    if (!hasTag) continue;
                }

                const score = query ? scoreEntry(entry, query) : 1;
                if (query && score === 0) continue;

                results.push({ entry, score });
            }

            results.sort((a, b) => b.score - a.score);
            return results.slice(0, limit).map((r) => r.entry);
        },

        listAll(): Array<Readonly<DiscoveryEntry>> {
            return Array.from(store.values()).filter((e) => !isExpired(e));
        },

        prune(): number {
            let count = 0;
            for (const [code, entry] of store.entries()) {
                if (isExpired(entry)) {
                    store.delete(code);
                    count++;
                }
            }
            return count;
        },

        size(): number {
            return store.size;
        },
    };
}
