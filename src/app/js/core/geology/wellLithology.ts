// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WELL LITHOLOGY — Lithological segments along well trajectory
   ================================================================
   P1-8 Family Fault Wells Directional Phase 3 (Claude-owner)

   Spec: docs/specs/features/SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL.md
   ================================================================ */

export interface LithologySegment {
    mdTop: number;
    mdBottom: number;
    lithology: string;
    color?: string;
    description?: string;
}

export interface LithologyDef {
    color: string;
    label: string;
}

export interface CartesianPoint {
    easting: number;
    northing: number;
    tvd: number;
}

export interface TrajectoryStation extends CartesianPoint {
    md: number;
}

export interface EnrichedSegment extends LithologySegment {
    length: number;
    topPosition: CartesianPoint | null;
    bottomPosition: CartesianPoint | null;
}

export interface ValidateSegmentResult {
    valid: boolean;
    reason?: string;
}

export interface CoverageOptions {
    tolerance?: number;
    requireFullCoverage?: boolean;
}

export interface CoverageResult {
    valid: boolean;
    issues: string[];
    coveragePct: number;
}

export interface CreateLithologySegmentParams {
    mdTop: number | string;
    mdBottom: number | string;
    lithology: string;
    color?: string;
    description?: string;
}

/**
 * Catalogo canonico de litologias com cores default.
 */
export const LITHOLOGY_REGISTRY: Readonly<Record<string, LithologyDef>> = Object.freeze({
    sandstone: { color: '#f4d03f', label: 'Arenito' },
    shale: { color: '#5d6d7e', label: 'Folhelho' },
    siltstone: { color: '#a9a9a9', label: 'Siltito' },
    limestone: { color: '#aed6f1', label: 'Calcário' },
    dolomite: { color: '#85c1e9', label: 'Dolomita' },
    granite: { color: '#e74c3c', label: 'Granito' },
    basalt: { color: '#34495e', label: 'Basalto' },
    clay: { color: '#a04000', label: 'Argila' },
    gravel: { color: '#d35400', label: 'Cascalho' },
    saprolite: { color: '#cd6155', label: 'Saprolito' },
    soil: { color: '#7d6608', label: 'Solo' },
    weathered_rock: { color: '#7e5109', label: 'Rocha alterada' },
    fresh_rock: { color: '#1b2631', label: 'Rocha sã' },
    unknown: { color: '#7f8c8d', label: 'Desconhecida' },
});

const UNKNOWN_DEF: LithologyDef = LITHOLOGY_REGISTRY.unknown as LithologyDef;

/**
 * Cor canonica de uma litologia. Cai em "unknown" se desconhecida.
 */
export function getLithologyColor(lithology: unknown): string {
    if (typeof lithology !== 'string') return UNKNOWN_DEF.color;
    const def = LITHOLOGY_REGISTRY[lithology.toLowerCase().trim()];
    return (def || UNKNOWN_DEF).color;
}

/**
 * Label i18n da litologia (PT default).
 */
export function getLithologyLabel(lithology: unknown): string {
    if (typeof lithology !== 'string') return UNKNOWN_DEF.label;
    const def = LITHOLOGY_REGISTRY[lithology.toLowerCase().trim()];
    return (def || UNKNOWN_DEF).label;
}

/**
 * Cria um LithologySegment com defaults aplicados.
 */
export function createLithologySegment(params: CreateLithologySegmentParams | null | undefined): LithologySegment {
    if (!params || typeof params !== 'object') {
        throw new Error('createLithologySegment: params required');
    }
    const mdTop = Number(params.mdTop);
    const mdBottom = Number(params.mdBottom);
    const lithology = String(params.lithology || '')
        .toLowerCase()
        .trim();
    if (!Number.isFinite(mdTop) || !Number.isFinite(mdBottom)) {
        throw new Error('createLithologySegment: mdTop and mdBottom required as numbers');
    }
    if (mdBottom <= mdTop) {
        throw new Error(`createLithologySegment: mdBottom (${mdBottom}) must be > mdTop (${mdTop})`);
    }
    if (!lithology) {
        throw new Error('createLithologySegment: lithology required');
    }
    return {
        mdTop,
        mdBottom,
        lithology,
        color: params.color || getLithologyColor(lithology),
        description: params.description || '',
    };
}

