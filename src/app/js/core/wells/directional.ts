// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Directional Wells — Minimum Curvature Trajectory
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   DIRECTIONAL — Pure-math core for directional well trajectories.

   Implements the Minimum Curvature Method (MCM), the industry
   standard (API RP 78 / SPE) for deviation surveys. Given stations
   with Measured Depth (MD), inclination (I, 0° = vertical, 90° =
   horizontal) and azimuth (A, 0° = North, clockwise), the module
   computes:

     - TVD  (True Vertical Depth)
     - N/E  (North / East horizontal offsets)
     - DLS  (Dogleg Severity in deg per course length, default 30 m)

   Hidrogeologia profissional: esta IP fundamenta pocos direcionais
   inclinados e monitoramento em falhas geologicas, integrando com
   o modulo de family 'fault' para deteccao de intersecao.

   References:
   - API RP 78 (American Petroleum Institute Recommended Practice)
   - Sawaryn, S.J., Thorogood, J.L. (2005). "A Compendium of
     Directional Calculations Based on the Minimum Curvature Method".
     SPE Drilling & Completion 20 (1): 24-36. SPE-84246-PA.
   - Taylor, H.L., Mason, C.M. (1972). "A Systematic Approach to
     Well Surveying Calculations". SPE 3362.
   - Zaremba, W.A. (1973). "Directional Survey by the Minimum
     Curvature Method". SPE 3835.

   This is the pure-math slice: NO browser, NO Three.js, NO DOM.
   Fase 2 (rendering + UI) is delegated downstream.
   ================================================================ */


// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Default course length for DLS normalization (meters). API standard. */
const DEFAULT_COURSE_LENGTH_M = 30;

/** Numerical threshold below which we treat dogleg as zero (tangent fallback). */
const DOGLEG_EPS = 1e-6;

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface SurveyColumns {
    md: number[];
    inc: number[];
    az: number[];
}

export interface FrozenSurveyColumns {
    readonly md: readonly number[];
    readonly inc: readonly number[];
    readonly az: readonly number[];
}

export interface SurveyStation {
    md?: unknown;
    depth?: unknown;
    inc?: unknown;
    inclination?: unknown;
    az?: unknown;
    azm?: unknown;
    azimuth?: unknown;
    [key: string]: unknown;
}

export type SurveyInput =
    | SurveyStation[]
    | { md: unknown; inc: unknown; az: unknown; [key: string]: unknown };

export interface TangentDelta {
    readonly dTVD: number;
    readonly dN: number;
    readonly dE: number;
}

export interface MinimumCurvatureOptions {
    courseLength?: number;
}

export interface MinimumCurvatureResult {
    readonly md: readonly number[];
    readonly tvd: readonly number[];
    readonly north: readonly number[];
    readonly east: readonly number[];
    readonly dls: readonly number[];
}

