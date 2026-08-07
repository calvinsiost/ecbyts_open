// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Lab API Sensor + ETL Matcher — Item 9.56
 *
 * Pure helpers for the ETL pipeline that ingests lab results from
 * external APIs and matches them to existing elements, compounds, and
 * campaigns in the model.
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.56
 */

// ============================================================================
// Unit conversion
// ============================================================================

const CONCENTRATION_TO_MG_PER_L: Readonly<Record<string, number>> = Object.freeze({
    'mg/L': 1,
    'mg/l': 1,
    ppm: 1, // For aqueous samples ppm ≈ mg/L
    'ug/L': 0.001,
    'ug/l': 0.001,
    'µg/L': 0.001,
    'µg/l': 0.001,
    ppb: 0.001,
    'ng/L': 0.000001,
    'ng/l': 0.000001,
    'g/L': 1000,
    'g/l': 1000,
});

const MASS_TO_MG: Readonly<Record<string, number>> = Object.freeze({
    mg: 1,
    ug: 0.001,
    µg: 0.001,
    ng: 0.000001,
    g: 1000,
    kg: 1_000_000,
});

export type NormalizeUnitResult = { ok: true; value: number } | { ok: false; reason: string };

/**
 * Convert a numeric value from one unit to another within the same
 * dimension (concentration OR mass). Returns null if units are
 * incompatible or unknown.
 */
export function normalizeUnit(value: unknown, from: unknown, to: unknown): NormalizeUnitResult {
    if (!Number.isFinite(Number(value))) {
        return { ok: false, reason: 'value_not_numeric' };
    }
    if (typeof from !== 'string' || typeof to !== 'string') {
        return { ok: false, reason: 'units_required' };
    }

    // Try concentration table first
    if (CONCENTRATION_TO_MG_PER_L[from] != null && CONCENTRATION_TO_MG_PER_L[to] != null) {
        const mgPerL = Number(value) * CONCENTRATION_TO_MG_PER_L[from];
        return { ok: true, value: mgPerL / CONCENTRATION_TO_MG_PER_L[to] };
    }

    // Try mass table
    if (MASS_TO_MG[from] != null && MASS_TO_MG[to] != null) {
        const mg = Number(value) * MASS_TO_MG[from];
        return { ok: true, value: mg / MASS_TO_MG[to] };
    }

    return { ok: false, reason: 'incompatible_or_unknown_units' };
}

// ============================================================================
// Fuzzy name matching (Levenshtein ratio)
// ============================================================================

/**
 * Compute Levenshtein edit distance between two strings.
 * Pure JS implementation — O(m*n) space and time. Good for inputs < 200 chars.
 */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    const m = a.length;
    const n = b.length;
    const prev: number[] = new Array(n + 1);
    const curr: number[] = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
        }
        for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0;
    }
    return prev[n] ?? 0;
}

/**
 * Normalized similarity ratio in [0, 1]. 1 = identical, 0 = completely different.
 * Uses Levenshtein / max(len) so it's length-normalized.
 */
export function similarityRatio(a: unknown, b: unknown): number {
    if (typeof a !== 'string' || typeof b !== 'string') return 0;
    const A = a.trim().toLowerCase();
    const B = b.trim().toLowerCase();
    if (A === B) return 1;
    if (A.length === 0 || B.length === 0) return 0;
    const dist = levenshtein(A, B);
    const maxLen = Math.max(A.length, B.length);
    return 1 - dist / maxLen;
}

export interface FuzzyCandidate {
    id: string;
    name: string;
}

export interface FuzzyMatchResult {
    id: string;
    name: string;
    score: number;
}

/**
 * Find the best fuzzy match for `target` in `candidates`. Returns the
 * top candidate above `threshold`, or null.
 */
export function fuzzyMatchName(
    target: unknown,
    candidates: readonly FuzzyCandidate[],
    threshold: number = 0.85,
): FuzzyMatchResult | null {
    if (typeof target !== 'string' || !target || !Array.isArray(candidates) || candidates.length === 0) return null;
    let best: FuzzyMatchResult | null = null;
    for (const c of candidates) {
        if (!c || typeof c.name !== 'string') continue;
        const score = similarityRatio(target, c.name);
        if (score >= threshold && (!best || score > best.score)) {
            best = { id: c.id, name: c.name, score };
        }
    }
    return best;
}

// ============================================================================
// Campaign date matching
// ============================================================================

