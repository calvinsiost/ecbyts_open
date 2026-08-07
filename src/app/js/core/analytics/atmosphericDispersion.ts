// @ts-check
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
// Application: EHS & Mining - Atmospheric Dispersion
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Atmospheric Dispersion - Pasquill-Gifford + Gaussian Plume
 *
 * Módulo puro para dispersão atmosférica avançada.
 * Implementa: classificação de estabilidade Pasquill (1961),
 * parâmetros de dispersão σy/σz de Briggs (1973) e equação
 * gaussiana com reflexão no solo.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - Pasquill, F. (1961). The estimation of the dispersion of windborne material.
 *     The Meteorological Magazine, 90(1063), 33-49.
 *   - Briggs, G.A. (1973). Diffusion estimation for small emissions.
 *     ATDL Contribution File No. 79, Atmospheric Turbulence and
 *     Diffusion Laboratory, Oak Ridge, TN.
 *   - Turner, D.B. (1994). Workbook on Atmospheric Dispersion Estimates:
 *     An Introduction to Dispersion Modeling (2nd ed.). Lewis Publishers.
 *     ISBN: 978-1566700238
 */

// Constante π (dois π para normalização gaussiana)
const TWO_PI = 2 * Math.PI;

/**
 * Pasquill stability class table (simplified, Turner 1994 Table 2-1).
 * Tabela de classificação de estabilidade de Pasquill-Gifford.
 *
 * Rows = wind speed bins; columns = conditions:
 * [strong_sun, moderate_sun, slight_sun, night_thin_cloud, night_clear]
 * Radiation ≥ 600 W/m² = strong; 300–600 = moderate; <300 = slight
 * Cloud cover ≥ 5/8 = thin cloud; <5/8 = clear
 */
const STABILITY_TABLE = {
    //  wind_ms  [strong, moderate, slight, night_thin, night_clear]
    lt_2: ['A', 'A-B', 'B', 'E', 'F'],
    lt_3: ['A-B', 'B', 'C', 'E', 'F'],
    lt_5: ['B', 'B-C', 'C', 'D', 'E'],
    lt_6: ['C', 'C-D', 'D', 'D', 'D'],
    gte_6: ['C', 'D', 'D', 'D', 'D'],
};

/**
 * Classify Pasquill atmospheric stability class.
 * Classifica a estabilidade atmosférica pela tabela de Pasquill (1961).
 *
 * @param {number} windSpeed     - Wind speed at 10m height (m/s), must be >= 0
 * @param {number} solarRadiation - Incoming solar radiation (W/m²), use 0 for night
 * @param {number} cloudCover    - Cloud cover fraction (0–1), 0=clear, 1=overcast
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'} Pasquill stability class
 * @throws {RangeError} On invalid inputs
 * @see Pasquill (1961); Turner (1994) ISBN 978-1566700238
 */
export function computePasquillStabilityClass(windSpeed: any, solarRadiation: any, cloudCover: any) {
    if (windSpeed < 0) throw new RangeError('windSpeed must be >= 0');
    if (solarRadiation < 0) throw new RangeError('solarRadiation must be >= 0');
    if (cloudCover < 0 || cloudCover > 1) throw new RangeError('cloudCover must be in [0, 1]');

    // Determinar linha da tabela por velocidade do vento
    let row;
    if (windSpeed < 2) row = STABILITY_TABLE.lt_2;
    else if (windSpeed < 3) row = STABILITY_TABLE.lt_3;
    else if (windSpeed < 5) row = STABILITY_TABLE.lt_5;
    else if (windSpeed < 6) row = STABILITY_TABLE.lt_6;
    else row = STABILITY_TABLE.gte_6;

    // Determinar coluna por condição de radiação/cobertura de nuvens
    let colIndex;
    if (solarRadiation > 0) {
        // Período diurno - classificar por intensidade de radiação
        if (solarRadiation >= 600)
            colIndex = 0; // forte
        else if (solarRadiation >= 300)
            colIndex = 1; // moderada
        else colIndex = 2; // fraca
    } else {
        // Período noturno - classificar por cobertura de nuvens
        if (cloudCover >= 0.625)
            colIndex = 3; // nuvem fina ≥ 5/8
        else colIndex = 4; // céu claro
    }

    // Resolver classes compostas (ex: 'A-B' -> 'A' ponto medio -> usar primeiro)
    const raw = row[colIndex];
if (raw!.includes('-')) {
        // Para classes compostas, retornar a media (2a letra = mais estavel, 1a = mais instavel)
        // Convencao: retornar a primeira (mais instavel, conservador para dispersao)
        return /** @type {'A'|'B'|'C'|'D'|'E'|'F'} */ (raw![0]);
    }
    return /** @type {'A'|'B'|'C'|'D'|'E'|'F'} */ (raw);
}

/**
 * Compute lateral dispersion coefficient σy using Briggs urban formulas (1973).
 * Calcula o coeficiente de dispersão lateral σy (m) - fórmulas de Briggs para área urbana.
 *
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} stabilityClass - Pasquill stability class
 * @param {number} downwindDistance - Downwind distance x (m), must be > 0
 * @returns {number} σy (m)
 * @throws {RangeError} On invalid inputs
 * @see Briggs (1973) ATDL Contribution File No. 79; Turner (1994) p. 72
 */
