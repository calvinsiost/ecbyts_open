// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PIPELINE TAG IDENTITY REGISTRY - pure CRUD/state service for tag
   governance (PIPELINE-PACK-CUSTOMIZATION-001 #8; SPEC_PIPELINE_PACK_
   CUSTOMIZATION_WORKBENCH.md secao 10.5 / item G "PipelineTagIdentityRegistry").

   Complementary to _pipelineTagValidatorPure.ts: the validator inspects a
   static snapshot of PipelineTagEntry items and reports duplicate/conflict
   findings. This module is the stateful side — it keeps the canonical tag
   list alive over time: create canonical tags, attach aliases, rename a
   tag while preserving every alias and a change-history trail, and mark a
   tag's lifecycle status (active/obsolete/not-applicable/awaiting-external
   -source). No DOM, no storage, no network, no clock reads other than an
   optional caller-supplied timestamp — fully deterministic and testable
   via node:test.
   ================================================================ */

export type PipelineTagLifecycleStatus =
    | 'active'
    | 'obsolete'
    | 'not-applicable'
    | 'awaiting-external-source';

export type PipelineTagIdentityChangeType = 'created' | 'alias-added' | 'renamed' | 'status-changed';

/**
 * One entry in a tag's change history (spec 10.5: "manter historico de
 * mudancas por tag com data, usuario, fonte e justificativa").
 */
export interface PipelineTagIdentityHistoryEntry {
    type: PipelineTagIdentityChangeType;
    at?: string;
    user?: string;
    source?: string;
    reason?: string;
    detail?: string;
}

/** A canonical tag tracked by the registry, with its aliases and history. */
export interface PipelineTagIdentityItem {
    tag: string;
    status: PipelineTagLifecycleStatus;
    aliases: string[];
    previousTags: string[];
    unit?: string;
    description?: string;
    history: PipelineTagIdentityHistoryEntry[];
}

/** Registry state: canonical tags keyed by normalized tag name. */
export interface PipelineTagIdentityRegistry {
    items: Record<string, PipelineTagIdentityItem>;
}

export interface PipelineTagIdentityOpSuccess {
    ok: true;
    registry: PipelineTagIdentityRegistry;
}

export interface PipelineTagIdentityOpFailure {
    ok: false;
    error: string;
    registry: PipelineTagIdentityRegistry;
}

export type PipelineTagIdentityOpResult = PipelineTagIdentityOpSuccess | PipelineTagIdentityOpFailure;

export interface CreateCanonicalTagInput {
    tag: string;
    source?: string;
    unit?: string;
    description?: string;
    user?: string;
    at?: string;
}

export interface AddAliasInput {
    alias: string;
    aliasOf: string;
    source?: string;
    user?: string;
    at?: string;
    reason?: string;
}

export interface RenameTagInput {
    oldTag: string;
    newTag: string;
    source?: string;
    user?: string;
    at?: string;
    reason?: string;
}

export interface MarkTagStatusInput {
    tag: string;
    status: PipelineTagLifecycleStatus;
    source?: string;
    user?: string;
    at?: string;
    reason?: string;
}

/** Normalizes a tag for lookup/comparison: trims and uppercases. */
function _normalizeTag(tag: string | undefined | null): string {
    return (tag ?? '').trim().toUpperCase();
}

/** Returns an empty registry (no canonical tags registered yet). */
export function createEmptyTagIdentityRegistry(): PipelineTagIdentityRegistry {
    return { items: {} };
}

/** Shallow-clones a registry so callers never mutate the argument. */
function _cloneRegistry(registry: PipelineTagIdentityRegistry): PipelineTagIdentityRegistry {
    const items: Record<string, PipelineTagIdentityItem> = {};
    for (const key of Object.keys(registry.items)) {
        const item = registry.items[key];
        if (!item) continue;
        items[key] = {
            ...item,
            aliases: [...item.aliases],
            previousTags: [...item.previousTags],
            history: [...item.history],
        };
    }
    return { items };
}

function _failure(registry: PipelineTagIdentityRegistry, error: string): PipelineTagIdentityOpFailure {
    return { ok: false, error, registry };
}

/**
 * Builds a history entry, omitting optional fields left `undefined` so
 * the result satisfies `exactOptionalPropertyTypes` without callers
 * having to hand-prune every audit field themselves.
 */
function _makeHistoryEntry(
    type: PipelineTagIdentityChangeType,
    detail: string,
    audit: { at?: string; user?: string; source?: string; reason?: string },
): PipelineTagIdentityHistoryEntry {
    const entry: PipelineTagIdentityHistoryEntry = { type, detail };
    if (audit.at !== undefined) entry.at = audit.at;
    if (audit.user !== undefined) entry.user = audit.user;
    if (audit.source !== undefined) entry.source = audit.source;
    if (audit.reason !== undefined) entry.reason = audit.reason;
    return entry;
}

/**
 * Creates a new canonical tag entry. Fails if the (normalized) tag is
 * already registered, either as a canonical tag or as an existing alias.
 * @param registry Current registry state (not mutated).
 * @param input Tag identity, optional unit/description and audit fields.
 */
