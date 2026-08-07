// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { getSupabaseClient } from '../../utils/auth/session.js';

import { slugify as _slugifyCanonical } from '../../utils/helpers/slugify.js';
import { safeJsonParse } from '../../utils/helpers/safeJsonParse.js';

type SupabaseClientLike = {
    from(table: string): any;
    rpc(fn: string, args?: Record<string, unknown>): any;
    schema?(schema: string): SupabaseClientLike;
};

export type TemporalAggregation = 'daily_mean' | 'weekly_mean' | 'monthly_mean';

export interface CreateSliceInput {
    radarId: string;
    projectId: string;
    name: string;
    profileId: string;
    includePaths?: string[];
    excludePaths?: string[];
    temporalFilter?: TemporalFilter | null;
    spatialFilter?: { bbox?: BBox | null } | null;
    redaction?: { pii?: 'none' | 'mask' | 'remove'; precision?: number } | null;
    rateLimit?: { requests_per_hour?: number; max_records_per_request?: number } | null;
    billing?: { required?: boolean; amount_brl?: number; period?: 'monthly' | 'annual' | 'one-time'; currency?: string } | null;
    expiresAt?: string | null;
}

export interface TemporalFilter {
    from?: string | null;
    to?: string | null;
    aggregation?: TemporalAggregation | string | null;
}

type BBox = [number, number, number, number];

const TEMPORAL_AGGS = Object.freeze(['daily_mean', 'weekly_mean', 'monthly_mean'] as const);

function isTemporalAggregation(value: unknown): value is TemporalAggregation {
    return typeof value === 'string' && (TEMPORAL_AGGS as readonly string[]).includes(value);
}

function ensureClient(): SupabaseClientLike {
    const client = getSupabaseClient() as SupabaseClientLike | null | undefined;
    if (!client) throw new Error('[radar:sliceManager] Supabase nao inicializado.');
    return client;
}

function apiSchemaClient(client: SupabaseClientLike): SupabaseClientLike {
    return typeof client.schema === 'function' ? client.schema('api') : client;
}

function parseRpcData(data: unknown): any {
    if (typeof data !== 'string') return data;
    return safeJsonParse(data, data);
}

function slugify(input: string): string {
    return _slugifyCanonical(input, { separator: '_', maxLength: 64 });
}

function validateCreateSliceInput(input: CreateSliceInput): void {
    if (!input || typeof input !== 'object') {
        throw new Error('[radar:sliceManager] input obrigatorio.');
    }
    if (!input.radarId) throw new Error('[radar:sliceManager] radarId obrigatorio.');
    if (!input.projectId) throw new Error('[radar:sliceManager] projectId obrigatorio.');
    if (!input.name) throw new Error('[radar:sliceManager] name obrigatorio.');
    if (!input.profileId) throw new Error('[radar:sliceManager] profileId obrigatorio.');

    if (input.temporalFilter?.aggregation && !isTemporalAggregation(input.temporalFilter.aggregation)) {
        throw new Error(`[radar:sliceManager] aggregation invalida: ${input.temporalFilter.aggregation}`);
    }
}

function buildSliceRow(input: CreateSliceInput): Record<string, unknown> {
    return {
        radar_id: input.radarId,
        project_id: input.projectId,
        name: input.name,
        slug: slugify(input.name),
        profile_id: input.profileId,
        include_paths: Array.isArray(input.includePaths) ? input.includePaths : [],
        exclude_paths: Array.isArray(input.excludePaths) ? input.excludePaths : [],
        temporal_filter: input.temporalFilter || null,
        spatial_filter: input.spatialFilter || null,
        redaction: input.redaction || null,
        rate_limit: input.rateLimit || null,
        billing: input.billing || null,
        expires_at: input.expiresAt || null,
    };
}

export async function createSlice(input: CreateSliceInput): Promise<Readonly<Record<string, unknown>>> {
    validateCreateSliceInput(input);

    const client = ensureClient();
    const row = buildSliceRow(input);

    const { data, error } = await apiSchemaClient(client).rpc('create_radar_slice', {
        p_payload: row,
    });
    if (error) {
        throw new Error(`[radar:sliceManager] insert falhou: ${error.message || error}`);
    }
    return Object.freeze(parseRpcData(data) as Record<string, unknown>);
}

function compileGlob(pattern: string): RegExp {
    if (typeof pattern !== 'string' || !pattern) {
        return /^$/;
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const sentinel = '@@RECURSIVE@@';
    const withDouble = escaped.replace(/\*\*/g, sentinel);
    const withSingle = withDouble.replace(/\*/g, '[^/]*');
    const finalPattern = withSingle.split(sentinel).join('.*');
    return new RegExp(`^${finalPattern}$`);
}

function matchesAny(path: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        if (compileGlob(pattern).test(path)) return true;
    }
    return false;
}

export function expandPathPattern(pattern: string, dataKeys: string[]): readonly string[] {
    if (!Array.isArray(dataKeys)) return Object.freeze([]);
    const re = compileGlob(String(pattern || ''));
    const out: string[] = [];
    for (const key of dataKeys) {
        if (typeof key === 'string' && re.test(key)) out.push(key);
    }
    return Object.freeze(out);
}

export function applyPathFilters(
    data: Record<string, unknown>,
    includePaths?: string[],
    excludePaths?: string[],
): Record<string, unknown> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const include = Array.isArray(includePaths) ? includePaths : [];
    const exclude = Array.isArray(excludePaths) ? excludePaths : [];
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(data)) {
        if (exclude.length && matchesAny(key, exclude)) continue;
        if (include.length && !matchesAny(key, include)) continue;
        out[key] = data[key];
    }
    return out;
}