export interface KickoffPoint {
    readonly stationIndex: number;
    readonly md: number;
    readonly inc: number;
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Validates a deviation survey in columnar form.
 * Accepts either {md, inc, az} arrays of equal length OR an array of
 * station objects [{md, inc, az}, ...]. Returns the canonicalized
 * columnar form `{md:[], inc:[], az:[]}` frozen.
 *
 * Throws RangeError on:
 *   - length mismatch between columns
 *   - non-finite numbers
 *   - md not strictly monotonic increasing
 *   - inc outside [0, 180] degrees
 *   - az outside [0, 360) degrees
 */
export function validateSurvey(survey: SurveyInput): FrozenSurveyColumns {
    const cols = _canonicalize(survey);
    const { md, inc, az } = cols;

    if (md.length !== inc.length || md.length !== az.length) {
        throw new RangeError(
            `[directional] column length mismatch: md=${md.length}, inc=${inc.length}, az=${az.length}`,
        );
    }
    if (md.length < 1) {
        throw new RangeError('[directional] survey must contain at least 1 station');
    }

    for (let i = 0; i < md.length; i++) {
        const mdi = md[i] as number;
        const inci = inc[i] as number;
        const azi = az[i] as number;
        if (!Number.isFinite(mdi) || !Number.isFinite(inci) || !Number.isFinite(azi)) {
            throw new RangeError(`[directional] non-finite value at station ${i}`);
        }
        if (inci < 0 || inci > 180) {
            throw new RangeError(`[directional] inclination out of range at station ${i}: ${inci} (expected 0..180)`);
        }
        if (azi < 0 || azi >= 360) {
            throw new RangeError(`[directional] azimuth out of range at station ${i}: ${azi} (expected 0..360)`);
        }
        if (i > 0) {
            const prev = md[i - 1] as number;
            if (!(mdi > prev)) {
                throw new RangeError(
                    `[directional] MD not strictly monotonic increasing at station ${i}: md[${i - 1}]=${prev}, md[${i}]=${mdi}`,
                );
            }
        }
    }

    return Object.freeze({
        md: Object.freeze(md.slice()),
        inc: Object.freeze(inc.slice()),
        az: Object.freeze(az.slice()),
    });
}

/**
 * Accepts both the station-list and columnar forms and returns
 * plain (non-frozen) columnar arrays for further processing.
 */
function _canonicalize(survey: SurveyInput): SurveyColumns {
    if (Array.isArray(survey)) {
        const md: number[] = [];
        const inc: number[] = [];
        const az: number[] = [];
        for (const s of survey) {
            if (!s || typeof s !== 'object') {
                throw new RangeError('[directional] station must be an object');
            }
            md.push(_pickNum(s, ['md', 'depth']));
            inc.push(_pickNum(s, ['inc', 'inclination']));
            az.push(_pickNum(s, ['az', 'azm', 'azimuth']));
        }
        return { md, inc, az };
    }
    if (survey && typeof survey === 'object') {
        const obj = survey as { md: unknown; inc: unknown; az: unknown };
        const md = Array.isArray(obj.md) ? ((obj.md as number[]).slice()) : null;
        const inc = Array.isArray(obj.inc) ? ((obj.inc as number[]).slice()) : null;
        const az = Array.isArray(obj.az) ? ((obj.az as number[]).slice()) : null;
        if (!md || !inc || !az) {
            throw new RangeError('[directional] columnar survey requires md, inc, az arrays');
        }
        return { md, inc, az };
    }
    throw new RangeError('[directional] survey must be an object or array of stations');
}

function _pickNum(obj: SurveyStation, keys: readonly string[]): number {
    for (const k of keys) {
        if (obj[k] !== undefined) return Number(obj[k]);
    }
    throw new RangeError(`[directional] station missing one of keys: ${keys.join('/')}`);
}

// ----------------------------------------------------------------
// CORE MATH
// ----------------------------------------------------------------

/**
 * Dogleg angle between two survey stations (radians).
 *
 * cos(DL) = cos(I2 - I1) - sin(I1) * sin(I2) * (1 - cos(A2 - A1))
 *
 * Derived from the dot product of the two unit tangent vectors
 * in (N, E, Vertical) frame. This is the Sawaryn 2005 eq. (2).
 */
function _doglegRad(I1: number, I2: number, A1: number, A2: number): number {
    const c = Math.cos(I2 - I1) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(A2 - A1));
    // clamp for numerical safety (floating error can push |c| slightly > 1)
    const clamped = c > 1 ? 1 : c < -1 ? -1 : c;
    return Math.acos(clamped);
}

/**
 * Ratio factor (RF) for the Minimum Curvature Method.
 *   RF = (2 / dogleg) * tan(dogleg / 2)
 * Converges to 1.0 as dogleg -> 0 (degenerates to tangent method).
 */
function _ratioFactor(doglegRad: number): number {
    if (Math.abs(doglegRad) < DOGLEG_EPS) return 1.0;
    return (2 / doglegRad) * Math.tan(doglegRad / 2);
}

/**
 * Dogleg Severity (DLS) — industry standard metric for trajectory
 * curvature. Measured in degrees per course length (default 30 m).
 *
 *   DLS = dogleg_deg * (courseLength / mdDelta)
 *
 * Returns 0 when mdDelta <= 0 (defensive; caller should have filtered
 * these via validateSurvey).
 */
export function computeDLS(
    inc1: number,
    az1: number,
    inc2: number,
    az2: number,
    mdDelta: number,
    courseLength: number = DEFAULT_COURSE_LENGTH_M,
): number {
    if (!Number.isFinite(mdDelta) || mdDelta <= 0) return 0;
    if (!Number.isFinite(courseLength) || courseLength <= 0) {
        throw new RangeError(`[directional] courseLength must be > 0 (got ${courseLength})`);
    }
    const I1 = inc1 * DEG_TO_RAD;
    const I2 = inc2 * DEG_TO_RAD;
    const A1 = az1 * DEG_TO_RAD;
    const A2 = az2 * DEG_TO_RAD;
    const dlRad = _doglegRad(I1, I2, A1, A2);
    const dlDeg = dlRad * RAD_TO_DEG;
    return (dlDeg * courseLength) / mdDelta;
}

