// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Hazardous Substance Leak Model
 * Modelo de vazamento de substância perigosa - Yellow Book TNO (1997) e SFPE (2008).
 *
 * References / Referências:
 *   - TNO "Methods for the Calculation of Physical Effects" (Yellow Book), 3rd ed., 1997.
 *     Chapter 2: Outflow and Spray Release.
 *   - SFPE Handbook of Fire Protection Engineering, 4th ed., 2008.
 *     Section 3, Chapter 4: Flammable Vapors.
 *   - NIOSH IDLH values: https://www.cdc.gov/niosh/idlh/
 *
 * @module hazardousSubstanceLeakModel
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Gravity acceleration (m/s²) */
const G = 9.80665;

/** Universal gas constant (J/(mol·K)) */
const R_GAS = 8.314462618;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiquidLeakParams {
    Cd: number;
    area: number;
    rho: number;
    deltaP: number;
    headHeight?: number;
}

interface GasLeakParams {
    Cd: number;
    area: number;
    P_upstream: number;
    P_atm: number;
    T_upstream: number;
    molarMass: number;
    gamma: number;
}

interface TankEmptyingParams {
    Cd: number;
    areaOrifice: number;
    areaTank: number;
    initialHead: number;
}

interface FlashFractionParams {
    T_storage: number;
    T_boil: number;
    Cp_liquid: number;
    Hv: number;
}

interface ClassifyIDLHParams {
    concentration: number;
    idlh: number;
    twaOel?: number | null;
    stelOel?: number | null;
}

// ─── Liquid Leak ─────────────────────────────────────────────────────────────

/**
 * Liquid leak rate via Bernoulli equation (incompressible, steady-state).
 * Taxa de vazamento de líquido pelo modelo de Bernoulli (Yellow Book eq. 2.11).
 *
 * Q = Cd * A * sqrt(2 * rho * (deltaP + rho * g * h))
 *
 * @param {object} params
 * @param {number} params.Cd         - Discharge coefficient (dimensionless, 0–1)
 * @param {number} params.area       - Orifice cross-sectional area (m²)
 * @param {number} params.rho        - Liquid density (kg/m³)
 * @param {number} params.deltaP     - Gauge pressure inside vessel above atm (Pa)
 * @param {number} [params.headHeight=0] - Liquid head height above orifice (m)
 * @returns {{ massFlowRate: number, volumeFlowRate: number }}
 *   massFlowRate em kg/s, volumeFlowRate em m³/s
 * @throws {RangeError} Para parâmetros fora de domínio físico
 */
export function liquidLeakRate({
    Cd,
    area,
    rho,
    deltaP,
    headHeight = 0
}: LiquidLeakParams) {
    if (Cd <= 0 || Cd > 1) throw new RangeError(`Cd must be in (0, 1], got ${Cd}`);
    if (area <= 0) throw new RangeError(`area must be > 0, got ${area}`);
    if (rho <= 0) throw new RangeError(`rho must be > 0, got ${rho}`);
    if (deltaP < 0) throw new RangeError(`deltaP must be >= 0 (gauge), got ${deltaP}`);
    if (headHeight < 0) throw new RangeError(`headHeight must be >= 0, got ${headHeight}`);

    // Pressão motriz total: pressão de vaso + carga hidrostática
    const drivingPressure = deltaP + rho * G * headHeight;
    const velocity = Cd * Math.sqrt((2 * drivingPressure) / rho);
    const volumeFlowRate = velocity * area;
    const massFlowRate = rho * volumeFlowRate;
    return { massFlowRate, volumeFlowRate };
}

// ─── Gas Leak ─────────────────────────────────────────────────────────────────

/**
 * Compressible gas leak rate (choked or subsonic flow) via Bernoulli compressível.
 * Taxa de vazamento de gás compressível - Yellow Book eq. 2.22 (choked) / 2.24 (subcrítico).
 *
 * Para fluxo chocado (P_upstream / P_atm >= ((gamma+1)/2)^(gamma/(gamma-1))):
 *   Q_m = Cd * A * P_u * sqrt(gamma * M / (R * T_u)) * (2/(gamma+1))^((gamma+1)/(2*(gamma-1)))
 *
 * @param {object} params
 * @param {number} params.Cd         - Discharge coefficient (dimensionless, 0–1)
 * @param {number} params.area       - Orifice area (m²)
 * @param {number} params.P_upstream - Absolute upstream pressure (Pa)
 * @param {number} params.P_atm      - Atmospheric pressure (Pa)
 * @param {number} params.T_upstream - Upstream gas temperature (K)
 * @param {number} params.molarMass  - Gas molar mass (kg/mol)
 * @param {number} params.gamma      - Heat capacity ratio Cp/Cv (dimensionless)
 * @returns {{ massFlowRate: number, isChoked: boolean }}
 * @throws {RangeError}
 */
