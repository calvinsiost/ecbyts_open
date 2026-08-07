// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Vision fallback gate — pure logic (RF-1 of SPEC_VISION_FALLBACK_FIGURE_EXTRACTION).
 *
 * Decides whether to ACTIVATE the vision-based fallback after the text-tier
 * extractors finished. Vision is expensive and CALLED ONLY when text tiers
 * already failed to deliver acceptable coverage. The gate is a single pure
 * function with documented thresholds (all-AND).
 *
 * Threshold rationale (SPEC §2.1 RF-1):
 *   - autoFilledFieldCount < 6  — < 6 of ~30 ingestion fields covered
 *   - wellsLithology.length === 0 — text-tier returned no lithology layers
 *   - pageCount > 20             — PDF is non-trivial (vision cost justified)
 *
 * Anti-requirements honoured:
 *   - "imagem é FALLBACK" (Calvin diretiva 2026-06-02): vision NEVER runs
 *     when text coverage is acceptable. The gate is the enforcement point.
 *   - Defensive: any missing/invalid input → `{ shouldActivate: false }`
 *     (DO NOT activate vision when we can't reason about the patch).
 *
 * Tests live in `tests/vision-fallback-gate-pure.test.mjs`.
 */

export interface VisionGateInput {
    readonly autoFilledFieldCount?: number;
    readonly wellsLithology?: ReadonlyArray<unknown>;
    readonly pageCount?: number;
    /** Optional caller override of any threshold (use sparingly). */
    readonly thresholds?: {
        readonly minFieldsForSkip?: number;
        readonly minPagesForGate?: number;
    };
}

export interface VisionGateDecision {
    readonly shouldActivate: boolean;
    readonly reason: string;
    readonly suggestedRegions: ReadonlyArray<string>;
}

const DEFAULTS = Object.freeze({
    minFieldsForSkip: 6,
    minPagesForGate: 20,
});

const SUGGESTED_REGIONS_DEFAULT = Object.freeze([
    'perfil_sondagem',
    'cross_section',
    'pluma',
    'potenciometrico',
    'mapa_localizacao',
]);

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Single-call decision gate. All criteria AND-combined; any false → no vision.
 *
 *   ACTIVATE iff
 *     autoFilledFieldCount < minFieldsForSkip
 *     AND wellsLithology is an empty array
 *     AND pageCount > minPagesForGate
 */
export function shouldActivateVisionFallback(input: VisionGateInput): VisionGateDecision {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            shouldActivate: false,
            reason: 'input_invalid',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }

    const minFields =
        input.thresholds?.minFieldsForSkip !== undefined &&
        isFiniteNumber(input.thresholds.minFieldsForSkip)
            ? input.thresholds.minFieldsForSkip
            : DEFAULTS.minFieldsForSkip;
    const minPages =
        input.thresholds?.minPagesForGate !== undefined &&
        isFiniteNumber(input.thresholds.minPagesForGate)
            ? input.thresholds.minPagesForGate
            : DEFAULTS.minPagesForGate;

    if (!isFiniteNumber(input.autoFilledFieldCount)) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'autoFilledFieldCount_missing',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }
    if (!Array.isArray(input.wellsLithology)) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'wellsLithology_not_array',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }
    if (!isFiniteNumber(input.pageCount)) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'pageCount_missing',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }

    if (input.autoFilledFieldCount >= minFields) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'text_coverage_acceptable',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }
    if (input.wellsLithology.length > 0) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'lithology_already_extracted',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }
    if (input.pageCount <= minPages) {
        return Object.freeze({
            shouldActivate: false,
            reason: 'pdf_too_short_to_justify_vision',
            suggestedRegions: Object.freeze([] as string[]),
        });
    }

    return Object.freeze({
        shouldActivate: true,
        reason: 'text_coverage_low_lithology_visual_only',
        suggestedRegions: SUGGESTED_REGIONS_DEFAULT,
    });
}
