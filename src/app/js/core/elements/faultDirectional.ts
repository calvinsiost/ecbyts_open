// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FAULT + DIRECTIONAL WELLS — SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL (GEO-001)

   Pure helpers para:
   - Família 'fault': plano geológico com strike/dip/throw
   - Poços direcionais: trajetória via survey stations (MD/inclination/azimuth)
   - Segmentação litológica ao longo da trajetória
   - Interseção falha × poço

   Three.js mesh + UI em handler. Core só matemática + validação.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Fault types §Q1
// ──────────────────────────────────────────────────────────────────────

export interface Fault {
    id?: string;
    type?: string;
    strike?: number;
    dip?: number;
    throw?: number;
    origin?: { x: number; y: number; z?: number };
}
export interface SurveyStation {
    md: number;
    inclination: number;
    azimuth: number;
}
export interface TrajectoryPoint {
    md: number;
    tvd: number;
    north: number;
    east: number;
}
export interface LithologySegment {
    fromMd: number;
    toMd: number;
    lithology: string;
    porosity?: number;
}

export const FAULT_TYPES = Object.freeze(['normal', 'reverse', 'strike_slip', 'oblique']);

// ──────────────────────────────────────────────────────────────────────
// Fault geometry validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de fault.
 *
 * @param fault
 * @returns
 */
