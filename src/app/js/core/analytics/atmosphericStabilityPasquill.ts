// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * @fileoverview Atmospheric Stability Classification (Pasquill-Gifford) + Gaussian Dispersion
 *
 * Implements the Pasquill-Gifford (1961/1976) stability classification scheme and
 * Briggs (1973) dispersion coefficient parameterizations for open-country terrain.
 * Used for screening-level air quality and odour/toxic gas dispersion assessments.
 *
 * References:
 *   Pasquill, F. (1961). The Estimation of the Dispersion of Windborne Material.
 *     Meteorological Magazine 90: 33–49.
 *   Gifford, F. A. (1976). Turbulent Diffusion-Typing Schemes: A Review.
 *     Nuclear Safety 17(1): 68–86.
 *   Briggs, G. A. (1973). Diffusion Estimation for Small Emissions. ATDL Contribution 79.
 *   EPA (1995). AERMOD: Description of Model Formulation. EPA-454/R-03-004.
 *   Seinfeld, J. H. & Pandis, S. N. (2006). Atmospheric Chemistry and Physics.
 *     ISBN 978-0-471-72018-8.
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

type StabilityClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Pasquill stability classification lookup table.
 *
 * Rows: wind speed bins [0-2, 2-3, 3-5, 5-6, >6] m/s
 * Columns: [strong_radiation, moderate_radiation, slight_radiation, overcast/night_thin, night_cloudy]
 *
 * Source: Pasquill (1961) Table 1 as adapted by Turner (1970) and EPA (1987).
 */
const STABILITY_TABLE: string[][] = [
    //   strong   mod     slight   overcast  nightCloud
    ['A', 'A-B', 'B', 'D', 'D'], // u < 2 m/s
    ['A-B', 'B', 'C', 'D', 'D'], // 2 ≤ u < 3
    ['B', 'B-C', 'C', 'D', 'D'], // 3 ≤ u < 5
    ['C', 'C-D', 'D', 'D', 'D'], // 5 ≤ u < 6
    ['D', 'D', 'D', 'D', 'D'], // u ≥ 6
];

/**
 * Resolves combined stability class (e.g. 'A-B') to the more unstable single class.
 * @param raw - raw entry from STABILITY_TABLE
 */
function resolveCombo(raw: string): StabilityClass {
    const result = (raw.includes('-') ? raw[0] : raw) as StabilityClass;
    return result;
}

/**
 * Briggs (1973) open-country sigma-y coefficients [a, b] for sigma_y = a*x / sqrt(1 + b*x).
 * x in metres; sigma in metres.
 * Indexed by stability class A–F.
 */
const BRIGGS_SIGMA_Y: Record<StabilityClass, [number, number]> = {
    A: [0.22, 0.0001],
    B: [0.16, 0.0001],
    C: [0.11, 0.0001],
    D: [0.08, 0.0001],
    E: [0.06, 0.0001],
    F: [0.04, 0.0001],
};

/**
 * Briggs (1973) open-country sigma-z coefficients [a, b, c] for sigma_z = a*x^b.
 * Capped at 5000 m (physical limit of well-mixed layer).
 */
const BRIGGS_SIGMA_Z: Record<StabilityClass, { a: number; b: number }> = {
    A: { a: 0.2, b: 0.89 },
    B: { a: 0.12, b: 0.95 },
    C: { a: 0.08, b: 0.9 },
    D: { a: 0.06, b: 0.71 },
    E: { a: 0.03, b: 0.71 },
    F: { a: 0.016, b: 0.71 },
};

const VALID_CLASSES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

/**
 * Classifies Pasquill-Gifford atmospheric stability from surface meteorological observations.
 *
 * Method: Turner (1970) numerical approximation based on wind speed, incoming solar
 * radiation (or net radiation), and cloud cover for nocturnal conditions.
 *
 * @param windSpeed_ms          - Wind speed at 10 m height (m/s); must be >= 0
 * @param solarRadiation_Wm2    - Incoming solar radiation (W/m²); use negative for night
 * @param cloudCover_oktas      - Cloud cover in oktas (0–8); used for night classification
 * @returns Pasquill stability class
 */
