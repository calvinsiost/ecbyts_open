// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE TAG VALIDATOR - pure duplicate/conflict/alias detector.

   Reads the tag identities collected across P&ID, BIM/IFC, sensor,
   historian and digital twin sources (see PipelinePidDigitalTwinBinding
   in ./pipelinePidDiagramBridge.ts and section 10.5 of
   docs/specs/features/SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md)
   and reports duplicate canonical tags, cross-source divergence and
   orphan aliases as structured findings. No DOM, no storage, no network.
   ================================================================ */

export type PipelineTagSource = 'pid' | 'bim' | 'sensor' | 'historian' | 'twin';

export type PipelineTagValidationFindingType =
    | 'duplicate-canonical-tag'
    | 'source-divergence'
    | 'orphan-alias';

export type PipelineTagValidationSeverity = 'error' | 'warning';

/**
 * One tag identity entry as reported by a single source (P&ID, BIM/IFC,
 * sensor, historian or digital twin). `canonical` entries declare a tag
 * of record; `aliasOf` entries point at the canonical tag they refer to.
 */
export interface PipelineTagEntry {
    tag: string;
    source: PipelineTagSource;
    canonical: boolean;
    aliasOf?: string;
    unit?: string;
    description?: string;
    ownerItemId?: string;
}

export interface PipelineTagValidationFinding {
    type: PipelineTagValidationFindingType;
    severity: PipelineTagValidationSeverity;
    tags: string[];
    sources: PipelineTagSource[];
    blocksPublish: boolean;
    technicalMessage: string;
}

export interface PipelineTagValidationResult {
    valid: boolean;
    blocksPublish: boolean;
    findings: PipelineTagValidationFinding[];
    counts: {
        entries: number;
        duplicateCanonicalTags: number;
        sourceDivergences: number;
        orphanAliases: number;
    };
}

/**
 * Groups tag entries by their normalized canonical tag name.
 * @param items Raw tag entries collected from all sources.
 */
function _groupByCanonicalTag(items: PipelineTagEntry[]): Map<string, PipelineTagEntry[]> {
    const groups = new Map<string, PipelineTagEntry[]>();
    for (const item of items) {
        if (!item.canonical) continue;
        const key = _normalizeTag(item.tag);
        if (!key) continue;
        const bucket = groups.get(key) ?? [];
        bucket.push(item);
        groups.set(key, bucket);
    }
    return groups;
}

/** Normalizes a tag for comparison: trims and uppercases. */
function _normalizeTag(tag: string | undefined): string {
    return (tag ?? '').trim().toUpperCase();
}

/**
 * Detects the same canonical tag declared by two or more entries.
 * Duplicate canonical tags block publication because downstream
 * consumers (P&ID, BIM/IFC, sensor, historian, twin) cannot resolve
 * which entry is authoritative.
 */
function _findDuplicateCanonicalTags(items: PipelineTagEntry[]): PipelineTagValidationFinding[] {
    const findings: PipelineTagValidationFinding[] = [];
    const groups = _groupByCanonicalTag(items);
    for (const [key, entries] of groups) {
        if (entries.length < 2) continue;
        const sources = _uniqueSources(entries);
        findings.push({
            type: 'duplicate-canonical-tag',
            severity: 'error',
            tags: [key],
            sources,
            blocksPublish: true,
            technicalMessage:
                `Canonical tag "${key}" is declared ${entries.length}x ` +
                `(sources: ${sources.join(', ')}). Exactly one entry must own the canonical tag.`,
        });
    }
    return findings;
}

/** Returns the sorted, de-duplicated list of sources present in a group. */
function _uniqueSources(entries: PipelineTagEntry[]): PipelineTagSource[] {
    return Array.from(new Set(entries.map((entry) => entry.source))).sort();
}

/**
 * Detects divergent metadata (unit or description) for the same
 * canonical tag reported by two or more different sources. Divergence
 * is a warning, not a publish blocker: sources may legitimately be
 * mid-reconciliation, but the conflict must be surfaced.
 */
function _findSourceDivergence(items: PipelineTagEntry[]): PipelineTagValidationFinding[] {
    const findings: PipelineTagValidationFinding[] = [];
    const groups = _groupByCanonicalTag(items);
    for (const [key, entries] of groups) {
        if (entries.length < 2) continue;
        const conflict = _detectMetadataConflict(entries);
        if (!conflict) continue;
        findings.push({
            type: 'source-divergence',
            severity: 'warning',
            tags: [key],
            sources: _uniqueSources(entries),
            blocksPublish: false,
            technicalMessage: conflict,
        });
    }
    return findings;
}

/**
 * Compares unit and description across entries sharing a canonical tag
 * and returns a technical message describing the first conflict found,
 * or an empty string when metadata agrees (ignoring blank values).
 */
function _detectMetadataConflict(entries: PipelineTagEntry[]): string {
    const units = _uniqueNonEmpty(entries.map((entry) => entry.unit));
    if (units.length > 1) {
        return `Unit mismatch across sources: ${units.join(' vs ')}.`;
    }
    const descriptions = _uniqueNonEmpty(entries.map((entry) => entry.description));
    if (descriptions.length > 1) {
        return `Description mismatch across sources: ${descriptions.join(' vs ')}.`;
    }
    return '';
}

/** Returns unique, trimmed, non-empty string values preserving first-seen order. */
function _uniqueNonEmpty(values: Array<string | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const trimmed = (value ?? '').trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
}

/**
 * Detects `aliasOf` references that do not resolve to any canonical tag
 * present in the set. Orphan aliases block publication because the
 * digital twin / IFC binding would point nowhere.
 */
function _findOrphanAliases(items: PipelineTagEntry[]): PipelineTagValidationFinding[] {
    const canonicalKeys = new Set(
        items.filter((item) => item.canonical).map((item) => _normalizeTag(item.tag)),
    );
    const findings: PipelineTagValidationFinding[] = [];
    for (const item of items) {
        if (item.canonical || !item.aliasOf) continue;
        const target = _normalizeTag(item.aliasOf);
        if (canonicalKeys.has(target)) continue;
        findings.push({
            type: 'orphan-alias',
            severity: 'error',
            tags: [_normalizeTag(item.tag), target],
            sources: [item.source],
            blocksPublish: true,
            technicalMessage:
                `Alias "${item.tag}" (source: ${item.source}) points to "${item.aliasOf}", ` +
                `which is not a declared canonical tag.`,
        });
    }
    return findings;
}

/**
 * Validates a set of tag entries collected across P&ID, BIM/IFC,
 * sensor, historian and digital twin sources. Detects duplicate
 * canonical tags, metadata divergence between sources sharing a
 * canonical tag, and aliases that do not resolve to any canonical tag.
 * @param items Tag entries to validate. Order does not affect the result.
 */
export function validatePipelineTags(items: PipelineTagEntry[]): PipelineTagValidationResult {
    const safeItems = Array.isArray(items) ? items : [];
    const findings: PipelineTagValidationFinding[] = [
        ..._findDuplicateCanonicalTags(safeItems),
        ..._findSourceDivergence(safeItems),
        ..._findOrphanAliases(safeItems),
    ];
    const counts = {
        entries: safeItems.length,
        duplicateCanonicalTags: findings.filter((f) => f.type === 'duplicate-canonical-tag').length,
        sourceDivergences: findings.filter((f) => f.type === 'source-divergence').length,
        orphanAliases: findings.filter((f) => f.type === 'orphan-alias').length,
    };
    return {
        valid: findings.length === 0,
        blocksPublish: findings.some((f) => f.blocksPublish),
        findings,
        counts,
    };
}
