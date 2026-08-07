// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Darcy's Law groundwater flow solver - pure-logic module.
 *
 * Computes:
 *   - Hydraulic gradient from piezometric head at ≥3 monitoring wells
 *   - Darcy velocity (specific discharge)
 *   - Average linear seepage velocity
 *   - Retardation factor (sorption)
 *   - Retarded contaminant velocity
 *   - Travel time between source and receptor
 *   - Pumping-well capture-zone approximation
 *
 * Academic references:
 *   - Bear, J. (1972). Dynamics of Fluids in Porous Media. Wiley.
 *   - Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice-Hall, pp. 15-16.
 *   - Domenico, P.A. & Schwartz, F.W. (1990). Physical and Chemical Hydrogeology.
 *
 * @module darcyFlow
 */

// ---------------------------------------------------------------------------
// SECTION 1 - Hydraulic Gradient (least-squares plane fit)
// ---------------------------------------------------------------------------

interface Well {
    x: number;
    y: number;
    head: number;
}

interface Solve3x3Result {
    x: [number, number, number] | null;
    det: number;
}

/**
 * Solve a 3×3 linear system Ax = b using Cramer's rule.
 * A is stored row-major as a flat 9-element array.
 *
 * @param A - 3×3 matrix, row-major [a00,a01,a02, a10,a11,a12, a20,a21,a22]
 * @param b - right-hand side [b0, b1, b2]
 * @returns Solution and determinant
 */
function solve3x3(A_in: number[], b_in: number[]): Solve3x3Result {
    if (A_in.length < 9) throw new RangeError('solve3x3: A must have 9 elements');
    if (b_in.length < 3) throw new RangeError('solve3x3: b must have 3 elements');

    const A = A_in as [number, number, number, number, number, number, number, number, number];
    const b = b_in as [number, number, number];
    const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = A;
    const [b0, b1, b2] = b;

    // Calcula o determinante por expansão de cofatores (1ª linha)
    const det =
        a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);

    if (Math.abs(det) < 1e-12) {
        return { x: null, det };
    }

    // Solução por regra de Cramer
    const det0 =
        b0 * (a11 * a22 - a12 * a21) - a01 * (b1 * a22 - a12 * b2) + a02 * (b1 * a21 - a11 * b2);

    const det1 =
        a00 * (b1 * a22 - a12 * b2) - b0 * (a10 * a22 - a12 * a20) + a02 * (a10 * b2 - b1 * a20);

    const det2 =
        a00 * (a11 * b2 - b1 * a21) - a01 * (a10 * b2 - b1 * a20) + b0 * (a10 * a21 - a11 * a20);

    return { x: [det0 / det, det1 / det, det2 / det] as [number, number, number], det };
}

interface HydraulicGradientResult {
    gradientX: number;
    gradientY: number;
    magnitude: number;
    directionDeg: number;
    n: number;
    residualRMSE: number;
}

/**
 * Compute the hydraulic gradient vector from piezometric head data at
 * monitoring wells using least-squares plane fitting.
 *
 * Fits the model: head = a·x + b·y + c
 * via the normal equations of the overdetermined system.
 *
 * Returns the gradient (a, b) = (∂h/∂x, ∂h/∂y), its magnitude, flow
 * direction (degrees clockwise from north), and residual RMSE.
 *
 * @param wells - At least 3 wells. x, y in metres; head in metres amsl.
 * @returns Immutable gradient result
 * @throws {RangeError} if < 3 wells or wells are collinear
 *
 * Reference: Bear (1972) §7.1 - plane fitting to piezometric surface.
 */
