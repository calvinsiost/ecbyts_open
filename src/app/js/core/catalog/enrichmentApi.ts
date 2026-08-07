/**
 * enrichmentApi.js - API adapter helpers for Library Community Enrichment.
 *
 * This module keeps Supabase/PostgREST persistence logic separate from the
 * pure moderation store. Callers inject a Supabase-compatible client so tests
 * can validate request shape without booting auth/session code.
 *
 * @module enrichmentApi
 * @license AGPL-3.0-only
 */

import { applyCommunityReviewDecision, createLibraryCommunityContribution } from './enrichmentSchema.js';

type ContribRow = Record<string, any>;
type SupabaseLike = { from: (table: string) => any };
type SupabaseResult = { data?: any; error?: { message?: string } };

export const LIBRARY_COMMUNITY_CONTRIBUTIONS_TABLE = 'library_contributions';
export const LIBRARY_COMMUNITY_CONTRIBUTION_SELECT = [
    'id',
    'project_id',
    'contributor_id',
    'record_id',
    'contribution_type',
    'changes_json',
    'justification',
    'data_source',
    'source_url',
    'source_date',
    'spatial_accuracy',
    'license_confirmed',
    'status',
    'reviewer_id',
    'review_notes',
    'reviewed_at',
    'created_at',
    'updated_at',
].join(',');

function assertClient(client: any): SupabaseLike {
    if (!client || typeof client.from !== 'function') {
        throw new TypeError('Supabase-compatible client required');
    }
    return client;
}

function throwOnError(result: SupabaseResult | null | undefined, fallbackMessage: string): any {
    if (result?.error) {
        throw new Error(result.error.message || fallbackMessage);
    }
    return result?.data ?? null;
}

function parseJsonObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_err) {
            return {};
        }
    }
    return {};
}

/**
 * Normalizes one `library_contributions` row into the domain contribution shape.
 *
 * @param row
 */
export function normalizeLibraryCommunityContributionRow(row: ContribRow = {}): Readonly<object> {
    return createLibraryCommunityContribution({
        id: row.id,
        projectId: row.projectId ?? row.project_id ?? null,
        contributorId: row.contributorId ?? row.contributor_id,
        recordId: row.recordId ?? row.record_id,
        contributionType: row.contributionType ?? row.contribution_type,
        changes: parseJsonObject(row.changes ?? row.changes_json),
        justification: row.justification,
        dataSource: row.dataSource ?? row.data_source,
        sourceUrl: row.sourceUrl ?? row.source_url,
        sourceDate: row.sourceDate ?? row.source_date,
        spatialAccuracy: row.spatialAccuracy ?? row.spatial_accuracy,
        licenseConfirmed: row.licenseConfirmed ?? row.license_confirmed,
        status: row.status,
        reviewerId: row.reviewerId ?? row.reviewer_id ?? null,
        reviewNotes: row.reviewNotes ?? row.review_notes ?? null,
        reviewedAt: row.reviewedAt ?? row.reviewed_at ?? null,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
        sensitive: Boolean(row.sensitive),
    });
}

/**
 * Serializes a domain contribution into the current Supabase migration columns.
 *
 * @param fields
 */
export function serializeLibraryCommunityContributionForApi(fields: Record<string, any> = {}): Readonly<object> {
    const contribution: any = createLibraryCommunityContribution(fields);
    return Object.freeze({
        id: contribution.id || undefined,
        project_id: contribution.projectId,
        contributor_id: contribution.contributorId,
        record_id: contribution.recordId,
        contribution_type: contribution.contributionType,
        changes_json: contribution.changes,
        justification: contribution.justification,
        data_source: contribution.dataSource,
        source_url: contribution.sourceUrl,
        source_date: contribution.sourceDate,
        spatial_accuracy: contribution.spatialAccuracy,
        license_confirmed: contribution.licenseConfirmed,
        status: contribution.status,
        reviewer_id: contribution.reviewerId,
        review_notes: contribution.reviewNotes,
        reviewed_at: contribution.reviewedAt,
        created_at: contribution.createdAt,
        updated_at: contribution.updatedAt,
    });
}

/**
 * Builds the minimal update payload for one curator decision.
 *
 * @param contributionRow
 * @param decision
 */