function validateStabilityInputs(
    windSpeed_ms: number,
    solarRadiation_Wm2: number,
    cloudCover_oktas: number,
): void {
    if (typeof windSpeed_ms !== 'number' || windSpeed_ms < 0) {
        throw new RangeError('windSpeed_ms must be >= 0');
    }
    if (typeof solarRadiation_Wm2 !== 'number') {
        throw new TypeError('solarRadiation_Wm2 must be a number');
    }
    if (typeof cloudCover_oktas !== 'number' || cloudCover_oktas < 0 || cloudCover_oktas > 8) {
        throw new RangeError('cloudCover_oktas must be between 0 and 8');
    }
}

function windSpeedToIndex(windSpeed_ms: number): number {
    if (windSpeed_ms < 2) return 0;
    if (windSpeed_ms < 3) return 1;
    if (windSpeed_ms < 5) return 2;
    if (windSpeed_ms < 6) return 3;
    return 4;
}

function radiationToIndex(solarRadiation_Wm2: number): number {
    if (solarRadiation_Wm2 >= 600) return 0; // strong
    if (solarRadiation_Wm2 >= 300) return 1; // moderate
    return 2; // slight
}

function resolveNightStability(windSpeed_ms: number, cloudCover_oktas: number): StabilityClass {
    if (windSpeed_ms < 3 && cloudCover_oktas <= 3) return 'F';
    if (windSpeed_ms < 5 && cloudCover_oktas <= 4) return 'E';
    return 'D';
}

export function classifyPasquillStability(
    windSpeed_ms: number,
    solarRadiation_Wm2: number,
    cloudCover_oktas: number = 0,
): StabilityClass {
    validateStabilityInputs(windSpeed_ms, solarRadiation_Wm2, cloudCover_oktas);

    const uIdx = windSpeedToIndex(windSpeed_ms);

    if (solarRadiation_Wm2 <= 0) {
        return resolveNightStability(windSpeed_ms, cloudCover_oktas);
    }

    const radIdx = radiationToIndex(solarRadiation_Wm2);
    const row = STABILITY_TABLE[uIdx];
    if (!row) throw new RangeError(`windSpeed_ms ${windSpeed_ms} produced invalid index ${uIdx}`);
    const raw = row[radIdx];
    if (!raw) throw new RangeError(`solarRadiation_Wm2 ${solarRadiation_Wm2} produced invalid index ${radIdx}`);
    return resolveCombo(raw);
}

/**
 * Calculates lateral (crosswind) dispersion coefficient sigma_y using Briggs (1973).
 *
 * sigma_y(x) = a * x / sqrt(1 + b * x)
 *
 * @param x_m              - Downwind distance from source (m); must be > 0
 * @param stabilityClass   - Pasquill-Gifford class
 * @returns sigma_y in metres
 */
export function calcSigmaY(x_m: number, stabilityClass: StabilityClass): number {
    if (typeof x_m !== 'number' || x_m <= 0) {
        throw new RangeError('x_m must be a positive distance (m)');
    }
    if (!VALID_CLASSES.has(stabilityClass)) {
        throw new TypeError(`stabilityClass must be one of A-F, got: ${stabilityClass}`);
    }

    const [a, b] = BRIGGS_SIGMA_Y[stabilityClass];
    return (a * x_m) / Math.sqrt(1 + b * x_m);
}

/**
 * Calculates vertical dispersion coefficient sigma_z using Briggs (1973).
 *
 * sigma_z(x) = a * x^b   (capped at 5000 m)
 *
 * @param x_m              - Downwind distance from source (m); must be > 0
 * @param stabilityClass   - Pasquill-Gifford class
 * @returns sigma_z in metres
 */
