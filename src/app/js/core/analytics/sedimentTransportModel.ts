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
 * Sediment Transport Model
 *
 * Implements bedload and suspended load transport equations:
 * - Meyer-Peter & Müller (1948): bedload transport by Shields criterion
 *   Reference: Meyer-Peter, E. & Müller, R. (1948). Formulas for bed-load transport.
 *   Proc. 2nd IAHR Congress, Stockholm. Paper 2.
 * - van Rijn (1984): suspended load transport
 *   Reference: van Rijn, L.C. (1984). Sediment transport, Part II: Suspended load transport.
 *   Journal of Hydraulic Engineering, 110(11), 1613–1641. DOI:10.1061/(ASCE)0733-9429(1984)110:11(1613)
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module sedimentTransportModel
 */

interface BedloadResult { qbStar: number; qb: number; }
interface SuspendedLoadResult { qs: number; suspensionIndex: number; }
interface RegimeResult { regime: string; description: string; }
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
    inputSchema: { type: string; properties: Record<string, any>; required: string[] };
    outputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

// Constante gravitacional (m/s²) - aceleração da gravidade padrão
const G = 9.81;

// Densidade da água (kg/m³) - valor padrão para água doce a 20°C
const RHO_WATER_DEFAULT = 1000;

// Densidade do sedimento (kg/m³) - quartzo padrão
const RHO_SEDIMENT_DEFAULT = 2650;

// Viscosidade cinemática da água a 20°C (m²/s)
const NU_DEFAULT = 1.004e-6;

/**
 * Computes the dimensionless Shields parameter (bed shear stress ratio).
 * Critério de Shields: parâmetro adimensional de tensão de cisalhamento no leito.
 *
 * @param {number} tauB   - Bed shear stress [Pa]
 * @param {number} d50    - Median sediment grain diameter [m]
 * @param {number} [rhoS=2650] - Sediment density [kg/m³]
 * @param {number} [rhoW=1000] - Water density [kg/m³]
 * @returns {number} Dimensionless Shields parameter θ [-]
 */
export function shieldsParameter(tauB: number, d50: number, rhoS: number = RHO_SEDIMENT_DEFAULT, rhoW: number = RHO_WATER_DEFAULT): number {
    if (typeof tauB !== 'number' || typeof d50 !== 'number') throw new TypeError('tauB and d50 must be numbers');
    if (tauB < 0) throw new RangeError('Bed shear stress tauB must be >= 0');
    if (d50 <= 0) throw new RangeError('Grain diameter d50 must be > 0');
    if (rhoS <= rhoW) throw new RangeError('Sediment density must be greater than water density');
    // θ = τ_b / [(ρ_s - ρ_w) * g * d50]
    return tauB / ((rhoS - rhoW) * G * d50);
}

/**
 * Estimates the critical Shields parameter for incipient motion.
 * Parâmetro de Shields crítico para início do movimento - baseado em curva empírica.
 * Simplified fit: θ_cr ≈ 0.047 for d* > 150, transitions to 0.24/d* for fine grains.
 *
 * @param {number} d50  - Median grain diameter [m]
 * @param {number} [nu=1.004e-6]  - Kinematic viscosity [m²/s]
 * @param {number} [rhoS=2650]    - Sediment density [kg/m³]
 * @param {number} [rhoW=1000]    - Water density [kg/m³]
 * @returns {number} Critical Shields parameter θ_cr [-]
 */
export function criticalShieldsParameter(d50: number, nu: number = NU_DEFAULT, rhoS: number = RHO_SEDIMENT_DEFAULT, rhoW: number = RHO_WATER_DEFAULT): number {
    if (typeof d50 !== 'number') throw new TypeError('d50 must be a number');
    if (d50 <= 0) throw new RangeError('d50 must be > 0');
    if (nu <= 0) throw new RangeError('Kinematic viscosity nu must be > 0');
    if (rhoS <= rhoW) throw new RangeError('Sediment density must be greater than water density');

    // Parâmetro de grão adimensional de van Rijn (1984)
    const dStar = d50 * Math.pow((((rhoS - rhoW) / rhoW) * G) / (nu * nu), 1 / 3);

    // Curva de Shields simplificada (Soulsby & Whitehouse 1997)
    const thetaCr = 0.3 / (1 + 1.2 * dStar) + 0.055 * (1 - Math.exp(-0.02 * dStar));
    return thetaCr;
}

/**
 * Computes bedload transport rate using Meyer-Peter & Müller (1948).
 * Taxa de transporte de carga de fundo pelo método de Meyer-Peter & Müller.
 *
 * q_b* = 8 * (θ - θ_cr)^1.5   [dimensionless bedload parameter]
 * q_b  = q_b* * sqrt((s-1)*g*d50^3)  [m²/s per unit width]
 *
 * @param {number} theta    - Shields parameter [-]
 * @param {number} thetaCr  - Critical Shields parameter [-]
 * @param {number} d50      - Median grain diameter [m]
 * @param {number} [rhoS=2650] - Sediment density [kg/m³]
 * @param {number} [rhoW=1000] - Water density [kg/m³]
 * @returns {{ qbStar: number, qb: number }} Dimensionless and dimensional bedload rates
 */
