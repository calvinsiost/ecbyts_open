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
 * River Discharge Model - Modelo de descarga fluvial
 *
 * Implementa as equações clássicas de hidráulica de canais abertos:
 * - Manning (1889): Q = (1/n) * A * R^(2/3) * S^(1/2)
 * - Chezy (1775): V = C * sqrt(R * S)
 * - Rating curve / curva-chave: Q = a * (h - h0)^b
 * - Número de Froude e classificação de regime de escoamento
 *
 * References / Referências:
 *   Manning, R. (1891). On the flow of water in open channels and pipes.
 *     Transactions of the Institution of Civil Engineers of Ireland, 20, 161-207.
 *   Chézy, A. (1775). Mémoire sur la vitesse de l'eau conduite dans une rigole.
 *     (reproduced in Herschel, C., 1897, Proceedings ASCE, 23, 1881-1887)
 *   Rantz, S.E. et al. (1982). Measurement and Computation of Streamflow.
 *     USGS Water Supply Paper 2175. https://pubs.usgs.gov/wsp/wsp2175/
 *   Chaudhry, M.H. (2008). Open-Channel Hydraulics (2nd ed.). Springer.
 *     ISBN 978-0-387-30174-7
 *
 * @module riverDischargeModel
 */

// Aceleração da gravidade (m/s²) - constante padrão
const G = 9.80665;

// ─── Hydraulic geometry helpers ──────────────────────────────────────────────

/**
 * Computes hydraulic properties of a rectangular cross-section.
 * Propriedades hidráulicas de seção transversal retangular.
 *
 * @param {number} b - Width / largura do canal (m)
 * @param {number} y - Flow depth / profundidade do escoamento (m)
 * @returns {{ area: number, wettedPerimeter: number, hydraulicRadius: number, topWidth: number }}
 */
function rectangularSection(b: any, y: any) {
    if (b <= 0) throw new RangeError(`b must be > 0, got ${b}`);
    if (y <= 0) throw new RangeError(`y must be > 0, got ${y}`);
    const area = b * y;
    const wettedPerimeter = b + 2 * y;
    return {
        area,
        wettedPerimeter,
        hydraulicRadius: area / wettedPerimeter,
        topWidth: b,
    };
}

/**
 * Computes hydraulic properties of a trapezoidal cross-section.
 * Propriedades hidráulicas de seção transversal trapezoidal.
 *
 * @param {number} b - Bottom width / largura do fundo (m)
 * @param {number} y - Flow depth / profundidade do escoamento (m)
 * @param {number} z - Side slope / inclinação lateral (H:V) - metros horizontais por metro vertical
 * @returns {{ area: number, wettedPerimeter: number, hydraulicRadius: number, topWidth: number }}
 */
function trapezoidalSection(b: any, y: any, z: any) {
    if (b < 0) throw new RangeError(`b must be >= 0, got ${b}`);
    if (y <= 0) throw new RangeError(`y must be > 0, got ${y}`);
    if (z < 0) throw new RangeError(`z must be >= 0, got ${z}`);
    const area = (b + z * y) * y;
    const wettedPerimeter = b + 2 * y * Math.sqrt(1 + z * z);
    return {
        area,
        wettedPerimeter,
        hydraulicRadius: area / wettedPerimeter,
        topWidth: b + 2 * z * y,
    };
}

/**
 * Computes hydraulic properties of a circular pipe/culvert flowing partially full.
 * Propriedades hidráulicas de seção circular parcialmente cheia.
 *
 * @param {number} D - Pipe diameter / diâmetro do tubo (m)
 * @param {number} y - Flow depth / profundidade do escoamento (m), 0 < y <= D
 * @returns {{ area: number, wettedPerimeter: number, hydraulicRadius: number, topWidth: number }}
 */
function circularSection(D: any, y: any) {
    if (D <= 0) throw new RangeError(`D must be > 0, got ${D}`);
    if (y <= 0 || y > D) throw new RangeError(`y must be in (0, D], got y=${y}, D=${D}`);
    const r = D / 2;
    // Ângulo central 2θ correspondente à lâmina d'água
    const theta = Math.acos((r - y) / r); // 0 < theta <= π
    const area = r * r * (theta - Math.sin(theta) * Math.cos(theta));
    const wettedPerimeter = 2 * r * theta;
    const topWidth = 2 * r * Math.sin(theta);
    return {
        area,
        wettedPerimeter,
        hydraulicRadius: area / wettedPerimeter,
        topWidth,
    };
}

// ─── Manning's equation ───────────────────────────────────────────────────────

/**
 * Calculates discharge using Manning's equation (SI units).
 * Calcula a descarga pela equação de Manning (unidades SI).
 *
 * Q = (1/n) * A * R^(2/3) * S^(1/2)
 *
 * @param {number} manningN - Manning roughness coefficient / coeficiente de rugosidade de Manning (s/m^(1/3))
 * @param {number} area     - Cross-sectional area / área da seção transversal (m²)
 * @param {number} hydraulicRadius - Hydraulic radius / raio hidráulico R = A/P (m)
 * @param {number} slope    - Channel bed slope / declividade do fundo do canal (m/m), dimensionless
 * @returns {number} Discharge / descarga Q (m³/s)
 */