export function gasLeakRate({
    Cd,
    area,
    P_upstream,
    P_atm,
    T_upstream,
    molarMass,
    gamma
}: GasLeakParams) {
    if (Cd <= 0 || Cd > 1) throw new RangeError(`Cd must be in (0, 1], got ${Cd}`);
    if (area <= 0) throw new RangeError(`area must be > 0, got ${area}`);
    if (P_upstream <= 0) throw new RangeError(`P_upstream must be > 0, got ${P_upstream}`);
    if (P_atm <= 0) throw new RangeError(`P_atm must be > 0, got ${P_atm}`);
    if (T_upstream <= 0) throw new RangeError(`T_upstream must be > 0 (K), got ${T_upstream}`);
    if (molarMass <= 0) throw new RangeError(`molarMass must be > 0, got ${molarMass}`);
    if (gamma <= 1) throw new RangeError(`gamma must be > 1, got ${gamma}`);

    // Razão de pressão crítica (Yellow Book eq. 2.21)
    const criticalRatio = Math.pow((gamma + 1) / 2, gamma / (gamma - 1));
    const isChoked = P_upstream / P_atm >= criticalRatio;

    const massFlowRate = isChoked
        ? computeChokedGasFlow({ Cd, area, P_upstream, T_upstream, molarMass, gamma })
        : computeSubsonicGasFlow({ Cd, area, P_upstream, P_atm, T_upstream, molarMass, gamma });

    return { massFlowRate, isChoked };
}

function computeChokedGasFlow(params: {
    Cd: number;
    area: number;
    P_upstream: number;
    T_upstream: number;
    molarMass: number;
    gamma: number;
}): number {
    const { Cd, area, P_upstream, T_upstream, molarMass, gamma } = params;
    const chokedFactor = Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
    return Cd * area * P_upstream * Math.sqrt((gamma * molarMass) / (R_GAS * T_upstream)) * chokedFactor;
}

function computeSubsonicGasFlow(params: {
    Cd: number;
    area: number;
    P_upstream: number;
    P_atm: number;
    T_upstream: number;
    molarMass: number;
    gamma: number;
}): number {
    const { Cd, area, P_upstream, P_atm, T_upstream, molarMass, gamma } = params;
    const pressureRatio = P_atm / P_upstream;
    const term1 = Math.pow(pressureRatio, 2 / gamma);
    const term2 = Math.pow(pressureRatio, (gamma + 1) / gamma);
    const flowFactor = Math.sqrt(((2 * gamma) / (gamma - 1)) * (term1 - term2));
    return Cd * area * P_upstream * Math.sqrt(molarMass / (R_GAS * T_upstream)) * flowFactor;
}

// ─── Tank Emptying Time ───────────────────────────────────────────────────────

/**
 * Time to empty a tank through an orifice under gravity head only (no overpressure).
 * Tempo de esvaziamento de tanque pela raiz quadrada - Yellow Book eq. 2.15.
 *
 * t_empty = (A_tank / (Cd * A_orifice)) * sqrt(2 * h0 / g)
 *
 * @param {object} params
 * @param {number} params.Cd          - Discharge coefficient (0–1)
 * @param {number} params.areaOrifice - Orifice area (m²)
 * @param {number} params.areaTank    - Tank cross-section area (m²)
 * @param {number} params.initialHead - Initial liquid head height (m)
 * @returns {{ emptyingTimeSeconds: number, emptyingTimeMinutes: number }}
 * @throws {RangeError}
 */
export function tankEmptyingTime({
    Cd,
    areaOrifice,
    areaTank,
    initialHead
}: TankEmptyingParams) {
    if (Cd <= 0 || Cd > 1) throw new RangeError(`Cd must be in (0, 1], got ${Cd}`);
    if (areaOrifice <= 0) throw new RangeError(`areaOrifice must be > 0, got ${areaOrifice}`);
    if (areaTank <= 0) throw new RangeError(`areaTank must be > 0, got ${areaTank}`);
    if (initialHead <= 0) throw new RangeError(`initialHead must be > 0, got ${initialHead}`);
    if (areaOrifice >= areaTank) throw new RangeError('areaOrifice must be < areaTank');

    const emptyingTimeSeconds = (areaTank / (Cd * areaOrifice)) * Math.sqrt((2 * initialHead) / G);
    return { emptyingTimeSeconds, emptyingTimeMinutes: emptyingTimeSeconds / 60 };
}

// ─── Flash Fraction ───────────────────────────────────────────────────────────

