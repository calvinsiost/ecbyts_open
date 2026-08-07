// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Sediment Transport (Bagnold / van Rijn)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Sediment Transport - Bagnold & van Rijn Equations
 *
 * Módulo puro implementando as equações clássicas de transporte de sedimentos
 * por arraste (bedload) e em suspensão, baseado nos trabalhos de Bagnold (1966)
 * e van Rijn (1984). Aplicações em estudos de erosão fluvial, hidráulica
 * sedimentológica e avaliação de impactos em corpos d'água.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Bagnold, R. A. (1966). "An approach to the sediment transport problem
 *     from general physics." US Geological Survey Professional Paper 422-I.
 *     Washington, DC: USGS. (bedload transport stream power)
 *   - van Rijn, L. C. (1984). "Sediment transport, part I: Bed load transport."
 *     Journal of Hydraulic Engineering, 110(10), 1431–1456.
 *     DOI: 10.1061/(ASCE)0733-9429(1984)110:10(1431)
 *   - van Rijn, L. C. (1984). "Sediment transport, part II: Suspended load
 *     transport." Journal of Hydraulic Engineering, 110(11), 1613–1641.
 *     DOI: 10.1061/(ASCE)0733-9429(1984)110:11(1613)
 *
 * @module sedimentTransportBagnold
 */

'use strict';

interface BedloadResult { qb_kg_m_s: number; omega_W_m2: number; omega_cr_W_m2: number; }
interface SuspendedLoadResult { Ca_vol: number; Ca_kg_m3: number; T_excess: number; Dstar: number; }
interface TotalLoadResult { qt_kg_m_s: number; qb_kg_m_s: number; qs_kg_m_s: number; }
interface RegimeResult { regime: string; suspended_fraction: number; }

/** Aceleração gravitacional (m/s²) */
const G = 9.81;

/** Densidade da água limpa a 20 °C (kg/m³) */
const RHO_WATER = 1000;

/** Densidade do quartzo / sedimento típico (kg/m³) */
const RHO_SEDIMENT = 2650;

/**
 * Calcula a taxa de transporte por arraste (bedload) via equação de Bagnold.
 *
 * A equação relaciona a potência de fluxo com o transporte por arraste através
 * do coeficiente empírico eb (eficiência de arraste). A fórmula base é:
 *   q_b = (eb / (tan(phi))) * (omega - omega_cr) / (rho_s * G)
 * onde omega = rho * g * depth * velocity é a potência de fluxo por unidade
 * de leito (W/m²) e omega_cr é a potência crítica de início de movimento.
 *
 * @param {number} depth        - Profundidade do fluxo (m), > 0
 * @param {number} velocity     - Velocidade média do fluxo (m/s), >= 0
 * @param {number} slope        - Declividade do canal (m/m), >= 0
 * @param {number} d50          - Diâmetro mediano do grão (m), > 0
 * @param {number} [eb=0.13]    - Eficiência de arraste de Bagnold (adim.), 0–1
 * @param {number} [tanPhi=0.6] - Tangente do ângulo de atrito interno do leito
 * @returns {{ qb_kg_m_s: number, omega_W_m2: number, omega_cr_W_m2: number }}
 *   Taxa de bedload (kg/m/s), potência de fluxo e potência crítica (W/m²)
 */
