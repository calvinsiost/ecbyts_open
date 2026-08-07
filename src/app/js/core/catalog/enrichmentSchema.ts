/**
 * enrichmentSchema.js - Library Community Data Enrichment Schema (P1-26 / 9.68)
 *
 * Lógica pura: constantes, criação e merge de registros de enriquecimento.
 * Sem dependências de DOM, IDB ou rede.
 *
 * @module enrichmentSchema
 * @license AGPL-3.0-only
 */

type AnyRecord = Record<string, any>;

// Fontes de enriquecimento suportadas
// Sources supported for external community data enrichment
export const ENRICHMENT_SOURCES = {
    WIKIPEDIA: 'wikipedia',
    OSM: 'osm',
    MANUAL: 'manual',
};

/**
 * Cria um registro de enriquecimento validado.
 * Creates a validated enrichment record for an element.
 *
 * @param {object} params
 * @param {string} params.elementId - ID do elemento alvo
 * @param {string} params.source - Fonte (ver ENRICHMENT_SOURCES)
 * @param {object} [params.data] - Dados de enriquecimento
 * @param {number} [params.fetchedAt] - Timestamp em ms (epoch)
 * @returns {{ elementId: string, source: string, data: object, fetchedAt: number }}
 * @throws {Error} Se a source não pertencer a ENRICHMENT_SOURCES
 */
export function createEnrichmentRecord({
    elementId,
    source,
    data,
    fetchedAt,
}: {
    elementId: string;
    source: string;
    data?: object;
    fetchedAt?: number;
}): { elementId: string; source: string; data: object; fetchedAt: number } {
    if (!Object.values(ENRICHMENT_SOURCES).includes(source)) {
        throw new Error('Invalid source: ' + source);
    }
    return {
        elementId: String(elementId),
        source,
        data: data ?? {},
        fetchedAt: fetchedAt ?? Date.now(),
    };
}

/**
 * Mescla dois registros de enriquecimento do mesmo elemento/fonte.
 * Campos do `incoming` têm precedência; campos exclusivos de `existing` são preservados.
 * Merges two enrichment records - incoming wins on field conflicts.
 *
 * @param {{ data: object, fetchedAt: number, [key: string]: any }} existing
 * @param {{ data: object, fetchedAt: number, [key: string]: any }} incoming
 * @returns {{ data: object, fetchedAt: number, [key: string]: any }}
 */
export function mergeEnrichment(existing: { data: object, fetchedAt: number, [key: string]: any }, incoming: { data: object, fetchedAt: number, [key: string]: any }): { data: object, fetchedAt: number, [key: string]: any } {
    return {
        ...existing,
        data: { ...existing.data, ...incoming.data },
        fetchedAt: incoming.fetchedAt,
    };
}

// ───────────────────────────────────────────────────────────────────────
// Library Community Data Enrichment - SPEC 9.68 / P1-26
// Distinct from createEnrichmentRecord above (element-level external data).
// This is community-contributed enrichment for library marketplace items.
// ───────────────────────────────────────────────────────────────────────

const CONTRIBUTOR_ALIAS_MAX = 64;
const TAGS_MAX_COUNT = 10;
const TAG_MAX_LENGTH = 50;
const QUALITY_SCORE_MIN = 1;
const QUALITY_SCORE_MAX = 5;
const USAGE_NOTE_MAX = 300;

/**
 * Cria uma entrada de enriquecimento contribuída pela comunidade para um
 * item do marketplace de libraries (SPEC 9.68 / P1-26).
 *
 * Creates a community-contributed enrichment entry for a library marketplace
 * item. Validates each field strictly per the spec - caller's responsibility
 * to handle thrown errors (TypeError for type/missing, RangeError for bounds).
 *
 * The returned object is frozen via `Object.freeze` to prevent downstream
 * mutation (defensive - community data is shared across UI surfaces).
 *
 * @param {object} fields
 * @param {string} fields.libraryItemId - ID of the library item being enriched
 * @param {string} fields.contributorAlias - Anonymized alias (≤ 64 chars)
 * @param {string[]} fields.tags - Free-text tags (≤ 10 entries, each ≤ 50 chars)
 * @param {number} fields.qualityScore - Integer 1-5
 * @param {string} [fields.usageNote] - Optional usage commentary (≤ 300 chars)
 * @param {string} fields.createdAt - ISO-8601 timestamp
 * @returns {Readonly<object>} Frozen entry
 * @throws {TypeError} Required field missing or wrong type
 * @throws {RangeError} Field value outside accepted bounds
 */
export function createEnrichmentEntry(fields: { libraryItemId: string; contributorAlias: string; tags: string[]; qualityScore: number; usageNote?: string; createdAt: string }): Readonly<object> {
    if (!fields || typeof fields !== 'object') {
        throw new TypeError('createEnrichmentEntry: fields object required');
    }

    const { libraryItemId, contributorAlias, tags, qualityScore, usageNote, createdAt } = fields;

    return Object.freeze({
        libraryItemId: validateEnrichmentLibraryItemId(libraryItemId),
        contributorAlias: validateEnrichmentContributorAlias(contributorAlias),
        tags: Object.freeze(validateEnrichmentTags(tags)),
        qualityScore: validateEnrichmentQualityScore(qualityScore),
        usageNote: validateEnrichmentUsageNote(usageNote),
        createdAt: validateEnrichmentCreatedAt(createdAt),
    });
}

/**
 * Valida o ID do item de library.
 * @param {any} value
 * @returns {string}
 */
function validateEnrichmentLibraryItemId(value: any): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError('libraryItemId must be non-empty string');
    }
    return value;
}

/**
 * Valida o alias do contribuidor.
 * @param {any} value
 * @returns {string}
 */
function validateEnrichmentContributorAlias(value: any): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError('contributorAlias must be non-empty string');
    }
    if (value.length > CONTRIBUTOR_ALIAS_MAX) {
        throw new RangeError(`contributorAlias exceeds ${CONTRIBUTOR_ALIAS_MAX} chars`);
    }
    return value;
}

/**
 * Valida a lista de tags.
 * @param {any} value
 * @returns {string[]}
 */
function validateEnrichmentTags(value: any): string[] {
    if (!Array.isArray(value)) {
        throw new TypeError('tags must be array');
    }
    if (value.length > TAGS_MAX_COUNT) {
        throw new RangeError(`tags exceeds ${TAGS_MAX_COUNT} entries`);
    }
    for (const tag of value) {
        if (typeof tag !== 'string') {
            throw new TypeError('every tag must be string');
        }
        if (tag.length > TAG_MAX_LENGTH) {
            throw new RangeError(`tag exceeds ${TAG_MAX_LENGTH} chars`);
        }
    }
    return value;
}