function parseDate(value: unknown): number | null {
    if (!value) return null;
    const t = Date.parse(String(value));
    return Number.isFinite(t) ? t : null;
}

function recordTimestamp(record: unknown): number | null {
    if (!record || typeof record !== 'object') return null;
    const row = record as Record<string, unknown>;
    const candidate =
        row.timestamp ||
        row.time ||
        row.date ||
        row.datetime ||
        row.measured_at ||
        row.collected_at ||
        null;
    return parseDate(candidate);
}

function bucketKey(ts: number, agg: TemporalAggregation): string {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (agg === 'monthly_mean') return `${y}-${String(m + 1).padStart(2, '0')}`;
    if (agg === 'weekly_mean') {
        const onejan = Date.UTC(y, 0, 1);
        const week = Math.ceil(((ts - onejan) / 86400000 + new Date(onejan).getUTCDay() + 1) / 7);
        return `${y}-W${String(week).padStart(2, '0')}`;
    }
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

interface BucketEntry {
    sum: number;
    count: number;
}

function aggregateRecords(records: unknown[], agg: TemporalAggregation): Array<Record<string, unknown>> {
    const buckets = new Map<string, BucketEntry>();
    for (const rec of records) {
        const ts = recordTimestamp(rec);
        if (ts === null) continue;
        const key = bucketKey(ts, agg);
        const row = rec as Record<string, unknown>;
        const v = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null;
        const entry = buckets.get(key) || { sum: 0, count: 0 };
        if (v !== null) {
            entry.sum += v;
            entry.count += 1;
        }
        buckets.set(key, entry);
    }
    const out: Array<Record<string, unknown>> = [];
    for (const [key, entry] of buckets.entries()) {
        out.push({
            bucket: key,
            aggregation: agg,
            value: entry.count > 0 ? entry.sum / entry.count : null,
            count: entry.count,
        });
    }
    return out;
}

function filterRecordsByDateRange(records: unknown[], fromTs: number | null, toTs: number | null): unknown[] {
    return records.filter((rec) => {
        const ts = recordTimestamp(rec);
        if (ts === null) return true;
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
        return true;
    });
}

function applyTemporalFilterToObject(
    data: Record<string, unknown>,
    filterArr: (arr: unknown[]) => unknown[],
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
        const value = data[key];
        out[key] = Array.isArray(value) ? filterArr(value) : value;
    }
    return out;
}

export function applyTemporalFilter(data: unknown, filter: TemporalFilter): unknown {
    if (!filter || typeof filter !== 'object') return data;
    const fromTs = parseDate(filter.from || null);
    const toTs = parseDate(filter.to || null);
    const agg = filter.aggregation || null;
    if (agg && !isTemporalAggregation(agg)) {
        throw new Error(`[radar:sliceManager] aggregation invalida: ${agg}`);
    }
    const validatedAgg = agg as TemporalAggregation | null;

    const filterArr = (arr: unknown[]): unknown[] => {
        const kept = filterRecordsByDateRange(arr, fromTs, toTs);
        return validatedAgg ? aggregateRecords(kept, validatedAgg) : kept;
    };

    if (Array.isArray(data)) {
        return filterArr(data);
    }
    if (data && typeof data === 'object') {
        return applyTemporalFilterToObject(data as Record<string, unknown>, filterArr);
    }
    return data;
}

type LonLatPair = readonly [number, number];

type PointCandidate = {
    readonly lon?: unknown;
    readonly lat?: unknown;
    readonly lng?: unknown;
    readonly longitude?: unknown;
    readonly latitude?: unknown;
};

function extractLonLatFromPairs(row: PointCandidate): LonLatPair | null {
    if (typeof row.lon === 'number' && typeof row.lat === 'number') return [row.lon, row.lat];
    if (typeof row.lng === 'number' && typeof row.lat === 'number') return [row.lng, row.lat];
    if (typeof row.longitude === 'number' && typeof row.latitude === 'number') {
        return [row.longitude, row.latitude];
    }
    return null;
}

function extractLonLatFromGeometry(geometry: unknown): LonLatPair | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const geo = geometry as { readonly type?: unknown; readonly coordinates?: unknown };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
        const lon = geo.coordinates[0];
        const lat = geo.coordinates[1];
        if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
    }
    return null;
}

function recordLonLat(rec: unknown): LonLatPair | null {
    if (!rec || typeof rec !== 'object') return null;
    const row = rec as Record<string, unknown>;

    const fromPairs = extractLonLatFromPairs(row as PointCandidate);
    if (fromPairs) return fromPairs;

    const fromGeometry = extractLonLatFromGeometry(row.geometry);
    if (fromGeometry) return fromGeometry;

    if (row.type === 'Point' && Array.isArray(row.coordinates)) {
        const coordinates = row.coordinates as unknown[];
        if (coordinates.length >= 2) {
            const lon = coordinates[0];
            const lat = coordinates[1];
            if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
        }
    }
    return null;
}

export function applySpatialFilter(data: unknown, bbox?: BBox | null): unknown {
    if (!Array.isArray(bbox) || bbox.length !== 4) return data;
    const [lonMin, latMin, lonMax, latMax] = bbox.map((n) => Number(n)) as BBox;
    if ([lonMin, latMin, lonMax, latMax].some((n) => !Number.isFinite(n))) return data;

    const inside = (rec: unknown): boolean => {
        const coords = recordLonLat(rec);
        if (!coords) return true;
        const [lon, lat] = coords;
        return lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax;
    };

    if (Array.isArray(data)) {
        return data.filter(inside);
    }
    if (data && typeof data === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(data)) {
            const value = (data as Record<string, unknown>)[key];
            out[key] = Array.isArray(value) ? value.filter(inside) : value;
        }
        return out;
    }
    return data;
}
