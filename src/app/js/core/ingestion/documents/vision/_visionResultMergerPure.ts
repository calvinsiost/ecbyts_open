// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Vision result merger — pure logic (RF-5 of SPEC_VISION_FALLBACK).
 *
 * Merges an array of `VisionResult` (one per figure analysed) into an
 * existing `IngestionAutoPatch`. The wire layer (`handlers/ingestion.ts`)
 * calls this AFTER the vision gate fired and the provider returned results;
 * the merger then decides what to ADD without overwriting fields the text
 * tier already filled.
 *
 * Anti-requirements honoured (SPEC §2.1 RF-5):
 *   - "imagem é FALLBACK" (Calvin 2026-06-02): vision results NEVER
 *     overwrite a non-empty text-tier field. They only ADD where the patch
 *     is missing data.
 *   - Defensive: invalid result skipped, never propagates.
 *   - Auditability: every merged field is recorded in `visionContributions`
 *     so the audit/UI can render WHICH fields came from vision vs text.
 *
 * Tests live in `tests/vision-result-merger-pure.test.mjs`.
 */

import type { FigureCategory } from './_figureCategoryClassifierPure.js';

export interface IngestionAutoPatch {
    readonly clientName?: string | null;
    readonly siteLocation?: string | null;
    readonly documentType?: string | null;
    readonly documentStatus?: string | null;
    readonly wellsLithology?: ReadonlyArray<unknown>;
    readonly chronology?: ReadonlyArray<unknown>;
    readonly autoFilledFieldCount?: number;
    readonly visionContributions?: ReadonlyArray<VisionContribution>;
    readonly [k: string]: unknown;
}

export interface VisionResultInput {
    readonly category: FigureCategory;
    readonly extracted: Readonly<Record<string, unknown>>;
    readonly confidence: number;
    readonly provider: string;
    readonly elapsedMs?: number;
}

export interface VisionContribution {
    readonly field: string;
    readonly category: FigureCategory;
    readonly provider: string;
    readonly confidence: number;
}

export interface MergerOptions {
    /** Minimum confidence below which a result is discarded. Default 0.5. */
    readonly minConfidence?: number;
}

export interface MergerResult {
    readonly patch: IngestionAutoPatch;
    readonly addedFieldCount: number;
    readonly skippedCount: number;
    readonly contributions: ReadonlyArray<VisionContribution>;
}

const DEFAULT_MIN_CONFIDENCE = 0.5;

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isNonEmptyArray(v: unknown): v is unknown[] {
    return Array.isArray(v) && v.length > 0;
}

function isMissingField(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === 'string' && v.length === 0) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
}

/**
 * Map a vision category to the canonical patch field names it can write to.
 * Order matters — if the result.extracted has multiple of these, the merger
 * tries them in order.
 */
const CATEGORY_TO_FIELDS: Readonly<Record<FigureCategory, ReadonlyArray<string>>> = Object.freeze({
    perfil_sondagem: Object.freeze(['wellsLithology']),
    cross_section: Object.freeze(['crossSections']),
    pluma: Object.freeze(['plumeIsoLines', 'plumeArea']),
    potenciometrico: Object.freeze(['potentiometricSurface']),
    mapa_localizacao: Object.freeze(['siteLocation', 'siteBoundary']),
    generic: Object.freeze([] as string[]),
});

/**
 * Merge vision results into a patch. Pure, deterministic, returns a NEW
 * frozen patch (never mutates the input).
 */
export function mergeVisionResults(
    patch: IngestionAutoPatch | null | undefined,
    results: ReadonlyArray<VisionResultInput> | null | undefined,
    options: MergerOptions = {},
): MergerResult {
    const basePatch: IngestionAutoPatch = patch && typeof patch === 'object' ? patch : {};
    const minConfidence = Number.isFinite(options.minConfidence)
        ? (options.minConfidence as number)
        : DEFAULT_MIN_CONFIDENCE;

    const additions: Record<string, unknown> = {};
    const contributions: VisionContribution[] = [];
    let skipped = 0;

    const safeResults = Array.isArray(results) ? results : [];
    for (const r of safeResults) {
        if (!r || typeof r !== 'object') {
            skipped++;
            continue;
        }
        if (!Number.isFinite(r.confidence) || r.confidence < minConfidence) {
            skipped++;
            continue;
        }
        if (!isNonEmptyString(r.category) || !isNonEmptyString(r.provider)) {
            skipped++;
            continue;
        }
        if (!r.extracted || typeof r.extracted !== 'object') {
            skipped++;
            continue;
        }
        const candidateFields = CATEGORY_TO_FIELDS[r.category as FigureCategory] ?? [];
        let mergedAny = false;
        for (const field of candidateFields) {
            if (!(field in r.extracted)) continue;
            const newValue = r.extracted[field];
            // Skip if the value extracted is itself empty.
            if (isMissingField(newValue) && !isNonEmptyArray(newValue)) continue;
            // Anti-overwrite (Calvin "fallback"): only fill when current is empty.
            const currentValue = field in additions ? additions[field] : basePatch[field];
            if (!isMissingField(currentValue)) continue;
            additions[field] = newValue;
            contributions.push(
                Object.freeze({
                    field,
                    category: r.category,
                    provider: r.provider,
                    confidence: r.confidence,
                }),
            );
            mergedAny = true;
        }
        if (!mergedAny) skipped++;
    }

    const previousContributions = Array.isArray(basePatch.visionContributions)
        ? basePatch.visionContributions
        : [];
    const mergedContributions = Object.freeze([
        ...previousContributions,
        ...contributions,
    ]);

    const previousCount = Number.isFinite(basePatch.autoFilledFieldCount)
        ? (basePatch.autoFilledFieldCount as number)
        : 0;
    const addedFieldCount = contributions.length;

    const out: IngestionAutoPatch = {
        ...basePatch,
        ...additions,
        autoFilledFieldCount: previousCount + addedFieldCount,
        visionContributions: mergedContributions,
    };
    return Object.freeze({
        patch: Object.freeze(out),
        addedFieldCount,
        skippedCount: skipped,
        contributions: Object.freeze(contributions),
    });
}
