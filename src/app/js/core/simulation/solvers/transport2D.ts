// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Error function approximation via Horner polynomial.
 * Source: Abramowitz & Stegun 7.1.26 (maximum error: 1.5e-7)
 * @param {number} z - input value
 * @returns {number} erf(z)
 */
function erf(z: number): number {
    // A&S 7.1.26 coefficients
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z);
    const t = 1.0 / (1.0 + p * x);
    // Horner evaluation of polynomial
    const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
    return sign * (1.0 - poly * Math.exp(-x * x));
}

/**
 * Complementary error function.
 * @param {number} z - input value
 * @returns {number} erfc(z) = 1 - erf(z)
 */
function erfc(z: number): number {
    return 1.0 - erf(z);
}

/**
 * 2D Ogata-Banks analytical solution for continuous source in uniform 1D flow.
 * Models 2D advection-dispersion from a continuous planar source.
 *
 * C(x,y,t) = (C0/2) * erfc((x - v*t/R) / (2*sqrt(Dx*t/R)))
 *                   * exp(-y^2 / (4*Dy*t/R))
 *                   * exp(-lambda*t)
 *
 * Reference: Ogata & Banks (1961) USGS Professional Paper 411-A.
 * @param {number} x        - Longitudinal coordinate (m), measured from source
 * @param {number} y        - Transverse coordinate (m), measured from centreline
 * @param {number} t        - Time (s), must be > 0
 * @param {number} v        - Average pore velocity (m/s)
 * @param {number} Dx       - Longitudinal dispersion coefficient (m²/s)
 * @param {number} Dy       - Transverse dispersion coefficient (m²/s)
 * @param {number} C0       - Source concentration (mg/L or any consistent unit)
 * @param {number} R        - Retardation factor (dimensionless, ≥ 1)
 * @param {number} lambda   - First-order decay rate (1/s, ≥ 0; 0 = conservative)
 * @returns {number} Concentration at (x, y, t) in same units as C0
 */
function ogatabanks2D(
    x: number,
    y: number,
    t: number,
    v: number,
    Dx: number,
    Dy: number,
    C0: number,
    R: number,
    lambda: number,
): number {
    if (t <= 0) return 0;
    if (R < 1) throw new RangeError('Retardation factor R must be >= 1');
    const tR = t / R;
    const sqrtDx = Math.sqrt(Dx * tR);
    const sqrtDy = Math.sqrt(Dy * tR);
    // Longitudinal erfc term
    const erfcArg = sqrtDx > 0 ? (x - v * tR) / (2 * sqrtDx) : Infinity;
    const longitudinal = 0.5 * erfc(erfcArg);
    // Transverse Gaussian term
    const transverse = sqrtDy > 0 ? Math.exp(-(y * y) / (4 * Dy * tR)) : y === 0 ? 1 : 0;
    // Decay term
    const decay = Math.exp(-lambda * t);
    return C0 * longitudinal * transverse * decay;
}

/**
 * Dispersion tensor components for a 2D flow field.
 * Dij accounts for both mechanical dispersion and direction of flow.
 *
 * D_xx = alphaL*vx²/|v| + alphaT*vy²/|v|
 * D_yy = alphaL*vy²/|v| + alphaT*vx²/|v|
 * D_xy = (alphaL - alphaT)*vx*vy/|v|
 *
 * Reference: Bear (1972) "Dynamics of Fluids in Porous Media", Elsevier.
 * @param {number} alphaL - Longitudinal dispersivity (m)
 * @param {number} alphaT - Transverse dispersivity (m)
 * @param {number} v_x    - x-component of pore velocity (m/s)
 * @param {number} v_y    - y-component of pore velocity (m/s)
 * @returns {{Dxx: number, Dyy: number, Dxy: number}} Dispersion tensor components (m²/s)
 */
function dispersivityTensorComponents(
    alphaL: number,
    alphaT: number,
    v_x: number,
    v_y: number,
): { Dxx: number; Dyy: number; Dxy: number } {
    const vMag = Math.sqrt(v_x * v_x + v_y * v_y);
    if (vMag === 0) return { Dxx: 0, Dyy: 0, Dxy: 0 };
    const Dxx = (alphaL * v_x * v_x + alphaT * v_y * v_y) / vMag;
    const Dyy = (alphaL * v_y * v_y + alphaT * v_x * v_x) / vMag;
    const Dxy = ((alphaL - alphaT) * v_x * v_y) / vMag;
    return { Dxx, Dyy, Dxy };
}

/**
 * Retardation factor for a sorbing contaminant.
 * R = 1 + (rho_b / n) * Kd
 *
 * Reference: Freeze & Cherry "Groundwater" (1979), Prentice-Hall.
 * @param {number} rho_b - Bulk density (g/cm³)
 * @param {number} n     - Porosity (dimensionless, 0 < n < 1)
 * @param {number} Kd    - Linear distribution coefficient (mL/g)
 * @returns {number} Retardation factor R (dimensionless, ≥ 1)
 */
function retardationFactor(rho_b: number, n: number, Kd: number): number {
    if (n <= 0 || n >= 1) throw new RangeError('Porosity n must be in (0, 1)');
    if (Kd < 0) throw new RangeError('Distribution coefficient Kd must be >= 0');
    return 1 + (rho_b / n) * Kd;
}