export function calcBedloadTransport(depth: number, velocity: number, slope: number, d50: number, eb: number = 0.13, tanPhi: number = 0.6): BedloadResult {
    if (typeof depth !== 'number' || depth <= 0) throw new RangeError('depth must be a positive number (m)');
    if (typeof velocity !== 'number' || velocity < 0) throw new RangeError('velocity must be >= 0 (m/s)');
    if (typeof slope !== 'number' || slope < 0) throw new RangeError('slope must be >= 0 (m/m)');
    if (typeof d50 !== 'number' || d50 <= 0) throw new RangeError('d50 must be a positive number (m)');
    if (eb <= 0 || eb > 1) throw new RangeError('eb (Bagnold efficiency) must be in (0, 1]');
    if (tanPhi <= 0) throw new RangeError('tanPhi must be > 0');

    // Potência de fluxo por unidade de área de leito (W/m²)
    const omega = RHO_WATER * G * depth * slope * velocity;

    // Parâmetro adimensional D* (van Rijn 1984 eq. 3.3)
    const Delta = (RHO_SEDIMENT - RHO_WATER) / RHO_WATER; // densidade relativa submersa
    const nu = 1e-6; // viscosidade cinemática da água a 20 °C (m²/s)
    const Dstar = d50 * Math.pow((Delta * G) / (nu * nu), 1 / 3);

    // Velocidade de atrito crítica de Shields (simplificada, Shields 1936)
    const shields_cr =
        Dstar < 4
            ? 0.24 / Dstar
            : Dstar < 10
              ? 0.14 * Math.pow(Dstar, -0.64)
              : Dstar < 20
                ? 0.04 * Math.pow(Dstar, -0.1)
                : Dstar < 150
                  ? 0.013 * Math.pow(Dstar, 0.29)
                  : 0.055;

    // Potência crítica correspondente ao início de movimento (W/m²)
    const ufstar_cr = Math.sqrt(shields_cr * Delta * G * d50);
    const omega_cr =
        RHO_WATER * G * depth * slope !== 0 ? (RHO_WATER * ufstar_cr * ufstar_cr * ufstar_cr) / (G * depth * slope) : 0;

    const excess = Math.max(0, omega - omega_cr);

    // Equação de Bagnold (1966): qb (kg/m/s)
    const qb = ((eb / tanPhi) * excess) / (RHO_SEDIMENT * G);

    return { qb_kg_m_s: qb, omega_W_m2: omega, omega_cr_W_m2: omega_cr };
}

/**
 * Calcula a concentração de carga em suspensão via formulação van Rijn (1984).
 *
 * A concentração de referência Ca é calculada na altura de referência a = 0.5 * d50
 * acima do leito. O perfil de Rouse integrado fornece a carga total em suspensão.
 * Aqui retorna-se Ca como concentração volumétrica (m³/m³) e em kg/m³.
 *
 * @param {number} depth    - Profundidade do fluxo (m), > 0
 * @param {number} velocity - Velocidade média do fluxo (m/s), > 0
 * @param {number} slope    - Declividade do canal (m/m), > 0
 * @param {number} d50      - Diâmetro mediano do grão (m), > 0
 * @param {number} d90      - D90 do grão (m), > d50
 * @returns {{ Ca_vol: number, Ca_kg_m3: number, T_excess: number, Dstar: number }}
 *   Concentração de referência volumétrica, em kg/m³, parâmetro T de excesso e D*
 */
export function calcSuspendedLoadConcentration(depth: number, velocity: number, slope: number, d50: number, d90: number): SuspendedLoadResult {
    if (typeof depth !== 'number' || depth <= 0) throw new RangeError('depth must be a positive number (m)');
    if (typeof velocity !== 'number' || velocity <= 0) throw new RangeError('velocity must be > 0 (m/s)');
    if (typeof slope !== 'number' || slope <= 0) throw new RangeError('slope must be > 0 (m/m)');
    if (typeof d50 !== 'number' || d50 <= 0) throw new RangeError('d50 must be a positive number (m)');
    if (typeof d90 !== 'number' || d90 <= d50) throw new RangeError('d90 must be > d50 (m)');

    const Delta = (RHO_SEDIMENT - RHO_WATER) / RHO_WATER;
    const nu = 1e-6;

    // D* (adimensional) - van Rijn (1984) eq. 3.3
    const Dstar = d50 * Math.pow((Delta * G) / (nu * nu), 1 / 3);

    // Velocidade de atrito do leito (Chezy com ks = 3 * d90)
    const ks = 3 * d90;
    const C90 = 18 * Math.log10((12 * depth) / ks); // coef. Chezy (m^0.5/s)
    const uf = (velocity * Math.sqrt(G)) / C90; // velocidade de atrito (m/s)

    // Velocidade de atrito crítica
    const shields_cr =
        Dstar < 4
            ? 0.24 / Dstar
            : Dstar < 10
              ? 0.14 * Math.pow(Dstar, -0.64)
              : Dstar < 20
                ? 0.04 * Math.pow(Dstar, -0.1)
                : Dstar < 150
                  ? 0.013 * Math.pow(Dstar, 0.29)
                  : 0.055;
    const uf_cr = Math.sqrt(shields_cr * Delta * G * d50);

    // Parâmetro T de excesso de tensão de cisalhamento (adim.)
    const T = (uf * uf - uf_cr * uf_cr) / (uf_cr * uf_cr);
    const T_pos = Math.max(0, T);

    // Concentração de referência Ca (van Rijn 1984 eq. 6.2)
    const a_ref = Math.max(0.01 * depth, 0.5 * d50); // altura de referência (m)
    const Ca_vol = (0.015 * d50 * Math.pow(T_pos, 1.5)) / (a_ref * Math.pow(Dstar, 0.3));

    return {
        Ca_vol: Math.min(Ca_vol, 0.65), // limite físico de empacotamento
        Ca_kg_m3: Math.min(Ca_vol, 0.65) * RHO_SEDIMENT,
        T_excess: T_pos,
        Dstar,
    };
}

