// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Contaminant Plume 3D Transport Module
// Módulo de modelagem 3D de pluma de contaminantes em aquífero - transporte advectivo-dispersivo.
//
// References / Referências:
// - Ogata & Banks (1961) USGS PP-411-A: A solution of the differential equation of longitudinal dispersion in porous media
// - Bear (1979) Hydraulics of Groundwater, McGraw-Hill
// - CONAMA 420/2009: Critérios e valores orientadores de qualidade do solo
// - Domenico & Schwartz (1998) Physical and Chemical Hydrogeology, 2nd ed., Wiley

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

/**
 * Compute advective transport of a contaminant front in a 1D porous medium.
 * Calcula o transporte advectivo de uma frente de contaminante em meio poroso 1D.
 *
 * @param seepage_velocity_m_day - Pore water velocity in m/day / Velocidade de percolação em m/dia
 * @param time_days - Elapsed time in days / Tempo decorrido em dias
 * @param initial_position_m - Initial plume position in metres / Posição inicial da pluma em metros
 * @returns
 */
export function computeAdvectiveTransport(
    seepage_velocity_m_day: number,
    time_days: number,
    initial_position_m: number,
): { position_m: number; front_advance_m: number } {
    if (typeof seepage_velocity_m_day !== 'number' || seepage_velocity_m_day < 0)
        throw new RangeError('seepage_velocity_m_day must be >= 0');
    if (typeof time_days !== 'number' || time_days < 0) throw new RangeError('time_days must be >= 0');
    if (typeof initial_position_m !== 'number') throw new TypeError('initial_position_m must be a number');

    // Transporte advectivo: posição = x0 + v × t (Bear 1979, cap. 7)
    const front_advance_m = seepage_velocity_m_day * time_days;
    const position_m = initial_position_m + front_advance_m;

    return { position_m, front_advance_m };
}

/**
 * Compute dispersive spread of a plume in three dimensions.
 * Calcula o espalhamento dispersivo da pluma nas três dimensões.
 *
 * Uses mechanical dispersion with ratio αT = αL/10, αV = αL/100 (Bear 1979).
 * Usa dispersão mecânica com razões αT = αL/10, αV = αL/100.
 *
 * @param dispersivity_m - Longitudinal dispersivity αL in metres / Dispersividade longitudinal αL em metros
 * @param seepage_velocity_m_day - Pore water velocity in m/day / Velocidade de percolação em m/dia
 * @param time_days - Elapsed time in days / Tempo decorrido em dias
 * @returns
 */
export function computeDispersiveSpread(
    dispersivity_m: number,
    seepage_velocity_m_day: number,
    time_days: number,
): { sigma_x_m: number; sigma_y_m: number; sigma_z_m: number } {
    if (typeof dispersivity_m !== 'number' || dispersivity_m <= 0)
        throw new RangeError('dispersivity_m must be a positive number (> 0)');
    if (typeof seepage_velocity_m_day !== 'number' || seepage_velocity_m_day < 0)
        throw new RangeError('seepage_velocity_m_day must be >= 0');
    if (typeof time_days !== 'number' || time_days < 0) throw new RangeError('time_days must be >= 0');

    const alphaL = dispersivity_m;
    const alphaT = alphaL / 10; // dispersividade transversal horizontal
    const alphaV = alphaL / 100; // dispersividade transversal vertical

    const v = seepage_velocity_m_day;
    const t = time_days;

    // σ = sqrt(2 × α × v × t) - solução de Bear (1979)
    const sigma_x_m = Math.sqrt(2 * alphaL * v * t);
    const sigma_y_m = Math.sqrt(2 * alphaT * v * t);
    const sigma_z_m = Math.sqrt(2 * alphaV * v * t);

    return { sigma_x_m, sigma_y_m, sigma_z_m };
}

/**
 * Approximate complementary error function (erfc) via rational polynomial.
 * Aproximação da função erfc via polinômio racional (Abramowitz & Stegun 7.1.26).
 * @param x
 * @returns
 */
