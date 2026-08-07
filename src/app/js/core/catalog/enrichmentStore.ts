/**
 * enrichmentStore.js - IDB-backed Store de Enriquecimento (P1-26 / 9.68)
 *
 * Persiste registros de enriquecimento via IndexedDB (idbSet/idbGet).
 * Operações são idempotentes por elementId+source: novo registro substitui o anterior.
 *
 * @module enrichmentStore
 * @license AGPL-3.0-only
 */
// @ts-check
import { idbSet, idbGet, idbDelete } from '../../utils/storage/idbStore.js';
/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {{ elementId: string, source: string, data: object, fetchedAt: number }} EnrichmentRecord */
/** @typedef {{ [itemId: string]: AnyRecord[] }} EnrichmentSnapshot */
/** @typedef {{ contributions?: AnyRecord[], versions?: AnyRecord[], auditTrail?: AnyRecord[] }} ModerationSnapshot */
/** @typedef {{ id?: string, actorId?: string|null, contributionId?: string|null, featureId?: string|null, version?: number|null, status?: string|null, createdAt?: string, metadata?: AnyRecord }} AuditFields */
/** @typedef {{ storageKey?: string, get?: (key: string) => any, set?: (key: string, value: any) => any, delete?: (key: string) => any, now?: () => string, snapshot?: ModerationSnapshot }} ModerationOptions */
/** Chave IDB para todos os registros de enriquecimento */
const KEY = 'ecbyts-catalog-enrichments';
export const LIBRARY_COMMUNITY_MODERATION_STATE_KEY = 'ecbyts-library-community-moderation-state';
/**
 * Salva (upsert) um registro de enriquecimento.
 * Um registro existente com o mesmo elementId+source é substituído.
 *
 * @param {{ elementId: string, source: string, data: object, fetchedAt: number }} record
 * @returns {Promise<void>}
 */
export async function saveEnrichment(record: any) {
    const all = await loadEnrichments();
    const filtered = all.filter((r: any) => !(r.elementId === record.elementId && r.source === record.source));
    await idbSet(KEY, [...filtered, record]);
}
/**
 * Carrega todos os registros de enriquecimento armazenados.
 * Returns all stored enrichment records (empty array if none).
 *
 * @returns {Promise<Array<{ elementId: string, source: string, data: object, fetchedAt: number }>>}
 */
export async function loadEnrichments() {
    return (await idbGet(KEY)) ?? [];
}
/**
 * Retorna todos os registros de enriquecimento de um elemento específico.
 * Returns enrichment records for a single element across all sources.
 *
 * @param {string} elementId
 * @returns {Promise<Array<{ elementId: string, source: string, data: object, fetchedAt: number }>>}
 */
export async function getEnrichmentForElement(elementId: any) {
    const all = await loadEnrichments();
    return all.filter((r: any) => r.elementId === elementId);
}
/**
 * Remove todos os registros de enriquecimento (reset de store).
 * Clears the entire enrichment store - use with caution.
 *
 * @returns {Promise<void>}
 */
export async function clearEnrichments() {
    await idbSet(KEY, []);
}
// ───────────────────────────────────────────────────────────────────────
// In-memory community enrichment store (SPEC 9.68 / P1-26)
// Distinct from the IDB-backed store above (which targets element-level
// external enrichment). This is for library marketplace community
// contributions - pure logic, no IDB, suitable for both browser memory
// and Node test environments.
// ───────────────────────────────────────────────────────────────────────
import { createEnrichmentEntry, aggregateEnrichments, applyApprovedContributionToLibraryVersion, applyCommunityReviewDecision, createLibraryCommunityContribution, createLibraryFeatureVersion, LIBRARY_FEATURE_VERSION_CHANGE_TYPES, } from './enrichmentSchema.js';
/**
 * Cria um store em memória de enrichment entries por libraryItemId.
 * Each entry must pass createEnrichmentEntry() validation (called inside add).
 *
 * Options:
 *   maxPerItem: max number of entries per libraryItemId (default 100)
 *
 * Returns an object with methods:
 *   - add(fields): validates + adds entry; throws RangeError if over maxPerItem
 *   - getByItem(libraryItemId): returns array of entries (or [])
 *   - removeByContributor(libraryItemId, contributorAlias): returns true if removed
 *   - size(): total entries across all items
 *   - export(): snapshot copy of internal map (mutation safe)
 *   - getAggregate(libraryItemId): null if unknown, else aggregateEnrichments result
 *
 * @param {{ maxPerItem?: number }} [options]
 * @returns {object}
 */