export function computeSigmaY(stabilityClass: any, downwindDistance: any) {
    _validateStabilityClass(stabilityClass);
    if (downwindDistance <= 0) throw new RangeError('downwindDistance must be > 0');

    const x = downwindDistance;

    // Briggs (1973) σy formulas for open country (m):
    // A: 0.22x(1+0.0001x)^-0.5
    // B: 0.16x(1+0.0001x)^-0.5
    // C: 0.11x(1+0.0001x)^-0.5
    // D: 0.08x(1+0.0001x)^-0.5
    // E: 0.06x(1+0.0001x)^-0.5
    // F: 0.04x(1+0.0001x)^-0.5
    const coefficients = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 };
const a = coefficients[stabilityClass as keyof typeof coefficients];

    return a * x * Math.pow(1 + 0.0001 * x, -0.5);
}

/**
 * Compute vertical dispersion coefficient σz using Briggs formulas (1973).
 * Calcula o coeficiente de dispersão vertical σz (m) - fórmulas de Briggs.
 *
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} stabilityClass - Pasquill stability class
 * @param {number} downwindDistance - Downwind distance x (m), must be > 0
 * @returns {number} σz (m)
 * @throws {RangeError} On invalid inputs
 * @see Briggs (1973); Turner (1994) p. 72
 */
export function computeSigmaZ(stabilityClass: any, downwindDistance: any) {
    _validateStabilityClass(stabilityClass);
    if (downwindDistance <= 0) throw new RangeError('downwindDistance must be > 0');

    const x = downwindDistance;

    // Briggs (1973) σz formulas for open country (m):
    // A: 0.20x
    // B: 0.12x
    // C: 0.08x(1+0.0002x)^-0.5
    // D: 0.06x(1+0.0015x)^-0.5
    // E: 0.03x(1+0.0003x)^-1
    // F: 0.016x(1+0.0003x)^-1
    switch (stabilityClass) {
        case 'A':
            return 0.2 * x;
        case 'B':
            return 0.12 * x;
        case 'C':
            return 0.08 * x * Math.pow(1 + 0.0002 * x, -0.5);
        case 'D':
            return 0.06 * x * Math.pow(1 + 0.0015 * x, -0.5);
        case 'E':
            return (0.03 * x) / (1 + 0.0003 * x);
        case 'F':
            return (0.016 * x) / (1 + 0.0003 * x);
        default:
            throw new RangeError(`Unknown stability class: ${stabilityClass}`);
    }
}

/**
 * Compute ground-level Gaussian plume concentration with ground reflection.
 * Calcula a concentração gaussiana com reflexão no solo (µg/m³).
 *
 * Equação de Gauss com reflexão (método de imagem):
 *   C(x,y,z) = Q / (2π σy σz u) ×
 *              exp(-y²/2σy²) ×
 *              [exp(-(z-H)²/2σz²) + exp(-(z+H)²/2σz²)]
 *
 * @param {number} emissionRate - Source strength Q (µg/s)
 * @param {number} windSpeed    - Mean wind speed u (m/s), must be > 0
 * @param {number} sigmaY       - Lateral dispersion σy (m), must be > 0
 * @param {number} sigmaZ       - Vertical dispersion σz (m), must be > 0
 * @param {number} y            - Crosswind distance from plume centerline (m)
 * @param {number} z            - Receptor height above ground (m), must be >= 0
 * @param {number} stackHeight  - Effective stack (release) height H (m), must be >= 0
 * @returns {number} Concentration C (µg/m³)
 * @throws {RangeError} On invalid inputs
 * @see Pasquill (1961); Turner (1994) Eq. 3-2 with ground reflection
 */
export function computeGaussianConcentration(emissionRate: any, windSpeed: any, sigmaY: any, sigmaZ: any, y: any, z: any, stackHeight: any) {
    if (emissionRate < 0) throw new RangeError('emissionRate must be >= 0');
    if (windSpeed <= 0) throw new RangeError('windSpeed must be > 0');
    if (sigmaY <= 0) throw new RangeError('sigmaY must be > 0');
    if (sigmaZ <= 0) throw new RangeError('sigmaZ must be > 0');
    if (z < 0) throw new RangeError('z (receptor height) must be >= 0');
    if (stackHeight < 0) throw new RangeError('stackHeight must be >= 0');

    if (emissionRate === 0) return 0;

    const H = stackHeight;

    // Fator de dispersão transversal
    const crosswindFactor = Math.exp(-0.5 * (y / sigmaY) ** 2);

    // Fator vertical com reflexão no solo (método de imagem)
    const directTerm = Math.exp(-0.5 * ((z - H) / sigmaZ) ** 2);
    const imageTerm = Math.exp(-0.5 * ((z + H) / sigmaZ) ** 2);
    const vertFactor = directTerm + imageTerm;

    // Concentração gaussiana: C = Q / (2π σy σz u) × exp_y × (exp_z_direct + exp_z_image)
    const C = (emissionRate / (TWO_PI * sigmaY * sigmaZ * windSpeed)) * crosswindFactor * vertFactor;

    return C; // µg/m³
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate Pasquill stability class character.
 * @param {string} cls
 */
function _validateStabilityClass(cls: any) {
    if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(cls)) {
        throw new RangeError(`stabilityClass must be A–F, got: "${cls}"`);
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const atmosphericDispersionMeta = {
    name: 'atmosphericDispersion',
    description: 'Atmospheric Dispersion',
    category: 'analytics',
    familyTags: ['atmosphere', 'fate_transport'],
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