/**
 * Tangent (balanced) interpolation — fallback when dogleg is zero
 * or as a cheap alternative. Uses only the first station's direction
 * for the full segment.
 *
 * Returns {dTVD, dN, dE} (meters). Not recommended for production
 * trajectory work: it systematically underestimates curvature. Here
 * for educational / comparison purposes and for the degenerate
 * (near-zero dogleg) branch inside minimumCurvature.
 */
export function tangentInterpolate(
    inc1: number,
    az1: number,
    inc2: number,
    az2: number,
    mdDelta: number,
): TangentDelta {
    // Balanced tangent: average the two stations' angles.
    const I1 = inc1 * DEG_TO_RAD;
    const I2 = inc2 * DEG_TO_RAD;
    const A1 = az1 * DEG_TO_RAD;
    const A2 = az2 * DEG_TO_RAD;
    const dTVD = (mdDelta / 2) * (Math.cos(I1) + Math.cos(I2));
    const dN = (mdDelta / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2));
    const dE = (mdDelta / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2));
    return Object.freeze({ dTVD, dN, dE });
}

/**
 * Minimum Curvature Method — the canonical API/SPE algorithm for
 * computing a directional well trajectory from a deviation survey.
 *
 * Input: survey with N stations (columnar or station-list form).
 * Output (all arrays length N, station 0 anchored at origin):
 *   - tvd[i]   True Vertical Depth (m, positive downward)
 *   - north[i] North offset from wellhead (m)
 *   - east[i]  East offset from wellhead (m)
 *   - dls[i]   Dogleg Severity between station i-1 and i
 *              (deg/courseLength). dls[0] = 0 by convention.
 *
 * Sign convention: N+ is geographic North, E+ is geographic East,
 * TVD+ is downward (i.e. depth below wellhead).
 *
 * Units: MD/TVD/N/E in meters; inc/az in degrees.
 */
export function minimumCurvature(
    survey: SurveyInput,
    opts: MinimumCurvatureOptions = {},
): MinimumCurvatureResult {
    const courseLength = opts.courseLength ?? DEFAULT_COURSE_LENGTH_M;
    const { md, inc, az } = validateSurvey(survey);
    const n = md.length;
    const tvd = new Array<number>(n);
    const north = new Array<number>(n);
    const east = new Array<number>(n);
    const dls = new Array<number>(n);

    // anchor station 0 at origin
    tvd[0] = 0;
    north[0] = 0;
    east[0] = 0;
    dls[0] = 0;

    for (let i = 1; i < n; i++) {
        const dMD = (md[i] as number) - (md[i - 1] as number);
        const I1 = (inc[i - 1] as number) * DEG_TO_RAD;
        const I2 = (inc[i] as number) * DEG_TO_RAD;
        const A1 = (az[i - 1] as number) * DEG_TO_RAD;
        const A2 = (az[i] as number) * DEG_TO_RAD;

        const dlRad = _doglegRad(I1, I2, A1, A2);
        const rf = _ratioFactor(dlRad);

        const dTVD = (dMD / 2) * (Math.cos(I1) + Math.cos(I2)) * rf;
        const dN = (dMD / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2)) * rf;
        const dE = (dMD / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2)) * rf;

        tvd[i] = (tvd[i - 1] as number) + dTVD;
        north[i] = (north[i - 1] as number) + dN;
        east[i] = (east[i - 1] as number) + dE;
        dls[i] = (dlRad * RAD_TO_DEG * courseLength) / dMD;
    }

    return Object.freeze({
        md: Object.freeze(md.slice()),
        tvd: Object.freeze(tvd),
        north: Object.freeze(north),
        east: Object.freeze(east),
        dls: Object.freeze(dls),
    });
}

/**
 * Kickoff Point — shallowest MD at which inclination exceeds a
 * threshold (default 3°). Common field usage: flag the point where
 * a vertical well starts to deviate.
 *
 * Returns null if no station exceeds the threshold.
 */
export function kickoffPoint(survey: SurveyInput, threshold: number = 3): KickoffPoint | null {
    if (!Number.isFinite(threshold) || threshold < 0) {
        throw new RangeError(`[directional] threshold must be >= 0 (got ${threshold})`);
    }
    const { md, inc } = validateSurvey(survey);
    for (let i = 0; i < md.length; i++) {
        const inci = inc[i] as number;
        if (inci > threshold) {
            return Object.freeze({ stationIndex: i, md: md[i] as number, inc: inci });
        }
    }
    return null;
}
