// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE TAG COVERAGE - pure local completeness score for
   P&ID/BIM/twin tag identities.

   Reads the same tag entry shape used by _pipelineTagValidatorPure.ts
   (see PipelineTagSource/PipelineTagEntry there and section 10.4 of
   docs/specs/features/SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md,
   blind spot "Score nao mede completude P&ID/BIM/twin") and computes,
   per tag source category (pid/bim/sensor/historian/twin), the
   percentage of entries with complete data (unit + description).

   It also applies a non-compensatory gate: a base score (0-1000) gets
   capped when any *critical* category falls below the required
   coverage percentage, regardless of how high the base score is.
   This mirrors the cap pattern already used by
   scripts/quality/commercialReadinessScorePure.mjs (stale baseline
   caps grade to 'C' even when the raw score would be 'A'/'B').

   No DOM, no storage, no network, no Date.now().
   ================================================================ */

export type PipelineTagCoverageSource = 'pid' | 'bim' | 'sensor' | 'historian' | 'twin';

/**
 * One tag identity entry as reported by a single source. Shape matches
 * `PipelineTagEntry` from `_pipelineTagValidatorPure.ts` so both modules
 * can consume the same collected list without adapters.
 */
export interface PipelineTagCoverageEntry {
    tag: string;
    source: PipelineTagCoverageSource;
    canonical?: boolean;
    aliasOf?: string;
    unit?: string;
    description?: string;
    ownerItemId?: string;
}

export interface PipelineTagCategoryCoverage {
    total: number;
    complete: number;
    pct: number;
}

export interface PipelineTagCoverageResult {
    present: boolean;
    byCategory: Record<PipelineTagCoverageSource, PipelineTagCategoryCoverage>;
    overallPct: number;
    totalEntries: number;
    totalComplete: number;
}

export const PIPELINE_TAG_COVERAGE_SOURCES: PipelineTagCoverageSource[] = [
    'pid',
    'bim',
    'sensor',
    'historian',
    'twin',
];

/** Returns true when a tag entry has both unit and description filled in. */
function _isCompleteEntry(entry: PipelineTagCoverageEntry): boolean {
    return Boolean(String(entry?.unit ?? '').trim()) && Boolean(String(entry?.description ?? '').trim());
}

/** Builds an empty per-category coverage bucket for every known source. */
function _emptyByCategory(): Record<PipelineTagCoverageSource, PipelineTagCategoryCoverage> {
    const byCategory = {} as Record<PipelineTagCoverageSource, PipelineTagCategoryCoverage>;
    for (const source of PIPELINE_TAG_COVERAGE_SOURCES) {
        byCategory[source] = { total: 0, complete: 0, pct: 0 };
    }
    return byCategory;
}

/** Rounds a ratio to a percentage with two decimal places. Guards against 0/0. */
function _pct(complete: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((complete / total) * 10000) / 100;
}

/**
 * Computes tag completeness coverage grouped by source category
 * (pid/bim/sensor/historian/twin). A tag entry counts as "complete"
 * when it carries both `unit` and `description`. Entries with a
 * `source` outside the known set are ignored (defensive default).
 * @param tags Tag entries collected across P&ID, BIM/IFC, sensor, historian and twin.
 */
export function computeTagCategoryCoverage(
    tags: PipelineTagCoverageEntry[] | null | undefined,
): PipelineTagCoverageResult {
    const safeTags = Array.isArray(tags) ? tags : [];
    const byCategory = _emptyByCategory();

    if (safeTags.length === 0) {
        return {
            present: false,
            byCategory,
            overallPct: 0,
            totalEntries: 0,
            totalComplete: 0,
        };
    }

    let totalEntries = 0;
    let totalComplete = 0;
    for (const entry of safeTags) {
        const source = entry?.source;
        if (!PIPELINE_TAG_COVERAGE_SOURCES.includes(source as PipelineTagCoverageSource)) continue;
        const bucket = byCategory[source as PipelineTagCoverageSource];
        bucket.total += 1;
        totalEntries += 1;
        if (_isCompleteEntry(entry)) {
            bucket.complete += 1;
            totalComplete += 1;
        }
    }

    for (const source of PIPELINE_TAG_COVERAGE_SOURCES) {
        const bucket = byCategory[source];
        bucket.pct = _pct(bucket.complete, bucket.total);
    }

    return {
        present: totalEntries > 0,
        byCategory,
        overallPct: _pct(totalComplete, totalEntries),
        totalEntries,
        totalComplete,
    };
}

export interface PipelineTagCoverageGateResult {
    finalScore: number;
    baseScore: number;
    capped: boolean;
    cappedAt: number | null;
    failingCategories: PipelineTagCoverageSource[];
    reason: string | null;
}

const DEFAULT_CRITICAL_CAP = 799;

/**
 * Clamps a number into the inclusive [lo, hi] range.
 */
function _clamp(value: number, lo: number, hi: number): number {
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

/**
 * Applies a non-compensatory gate to a base score (0-1000): if ANY of
 * the given `criticalCategories` has coverage below `minCriticalPct`,
 * the final score is capped (default cap 799), regardless of how high
 * `baseScore` is and regardless of how well non-critical categories
 * score. This mirrors the repo's existing cap pattern (e.g. a stale
 * commercial-readiness baseline capping grade to 'C' even from a raw
 * 'A'/'B' score) applied to the pipeline tag coverage score.
 * @param baseScore Base score in the 0-1000 unified-score scale.
 * @param coverage Result of `computeTagCategoryCoverage`.
 * @param criticalCategories Categories whose coverage must meet the minimum (e.g. ['pid', 'bim']).
 * @param minCriticalPct Minimum required coverage percentage (0-100) for each critical category.
 * @param cap Score ceiling applied when any critical category fails (default 799).
 */
export function applyTagCoverageGateNonCompensatory(
    baseScore: number,
    coverage: PipelineTagCoverageResult,
    criticalCategories: PipelineTagCoverageSource[],
    minCriticalPct: number,
    cap: number = DEFAULT_CRITICAL_CAP,
): PipelineTagCoverageGateResult {
    const safeBase = _clamp(Number(baseScore) || 0, 0, 1000);
    const safeCritical = Array.isArray(criticalCategories) ? criticalCategories : [];
    const minPct = Number.isFinite(minCriticalPct) ? minCriticalPct : 0;

    const failingCategories = safeCritical.filter((source) => {
        const bucket = coverage?.byCategory?.[source];
        const pct = bucket ? bucket.pct : 0;
        return pct < minPct;
    });

    if (failingCategories.length === 0) {
        return {
            finalScore: safeBase,
            baseScore: safeBase,
            capped: false,
            cappedAt: null,
            failingCategories: [],
            reason: null,
        };
    }

    const finalScore = Math.min(safeBase, cap);
    return {
        finalScore,
        baseScore: safeBase,
        capped: finalScore < safeBase,
        cappedAt: cap,
        failingCategories,
        reason:
            `Cobertura critica abaixo da meta em: ${failingCategories.join(', ')} ` +
            `(minimo exigido ${minPct}%). Nota capada em ${cap}/1000 ate corrigir.`,
    };
}