export function computeHydraulicGradient(wells: Well[]): Readonly<HydraulicGradientResult> {
    if (!Array.isArray(wells) || wells.length < 3) {
        throw new RangeError('computeHydraulicGradient: at least 3 wells required');
    }

    const N = wells.length;

    // Acumula os somatórios para as equações normais
    let Sx = 0,
        Sy = 0,
        Sxx = 0,
        Sxy = 0,
        Syy = 0;
    let Sh = 0,
        Sxh = 0,
        Syh = 0;

    for (const w of wells) {
        Sx += w.x;
        Sy += w.y;
        Sxx += w.x * w.x;
        Sxy += w.x * w.y;
        Syy += w.y * w.y;
        Sh += w.head;
        Sxh += w.x * w.head;
        Syh += w.y * w.head;
    }

    // Matriz das equações normais (3×3):
    // [Σx² Σxy Σx ] [a]   [Σxh]
    // [Σxy Σy² Σy ] [b] = [Σyh]
    // [Σx  Σy  N  ] [c]   [Σh ]
    const A = [Sxx, Sxy, Sx, Sxy, Syy, Sy, Sx, Sy, N];
    const bVec = [Sxh, Syh, Sh];

    const { x: coeffs, det } = solve3x3(A, bVec);

    if (coeffs === null) {
        throw new RangeError(
            `computeHydraulicGradient: wells are collinear or coincident (det=${det.toExponential(2)})`,
        );
    }

    const [a, b, c] = coeffs; // gradientX, gradientY, intercept

    // RMSE residual - mede qualidade do ajuste ao plano piezométrico
    let sse = 0;
    for (const w of wells) {
        const predicted = a * w.x + b * w.y + c;
        const residual = w.head - predicted;
        sse += residual * residual;
    }
    const residualRMSE = Math.sqrt(sse / N);

    // Magnitude do gradiente hidráulico (m/m, adimensional)
    const magnitude = Math.sqrt(a * a + b * b);

    // Direção do fluxo: ângulo no sentido horário a partir do norte (y+)
    // O fluxo ocorre na direção descendente do gradiente: (-a, -b)
    // Direção de fluxo = atan2(-a, -b) convertido para graus, normalizado 0-360
    const directionDeg = ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360;

    return Object.freeze({
        gradientX: a,
        gradientY: b,
        magnitude,
        directionDeg,
        n: N,
        residualRMSE,
    });
}

// ---------------------------------------------------------------------------
// SECTION 2 - Darcy Velocity (Specific Discharge)
// ---------------------------------------------------------------------------

interface DarcyVelocityParams {
    K: number;
    gradient: number;
}

interface DarcyVelocityResult {
    q: number;
    unit: string;
    K: number;
    gradient: number;
}

/**
 * Compute Darcy velocity (specific discharge) using Darcy's Law:
 *   q = K × i
 *
 * Onde q é a descarga específica (m/s), K é a condutividade hidráulica (m/s)
 * e i é o gradiente hidráulico (adimensional, m/m).
 *
 * @param params - K and gradient
 *   K - hydraulic conductivity in m/s (positive)
 *   gradient - hydraulic gradient magnitude in m/m (non-negative)
 * @returns Immutable result
 * @throws {RangeError} if K ≤ 0 or gradient < 0
 *
 * Reference: Darcy, H. (1856). Les fontaines publiques de la ville de Dijon.
 *            Freeze & Cherry (1979) eq. 2.2.
 */
export function computeDarcyVelocity({ K, gradient }: DarcyVelocityParams): Readonly<DarcyVelocityResult> {
    if (K <= 0) {
        throw new RangeError(`computeDarcyVelocity: K must be > 0, got ${K}`);
    }
    if (gradient < 0) {
        throw new RangeError(`computeDarcyVelocity: gradient must be ≥ 0, got ${gradient}`);
    }

    const q = K * gradient;

    return Object.freeze({ q, unit: 'm/s', K, gradient });
}

// ---------------------------------------------------------------------------
// SECTION 3 - Average Linear Seepage Velocity
// ---------------------------------------------------------------------------

interface SeepageVelocityParams {
    K: number;
    gradient: number;
    ne: number;
}

interface SeepageVelocityResult {
    vs: number;
    unit: string;
    vsYearly: number;
    unit_yearly: string;
}

/**
 * Compute average linear seepage velocity (pore velocity):
 *   vs = q / ne = K × i / ne
 *
 * A velocidade de Darcy representa o fluxo por unidade de área total.
 * A velocidade de poro (seepage) representa o fluxo real médio dentro
 * dos poros conectados.
 *
 * @param params - K, gradient, ne
 *   K - hydraulic conductivity (m/s)
 *   gradient - hydraulic gradient (m/m)
 *   ne - effective porosity (dimensionless, 0 < ne < 1)
 * @returns Immutable result
 * @throws {RangeError} if ne ≤ 0, ne ≥ 1, K ≤ 0, or gradient < 0
 *
 * Reference: Bear (1972) §4.1; Freeze & Cherry (1979) p. 72.
 */
