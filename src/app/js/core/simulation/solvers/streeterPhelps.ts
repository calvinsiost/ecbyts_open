// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Streeter-Phelps dissolved oxygen sag curve solver.
// Reference: Streeter, H.W. & Phelps, E.B. (1925). A study of the pollution
//   and natural purification of the Ohio River. Public Health Bulletin No. 146.
// Secondary ref: Tchobanoglous, G., Burton, F.L. & Stensel, H.D. (2003).
//   Wastewater Engineering: Treatment and Resource Recovery, 4th ed. McGraw-Hill.
// DO saturation formula: Benson & Krause (1984) simplified exponential fit.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StreeterPhelpsParams {
    kd: number;
    kr: number;
    ld0: number;
    do0: number;
    temp: number;
    velocity: number;
    distances: number[];
}

interface ProfilePoint {
    x: number;
    doDeficit: number;
    doValue: number;
    bod: number;
}

interface CriticalPoint {
    xCritical: number;
    doCritical: number;
    doAtCritical: number;
    doSaturation: number;
}

interface StreeterPhelpsResult {
    profile: ReadonlyArray<Readonly<ProfilePoint>>;
    critical: Readonly<CriticalPoint>;
    doSaturation: number;
    inputSummary: Readonly<object>;
}

/**
 * Approximate dissolved oxygen saturation concentration at temperature T.
 * Equation: DOs = 14.62 * exp(-0.02386 * T)  [mg/L]
 * Gives ≈14.62 mg/L at 0°C and ≈9.08 mg/L at 20°C.
 * Derived from Benson & Krause (1984) linearised over 0–35°C.
 * Note: coefficient 0.02386 = -ln(DOs(20°C)/DOs(0°C)) / 20°C
 *   using DOs(20°C) = 9.08 mg/L and DOs(0°C) = 14.62 mg/L.
 * @param tempC - Water temperature in degrees Celsius (0–35)
 * @returns DO saturation (mg/L)
 */
function doSaturation(tempC: number): number {
    return 14.62 * Math.exp(-0.02386 * tempC);
}

/**
 * Validate that a value is strictly positive (> 0).
 * @param v - Value to check
 * @param name - Parameter name for error message
 * @throws {RangeError}
 */
function validatePositive(v: number, name: string): void {
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
function validateNonNegative(v: number, name: string): void {
    if (!Number.isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Main solver
// ---------------------------------------------------------------------------

/**
 * Solve the Streeter-Phelps DO sag curve for a river reach downstream of an
 * organic waste discharge point.
 *
 * Deficit equation:
 *   D(x) = (kd * Ld0) / (kr - kd) * (exp(-kd*x/U) - exp(-kr*x/U)) + D0 * exp(-kr*x/U)
 *
 * Critical (minimum DO) distance:
 *   xc = (U / (kr - kd)) * ln((kr/kd) * (1 - D0*(kr-kd)/(kd*Ld0)))
 *
 * @param params
 *   kd: BOD deoxygenation rate constant (1/day), > 0
 *   kr: reaeration rate constant (1/day), > 0, must differ from kd
 *   ld0: initial BOD after mixing at discharge point (mg/L), >= 0
 *   do0: measured DO at discharge point (mg/L), >= 0
 *   temp: water temperature (°C), 0–35
 *   velocity: mean stream velocity (m/day), > 0
 *   distances: downstream distances at which to evaluate DO profile (m), >= 0
 * @throws {RangeError} on invalid params
 */
export function solveStreeterPhelps(params: StreeterPhelpsParams): Readonly<StreeterPhelpsResult> {
    const { kd, kr, ld0, do0, temp, velocity, distances } = params;

    // --- Validation ---
    validatePositive(kd, 'kd');
    validatePositive(kr, 'kr');
    validateNonNegative(ld0, 'ld0');
    validateNonNegative(do0, 'do0');
    validatePositive(velocity, 'velocity');

    if (!Number.isFinite(temp) || temp < 0 || temp > 35) {
        throw new RangeError(`temp must be between 0 and 35 °C, got ${temp}`);
    }
    if (!Array.isArray(distances) || distances.length === 0) {
        throw new RangeError('distances must be a non-empty array');
    }
    for (let i = 0; i < distances.length; i++) {
        validateNonNegative(distances[i] as number, `distances[${i}]`);
    }

    // kr === kd causes division by zero in the deficit formula
    if (Math.abs(kr - kd) < 1e-12) {
        throw new RangeError(`kr and kd must differ to avoid singular denominator (kr=${kr}, kd=${kd})`);
    }

    // --- Derived quantities ---
    const dos = doSaturation(temp); // DO saturation (mg/L)
    const d0 = dos - do0; // Initial DO deficit (mg/L); can be negative if super-saturated
    const dkr = kr - kd; // (kr - kd)

    // --- Profile ---
    const profile = distances.map((x): Readonly<ProfilePoint> => {
        // Travel time t = x / U (days)
        const expKd = Math.exp((-kd * x) / velocity);
        const expKr = Math.exp((-kr * x) / velocity);

        // Streeter-Phelps deficit at x
        const doDeficit = Math.max(0, ((kd * ld0) / dkr) * (expKd - expKr) + d0 * expKr);

        // DO value: clamp to [0, dos]
        const doValue = Math.max(0, Math.min(dos, dos - doDeficit));

        // BOD remaining at x (first-order decay)
        const bod = ld0 * expKd;

        return Object.freeze({ x, doDeficit, doValue, bod });
    });

    // --- Critical point ---
    // xc = (U / (kr - kd)) * ln((kr/kd) * (1 - D0*(kr-kd)/(kd*Ld0)))
    let xCritical: number;
    let doCritical: number;
    let doAtCritical: number;

    if (ld0 > 0) {
        const logArg = (kr / kd) * (1 - (d0 * dkr) / (kd * ld0));

        if (logArg > 0) {
            xCritical = (velocity / dkr) * Math.log(logArg);
            if (xCritical < 0) {
                // Critical point is upstream - minimum deficit occurs at x=0
                xCritical = 0;
            }
            const expKdC = Math.exp((-kd * xCritical) / velocity);
            const expKrC = Math.exp((-kr * xCritical) / velocity);
            doCritical = Math.max(0, ((kd * ld0) / dkr) * (expKdC - expKrC) + d0 * expKrC);
        } else {
            // Argument to ln is non-positive - critical point not defined analytically;
            // approximate as x=0 (deficit does not exceed initial).
            xCritical = 0;
            doCritical = Math.max(0, d0);
        }
        doAtCritical = Math.max(0, dos - doCritical);
    } else {
        // No BOD load: reaeration only - DO recovers monotonically.
        // Minimum DO is at x=0.
        xCritical = 0;
        doCritical = Math.max(0, d0);
        doAtCritical = Math.max(0, dos - doCritical);
    }

    const critical = Object.freeze({
        xCritical,
        doCritical,
        doAtCritical,
        doSaturation: dos,
    });

    const inputSummary = Object.freeze({ kd, kr, ld0, do0, temp, velocity, distanceCount: distances.length });

    return (
        Object.freeze({
            profile: Object.freeze(profile),
            critical,
            doSaturation: dos,
            inputSummary,
        }) as unknown as Readonly<StreeterPhelpsResult>
    );
}