/**
 * Valida shape de segmento sem throw.
 */
export function validateLithologySegment(segment: LithologySegment | null | undefined): ValidateSegmentResult {
    if (!segment || typeof segment !== 'object') return { valid: false, reason: 'segment_required' };
    if (!Number.isFinite(segment.mdTop)) return { valid: false, reason: 'mdTop_invalid' };
    if (!Number.isFinite(segment.mdBottom)) return { valid: false, reason: 'mdBottom_invalid' };
    if (segment.mdBottom <= segment.mdTop) return { valid: false, reason: 'mdBottom_not_gt_mdTop' };
    if (typeof segment.lithology !== 'string' || segment.lithology.length === 0) {
        return { valid: false, reason: 'lithology_required' };
    }
    return { valid: true };
}

/**
 * Comprimento do segmento em MD.
 */
export function computeSegmentLength(segment: LithologySegment | null | undefined): number {
    if (!segment || !Number.isFinite(segment.mdTop) || !Number.isFinite(segment.mdBottom)) return 0;
    return Math.max(0, segment.mdBottom - segment.mdTop);
}

function getBoundStations(
    stations: ReadonlyArray<TrajectoryStation>,
): { first: TrajectoryStation; last: TrajectoryStation } | null {
    const first = stations[0];
    const last = stations[stations.length - 1];
    if (!first || !last) return null;
    return { first, last };
}

function findExactStation(
    stations: ReadonlyArray<TrajectoryStation>,
    targetMD: number,
): CartesianPoint | null {
    for (const s of stations) {
        if (Math.abs(s.md - targetMD) < 1e-9) {
            return { easting: s.easting, northing: s.northing, tvd: s.tvd };
        }
    }
    return null;
}

function interpolateBetweenStations(
    a: TrajectoryStation,
    b: TrajectoryStation,
    targetMD: number,
): CartesianPoint {
    const dMD = b.md - a.md;
    if (dMD < 1e-9) return { easting: a.easting, northing: a.northing, tvd: a.tvd };
    const t = (targetMD - a.md) / dMD;
    return {
        easting: a.easting + t * (b.easting - a.easting),
        northing: a.northing + t * (b.northing - a.northing),
        tvd: a.tvd + t * (b.tvd - a.tvd),
    };
}

function findInterpolatedSegment(
    stations: ReadonlyArray<TrajectoryStation>,
    targetMD: number,
): CartesianPoint | null {
    for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i];
        const b = stations[i + 1];
        if (!a || !b) continue;
        if (targetMD >= a.md && targetMD <= b.md) {
            return interpolateBetweenStations(a, b, targetMD);
        }
    }
    return null;
}

/**
 * Interpola coordenadas cartesianas (easting, northing, tvd) ao longo da
 * trajetoria dado um MD alvo. Linear entre stations.
 */
export function interpolateTrajectoryAtMD(
    stations: ReadonlyArray<TrajectoryStation>,
    targetMD: number,
): CartesianPoint | null {
    if (!Array.isArray(stations) || stations.length === 0) return null;
    if (!Number.isFinite(targetMD)) return null;

    const bounds = getBoundStations(stations);
    if (!bounds) return null;
    const { first, last } = bounds;
    if (targetMD < first.md - 1e-9 || targetMD > last.md + 1e-9) return null;

    const exact = findExactStation(stations, targetMD);
    if (exact) return exact;

    return findInterpolatedSegment(stations, targetMD);
}

/**
 * Para cada segmento, interpola coordenadas cartesianas no topo e base.
 */
export function assignSegmentsToTrajectory(
    segments: ReadonlyArray<LithologySegment>,
    trajectoryStations: ReadonlyArray<TrajectoryStation>,
): EnrichedSegment[] {
    if (!Array.isArray(segments) || !Array.isArray(trajectoryStations)) return [];
    return segments.map((seg) => ({
        ...seg,
        length: computeSegmentLength(seg),
        topPosition: interpolateTrajectoryAtMD(trajectoryStations, seg.mdTop),
        bottomPosition: interpolateTrajectoryAtMD(trajectoryStations, seg.mdBottom),
    }));
}