export function computeSeepageVelocity({ K, gradient, ne }: SeepageVelocityParams): Readonly<SeepageVelocityResult> {
    if (ne <= 0 || ne >= 1) {
        throw new RangeError(`computeSeepageVelocity: ne must be in (0, 1), got ${ne}`);
    }
    if (K <= 0) {
        throw new RangeError(`computeSeepageVelocity: K must be > 0, got ${K}`);
    }
    if (gradient < 0) {
        throw new RangeError(`computeSeepageVelocity: gradient must be ≥ 0, got ${gradient}`);
    }

    const q = K * gradient;
    const vs = q / ne;
    const SECONDS_PER_YEAR = 3.156e7;

    return Object.freeze({
        vs,
        unit: 'm/s',
        vsYearly: vs * SECONDS_PER_YEAR,
        unit_yearly: 'm/year',
    });
}

// ---------------------------------------------------------------------------
// SECTION 4 - Retardation Factor
// ---------------------------------------------------------------------------

interface RetardationFactorParams {
    Kd: number;
    rho_b: number;
    n: number;
}

interface RetardationFactorResult {
    R: number;
    Kd: number;
    rho_b: number;
    n: number;
    description: string;
}

/**
 * Compute the retardation factor for contaminant transport with linear sorption:
 *   R = 1 + (ρb × Kd) / n
 *
 * O fator de retardamento descreve quanto mais lento um contaminante
 * se move em relação à água subterrânea devido à adsorção na matriz do solo.
 *
 * @param params - Kd, rho_b, n
 *   Kd - distribution coefficient (cm³/g = mL/g)
 *   rho_b - bulk density (g/cm³, typically 1.5–2.0)
 *   n - total porosity (dimensionless, 0 < n < 1)
 * @returns Immutable result
 * @throws {RangeError} if Kd < 0, rho_b ≤ 0, or n ≤ 0 or n ≥ 1
 *
 * Reference: Freeze & Cherry (1979) p. 404; Domenico & Schwartz (1990) eq. 10.31.
 */
export function computeRetardationFactor({ Kd, rho_b, n }: RetardationFactorParams): Readonly<RetardationFactorResult> {
    if (Kd < 0) {
        throw new RangeError(`computeRetardationFactor: Kd must be ≥ 0, got ${Kd}`);
    }
    if (rho_b <= 0) {
        throw new RangeError(`computeRetardationFactor: rho_b must be > 0, got ${rho_b}`);
    }
    if (n <= 0 || n >= 1) {
        throw new RangeError(`computeRetardationFactor: n must be in (0, 1), got ${n}`);
    }

    const R = 1 + (rho_b * Kd) / n;

    let description: string;
    if (R > 5) {
        description = 'strongly_retarded';
    } else if (R >= 1.01) {
        description = 'moderately_retarded';
    } else {
        description = 'mobile';
    }

    return Object.freeze({ R, Kd, rho_b, n, description });
}

// ---------------------------------------------------------------------------
// SECTION 5 - Retarded Contaminant Velocity
// ---------------------------------------------------------------------------

interface RetardedVelocityParams {
    vs: number;
    R: number;
}

interface RetardedVelocityResult {
    vc: number;
    vs: number;
    R: number;
    unit: string;
    vcYearly: number;
}

/**
 * Compute retarded contaminant velocity:
 *   vc = vs / R
 *
 * A velocidade de transporte do contaminante é reduzida pelo fator de
 * retardamento em relação à velocidade de poro da água subterrânea.
 *
 * @param params - vs, R
 *   vs - seepage (pore) velocity (m/s)
 *   R - retardation factor (dimensionless, ≥ 1)
 * @returns Immutable result
 * @throws {RangeError} if vs < 0 or R < 1
 *
 * Reference: Bear (1972) §10.6; Ogata & Banks (1961) USGS Prof. Paper 411-A.
 */