function manningDischarge(manningN: any, area: any, hydraulicRadius: any, slope: any) {
    if (manningN <= 0) throw new RangeError(`manningN must be > 0, got ${manningN}`);
    if (area <= 0) throw new RangeError(`area must be > 0, got ${area}`);
    if (hydraulicRadius <= 0) throw new RangeError(`hydraulicRadius must be > 0, got ${hydraulicRadius}`);
    if (slope <= 0) throw new RangeError(`slope must be > 0, got ${slope}`);
    return (1 / manningN) * area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope);
}

/**
 * Calculates mean velocity from Manning's equation.
 * Calcula a velocidade média pela equação de Manning.
 *
 * V = (1/n) * R^(2/3) * S^(1/2)
 *
 * @param {number} manningN - Manning roughness coefficient (s/m^(1/3))
 * @param {number} hydraulicRadius - Hydraulic radius R (m)
 * @param {number} slope - Channel slope S (m/m)
 * @returns {number} Mean velocity / velocidade média V (m/s)
 */
function manningVelocity(manningN: any, hydraulicRadius: any, slope: any) {
    if (manningN <= 0) throw new RangeError(`manningN must be > 0, got ${manningN}`);
    if (hydraulicRadius <= 0) throw new RangeError(`hydraulicRadius must be > 0, got ${hydraulicRadius}`);
    if (slope <= 0) throw new RangeError(`slope must be > 0, got ${slope}`);
    return (1 / manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope);
}

// ─── Chezy equation ───────────────────────────────────────────────────────────

/**
 * Calculates mean velocity using Chezy's equation.
 * Calcula a velocidade média pela equação de Chezy.
 *
 * V = C * sqrt(R * S)
 *
 * @param {number} chezyC - Chezy coefficient / coeficiente de Chezy (m^(1/2)/s)
 * @param {number} hydraulicRadius - Hydraulic radius R (m)
 * @param {number} slope - Channel slope S (m/m)
 * @returns {number} Mean velocity V (m/s)
 */
function chezyVelocity(chezyC: any, hydraulicRadius: any, slope: any) {
    if (chezyC <= 0) throw new RangeError(`chezyC must be > 0, got ${chezyC}`);
    if (hydraulicRadius <= 0) throw new RangeError(`hydraulicRadius must be > 0, got ${hydraulicRadius}`);
    if (slope <= 0) throw new RangeError(`slope must be > 0, got ${slope}`);
    return chezyC * Math.sqrt(hydraulicRadius * slope);
}

/**
 * Converts Manning n to Chezy C using the relationship C = R^(1/6) / n.
 * Converte coeficiente de Manning n para Chezy C: C = R^(1/6) / n.
 *
 * @param {number} manningN - Manning roughness coefficient (s/m^(1/3))
 * @param {number} hydraulicRadius - Hydraulic radius R (m)
 * @returns {number} Chezy coefficient C (m^(1/2)/s)
 */
function manningToChezy(manningN: any, hydraulicRadius: any) {
    if (manningN <= 0) throw new RangeError(`manningN must be > 0, got ${manningN}`);
    if (hydraulicRadius <= 0) throw new RangeError(`hydraulicRadius must be > 0, got ${hydraulicRadius}`);
    return Math.pow(hydraulicRadius, 1 / 6) / manningN;
}

// ─── Rating curve (curva-chave) ───────────────────────────────────────────────

/**
 * Fits a power-law rating curve Q = a * (h - h0)^b from observed data.
 * Ajusta curva-chave potencial Q = a * (h - h0)^b a partir de dados observados.
 *
 * Uses log-linear regression on log(Q) = log(a) + b * log(h - h0).
 * Usa regressão log-linear sobre log(Q) = log(a) + b * log(h - h0).
 *
 * Reference: Rantz et al. (1982), USGS WSP 2175, Chapter 12.
 *
 * @param {{ h: number, Q: number }[]} observations - Stage-discharge pairs / pares cota-descarga
 * @param {number} observations - Zero-flow stage / cota de vazão nula (m), must be < min(h)
 * @returns {{ a: number, b: number, r2: number }} Fitted parameters and R² goodness-of-fit
 */
