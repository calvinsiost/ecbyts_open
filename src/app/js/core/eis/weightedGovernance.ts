// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EIS Weighted Governance (9.62c)
 *
 * Runtime contract for scope-weight precedence resolution and deterministic
 * aggregation-key generation.
 */

export const EIS_AGGREGATION_SCOPES = Object.freeze([
    'campaign',
    'area',
    'collection',
    'family',
    'stamp',
    'document',
    'group',
    'element',
    'parameter',
    'matrix',
    'mixed',
    'global_default',
]);

export const EIS_PRECEDENCE = Object.freeze([
    'mixed',
    'document',
    'stamp',
    'element',
    'parameter',
    'matrix',
    'group',
    'collection',
    'family',
    'area',
    'campaign',
    'global_default',
]);

/**
 * @param {unknown} v
 * @param {number} [fallback=1]
 * @returns {number}
 */
function _num(v: unknown, fallback = 1): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function _safeScope(v: unknown): string {
    const s = String(v || '').trim();
    return EIS_AGGREGATION_SCOPES.includes(s) ? s : 'global_default';
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function _safeKey(v: unknown): string {
    const raw = String(v || 'default')
        .trim()
        .toLowerCase();
    return raw.length > 0 ? raw : 'default';
}

/**
 * Build deterministic aggregation key used by calculator/runtime filters.
 * Example: `area:site-a`.
 *
 * @param {string} scope
 * @param {string} key
 * @returns {string}
 */
export function buildAggregationKey(scope: string, key: string): string {
    return `${_safeScope(scope)}:${_safeKey(key)}`;
}

interface ScopeRow {
    scope: string;
    key: string;
    weight: number;
    axis: string | undefined;
    reason: string | undefined;
    source: string;
}

interface NormalizedPack {
    id: string;
    version: string;
    scopes: ScopeRow[];
}

/**
 * @typedef {object} ScopeRow
 * @property {string} scope
 * @property {string} key
 * @property {number} weight
 * @property {string|undefined} axis
 * @property {string|undefined} reason
 * @property {string} source
 */

/**
 * @typedef {object} NormalizedPack
 * @property {string} id
 * @property {string} version
 * @property {ScopeRow[]} scopes
 */

/**
 * Normalize raw governance pack into deterministic record list.
 *
 * @param {unknown} pack
 * @returns {NormalizedPack}
 */
export function normalizeGovernancePack(pack: unknown): NormalizedPack {
    const packRecord = /** @type {Record<string, any>} */ (
        (pack && typeof pack === 'object' ? pack : {}) as Record<string, unknown>
    );
    const scopesRaw = Array.isArray(packRecord.scopes) ? packRecord.scopes : [];
    const scopes = scopesRaw.map((row: unknown): ScopeRow => {
        const r = /** @type {Record<string, any>} */ (
            (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
        );
        return {
            scope: _safeScope(r.scope),
            key: _safeKey(r.key),
            weight: Math.max(0, _num(r.weight, 1)),
            axis: r.axis ? String(r.axis) : undefined,
            reason: r.reason ? String(r.reason) : undefined,
            source: r.source === 'sql' ? 'sql' : 'runtime',
        };
    });
    return {
        id: String(packRecord.id || 'eis-governance-default'),
        version: String(packRecord.version || 'v1'),
        scopes,
    };
}

interface WeightResult {
    scope: string;
    key: string;
    weight: number;
    source: string;
    matched: boolean;
    aggregationKey: string;
}

/**
 * @typedef {object} ResolveWeightContext
 * @property {Record<string, string>} [scopeValues]
 * @property {string} [axis]
 */

/**
 * @typedef {object} WeightResult
 * @property {string} scope
 * @property {string} key
 * @property {number} weight
 * @property {string} source
 * @property {boolean} matched
 * @property {string} aggregationKey
 */

/**
 * Resolve applicable weighted rule by precedence chain.
 *
 * @param {unknown} pack
 * @param {ResolveWeightContext} [ctx={}]
 * @returns {WeightResult}
 */
export function resolveWeight(pack: unknown, ctx: { scopeValues?: Record<string, string>; axis?: string } = {}): WeightResult {
    const normalized = normalizeGovernancePack(pack);
    /** @type {Record<string, string>} */
    const scopeValues = ctx.scopeValues && typeof ctx.scopeValues === 'object' ? ctx.scopeValues : {};
    const axis = ctx.axis ? String(ctx.axis) : null;

    for (const scope of EIS_PRECEDENCE) {
        const expectedKey = _safeKey(scopeValues[scope] || (scope === 'global_default' ? 'default' : ''));
        if (!expectedKey && scope !== 'global_default') continue;
        const row = normalized.scopes.find((r) => {
            if (r.scope !== scope) return false;
            if (axis && r.axis && r.axis !== axis) return false;
            return r.key === expectedKey;
        });
        if (row) {
            return {
                scope: row.scope,
                key: row.key,
                weight: row.weight,
                source: row.source || 'runtime',
                matched: true,
                aggregationKey: buildAggregationKey(row.scope, row.key),
            };
        }
    }

    return {
        scope: 'global_default',
        key: 'default',
        weight: 1,
        source: 'runtime',
        matched: false,
        aggregationKey: buildAggregationKey('global_default', 'default'),
    };
}

/**
 * Enumerate unique aggregation keys declared in pack.
 *
 * @param {unknown} pack
 * @returns {string[]}
 */
export function listAggregationKeys(pack: unknown): string[] {
    const normalized = normalizeGovernancePack(pack);
    return [...new Set(normalized.scopes.map((r) => buildAggregationKey(r.scope, r.key)))];
}