/**
 * Calcula a carga total de sedimento (bedload + suspended load) em kg/m/s.
 *
 * Combina os resultados de calcBedloadTransport e calcSuspendedLoadConcentration
 * para estimar a descarga sólida total por unidade de largura.
 *
 * @param {number} depth    - Profundidade do fluxo (m), > 0
 * @param {number} velocity - Velocidade média do fluxo (m/s), > 0
 * @param {number} slope    - Declividade do canal (m/m), > 0
 * @param {number} d50      - Diâmetro mediano do grão (m), > 0
 * @param {number} d90      - D90 do grão (m), > d50
 * @returns {{ qt_kg_m_s: number, qb_kg_m_s: number, qs_kg_m_s: number }}
 *   Carga total, bedload e suspended load em kg/m/s
 */
export function calcTotalSedimentLoad(depth: number, velocity: number, slope: number, d50: number, d90: number): TotalLoadResult {
    // bedload via Bagnold
    const { qb_kg_m_s } = calcBedloadTransport(depth, velocity, slope, d50);

    // suspended load: Ca * depth * velocity (simplificado, perfil uniforme)
    const { Ca_kg_m3 } = calcSuspendedLoadConcentration(depth, velocity, slope, d50, d90);
    const qs_kg_m_s = Ca_kg_m3 * depth * velocity;

    return { qt_kg_m_s: qb_kg_m_s + qs_kg_m_s, qb_kg_m_s, qs_kg_m_s };
}

/**
 * Classifica o regime de transporte de sedimentos com base na razão qb/qt.
 *
 * Classificação qualitativa baseada em convenção da literatura hidrossedimentológica:
 *   - 'bedload'   : qs/qt < 0.20 - arraste dominante
 *   - 'mixed'     : 0.20 <= qs/qt < 0.80 - transporte misto
 *   - 'suspended' : qs/qt >= 0.80 - suspensão dominante
 *
 * @param {number} qb_kg_m_s - Carga por arraste (kg/m/s), >= 0
 * @param {number} qs_kg_m_s - Carga em suspensão (kg/m/s), >= 0
 * @returns {{ regime: string, suspended_fraction: number }}
 *   Regime textual e fração em suspensão (0–1)
 */
export function classifyTransportRegime(qb_kg_m_s: number, qs_kg_m_s: number): RegimeResult {
    if (typeof qb_kg_m_s !== 'number' || qb_kg_m_s < 0) throw new RangeError('qb_kg_m_s must be >= 0');
    if (typeof qs_kg_m_s !== 'number' || qs_kg_m_s < 0) throw new RangeError('qs_kg_m_s must be >= 0');

    const qt = qb_kg_m_s + qs_kg_m_s;

    if (qt === 0) return { regime: 'no_transport', suspended_fraction: 0 };

    const sf = qs_kg_m_s / qt;

    const regime = sf < 0.2 ? 'bedload' : sf < 0.8 ? 'mixed' : 'suspended';

    return { regime, suspended_fraction: sf };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const sedimentTransportBagnoldMeta = {
    name: 'sedimentTransportBagnold',
    description: 'Sediment Transport (Bagnold / van Rijn)',
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