export function computeRetardedVelocity({ vs, R }: RetardedVelocityParams): Readonly<RetardedVelocityResult> {
    if (vs < 0) {
        throw new RangeError(`computeRetardedVelocity: vs must be ≥ 0, got ${vs}`);
    }
    if (R < 1) {
        throw new RangeError(`computeRetardedVelocity: R must be ≥ 1, got ${R}`);
    }

    const SECONDS_PER_YEAR = 3.156e7;
    const vc = vs / R;

    return Object.freeze({
        vc,
        vs,
        R,
        unit: 'm/s',
        vcYearly: vc * SECONDS_PER_YEAR,
    });
}

// ---------------------------------------------------------------------------
// SECTION 6 - Travel Time
// ---------------------------------------------------------------------------

interface TravelTimeParams {
    distance: number;
    velocity: number;
}

interface TravelTimeResult {
    tSeconds: number;
    tDays: number;
    tYears: number;
    distance: number;
    velocity: number;
}

/**
 * Compute travel time from source to receptor:
 *   t = distance / velocity
 *
 * @param params - distance and velocity
 *   distance - separation in metres (must be > 0)
 *   velocity - contaminant or groundwater velocity (m/s, must be > 0)
 * @returns Immutable result
 * @throws {RangeError} if distance ≤ 0 or velocity ≤ 0
 *
 * Reference: Freeze & Cherry (1979) p. 396.
 */
export function computeTravelTime({ distance, velocity }: TravelTimeParams): Readonly<TravelTimeResult> {
    if (distance <= 0) {
        throw new RangeError(`computeTravelTime: distance must be > 0, got ${distance}`);
    }
    if (velocity <= 0) {
        throw new RangeError(`computeTravelTime: velocity must be > 0, got ${velocity}`);
    }

    const tSeconds = distance / velocity;

    return Object.freeze({
        tSeconds,
        tDays: tSeconds / 86400,
        tYears: tSeconds / 3.156e7,
        distance,
        velocity,
    });
}

// ---------------------------------------------------------------------------
// SECTION 7 - Pumping Well Capture Zone
// ---------------------------------------------------------------------------

interface CaptureZoneParams {
    Q: number;
    K: number;
    b: number;
    i: number;
}

interface CaptureZoneResult {
    captureZoneHalfWidth: number;
    stagnationPointDistance: number;
    unit: string;
}

/**
 * Estimate pumping-well capture zone maximum half-width and stagnation point.
 *
 * Based on the analytical solution for a uniform regional flow field with
 * a single pumping well (Bear 1979, Javandel et al. 1984):
 *   y_max = Q / (2 × K × b × i)          [maximum capture zone half-width, m]
 *   xs    = -Q / (2π × K × b × i)        [stagnation point distance, m, negative = upgradient]
 *
 * @param params - Q, K, b, i
 *   Q - pumping rate (m³/s, > 0)
 *   K - hydraulic conductivity (m/s, > 0)
 *   b - saturated aquifer thickness (m, > 0)
 *   i - regional hydraulic gradient (m/m, > 0)
 * @returns Immutable result
 * @throws {RangeError} if Q, K, b, or i ≤ 0
 *
 * Reference: Bear, J. (1979). Hydraulics of Groundwater. McGraw-Hill, p. 317.
 *            Javandel, I. et al. (1984). Groundwater Transport: Handbook of
 *            Mathematical Models. AGU Water Resources Monograph 10.
 */
export function estimateCaptureZoneWidth({ Q, K, b, i }: CaptureZoneParams): Readonly<CaptureZoneResult> {
    if (Q <= 0) throw new RangeError(`estimateCaptureZoneWidth: Q must be > 0, got ${Q}`);
    if (K <= 0) throw new RangeError(`estimateCaptureZoneWidth: K must be > 0, got ${K}`);
    if (b <= 0) throw new RangeError(`estimateCaptureZoneWidth: b must be > 0, got ${b}`);
    if (i <= 0) throw new RangeError(`estimateCaptureZoneWidth: i must be > 0, got ${i}`);

    const captureZoneHalfWidth = Q / (2 * K * b * i);
    const stagnationPointDistance = -Q / (2 * Math.PI * K * b * i);

    return Object.freeze({
        captureZoneHalfWidth,
        stagnationPointDistance,
        unit: 'm',
    });
}