/**
 * Valida o score de qualidade.
 * @param {any} value
 * @returns {number}
 */
function validateEnrichmentQualityScore(value: any): number {
    if (typeof value !== 'number') {
        throw new TypeError('qualityScore must be number');
    }
    if (!Number.isInteger(value)) {
        throw new RangeError('qualityScore must be integer (no decimals)');
    }
    if (value < QUALITY_SCORE_MIN || value > QUALITY_SCORE_MAX) {
        throw new RangeError(`qualityScore must be in [${QUALITY_SCORE_MIN}, ${QUALITY_SCORE_MAX}]`);
    }
    return value;
}

/**
 * Valida a nota de uso opcional.
 * @param {any} value
 * @returns {string|null}
 */
function validateEnrichmentUsageNote(value: any): string | null {
    if (value !== undefined && typeof value !== 'string') {
        throw new TypeError('usageNote must be string when provided');
    }
    if (typeof value === 'string' && value.length > USAGE_NOTE_MAX) {
        throw new RangeError(`usageNote exceeds ${USAGE_NOTE_MAX} chars`);
    }
    return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Valida o timestamp ISO-8601.
 * @param {any} value
 * @returns {string}
 */
function validateEnrichmentCreatedAt(value: any): string {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new TypeError('createdAt must be ISO-8601 timestamp string');
    }
    return value;
}

/**
 * Agrega métricas de uma lista de enrichment entries para um item.
 * Aggregate metrics across a list of enrichment entries.
 *
 * Returns:
 *  - totalContributions: number of entries
 *  - averageScore: arithmetic mean of qualityScore (rounded to 2 decimals)
 *  - tagFrequency: { [tag]: count } across all entries
 *  - topTags: top 5 tags by frequency, sorted desc
 *
 * @param {ReadonlyArray<object>} entries
 * @returns {{ totalContributions: number, averageScore: number, tagFrequency: Record<string, number>, topTags: string[] }}
 */
export function aggregateEnrichments(entries: ReadonlyArray<object>): { totalContributions: number, averageScore: number, tagFrequency: Record<string, number>, topTags: string[] } {
    if (!Array.isArray(entries) || entries.length === 0) {
        return {
            totalContributions: 0,
            averageScore: 0,
            tagFrequency: {},
            topTags: [],
        };
    }

    let scoreSum = 0;
    
    const tagFrequency: Record<string, number>= {};
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const item = (entry) as AnyRecord;
        if (typeof item.qualityScore === 'number') {
            scoreSum += item.qualityScore;
        }
        if (Array.isArray(item.tags)) {
            for (const tag of item.tags) {
                if (typeof tag !== 'string') continue;
                tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
            }
        }
    }

    const averageScore = Math.round((scoreSum / entries.length) * 100) / 100;

    // Top 5 tags by frequency desc, then alpha asc for ties (deterministic order)
    const topTags = Object.entries(tagFrequency)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([tag]) => tag);

    return {
        totalContributions: entries.length,
        averageScore,
        tagFrequency,
        topTags,
    };
}

/**
 * Mescla dois mapas de enrichment entries (libraryItemId → entries[]) sem
 * duplicatas. Para colisões mesmo contributorAlias+libraryItemId, mantém
 * a entry mais recente (createdAt maior).
 *
 * Merge two enrichment maps without duplicates. On (alias, libraryItemId)
 * collisions, keeps the entry with the most recent createdAt.
 *
 * Pure function - does NOT mutate input maps.
 *
 * @param {Record<string, object[]>} mapA
 * @param {Record<string, object[]>} mapB
 * @returns {Record<string, object[]>} New merged map
 */
export function mergeEnrichmentMaps(mapA: Record<string, object[]>, mapB: Record<string, object[]>): Record<string, object[]> {
    
    const result: Record<string, object[]>= {};
    const allKeys = new Set([...Object.keys(mapA || {}), ...Object.keys(mapB || {})]);

    for (const libraryItemId of allKeys) {
        const listA = (mapA && mapA[libraryItemId]) || [];
        const listB = (mapB && mapB[libraryItemId]) || [];
        // Deduplicate by contributorAlias, keeping the entry with the latest createdAt
        const byAlias = new Map();
        for (const entry of [...listA, ...listB]) {
            if (!entry || typeof entry !== 'object') continue;
            const item = (entry) as AnyRecord;
            const alias = item.contributorAlias;
            if (typeof alias !== 'string') continue;
            const existing = byAlias.get(alias);
            if (!existing) {
                byAlias.set(alias, item);
                continue;
            }
            const existingTime = Date.parse((existing as AnyRecord).createdAt);
            const incomingTime = Date.parse(item.createdAt);
            if (Number.isFinite(incomingTime) && incomingTime > existingTime) {
                byAlias.set(alias, item);
            }
        }
        result[libraryItemId] = [...byAlias.values()];
    }

    return result;
}

// ---------------------------------------------------------------------------
// Community contribution lifecycle model (SPEC 9.68)
// Pure helpers for contribution validation, curator review, risk scoring,
// reputation points, ranks, and badge derivation.
// ---------------------------------------------------------------------------

export const COMMUNITY_CONTRIBUTION_TYPES = Object.freeze({
    NEW_RECORD: 'new_record',
    EDIT: 'edit',
    DELETE: 'delete',
});

export const COMMUNITY_CONTRIBUTION_STATUSES = Object.freeze({
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
});

export const COMMUNITY_SPATIAL_ACCURACY_TYPES = Object.freeze({
    GPS: 'gps',
    SATELLITE_1M: 'satellite_1m',
    SATELLITE_10M: 'satellite_10m',
    OTHER: 'other',
});

export const COMMUNITY_REPUTATION_POINTS = Object.freeze({
    contribution_approved: 100,
    contribution_rejected: -50,
    like_received: 10,
    comment_helpful: 15,
    discussion_resolved: 50,
    review_performed: 25,
});

export const LIBRARY_FEATURE_VERSION_CHANGE_TYPES = Object.freeze({
    CREATE: 'create',
    EDIT: 'edit',
    DELETE: 'delete',
});

export const LIBRARY_VERSION_MODERATION_STATUSES = Object.freeze({
    DRAFT: 'draft',
    PENDING_MODERATION: 'pending_moderation',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PUBLISHED: 'published',
});

const JUSTIFICATION_MIN_LENGTH = 50;

function coalesceField(
    fields: AnyRecord,
    camelName: string,
    snakeName: string,
) {
    return fields[camelName] ?? fields[snakeName];
}