export function buildLibraryCommunityReviewPatch(
    contributionRow: ContribRow,
    decision: object | string,
): Readonly<object> {
    const reviewed: any = applyCommunityReviewDecision(
        normalizeLibraryCommunityContributionRow(contributionRow),
        decision,
    );
    return Object.freeze({
        status: reviewed.status,
        reviewer_id: reviewed.reviewerId,
        review_notes: reviewed.reviewNotes,
        reviewed_at: reviewed.reviewedAt,
        updated_at: reviewed.updatedAt,
    });
}

/**
 * Inserts one validated contribution through a Supabase-compatible client.
 *
 * @param client
 * @param fields
 */
export async function submitLibraryCommunityContribution(
    client: SupabaseLike,
    fields: Record<string, any>,
): Promise<Readonly<object>> {
    const sb = assertClient(client);
    const row = serializeLibraryCommunityContributionForApi(fields);
    const result = await sb
        .from(LIBRARY_COMMUNITY_CONTRIBUTIONS_TABLE)
        .insert(row)
        .select(LIBRARY_COMMUNITY_CONTRIBUTION_SELECT)
        .single();
    return normalizeLibraryCommunityContributionRow(throwOnError(result, 'submit_library_contribution_failed'));
}

/**
 * Fetches contribution rows for a moderation queue.
 *
 * @param client
 * @param filters
 */
export async function fetchLibraryCommunityContributionQueue(
    client: SupabaseLike,
    filters: { projectId?: string; status?: string; contributorId?: string; recordId?: string } = {},
): Promise<ReadonlyArray<Readonly<object>>> {
    const sb = assertClient(client);
    let query = sb
        .from(LIBRARY_COMMUNITY_CONTRIBUTIONS_TABLE)
        .select(LIBRARY_COMMUNITY_CONTRIBUTION_SELECT)
        .order('created_at', { ascending: true });

    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.contributorId) query = query.eq('contributor_id', filters.contributorId);
    if (filters.recordId) query = query.eq('record_id', filters.recordId);

    const result = await query;
    const rows: ContribRow[] = throwOnError(result, 'fetch_library_contribution_queue_failed') || [];
    return Object.freeze(rows.map((row: ContribRow) => normalizeLibraryCommunityContributionRow(row)));
}

/**
 * Fetches the current row, applies a curator decision, and persists the patch.
 *
 * @param client
 * @param contributionId
 * @param decision
 */
export async function reviewLibraryCommunityContribution(
    client: SupabaseLike,
    contributionId: string,
    decision: object | string,
): Promise<Readonly<object>> {
    const sb = assertClient(client);
    if (typeof contributionId !== 'string' || contributionId.trim().length === 0) {
        throw new TypeError('contributionId must be a non-empty string');
    }

    const currentResult = await sb
        .from(LIBRARY_COMMUNITY_CONTRIBUTIONS_TABLE)
        .select(LIBRARY_COMMUNITY_CONTRIBUTION_SELECT)
        .eq('id', contributionId)
        .maybeSingle(); // 406-safe: contribuicao pode ter sido deletada (0 linhas → data=null)
    if (currentResult?.error || !currentResult?.data) {
        throw new Error(currentResult?.error?.message || 'fetch_library_contribution_failed: contribuicao nao encontrada');
    }
    const currentRow = currentResult.data;
    const patch = buildLibraryCommunityReviewPatch(currentRow, decision);

    const updateResult = await sb
        .from(LIBRARY_COMMUNITY_CONTRIBUTIONS_TABLE)
        .update(patch)
        .eq('id', contributionId)
        .select(LIBRARY_COMMUNITY_CONTRIBUTION_SELECT)
        .single();
    return normalizeLibraryCommunityContributionRow(throwOnError(updateResult, 'review_library_contribution_failed'));
}

/**
 * Convenience factory for callers that want a bound API object.
 *
 * @param client
 */
export function createLibraryCommunityContributionApi(client: SupabaseLike): Readonly<object> {
    assertClient(client);
    return Object.freeze({
        submitContribution: (fields: Record<string, any>) => submitLibraryCommunityContribution(client, fields),
        fetchQueue: (filters?: { projectId?: string; status?: string; contributorId?: string; recordId?: string }) =>
            fetchLibraryCommunityContributionQueue(client, filters),
        reviewContribution: (contributionId: string, decision: object | string) =>
            reviewLibraryCommunityContribution(client, contributionId, decision),
    });
}