/**
 * Colapsa segmentos consecutivos com mesma litologia.
 */
export function mergeAdjacentSegmentsByLithology(
    segments: ReadonlyArray<LithologySegment>,
    tolerance: number = 1e-6,
): LithologySegment[] {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const sorted = [...segments].sort((a, b) => a.mdTop - b.mdTop);
    const firstSorted = sorted[0];
    if (!firstSorted) return [];
    const merged: LithologySegment[] = [{ ...firstSorted }];
    for (let i = 1; i < sorted.length; i++) {
        const prev = merged[merged.length - 1];
        const curr = sorted[i];
        if (!prev || !curr) continue;
        const adjacent = Math.abs(curr.mdTop - prev.mdBottom) <= tolerance;
        if (adjacent && curr.lithology === prev.lithology) {
            prev.mdBottom = curr.mdBottom;
            if (curr.description && curr.description !== prev.description) {
                prev.description = (prev.description ? prev.description + ' | ' : '') + curr.description;
            }
        } else {
            merged.push({ ...curr });
        }
    }
    return merged;
}

function checkTopGap(
    sorted: ReadonlyArray<LithologySegment>,
    tolerance: number,
    issues: string[],
): void {
    const firstSeg = sorted[0];
    if (firstSeg && firstSeg.mdTop > tolerance) {
        issues.push(`gap_at_top:${firstSeg.mdTop.toFixed(2)}m`);
    }
}

function checkInternalGapsAndOverlaps(
    sorted: ReadonlyArray<LithologySegment>,
    tolerance: number,
    issues: string[],
): number {
    let totalCovered = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (!curr || !next) continue;
        const gap = next.mdTop - curr.mdBottom;
        if (gap > tolerance) {
            issues.push(`gap:${curr.mdBottom.toFixed(2)}-${next.mdTop.toFixed(2)}m`);
        } else if (gap < -tolerance) {
            issues.push(`overlap:${next.mdTop.toFixed(2)}-${curr.mdBottom.toFixed(2)}m`);
        }
        totalCovered += computeSegmentLength(curr);
    }
    return totalCovered;
}

function checkLastSegment(
    sorted: ReadonlyArray<LithologySegment>,
    totalMD: number,
    tolerance: number,
    issues: string[],
): number {
    const lastSeg = sorted[sorted.length - 1];
    if (!lastSeg) return 0;
    const lastLength = computeSegmentLength(lastSeg);
    const lastBottom = lastSeg.mdBottom;
    if (lastBottom < totalMD - tolerance) {
        issues.push(`gap_at_bottom:${lastBottom.toFixed(2)}-${totalMD.toFixed(2)}m`);
    } else if (lastBottom > totalMD + tolerance) {
        issues.push(`exceeds_total:${lastBottom.toFixed(2)} > ${totalMD.toFixed(2)}m`);
    }
    return lastLength;
}

/**
 * Valida cobertura completa de [0, totalMD] sem gaps nem overlaps.
 */
export function validateSegmentsCoverage(
    segments: ReadonlyArray<LithologySegment>,
    totalMD: number,
    options: CoverageOptions = {},
): CoverageResult {
    const tolerance = options.tolerance ?? 1e-6;
    const requireFullCoverage = options.requireFullCoverage !== false;

    if (!Array.isArray(segments) || segments.length === 0) {
        return {
            valid: !requireFullCoverage,
            issues: requireFullCoverage ? ['no_segments'] : [],
            coveragePct: 0,
        };
    }
    if (!Number.isFinite(totalMD) || totalMD <= 0) {
        return { valid: false, issues: ['invalid_totalMD'], coveragePct: 0 };
    }

    const sorted = [...segments].sort((a, b) => a.mdTop - b.mdTop);
    const issues: string[] = [];

    checkTopGap(sorted, tolerance, issues);
    let totalCovered = checkInternalGapsAndOverlaps(sorted, tolerance, issues);
    totalCovered += checkLastSegment(sorted, totalMD, tolerance, issues);

    const coveragePct = totalMD > 0 ? Math.min(1, totalCovered / totalMD) : 0;
    const valid = requireFullCoverage ? issues.length === 0 : true;
    return { valid, issues, coveragePct };
}