/**
 * Flash fraction for superheated liquid release (adiabatic flash, TNO Yellow Book §2.5.3).
 * Fração flash de líquido superaquecido liberado para a atmosfera.
 *
 * F_v = Cp_l * (T_storage - T_boil) / Hv
 *
 * where Cp_l = specific heat of liquid (J/(kg·K)), Hv = latent heat of vaporization (J/kg).
 * Resultado clamped em [0, 1].
 *
 * @param {object} params
 * @param {number} params.T_storage - Storage temperature (K)
 * @param {number} params.T_boil    - Normal boiling point at atmospheric pressure (K)
 * @param {number} params.Cp_liquid - Specific heat of liquid (J/(kg·K))
 * @param {number} params.Hv        - Latent heat of vaporization (J/kg)
 * @returns {{ flashFraction: number, isFlashing: boolean }}
 * @throws {RangeError} | @throws {TypeError}
 */
export function flashFraction({
    T_storage,
    T_boil,
    Cp_liquid,
    Hv
}: FlashFractionParams) {
    if (T_storage <= 0) throw new RangeError(`T_storage must be > 0 K, got ${T_storage}`);
    if (T_boil <= 0) throw new RangeError(`T_boil must be > 0 K, got ${T_boil}`);
    if (Cp_liquid <= 0) throw new RangeError(`Cp_liquid must be > 0, got ${Cp_liquid}`);
    if (Hv <= 0) throw new RangeError(`Hv must be > 0, got ${Hv}`);

    const isFlashing = T_storage > T_boil;
    const flashFractionRaw = isFlashing ? (Cp_liquid * (T_storage - T_boil)) / Hv : 0;
    const flashFraction = Math.min(1, Math.max(0, flashFractionRaw));
    return { flashFraction, isFlashing };
}

// ─── IDLH Classification ──────────────────────────────────────────────────────

/**
 * Classifies hazard level based on concentration vs. IDLH and occupational exposure limits.
 * Classifica nível de perigo imediato com base em IDLH (NIOSH) e limites de exposição.
 *
 * @param {object} params
 * @param {number} params.concentration   - Substance concentration (ppm or mg/m³, same units as thresholds)
 * @param {number} params.idlh            - IDLH value (Immediately Dangerous to Life or Health)
 * @param {number|null} [params.twaOel=null]   - Time-weighted average OEL / TLV-TWA
 * @param {number|null} [params.stelOel=null]  - Short-term exposure limit / TLV-STEL
 * @returns {{ hazardClass: string, ratio_idlh: number, exceedances: string[] }}
 *   hazardClass: 'safe' | 'oel_exceeded' | 'stel_exceeded' | 'idlh_exceeded' | 'extreme'
 * @throws {RangeError}
 */
export function classifyIDLH({
    concentration,
    idlh,
    twaOel = null,
    stelOel = null
}: ClassifyIDLHParams) {
    validateIDLHInputs({ concentration, idlh, twaOel, stelOel });

    const ratio_idlh = concentration / idlh;
    const exceedances = collectExceedances({ concentration, idlh, twaOel, stelOel });
    const hazardClass = determineHazardClass({ concentration, idlh, twaOel, stelOel });

    return { hazardClass, ratio_idlh, exceedances };
}

function validateIDLHInputs(params: Required<ClassifyIDLHParams>): void {
    const { concentration, idlh, twaOel, stelOel } = params;
    if (concentration < 0) throw new RangeError(`concentration must be >= 0, got ${concentration}`);
    if (idlh <= 0) throw new RangeError(`idlh must be > 0, got ${idlh}`);
    if (twaOel !== null && twaOel <= 0) throw new RangeError(`twaOel must be > 0, got ${twaOel}`);
    if (stelOel !== null && stelOel <= 0) throw new RangeError(`stelOel must be > 0, got ${stelOel}`);
}

function collectExceedances(params: Required<ClassifyIDLHParams>): string[] {
    const { concentration, idlh, twaOel, stelOel } = params;
    const exceedances: string[] = [];
    if (twaOel !== null && concentration > twaOel) exceedances.push('TWA_OEL');
    if (stelOel !== null && concentration > stelOel) exceedances.push('STEL_OEL');
    if (concentration > idlh) exceedances.push('IDLH');
    return exceedances;
}

function determineHazardClass(params: Required<ClassifyIDLHParams>): string {
    const { concentration, idlh, twaOel, stelOel } = params;
    if (concentration >= 10 * idlh) return 'extreme';
    if (concentration > idlh) return 'idlh_exceeded';
    if (stelOel !== null && concentration > stelOel) return 'stel_exceeded';
    if (twaOel !== null && concentration > twaOel) return 'oel_exceeded';
    return 'safe';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const hazardousSubstanceLeakModelMeta = {
    name: 'hazardousSubstanceLeakModel',
    description: 'hazardousSubstanceLeakModel',
    category: 'analytics',
    familyTags: ['risk'],
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