function fitRatingCurve(observations: any, h0: any) {
    if (!Array.isArray(observations) || observations.length < 2) {
        throw new TypeError('observations must be an array with at least 2 elements');
    }
    const pairs = observations.filter((o) => o.h > h0 && o.Q > 0);
    if (pairs.length < 2) {
        throw new RangeError('At least 2 observations must have h > h0 and Q > 0');
    }

    // Regressão linear em espaço log-log: log(Q) = log(a) + b * log(h - h0)
    const n = pairs.length;
    const X = pairs.map((o) => Math.log(o.h - h0));
    const Y = pairs.map((o) => Math.log(o.Q));
    const meanX = X.reduce((s, x) => s + x, 0) / n;
    const meanY = Y.reduce((s, y) => s + y, 0) / n;
    let SXX = 0,
        SXY = 0,
        SSres = 0,
        SStot = 0;
    for (let i = 0; i < n; i++) {
SXX += (X[i]! - meanX) ** 2;
        SXY += (X[i]! - meanX) * (Y[i]! - meanY!);
    }
    const b = SXY / SXX;
    const logA = meanY - b * meanX;
    const a = Math.exp(logA);
    // R² em espaço log
    for (let i = 0; i < n; i++) {
const Yhat = logA + b * (X[i] as number);
        SSres += (Y[i] as number - Yhat) ** 2;
        SStot += (Y[i] as number - meanY) ** 2;
    }
    const r2 = SStot > 0 ? 1 - SSres / SStot : 1;
    return { a, b, r2 };
}

/**
 * Evaluates the rating curve Q = a * (h - h0)^b at a given stage.
 * Avalia a curva-chave Q = a * (h - h0)^b para uma cota dada.
 *
 * @param {number} a  - Scale coefficient / coeficiente de escala
 * @param {number} b  - Exponent / expoente (tipicamente 1.5–2.5 para rios naturais)
 * @param {number} h0 - Zero-flow stage / cota de vazão nula (m)
 * @param {number} h  - Current stage / cota atual (m), must be > h0
 * @returns {number} Discharge Q (m³/s)
 */
function ratingCurveDischarge(a: any, b: any, h0: any, h: any) {
    if (a <= 0) throw new RangeError(`a must be > 0, got ${a}`);
    if (h <= h0) throw new RangeError(`h must be > h0 (${h0}), got ${h}`);
    return a * Math.pow(h - h0, b);
}

// ─── Froude number and flow regime ───────────────────────────────────────────

/**
 * Calculates the Froude number for open-channel flow.
 * Calcula o número de Froude para escoamento em canal aberto.
 *
 * Fr = V / sqrt(g * D_h)  where D_h = A / T (hydraulic depth)
 *
 * @param {number} velocity   - Mean velocity / velocidade média V (m/s)
 * @param {number} area       - Cross-sectional area A (m²)
 * @param {number} topWidth   - Water-surface width / largura superficial T (m)
 * @returns {number} Froude number (dimensionless)
 */
function froudeNumber(velocity: any, area: any, topWidth: any) {
    if (velocity < 0) throw new RangeError(`velocity must be >= 0, got ${velocity}`);
    if (area <= 0) throw new RangeError(`area must be > 0, got ${area}`);
    if (topWidth <= 0) throw new RangeError(`topWidth must be > 0, got ${topWidth}`);
    const hydraulicDepth = area / topWidth; // profundidade hidráulica D_h
    return velocity / Math.sqrt(G * hydraulicDepth);
}

/**
 * Classifies flow regime based on Froude number.
 * Classifica o regime de escoamento pelo número de Froude.
 *
 * @param {number} Fr - Froude number / número de Froude
 * @returns {'subcritical' | 'critical' | 'supercritical'} Flow regime / regime de escoamento
 */
function flowRegime(Fr: any) {
    if (typeof Fr !== 'number' || !isFinite(Fr)) throw new TypeError(`Fr must be a finite number, got ${Fr}`);
    if (Fr < 0) throw new RangeError(`Fr must be >= 0, got ${Fr}`);
    if (Math.abs(Fr - 1) < 0.01) return 'critical'; // Fr ≈ 1 → crítico
    if (Fr < 1) return 'subcritical'; // Fr < 1 → subcrítico (remanso)
    return 'supercritical'; // Fr > 1 → supercrítico (torrente)
}

/**
 * Full discharge computation for a rectangular channel using Manning's equation.
 * Cálculo completo de descarga em canal retangular pela equação de Manning.
 *
 * @param {{ b: number, y: number, manningN: number, slope: number }} params
 * @returns {{ Q: number, V: number, Fr: number, regime: string, hydraulicRadius: number, area: number }}
 */
function rectangularChannelDischarge({
    b,
    y,
    manningN,
    slope
}: any) {
    const sec = rectangularSection(b, y);
    const V = manningVelocity(manningN, sec.hydraulicRadius, slope);
    const Q = V * sec.area;
    const Fr = froudeNumber(V, sec.area, sec.topWidth);
    return {
        Q,
        V,
        Fr,
        regime: flowRegime(Fr),
        hydraulicRadius: sec.hydraulicRadius,
        area: sec.area,
    };
}

export {
    rectangularSection,
    trapezoidalSection,
    circularSection,
    manningDischarge,
    manningVelocity,
    chezyVelocity,
    manningToChezy,
    fitRatingCurve,
    ratingCurveDischarge,
    froudeNumber,
    flowRegime,
    rectangularChannelDischarge,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverDischargeModelMeta = {
    name: 'riverDischargeModel',
    description: 'riverDischargeModel',
    category: 'analytics',
    familyTags: ['river'],
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