function erfc(x: number): number {
    // Abramowitz & Stegun approximation, max error 1.5×10⁻⁷
    if (x < 0) return 2 - erfc(-x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

/**
 * Compute contaminant concentration at a 3D point using Ogata-Banks solution (1961).
 * Calcula concentração de contaminante em ponto 3D usando solução Ogata-Banks (1961).
 *
 * Uses 1D longitudinal solution multiplied by 2D Gaussian transverse factors.
 * Usa solução longitudinal 1D multiplicada por fatores gaussianos transversais.
 *
 * @param source_conc_mg_L - Source concentration C₀ in mg/L / Concentração na fonte C₀ em mg/L
 * @param x_m - Longitudinal coordinate from source (m) / Coordenada longitudinal a partir da fonte (m)
 * @param y_m - Transverse horizontal coordinate (m) / Coordenada transversal horizontal (m)
 * @param z_m - Transverse vertical coordinate (m) / Coordenada transversal vertical (m)
 * @param seepage_velocity_m_day - Pore water velocity (m/day) / Velocidade de percolação (m/dia)
 * @param dispersivity_m - Longitudinal dispersivity (m) / Dispersividade longitudinal (m)
 * @param time_days - Elapsed time (days) / Tempo decorrido (dias)
 * @param retardation - Retardation factor R (dimensionless) / Fator de retardação R (adimensional)
 * @returns
 */
export function computePlumeConcentration(
    source_conc_mg_L: number,
    x_m: number,
    y_m: number,
    z_m: number,
    seepage_velocity_m_day: number,
    dispersivity_m: number,
    time_days: number,
    retardation: number,
): { concentration_mg_L: number } {
    if (typeof source_conc_mg_L !== 'number' || source_conc_mg_L < 0)
        throw new RangeError('source_conc_mg_L must be >= 0');
    if (typeof x_m !== 'number') throw new TypeError('x_m must be a number');
    if (typeof y_m !== 'number') throw new TypeError('y_m must be a number');
    if (typeof z_m !== 'number') throw new TypeError('z_m must be a number');
    if (typeof seepage_velocity_m_day !== 'number' || seepage_velocity_m_day < 0)
        throw new RangeError('seepage_velocity_m_day must be >= 0');
    if (typeof dispersivity_m !== 'number' || dispersivity_m <= 0)
        throw new RangeError('dispersivity_m must be a positive number');
    if (typeof time_days !== 'number' || time_days <= 0) throw new RangeError('time_days must be a positive number');
    if (typeof retardation !== 'number' || retardation < 1) throw new RangeError('retardation must be >= 1');

    const v = seepage_velocity_m_day;
    const R = retardation;
    const alphaL = dispersivity_m;
    const alphaT = alphaL / 10;
    const alphaV = alphaL / 100;
    const t = time_days;

    // Coeficientes de dispersão (m²/dia)
    const DL = alphaL * v;
    const DT = alphaT * v;
    const DV = alphaV * v;

    // Solução Ogata-Banks 1D (1961): C/C₀ = 0.5 × erfc((x - vt/R)/(2√(DL×t/R)))
    const vt_R = (v * t) / R;
    const denom_x = 2 * Math.sqrt((DL * t) / R);
    const longitudinal = denom_x > 0 ? 0.5 * erfc((x_m - vt_R) / denom_x) : x_m <= vt_R ? 1 : 0;

    // Fatores gaussianos transversais (Domenico & Schwartz 1998)
    const sigma_y = Math.sqrt(2 * DT * t);
    const sigma_z = Math.sqrt(2 * DV * t);
    const transverse_y = sigma_y > 0 ? Math.exp(-(y_m * y_m) / (2 * sigma_y * sigma_y)) : 1;
    const transverse_z = sigma_z > 0 ? Math.exp(-(z_m * z_m) / (2 * sigma_z * sigma_z)) : 1;

    const concentration_mg_L = source_conc_mg_L * longitudinal * transverse_y * transverse_z;

    return { concentration_mg_L: Math.max(0, concentration_mg_L) };
}

/**
 * Classify plume risk based on concentration relative to drinking water standard.
 * Classifica o risco da pluma com base na concentração relativa ao padrão de água potável.
 *
 * @param max_concentration_mg_L - Maximum measured/modelled concentration (mg/L) / Concentração máxima medida/modelada
 * @param drinking_water_standard_mg_L - Maximum Contaminant Level (MCL) in mg/L / Nível máximo de contaminante (LMC)
 * @param affected_area_m2 - Estimated plume area in m² / Área estimada da pluma em m²
 * @returns
 */
export function classifyPlumeRisk(
    max_concentration_mg_L: number,
    drinking_water_standard_mg_L: number,
    affected_area_m2: number,
): { risk: string; containment_required: boolean } {
    if (typeof max_concentration_mg_L !== 'number' || max_concentration_mg_L < 0)
        throw new RangeError('max_concentration_mg_L must be >= 0');
    if (typeof drinking_water_standard_mg_L !== 'number' || drinking_water_standard_mg_L <= 0)
        throw new RangeError('drinking_water_standard_mg_L must be a positive number');
    if (typeof affected_area_m2 !== 'number' || affected_area_m2 < 0)
        throw new RangeError('affected_area_m2 must be >= 0');

    const ratio = max_concentration_mg_L / drinking_water_standard_mg_L;
    let risk: string;

    // Classificação de risco baseada em múltiplos do LMC - CONAMA 420/2009
    if (ratio <= 0) {
        risk = 'no_impact';
    } else if (ratio < 1) {
        risk = 'no_impact';
    } else if (ratio < 3) {
        risk = 'low';
    } else if (ratio < 5) {
        risk = 'moderate';
    } else if (ratio < 10) {
        risk = 'high';
    } else {
        risk = 'emergency';
    }

    // Contenção obrigatória para alto risco ou emergência (CONAMA 420/2009 VI)
    const containment_required = risk === 'high' || risk === 'emergency';

    return { risk, containment_required };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const contaminantPlume3DMeta: AnalyticsModuleMeta = {
    name: 'contaminantPlume3D',
    description: 'contaminantPlume3D',
    category: 'analytics',
    familyTags: ['contamination', 'fate_transport'],
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
