// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// First-order decay solver with retardation factor for contaminant transport.
// References:
//   Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice-Hall. (retardation factor)
//   Domenico, P.A. & Schwartz, F.W. (1998). Physical and Chemical Hydrogeology, 2nd ed. Wiley.
//   Ogata, A. & Banks, R.B. (1961). A solution of the differential equation of longitudinal
//     dispersion in porous media. USGS Professional Paper 411-A.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a value is strictly positive (> 0).
 * @param v - Value to check
 * @param name - Parameter name for error message
 * @throws {RangeError}
 */
function validatePositive(v: number, name: string) {
    if (!Number.isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${v}`);
    }
}

/**
 * Validate that a value is non-negative (>= 0).
 * @param v - Value to check
 * @param name - Parameter name for error message
 * @throws {RangeError}
 */
function validateNonNegative(v: number, name: string) {
    if (!Number.isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Solver 1 - First-order decay over a time series
// ---------------------------------------------------------------------------

interface FirstOrderDecayParams {
    c0: number;
    k: number;
    times: number[];
}

interface FirstOrderDecayResult {
    profile: ReadonlyArray<Readonly<{ t: number; c: number; residualFraction: number }>>;
    halfLife: number;
    ninetyPctReduction: number;
    ninetyNinePctReduction: number;
}

/**
 * Solve first-order decay: C(t) = C0 * exp(-k * t)
 *
 * Applicable to: biodegradation of organic contaminants, radioactive decay,
 * nutrient cycling, disinfection kinetics.
 *
 * @param params - Parameters
 *   c0: initial concentration (any consistent unit, e.g. mg/L, Bq/m³), >= 0
 *   k: first-order decay rate constant (1/day), > 0
 *   times: array of times at which to evaluate concentration (days), all >= 0
 * @returns Immutable result object
 * @throws {RangeError} if k <= 0, c0 < 0, or times is empty
 */
export function solveFirstOrderDecay({ c0, k, times }: FirstOrderDecayParams): Readonly<FirstOrderDecayResult> {
    validateNonNegative(c0, 'c0');
    validatePositive(k, 'k');

    if (!Array.isArray(times) || times.length === 0) {
        throw new RangeError('times must be a non-empty array');
    }
    for (let i = 0; i < times.length; i++) {
        validateNonNegative(times[i]!, `times[${i}]`);
    }

    // Characteristic time points
    const halfLife = Math.LN2 / k; // ln(2)/k
    const ninetyPctReduction = Math.log(10) / k; // ln(10)/k  → C/C0 = 0.1
    const ninetyNinePctReduction = Math.log(100) / k; // ln(100)/k → C/C0 = 0.01

    const profile = times.map((t) => {
        const residualFraction = Math.exp(-k * t);
        const c = c0 * residualFraction;
        return Object.freeze({ t, c, residualFraction });
    });

    return Object.freeze({
        profile: Object.freeze(profile),
        halfLife,
        ninetyPctReduction,
        ninetyNinePctReduction,
    });
}

// ---------------------------------------------------------------------------
// Solver 2 - Time to reach a target concentration
// ---------------------------------------------------------------------------

interface DecayTimeParams {
    c0: number;
    cTarget: number;
    k: number;
}

interface DecayTimeResult {
    timeToTarget: number;
    reachable: boolean;
}

/**
 * Compute the time required for a contaminant to decay to a target concentration.
 *
 * From C(t) = C0*exp(-k*t):  t = -ln(cTarget/C0) / k
 *
 * @param params - Parameters
 *   c0: initial concentration (same unit as cTarget), > 0
 *   cTarget: target concentration (same unit as c0), >= 0
 *   k: first-order decay rate constant (1/day), > 0
 * @returns Immutable result object
 *   reachable: false if cTarget >= c0 (cannot decay to a higher concentration)
 *   timeToTarget: time in days; Infinity if cTarget <= 0 (asymptotic)
 * @throws {RangeError} if k <= 0 or c0 <= 0
 */
export function computeDecayTime({ c0, cTarget, k }: DecayTimeParams): Readonly<DecayTimeResult> {
    validatePositive(c0, 'c0');
    validatePositive(k, 'k');
    validateNonNegative(cTarget, 'cTarget');

    // Cannot decay TO a higher concentration
    if (cTarget >= c0) {
        return Object.freeze({ timeToTarget: 0, reachable: false });
    }

    // Asymptotic: concentration approaches 0 but never reaches negative target
    if (cTarget <= 0) {
        return Object.freeze({ timeToTarget: Infinity, reachable: true });
    }

    const timeToTarget = -Math.log(cTarget / c0) / k;
    return Object.freeze({ timeToTarget, reachable: true });
}

// ---------------------------------------------------------------------------
// Solver 3 - Retardation factor for sorbing solute
// ---------------------------------------------------------------------------

interface RetardationParams {
    kd: number;
    bulkDensity: number;
    porosity: number;
}

interface RetardationResult {
    R: number;
    effectiveVelocityFraction: number;
}

/**
 * Compute the retardation factor R for a solute undergoing linear sorption.
 *
 * R = 1 + (ρ_b * Kd) / θ
 *
 * where ρ_b is dry bulk density (g/cm³), Kd is the distribution coefficient
 * (cm³/g), and θ is volumetric water content (dimensionless).
 *
 * Reference: Freeze & Cherry (1979) eq. 9.13; also known as the linear
 * sorption retardation equation.
 *
 * @param params - Parameters
 *   kd: distribution coefficient (cm³/g = mL/g), >= 0
 *   bulkDensity: dry bulk density (g/cm³), typical range 1.4–1.8, > 0
 *   porosity: volumetric water content (0–1), > 0
 * @returns Immutable result object
 *   R: retardation factor (>= 1 for Kd >= 0)
 *   effectiveVelocityFraction: 1/R - contaminant velocity relative to pore water
 * @throws {RangeError} if porosity <= 0 or bulkDensity <= 0
 */
export function computeRetardation({ kd, bulkDensity, porosity }: RetardationParams): Readonly<RetardationResult> {
    validatePositive(bulkDensity, 'bulkDensity');
    validatePositive(porosity, 'porosity');
    validateNonNegative(kd, 'kd');

    if (porosity >= 1) {
        throw new RangeError(`porosity must be < 1 (dimensionless water content), got ${porosity}`);
    }

    const R = 1 + (bulkDensity * kd) / porosity;
    const effectiveVelocityFraction = 1 / R;

    return Object.freeze({ R, effectiveVelocityFraction });
}

// ---------------------------------------------------------------------------
// Solver 4 - Contaminant breakthrough at a downgradient receptor
// ---------------------------------------------------------------------------

interface BreakthroughParams {
    columnLength: number;
    poreVelocity: number;
    R: number;
    k: number;
    c0: number;
}

interface BreakthroughResult {
    tBreakthrough: number;
    cAtBreakthrough: number;
    attenuationFactor: number;
}

/**
 * Estimate contaminant breakthrough time and concentration at a receptor
 * located downgradient at distance L from the source.
 *
 * Simplified 1D advective model (ignores hydrodynamic dispersion):
 *   tBreakthrough = R * L / vPoreWater   (retarded advective travel time)
 *   C(tBreakthrough) = C0 * exp(-k * tBreakthrough)
 *
 * For a non-degrading tracer (k=0), C_at_breakthrough = C0.
 *
 * @param params - Parameters
 *   columnLength: distance from source to receptor (m), > 0
 *   poreVelocity: pore water velocity (m/day), > 0
 *   R: retardation factor (>= 1), > 0
 *   k: first-order decay rate constant (1/day), >= 0
 *   c0: source concentration (mg/L or consistent unit), >= 0
 * @returns Immutable result object
 *   tBreakthrough: retarded advective travel time (days)
 *   cAtBreakthrough: concentration at receptor at breakthrough (mg/L)
 *   attenuationFactor: cAtBreakthrough / c0 (0–1)
 * @throws {RangeError} on invalid inputs
 */
export function computeBreakthrough({ columnLength, poreVelocity, R, k, c0 }: BreakthroughParams): Readonly<BreakthroughResult> {
    validatePositive(columnLength, 'columnLength');
    validatePositive(poreVelocity, 'poreVelocity');
    validatePositive(R, 'R');
    validateNonNegative(k, 'k');
    validateNonNegative(c0, 'c0');

    const tBreakthrough = (R * columnLength) / poreVelocity;
    const attenuationFactor = Math.exp(-k * tBreakthrough);
    const cAtBreakthrough = c0 * attenuationFactor;

    return Object.freeze({ tBreakthrough, cAtBreakthrough, attenuationFactor });
}