export function createEnrichmentStore(options: any = {}) {
    const maxPerItem = options.maxPerItem ?? 100;
    if (typeof maxPerItem !== 'number' || maxPerItem < 1) {
        throw new RangeError('maxPerItem must be positive integer');
    }
    /** @type {Map<string, any[]>} */
    const byItem = new Map();
    /**
     * @param {AnyRecord} fields
     * @returns {AnyRecord}
     */
    function add(fields: any) {
        const entry = (createEnrichmentEntry(fields)) as any; // throws on invalid
        const itemId = entry.libraryItemId;
        const existing = byItem.get(itemId) || [];
        if (existing.length >= maxPerItem) {
            throw new RangeError(`Item ${itemId} has reached maxPerItem cap (${maxPerItem})`);
        }
        existing.push(entry);
        byItem.set(itemId, existing);
        return entry;
    }
    /**
     * @param {string} itemId
     * @returns {AnyRecord[]}
     */
    function getByItem(itemId: any) {
        const list = byItem.get(itemId);
        return list ? [...list] : [];
    }
    /**
     * @param {string} itemId
     * @param {string} contributorAlias
     * @returns {boolean}
     */
    function removeByContributor(itemId: any, contributorAlias: any) {
        const list = byItem.get(itemId);
        if (!list)
            return false;
        const idx = list.findIndex((e: any) => e.contributorAlias === contributorAlias);
        if (idx === -1)
            return false;
        list.splice(idx, 1);
        if (list.length === 0) {
            byItem.delete(itemId);
        }
        return true;
    }
    function size() {
        let total = 0;
        for (const list of byItem.values()) {
            total += list.length;
        }
        return total;
    }
    /**
     * @returns {EnrichmentSnapshot}
     */
    function exportSnapshot() {
        // Deep-ish copy: copy outer object + each inner array. The entries
        // themselves are already frozen by createEnrichmentEntry, so safe to share.
        /** @type {EnrichmentSnapshot} */
        const snapshot: any = {};
        for (const [itemId, list] of byItem.entries()) {
            snapshot[itemId] = [...list];
        }
        return snapshot;
    }
    /**
     * @param {string} itemId
     * @returns {AnyRecord|null}
     */
    function getAggregate(itemId: any) {
        const list = byItem.get(itemId);
        if (!list || list.length === 0)
            return null;
        return aggregateEnrichments(list);
    }
    return {
        add,
        getByItem,
        removeByContributor,
        size,
        export: exportSnapshot,
        getAggregate,
    };
}
// ---------------------------------------------------------------------------
// Pure community moderation/history store (SPEC 9.68)
// Keeps contribution state, curator decisions, feature version history, rollback
// events, and audit export without DOM, IDB, or network dependencies.
// ---------------------------------------------------------------------------
/**
 * @param {any} value
 * @returns {any}
 */
function cloneJson(value: any) {
    return JSON.parse(JSON.stringify(value ?? null));
}
/**
 * @param {any} value
 * @returns {any}
 */
function deepFreezeJson(value: any) {
    if (!value || typeof value !== 'object')
        return value;
    for (const key of Object.keys(value)) {
        deepFreezeJson(value[key]);
    }
    return Object.freeze(value);
}
/**
 * @param {AnyRecord} event
 * @returns {Readonly<AnyRecord>}
 */