export interface CampaignWindow {
    id: string;
    startDate: string | number | Date;
    endDate?: string | number | Date | null;
}

export interface CampaignMatchResult {
    id: string;
    score: number;
}

/**
 * Match a sample date to the first campaign whose date range includes
 * it (within a ±windowDays tolerance). Returns null if no match.
 */
export function matchCampaignByDate(
    sampleDate: string | number | Date,
    campaigns: readonly CampaignWindow[],
    windowDays: number = 7,
): CampaignMatchResult | null {
    const ts = new Date(sampleDate).getTime();
    if (!Number.isFinite(ts)) return null;
    if (!Array.isArray(campaigns)) return null;

    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    for (const c of campaigns) {
        if (!c || !c.startDate) continue;
        const start = new Date(c.startDate).getTime() - windowMs;
        const end = c.endDate ? new Date(c.endDate).getTime() + windowMs : Infinity;
        if (Number.isFinite(start) && ts >= start && ts <= end) {
            // Score = closer to campaign center = higher
            const center = (start + (c.endDate ? new Date(c.endDate).getTime() : start)) / 2;
            const maxDist = windowMs * 2;
            const dist = Math.abs(ts - center);
            const score = Math.max(0, 1 - dist / maxDist);
            return { id: c.id, score };
        }
    }
    return null;
}

// ============================================================================
// Duplicate detection (idempotency)
// ============================================================================

export interface SampleRow {
    id?: string | null;
    lab_id?: string | null;
    sample_id?: string | null;
    timestamp: string | number | Date;
    [key: string]: unknown;
}

export interface DuplicateResult {
    isDuplicate: boolean;
    matchingId?: string | null;
    similarityScore?: number;
}

/**
 * Detect if a new sample is a duplicate of an existing one based on
 * (lab_id, sample_id, timestamp) tuple. This is the idempotency key
 * per spec §Q4 — reprocessing the same payload should be safe.
 */
export function detectDuplicate(newSample: SampleRow | null | undefined, existing: readonly SampleRow[]): DuplicateResult {
    if (!newSample || !Array.isArray(existing)) {
        return { isDuplicate: false };
    }
    const labId = String(newSample.lab_id || '').trim();
    const sampleId = String(newSample.sample_id || '').trim();
    const ts = new Date(newSample.timestamp).getTime();
    if (!labId || !sampleId || !Number.isFinite(ts)) {
        return { isDuplicate: false };
    }

    for (const row of existing) {
        if (!row) continue;
        if (
            String(row.lab_id || '').trim() === labId &&
            String(row.sample_id || '').trim() === sampleId &&
            Math.abs(new Date(row.timestamp).getTime() - ts) < 1000 // 1s window
        ) {
            return { isDuplicate: true, matchingId: row.id ?? null, similarityScore: 1 };
        }
    }
    return { isDuplicate: false };
}

// ============================================================================
// Range validation (outlier detection)
// ============================================================================

export interface CompoundRange {
    id?: string;
    name?: string;
    minExpected?: number;
    maxExpected?: number;
    unit?: string;
    warningFactor?: number;
}

export interface RangeValidationResult {
    valid: boolean;
    confidence: number;
    alerts: string[];
}

/**
 * Validate a value against compound reference range. Returns confidence
 * and alerts.
 */
export function validateRange(value: unknown, compound: CompoundRange | null | undefined): RangeValidationResult {
    if (!Number.isFinite(Number(value))) {
        return { valid: false, confidence: 0, alerts: ['value_not_numeric'] };
    }
    if (!compound || typeof compound !== 'object') {
        return { valid: true, confidence: 0.5, alerts: ['no_reference_range'] };
    }

    const v = Number(value);
    const alerts: string[] = [];
    let confidence = 1.0;

    const min = Number(compound.minExpected);
    const max = Number(compound.maxExpected);
    const warningFactor = Number(compound.warningFactor ?? 10);

    if (Number.isFinite(min) && v < min) {
        alerts.push('below_expected_range');
        confidence *= 0.6;
    }
    if (Number.isFinite(max) && v > max) {
        alerts.push('above_expected_range');
        confidence *= 0.6;
        if (v > max * warningFactor) {
            alerts.push('potential_outlier');
            confidence *= 0.3;
        }
    }
    if (v < 0) {
        alerts.push('negative_value_suspicious');
        confidence *= 0.2;
    }

    return { valid: alerts.length === 0, confidence, alerts };
}