export function validateFault(fault: Fault | null | undefined): { valid: boolean; errors: Array<string> } {
    const errors: string[] = [];
    if (!fault || typeof fault !== 'object') return { valid: false, errors: ['fault not object'] };
    if (!fault.id) errors.push('id required');
    if (typeof fault.type !== 'string' || !FAULT_TYPES.includes(fault.type)) {
        errors.push(`type must be one of ${FAULT_TYPES.join(', ')}`);
    }

    // Strike ∈ [0, 360)
    const strike = fault.strike;
    if (!Number.isFinite(strike) || (strike as number) < 0 || (strike as number) >= 360) {
        errors.push('strike must be in [0, 360)');
    }
    // Dip ∈ [0, 90]
    const dip = fault.dip;
    if (!Number.isFinite(dip) || (dip as number) < 0 || (dip as number) > 90) {
        errors.push('dip must be in [0, 90]');
    }
    // Throw ≥ 0
    if (fault.throw != null && (!Number.isFinite(fault.throw) || fault.throw < 0)) {
        errors.push('throw must be non-negative');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Directional well trajectory
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida survey station (uma medida de trajetória).
 * MD = measured depth (along hole), inclination ∈ [0, 180], azimuth ∈ [0, 360).
 *
 * @param station
 * @returns
 */
export function isValidSurveyStation(station: SurveyStation | null | undefined): boolean {
    if (!station || typeof station !== 'object') return false;
    if (!Number.isFinite(station.md) || station.md < 0) return false;
    if (!Number.isFinite(station.inclination) || station.inclination < 0 || station.inclination > 180) return false;
    if (!Number.isFinite(station.azimuth) || station.azimuth < 0 || station.azimuth >= 360) return false;
    return true;
}

/**
 * Computa TVD (true vertical depth) a partir de survey stations via minimum curvature.
 * Método §Q3 - algoritmo padrão petroleiro para direction wells.
 *
 * @param stations - ordenados por MD asc
 * @returns
 */
export function computeTrajectory3D(stations: Array<SurveyStation>): Array<TrajectoryPoint> {
    if (!Array.isArray(stations) || stations.length === 0) return [];
    const valid = stations.filter(isValidSurveyStation).sort((a, b) => a.md - b.md) as SurveyStation[];
    if (valid.length === 0) return [];

    // Origem surface (md=0 se não fornecido)
    const out: TrajectoryPoint[] = [];
    let tvd: number;
    let north: number;
    let east: number;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    // Primeiro station
    const first = valid[0]!;
    out.push({ md: first.md, tvd: first.md * Math.cos(toRad(first.inclination)), north: 0, east: 0 });
    tvd = out[0]!.tvd;
    // Approx radial offset no primeiro segmento
    const r0 = first.md * Math.sin(toRad(first.inclination));
    north = r0 * Math.cos(toRad(first.azimuth));
    east = r0 * Math.sin(toRad(first.azimuth));
    out[0]!.north = north;
    out[0]!.east = east;

    // Subsequent: minimum curvature
    for (let i = 1; i < valid.length; i++) {
        const s1 = valid[i - 1]!;
        const s2 = valid[i]!;
        const dMd = s2.md - s1.md;
        if (dMd <= 0) continue;
        const i1 = toRad(s1.inclination);
        const i2 = toRad(s2.inclination);
        const a1 = toRad(s1.azimuth);
        const a2 = toRad(s2.azimuth);

        // Dogleg angle
        const cosDL = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
        const dl = Math.acos(Math.max(-1, Math.min(1, cosDL)));
        const rf = dl === 0 ? 1 : (2 / dl) * Math.tan(dl / 2); // ratio factor

        const dTvd = (dMd / 2) * (Math.cos(i1) + Math.cos(i2)) * rf;
        const dNorth = (dMd / 2) * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * rf;
        const dEast = (dMd / 2) * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * rf;

        tvd += dTvd;
        north += dNorth;
        east += dEast;
        out.push({ md: s2.md, tvd, north, east });
    }

    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Lithology segmentation §Q4
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida segmento litológico (ao longo da trajetória).
 * @param segment - { fromMd, toMd, lithology, porosity? }
 * @returns
 */
export function isValidLithologySegment(segment: LithologySegment | null | undefined): boolean {
    if (!segment || typeof segment !== 'object') return false;
    if (!Number.isFinite(segment.fromMd) || !Number.isFinite(segment.toMd)) return false;
    if (segment.fromMd >= segment.toMd) return false;
    if (!segment.lithology || typeof segment.lithology !== 'string') return false;
    return true;
}

/**
 * Retorna lithology no MD dado.
 * @param segments
 * @param md
 * @returns
 */
export function getLithologyAtDepth(segments: Array<LithologySegment>, md: number): string | null {
    if (!Array.isArray(segments) || !Number.isFinite(md)) return null;
    for (const seg of segments) {
        if (!isValidLithologySegment(seg)) continue;
        if (md >= seg.fromMd && md <= seg.toMd) return seg.lithology;
    }
    return null;
}

/**
 * Valida cobertura contínua (sem gaps, sem overlap).
 * @param segments
 * @returns
 */
export function validateLithologyContinuity(segments: Array<LithologySegment>): {
    valid: boolean;
    gaps: number;
    overlaps: number;
} {
    if (!Array.isArray(segments) || segments.length === 0) {
        return { valid: true, gaps: 0, overlaps: 0 };
    }
    const valid = segments.filter(isValidLithologySegment).sort((a, b) => a.fromMd - b.fromMd) as LithologySegment[];
    let gaps = 0;
    let overlaps = 0;
    for (let i = 1; i < valid.length; i++) {
        const prev = valid[i - 1]!;
        const curr = valid[i]!;
        if (curr.fromMd > prev.toMd) gaps++;
        if (curr.fromMd < prev.toMd) overlaps++;
    }
    return { valid: gaps === 0 && overlaps === 0, gaps, overlaps };
}

// ──────────────────────────────────────────────────────────────────────
// Fault × Well intersection §Q5
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta interseção aproximada entre plano de falha e trajetória de poço.
 * Simplification: checa se TVD do well cruza plano da falha dado origem + normal.
 *
 * Core approach: plane equation (n·(p - p0) = 0), onde n = normal da falha
 * computada a partir de strike/dip, p0 = ponto conhecido na falha.
 *
 * @param fault - { origin: {x,y,z}, strike, dip }
 * @param trajectoryPoints - { md, tvd, north, east }
 * @returns
 */
export function findFaultWellIntersections(
    fault: Fault & { origin: { x: number; y: number; z?: number }; strike: number; dip: number },
    trajectoryPoints: Array<TrajectoryPoint>,
): Array<{ md: number; distanceAlongMd: number; crossed: boolean }> {
    if (!fault || !fault.origin || !Number.isFinite(fault.strike) || !Number.isFinite(fault.dip)) return [];
    if (!Array.isArray(trajectoryPoints) || trajectoryPoints.length < 2) return [];

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    // Normal da falha (simplified): rotacionar [0,0,1] por strike (around Z) depois dip (around X')
    const strikeRad = toRad(fault.strike);
    const dipRad = toRad(fault.dip);
    // Normal aponta para "up-dip" do footwall - simplified
    const n = {
        x: Math.cos(strikeRad) * Math.sin(dipRad),
        y: Math.sin(strikeRad) * Math.sin(dipRad),
        z: Math.cos(dipRad),
    };
    const p0 = fault.origin;

    const signedDist = (p: TrajectoryPoint) =>
        n.x * (p.east - p0.x) + n.y * (p.north - p0.y) + n.z * (-p.tvd - (p0.z || 0));

    const results: Array<{ md: number; distanceAlongMd: number; crossed: boolean }> = [];
    for (let i = 1; i < trajectoryPoints.length; i++) {
        const a = trajectoryPoints[i - 1]!;
        const b = trajectoryPoints[i]!;
        const da = signedDist(a);
        const db = signedDist(b);
        if (da * db < 0) {
            // Cruza o plano
            const t = da / (da - db);
            const crossMd = a.md + t * (b.md - a.md);
            results.push({ md: crossMd, distanceAlongMd: crossMd, crossed: true });
        }
    }
    return results;
}