function freezeAuditEvent(event: any) {
    return Object.freeze({
        ...event,
        metadata: deepFreezeJson(cloneJson(event.metadata || {})),
    });
}
/**
 * @param {any} value
 * @param {string} [fieldName]
 * @returns {string}
 */
function normalizeFeatureId(value: any, fieldName: any = "featureId") {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${fieldName} must be a non-empty string`);
    }
    return value.trim();
}
/**
 * @param {any} value
 * @param {string} [fieldName]
 * @returns {number}
 */
function normalizePositiveVersion(value: any, fieldName: any = "version") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw new RangeError(`${fieldName} must be a positive integer`);
    }
    return number;
}
/**
 * Creates a pure in-memory moderation/history store for Library Community
 * Enrichment. The exported snapshot can hydrate another store instance, giving
 * tests and browser adapters one persistence boundary without changing IDB.
 *
 * @param {{ now?: () => string, snapshot?: ModerationSnapshot }} [options]
 * @returns {object}
 */
export function createLibraryCommunityModerationStore(options: any = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    /** @type {Map<string, any>} */
    const contributions = new Map();
    /** @type {Map<string, any[]>} */
    const versionsByFeature = new Map();
    /** @type {AnyRecord[]} */
    const auditTrail: any[] = [];
    let contributionSeq = 1;
    let auditSeq = 1;
    /**
     * @param {string} prefix
     * @param {number} seq
     * @returns {string}
     */
    function nextId(prefix: any, seq: any) {
        return `${prefix}-${String(seq).padStart(4, '0')}`;
    }
    /**
     * @param {string} type
     * @param {AuditFields} [fields]
     * @returns {Readonly<AnyRecord>}
     */
    function recordAudit(type: any, fields: any = {}) {
        const event = freezeAuditEvent({
            id: fields.id || nextId('audit', auditSeq++),
            type,
            actorId: fields.actorId || null,
            contributionId: fields.contributionId || null,
            featureId: fields.featureId || null,
            version: fields.version ?? null,
            status: fields.status || null,
            createdAt: fields.createdAt || now(),
            metadata: fields.metadata || {},
        });
        auditTrail.push(event);
        return event;
    }
    /**
     * @param {AnyRecord} version
     * @param {{ audit?: boolean }} [options]
     * @returns {AnyRecord}
     */
    function addVersionToHistory(version: any, { audit = true }: any = {}) {
        const normalized = (createLibraryFeatureVersion(version)) as any;
        const history = versionsByFeature.get(normalized.featureId) || [];
        if (history.some((item: any) => item.version === normalized.version)) {
            throw new RangeError(`feature ${normalized.featureId} already has version ${normalized.version}`);
        }
        history.push(normalized);
        history.sort((a: any, b: any) => a.version - b.version);
        versionsByFeature.set(normalized.featureId, history);
        if (audit) {
            recordAudit('feature_version_added', {
                actorId: normalized.changedBy,
                featureId: normalized.featureId,
                version: normalized.version,
                createdAt: normalized.changedAt,
                metadata: {
                    changeType: normalized.changeType,
                    parentVersion: normalized.parentVersion,
                    auditMetadata: normalized.auditMetadata,
                },
            });
        }
        return normalized;
    }
    /**
     * @param {ModerationSnapshot} [snapshot]
     * @returns {void}
     */
    function hydrate(snapshot: any = {}) {
        for (const rawContribution of snapshot.contributions || []) {
            const contribution = (createLibraryCommunityContribution(rawContribution)) as any;
            const id = contribution.id || nextId('contribution', contributionSeq++);
            if (contributions.has(id)) {
                throw new RangeError(`contribution already exists: ${id}`);
            }
            contributions.set(id, contribution.id ? contribution : Object.freeze({ ...contribution, id }));
        }
        for (const rawVersion of snapshot.versions || []) {
            addVersionToHistory(rawVersion, { audit: false });
        }
        for (const rawEvent of snapshot.auditTrail || []) {
            auditTrail.push(freezeAuditEvent(rawEvent));
        }
        contributionSeq = Math.max(contributionSeq, contributions.size + 1);
        auditSeq = Math.max(auditSeq, auditTrail.length + 1);
    }
    hydrate(options.snapshot || {});
    /**
     * @param {AnyRecord} [fields]
     * @returns {AnyRecord}
     */
    function submitContribution(fields: any = {}) {
        const id = fields.id || nextId('contribution', contributionSeq++);
        if (contributions.has(id)) {
            throw new RangeError(`contribution already exists: ${id}`);
        }
        const createdAt = fields.createdAt || fields.created_at || now();
        const contribution: any = createLibraryCommunityContribution({
            ...fields,
            id,
            createdAt,
            updatedAt: fields.updatedAt || fields.updated_at || createdAt,
        });
        contributions.set(contribution.id, contribution);
        recordAudit('contribution_submitted', {
            actorId: contribution.contributorId,
            contributionId: contribution.id,
            featureId: contribution.recordId,
            status: contribution.status,
            createdAt: contribution.createdAt,
            metadata: {
                contributionType: contribution.contributionType,
                riskScore: contribution.riskScore,
                riskPriority: contribution.riskPriority,
                riskFlags: contribution.riskFlags,
            },
        });
        return contribution;
    }
    /**
     * @param {string} contributionId
     * @returns {AnyRecord|null}
     */
    function getContribution(contributionId: any) {
        return contributions.get(contributionId) || null;
    }
    /**
     * @param {AnyRecord} [filters]
     * @returns {readonly AnyRecord[]}
     */
    function listContributions(filters: any = {}) {
        const rows = [...contributions.values()].filter((row: any) => {
            if (filters.status && row.status !== filters.status)
                return false;
            if (filters.recordId && row.recordId !== filters.recordId)
                return false;
            if (filters.featureId && row.recordId !== filters.featureId)
                return false;
            if (filters.contributorId && row.contributorId !== filters.contributorId)
                return false;
            if (filters.reviewerId && row.reviewerId !== filters.reviewerId)
                return false;
            return true;
        });
        rows.sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(b.id));
        return Object.freeze(rows);
    }
    /**
     * @param {string} contributionId
     * @param {AnyRecord|string} decision
     * @returns {AnyRecord}
     */
    function reviewContribution(contributionId: any, decision: any) {
        const current = getContribution(contributionId);
        if (!current) {
            throw new RangeError(`contribution not found: ${contributionId}`);
        }
        const reviewedAt = typeof decision === 'object' && decision ? decision.reviewedAt || decision.reviewed_at || now() : now();
        const reviewed: any = applyCommunityReviewDecision(current, {
            ...(typeof decision === 'object' && decision ? decision : { action: decision }),
            reviewedAt,
        });
        contributions.set(contributionId, reviewed);
        recordAudit('contribution_reviewed', {
            actorId: reviewed.reviewerId,
            contributionId: reviewed.id,
            featureId: reviewed.recordId,
            status: reviewed.status,
            createdAt: reviewed.reviewedAt,
            metadata: {
                reviewNotes: reviewed.reviewNotes,
            },
        });
        return reviewed;
    }
    /**
     * @param {AnyRecord} version
     * @returns {AnyRecord}
     */
    function addFeatureVersion(version: any) {
        return addVersionToHistory(version);
    }
    /**
     * @param {string} featureId
     * @returns {readonly AnyRecord[]}
     */
    function getFeatureHistory(featureId: any) {
        return Object.freeze([...(versionsByFeature.get(featureId) || [])]);
    }
    /**
     * @param {string} featureId
     * @returns {AnyRecord|null}
     */
    function getCurrentFeatureVersion(featureId: any) {
        const history = versionsByFeature.get(featureId) || [];
        return history.length ? history[history.length - 1] : null;
    }
    /**
     * @param {string} contributionId
     * @param {AnyRecord} [mergeOptions]
     * @returns {AnyRecord}
     */
    function mergeApprovedContribution(contributionId: any, mergeOptions: any = {}) {
        const contribution = getContribution(contributionId);
        if (!contribution) {
            throw new RangeError(`contribution not found: ${contributionId}`);
        }
        const featureId = mergeOptions.featureId || contribution.recordId || contribution.changes?.featureId;
        const current = featureId ? getCurrentFeatureVersion(featureId) : null;
        const version = addVersionToHistory(applyApprovedContributionToLibraryVersion(current, contribution, mergeOptions));
        recordAudit('contribution_merged', {
            actorId: contribution.reviewerId,
            contributionId: contribution.id,
            featureId: version.featureId,
            version: version.version,
            status: contribution.status,
            createdAt: version.changedAt,
            metadata: {
                parentVersion: version.parentVersion,
                changeType: version.changeType,
            },
        });
        return version;
    }
    /**
     * @param {string} featureId
     * @param {any} targetVersion
     * @param {AnyRecord} [fields]
     * @returns {AnyRecord}
     */
    function rollbackFeatureToVersion(featureId: any, targetVersion: any, fields: any = {}) {
        const normalizedFeatureId = normalizeFeatureId(featureId);
        const targetNo = normalizePositiveVersion(targetVersion, 'targetVersion');
        const history = versionsByFeature.get(normalizedFeatureId) || [];
        const current = history[history.length - 1] || null;
        const target = history.find((item: any) => item.version === targetNo) || null;
        if (!current) {
            throw new RangeError(`feature has no history: ${normalizedFeatureId}`);
        }
        if (!target) {
            throw new RangeError(`target version not found: ${targetNo}`);
        }
        if (target.version >= current.version) {
            throw new RangeError('rollback target must be older than current version');
        }
        const actorId = normalizeFeatureId(fields.actorId || fields.changedBy, 'actorId');
        const changedAt = fields.changedAt || fields.createdAt || now();
        const rollback = addVersionToHistory(createLibraryFeatureVersion({
            featureId: normalizedFeatureId,
            version: current.version + 1,
            geometry: target.geometry,
            attributes: target.attributes,
            changeType: LIBRARY_FEATURE_VERSION_CHANGE_TYPES.EDIT,
            changedBy: actorId,
            changedAt,
            parentVersion: current.version,
            auditMetadata: {
                rollback: true,
                targetVersion: target.version,
                previousVersion: current.version,
                reason: fields.reason || null,
            },
        }));
        recordAudit('feature_rolled_back', {
            actorId,
            featureId: normalizedFeatureId,
            version: rollback.version,
            createdAt: rollback.changedAt,
            metadata: {
                targetVersion: target.version,
                previousVersion: current.version,
                reason: fields.reason || null,
            },
        });
        return rollback;
    }
    /**
     * @param {AnyRecord} [filters]
     * @returns {readonly Readonly<AnyRecord>[]}
     */
    function exportAuditTrail(filters: any = {}) {
        const events = auditTrail.filter((event: any) => {
            if (filters.type && event.type !== filters.type)
                return false;
            if (filters.featureId && event.featureId !== filters.featureId)
                return false;
            if (filters.contributionId && event.contributionId !== filters.contributionId)
                return false;
            return true;
        });
        return Object.freeze(events.map((event: any) => freezeAuditEvent(event)));
    }
    function exportState() {
        return Object.freeze({
            contributions: Object.freeze([...contributions.values()]),
            versions: Object.freeze([...versionsByFeature.values()].flat()),
            auditTrail: exportAuditTrail(),
        });
    }
    return Object.freeze({
        submitContribution,
        getContribution,
        listContributions,
        reviewContribution,
        addFeatureVersion,
        getFeatureHistory,
        getCurrentFeatureVersion,
        mergeApprovedContribution,
        rollbackFeatureToVersion,
        exportAuditTrail,
        exportState,
    });
}
/**
 * @param {{ storageKey?: string }} [options]
 * @returns {string}
 */
function moderationStorageKey(options: any = {}) {
    return String(options.storageKey || LIBRARY_COMMUNITY_MODERATION_STATE_KEY);
}
/**
 * @param {AnyRecord|null|undefined} source
 * @returns {AnyRecord}
 */
function moderationSnapshotFrom(source: any) {
    if (source && typeof source.exportState === 'function') {
        return source.exportState();
    }
    if (source && typeof source === 'object') {
        return source;
    }
    return { contributions: [], versions: [], auditTrail: [] };
}
/**
 * Persists a moderation store snapshot to IndexedDB or an injected key-value
 * storage adapter. The injected adapter keeps Node tests free of browser IDB.
 *
 * @param {object} source Store with exportState(), or a raw snapshot
 * @param {ModerationOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function saveLibraryCommunityModerationState(source: any, options: any = {}) {
    const set = typeof options.set === 'function' ? options.set : idbSet;
    const ok = await set(moderationStorageKey(options), moderationSnapshotFrom(source));
    return ok !== false;
}
/**
 * Loads the persisted moderation snapshot.
 *
 * @param {ModerationOptions} [options]
 * @returns {Promise<AnyRecord|null>}
 */
export async function loadLibraryCommunityModerationState(options: any = {}) {
    const get = typeof options.get === 'function' ? options.get : idbGet;
    const snapshot = await get(moderationStorageKey(options));
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
}
/**
 * Hydrates a pure moderation store from persisted browser state.
 *
 * @param {ModerationOptions} [options]
 * @returns {Promise<AnyRecord>}
 */
export async function loadLibraryCommunityModerationStore(options: any = {}) {
    const snapshot = options.snapshot || (await loadLibraryCommunityModerationState(options)) || {};
    return createLibraryCommunityModerationStore({ now: options.now, snapshot });
}
/**
 * Clears the persisted moderation snapshot without touching other IDB keys.
 *
 * @param {ModerationOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function clearLibraryCommunityModerationState(options: any = {}) {
    const del = typeof options.delete === 'function' ? options.delete : idbDelete;
    const ok = await del(moderationStorageKey(options));
    return ok !== false;
}
/**
 * Creates an async moderation store that saves after each mutating operation.
 *
 * @param {ModerationOptions} [options]
 * @returns {Promise<object>}
 */
export async function createPersistentLibraryCommunityModerationStore(options: any = {}) {
    const store = await loadLibraryCommunityModerationStore(options);
    async function persist() {
        const ok = await saveLibraryCommunityModerationState(store, options);
        if (!ok) {
            throw new Error('library community moderation state persistence failed');
        }
        return true;
    }
    /**
     * @param {string} methodName
     * @param {any[]} args
     * @returns {Promise<any>}
     */
    async function mutate(methodName: any, args: any) {
        const result = (store as any)[methodName](...args);
        await persist();
        return result;
    }
    /**
     * @param {string} methodName
     * @returns {(...args: any[]) => Promise<any>}
     */
    function persistentMethod(methodName: any) {
        return (...args: any[]) => mutate(methodName, args);
    }
    /**
     * @param {string} methodName
     * @returns {(...args: any[]) => any}
     */
    function readMethod(methodName: any) {
        return (...args: any[]) => (store as any)[methodName](...args);
    }
    return Object.freeze({
        submitContribution: persistentMethod('submitContribution'),
        reviewContribution: persistentMethod('reviewContribution'),
        addFeatureVersion: persistentMethod('addFeatureVersion'),
        mergeApprovedContribution: persistentMethod('mergeApprovedContribution'),
        rollbackFeatureToVersion: persistentMethod('rollbackFeatureToVersion'),
        getContribution: readMethod('getContribution'),
        listContributions: readMethod('listContributions'),
        getFeatureHistory: readMethod('getFeatureHistory'),
        getCurrentFeatureVersion: readMethod('getCurrentFeatureVersion'),
        exportAuditTrail: readMethod('exportAuditTrail'),
        exportState: () => store.exportState(),
        save: persist,
        clear: () => clearLibraryCommunityModerationState(options),
    });
}