function assertNonEmptyString(value: any, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${fieldName} must be a non-empty string`);
    }
    return value.trim();
}

function assertIsoDate(value: any, fieldName: string) {
    const text = assertNonEmptyString(value, fieldName);
    const time = Date.parse(text);
    if (!Number.isFinite(time)) {
        throw new TypeError(`${fieldName} must be a valid date or ISO timestamp`);
    }
    if (time > Date.now()) {
        throw new RangeError(`${fieldName} cannot be in the future`);
    }
    return text;
}

function assertHttpUrl(value: any, fieldName: string) {
    const text = assertNonEmptyString(value, fieldName);
    let parsed;
    try {
        parsed = new URL(text);
    } catch (_err) {
        throw new TypeError(`${fieldName} must be a valid URL`, { cause: _err });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new TypeError(`${fieldName} must be an http(s) URL`);
    }
    return text;
}

function jsonClone(value: any) {
    return JSON.parse(JSON.stringify(value ?? {}));
}

function freezeJsonValue(value: any) {
    if (value === null || value === undefined) return null;
    const cloned = JSON.parse(JSON.stringify(value));
    return cloned && typeof cloned === 'object' ? Object.freeze(cloned) : cloned;
}

function assertPositiveInteger(value: any, fieldName: string) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw new RangeError(`${fieldName} must be a positive integer`);
    }
    return number;
}

function freezeContribution(contribution: AnyRecord) {
    return Object.freeze({
        ...contribution,
        changes: Object.freeze(contribution.changes || {}),
        riskFlags: Object.freeze([...(contribution.riskFlags || [])]),
    });
}

/**
 * Scores review risk for a community contribution.
 *
 * @param {AnyRecord} contribution
 * @returns {Readonly<{ score: number, priority: 'normal'|'medium'|'high', flags: readonly string[] }>}
 */
export function assessCommunityContributionRisk(contribution: AnyRecord = {}): Readonly<{ score: number, priority: 'normal'|'medium'|'high', flags: readonly string[] }> {
    const flags: string[] = [];
    let score = 0;

    const riskChecks = [
        scoreNewUserRisk,
        scoreDeleteRequestRisk,
        scoreLargeAreaChangeRisk,
        scoreSensitiveDataRisk,
        scoreLicenseMissingRisk,
        scoreSourceMissingRisk,
    ];

    for (const check of riskChecks) {
        const result = check(contribution);
        score += result.score;
        if (result.flag) {
            flags.push(result.flag);
        }
    }

    const normalizedScore = Math.min(100, score);
    const priority = normalizedScore >= 75 ? 'high' : normalizedScore >= 40 ? 'medium' : 'normal';
    return Object.freeze({ score: normalizedScore, priority, flags: Object.freeze(flags) });
}

/**
 * Avalia risco de usuário novo.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreNewUserRisk(contribution: AnyRecord): { score: number; flag?: string } {
    const accountAgeDays = Number(
        coalesceField(contribution, 'contributorAccountAgeDays', 'contributor_account_age_days') ?? Number.NaN,
    );
    if (Number.isFinite(accountAgeDays) && accountAgeDays < 7) {
        return { score: 25, flag: 'NEW_USER' };
    }
    return { score: 0 };
}

/**
 * Avalia risco de solicitação de exclusão.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreDeleteRequestRisk(contribution: AnyRecord): { score: number; flag?: string } {
    const contributionType = coalesceField(contribution, 'contributionType', 'contribution_type');
    if (contributionType === COMMUNITY_CONTRIBUTION_TYPES.DELETE) {
        return { score: 25, flag: 'DELETE_REQUEST' };
    }
    return { score: 0 };
}

/**
 * Avalia risco de alteração de área grande.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreLargeAreaChangeRisk(contribution: AnyRecord): { score: number; flag?: string } {
    const areaChangedM2 = Number(coalesceField(contribution, 'areaChangedM2', 'area_changed_m2') ?? 0);
    const areaChangedSqKm = Number(coalesceField(contribution, 'areaChangedSqKm', 'area_changed_sq_km') ?? 0);
    if (areaChangedM2 >= 1_000_000 || areaChangedSqKm >= 1000) {
        return { score: 30, flag: 'LARGE_AREA_CHANGE' };
    }
    return { score: 0 };
}

/**
 * Avalia risco de dados sensíveis.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreSensitiveDataRisk(contribution: AnyRecord): { score: number; flag?: string } {
    if (contribution.sensitive) {
        return { score: 30, flag: 'SENSITIVE_DATA' };
    }
    return { score: 0 };
}

/**
 * Avalia risco de licença ausente.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreLicenseMissingRisk(contribution: AnyRecord): { score: number; flag?: string } {
    const licenseConfirmed = Boolean(coalesceField(contribution, 'licenseConfirmed', 'license_confirmed'));
    if (!licenseConfirmed) {
        return { score: 20, flag: 'LICENSE_MISSING' };
    }
    return { score: 0 };
}

/**
 * Avalia risco de fonte ausente.
 * @param {AnyRecord} contribution
 * @returns {{ score: number, flag?: string }}
 */
function scoreSourceMissingRisk(contribution: AnyRecord): { score: number; flag?: string } {
    const sourceUrl = coalesceField(contribution, 'sourceUrl', 'source_url');
    if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
        return { score: 10, flag: 'SOURCE_MISSING' };
    }
    return { score: 0 };
}

/**
 * Creates a validated community contribution row aligned with
 * `library_contributions` from the 9.68 migration.
 *
 * Accepts both camelCase and snake_case field names so browser form payloads
 * and domain code can share the same validation path.
 *
 * @param {AnyRecord} fields
 * @returns {Readonly<object>}
 */
export function createLibraryCommunityContribution(fields: AnyRecord = {}): Readonly<object> {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new TypeError('fields object required');
    }

    const contributionType = validateContributionType(fields);
    const contributorId = validateContributorId(fields);
    const recordId = validateRecordIdForType(contributionType, fields);
    const justification = validateJustification(fields);
    const dataSource = assertNonEmptyString(coalesceField(fields, 'dataSource', 'data_source'), 'dataSource');
    const sourceUrl = assertHttpUrl(coalesceField(fields, 'sourceUrl', 'source_url'), 'sourceUrl');
    const sourceDate = assertIsoDate(coalesceField(fields, 'sourceDate', 'source_date'), 'sourceDate');
    const spatialAccuracy = validateSpatialAccuracy(fields);
    const licenseConfirmed = validateLicenseConfirmed(fields);
    const status = validateContributionStatus(fields);
    const createdAt = validateContributionTimestamps(fields);
    const updatedAt = fields.updatedAt || fields.updated_at || createdAt;
    assertIsoDate(updatedAt, 'updatedAt');

    const risk = assessCommunityContributionRisk(fields);
    return freezeContribution({
        id: fields.id || null,
        projectId: coalesceField(fields, 'projectId', 'project_id') || null,
        contributorId,
        recordId,
        contributionType,
        changes: jsonClone(coalesceField(fields, 'changes', 'changes_json') || {}),
        justification,
        dataSource,
        sourceUrl,
        sourceDate,
        spatialAccuracy,
        licenseConfirmed,
        status,
        reviewerId: coalesceField(fields, 'reviewerId', 'reviewer_id') || null,
        reviewNotes: coalesceField(fields, 'reviewNotes', 'review_notes') || null,
        reviewedAt: coalesceField(fields, 'reviewedAt', 'reviewed_at') || null,
        createdAt,
        updatedAt,
        sensitive: Boolean(fields.sensitive),
        riskScore: risk.score,
        riskPriority: risk.priority,
        riskFlags: risk.flags,
    });
}

/**
 * Valida o tipo de contribuição.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateContributionType(fields: AnyRecord): string {
    const contributionType = coalesceField(fields, 'contributionType', 'contribution_type');
    if (!Object.values(COMMUNITY_CONTRIBUTION_TYPES).includes(contributionType)) {
        throw new RangeError('contributionType must be new_record, edit, or delete');
    }
    return contributionType;
}

/**
 * Valida o ID do contribuidor.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateContributorId(fields: AnyRecord): string {
    return assertNonEmptyString(
        coalesceField(fields, 'contributorId', 'contributor_id'),
        'contributorId',
    );
}

/**
 * Valida o recordId conforme o tipo de contribuição.
 * @param {string} contributionType
 * @param {AnyRecord} fields
 * @returns {string|null}
 */
function validateRecordIdForType(contributionType: string, fields: AnyRecord): string | null {
    const recordIdRaw = coalesceField(fields, 'recordId', 'record_id');
    const recordId = typeof recordIdRaw === 'string' && recordIdRaw.trim() ? recordIdRaw.trim() : null;
    if (contributionType !== COMMUNITY_CONTRIBUTION_TYPES.NEW_RECORD && !recordId) {
        throw new TypeError('recordId is required for edit and delete contributions');
    }
    return recordId;
}

/**
 * Valida a justificativa.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateJustification(fields: AnyRecord): string {
    const justification = assertNonEmptyString(fields.justification, 'justification');
    if (justification.length < JUSTIFICATION_MIN_LENGTH) {
        throw new RangeError(`justification must be at least ${JUSTIFICATION_MIN_LENGTH} characters`);
    }
    return justification;
}

/**
 * Valida a precisão espacial.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateSpatialAccuracy(fields: AnyRecord): string {
    const spatialAccuracy = coalesceField(fields, 'spatialAccuracy', 'spatial_accuracy');
    if (!Object.values(COMMUNITY_SPATIAL_ACCURACY_TYPES).includes(spatialAccuracy)) {
        throw new RangeError('spatialAccuracy must be gps, satellite_1m, satellite_10m, or other');
    }
    return spatialAccuracy;
}

/**
 * Valida a confirmação de licença.
 * @param {AnyRecord} fields
 * @returns {boolean}
 */
function validateLicenseConfirmed(fields: AnyRecord): boolean {
    const licenseConfirmed = Boolean(coalesceField(fields, 'licenseConfirmed', 'license_confirmed'));
    if (!licenseConfirmed) {
        throw new TypeError('licenseConfirmed must be true before submission');
    }
    return licenseConfirmed;
}

/**
 * Valida o status da contribuição.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateContributionStatus(fields: AnyRecord): string {
    const status = fields.status || COMMUNITY_CONTRIBUTION_STATUSES.PENDING;
    if (!Object.values(COMMUNITY_CONTRIBUTION_STATUSES).includes(status)) {
        throw new RangeError('status must be pending, under_review, approved, or rejected');
    }
    return status;
}

/**
 * Valida os timestamps de criação/atualização.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateContributionTimestamps(fields: AnyRecord): string {
    const createdAt = fields.createdAt || fields.created_at || new Date().toISOString();
    assertIsoDate(createdAt, 'createdAt');
    return createdAt;
}

/**
 * Applies a curator decision without mutating the contribution.
 *
 * @param {AnyRecord} contribution
 * @param {AnyRecord|string} decision
 * @returns {Readonly<object>}
 */
export function applyCommunityReviewDecision(contribution: AnyRecord, decision: AnyRecord|string): Readonly<object> {
    if (!contribution || typeof contribution !== 'object') {
        throw new TypeError('contribution object required');
    }

    const action = extractReviewAction(decision);
    const nextStatus = resolveReviewNextStatus(action);

    assertContributionNotTerminal(contribution);

    const reviewerId = extractReviewerId(decision);
    const reviewNotes = extractReviewNotes(decision);
    if (nextStatus === COMMUNITY_CONTRIBUTION_STATUSES.REJECTED) {
        assertNonEmptyString(reviewNotes, 'reviewNotes');
    }

    const now = extractReviewedAt(decision);
    assertIsoDate(now, 'reviewedAt');

    return freezeContribution({
        ...contribution,
        status: nextStatus,
        reviewerId,
        reviewNotes: normalizeReviewNotes(reviewNotes),
        reviewedAt: now,
        updatedAt: now,
    });
}

/**
 * Extrai a ação da decisão de review.
 * @param {AnyRecord|string} decision
 * @returns {string}
 */
function extractReviewAction(decision: AnyRecord | string): string {
    return typeof decision === 'string' ? decision : decision?.action || decision?.status;
}

/**
 * Garante que a contribuição ainda não esteja em estado terminal.
 * @param {AnyRecord} contribution
 */
function assertContributionNotTerminal(contribution: AnyRecord): void {
    if (
        contribution.status === COMMUNITY_CONTRIBUTION_STATUSES.APPROVED ||
        contribution.status === COMMUNITY_CONTRIBUTION_STATUSES.REJECTED
    ) {
        throw new RangeError('review decision cannot change a terminal contribution');
    }
}

/**
 * Extrai o reviewerId da decisão de review.
 * @param {AnyRecord|string} decision
 * @returns {string}
 */
function extractReviewerId(decision: AnyRecord | string): string {
    const raw = typeof decision === 'object' ? coalesceField(decision, 'reviewerId', 'reviewer_id') : '';
    return assertNonEmptyString(raw, 'reviewerId');
}

/**
 * Extrai as notas de review da decisão.
 * @param {AnyRecord|string} decision
 * @returns {string|null}
 */
function extractReviewNotes(decision: AnyRecord | string): string | null {
    return typeof decision === 'object' ? coalesceField(decision, 'reviewNotes', 'review_notes') : null;
}

/**
 * Extrai o timestamp de review da decisão, defaultando para agora.
 * @param {AnyRecord|string} decision
 * @returns {string}
 */
function extractReviewedAt(decision: AnyRecord | string): string {
    return (typeof decision === 'object' && (decision.reviewedAt || decision.reviewed_at)) || new Date().toISOString();
}

/**
 * Normaliza notas de review para string trimada ou null.
 * @param {string|null} notes
 * @returns {string|null}
 */
function normalizeReviewNotes(notes: string | null): string | null {
    return typeof notes === 'string' && notes.trim() ? notes.trim() : null;
}

/**
 * Resolve o próximo status a partir da ação de review.
 * @param {any} action
 * @returns {string}
 */
function resolveReviewNextStatus(action: any): string {
    const nextStatusByAction: Record<string, string>= {
        review: COMMUNITY_CONTRIBUTION_STATUSES.UNDER_REVIEW,
        under_review: COMMUNITY_CONTRIBUTION_STATUSES.UNDER_REVIEW,
        approve: COMMUNITY_CONTRIBUTION_STATUSES.APPROVED,
        approved: COMMUNITY_CONTRIBUTION_STATUSES.APPROVED,
        reject: COMMUNITY_CONTRIBUTION_STATUSES.REJECTED,
        rejected: COMMUNITY_CONTRIBUTION_STATUSES.REJECTED,
    };
    const nextStatus = nextStatusByAction[String(action)];
    if (!nextStatus) {
        throw new RangeError('review decision must be review, approve, or reject');
    }
    return nextStatus;
}

/**
 * Creates an immutable event-sourced feature version snapshot.
 *
 * @param {AnyRecord} fields
 * @returns {Readonly<object>}
 */
export function createLibraryFeatureVersion(fields: AnyRecord = {}): Readonly<object> {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new TypeError('fields object required');
    }

    const featureId = assertNonEmptyString(coalesceField(fields, 'featureId', 'feature_id'), 'featureId');
    const version = assertPositiveInteger(fields.version, 'version');
    const changeType = validateFeatureChangeType(fields);
    const parentVersion = validateFeatureParentVersion(version, fields);
    const changedBy = assertNonEmptyString(coalesceField(fields, 'changedBy', 'changed_by'), 'changedBy');
    const changedAt = assertIsoDate(
        coalesceField(fields, 'changedAt', 'changed_at') || new Date().toISOString(),
        'changedAt',
    );

    return Object.freeze({
        id: fields.id || null,
        featureId,
        version,
        geometry: freezeJsonValue(fields.geometry ?? null),
        attributes: freezeJsonValue(fields.attributes ?? {}),
        changeType,
        changedBy,
        changedAt,
        parentVersion,
        auditMetadata: freezeJsonValue(coalesceField(fields, 'auditMetadata', 'audit_metadata') || {}),
    });
}

/**
 * Valida o tipo de mudança de versão.
 * @param {AnyRecord} fields
 * @returns {string}
 */
function validateFeatureChangeType(fields: AnyRecord): string {
    const changeType = coalesceField(fields, 'changeType', 'change_type');
    if (!Object.values(LIBRARY_FEATURE_VERSION_CHANGE_TYPES).includes(changeType)) {
        throw new RangeError('changeType must be create, edit, or delete');
    }
    return changeType;
}

/**
 * Valida a versão pai de uma feature.
 * @param {number} version
 * @param {AnyRecord} fields
 * @returns {number|null}
 */
function validateFeatureParentVersion(version: number, fields: AnyRecord): number | null {
    const parentRaw = coalesceField(fields, 'parentVersion', 'parent_version');
    const parentVersion =
        parentRaw === undefined || parentRaw === null ? null : assertPositiveInteger(parentRaw, 'parentVersion');
    if (version > 1 && parentVersion === null) {
        throw new RangeError('parentVersion is required for feature versions after v1');
    }
    if (parentVersion !== null && parentVersion >= version) {
        throw new RangeError('parentVersion must be lower than version');
    }
    return parentVersion;
}

/**
 * Produces a deterministic plain-object diff for feature attributes.
 *
 * @param {AnyRecord} beforeAttributes
 * @param {AnyRecord} afterAttributes
 * @returns {{ added: object, removed: object, changed: object, unchanged: object }}
 */
export function diffLibraryFeatureAttributes(beforeAttributes: AnyRecord = {}, afterAttributes: AnyRecord = {}): { added: object, removed: object, changed: object, unchanged: object } {
    const before =
        beforeAttributes && typeof beforeAttributes === 'object' && !Array.isArray(beforeAttributes)
            ? beforeAttributes
            : {};
    const after =
        afterAttributes && typeof afterAttributes === 'object' && !Array.isArray(afterAttributes)
            ? afterAttributes
            : {};
    
    const added: AnyRecord= {};
    
    const removed: AnyRecord= {};
    
    const changed: AnyRecord= {};
    
    const unchanged: AnyRecord= {};

    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
        if (!hasBefore && hasAfter) {
            added[key] = freezeJsonValue(after[key]);
        } else if (hasBefore && !hasAfter) {
            removed[key] = freezeJsonValue(before[key]);
        } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
            changed[key] = Object.freeze({
                before: freezeJsonValue(before[key]),
                after: freezeJsonValue(after[key]),
            });
        } else {
            unchanged[key] = freezeJsonValue(after[key]);
        }
    }

    return Object.freeze({
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        changed: Object.freeze(changed),
        unchanged: Object.freeze(unchanged),
    });
}

function getContributionParentVersion(contribution: AnyRecord = {}) {
    const direct = coalesceField(contribution, 'parentVersion', 'parent_version');
    if (direct !== undefined && direct !== null) return direct;
    const changes = coalesceField(contribution, 'changes', 'changes_json') || {};
    return coalesceField(changes, 'parentVersion', 'parent_version');
}

/**
 * Checks whether a contribution was authored from the current feature version.
 *
 * @param {AnyRecord|null} currentVersion
 * @param {AnyRecord} contribution
 * @returns {{ conflict: boolean, reason: string|null, currentVersion: number|null, parentVersion: number|null, staleBy: number }}
 */
export function detectLibraryVersionConflict(currentVersion: AnyRecord|null, contribution: AnyRecord = {}): { conflict: boolean, reason: string|null, currentVersion: number|null, parentVersion: number|null, staleBy: number } {
    const contributionType = coalesceField(contribution, 'contributionType', 'contribution_type');
    if (contributionType === COMMUNITY_CONTRIBUTION_TYPES.NEW_RECORD && !currentVersion) {
        return Object.freeze({
            conflict: false,
            reason: null,
            currentVersion: null,
            parentVersion: null,
            staleBy: 0,
        });
    }

    if (!currentVersion || typeof currentVersion !== 'object') {
        return Object.freeze({
            conflict: true,
            reason: 'missing_current_version',
            currentVersion: null,
            parentVersion: null,
            staleBy: 0,
        });
    }

    const current = assertPositiveInteger(currentVersion.version, 'currentVersion.version');
    const parentRaw = getContributionParentVersion(contribution);
    if (parentRaw === undefined || parentRaw === null) {
        return Object.freeze({
            conflict: true,
            reason: 'missing_parent_version',
            currentVersion: current,
            parentVersion: null,
            staleBy: 0,
        });
    }

    const parent = assertPositiveInteger(parentRaw, 'parentVersion');
    const conflict = parent !== current;
    return Object.freeze({
        conflict,
        reason: conflict ? 'stale_parent_version' : null,
        currentVersion: current,
        parentVersion: parent,
        staleBy: conflict ? current - parent : 0,
    });
}

/**
 * Resolve o snapshot de atributos/geometry para uma contribuição aprovada.
 * @param {AnyRecord|null} currentVersion
 * @param {AnyRecord} contribution
 * @returns {{ geometry: any, attributes: AnyRecord }}
 */
function resolveContributionSnapshot(currentVersion: AnyRecord|null, contribution: AnyRecord) {
    const contributionType = coalesceField(contribution, 'contributionType', 'contribution_type');
    const changes = coalesceField(contribution, 'changes', 'changes_json') || {};
    const currentAttributes =
        currentVersion?.attributes && typeof currentVersion.attributes === 'object' ? currentVersion.attributes : {};

    if (contributionType === COMMUNITY_CONTRIBUTION_TYPES.DELETE) {
        return {
            geometry: null,
            attributes: { ...currentAttributes, deleted: true },
        };
    }

    const after = changes && typeof changes.after === 'object' && changes.after !== null ? changes.after : null;
    const geometry = after?.geometry ?? changes.geometry ?? currentVersion?.geometry ?? null;
    const attributes = resolveContributionAttributes(after, changes, currentAttributes);

    return { geometry, attributes };
}

/**
 * Resolve os atributos do snapshot a partir das mudanças.
 * @param {AnyRecord|null} after
 * @param {AnyRecord} changes
 * @param {AnyRecord} currentAttributes
 * @returns {AnyRecord}
 */
function resolveContributionAttributes(
    after: AnyRecord | null,
    changes: AnyRecord,
    currentAttributes: AnyRecord,
): AnyRecord {
    if (after && after.attributes && typeof after.attributes === 'object') {
        return after.attributes;
    }
    if (after && !Object.prototype.hasOwnProperty.call(after, 'geometry')) {
        return after;
    }
    if (changes.attributes && typeof changes.attributes === 'object') {
        return { ...currentAttributes, ...changes.attributes };
    }
    return currentAttributes;
}

/**
 * Merges one approved community contribution into the next feature version.
 *
 * @param {AnyRecord|null} currentVersion
 * @param {AnyRecord} contribution
 * @param {{ featureId?: string }} [options]
 * @returns {Readonly<object>}
 */
export function applyApprovedContributionToLibraryVersion(currentVersion: AnyRecord|null, contribution: AnyRecord = {}, options: { featureId?: string } = {}): Readonly<object> {
    if (!contribution || typeof contribution !== 'object') {
        throw new TypeError('contribution object required');
    }
    if (coalesceField(contribution, 'status', 'status') !== COMMUNITY_CONTRIBUTION_STATUSES.APPROVED) {
        throw new RangeError('only approved contributions can create feature versions');
    }

    const contributionType = coalesceField(contribution, 'contributionType', 'contribution_type');
    const changeType = resolveChangeTypeFromContribution(contributionType);

    const conflict = detectLibraryVersionConflict(currentVersion, contribution);
    if (conflict.conflict) {
        throw new RangeError(`version conflict: ${conflict.reason}`);
    }

    const nextVersionNumber = currentVersion
        ? assertPositiveInteger(currentVersion.version, 'currentVersion.version') + 1
        : 1;
    const parentVersion = currentVersion
        ? assertPositiveInteger(currentVersion.version, 'currentVersion.version')
        : null;
    const featureId = resolveFeatureIdForVersion(currentVersion, contribution, options);
    const snapshot = resolveContributionSnapshot(currentVersion, contribution);
    const changedAt = resolveVersionChangedAt(contribution);

    return createLibraryFeatureVersion({
        featureId,
        version: nextVersionNumber,
        geometry: snapshot.geometry,
        attributes: snapshot.attributes,
        changeType,
        changedBy: coalesceField(contribution, 'contributorId', 'contributor_id'),
        changedAt,
        parentVersion,
        auditMetadata: buildVersionAuditMetadata(contribution),
    });
}

/**
 * Resolve o tipo de mudança a partir do tipo de contribuição.
 * @param {any} contributionType
 * @returns {string}
 */
function resolveChangeTypeFromContribution(contributionType: any): string {
    const changeTypeByContribution: Record<string, string>= {
        [COMMUNITY_CONTRIBUTION_TYPES.NEW_RECORD]: LIBRARY_FEATURE_VERSION_CHANGE_TYPES.CREATE,
        [COMMUNITY_CONTRIBUTION_TYPES.EDIT]: LIBRARY_FEATURE_VERSION_CHANGE_TYPES.EDIT,
        [COMMUNITY_CONTRIBUTION_TYPES.DELETE]: LIBRARY_FEATURE_VERSION_CHANGE_TYPES.DELETE,
    };
    const changeType = changeTypeByContribution[String(contributionType)];
    if (!changeType) {
        throw new RangeError('contributionType must be new_record, edit, or delete');
    }
    return changeType;
}

/**
 * Resolve o featureId para a próxima versão.
 * @param {AnyRecord|null} currentVersion
 * @param {AnyRecord} contribution
 * @param {{ featureId?: string }} options
 * @returns {string}
 */
function resolveFeatureIdForVersion(
    currentVersion: AnyRecord | null,
    contribution: AnyRecord,
    options: { featureId?: string },
): string {
    return (
        currentVersion?.featureId ||
        options.featureId ||
        coalesceField(contribution, 'recordId', 'record_id') ||
        coalesceField(contribution, 'featureId', 'feature_id')
    );
}

/**
 * Resolve o timestamp de mudança da versão.
 * @param {AnyRecord} contribution
 * @returns {string}
 */
function resolveVersionChangedAt(contribution: AnyRecord): string {
    const reviewedAt = coalesceField(contribution, 'reviewedAt', 'reviewed_at');
    const updatedAt = coalesceField(contribution, 'updatedAt', 'updated_at');
    return reviewedAt || updatedAt || new Date().toISOString();
}

/**
 * Constrói os metadados de auditoria da versão.
 * @param {AnyRecord} contribution
 * @returns {AnyRecord}
 */
function buildVersionAuditMetadata(contribution: AnyRecord): AnyRecord {
    return {
        contributionId: contribution.id || null,
        reviewerId: coalesceField(contribution, 'reviewerId', 'reviewer_id') || null,
        reviewNotes: coalesceField(contribution, 'reviewNotes', 'review_notes') || null,
    };
}

/**
 * Normalizes market API version rows into one moderation-ready shape.
 *
 * Accepts Supabase snake_case rows, browser camelCase rows, or queue payloads
 * with a nested listing object. The returned object keeps version/listing
 * identity explicit so persistence/UI code does not infer from display text.
 *
 * @param {AnyRecord} row
 * @returns {Readonly<object>}
 */
export function normalizeLibraryVersionModerationItem(row: AnyRecord = {}): Readonly<object> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new TypeError('version moderation row object required');
    }

    const listing = resolveListingFromRow(row);
    const listingId = assertNonEmptyString(coalesceField(row, 'listingId', 'listing_id') || listing.id, 'listingId');
    const versionNo = assertPositiveInteger(coalesceField(row, 'versionNo', 'version_no') ?? row.version, 'versionNo');
    const status = assertNonEmptyString(row.status || LIBRARY_VERSION_MODERATION_STATUSES.PENDING_MODERATION, 'status');
    const createdAtRaw = coalesceField(row, 'createdAt', 'created_at');
    const createdAt =
        createdAtRaw === undefined || createdAtRaw === null ? null : assertIsoDate(createdAtRaw, 'createdAt');

    return Object.freeze({
        id: String(row.id || `${listingId}:v${versionNo}`),
        listingId,
        versionNo,
        status,
        moderationStatus: resolveModerationStatus(status),
        title: String(row.title || listing.title || `Listing ${listingId} v${versionNo}`),
        changeNote: coalesceField(row, 'changeNote', 'change_note') || null,
        createdBy: coalesceField(row, 'createdBy', 'created_by') || null,
        createdAt,
    });
}

/**
 * Resolve o objeto listing a partir de diferentes shapes de row.
 * @param {AnyRecord} row
 * @returns {AnyRecord}
 */
function resolveListingFromRow(row: AnyRecord): AnyRecord {
    return row.listing || row.market_listing || row.market_listings || {};
}

/**
 * Resolve o status de moderação a partir do status bruto.
 * @param {string} status
 * @returns {string}
 */
function resolveModerationStatus(status: string): string {
    return status === LIBRARY_VERSION_MODERATION_STATUSES.PENDING_MODERATION
        ? COMMUNITY_CONTRIBUTION_STATUSES.PENDING
        : status;
}

/**
 * Normalizes a market moderation queue payload into immutable version rows.
 *
 * @param {AnyRecord[]|{ versions?: AnyRecord[] }} payload
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function normalizeLibraryVersionModerationQueue(payload: AnyRecord[]|{ versions?: AnyRecord[] } = []): ReadonlyArray<Readonly<object>> {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.versions) ? payload.versions : [];
    return Object.freeze(rows.map((row) => normalizeLibraryVersionModerationItem(row)));
}

/**
 * Calculates the reputation delta for one community event.
 *
 * @param {AnyRecord|string} event
 * @returns {number}
 */
export function calculateCommunityReputationChange(event: AnyRecord|string): number {
    const type = typeof event === 'string' ? event : event?.type;
    const count = Math.max(1, Number((typeof event === 'object' && event.count) || 1));
    const likes = Math.max(0, Number((typeof event === 'object' && event.likes) || 0));
    return computeReputationDelta(type, { count, likes });
}

/**
 * Computa o delta de reputação a partir do tipo e contadores.
 * @param {any} type
 * @param {{ count: number, likes: number }} counts
 * @returns {number}
 */
function computeReputationDelta(type: any, counts: { count: number; likes: number }): number {
    if (type === 'contribution_approved' || type === 'edit_approved' || type === 'approved') {
        return COMMUNITY_REPUTATION_POINTS.contribution_approved + counts.likes * COMMUNITY_REPUTATION_POINTS.like_received;
    }
    if (type === 'contribution_rejected' || type === 'edit_rejected' || type === 'rejected') {
        return COMMUNITY_REPUTATION_POINTS.contribution_rejected;
    }
    if (type === 'like_received') {
        return COMMUNITY_REPUTATION_POINTS.like_received * counts.count;
    }
    if (type === 'comment_helpful') {
        return COMMUNITY_REPUTATION_POINTS.comment_helpful * counts.count;
    }
    if (type === 'discussion_resolved') {
        return COMMUNITY_REPUTATION_POINTS.discussion_resolved;
    }
    if (type === 'review_performed') {
        return COMMUNITY_REPUTATION_POINTS.review_performed;
    }
    return 0;
}

/**
 * Determines the rank title from total reputation and category scores.
 *
 * @param {number} reputation
 * @param {Record<string, number>} [categoryScores]
 * @returns {string}
 */
export function getCommunityRankTitle(reputation: number, categoryScores: Record<string, number> = {}): string {
    const expertCategory = Object.entries(categoryScores).find(([, score]) => Number(score) >= 1000)?.[0];
    if (expertCategory) {
        return `Especialista em ${expertCategory}`;
    }

    const ranks = [
        { min: 10000, title: 'Lenda da Comunidade' },
        { min: 5000, title: 'Mestre Cart\u00f3grafo' },
        { min: 2000, title: 'Especialista' },
        { min: 1000, title: 'Cart\u00f3grafo S\u00eanior' },
        { min: 600, title: 'Cart\u00f3grafo' },
        { min: 300, title: 'Cart\u00f3grafo J\u00fanior' },
        { min: 100, title: 'Explorador' },
        { min: 0, title: 'Novato' },
    ];
    return ranks.find((rank) => reputation >= rank.min)?.title || 'Novato';
}

/**
 * Returns badge codes earned by a contributor profile.
 *
 * @param {AnyRecord} profile
 * @returns {string[]}
 */
export function deriveCommunityBadges(profile: AnyRecord = {}): string[] {
    const approved = readContributionsApproved(profile);
    const rejected = readContributionsRejected(profile);
    const totalLikes = readTotalLikesReceived(profile);
    const reviewsCount = readReviewsCount(profile);
    const categoryScores = readCategoryScores(profile);

    const badges: string[] = [];
    if (qualifiesFirstContribution(approved)) badges.push('first_contribution');
    if (qualifiesQualityPerfect(approved, rejected)) badges.push('quality_perfect');
    if (qualifiesSocialButterfly(totalLikes)) badges.push('social_butterfly');
    if (qualifiesCuratorApprentice(reviewsCount)) badges.push('curator_apprentice');
    if (qualifiesCategoryExpert(categoryScores)) badges.push('category_expert');
    return badges;
}

/**
 * Lê o número de contribuições aprovadas do perfil.
 * @param {AnyRecord} profile
 * @returns {number}
 */
function readContributionsApproved(profile: AnyRecord): number {
    return Number(profile.contributionsApproved ?? profile.contributions_approved ?? profile.approvedEdits ?? 0);
}

/**
 * Lê o número de contribuições rejeitadas do perfil.
 * @param {AnyRecord} profile
 * @returns {number}
 */
function readContributionsRejected(profile: AnyRecord): number {
    return Number(profile.contributionsRejected ?? profile.contributions_rejected ?? profile.rejectedEdits ?? 0);
}

/**
 * Lê o total de curtidas recebidas do perfil.
 * @param {AnyRecord} profile
 * @returns {number}
 */
function readTotalLikesReceived(profile: AnyRecord): number {
    return Number(profile.totalLikesReceived ?? profile.total_likes_received ?? 0);
}

/**
 * Lê o número de reviews do perfil.
 * @param {AnyRecord} profile
 * @returns {number}
 */
function readReviewsCount(profile: AnyRecord): number {
    return Number(profile.reviewsCount ?? profile.reviews_count ?? 0);
}

/**
 * Lê o mapa de escores por categoria do perfil.
 * @param {AnyRecord} profile
 * @returns {AnyRecord}
 */
function readCategoryScores(profile: AnyRecord): AnyRecord {
    return profile.categoryScores || profile.category_scores || {};
}

/**
 * Verifica se o perfil qualifica-se para o badge de primeira contribuição.
 * @param {number} approved
 * @returns {boolean}
 */
function qualifiesFirstContribution(approved: number): boolean {
    return approved >= 1;
}

/**
 * Verifica se o perfil qualifica-se para o badge de qualidade perfeita.
 * @param {number} approved
 * @param {number} rejected
 * @returns {boolean}
 */
function qualifiesQualityPerfect(approved: number, rejected: number): boolean {
    return approved >= 10 && rejected === 0;
}

/**
 * Verifica se o perfil qualifica-se para o badge social.
 * @param {number} totalLikes
 * @returns {boolean}
 */
function qualifiesSocialButterfly(totalLikes: number): boolean {
    return totalLikes >= 50;
}

/**
 * Verifica se o perfil qualifica-se para o badge de aprendiz de curador.
 * @param {number} reviewsCount
 * @returns {boolean}
 */
function qualifiesCuratorApprentice(reviewsCount: number): boolean {
    return reviewsCount >= 10;
}

/**
 * Verifica se o perfil qualifica-se para o badge de especialista de categoria.
 * @param {AnyRecord} categoryScores
 * @returns {boolean}
 */
function qualifiesCategoryExpert(categoryScores: AnyRecord): boolean {
    return Object.values(categoryScores).some((score) => Number(score) >= 1000);
}

/**
 * Applies a reputation event and returns a new frozen contributor profile.
 *
 * @param {AnyRecord} profile
 * @param {AnyRecord|string} event
 * @returns {Readonly<object>}
 */
export function applyCommunityReputationEvent(profile: AnyRecord = {}, event: AnyRecord|string = {}): Readonly<object> {
    const type = typeof event === 'string' ? event : event?.type;
    const delta = calculateCommunityReputationChange(event);
    const category = typeof event === 'object' ? event.category : null;

    const next = buildReputationProfileBase(profile, delta, category);
    applyReputationCountUpdates(next, type, event);

    next.badges = computeUpdatedReputationBadges(profile, next);
    next.rankTitle = getCommunityRankTitle(next.score, next.categoryScores);
    next.updatedAt = resolveReputationTimestamp(event);

    return Object.freeze({
        ...next,
        categoryScores: Object.freeze({ ...next.categoryScores }),
        badges: Object.freeze([...next.badges]),
    });
}

/**
 * Constrói o perfil de reputação base com os valores atuais + delta.
 * @param {AnyRecord} profile
 * @param {number} delta
 * @param {string|null} category
 * @returns {AnyRecord}
 */
function buildReputationProfileBase(profile: AnyRecord, delta: number, category: string | null): AnyRecord {
    const categoryScores = buildUpdatedCategoryScores(profile, delta, category);
    return {
        userId: profile.userId || profile.user_id || null,
        score: Number(profile.score ?? profile.totalScore ?? 0) + delta,
        contributionsApproved: Number(profile.contributionsApproved ?? profile.contributions_approved ?? 0),
        contributionsRejected: Number(profile.contributionsRejected ?? profile.contributions_rejected ?? 0),
        totalLikesReceived: Number(profile.totalLikesReceived ?? profile.total_likes_received ?? 0),
        reviewsCount: Number(profile.reviewsCount ?? profile.reviews_count ?? 0),
        categoryScores,
    };
}

/**
 * Calcula o conjunto atualizado de badges do perfil.
 * @param {AnyRecord} profile
 * @param {AnyRecord} next
 * @returns {string[]}
 */
function computeUpdatedReputationBadges(profile: AnyRecord, next: AnyRecord): string[] {
    const badgeSet = new Set([
        ...(Array.isArray(profile.badges) ? profile.badges : []),
        ...deriveCommunityBadges(next),
    ]);
    return [...badgeSet].sort();
}

/**
 * Resolve o timestamp de atualização do perfil.
 * @param {AnyRecord|string} event
 * @returns {string}
 */
function resolveReputationTimestamp(event: AnyRecord | string): string {
    return (typeof event === 'object' && (event.createdAt || event.created_at)) || new Date().toISOString();
}

/**
 * Atualiza os escores de categoria com o delta do evento.
 * @param {AnyRecord} profile
 * @param {number} delta
 * @param {string|null} category
 * @returns {Record<string, number>}
 */
function buildUpdatedCategoryScores(
    profile: AnyRecord,
    delta: number,
    category: string | null,
): Record<string, number> {
    const categoryScores = { ...(profile.categoryScores || profile.category_scores || {}) };
    if (category && delta !== 0) {
        categoryScores[category] = Number(categoryScores[category] || 0) + delta;
    }
    return categoryScores;
}

/**
 * Aplica atualizações de contadores de reputação conforme o tipo de evento.
 * @param {AnyRecord} next
 * @param {string|null} type
 * @param {AnyRecord|string} event
 */
function applyReputationCountUpdates(next: AnyRecord, type: string | null, event: AnyRecord | string): void {
    const likes = Math.max(0, Number((typeof event === 'object' && event.likes) || 0));
    if (type === 'contribution_approved' || type === 'edit_approved' || type === 'approved') {
        next.contributionsApproved += 1;
        next.totalLikesReceived += likes;
    } else if (type === 'contribution_rejected' || type === 'edit_rejected' || type === 'rejected') {
        next.contributionsRejected += 1;
    } else if (type === 'like_received') {
        next.totalLikesReceived += Math.max(1, Number((typeof event === 'object' && event.count) || 1));
    } else if (type === 'review_performed') {
        next.reviewsCount += 1;
    }
}