export function calcSigmaZ(x_m: number, stabilityClass: StabilityClass): number {
    if (typeof x_m !== 'number' || x_m <= 0) {
        throw new RangeError('x_m must be a positive distance (m)');
    }
    if (!VALID_CLASSES.has(stabilityClass)) {
        throw new TypeError(`stabilityClass must be one of A-F, got: ${stabilityClass}`);
    }

    const { a, b } = BRIGGS_SIGMA_Z[stabilityClass];
    const sigma = a * Math.pow(x_m, b);
    return Math.min(sigma, 5000); // physical cap
}

/**
 * Calculates ground-level or elevated receptor concentration using the
 * steady-state Gaussian plume equation (Seinfeld & Pandis, 2006 Eq. 18.40).
 *
 * C(x,y,z) = (Q / (2π * u * σy * σz))
 *           * exp(-y² / (2σy²))
 *           * [exp(-(z-H)² / (2σz²)) + exp(-(z+H)² / (2σz²))]
 *
 * @param Q               - Emission rate (µg/s or g/s - same units returned)
 * @param u               - Mean wind speed at plume height (m/s)
 * @param x               - Downwind distance (m)
 * @param y               - Crosswind distance (m)
 * @param z               - Receptor height above ground (m); use 0 for ground-level
 * @param H               - Effective stack height = physical height + plume rise (m)
 * @param stabilityClass  - Pasquill-Gifford class
 * @returns C - concentration (same mass units as Q, per m³)
 */
export function calcGaussianConcentration(
    Q: number,
    u: number,
    x: number,
    y: number,
    z: number,
    H: number,
    stabilityClass: StabilityClass,
): { C: number; sigmaY: number; sigmaZ: number } {
    if (typeof Q !== 'number' || Q < 0) throw new RangeError('Q must be >= 0');
    if (typeof u !== 'number' || u <= 0) throw new RangeError('u must be > 0 m/s');
    if (typeof x !== 'number' || x <= 0) throw new RangeError('x must be > 0 m');
    if (typeof y !== 'number') throw new TypeError('y must be a number');
    if (typeof z !== 'number' || z < 0) throw new RangeError('z must be >= 0');
    if (typeof H !== 'number' || H < 0) throw new RangeError('H must be >= 0');

    const sigmaY = calcSigmaY(x, stabilityClass);
    const sigmaZ = calcSigmaZ(x, stabilityClass);

    const Qterm = Q / (2 * Math.PI * u * sigmaY * sigmaZ);
    const yterm = Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
    const zterm = Math.exp(-((z - H) ** 2) / (2 * sigmaZ * sigmaZ)) + Math.exp(-((z + H) ** 2) / (2 * sigmaZ * sigmaZ));

    const C = Qterm * yterm * zterm;

    return { C, sigmaY, sigmaZ };
}

/**
 * Returns descriptive metadata for each Pasquill-Gifford stability class.
 *
 * @param stabilityClass - Pasquill-Gifford class
 */
export function describePGClass(
    stabilityClass: StabilityClass,
): { class: string; description: string; typical_conditions: string } {
    const DESCRIPTIONS: Record<StabilityClass, { description: string; typical_conditions: string }> = {
        A: { description: 'Extremely unstable', typical_conditions: 'Strong insolation, low wind, afternoon' },
        B: { description: 'Moderately unstable', typical_conditions: 'Moderate insolation, light wind' },
        C: { description: 'Slightly unstable', typical_conditions: 'Weak insolation, light wind' },
        D: { description: 'Neutral', typical_conditions: 'Overcast, moderate wind, or nighttime' },
        E: { description: 'Slightly stable', typical_conditions: 'Clear night, moderate wind' },
        F: { description: 'Moderately stable', typical_conditions: 'Clear night, calm wind' },
    };
    if (!VALID_CLASSES.has(stabilityClass)) {
        throw new TypeError(`stabilityClass must be one of A-F`);
    }
    return { class: stabilityClass, ...DESCRIPTIONS[stabilityClass] };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericStabilityPasquillMeta: AnalyticsModuleMeta = {
    name: 'atmosphericStabilityPasquill',
    description: 'atmosphericStabilityPasquill',
    category: 'analytics',
    familyTags: ['atmosphere'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
