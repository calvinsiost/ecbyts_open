// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CETESB Risk — Pathway Contribution Stack VM (pure logic).
 *
 * Implements the data-shape side of RF-2.3 (visualisation: stack bar
 * "contribuição por via" no painel risk). Pure: caller passes the
 * `RiskAndCmaResult.pathwaysContrib` map; module returns a frozen VM
 * with normalised segments ready for ANY chart renderer.
 *
 * Does NOT depend on a chart library — caller plugs into `_temporalChartRenderer`
 * (or any DOM/svg/canvas adapter) without polluting this module.
 *
 * Deterministic ordering: segments sorted by descending percent so the
 * "biggest contributor" appears first on the stack — matches CETESB
 * Manual §4 reporting convention.
 *
 * Tests live in `tests/cetesb-risk-contribution-stack-pure.test.mjs`.
 */

export interface PathwayLabelResolver {
    /** i18n label resolver. Receives pathway id (e.g. 'soil_ingestion'); returns short display. */
    (pathwayId: string): string;
}

export interface StackSegmentVM {
    readonly pathway: string;
    readonly label: string;
    /** 0..1 contribution (kept as fraction so caller can format as % freely). */
    readonly fraction: number;
    /** Convenience: 0..100 rounded to 1 decimal for display. */
    readonly percent: number;
    /** Color hex assigned deterministically from a fixed palette. */
    readonly color: string;
    /** Stable index 0..N-1 in descending-order traversal — useful for legend layouts. */
    readonly orderIndex: number;
}

export interface PathwayStackVM {
    readonly segments: ReadonlyArray<StackSegmentVM>;
    /** Sum of fractions — should be ~1.0 for a well-formed input; surfaced for QA. */
    readonly totalFraction: number;
    /** True when segments sum to within ±0.01 of 1.0 (rounding tolerance). */
    readonly isNormalised: boolean;
    /** Pathway with the largest contribution (driver). Empty string when no segments. */
    readonly driver: string;
}

/**
 * Fixed 8-color palette (CETESB-friendly, colorblind-aware via Okabe-Ito).
 * Reused cyclically when >8 pathways (rare — typical risk panel has 3–6).
 */
const PALETTE: ReadonlyArray<string> = Object.freeze([
    '#0072B2', // blue
    '#E69F00', // orange
    '#009E73', // green
    '#CC79A7', // pink
    '#56B4E9', // sky blue
    '#D55E00', // vermillion
    '#F0E442', // yellow
    '#999999', // grey
]);

function defaultLabel(pathwayId: string): string {
    if (typeof pathwayId !== 'string') return '';
    return pathwayId
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function roundPercent(fraction: number): number {
    if (!Number.isFinite(fraction)) return 0;
    return Math.round(fraction * 1000) / 10;
}

/**
 * Build the stack VM from a contribution map (e.g.
 * `RiskAndCmaResult.pathwaysContrib`).
 *
 * Algorithm:
 *   1. Drop entries with non-finite or negative fractions (defensive).
 *   2. Sort by descending fraction; tiebreaker = pathway id ASC.
 *   3. Assign color cyclically from PALETTE by orderIndex.
 *   4. Resolve label via caller resolver, else default title-case.
 *   5. Compute totalFraction + isNormalised (±0.01 tolerance).
 */
export function buildPathwayStack(
    pathwaysContrib: Readonly<Record<string, number>> | null | undefined,
    labelResolver?: PathwayLabelResolver,
): PathwayStackVM {
    if (!pathwaysContrib || typeof pathwaysContrib !== 'object') {
        return Object.freeze({
            segments: Object.freeze([] as StackSegmentVM[]),
            totalFraction: 0,
            isNormalised: false,
            driver: '',
        });
    }
    const resolver = typeof labelResolver === 'function' ? labelResolver : defaultLabel;

    const entries = Object.keys(pathwaysContrib)
        .map((k) => ({ pathway: k, fraction: pathwaysContrib[k] }))
        .filter(
            (e): e is { pathway: string; fraction: number } =>
                typeof e.fraction === 'number' && Number.isFinite(e.fraction) && e.fraction >= 0,
        );

    entries.sort((a, b) => {
        if (b.fraction !== a.fraction) return b.fraction - a.fraction;
        return a.pathway.localeCompare(b.pathway);
    });

    const segments: StackSegmentVM[] = entries.map((e, i) =>
        Object.freeze({
            pathway: e.pathway,
            label: resolver(e.pathway) || defaultLabel(e.pathway),
            fraction: e.fraction,
            percent: roundPercent(e.fraction),
            color: PALETTE[i % PALETTE.length] as string,
            orderIndex: i,
        }),
    );

    const totalFraction = segments.reduce((acc, s) => acc + s.fraction, 0);
    const isNormalised = Math.abs(totalFraction - 1) < 0.01;
    const driver = segments.length > 0 ? (segments[0] as StackSegmentVM).pathway : '';

    return Object.freeze({
        segments: Object.freeze(segments),
        totalFraction,
        isNormalised,
        driver,
    });
}

/**
 * Convenience — top N segments (rest collapsed into an "other" bucket).
 * Useful when caller wants a compact stack with ≤4 visible segments.
 */
export function collapseToTopN(stack: PathwayStackVM | null | undefined, n: number): PathwayStackVM {
    if (!stack || !Array.isArray(stack.segments) || !Number.isFinite(n) || n <= 0) {
        return (
            stack ??
            Object.freeze({
                segments: Object.freeze([] as StackSegmentVM[]),
                totalFraction: 0,
                isNormalised: false,
                driver: '',
            })
        );
    }
    if (stack.segments.length <= n) return stack;
    const top = stack.segments.slice(0, n - 1);
    const restFraction = stack.segments.slice(n - 1).reduce((acc, s) => acc + s.fraction, 0);
    const other: StackSegmentVM = Object.freeze({
        pathway: '__other__',
        label: 'Outros',
        fraction: restFraction,
        percent: roundPercent(restFraction),
        color: '#999999',
        orderIndex: n - 1,
    });
    const segments = Object.freeze([...top, other]);
    return Object.freeze({
        segments,
        totalFraction: stack.totalFraction,
        isNormalised: stack.isNormalised,
        driver: stack.driver,
    });
}