export function createCanonicalTag(
    registry: PipelineTagIdentityRegistry,
    input: CreateCanonicalTagInput,
): PipelineTagIdentityOpResult {
    const key = _normalizeTag(input.tag);
    if (!key) return _failure(registry, 'Tag canonica vazia.');
    if (registry.items[key]) {
        return _failure(registry, `Tag canonica "${key}" ja existe no registro.`);
    }
    if (_findOwnerByAlias(registry, key)) {
        return _failure(registry, `"${key}" ja e alias de outra tag canonica.`);
    }
    const next = _cloneRegistry(registry);
    const item: PipelineTagIdentityItem = {
        tag: key,
        status: 'active',
        aliases: [],
        previousTags: [],
        history: [_makeHistoryEntry('created', `Tag canonica "${key}" criada.`, input)],
    };
    if (input.unit !== undefined) item.unit = input.unit;
    if (input.description !== undefined) item.description = input.description;
    next.items[key] = item;
    return { ok: true, registry: next };
}

/** Finds the canonical key owning a given alias, or undefined if none. */
function _findOwnerByAlias(registry: PipelineTagIdentityRegistry, aliasKey: string): string | undefined {
    for (const key of Object.keys(registry.items)) {
        if (registry.items[key]?.aliases.includes(aliasKey)) return key;
    }
    return undefined;
}

/**
 * Adds an alias pointing to an existing canonical tag. Fails when the
 * target canonical tag does not exist, or when the alias is already the
 * canonical tag itself or an alias of another tag.
 * @param registry Current registry state (not mutated).
 * @param input Alias name, target canonical tag and optional audit fields.
 */
export function addAlias(
    registry: PipelineTagIdentityRegistry,
    input: AddAliasInput,
): PipelineTagIdentityOpResult {
    const aliasKey = _normalizeTag(input.alias);
    const targetKey = _normalizeTag(input.aliasOf);
    if (!aliasKey) return _failure(registry, 'Alias vazio.');
    const target = registry.items[targetKey];
    if (!target) {
        return _failure(registry, `Tag canonica "${targetKey}" nao existe; alias nao pode ser criado.`);
    }
    if (registry.items[aliasKey]) {
        return _failure(registry, `"${aliasKey}" ja e uma tag canonica; nao pode virar alias.`);
    }
    const existingOwner = _findOwnerByAlias(registry, aliasKey);
    if (existingOwner) {
        return _failure(registry, `"${aliasKey}" ja e alias de "${existingOwner}".`);
    }
    const next = _cloneRegistry(registry);
    const nextTarget = next.items[targetKey];
    if (!nextTarget) return _failure(registry, `Tag canonica "${targetKey}" nao existe; alias nao pode ser criado.`);
    nextTarget.aliases.push(aliasKey);
    nextTarget.history.push(_makeHistoryEntry('alias-added', `Alias "${aliasKey}" adicionado.`, input));
    return { ok: true, registry: next };
}

/**
 * Renames a canonical tag, preserving every alias and recording the
 * rename in the item's history (old tag is kept in `previousTags`).
 * Fails when the old tag does not exist or the new tag is already taken
 * (as canonical tag or alias).
 * @param registry Current registry state (not mutated).
 * @param input Old/new tag names and optional audit fields/reason.
 */
export function renameTag(
    registry: PipelineTagIdentityRegistry,
    input: RenameTagInput,
): PipelineTagIdentityOpResult {
    const oldKey = _normalizeTag(input.oldTag);
    const newKey = _normalizeTag(input.newTag);
    const current = registry.items[oldKey];
    if (!current) return _failure(registry, `Tag canonica "${oldKey}" nao existe.`);
    if (!newKey) return _failure(registry, 'Nova tag vazia.');
    if (newKey === oldKey) return _failure(registry, 'Nova tag e igual a tag atual.');
    if (registry.items[newKey]) {
        return _failure(registry, `Tag canonica "${newKey}" ja existe.`);
    }
    if (_findOwnerByAlias(registry, newKey)) {
        return _failure(registry, `"${newKey}" ja e alias de outra tag canonica.`);
    }
    const next = _cloneRegistry(registry);
    delete next.items[oldKey];
    next.items[newKey] = {
        ...current,
        tag: newKey,
        previousTags: [...current.previousTags, oldKey],
        history: [
            ...current.history,
            _makeHistoryEntry('renamed', `Tag renomeada de "${oldKey}" para "${newKey}".`, input),
        ],
    };
    return { ok: true, registry: next };
}

/**
 * Marks a canonical tag's lifecycle status (active, obsolete, not-
 * applicable or awaiting-external-source) and appends a history entry.
 * Fails when the tag does not exist.
 * @param registry Current registry state (not mutated).
 * @param input Tag name, new status and optional audit fields/reason.
 */
export function markTagStatus(
    registry: PipelineTagIdentityRegistry,
    input: MarkTagStatusInput,
): PipelineTagIdentityOpResult {
    const key = _normalizeTag(input.tag);
    const current = registry.items[key];
    if (!current) return _failure(registry, `Tag canonica "${key}" nao existe.`);
    const next = _cloneRegistry(registry);
    const nextItem = next.items[key];
    if (!nextItem) return _failure(registry, `Tag canonica "${key}" nao existe.`);
    nextItem.status = input.status;
    nextItem.history.push(
        _makeHistoryEntry('status-changed', `Status alterado para "${input.status}".`, input),
    );
    return { ok: true, registry: next };
}

/** Returns the registered canonical tag items as a plain array (stable order). */
export function listTagIdentities(registry: PipelineTagIdentityRegistry): PipelineTagIdentityItem[] {
    return Object.keys(registry.items)
        .sort()
        .map((key) => registry.items[key])
        .filter((item): item is PipelineTagIdentityItem => Boolean(item));
}
