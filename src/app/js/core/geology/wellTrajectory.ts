// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WELL TRAJECTORY — Directional drilling survey calculations
   ================================================================
   P1-8 Family Fault Wells Directional Phase 2 (Claude-owner)

   Method: Minimum Curvature (Bourgoyne 1986 §8.3.4 / SPE 84246)
   ================================================================ */

const DEG = Math.PI / 180;

export interface SurveyStation {
    md: number;
    inc: number;
    azi: number;
}

export interface CartesianStation extends SurveyStation {
    easting: number;
    northing: number;
    tvd: number;
    dls: number;
}

export interface ValidateStationResult {
    valid: boolean;
    reason?: string;
}

export interface ComputeTrajectoryOptions {
    wellheadEasting?: number;
    wellheadNorthing?: number;
    wellheadElevation?: number;
}

export interface ComputeTrajectoryResult {
    ok: boolean;
    stations?: CartesianStation[];
    error?: string;
}

export interface TrajectoryToThreePointsOptions {
    elevationY?: number;
}

export interface ThreePoint {
    x: number;
    y: number;
    z: number;
}

export interface TrajectorySummary {
    totalMD: number;
    finalTVD: number;
    finalEasting: number;
    finalNorthing: number;
    horizontalDisplacement: number;
    maxDLS: number;
    maxDLSDegPer30m: number;
}

/**
 * Calcula o angulo dogleg beta entre duas survey stations (rad).
 */
export function doglegAngle(inc1Deg: number, azi1Deg: number, inc2Deg: number, azi2Deg: number): number {
    const I1 = inc1Deg * DEG;
    const I2 = inc2Deg * DEG;
    const A1 = azi1Deg * DEG;
    const A2 = azi2Deg * DEG;
    const dInc = I2 - I1;
    const dAzi = A2 - A1;
    const cosBeta = Math.cos(dInc) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(dAzi));
    const c = Math.max(-1, Math.min(1, cosBeta));
    return Math.acos(c);
}

/**
 * Ratio Factor (RF) do metodo Minimum Curvature.
 */
export function ratioFactor(betaRad: number): number {
    if (!Number.isFinite(betaRad) || Math.abs(betaRad) < 1e-9) return 1;
    return (2 / betaRad) * Math.tan(betaRad / 2);
}

/**
 * Validacao de uma survey station individual.
 */
export function validateStation(station: SurveyStation | null | undefined): ValidateStationResult {
    if (!station || typeof station !== 'object') return { valid: false, reason: 'station_required' };
    if (!Number.isFinite(station.md)) return { valid: false, reason: 'md_invalid' };
    if (!Number.isFinite(station.inc) || station.inc < 0 || station.inc > 180) {
        return { valid: false, reason: 'inc_out_of_range' };
    }
    if (!Number.isFinite(station.azi)) return { valid: false, reason: 'azi_invalid' };
    return { valid: true };
}

/**
 * Calcula trajetoria completa cartesiana usando Minimum Curvature.
 */
export function computeMinimumCurvatureTrajectory(
    surveys: ReadonlyArray<SurveyStation>,
    opts: ComputeTrajectoryOptions = {},
): ComputeTrajectoryResult {
    if (!Array.isArray(surveys) || surveys.length === 0) {
        return { ok: false, error: 'surveys_required' };
    }
    for (let i = 0; i < surveys.length; i++) {
        const v = validateStation(surveys[i]);
        if (!v.valid) {
            return { ok: false, error: `station[${i}].${v.reason}` };
        }
    }
    for (let i = 1; i < surveys.length; i++) {
        const cur = surveys[i];
        const prev = surveys[i - 1];
        if (!cur || !prev) continue;
        if (cur.md < prev.md) {
            return { ok: false, error: `surveys[${i}].md must be ≥ surveys[${i - 1}].md (ordered)` };
        }
    }

    const wEast = Number(opts.wellheadEasting) || 0;
    const wNorth = Number(opts.wellheadNorthing) || 0;
    const wElev = Number(opts.wellheadElevation) || 0;

    const stations: CartesianStation[] = [];

    const first = surveys[0] as SurveyStation;
    stations.push({
        md: first.md,
        inc: first.inc,
        azi: first.azi,
        easting: wEast,
        northing: wNorth,
        tvd: wElev - 0,
        dls: 0,
    });

    for (let i = 1; i < surveys.length; i++) {
        const s1 = surveys[i - 1] as SurveyStation;
        const s2 = surveys[i] as SurveyStation;
        const prev = stations[i - 1] as CartesianStation;
        const dMD = s2.md - s1.md;

        const beta = doglegAngle(s1.inc, s1.azi, s2.inc, s2.azi);
        const rf = ratioFactor(beta);

        const I1 = s1.inc * DEG;
        const I2 = s2.inc * DEG;
        const A1 = s1.azi * DEG;
        const A2 = s2.azi * DEG;

        const dN = (dMD / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2)) * rf;
        const dE = (dMD / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2)) * rf;
        const dTVD = (dMD / 2) * (Math.cos(I1) + Math.cos(I2)) * rf;

        const dls = dMD > 1e-9 ? beta / dMD : 0;

        stations.push({
            md: s2.md,
            inc: s2.inc,
            azi: s2.azi,
            easting: prev.easting + dE,
            northing: prev.northing + dN,
            tvd: prev.tvd + dTVD,
            dls,
        });
    }

    return { ok: true, stations };
}

/**
 * Converte CartesianStation[] em pontos {x, y, z} (Three.js convention).
 */
export function trajectoryToThreePoints(
    stations: ReadonlyArray<CartesianStation>,
    opts: TrajectoryToThreePointsOptions = {},
): ThreePoint[] {
    if (!Array.isArray(stations)) return [];
    const elev = Number(opts.elevationY) || 0;
    return stations.map((s) => ({
        x: s.easting,
        y: elev - s.tvd,
        z: s.northing,
    }));
}

/**
 * Converte dogleg severity de rad/m para deg/30m (API standard).
 */
export function dlsRadPerMToDegPer30m(dlsRadPerM: number): number {
    if (!Number.isFinite(dlsRadPerM)) return 0;
    return (dlsRadPerM * 30) / DEG;
}

/**
 * Sumario da trajetoria.
 */
export function trajectorySummary(stations: ReadonlyArray<CartesianStation>): TrajectorySummary {
    if (!Array.isArray(stations) || stations.length === 0) {
        return {
            totalMD: 0,
            finalTVD: 0,
            finalEasting: 0,
            finalNorthing: 0,
            horizontalDisplacement: 0,
            maxDLS: 0,
            maxDLSDegPer30m: 0,
        };
    }
    const last = stations[stations.length - 1] as CartesianStation;
    const firstSt = stations[0] as CartesianStation;
    let maxDLS = 0;
    for (const s of stations) {
        if (s.dls > maxDLS) maxDLS = s.dls;
    }
    const horizontal = Math.sqrt(last.easting * last.easting + last.northing * last.northing);
    return {
        totalMD: last.md - firstSt.md,
        finalTVD: last.tvd,
        finalEasting: last.easting,
        finalNorthing: last.northing,
        horizontalDisplacement: horizontal,
        maxDLS,
        maxDLSDegPer30m: dlsRadPerMToDegPer30m(maxDLS),
    };
}