/**
 * Peclet number - ratio of advective to diffusive transport.
 * Pe = v * L / Dm
 *
 * Regimes:
 *   Pe > 5      → advection-dominated
 *   Pe < 0.2    → diffusion-dominated
 *   otherwise   → mixed
 *
 * @param {number} v  - Pore velocity (m/s)
 * @param {number} L  - Characteristic length (m)
 * @param {number} Dm - Molecular diffusion coefficient (m²/s)
 * @returns {{Pe: number, regime: string}}
 */
function pecletNumber(v: number, L: number, Dm: number): { Pe: number; regime: string } {
    const Pe = (v * L) / Dm;
    let regime: string;
    if (Pe > 5) regime = 'advection-dominated';
    else if (Pe < 0.2) regime = 'diffusion-dominated';
    else regime = 'mixed';
    return { Pe, regime };
}

/**
 * Courant number - numerical stability criterion for advective transport.
 * Cr = v * dt / dx
 *
 * Stability condition: Cr ≤ 1 (CFL condition).
 * Reference: Courant, Friedrichs & Lewy (1928) Mathematische Annalen.
 * @param {number} v  - Velocity (m/s)
 * @param {number} dt - Time step (s)
 * @param {number} dx - Spatial step (m)
 * @returns {{Cr: number, stable: boolean}}
 */
function courantNumber(v: number, dt: number, dx: number): { Cr: number; stable: boolean } {
    const Cr = (v * dt) / dx;
    return { Cr, stable: Cr <= 1 };
}

/**
 * Gelhar et al. (1992) scale-dependent longitudinal dispersivity.
 * Log-linear regression fit from field data (scale 1–10,000 m):
 *   alphaL = 0.0175 * scale_m^1.46
 *
 * Reference: Gelhar, Welty & Rehfeldt (1992) Water Resources Research 28(7):1955–1974.
 * DOI: 10.1029/92WR00720
 * @param {number} scale_m - Scale of transport problem (m), typically 1–10,000
 * @returns {number} Longitudinal dispersivity alphaL (m)
 */
function gelharDispersivity(scale_m: number): number {
    return 0.0175 * Math.pow(scale_m, 1.46);
}

/**
 * Advective travel time from source to observation point.
 * t = x * R / v
 *
 * @param {number} x - Distance along flow path (m)
 * @param {number} v - Pore velocity (m/s)
 * @param {number} R - Retardation factor (dimensionless, ≥ 1)
 * @returns {number} Travel time (s)
 */
function advectiveTravel(x: number, v: number, R: number): number {
    return (x * R) / v;
}

/**
 * Mass flux through a vertical control plane (perpendicular to flow).
 * J = sum(C_i * v * n * dx)   [mg/m²/s if C in mg/L and others in SI]
 *
 * Reference: Schwarz & Zhang (2003) Ground Water 41(5):621–628.
 * @param {number[]} C_profile - Array of concentrations across plane (mg/L)
 * @param {number}   v         - Darcy velocity (m/s)
 * @param {number}   n         - Porosity (dimensionless)
 * @param {number}   dx        - Cell width / spacing (m)
 * @returns {{totalFlux: number, fluxPerCell: number[]}} Mass flux (mg/m/s total; per cell)
 */
function massFluxPlane(
    C_profile: number[],
    v: number,
    n: number,
    dx: number,
): { totalFlux: number; fluxPerCell: number[] } {
    const fluxPerCell = C_profile.map((C) => C * v * n * dx);
    const totalFlux = fluxPerCell.reduce((sum, f) => sum + f, 0);
    return { totalFlux, fluxPerCell };
}

/**
 * Simple dilution factor for mixing between contaminated and clean water streams.
 * DF = (Q_contam + Q_mixing) / Q_contam
 *
 * @param {number} Q_contam  - Contaminated flow rate (m³/s or any consistent unit)
 * @param {number} Q_mixing  - Dilution/mixing flow rate (same units)
 * @returns {number} Dilution factor (≥ 1)
 */
function dilutionFactor(Q_contam: number, Q_mixing: number): number {
    if (Q_contam <= 0) throw new RangeError('Q_contam must be > 0');
    return (Q_contam + Q_mixing) / Q_contam;
}

/**
 * Check whether a contaminant source is depleted based on concentration decline.
 * @param {number} C0                 - Initial source concentration
 * @param {number} C_current          - Current measured concentration
 * @param {number} threshold_fraction - Depletion threshold (e.g. 0.01 = 1%)
 * @returns {{depleted: boolean, fraction: number, remaining_percent: number}}
 */
function sourceDepleted(
    C0: number,
    C_current: number,
    threshold_fraction: number,
): { depleted: boolean; fraction: number; remaining_percent: number } {
    const fraction = C0 > 0 ? C_current / C0 : 0;
    const remaining_percent = fraction * 100;
    const depleted = fraction <= threshold_fraction;
    return { depleted, fraction, remaining_percent };
}

export {
    ogatabanks2D,
    dispersivityTensorComponents,
    retardationFactor,
    pecletNumber,
    courantNumber,
    gelharDispersivity,
    advectiveTravel,
    massFluxPlane,
    dilutionFactor,
    sourceDepleted,
};