export function bedloadTransportMPM(theta: number, thetaCr: number, d50: number, rhoS: number = RHO_SEDIMENT_DEFAULT, rhoW: number = RHO_WATER_DEFAULT): BedloadResult {
    if (typeof theta !== 'number' || typeof thetaCr !== 'number' || typeof d50 !== 'number') {
        throw new TypeError('theta, thetaCr, and d50 must be numbers');
    }
    if (theta < 0 || thetaCr < 0) throw new RangeError('Shields parameters must be >= 0');
    if (d50 <= 0) throw new RangeError('d50 must be > 0');
    if (rhoS <= rhoW) throw new RangeError('Sediment density must be greater than water density');

    const excess = Math.max(0, theta - thetaCr);
    // Parâmetro adimensional de carga de fundo
    const qbStar = 8 * Math.pow(excess, 1.5);
    const s = rhoS / rhoW; // razão de densidade relativa
    // Descarga volumétrica de sedimento por unidade de largura [m²/s]
    const qb = qbStar * Math.sqrt((s - 1) * G * Math.pow(d50, 3));
    return { qbStar, qb };
}

/**
 * Computes suspended load transport using van Rijn (1984) simplified approach.
 * Carga em suspensão pelo método de van Rijn - formulação simplificada para engenharia.
 *
 * Uses transport parameter T = (τ_b - τ_cr) / τ_cr and d* to estimate suspension index.
 *
 * @param {number} uStar    - Bed shear velocity [m/s]  (u* = sqrt(τ_b / ρ_w))
 * @param {number} wS       - Particle fall velocity [m/s]
 * @param {number} depth    - Flow depth [m]
 * @param {number} T        - Transport stage parameter T = (τ_b' - τ_cr) / τ_cr [-]
 * @param {number} d50      - Median grain diameter [m]
 * @param {number} [rhoS=2650] - Sediment density [kg/m³]
 * @param {number} [rhoW=1000] - Water density [kg/m³]
 * @returns {{ qs: number, suspensionIndex: number }} Suspended load [m²/s] and Z parameter
 */
export function suspendedLoadVanRijn(uStar: number, wS: number, depth: number, T: number, d50: number, rhoS: number = RHO_SEDIMENT_DEFAULT, rhoW: number = RHO_WATER_DEFAULT): SuspendedLoadResult {
    if ([uStar, wS, depth, T, d50].some((v) => typeof v !== 'number')) {
        throw new TypeError('All numeric arguments must be numbers');
    }
    if (uStar <= 0) throw new RangeError('Shear velocity uStar must be > 0');
    if (wS <= 0) throw new RangeError('Fall velocity wS must be > 0');
    if (depth <= 0) throw new RangeError('Flow depth must be > 0');
    if (T < 0) throw new RangeError('Transport stage T must be >= 0');
    if (d50 <= 0) throw new RangeError('d50 must be > 0');
    if (rhoS <= rhoW) throw new RangeError('Sediment density must be greater than water density');

    // Índice de suspensão Z (razão da velocidade de queda pela velocidade de atrito)
    const kappa = 0.41; // constante de von Kármán
    const suspensionIndex = wS / (kappa * uStar);

    const s = rhoS / rhoW;
    const dStar = d50 * Math.pow(((s - 1) * G) / (NU_DEFAULT * NU_DEFAULT), 1 / 3);

    // Concentração de referência no leito (m3/m3) - van Rijn (1984) Eq. 3.3
    const ca = (0.015 * (d50 / 0.01) * Math.pow(T, 1.5)) / Math.pow(dStar, 0.3);

    // Transporte em suspensão integrado simplificado [m²/s]
    // qs ≈ ca * u_mean * h * F(Z)
    const FZ = suspensionIndex < 1.2 ? Math.pow((1.2 - suspensionIndex) / (1.2 + suspensionIndex), 2.4) : 0;
    const uMeanApprox = uStar / 0.06; // estimativa simplificada de velocidade média
    const qs = ca * uMeanApprox * depth * Math.max(0, FZ);

    return { qs, suspensionIndex };
}

/**
 * Classifies the sediment transport regime based on Shields parameter comparison.
 * Classifica o regime de transporte de sedimentos com base no parâmetro de Shields.
 *
 * @param {number} theta    - Computed Shields parameter [-]
 * @param {number} thetaCr  - Critical Shields parameter [-]
 * @param {number|null} [wS]     - Fall velocity [m/s] (optional, used to detect suspension)
 * @param {number|null} [uStar]  - Shear velocity [m/s] (optional)
 * @returns {{ regime: string, description: string }} Transport regime classification
 */
export function classifyTransportRegime(theta: number, thetaCr: number, wS: number | null = null, uStar: number | null = null): RegimeResult {
    if (typeof theta !== 'number' || typeof thetaCr !== 'number') {
        throw new TypeError('theta and thetaCr must be numbers');
    }
    if (theta < 0 || thetaCr < 0) throw new RangeError('Shields parameters must be >= 0');

    if (theta < 0.8 * thetaCr) {
        return { regime: 'no_motion', description: 'No sediment transport — below motion threshold' };
    }
    if (theta < thetaCr) {
        return { regime: 'incipient', description: 'Incipient motion — near critical conditions' };
    }

    // Se velocidade de queda e de atrito fornecidas, verificar suspensão
    if (wS !== null && uStar !== null && uStar > 0 && wS > 0) {
        const Z = wS / (0.41 * uStar);
        if (Z < 0.8) {
            return { regime: 'total_load', description: 'Total load transport (bedload + suspension dominant)' };
        }
        if (Z < 2.5) {
            return { regime: 'suspended', description: 'Suspended load significant alongside bedload' };
        }
    }

    return { regime: 'bedload', description: 'Bedload transport dominant (rolling, sliding, saltation)' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const sedimentTransportModelMeta: AnalyticsModuleMeta = {
    name: 'sedimentTransportModel',
    description: 'sedimentTransportModel',
    category: 'analytics',
    familyTags: ['sediment', 'transport', 'fate_transport'],
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
